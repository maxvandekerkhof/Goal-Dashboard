/* Goal Dashboard - scoreberekening */
(function (global) {
  'use strict';

  var GD = global.GD;
  var store = GD.store;
  var D = GD.date;

  function optionFor(goal, value) {
    if (!goal.options) return null;
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

    // Progressive overload volgt uit de ingevulde oefeningen. Staan die er niet
    // (zoals bij dagen van vóór deze functie), dan geldt je eigen antwoord nog.
    if (goal.key === 'overload' && GD.lifts && entry.date) {
      var lift = GD.lifts.dagResultaat(entry.date);
      if (lift.waarde) return { value: lift.waarde, auto: true, lifts: lift };
    }

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
   * Doel met een teller (water): je scoort naar rato van je doel.
   *
   * Zolang de dag loopt telt een nog niet gehaalde teller niet mee — anders
   * kelderde je dagscore 's ochtends door een doel waar je nog aan bezig bent.
   * Bij afgelopen dagen telt gewoon het deel dat je haalde.
   */
  function meterItem(goal, entry, settings, w, live) {
    var amount = entry ? num(entry[goal.field]) : null;
    var doel = num(settings[goal.doelKey], 0);
    var item = {
      key: goal.key,
      goal: goal,
      value: amount,
      amount: amount,
      doel: doel,
      auto: false,
      option: null,
      weight: w,
      score: null,
      included: false,
      reason: ''
    };

    var frac = null;
    if (amount !== null) {
      frac = doel > 0 ? GD.clamp(amount / doel, 0, 1) : (amount > 0 ? 1 : 0);
    }
    item.frac = frac;

    if (w === 0) {
      item.reason = 'uitgezet';
    } else if (amount === null) {
      if (live) {
        item.reason = 'nog niet ingevuld';
      } else {
        item.score = 0;
        item.included = true;
        item.reason = 'niet ingevuld';
      }
    } else if (live && frac < 1) {
      item.reason = 'nog bezig';
    } else {
      item.score = frac;
      item.included = true;
    }
    return item;
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

      if (goal.type === 'meter') {
        var mItem = meterItem(goal, entry, settings, w, live);
        if (mItem.included) {
          points += mItem.score * w;
          max += w;
        }
        items.push(mItem);
        return;
      }

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
        item.reason = opt.reason || 'rustdag';
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

  /**
   * Wat er van een dag vaststaat en wat er nog te halen valt.
   *
   * Zonder dit leest een lopende dag te mooi: vul je 's ochtends drie doelen
   * goed in, dan staat de ring op 100% terwijl de dag nog bijna helemaal open
   * ligt. `vloerPct` is je score als de dag nu zou eindigen, `plafondPct` het
   * hoogste dat vandaag nog kan.
   *
   * binnen + kwijt + open = alle punten die deze dag te verdienen waren.
   */
  function dagOverzicht(day) {
    var binnen = 0, kwijt = 0, open = 0;

    day.items.forEach(function (it) {
      var w = it.weight;
      if (!w) return; // gewicht op 0: dit doel telt niet mee

      if (it.goal.type === 'meter') {
        var frac = it.frac === null || it.frac === undefined ? 0 : it.frac;
        binnen += frac * w;
        if (it.reason === 'nog niet ingevuld' || it.reason === 'nog bezig') {
          open += (1 - frac) * w;
        } else {
          kwijt += (1 - frac) * w;
        }
        return;
      }

      if (it.included) {
        binnen += it.score * w;
        kwijt += (1 - it.score) * w;
      } else if (it.reason === 'nog niet ingevuld') {
        open += w;
      }
      // rustdag, niet getraind of een eerste keer: vandaag niet te verdienen
    });

    var totaal = binnen + kwijt + open;
    return {
      binnen: binnen,
      kwijt: kwijt,
      open: open,
      totaal: totaal,
      vloerPct: totaal > 0 ? (binnen / totaal) * 100 : null,
      plafondPct: totaal > 0 ? ((binnen + open) / totaal) * 100 : null,
      livePct: day.pct
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
      bd[g.key] = { goal: g, points: 0, max: 0, counts: {}, days: 0, sum: 0, measured: 0, hits: 0 };
      (g.options || []).forEach(function (o) { bd[g.key].counts[o.v] = 0; });
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
        // Vandaag laten we in de balkjes en de kalender dezelfde tussenstand
        // zien als op de dagpagina. Zonder dat staat het balkje van vandaag op
        // 100% omdat je ontbijt goed was, terwijl de dag zelf 24% meldt.
        // De optelling hierboven blijft wel op de ingevulde doelen gebaseerd,
        // anders zou één halve dag je hele weekcijfer omlaag trekken.
        days.push({
          date: date,
          pct: date === t ? dagOverzicht(d).vloerPct : d.pct,
          state: 'logged',
          day: d
        });
        d.items.forEach(function (it) {
          var b = bd[it.key];
          if (it.included) {
            b.points += it.score * it.weight;
            b.max += it.weight;
            b.days++;
          }
          if (it.goal.type === 'meter') {
            if (it.amount === null) b.counts['leeg']++;
            else {
              b.sum += it.amount;
              b.measured++;
              if (it.frac >= 1) b.hits++;
            }
          } else if (it.value) {
            b.counts[it.value] = (b.counts[it.value] || 0) + 1;
          } else {
            b.counts['leeg']++;
          }
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
        counts: b.counts,
        avg: b.measured ? b.sum / b.measured : null,
        measured: b.measured,
        hits: b.hits
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
    var weights = [], trainDays = 0, restDays = 0, kcal = [], prot = [], water = [];
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
      var wa = num(e.waterMl); if (wa !== null) water.push(wa);
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
      kcalDays: kcal.length,
      proteinAvg: avg(prot),
      proteinDays: prot.length,
      waterAvg: avg(water),
      waterDays: water.length,
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

  /** Gemiddeld gewicht over zeven dagen tot en met `datum`, `terug` weken eerder. */
  function gewichtWeek(datum, terug) {
    var eind = D.addDays(datum, -7 * (terug || 0));
    return weightAvg(D.range(D.addDays(eind, -6), eind));
  }

  function kgTekst(n) {
    var v = Math.round(n * 100) / 100;
    return (v > 0 ? '+' : (v < 0 ? '−' : '')) + Math.abs(v).toFixed(2).replace('.', ',') + ' kg';
  }

  /**
   * Hoe verhoudt een gewichtsverschil zich tot je tempo?
   * -> { status: 'verkeerd'|'traag'|'op-schema'|'snel', pct, ratio }
   *
   * De grenzen zijn ruim (een halve tot anderhalve keer je tempo telt als op
   * schema), want een weekgemiddelde schommelt al gauw een ons of twee door
   * vocht en darminhoud.
   */
  function gewichtStatus(delta, richting, tempo) {
    if (richting === 'behouden') {
      var marge = tempo > 0 ? tempo : 0.25;
      var binnen = Math.abs(delta) <= marge;
      return { status: binnen ? 'op-schema' : 'verkeerd', pct: binnen ? 100 : 20, ratio: null };
    }
    // Voor afvallen draaien we het teken om; daarna is de rekensom gelijk.
    var gewenst = richting === 'aankomen' ? delta : -delta;
    var ratio = tempo > 0 ? gewenst / tempo : (gewenst > 0 ? 1 : 0);
    if (ratio <= 0) return { status: 'verkeerd', pct: 0, ratio: ratio };
    if (ratio < 0.5) return { status: 'traag', pct: 45, ratio: ratio };
    if (ratio <= 1.5) return { status: 'op-schema', pct: 100, ratio: ratio };
    return { status: 'snel', pct: 50, ratio: ratio };
  }

  /**
   * Eén regel over je gewicht: de laatste zeven dagen tegenover de zeven dagen
   * daarvoor, afgezet tegen je tempo.
   *
   * Bewust een rollend venster in plaats van hele kalenderweken, zodat de
   * melding ook op een dinsdag ergens op slaat.
   */
  function gewichtMelding(datum) {
    var s = store.settings();
    var richting = s.gewichtRichting || 'uit';
    var tempo = Math.abs(num(s.gewichtTempo, 0.25));
    var out = {
      richting: richting, status: 'uit', delta: null, doelDelta: tempo,
      pct: null, tekst: '', metingen: 0, vorigeMetingen: 0, avg: null, vorigeAvg: null
    };
    if (richting === 'uit') return out;

    var nu = gewichtWeek(datum, 0);
    var vorig = gewichtWeek(datum, 1);
    out.metingen = nu.count;
    out.vorigeMetingen = vorig.count;
    out.avg = nu.avg;
    out.vorigeAvg = vorig.avg;

    if (nu.count === 0 || vorig.count === 0) {
      out.status = 'te-weinig';
      out.tekst = nu.count === 0
        ? 'Weeg je een paar keer per week, dan zie je hier of je op schema ligt.'
        : 'Nog geen gewicht in de zeven dagen daarvóór, dus er valt nog niets te vergelijken.';
      return out;
    }

    var delta = nu.avg - vorig.avg;
    out.delta = delta;
    var oordeel = gewichtStatus(delta, richting, tempo);
    out.status = oordeel.status;
    out.pct = oordeel.pct;

    var doel = (richting === 'aankomen' ? '+' : '−') + tempo.toFixed(2).replace('.', ',');
    var marge = tempo > 0 ? tempo : 0.25;

    if (richting === 'behouden') {
      out.tekst = kgTekst(delta) + ' deze week — ' +
        (oordeel.status === 'op-schema' ? 'binnen' : 'buiten') + ' je marge van ' +
        marge.toFixed(2).replace('.', ',') + ' kg.';
    } else if (oordeel.status === 'verkeerd') {
      out.tekst = kgTekst(delta) + ' deze week — je komt niet ' +
        (richting === 'aankomen' ? 'aan' : 'af') +
        ', terwijl je dat wel wilt (doel ' + doel + ' per week).';
    } else if (oordeel.status === 'traag') {
      out.tekst = kgTekst(delta) + ' deze week — trager dan je tempo van ' + doel + ' per week.';
    } else if (oordeel.status === 'op-schema') {
      out.tekst = kgTekst(delta) + ' deze week — op schema (doel ' + doel + ' per week).';
    } else {
      out.tekst = kgTekst(delta) + ' deze week — sneller dan je tempo van ' + doel + ' per week.' +
        (richting === 'aankomen' ? ' Dat levert vooral vet op.' : ' Let op je spierbehoud.');
    }

    if (nu.count < 3 || vorig.count < 3) {
      out.tekst += ' Gebaseerd op ' + nu.count + ' en ' + vorig.count +
        ' weegmoment' + (nu.count === 1 && vorig.count === 1 ? '' : 'en') + ', dus gevoelig voor toeval.';
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
    dagOverzicht: dagOverzicht,
    resolveValue: resolveValue,
    weightOf: weightOf,
    baseMax: baseMax,
    gewichtStatus: gewichtStatus,
    gewichtMelding: gewichtMelding,
    currentStreak: currentStreak,
    bestStreak: bestStreak,
    weightAvg: weightAvg,
    weightTrend: weightTrend,
    num: num,
    optionFor: optionFor
  };
})(window);
