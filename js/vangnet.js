/* Goal Dashboard - vangnet: automatische kopieën van al je gegevens
 *
 * Elke dag bij het openen, en vlak voor wissen of terugzetten, legt de app een
 * volledige kopie weg. Gaat er ooit toch iets mis — een fout in de app, een
 * synchronisatie die iets overschrijft, een verkeerde knop — dan haal je de dag
 * van gisteren gewoon terug.
 *
 * De kopieën staan in IndexedDB en niet naast je gegevens in localStorage. Die
 * laatste is klein (een paar MB per site), en veertien kopieën ernaast zouden
 * hem na een paar jaar vol laten lopen — waarna juist het opslaan van je echte
 * gegevens mislukt. IndexedDB is een aparte, veel ruimere opslag. Lukt het daar
 * niet, dan merkt de rest van de app daar niets van.
 *
 * Dit is een vangnet op dit apparaat. Tegen een kwijtgeraakte telefoon helpt
 * het niet; daarvoor zijn de cloud en de back-ups die je downloadt.
 */
(function (global) {
  'use strict';

  var GD = global.GD;
  var store = GD.store;
  var D = GD.date;

  var DB_NAAM = 'goaldash-vangnet';
  var BAK = 'kopieen';
  var DAGELIJKS_HOUDEN = 14;
  var OVERIG_HOUDEN = 5;

  var dbBelofte = null;

  function db() {
    if (dbBelofte) return dbBelofte;
    dbBelofte = new Promise(function (klaar, mis) {
      if (!global.indexedDB) { mis(new Error('Deze browser heeft geen IndexedDB.')); return; }
      var verzoek = global.indexedDB.open(DB_NAAM, 1);
      verzoek.onupgradeneeded = function () {
        verzoek.result.createObjectStore(BAK, { keyPath: 'id' });
      };
      verzoek.onsuccess = function () { klaar(verzoek.result); };
      verzoek.onerror = function () { mis(verzoek.error); };
    });
    // Mislukt het openen, dan de volgende keer opnieuw proberen.
    dbBelofte.catch(function () { dbBelofte = null; });
    return dbBelofte;
  }

  function transactie(modus, werk) {
    return db().then(function (d) {
      return new Promise(function (klaar, mis) {
        var tx = d.transaction(BAK, modus);
        var uit = werk(tx.objectStore(BAK));
        tx.oncomplete = function () { klaar(uit && 'result' in uit ? uit.result : undefined); };
        tx.onerror = function () { mis(tx.error); };
        tx.onabort = function () { mis(tx.error || new Error('Afgebroken')); };
      });
    });
  }

  /** Alle kopieën, nieuwste eerst, met hun gegevens. */
  function alles() {
    return transactie('readonly', function (bak) { return bak.getAll(); }).then(function (l) {
      return (l || []).sort(function (a, b) { return b.tijd - a.tijd; });
    });
  }

  /**
   * Een kopie maken van hoe alles er nú voor staat.
   * soort: 'dag' | 'voor-wissen' | 'voor-terugzetten'
   *
   * De gegevens worden meteen vastgelegd, vóór er ook maar iets gewacht wordt:
   * wat er daarna gebeurt (een synchronisatie, het wissen zelf) zit er dus niet
   * in.
   */
  function maak(soort) {
    return bewaar(soort, momentopname());
  }

  function momentopname() {
    return { tekst: store.exportJSON(), dagen: store.allDates().length, datum: D.today() };
  }

  function bewaar(soort, m) {
    var kopie = {
      id: Date.now() + '-' + soort,
      soort: soort,
      tijd: Date.now(),
      datum: m.datum,
      dagen: m.dagen,
      gegevens: m.tekst
    };
    return transactie('readwrite', function (bak) { bak.put(kopie); })
      .then(opruimen)
      .then(function () { return kopie; });
  }

  /* Veertien dagelijkse en vijf andere houden; de oudste gaan eruit. */
  function opruimen() {
    return alles().then(function (lijst) {
      var weg = [];
      var dag = 0, overig = 0;
      lijst.forEach(function (k) {
        if (k.soort === 'dag') { if (++dag > DAGELIJKS_HOUDEN) weg.push(k.id); }
        else if (++overig > OVERIG_HOUDEN) weg.push(k.id);
      });
      if (!weg.length) return;
      return transactie('readwrite', function (bak) {
        weg.forEach(function (id) { bak.delete(id); });
      });
    });
  }

  /** De kopie van vandaag, als die er nog niet is. Stil als het niet lukt. */
  function dagelijks() {
    // Een lege app hoeft niet bewaard te worden, en zou anders op een nieuw
    // apparaat de rij met echte kopieën opschuiven.
    if (!store.allDates().length) return Promise.resolve(null);
    var m = momentopname();
    return alles().then(function (lijst) {
      var al = lijst.some(function (k) { return k.soort === 'dag' && k.datum === m.datum; });
      return al ? null : bewaar('dag', m);
    }).catch(function (e) {
      console.warn('Automatische kopie mislukt', e);
      return null;
    });
  }

  /** Lijst voor het instellingenscherm, zonder de gegevens zelf. */
  function lijst() {
    return alles().then(function (l) {
      return l.map(function (k) {
        return { id: k.id, soort: k.soort, tijd: k.tijd, datum: k.datum, dagen: k.dagen };
      });
    });
  }

  function haal(id) {
    return transactie('readonly', function (bak) { return bak.get(id); }).then(function (k) {
      if (!k) throw new Error('Deze kopie bestaat niet meer.');
      return k;
    });
  }

  /* ------------------------------ back-ups ------------------------------ */

  /* Wanneer je op dít apparaat voor het laatst een back-up downloadde. Hoort
     niet in je gegevens: het zegt iets over dit apparaat, niet over jou. */
  var BACKUP_KEY = 'goaldash.backup';
  var HERINNER_NA = 14;   // dagen

  function laatsteBackup() {
    try {
      var p = JSON.parse(global.localStorage.getItem(BACKUP_KEY) || 'null');
      return p && typeof p.tijd === 'number' ? p.tijd : null;
    } catch (e) {
      return null;
    }
  }

  function backupGemaakt() {
    try {
      global.localStorage.setItem(BACKUP_KEY, JSON.stringify({ tijd: Date.now() }));
    } catch (e) { /* niet erg: dan herinnert de app je gewoon wat vaker */ }
  }

  /** Dagen sinds je laatste back-up, of null als je er hier nog nooit een maakte. */
  function dagenSindsBackup() {
    var t = laatsteBackup();
    if (t === null) return null;
    return Math.floor((Date.now() - t) / 86400000);
  }

  /** Hoort de app je aan een back-up te herinneren? */
  function herinneren() {
    // Een app met een paar dagen erin is nog niets om kwijt te raken.
    if (store.allDates().length < 7) return false;
    var n = dagenSindsBackup();
    return n === null || n >= HERINNER_NA;
  }

  GD.vangnet = {
    maak: maak,
    dagelijks: dagelijks,
    lijst: lijst,
    haal: haal,
    laatsteBackup: laatsteBackup,
    backupGemaakt: backupGemaakt,
    dagenSindsBackup: dagenSindsBackup,
    herinneren: herinneren,
    HERINNER_NA: HERINNER_NA,
    DAGELIJKS_HOUDEN: DAGELIJKS_HOUDEN
  };
})(window);
