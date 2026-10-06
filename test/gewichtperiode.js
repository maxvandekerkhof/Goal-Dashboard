/* Je gewicht over een periode die je zelf kiest. Met verzonnen data, geen
   eigen data nodig.

   1 aug t/m 19 okt elke dag gewogen, +0,35 kg per week vanaf 70,0 kg, met
   één uitschieter op 15 sep. Op 29 sep ging het caloriedoel naar 2360.
   Vandaag is 20 oktober. */
const T = require('./lib');

let ok = 0, fout = 0;
function check(naam, waar, extra) {
  if (waar) { ok++; console.log('  ok   ' + naam); }
  else { fout++; console.log('  FOUT ' + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

async function bouw(browser) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 900 } });
  const page = await ctx.newPage();
  page.fouten = [];
  page.on('pageerror', (e) => page.fouten.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.clock.install({ time: new Date('2026-08-01T10:00:00') });
  await page.goto(T.PAGINA);
  await page.evaluate(() => {
    const st = GD.store, D = GD.date;
    st.setSetting('gewichtRichting', 'aankomen');
    st.setSetting('gewichtTempo', 0.25);
    st.setSetting('calorieDoel', 2500);
    D.range('2026-08-01', '2026-10-19').forEach((d) => {
      const i = D.dagenTussen('2026-08-01', d);
      st.setField(d, 'kcal', 2500);
      st.setField(d, 'gewicht', +(70 + i * 0.35 / 7 + (d === '2026-09-15' ? 1.5 : 0)).toFixed(2));
    });
  });
  await page.clock.setSystemTime(new Date('2026-09-29T10:00:00'));
  await page.evaluate(() => GD.store.zetCalorieDoel(2360));
  await page.clock.setSystemTime(new Date('2026-10-20T10:00:00'));
  await page.evaluate(() => GD.store.writeNow());
  await page.reload();
  return { ctx, page };
}

/** Wat er nu op het gewichtscherm staat. */
function scherm(page) {
  return page.evaluate(() => {
    const kaarten = Array.from(document.querySelectorAll('#view > .card'));
    const actief = document.querySelector('[data-action="gewicht-snel"][aria-pressed="true"]');
    return {
      titel: kaarten[1] ? kaarten[1].querySelector('h2').textContent.trim() : null,
      tekst: kaarten.map((k) => k.textContent).join(' | '),
      van: (document.querySelector('[data-gewicht-periode="van"]') || {}).value,
      tot: (document.querySelector('[data-gewicht-periode="tot"]') || {}).value,
      actief: actief ? actief.dataset.snel : null,
      trend: !!document.querySelector('.weight-chart .wc-trend'),
      markeringen: Array.from(document.querySelectorAll('.wc-marker-label')).map((t) => t.textContent),
      navVerborgen: document.querySelector('#period-nav').hidden
    };
  });
}

async function kiesDatum(page, welke, datum) {
  await page.fill('[data-gewicht-periode="' + welke + '"]', datum);
  await page.waitForTimeout(50);
}

