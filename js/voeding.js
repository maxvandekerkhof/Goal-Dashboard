/* Goal Dashboard - calorieën en eiwitten uit Apple Health
 *
 * MyFitnessPal (of Lifesum, Cronometer, …) schrijft je voeding naar Apple
 * Health. Een Shortcut op je telefoon leest daar de dagtotalen uit en zet ze in
 * de tabel `voeding` van je eigen Supabase-project. Dit bestand haalt die
 * waarden naar je dagen toe.
 *
 * Waarom een aparte tabel en niet gewoon in `dagen`? Omdat synchroniseren een
 * dagrij in zijn geheel vervangt: een koppeling die alleen calorieën kent zou
 * dan je water, je vinkjes en je oefeningen van die dag wissen.
 *
 * Wie zelf een getal intikt, wint. Dat onthouden we per veld in `kcalBron` en
 * `eiwitGramBron`, zodat de volgende synchronisatie je eigen invoer niet
 * terugdraait.
 */
(function (global) {
  'use strict';

  var GD = global.GD;
  var store = GD.store;

  var VELDEN = [
    { veld: 'kcal', bronVeld: 'kcalBron', kolom: 'kcal', label: 'Calorieën', eenheid: 'kcal' },
    { veld: 'eiwitGram', bronVeld: 'eiwitGramBron', kolom: 'eiwit', label: 'Eiwitten', eenheid: 'g' }
  ];

  function veldInfo(veld) {
    for (var i = 0; i < VELDEN.length; i++) if (VELDEN[i].veld === veld) return VELDEN[i];
    return null;
  }

  function getal(v) {
    var n = GD.score.num(v);
    return n === null ? null : Math.round(n);
  }

  /** Wat Health voor deze dag doorgaf, of null. */
  function health(datum, veld) {
    var rij = store.voeding(datum);
    var info = veldInfo(veld);
    if (!rij || !info) return null;
    return getal(rij[info.kolom]);
  }

  /**
   * Alles wat binnenkwam toepassen op je dagen.
   * -> aantal gewijzigde velden
   */
  function toepassen() {
    if (!store.settings().voedingSync) return 0;
    var alles = store.alleVoeding();
    var gewijzigd = 0;

    Object.keys(alles).forEach(function (datum) {
      VELDEN.forEach(function (info) {
        var waarde = getal(alles[datum][info.kolom]);
        if (waarde === null) return;

        var e = store.entry(datum) || {};
        var bron = e[info.bronVeld];
        if (bron === 'hand') return;              // jij hebt hier zelf iets van gevonden

        var huidig = getal(e[info.veld]);
        if (huidig !== null && bron !== 'health') return; // stond er al vóór de koppeling
        if (huidig === waarde && bron === 'health') return;

        store.setField(datum, info.veld, waarde);
        store.setField(datum, info.bronVeld, 'health');
        gewijzigd++;
      });
    });
    return gewijzigd;
  }

  /**
   * Waar komt de waarde van dit veld vandaan, en wijkt Health daarvan af?
   * -> { aan, health, bron, waarde, afwijkend }
   */
  function status(datum, veld) {
    var info = veldInfo(veld);
    var aan = !!store.settings().voedingSync;
    var e = store.entry(datum) || {};
    var uitHealth = aan ? health(datum, veld) : null;
    var waarde = info ? getal(e[info.veld]) : null;
    return {
      aan: aan,
      health: uitHealth,
      bron: info ? (e[info.bronVeld] || null) : null,
      waarde: waarde,
      afwijkend: uitHealth !== null && waarde !== uitHealth
    };
  }

  /** De waarde uit Health alsnog overnemen voor deze dag. */
  function overnemen(datum, veld) {
    var info = veldInfo(veld);
    var waarde = health(datum, veld);
    if (!info || waarde === null) return false;
    store.setField(datum, info.veld, waarde);
    store.setField(datum, info.bronVeld, 'health');
    return true;
  }

  /** Zelf ingetikt: vanaf nu blijft Health van dit veld af. */
  function handmatig(datum, veld) {
    var info = veldInfo(veld);
    if (info) store.setField(datum, info.bronVeld, 'hand');
  }

  /** Voor het instellingenscherm: hoeveel dagen en hoe recent. */
  function overzicht() {
    var alles = store.alleVoeding();
    var datums = Object.keys(alles).sort();
    var laatst = 0;
    datums.forEach(function (d) {
      var t = Date.parse(alles[d].bijgewerkt);
      if (isFinite(t) && t > laatst) laatst = t;
    });
    return {
      dagen: datums.length,
      eerste: datums.length ? datums[0] : null,
      laatste: datums.length ? datums[datums.length - 1] : null,
      bijgewerkt: laatst
    };
  }

  GD.voeding = {
    VELDEN: VELDEN,
    health: health,
    toepassen: toepassen,
    status: status,
    overnemen: overnemen,
    handmatig: handmatig,
    overzicht: overzicht
  };
})(window);
