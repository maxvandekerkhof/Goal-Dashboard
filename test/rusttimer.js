/* De rusttimer tussen sets. Geen eigen data nodig.

   Een schema Push met Bankdrukken en Curls, vandaag 13 oktober. Het geluid
   gaat naar een nagebootst geluidskaartje dat telt hoeveel toontjes er
   klinken, zodat de test hoort of er gepiept wordt. */
const T = require('./lib');

let ok = 0, fout = 0;
function check(naam, waar, extra) {
  if (waar) { ok++; console.log('  ok   ' + naam); }
  else { fout++; console.log('  FOUT ' + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

/* Telt elk toontje dat start; het eerste bij het starten is het onhoorbare. */
function nepGeluid() {
  window.__tonen = 0;
  window.AudioContext = function () {
    this.state = 'running'; this.currentTime = 0; this.destination = {};
  };
  window.AudioContext.prototype.resume = function () {};
  window.AudioContext.prototype.createOscillator = function () {
    return { frequency: { value: 0 }, type: '', connect() {}, start() { window.__tonen++; }, stop() {} };
  };
  window.AudioContext.prototype.createGain = function () {
    return { gain: { value: 1, setValueAtTime() {}, exponentialRampToValueAtTime() {} }, connect() {} };
  };
}

async function bouw(browser) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 900 } });
  const page = await ctx.newPage();
  page.fouten = [];
  page.on('pageerror', (e) => page.fouten.push(e.message));
  page.on('dialog', (d) => d.accept());
  await ctx.addInitScript(nepGeluid);
  await page.clock.install({ time: new Date('2026-10-13T10:00:00') });
  await page.goto(T.PAGINA);
  await page.evaluate(() => {
    const L = GD.lifts;
    const sid = L.addSchema('Push');
    L.addToSchema(sid, L.addOefening('Bankdrukken'));
    L.addToSchema(sid, L.addOefening('Curls'));
    L.setDagSchema(GD.date.today(), sid);
    GD.store.writeNow();
  });
  await page.reload();
  return { ctx, page };
}

const balk = (page) => page.evaluate(() => {
  const el = document.getElementById('rust');
  const v = el.querySelector('.rust-vulling');
  return {
    zichtbaar: !el.hidden, klaar: el.classList.contains('rust-klaar'),
    tijd: (el.querySelector('.rust-tijd') || {}).textContent || null,
    naam: (el.querySelector('.rust-naam') || {}).textContent || null,
    vulling: v ? parseFloat(v.style.width) : null,
    bodyKlasse: document.body.classList.contains('rust-aan'),
    tonen: window.__tonen, opgeslagen: localStorage.getItem('goaldash.rust') !== null
  };
});

const knoppen = (page) => page.$$eval('[data-action="rust-start"]', (l) => l.map((b) => b.textContent.trim()));

