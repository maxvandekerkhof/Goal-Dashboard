/* Goal Dashboard - rusttimer tussen sets
 *
 * Eén timer tegelijk: je tikt bij een oefening op de klok en hij telt de
 * rusttijd van díe oefening af, of je standaardtijd als de oefening er geen
 * eigen heeft. Onderin staat een balk met de tijd die nog over is, en knoppen
 * om er vijftien seconden af of bij te doen.
 *
 * De timer rekent vanaf een eindtijd, niet met een tellertje. Zet je telefoon
 * de app in de achtergrond stil, dan klopt de tijd nog steeds zodra je
 * terugkomt. Een piepje kan alleen als de app open staat; daarom houdt de
 * timer zolang hij loopt je scherm aan, waar de browser dat toestaat.
 *
 * Hij hoort bij dit apparaat en niet bij je gegevens: hij synchroniseert niet
 * en zit niet in je back-up. Wel overleeft hij een herlaadbeurt.
 */
(function (global) {
  'use strict';

  var GD = global.GD;
  var KEY = 'goaldash.rust';
  var STAP = 15;              // seconden per tik op −15 / +15
  var MAX = 900;              // nooit meer dan een kwartier rust over
  var KLAAR_ZICHTBAAR = 60;   // zo lang blijft "rust voorbij" staan
  var PIEP_MARGE = 3;         // later dan dit na het eind is een piepje zinloos

  /* De keuzes bij Instellingen: van een halve minuut tot vijf minuten. */
  var KEUZES = [30, 45, 60, 75, 90, 105, 120, 150, 180, 210, 240, 300];

  function tijd(sec) {
    sec = Math.max(0, Math.ceil(sec));
    var s = sec % 60;
    return Math.floor(sec / 60) + ':' + (s < 10 ? '0' : '') + s;
  }

  function standaard() {
    var n = +GD.store.settings().rustStandaard;
    return n > 0 ? n : 120;
  }

  /** De eigen rusttijd van een oefening, of null. */
  function eigen(oid) {
    var o = GD.lifts.byId(oid);
    var n = o ? +o.rust : 0;
    return n > 0 ? n : null;
  }

  /** De rusttijd die geldt voor een oefening, in seconden. */
  function voor(oid) {
    return eigen(oid) || standaard();
  }

  /* ------------------------------ toestand ------------------------------ */

  var stand = null;   // { oef, naam, duur, eind, gemeld }

  function lees() {
    try {
      var r = JSON.parse(global.localStorage.getItem(KEY));
      if (r && typeof r.eind === 'number' && typeof r.duur === 'number') return r;
    } catch (e) { /* geen timer */ }
    return null;
  }

  function bewaar() {
    try {
      if (stand) global.localStorage.setItem(KEY, JSON.stringify(stand));
      else global.localStorage.removeItem(KEY);
    } catch (e) { /* dan alleen in dit tabblad */ }
  }

  function over() { return stand ? (stand.eind - Date.now()) / 1000 : 0; }

  function start(oid) {
    var duur = voor(oid);
    stand = { oef: oid, naam: GD.lifts.naam(oid), duur: duur, eind: Date.now() + duur * 1000, gemeld: false };
    ontgrendelGeluid();
    houdWakker(true);
    bewaar();
    teken(true);
    loop();
  }

  function stop() {
    stand = null;
    bewaar();
    houdWakker(false);
    teken(true);
  }

  /** Er seconden bij doen (of af, met een negatief getal). */
  function bij(sec) {
    if (!stand) return;
    var nu = Math.max(0, over());
    var nieuw = Math.min(MAX, Math.max(0, nu + sec));
    stand.eind = Date.now() + nieuw * 1000;
    stand.duur = Math.max(stand.duur + (nieuw - nu), nieuw, 1);
    if (nieuw > 0) stand.gemeld = false;
    bewaar();
    teken(true);
    loop();
  }

  /* ------------------------------ weergave ------------------------------ */

  var getekend = null;   // 'loopt', 'klaar' of null

  function balk() { return global.document.getElementById('rust'); }

  function teken(helemaal) {
    var el = balk();
    if (!el) return;
    var fase = !stand ? null : (over() > 0 ? 'loopt' : 'klaar');
    global.document.body.classList.toggle('rust-aan', !!fase);
    if (!fase) {
      el.hidden = true;
      el.innerHTML = '';
      getekend = null;
      return;
    }
    if (helemaal || fase !== getekend) {
      el.hidden = false;
      el.className = 'rust' + (fase === 'klaar' ? ' rust-klaar' : '');
      el.innerHTML = fase === 'loopt'
        ? '<span class="rust-naam">' + GD.icon('timer', 14) + '<span>Rust · ' + esc(stand.naam) + '</span></span>' +
          '<span class="rust-tijd" role="timer"></span>' +
          '<div class="rust-knoppen">' +
          '<button type="button" class="btn btn-sm" data-rust="min" aria-label="15 seconden korter">−15</button>' +
          '<button type="button" class="btn btn-sm" data-rust="plus" aria-label="15 seconden langer">+15</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-rust="stop" aria-label="Timer stoppen">' +
          GD.icon('kruis', 16) + '</button></div>' +
          '<div class="rust-voortgang"><span class="rust-vulling"></span></div>'
        : '<span class="rust-naam">' + GD.icon('timer', 14) + '<span>Rust voorbij · ' + esc(stand.naam) + '</span></span>' +
          '<span class="rust-tijd rust-klaar-tekst" role="status">Volgende set!</span>' +
          '<div class="rust-knoppen">' +
          '<button type="button" class="btn btn-sm" data-rust="opnieuw">Nog een keer</button>' +
          '<button type="button" class="btn btn-ghost btn-sm" data-rust="stop" aria-label="Sluiten">' +
          GD.icon('kruis', 16) + '</button></div>';
      getekend = fase;
    }
    if (fase === 'loopt') {
      var t = el.querySelector('.rust-tijd');
      var v = el.querySelector('.rust-vulling');
      if (t) t.textContent = tijd(over());
      if (v) v.style.width = Math.min(100, Math.max(0, (1 - over() / stand.duur) * 100)).toFixed(1) + '%';
    }
  }

  function esc(s) {
    return String(s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }

  /* ------------------------------- tikken ------------------------------- */

  var interval = null;

  function loop() {
    if (interval) return;
    interval = global.setInterval(tik, 250);
  }

  function tik() {
    if (!stand) {
      global.clearInterval(interval);
      interval = null;
      return;
    }
    var o = over();
    if (o <= 0 && !stand.gemeld) {
      stand.gemeld = true;
      bewaar();
      if (-o <= PIEP_MARGE && global.document.visibilityState !== 'hidden') meld();
    }
    if (o <= -KLAAR_ZICHTBAAR) { stop(); return; }
    teken(false);
  }

  /* ------------------------- geluid en scherm aan ------------------------ */

  var audio = null;

  /* Een browser laat pas geluid toe na een tik van jou. Daarom gaat het
     geluid open op het moment dat je de timer start, met een onhoorbaar
     toontje: anders blijft hij op een iPhone stil als de tijd om is. */
  function ontgrendelGeluid() {
    var AC = global.AudioContext || global.webkitAudioContext;
    if (!AC) return;
    try {
      if (!audio) audio = new AC();
      if (audio.state === 'suspended') audio.resume();
      var o = audio.createOscillator(), g = audio.createGain();
      g.gain.value = 0;
      o.connect(g);
      g.connect(audio.destination);
      o.start();
      o.stop(audio.currentTime + 0.02);
    } catch (e) { audio = null; }
  }

  /* Drie korte tonen, de laatste hoger: duidelijk genoeg boven muziek uit,
     kort genoeg om niet te storen. */
  function piep() {
    if (!audio) return;
    try {
      [0, 0.22, 0.44].forEach(function (na, i) {
        var o = audio.createOscillator(), g = audio.createGain();
        var t0 = audio.currentTime + na;
        o.type = 'sine';
        o.frequency.value = i === 2 ? 1320 : 880;
        g.gain.setValueAtTime(0.0001, t0);
        g.gain.exponentialRampToValueAtTime(0.35, t0 + 0.01);
        g.gain.exponentialRampToValueAtTime(0.0001, t0 + 0.16);
        o.connect(g);
        g.connect(audio.destination);
        o.start(t0);
        o.stop(t0 + 0.18);
      });
    } catch (e) { /* dan alleen de balk */ }
  }

  function meld() {
    if (GD.store.settings().rustGeluid !== false) piep();
    try { if (global.navigator.vibrate) global.navigator.vibrate([200, 100, 200]); } catch (e) { /* geen trilling */ }
  }

  var wakker = null;

  function houdWakker(aan) {
    var nav = global.navigator;
    if (aan) {
      if (wakker || !nav.wakeLock || global.document.visibilityState === 'hidden') return;
      nav.wakeLock.request('screen').then(function (slot) {
        wakker = slot;
        slot.addEventListener('release', function () { wakker = null; });
        if (!stand) houdWakker(false);
      }, function () { /* niet toegestaan: dan maar niet */ });
    } else if (wakker) {
      var w = wakker;
      wakker = null;
      w.release().catch(function () { /* al los */ });
    }
  }

  /* ------------------------------- opstarten ----------------------------- */

  global.document.addEventListener('click', function (e) {
    var knop = e.target.closest ? e.target.closest('[data-rust]') : null;
    if (!knop || !stand) return;
    var wat = knop.getAttribute('data-rust');
    if (wat === 'min') bij(-STAP);
    else if (wat === 'plus') bij(STAP);
    else if (wat === 'opnieuw') start(stand.oef);
    else if (wat === 'stop') stop();
  });

  // Terug in de app: de tijd bijwerken en het scherm weer aanhouden.
  global.document.addEventListener('visibilitychange', function () {
    if (global.document.visibilityState !== 'visible' || !stand) return;
    if (over() > 0) houdWakker(true);
    tik();
  });

  // Een ander tabblad startte of stopte de timer.
  global.addEventListener('storage', function (e) {
    if (e.key !== KEY) return;
    stand = lees();
    teken(true);
    if (stand) loop();
  });

  function init() {
    stand = lees();
    if (stand && over() <= -KLAAR_ZICHTBAAR) { stand = null; bewaar(); }
    if (!stand) return;
    // Na herladen is het geluid weer dicht; de eerstvolgende tik zet het open.
    global.document.addEventListener('pointerdown', function eerst() {
      global.document.removeEventListener('pointerdown', eerst);
      ontgrendelGeluid();
    });
    teken(true);
    loop();
  }

  if (global.document.readyState === 'loading') global.document.addEventListener('DOMContentLoaded', init);
  else init();

  GD.rust = {
    start: start,
    stop: stop,
    bij: bij,
    voor: voor,
    eigen: eigen,
    standaard: standaard,
    tijd: tijd,
    loopt: function () { return !!stand && over() > 0; },
    stand: function () { return stand ? { oef: stand.oef, naam: stand.naam, duur: stand.duur, over: over() } : null; },
    KEUZES: KEUZES,
    STAP: STAP
  };
})(window);
