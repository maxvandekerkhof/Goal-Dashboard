/* Goal Dashboard - synchronisatie via Supabase
 *
 * Opzet:
 * - localStorage blijft de bron waar de app mee werkt, dus offline invullen
 *   blijft gewoon werken. De cloud is een kopie die we bij elkaar brengen.
 * - Per dag geldt: de laatste wijziging wint. Elke dag draagt een tijdstempel,
 *   ook gewiste dagen (die onthouden we, anders komen ze terug).
 * - Inloggen gaat met een code per e-mail; er is geen wachtwoord.
 *
 * Er wordt geen SDK geladen: alles gaat rechtstreeks via de REST-API van
 * Supabase, zodat het project zonder build-stap blijft werken.
 */
(function (global) {
  'use strict';

  var GD = global.GD;
  var store = GD.store;

  var CONFIG_KEY = 'goaldash.sync';

  var cfg = null;
  var bezig = false;
  var pushTimer = null;
  var listeners = [];
  var appliedListeners = [];

  /* ----------------------------- instellingen ----------------------------- */

  function config() {
    if (cfg) return cfg;
    cfg = { url: '', anonKey: '', session: null, laatst: null, fout: '' };
    try {
      var raw = global.localStorage.getItem(CONFIG_KEY);
      if (raw) {
        var p = JSON.parse(raw);
        ['url', 'anonKey', 'session', 'laatst', 'fout'].forEach(function (k) {
          if (p[k] !== undefined) cfg[k] = p[k];
        });
      }
    } catch (e) {
      console.warn('Synchronisatie-instellingen onleesbaar', e);
    }
    return cfg;
  }

  function saveConfig() {
    try {
      global.localStorage.setItem(CONFIG_KEY, JSON.stringify(config()));
    } catch (e) {
      console.error('Kon synchronisatie-instellingen niet opslaan', e);
    }
    listeners.forEach(function (fn) { fn(); });
  }

  /**
   * Supabase toont op de Data API-pagina een "API URL" mét /rest/v1/ erachter,
   * terwijl wij de kale project-URL nodig hebben. Die staarten halen we er zelf
   * af, zodat het niet uitmaakt wat je plakt.
   */
  function normaliseerUrl(url) {
    var s = String(url || '').trim();
    if (!s) return '';
    if (!/^https?:\/\//i.test(s)) s = 'https://' + s;
    s = s.replace(/\/+$/, '');
    s = s.replace(/\/(rest|auth|realtime|storage|functions)\/v\d+$/i, '');
    return s.replace(/\/+$/, '');
  }

  function setConfig(url, anonKey) {
    var c = config();
    c.url = normaliseerUrl(url);
    c.anonKey = String(anonKey || '').trim();
    c.fout = '';
    saveConfig();
  }

  function isConfigured() {
    var c = config();
    return !!(c.url && c.anonKey);
  }

  function signedIn() {
    var c = config();
    return !!(c.session && c.session.access_token);
  }

  function email() {
    var c = config();
    return c.session && c.session.email ? c.session.email : '';
  }

  function onChange(fn) { listeners.push(fn); }

  /* -------------------------------- helpers ------------------------------- */

  function apiHeaders(withAuth) {
    var c = config();
    var h = {
      'apikey': c.anonKey,
      'Content-Type': 'application/json'
    };
    if (withAuth && c.session) h['Authorization'] = 'Bearer ' + c.session.access_token;
    return h;
  }

  /* Meldingen van Supabase komen in het Engels binnen; de bekende gevallen
     geven we in gewone taal terug. */
  var VERTALINGEN = [
    [/token has expired|invalid.*token|otp.*expired/i,
      'Die code klopt niet of is verlopen. Vraag een nieuwe aan.'],
    [/rate limit|too many requests/i,
      'Te veel pogingen achter elkaar. Wacht een minuut en probeer het opnieuw.'],
    [/invalid api key|no api key/i,
      'De anon key klopt niet. Kopieer hem opnieuw uit Project Settings → API.'],
    [/jwt|not authenticated|unauthorized/i,
      'Je sessie is verlopen. Log opnieuw in.'],
    [/relation .* does not exist|could not find the table/i,
      'De tabellen bestaan nog niet. Draai eerst het SQL-blok in de Supabase SQL Editor.'],
    [/row-level security|permission denied/i,
      'Geen toegang tot je rijen. Controleer of het SQL-blok volledig is uitgevoerd.'],
    [/signups not allowed|email.*not authorized/i,
      'Dit e-mailadres mag niet inloggen. Zet in Supabase onder Authentication de e-mailaanmelding aan.']
  ];

  function vertaal(tekst) {
    for (var i = 0; i < VERTALINGEN.length; i++) {
      if (VERTALINGEN[i][0].test(tekst)) return VERTALINGEN[i][1];
    }
    return tekst;
  }

  /** fetch die netwerkproblemen in begrijpelijke taal teruggeeft. */
  async function haal(url, opties) {
    try {
      return await fetch(url, opties);
    } catch (e) {
      throw new Error('Geen verbinding met de server. Controleer je internet en de project-URL.');
    }
  }

  async function leesFout(res, standaard) {
    var tekst = '';
    try {
      var body = await res.json();
      tekst = body.msg || body.message || body.error_description || body.error || body.hint || '';
    } catch (e) { /* geen json */ }
    if (tekst) return vertaal(tekst);
    if (res.status === 401 || res.status === 403) {
      return 'Geen toegang. Controleer je anon key en of je nog ingelogd bent.';
    }
    if (res.status === 404) {
      return 'Niet gevonden. Klopt de project-URL, en heb je het SQL-blok gedraaid?';
    }
    return standaard + ' (' + res.status + ')';
  }

  /* ------------------------------- inloggen ------------------------------- */

  /** Vraagt een inlogcode aan; Supabase mailt een code én een link. */
  async function sendCode(adres) {
    var c = config();
    var res = await haal(c.url + '/auth/v1/otp', {
      method: 'POST',
      headers: apiHeaders(false),
      body: JSON.stringify({
        email: adres,
        create_user: true,
        options: { email_redirect_to: global.location.href.split('#')[0] }
      })
    });
    if (!res.ok) throw new Error(await leesFout(res, 'Versturen van de code mislukt'));
    return true;
  }

  /** Wisselt de code uit de e-mail in voor een sessie. */
  async function verifyCode(adres, code) {
    var c = config();
    var res = await haal(c.url + '/auth/v1/verify', {
      method: 'POST',
      headers: apiHeaders(false),
      body: JSON.stringify({ email: adres, token: String(code).trim(), type: 'email' })
    });
    if (!res.ok) throw new Error(await leesFout(res, 'Code klopt niet of is verlopen'));
    var data = await res.json();
    bewaarSessie(data);
    return true;
  }

  function bewaarSessie(data) {
    var c = config();
    c.session = {
      access_token: data.access_token,
      refresh_token: data.refresh_token,
      user_id: data.user ? data.user.id : (c.session && c.session.user_id),
      email: data.user ? data.user.email : (c.session && c.session.email),
      verloopt: Date.now() + ((data.expires_in || 3600) * 1000)
    };
    c.fout = '';
    saveConfig();
  }

  async function ververs() {
    var c = config();
    if (!c.session || !c.session.refresh_token) throw new Error('Niet ingelogd');
    var res = await haal(c.url + '/auth/v1/token?grant_type=refresh_token', {
      method: 'POST',
      headers: apiHeaders(false),
      body: JSON.stringify({ refresh_token: c.session.refresh_token })
    });
    if (!res.ok) {
      c.session = null;
      saveConfig();
      throw new Error('Je sessie is verlopen, log opnieuw in.');
    }
    bewaarSessie(await res.json());
  }

  function signOut() {
    var c = config();
    c.session = null;
    c.laatst = null;
    c.fout = '';
    saveConfig();
  }

  /**
   * Als je op de link in de e-mail klikt, komen de tokens terug in de URL.
   * Die halen we eruit en poetsen we meteen weg uit de adresbalk.
   */
  function handleRedirect() {
    var hash = global.location.hash || '';
    if (hash.indexOf('access_token=') < 0) return false;
    var p = new URLSearchParams(hash.replace(/^#/, ''));
    var token = p.get('access_token');
    if (!token) return false;
    bewaarSessie({
      access_token: token,
      refresh_token: p.get('refresh_token'),
      expires_in: parseInt(p.get('expires_in') || '3600', 10),
      user: null
    });
    try {
      global.history.replaceState(null, '', global.location.pathname + global.location.search);
    } catch (e) {
      global.location.hash = '';
    }
    haalGebruiker();
    return true;
  }

  /** Vult e-mailadres en gebruikers-id aan na inloggen via de link. */
  async function haalGebruiker() {
    var c = config();
    try {
      var res = await haal(c.url + '/auth/v1/user', { headers: apiHeaders(true) });
      if (!res.ok) return;
      var u = await res.json();
      c.session.user_id = u.id;
      c.session.email = u.email;
      saveConfig();
    } catch (e) { /* niet kritiek */ }
  }

  /* ------------------------------ gegevens ------------------------------- */

  async function rest(pad, opties) {
    var c = config();
    opties = opties || {};
    if (c.session && c.session.verloopt && Date.now() > c.session.verloopt - 60000) {
      await ververs();
    }
    var res = await haal(c.url + '/rest/v1/' + pad, {
      method: opties.method || 'GET',
      headers: Object.assign(apiHeaders(true), opties.headers || {}),
      body: opties.body
    });
    if (res.status === 401) {
      await ververs();
      res = await haal(c.url + '/rest/v1/' + pad, {
        method: opties.method || 'GET',
        headers: Object.assign(apiHeaders(true), opties.headers || {}),
        body: opties.body
      });
    }
    if (!res.ok) throw new Error(await leesFout(res, 'Server gaf een fout'));
    return res;
  }

  function tijd(waarde) {
    if (!waarde) return 0;
    var n = typeof waarde === 'number' ? waarde : Date.parse(waarde);
    return isFinite(n) ? n : 0;
  }

  /**
   * Haalt de cloud op, past nieuwere dagen lokaal toe en stuurt de dagen
   * terug die hier recenter zijn. Per dag wint de laatste wijziging.
   */
  async function syncNow() {
    if (!isConfigured()) throw new Error('Vul eerst je project-URL en sleutel in.');
    if (!signedIn()) throw new Error('Log eerst in met je e-mailadres.');
    if (bezig) return null;
    bezig = true;
    listeners.forEach(function (fn) { fn(); });

    try {
      var c = config();
      var st = store.raw();
      var uid = c.session.user_id;

      var res = await rest('dagen?select=datum,data,verwijderd,bijgewerkt');
      var extern = await res.json();

      var externOp = {};
      var opgehaald = 0;
      extern.forEach(function (rij) {
        externOp[rij.datum] = rij;
        var lokaalTs = store.entryTs(rij.datum);
        var externTs = tijd(rij.bijgewerkt);
        if (externTs > lokaalTs) {
          if (rij.verwijderd) store.removeEntry(rij.datum, externTs);
          else store.putEntry(rij.datum, rij.data || {}, externTs);
          opgehaald++;
        }
      });

      // Alles wat hier nieuwer is dan in de cloud gaat de andere kant op.
      var teSturen = [];
      Object.keys(st.entries).forEach(function (datum) {
        var lokaalTs = store.entryTs(datum);
        var rij = externOp[datum];
        if (!rij || lokaalTs > tijd(rij.bijgewerkt)) {
          var kopie = JSON.parse(JSON.stringify(st.entries[datum]));
          delete kopie._ts;
          teSturen.push({
            user_id: uid,
            datum: datum,
            data: kopie,
            verwijderd: false,
            bijgewerkt: new Date(lokaalTs).toISOString()
          });
        }
      });
      Object.keys(st.tombstones).forEach(function (datum) {
        var lokaalTs = st.tombstones[datum];
        var rij = externOp[datum];
        if (!rij || lokaalTs > tijd(rij.bijgewerkt)) {
          teSturen.push({
            user_id: uid,
            datum: datum,
            data: null,
            verwijderd: true,
            bijgewerkt: new Date(lokaalTs).toISOString()
          });
        }
      });

      if (teSturen.length) {
        await rest('dagen', {
          method: 'POST',
          headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
          body: JSON.stringify(teSturen)
        });
      }

      var instellingen = await syncInstellingen(uid);

      if (opgehaald || instellingen === 'opgehaald') {
        appliedListeners.forEach(function (fn) {
          try { fn(); } catch (e) { console.error(e); }
        });
      }

      c.laatst = Date.now();
      c.fout = '';
      store.writeNow();
      saveConfig();
      return {
        opgehaald: opgehaald,
        verstuurd: teSturen.length,
        instellingen: instellingen
      };
    } catch (e) {
      config().fout = e.message || String(e);
      saveConfig();
      throw e;
    } finally {
      bezig = false;
      listeners.forEach(function (fn) { fn(); });
    }
  }

  /** Instellingen zijn één geheel: de nieuwste versie wint. */
  async function syncInstellingen(uid) {
    var st = store.raw();
    var res = await rest('instellingen?select=data,bijgewerkt');
    var rijen = await res.json();
    var extern = rijen[0];
    var externTs = extern ? tijd(extern.bijgewerkt) : 0;
    var lokaalTs = st.settingsTs || 0;

    if (externTs > lokaalTs) {
      store.putSettings(extern.data || {}, externTs);
      return 'opgehaald';
    }
    if (lokaalTs > externTs) {
      await rest('instellingen', {
        method: 'POST',
        headers: { 'Prefer': 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify([{
          user_id: uid,
          data: st.settings,
          bijgewerkt: new Date(lokaalTs).toISOString()
        }])
      });
      return 'verstuurd';
    }
    return 'gelijk';
  }

  /* ------------------------------ automatisch ----------------------------- */

  /** Na een wijziging even wachten en dan wegschrijven, niet bij elke tik. */
  function planPush() {
    if (!isConfigured() || !signedIn()) return;
    if (pushTimer) clearTimeout(pushTimer);
    pushTimer = setTimeout(function () {
      syncNow().catch(function (e) { console.warn('Automatisch synchroniseren mislukt:', e.message); });
    }, 4000);
  }

  function status() {
    var c = config();
    return {
      geconfigureerd: isConfigured(),
      ingelogd: signedIn(),
      email: email(),
      laatst: c.laatst,
      fout: c.fout,
      bezig: bezig
    };
  }

  function init() {
    handleRedirect();
    store.onChange(planPush);
    if (isConfigured() && signedIn()) {
      syncNow().catch(function (e) { console.warn('Synchroniseren bij opstarten mislukt:', e.message); });
      global.document.addEventListener('visibilitychange', function () {
        if (global.document.visibilityState === 'visible') {
          syncNow().catch(function () { /* stil */ });
        }
      });
    }
  }

  GD.sync = {
    config: config,
    setConfig: setConfig,
    isConfigured: isConfigured,
    signedIn: signedIn,
    email: email,
    sendCode: sendCode,
    verifyCode: verifyCode,
    signOut: signOut,
    syncNow: syncNow,
    handleRedirect: handleRedirect,
    status: status,
    onChange: onChange,
    onApplied: function (fn) { appliedListeners.push(fn); },
    init: init
  };
})(window);
