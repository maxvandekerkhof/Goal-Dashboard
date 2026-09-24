/* Ronde 2: het advies klopt. Punt 3 (gisteren overnemen), 4 (weekafsluiting
   op de trendlijn) en 6 (Health na leegmaken). */
const T = require('./lib');
const fs = require('fs');

const BASIS = T.PAGINA;
const BACKUP = T.prive('backup-24.json');
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
  await page.goto(BASIS);
  return { ctx, page };
}

async function main() {
  const browser = await T.lanceer();

  console.log('\n3 · Neem gisteren over');
  {
    const { ctx, page } = await pagina(browser);
    const r = await page.evaluate(() => {
      const D = GD.date, st = GD.store, g = D.addDays(D.today(), -1), t = D.today();
      st.setSetting('voedingSync', true);
      const gisteren = { gewicht: 74.0, kcal: 2500, kcalBron: 'hand', eiwitGram: 160, eiwitGramBron: 'health',
        ontbijt: 'ja', lunch: 'eiwitrijk', creatine: 'ja', gesport: 'ja', eiwit: 'ja', calorieen: 'ja',
        overload: 'ja', waterMl: 2000, notitie: 'zwaar' };
      Object.keys(gisteren).forEach((k) => st.setField(g, k, gisteren[k]));
      document.querySelector('[data-view="dag"]').click();
      document.querySelector('[data-action="copy-yesterday"]').click();
      const vandaag = Object.assign({}, st.entry(t));
      const map = {}; map[t] = { kcal: 1850, eiwit: 120 };
      st.putVoeding(map);
      GD.voeding.toepassen();
      const naHealth = { kcal: st.entry(t).kcal, eiwitGram: st.entry(t).eiwitGram };
      // Met de automatische afleiding uit: dan zijn het gewone vinkjes
      st.deleteEntry(t);
      st.setSetting('autoMacro', false);
      document.querySelector('[data-action="copy-yesterday"]').click();
      const zonderAuto = Object.assign({}, st.entry(t));
      return { vandaag, naHealth, zonderAuto, toast: document.getElementById('toast').textContent };
    });
    const v = r.vandaag;
    check('vinkjes gaan mee (ontbijt, lunch, creatine, gesport)',
      v.ontbijt === 'ja' && v.lunch === 'eiwitrijk' && v.creatine === 'ja' && v.gesport === 'ja', v);
    check('gewicht gaat niet mee', v.gewicht === undefined, v.gewicht);
    check('calorieën en eiwit gaan niet mee', v.kcal === undefined && v.eiwitGram === undefined, v);
    check('de bronmerken gaan niet mee', v.kcalBron === undefined && v.eiwitGramBron === undefined, v);
    check('water, notitie en overload gaan niet mee', v.waterMl === undefined && v.notitie === undefined && v.overload === undefined, v);
    check('eiwit- en caloriedoel "ja" gaan niet mee zolang de app ze afleidt', v.eiwit === undefined && v.calorieen === undefined, v);
    check('Health vult daarna de echte voeding van vandaag in', r.naHealth.kcal === 1850 && r.naHealth.eiwitGram === 120, r.naHealth);
    check('met afleiden uit gaan eiwit en calorieën als vinkje wel mee', r.zonderAuto.eiwit === 'ja' && r.zonderAuto.calorieen === 'ja', r.zonderAuto);
    await ctx.close();
  }

  console.log('\n6 · Health na leegmaken');
  {
    const { ctx, page } = await pagina(browser);
    const r = await page.evaluate(() => {
      const st = GD.store, t = GD.date.today();
      st.setSetting('voedingSync', true);
      st.setField(t, 'waterMl', 1000);
      st.setField(t, 'kcal', 3100); st.setField(t, 'kcalBron', 'hand');   // verkeerd getal ingetikt
      const map = {}; map[t] = { kcal: 2650, eiwit: 150 };
      st.putVoeding(map);
      document.querySelector('[data-view="dag"]').click();
      const zet = (w) => {
        const veld = document.querySelector('input[data-field="kcal"]');
        veld.value = w;
        veld.dispatchEvent(new Event('change', { bubbles: true }));
      };
      zet('');
      const naLeeg = { kcal: st.entry(t).kcal, bron: st.entry(t).kcalBron,
        scherm: document.querySelector('input[data-field="kcal"]').value };
      zet('2800');
      const naTikken = { kcal: st.entry(t).kcal, bron: st.entry(t).kcalBron };
      map[t] = { kcal: 2700, eiwit: 150 }; st.putVoeding(map); GD.voeding.toepassen();
      const naSync = st.entry(t).kcal;
      // Leeg zonder dat Health iets klaar heeft staan
      st.putVoeding({});
      zet('');
      const leegZonder = { kcal: st.entry(t).kcal, bron: st.entry(t).kcalBron };
      map[t] = { kcal: 2750, eiwit: 150 }; st.putVoeding(map); GD.voeding.toepassen();
      return { naLeeg, naTikken, naSync, leegZonder, laterBinnen: st.entry(t).kcal };
    });
    check('leegmaken haalt de waarde uit Health er meteen in', r.naLeeg.kcal === 2650 && r.naLeeg.bron === 'health', r.naLeeg);
    check('en die staat ook op het scherm', r.naLeeg.scherm === '2650', r.naLeeg);
    check('zelf een getal intikken wint nog steeds', r.naTikken.kcal === 2800 && r.naTikken.bron === 'hand', r.naTikken);
    check('Health overschrijft dat ingetikte getal niet', r.naSync === 2800, r.naSync);
    check('leeg zonder Health-waarde: geen slot erop', r.leegZonder.kcal === undefined && r.leegZonder.bron === undefined, r.leegZonder);
    check('dan vult de volgende sync het wel in', r.laterBinnen === 2750, r.laterBinnen);
    await ctx.close();
  }

  console.log('\n4 · Weekafsluiting op zaterdag 26 september (je data + 3 gewone wegingen)');
  if (!BACKUP) T.overslaan('4 · Weekafsluiting op zaterdag 26 september (je data + 3 gewone wegingen)'); else {
    const { ctx, page } = await pagina(browser, '2026-09-26T09:30:00');
    const r = await page.evaluate((b) => {
      GD.store.importJSON(b);
      [['2026-09-23', null, 2650], ['2026-09-24', 73.0, 2700], ['2026-09-25', 72.9, 2600],
       ['2026-09-26', 73.1, null]].forEach(function (p) {
        if (p[1] !== null) GD.store.setField(p[0], 'gewicht', p[1]);
        if (p[2] !== null) GD.store.setField(p[0], 'kcal', p[2]);
      });
      document.querySelector('[data-view="dag"]').click();
      const t = GD.date.today();
      const gm = GD.score.gewichtMelding(t);
      const rv = GD.review.maak(t);
      const blokken = Array.from(document.querySelectorAll('.rv-blok')).map((x) => x.textContent);
      return { gm: { status: gm.status, trend: gm.trendPerWeek, tekst: gm.tekst },
        eten: rv.eten, g: rv.gewicht, blokken: blokken.join(' | '),
        dagkaart: (document.querySelector('.meldregel') || {}).textContent };
    }, BACKUP).catch((e) => ({ err: e.message }));
    if (r.err) { check('pagina draait', false, r.err); }
    else {
      check('de weekafsluiting rust op de trendlijn', r.g.uitTrend === true, r.g.uitTrend);
      check('en geeft hetzelfde oordeel als de dagkaart', r.g.status === r.gm.status, { afsluiting: r.g.status, dagkaart: r.gm.status });
      check('eten: "kloppen met elkaar" bij op schema', r.eten.status === 'op-schema', r.eten.status);
      check('geen "straks ongeveer 3050 kcal" meer', !/3050/.test(r.blokken), r.blokken.slice(0, 200));
      check('noemt dezelfde trend als de dagkaart', r.blokken.indexOf(GD_kg(r.gm.trend)) >= 0, { trend: GD_kg(r.gm.trend) });
    }
    await ctx.close();
  }

  console.log('\n4 · Zaterdag 19 september (echte data): te snel');
  if (!BACKUP) T.overslaan('4 · Zaterdag 19 september (echte data): te snel'); else {
    const { ctx, page } = await pagina(browser, '2026-09-19T09:30:00');
    const r = await page.evaluate((b) => {
      GD.store.importJSON(b);
      const t = GD.date.today();
      const gm = GD.score.gewichtMelding(t);
      const rv = GD.review.maak(t);
      return { gmStatus: gm.status, gmStap: gm.advies && gm.advies.kcalPerDag, eten: rv.eten, g: rv.gewicht,
        doel: GD.store.settings().calorieDoel };
    }, BACKUP);
    check('allebei "te snel"', r.g.status === 'snel' && r.gmStatus === 'snel', r);
    check('dezelfde stap als de dagkaart (300 kcal minder)', r.eten.bijstellen === -r.gmStap, { afsluiting: r.eten.bijstellen, dagkaart: r.gmStap });
    check('nooit meer dan 300 kcal per stap', Math.abs(r.eten.bijstellen) <= 300, r.eten.bijstellen);
    if (r.eten.nieuwDoel !== null) check('voorstel = doel − 300', r.eten.nieuwDoel === r.doel - 300, r.eten);
    await ctx.close();
  }

  console.log('\n4 · Vrijdag 25 september: hetzelfde voorgestelde doel als de dagkaart');
  if (!BACKUP) T.overslaan('4 · Vrijdag 25 september: hetzelfde voorgestelde doel als de dagkaart'); else {
    const { ctx, page } = await pagina(browser, '2026-09-25T20:00:00');
    const r = await page.evaluate((b) => {
      GD.store.importJSON(b);
      const t = GD.date.today();
      const gm = GD.score.gewichtMelding(t);
      const rv = GD.review.maak(t);
      return { gm: gm.advies, eten: rv.eten, peil: rv.peildatum };
    }, BACKUP);
    check('peildatum is vandaag zolang de week loopt', r.peil === '2026-09-25', r.peil);
    if (r.gm && r.gm.nieuwDoel && r.eten.nieuwDoel !== null) {
      check('zelfde nieuwe doel als de dagkaart', r.eten.nieuwDoel === r.gm.nieuwDoel, { afsluiting: r.eten.nieuwDoel, dagkaart: r.gm.nieuwDoel });
    } else {
      check('dagkaart en afsluiting hebben allebei een voorstel', false, r);
    }
    await ctx.close();
  }

  console.log('\n4 · Weekoverzicht: de kaart Gewichtstrend spreekt de afsluiting niet tegen');
  if (!BACKUP) T.overslaan('4 · Weekoverzicht: de kaart Gewichtstrend spreekt de afsluiting niet tegen'); else {
    const { ctx, page } = await pagina(browser, '2026-09-23T20:00:00');
    const r = await page.evaluate((b) => {
      GD.store.importJSON(b);
      document.querySelector('[data-view="week"]').click();
      const kaarten = Array.from(document.querySelectorAll('#view > .card'));
      const trend = kaarten.find((k) => /Gewichtstrend/.test(k.querySelector('h2') ? k.querySelector('h2').textContent : ''));
      return { trend: trend ? trend.textContent : null, gm: GD.score.gewichtMelding(GD.date.today()).tekst };
    }, BACKUP);
    check('de kaart toont de trend per week', r.trend && /per week/.test(r.trend), r.trend && r.trend.slice(0, 160));
    check('en niet "de verkeerde kant op" terwijl de lijn stijgt', r.trend && !/verkeerde kant/.test(r.trend), r.trend && r.trend.slice(0, 200));
    check('met hetzelfde oordeel als de dagkaart', r.trend && r.trend.indexOf(r.gm) >= 0, r.gm);
    await ctx.close();
  }

  console.log('\n4 · Weinig wegingen: terug naar week tegen week, met bevestiging');
  {
    const { ctx, page } = await pagina(browser, '2026-09-26T09:30:00');
    const r = await page.evaluate(() => {
      const st = GD.store, D = GD.date;
      st.setSetting('gewichtRichting', 'aankomen'); st.setSetting('gewichtTempo', 0.25);
      st.setSetting('calorieDoel', 2500);
      // Alleen ma/wo/vr: 9 wegingen in drie weken, en pas deze week omhoog
      [['2026-09-07', 72], ['2026-09-09', 72], ['2026-09-11', 72], ['2026-09-14', 72], ['2026-09-16', 72],
       ['2026-09-18', 72], ['2026-09-21', 73], ['2026-09-23', 73], ['2026-09-25', 73]].forEach((p) => st.setField(p[0], 'gewicht', p[1]));
      ['2026-09-21', '2026-09-22', '2026-09-23', '2026-09-24', '2026-09-25'].forEach((d) => st.setField(d, 'kcal', 2500));
      const rv = GD.review.maak(D.today());
      return { g: rv.gewicht, eten: rv.eten };
    });
    check('geen trendlijn bij 9 wegingen', r.g.uitTrend === false, r.g.uitTrend);
    check('dan week tegen week: +1,00 kg is te snel', r.g.status === 'snel' && Math.abs(r.g.delta - 1) < 0.01, r.g);
    check('de week ervóór zei iets anders, dus eerst afwachten', r.eten.status === 'afwachten', r.eten.status);
    check('ook dan niet meer dan 300 kcal in het vooruitzicht', /ongeveer 2200 kcal/.test(r.eten.tekst), r.eten.tekst);
    await ctx.close();
  }

  console.log('\n4 · Uitlegteksten');
  {
    const { ctx, page } = await pagina(browser);
    await page.click('[data-view="instellingen"]');
    const tekst = await page.textContent('#view');
    check('Instellingen noemen de trendlijn', /lijn door al die wegingen/.test(tekst));
    check('"kleurt pas rood als hij twee weken op rij" is weg', !/kleurt pas rood als hij twee weken op rij/.test(tekst));
    check('"rekent met dezelfde gemiddelden, maar waarschuwt pas" is weg', !/rekent met dezelfde gemiddelden, maar waarschuwt pas/.test(tekst));
    check('geen fouten op de pagina', page.fouten.length === 0, page.fouten);
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
}

/* "+0,15 kg" zoals kgTekst het schrijft. */
function GD_kg(n) {
  const v = Math.round(n * 100) / 100;
  return (v > 0 ? '+' : (v < 0 ? '−' : '')) + Math.abs(v).toFixed(2).replace('.', ',') + ' kg';
}

main().catch((e) => { console.error(e); process.exit(2); });
