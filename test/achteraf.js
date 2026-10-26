/* Een aanpassing van je caloriedoel achteraf invullen. Met verzonnen data,
   geen eigen data nodig.

   15 aug t/m 27 sep at je 2733 kcal en kwam je 0,8 kg per week aan. Op
   28 sep ging je doel van 2800 naar 2530, maar dat wist de app niet: er staat
   niets in het logboek. Sindsdien eet je 2530 en kom je 0,25 kg per week aan,
   precies je tempo. Vandaag is 13 oktober. */
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
  await page.clock.install({ time: new Date('2026-10-13T10:00:00') });
  await page.goto(T.PAGINA);
  await page.evaluate(() => {
    const st = GD.store, D = GD.date;
    st.setSetting('gewichtRichting', 'aankomen');
    st.setSetting('gewichtTempo', 0.25);
    st.setSetting('calorieRichting', 'min');
    st.setSetting('calorieDoel', 2530);
    let kg = 70;
    D.range('2026-08-15', '2026-10-12').forEach((d) => {
      const voor = d < '2026-09-28';
      st.setField(d, 'kcal', voor ? 2733 : 2530);
      st.setField(d, 'gewicht', +kg.toFixed(2));
      kg += (voor ? 0.8 : 0.25) / 7;
    });
    // Zoals bij een aanpassing van vóór het logboek: de app weet van niets.
    st.settings().doelLog = [];
    st.settings().calorieDoelWissel = null;
    st.writeNow();
  });
  await page.reload();
  return { ctx, page };
}

const stand = (page) => page.evaluate(() => {
  const S = GD.score, g = S.gewichtMelding();
  return {
    wissel: S.doelWissel(), sep: S.calorieDoelOp('2026-09-10'), wisseldag: S.calorieDoelOp('2026-09-28'),
    trendVanaf: g.trendVanaf, venster: g.trendVenster, status: g.status, advies: g.advies, perWeek: g.trendPerWeek,
    keten: GD.store.settings().calorieDoelWissel
  };
});