async function main() {
  const browser = await T.lanceer();
  const { ctx, page } = await bouw(browser);

  console.log('\nDe berekening');
  {
    const g = await page.evaluate(() => GD.review.maakGewicht('2026-09-01', '2026-09-30'));
    check('dertig wegingen in september', g.wegingen === 30 && g.dagen === 30, g.wegingen);
    check('begin en eind als weekgemiddelde', g.weekGemiddeld === true);
    check('begin = gemiddelde van 1 t/m 7 sep', Math.abs(g.begin - (70 + 34 * 0.05)) < 0.01, g.begin);
    check('eind = gemiddelde van 24 t/m 30 sep', Math.abs(g.eindGewicht - (70 + 57 * 0.05)) < 0.01, g.eindGewicht);
    check('de lijn: rond +0,35 kg per week ondanks de uitschieter', g.perWeek > 0.3 && g.perWeek < 0.42, g.perWeek);
    check('de lijn heeft een begin- en eindpunt', g.lijn && g.lijn[0].date === '2026-09-01' && g.lijn[1].date === '2026-09-30', g.lijn);
    check('hoogste is de uitschieter van 15 sep', g.hoogste.date === '2026-09-15', g.hoogste);
    check('laagste is 1 sep', g.laagste.date === '2026-09-01', g.laagste);
    check('gemiddeld 2500 kcal', Math.round(g.kcalGem) === 2500 && g.kcalDagen === 30, g.kcalGem);
    check('de aanpassing van 29 sep staat erbij', g.calorieWissels.length === 1 &&
      g.calorieWissels[0].datum === '2026-09-29' && g.calorieWissels[0].naar === 2360, g.calorieWissels);
    check('en in de lijst met wijzigingen', g.wijzigingen.length === 1 &&
      /29 sep: caloriedoel van 2500 kcal naar 2360 kcal/.test(g.wijzigingen[0].tekst), g.wijzigingen);

    const om = await page.evaluate(() => GD.review.maakGewicht('2026-09-30', '2026-09-01'));
    check('datums verkeerd om worden omgedraaid', om.van === '2026-09-01' && om.tot === '2026-09-30' && om.wegingen === 30);

    const later = await page.evaluate(() => GD.review.maakGewicht('2026-10-01', '2026-12-31'));
    check('een einddatum na vandaag stopt bij vandaag', later.eind === '2026-10-20' && later.dagen === 20, later.eind);
    check('vandaag telt niet mee voor eten, de dag loopt nog', later.kcalDagen === 19, later.kcalDagen);

    const kort = await page.evaluate(() => GD.review.maakGewicht('2026-09-01', '2026-09-05'));
    check('korte periode: eerste en laatste weging zelf', kort.weekGemiddeld === false &&
      Math.abs(kort.begin - (70 + 31 * 0.05)) < 0.01 && Math.abs(kort.eindGewicht - (70 + 35 * 0.05)) < 0.01, kort);
    check('korte periode: geen lijn', kort.perWeek === null && kort.lijn === null);

    const leeg = await page.evaluate(() => GD.review.maakGewicht('2026-01-01', '2026-01-31'));
    check('periode zonder wegingen', leeg.wegingen === 0 && leeg.begin === null && leeg.verschil === null);
  }

  console.log('\nHet scherm');
  {
    const voor = await page.evaluate(() => localStorage.getItem('goaldash.v1'));

    await page.click('.tab[data-view="gewicht"]');
    let s = await scherm(page);
    check('standaard de laatste drie maanden', s.actief === '3m' && s.van === '2026-07-21' && s.tot === '2026-10-20', s);
    check('titel met de periode', s.titel === '21 jul – 20 okt 2026', s.titel);
    check('geen periodeknoppen bovenin', s.navVerborgen === true);
    // 2500 is het doel dat bij het opzetten op 1 aug werd ingesteld.
    check('met stippellijn en de aanpassing van je caloriedoel', s.trend && s.markeringen.join() === '2500 kcal,2360 kcal', s.markeringen);
    check('zegt waar je eerste weging is', s.tekst.indexOf('Je eerste weging in deze periode is van 1 aug.') >= 0, s.tekst);
    check('vergelijkt met je tempo', /Met \+0,3\d kg per week zit je op schema \(\+0,25 kg per week\)/.test(s.tekst), s.tekst);

    await page.click('[data-snel="4w"]');
    s = await scherm(page);
    check('4 weken: 23 sep t/m vandaag', s.actief === '4w' && s.van === '2026-09-23', s);

    await page.click('[data-snel="calorie"]');
    s = await scherm(page);
    check('sinds caloriedoel: vanaf 29 sep', s.actief === 'calorie' && s.van === '2026-09-29', s);

    await kiesDatum(page, 'van', '2026-09-01');
    await kiesDatum(page, 'tot', '2026-09-30');
    s = await scherm(page);
    check('zelf gekozen datums', s.van === '2026-09-01' && s.tot === '2026-09-30' && s.actief === null, s);
    check('titel volgt je datums', s.titel === '1 sep – 30 sep 2026', s.titel);
    check('wat je aanpaste staat eronder', s.tekst.indexOf('Wat je in deze periode aanpaste') >= 0 &&
      s.tekst.indexOf('29 sep: caloriedoel van 2500 kcal naar 2360 kcal') >= 0, s.tekst);

    await page.reload();
    await page.click('.tab[data-view="gewicht"]');
    s = await scherm(page);
    check('je periode blijft staan na herladen', s.van === '2026-09-01' && s.tot === '2026-09-30', s);

    await kiesDatum(page, 'van', '2026-10-05');
    s = await scherm(page);
    check('van na tot: tot schuift mee', s.van === '2026-10-05' && s.tot === '2026-10-05', s);

    await kiesDatum(page, 'van', '2026-01-01');
    await kiesDatum(page, 'tot', '2026-01-31');
    s = await scherm(page);
    check('periode zonder wegingen zegt dat', s.tekst.indexOf('Geen gewicht ingevuld tussen 1 jan en 31 jan') >= 0, s.tekst);

    await page.click('[data-snel="alles"]');
    s = await scherm(page);
    check('alles: vanaf je eerste weging', s.actief === 'alles' && s.van === '2026-08-01', s);

    const na = await page.evaluate(() => localStorage.getItem('goaldash.v1'));
    check('kiezen raakt je gegevens niet aan', voor === na);

    await page.click('.tab[data-view="week"]');
    await page.click('[data-action="naar-gewicht"]');
    s = await scherm(page);
    check('vanuit het weekoverzicht naar het gewichtscherm', s.titel !== null && s.actief === 'alles', s);

    check('geen fouten', !page.fouten.length, page.fouten);
  }

  await ctx.close();
  await browser.close();
  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
