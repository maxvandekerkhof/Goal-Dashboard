/* De maandafsluiting: september naast augustus, met een caloriedoel dat twee
   keer verzet werd. Met verzonnen data, geen eigen data nodig.

   Augustus: 2600 kcal, +0,45 kg per week, om de dag getraind.
   September: op 1 sep doel 2530, op 10 sep waterdoel 3500, op 29 sep doel
   2360. Gewicht +0,40 kg per week. Een record op bankdrukken.
   Oktober: 2360 kcal, +0,20 kg per week. */
const T = require('./lib');

let ok = 0, fout = 0;
function check(naam, waar, extra) {
  if (waar) { ok++; console.log('  ok   ' + naam); }
  else { fout++; console.log('  FOUT ' + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

async function pagina(browser, tijd) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 900 } });
  const page = await ctx.newPage();
  page.fouten = [];
  page.on('pageerror', (e) => page.fouten.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.clock.install({ time: new Date(tijd) });
  await page.goto(T.PAGINA);
  return { ctx, page };
}

async function op(page, dag) {
  await page.clock.setSystemTime(new Date(dag + 'T10:00:00'));
}

/* Dagen van `van` t/m `tot` invullen; gewicht loopt op met `perWeek` vanaf
   `kg0` op `van`. */
async function vul(page, van, tot, kcal, kg0, perWeek) {
  await page.evaluate(({ van, tot, kcal, kg0, perWeek }) => {
    const st = GD.store, D = GD.date;
    D.range(van, tot).forEach((d) => {
      const i = D.dagenTussen(van, d);
      st.setField(d, 'kcal', kcal);
      st.setField(d, 'eiwitGram', 160);
      st.setField(d, 'creatine', 'ja');
      st.setField(d, 'gesport', i % 2 ? 'rustdag' : 'ja');
      st.setField(d, 'gewicht', +(kg0 + i * perWeek / 7).toFixed(2));
    });
  }, { van, tot, kcal, kg0, perWeek });
}

async function teken(page, view) {
  await page.evaluate(() => GD.store.writeNow());
  await page.reload();
  if (view) await page.click('[data-view="' + view + '"]');
}

async function bouw(browser, eind) {
  const { ctx, page } = await pagina(browser, '2026-08-01T10:00:00');
  await page.evaluate(() => {
    const st = GD.store;
    st.setSetting('gewichtRichting', 'aankomen');
    st.setSetting('gewichtTempo', 0.25);
    st.setSetting('calorieRichting', 'max');
    st.setSetting('calorieDoel', 2600);
    st.setSetting('eiwitDoel', 150);
    const id = GD.lifts.addOefening('Bankdrukken');
    GD.lifts.setVeld('2026-08-05', id, '', 'kg', 60);
    GD.lifts.setVeld('2026-08-05', id, '', 'reps', 6);
    GD.lifts.setVeld('2026-09-02', id, '', 'kg', 60);
    GD.lifts.setVeld('2026-09-02', id, '', 'reps', 7);
    GD.lifts.setVeld('2026-09-15', id, '', 'kg', 62.5);
    GD.lifts.setVeld('2026-09-15', id, '', 'reps', 6);
  });
  await vul(page, '2026-08-01', '2026-08-31', 2600, 71.0, 0.45);
  await op(page, '2026-09-01');
  await page.evaluate(() => GD.store.zetCalorieDoel(2530));
  await op(page, '2026-09-10');
  await page.evaluate(() => GD.store.setSetting('waterDoel', 3500));
  await op(page, '2026-09-29');
  await page.evaluate(() => GD.store.zetCalorieDoel(2360));
  await vul(page, '2026-09-01', '2026-09-28', 2530, 73.0, 0.40);
  await vul(page, '2026-09-29', '2026-09-30', 2360, 73.0 + 28 * 0.40 / 7, 0.40);
  if (eind > '2026-10-01') {
    await vul(page, '2026-10-01', '2026-10-31', 2360, 73.0 + 30 * 0.40 / 7, 0.20);
  }
  await op(page, eind);
  return { ctx, page };
}

