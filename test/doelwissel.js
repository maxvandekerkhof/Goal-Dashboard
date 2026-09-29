/* Na een nieuw caloriedoel: twee weken rust in het advies, daarna alleen de
   dagen sinds de aanpassing. Met verzonnen data: drie weken 2530 kcal en
   +0,41 kg per week, doel +0,25. Geen eigen data nodig. */
const T = require('./lib');

let ok = 0, fout = 0;
function check(naam, waar, extra) {
  if (waar) { ok++; console.log('  ok   ' + naam); }
  else { fout++; console.log('  FOUT ' + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

const START = '2026-09-29';

async function pagina(browser, tijd) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 900 } });
  const page = await ctx.newPage();
  page.fouten = [];
  page.on('pageerror', (e) => page.fouten.push(e.message));
  page.on('dialog', (d) => d.accept());
  await page.clock.install({ time: new Date(tijd || START + 'T10:00:00') });
  await page.goto(T.PAGINA);
  return { ctx, page };
}

/* Drie weken te snel aankomen op 2530 kcal, tot en met gisteren. */
function driewekenTeSnel() {
  const st = GD.store, D = GD.date;
  st.setSetting('gewichtRichting', 'aankomen');
  st.setSetting('gewichtTempo', 0.25);
  st.setSetting('calorieRichting', 'max');
  st.setSetting('calorieDoel', 2530);
  for (let i = 21; i >= 1; i--) {
    const d = D.addDays(D.today(), -i);
    st.setField(d, 'kcal', 2530);
    st.setField(d, 'gewicht', +(74.7 - i * 0.41 / 7).toFixed(2));
  }
}

/* Naar `dag` springen en de dagen sinds de aanpassing invullen: `kcal` per dag,
   gewicht in `perWeek` kg per week vanaf 74,7. */
async function verder(page, dag, kcal, perWeek) {
  await page.clock.setSystemTime(new Date(dag + 'T10:00:00'));
  await page.evaluate(({ start, kcal, perWeek }) => {
    const st = GD.store, D = GD.date;
    D.range(start, D.addDays(D.today(), -1)).forEach((d) => {
      const k = D.dagenTussen(start, d);
      if (k > 0) st.setField(d, 'kcal', kcal);
      st.setField(d, 'gewicht', +(74.7 + k * perWeek / 7).toFixed(2));
    });
  }, { start: START, kcal, perWeek });
}

/* Opslaan en opnieuw laden, zodat het scherm de nieuwe gegevens toont. */
async function teken(page, view) {
  await page.evaluate(() => GD.store.writeNow());
  await page.reload();
  if (view) await page.click('[data-view="' + view + '"]');
}

const melding = (page) => page.evaluate(() => {
  const g = GD.score.gewichtMelding(), v = GD.score.verbruik();
  return {
    advies: g.advies, tekst: g.tekst, waarschuwing: g.waarschuwing, venster: g.trendVenster,
    vanaf: g.trendVanaf, verbruik: v.advies, doelKcal: v.doelKcal,
    rust: g.advies && g.advies.rust ? GD.review.rustTekst(g.advies, GD.store.settings()) : null
  };
});

