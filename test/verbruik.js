/* Verbruik, gewoontekracht en plateaudetectie. */
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

  /* ------------------------------ verbruik ------------------------------ */
  console.log('\n1. Verbruik uit eten en gewichtstrend');

  /* 30 dagen: elke dag `kcal`, gewicht loopt met `perDag` kg op. */
  const voeding = (kcal, perDag, startKg, dagen, opties) => p.evaluate((a) => {
    const D = GD.date, st = GD.store;
    st.reset();
    st.setSetting('gewichtRichting', 'aankomen');
    st.setSetting('gewichtTempo', 0.25);
    st.setSetting('calorieDoel', a.doel === undefined ? 2200 : a.doel);
    Object.keys(a.opties || {}).forEach((k) => st.setSetting(k, a.opties[k]));
    for (let i = a.dagen - 1; i >= 0; i--) {
      const d = D.addDays(D.today(), -i);
      const nr = a.dagen - 1 - i;
      if (a.kcal !== null) st.setField(d, 'kcal', a.kcal);
      if (a.startKg !== null) st.setField(d, 'gewicht', +(a.startKg + nr * a.perDag).toFixed(2));
    }
    return GD.score.verbruik(null, st.settings());
  }, { kcal, perDag, startKg, dagen, opties, doel: (opties || {}).calorieDoel });

  // 2600 kcal, +0,25 kg/week = 0,0357 kg/dag → 275 kcal/dag opslag → 2325 verbruik
  let v = await voeding(2600, 0.25 / 7, 80, 25);
  check('is klaar met 25 dagen data', v.klaar === true, JSON.stringify({ k: v.kcalDagen, w: v.weegDagen }));
  check('trend ≈ +0,25 kg per week', Math.abs(v.perWeek - 0.25) < 0.01, v.perWeek);
  check('verbruik ≈ 2325 kcal', Math.abs(v.kcal - 2325) < 15, v.kcal);
  // Ruw zou 2600 zijn (2325 + 275), maar het doel stond op 2200 en een
  // voorstel verzet dat nooit meer dan 300 kcal per keer.
  check('voorstel afgetopt op doel + 300', v.doelKcal === 2500, v.doelKcal);

  // Onderhoud: eet 2200, gewicht blijft gelijk → verbruik 2200, doel moet omhoog
  v = await voeding(2200, 0, 80, 25);
  check('vlakke trend → verbruik = inname', Math.abs(v.kcal - 2200) < 10, v.kcal);
  check('advies is meer eten', v.advies === 'meer-eten', v.advies);
  check('doel omhoog richting 2475', Math.abs(v.doelKcal - 2475) < 30, v.doelKcal);

  // Te snel aankomen → minder eten
  // Deze kaart kijkt of je dóél klopt met je verbruik, niet of je het haalde.
  // Staat het doel ruim boven je verbruik, dan moet het omlaag.
  v = await voeding(2400, 0, 80, 25, { calorieDoel: 3500 });
  check('doel ver boven je verbruik → minder eten', v.advies === 'minder-eten', v.advies);
  check('sprong begrensd op 300 kcal', v.doelKcal === 3200, v.doelKcal + ' (doel stond op 3500)');

  console.log('\n2. Verbruik weigert te rekenen bij te weinig data');
  v = await voeding(2400, 0.03, 80, 9);
  check('9 dagen is te weinig', v.klaar === false, v.klaar);
  check('geen doelvoorstel', v.doelKcal === null, v.doelKcal);
  // De calorieën van vandaag tellen pas als de dag voorbij is (ronde 1, bevinding 7).
  check('telt wel wat er is', v.kcalDagen === 8 && v.weegDagen === 9,
    v.kcalDagen + '/' + v.weegDagen);

  v = await p.evaluate(() => {
    const D = GD.date, st = GD.store;
    st.reset();
    st.setSetting('gewichtRichting', 'aankomen');
    for (let i = 20; i >= 0; i--) st.setField(D.addDays(D.today(), -i), 'kcal', 2400);
    return GD.score.verbruik(null, st.settings());
  });
  check('calorieën zonder wegingen: niet klaar', v.klaar === false, v.klaar);
  check('en het zegt welke kant tekortschiet', v.weegDagen === 0 && v.kcalDagen === 20,
    v.kcalDagen + '/' + v.weegDagen);

  console.log('\n3. Zonder gewichtsdoel geen advies');
  v = await voeding(2600, 0.03, 80, 25, { gewichtRichting: 'uit' });
  check('verbruik wordt wel berekend', v.klaar === true, v.klaar);
  check('maar geen doelvoorstel', v.advies === 'geen-doel' && v.doelKcal === null, v.advies);

  /* --------------------------- gewoontekracht --------------------------- */
  console.log('\n4. Gewoontekracht');

  const kracht = (patroon) => p.evaluate((rijtje) => {
    const D = GD.date, st = GD.store;
    st.reset();
    st.setSetting('countMissingAsZero', true);
    rijtje.forEach((goed, i) => {
      const d = D.addDays(D.today(), -(rijtje.length - 1 - i));
      if (goed === null) return;               // niets ingevuld
      st.setField(d, 'creatine', goed ? 'ja' : 'nee');
      st.setField(d, 'ontbijt', goed ? 'eiwitrijk' : 'nee');
      st.setField(d, 'lunch', goed ? 'eiwitrijk' : 'nee');
      st.setField(d, 'avondeten', goed ? 'eiwitrijk' : 'nee');
      st.setField(d, 'gesport', goed ? 'ja' : 'nee');
      st.setField(d, 'waterMl', goed ? 3000 : 0);
      st.setField(d, 'eiwitGram', goed ? 200 : 0);
      st.setField(d, 'kcal', goed ? 2000 : 9000);
      if (goed) { st.setField(d, 'postworkout', 'eiwitrijk'); st.setField(d, 'overload', 'ja'); }
      else { st.setField(d, 'postworkout', 'nee'); st.setField(d, 'overload', 'nee'); }
    });
    const k = GD.score.kracht(null);
    const opDag = (n) => {
      const doel = D.addDays(D.today(), -n);
      let uit = null;
      k.reeks.forEach((r) => { if (r.datum <= doel) uit = r.waarde; });
      return uit;
    };
    return { totaal: k.totaal, dagen: k.dagen, perDoel: k.perDoel.length,
      reeks: k.reeks.length, opDag16: opDag(16) };
  }, patroon);

  const perfect = Array(30).fill(true);
  let k = await kracht(perfect);
  check('30 perfecte dagen ≈ 100', Math.round(k.totaal) === 100, k.totaal);

  const eenMisser = perfect.slice(); eenMisser[29] = false;
  k = await kracht(eenMisser);
  check('één slechte dag kost een paar punten, geen reset',
    k.totaal > 90 && k.totaal < 97, k.totaal);

  const vierGemist = perfect.slice();
  [22, 23, 24, 25].forEach((i) => { vierGemist[i] = null; });
  k = await kracht(vierGemist);
  check('vier dagen niets invullen is een deuk, geen sloopkogel',
    k.totaal > 60 && k.totaal < 90, k.totaal);

  k = await kracht(Array(30).fill(false));
  check('30 slechte dagen ≈ 0', k.totaal < 8, k.totaal);

  k = await kracht(Array(5).fill(true));
  check('vijf perfecte dagen leest al als sterk, niet als 29',
    k.totaal > 90, k.totaal);

  console.log('\n5. Kracht herstelt na een dip');
  // Vier slechte dagen midden in een verder vlekkeloze reeks: de kracht zakt
  // zichtbaar en klimt daarna terug. Alle doelen worden ingevuld, anders meet
  // je vooral de lege doelen.
  const dipEnHerstel = Array(40).fill(true);
  [20, 21, 22, 23].forEach((i) => { dipEnHerstel[i] = false; });
  k = await kracht(dipEnHerstel);
  check('tijdens de dip lager dan nu', k.opDag16 < k.totaal - 10,
    'dip ' + Math.round(k.opDag16) + ', nu ' + Math.round(k.totaal));
  check('en nu weer hoog', k.totaal > 90, k.totaal);

  console.log('\n6. Rustdagen straffen je gewoontes niet af');
  k = await p.evaluate(() => {
    const D = GD.date, st = GD.store;
    st.reset();
    for (let i = 19; i >= 0; i--) {
      const d = D.addDays(D.today(), -i);
      st.setField(d, 'creatine', 'ja');
      // Alleen rustdagen: post-workout telt nooit mee.
      st.setField(d, 'gesport', 'rustdag');
    }
    const kk = GD.score.kracht(null);
    const pw = kk.perDoel.filter((x) => x.key === 'postworkout');
    const cr = kk.perDoel.filter((x) => x.key === 'creatine')[0];
    return { postworkout: pw.length, creatine: Math.round(cr.pct) };
  });
  check('post-workout komt niet in de lijst op louter rustdagen', k.postworkout === 0, k.postworkout);
  check('creatine staat gewoon op 100', k.creatine === 100, k.creatine);

  /* ------------------------------- plateau ------------------------------ */
  console.log('\n7. Plateaudetectie');

  const plat = (sets) => p.evaluate((rijtje) => {
    const D = GD.date, st = GD.store, L = GD.lifts;
    st.reset();
    const oid = L.addOefening('Bicep curls');
    rijtje.forEach((s, i) => {
      const d = D.addDays(D.today(), -7 * (rijtje.length - 1 - i));
      L.setVeld(d, oid, '', 'kg', s[0]);
      L.setVeld(d, oid, '', 'reps', s[1]);
    });
    const pl = L.plateau(oid, '', null);
    return { sessies: pl.sessies, niveau: pl.niveau, deloadKg: pl.deloadKg,
      reeks: pl.reeks.length, rm: pl.laatste1rm };
  }, sets);

  let pl = await plat([[23, 10], [23, 12], [23, 14], [23, 15]]);
  check('elke sessie vooruit → geen plateau', pl.niveau === 'geen' && pl.sessies === 0,
    JSON.stringify(pl));

  pl = await plat([[23, 10], [23, 15], [23, 15], [23, 15], [23, 15]]);
  check('drie sessies stil → let op', pl.niveau === 'let-op' && pl.sessies === 3,
    JSON.stringify(pl));
  check('geen deload-gewicht bij let op', pl.deloadKg === null, pl.deloadKg);

  pl = await plat([[55, 9], [60, 9], [60, 9], [60, 9], [60, 9], [60, 9], [60, 9], [60, 9]]);
  check('zes sessies stil → deload', pl.niveau === 'deload' && pl.sessies === 6,
    JSON.stringify(pl));
  check('deload naar 52,5 kg (60 is een veelvoud van 2,5)', pl.deloadKg === 52.5, pl.deloadKg);

  pl = await plat([[23, 8], [26.3, 8], [26.3, 8], [26.3, 8], [26.3, 8], [26.3, 8], [26.3, 8], [26.3, 8]]);
  check('bij 26,3 kg volgt het advies stappen van 0,5', pl.deloadKg === 23.5, pl.deloadKg);

  pl = await plat([[23, 15], [23, 15], [23, 15], [26.3, 8]]);
  check('een nieuw record breekt het plateau', pl.niveau === 'geen' && pl.sessies === 0,
    JSON.stringify(pl));

  console.log('\n8. Wegklikken tot het langer stilstaat');
  pl = await p.evaluate(() => {
    const D = GD.date, st = GD.store, L = GD.lifts;
    st.reset();
    const oid = L.addOefening('Bicep curls');
    [[23, 10], [23, 15], [23, 15], [23, 15], [23, 15]].forEach((s, i) => {
      const d = D.addDays(D.today(), -7 * (4 - i));
      L.setVeld(d, oid, '', 'kg', s[0]); L.setVeld(d, oid, '', 'reps', s[1]);
    });
    const voor = L.plateau(oid, '', null);
    L.plateauWegklikken(oid, voor.sessies);
    const na = L.plateau(oid, '', null);
    return { sessies: na.sessies, gemeld: na.gemeld, stil: na.sessies <= na.gemeld };
  });
  check('na wegklikken stil', pl.stil === true, JSON.stringify(pl));
  check('maar de telling loopt door', pl.sessies === 3 && pl.gemeld === 3, JSON.stringify(pl));

  console.log('\n9. De app rendert alle drie zonder fouten');
  await p.evaluate(() => {
    const D = GD.date, st = GD.store, L = GD.lifts;
    st.reset();
    st.setSetting('gewichtRichting', 'aankomen');
    st.setSetting('calorieDoel', 2200);
    const oid = L.addOefening('Bicep curls');
    for (let i = 29; i >= 0; i--) {
      const d = D.addDays(D.today(), -i);
      st.setField(d, 'kcal', 2300);
      st.setField(d, 'gewicht', +(82 + (29 - i) * 0.01).toFixed(2));
      st.setField(d, 'creatine', 'ja');
      st.setField(d, 'gesport', i % 3 ? 'ja' : 'rustdag');
      st.setField(d, 'eiwitGram', 140);
    }
    [[23, 15], [23, 15], [23, 15], [23, 15], [23, 15], [23, 15], [23, 15]].forEach((s, i) => {
      const d = D.addDays(D.today(), -3 * (6 - i));
      L.setVeld(d, oid, '', 'kg', s[0]); L.setVeld(d, oid, '', 'reps', s[1]);
    });
  });
  for (const view of ['dag', 'week', 'maand', 'instellingen']) {
    await p.click('.tab[data-view="' + view + '"]');
    await p.waitForTimeout(350);
    const leeg = await p.evaluate(() => document.querySelector('#view').innerHTML.length);
    check(view + ' rendert (' + leeg + ' tekens)', leeg > 500, leeg);
  }
  await p.click('.tab[data-view="week"]');
  await p.waitForTimeout(500);
  const zichtbaar = await p.evaluate(() => ({
    verbruik: /Verbruik/.test(document.body.textContent),
    kracht: /Gewoontekracht/.test(document.body.textContent),
    plateau: /sessies niet vooruit|Vastgelopen/.test(document.body.textContent)
  }));
  check('verbruikkaart staat er', zichtbaar.verbruik === true, JSON.stringify(zichtbaar));
  check('krachtkaart staat er', zichtbaar.kracht === true, JSON.stringify(zichtbaar));
  check('plateaumelding staat er', zichtbaar.plateau === true, JSON.stringify(zichtbaar));

  if (fouten.length) { fout++; console.log('\n  FOUT console: ' + fouten.join(' | ')); }
  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  await b.close();
  process.exit(fout ? 1 : 0);
})();
