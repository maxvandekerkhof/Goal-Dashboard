/* Minder streng: progressive overload naar rato, en de weekvergelijking
   van je gewicht op dezelfde dagen. */
const T = require('./lib');
const BASIS = T.WORTEL;
let ok = 0, fout = 0;
function check(naam, waar, extra) {
  if (waar) { ok++; console.log('  ok  ' + naam); }
  else { fout++; console.log('  FOUT ' + naam + (extra !== undefined ? ' → ' + extra : '')); }
}

(async () => {
  const b = await T.lanceer();
  const p = await b.newPage();
  const fouten = [];
  p.on('console', (m) => { if (m.type() === 'error') fouten.push(m.text()); });
  p.on('pageerror', (e) => fouten.push('pageerror: ' + e.message));
  await p.goto(BASIS + '/index.html');
  await p.waitForTimeout(400);

  /* Zet een trainingsdag neer. `sets` is een lijst [vorigeKg, vorigeReps,
     nuKg, nuReps] per oefening: vorige week en vandaag. */
  const dag = (sets) => p.evaluate((lijst) => {
    const D = GD.date, st = GD.store, L = GD.lifts;
    st.reset();
    const vandaag = D.today(), eerder = D.addDays(vandaag, -2);
    st.setField(vandaag, 'gesport', 'ja');
    st.setField(eerder, 'gesport', 'ja');
    lijst.forEach((s, i) => {
      const oid = L.addOefening('Oefening ' + (i + 1));
      L.setVeld(eerder, oid, '', 'kg', s[0]);
      L.setVeld(eerder, oid, '', 'reps', s[1]);
      L.setVeld(vandaag, oid, '', 'kg', s[2]);
      L.setVeld(vandaag, oid, '', 'reps', s[3]);
    });
    const res = L.dagResultaat(vandaag);
    const dagscore = GD.score.scoreDay(vandaag, false);
    let item = null;
    dagscore.items.forEach((it) => { if (it.key === 'overload') item = it; });
    return {
      vooruit: res.vooruit, gelijk: res.gelijk, terug: res.terug,
      vergeleken: res.vergeleken, waarde: res.waarde,
      deel: res.deel === null ? null : Math.round(res.deel * 1000) / 1000,
      score: item.score === null ? null : Math.round(item.score * 1000) / 1000,
      included: item.included,
      statussen: res.regels.map((r) => r.status).join(',')
    };
  }, sets);

  console.log('\n1. Een dag met vijf van de zes oefeningen vooruit');
  // Vijf keer 2,5 kg erbij bij gelijke reps, één oefening precies gelijk.
  let d = await dag([
    [40, 10, 42.5, 10], [40, 10, 42.5, 10], [40, 10, 42.5, 10],
    [40, 10, 42.5, 10], [40, 10, 42.5, 10], [40, 10, 40, 10]
  ]);
  check('de app ziet er ook vijf van de zes', d.vooruit === 5 && d.vergeleken === 6, d.statussen);
  check('dat is geen halve dag meer', d.score > 0.9, d.score);
  check('het doel staat vol', d.waarde === 'ja' && d.score === 1, d.waarde + ' ' + d.score);

  console.log('\n2. Vijf vooruit met één die inzakte telt ook vol');
  d = await dag([
    [40, 10, 42.5, 10], [40, 10, 42.5, 10], [40, 10, 42.5, 10],
    [40, 10, 42.5, 10], [40, 10, 42.5, 10], [40, 10, 30, 8]
  ]);
  check('één echte terugval erbij', d.terug === 1 && d.vooruit === 5, d.statussen);
  check('5/6 haalt de drempel van 0,8', d.deel === 1, d.deel);

  console.log('\n3. Het blijft wel wat meten');
  d = await dag([[40, 10, 40, 10], [40, 10, 40, 10], [40, 10, 40, 10], [40, 10, 40, 10]]);
  check('alles gelijk → half', d.gelijk === 4 && d.score === 0.5, d.score + ' ' + d.statussen);
  check('en dat heet "deels"', d.waarde === 'deels', d.waarde);

  d = await dag([[40, 10, 35, 8], [40, 10, 35, 8], [40, 10, 35, 8]]);
  check('alles terug → nul', d.score === 0 && d.waarde === 'nee', d.score + ' ' + d.waarde);

  d = await dag([[40, 10, 42.5, 10], [40, 10, 35, 8], [40, 10, 35, 8], [40, 10, 35, 8]]);
  check('één van de vier vooruit blijft laag', d.score === 0.313, d.score);

  console.log('\n4. Twee van de drie vooruit, één gelijk');
  d = await dag([[40, 10, 42.5, 10], [40, 10, 42.5, 10], [40, 10, 40, 10]]);
  // (1 + 1 + 0,4) / 3 = 0,8 → precies de drempel
  check('2 vooruit + 1 gelijk = vol', d.score === 1, d.score + ' ' + d.statussen);

  d = await dag([[40, 10, 42.5, 10], [40, 10, 40, 10], [40, 10, 40, 10]]);
  // (1 + 0,4 + 0,4) / 3 = 0,6 → 0,75
  check('1 vooruit + 2 gelijk = 75%', d.score === 0.75, d.score);

  console.log('\n5. Een eerste keer telt nog steeds niet mee');
  d = await p.evaluate(() => {
    const D = GD.date, st = GD.store, L = GD.lifts;
    st.reset();
    const vandaag = D.today();
    st.setField(vandaag, 'gesport', 'ja');
    const oid = L.addOefening('Nieuw');
    L.setVeld(vandaag, oid, '', 'kg', 40);
    L.setVeld(vandaag, oid, '', 'reps', 10);
    const res = L.dagResultaat(vandaag);
    let item = null;
    GD.score.scoreDay(vandaag, false).items.forEach((it) => { if (it.key === 'overload') item = it; });
    return { waarde: res.waarde, deel: res.deel, included: item.included, reden: item.reason };
  });
  check('eerste sessie geeft geen deel', d.deel === null && d.waarde === 'nieuw', d.waarde);
  check('en telt niet mee in de dagscore', d.included === false, d.reden);

  console.log('\n6. De tussenstand van een lopende dag klopt nog');
  d = await p.evaluate(() => {
    const D = GD.date, st = GD.store, L = GD.lifts;
    st.reset();
    const vandaag = D.today(), eerder = D.addDays(vandaag, -2);
    st.setField(vandaag, 'gesport', 'ja');
    st.setField(eerder, 'gesport', 'ja');
    [[40, 10, 42.5, 10], [40, 10, 40, 10]].forEach((s, i) => {
      const oid = L.addOefening('O' + i);
      L.setVeld(eerder, oid, '', 'kg', s[0]);
      L.setVeld(eerder, oid, '', 'reps', s[1]);
      L.setVeld(vandaag, oid, '', 'kg', s[2]);
      L.setVeld(vandaag, oid, '', 'reps', s[3]);
    });
    const dagje = GD.score.scoreDay(vandaag, true);
    const ov = GD.score.dagOverzicht(dagje);
    let item = null;
    dagje.items.forEach((it) => { if (it.key === 'overload') item = it; });
    const gewicht = item.weight;
    return {
      score: Math.round(item.score * 1000) / 1000,
      binnen: Math.round(ov.binnen * 1000) / 1000,
      kwijt: Math.round(ov.kwijt * 1000) / 1000,
      open: Math.round(ov.open * 1000) / 1000,
      totaal: Math.round(ov.totaal * 1000) / 1000,
      gewicht: gewicht
    };
  });
  // (1 + 0,4) / 2 = 0,7 → /0,8 = 0,875
  check('lopende dag: overload op 0,875', d.score === 0.875, d.score);
  check('binnen + kwijt + open blijft het totaal',
    // Elk getal is hierboven op drie decimalen afgerond, dus de som mag daar
    // een fractie naast zitten.
    Math.abs(d.binnen + d.kwijt + d.open - d.totaal) < 0.005,
    d.binnen + '+' + d.kwijt + '+' + d.open + ' vs ' + d.totaal);

  /* ---------------------------- gewicht ---------------------------- */
  console.log('\n7. Weekafsluiting vergelijkt dezelfde dagen');

  /* Weegt elke dag; het weekend telkens een kilo zwaarder. Zo laat een
     halve week zich niet meer met een hele week vergelijken. */
  const week = () => p.evaluate(() => {
    const D = GD.date, st = GD.store;
    st.reset();
    st.setSetting('gewichtRichting', 'aankomen');
    st.setSetting('gewichtTempo', 0.25);
    for (let i = 27; i >= 0; i--) {
      const d = D.addDays(D.today(), -i);
      const dow = new Date(d + 'T12:00:00').getDay();      // 0 = zondag
      const weekend = dow === 0 || dow === 6;
      st.setField(d, 'gewicht', +(73 + (weekend ? 1 : 0)).toFixed(2));
    }
    const r = GD.review.maak(D.today());
    return {
      delta: r.gewicht.delta === null ? null : Math.round(r.gewicht.delta * 100) / 100,
      metingen: r.gewicht.metingen, vorige: r.gewicht.vorigeMetingen
    };
  });
  const w = await week();
  check('even veel weegmomenten aan beide kanten', w.metingen === w.vorige,
    w.metingen + ' vs ' + w.vorige);
  check('zelfde dagen, zelfde gewicht → 0,00 kg', w.delta === 0, w.delta);

  console.log('\n8. Een echte stijging komt er wel doorheen');
  const stijging = await p.evaluate(() => {
    const D = GD.date, st = GD.store;
    st.reset();
    st.setSetting('gewichtRichting', 'aankomen');
    st.setSetting('gewichtTempo', 0.25);
    for (let i = 27; i >= 0; i--) {
      const d = D.addDays(D.today(), -i);
      st.setField(d, 'gewicht', +(73 + (27 - i) * (0.25 / 7)).toFixed(2));
    }
    const r = GD.review.maak(D.today());
    const m = GD.score.gewichtMelding(D.today());
    return {
      week: Math.round(r.gewicht.delta * 100) / 100,
      status: r.gewicht.status,
      melding: Math.round(m.delta * 100) / 100,
      meldStatus: m.status
    };
  });
  check('weekafsluiting ziet +0,25', Math.abs(stijging.week - 0.25) < 0.02, stijging.week);
  check('en noemt dat op schema', stijging.status === 'op-schema', stijging.status);
  check('de dagmelding ziet hetzelfde', Math.abs(stijging.melding - 0.25) < 0.02, stijging.melding);

  console.log('\n9. Eén dag schommeling zet de melding niet om');
  const ruis = await p.evaluate(() => {
    const D = GD.date, st = GD.store;
    st.reset();
    st.setSetting('gewichtRichting', 'aankomen');
    st.setSetting('gewichtTempo', 0.25);
    // Vlak op 73, behalve vanochtend: 73,8 na 72,9 gisteren.
    for (let i = 27; i >= 0; i--) {
      const d = D.addDays(D.today(), -i);
      let kg = 73;
      if (i === 1) kg = 72.9;
      if (i === 0) kg = 73.8;
      st.setField(d, 'gewicht', kg);
    }
    const m = GD.score.gewichtMelding(D.today());
    return {
      delta: Math.round(m.delta * 100) / 100, status: m.status, tekst: m.tekst,
      trend: m.trendPerWeek, uitTrend: m.uitTrend
    };
  });
  check('0,9 kg in één nacht wordt 0,10 kg op de week', ruis.delta === 0.1, ruis.delta);
  check('en dat is nog steeds te traag', ruis.status === 'traag', ruis.status);
  // Met 28 wegingen draagt de trendlijn het oordeel; die ene nacht trekt daar
  // nog minder aan dan aan het weekgemiddelde.
  check('de melding leunt op de trendlijn', ruis.uitTrend === true);
  check('de tekst noemt het venster van drie weken',
    /per week over 21 dagen/.test(ruis.tekst), ruis.tekst);
  check('één nacht zet die lijn niet om', ruis.trend < 0.2, ruis.trend);

  /* ----------------------------- de pagina ----------------------------- */
  console.log('\n10. Het staat ook echt op de dagpagina');
  await p.evaluate(() => {
    const D = GD.date, st = GD.store, L = GD.lifts;
    st.reset();
    const vandaag = D.today(), eerder = D.addDays(vandaag, -2);
    st.setField(vandaag, 'gesport', 'ja');
    st.setField(eerder, 'gesport', 'ja');
    const sid = L.addSchema('Pull');
    [[40, 10, 42.5, 10], [40, 10, 42.5, 10], [40, 10, 42.5, 10],
     [40, 10, 42.5, 10], [40, 10, 42.5, 10], [40, 10, 40, 10]].forEach((s, i) => {
      const oid = L.addOefening('Oefening ' + (i + 1));
      L.addToSchema(sid, oid);
      L.setVeld(eerder, oid, '', 'kg', s[0]);
      L.setVeld(eerder, oid, '', 'reps', s[1]);
      L.setVeld(vandaag, oid, '', 'kg', s[2]);
      L.setVeld(vandaag, oid, '', 'reps', s[3]);
    });
    L.setDagSchema(vandaag, sid);
  });
  await p.reload();
  await p.waitForTimeout(500);
  const tekst = await p.evaluate(() => document.querySelector('#view').innerText);
  check('de voet noemt 5 van de 6 vooruit', /5 van de 6 vooruit/.test(tekst),
    (tekst.match(/.{0,40}vooruit.{0,20}/) || [''])[0]);
  check('met 100% erachter', /5 van de 6 vooruit[\s\S]{0,30}100%/.test(tekst));
  const actief = await p.evaluate(() => {
    const knoppen = document.querySelectorAll('[data-goal="overload"].seg-active');
    return knoppen.length ? knoppen[0].textContent.replace(/\s+/g, ' ').trim() : null;
  });
  check('en "Ja" staat aan', /^Ja/.test(actief || ''), actief);

  check('geen fouten op de pagina', fouten.length === 0, fouten.join(' | '));

  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  await b.close();
  process.exit(fout ? 1 : 0);
})();
