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
    return tsIn(load(), date);
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
          var v = data.settings[k];
          if (v === undefined) return;
          // Een leeggemaakt veld met een standaard krijgt die standaard terug;
          // zie de instellingen in app.js.
          if (v === null && s.settings[k] !== null) return;
          s.settings[k] = v;
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
  /* Staat er in dit tabblad iets dat nog niet weggeschreven is? */
  var vies = false;

  /** Tijdstempel van een dag in een willekeurige toestand; zie entryTs. */
  function tsIn(st, date) {
    var e = st.entries[date];
    if (e) return typeof e._ts === 'number' ? e._ts : 1;
    var t = st.tombstones[date];
    return typeof t === 'number' ? t : 0;
  }

  /**
   * Een andere versie van je gegevens hierin opnemen, per dag de nieuwste.
   * -> true als er hier iets veranderde
   *
   * Twee tabbladen hebben elk hun eigen kopie in het geheugen. Schreef het ene
   * die kopie in zijn geheel weg, dan verdween wat het andere intussen had
   * ingevuld. Daarom wordt hier niet overschreven maar samengevoegd, met
   * dezelfde regel als bij synchroniseren: per dag wint de laatste wijziging,
   * en een wismarkering is ook een wijziging.
   */
  function samenvoegen(data) {
    if (!state) return false;
    var hun = migrate(data);
    var veranderd = false;
    var datums = {};
    Object.keys(hun.entries).forEach(function (d) { datums[d] = true; });
    Object.keys(hun.tombstones).forEach(function (d) { datums[d] = true; });
    Object.keys(datums).forEach(function (d) {
      if (tsIn(hun, d) <= tsIn(state, d)) return;
      if (hun.entries[d]) {
        state.entries[d] = hun.entries[d];
        delete state.tombstones[d];
      } else {
        delete state.entries[d];
        state.tombstones[d] = hun.tombstones[d];
      }
      veranderd = true;
    });
    if (hun.settingsTs > state.settingsTs) {
      state.settings = hun.settings;
      state.settingsTs = hun.settingsTs;
      veranderd = true;
    }
    if (veranderd) rev++;
    return veranderd;
  }

  /* Luisteraars (de app) als er van buitenaf iets binnenkwam. */
  var extern = [];
  function meldExtern() {
    extern.forEach(function (fn) {
      try { fn(); } catch (e) { console.error(e); }
    });
  }

  function writeNow() {
    if (saveTimer) {
      clearTimeout(saveTimer);
      saveTimer = null;
    }
    // Niets veranderd in dit tabblad: dan ook niets wegschrijven. Anders zet
    // een tabblad dat al uren openstaat bij het wegklikken zijn oude kopie
    // over die van een ander heen.
    if (!state || !vies) return;
    var binnen = false;
    try {
      var raw = global.localStorage.getItem(GD.STORAGE_KEY);
      if (raw) binnen = samenvoegen(JSON.parse(raw));
    } catch (e) {
      console.warn('Kon de opgeslagen versie niet lezen; die van dit tabblad gaat voor.', e);
    }
    try {
      global.localStorage.setItem(GD.STORAGE_KEY, JSON.stringify(state));
      vies = false;
    } catch (e) {
      console.error('Opslaan mislukt', e);
      alert('Opslaan mislukt: de opslag van je browser zit vol of staat uit.');
    }
    if (binnen) meldExtern();
  }

  function save() {
    rev++;
    vies = true;
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

  // Een ander tabblad schreef iets weg: meteen meenemen, dan werk je hier niet
  // verder op een verouderde kopie. Is het andere tabblad leeggemaakt, dan
  // blijft deze kopie gewoon staan.
  global.addEventListener('storage', function (e) {
    if (e.key !== GD.STORAGE_KEY || !e.newValue || !state) return;
    try {
      if (samenvoegen(JSON.parse(e.newValue))) meldExtern();
    } catch (err) {
      console.warn('Wijziging uit een ander tabblad onleesbaar', err);
    }
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

  /** Alles op dit apparaat leeg. De cloud en andere tabbladen raakt dit niet. */
  function reset() {
    rev++;
    vies = false;
    if (saveTimer) { clearTimeout(saveTimer); saveTimer = null; }
    state = emptyState();
    try { global.localStorage.removeItem(GD.STORAGE_KEY); } catch (e) { /* leeg */ }
  }

  function exportJSON() {
    return JSON.stringify(load(), null, 2);
  }

  /* Lijsten met een id (oefeningen, schema's) aanvullen met wat ontbreekt. */
  function aanvullenOpId(hier, daar) {
    var lijst = Array.isArray(hier) ? hier.slice() : [];
    var bekend = {};
    lijst.forEach(function (x) { if (x && x.id) bekend[x.id] = true; });
    var erbij = 0;
    (Array.isArray(daar) ? daar : []).forEach(function (x) {
      if (x && x.id && !bekend[x.id]) { lijst.push(clone(x)); bekend[x.id] = true; erbij++; }
    });
    return { lijst: lijst, erbij: erbij };
  }

  /**
   * Een back-up terugzetten, zonder dat er iets verloren kan gaan.
   * -> { teruggezet, alNieuwer }
   *
   * Per dag geldt: staat hier een nieuwere versie, dan blijft die staan. Ontbreekt
   * de dag of is hij gewist, dan komt hij terug uit de back-up — en krijgt hij
   * een tijdstip net na het wissen, zodat de wismarkering in de cloud hem bij de
   * volgende synchronisatie niet opnieuw weghaalt.
   *
   * Instellingen worden niet overschreven: die heb je sinds de back-up misschien
   * bewust veranderd. Alleen als dit apparaat nog niets heeft staan, komen ze uit
   * de back-up. Oefeningen en schema's die ontbreken komen er wel altijd bij,
   * anders hangen de sets die ernaar verwijzen los.
   */
  function importJSON(text) {
    var data = JSON.parse(text);
    if (!data || typeof data !== 'object' || !data.entries || typeof data.entries !== 'object') {
      throw new Error('Dit is geen back-up van het Goal Dashboard.');
    }
    var terug = migrate(data);
    var st = load();
    var uit = { teruggezet: 0, alNieuwer: 0 };

    Object.keys(terug.entries).forEach(function (d) {
      var e = terug.entries[d];
      if (!e || typeof e !== 'object') return;
      var ts = typeof e._ts === 'number' ? e._ts : 1;
      if (st.entries[d]) {
        if (tsIn(st, d) >= ts) { uit.alNieuwer++; return; }
      } else if (typeof st.tombstones[d] === 'number') {
        ts = Math.max(ts, st.tombstones[d] + 1);
      }
      var kopie = clone(e);
      kopie.date = d;
      kopie._ts = ts;
      st.entries[d] = kopie;
      delete st.tombstones[d];
      uit.teruggezet++;
    });

    if (!st.settingsTs) {
      st.settings = terug.settings;
      st.settingsTs = Math.max(terug.settingsTs || 0, 1);
    } else {
      var o = aanvullenOpId(st.settings.oefeningen, terug.settings.oefeningen);
      var s = aanvullenOpId(st.settings.schemas, terug.settings.schemas);
      if (o.erbij || s.erbij) {
        st.settings.oefeningen = o.lijst;
        st.settings.schemas = s.lijst;
        st.settingsTs = Date.now();
      }
    }

    save();
    changed();
    return uit;
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
    /* Er kwam iets binnen uit een ander tabblad. */
    onExtern: function (fn) { extern.push(fn); },
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
