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

    var m = macroFractie(goal, entry, settings);
    if (!m) return { value: null, auto: false };
    return { value: m.frac >= 1 ? 'ja' : 'nee', auto: true, macro: m };
  }

  /* Speling bij calorieën: hoe ver naast je doel je mag zitten voor er niets
     meer van dat doel overblijft. Een deel van je doel en geen vast getal,
     want 300 kcal naast 2000 weegt anders dan 300 naast 3500. */
  function calorieSpeling(doel) {
    return Math.max(200, Math.abs(doel) * 0.2);
  }

  /**
   * Hoe dicht zat je bij je eiwit- of caloriedoel, op een schaal van 0 tot 1?
   * -> { frac, amount, doel, open } of null als er niets gemeten is
   *
   * Een voedingsdoel is zelden zwart-wit: 140 van je 150 gram is geen nul.
   * Daarom telt hier hoe ver je kwam, net als bij de waterteller, en niet
   * alleen of je over de streep ging.
   *
   * `open` zegt of het vandaag nog goed kan komen. Eiwit kan er altijd nog bij.
   * Calorieën gaan de hele dag maar één kant op: zolang je onder je maximum
   * zit staat dat doel nog open, en zodra je eroverheen bent ligt het vast.
   */
  function macroFractie(goal, entry, settings) {
    if (goal.macro === 'protein') {
      var g = num(entry.eiwitGram);
      if (g === null) return null;
      // Het doel van díé dag: staat het op gewicht, dan lag de lat vorig jaar
      // lager dan vandaag en hoort de score van toen daar ook op te rusten.
      var pdoel = eiwitDoel(entry.date, settings).doel;
      var pfrac = pdoel > 0 ? GD.clamp(g / pdoel, 0, 1) : (g > 0 ? 1 : 0);
      return {
        soort: 'protein', frac: pfrac, amount: g, doel: pdoel,
        eenheid: 'g', open: pfrac < 1
      };
    }
    if (goal.macro === 'calories') {
      var kcal = num(entry.kcal);
      if (kcal === null) return null;
      var doel = num(settings.calorieDoel, 0);
      var richting = settings.calorieRichting || 'max';
      var speling = calorieSpeling(doel);
      var marge = num(settings.calorieMarge, 0);
      var frac, open;
      if (richting === 'min') {
        frac = doel > 0 ? GD.clamp(kcal / doel, 0, 1) : (kcal > 0 ? 1 : 0);
        open = frac < 1;
      } else if (richting === 'rond') {
        frac = GD.clamp(1 - Math.max(0, Math.abs(kcal - doel) - marge) / speling, 0, 1);
        open = kcal <= doel + marge;
      } else {
        frac = GD.clamp(1 - Math.max(0, kcal - doel) / speling, 0, 1);
        open = kcal <= doel;
      }
      return {
        soort: 'calories', frac: frac, amount: kcal, doel: doel, eenheid: 'kcal',
        richting: richting, marge: marge, speling: speling, open: open
      };
    }
    return null;
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
        reason: '',
        // Alleen gevuld bij een eiwit- of caloriedoel dat uit je eigen cijfers
        // volgt; een doel dat je zelf aanklikte blijft gewoon ja of nee.
        macro: res.macro || null,
        frac: res.macro ? res.macro.frac : null
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
      } else if (res.macro) {
        // Glijdende schaal in plaats van ja of nee. Zolang het vandaag nog
        // goed kan komen telt het net zo min mee als een halfvolle waterfles:
        // anders schrijft de app je avondeten om vier uur 's middags al af.
        if (live && res.macro.open) {
          item.reason = 'nog bezig';
        } else {
          item.score = res.macro.frac;
          item.included = true;
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

      // Tellers en de voedingsdoelen gaan hier dezelfde kant op: wat je al
      // binnen hebt telt, en de rest staat nog open zolang de dag loopt.
      var heeftFrac = it.frac !== null && it.frac !== undefined;
      if (it.goal.type === 'meter' || heeftFrac) {
        var frac = heeftFrac ? it.frac : 0;
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

  /* Hoeveel dagen gewicht er onder het eiwitdoel liggen. Er wordt met een
     gemiddelde gerekend en niet met je laatste weging, anders verspringt je
     doel elke ochtend met de weegschaal mee. Twee weken, want dat vangt ook
     een week waarin je nauwelijks op de weegschaal stond. */
  var EIWIT_VENSTER = 14;

  /**
   * Het eiwitdoel dat op `datum` gold, in gram.
   * -> { doel, afgeleid, vast, naarGewicht, gewicht, metingen, perKg }
   *
   * Een vast getal loopt scheef zodra je aankomt of afvalt: dezelfde 150 gram
   * is bij 75 kilo ruim voldoende en bij 90 kilo te weinig. Daarom kan het doel
   * meebewegen met je gewicht — de vuistregel bij spieropbouw is 1,6 tot 2,2
   * gram per kilo.
   *
   * `afgeleid` is false zolang je een vast doel hebt staan, en ook als er in de
   * afgelopen twee weken niets op de weegschaal stond: dan valt het terug op je
   * vaste getal, want een dag zonder doel valt niet te scoren. `naarGewicht` is
   * altijd ingevuld als er gewicht bekend is, ook bij een vast doel — daarmee
   * ziet de weekafsluiting of dat vaste getal is achtergaan lopen.
   */
  function eiwitDoel(datum, settings) {
    var s = settings || store.settings();
    var vast = num(s.eiwitDoel, 0);
    var perKg = num(s.eiwitPerKg, 0);
    var eind = datum || D.today();
    var w = weightAvg(D.range(D.addDays(eind, -(EIWIT_VENSTER - 1)), eind));
    var uit = {
      doel: vast,
      afgeleid: false,
      vast: vast,
      naarGewicht: (w.avg !== null && perKg > 0) ? Math.round((w.avg * perKg) / 5) * 5 : null,
      gewicht: w.avg,
      metingen: w.count,
      perKg: perKg
    };
    if (s.eiwitBasis === 'gewicht' && uit.naarGewicht !== null) {
      uit.doel = uit.naarGewicht;
      uit.afgeleid = true;
    }
    return uit;
  }

  /* ------------------------------ verbruik -------------------------------- *
   *
   * Hoeveel je werkelijk verbrandt, afgeleid uit wat je at en wat de weegschaal
   * daarmee deed. Geen formule met je lengte, leeftijd en een gokje over hoe
   * actief je bent: die geeft het gemiddelde van een bevolking, en jij bent dat
   * gemiddelde niet.
   *
   * De rekensom is er maar één: at je 2340 kcal en kwam je 0,11 kg per week
   * aan, dan ging daar 121 kcal per dag van in de opslag en verbrandde je de
   * rest. Alles hieronder gaat over het stabiel krijgen van die twee getallen.
   * ------------------------------------------------------------------------- */

  var VERBRUIK_VENSTER = 21;      // dagen terug
  var VERBRUIK_HALFWAARDE = 14;   // dagen; hoe snel oude dagen minder gaan wegen
  var VERBRUIK_MIN_KCAL = 14;     // minimaal aantal dagen met calorieën
  var VERBRUIK_MIN_WEEG = 10;     // minimaal aantal weegmomenten
  var VERBRUIK_MAX_SPRONG = 300;  // kcal; hoeveel een voorstel je doel mag verzetten
  var KCAL_PER_KG = 7700;

  /* Recente dagen wegen zwaarder: een halfwaardetijd van veertien dagen, zodat
     een dag van drie weken terug nog voor een derde meetelt. Zonder die weging
     blijft een maand oude periode je huidige advies bepalen. */
  function verbruikGewicht(dagenGeleden) {
    return Math.pow(0.5, dagenGeleden / VERBRUIK_HALFWAARDE);
  }

  /**
   * Gewogen kleinste-kwadratenlijn door je weegmomenten.
   * -> helling in kg per dag, of null bij te weinig spreiding
   *
   * Een lijn door alle punten in plaats van het verschil tussen begin en eind:
   * dan bepaalt niet één ochtend met een volle darm je hele advies.
   */
  function trendHelling(punten) {
    if (!punten || punten.length < 2) return null;
    var Sw = 0, Sx = 0, Sy = 0, Sxx = 0, Sxy = 0;
    punten.forEach(function (p) {
      var w = p.w;
      Sw += w; Sx += w * p.x; Sy += w * p.y;
      Sxx += w * p.x * p.x; Sxy += w * p.x * p.y;
    });
    var noemer = Sw * Sxx - Sx * Sx;
    if (Math.abs(noemer) < 1e-9) return null;
    return (Sw * Sxy - Sx * Sy) / noemer;
  }

  /**
   * Je verbruik op `datum`, uit de voorgaande drie weken.
   * -> { klaar, kcal, kcalGem, helling, perWeek, opslag, kcalDagen, weegDagen,
   *      doelKcal, huidigDoel, verschil, advies }
   *
   * `klaar` is false zolang er te weinig gemeten is. Dan blijft de rest leeg:
   * een verbruik uit vier dagen is geen schatting maar een gok, en daar hoort
   * geen caloriedoel op verzet te worden.
   */
  function verbruik(datum, settings) {
    var s = settings || store.settings();
    var eind = datum || D.today();
    var start = D.addDays(eind, -(VERBRUIK_VENSTER - 1));
    var reeks = D.range(start, eind);

    var kcalSom = 0, kcalGewicht = 0, kcalDagen = 0;
    var punten = [];
    reeks.forEach(function (d, i) {
      var e = store.entry(d);
      if (!e) return;
      var g = verbruikGewicht(reeks.length - 1 - i);
      var k = num(e.kcal);
      if (k !== null) { kcalSom += k * g; kcalGewicht += g; kcalDagen++; }
      var kg = num(e.gewicht);
      if (kg !== null) punten.push({ x: i, y: kg, w: g });
    });

    var uit = {
      klaar: false,
      kcal: null, kcalGem: null, helling: null, perWeek: null, opslag: null,
      kcalDagen: kcalDagen, weegDagen: punten.length,
      minKcal: VERBRUIK_MIN_KCAL, minWeeg: VERBRUIK_MIN_WEEG,
      venster: VERBRUIK_VENSTER,
      doelKcal: null, huidigDoel: num(s.calorieDoel, 0), verschil: null,
      richting: s.gewichtRichting || 'uit', advies: 'te-weinig'
    };

    if (kcalDagen < VERBRUIK_MIN_KCAL || punten.length < VERBRUIK_MIN_WEEG) return uit;

    var helling = trendHelling(punten);
    if (helling === null) return uit;

    uit.klaar = true;
    uit.kcalGem = kcalSom / kcalGewicht;
    uit.helling = helling;
    uit.perWeek = helling * 7;
    uit.opslag = helling * KCAL_PER_KG;
    uit.kcal = uit.kcalGem - uit.opslag;

    if (uit.richting === 'uit') {
      uit.advies = 'geen-doel';
      return uit;
    }

    // Wat je zou moeten eten om je tempo te halen, uitgaande van dit verbruik.
    var tempo = Math.abs(num(s.gewichtTempo, 0.25));
    var gewenstPerDag = uit.richting === 'aankomen' ? tempo / 7
      : (uit.richting === 'afvallen' ? -tempo / 7 : 0);
    var ruw = uit.kcal + gewenstPerDag * KCAL_PER_KG;

    // Nooit meer dan 300 kcal per keer verzetten. Eén meetperiode is niet genoeg
    // zekerheid voor een grote sprong, en wie groot springt springt terug.
    if (uit.huidigDoel > 0) {
      ruw = GD.clamp(ruw, uit.huidigDoel - VERBRUIK_MAX_SPRONG,
        uit.huidigDoel + VERBRUIK_MAX_SPRONG);
    }
    uit.doelKcal = Math.round(ruw / 10) * 10;
    uit.verschil = uit.huidigDoel > 0 ? uit.doelKcal - uit.huidigDoel : null;

    // Onder de vijftig kcal verschil valt er niets zinnigs bij te stellen; dat
    // is minder dan één boterham en ruim binnen de meetfout.
    if (uit.huidigDoel <= 0) uit.advies = 'geen-doel-ingesteld';
    else if (Math.abs(uit.verschil) < 50) uit.advies = 'klopt';
    else uit.advies = uit.verschil > 0 ? 'meer-eten' : 'minder-eten';
    return uit;
  }

  /** Je verbruik op een reeks eerdere datums, voor de grafiek. */
  function verbruikVerloop(datum, punten, stapDagen) {
    var s = store.settings();
    var eind = datum || D.today();
    var n = punten || 12;
    var stap = stapDagen || 7;
    var reeks = [];
    for (var i = n - 1; i >= 0; i--) {
      var d = D.addDays(eind, -i * stap);
      var v = verbruik(d, s);
      if (v.klaar) reeks.push({ datum: d, kcal: v.kcal });
    }
    return reeks;
  }

  /* --------------------------- gewoontekracht ------------------------------ *
   *
   * Je streak is scherp: één slechte dag en hij staat op nul. Dat is leuk als
   * aansporing en waardeloos als meting — na een griepweek weet je niet meer
   * welke gewoonte er eigenlijk stond.
   *
   * Kracht loopt daarom door: elke dag telt mee, maar hoe langer geleden hoe
   * minder zwaar. Een gemiste dag is een deuk van een procent of vijf en geen
   * sloopkogel.
   * ------------------------------------------------------------------------- */

  var KRACHT_HALFWAARDE = 14;  // dagen
  var KRACHT_VENSTER = 120;    // dagen; daarvóór weegt een dag nog geen procent

  var krachtCache = null;
  var krachtSleutel = '';

  /**
   * Gewoontekracht per doel en in totaal.
   * -> { totaal, perDoel[], reeks[], dagen }
   *
   * Dagen waarop een doel niet telde — post-workout op een rustdag — laten de
   * kracht van dat doel ongemoeid. Anders zou uitrusten je gewoontes afstraffen.
   */
  function kracht(datum) {
    var eind = datum || D.today();
    var sleutel = store.rev() + '|' + eind;
    if (krachtCache && krachtSleutel === sleutel) return krachtCache;

    var s = store.settings();
    var verval = Math.pow(0.5, 1 / KRACHT_HALFWAARDE);
    var bekend = store.allDates();
    var eerste = bekend.length ? bekend[0] : null;

    var waarden = {};
    var gezien = {};
    GD.GOALS.forEach(function (g) { waarden[g.key] = 0; gezien[g.key] = 0; });

    var reeks = [];
    var dagen = 0;
    var alles = D.range(D.addDays(eind, -(KRACHT_VENSTER - 1)), eind);
    // Waar elk doel een week geleden stond, voor de "+3" achter het cijfer.
    var weekTerug = D.addDays(eind, -7);
    var vorig = null;

    alles.forEach(function (d) {
      if (vorig === null && d > weekTerug) {
        vorig = { waarden: {}, gezien: {} };
        GD.GOALS.forEach(function (g) {
          vorig.waarden[g.key] = waarden[g.key];
          vorig.gezien[g.key] = gezien[g.key];
        });
      }
      if (eerste === null || d < eerste || d > eind) return;
      var e = store.entry(d);
      var dag = e ? scoreDay(d, d === D.today()) : null;
      dagen++;

      GD.GOALS.forEach(function (g) {
        var w = weightOf(g, s);
        if (w === 0) return;

        var punt = null;
        if (!e) {
          // Niets ingevuld. Dat telt als een nul, net als in je dagscore —
          // maar alleen als je dat daar ook zo hebt staan.
          if (s.countMissingAsZero) punt = 0;
        } else {
          var it = null;
          dag.items.forEach(function (x) { if (x.key === g.key) it = x; });
          if (!it) return;
          if (it.included) punt = it.score;
          else if (it.frac !== null && it.frac !== undefined) punt = it.frac;
          else if (it.reason === 'niet ingevuld') punt = 0;
          // rustdag, niet getraind, nog bezig: geen oordeel, dus geen invloed
        }
        if (punt === null) return;

        waarden[g.key] = waarden[g.key] * verval + punt * (1 - verval);
        gezien[g.key]++;
      });

      reeks.push({ datum: d, waarde: totaalUit(waarden, gezien, s) });
    });

    var perDoel = GD.GOALS.filter(function (g) {
      return weightOf(g, s) > 0 && gezien[g.key] > 0;
    }).map(function (g) {
      // Een doel dat pas net meeloopt staat kunstmatig laag, omdat de reeks
      // bij nul begint. Daarom delen we door wat er maximaal had gekund.
      var nu = schaalOp(waarden[g.key], gezien[g.key], verval) * 100;
      var toen = (vorig && vorig.gezien[g.key] > 3)
        ? schaalOp(vorig.waarden[g.key], vorig.gezien[g.key], verval) * 100
        : null;
      return {
        key: g.key, goal: g, weight: weightOf(g, s),
        pct: nu,
        vorige: toen,
        delta: toen === null ? null : nu - toen,
        dagen: gezien[g.key]
      };
    }).sort(function (a, b) { return b.pct - a.pct; });

    krachtCache = {
      totaal: reeks.length ? reeks[reeks.length - 1].waarde : null,
      perDoel: perDoel,
      reeks: reeks,
      dagen: dagen,
      halfwaarde: KRACHT_HALFWAARDE
    };
    krachtSleutel = sleutel;
    return krachtCache;
  }

  /* Een reeks die bij nul begint bereikt nooit 1, ook niet bij louter perfecte
     dagen: na n dagen staat hij op 1 − verval^n. Door daardoor te delen leest
     een week vlekkeloos invullen als 100 en niet als 29. */
  function schaalOp(waarde, n, verval) {
    var plafond = 1 - Math.pow(verval, n);
    return plafond > 0.02 ? GD.clamp(waarde / plafond, 0, 1) : 0;
  }

  function totaalUit(waarden, gezien, s) {
    var verval = Math.pow(0.5, 1 / KRACHT_HALFWAARDE);
    var som = 0, gew = 0;
    GD.GOALS.forEach(function (g) {
      var w = weightOf(g, s);
      if (w === 0 || !gezien[g.key]) return;
      som += schaalOp(waarden[g.key], gezien[g.key], verval) * w;
      gew += w;
    });
    return gew > 0 ? (som / gew) * 100 : null;
  }

  /** Kracht zoals hij `terug` dagen geleden stond, voor de vergelijking. */
  function krachtEerder(datum, terug) {
    var k = kracht(datum);
    var doel = D.addDays(datum || D.today(), -(terug || 7));
    var uit = null;
    k.reeks.forEach(function (r) { if (r.datum <= doel) uit = r.waarde; });
    return uit;
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
   * Twee dingen zijn hier bewust zo gebouwd, allebei omdat gewicht van dag tot
   * dag makkelijk een kilo op en neer gaat door vocht, zout en darminhoud:
   *
   * - Er wordt met gemiddelden gerekend, nooit met de laatste weging.
   * - Een afwijking wordt pas als waarschuwing gebracht als hij twee weken op
   *   rij te zien is. Daarvoor wordt dezelfde vergelijking een week eerder
   *   nog eens gemaakt (dag −13 t/m −7 tegen −20 t/m −14). Zegt die iets
   *   anders, dan blijft het bij een kale constatering.
   *
   * Het venster rolt mee met de dag in plaats van op hele kalenderweken te
   * zitten, zodat de melding ook op een dinsdag ergens op slaat.
   */
  function gewichtMelding(datum) {
    var s = store.settings();
    var richting = s.gewichtRichting || 'uit';
    var tempo = Math.abs(num(s.gewichtTempo, 0.25));
    var out = {
      richting: richting, status: 'uit', delta: null, doelDelta: tempo,
      pct: null, tekst: '', metingen: 0, vorigeMetingen: 0, avg: null, vorigeAvg: null,
      bevestigd: false, waarschuwing: false,
      vorigeStatus: null, vorigeDelta: null, eerdereMetingen: 0, eerdereAvg: null
    };
    if (richting === 'uit') return out;

    var nu = gewichtWeek(datum, 0);
    var vorig = gewichtWeek(datum, 1);
    var eerder = gewichtWeek(datum, 2);
    out.metingen = nu.count;
    out.vorigeMetingen = vorig.count;
    out.eerdereMetingen = eerder.count;
    out.avg = nu.avg;
    out.vorigeAvg = vorig.avg;
    out.eerdereAvg = eerder.avg;

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

    // Dezelfde vergelijking een week terug. Pas als die hetzelfde oordeel geeft
    // is het een trend en geen schommeling.
    if (eerder.avg !== null) {
      out.vorigeDelta = vorig.avg - eerder.avg;
      out.vorigeStatus = gewichtStatus(out.vorigeDelta, richting, tempo).status;
    }
    out.bevestigd = out.vorigeStatus === oordeel.status;
    out.waarschuwing = oordeel.status !== 'op-schema' && out.bevestigd;
    // Kleur alleen bij goed nieuws of bij een bevestigde afwijking; een losse
    // week blijft grijs, anders schrik je van ruis.
    out.pct = (oordeel.status === 'op-schema' || out.waarschuwing) ? oordeel.pct : null;

    var doel = (richting === 'aankomen' ? '+' : '−') + tempo.toFixed(2).replace('.', ',');
    var marge = tempo > 0 ? tempo : 0.25;
    var kop = kgTekst(delta) + ' deze week — ';

    if (oordeel.status === 'op-schema') {
      out.tekst = kop + (richting === 'behouden'
        ? 'binnen je marge van ' + marge.toFixed(2).replace('.', ',') + ' kg.'
        : 'op schema (doel ' + doel + ' per week).');
    } else {
      if (richting === 'behouden') {
        out.tekst = kop + 'buiten je marge van ' + marge.toFixed(2).replace('.', ',') + ' kg.';
      } else if (oordeel.status === 'verkeerd') {
        out.tekst = kop + 'je komt niet ' + (richting === 'aankomen' ? 'aan' : 'af') +
          ', terwijl je dat wel wilt (doel ' + doel + ' per week).';
      } else if (oordeel.status === 'traag') {
        out.tekst = kop + 'trager dan je tempo van ' + doel + ' per week.';
      } else {
        out.tekst = kop + 'sneller dan je tempo van ' + doel + ' per week.';
      }

      if (out.waarschuwing) {
        out.tekst += ' Twee weken op rij, dus dit is geen schommeling meer.' +
          (oordeel.status !== 'snel' ? '' : richting === 'aankomen'
            ? ' Zo komt er vooral vet bij.'
            : ' Let op je spierbehoud.');
      } else if (out.vorigeStatus) {
        out.tekst += ' De week ervóór was dat nog niet zo, dus dit kan schommeling zijn — ' +
          'pas als het volgende week weer zo is, valt er iets bij te stellen.';
      } else {
        out.tekst += ' Eén week zegt nog weinig. Staat het volgende week weer zo, dan is het ' +
          'een trend.';
      }
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
    macroFractie: macroFractie,
    weightOf: weightOf,
    baseMax: baseMax,
    gewichtStatus: gewichtStatus,
    gewichtMelding: gewichtMelding,
    currentStreak: currentStreak,
    bestStreak: bestStreak,
    weightAvg: weightAvg,
    weightTrend: weightTrend,
    eiwitDoel: eiwitDoel,
    verbruik: verbruik,
    verbruikVerloop: verbruikVerloop,
    trendHelling: trendHelling,
    kracht: kracht,
    krachtEerder: krachtEerder,
    KCAL_PER_KG: KCAL_PER_KG,
    num: num,
    optionFor: optionFor
  };
})(window);
