/* Alle vier de tabbladen op telefoonbreedte: geen fouten, en de pagina schuift
   nergens zijwaarts. Met je eigen back-up als die in test/prive/ staat, anders
   met twee maanden verzonnen data. */
const T = require('./lib');

const BACKUP = T.prive('backup-24.json');
let ok = 0, fout = 0;
function check(naam, waar, extra) {
  if (waar) { ok++; console.log('  ok   ' + naam); }
  else { fout++; console.log('  FOUT ' + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

/* Twee maanden met alles erin: vinkjes, water, gewicht, voeding, oefeningen. */
function verzonnen() {
  const D = GD.date, st = GD.store;
  GD.lifts.startschemasToevoegen();
  const schemas = GD.lifts.schemas();
  for (let i = 60; i >= 1; i--) {
    const d = D.addDays(D.today(), -i);
    const e = st.ensureEntry(d);
    Object.assign(e, {
      ontbijt: 'eiwitrijk', lunch: 'ja', avondeten: i % 5 ? 'eiwitrijk' : 'nee', creatine: 'ja',
      waterMl: 2000 + (i % 4) * 250, gewicht: +(71 + (60 - i) * 0.05).toFixed(1),
      kcal: 2500 + (i % 7) * 60, eiwitGram: 140 + (i % 5) * 8, gesport: i % 2 ? 'ja' : 'rustdag', _ts: 1
    });
    if (i % 2) {
      const s = schemas[i % 4 === 1 ? 0 : 1];
      e.schema = s.id;
      e.oefeningen = {};
      s.oefeningen.forEach((oid, j) => {
        const o = GD.lifts.byId(oid);
        const set = { kg: o.type === 'reps' ? undefined : 20 + j * 5 + Math.floor((60 - i) / 10), reps: 8 + (i % 3) };
        e.oefeningen[oid] = o.perArm ? { r: set, l: set } : set;
      });
    }
  }
  st.save();
  st.writeNow();
}

(async () => {
  const b = await T.lanceer();
  for (const breedte of [320, 390]) {
    const p = await b.newPage({ viewport: { width: breedte, height: 900 } });
    const fouten = [];
    p.on('console', (m) => { if (m.type() === 'error') fouten.push(m.text()); });
    p.on('pageerror', (e) => fouten.push('pageerror: ' + e.message));
    await p.goto(T.PAGINA);
    await p.waitForTimeout(300);
    if (BACKUP) await p.evaluate((json) => { GD.store.importJSON(json); GD.store.writeNow(); }, BACKUP);
    else await p.evaluate(verzonnen);
    await p.reload();
    await p.waitForTimeout(600);
    for (const view of ['dag', 'week', 'maand', 'instellingen']) {
      await p.click('.tab[data-view="' + view + '"]');
      await p.waitForTimeout(350);
      const over = await p.evaluate(() =>
        document.documentElement.scrollWidth - document.documentElement.clientWidth);
      check(breedte + ' px · ' + view + ' schuift niet zijwaarts', over <= 0, over + ' px');
    }
    check(breedte + ' px · geen fouten', fouten.length === 0, fouten);
    await p.close();
  }
  await b.close();
  console.log('\n' + ok + ' ok, ' + fout + ' fout' + (BACKUP ? ' (met je eigen back-up)' : ' (verzonnen data)'));
  process.exit(fout ? 1 : 0);
})().catch((e) => { console.error(e); process.exit(2); });
