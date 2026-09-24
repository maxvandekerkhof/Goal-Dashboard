/* Gewichtsmelding op de trendlijn, calorieadvies, en de nul uit Apple Health. */
const T = require('./lib');

const BASIS = T.WORTEL;
let ok = 0, fout = 0;
function check(naam, waar, extra) {
  if (waar) { ok++; console.log('  ok  ' + naam); }
  else { fout++; console.log('  FOUT ' + naam + (extra !== undefined ? ' → ' + extra : '')); }
}

/* Je echte wegingen en calorieën van 3 t/m 23 september, jongste eerst, uit
   test/prive/backup-23.json. De repo is openbaar, dus die getallen staan hier
   niet zelf in. Zonder die back-up vallen de stukken die je eigen getallen
   narekenen weg; de rest draait op een verzonnen reeks met hetzelfde patroon
   (één dag niet gewogen), want die gebruikt alleen wélke dagen er gewogen is. */
const PRIVE = T.prive('backup-23.json');
function uitBackup(json, veld) {
  const e = JSON.parse(json).entries;
  const uit = [];
  for (let i = 0; i < 21; i++) {
    const d = new Date(Date.UTC(2026, 8, 23 - i)).toISOString().slice(0, 10);
    const w = e[d] && e[d][veld];
    uit.push(w === undefined ? null : w);
  }
  return uit;
}
const ECHT = PRIVE ? uitBackup(PRIVE, 'gewicht') : null;
/* Wat de app op die data hoort te zeggen, hier los nagerekend: de twee
   weekgemiddelden, en de gewogen lijn door 21 dagen (halfwaarde 14 dagen). */
function gemiddelde(l) { const w = l.filter((x) => x !== null); return w.length ? w.reduce((a, b) => a + b, 0) / w.length : null; }
function verwacht(reeks) {
  const nu = reeks.slice(0, 7), vorig = reeks.slice(7, 14);
  let Sw = 0, Sx = 0, Sy = 0, Sxx = 0, Sxy = 0, n = 0;
  reeks.forEach((y, k) => {
    if (y === null) return;
    const x = 20 - k, w = Math.pow(0.5, k / 14);
    Sw += w; Sx += w * x; Sy += w * y; Sxx += w * x * x; Sxy += w * x * y; n++;
  });
  return {
    nu: gemiddelde(nu), vorig: gemiddelde(vorig),
    nNu: nu.filter((x) => x !== null).length, nVorig: vorig.filter((x) => x !== null).length,
    trend: ((Sw * Sxy - Sx * Sy) / (Sw * Sxx - Sx * Sx)) * 7, wegingen: n
  };
}
const V = ECHT ? verwacht(ECHT) : null;
const PATROON = ECHT || Array.from({ length: 21 }, (x, i) =>
  (i === 3 ? null : +(72 + (20 - i) * 0.06 + (i % 4 === 0 ? 0.4 : 0)).toFixed(1)));

async function zet(page, settings, gewichten, kcal) {
  return page.evaluate((arg) => {
    const D = GD.date, st = GD.store;
    st.reset();
    Object.keys(arg.settings).forEach((k) => st.setSetting(k, arg.settings[k]));
    arg.gewichten.forEach((kg, i) => {
      if (kg !== null) st.setField(D.addDays(D.today(), -i), 'gewicht', kg);
    });
    (arg.kcal || []).forEach((k, i) => {
      if (k !== null) st.setField(D.addDays(D.today(), -i), 'kcal', k);
    });
    const gm = GD.score.gewichtMelding(null);
    return { gm: gm, v: GD.score.verbruik(null, st.settings()) };
  }, { settings, gewichten, kcal });
}

const AANKOMEN = { gewichtRichting: 'aankomen', gewichtTempo: 0.25, calorieDoel: 2800 };

