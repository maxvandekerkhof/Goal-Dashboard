/* Goal Dashboard - kleine SVG-grafieken (geen externe libraries) */
(function (global) {
  'use strict';

  var GD = global.GD;
  var D = GD.date;

  /* Alles wat de gebruiker intypt gaat hier doorheen voordat het in de pagina
     komt. Ook de enkele quote hoort erbij: de app zet attributen nu tussen
     dubbele quotes, maar dat mag later wijzigen zonder gat te slaan. */
  function esc(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;').replace(/'/g, '&#39;');
  }

  /**
   * Ronde voortgangsmeter.
   *
   * opts.tot  : tweede, vage boog tot dit percentage. Daarmee laat een dag die
   *             nog loopt zien wat er nog te halen valt, in plaats van alleen
   *             wat er al binnen is — anders leest een ring die vol staat na
   *             drie doelen als een volle dag.
   * opts.kleur: eigen kleur in plaats van de score-schaal. Voor een dag die nog
   *             loopt: rood-naar-groen is een oordeel, en een halve dag verdient
   *             nog geen oordeel.
   */
  function ring(pct, size, stroke, opts) {
    size = size || 160;
    stroke = stroke || 14;
    opts = opts || {};
    var r = (size - stroke) / 2;
    var c = 2 * Math.PI * r;
    var has = pct !== null && pct !== undefined && !isNaN(pct);
    var value = has ? GD.clamp(pct, 0, 100) : 0;
    var dash = (value / 100) * c;
    var color = opts.kleur || GD.scoreColor(has ? pct : null);
    var label = has ? Math.round(pct) + '<tspan class="ring-pct-sign">%</tspan>' : '–';

    var tot = opts.tot === null || opts.tot === undefined || isNaN(opts.tot)
      ? null : GD.clamp(opts.tot, 0, 100);
    var open = '';
    var omschrijving = 'Score ' + (has ? Math.round(pct) + ' procent' : 'onbekend');
    if (tot !== null && tot > value + 0.5) {
      var dashTot = (tot / 100) * c;
      open = '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none"' +
        ' stroke="' + (opts.kleur || GD.scoreColor(tot)) + '" class="ring-open" stroke-width="' + stroke + '"' +
        ' stroke-linecap="round" stroke-dasharray="' + dashTot + ' ' + (c - dashTot) + '"' +
        ' transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>';
      omschrijving += ', vandaag nog tot ' + Math.round(tot) + ' procent te halen';
    }

    return '' +
      '<svg class="ring" viewBox="0 0 ' + size + ' ' + size + '" width="' + size + '" height="' + size +
      '" role="img" aria-label="' + esc(omschrijving) + '">' +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="var(--track)" stroke-width="' + stroke + '"/>' +
      open +
      '<circle cx="' + size / 2 + '" cy="' + size / 2 + '" r="' + r + '" fill="none" stroke="' + color + '"' +
      ' stroke-width="' + stroke + '" stroke-linecap="round" stroke-dasharray="' + dash + ' ' + (c - dash) + '"' +
      ' transform="rotate(-90 ' + size / 2 + ' ' + size / 2 + ')"/>' +
      '<text x="' + size / 2 + '" y="' + (size / 2 + size * 0.075) + '" text-anchor="middle" class="ring-pct" fill="' + color + '"' +
      ' font-size="' + Math.round(size * 0.26) + '">' + label + '</text>' +
      '</svg>';
  }

  /** Horizontale balk 0..100 */
  function bar(pct) {
    var has = pct !== null && pct !== undefined && !isNaN(pct);
    var v = has ? GD.clamp(pct, 0, 100) : 0;
    return '<div class="bar"><div class="bar-fill" style="width:' + v + '%;background:' +
      GD.scoreColor(has ? pct : null) + '"></div></div>';
  }

  /**
   * Lijngrafiek voor gewicht.
   * points: [{date, w}], doel: number|null
   */
  function weightChart(points, doel) {
    var W = 640, H = 200, padL = 44, padR = 12, padT = 16, padB = 26;
    if (!points || points.length === 0) {
      return '<p class="empty">Nog geen gewicht ingevuld in deze periode.</p>';
    }
    if (points.length === 1) {
      return '<p class="empty">Eén meting: <strong>' + points[0].w.toFixed(1) + ' kg</strong> op ' +
        esc(D.formatShort(points[0].date)) + '. Vul meer dagen in voor een grafiek.</p>';
    }

    var vals = points.map(function (p) { return p.w; });
    if (doel !== null && doel !== undefined) vals.push(doel);
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    var span = max - min || 1;
    min -= span * 0.15;
    max += span * 0.15;

    var t0 = D.parse(points[0].date).getTime();
    var t1 = D.parse(points[points.length - 1].date).getTime();
    var tSpan = (t1 - t0) || 1;

    function x(date) {
      return padL + ((D.parse(date).getTime() - t0) / tSpan) * (W - padL - padR);
    }
    function y(v) {
      return padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
    }

    var line = points.map(function (p, i) {
      return (i === 0 ? 'M' : 'L') + x(p.date).toFixed(1) + ' ' + y(p.w).toFixed(1);
    }).join(' ');

    var area = line + ' L' + x(points[points.length - 1].date).toFixed(1) + ' ' + (H - padB) +
      ' L' + x(points[0].date).toFixed(1) + ' ' + (H - padB) + ' Z';

    var dots = points.map(function (p) {
      return '<circle cx="' + x(p.date).toFixed(1) + '" cy="' + y(p.w).toFixed(1) +
        '" r="3" class="wc-dot"><title>' + esc(D.formatShort(p.date) + ': ' + p.w.toFixed(1) + ' kg') + '</title></circle>';
    }).join('');

    var gridVals = [min + (max - min) * 0.15, (min + max) / 2, max - (max - min) * 0.15];
    var grid = gridVals.map(function (v) {
      return '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" class="wc-grid"/>' +
        '<text x="' + (padL - 8) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end" class="wc-axis">' + v.toFixed(1) + '</text>';
    }).join('');

    var goalLine = '';
    if (doel !== null && doel !== undefined && !isNaN(doel)) {
      goalLine = '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(doel).toFixed(1) + '" y2="' + y(doel).toFixed(1) +
        '" class="wc-goal"/><text x="' + (W - padR) + '" y="' + (y(doel) - 5).toFixed(1) +
        '" text-anchor="end" class="wc-goal-label">doel ' + doel.toFixed(1) + ' kg</text>';
    }

    var xLabels = '<text x="' + padL + '" y="' + (H - 6) + '" class="wc-axis">' + esc(D.formatShort(points[0].date)) + '</text>' +
      '<text x="' + (W - padR) + '" y="' + (H - 6) + '" text-anchor="end" class="wc-axis">' +
      esc(D.formatShort(points[points.length - 1].date)) + '</text>';

    return '<svg class="weight-chart" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="Gewichtsverloop">' +
      grid + goalLine +
      '<path d="' + area + '" class="wc-area"/>' +
      '<path d="' + line + '" class="wc-line"/>' +
      dots + xLabels +
      '</svg>';
  }

  /**
   * Lijngrafiek met één of twee reeksen, voor het verloop van een oefening.
   *
   * reeksen: [{ naam, punten: [{ datum, v, label, piek }] }]
   * opts   : { eenheid, leeg }
   *
   * De y-as begint niet op nul: bij gewichten gaat het om het verschil van
   * week tot week, en dat verdwijnt in het niets als je vanaf nul tekent.
   */
  function lijnGrafiek(reeksen, opts) {
    opts = opts || {};
    var W = 640, H = 200, padL = 44, padR = 12, padT = 16, padB = 26;

    var gevuld = reeksen.filter(function (r) { return r.punten && r.punten.length; });
    var alle = [];
    gevuld.forEach(function (r) {
      r.punten.forEach(function (p) { alle.push(p); });
    });

    if (!alle.length) return '<p class="empty">' + esc(opts.leeg || 'Nog niets ingevuld.') + '</p>';
    if (alle.length === 1) {
      return '<p class="empty">Eén sessie: <strong>' + esc(alle[0].label) + '</strong> op ' +
        esc(D.formatShort(alle[0].datum)) + '. Vul deze oefening nog een keer in, dan tekent de app een lijn.</p>';
    }

    var vals = alle.map(function (p) { return p.v; });
    var min = Math.min.apply(null, vals);
    var max = Math.max.apply(null, vals);
    var span = max - min || Math.max(1, max * 0.1);
    min -= span * 0.15;
    max += span * 0.15;

    var datums = alle.map(function (p) { return D.parse(p.datum).getTime(); });
    var t0 = Math.min.apply(null, datums);
    var t1 = Math.max.apply(null, datums);
    var tSpan = (t1 - t0) || 1;

    function x(datum) {
      return padL + ((D.parse(datum).getTime() - t0) / tSpan) * (W - padL - padR);
    }
    function y(v) {
      return padT + (1 - (v - min) / (max - min)) * (H - padT - padB);
    }

    var lijnen = gevuld.map(function (r, i) {
      var pad = r.punten.map(function (p, j) {
        return (j === 0 ? 'M' : 'L') + x(p.datum).toFixed(1) + ' ' + y(p.v).toFixed(1);
      }).join(' ');
      var stippen = r.punten.map(function (p) {
        return '<circle cx="' + x(p.datum).toFixed(1) + '" cy="' + y(p.v).toFixed(1) + '"' +
          ' r="' + (p.piek ? 5 : 3) + '" class="lc-dot' + (p.piek ? ' lc-pr' : '') + '">' +
          '<title>' + esc(D.formatShort(p.datum) + ': ' + p.label + (p.piek ? ' (beste)' : '')) +
          '</title></circle>';
      }).join('');
      return '<g class="lc-serie lc-serie-' + i + '">' +
        (r.punten.length > 1 ? '<path d="' + pad + '" class="lc-line"/>' : '') +
        stippen + '</g>';
    }).join('');

    var gridVals = [min + (max - min) * 0.15, (min + max) / 2, max - (max - min) * 0.15];
    var grid = gridVals.map(function (v) {
      return '<line x1="' + padL + '" x2="' + (W - padR) + '" y1="' + y(v).toFixed(1) + '" y2="' + y(v).toFixed(1) + '" class="wc-grid"/>' +
        '<text x="' + (padL - 8) + '" y="' + (y(v) + 4).toFixed(1) + '" text-anchor="end" class="wc-axis">' +
        esc(afronden(v)) + '</text>';
    }).join('');

    var eersteDatum = alle.reduce(function (a, p) { return p.datum < a ? p.datum : a; }, alle[0].datum);
    var laatsteDatum = alle.reduce(function (a, p) { return p.datum > a ? p.datum : a; }, alle[0].datum);
    var xLabels = '<text x="' + padL + '" y="' + (H - 6) + '" class="wc-axis">' + esc(D.formatShort(eersteDatum)) + '</text>' +
      '<text x="' + (W - padR) + '" y="' + (H - 6) + '" text-anchor="end" class="wc-axis">' +
      esc(D.formatShort(laatsteDatum)) + '</text>';

    var uitleg = gevuld.length > 1
      ? '<div class="lc-legenda">' + gevuld.map(function (r, i) {
        return '<span class="lc-merk lc-serie-' + i + '"></span>' + esc(r.naam);
      }).join('') + '</div>'
      : '';

    return '<svg class="lijn-grafiek" viewBox="0 0 ' + W + ' ' + H + '" role="img" aria-label="' +
      esc(opts.omschrijving || 'Verloop van deze oefening') + '">' +
      grid + lijnen + xLabels +
      '</svg>' + uitleg;
  }

  /** Astekst zonder overbodige decimaal: 47,5 blijft 47,5 en 12 blijft 12. */
  function afronden(v) {
    var afgerond = Math.round(v * 10) / 10;
    return (afgerond % 1 === 0 ? String(afgerond) : afgerond.toFixed(1)).replace('.', ',');
  }

  /** Staafjes per dag (weekoverzicht) */
  function dayBars(days, onClickAttr) {
    return '<div class="daybars">' + days.map(function (d) {
      var has = d.pct !== null;
      var h = has ? Math.max(3, GD.clamp(d.pct, 0, 100)) : 3;
      var color = has ? GD.scoreColor(d.pct) : 'var(--track)';
      var title = D.formatDate(d.date) + ' — ' + (has ? Math.round(d.pct) + '%' : 'niet ingevuld');
      return '<button class="daybar" data-date="' + d.date + '" title="' + esc(title) + '" ' + (onClickAttr || '') + '>' +
        '<span class="daybar-track"><span class="daybar-fill" style="height:' + h + '%;background:' + color + '"></span></span>' +
        '<span class="daybar-label">' + esc(D.dayName(d.date)) + '</span>' +
        '<span class="daybar-val" style="color:' + (has ? color : 'var(--muted)') + '">' + (has ? Math.round(d.pct) : '–') + '</span>' +
        '</button>';
    }).join('') + '</div>';
  }

  /** Maandkalender met kleurvlakken */
  function calendar(anchorDate, days) {
    var byDate = {};
    days.forEach(function (d) { byDate[d.date] = d; });

    var first = D.startOfMonth(anchorDate);
    var last = D.endOfMonth(anchorDate);
    var lead = (D.parse(first).getDay() + 6) % 7;
    var t = D.today();

    var cells = '';
    for (var i = 0; i < lead; i++) cells += '<div class="cal-cell cal-empty"></div>';

    D.range(first, last).forEach(function (date) {
      var d = byDate[date];
      var pct = d ? d.pct : null;
      var has = pct !== null && pct !== undefined;
      var cls = 'cal-cell';
      if (date === t) cls += ' cal-today';
      if (date > t) cls += ' cal-future';
      if (d && d.state === 'missing0') cls += ' cal-missing';
      var bg = has ? GD.scoreColor(pct) : 'transparent';
      var fg = has ? GD.textOn(pct) : 'var(--muted)';
      var title = D.formatDate(date) + ' — ' +
        (has ? Math.round(pct) + '%' : (date > t ? 'toekomst' : 'niet ingevuld'));
      cells += '<button class="' + cls + '" data-date="' + date + '" title="' + esc(title) + '"' +
        ' style="background:' + bg + ';color:' + fg + '">' +
        '<span class="cal-day">' + D.parse(date).getDate() + '</span>' +
        '<span class="cal-pct">' + (has ? Math.round(pct) + '%' : '') + '</span>' +
        '</button>';
    });

    var head = D.DAY_NAMES.map(function (n) {
      return '<div class="cal-head">' + n + '</div>';
    }).join('');

    return '<div class="calendar">' + head + cells + '</div>';
  }

  /** Kleurenlegenda 0 -> 100 */
  function legend() {
    var stops = [0, 25, 50, 75, 100].map(function (p) {
      return GD.scoreColor(p) + ' ' + p + '%';
    }).join(', ');
    return '<div class="legend"><span>0%</span>' +
      '<span class="legend-bar" style="background:linear-gradient(90deg,' + stops + ')"></span>' +
      '<span>100%</span></div>';
  }

  GD.charts = {
    ring: ring,
    bar: bar,
    weightChart: weightChart,
    lijnGrafiek: lijnGrafiek,
    dayBars: dayBars,
    calendar: calendar,
    legend: legend,
    esc: esc
  };
})(window);
