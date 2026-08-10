/* Goal Dashboard - CSV-import (MyFitnessPal-export of eigen CSV)
 *
 * MyFitnessPal heeft geen open publieke API meer, dus koppelen gaat via de
 * CSV-export (MyFitnessPal web -> Reports/Nutrition -> Export). Deze parser is
 * bewust tolerant: hij zoekt zelf de kolommen voor datum, calorieën en eiwit,
 * en telt meerdere regels (maaltijden) per dag bij elkaar op.
 */
(function (global) {
  'use strict';

  var GD = global.GD;

  /* ------------------------------- CSV ------------------------------- */

  function detectDelimiter(text) {
    var firstLine = text.split(/\r?\n/)[0] || '';
    var counts = [',', ';', '\t'].map(function (d) {
      return { d: d, n: firstLine.split(d).length };
    });
    counts.sort(function (a, b) { return b.n - a.n; });
    return counts[0].n > 1 ? counts[0].d : ',';
  }

  function parseCSV(text, delim) {
    var rows = [], row = [], field = '', inQuotes = false;
    text = text.replace(/^﻿/, '');
    for (var i = 0; i < text.length; i++) {
      var ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { field += '"'; i++; }
          else inQuotes = false;
        } else field += ch;
      } else if (ch === '"') {
        inQuotes = true;
      } else if (ch === delim) {
        row.push(field); field = '';
      } else if (ch === '\n') {
        row.push(field); field = '';
        rows.push(row); row = [];
      } else if (ch === '\r') {
        /* genegeerd */
      } else field += ch;
    }
    if (field.length || row.length) { row.push(field); rows.push(row); }
    return rows.filter(function (r) {
      return r.some(function (c) { return String(c).trim() !== ''; });
    });
  }

  /* ------------------------------ datums ----------------------------- */

  var MONTHS_EN = ['january', 'february', 'march', 'april', 'may', 'june', 'july',
    'august', 'september', 'october', 'november', 'december'];

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /** Herkent YYYY-MM-DD, D-M-YYYY, M/D/YYYY en "January 5, 2026". */
  function parseDate(raw, dayFirst) {
    var s = String(raw || '').trim();
    if (!s) return null;

    var m = /^(\d{4})[-\/.](\d{1,2})[-\/.](\d{1,2})/.exec(s);
    if (m) return m[1] + '-' + pad(+m[2]) + '-' + pad(+m[3]);

    m = /^(\d{1,2})[-\/.](\d{1,2})[-\/.](\d{4})/.exec(s);
    if (m) {
      var a = +m[1], b = +m[2], y = +m[3], day, mon;
      if (a > 12) { day = a; mon = b; }
      else if (b > 12) { mon = a; day = b; }
      else if (dayFirst) { day = a; mon = b; }
      else { mon = a; day = b; }
      if (mon < 1 || mon > 12 || day < 1 || day > 31) return null;
      return y + '-' + pad(mon) + '-' + pad(day);
    }

    m = /^([A-Za-z]+)\s+(\d{1,2}),?\s+(\d{4})/.exec(s);
    if (m) {
      var idx = MONTHS_EN.indexOf(m[1].toLowerCase());
      if (idx >= 0) return m[3] + '-' + pad(idx + 1) + '-' + pad(+m[2]);
    }

    m = /^(\d{1,2})\s+([A-Za-z]+)\s+(\d{4})/.exec(s);
    if (m) {
      var i2 = MONTHS_EN.indexOf(m[2].toLowerCase());
      if (i2 >= 0) return m[3] + '-' + pad(i2 + 1) + '-' + pad(+m[1]);
    }
    return null;
  }

  function toNumber(raw) {
    var s = String(raw || '').replace(/[^0-9,.\-]/g, '').trim();
    if (!s) return null;
    if (/^-?\d{1,3}(,\d{3})+(\.\d+)?$/.test(s)) {
      s = s.replace(/,/g, '');            // 1,234.5 en 2,100 -> punt als decimaal
    } else if (/^-?\d{1,3}(\.\d{3})+(,\d+)?$/.test(s)) {
      s = s.replace(/\./g, '').replace(',', '.'); // 1.234,5 -> komma als decimaal
    } else {
      s = s.replace(',', '.');            // 82,4 -> 82.4
    }
    var n = parseFloat(s);
    return isFinite(n) ? n : null;
  }

  /* ----------------------------- kolommen ---------------------------- */

  function findColumn(headers, patterns) {
    for (var p = 0; p < patterns.length; p++) {
      for (var i = 0; i < headers.length; i++) {
        if (patterns[p].test(headers[i])) return i;
      }
    }
    return -1;
  }

  /**
   * -> { ok, error, days: {date:{kcal,protein}}, dates[], skipped, columns }
   */
  function parse(text, opts) {
    opts = opts || {};
    var dayFirst = opts.dayFirst !== false;
    var rows = parseCSV(text, detectDelimiter(text));
    if (rows.length < 2) return { ok: false, error: 'Het bestand bevat geen bruikbare regels.' };

    var headers = rows[0].map(function (h) { return String(h).trim().toLowerCase(); });
    var iDate = findColumn(headers, [/^date$/, /datum/, /date/, /^dag$/]);
    var iKcal = findColumn(headers, [/^calories$/, /calorie/, /kcal/, /energie/, /energy/]);
    var iProt = findColumn(headers, [/^protein/, /protein/, /eiwit/]);

    if (iDate < 0) {
      return { ok: false, error: 'Geen datumkolom gevonden. Verwachte kolomnaam: "Date" of "Datum".' };
    }
    if (iKcal < 0 && iProt < 0) {
      return { ok: false, error: 'Geen kolom voor calorieën of eiwit gevonden.' };
    }

    var days = {}, skipped = 0;
    for (var r = 1; r < rows.length; r++) {
      var row = rows[r];
      var date = parseDate(row[iDate], dayFirst);
      if (!date) { skipped++; continue; }
      // Samenvattingsregels ("Totals") overslaan als ze geen echte datum hebben.
      if (!days[date]) days[date] = { kcal: null, protein: null };
      if (iKcal >= 0) {
        var k = toNumber(row[iKcal]);
        if (k !== null) days[date].kcal = (days[date].kcal || 0) + k;
      }
      if (iProt >= 0) {
        var p = toNumber(row[iProt]);
        if (p !== null) days[date].protein = (days[date].protein || 0) + p;
      }
    }

    var dates = Object.keys(days).sort();
    if (!dates.length) {
      return { ok: false, error: 'Geen geldige datums gevonden in de datumkolom.' };
    }

    return {
      ok: true,
      days: days,
      dates: dates,
      skipped: skipped,
      columns: {
        date: rows[0][iDate],
        calories: iKcal >= 0 ? rows[0][iKcal] : null,
        protein: iProt >= 0 ? rows[0][iProt] : null
      }
    };
  }

  /**
   * Schrijft de gevonden waarden weg in de dagentries.
   * overwrite=false laat handmatig ingevulde waarden staan.
   */
  function apply(result, overwrite) {
    var store = GD.store;
    var written = 0, skipped = 0;
    result.dates.forEach(function (date) {
      var d = result.days[date];
      var e = store.entry(date);
      var wroteSomething = false;

      if (d.kcal !== null && Math.round(d.kcal) > 0) {
        if (overwrite || !e || e.kcal === undefined || e.kcal === null) {
          store.setField(date, 'kcal', Math.round(d.kcal));
          wroteSomething = true;
        } else skipped++;
      }
      if (d.protein !== null && Math.round(d.protein) > 0) {
        if (overwrite || !e || e.eiwitGram === undefined || e.eiwitGram === null) {
          store.setField(date, 'eiwitGram', Math.round(d.protein));
          wroteSomething = true;
        } else skipped++;
      }
      if (wroteSomething) written++;
    });
    return { written: written, skipped: skipped };
  }

  GD.mfp = {
    parse: parse,
    apply: apply,
    parseDate: parseDate,
    parseCSV: parseCSV,
    toNumber: toNumber
  };
})(window);