(async () => {
  const b = await T.lanceer();
  const p = await b.newPage();
  const paginafouten = [];
  p.on('console', (m) => { if (m.type() === 'error') paginafouten.push(m.text()); });
  p.on('pageerror', (e) => paginafouten.push('pageerror: ' + e.message));
  await p.goto(BASIS + '/index.html');
  await p.waitForTimeout(400);

  let r, gm;
  if (!ECHT) {
    T.overslaan('1–4. Je eigen data: vlakke week in een stijgende lijn, en het advies dat eruit volgt');
  } else {
  console.log('\n1. Je eigen data: vlakke week binnen een stijgende lijn');
  r = await zet(p, AANKOMEN, ECHT, null);
  gm = r.gm;
  check('weekvergelijking klopt met de hand nagerekend', Math.abs(gm.delta - (V.nu - V.vorig)) < 0.0005, gm.delta);
  check('en is vlak, terwijl de lijn stijgt', Math.abs(gm.delta) < 0.1 && V.trend > 0.25, gm.delta);
  check('deze week gemiddeld zoals nagerekend', Math.abs(gm.avg - V.nu) < 0.001, gm.avg);
  check('vorige week gemiddeld zoals nagerekend', Math.abs(gm.vorigeAvg - V.vorig) < 0.001, gm.vorigeAvg);
  check('aantal wegingen per week klopt', gm.metingen === V.nNu && gm.vorigeMetingen === V.nVorig,
    gm.metingen + '/' + gm.vorigeMetingen);
  check('oordeel komt nu van de trendlijn', gm.uitTrend === true);
  check('trend per week zoals nagerekend', Math.abs(gm.trendPerWeek - V.trend) < 0.005, gm.trendPerWeek);
  check('alle wegingen in het trendvenster tellen mee', gm.trendDagen === V.wegingen, gm.trendDagen);
  check('status is "snel", niet "verkeerd"', gm.status === 'snel', gm.status);
  check('zegt niet meer dat hij niet aankomt', gm.tekst.indexOf('komt niet aan') === -1, gm.tekst);
  check('noemt het tempo', gm.tekst.indexOf('sneller dan je tempo') !== -1, gm.tekst);
  check('waarschuwt over vet', gm.tekst.indexOf('vooral vet') !== -1);
  check('geen "twee weken op rij" meer', gm.tekst.indexOf('Twee weken op rij') === -1);

  console.log('\n2. Het calorieadvies dat eruit volgt');
  check('er is advies', !!gm.advies, gm.advies);
  check('ongeveer 200 kcal per dag te veel',
    gm.advies && gm.advies.kcalPerDag >= 190 && gm.advies.kcalPerDag <= 220, gm.advies.kcalPerDag);
  check('niet afgetopt', gm.advies && gm.advies.afgetopt === false);
  check('kent het huidige doel', gm.advies && gm.advies.huidigDoel === 2800, gm.advies.huidigDoel);
  check('het getal staat niet dubbel in de meldregel',
    /kcal per dag/.test(gm.tekst) === false, gm.tekst);

  console.log('\n3. Zonder caloriedagen geen concreet nieuw doel, wél de bijstelling');
  check('verbruik nog niet klaar', r.v.klaar === false);
  check('maar de trend is er wel', Math.abs(r.v.perWeek - V.trend) < 0.005, r.v.perWeek);
  check('geen nieuw doel voorgesteld', gm.advies.nieuwDoel === null, gm.advies.nieuwDoel);

  console.log('\n4. Mét genoeg caloriedagen komt het doel van Verbruik');
  const kcalVol = ECHT.map((g, i) => (i < 17 ? 2700 : null));
  r = await zet(p, AANKOMEN, ECHT, kcalVol);
  check('verbruik nu klaar', r.v.klaar === true, r.v.kcalDagen);
  check('advies draagt het doel van Verbruik',
    r.gm.advies && r.gm.advies.nieuwDoel === r.v.doelKcal,
    r.gm.advies && r.gm.advies.nieuwDoel + ' vs ' + r.v.doelKcal);
  check('dat doel ligt onder de huidige 2800', r.v.doelKcal < 2800, r.v.doelKcal);
  }

  console.log('\n5. Op schema: geen advies, wel groen');
  const opSchema = PATROON.map((g, i) => (g === null ? null : 73.0 + (20 - i) * 0.0357));
  r = await zet(p, AANKOMEN, opSchema, null);
  check('status op-schema', r.gm.status === 'op-schema', r.gm.status + ' ' + r.gm.trendPerWeek);
  check('geen calorieadvies', r.gm.advies === null);
  check('krijgt kleur', r.gm.pct === 100, r.gm.pct);

  console.log('\n6. Te traag levert "meer eten" op');
  const traag = PATROON.map((g, i) => (g === null ? null : 73.0 + (20 - i) * 0.005));
  r = await zet(p, AANKOMEN, traag, null);
  check('status traag', r.gm.status === 'traag', r.gm.status);
  check('advies is negatief = te weinig', r.gm.advies.kcalPerDag < 0, r.gm.advies.kcalPerDag);
  check('advies wijst de andere kant op', r.gm.advies.kcalPerDag > -400, r.gm.advies.kcalPerDag);

  console.log('\n7. Afvallen: tekens kloppen ook de andere kant op');
  const afvallen = { gewichtRichting: 'afvallen', gewichtTempo: 0.5, calorieDoel: 2200 };
  const zakt = PATROON.map((g, i) => (g === null ? null : 75.0 - (20 - i) * 0.0143));
  r = await zet(p, afvallen, zakt, null);
  check('valt 0,1 per week af, dat is te traag', r.gm.status === 'traag',
    r.gm.status + ' ' + r.gm.trendPerWeek);
  check('moet minder eten (positief = te veel)', r.gm.advies.kcalPerDag > 0, r.gm.advies.kcalPerDag);

  console.log('\n8. Te weinig wegingen: de oude weekvergelijking blijft staan');
  const dun = PATROON.map((g, i) => (i % 3 === 0 ? g : null));
  r = await zet(p, AANKOMEN, dun, null);
  check('geen trendlijn', r.gm.uitTrend === false, r.gm.trendDagen);
  check('oordeel komt van de week', r.gm.delta !== null);
  check('geen advies zonder trend', r.gm.advies === null);
  check('bevestiging-tekst is terug',
    /schommeling|Eén week zegt nog weinig|Twee weken op rij/.test(r.gm.tekst), r.gm.tekst);

  console.log('\n9. Geen gewichtsdoel: melding blijft uit');
  r = await zet(p, { gewichtRichting: 'uit' }, PATROON, null);
  check('status uit', r.gm.status === 'uit');
  check('geen advies', r.gm.advies === null);

  console.log('\n10. Een nul uit Apple Health telt niet als maaltijd');
  r = await p.evaluate(() => {
    const D = GD.date, st = GD.store, V = GD.voeding;
    st.reset();
    st.setSetting('voedingSync', true);
    const vandaag = D.today(), gister = D.addDays(vandaag, -1), eerder = D.addDays(vandaag, -2);
    const map = {};
    map[vandaag] = { kcal: 0, eiwit: 0, bron: 'apple-health' };
    map[gister] = { kcal: 2450, eiwit: 160, bron: 'apple-health' };
    map[eerder] = { kcal: 0, eiwit: 0, bron: 'apple-health' };
    st.putVoeding(map);
    // Zoals het in je eigen data kan staan: een nul die al eens is overgenomen.
    st.setField(eerder, 'kcal', 0);
    st.setField(eerder, 'kcalBron', 'health');
    st.setField(eerder, 'creatine', 'ja');
    const gewijzigd = V.toepassen();
    return {
      gewijzigd: gewijzigd,
      vandaagKcal: (st.entry(vandaag) || {}).kcal,
      gisterKcal: (st.entry(gister) || {}).kcal,
      gisterEiwit: (st.entry(gister) || {}).eiwitGram,
      eerderKcal: (st.entry(eerder) || {}).kcal,
      eerderBron: (st.entry(eerder) || {}).kcalBron,
      eerderCreatine: (st.entry(eerder) || {}).creatine,
      health: V.health(vandaag, 'kcal'),
      status: V.status(vandaag, 'kcal')
    };
  });
  check('een verse nul wordt niet overgenomen', r.vandaagKcal === undefined, r.vandaagKcal);
  check('een echte waarde wél', r.gisterKcal === 2450, r.gisterKcal);
  check('eiwitten idem', r.gisterEiwit === 160, r.gisterEiwit);
  check('een eerder overgenomen nul wordt opgeruimd', r.eerderKcal === undefined, r.eerderKcal);
  check('het bronmerkje gaat mee weg', r.eerderBron === undefined, r.eerderBron);
  check('de rest van die dag blijft staan', r.eerderCreatine === 'ja');
  check('health() geeft null voor een nul', r.health === null, r.health);
  check('geen "Health wijkt af"-melding', r.status.afwijkend === false);

  console.log('\n11. Een nul die je zelf intikt blijft staan');
  r = await p.evaluate(() => {
    const D = GD.date, st = GD.store, V = GD.voeding;
    st.reset();
    st.setSetting('voedingSync', true);
    const d = D.today();
    const map = {};
    map[d] = { kcal: 0, eiwit: 0, bron: 'apple-health' };
    st.putVoeding(map);
    st.setField(d, 'kcal', 0);
    st.setField(d, 'kcalBron', 'hand');
    V.toepassen();
    return { kcal: (st.entry(d) || {}).kcal, bron: (st.entry(d) || {}).kcalBron };
  });
  check('handmatige nul overleeft', r.kcal === 0, r.kcal);
  check('blijft van jou', r.bron === 'hand', r.bron);

  console.log('\n12. Nul telt niet mee in de verbruikschatting');
  r = await p.evaluate(() => {
    const D = GD.date, st = GD.store;
    st.reset();
    st.setSetting('gewichtRichting', 'aankomen');
    for (let i = 0; i < 21; i++) {
      const d = D.addDays(D.today(), -i);
      st.setField(d, 'gewicht', 74 - i * 0.03);
      st.setField(d, 'kcal', i === 3 ? 0 : 2700);
    }
    const met = GD.score.verbruik(null, st.settings());
    st.setField(D.addDays(D.today(), -3), 'kcal', null);
    const zonder = GD.score.verbruik(null, st.settings());
    return { met: met.kcalGem, zonder: zonder.kcalGem, dagenMet: met.kcalDagen };
  });
  check('een nul trekt het gemiddelde omlaag', r.met < r.zonder - 100,
    Math.round(r.met) + ' vs ' + Math.round(r.zonder));
  check('zonder die dag klopt het gemiddelde', Math.abs(r.zonder - 2700) < 1, r.zonder);

  console.log('\nPaginafouten: ' + (paginafouten.length ? paginafouten.join(' | ') : 'geen'));
  if (paginafouten.length) fout += paginafouten.length;
  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  await b.close();
  process.exit(fout ? 1 : 0);
})();
