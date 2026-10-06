/* De blokken in de instellingen klappen in en uit. Met verzonnen data. */
const T = require('./lib');

let ok = 0, fout = 0;
function check(naam, waar, extra) {
  if (waar) { ok++; console.log('  ok   ' + naam); }
  else { fout++; console.log('  FOUT ' + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

/** Per blok in de instellingen: kopje en of het open staat. */
function blokken(page) {
  return page.evaluate(() => Array.from(document.querySelectorAll('#view > .card')).map((k) => ({
    kop: k.querySelector('h2').textContent.trim(),
    inklap: k.classList.contains('inklap'),
    open: !k.classList.contains('dicht'),
    knop: (k.querySelector('h2 .inklap-knop') || {}).getAttribute
      ? k.querySelector('h2 .inklap-knop').getAttribute('aria-expanded') : null
  })));
}

async function main() {
  const browser = await T.lanceer();
  const ctx = await browser.newContext({ viewport: { width: 393, height: 900 } });
  const page = await ctx.newPage();
  const fouten = [];
  page.on('pageerror', (e) => fouten.push(e.message));
  await page.clock.install({ time: new Date('2026-10-06T10:00:00') });
  await page.goto(T.PAGINA);
  await page.evaluate(() => {
    GD.store.setField('2026-10-05', 'gewicht', 74.1);
    GD.store.writeNow();
  });

  console.log('\nStandaard');
  await page.click('.tab[data-view="instellingen"]');
  let b = await blokken(page);
  const inklapbaar = b.filter((x) => x.inklap);
  check('acht blokken klappen in', inklapbaar.length === 8, b.map((x) => x.kop));
  check('ze staan allemaal dicht', inklapbaar.every((x) => !x.open && x.knop === 'false'), inklapbaar);
  const backup = b.find((x) => /Back-up en je data/.test(x.kop));
  check('het back-upblok klapt niet in en staat open', backup && !backup.inklap && backup.open, backup);
  check('de downloadknop is meteen te zien', await page.isVisible('[data-action="export"]'));
  check('de velden van een dicht blok zijn niet te zien', !(await page.isVisible('[data-setting="calorieDoel"]')));

  console.log('\nOpenklappen');
  await page.click('[data-action="inklap"][data-sectie="voeding"]');
  b = await blokken(page);
  check('Voedingsdoelen klapt open', b.find((x) => x.kop === 'Voedingsdoelen').open &&
    b.find((x) => x.kop === 'Voedingsdoelen').knop === 'true');
  check('de rest blijft dicht', b.filter((x) => x.inklap && x.kop !== 'Voedingsdoelen').every((x) => !x.open));
  check('het caloriedoel is te zien en in te vullen', await page.isVisible('[data-setting="calorieDoel"]'));
  await page.fill('[data-setting="calorieDoel"]', '2400');
  await page.press('[data-setting="calorieDoel"]', 'Tab');
  check('een wijziging laat het blok open', (await blokken(page)).find((x) => x.kop === 'Voedingsdoelen').open);
  check('en wordt opgeslagen', await page.evaluate(() => GD.store.settings().calorieDoel === 2400));

  console.log('\nOnthouden');
  await page.evaluate(() => GD.store.writeNow());
  await page.reload();
  await page.click('.tab[data-view="instellingen"]');
  b = await blokken(page);
  check('na herladen staat Voedingsdoelen nog open', b.find((x) => x.kop === 'Voedingsdoelen').open);
  await page.click('[data-action="inklap"][data-sectie="voeding"]');
  check('nog een keer tikken klapt hem dicht', !(await blokken(page)).find((x) => x.kop === 'Voedingsdoelen').open);
  const stand = await page.evaluate(() => localStorage.getItem('goaldash.inklap'));
  check('de stand staat apart van je gegevens', /"voeding":false/.test(stand), stand);
  const na = await page.evaluate(() => JSON.parse(localStorage.getItem('goaldash.v1')).settings);
  check('en zit niet in je instellingen', !('inklap' in na) && !/voeding/.test(JSON.stringify(na.doelLog || [])));
  check('je dagen zijn niet aangeraakt', await page.evaluate(() => GD.store.allDates().join()) === '2026-10-05');

  console.log('\nKapotte stand');
  await page.evaluate(() => localStorage.setItem('goaldash.inklap', '[1,2'));
  await page.reload();
  await page.click('.tab[data-view="instellingen"]');
  b = await blokken(page);
  check('een onleesbare stand: gewoon alles dicht, geen fout', b.filter((x) => x.inklap).every((x) => !x.open) && !fouten.length, fouten);

  check('geen fouten', !fouten.length, fouten);
  await browser.close();
  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