async function main() {
  const browser = await T.lanceer();

  console.log('\nAlsnog invullen');
  {
    const { ctx, page } = await bouw(browser);
    const voor = await stand(page);
    check('vooraf: de app kent geen aanpassing', voor.wissel === null && voor.trendVanaf === null, voor);
    check('vooraf: september telt op 2530', voor.sep === 2530, voor.sep);
    check('vooraf: de lijn loopt over drie weken, met je oude eten erin', voor.venster === 21 && voor.perWeek > 0.3, voor);

    const fouten = await page.evaluate(() => {
      const st = GD.store;
      return {
        vandaag: st.calorieWisselAchteraf('2026-10-13', 2800, 2530),
        morgen: st.calorieWisselAchteraf('2026-10-14', 2800, 2530),
        gelijk: st.calorieWisselAchteraf('2026-09-28', 2530, 2530),
        leeg: st.calorieWisselAchteraf('2026-09-28', null, 2530),
        raar: st.calorieWisselAchteraf('2026-09-28', 28000, 2530),
        geenDatum: st.calorieWisselAchteraf('', 2800, 2530),
        log: st.settings().doelLog.length
      };
    });
    check('niet voor vandaag of later', /vóór vandaag/.test(fouten.vandaag) && /vóór vandaag/.test(fouten.morgen), fouten);
    check('van en naar gelijk is geen aanpassing', /niets aangepast/.test(fouten.gelijk), fouten.gelijk);
    check('lege of onzinnige getallen niet', /tussen 500 en 10.000/.test(fouten.leeg) && /tussen 500/.test(fouten.raar), fouten);
    check('zonder datum niet', /Kies een datum/.test(fouten.geenDatum), fouten.geenDatum);
    check('en dan blijft het logboek leeg', fouten.log === 0, fouten.log);

    const goed = await page.evaluate(() => GD.store.calorieWisselAchteraf('2026-09-28', 2800, 2530));
    const na = await stand(page);
    check('28 sep 2800 → 2530 gaat erin', goed === null, goed);
    check('het advies kent hem nu, zonder rust: hij is al 15 dagen oud', na.wissel &&
      na.wissel.datum === '2026-09-28' && na.wissel.van === 2800 && na.wissel.naar === 2530 && !na.wissel.rust, na.wissel);
    check('de lijn begint op 28 sep', na.trendVanaf === '2026-09-28' && na.venster === 16, na);
    check('en zegt: precies je tempo, +0,25 kg per week', na.status === 'op-schema' &&
      Math.abs(na.perWeek - 0.25) < 0.01, na);
    check('september telt weer op 2800, vanaf 28 sep 2530', na.sep === 2800 && na.wisseldag === 2530, na);

    const dubbel = await page.evaluate(() => GD.store.calorieWisselAchteraf('2026-09-28', 2900, 2530));
    check('twee keer op dezelfde dag niet', /staat al een aanpassing/.test(dubbel), dubbel);

    const maand = await page.evaluate(() => GD.review.maakGewicht('2026-09-01', '2026-09-30').wijzigingen.map((w) => w.tekst));
    check('wat je in september aanpaste noemt hem', maand.some((t) => /28 sep: caloriedoel van 2800 kcal naar 2530 kcal/.test(t)), maand);

    await page.evaluate(() => GD.store.writeNow());
    await page.reload();
    const bewaard = await page.evaluate(() => {
      const r = GD.store.settings().doelLog.filter((x) => x.veld === 'calorieDoel');
      return { r, export: JSON.parse(GD.store.exportJSON()).settings.doelLog.length };
    });
    check('blijft bewaard, en zit in je back-up', bewaard.r.length === 1 && bewaard.r[0].achteraf === true &&
      bewaard.export === 1, bewaard);

    const weg = await page.evaluate(() => GD.store.calorieWisselWeg('2026-09-28'));
    const daarna = await stand(page);
    check('weghalen zet alles terug', weg === true && daarna.wissel === null && daarna.sep === 2530, daarna);
    check('geen fouten', !page.fouten.length, page.fouten);
    await ctx.close();
  }

  console.log('\nNaast aanpassingen die de app zelf onthield');
  {
    const { ctx, page } = await bouw(browser);
    // Op 10 oktober verzette je je doel in de app zelf.
    await page.clock.setSystemTime(new Date('2026-10-10T10:00:00'));
    await page.evaluate(() => GD.store.zetCalorieDoel(2450));
    await page.clock.setSystemTime(new Date('2026-10-13T10:00:00'));
    const r = await page.evaluate(() => {
      const st = GD.store, S = GD.score;
      st.calorieWisselAchteraf('2026-09-28', 2800, 2530);
      const keten = JSON.parse(JSON.stringify(st.settings().calorieDoelWissel));
      const uit = {
        keten, nu: S.doelWissel(), okt1: S.doelWissel('2026-10-01'), sep: S.doelWissel('2026-09-20'),
        okt5: S.calorieDoelOp('2026-10-05')
      };
      // Nog een oudere erbij: de nieuwste twee blijven in de keten.
      st.calorieWisselAchteraf('2026-08-20', 3000, 2800);
      uit.keten2 = JSON.parse(JSON.stringify(st.settings().calorieDoelWissel));
      uit.aug = S.calorieDoelOp('2026-08-25'); uit.aug16 = S.calorieDoelOp('2026-08-16');
      uit.geenWeg = st.calorieWisselWeg('2026-10-10');
      st.calorieWisselWeg('2026-09-28');
      uit.keten3 = JSON.parse(JSON.stringify(st.settings().calorieDoelWissel));
      return uit;
    });
    check('de nieuwste blijft de nieuwste, met de jouwe één stap terug', r.keten.datum === '2026-10-10' &&
      r.keten.eerder && r.keten.eerder.datum === '2026-09-28', r.keten);
    check('vandaag: rust na 10 okt', r.nu.datum === '2026-10-10' && r.nu.rust, r.nu);
    check('op 1 okt gold die van 28 sep', r.okt1 && r.okt1.datum === '2026-09-28', r.okt1);
    check('daarvóór geen', r.sep === null, r.sep);
    check('het doel tussen 28 sep en 10 okt is 2530', r.okt5 === 2530, r.okt5);
    check('een oudere komt in het logboek, de keten houdt de nieuwste twee', r.keten2.datum === '2026-10-10' &&
      r.keten2.eerder.datum === '2026-09-28' && r.aug === 2800 && r.aug16 === 3000, r);
    check('wat de app zelf onthield kun je niet weghalen', r.geenWeg === false);
    check('na weghalen van 28 sep schuift 20 aug op', r.keten3.datum === '2026-10-10' &&
      r.keten3.eerder && r.keten3.eerder.datum === '2026-08-20', r.keten3);
    await ctx.close();
  }

  console.log('\nVia Instellingen');
  {
    const { ctx, page } = await bouw(browser);
    await page.click('.tab[data-view="instellingen"]');
    await page.click('[data-action="inklap"][data-sectie="voeding"]');
    const leeg = await page.textContent('#inklap-voeding');
    check('zegt dat er nog niets bekend is', /kent nog geen aanpassingen/.test(leeg));
    check('naar staat al op je huidige doel', await page.inputValue('#cw-naar') === '2530');
    check('je kunt geen dag na gisteren kiezen', await page.getAttribute('#cw-datum', 'max') === '2026-10-12');

    await page.click('[data-action="calorie-wissel-erbij"]');
    check('zonder datum: een melding', /Kies een datum/.test(await page.textContent('#toast')));

    await page.fill('#cw-datum', '2026-09-28');
    await page.fill('#cw-van', '2800');
    await page.click('[data-action="calorie-wissel-erbij"]');
    check('toegevoegd, met wat het doet', /Aanpassing van 28 sep toegevoegd\. Het advies rekent nu vanaf die dag\./
      .test(await page.textContent('#toast')), await page.textContent('#toast'));
    const lijst = await page.textContent('#inklap-voeding .kopieen');
    check('staat in de lijst', /28 sep 2026/.test(lijst) && /2800 → 2530 kcal · achteraf ingevuld/.test(lijst), lijst);

    await page.click('.tab[data-view="dag"]');
    check('de dagkaart rekent vanaf 28 sep', /vanaf je nieuwe caloriedoel op 28 sep/.test(await page.textContent('main')));

    await page.click('.tab[data-view="instellingen"]');
    await page.click('[data-action="calorie-wissel-weg"][data-datum="2026-09-28"]');
    check('en weer weggehaald', /kent nog geen aanpassingen/.test(await page.textContent('#inklap-voeding')) &&
      await page.evaluate(() => GD.score.doelWissel() === null));

    // Binnen twee weken: dan wacht het advies.
    await page.fill('#cw-datum', '2026-10-05');
    await page.fill('#cw-van', '2800');
    await page.click('[data-action="calorie-wissel-erbij"]');
    check('een recente aanpassing krijgt rust', /Tot 19 okt wacht het advies af/.test(await page.textContent('#toast')),
      await page.textContent('#toast'));
    check('geen fouten', !page.fouten.length, page.fouten);
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
