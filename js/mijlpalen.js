/* Goal Dashboard - mijlpalen
 *
 * Drie soorten, allemaal afgeleid uit wat er al in je gegevens staat:
 *
 * - kracht: voor het eerst een rond gewicht op een oefening (45, 50, 60 kg),
 *   bij oefeningen zonder gewicht een rond aantal herhalingen, en je
 *   geschatte 1RM 10, 25, 50 of 100% boven je startpunt;
 * - lichaamsgewicht: elke hele kilo erbij (of eraf) sinds je begon, en je
 *   streefgewicht;
 * - reeksen: goede dagen, creatine en je waterdoel, zoveel dagen op rij.
 *
 * Niets hiervan wordt opgeslagen. Een mijlpaal is iets wat je deed, en dat
 * staat al in je dagen: zo kloppen ze ook voor alles van vóór deze versie,
 * en verdwijnt er een als je een verkeerd ingetikte set verbetert.
 *
 * Elke mijlpaal telt één keer: de eerste dag dat je hem haalde. Een reeks van
 * zeven dagen die je na een onderbreking opnieuw haalt is geen nieuwe
 * mijlpaal; de volgende is dan veertien.
 */
(function (global) {
  'use strict';

  var GD = global.GD;
  var store = GD.store;
  var D = GD.date;
  var S = GD.score;
  var L = GD.lifts;

  var REEKSEN = [7, 14, 30, 50, 100, 200, 365];
  var KRACHT_PCT = [10, 25, 50, 100];
  var REPS = [5, 10, 15, 20, 25, 30, 40, 50];
  var WEEK = 7;
  var MIN_WEEG = 3;            // wegingen in een week voor een weekgemiddelde

  /* Ronde gewichten: per vijf kilo tot vijftig, daarboven per tien. Lager
     zitten de stappen dichter op elkaar, anders duurt een mijlpaal bij een
     lateral raise een half jaar. */
  function kgGrenzen(tot) {
    var uit = [];
    for (var k = 5; k <= tot; k += (k < 50 ? 5 : 10)) uit.push(k);
    return uit;
  }
  function volgendeKg(kg) {
    var k = 5;
    while (k <= kg) k += (k < 50 ? 5 : 10);
    return k;
  }

  /* Alle dagen van `van` t/m `tot`. Niet D.range: die stopt na duizend dagen
     als vangnet, en een reeks of je eerste weging ligt daar na een paar jaar
     gewoon voorbij. */
  function dagen(van, tot) {
    var uit = [];
    for (var d = van, n = 0; d <= tot && n < 40000; d = D.addDays(d, 1), n++) uit.push(d);
    return uit;
  }

  function kgTekst(n) {
    var r = Math.round(n * 10) / 10;
    return (r % 1 ? r.toFixed(1) : String(r)).replace('.', ',');
  }

  /* ------------------------------- kracht ------------------------------- */

  /* Eén sessie van een oefening. Bij een oefening per arm telt wat béíde
     armen haalden, dus de zwakste kant: een mijlpaal met één arm is er nog
     geen. */
  function sessies(oef) {
    var zijden = L.zijden(oef);
    var perDatum = {};
    zijden.forEach(function (z) {
      L.historie(oef.id, z.key).forEach(function (r) {
        var d = perDatum[r.datum] = perDatum[r.datum] || { datum: r.datum, n: 0, kg: Infinity, reps: Infinity, rm: Infinity };
        d.n++;
        d.kg = Math.min(d.kg, r.kg);
        d.reps = Math.min(d.reps, r.reps);
        d.rm = Math.min(d.rm, L.geschat1RM(r.kg, r.reps));
      });
    });
    return Object.keys(perDatum).sort().map(function (d) { return perDatum[d]; })
      .filter(function (s) { return s.n === zijden.length; });
  }

  function setTekst(oef, s) {
    return oef.type === 'reps' ? s.reps + ' reps' : kgTekst(s.kg) + ' kg × ' + s.reps;
  }

  function kracht(uit) {
    L.oefeningen().forEach(function (oef) {
      var h = sessies(oef);
      if (h.length < 2) return;
      var start = h[0];
      var alleenReps = oef.type === 'reps';
      var zwaarste = alleenReps ? start.reps : start.kg;
      var gehaald = {};
      var pctGehaald = {};

      h.slice(1).forEach(function (s) {
        var waarde = alleenReps ? s.reps : s.kg;
        if (waarde > zwaarste) {
          (alleenReps ? REPS : kgGrenzen(waarde)).forEach(function (g) {
            if (g > zwaarste && g <= waarde && !gehaald[g]) {
              gehaald[g] = true;
              uit.push({
                id: 'k|' + oef.id + '|' + (alleenReps ? 'reps' : 'kg') + '|' + g,
                soort: 'kracht', icoon: 'overload', datum: s.datum, oef: oef.id,
                titel: alleenReps
                  ? 'Voor het eerst ' + g + ' reps bij ' + oef.naam
                  : 'Voor het eerst ' + kgTekst(g) + ' kg bij ' + oef.naam,
                tekst: setTekst(oef, s) + ' — je begon op ' + setTekst(oef, start) + ' (' + D.formatShort(start.datum) + ').'
              });
            }
          });
          zwaarste = waarde;
        }
        if (alleenReps || !(start.rm > 0)) return;
        var winst = (s.rm / start.rm - 1) * 100;
        KRACHT_PCT.forEach(function (p) {
          if (winst >= p && !pctGehaald[p]) {
            pctGehaald[p] = true;
            uit.push({
              id: 'k|' + oef.id + '|pct|' + p,
              soort: 'kracht', icoon: 'overload', datum: s.datum, oef: oef.id,
              titel: oef.naam + ' ' + p + '% sterker',
              tekst: 'Geschat 1RM ' + kgTekst(s.rm) + ' kg, tegen ' + kgTekst(start.rm) + ' kg bij je start op ' +
                D.formatShort(start.datum) + '.'
            });
          }
        });
      });
    });
  }

  function krachtBijna(uit) {
    L.oefeningen().forEach(function (oef) {
      var h = sessies(oef);
      if (h.length < 2) return;
      var alleenReps = oef.type === 'reps';
      var hoogst = 0;
      h.forEach(function (s) { hoogst = Math.max(hoogst, alleenReps ? s.reps : s.kg); });
      if (!(hoogst > 0)) return;
      var doel;
      if (alleenReps) {
        doel = null;
        for (var i = 0; i < REPS.length; i++) if (REPS[i] > hoogst) { doel = REPS[i]; break; }
        if (!doel) return;
      } else {
        doel = volgendeKg(hoogst);
      }
      var voortgang = hoogst / doel;
      if (voortgang < (alleenReps ? 0.75 : 0.9)) return;
      uit.push({
        id: 'k|' + oef.id + '|' + (alleenReps ? 'reps' : 'kg') + '|' + doel,
        soort: 'kracht', icoon: 'overload', voortgang: voortgang,
        titel: alleenReps ? doel + ' reps bij ' + oef.naam : kgTekst(doel) + ' kg bij ' + oef.naam,
        tekst: alleenReps ? 'Je beste is ' + hoogst + ' reps.' : 'Je zwaarste is ' + kgTekst(hoogst) + ' kg.'
      });
    });
  }

  /* --------------------------- lichaamsgewicht -------------------------- */

  /* Elke dag het gemiddelde van de wegingen in de week tot en met die dag.
     Eén zware ochtend is geen kilo erbij; een week lang wel. */
  function weekGemiddelden() {
    var wegingen = [];
    store.allDates().forEach(function (d) {
      var e = store.entry(d);
      var w = e ? S.num(e.gewicht) : null;
      if (w !== null && w > 0 && d <= D.today()) wegingen.push({ datum: d, w: w });
    });
    if (!wegingen.length) return null;
    var eerste = wegingen[0].datum;
    var beginReeks = wegingen.filter(function (x) { return D.dagenTussen(eerste, x.datum) < WEEK; });
    var begin = beginReeks.reduce(function (s, x) { return s + x.w; }, 0) / beginReeks.length;

    var opDatum = {};
    wegingen.forEach(function (x) { opDatum[x.datum] = x.w; });
    var reeks = dagen(eerste, D.today());
    var gemiddelden = [];
    reeks.forEach(function (d, i) {
      if (i < WEEK - 1) return;
      var som = 0, n = 0;
      for (var j = i - (WEEK - 1); j <= i; j++) {
        var w = opDatum[reeks[j]];
        if (w !== undefined) { som += w; n++; }
      }
      if (n >= MIN_WEEG) gemiddelden.push({ datum: d, w: som / n });
    });
    return { eerste: eerste, begin: begin, gemiddelden: gemiddelden };
  }

  function teken(richting) { return richting === 'afvallen' ? -1 : 1; }

  function gewicht(uit, bijna) {
    var s = store.settings();
    var richting = s.gewichtRichting;
    if (richting !== 'aankomen' && richting !== 'afvallen') return;
    var g = weekGemiddelden();
    if (!g) return;
    var t = teken(richting);
    var gehaald = 0;
    var doel = S.num(s.gewichtDoel);
    var doelTelt = doel !== null && doel > 0 && (doel - g.begin) * t > 0;
    var doelGehaald = false;

    g.gemiddelden.forEach(function (x) {
      var erbij = (x.w - g.begin) * t;
      while (erbij >= gehaald + 1 && gehaald < 50) {
        gehaald++;
        uit.push({
          id: 'g|kg|' + (t * gehaald),
          soort: 'gewicht', icoon: 'weegschaal', datum: x.datum,
          titel: (t > 0 ? '+' : '−') + gehaald + ' kg sinds je begon',
          tekst: 'Je weekgemiddelde staat op ' + kgTekst(x.w) + ' kg; je begon op ' + kgTekst(g.begin) +
            ' kg (' + D.formatShort(g.eerste) + ').'
        });
      }
      if (doelTelt && !doelGehaald && (x.w - doel) * t >= 0) {
        doelGehaald = true;
        uit.push({
          id: 'g|doel|' + doel,
          soort: 'gewicht', icoon: 'doel', datum: x.datum,
          titel: 'Streefgewicht gehaald: ' + kgTekst(doel) + ' kg',
          tekst: 'Je weekgemiddelde staat op ' + kgTekst(x.w) + ' kg, vanaf ' + kgTekst(g.begin) + ' kg op ' +
            D.formatShort(g.eerste) + '.'
        });
      }
    });

    if (!bijna) return;
    var laatste = g.gemiddelden[g.gemiddelden.length - 1];
    if (!laatste || D.dagenTussen(laatste.datum, D.today()) > WEEK) return;
    var nu = (laatste.w - g.begin) * t;
    var volgende = gehaald + 1;
    if (volgende - nu <= 0.4 && nu > 0) {
      bijna.push({
        id: 'g|kg|' + (t * volgende),
        soort: 'gewicht', icoon: 'weegschaal', voortgang: nu / volgende,
        titel: (t > 0 ? '+' : '−') + volgende + ' kg sinds je begon',
        // Naar boven afgerond: "nog 0 kg" terwijl hij er nog niet staat klopt niet.
        tekst: 'Nog ' + kgTekst(Math.max(0.1, Math.ceil((volgende - nu) * 10) / 10)) + ' kg; je weekgemiddelde is ' +
          kgTekst(laatste.w) + ' kg.'
      });
    }
    if (doelTelt && !doelGehaald && Math.abs(doel - laatste.w) <= 1) {
      bijna.push({
        id: 'g|doel|' + doel,
        soort: 'gewicht', icoon: 'doel', voortgang: 1 - Math.abs(doel - laatste.w) / Math.abs(doel - g.begin),
        titel: 'Streefgewicht ' + kgTekst(doel) + ' kg',
        tekst: 'Nog ' + kgTekst(Math.max(0.1, Math.ceil(Math.abs(doel - laatste.w) * 10) / 10)) +
          ' kg; je weekgemiddelde is ' + kgTekst(laatste.w) + ' kg.'
      });
    }
  }

  /* ------------------------------- reeksen ------------------------------ */

  var REEKS_SOORTEN = [
    {
      id: 'goed', icoon: 'vlam',
      titel: function (n) { return n + ' goede dagen op rij'; },
      tekst: function (n, s) {
        return n + ' dagen achter elkaar minstens ' + S.num(s.goedeDagDrempel, 70) + '% gehaald.';
      },
      telt: function (dag, s) { return dag.pct !== null && dag.pct >= S.num(s.goedeDagDrempel, 70); }
    },
    {
      id: 'creatine', icoon: 'creatine',
      titel: function (n) { return n + ' dagen op rij creatine'; },
      tekst: function (n) { return 'Elke dag je creatine, ' + n + ' dagen lang.'; },
      telt: function (dag) { return item(dag, 'creatine').value === 'ja'; }
    },
    {
      id: 'water', icoon: 'water',
      titel: function (n) { return n + ' dagen op rij je waterdoel'; },
      tekst: function (n) { return n + ' dagen achter elkaar genoeg gedronken.'; },
      telt: function (dag) { var it = item(dag, 'water'); return it.frac !== null && it.frac >= 1; }
    }
  ];

  function item(dag, key) {
    for (var i = 0; i < dag.items.length; i++) if (dag.items[i].key === key) return dag.items[i];
    return {};
  }

  /* Elke dag van je eerste invoer tot vandaag. Vandaag telt pas mee als hij
     al raak is, net als bij je streak: een dag die nog loopt breekt niets. */
  function reeksen(uit, bijna) {
    var s = store.settings();
    var datums = store.allDates();
    if (!datums.length) return;
    var vandaag = D.today();
    var lijst = dagen(datums[0], vandaag);
    var stand = {};
    REEKS_SOORTEN.forEach(function (r) { stand[r.id] = { lopend: 0, beste: 0 }; });

    lijst.forEach(function (d) {
      var dag = store.entry(d) ? S.scoreDay(d, d === vandaag) : null;
      REEKS_SOORTEN.forEach(function (r) {
        var st = stand[r.id];
        if (dag && r.telt(dag, s)) {
          st.lopend++;
          if (st.lopend > st.beste) {
            REEKSEN.forEach(function (n) {
              if (st.lopend === n && n > st.beste) {
                uit.push({
                  id: 'r|' + r.id + '|' + n, soort: 'reeks', icoon: r.icoon, datum: d,
                  titel: r.titel(n), tekst: r.tekst(n, s)
                });
              }
            });
            st.beste = st.lopend;
          }
        } else if (d !== vandaag) {
          st.lopend = 0;
        }
      });
    });

    if (!bijna) return;
    REEKS_SOORTEN.forEach(function (r) {
      var st = stand[r.id];
      if (!st.lopend) return;
      var volgende = null;
      for (var i = 0; i < REEKSEN.length; i++) if (REEKSEN[i] > st.beste) { volgende = REEKSEN[i]; break; }
      if (!volgende) return;
      var nog = volgende - st.lopend;
      if (nog > 3 && st.lopend / volgende < 0.7) return;
      bijna.push({
        id: 'r|' + r.id + '|' + volgende, soort: 'reeks', icoon: r.icoon, voortgang: st.lopend / volgende,
        titel: r.titel(volgende),
        tekst: 'Je zit op ' + st.lopend + '; nog ' + nog + ' dag' + (nog === 1 ? '' : 'en') + '.'
      });
    });
  }

  /* ------------------------------- samen -------------------------------- */

  var cache = null;
  var cacheSleutel = '';

  function bereken() {
    var sleutel = store.rev() + '|' + D.today();
    if (cache && cacheSleutel === sleutel) return cache;
    var lijst = [], bijna = [];
    kracht(lijst);
    krachtBijna(bijna);
    gewicht(lijst, bijna);
    reeksen(lijst, bijna);
    var VOLGORDE = { kracht: 0, gewicht: 1, reeks: 2 };
    lijst.sort(function (a, b) {
      if (a.datum !== b.datum) return a.datum < b.datum ? -1 : 1;
      return VOLGORDE[a.soort] - VOLGORDE[b.soort];
    });
    bijna.sort(function (a, b) { return b.voortgang - a.voortgang; });
    cache = { lijst: lijst, bijna: bijna.slice(0, 5) };
    cacheSleutel = sleutel;
    return cache;
  }

  GD.mijlpalen = {
    /** Alles wat je ooit haalde, oudste eerst. */
    alle: function () { return bereken().lijst.slice(); },
    /** Wat je op één dag haalde. */
    op: function (datum) {
      return bereken().lijst.filter(function (m) { return m.datum === datum; });
    },
    /** Wat je tussen twee datums haalde (inclusief). */
    tussen: function (van, tot) {
      return bereken().lijst.filter(function (m) { return m.datum >= van && m.datum <= tot; });
    },
    /** Waar je nu dichtbij zit, het dichtstbij eerst; hooguit vijf. */
    bijna: function () { return bereken().bijna.slice(); },
    REEKSEN: REEKSEN
  };
})(window);
