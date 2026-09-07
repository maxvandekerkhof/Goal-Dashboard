/* Goal Dashboard - weergave en interactie */
(function (global) {
  'use strict';

  var GD = global.GD;
  var store = GD.store;
  var D = GD.date;
  var S = GD.score;
  var C = GD.charts;
  var esc = C.esc;

  var ui = {
    view: 'dag',
    anchor: D.today(),
    /* De oefening waarvan de grafiek openstaat. In de ui-status en niet in een
       <details>, zodat hij een nieuwe tekenbeurt overleeft. */
    liftGrafiek: null
  };

  function $(sel, root) { return (root || document).querySelector(sel); }
  function $$(sel, root) { return Array.prototype.slice.call((root || document).querySelectorAll(sel)); }

  /* ------------------------------ periode ----------------------------- */

  function periodDates() {
    if (ui.view === 'week') {
      var start = D.startOfWeek(ui.anchor);
      return D.range(start, D.addDays(start, 6));
    }
    if (ui.view === 'maand') {
      return D.range(D.startOfMonth(ui.anchor), D.endOfMonth(ui.anchor));
    }
    return [ui.anchor];
  }

  function periodLabel() {
    if (ui.view === 'dag') {
      var rel = D.relativeLabel(ui.anchor);
      return rel ? rel + ' · ' + D.formatDate(ui.anchor) : D.formatDate(ui.anchor);
    }
    if (ui.view === 'week') {
      var start = D.startOfWeek(ui.anchor);
      var end = D.addDays(start, 6);
      return 'Week ' + D.isoWeek(start) + ' · ' + D.formatShort(start) + ' – ' + D.formatShort(end);
    }
    if (ui.view === 'maand') {
      var d = D.parse(ui.anchor);
      return D.monthName(ui.anchor).charAt(0).toUpperCase() + D.monthName(ui.anchor).slice(1) + ' ' + d.getFullYear();
    }
    return '';
  }

  function shift(dir) {
    if (ui.view === 'dag') ui.anchor = D.addDays(ui.anchor, dir);
    else if (ui.view === 'week') ui.anchor = D.addDays(ui.anchor, dir * 7);
    else if (ui.view === 'maand') ui.anchor = D.addMonths(ui.anchor, dir);
    render();
  }

  /* ------------------------------ bouwstenen -------------------------- */

  function statTile(label, value, sub, color) {
    return '<div class="stat">' +
      '<div class="stat-label">' + esc(label) + '</div>' +
      '<div class="stat-value"' + (color ? ' style="color:' + color + '"' : '') + '>' + value + '</div>' +
      (sub ? '<div class="stat-sub">' + sub + '</div>' : '') +
      '</div>';
  }

  function fmt(n, digits) {
    if (n === null || n === undefined || isNaN(n)) return '–';
    return Number(n).toFixed(digits === undefined ? 0 : digits).replace('.', ',');
  }

  function signed(n, digits, unit) {
    if (n === null || n === undefined || isNaN(n)) return '–';
    var s = (n > 0 ? '+' : '') + fmt(n, digits);
    return s + (unit || '');
  }

  function breakdownList(breakdown) {
    var rows = breakdown.map(function (b) {
      var w = S.weightOf(b.goal, store.settings());
      var has = b.pct !== null;
      var counts;
      if (b.goal.type === 'meter') {
        counts = b.measured
          ? 'gem. ' + GD.formatVolume(b.avg) + ' · doel gehaald ' + b.hits + '×'
          : '';
      } else {
        counts = Object.keys(b.counts).filter(function (k) {
          return k !== 'leeg' && b.counts[k] > 0;
        }).map(function (k) {
          var opt = S.optionFor(b.goal, k);
          return (opt ? opt.short : k) + ' ' + b.counts[k] + '×';
        }).join(' · ');
      }

      return '<div class="bd-row' + (w === 0 ? ' bd-off' : '') + '">' +
        '<div class="bd-name"><span class="bd-icon">' + b.goal.icon + '</span>' +
        '<span>' + esc(b.goal.label) + '</span>' +
        (w === 0 ? '<span class="chip chip-off">uit</span>' : '<span class="chip">×' + fmt(w, w % 1 ? 1 : 0) + '</span>') +
        '</div>' +
        '<div class="bd-bar">' + C.bar(b.pct) + '</div>' +
        '<div class="bd-pct" style="color:' + (has ? GD.scoreColor(b.pct) : 'var(--muted)') + '">' +
        (has ? Math.round(b.pct) + '%' : '–') + '</div>' +
        '<div class="bd-counts">' + esc(counts || '—') + '</div>' +
        '</div>';
    }).join('');

    return '<section class="card"><h2>Per doel</h2><div class="breakdown">' + rows + '</div></section>';
  }

  function periodStatsSection(period, totalDays) {
    var st = period.stats;
    var s = store.settings();
    var tiles = [
      statTile('Dagen ingevuld', period.logged + '<span class="unit">/' + totalDays + '</span>',
        period.missing ? period.missing + ' niet ingevuld' : 'compleet'),
      statTile('Goede dagen', st.goodDays + '<span class="unit">/' + totalDays + '</span>',
        '≥ ' + fmt(s.goedeDagDrempel) + '%'),
      statTile('Getraind', st.trainDays + '<span class="unit">×</span>',
        st.restDays + ' rustdag' + (st.restDays === 1 ? '' : 'en')),
      statTile('Gewicht', st.weightEnd !== null ? fmt(st.weightEnd, 1) + '<span class="unit">kg</span>' : '–',
        st.weightDelta !== null ? signed(st.weightDelta, 1, ' kg in periode') : 'gem. ' + fmt(st.weightAvg, 1) + ' kg'),
      statTile('Gem. eiwit', st.proteinAvg !== null ? fmt(st.proteinAvg) + '<span class="unit">g</span>' : '–',
        'doel ' + fmt(s.eiwitDoel) + ' g'),
      statTile('Gem. calorieën', st.kcalAvg !== null ? fmt(st.kcalAvg) + '<span class="unit">kcal</span>' : '–',
        'doel ' + fmt(s.calorieDoel) + ' kcal'),
      statTile('Gem. water', st.waterAvg !== null ? GD.formatVolume(st.waterAvg) : '–',
        'doel ' + GD.formatVolume(s.waterDoel))
    ].join('');
    return '<section class="stats">' + tiles + '</section>';
  }

  var RICHTING_TEKST = {
    aankomen: 'aankomen',
    afvallen: 'afvallen',
    behouden: 'op gewicht blijven'
  };

  /**
   * Gewichtstrend: gemiddelde van deze periode tegen die van de vorige.
   * curLabel/prevLabel zijn bv. "week 33" en "week 32".
   */
  function weightTrendSection(dates, prevDates, curLabel, prevLabel, perWeek) {
    var s = store.settings();
    if ((s.gewichtRichting || 'uit') === 'uit') return '';

    var t = S.weightTrend(dates, prevDates, perWeek);
    var doelTekst = t.richting === 'behouden'
      ? 'binnen ' + fmt(t.doelDelta, 2) + ' kg blijven'
      : (t.richting === 'aankomen' ? '+' : '−') + fmt(t.doelDelta, 2) + ' kg';

    var body;
    if (t.pct === null) {
      body = '<div class="trend-info">' +
        '<p class="hero-sub">Vul je gewicht in ' + esc(curLabel) + ' én ' + esc(prevLabel) +
        ' in om de trend te zien.</p>' +
        '<p class="hint">Doel per ' + (perWeek > 1 ? 'maand' : 'week') + ': ' + esc(doelTekst) +
        ' (' + esc(RICHTING_TEKST[t.richting] || t.richting) + ').</p>' +
        '</div>';
    } else {
      var kleur = GD.scoreColor(t.pct);
      body = '<div class="trend-ring">' + C.ring(t.pct, 128, 12) + '</div>' +
        '<div class="trend-info">' +
        '<div class="trend-delta" style="color:' + kleur + '">' + signed(t.delta, 2, ' kg') + '</div>' +
        '<p class="hero-sub">' +
        esc(curLabel.charAt(0).toUpperCase() + curLabel.slice(1)) + ' gemiddeld <strong>' + fmt(t.avg, 2) + ' kg</strong> ' +
        '(' + t.count + ' meting' + (t.count === 1 ? '' : 'en') + '), ' +
        esc(prevLabel) + ' <strong>' + fmt(t.prevAvg, 2) + ' kg</strong> ' +
        '(' + t.prevCount + ').</p>' +
        '<p class="hint">Doel per ' + (perWeek > 1 ? 'maand' : 'week') + ': ' + esc(doelTekst) +
        ' (' + esc(RICHTING_TEKST[t.richting] || t.richting) + ').' +
        (t.note ? ' ' + esc(t.note) : '') + '</p>' +
        '</div>';
    }

    return '<section class="card"><h2>Gewichtstrend</h2>' +
      '<div class="trend">' + body + '</div></section>';
  }

  /**
   * opts.tot   : vage boog in de ring — waar je vandaag nog op uit kunt komen
   * opts.label : eigen kop in plaats van het oordeel, voor een dag die nog loopt
   */
  function heroSection(pct, subtitle, extra, opts) {
    opts = opts || {};
    // Een lopende dag krijgt geen oordeel mee: "Uitstekend" hoort pas bij een
    // dag die af is, niet bij drie ingevulde doelen om negen uur 's ochtends.
    // Ook de kleur wacht: rood-naar-groen zegt goed of slecht, en een dag die
    // pas begonnen is verdient allebei niet.
    var color = opts.label ? 'var(--text)' : GD.scoreColor(pct);
    return '<section class="card hero">' +
      '<div class="hero-ring">' +
      C.ring(pct, 190, 16, { tot: opts.tot, kleur: opts.label ? 'var(--accent)' : null }) +
      '</div>' +
      '<div class="hero-info">' +
      '<div class="hero-label" style="color:' + color + '">' + esc(opts.label || GD.scoreLabel(pct)) + '</div>' +
      '<p class="hero-sub">' + subtitle + '</p>' +
      (extra || '') +
      // De kleurschaal hoort bij een eindcijfer; zolang de dag loopt staat de
      // ring in één kleur en zou de balk alleen maar verwarren.
      (opts.label ? '' : C.legend()) +
      '</div></section>';
  }

  /* -------------------------------- dag ------------------------------- */

  function renderDay() {
    var date = ui.anchor;
    var isToday = date === D.today();
    var isFuture = date > D.today();
    var day = S.scoreDay(date, isToday || isFuture);
    var entry = store.entry(date) || {};
    var s = store.settings();

    var answered = day.items.filter(function (i) { return i.value; }).length;
    var relevant = day.items.filter(function (i) {
      return S.weightOf(i.goal, s) > 0 &&
        !(i.goal.onlyIfTrained && !day.trained && !!day.trainedValue);
    }).length;

    var streak = S.currentStreak();
    /* Wat staat er al vast, en wat valt er vandaag nog te halen? */
    var ov = S.dagOverzicht(day);
    var nietsGedaan = day.pct === null && ov.binnen === 0 && ov.kwijt === 0;
    var loopt = ov.open > 0 && !nietsGedaan;
    var toonPct = nietsGedaan ? null : ov.vloerPct;

    var extra = '<div class="hero-chips">' +
      '<span class="chip">' + answered + '/' + relevant + ' ingevuld</span>' +
      (loopt && ov.binnen + ov.kwijt > 0
        ? '<span class="chip" style="color:' + GD.scoreColor(day.pct) + '">' +
          Math.round(day.pct) + '% raak tot nu toe</span>'
        : '') +
      '<span class="chip">🔥 ' + streak + ' dag' + (streak === 1 ? '' : 'en') + ' op rij</span>' +
      (day.restDay ? '<span class="chip">😴 rustdag</span>' : '') +
      '</div>' +
      (ov.open > 0 && !isFuture
        ? '<p class="hint hint-tight">De vage ring is waar je vandaag nog op uit kunt komen.</p>'
        : '');

    var sub;
    if (isFuture) {
      sub = 'Deze dag ligt nog in de toekomst.';
    } else if (nietsGedaan) {
      sub = 'Nog niets ingevuld voor deze dag.';
    } else if (loopt) {
      // Niet het percentage van wat je al invulde, maar van de hele dag:
      // anders staat de ring vol terwijl de dag nog open ligt.
      sub = 'Je hebt <strong>' + fmt(ov.binnen, 1) + '</strong> van de <strong>' +
        fmt(ov.totaal, 1) + '</strong> punten van vandaag binnen. Er staat nog <strong>' +
        fmt(ov.open, 1) + '</strong> open' +
        (ov.kwijt >= 0.05 ? ' en <strong>' + fmt(ov.kwijt, 1) + '</strong> is niet meer te halen' : '') + '.';
    } else {
      sub = 'Je haalde <strong>' + fmt(day.points, 1) + '</strong> van de <strong>' +
        fmt(day.max, 1) + '</strong> punten die vandaag telden.';
    }

    var html = '';
    if (isToday && GD.review && GD.review.vensterOpen(new Date()) && !GD.review.gezien(date)) {
      html += reviewSection(date, { dagkaart: true });
    }

    html += heroSection(toonPct, sub, extra, {
      tot: ov.open > 0 ? ov.plafondPct : null,
      label: loopt ? 'Tussenstand' : null
    });

    /* Meetwaarden */
    var gm = S.gewichtMelding(date);
    html += '<section class="card">' +
      '<h2>Meetwaarden</h2>' +
      '<div class="measure-grid">' +
      measureField('gewicht', 'Gewicht', 'kg', entry.gewicht, '0.1', 'bv. 82,4') +
      measureField('eiwitGram', 'Eiwitten', 'g', entry.eiwitGram, '1', 'doel ' + fmt(s.eiwitDoel),
        voedingVoet(date, 'eiwitGram', 'g')) +
      measureField('kcal', 'Calorieën', 'kcal', entry.kcal, '1', 'doel ' + fmt(s.calorieDoel),
        voedingVoet(date, 'kcal', 'kcal')) +
      '</div>' +
      (gm.status === 'uit' || isFuture ? '' :
        '<p class="meldregel"' + (gm.pct === null ? '' : ' style="color:' + GD.scoreColor(gm.pct) + '"') +
        '><span class="meldregel-icoon">⚖️</span>' + esc(gm.tekst) + '</p>') +
      (s.autoMacro ? '<p class="hint">Eiwit- en caloriedoel worden automatisch bepaald zodra je hier waarden invult. Handmatig aanklikken hieronder heeft altijd voorrang.</p>' : '') +
      '</section>';

    /* Tellers (water) krijgen hun eigen kaart met snelknoppen */
    day.items.forEach(function (item) {
      if (item.goal.type === 'meter') html += meterCard(item);
    });

    /* Doelen */
    var goalRows = day.items.filter(function (item) {
      return item.goal.type !== 'meter';
    }).map(function (item) {
      return goalRow(item, day);
    }).join('');

    html += '<section class="card">' +
      '<div class="card-head"><h2>Doelen</h2>' +
      '<button class="btn btn-ghost btn-sm" data-action="copy-yesterday">Neem gisteren over</button></div>' +
      '<div class="goals">' + goalRows + '</div>' +
      '</section>';

    html += liftsSection(date, day);

    /* Notitie */
    html += '<section class="card">' +
      '<h2>Notitie</h2>' +
      '<textarea class="note" data-field="notitie" rows="3" placeholder="Hoe voelde de training? Wat ging goed of mis?">' +
      esc(entry.notitie || '') + '</textarea>' +
      (store.entry(date) ? '<div class="card-foot"><button class="btn btn-danger btn-sm" data-action="delete-day">Dag wissen</button></div>' : '') +
      '</section>';

    return html;
  }

  function measureField(field, label, unit, value, step, placeholder, voet) {
    return '<label class="measure">' +
      '<span class="measure-label">' + esc(label) + '</span>' +
      '<span class="measure-input">' +
      '<input type="number" inputmode="decimal" step="' + step + '" data-field="' + field + '"' +
      ' value="' + (value === undefined || value === null ? '' : esc(value)) + '"' +
      ' placeholder="' + esc(placeholder) + '">' +
      '<span class="measure-unit">' + esc(unit) + '</span>' +
      '</span>' + (voet || '') + '</label>';
  }

  /**
   * Waar komt dit getal vandaan? Alleen zichtbaar als de koppeling met Apple
   * Health aanstaat — anders is het ruis onder een veld dat je zelf invult.
   */
  function voedingVoet(datum, veld, eenheid) {
    if (!GD.voeding) return '';
    var st = GD.voeding.status(datum, veld);
    if (!st.aan) return '';
    if (st.health !== null && st.afwijkend) {
      return '<span class="bron bron-anders">Health: ' + fmt(st.health) + ' ' + esc(eenheid) +
        ' <button class="btn-mini" data-action="voeding-overnemen" data-veld="' + veld + '">' +
        'overnemen</button></span>';
    }
    if (st.bron === 'health') {
      return '<span class="bron bron-auto">↻ uit Apple Health</span>';
    }
    return '';
  }

  /** Waterteller: snelknoppen, voortgangsbalk en correctiemogelijkheid. */
  function meterCard(item) {
    var goal = item.goal;
    var amount = item.amount === null ? 0 : item.amount;
    var doel = item.doel || 0;
    var pct = doel > 0 ? GD.clamp((amount / doel) * 100, 0, 100) : (amount > 0 ? 100 : 0);
    var kleur = GD.scoreColor(pct);
    var gehaald = doel > 0 && amount >= doel;
    var rest = Math.max(0, doel - amount);

    var stappen = (goal.stappen || [250, 500, 1000]).map(function (ml) {
      return '<button class="btn btn-add" data-action="meter-add" data-goal="' + goal.key + '"' +
        ' data-amount="' + ml + '">' + esc(GD.stepLabel(ml)) + '</button>';
    }).join('');

    var terug = (goal.stappen || [250, 500, 1000]).slice(0, 2).map(function (ml) {
      return '<button class="btn btn-ghost btn-sm" data-action="meter-add" data-goal="' + goal.key + '"' +
        ' data-amount="-' + ml + '"' + (amount <= 0 ? ' disabled' : '') + '>−' +
        esc(GD.stepLabel(ml).replace('+', '')) + '</button>';
    }).join('');

    var status = item.included
      ? '+' + fmt(item.score * item.weight, 1) + ' / ' + fmt(item.weight, item.weight % 1 ? 1 : 0)
      : (item.reason || '');

    return '<section class="card">' +
      '<div class="card-head"><h2>' + goal.icon + ' ' + esc(goal.label) + '</h2>' +
      '<span class="chip"' + (item.included ? ' style="color:' + kleur + '"' : '') + '>' + esc(status) + '</span>' +
      '</div>' +
      '<div class="meter-top">' +
      '<span class="meter-amount" style="color:' + kleur + '">' + esc(GD.formatVolume(amount)) + '</span>' +
      '<span class="meter-goal">van ' + esc(GD.formatVolume(doel)) + '</span>' +
      '<span class="meter-pct" style="color:' + kleur + '">' + Math.round(pct) + '%</span>' +
      '</div>' +
      C.bar(pct) +
      '<p class="hint">' + (gehaald
        ? 'Doel gehaald. '
        : 'Nog ' + esc(GD.formatVolume(rest)) + ' te gaan. ') +
      (item.reason === 'nog bezig'
        ? 'Telt vandaag nog niet mee in je dagscore, zodat je score niet keldert terwijl je nog aan het drinken bent.'
        : '') + '</p>' +
      '<div class="meter-buttons">' + stappen + '</div>' +
      '<div class="meter-tweak">' + terug +
      '<label class="meter-manual">' +
      '<input type="number" inputmode="numeric" step="50" min="0" data-field="' + goal.field + '"' +
      ' value="' + (item.amount === null ? '' : item.amount) + '" placeholder="ml">' +
      '<span class="measure-unit">ml</span></label>' +
      (amount > 0 ? '<button class="btn btn-ghost btn-sm" data-action="meter-clear" data-goal="' + goal.key + '">Wissen</button>' : '') +
      '</div>' +
      '</section>';
  }

  function goalRow(item, day) {
    var goal = item.goal;
    var s = store.settings();
    var w = S.weightOf(goal, s);
    var disabled = w === 0;
    // Pas dimmen zodra duidelijk is dát er niet getraind is; zolang "gesport"
    // nog leeg staat blijft de rij gewoon bruikbaar.
    var dimmed = goal.onlyIfTrained && !day.trained && !!day.trainedValue;
    // Progressive overload volgt uit je oefeningen zodra die ingevuld zijn;
    // handmatig aanklikken zou dan toch overschreven worden.
    var vergrendeld = goal.key === 'overload' && item.auto;

    var opts = goal.options.filter(function (o) { return !o.hidden; }).map(function (o) {
      var active = item.value === o.v;
      var isAuto = active && item.auto;
      return '<button class="seg' + (active ? ' seg-active' : '') + (isAuto ? ' seg-auto' : '') + '"' +
        ' data-action="set-goal" data-goal="' + goal.key + '" data-value="' + o.v + '"' +
        (disabled || vergrendeld ? ' disabled' : '') +
        ' style="' + (active ? '--seg-color:' + GD.scoreColor(o.score === null ? null : o.score * 100) + ';' : '') + '">' +
        esc(o.label) + (isAuto ? '<span class="auto-dot" title="automatisch bepaald">auto</span>' : '') +
        '</button>';
    }).join('');

    var status = '';
    if (disabled) status = '<span class="chip chip-off">uit</span>';
    else if (dimmed) status = '<span class="chip chip-off">' + esc(item.reason) + '</span>';
    else if (item.included) {
      status = '<span class="chip" style="color:' + GD.scoreColor(item.score * 100) + '">+' +
        fmt(item.score * w, 1) + ' / ' + fmt(w, w % 1 ? 1 : 0) + '</span>';
    } else if (item.reason) {
      status = '<span class="chip chip-off">' + esc(item.reason) + '</span>';
    }

    var voet = '';
    if (vergrendeld) {
      var res = GD.lifts.dagResultaat(day.date);
      voet = '<p class="hint hint-tight">' + (res.vergeleken
        ? res.vooruit + ' van de ' + res.vergeleken + ' vergeleken ' +
          (res.vergeleken === 1 ? 'oefening ging' : 'oefeningen gingen') + ' vooruit.'
        : 'Je vult deze oefeningen voor het eerst in, dus er valt nog niets te vergelijken.') +
        ' Bepaald uit je oefeningen hieronder.</p>';
    }

    return '<div class="goal' + (dimmed ? ' goal-dim' : '') + (disabled ? ' goal-off' : '') + '">' +
      '<div class="goal-head">' +
      '<span class="goal-name"><span class="goal-icon">' + goal.icon + '</span>' + esc(goal.label) + '</span>' +
      status +
      '</div>' +
      '<div class="segmented">' + opts + '</div>' +
      voet +
      '</div>';
  }

  /* ----------------------------- oefeningen --------------------------- */

  var LIFT_STATUS = {
    vooruit: { label: '↑ vooruit', pct: 100 },
    gelijk: { label: '= gelijk', pct: 45 },
    terug: { label: '↓ terug', pct: 0 },
    nieuw: { label: 'startpunt', pct: null }
  };

  /** "40 kg × 8" of "12 reps" bij oefeningen zonder gewicht. */
  function liftText(oef, l) {
    if (!l) return '–';
    if (oef && oef.type === 'reps') return l.reps + ' reps';
    return fmt(l.kg, l.kg % 1 ? 1 : 0) + ' kg × ' + l.reps;
  }

  /* De eenheid staat rechts in het veld; een placeholder zou hem verdubbelen. */
  function liftInput(oid, zijde, veld, waarde, eenheid, stap) {
    return '<label class="lift-field">' +
      '<input type="number" inputmode="decimal" step="' + stap + '" min="0"' +
      ' data-lift="' + veld + '" data-oef="' + esc(oid) + '" data-zijde="' + esc(zijde) + '"' +
      ' value="' + esc(waarde) + '" aria-label="' + esc(eenheid) + '">' +
      '<span class="measure-unit">' + esc(eenheid) + '</span>' +
      '</label>';
  }

  /** Eén kant van een oefening: invulvelden plus je start en vorige keer. */
  function liftSide(date, oef, zijde, regel) {
    var st = regel ? LIFT_STATUS[regel.status] : null;
    var ctx = GD.lifts.context(date, oef.id, zijde.key);
    var alleenReps = oef.type === 'reps';

    var velden = (alleenReps ? '' :
      liftInput(oef.id, zijde.key, 'kg', GD.lifts.ruweWaarde(date, oef.id, zijde.key, 'kg'), 'kg', '0.5') +
      '<span class="lift-x">×</span>') +
      liftInput(oef.id, zijde.key, 'reps', GD.lifts.ruweWaarde(date, oef.id, zijde.key, 'reps'), 'reps', '1');

    var geschiedenis = [];
    if (ctx.start) {
      geschiedenis.push('Start ' + esc(liftText(oef, ctx.start)) +
        (ctx.start.datum === date ? '' : ' <span class="lift-date">' + esc(D.formatShort(ctx.start.datum)) + '</span>'));
    }
    if (ctx.vorige) {
      geschiedenis.push('Vorige ' + esc(liftText(oef, ctx.vorige)) +
        ' <span class="lift-date">' + esc(D.formatShort(ctx.vorige.datum)) + '</span>');
    }
    if (!geschiedenis.length) geschiedenis.push('Nog geen eerdere sessie — dit wordt je startpunt.');

    return '<div class="lift-side">' +
      (zijde.key ? '<span class="lift-arm" title="' + esc(zijde.label) + '">' + esc(zijde.kort) + '</span>' : '') +
      '<div class="lift-body">' +
      '<div class="lift-inputs">' + velden +
      (st ? '<span class="chip lift-status"' +
        (st.pct === null ? '' : ' style="color:' + GD.scoreColor(st.pct) + '"') + '>' +
        esc(st.label) + '</span>' : '') +
      '</div>' +
      '<p class="lift-hist">' + geschiedenis.join(' · ') + '</p>' +
      '</div></div>';
  }

  /**
   * Geschatte 1RM volgens Epley. Daarmee telt 40 kg × 10 als vooruitgang op
   * 40 kg × 8, zonder dat de grafiek twee lijnen nodig heeft. Boven de tien
   * herhalingen wordt de schatting optimistisch, maar het gaat hier om het
   * verloop van je eigen oefening, niet om het absolute getal.
   */
  function geschat1RM(kg, reps) {
    return kg * (1 + reps / 30);
  }

  /** Het hele verloop van één oefening, met de beste sessie gemarkeerd. */
  function liftGrafiek(oef) {
    var zijden = GD.lifts.zijden(oef);
    var alles = [];
    zijden.forEach(function (z) {
      alles = alles.concat(GD.lifts.historie(oef.id, z.key));
    });
    if (!alles.length) {
      return '<div class="lift-grafiek"><p class="empty">Nog geen sessies ingevuld voor deze oefening.</p></div>';
    }

    // Eén schaal voor de hele oefening: bij pull-ups en leg raises staat er
    // geen gewicht, dan volgt de lijn je herhalingen.
    var opReps = oef.type === 'reps' || !alles.some(function (r) { return r.kg > 0; });

    var reeksen = zijden.map(function (z) {
      var punten = GD.lifts.historie(oef.id, z.key).map(function (r) {
        return {
          datum: r.datum,
          v: opReps ? r.reps : geschat1RM(r.kg, r.reps),
          label: liftText(oef, r)
        };
      });
      var beste = null;
      punten.forEach(function (p) { if (!beste || p.v > beste.v) beste = p; });
      if (beste) beste.piek = true;
      return { naam: z.label || oef.naam, punten: punten };
    });

    // Per kant samenvatten: bij een oefening per arm zou één regel over rechts
    // en links door elkaar niets zeggen.
    var gevuld = reeksen.filter(function (r) { return r.punten.length; });
    var samenvatting = gevuld.map(function (r) {
      var eerste = r.punten[0];
      var laatste = r.punten[r.punten.length - 1];
      var groei = eerste.v > 0 ? ((laatste.v - eerste.v) / eerste.v) * 100 : null;
      var top = r.punten.reduce(function (best, p) {
        return best && best.v >= p.v ? best : p;
      }, null);

      return '<div class="lg-cijfers">' +
        (gevuld.length > 1 ? '<span class="lg-zijde">' + esc(r.naam) + '</span>' : '') +
        '<span>' + r.punten.length + ' sessie' + (r.punten.length === 1 ? '' : 's') +
        ' sinds ' + esc(D.formatShort(eerste.datum)) + '</span>' +
        (groei === null ? ''
          : '<span style="color:' + GD.scoreColor(groei > 0 ? 100 : (groei < 0 ? 0 : 45)) + '">' +
            signed(groei, 0, '%') + ' sinds je start</span>') +
        '<span>🏆 ' + esc(top.label) + ' op ' + esc(D.formatShort(top.datum)) + '</span>' +
        '</div>';
    }).join('');

    return '<div class="lift-grafiek">' +
      C.lijnGrafiek(reeksen, {
        leeg: 'Nog geen sessies ingevuld voor deze oefening.',
        omschrijving: 'Verloop van ' + oef.naam
      }) +
      samenvatting +
      '<p class="hint hint-tight">' + (opReps
        ? 'De lijn volgt je herhalingen.'
        : 'De lijn volgt je geschatte 1RM: gewicht × (1 + reps ÷ 30). Meer reps bij hetzelfde ' +
          'gewicht telt daarmee ook als vooruitgang.') +
      '</p></div>';
  }

  function liftRow(date, oid, res) {
    var oef = GD.lifts.byId(oid);
    if (!oef) return '';
    var sides = GD.lifts.zijden(oef).map(function (z) {
      var regel = null;
      res.regels.forEach(function (r) {
        if (r.id === oid && r.zijde.key === z.key) regel = r;
      });
      return liftSide(date, oef, z, regel);
    }).join('');

    var open = ui.liftGrafiek === oid;

    return '<div class="lift">' +
      '<div class="lift-head">' +
      '<span class="lift-name">' + esc(oef.naam) + '</span>' +
      '<span class="lift-knoppen">' +
      '<button class="btn btn-ghost btn-sm' + (open ? ' btn-aan' : '') + '"' +
      ' data-action="lift-grafiek" data-oef="' + esc(oid) + '"' +
      ' aria-expanded="' + (open ? 'true' : 'false') + '"' +
      ' title="Verloop van deze oefening">📈</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="lift-clear" data-oef="' + esc(oid) + '"' +
      ' title="Deze oefening voor vandaag wissen">wissen</button>' +
      '</span>' +
      '</div>' + sides +
      (open ? liftGrafiek(oef) : '') + '</div>';
  }

  /**
   * De oefeningen van de dag. Hieruit rolt automatisch het doel
   * "Progressive overload", dus dit is de plek waar je die score maakt.
   */
  function liftsSection(date, day) {
    var L = GD.lifts;
    var schemas = L.schemas();
    var res = L.dagResultaat(date);
    var ids = L.dagRegels(date);
    var sid = L.dagSchema(date);

    // Op een rustdag of een dag zonder training alleen tonen als er wél iets staat.
    var rust = day.trainedValue === 'nee' || day.trainedValue === 'rustdag';
    if (rust && !ids.length) {
      return '<section class="card card-quiet">' +
        '<div class="card-head"><h2>🏋️ Oefeningen</h2></div>' +
        '<p class="hint">Geen training vandaag, dus niets bij te houden.</p>' +
        '</section>';
    }

    if (!schemas.length) {
      return '<section class="card">' +
        '<div class="card-head"><h2>🏋️ Oefeningen</h2></div>' +
        '<p class="hint">Zet je trainingsschema\'s klaar, dan kun je hier per oefening je gewicht ' +
        'en reps invullen. De app onthoudt je startpunt en je vorige keer, en bepaalt daarmee zelf ' +
        'of je progressive overload hebt gehaald.</p>' +
        '<div class="row-actions">' +
        '<button class="btn btn-primary" data-action="startschemas">Push &amp; Pull klaarzetten</button>' +
        '</div></section>';
    }

    var keuze = schemas.map(function (s) {
      return '<button class="seg' + (s.id === sid ? ' seg-active' : '') + '"' +
        ' data-action="lift-schema" data-schema="' + esc(s.id) + '"' +
        (s.id === sid ? ' style="--seg-color:var(--accent)"' : '') + '>' +
        esc(s.naam) + '</button>';
    }).join('');

    var status;
    if (res.vergeleken) {
      var pct = (res.vooruit / res.vergeleken) * 100;
      status = '<span class="chip" style="color:' + GD.scoreColor(pct) + '">' +
        res.vooruit + ' van de ' + res.vergeleken + ' vooruit</span>';
    } else if (res.regels.length) {
      status = '<span class="chip chip-off">startpunt</span>';
    } else {
      status = '<span class="chip chip-off">nog leeg</span>';
    }

    var rijen = ids.map(function (oid) { return liftRow(date, oid, res); }).join('');
    if (!rijen) {
      rijen = '<p class="hint">Kies hierboven het schema dat je vandaag doet.</p>';
    }

    var namen = L.oefeningen().map(function (o) {
      return '<option value="' + esc(o.naam) + '"></option>';
    }).join('');

    var toevoegen = sid
      ? '<div class="lift-add">' +
        '<input type="text" id="lift-nieuw" list="lift-namen" placeholder="Oefening erbij">' +
        '<datalist id="lift-namen">' + namen + '</datalist>' +
        '<button class="btn btn-sm" data-action="lift-add" data-schema="' + esc(sid) + '">Toevoegen</button>' +
        '</div>'
      : '';

    var uitleg = res.vergeleken
      ? 'Vooruit telt zodra gewicht én reps gelijk of hoger zijn en er minstens één omhoog gaat. ' +
        'Gaat de één omhoog en de ander omlaag, dan beslist gewicht × reps.'
      : 'Zodra je een oefening voor de tweede keer invult, vergelijkt de app hem met je vorige sessie.';

    return '<section class="card">' +
      '<div class="card-head"><h2>🏋️ Oefeningen</h2>' + status + '</div>' +
      '<div class="segmented schema-keuze">' + keuze + '</div>' +
      '<div class="lifts">' + rijen + '</div>' +
      toevoegen +
      '<p class="hint">' + uitleg + '</p>' +
      '</section>';
  }

  /* --------------------------- weekafsluiting -------------------------- */

  var RV_SOORT = {
    'op-schema': 'goed',
    goed: 'goed',
    traag: 'let-op',
    snel: 'let-op',
    onder: 'let-op',
    'te-weinig-gegeten': 'let-op',
    'te-veel-gegeten': 'let-op',
    verkeerd: 'slecht'
  };

  function rvSoort(status) { return RV_SOORT[status] || 'neutraal'; }

  function reviewBlok(icoon, kop, tekst, soort) {
    return '<div class="rv-blok rv-' + soort + '">' +
      '<div class="rv-kop"><span class="rv-icoon">' + icoon + '</span>' + esc(kop) + '</div>' +
      '<p class="rv-tekst">' + esc(tekst) + '</p>' +
      '</div>';
  }

  function rvCijfer(waarde, label, kleur) {
    return '<div class="rv-cijfer">' +
      '<div class="rv-waarde"' + (kleur ? ' style="color:' + kleur + '"' : '') + '>' + waarde + '</div>' +
      '<div class="rv-label">' + esc(label) + '</div></div>';
  }

  var RICHTING_TEKEN = { aankomen: '+', afvallen: '−', behouden: '±' };

  /**
   * De weekafsluiting: op vrijdagavond bovenaan de dag, en altijd te vinden
   * in het weekoverzicht. Bewust maandag t/m vrijdag — het weekend is de vrije
   * ruimte en hoort niet in het rapport.
   */
  function reviewSection(datum, opties) {
    opties = opties || {};
    var r = GD.review.maak(datum);

    var kop = '<div class="card-head"><h2>📋 Weekafsluiting · ' + esc(r.label) + '</h2>' +
      '<span class="chip">ma t/m vr · ' + esc(r.periode) + '</span></div>';

    if (!r.ingevuld) {
      return '<section class="card review">' + kop +
        '<p class="hero-sub">Er staat nog niets ingevuld tussen ' + esc(r.periode) + '.</p>' +
        '</section>';
    }

    var cijfers = '<div class="rv-cijfers">' +
      rvCijfer(Math.round(r.pct) + '<span class="unit">%</span>', 'weekscore', GD.scoreColor(r.pct)) +
      rvCijfer(r.goedeDagen + '<span class="unit">/' + r.geweest + '</span>', 'goede dagen') +
      rvCijfer(r.trainDagen + '<span class="unit">×</span>', 'getraind') +
      rvCijfer(r.kcalDagen + '<span class="unit">/' + r.geweest + '</span>', 'dagen calorieën',
        GD.scoreColor(r.geweest ? (r.kcalDagen / r.geweest) * 100 : null)) +
      '</div>';

    var g = r.gewicht;
    var gTekst;
    if (g.richting === 'uit') {
      gTekst = 'Je houdt geen gewichtsdoel bij, dus hier valt niets te vergelijken.';
    } else if (g.delta === null) {
      gTekst = 'Te weinig weegmomenten om deze week met de vorige te vergelijken: ' +
        g.metingen + ' deze week, ' + g.vorigeMetingen + ' vorige week.';
    } else {
      // Twee decimalen: op één decimaal lijken twee weekgemiddelden die 50 gram
      // schelen precies gelijk, en dan lijkt de melding eronder onzin.
      gTekst = 'Gemiddeld ' + fmt(g.avg, 2) + ' kg tegenover ' + fmt(g.vorigeAvg, 2) +
        ' kg vorige week, dus ' + GD.review.kgTekst(g.delta) + '. Je tempo is ' +
        (RICHTING_TEKEN[g.richting] || '') + fmt(g.doelDelta, 2) + ' kg per week.';
    }

    var blokken = '<div class="rv-blokken">' +
      reviewBlok('🔥', r.eten.kop || 'Eten en gewicht', r.eten.tekst, rvSoort(r.eten.status)) +
      reviewBlok('⚖️', 'Gewicht', gTekst, rvSoort(g.status)) +
      reviewBlok('🍗', 'Eiwit', r.eiwit.tekst, rvSoort(r.eiwit.status)) +
      (r.beste
        ? reviewBlok('🏆', 'Sterkste punt',
          r.beste.goal.label + ' — ' + Math.round(r.beste.pct) + '% deze week.', 'goed')
        : '') +
      (r.zwakste
        ? reviewBlok('📉', 'Zwakste punt',
          r.zwakste.goal.label + ' — ' + Math.round(r.zwakste.pct) +
          '%. Daar liggen je punten voor volgende week.',
          r.zwakste.pct >= 70 ? 'goed' : 'let-op')
        : '') +
      '</div>';

    var knoppen = opties.dagkaart
      ? '<div class="row-actions">' +
        '<button class="btn" data-action="review-week">Hele week bekijken</button>' +
        '<button class="btn btn-ghost" data-action="review-verberg">Verbergen tot volgende week</button>' +
        '</div>'
      : '';

    var voet = '<p class="hint">Dit gaat over maandag tot en met vrijdag; je weekend blijft ' +
      'erbuiten.' +
      (r.eten.bijstellen
        ? ' Het calorieadvies rekent met de vuistregel dat één kilo lichaamsgewicht ongeveer ' +
          GD.review.KCAL_PER_KG + ' kcal is: genoeg om te zien of je moet bijsturen, te grof om ' +
          'op de kilo nauwkeurig te rekenen.'
        : '') + '</p>';

    return '<section class="card review">' + kop + cijfers + blokken + knoppen + voet + '</section>';
  }

  /* ------------------------------- week ------------------------------- */

  function renderWeek() {
    var dates = periodDates();
    var period = S.scorePeriod(dates);
    var s = store.settings();

    var sub = period.pct === null
      ? 'Nog geen ingevulde dagen in deze week.'
      : 'Gemiddelde over <strong>' + period.logged + '</strong> ingevulde dag' + (period.logged === 1 ? '' : 'en') +
        (s.countMissingAsZero && period.days.some(function (d) { return d.state === 'missing0'; })
          ? ', lege dagen tellen als 0%.' : '.');

    var html = heroSection(period.pct, sub);
    html += reviewSection(dates[0], {});
    html += periodStatsSection(period, dates.filter(function (d) { return d <= D.today(); }).length || dates.length);
    html += '<section class="card"><h2>Per dag</h2>' + C.dayBars(period.days) +
      '<p class="hint">Klik op een dag om hem in te vullen.</p></section>';
    html += breakdownList(period.breakdown);

    var vorigeStart = D.addDays(dates[0], -7);
    html += weightTrendSection(
      dates, D.range(vorigeStart, D.addDays(vorigeStart, 6)),
      'week ' + D.isoWeek(dates[0]), 'week ' + D.isoWeek(vorigeStart), 1);

    html += '<section class="card"><h2>Gewicht</h2>' +
      C.weightChart(period.stats.weights, S.num(s.gewichtDoel)) + '</section>';
    return html;
  }

  /* ------------------------------- maand ------------------------------ */

  function renderMonth() {
    var dates = periodDates();
    var period = S.scorePeriod(dates);
    var s = store.settings();

    var sub = period.pct === null
      ? 'Nog geen ingevulde dagen in deze maand.'
      : 'Gemiddelde over <strong>' + period.logged + '</strong> ingevulde dag' + (period.logged === 1 ? '' : 'en') + '.';

    var html = heroSection(period.pct, sub);
    html += periodStatsSection(period, dates.filter(function (d) { return d <= D.today(); }).length || dates.length);
    html += '<section class="card"><h2>Kalender</h2>' + C.calendar(ui.anchor, period.days) +
      '<p class="hint">Klik op een dag om hem in te vullen.</p></section>';
    html += breakdownList(period.breakdown);

    var vorigeMaand = D.addMonths(ui.anchor, -1);
    var vorigeDates = D.range(D.startOfMonth(vorigeMaand), D.endOfMonth(vorigeMaand));
    html += weightTrendSection(
      dates, vorigeDates, D.monthName(ui.anchor), D.monthName(vorigeMaand),
      dates.length / 7);

    html += '<section class="card"><h2>Gewicht</h2>' +
      C.weightChart(period.stats.weights, S.num(s.gewichtDoel)) + '</section>';
    return html;
  }

  /* ---------------------------- instellingen -------------------------- */

  /** Eén oefening in een schema, met alles wat je eraan kunt verzetten. */
  function schemaOefening(s, oid, i, laatste) {
    var o = GD.lifts.byId(oid);
    if (!o) return '';
    var aantal = GD.lifts.zijden(o).reduce(function (n, z) {
      return n + GD.lifts.historie(oid, z.key).length;
    }, 0);

    return '<li class="schema-oef">' +
      '<input type="text" class="schema-naam" data-oef-naam="' + esc(oid) + '"' +
      ' value="' + esc(o.naam) + '" aria-label="Naam van de oefening">' +
      '<select data-oef-type="' + esc(oid) + '" aria-label="Soort oefening">' +
      opt('gewicht', 'Gewicht × reps', o.type === 'reps' ? 'reps' : 'gewicht') +
      opt('reps', 'Alleen reps', o.type === 'reps' ? 'reps' : 'gewicht') +
      '</select>' +
      '<label class="schema-arm" title="Rechts en links apart bijhouden">' +
      '<input type="checkbox" data-oef-arm="' + esc(oid) + '"' + (o.perArm ? ' checked' : '') + '>' +
      '<span>per arm</span></label>' +
      '<span class="schema-tel" title="Aantal ingevulde sessies">' + aantal + '×</span>' +
      '<span class="schema-knoppen">' +
      '<button class="btn btn-ghost btn-sm" data-action="oef-up" data-schema="' + esc(s.id) + '"' +
      ' data-oef="' + esc(oid) + '"' + (i === 0 ? ' disabled' : '') + ' aria-label="Omhoog">↑</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="oef-down" data-schema="' + esc(s.id) + '"' +
      ' data-oef="' + esc(oid) + '"' + (laatste ? ' disabled' : '') + ' aria-label="Omlaag">↓</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="oef-reset" data-oef="' + esc(oid) + '"' +
      ' title="Startpunt opnieuw vanaf vandaag">↺</button>' +
      '<button class="btn btn-ghost btn-sm" data-action="oef-remove" data-schema="' + esc(s.id) + '"' +
      ' data-oef="' + esc(oid) + '" title="Uit dit schema halen (je historie blijft)">✕</button>' +
      '</span></li>';
  }

  function schemaSection() {
    var lijst = GD.lifts.schemas();

    var blokken = lijst.map(function (s) {
      var ids = s.oefeningen || [];
      var rijen = ids.map(function (oid, i) {
        return schemaOefening(s, oid, i, i === ids.length - 1);
      }).join('');

      return '<div class="schema">' +
        '<div class="schema-head">' +
        '<input type="text" class="schema-titel" data-schema-naam="' + esc(s.id) + '"' +
        ' value="' + esc(s.naam) + '" aria-label="Naam van het schema">' +
        '<button class="btn btn-danger btn-sm" data-action="schema-del" data-schema="' + esc(s.id) + '">Verwijderen</button>' +
        '</div>' +
        (rijen ? '<ul class="schema-lijst">' + rijen + '</ul>'
          : '<p class="hint">Nog geen oefeningen in dit schema.</p>') +
        '<div class="lift-add">' +
        '<input type="text" data-oef-nieuw="' + esc(s.id) + '" list="alle-oefeningen" placeholder="Oefening toevoegen">' +
        '<button class="btn btn-sm" data-action="oef-add" data-schema="' + esc(s.id) + '">Toevoegen</button>' +
        '</div></div>';
    }).join('');

    var namen = GD.lifts.oefeningen().map(function (o) {
      return '<option value="' + esc(o.naam) + '"></option>';
    }).join('');

    return '<section class="card"><h2>Trainingsschema\'s</h2>' +
      '<p class="hint">Per training kies je op de dagpagina één schema en vul je per oefening je ' +
      'beste set in. De app onthoudt je startpunt en je vorige keer, en bepaalt daaruit zelf of je ' +
      'progressive overload hebt gehaald.</p>' +
      '<datalist id="alle-oefeningen">' + namen + '</datalist>' +
      (blokken ? '<div class="schemas">' + blokken + '</div>' : '') +
      '<div class="lift-add">' +
      '<input type="text" id="schema-nieuw" placeholder="Nieuw schema, bv. Benen">' +
      '<button class="btn btn-sm" data-action="schema-add">Schema toevoegen</button>' +
      (lijst.length ? '' :
        '<button class="btn btn-primary btn-sm" data-action="startschemas">Push &amp; Pull klaarzetten</button>') +
      '</div>' +
      '<p class="hint">Een oefening uit een schema halen laat je ingevulde sessies staan. ' +
      'Met ↺ begin je opnieuw met tellen, bijvoorbeeld na een blessure of een deload.</p>' +
      '</section>';
  }

  function renderSettings() {
    var s = store.settings();
    var dates = store.allDates();

    var html = '<section class="card"><h2>Voedingsdoelen</h2><div class="form-grid">' +
      settingNumber('eiwitDoel', 'Eiwitdoel', 'g per dag', s.eiwitDoel, '1') +
      settingNumber('waterDoel', 'Waterdoel', 'ml per dag', s.waterDoel, '250') +
      settingNumber('calorieDoel', 'Caloriedoel', 'kcal per dag', s.calorieDoel, '10') +
      '<label class="field"><span class="field-label">Caloriedoel geldt als</span>' +
      '<select data-setting="calorieRichting">' +
      opt('max', 'Maximum – eronder blijven', s.calorieRichting) +
      opt('min', 'Minimum – minstens halen', s.calorieRichting) +
      opt('rond', 'Rond het doel – binnen marge', s.calorieRichting) +
      '</select></label>' +
      (s.calorieRichting === 'rond'
        ? settingNumber('calorieMarge', 'Marge', '± kcal', s.calorieMarge, '10') : '') +
      settingNumber('gewichtDoel', 'Streefgewicht', 'kg (optioneel)', s.gewichtDoel, '0.1') +
      '</div></section>';

    html += '<section class="card"><h2>Gewichtsdoel</h2>' +
      '<p class="hint">Hiermee wordt je weekgemiddelde vergeleken met dat van de week ervoor. ' +
      'Ga je de verkeerde kant op, dan kleurt de trend rood. Dit staat los van je dagscore: ' +
      'gewicht is een uitkomst, geen gedrag dat je op één dag kunt halen.</p>' +
      '<div class="form-grid">' +
      '<label class="field"><span class="field-label">Ik wil</span>' +
      '<select data-setting="gewichtRichting">' +
      opt('aankomen', 'Aankomen (spieropbouw)', s.gewichtRichting) +
      opt('afvallen', 'Afvallen', s.gewichtRichting) +
      opt('behouden', 'Op gewicht blijven', s.gewichtRichting) +
      opt('uit', 'Niet bijhouden', s.gewichtRichting) +
      '</select></label>' +
      (s.gewichtRichting && s.gewichtRichting !== 'uit'
        ? settingNumber('gewichtTempo',
          s.gewichtRichting === 'behouden' ? 'Toegestane marge' : 'Tempo',
          'kg per week', s.gewichtTempo, '0.05')
        : '') +
      '</div>' +
      (s.gewichtRichting === 'aankomen'
        ? '<p class="hint">Vuistregel voor een rustige bulk: 0,25 tot 0,5 kg per week. ' +
          'Sneller levert vooral extra vet op.</p>'
        : '') +
      '</section>';

    html += schemaSection();

    html += '<section class="card"><h2>Scoreregels</h2><div class="form-grid">' +
      settingNumber('goedeDagDrempel', 'Drempel goede dag', '% voor streak', s.goedeDagDrempel, '5') +
      '</div>' +
      toggle('countMissingAsZero', 'Lege dagen in het verleden tellen als 0%',
        'Uit betekent: alleen ingevulde dagen tellen mee in week- en maandpercentages.', s.countMissingAsZero) +
      toggle('autoMacro', 'Eiwit- en caloriedoel automatisch bepalen',
        'Leidt “behaald ja/nee” af uit de ingevulde grammen en calorieën.', s.autoMacro) +
      '</section>';

    var weightRows = GD.GOALS.map(function (g) {
      var w = S.weightOf(g, s);
      return '<div class="weight-row">' +
        '<span class="weight-name"><span class="goal-icon">' + g.icon + '</span>' + esc(g.label) + '</span>' +
        '<input type="range" min="0" max="4" step="0.5" data-weight="' + g.key + '" value="' + w + '">' +
        '<span class="weight-val">' + (w === 0 ? 'uit' : '×' + fmt(w, w % 1 ? 1 : 0)) + '</span>' +
        '</div>';
    }).join('');

    html += '<section class="card"><h2>Gewicht per doel</h2>' +
      '<p class="hint">Hoe zwaar telt elk doel mee in je dagscore? Op 0 telt het doel helemaal niet mee.</p>' +
      '<div class="weights">' + weightRows + '</div>' +
      '<div class="card-foot"><button class="btn btn-ghost btn-sm" data-action="reset-weights">Standaardgewichten herstellen</button></div>' +
      '</section>';

    html += syncSection();
    html += healthSection();

    /* Data */
    html += '<section class="card"><h2>Je data</h2>' +
      '<p class="hint">Alles staat lokaal in deze browser (localStorage) — er gaat niets naar een server. ' +
      'Maak dus af en toe een back-up, en gebruik die om je data op een ander apparaat te zetten.</p>' +
      '<div class="row-actions">' +
      '<button class="btn" data-action="export">Back-up downloaden</button>' +
      '<button class="btn" data-action="pick-json">Back-up terugzetten</button>' +
      '<button class="btn btn-danger" data-action="wipe">Alles wissen</button>' +
      '</div>' +
      '<p class="hint">' + dates.length + ' dag' + (dates.length === 1 ? '' : 'en') + ' opgeslagen' +
      (dates.length ? ' (' + esc(D.formatShort(dates[0])) + ' t/m ' + esc(D.formatShort(dates[dates.length - 1])) + ')' : '') +
      '.</p></section>';

    html += '<section class="card"><h2>Hoe wordt de score berekend?</h2>' +
      '<ul class="explain">' +
      '<li>Elk doel levert punten op: <em>Ja (eiwitrijk)</em> = vol, <em>Ja</em> = 60%, <em>Nee</em> = niets. ' +
      '<em>Deels</em> bij progressive overload telt voor de helft.</li>' +
      '<li>Je score is <em>behaalde punten ÷ haalbare punten</em>, met de gewichten hierboven.</li>' +
      '<li>Kies je <em>Rustdag</em>, dan telt “gesport” niet mee — een rustdag verpest je score dus niet. ' +
      'Progressive overload en de post-workout maaltijd tellen alleen mee op dagen dat je écht getraind hebt.</li>' +
      '<li>Zolang een dag loopt zie je een <em>tussenstand</em>: de punten die je al binnen hebt, ' +
      'gedeeld door alle punten die vandaag te halen waren. De vage ring eromheen laat zien waar je ' +
      'vandaag nog op uit kunt komen. Zo staat de ring niet vol na drie ingevulde doelen. ' +
      'Bij afgelopen dagen telt niet-ingevuld als niet gedaan.</li>' +
      '<li><em>Water</em> scoort naar rato: 2,25 van de 3 liter is 75%. Zolang de dag loopt telt de teller ' +
      'pas mee zodra je je doel haalt — anders zou je score \'s ochtends kelderen door een doel waar je nog ' +
      'aan bezig bent. Bij afgelopen dagen telt gewoon het deel dat je haalde.</li>' +
      '<li>Gewicht telt niet mee in je dagscore. Het krijgt een eigen percentage in de ' +
      '<em>Gewichtstrend</em>: je weekgemiddelde tegenover dat van de week ervoor, ' +
      'afgemeten aan je gewichtsdoel hierboven.</li>' +
      '</ul></section>';

    return html;
  }

  /* --------------------------- synchroniseren -------------------------- */

  function tijdstip(ms) {
    if (!ms) return 'nog niet';
    var d = new Date(ms);
    var vandaag = D.iso(d) === D.today();
    var klok = ('0' + d.getHours()).slice(-2) + ':' + ('0' + d.getMinutes()).slice(-2);
    return vandaag ? 'vandaag om ' + klok : D.formatShort(D.iso(d)) + ' om ' + klok;
  }

  function syncSection() {
    var st = GD.sync.status();
    var c = GD.sync.config();

    var html = '<section class="card"><h2>Synchroniseren tussen apparaten</h2>';

    if (!st.geconfigureerd) {
      html += '<p class="hint">Vul je telefoon en laptop allebei dezelfde twee gegevens in, ' +
        'log in met je e-mailadres, en je dagen lopen automatisch gelijk. ' +
        'De <strong>project-URL</strong> staat in Supabase onder <em>Settings → Data API</em> ' +
        '(of achter de knop <em>Connect</em> bovenin), de <strong>sleutel</strong> onder ' +
        '<em>Settings → API Keys</em>: neem de <em>publishable key</em>, die in oudere projecten ' +
        '<em>anon public</em> heet. Die mag openbaar zijn; je gegevens zijn beschermd doordat alleen ' +
        'jouw ingelogde account bij jouw rijen kan. Neem nooit de <em>secret</em>- of ' +
        '<em>service_role</em>-sleutel: die omzeilt alle beveiliging.</p>';
    } else {
      html += '<p class="hint">Verbonden met <code>' + esc(c.url.replace(/^https?:\/\//, '')) + '</code>.</p>';
    }

    html += '<div class="form-grid">' +
      '<label class="field"><span class="field-label">Project-URL</span>' +
      '<input type="url" id="sync-url" placeholder="https://xxxx.supabase.co" value="' + esc(c.url) + '">' +
      '<span class="field-hint">Plak gerust de hele API-URL; een staart als /rest/v1 haalt de app er zelf af.</span>' +
      '</label>' +
      '<label class="field"><span class="field-label">Publishable key (of anon key)</span>' +
      '<input type="text" id="sync-key" placeholder="sb_publishable_… of eyJhbGciOi…" value="' +
      esc(c.anonKey) + '"></label>' +
      '</div>' +
      '<div class="row-actions"><button class="btn" data-action="sync-save">Verbinding opslaan</button></div>';

    if (st.geconfigureerd && !st.ingelogd) {
      html += '<hr class="scheiding">' +
        '<div class="form-grid">' +
        '<label class="field"><span class="field-label">E-mailadres</span>' +
        '<input type="email" id="sync-email" inputmode="email" autocomplete="email" placeholder="jij@voorbeeld.nl" value="' +
        esc(ui.syncEmail || '') + '"></label>' +
        '<label class="field"><span class="field-label">Wachtwoord</span>' +
        '<input type="password" id="sync-pass" autocomplete="current-password" placeholder="minstens 6 tekens"></label>' +
        '</div>' +
        '<div class="row-actions">' +
        '<button class="btn btn-primary" data-action="sync-login">Inloggen</button>' +
        '<button class="btn" data-action="sync-signup">Account aanmaken</button>' +
        '</div>' +
        '<p class="hint">Maak dit account één keer aan en log er op je andere apparaat mee in. ' +
        'Het wachtwoord kies je zelf en heeft niets te maken met je Supabase-account.</p>' +
        '<details class="uitleg"><summary>Liever een code per e-mail?</summary>' +
        '<p class="hint">Dat werkt alleen als je in Supabase een eigen mailserver (SMTP) hebt ingesteld: ' +
        'op de gratis ingebouwde mailservice kun je de e-mailsjablonen niet aanpassen, en zonder ' +
        '<code>{{ .Token }}</code> in de sjabloon <em>Magic link or OTP</em> zit er geen code in de mail. ' +
        'De link uit die mail werkt wel, maar opent op een telefoon vaak een ander venster dan de app ' +
        'op je beginscherm — en dan ben je daar nog steeds niet ingelogd.</p>' +
        '<div class="form-grid">' +
        '<label class="field"><span class="field-label">Code uit de e-mail</span>' +
        '<input type="text" id="sync-code" inputmode="numeric" autocomplete="one-time-code" placeholder="6 cijfers"></label>' +
        '</div>' +
        '<div class="row-actions">' +
        '<button class="btn btn-sm" data-action="sync-code">Stuur mij een code</button>' +
        '<button class="btn btn-sm" data-action="sync-code-login">Inloggen met code</button>' +
        '</div></details>';
    }

    if (st.ingelogd) {
      html += '<hr class="scheiding">' +
        '<div class="sync-status">' +
        '<span class="chip">' + (st.bezig ? '⏳ bezig…' : '✓ ingelogd') +
        (st.email ? ' als ' + esc(st.email) : '') + '</span>' +
        '<span class="chip">laatst bijgewerkt: ' + esc(tijdstip(st.laatst)) + '</span>' +
        '</div>' +
        '<div class="row-actions">' +
        '<button class="btn btn-primary" data-action="sync-now"' + (st.bezig ? ' disabled' : '') + '>Nu synchroniseren</button>' +
        '<button class="btn btn-ghost" data-action="sync-logout">Uitloggen</button>' +
        '</div>';
    }

    if (st.fout) {
      html += '<p class="alert alert-bad">' + esc(st.fout) + '</p>';
    }

    html += '<p class="hint">Per dag wint de laatste wijziging. Vul je \'s ochtends op je telefoon ' +
      'je water in en \'s avonds op je laptop je gewicht, dan blijft allebei staan — alleen als je ' +
      'dezelfde dag op beide apparaten aanpast, telt de laatste. Invullen zonder bereik werkt gewoon; ' +
      'zodra je weer online bent loopt het vanzelf gelijk.</p>' +
      '<details class="uitleg"><summary>Hoe zet ik Supabase klaar?</summary>' +
      '<ol class="explain">' +
      '<li>Maak een gratis account op <strong>supabase.com</strong> en daarna een nieuw project ' +
      '(regio Frankfurt ligt het dichtstbij).</li>' +
      '<li>Open in het project de <strong>SQL Editor</strong>, plak het blok hieronder en klik op ' +
      '<em>Run</em>. Dat maakt twee tabellen en zorgt dat alleen jij bij je eigen rijen kunt.</li>' +
      '<li>Kopieer de <em>Project URL</em> uit <strong>Settings → Data API</strong> en de ' +
      '<em>publishable key</em> uit <strong>Settings → API Keys</strong> naar de velden hierboven. ' +
      'In oudere projecten heet die sleutel <em>anon public</em>. De <em>secret key</em> laat je staan.</li>' +
      '<li>Ga naar <strong>Authentication → Sign In / Providers → Email</strong> en zet ' +
      '<em>Confirm email</em> <strong>uit</strong>. Anders wacht Supabase op een bevestigingsmail ' +
      'voordat je kunt inloggen.</li>' +
      '<li>Maak hierboven één keer een account aan met je e-mailadres en een zelfgekozen wachtwoord. ' +
      'Zet daarna in datzelfde scherm <em>Allow new users to sign up</em> uit, dan kan niemand anders ' +
      'zich nog aanmelden bij jouw project.</li>' +
      '<li>Herhaal stap 3 op je andere apparaat en log daar in met datzelfde e-mailadres en wachtwoord.</li>' +
      '</ol>' +
      '<pre class="sql">' + esc(SQL_SETUP) + '</pre>' +
      '<div class="row-actions"><button class="btn btn-sm" data-action="sync-copy-sql">SQL kopiëren</button></div>' +
      '</details>' +
      '</section>';

    return html;
  }

  var SQL_SETUP = [
    'create table if not exists public.dagen (',
    '  user_id uuid not null references auth.users on delete cascade,',
    '  datum date not null,',
    '  data jsonb,',
    '  verwijderd boolean not null default false,',
    '  bijgewerkt timestamptz not null default now(),',
    '  primary key (user_id, datum)',
    ');',
    '',
    'create table if not exists public.instellingen (',
    '  user_id uuid primary key references auth.users on delete cascade,',
    '  data jsonb not null,',
    '  bijgewerkt timestamptz not null default now()',
    ');',
    '',
    'alter table public.dagen enable row level security;',
    'alter table public.instellingen enable row level security;',
    '',
    'create policy "eigen dagen" on public.dagen',
    '  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);',
    '',
    'create policy "eigen instellingen" on public.instellingen',
    '  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);'
  ].join('\n');

  var VOEDING_SQL = [
    'create table if not exists public.voeding (',
    '  user_id uuid not null default auth.uid() references auth.users on delete cascade,',
    '  datum date not null,',
    '  kcal numeric,',
    '  eiwit numeric,',
    '  bron text,',
    '  bijgewerkt timestamptz not null default now(),',
    '  primary key (user_id, datum)',
    ');',
    '',
    'alter table public.voeding enable row level security;',
    '',
    'create policy "eigen voeding" on public.voeding',
    '  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);'
  ].join('\n');

  /** Eén stap in de handleiding voor de Shortcut. */
  function stap(kop, regels) {
    return '<li><strong>' + esc(kop) + '</strong>' +
      (regels.length ? '<div class="stap-regels">' + regels.map(function (r) {
        return '<div>' + r + '</div>';
      }).join('') + '</div>' : '') + '</li>';
  }

  function veldRegel(naam, waarde) {
    return esc(naam) + ': <code>' + esc(waarde) + '</code>';
  }

  function healthSection() {
    var s = store.settings();
    var st = GD.sync.status();
    var c = GD.sync.config();
    var ov = GD.voeding.overzicht();
    var url = c.url || 'https://jouwproject.supabase.co';
    var sleutel = c.anonKey || 'je publishable key';

    var html = '<section class="card"><h2>Voeding uit Apple Health</h2>' +
      '<p class="hint">MyFitnessPal schrijft je calorieën en eiwitten naar Apple Health. ' +
      'Een Shortcut op je iPhone leest daar elke avond de dagtotalen uit en zet ze in je eigen ' +
      'Supabase-project; dit dashboard haalt ze bij het synchroniseren op en vult je meetwaarden ' +
      'in. Daarmee gaan ook <em>Eiwitdoel behaald</em> en <em>Caloriedoel behaald</em> vanzelf. ' +
      'Tik je zelf een getal in, dan blijft dat staan: jouw invoer wint.</p>' +
      toggle('voedingSync', 'Voeding ophalen uit Apple Health',
        'Leest de tabel voeding uit je Supabase-project mee bij elke synchronisatie.',
        s.voedingSync);

    if (s.voedingSync) {
      if (!st.geconfigureerd || !st.ingelogd) {
        html += '<p class="alert alert-bad">Zet eerst het synchroniseren hierboven aan en log in — ' +
          'deze koppeling loopt via hetzelfde project.</p>';
      } else if (st.voedingFout) {
        html += '<p class="alert alert-bad">' + esc(st.voedingFout) +
          '<br>Waarschijnlijk bestaat de tabel <code>voeding</code> nog niet. Draai het SQL-blok ' +
          'hieronder in Supabase.</p>';
      } else if (ov.dagen) {
        html += '<div class="sync-status">' +
          '<span class="chip">✓ ' + ov.dagen + ' dag' + (ov.dagen === 1 ? '' : 'en') + ' ontvangen</span>' +
          (ov.bijgewerkt ? '<span class="chip">laatst bijgewerkt: ' + esc(tijdstip(ov.bijgewerkt)) + '</span>' : '') +
          (ov.laatste ? '<span class="chip">t/m ' + esc(D.formatShort(ov.laatste)) + '</span>' : '') +
          '</div>';
      } else {
        html += '<p class="hint">Nog niets ontvangen. Draai de Shortcut één keer met de hand en ' +
          'klik daarna op <em>Nu synchroniseren</em>.</p>';
      }
    }

    html += '<details class="uitleg"><summary>Hoe zet ik dit klaar?</summary>' +
      '<p class="hint">Eenmalig: een tabel in Supabase en een Shortcut op je telefoon. ' +
      'Zet in MyFitnessPal eerst de Apple Health-koppeling aan, zodat je voeding daar terechtkomt.</p>' +
      '<p class="hint"><strong>1. De tabel.</strong> Open in Supabase de SQL Editor, plak dit blok ' +
      'en klik op <em>Run</em>. Alleen jij kunt bij je eigen rijen, net als bij je dagen.</p>' +
      '<pre class="sql">' + esc(VOEDING_SQL) + '</pre>' +
      '<div class="row-actions"><button class="btn btn-sm" data-action="voeding-copy-sql">SQL kopiëren</button></div>' +
      '<p class="hint"><strong>2. De Shortcut.</strong> Open de app Opdrachten (Shortcuts) op je ' +
      'iPhone en maak een nieuwe opdracht met deze stappen:</p>' +
      '<ol class="explain stappen">' +
      stap('Zoek gezondheidswaarden', [
        veldRegel('Type', 'is Voedingsenergie'),
        veldRegel('Begindatum', 'is vandaag'),
        veldRegel('Eenheid', 'kcal'),
        'Daaronder: <em>Bereken statistieken</em> → <em>Som</em>. Bewaar als variabele ' +
        '<code>kcal</code>.'
      ]) +
      stap('Nog een keer, nu met type Eiwitten en eenheid g', [
        'Weer met <em>Bereken statistieken</em> → <em>Som</em>. Bewaar als variabele ' +
        '<code>eiwit</code>.'
      ]) +
      stap('Haal inhoud van URL op — inloggen', [
        veldRegel('URL', url + '/auth/v1/token?grant_type=password'),
        veldRegel('Methode', 'POST'),
        veldRegel('Koptekst apikey', sleutel),
        veldRegel('Koptekst Content-Type', 'application/json'),
        'Vraag om hoofdtekst: <em>JSON</em>, met alleen <code>email</code> en ' +
        '<code>password</code> van je dashboard-account.',
        'Daarna een <strong>losse actie</strong> <em>Haal woordenboekwaarde op</em> → sleutel ' +
        '<code>access_token</code>. Dus niet als veld in de hoofdtekst hierboven.'
      ]) +
      stap('Haal inhoud van URL op — wegschrijven', [
        veldRegel('URL', url + '/rest/v1/voeding?on_conflict=user_id,datum'),
        veldRegel('Methode', 'POST'),
        veldRegel('Koptekst apikey', sleutel),
        'Koptekst <code>Authorization</code>: <code>Bearer</code> + het access_token uit stap 3.',
        veldRegel('Koptekst Prefer', 'resolution=merge-duplicates'),
        veldRegel('Koptekst Content-Type', 'application/json'),
        'Vraag om hoofdtekst: <em>JSON</em> met <code>datum</code> (vandaag als ' +
        '<code>jjjj-MM-dd</code>), <code>kcal</code> en <code>eiwit</code> (allebei als type ' +
        '<em>Getal</em>), <code>bron</code> = <code>apple-health</code> en <code>bijgewerkt</code> ' +
        '(huidige datum, ISO 8601).'
      ]) +
      stap('Draai de opdracht één keer met de hand en kijk naar het getal', [
        'Rond de 2.000 à 3.000 bij <code>kcal</code>: goed. Zie je iets van 10.000, dan staat de ' +
        'eenheid in stap 1 nog op kilojoules. Controleer daarna in Supabase onder ' +
        '<em>Table Editor → voeding</em> of er een rij bij staat.'
      ]) +
      stap('Automatisering', [
        'Tabblad <em>Automatisering</em> → <em>Tijdstip</em> → 23:30 → <em>Direct uitvoeren</em>. ' +
        'Dan draait hij elke avond vanzelf.'
      ]) +
      '</ol>' +
      '<p class="hint">Je wachtwoord staat daarmee in die Shortcut, op je eigen telefoon. Dat is de ' +
      'prijs voor een koppeling zonder eigen app; wil je hem intrekken, wijzig dan je wachtwoord — ' +
      'dan stopt alleen de Shortcut ermee. Log je in de Shortcut in met hetzelfde account als in ' +
      'dit dashboard.</p>' +
      '<p class="hint">Wil je ook nog laat ingevoerde maaltijden meenemen? Herhaal stap 1, 2 en 4 ' +
      'met periode <em>Gisteren</em> en de datum van gisteren.</p>' +
      '</details></section>';

    return html;
  }

  function opt(v, label, current) {
    return '<option value="' + v + '"' + (current === v ? ' selected' : '') + '>' + esc(label) + '</option>';
  }

  function settingNumber(key, label, unit, value, step) {
    return '<label class="field"><span class="field-label">' + esc(label) + '</span>' +
      '<span class="field-input"><input type="number" inputmode="decimal" step="' + step + '" data-setting="' + key + '"' +
      ' value="' + (value === null || value === undefined ? '' : esc(value)) + '">' +
      '<span class="field-unit">' + esc(unit) + '</span></span></label>';
  }

  function toggle(key, label, hint, checked) {
    return '<label class="switch">' +
      '<input type="checkbox" data-setting="' + key + '"' + (checked ? ' checked' : '') + '>' +
      '<span class="switch-body"><span class="switch-label">' + esc(label) + '</span>' +
      '<span class="switch-hint">' + esc(hint) + '</span></span></label>';
  }

  /* ------------------------------- render ----------------------------- */

  /** Synchronisatieknop in de kopbalk: op elke pagina bereikbaar. */
  function renderSyncButton() {
    var knop = $('#btn-sync');
    if (!knop || !GD.sync) return;
    var st = GD.sync.status();
    knop.hidden = !(st.geconfigureerd && st.ingelogd);
    knop.classList.toggle('btn-sync-bezig', st.bezig);
    knop.disabled = st.bezig;
    knop.title = st.bezig
      ? 'Bezig met synchroniseren…'
      : 'Nu synchroniseren — laatst bijgewerkt ' + tijdstip(st.laatst);
  }

  function render() {
    var s = store.settings();
    document.documentElement.setAttribute('data-theme', s.theme === 'light' ? 'light' : 'dark');
    renderSyncButton();

    $$('.tab').forEach(function (t) {
      var active = t.dataset.view === ui.view;
      t.classList.toggle('tab-active', active);
      t.setAttribute('aria-selected', active ? 'true' : 'false');
    });

    var nav = $('#period-nav');
    if (ui.view === 'instellingen') {
      nav.hidden = true;
    } else {
      nav.hidden = false;
      $('#period-label').textContent = periodLabel();
      $('#btn-today').hidden = isCurrentPeriod();
    }

    var html;
    if (ui.view === 'dag') html = renderDay();
    else if (ui.view === 'week') html = renderWeek();
    else if (ui.view === 'maand') html = renderMonth();
    else html = renderSettings();

    $('#view').innerHTML = html;
    $('#view').scrollTop = 0;
  }

  function isCurrentPeriod() {
    var t = D.today();
    if (ui.view === 'dag') return ui.anchor === t;
    if (ui.view === 'week') return D.startOfWeek(ui.anchor) === D.startOfWeek(t);
    if (ui.view === 'maand') return D.startOfMonth(ui.anchor) === D.startOfMonth(t);
    return true;
  }

  /* ------------------------------- acties ----------------------------- */

  function toast(msg, kind) {
    var el = $('#toast');
    el.textContent = msg;
    el.className = 'toast toast-show' + (kind ? ' toast-' + kind : '');
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { el.className = 'toast'; }, 2600);
  }

  function meldSync(r) {
    var delen = [];
    if (r.opgehaald) delen.push(r.opgehaald + ' dag(en) opgehaald');
    if (r.verstuurd) delen.push(r.verstuurd + ' verstuurd');
    if (r.voeding) delen.push(r.voeding + ' × voeding uit Apple Health');
    if (!delen.length) { toast('Alles liep al gelijk.'); return; }
    toast(delen.join(', ') + '.');
  }

  function copyYesterday() {
    var prev = store.entry(D.addDays(ui.anchor, -1));
    if (!prev) { toast('Gisteren is nog niet ingevuld.', 'bad'); return; }
    var copy = JSON.parse(JSON.stringify(prev));
    delete copy.date;
    delete copy.notitie;
    // Je oefeningen zijn de training van gisteren; overnemen zou een sessie
    // verzinnen die je niet gedaan hebt.
    delete copy.oefeningen;
    delete copy.schema;
    // Tellers beginnen elke dag op nul; gisteren overnemen zou vals staan.
    GD.GOALS.forEach(function (g) {
      if (g.type === 'meter') delete copy[g.field];
    });
    Object.keys(copy).forEach(function (k) {
      store.setField(ui.anchor, k, copy[k]);
    });
    toast('Gisteren overgenomen.');
    render();
  }

  function download(filename, text, type) {
    var blob = new Blob([text], { type: type || 'application/json' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function handleAction(action, el) {
    if (action === 'set-goal') {
      var key = el.dataset.goal, value = el.dataset.value;
      var current = store.entry(ui.anchor) ? store.entry(ui.anchor)[key] : null;
      store.setField(ui.anchor, key, current === value ? null : value);
      render();
      return;
    }
    if (action === 'meter-add') {
      var goal = GD.goalByKey(el.dataset.goal);
      var huidig = S.num((store.entry(ui.anchor) || {})[goal.field], 0) || 0;
      var nieuw = Math.max(0, huidig + parseInt(el.dataset.amount, 10));
      store.setField(ui.anchor, goal.field, nieuw > 0 ? nieuw : null);
      render();
      return;
    }
    if (action === 'meter-clear') {
      var g2 = GD.goalByKey(el.dataset.goal);
      store.setField(ui.anchor, g2.field, null);
      render();
      return;
    }
    if (action === 'lift-schema') {
      var huidigSchema = GD.lifts.dagSchema(ui.anchor);
      var gekozen = el.dataset.schema;
      GD.lifts.setDagSchema(ui.anchor, huidigSchema === gekozen ? null : gekozen);
      render();
      return;
    }
    if (action === 'lift-add') {
      var veld = $('#lift-nieuw');
      var naamNieuw = veld ? veld.value.trim() : '';
      if (!naamNieuw) { toast('Vul eerst een naam in.', 'bad'); return; }
      GD.lifts.addToSchema(el.dataset.schema, GD.lifts.addOefening(naamNieuw));
      toast(naamNieuw + ' toegevoegd.');
      render();
      return;
    }
    if (action === 'lift-clear') {
      GD.lifts.wisOefening(ui.anchor, el.dataset.oef);
      render();
      return;
    }
    if (action === 'lift-grafiek') {
      ui.liftGrafiek = ui.liftGrafiek === el.dataset.oef ? null : el.dataset.oef;
      render();
      return;
    }
    if (action === 'review-week') {
      ui.view = 'week';
      render();
      return;
    }
    if (action === 'review-verberg') {
      GD.review.markeerGezien(ui.anchor);
      toast('Weekafsluiting staat in het weekoverzicht.');
      render();
      return;
    }
    if (action === 'startschemas') {
      var n = GD.lifts.startschemasToevoegen();
      toast(n + ' schema\'s klaargezet.');
      render();
      return;
    }
    if (action === 'schema-add') {
      var sVeld = $('#schema-nieuw');
      var sNaam = sVeld ? sVeld.value.trim() : '';
      if (!sNaam) { toast('Vul eerst een naam in.', 'bad'); return; }
      GD.lifts.addSchema(sNaam);
      render();
      return;
    }
    if (action === 'schema-del') {
      var schema = GD.lifts.schemaById(el.dataset.schema);
      if (schema && confirm('Schema "' + schema.naam + '" verwijderen? Je ingevulde sessies blijven staan.')) {
        GD.lifts.deleteSchema(el.dataset.schema);
        render();
      }
      return;
    }
    if (action === 'oef-add') {
      var oVeld = $('[data-oef-nieuw="' + el.dataset.schema + '"]');
      var oNaam = oVeld ? oVeld.value.trim() : '';
      if (!oNaam) { toast('Vul eerst een naam in.', 'bad'); return; }
      GD.lifts.addToSchema(el.dataset.schema, GD.lifts.addOefening(oNaam));
      render();
      return;
    }
    if (action === 'oef-up' || action === 'oef-down') {
      GD.lifts.moveInSchema(el.dataset.schema, el.dataset.oef, action === 'oef-up' ? -1 : 1);
      render();
      return;
    }
    if (action === 'oef-remove') {
      GD.lifts.removeFromSchema(el.dataset.schema, el.dataset.oef);
      render();
      return;
    }
    if (action === 'oef-reset') {
      if (confirm('Opnieuw beginnen met tellen voor "' + GD.lifts.naam(el.dataset.oef) +
        '"? Je eerstvolgende sessie wordt je nieuwe startpunt.')) {
        GD.lifts.resetStart(el.dataset.oef, D.today());
        toast('Startpunt opnieuw gezet.');
        render();
      }
      return;
    }
    if (action === 'copy-yesterday') { copyYesterday(); return; }
    if (action === 'delete-day') {
      if (confirm('Alles van ' + D.formatDate(ui.anchor) + ' wissen?')) {
        store.deleteEntry(ui.anchor);
        toast('Dag gewist.');
        render();
      }
      return;
    }
    if (action === 'reset-weights') {
      GD.GOALS.forEach(function (g) { store.setWeight(g.key, g.weight); });
      toast('Standaardgewichten hersteld.');
      render();
      return;
    }
    if (action === 'sync-save') {
      GD.sync.setConfig($('#sync-url').value, $('#sync-key').value);
      toast(GD.sync.isConfigured() ? 'Verbinding opgeslagen.' : 'Verbinding gewist.');
      render();
      return;
    }
    if (action === 'sync-code') {
      var adres = ($('#sync-email').value || '').trim();
      if (!adres) { toast('Vul eerst je e-mailadres in.', 'bad'); return; }
      ui.syncEmail = adres;
      el.disabled = true;
      GD.sync.sendCode(adres).then(function () {
        toast('Code verstuurd, kijk in je mail.');
      }).catch(function (e) {
        toast(e.message, 'bad');
      }).then(function () {
        el.disabled = false;
      });
      return;
    }
    if (action === 'sync-login' || action === 'sync-signup') {
      var adres3 = ($('#sync-email').value || '').trim();
      var wachtwoord = $('#sync-pass').value || '';
      if (!adres3 || !wachtwoord) { toast('Vul je e-mailadres en wachtwoord in.', 'bad'); return; }
      if (wachtwoord.length < 6) { toast('Kies een wachtwoord van minstens zes tekens.', 'bad'); return; }
      ui.syncEmail = adres3;
      el.disabled = true;
      var actie = action === 'sync-signup'
        ? GD.sync.signUp(adres3, wachtwoord).then(function (r) {
          if (!r.ingelogd) {
            throw new Error('Account aangemaakt, maar Supabase wacht op een bevestiging per e-mail. ' +
              'Zet onder Authentication → Sign In / Providers → Email de optie "Confirm email" uit ' +
              'en log daarna gewoon in.');
          }
        })
        : GD.sync.signIn(adres3, wachtwoord);

      actie.then(function () {
        toast('Ingelogd, gegevens worden opgehaald.');
        render();
        return GD.sync.syncNow();
      }).then(function (r) {
        if (r) meldSync(r);
        render();
      }).catch(function (e) {
        toast(e.message, 'bad');
        render();
      });
      return;
    }
    if (action === 'sync-code-login') {
      var adres2 = ($('#sync-email').value || '').trim();
      var code = ($('#sync-code').value || '').trim();
      if (!adres2 || !code) { toast('Vul je e-mailadres en de code in.', 'bad'); return; }
      ui.syncEmail = adres2;
      el.disabled = true;
      GD.sync.verifyCode(adres2, code).then(function () {
        toast('Ingelogd, gegevens worden opgehaald.');
        render();
        return GD.sync.syncNow();
      }).then(function (r) {
        if (r) meldSync(r);
        render();
      }).catch(function (e) {
        toast(e.message, 'bad');
        render();
      });
      return;
    }
    if (action === 'sync-now') {
      el.disabled = true;
      render();
      GD.sync.syncNow().then(function (r) {
        if (r) meldSync(r);
        render();
      }).catch(function (e) {
        toast(e.message, 'bad');
        render();
      });
      return;
    }
    if (action === 'sync-logout') {
      if (confirm('Uitloggen? Je gegevens op dit apparaat blijven gewoon staan.')) {
        // signOut trekt de sessie ook bij Supabase in, dus even wachten.
        GD.sync.signOut().then(function () {
          toast('Uitgelogd.');
          render();
        });
      }
      return;
    }
    if (action === 'sync-copy-sql') {
      var kopie = SQL_SETUP;
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(kopie).then(function () {
          toast('SQL gekopieerd.');
        }).catch(function () {
          toast('Kopiëren mislukt, selecteer de tekst handmatig.', 'bad');
        });
      } else {
        toast('Kopiëren kan hier niet, selecteer de tekst handmatig.', 'bad');
      }
      return;
    }
    if (action === 'voeding-overnemen') {
      if (GD.voeding.overnemen(ui.anchor, el.dataset.veld)) {
        toast('Waarde uit Apple Health overgenomen.');
        render();
      }
      return;
    }
    if (action === 'voeding-copy-sql') {
      if (navigator.clipboard && navigator.clipboard.writeText) {
        navigator.clipboard.writeText(VOEDING_SQL).then(function () {
          toast('SQL gekopieerd.');
        }).catch(function () {
          toast('Kopiëren mislukt, selecteer de tekst handmatig.', 'bad');
        });
      } else {
        toast('Kopiëren kan hier niet, selecteer de tekst handmatig.', 'bad');
      }
      return;
    }
    if (action === 'export') {
      download('goal-dashboard-' + D.today() + '.json', store.exportJSON());
      toast('Back-up gedownload.');
      return;
    }
    if (action === 'pick-json') { $('#file-json').click(); return; }
    if (action === 'wipe') {
      if (confirm('Weet je het zeker? Alle ingevulde dagen en instellingen worden gewist.') &&
          confirm('Echt alles wissen? Dit kan niet ongedaan worden gemaakt.')) {
        store.reset();
        ui.anchor = D.today();
        toast('Alles gewist.');
        render();
      }
      return;
    }
  }

  function bind() {
    document.addEventListener('click', function (e) {
      var actionEl = e.target.closest('[data-action]');
      if (actionEl) { handleAction(actionEl.dataset.action, actionEl); return; }

      var tab = e.target.closest('.tab');
      if (tab) { ui.view = tab.dataset.view; render(); return; }

      var navBtn = e.target.closest('[data-nav]');
      if (navBtn) {
        if (navBtn.dataset.nav === 'today') { ui.anchor = D.today(); render(); }
        else shift(navBtn.dataset.nav === 'next' ? 1 : -1);
        return;
      }

      var dayEl = e.target.closest('[data-date]');
      if (dayEl) {
        ui.anchor = dayEl.dataset.date;
        ui.view = 'dag';
        render();
        return;
      }

      var syncBtn = e.target.closest('#btn-sync');
      if (syncBtn) {
        renderSyncButton();
        GD.sync.syncNow().then(function (r) {
          if (r) meldSync(r);
          render();
        }).catch(function (err) {
          toast(err.message, 'bad');
          render();
        });
        return;
      }

      var themeBtn = e.target.closest('#btn-theme');
      if (themeBtn) {
        store.setSetting('theme', store.settings().theme === 'light' ? 'dark' : 'light');
        render();
      }
    });

    /* Meetwaarden en notitie */
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.lift) {
        GD.lifts.setVeld(ui.anchor, t.dataset.oef, t.dataset.zijde || '',
          t.dataset.lift, t.value);
        // Wie oefeningen invult heeft getraind; dat hoef je niet ook nog te melden.
        var e2 = store.entry(ui.anchor);
        if (e2 && e2.oefeningen && !e2.gesport) store.setField(ui.anchor, 'gesport', 'ja');
        render();
        return;
      }
      if (t.dataset && t.dataset.schemaNaam) {
        GD.lifts.updateSchema(t.dataset.schemaNaam, { naam: t.value.trim() || 'Naamloos' });
        render();
        return;
      }
      if (t.dataset && t.dataset.oefNaam) {
        var nieuweNaam = t.value.trim();
        if (nieuweNaam) GD.lifts.updateOefening(t.dataset.oefNaam, { naam: nieuweNaam });
        render();
        return;
      }
      if (t.dataset && t.dataset.oefType) {
        GD.lifts.updateOefening(t.dataset.oefType, { type: t.value });
        render();
        return;
      }
      if (t.dataset && t.dataset.oefArm) {
        GD.lifts.updateOefening(t.dataset.oefArm, { perArm: t.checked });
        render();
        return;
      }
      if (t.dataset && t.dataset.field) {
        var val = t.value;
        if (t.type === 'number') {
          var n = S.num(val);
          store.setField(ui.anchor, t.dataset.field, n);
        } else {
          store.setField(ui.anchor, t.dataset.field, val.trim() || null);
        }
        // Zelf ingetikt: de koppeling met Apple Health laat dit veld voortaan met rust.
        if (GD.voeding && (t.dataset.field === 'kcal' || t.dataset.field === 'eiwitGram')) {
          GD.voeding.handmatig(ui.anchor, t.dataset.field);
        }
        if (t.type === 'number') render();
        return;
      }
      if (t.dataset && t.dataset.setting) {
        var key = t.dataset.setting;
        if (t.type === 'checkbox') store.setSetting(key, t.checked);
        else if (t.type === 'number') store.setSetting(key, S.num(t.value));
        else store.setSetting(key, t.value);
        render();
        return;
      }
    });

    document.addEventListener('input', function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.weight) {
        var val = parseFloat(t.value);
        store.setWeight(t.dataset.weight, val);
        var out = t.parentNode.querySelector('.weight-val');
        if (out) out.textContent = val === 0 ? 'uit' : '×' + fmt(val, val % 1 ? 1 : 0);
      }
    });

    /* Notitie direct opslaan zonder opnieuw te tekenen */
    document.addEventListener('input', function (e) {
      if (e.target.classList && e.target.classList.contains('note')) {
        store.setField(ui.anchor, 'notitie', e.target.value.trim() || null);
      }
    });

    $('#file-json').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        try {
          var merge = confirm('OK = samenvoegen met je huidige data.\nAnnuleren = huidige data vervangen.');
          var n = store.importJSON(String(reader.result), merge ? 'merge' : 'replace');
          toast(n + ' dag(en) teruggezet.');
          render();
        } catch (err) {
          console.error(err);
          toast('Ongeldig back-upbestand.', 'bad');
        }
      };
      reader.readAsText(file);
      e.target.value = '';
    });

    /* Enter in een toevoegveld doet hetzelfde als de knop ernaast. */
    document.addEventListener('keydown', function (e) {
      if (e.key !== 'Enter') return;
      var t = e.target;
      if (!t.dataset) return;
      var knop = null;
      if (t.id === 'lift-nieuw' || t.id === 'schema-nieuw' || t.dataset.oefNieuw) {
        knop = t.parentNode.querySelector('[data-action]');
      }
      if (knop) {
        e.preventDefault();
        handleAction(knop.dataset.action, knop);
      }
    });

    document.addEventListener('keydown', function (e) {
      if (e.target.matches('input, textarea, select')) return;
      if (ui.view === 'instellingen') return;
      if (e.key === 'ArrowLeft') shift(-1);
      else if (e.key === 'ArrowRight') shift(1);
      else if (e.key === 't' || e.key === 'T') { ui.anchor = D.today(); render(); }
    });
  }

  function init() {
    store.load();
    bind();
    if (GD.sync) {
      // Opnieuw tekenen zodra er echt iets uit de cloud is toegepast.
      GD.sync.onApplied(function () { render(); });
      GD.sync.onChange(function () {
        // De knop in de kopbalk staat op elke pagina en volgt de status.
        if (ui.view === 'instellingen') render();
        else renderSyncButton();
      });
      GD.sync.init();
    }
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else init();

  GD.ui = ui;
})(window);