async function main() {
  const browser = await T.lanceer();

  console.log('\nOnthouden wanneer je je doel verzette');
  {
    const { ctx, page } = await pagina(browser);
    const r = await page.evaluate(() => {
      const st = GD.store;
      st.setSetting('calorieDoel', 2530);
      const klein = st.zetCalorieDoel(2500);                        // 30 kcal: geen aanpassing
      const naKlein = st.settings().calorieDoelWissel;
      const echt = st.zetCalorieDoel(2360);
      const na = JSON.parse(JSON.stringify(st.settings().calorieDoelWissel));
      st.zetCalorieDoel(2300);                                       // zelfde dag nog eens
      const twee = JSON.parse(JSON.stringify(st.settings().calorieDoelWissel));
      st.zetCalorieDoel(2510);                                       // zelfde dag terug
      const terug = st.settings().calorieDoelWissel;
      return { klein, naKlein, echt, na, twee, terug };
    });
    check('een stap onder de 50 kcal telt niet als aanpassing', r.klein === false && r.naKlein === null, r);
    check('2500 → 2360 wel, met datum en beide getallen',
      r.echt === true && r.na.datum === START && r.na.van === 2500 && r.na.naar === 2360, r.na);
    check('twee keer op één dag: vanaf het getal van die ochtend', r.twee.van === 2500 && r.twee.naar === 2300, r.twee);
    check('dezelfde dag teruggezet: geen aanpassing', r.terug === null, r.terug);

    // Via het veld bij Instellingen
    await page.click('[data-view="instellingen"]');
    await page.evaluate(() => {
      const veld = document.querySelector('input[data-setting="calorieDoel"]');
      veld.value = '2360';
      veld.dispatchEvent(new Event('change', { bubbles: true }));
    });
    const w = await page.evaluate(() => GD.store.settings().calorieDoelWissel);
    check('ook als je het bij Instellingen intikt', w && w.van === 2510 && w.naar === 2360, w);
    check('en dat zegt de app', /Over twee weken kijk ik of het klopt/.test(await page.textContent('#toast')));

    await page.evaluate(() => GD.store.writeNow());
    await page.reload();
    const bewaard = await page.evaluate(() => GD.store.settings().calorieDoelWissel);
    check('blijft bewaard na herladen', bewaard && bewaard.naar === 2360, bewaard);

    // Een oude back-up zonder dit veld
    const oud = await page.evaluate(() => {
      const raw = JSON.parse(GD.store.exportJSON ? GD.store.exportJSON() : localStorage.getItem('goaldash.v1'));
      delete raw.settings.calorieDoelWissel;
      localStorage.setItem('goaldash.v1', JSON.stringify(raw));
      return true;
    });
    await page.reload();
    const leeg = await page.evaluate(() => GD.store.settings().calorieDoelWissel);
    check('een back-up van vóór deze versie heeft gewoon geen aanpassing', oud && leeg === null, leeg);
    await ctx.close();
  }

  console.log('\nDe twee weken na je aanpassing');
  {
    const { ctx, page } = await pagina(browser);
    await page.evaluate(driewekenTeSnel);
    const voor = await melding(page);
    check('vóór de aanpassing: eet 180 minder, doel hoort 2350',
      voor.advies && voor.advies.kcalPerDag === 180 && voor.advies.nieuwDoel === 2350, voor.advies);

    await teken(page);
    await page.click('[data-action="verbruik-doel"]');                   // de knop op de dagkaart
    const direct = await melding(page);
    const scherm = await page.textContent('main');
    check('de knop zet je doel en onthoudt de aanpassing',
      await page.evaluate(() => GD.store.settings().calorieDoelWissel.naar === 2350));
    check('direct erna: geen "eet minder" meer', direct.advies && direct.advies.rust === true &&
      direct.advies.kcalPerDag === undefined, direct.advies);
    check('geen knop meer om je doel te verzetten', (await page.$$('[data-action="verbruik-doel"]')).length === 0);
    check('wel de datum waarop het advies terugkomt', /pas op 13 okt kijk ik opnieuw/.test(scherm), direct.rust);
    check('de trendlijn blijft staan, maar niet meer als waarschuwing',
      /\+0,41 kg per week over 21 dagen/.test(direct.tekst) && direct.waarschuwing === false, direct);
    check('Verbruik stelt ook niets nieuws voor', direct.verbruik === 'rust' && direct.doelKcal === null, direct);
    await page.click('[data-view="week"]');
    check('Verbruik zegt waarom', /Vanaf 13 okt reken ik alleen met de dagen sinds je aanpassing/
      .test(await page.textContent('main')));

    // Een week braaf 2350: gewicht loopt precies op tempo
    await verder(page, '2026-10-06', 2350, 0.25);
    const week = await melding(page);
    check('na een week: nog steeds rust', week.advies && week.advies.rust, week.advies);
    check('met hoe je gewicht sindsdien loopt',
      /Je gewicht sinds de aanpassing: \+0,2[45] kg per week, uit 7 wegingen in 8 dagen/.test(week.rust), week.rust);
    check('en dat je je nieuwe doel haalt', /gemiddeld 2350 kcal per dag, dus je nieuwe doel lukt/.test(week.rust), week.rust);

    // Na twee weken: alleen de dagen sinds de aanpassing
    await verder(page, '2026-10-13', 2350, 0.25);
    const na = await melding(page);
    check('na twee weken is de rust voorbij', !(na.advies && na.advies.rust), na.advies);
    check('de lijn begint op de dag van de aanpassing', na.venster === 15 && na.vanaf === START, na);
    check('en die zegt: op schema, doel klopt', /op schema/.test(na.tekst) && na.verbruik === 'klopt', na);
    await teken(page, 'dag');
    check('dat staat er ook bij', /vanaf je nieuwe caloriedoel op 29 sep/.test(await page.textContent('main')));
    check('geen fouten op de pagina', page.fouten.length === 0, page.fouten);
    await ctx.close();
  }

  console.log('\nHet nieuwe doel lukt nog niet');
  {
    const { ctx, page } = await pagina(browser);
    await page.evaluate(driewekenTeSnel);
    await page.evaluate(() => GD.store.zetCalorieDoel(2350));
    await verder(page, '2026-10-06', 2530, 0.41);                       // at gewoon door
    const r = await melding(page);
    check('dan zegt de app dat eerst het doel moet lukken',
      /gemiddeld 2530 kcal per dag — dat haalt het nieuwe doel nog niet/.test(r.rust), r.rust);
    check('en geeft ook dan geen nieuw getal', r.advies.rust === true && r.doelKcal === null, r);

    // Na de rust: je doel staat goed, je at er alleen naast
    await verder(page, '2026-10-13', 2530, 0.41);
    const na = await melding(page);
    check('na de rust: nog steeds te snel', na.advies && na.advies.kcalPerDag >= 160 && na.advies.kcalPerDag <= 190, na.advies);
    check('maar je doel staat al goed, dus geen nieuw doel', na.advies.doelKlopt === true && na.advies.nieuwDoel === null, na.advies);
    await teken(page, 'dag');
    const scherm = await page.textContent('main');
    check('dat staat er zo', /Je doel van 2350 kcal past daar al bij/.test(scherm) &&
      /at je gemiddeld 2530 kcal/.test(scherm));
    check('zonder knop die je doel op hetzelfde getal zet', (await page.$$('[data-action="verbruik-doel"]')).length === 0);
    check('geen fouten op de pagina', page.fouten.length === 0, page.fouten);
    await ctx.close();
  }

  console.log('\nWeekafsluiting');
  {
    const { ctx, page } = await pagina(browser);
    await page.evaluate(driewekenTeSnel);
    await page.evaluate(() => GD.store.zetCalorieDoel(2350));
    await verder(page, '2026-10-03', 2350, 0.25);                       // zaterdag
    const r = await page.evaluate(() => {
      const deze = GD.review.maak('2026-10-03');
      const vorige = GD.review.maak('2026-09-26');                      // week vóór de aanpassing
      return { deze: deze.eten, vorige: vorige.eten };
    });
    check('deze week: afwachten, met dezelfde tekst als de dagkaart',
      r.deze.status === 'rust' && /pas op 13 okt kijk ik opnieuw/.test(r.deze.tekst), r.deze);
    check('geen nieuw doel in de afsluiting', !r.deze.nieuwDoel && !r.deze.bijstellen, r.deze);
    check('een week van vóór de aanpassing houdt zijn gewone advies', r.vorige.status !== 'rust', r.vorige.status);
    check('geen fouten op de pagina', page.fouten.length === 0, page.fouten);
    await ctx.close();
  }

  console.log('\nTwee aanpassingen na elkaar');
  {
    const { ctx, page } = await pagina(browser, '2026-09-01T10:00:00');
    const r = await page.evaluate(() => {
      const st = GD.store, S = GD.score;
      st.setSetting('calorieDoel', 2700);
      st.zetCalorieDoel(2530);                                          // 1 september
      return true;
    });
    await page.clock.setSystemTime(new Date(START + 'T10:00:00'));
    const w = await page.evaluate(() => {
      GD.store.zetCalorieDoel(2350);
      const S = GD.score;
      return {
        nu: S.doelWissel('2026-09-29'), toen: S.doelWissel('2026-09-10'), daarvoor: S.doelWissel('2026-08-20')
      };
    });
    check('vandaag geldt de nieuwste', r && w.nu.naar === 2350 && w.nu.rust, w.nu);
    check('op 10 september de aanpassing van 1 september', w.toen && w.toen.naar === 2530 && w.toen.rust, w.toen);
    check('daarvóór geen', w.daarvoor === null, w.daarvoor);
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
