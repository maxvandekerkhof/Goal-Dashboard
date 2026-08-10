/* Goal Dashboard - opslag (localStorage) + datum-helpers */
(function (global) {
  'use strict';

  var GD = global.GD;

  /* ---------------------------- datums ---------------------------- */

  function pad(n) { return n < 10 ? '0' + n : '' + n; }

  /** Lokale datum -> "YYYY-MM-DD" (geen UTC-verschuiving) */
  function iso(d) {
    return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate());
  }

  /** "YYYY-MM-DD" -> Date (lokale middernacht) */
  function parse(s) {
    var p = s.split('-');
    return new Date(+p[0], +p[1] - 1, +p[2]);
  }

  function today() { return iso(new Date()); }

  function addDays(s, n) {
    var d = parse(s);
    d.setDate(d.getDate() + n);
    return iso(d);
  }

  function addMonths(s, n) {
    var d = parse(s);
    var day = d.getDate();
    d.setDate(1);
    d.setMonth(d.getMonth() + n);
    var last = new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
    d.setDate(Math.min(day, last));
    return iso(d);
  }

  /** Maandag van de week waarin `s` valt */
  function startOfWeek(s) {
    var d = parse(s);
    var wd = (d.getDay() + 6) % 7; // ma=0 ... zo=6
    d.setDate(d.getDate() - wd);
    return iso(d);
  }

  function startOfMonth(s) {
    var d = parse(s);
    return iso(new Date(d.getFullYear(), d.getMonth(), 1));
  }

  function endOfMonth(s) {
    var d = parse(s);
    return iso(new Date(d.getFullYear(), d.getMonth() + 1, 0));
  }

  /** Lijst met datums van `from` t/m `to` (inclusief) */
  function range(from, to) {
    var out = [], cur = from;
    var guard = 0;
    while (cur <= to && guard++ < 1000) {
      out.push(cur);
      cur = addDays(cur, 1);
    }
    return out;
  }

  /** ISO-weeknummer */
  function isoWeek(s) {
    var d = parse(s);
    var t = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    t.setDate(t.getDate() + 3 - ((t.getDay() + 6) % 7));
    var week1 = new Date(t.getFullYear(), 0, 4);
    return 1 + Math.round(
      ((t - week1) / 86400000 - 3 + ((week1.getDay() + 6) % 7)) / 7
    );
  }

  var DAY_NAMES = ['ma', 'di', 'wo', 'do', 'vr', 'za', 'zo'];
  var MONTH_NAMES = ['januari', 'februari', 'maart', 'april', 'mei', 'juni',
    'juli', 'augustus', 'september', 'oktober', 'november', 'december'];

  function dayName(s) { return DAY_NAMES[(parse(s).getDay() + 6) % 7]; }
  function monthName(s) { return MONTH_NAMES[parse(s).getMonth()]; }

  function formatDate(s) {
    var d = parse(s);
    return dayName(s) + ' ' + d.getDate() + ' ' + MONTH_NAMES[d.getMonth()] + ' ' + d.getFullYear();
  }

  function formatShort(s) {
    var d = parse(s);
    return d.getDate() + ' ' + MONTH_NAMES[d.getMonth()].slice(0, 3);
  }

  function relativeLabel(s) {
    var t = today();
    if (s === t) return 'Vandaag';
    if (s === addDays(t, -1)) return 'Gisteren';
    if (s === addDays(t, 1)) return 'Morgen';
    return null;
  }

  /* ---------------------------- opslag ---------------------------- */

  function emptyState() {
    return { version: 1, settings: clone(GD.DEFAULT_SETTINGS), entries: {} };
  }

  function clone(o) { return JSON.parse(JSON.stringify(o)); }

  var state = null;

  function load() {
    if (state) return state;
    state = emptyState();
    try {
      var raw = global.localStorage.getItem(GD.STORAGE_KEY);
      if (raw) {
        var parsed = JSON.parse(raw);
        state = migrate(parsed);
      }
    } catch (e) {
      console.warn('Kon opgeslagen data niet lezen, start leeg.', e);
    }
    return state;
  }

  function migrate(data) {
    var s = emptyState();
    if (data && typeof data === 'object') {
      if (data.settings) {
        Object.keys(s.settings).forEach(function (k) {
          if (k === 'weights') return;
          if (data.settings[k] !== undefined) s.settings[k] = data.settings[k];
        });
        if (data.settings.weights) {
          Object.keys(s.settings.weights).forEach(function (k) {
            var w = data.settings.weights[k];
            if (typeof w === 'number' && isFinite(w) && w >= 0) s.settings.weights[k] = w;
          });
        }
      }
      if (data.entries && typeof data.entries === 'object') {
        Object.keys(data.entries).forEach(function (date) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(date)) s.entries[date] = data.entries[date];
        });
      }
    }
    return s;
  }

  var saveTimer = null;

  function writeNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    if (!state) return;
    try {
      global.localStorage.setItem(GD.STORAGE_KEY, JSON.stringify(state));
    } catch (e) {
      console.error('Opslaan mislukt', e);
      alert('Opslaan mislukt: de opslag van je browser zit vol of staat uit.');
    }
  }

  function save() {
    if (saveTimer) clearTimeout(saveTimer);
    saveTimer = setTimeout(writeNow, 120);
  }

  // Op een telefoon kan de app zomaar naar de achtergrond gaan; schrijf dan
  // meteen weg in plaats van te wachten op de timer.
  global.addEventListener('pagehide', writeNow);
  global.addEventListener('beforeunload', writeNow);
  global.document.addEventListener('visibilitychange', function () {
    if (global.document.visibilityState === 'hidden') writeNow();
  });

  function settings() { return load().settings; }

  function setSetting(key, value) {
    load().settings[key] = value;
    save();
  }

  function setWeight(key, value) {
    load().settings.weights[key] = value;
    save();
  }

  function entry(date) {
    return load().entries[date] || null;
  }

  /** Entry ophalen of aanmaken */
  function ensureEntry(date) {
    var st = load();
    if (!st.entries[date]) st.entries[date] = { date: date };
    return st.entries[date];
  }

  function setField(date, field, value) {
    var e = ensureEntry(date);
    if (value === null || value === undefined || value === '') delete e[field];
    else e[field] = value;
    if (isEmptyEntry(e)) delete load().entries[date];
    save();
  }

  function isEmptyEntry(e) {
    return !Object.keys(e).some(function (k) {
      return k !== 'date' && e[k] !== null && e[k] !== undefined && e[k] !== '';
    });
  }

  function deleteEntry(date) {
    delete load().entries[date];
    save();
  }

  function allDates() {
    return Object.keys(load().entries).sort();
  }

  function reset() {
    state = emptyState();
    try { global.localStorage.removeItem(GD.STORAGE_KEY); } catch (e) { /* leeg */ }
  }

  function exportJSON() {
    return JSON.stringify(load(), null, 2);
  }

  /**
   * Importeer een eerder geëxporteerd bestand.
   * mode 'merge' behoudt bestaande dagen die niet in het bestand zitten.
   */
  function importJSON(text, mode) {
    var data = JSON.parse(text);
    var incoming = migrate(data);
    if (mode === 'merge') {
      var st = load();
      Object.keys(incoming.entries).forEach(function (d) {
        st.entries[d] = incoming.entries[d];
      });
      st.settings = incoming.settings;
    } else {
      state = incoming;
    }
    save();
    return Object.keys(incoming.entries).length;
  }

  GD.store = {
    load: load,
    save: save,
    writeNow: writeNow,
    settings: settings,
    setSetting: setSetting,
    setWeight: setWeight,
    entry: entry,
    ensureEntry: ensureEntry,
    setField: setField,
    deleteEntry: deleteEntry,
    allDates: allDates,
    reset: reset,
    exportJSON: exportJSON,
    importJSON: importJSON
  };

  GD.date = {
    iso: iso,
    parse: parse,
    today: today,
    addDays: addDays,
    addMonths: addMonths,
    startOfWeek: startOfWeek,
    startOfMonth: startOfMonth,
    endOfMonth: endOfMonth,
    range: range,
    isoWeek: isoWeek,
    dayName: dayName,
    monthName: monthName,
    formatDate: formatDate,
    formatShort: formatShort,
    relativeLabel: relativeLabel,
    DAY_NAMES: DAY_NAMES,
    MONTH_NAMES: MONTH_NAMES
  };
})(window);
