/* Eiwitdoel dat meebeweegt met je gewicht. */
const T = require('./lib');

const BASIS = T.WORTEL;
let ok = 0, fout = 0;
function check(naam, waar, extra) {
  if (waar) { ok++; console.log('  ok  ' + naam); }
  else { fout++; console.log('  FOUT ' + naam + (extra !== undefined ? ' → ' + extra : '')); }
}

/* Zet instellingen + een reeks weegmomenten klaar en geef terug wat de app
   ervan maakt. `gewichten` is een lijst kilo's voor de laatste dagen. */
async function scenario(page, settings, gewichten) {
  return page.evaluate((arg) => {
    const D = GD.date;
    GD.store.reset();
    Object.keys(arg.settings).forEach((k) => GD.store.setSetting(k, arg.settings[k]));
    arg.gewichten.forEach((kg, i) => {
      GD.store.setField(D.addDays(D.today(), -i), 'gewicht', kg);
    });
    return GD.score.eiwitDoel(null, GD.store.settings());
  }, { settings, gewichten });
}

(async () => {
  const b = await T.lanceer();
  const p = await b.newPage();
  p.on('console', (m) => { if (m.type() === 'error') console.log('    console: ' + m.text()); });
  await p.goto(BASIS + '/index.html');
  await p.waitForTimeout(400);

  console.log('\n1. Vast doel blijft vast');
  let r = await scenario(p, { eiwitBasis: 'vast', eiwitDoel: 150, eiwitPerKg: 1.8 }, [91.4, 91.6, 91.2]);
  check('doel is het ingestelde getal', r.doel === 150, r.doel);
  check('niet afgeleid', r.afgeleid === false, r.afgeleid);
  check('weet wél wat het per kilo zou worden', r.naarGewicht === 165, r.naarGewicht);

  console.log('\n2. Doel per kilo lichaamsgewicht');
  r = await scenario(p, { eiwitBasis: 'gewicht', eiwitDoel: 150, eiwitPerKg: 1.8 }, [91.4, 91.6, 91.2]);
  check('1,8 × 91,4 kg afgerond op 5 g = 165', r.doel === 165, r.doel);
  check('gemarkeerd als afgeleid', r.afgeleid === true);
  check('rekent met het gemiddelde, niet de laatste weging',
    Math.abs(r.gewicht - 91.4) < 0.001, r.gewicht);
  check('telt alle weegmomenten in het venster', r.metingen === 3, r.metingen);

  console.log('\n3. Zwaarder worden tilt het doel mee');
  const zwaarder = await scenario(p, { eiwitBasis: 'gewicht', eiwitDoel: 150, eiwitPerKg: 1.8 }, [98, 98, 98]);
  check('98 kg geeft een hoger doel dan 91 kg', zwaarder.doel > r.doel, zwaarder.doel + ' vs ' + r.doel);

  console.log('\n4. Geen weegmomenten: terugval op het vaste getal');
  r = await scenario(p, { eiwitBasis: 'gewicht', eiwitDoel: 150, eiwitPerKg: 1.8 }, []);
  check('doel valt terug op 150', r.doel === 150, r.doel);
  check('niet afgeleid', r.afgeleid === false);

  console.log('\n5. Weging van 3 weken terug telt niet mee');
  r = await p.evaluate(() => {
    const D = GD.date;
    GD.store.reset();
    GD.store.setSetting('eiwitBasis', 'gewicht');
    GD.store.setSetting('eiwitPerKg', 1.8);
    GD.store.setSetting('eiwitDoel', 150);
    GD.store.setField(D.addDays(D.today(), -21), 'gewicht', 98);
    return GD.score.eiwitDoel(null, GD.store.settings());
  });
  check('buiten het venster van twee weken', r.doel === 150 && r.metingen === 0,
    r.doel + ' g, ' + r.metingen + ' metingen');

  console.log('\n6. De dagscore rekent met het doel van díé dag');
  r = await p.evaluate(() => {
    const D = GD.date;
    const gisteren = D.addDays(D.today(), -1);
    GD.store.reset();
    GD.store.setSetting('eiwitBasis', 'gewicht');
    GD.store.setSetting('eiwitPerKg', 1.8);
    GD.store.setSetting('eiwitDoel', 150);
    [0, 1, 2].forEach((i) => GD.store.setField(D.addDays(D.today(), -i), 'gewicht', 91.4));
    GD.store.setField(gisteren, 'eiwitGram', 160);
    const eiwitDoel = GD.goalByKey('eiwit');
    const laag = GD.score.resolveValue(GD.store.entry(gisteren), eiwitDoel, GD.store.settings());
    GD.store.setField(gisteren, 'eiwitGram', 170);
    const hoog = GD.score.resolveValue(GD.store.entry(gisteren), eiwitDoel, GD.store.settings());
    return { laag: laag.value, hoog: hoog.value };
  });
  check('160 g haalt het doel van 165 g niet', r.laag === 'nee', r.laag);
  check('170 g wel', r.hoog === 'ja', r.hoog);

  console.log('\n7. Weekafsluiting waarschuwt als een vast doel achterloopt');
  r = await p.evaluate(() => {
    const D = GD.date;
    function week(vast) {
      GD.store.reset();
      GD.store.setSetting('eiwitBasis', 'vast');
      GD.store.setSetting('eiwitDoel', vast);
      GD.store.setSetting('eiwitPerKg', 1.8);
      [0, 1, 2, 3].forEach((i) => GD.store.setField(D.addDays(D.today(), -i), 'gewicht', 91.4));
      return GD.review.maak(D.today()).eiwit.tekst;
    }
    return { laag: week(140), genoeg: week(150) };
  });
  check('140 g bij 91,4 kg (1,53 g/kg) krijgt een opmerking',
    /per kilo lichaamsgewicht/.test(r.laag), r.laag);
  check('150 g (1,64 g/kg) blijft ongemoeid',
    !/per kilo lichaamsgewicht/.test(r.genoeg), r.genoeg);

  console.log('\n8. De weekafsluiting noemt waar een afgeleid doel vandaan komt');
  r = await p.evaluate(() => {
    const D = GD.date;
    GD.store.reset();
    GD.store.setSetting('eiwitBasis', 'gewicht');
    GD.store.setSetting('eiwitPerKg', 1.8);
    /* De week vóór deze: dan liggen alle vijf de dagen in het verleden, welke
       dag van de week het vandaag ook is. */
    const start = D.addDays(D.startOfWeek(D.today()), -7);
    [0, 1, 2, 3, 4].forEach((i) => {
      const d = D.addDays(start, i);
      GD.store.setField(d, 'gewicht', 91.4);
      GD.store.setField(d, 'eiwitGram', 170);
    });
    return GD.review.maak(start).eiwit.tekst;
  });
  check('noemt de verhouding en het gewicht', /g per kilo bij 91,4 kg/.test(r), r);

  console.log('\n──────────────\ngeslaagd: ' + ok + ', gefaald: ' + fout);
  await b.close();
  process.exit(fout ? 1 : 0);
})();
