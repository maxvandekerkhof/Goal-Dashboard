/* Goal Dashboard - scoreberekening */
(function (global) {
  'use strict';

  var GD = global.GD;
  var store = GD.store;
  var D = GD.date;

  function optionFor(goal, value) {
    for (var i = 0; i < goal.options.length; i++) {
      if (goal.options[i].v === value) return goal.options[i];
    }
    return null;
  }

  /**
   * Waarde van een doel voor een dag, inclusief automatische afleiding
   * uit ingevulde eiwitten/calorieën.
   * -> { value, auto }
   */
  function resolveValue(entry, goal, settings) {
    if (!entry) return { value: null, auto: false };
    var explicit = entry[goal.key];
    if (explicit !== null && explicit !== undefined && explicit !== '') {
      return { value: explicit, auto: false };
    }
    if (!settings.autoMacro || !goal.macro) return { value: null, auto: false };

    if (goal.macro === 'protein') {
      var g = num(entry.eiwitGram);
      if (g === null) return { value: null, auto: false };
      return { value: g >= num(settings.eiwitDoel, 0) ? 'ja' : 'nee', auto: true };
    }
    if (goal.macro === 'calories') {
      var kcal = num(entry.kcal);
      if (kcal === null) return { value: null, auto: false };
      var doel = num(settings.calorieDoel, 0);
      var ok;
      if (settings.calorieRichting === 'min') ok = kcal >= doel;
      else if (settings.calorieRichting === 'rond') ok = Math.abs(kcal - doel) <= num(settings.calorieMarge, 0);
      else ok = kcal <= doel;
      return { value: ok ? 'ja' : 'nee', auto: true };
    }
    return { value: null, auto: false };
  }

  function num(v, fallback) {
    if (v === null || v === undefined || v === '') return fallback === undefined ? null : fallback;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : (fallback === undefined ? null : fallback);
  }

  function weightOf(goal, settings) {
    var w = settings.weights && settings.weights[goal.key];
    return typeof w === 'number' && isFinite(w) && w >= 0 ? w : goal.weight;
  }

  /**
   * Score van één dag.
   * live=true : nog niet ingevulde doelen tellen niet mee (voor vandaag/toekomst)
   * -> { pct, points, max, items[], hasEntry, trained }
   */
  function scoreDay(date, live) {
    var settings = store.settings();
    var entry = store.entry(date);
    if (live === undefined) live = date >= D.today();

    var gesportGoal = GD.goalByKey('gesport');
    var trainedValue = resolveValue(entry, gesportGoal, settings).value;
    var trained = trainedValue === 'ja';

    var points = 0, max = 0, items = [];

    GD.GOALS.forEach(function (goal) {
      var w = weightOf(goal, settings);
      var res = resolveValue(entry, goal, settings);
      var opt = res.value ? optionFor(goal, res.value) : null;
      var item = {
        key: goal.key,
        goal: goal,
        value: res.value,
        auto: res.auto,
        option: opt,
        weight: w,
        score: null,
        included: false,
        reason: ''
      };

      if (w === 0) {
        item.reason = 'uitgezet';
      } else if (goal.onlyIfTrained && !trained) {
        if (trainedValue === 'rustdag') item.reason = 'rustdag';
        else if (trainedValue) item.reason = 'niet getraind';
        else item.reason = live ? 'nog niet ingevuld' : 'niet getraind';
      } else if (!opt) {
        if (live) {
          item.reason = 'nog niet ingevuld';
        } else {
          item.score = 0;
          item.included = true;
          item.reason = 'niet ingevuld';
        }
      } else if (opt.score === null) {
        item.reason = 'rustdag';
      } else {
        item.score = opt.score;
        item.included = true;
      }

      if (item.included) {
        points += item.score * w;
        max += w;
      }
      items.push(item);
    });

    return {
      date: date,
      pct: max > 0 ? (points / max) * 100 : null,
      points: points,
      max: max,
      items: items,
      trained: trained,
      trainedValue: trainedValue,
      restDay: trainedValue === 'rustdag',
      hasEntry: !!entry
    };
  }

  /** Maximaal haalbare punten voor een dag zonder training-afhankelijke doelen */
  function baseMax() {
    var settings = store.settings();
    var m = 0;
    GD.GOALS.forEach(function (g) {
      if (!g.onlyIfTrained) m += weightOf(g, settings);
    });
    return m;
  }

  /**
   * Score over een periode.
   * -> { pct, days[], logged, scored, missing, future, breakdown[], stats }
   */
  function scorePeriod(dates) {
    var settings = store.settings();
    var t = D.today();
    // Dagen van vóór je allereerste invoer zijn geen gemiste dagen: toen
    // gebruikte je het dashboard nog niet.
    var known = store.allDates();
    var firstEver = known.length ? known[0] : null;
    var points = 0, max = 0;
    var days = [];
    var logged = 0, missing = 0, future = 0, scoredDays = 0;
    var bd = {};
    GD.GOALS.forEach(function (g) {
      bd[g.key] = { goal: g, points: 0, max: 0, counts: {}, days: 0 };
      g.options.forEach(function (o) { bd[g.key].counts[o.v] = 0; });
      bd[g.key].counts['leeg'] = 0;
    });

    dates.forEach(function (date) {
      if (date > t) {
        future++;
        days.push({ date: date, pct: null, state: 'future' });
        return;
      }
      var e = store.entry(date);
      if (e) {
        logged++;
        var d = scoreDay(date, date === t);
        if (d.max > 0) {
          points += d.points;
          max += d.max;
          scoredDays++;
        }
        days.push({ date: date, pct: d.pct, state: 'logged', day: d });
        d.items.forEach(function (it) {
          var b = bd[it.key];
          if (it.included) {
            b.points += it.score * it.weight;
            b.max += it.weight;
            b.days++;
          }
          if (it.value) b.counts[it.value] = (b.counts[it.value] || 0) + 1;
          else b.counts['leeg']++;
        });
      } else {
        missing++;
        var counted = settings.countMissingAsZero && date < t &&
          firstEver !== null && date >= firstEver;
        if (counted) max += baseMax();
        days.push({ date: date, pct: counted ? 0 : null, state: counted ? 'missing0' : 'missing' });
        GD.GOALS.forEach(function (g) { bd[g.key].counts['leeg']++; });
      }
    });

    var breakdown = GD.GOALS.map(function (g) {
      var b = bd[g.key];
      return {
        key: g.key,
        goal: g,
        pct: b.max > 0 ? (b.points / b.max) * 100 : null,
        days: b.days,
        counts: b.counts
      };
    });

    return {
      pct: max > 0 ? (points / max) * 100 : null,
      points: points,
      max: max,
      days: days,
      logged: logged,
      missing: missing,
      future: future,
      scoredDays: scoredDays,
      breakdown: breakdown,
      stats: periodStats(dates, days)
    };
  }

  function periodStats(dates, days) {
    var t = D.today();
    var weights = [], trainDays = 0, restDays = 0, kcal = [], prot = [];
    dates.forEach(function (date) {
      if (date > t) return;
      var e = store.entry(date);
      if (!e) return;
      var w = num(e.gewicht);
      if (w !== null) weights.push({ date: date, w: w });
      var d = scoreDay(date, date === t);
      if (d.trained) trainDays++;
      if (d.restDay) restDays++;
      var k = num(e.kcal); if (k !== null) kcal.push(k);
      var p = num(e.eiwitGram); if (p !== null) prot.push(p);
    });

    function avg(arr) {
      if (!arr.length) return null;
      return arr.reduce(function (a, b) { return a + b; }, 0) / arr.length;
    }

    return {
      weights: weights,
      weightStart: weights.length ? weights[0].w : null,
      weightEnd: weights.length ? weights[weights.length - 1].w : null,
      weightDelta: weights.length > 1 ? weights[weights.length - 1].w - weights[0].w : null,
      weightAvg: avg(weights.map(function (x) { return x.w; })),
      trainDays: trainDays,
      restDays: restDays,
      kcalAvg: avg(kcal),
      proteinAvg: avg(prot),
      goodDays: days.filter(function (d) {
        return d.pct !== null && d.pct >= store.settings().goedeDagDrempel;
      }).length
    };
  }

  /** Gemiddeld gewicht over een reeks datums (dagen in de toekomst tellen niet mee). */
  function weightAvg(dates) {
    var sum = 0, n = 0, t = D.today();
    dates.forEach(function (date) {
      if (date > t) return;
      var e = store.entry(date);
      if (!e) return;
      var w = num(e.gewicht);
      if (w === null) return;
      sum += w;
      n++;
    });
    return { avg: n ? sum / n : null, count: n };
  }

  /**
   * Vergelijkt het gemiddelde gewicht van twee periodes en scoort dat tegen
   * je gewichtsdoel (aankomen, afvallen of op gewicht blijven).
   *
   * Bewust los van de dagscore: gewicht is een uitkomst, geen gedrag dat je
   * op één dag kunt "halen".
   */
  function weightTrend(dates, prevDates, perWeek) {
    var s = store.settings();
    var richting = s.gewichtRichting || 'uit';
    var cur = weightAvg(dates);
    var prev = weightAvg(prevDates);
    var tempoPerWeek = Math.abs(num(s.gewichtTempo, 0.25));
    // Bij een maandvergelijking hoort een navenant groter verschil.
    var weeks = perWeek === undefined ? 1 : perWeek;
    var doelDelta = tempoPerWeek * weeks;

    var out = {
      richting: richting,
      avg: cur.avg,
      count: cur.count,
      prevAvg: prev.avg,
      prevCount: prev.count,
      delta: null,
      doelDelta: doelDelta,
      pct: null,
      note: ''
    };

    if (richting === 'uit') return out;
    if (cur.avg === null || prev.avg === null) {
      out.note = 'Nog te weinig metingen om te vergelijken.';
      return out;
    }

    var delta = cur.avg - prev.avg;
    out.delta = delta;

    if (richting === 'aankomen') {
      out.pct = doelDelta > 0
        ? GD.clamp(delta / doelDelta, 0, 1) * 100
        : (delta > 0 ? 100 : 0);
      if (delta <= 0) out.note = 'Je zit gelijk of lager dan de vorige periode — dat is de verkeerde kant op voor spieropbouw.';
      else if (doelDelta > 0 && delta > doelDelta * 2) out.note = 'Ruim boven je tempo. Snel aankomen betekent meestal ook meer vetaanzet.';
    } else if (richting === 'afvallen') {
      out.pct = doelDelta > 0
        ? GD.clamp(-delta / doelDelta, 0, 1) * 100
        : (delta < 0 ? 100 : 0);
      if (delta >= 0) out.note = 'Je zit gelijk of hoger dan de vorige periode.';
      else if (doelDelta > 0 && -delta > doelDelta * 2) out.note = 'Sneller dan je tempo — let op je spierbehoud.';
    } else if (richting === 'behouden') {
      var marge = doelDelta > 0 ? doelDelta : 0.25;
      out.pct = GD.clamp(1 - Math.abs(delta) / marge, 0, 1) * 100;
      if (Math.abs(delta) > marge) out.note = 'Buiten je marge van ' + marge.toFixed(2) + ' kg.';
    }

    if (cur.count < 3 || prev.count < 3) {
      out.note = (out.note ? out.note + ' ' : '') +
        'Let op: gebaseerd op weinig metingen, dus gevoelig voor toeval. Dagelijks wegen geeft een betrouwbaarder beeld.';
    }
    return out;
  }

  /** Huidige reeks goede dagen, geteld vanaf vandaag (of gisteren) terug. */
  function currentStreak() {
    var settings = store.settings();
    var drempel = num(settings.goedeDagDrempel, 70);
    var t = D.today();
    var cursor = t;

    // Vandaag telt alleen mee als hij de drempel al haalt; anders start bij gisteren.
    var todayScore = store.entry(t) ? scoreDay(t, true).pct : null;
    if (todayScore === null || todayScore < drempel) cursor = D.addDays(t, -1);

    var streak = 0, guard = 0;
    while (guard++ < 3650) {
      var e = store.entry(cursor);
      if (!e) break;
      var d = scoreDay(cursor, false);
      if (d.pct === null || d.pct < drempel) break;
      streak++;
      cursor = D.addDays(cursor, -1);
    }
    return streak;
  }

  /** Langste reeks ooit */
  function bestStreak() {
    var drempel = num(store.settings().goedeDagDrempel, 70);
    var dates = store.allDates();
    var best = 0, run = 0, prev = null;
    dates.forEach(function (date) {
      var d = scoreDay(date, false);
      var good = d.pct !== null && d.pct >= drempel;
      if (good && prev && D.addDays(prev, 1) === date) run++;
      else if (good) run = 1;
      else run = 0;
      if (run > best) best = run;
      prev = date;
    });
    return best;
  }

  GD.score = {
    scoreDay: scoreDay,
    scorePeriod: scorePeriod,
    resolveValue: resolveValue,
    weightOf: weightOf,
    baseMax: baseMax,
    currentStreak: currentStreak,
    bestStreak: bestStreak,
    weightAvg: weightAvg,
    weightTrend: weightTrend,
    num: num,
    optionFor: optionFor
  };
})(window);
