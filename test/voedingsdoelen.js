/* Glijdende schaal voor eiwit en calorieën. */
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
  p.on('console', (m) => { if (m.type() === 'error') console.log('    console: ' + m.text()); });
  await p.goto(BASIS + '/index.html');
  await p.waitForTimeout(400);

  /* Rustdag met alles behalve voeding op orde, op `dag` (0 = vandaag). */
  async function dag(eiwitGram, kcal, terug, extraSettings) {
    return p.evaluate((a) => {
      const D = GD.date, st = GD.store;
      const t = D.addDays(D.today(), -(a.terug || 0));
      st.reset();
      st.setSetting('eiwitBasis', 'vast');
      st.setSetting('eiwitDoel', 150);
      st.setSetting('calorieDoel', 2200);
      st.setSetting('calorieRichting', 'max');
      st.setSetting('calorieMarge', 150);
      st.setSetting('waterDoel', 3000);
      Object.keys(a.extra || {}).forEach((k) => st.setSetting(k, a.extra[k]));
      st.setField(t, 'gesport', 'rustdag');
      st.setField(t, 'creatine', 'ja');
      st.setField(t, 'ontbijt', 'eiwitrijk');
      st.setField(t, 'lunch', 'eiwitrijk');
      st.setField(t, 'avondeten', 'eiwitrijk');
      st.setField(t, 'waterMl', 3000);
      if (a.eiwitGram !== null) st.setField(t, 'eiwitGram', a.eiwitGram);
      if (a.kcal !== null) st.setField(t, 'kcal', a.kcal);
      const d = GD.score.scoreDay(t, a.terug === 0);
      const ov = GD.score.dagOverzicht(d);
      const pak = (k) => {
        const i = d.items.filter((x) => x.key === k)[0];
        return { frac: i.frac, score: i.score, telt: i.included, reden: i.reason, waarde: i.value };
      };
      return {
        vloer: Math.round(ov.vloerPct), plafond: Math.round(ov.plafondPct),
        eind: d.pct === null ? null : Math.round(d.pct),
        eiwit: pak('eiwit'), kcal: pak('calorieen')
      };
    }, { eiwitGram, kcal, terug, extra: extraSettings });
  }

  console.log('\n1. Lopende dag: eiwit halverwege');
  let r = await dag(75, null, 0);
  check('eiwit is 50%', Math.round(r.eiwit.frac * 100) === 50, r.eiwit.frac);
  check('telt nog niet mee vandaag', r.eiwit.telt === false && r.eiwit.reden === 'nog bezig', r.eiwit.reden);
  check('plafond blijft 100%', r.plafond === 100, r.plafond);
  // 5 vaste punten + de helft van eiwit (1 van 2) = 6 van 8,5.
  check('vloer stijgt van 59% naar 71%', r.vloer === 71, r.vloer);

  console.log('\n2. Lopende dag: eiwit bijna binnen');
  r = await dag(140, null, 0);
  check('eiwit is 93%', Math.round(r.eiwit.frac * 100) === 93, r.eiwit.frac);
  check('plafond blijft 100%', r.plafond === 100, r.plafond);

  console.log('\n3. Afgeronde dag: 140 van de 150 gram');
  r = await dag(140, 2000, 1);
  check('eiwit telt mee', r.eiwit.telt === true, r.eiwit.reden);
  check('eiwit scoort 0,93', Math.abs(r.eiwit.score - 140 / 150) < 0.001, r.eiwit.score);
  check('calorieën onder het doel scoren 1', r.kcal.score === 1, r.kcal.score);
  // 1+3+1 = 5 vast, eiwit 0,933*2 = 1,867, kcal 1,5 → 8,367 / 8,5
  check('dagscore 98% in plaats van 82%', r.eind === 98, r.eind);

  console.log('\n4. Afgeronde dag: eiwit helemaal niet gehaald');
  r = await dag(30, 2000, 1);
  check('eiwit scoort 0,2', Math.abs(r.eiwit.score - 0.2) < 0.001, r.eiwit.score);
  check('dagscore zakt naar 81%', r.eind === 81, r.eind);

  console.log('\n5. Calorieën boven het doel (richting max, speling 440)');
  r = await dag(150, 2350, 0);
  check('150 kcal over → 0,66', Math.abs(r.kcal.frac - (1 - 150 / 440)) < 0.005, r.kcal.frac);
  check('overschrijding ligt vast, telt meteen mee', r.kcal.telt === true, r.kcal.reden);
  r = await dag(150, 2700, 0);
  check('500 kcal over → 0', r.kcal.frac === 0, r.kcal.frac);
  r = await dag(150, 1800, 0);
  check('onder het doel staat nog open vandaag', r.kcal.telt === false && r.kcal.reden === 'nog bezig', r.kcal.reden);
  r = await dag(150, 1800, 1);
  check('onder het doel is op een afgeronde dag gewoon 1', r.kcal.score === 1, r.kcal.score);

  console.log('\n6. Calorierichting "min" telt naar rato');
  r = await dag(150, 1100, 1, { calorieRichting: 'min' });
  check('1100 van 2200 → 0,5', Math.abs(r.kcal.frac - 0.5) < 0.001, r.kcal.frac);
  r = await dag(150, 2400, 1, { calorieRichting: 'min' });
  check('ruim boven een minimum → 1', r.kcal.frac === 1, r.kcal.frac);

  console.log('\n7. Calorierichting "rond": marge eerst, dan aflopend');
  r = await dag(150, 2300, 1, { calorieRichting: 'rond' });
  check('binnen de marge van 150 → 1', r.kcal.frac === 1, r.kcal.frac);
  r = await dag(150, 2500, 1, { calorieRichting: 'rond' });
  check('150 buiten de marge → 0,66', Math.abs(r.kcal.frac - (1 - 150 / 440)) < 0.005, r.kcal.frac);
  r = await dag(150, 1900, 1, { calorieRichting: 'rond' });
  check('even ver eronder scoort hetzelfde', Math.abs(r.kcal.frac - (1 - 150 / 440)) < 0.005, r.kcal.frac);

  console.log('\n8. Handmatig aanklikken blijft ja of nee');
  r = await p.evaluate(() => {
    const D = GD.date, st = GD.store, t = D.addDays(D.today(), -1);
    st.reset();
    st.setSetting('eiwitDoel', 150);
    st.setField(t, 'eiwitGram', 140);
    st.setField(t, 'eiwit', 'nee');
    const i = GD.score.scoreDay(t, false).items.filter((x) => x.key === 'eiwit')[0];
    return { score: i.score, auto: i.auto, frac: i.frac };
  });
  check('eigen antwoord wint van de meting', r.score === 0 && r.auto === false, JSON.stringify(r));
  check('geen glijdende schaal bij een eigen antwoord', r.frac === null, r.frac);

  console.log('\n9. Leeg blijft leeg');
  r = await dag(null, null, 0);
  check('lopende dag: nog niet ingevuld', r.eiwit.reden === 'nog niet ingevuld', r.eiwit.reden);
  check('plafond 100%', r.plafond === 100, r.plafond);
  r = await dag(null, null, 1);
  check('afgeronde dag: telt als 0', r.eiwit.telt === true && r.eiwit.score === 0, JSON.stringify(r.eiwit));
  check('dagscore 59%, net als eerst', r.eind === 59, r.eind);

  console.log('\n10. Water werkt nog precies zoals eerst');
  r = await p.evaluate(() => {
    const D = GD.date, st = GD.store, t = D.today();
    st.reset();
    st.setSetting('waterDoel', 3000);
    st.setField(t, 'waterMl', 1500);
    const d = GD.score.scoreDay(t, true);
    const ov = GD.score.dagOverzicht(d);
    const i = d.items.filter((x) => x.key === 'water')[0];
    return { frac: i.frac, reden: i.reason, binnen: +ov.binnen.toFixed(2), open: +ov.open.toFixed(2) };
  });
  check('halve fles = 0,5', r.frac === 0.5, r.frac);
  check('nog bezig', r.reden === 'nog bezig', r.reden);
  check('halve punt binnen', r.binnen === 0.5, r.binnen);

  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  await b.close();
  process.exit(fout ? 1 : 0);
})();
