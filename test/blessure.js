/* Blessure: werkt als een rustdag. Niet sporten telt dan niet als misser, en
   progressive overload en de post-workout maaltijd vallen weg. Met verzonnen
   data, geen eigen data nodig. Vandaag is 25 oktober. */
const T = require('./lib');

let ok = 0, fout = 0;
function check(naam, waar, extra) {
  if (waar) { ok++; console.log('  ok   ' + naam); }
  else { fout++; console.log('  FOUT ' + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

async function main() {
  const browser = await T.lanceer();
  const ctx = await browser.newContext({ viewport: { width: 393, height: 900 } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on('pageerror', (e) => fouten.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.clock.install({ time: new Date('2026-10-25T10:00:00') });
  await page.goto(T.PAGINA);

  console.log('\nDe score');
  {
    const r = await page.evaluate(() => {
      const st = GD.store, S = GD.score;
      // Twee dagen met precies dezelfde vinkjes; alleen "gesport" verschilt.
      ['2026-10-20', '2026-10-21', '2026-10-22'].forEach((d) => {
        st.setField(d, 'creatine', 'ja');
        st.setField(d, 'ontbijt', 'eiwitrijk');
        st.setField(d, 'lunch', 'ja');
        st.setField(d, 'avondeten', 'nee');
      });
      st.setField('2026-10-20', 'gesport', 'rustdag');
      st.setField('2026-10-21', 'gesport', 'blessure');
      st.setField('2026-10-22', 'gesport', 'nee');
      const item = (dag, key) => dag.items.filter((i) => i.key === key)[0];
      const rust = S.scoreDay('2026-10-20', false), bles = S.scoreDay('2026-10-21', false), nee = S.scoreDay('2026-10-22', false);
      return {
        rust: rust.pct, bles: bles.pct, nee: nee.pct, max: [rust.max, bles.max],
        gesport: { included: item(bles, 'gesport').included, reden: item(bles, 'gesport').reason },
        overload: item(bles, 'overload').reason, post: item(bles, 'postworkout').reason,
        vlag: bles.blessure, rustVlag: bles.restDay, getraind: bles.trained
      };
    });
    check('een blessuredag scoort precies als een rustdag', r.rust === r.bles && r.max[0] === r.max[1], r);
    check('en hoger dan "nee"', r.bles > r.nee, r);
    check('gesport telt niet mee', r.gesport.included === false && r.gesport.reden === 'blessure', r.gesport);
    check('overload en post-workout vallen weg, met "blessure" als reden',
      r.overload === 'blessure' && r.post === 'blessure', [r.overload, r.post]);
    check('herkenbaar als blessure, niet als rustdag of training', r.vlag && !r.rustVlag && !r.getraind, r);
  }

  console.log('\nReeks en tellingen');
  {
    const r = await page.evaluate(() => {
      const st = GD.store, S = GD.score, D = GD.date;
      st.reset();
      st.setSetting('goedeDagDrempel', 70);
      D.range('2026-10-15', '2026-10-24').forEach((d) => {
        ['creatine', 'gesport', 'overload', 'eiwit', 'calorieen'].forEach((k) => st.setField(d, k, 'ja'));
        ['ontbijt', 'lunch', 'avondeten', 'postworkout'].forEach((k) => st.setField(d, k, 'eiwitrijk'));
        st.setField(d, 'waterMl', 3000);
      });
      ['2026-10-19', '2026-10-20', '2026-10-21'].forEach((d) => st.setField(d, 'gesport', 'blessure'));
      const p = S.scorePeriod(D.range('2026-10-15', '2026-10-24'));
      return { streak: S.currentStreak(), goed: p.stats.goodDays, blessure: p.stats.blessureDays, rust: p.stats.restDays, getraind: p.stats.trainDays,
        maand: GD.review.maakMaand('2026-10-24').nu.blessureDagen };
    });
    check('drie blessuredagen breken je reeks niet', r.streak === 10, r.streak);
    check('en zijn zelf ook goede dagen', r.goed === 10, r.goed);
    check('ze tellen apart: niet als training, niet als rustdag', r.blessure === 3 && r.rust === 0 && r.getraind === 7, r);
    check('ook in de maandafsluiting', r.maand === 3, r.maand);
  }

  console.log('\nOp het scherm');
  {
    await page.evaluate(() => GD.store.writeNow());
    await page.reload();
    await page.click('[data-nav="prev"]');                       // 24 okt
    await page.click('[data-action="set-goal"][data-goal="gesport"][data-value="blessure"]');
    const knop = await page.getAttribute('[data-action="set-goal"][data-goal="gesport"][data-value="blessure"]', 'aria-pressed');
    const tekst = await page.textContent('main');
    check('een knop Blessure bij Gesport', knop === 'true');
    check('een chip "blessure" bovenaan', /blessure/.test(await page.textContent('.hero-chips')));
    check('oefeningen: geblesseerd, niets bij te houden', /Geblesseerd, dus vandaag niets bij te houden/.test(tekst));

    await page.click('[data-nav="today"]');
    await page.click('[data-action="copy-yesterday"]');
    const vandaag = await page.evaluate(() => GD.store.entry(GD.date.today()).gesport);
    check('"Neem gisteren over" neemt de blessure mee', vandaag === 'blessure', vandaag);

    await page.click('.tab[data-view="week"]');
    const tegel = await page.textContent('.stats');
    // 19, 20 en 21 okt, 24 okt hierboven en vandaag: vijf in deze week.
    check('de weektegel noemt de blessuredagen', /0 rustdagen · 5 dagen blessure/.test(tegel), tegel);

    await page.click('.tab[data-view="maand"]');
    check('de maandafsluiting legt uit waarom je minder trainde',
      /5 dagen kon je niet trainen door een blessure/.test(await page.textContent('.review')));

    const breed = await page.evaluate(() => document.documentElement.scrollWidth);
    check('vier knoppen passen op een telefoon', breed <= 393, breed);
  }

  check('geen fouten', !fouten.length, fouten);
  await ctx.close();
  await browser.close();
  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
