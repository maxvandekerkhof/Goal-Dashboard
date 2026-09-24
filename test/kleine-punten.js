/* Ronde 3 uit de audit: middernacht (8), lege instellingen (12), plateau
   wegklikken (13), thema per apparaat (14), schermlezer (15) en het icoon
   voor je beginscherm (16). Geen eigen data nodig. */
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
  if (tijd) await page.clock.install({ time: new Date(tijd) });
  await page.goto(T.PAGINA);
  return { ctx, page };
}

async function main() {
  const browser = await T.lanceer();

  console.log('\n8 · Middernacht');
  {
    const { ctx, page } = await pagina(browser, '2026-09-23T23:58:00');
    await page.clock.runFor(10 * 60 * 1000);          // app blijft gewoon open staan
    const label = await page.textContent('#period-label');
    await page.click('[data-action="meter-add"][data-amount="250"]');
    const r = await page.evaluate(() => ({
      water23: (GD.store.entry('2026-09-23') || {}).waterMl,
      water24: (GD.store.entry('2026-09-24') || {}).waterMl
    }));
    check('na middernacht staat de app op de nieuwe dag', /24 september/.test(label) && /Vandaag/.test(label), label);
    check('het water gaat naar 24 september', r.water24 === 250 && r.water23 === undefined, r);
    await ctx.close();
  }
  {
    const { ctx, page } = await pagina(browser, '2026-09-23T23:58:00');
    await page.click('[data-nav="prev"]');                // bewust naar gisteren gebladerd
    await page.clock.fastForward('10:00');
    await page.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'visible', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const r = await page.evaluate(() => GD.ui.anchor);
    check('keek je naar een andere dag, dan blijf je daar', r === '2026-09-22', r);
    check('terug in de app telt ook (niet alleen de klok)', await page.evaluate(() => GD.date.today() === '2026-09-24'));
    await ctx.close();
  }

  console.log('\n12 · Lege instellingen');
  {
    const { ctx, page } = await pagina(browser);
    await page.click('[data-view="instellingen"]');
    const zet = (key, waarde) => page.evaluate(({ key, waarde }) => {
      const veld = document.querySelector('input[data-setting="' + key + '"]');
      veld.value = waarde;
      veld.dispatchEvent(new Event('change', { bubbles: true }));
      return GD.store.settings()[key];
    }, { key, waarde });
    const kcal = await zet('calorieDoel', '');
    check('leeg caloriedoel wordt de standaard (2200)', kcal === 2200, kcal);
    check('en dat zegt de app', /terug naar de standaard: 2200/.test(await page.textContent('#toast')));
    const drempel = await zet('goedeDagDrempel', '');
    check('lege drempel wordt 70', drempel === 70, drempel);
    const streef = await zet('gewichtDoel', '');
    check('streefgewicht mag wél leeg blijven', streef === null, streef);
    // Een lege waarde die al in de opslag stond, van vóór deze versie
    await page.evaluate(() => {
      GD.store.writeNow();
      const raw = JSON.parse(localStorage.getItem('goaldash.v1'));
      raw.settings.calorieDoel = null; raw.settings.goedeDagDrempel = null;
      localStorage.setItem('goaldash.v1', JSON.stringify(raw));
    });
    await page.reload();
    const na = await page.evaluate(() => {
      const st = GD.store, D = GD.date, S = GD.score;
      for (let i = 1; i <= 5; i++) {
        const d = D.addDays(D.today(), -i);
        st.setField(d, 'kcal', 2400); st.setField(d, 'ontbijt', 'nee'); st.setField(d, 'creatine', 'nee');
      }
      return {
        doel: st.settings().calorieDoel, drempel: st.settings().goedeDagDrempel,
        goed: S.scorePeriod(D.range(D.addDays(D.today(), -5), D.addDays(D.today(), -1))).stats.goodDays
      };
    });
    check('oude lege waarden krijgen bij het openen hun standaard', na.doel === 2200 && na.drempel === 70, na);
    check('dagen van 14% tellen niet als goede dag', na.goed === 0, na);
    await ctx.close();
  }

  console.log('\n13 · Plateau wegklikken');
  {
    const { ctx, page } = await pagina(browser, '2026-09-23T10:00:00');
    const r = await page.evaluate(() => {
      const L = GD.lifts, st = GD.store, D = GD.date;
      const oid = L.addOefening('Testbank');
      const zet = (i, kg) => { const o = {}; o[oid] = { kg: kg, reps: 8 }; st.setField(D.addDays('2026-08-01', i * 3), 'oefeningen', o); };
      [60, 60, 60, 60, 60].forEach((kg, i) => zet(i, kg));               // vier keer stil
      let p = L.plateau(oid, '', '2026-09-23');
      L.plateauWegklikken(oid, p.sessies, p.reeks[0].datum);             // zoals de knop het doet
      const zichtbaar = (p) => !(p.niveau === 'geen' || p.sessies <= p.gemeld);
      const naWegklikken = zichtbaar(L.plateau(oid, '', '2026-09-23'));
      zet(5, 60);                                                        // vijfde keer stil
      const langer = zichtbaar(L.plateau(oid, '', '2026-09-23'));
      zet(6, 62.5);                                                      // vooruit
      [62.5, 62.5, 62.5].forEach((kg, i) => zet(7 + i, kg));             // drie keer stil
      p = L.plateau(oid, '', '2026-09-23');
      // Oude gegevens: alleen een aantal, geen begin van de reeks
      L.updateOefening(oid, { plateauGemeld: 5, plateauVanaf: null });
      const oud = L.plateau(oid, '', '2026-09-23');
      return { naWegklikken, langer, nieuw: zichtbaar(p), sessies: p.sessies, oud: zichtbaar(oud) };
    });
    check('na wegklikken is hij weg', r.naWegklikken === false);
    check('staat hij langer stil, dan komt hij terug', r.langer === true);
    check('na vooruitgang en drie nieuwe keren stil: weer een melding', r.nieuw === true && r.sessies === 3, r);
    check('ook bij gegevens van vóór deze versie', r.oud === true);
    await ctx.close();
  }

  console.log('\n14 · Thema per apparaat');
  {
    const { ctx, page } = await pagina(browser);
    const voor = await page.evaluate(() => ({ ts: GD.store.raw().settingsTs, thema: document.documentElement.dataset.theme }));
    await page.click('#btn-theme');
    const na = await page.evaluate(() => ({
      ts: GD.store.raw().settingsTs, thema: document.documentElement.dataset.theme,
      instelling: GD.store.settings().theme, lokaal: localStorage.getItem('goaldash.thema')
    }));
    check('wisselen werkt', voor.thema === 'dark' && na.thema === 'light', { voor, na });
    check('de gesynchroniseerde instellingen veranderen niet', na.ts === voor.ts && na.instelling === 'dark', na);
    await page.reload();
    check('en het blijft na herladen', (await page.evaluate(() => document.documentElement.dataset.theme)) === 'light');
    await ctx.close();
  }

  console.log('\n15 · Schermlezer');
  {
    const { ctx, page } = await pagina(browser);
    await page.click('[data-action="set-goal"][data-goal="ontbijt"][data-value="ja"]');
    const r = await page.evaluate(() => {
      const knoppen = Array.from(document.querySelectorAll('[data-goal="ontbijt"][data-action="set-goal"]'));
      return {
        alle: knoppen.every((k) => k.hasAttribute('aria-pressed')),
        gekozen: knoppen.filter((k) => k.getAttribute('aria-pressed') === 'true').map((k) => k.dataset.value),
        groep: knoppen[0].parentNode.getAttribute('aria-label')
      };
    });
    check('elke keuzeknop zegt of hij ingedrukt is', r.alle);
    check('precies de gekozen knop staat op "ingedrukt"', r.gekozen.length === 1 && r.gekozen[0] === 'ja', r.gekozen);
    check('de groep heet naar het doel', r.groep === 'Ontbijt', r.groep);
    await ctx.close();
  }

  console.log('\n16 · Icoon voor je beginscherm');
  {
    const { ctx, page } = await pagina(browser);
    const href = await page.evaluate(() => {
      const l = document.querySelector('link[rel="apple-touch-icon"]');
      return l ? l.href : null;
    });
    check('er is een apple-touch-icon', !!href, href);
    if (href) {
      const res = await page.request.get(href);
      const buf = await res.body();
      check('en die bestaat, als PNG van 180 × 180', res.ok() && buf.readUInt32BE(16) === 180 && buf.readUInt32BE(20) === 180,
        { status: res.status(), grootte: buf.length });
    }
    check('geen fouten op de pagina', page.fouten.length === 0, page.fouten);
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
