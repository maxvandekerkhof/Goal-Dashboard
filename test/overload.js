/* Vooruitgang beoordelen als je reps tegen kilo's ruilt. */
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

  /* nuKg × nuReps na vorKg × vorReps, met `rec` als zwaarste ooit ervoor. */
  const v = (nuKg, nuReps, vorKg, vorReps, rec) => p.evaluate((a) => {
    const d = GD.lifts.vergelijkDetail({ kg: a[0], reps: a[1] }, { kg: a[2], reps: a[3] },
      a[4] === undefined ? a[2] : a[4]);
    return { status: d.status, ruil: d.ruil, record: d.record,
      nu: +d.nu1rm.toFixed(1), vorig: +d.vorig1rm.toFixed(1), pct: Math.round(d.verschil * 100) };
  }, [nuKg, nuReps, vorKg, vorReps, rec]);

  console.log('\n1. Bicep curls: 23 kg × 15 → 26,3 kg × 8');
  let r = await v(26.3, 8, 23, 15);
  check('nieuw record op deze oefening', r.record === true, JSON.stringify(r));
  check('telt als vooruit', r.status === 'vooruit', r.status);

  console.log('\n2. Een record moet wel een echte set zijn');
  r = await v(26.3, 7, 23, 15);  // 7 van 15 is net onder de helft
  check('26,3 × 7 haalt de helft niet, dus geen recordregel', r.record === false, JSON.stringify(r));
  check('valt terug op 1RM: 30% eronder is terug', r.status === 'terug', r.status + ' ' + r.pct + '%');
  r = await v(30, 2, 23, 15);
  check('30 kg × 2 is geen vooruitgang', r.status === 'terug', r.status + ' ' + r.pct + '%');
  r = await v(26.3, 8, 23, 15, 26.3);
  check('hetzelfde gewicht als je record is geen nieuw record', r.record === false, JSON.stringify(r));

  console.log('\n3. Elke stijging in 1RM telt nu, ook zonder record');
  r = await v(25, 12, 26.3, 8, 26.3);  // lichter dan het record, maar meer reps
  check('25 × 12 na 26,3 × 8 is vooruit', r.status === 'vooruit', r.status + ' ' + r.pct + '%');
  r = await v(22, 18, 23, 15, 23);
  check('22 × 18 is 2% erboven, dus vooruit', r.status === 'vooruit', r.status + ' ' + r.pct + '%');

  console.log('\n4. Terugval blijft terugval, maar pas onder de 5%');
  r = await v(22, 16, 23, 15, 23);
  check('22 × 16 is 2% eronder: gelijk, geen terug', r.status === 'gelijk', r.status + ' ' + r.pct + '%');
  r = await v(20, 15, 23, 15, 23);  // allebei niet omhoog
  check('puur lichter is gewoon terug', r.status === 'terug' && r.ruil === false, r.status);
  r = await v(21, 14, 23, 16, 23);
  check('allebei omlaag is terug', r.status === 'terug' && r.ruil === false, r.status);

  console.log('\n5. Zonder ruil verandert er niets');
  r = await v(45, 10, 45, 10, 45);
  check('gelijk blijft gelijk', r.status === 'gelijk' && r.ruil === false, JSON.stringify(r));
  r = await v(45, 11, 45, 10, 45);
  check('reps omhoog is vooruit', r.status === 'vooruit' && r.ruil === false, r.status);
  r = await v(47.5, 10, 45, 10, 45);
  check('kilo’s omhoog is vooruit', r.status === 'vooruit' && r.ruil === false, r.status);

  console.log('\n6. Oefeningen zonder gewicht (pull-ups)');
  r = await v(0, 9, 0, 8, 0);
  check('meer reps is vooruit', r.status === 'vooruit', r.status);
  r = await v(0, 7, 0, 8, 0);
  check('minder reps is terug', r.status === 'terug', r.status);
  check('nooit een record op 0 kg', r.record === false, r.record);

  console.log('\n7. Door de echte opslag heen');
  r = await p.evaluate(() => {
    const D = GD.date, st = GD.store, L = GD.lifts;
    st.reset();
    const oid = L.addOefening('Bicep curls');
    const d1 = D.addDays(D.today(), -21), d2 = D.addDays(D.today(), -7), t = D.today();
    const zet = (dag, kg, reps) => { L.setVeld(dag, oid, '', 'kg', kg); L.setVeld(dag, oid, '', 'reps', reps); };
    zet(d1, 23, 10); zet(d2, 23, 15); zet(t, 26.3, 8);
    const res = L.dagResultaat(t);
    const ctx = L.context(t, oid, '');
    return { status: res.regels[0].status, record: res.regels[0].detail.record,
      recordKg: ctx.recordKg, waarde: res.waarde };
  });
  check('record vóór vandaag is 23 kg', r.recordKg === 23, r.recordKg);
  check('vandaag staat op vooruit', r.status === 'vooruit', r.status);
  check('het dagdoel wordt ja', r.waarde === 'ja', r.waarde);

  console.log('\n8. Een record telt maar één keer, niet elke keer opnieuw');
  r = await p.evaluate(() => {
    const D = GD.date, st = GD.store, L = GD.lifts;
    st.reset();
    const oid = L.addOefening('Bicep curls');
    const dagen = [-28, -21, -14, -7, 0].map((n) => D.addDays(D.today(), n));
    const zet = (dag, kg, reps) => { L.setVeld(dag, oid, '', 'kg', kg); L.setVeld(dag, oid, '', 'reps', reps); };
    // Heen en weer springen tussen dezelfde twee sets.
    zet(dagen[0], 23, 15); zet(dagen[1], 26.3, 8); zet(dagen[2], 23, 15);
    zet(dagen[3], 26.3, 8); zet(dagen[4], 23, 15);
    return dagen.slice(1).map((d) => L.dagResultaat(d).regels[0].status);
  });
  check('eerste keer 26,3 kg is vooruit', r[0] === 'vooruit', r.join(','));
  check('daarna geen gratis vooruit meer op datzelfde gewicht', r[2] !== 'vooruit', r.join(','));

  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  await b.close();
  process.exit(fout ? 1 : 0);
})();
