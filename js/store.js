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
    return {
      version: 2,
      settings: clone(GD.DEFAULT_SETTINGS),
      settingsTs: 0,
      entries: {},
      // Gewiste dagen onthouden we, anders zet een synchronisatie ze terug.
      tombstones: {},
      // Spiegel van wat de koppeling met Apple Health aanlevert. Alleen lezen:
      // deze kant schrijft er nooit in, dus hij kan ook niets overschrijven.
      voeding: {}
    };
  }

  /**
   * Tijdstempel van een dag: elke wijziging zet hem op nu. Dagen van vóór de
   * synchronisatie krijgen 1, zodat een echt bewerkte versie elders wint.
   */
  function entryTs(date) {
    var e = load().entries[date];
    if (e && typeof e._ts === 'number') return e._ts;
    if (e) return 1;
    var t = load().tombstones[date];
    return typeof t === 'number' ? t : 0;
  }

  function stamp(date, ts) {
    var e = load().entries[date];
    if (e) e._ts = ts === undefined ? Date.now() : ts;
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
      // Lijsten moeten lijsten blijven, ook als er ooit iets raars binnenkomt.
      ['oefeningen', 'schemas'].forEach(function (k) {
        if (!Array.isArray(s.settings[k])) s.settings[k] = [];
      });
      if (typeof data.settingsTs === 'number') s.settingsTs = data.settingsTs;
      if (data.entries && typeof data.entries === 'object') {
        Object.keys(data.entries).forEach(function (date) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(date)) s.entries[date] = data.entries[date];
        });
      }
      if (data.voeding && typeof data.voeding === 'object') {
        Object.keys(data.voeding).forEach(function (date) {
          var rij = data.voeding[date];
          if (/^\d{4}-\d{2}-\d{2}$/.test(date) && rij && typeof rij === 'object') {
            s.voeding[date] = rij;
          }
        });
      }
      if (data.tombstones && typeof data.tombstones === 'object') {
        Object.keys(data.tombstones).forEach(function (date) {
          if (/^\d{4}-\d{2}-\d{2}$/.test(date) && typeof data.tombstones[date] === 'number') {
            s.tombstones[date] = data.tombstones[date];
          }
        });
      }
    }
    return s;
  }

  var saveTimer = null;
  /* Telt elke wijziging; de oefeningen-historie hangt haar cache hieraan op. */
  var rev = 0;

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
    rev++;
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
    load().settingsTs = Date.now();
    save();
    changed();
  }

  function setWeight(key, value) {
    load().settings.weights[key] = value;
    load().settingsTs = Date.now();
    save();
    changed();
  }

  /* Luisteraars (de synchronisatie) op de hoogte brengen van wijzigingen. */
  var listeners = [];
  function onChange(fn) { listeners.push(fn); }
  function changed() {
    listeners.forEach(function (fn) {
      try { fn(); } catch (e) { console.error(e); }
    });
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
    if (isEmptyEntry(e)) {
      delete load().entries[date];
      load().tombstones[date] = Date.now();
    } else {
      e._ts = Date.now();
      delete load().tombstones[date];
    }
    save();
    changed();
  }

  /* Velden op *Bron zeggen alleen wáár een waarde vandaan kwam. Een dag met
     alleen zo'n merkteken is nog steeds een lege dag. */
  function isEmptyEntry(e) {
    return !Object.keys(e).some(function (k) {
      return k !== 'date' && k !== '_ts' && !/Bron$/.test(k) &&
        e[k] !== null && e[k] !== undefined && e[k] !== '';
    });
  }

  function deleteEntry(date) {
    delete load().entries[date];
    load().tombstones[date] = Date.now();
    save();
    changed();
  }

  function allDates() {
    return Object.keys(load().entries).sort();
  }

  function reset() {
    rev++;
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
    importJSON: importJSON,
    entryTs: entryTs,
    stamp: stamp,
    /* Voeding uit Apple Health: binnengekomen waarden, per datum. */
    voeding: function (datum) { return load().voeding[datum] || null; },
    alleVoeding: function () { return load().voeding; },
    putVoeding: function (map) {
      // Geen changed(): dit is opgehaalde data, geen wijziging om terug te sturen.
      load().voeding = map;
      save();
    },
    rev: function () { return rev; },
    onChange: onChange,
    changed: changed,
    /* Rechtstreekse toegang voor de synchronisatie. */
    raw: function () { return load(); },
    putEntry: function (date, data, ts) {
      var st = load();
      data.date = date;
      data._ts = ts;
      st.entries[date] = data;
      delete st.tombstones[date];
      save();
    },
    removeEntry: function (date, ts) {
      var st = load();
      delete st.entries[date];
      st.tombstones[date] = ts;
      save();
    },
    putSettings: function (data, ts) {
      var st = load();
      st.settings = migrate({ settings: data }).settings;
      st.settingsTs = ts;
      save();
    }
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