async function main() {
  const browser = await T.lanceer();
  const { ctx, page } = await bouw(browser);

  console.log('\nInstellen');
  {
    check('bij elke oefening een klokje met de standaardtijd', (await knoppen(page)).join() === '2:00,2:00',
      await knoppen(page));

    await page.click('.tab[data-view="instellingen"]');
    await page.click('[data-action="inklap"][data-sectie="schemas"]');
    const tekst = await page.textContent('#inklap-schemas');
    check('standaard rusttijd en piepje bij Trainingsschema\'s', /Standaard rusttijd/.test(tekst) &&
      /Piepje als je rust voorbij is/.test(tekst), tekst.slice(0, 200));

    const id = await page.evaluate(() => GD.lifts.zoekOpNaam('Bankdrukken').id);
    await page.selectOption('[data-oef-rust="' + id + '"]', '180');
    await page.selectOption('[data-rust-standaard]', '90');
    const s = await page.evaluate((id) => ({
      eigen: GD.lifts.byId(id).rust, std: GD.store.settings().rustStandaard
    }), id);
    check('bankdrukken krijgt 3 minuten, de standaard wordt anderhalve', s.eigen === 180 && s.std === 90, s);

    await page.click('.tab[data-view="dag"]');
    check('en dat staat op de klokjes', (await knoppen(page)).join() === '3:00,1:30', await knoppen(page));

    await page.click('[data-nav="prev"]');
    check('op een andere dag geen klokjes', (await knoppen(page)).length === 0);
    await page.click('[data-nav="today"]');
  }

  console.log('\nAftellen');
  {
    const voor = await page.evaluate(() => localStorage.getItem('goaldash.v1'));
    await page.click('[data-action="rust-start"]');
    let b = await balk(page);
    check('de balk staat onderin met 3:00 en de oefening', b.zichtbaar && b.tijd === '3:00' &&
      /Bankdrukken/.test(b.naam) && b.bodyKlasse, b);

    await page.clock.runFor(30000);
    b = await balk(page);
    check('na een halve minuut: 2:30, een zesde gevuld', b.tijd === '2:30' && Math.abs(b.vulling - 16.7) < 1, b);

    await page.click('[data-rust="plus"]');
    check('+15', (await balk(page)).tijd === '2:45');
    await page.click('[data-rust="min"]');
    await page.click('[data-rust="min"]');
    check('twee keer −15', (await balk(page)).tijd === '2:15');

    await page.reload();
    b = await balk(page);
    check('na herladen loopt hij gewoon door', b.zichtbaar && b.tijd === '2:15', b);

    await page.click('.tab[data-view="week"]');
    b = await balk(page);
    check('ook op een ander tabblad van de app', b.zichtbaar && b.tijd === '2:15', b);

    // Na herladen moet een tik het geluid weer openzetten.
    await page.click('.tab[data-view="dag"]');
    const tonenVoor = (await balk(page)).tonen;
    await page.clock.runFor(135000);
    b = await balk(page);
    check('rust voorbij: groen, met de tekst', b.klaar && b.tijd === 'Volgende set!' && /Rust voorbij · Bankdrukken/.test(b.naam), b);
    check('drie piepjes', b.tonen - tonenVoor === 3, { voor: tonenVoor, na: b.tonen });

    await page.clock.runFor(61000);
    b = await balk(page);
    check('een minuut later gaat hij vanzelf weg', !b.zichtbaar && !b.bodyKlasse && !b.opgeslagen, b);

    const na = await page.evaluate(() => localStorage.getItem('goaldash.v1'));
    check('de timer raakt je gegevens niet aan', voor === na);
  }

  console.log('\nStoppen, opnieuw en stil');
  {
    await page.locator('[data-action="rust-start"]').nth(1).click();
    let b = await balk(page);
    check('curls: 1:30', b.tijd === '1:30' && /Curls/.test(b.naam), b);
    await page.click('[data-rust="stop"]');
    b = await balk(page);
    check('stoppen haalt hem meteen weg', !b.zichtbaar && !b.opgeslagen, b);

    await page.locator('[data-action="rust-start"]').nth(1).click();
    await page.clock.runFor(91000);
    await page.click('[data-rust="opnieuw"]');
    b = await balk(page);
    check('nog een keer: weer 1:30', b.zichtbaar && !b.klaar && b.tijd === '1:30', b);
    await page.click('[data-rust="stop"]');

    await page.evaluate(() => GD.store.setSetting('rustGeluid', false));
    const t0 = (await balk(page)).tonen;
    await page.locator('[data-action="rust-start"]').nth(1).click();
    await page.clock.runFor(91000);
    b = await balk(page);
    check('piepje uit: alleen het onhoorbare toontje bij het starten', b.klaar && b.tonen - t0 === 1, { t0, na: b.tonen });
    await page.click('[data-rust="stop"]');
  }

  check('geen fouten', !page.fouten.length, page.fouten);
  await ctx.close();
  await browser.close();
  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
