/* Goal Dashboard - herinnering per e-mail
 *
 * De app kan zelf geen mail sturen: hij draait alleen in je browser, en die
 * staat 's ochtends dicht. Het kijken en versturen doet een functie in je
 * eigen Supabase-project (supabase/functions/dagcheck). Dit bestand gaat
 * alleen over de knoppen: aan of uit, hoe laat, en naar welk adres.
 *
 * Die voorkeuren staan in de tabel `herinneringen`, achter dezelfde
 * beveiliging als je dagen: alleen jouw ingelogde account ziet jouw rij.
 */
(function (global) {
  'use strict';

  var GD = global.GD;

  var VELDEN = 'aan,uur,naar,laatst_verstuurd';

  /* Wat we het laatst uit de cloud haalden. null = nog niet gekeken. */
  var cache = null;
  var fout = '';

  function uid() {
    var c = GD.sync.config();
    return c.session && c.session.user_id ? c.session.user_id : '';
  }

  /** Zonder synchronisatie is er niets om een herinnering aan op te hangen. */
  function beschikbaar() {
    return GD.sync.isConfigured() && GD.sync.signedIn() && !!uid();
  }

  function standaard() {
    return { aan: false, uur: 9, naar: GD.sync.email() || '', laatst: null };
  }

  function huidig() { return cache; }
  function laatsteFout() { return fout; }

  function vergeet() {
    cache = null;
    fout = '';
  }

  /** Haalt je rij op; bestaat die nog niet, dan krijg je de standaardwaarden. */
  async function laad() {
    if (!beschikbaar()) {
      vergeet();
      return null;
    }
    try {
      var res = await GD.sync.rest('herinneringen?select=' + VELDEN + '&user_id=eq.' +
        encodeURIComponent(uid()));
      var rijen = await res.json();
      var r = rijen && rijen[0];
      cache = r
        ? {
          aan: !!r.aan,
          uur: typeof r.uur === 'number' ? r.uur : 9,
          naar: r.naar || GD.sync.email() || '',
          laatst: r.laatst_verstuurd || null
        }
        : standaard();
      fout = '';
    } catch (e) {
      cache = null;
      fout = e.message;
    }
    return cache;
  }

  function geldigAdres(adres) {
    return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(String(adres || '').trim());
  }

  async function bewaar(waarden) {
    if (!beschikbaar()) throw new Error('Log eerst in bij Synchroniseren.');
    var uur = Math.round(Number(waarden.uur));
    if (!isFinite(uur) || uur < 0 || uur > 23) {
      throw new Error('Kies een tijdstip tussen 0 en 23 uur.');
    }
    var adres = String(waarden.naar || '').trim();
    if (waarden.aan && !geldigAdres(adres)) {
      throw new Error('Vul het e-mailadres in waar de herinnering heen mag.');
    }

    await GD.sync.rest('herinneringen', {
      method: 'POST',
      headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
      body: JSON.stringify([{
        user_id: uid(),
        aan: !!waarden.aan,
        uur: uur,
        naar: adres || null,
        bijgewerkt: new Date().toISOString()
      }])
    });

    cache = {
      aan: !!waarden.aan,
      uur: uur,
      naar: adres,
      laatst: cache ? cache.laatst : null
    };
    fout = '';
    return cache;
  }

  /**
   * Stuurt nu een mail, ook als er niets openstaat. Zo weet je meteen of de
   * hele keten werkt in plaats van dat je een dag moet wachten.
   */
  async function test() {
    if (!beschikbaar()) throw new Error('Log eerst in bij Synchroniseren.');
    var uitkomst = await GD.sync.functie('dagcheck', { test: true });
    if (uitkomst && uitkomst.fout) throw new Error(uitkomst.fout);
    if (uitkomst && !uitkomst.verstuurd) {
      throw new Error(uitkomst.reden === 'geen adres'
        ? 'Er staat nog geen e-mailadres bij je herinnering.'
        : 'Er ging niets uit: ' + (uitkomst.reden || 'onbekende reden') + '.');
    }
    return uitkomst;
  }

  GD.herinnering = {
    beschikbaar: beschikbaar,
    huidig: huidig,
    laatsteFout: laatsteFout,
    standaard: standaard,
    laad: laad,
    bewaar: bewaar,
    test: test,
    vergeet: vergeet
  };
})(window);