async function main() {
  const browser = await T.lanceer();

  console.log('\nHet logboek van je doelen');
  {
    const { ctx, page } = await pagina(browser, '2026-09-10T10:00:00');
    const r = await page.evaluate(() => {
      const st = GD.store;
      st.setSetting('waterDoel', 3500);
      const een = st.settings().doelLog.slice();
      st.setSetting('waterDoel', 4000);
      const twee = st.settings().doelLog.slice();
      st.setSetting('waterDoel', 3000);                 // dezelfde dag terug
      const terug = st.settings().doelLog.slice();
      st.setSetting('theme', 'light');                  // geen doel
      return { een, twee, terug, na: st.settings().doelLog.slice() };
    });
    check('een aanpassing komt in het logboek', r.een.length === 1 && r.een[0].van === 3000 &&
      r.een[0].naar === 3500 && r.een[0].datum === '2026-09-10', r.een);
    check('twee keer op één dag is één aanpassing', r.twee.length === 1 && r.twee[0].van === 3000 &&
      r.twee[0].naar === 4000, r.twee);
    check('dezelfde dag terugzetten is geen aanpassing', r.terug.length === 0, r.terug);
    check('een thema is geen doel', r.na.length === 0, r.na);

    // Een oude back-up zonder logboek laadt gewoon.
    await page.evaluate(() => {
      GD.store.writeNow();
      const ruw = JSON.parse(localStorage.getItem(GD.STORAGE_KEY));
      delete ruw.settings.doelLog;
      ruw.settings.calorieDoel = 2400;
      localStorage.setItem(GD.STORAGE_KEY, JSON.stringify(ruw));
    });
    await page.reload();
    const oud = await page.evaluate(() => ({
      log: GD.store.settings().doelLog, doel: GD.score.calorieDoelOp('2026-01-01')
    }));
    check('oude back-up: leeg logboek, doel blijft', Array.isArray(oud.log) && !oud.log.length &&
      oud.doel === 2400, oud);
    await ctx.close();
  }

  console.log('\nHet caloriedoel van díé dag');
  {
    const { ctx, page } = await bouw(browser, '2026-10-01');
    const r = await page.evaluate(() => {
      const S = GD.score;
      const kcalItem = (d) => S.scoreDay(d).items.filter((i) => i.key === 'calorieen')[0];
      return {
        aug: S.calorieDoelOp('2026-08-20'), sep: S.calorieDoelOp('2026-09-15'),
        wissel: S.calorieDoelOp('2026-09-29'), nu: S.calorieDoelOp('2026-10-01'),
        dag15: kcalItem('2026-09-15').score, dag30: kcalItem('2026-09-30').score
      };
    });
    check('augustus op 2600, september op 2530, vanaf 29 sep 2360',
      r.aug === 2600 && r.sep === 2530 && r.wissel === 2360 && r.nu === 2360, r);
    check('15 sep (2530 gegeten) telt als gehaald, ook al staat je doel nu op 2360', r.dag15 === 1, r);
    check('30 sep (2360 gegeten) ook', r.dag30 === 1, r);

    await teken(page);
    await page.click('[data-view="dag"]');
    const hint = await page.evaluate(() => {
      GD.store.setSetting('calorieDoel', GD.store.settings().calorieDoel); // niets
      return true;
    });
    check('pagina zonder fouten', hint && !page.fouten.length, page.fouten);
    await ctx.close();
  }

  console.log('\nOp 1 oktober: september op de dagpagina');
  {
    const { ctx, page } = await bouw(browser, '2026-10-01');
    const m = await page.evaluate(() => GD.review.maakMaand('2026-09-15'));
    check('september is af', !m.nu.loopt && m.nu.geweest === 30, m.nu);
    check('alle 30 dagen caloriedoel gehaald', m.nu.kcalDagen === 30 && m.nu.kcalGehaald === 30, m.nu);
    check('gemiddeld rond 2519 kcal', Math.round(m.nu.kcalGem) === 2519, m.nu.kcalGem);
    check('augustus erbij om te vergelijken', m.vorig && Math.round(m.vorig.kcalGem) === 2600, m.vorig);
    check('gewichtslijn door september +0,40 per week', Math.abs(m.nu.perWeek - 0.40) < 0.02, m.nu.perWeek);
    check('begin- en eindweek liggen ruim 1,3 kg uit elkaar', m.nu.verschil > 1.3 && m.nu.verschil < 1.5, m.nu.verschil);
    check('training: 15 keer in september', m.nu.trainDagen === 15, m.nu.trainDagen);
    check('record op bankdrukken, 62,5 × 6', m.kracht.records.length === 1 &&
      m.kracht.records[0].kg === 62.5 && m.kracht.records[0].reps === 6, m.kracht);
    check('bankdrukken staat sterker dan eind augustus', m.kracht.vooruit === 1 && m.kracht.vergeleken === 1 &&
      m.kracht.sterker[0] === 'Bankdrukken', m.kracht);
    const velden = m.wijzigingen.map((w) => w.veld + ' ' + w.datum);
    check('drie aanpassingen: caloriedoel 1 sep, waterdoel 10 sep, caloriedoel 29 sep',
      velden.join() === 'calorieDoel 2026-09-01,waterDoel 2026-09-10,calorieDoel 2026-09-29', velden);
    const w = m.calorieWissel;
    check('de aanpassing van 29 sep, met de vier weken ervoor', w && w.datum === '2026-09-29' &&
      Math.round(w.voor.kcalGem) === 2530 && Math.abs(w.voor.perWeek - 0.40) < 0.02, w);
    check('sindsdien alleen 30 sep gegeten, nog geen lijn', w.na.kcalDagen === 1 && w.na.perWeek === null, w.na);

    await teken(page);
    const kaart = await page.evaluate(() => {
      const k = Array.from(document.querySelectorAll('.card.review'))
        .filter((c) => c.textContent.indexOf('Maandafsluiting') >= 0)[0];
      return k ? k.textContent : null;
    });
    check('de maandafsluiting staat op de dagpagina', kaart && kaart.indexOf('september 2026') >= 0, kaart);
    check('met pijltjes tegen augustus', kaart && /vs aug/.test(kaart), kaart);
    check('noemt de aanpassing en wat je daarvoor at', kaart &&
      kaart.indexOf('Op 29 sep zette je je caloriedoel van 2530 op 2360 kcal') >= 0 &&
      kaart.indexOf('In de vier weken daarvoor at je gemiddeld 2530 kcal en ging je gewicht +0,40 kg per week') >= 0, kaart);
    check('en waar je de rest ziet', kaart && kaart.indexOf('in de afsluiting van oktober') >= 0, kaart);
    check('wat je aanpaste', kaart && kaart.indexOf('10 sep: waterdoel van 3000 ml naar 3500 ml') >= 0 &&
      kaart.indexOf('29 sep: caloriedoel van 2530 kcal naar 2360 kcal') >= 0, kaart);
    check('het record', kaart && kaart.indexOf('Nieuw record: Bankdrukken 62,5 kg × 6') >= 0, kaart);
    check('één oefening bij naam', kaart && kaart.indexOf('Bankdrukken staat sterker dan aan het begin van de maand') >= 0, kaart);

    await page.click('[data-action="maand-bekijk"]');
    const maand = await page.evaluate(() => ({
      label: document.body.textContent.indexOf('Maandafsluiting · september 2026') >= 0,
      actief: document.querySelector('[data-view="maand"]').className
    }));
    check('"Hele maand bekijken" opent september', maand.label && /active|actief/.test(maand.actief), maand);

    await page.click('[data-view="dag"]');
    await page.click('[data-nav="today"]');
    await page.click('[data-action="maand-verberg"]');
    const weg = await page.evaluate(() => ({
      gezien: GD.store.settings().maandafsluitingGezien,
      kaart: Array.from(document.querySelectorAll('.card')).some((c) => c.textContent.indexOf('Maandafsluiting') >= 0)
    }));
    check('verbergen onthoudt september en haalt de kaart weg', weg.gezien === '2026-09' && !weg.kaart, weg);
    check('geen fouten', !page.fouten.length, page.fouten);
    await ctx.close();
  }

  console.log('\nNa de derde staat hij alleen nog in het maandoverzicht');
  {
    const { ctx, page } = await bouw(browser, '2026-10-04');
    await teken(page);
    const dag = await page.evaluate(() => Array.from(document.querySelectorAll('.card')).some((c) => c.textContent.indexOf('Maandafsluiting') >= 0));
    check('4 oktober: niet meer op de dagpagina', !dag);
    await page.click('[data-view="maand"]');
    const okt = await page.evaluate(() => document.body.textContent);
    check('oktober loopt nog', okt.indexOf('Maandafsluiting · oktober 2026') >= 0 &&
      okt.indexOf('loopt nog') >= 0, okt.slice(0, 600));
    await page.click('[data-nav="prev"]');
    const sep = await page.evaluate(() => document.body.textContent.indexOf('Maandafsluiting · september 2026') >= 0);
    check('terugbladeren naar september', sep);
    check('geen fouten', !page.fouten.length, page.fouten);
    await ctx.close();
  }

  console.log('\nOp 1 november: wat het nieuwe doel deed');
  {
    const { ctx, page } = await bouw(browser, '2026-11-01');
    const m = await page.evaluate(() => GD.review.maakMaand('2026-10-10'));
    const w = m.calorieWissel;
    check('de aanpassing van 29 sep hoort er nog bij', w && w.datum === '2026-09-29' && !w.inMaand, w);
    check('sindsdien 2360 kcal en een lijn', w && Math.round(w.na.kcalGem) === 2360 && w.na.perWeek !== null, w && w.na);
    check('vóór +0,40, sindsdien rond +0,2', w && w.na.perWeek < w.voor.perWeek && w.na.perWeek > 0.15 &&
      w.na.perWeek < 0.3, w);
    check('niets aangepast in oktober', m.wijzigingen.length === 0, m.wijzigingen);
    await teken(page);
    const kaart = await page.evaluate(() => {
      const k = Array.from(document.querySelectorAll('.card.review'))
        .filter((c) => c.textContent.indexOf('Maandafsluiting') >= 0)[0];
      return k ? k.textContent : null;
    });
    check('oktober op de dagpagina, met de lijn sinds de aanpassing', kaart &&
      kaart.indexOf('oktober 2026') >= 0 && /Sindsdien at je gemiddeld 2360 kcal en gaat je gewicht \+0,2\d kg per week/.test(kaart), kaart);
    check('geen fouten', !page.fouten.length, page.fouten);
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
