/* Goal Dashboard - oefeningen, trainingsschema's en progressive overload
 *
 * Per training leg je van elke oefening één regel vast: je beste set. De app
 * zoekt daar de vorige keer bij die je diezelfde oefening deed - niet gisteren,
 * maar de laatste sessie waarin hij voorkomt - en bepaalt of je vooruit bent
 * gegaan. Daaruit volgt automatisch het doel "Progressive overload".
 *
 * Oefeningen kennen twee bijzonderheden:
 * - type 'reps': geen gewicht, alleen herhalingen (pull-ups, leg raises).
 * - perArm: rechts en links tellen apart, elk met een eigen vergelijking.
 */
(function (global) {
  'use strict';

  var GD = global.GD;
  var store = GD.store;

  function num(v) {
    if (v === null || v === undefined || v === '') return null;
    var n = typeof v === 'number' ? v : parseFloat(String(v).replace(',', '.'));
    return isFinite(n) ? n : null;
  }

  function nieuwId(prefix) {
    return prefix + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
  }

  /* ------------------------------ oefeningen ------------------------------ */

  function oefeningen() {
    var l = store.settings().oefeningen;
    return Array.isArray(l) ? l : [];
  }

  function schemas() {
    var l = store.settings().schemas;
    return Array.isArray(l) ? l : [];
  }

  function bewaarOefeningen(lijst) { store.setSetting('oefeningen', lijst); }
  function bewaarSchemas(lijst) { store.setSetting('schemas', lijst); }

  function byId(oid) {
    var l = oefeningen();
    for (var i = 0; i < l.length; i++) if (l[i].id === oid) return l[i];
    return null;
  }

  function schemaById(sid) {
    var l = schemas();
    for (var i = 0; i < l.length; i++) if (l[i].id === sid) return l[i];
    return null;
  }

  function naam(oid) {
    var o = byId(oid);
    return o ? o.naam : 'Verwijderde oefening';
  }

  function zoekOpNaam(tekst) {
    var n = String(tekst || '').trim().toLowerCase();
    if (!n) return null;
    var l = oefeningen();
    for (var i = 0; i < l.length; i++) {
      if (String(l[i].naam).trim().toLowerCase() === n) return l[i];
    }
    return null;
  }

  /** Maakt een oefening aan, of geeft de bestaande met dezelfde naam terug. */
  function addOefening(tekst, opties) {
    var n = String(tekst || '').trim();
    if (!n) return null;
    var bestaand = zoekOpNaam(n);
    if (bestaand) return bestaand.id;
    var o = {
      id: nieuwId('o'),
      naam: n,
      type: (opties && opties.type) === 'reps' ? 'reps' : 'gewicht',
      perArm: !!(opties && opties.perArm),
      startDatum: null
    };
    var lijst = oefeningen().slice();
    lijst.push(o);
    bewaarOefeningen(lijst);
    return o.id;
  }

  function updateOefening(oid, velden) {
    var lijst = oefeningen().map(function (o) {
      if (o.id !== oid) return o;
      var kopie = JSON.parse(JSON.stringify(o));
      Object.keys(velden).forEach(function (k) { kopie[k] = velden[k]; });
      return kopie;
    });
    bewaarOefeningen(lijst);
  }

  function deleteOefening(oid) {
    bewaarOefeningen(oefeningen().filter(function (o) { return o.id !== oid; }));
    bewaarSchemas(schemas().map(function (s) {
      var kopie = JSON.parse(JSON.stringify(s));
      kopie.oefeningen = (kopie.oefeningen || []).filter(function (id) { return id !== oid; });
      return kopie;
    }));
  }

  /** Vanaf vandaag opnieuw beginnen, bijvoorbeeld na een blessure of deload. */
  function resetStart(oid, datum) {
    updateOefening(oid, { startDatum: datum || GD.date.today() });
  }

  /* -------------------------------- schema's ------------------------------ */

  function addSchema(tekst) {
    var n = String(tekst || '').trim();
    if (!n) return null;
    var s = { id: nieuwId('s'), naam: n, oefeningen: [] };
    var lijst = schemas().slice();
    lijst.push(s);
    bewaarSchemas(lijst);
    return s.id;
  }

  function updateSchema(sid, velden) {
    bewaarSchemas(schemas().map(function (s) {
      if (s.id !== sid) return s;
      var kopie = JSON.parse(JSON.stringify(s));
      Object.keys(velden).forEach(function (k) { kopie[k] = velden[k]; });
      return kopie;
    }));
  }

  function deleteSchema(sid) {
    bewaarSchemas(schemas().filter(function (s) { return s.id !== sid; }));
  }

  function addToSchema(sid, oid) {
    var s = schemaById(sid);
    if (!s || !oid) return;
    var lijst = (s.oefeningen || []).slice();
    if (lijst.indexOf(oid) < 0) lijst.push(oid);
    updateSchema(sid, { oefeningen: lijst });
  }

  function removeFromSchema(sid, oid) {
    var s = schemaById(sid);
    if (!s) return;
    updateSchema(sid, {
      oefeningen: (s.oefeningen || []).filter(function (id) { return id !== oid; })
    });
  }

  function moveInSchema(sid, oid, richting) {
    var s = schemaById(sid);
    if (!s) return;
    var lijst = (s.oefeningen || []).slice();
    var i = lijst.indexOf(oid);
    var j = i + richting;
    if (i < 0 || j < 0 || j >= lijst.length) return;
    lijst[i] = lijst[j];
    lijst[j] = oid;
    updateSchema(sid, { oefeningen: lijst });
  }

  /* De schema's waar we mee beginnen; alles is daarna vrij aan te passen. */
  var STARTSCHEMAS = [
    {
      naam: 'Push',
      oefeningen: [
        { naam: 'Incline bench press' },
        { naam: 'Chestpress machine' },
        { naam: 'Lateral raise', perArm: true },
        { naam: 'Tricep overhead', perArm: true },
        { naam: 'Cable crunch' },
        { naam: 'Leg raises', type: 'reps' }
      ]
    },
    {
      naam: 'Pull',
      oefeningen: [
        { naam: 'Pullups', type: 'reps' },
        { naam: 'Seated barbel row' },
        { naam: 'Small lat pulldown' },
        { naam: 'Rows' },
        { naam: 'Bicep curls' },
        { naam: 'Hammer curls' }
      ]
    }
  ];

  function startschemasToevoegen() {
    var toegevoegd = 0;
    STARTSCHEMAS.forEach(function (sjabloon) {
      var sid = addSchema(sjabloon.naam);
      if (!sid) return;
      toegevoegd++;
      sjabloon.oefeningen.forEach(function (o) {
        addToSchema(sid, addOefening(o.naam, o));
      });
    });
    return toegevoegd;
  }

  /* ------------------------------ dagelijkse invoer ----------------------- */

  /** Rechts en links tellen apart; gewone oefeningen hebben één naamloze kant. */
  function zijden(oef) {
    if (oef && oef.perArm) {
      return [
        { key: 'r', label: 'Rechterarm', kort: 'R' },
        { key: 'l', label: 'Linkerarm', kort: 'L' }
      ];
    }
    return [{ key: '', label: '', kort: '' }];
  }

  function dagOefeningen(datum) {
    var e = store.entry(datum);
    var o = e && e.oefeningen;
    return o && typeof o === 'object' ? o : {};
  }

  function dagSchema(datum) {
    var e = store.entry(datum);
    return e && e.schema ? e.schema : null;
  }

  function setDagSchema(datum, sid) {
    store.setField(datum, 'schema', sid || null);
  }

  /**
   * Leest één kant uit. Zonder herhalingen is er niets te vergelijken; een leeg
   * gewicht telt als 0 kg, zodat pull-ups en leg raises gewoon werken.
   */
  function leesZijde(waarde, zijdeKey) {
    if (!waarde || typeof waarde !== 'object') return null;
    var v = zijdeKey ? waarde[zijdeKey] : waarde;
    if (!v || typeof v !== 'object') return null;
    var reps = num(v.reps);
    if (reps === null || reps <= 0) return null;
    var kg = num(v.kg);
    return { kg: kg === null ? 0 : kg, reps: reps };
  }

  /** Ruwe waarde van één invulveld, ook als de regel nog niet compleet is. */
  function ruweWaarde(datum, oid, zijdeKey, veld) {
    var w = dagOefeningen(datum)[oid];
    if (!w || typeof w !== 'object') return '';
    var v = zijdeKey ? w[zijdeKey] : w;
    if (!v || typeof v !== 'object') return '';
    return v[veld] === null || v[veld] === undefined ? '' : v[veld];
  }

  function isLeeg(v) {
    if (!v || typeof v !== 'object') return true;
    return !Object.keys(v).some(function (k) {
      var x = v[k];
      if (x && typeof x === 'object') return !isLeeg(x);
      return x !== null && x !== undefined && x !== '';
    });
  }

  function setVeld(datum, oid, zijdeKey, veld, waarde) {
    var huidig = dagOefeningen(datum);
    var alles = JSON.parse(JSON.stringify(huidig));
    var w = alles[oid] && typeof alles[oid] === 'object' ? alles[oid] : {};
    var doel = w;
    if (zijdeKey) {
      if (!w[zijdeKey] || typeof w[zijdeKey] !== 'object') w[zijdeKey] = {};
      doel = w[zijdeKey];
    }
    var n = num(waarde);
    if (n === null) delete doel[veld];
    else doel[veld] = n;
    if (zijdeKey && isLeeg(w[zijdeKey])) delete w[zijdeKey];
    if (isLeeg(w)) delete alles[oid];
    else alles[oid] = w;
    store.setField(datum, 'oefeningen', Object.keys(alles).length ? alles : null);
  }

  function wisOefening(datum, oid) {
    var alles = JSON.parse(JSON.stringify(dagOefeningen(datum)));
    delete alles[oid];
    store.setField(datum, 'oefeningen', Object.keys(alles).length ? alles : null);
  }

  /* -------------------------------- historie ------------------------------ */

  /* De hele historie in één keer op een rij, opnieuw opgebouwd zodra er iets
     verandert. Zonder dat zou elke dagscore de hele opslag doorlopen. */
  var cache = null;
  var cacheRev = -1;

  function index() {
    if (cache && cacheRev === store.rev()) return cache;
    var map = {};
    var entries = store.raw().entries;
    Object.keys(entries).sort().forEach(function (datum) {
      var o = entries[datum] && entries[datum].oefeningen;
      if (!o || typeof o !== 'object') return;
      Object.keys(o).forEach(function (oid) {
        var oef = byId(oid);
        zijden(oef).forEach(function (z) {
          var l = leesZijde(o[oid], z.key);
          if (!l) return;
          var sleutel = oid + '|' + z.key;
          (map[sleutel] = map[sleutel] || []).push({
            datum: datum, kg: l.kg, reps: l.reps
          });
        });
      });
    });
    cache = map;
    cacheRev = store.rev();
    return cache;
  }

  function historie(oid, zijdeKey) {
    return index()[oid + '|' + (zijdeKey || '')] || [];
  }

  /**
   * Startpunt en de laatste sessie vóór `datum`. Het startpunt is je eerste
   * ingevulde sessie, of de eerste na een handmatige herstart.
   */
  function context(datum, oid, zijdeKey) {
    var oef = byId(oid);
    var vanaf = oef && oef.startDatum ? oef.startDatum : null;
    var h = historie(oid, zijdeKey);
    var start = null, vorige = null, aantal = 0;
    for (var i = 0; i < h.length; i++) {
      var r = h[i];
      if (vanaf && r.datum < vanaf) continue;
      if (!start) start = r;
      aantal++;
      if (r.datum < datum) vorige = r;
    }
    return { start: start, vorige: vorige, aantal: aantal };
  }

  /**
   * Vooruit als gewicht én reps gelijk of hoger zijn, met minstens één hoger.
   * Gaat er één omhoog en de ander omlaag, dan beslist gewicht × reps.
   */
  function vergelijk(nu, vorige) {
    if (!nu || !vorige) return null;
    var dk = nu.kg - vorige.kg;
    var dr = nu.reps - vorige.reps;
    if (dk === 0 && dr === 0) return 'gelijk';
    if (dk >= 0 && dr >= 0) return 'vooruit';
    if (dk <= 0 && dr <= 0) return 'terug';
    var nuVolume = nu.kg * nu.reps;
    var oudVolume = vorige.kg * vorige.reps;
    if (nuVolume > oudVolume) return 'vooruit';
    if (nuVolume < oudVolume) return 'terug';
    return 'gelijk';
  }

  /**
   * Alles wat op één dag is ingevuld, met per regel het oordeel.
   * -> { regels[], vergeleken, vooruit, waarde }
   */
  function dagResultaat(datum) {
    var dag = dagOefeningen(datum);
    var regels = [];
    Object.keys(dag).forEach(function (oid) {
      var oef = byId(oid);
      zijden(oef).forEach(function (z) {
        var nu = leesZijde(dag[oid], z.key);
        if (!nu) return;
        var ctx = context(datum, oid, z.key);
        regels.push({
          id: oid,
          zijde: z,
          naam: naam(oid),
          nu: nu,
          start: ctx.start,
          vorige: ctx.vorige,
          status: ctx.vorige ? vergelijk(nu, ctx.vorige) : 'nieuw'
        });
      });
    });

    var vergeleken = 0, vooruit = 0;
    regels.forEach(function (r) {
      if (r.status === 'nieuw') return;
      vergeleken++;
      if (r.status === 'vooruit') vooruit++;
    });

    var waarde = null;
    if (vergeleken > 0) {
      waarde = vooruit === vergeleken ? 'ja' : (vooruit === 0 ? 'nee' : 'deels');
    } else if (regels.length) {
      // Alles voor het eerst: er valt nog niets te vergelijken.
      waarde = 'nieuw';
    }

    return { regels: regels, vergeleken: vergeleken, vooruit: vooruit, waarde: waarde };
  }

  /** Zoals de dag hem toont: eerst het gekozen schema, daarna de rest. */
  function dagRegels(datum) {
    var dag = dagOefeningen(datum);
    var sid = dagSchema(datum);
    var s = sid ? schemaById(sid) : null;
    var volgorde = s ? (s.oefeningen || []).slice() : [];
    Object.keys(dag).forEach(function (oid) {
      if (volgorde.indexOf(oid) < 0) volgorde.push(oid);
    });
    return volgorde.filter(function (oid) { return !!byId(oid); });
  }

  GD.lifts = {
    oefeningen: oefeningen,
    schemas: schemas,
    byId: byId,
    schemaById: schemaById,
    naam: naam,
    zoekOpNaam: zoekOpNaam,
    addOefening: addOefening,
    updateOefening: updateOefening,
    deleteOefening: deleteOefening,
    resetStart: resetStart,
    addSchema: addSchema,
    updateSchema: updateSchema,
    deleteSchema: deleteSchema,
    addToSchema: addToSchema,
    removeFromSchema: removeFromSchema,
    moveInSchema: moveInSchema,
    startschemasToevoegen: startschemasToevoegen,
    zijden: zijden,
    dagOefeningen: dagOefeningen,
    dagSchema: dagSchema,
    setDagSchema: setDagSchema,
    ruweWaarde: ruweWaarde,
    setVeld: setVeld,
    wisOefening: wisOefening,
    historie: historie,
    context: context,
    vergelijk: vergelijk,
    dagResultaat: dagResultaat,
    dagRegels: dagRegels
  };
})(window);
