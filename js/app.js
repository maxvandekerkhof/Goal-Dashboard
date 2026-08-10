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
    pendingCSV: null
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

  function heroSection(pct, subtitle, extra) {
    var color = GD.scoreColor(pct);
    return '<section class="card hero">' +
      '<div class="hero-ring">' + C.ring(pct, 190, 16) + '</div>' +
      '<div class="hero-info">' +
      '<div class="hero-label" style="color:' + color + '">' + esc(GD.scoreLabel(pct)) + '</div>' +
      '<p class="hero-sub">' + subtitle + '</p>' +
      (extra || '') +
      C.legend() +
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
    var extra = '<div class="hero-chips">' +
      '<span class="chip">' + answered + '/' + relevant + ' ingevuld</span>' +
      '<span class="chip">🔥 ' + streak + ' dag' + (streak === 1 ? '' : 'en') + ' op rij</span>' +
      (day.restDay ? '<span class="chip">😴 rustdag</span>' : '') +
      '</div>';

    var sub = isFuture
      ? 'Deze dag ligt nog in de toekomst.'
      : (day.pct === null
        ? 'Nog niets ingevuld voor deze dag.'
        : 'Je haalde <strong>' + fmt(day.points, 1) + '</strong> van de <strong>' + fmt(day.max, 1) + '</strong> punten die vandaag telden.');

    var html = heroSection(day.pct, sub, extra);

    /* Meetwaarden */
    html += '<section class="card">' +
      '<h2>Meetwaarden</h2>' +
      '<div class="measure-grid">' +
      measureField('gewicht', 'Gewicht', 'kg', entry.gewicht, '0.1', 'bv. 82,4') +
      measureField('eiwitGram', 'Eiwitten', 'g', entry.eiwitGram, '1', 'doel ' + fmt(s.eiwitDoel)) +
      measureField('kcal', 'Calorieën', 'kcal', entry.kcal, '1', 'doel ' + fmt(s.calorieDoel)) +
      '</div>' +
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

    /* Notitie */
    html += '<section class="card">' +
      '<h2>Notitie</h2>' +
      '<textarea class="note" data-field="notitie" rows="3" placeholder="Hoe voelde de training? Wat ging goed of mis?">' +
      esc(entry.notitie || '') + '</textarea>' +
      (store.entry(date) ? '<div class="card-foot"><button class="btn btn-danger btn-sm" data-action="delete-day">Dag wissen</button></div>' : '') +
      '</section>';

    return html;
  }

  function measureField(field, label, unit, value, step, placeholder) {
    return '<label class="measure">' +
      '<span class="measure-label">' + esc(label) + '</span>' +
      '<span class="measure-input">' +
      '<input type="number" inputmode="decimal" step="' + step + '" data-field="' + field + '"' +
      ' value="' + (value === undefined || value === null ? '' : esc(value)) + '"' +
      ' placeholder="' + esc(placeholder) + '">' +
      '<span class="measure-unit">' + esc(unit) + '</span>' +
      '</span></label>';
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

    var opts = goal.options.map(function (o) {
      var active = item.value === o.v;
      var isAuto = active && item.auto;
      return '<button class="seg' + (active ? ' seg-active' : '') + (isAuto ? ' seg-auto' : '') + '"' +
        ' data-action="set-goal" data-goal="' + goal.key + '" data-value="' + o.v + '"' +
        (disabled ? ' disabled' : '') +
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

    return '<div class="goal' + (dimmed ? ' goal-dim' : '') + (disabled ? ' goal-off' : '') + '">' +
      '<div class="goal-head">' +
      '<span class="goal-name"><span class="goal-icon">' + goal.icon + '</span>' + esc(goal.label) + '</span>' +
      status +
      '</div>' +
      '<div class="segmented">' + opts + '</div>' +
      '</div>';
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

    /* CSV / MyFitnessPal */
    html += '<section class="card"><h2>MyFitnessPal / CSV importeren</h2>' +
      '<p class="hint">MyFitnessPal biedt geen open API meer, dus dit gaat via hun CSV-export: ' +
      'open MyFitnessPal in de browser → <em>Reports</em> → <em>Nutrition</em> → periode kiezen → <em>Export</em>. ' +
      'Kolommen voor datum, calorieën en eiwit worden automatisch herkend; meerdere maaltijdregels per dag worden opgeteld. ' +
      'Elke andere CSV met die kolommen werkt ook.</p>' +
      '<div class="row-actions">' +
      '<button class="btn" data-action="pick-csv">CSV-bestand kiezen</button>' +
      '<label class="check"><input type="checkbox" id="csv-overwrite"> Bestaande waarden overschrijven</label>' +
      '<label class="check"><input type="checkbox" id="csv-dayfirst" checked> Datums als dag-maand-jaar lezen</label>' +
      '</div>' +
      '<div id="csv-preview">' + csvPreviewHTML() + '</div>' +
      '</section>';

    html += syncSection();

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
      '<li>Voor vandaag tellen alleen de doelen die je al hebt ingevuld, zodat je score meegroeit met de dag. ' +
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
        'Je vindt ze in Supabase onder <em>Project Settings → API</em>. ' +
        'De <em>anon key</em> is bedoeld om openbaar te zijn; je gegevens zijn beschermd doordat ' +
        'alleen jouw ingelogde account bij jouw rijen kan.</p>';
    } else {
      html += '<p class="hint">Verbonden met <code>' + esc(c.url.replace(/^https?:\/\//, '')) + '</code>.</p>';
    }

    html += '<div class="form-grid">' +
      '<label class="field"><span class="field-label">Project-URL</span>' +
      '<input type="url" id="sync-url" placeholder="https://xxxx.supabase.co" value="' + esc(c.url) + '"></label>' +
      '<label class="field"><span class="field-label">Anon key</span>' +
      '<input type="text" id="sync-key" placeholder="eyJhbGciOi…" value="' + esc(c.anonKey) + '"></label>' +
      '</div>' +
      '<div class="row-actions"><button class="btn" data-action="sync-save">Verbinding opslaan</button></div>';

    if (st.geconfigureerd && !st.ingelogd) {
      html += '<hr class="scheiding">' +
        '<div class="form-grid">' +
        '<label class="field"><span class="field-label">E-mailadres</span>' +
        '<input type="email" id="sync-email" inputmode="email" autocomplete="email" placeholder="jij@voorbeeld.nl" value="' +
        esc(ui.syncEmail || '') + '"></label>' +
        '<label class="field"><span class="field-label">Code uit de e-mail</span>' +
        '<input type="text" id="sync-code" inputmode="numeric" autocomplete="one-time-code" placeholder="6 cijfers"></label>' +
        '</div>' +
        '<div class="row-actions">' +
        '<button class="btn" data-action="sync-code">Stuur mij een code</button>' +
        '<button class="btn btn-primary" data-action="sync-login">Inloggen</button>' +
        '</div>' +
        '<p class="hint">Je krijgt een mail met een code én een link. De code werkt altijd; ' +
        'de link opent soms een ander venster dan de app op je beginscherm, dus die code is de veiligste weg.</p>';
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
      '<li>Ga naar <strong>Project Settings → API</strong> en kopieer de <em>Project URL</em> en de ' +
      '<em>anon public</em> sleutel naar de velden hierboven.</li>' +
      '<li>Ga naar <strong>Authentication → Emails</strong>, open de sjabloon <em>Magic Link</em> en ' +
      'zet er een regel bij met <code>{{ .Token }}</code>. Dat is de code van zes cijfers.</li>' +
      '<li>Herhaal alleen stap 3 op je andere apparaat en log daar met hetzelfde e-mailadres in.</li>' +
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

  function csvPreviewHTML() {
    var p = ui.pendingCSV;
    if (!p) return '';
    if (!p.ok) return '<p class="alert alert-bad">' + esc(p.error) + '</p>';
    var sample = p.dates.slice(0, 5).map(function (d) {
      var row = p.days[d];
      return '<tr><td>' + esc(D.formatShort(d)) + '</td><td>' +
        (row.kcal !== null ? fmt(row.kcal) + ' kcal' : '–') + '</td><td>' +
        (row.protein !== null ? fmt(row.protein) + ' g' : '–') + '</td></tr>';
    }).join('');

    return '<div class="alert alert-ok">' +
      '<p><strong>' + p.dates.length + ' dag' + (p.dates.length === 1 ? '' : 'en') + '</strong> gevonden ' +
      '(' + esc(D.formatShort(p.dates[0])) + ' t/m ' + esc(D.formatShort(p.dates[p.dates.length - 1])) + ') ' +
      'in kolommen: ' + esc(p.columns.date) +
      (p.columns.calories ? ', ' + esc(p.columns.calories) : '') +
      (p.columns.protein ? ', ' + esc(p.columns.protein) : '') + '.' +
      (p.skipped ? ' ' + p.skipped + ' regel(s) zonder geldige datum overgeslagen.' : '') + '</p>' +
      '<table class="preview"><thead><tr><th>Datum</th><th>Calorieën</th><th>Eiwit</th></tr></thead><tbody>' +
      sample + '</tbody></table>' +
      '<div class="row-actions"><button class="btn btn-primary" data-action="apply-csv">Importeren</button>' +
      '<button class="btn btn-ghost" data-action="cancel-csv">Annuleren</button></div>' +
      '</div>';
  }

  /* ------------------------------- render ----------------------------- */

  function render() {
    var s = store.settings();
    document.documentElement.setAttribute('data-theme', s.theme === 'light' ? 'light' : 'dark');

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
    if (!r.opgehaald && !r.verstuurd) { toast('Alles liep al gelijk.'); return; }
    var delen = [];
    if (r.opgehaald) delen.push(r.opgehaald + ' dag(en) opgehaald');
    if (r.verstuurd) delen.push(r.verstuurd + ' verstuurd');
    toast(delen.join(', ') + '.');
  }

  function copyYesterday() {
    var prev = store.entry(D.addDays(ui.anchor, -1));
    if (!prev) { toast('Gisteren is nog niet ingevuld.', 'bad'); return; }
    var copy = JSON.parse(JSON.stringify(prev));
    delete copy.date;
    delete copy.notitie;
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
    if (action === 'sync-login') {
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
        GD.sync.signOut();
        toast('Uitgelogd.');
        render();
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
    if (action === 'export') {
      download('goal-dashboard-' + D.today() + '.json', store.exportJSON());
      toast('Back-up gedownload.');
      return;
    }
    if (action === 'pick-json') { $('#file-json').click(); return; }
    if (action === 'pick-csv') { $('#file-csv').click(); return; }
    if (action === 'cancel-csv') { ui.pendingCSV = null; render(); return; }
    if (action === 'apply-csv') {
      var overwrite = $('#csv-overwrite') && $('#csv-overwrite').checked;
      var res = GD.mfp.apply(ui.pendingCSV, overwrite);
      ui.pendingCSV = null;
      render();
      toast(res.written + ' dag(en) bijgewerkt' + (res.skipped ? ', ' + res.skipped + ' waarde(n) behouden' : '') + '.');
      return;
    }
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

      var themeBtn = e.target.closest('#btn-theme');
      if (themeBtn) {
        store.setSetting('theme', store.settings().theme === 'light' ? 'dark' : 'light');
        render();
      }
    });

    /* Meetwaarden en notitie */
    document.addEventListener('change', function (e) {
      var t = e.target;
      if (t.dataset && t.dataset.field) {
        var val = t.value;
        if (t.type === 'number') {
          var n = S.num(val);
          store.setField(ui.anchor, t.dataset.field, n);
        } else {
          store.setField(ui.anchor, t.dataset.field, val.trim() || null);
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

    $('#file-csv').addEventListener('change', function (e) {
      var file = e.target.files && e.target.files[0];
      if (!file) return;
      var reader = new FileReader();
      reader.onload = function () {
        var dayFirst = $('#csv-dayfirst') ? $('#csv-dayfirst').checked : true;
        ui.pendingCSV = GD.mfp.parse(String(reader.result), { dayFirst: dayFirst });
        render();
        if (!ui.pendingCSV.ok) toast('Import mislukt.', 'bad');
      };
      reader.onerror = function () { toast('Kon het bestand niet lezen.', 'bad'); };
      reader.readAsText(file);
      e.target.value = '';
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
        if (ui.view === 'instellingen') render();
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
