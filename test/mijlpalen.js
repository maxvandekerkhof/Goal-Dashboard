/* Mijlpalen: kracht, lichaamsgewicht en reeksen. Met verzonnen data, geen
   eigen data nodig.

   Augustus 2026. Bankdrukken van 40 naar 50 kg, pull-ups van 6 naar 10,
   lateral raises per arm van 8 naar 10 kg (links loopt een sessie achter).
   Elke dag gewogen, +0,5 kg per week vanaf 70 kg, streefgewicht 71,5. Creatine
   1 t/m 14 aug, niet op 15 aug, daarna weer elke dag. Alleen creatine telt
   mee in de dagscore, dus goede dagen lopen gelijk op met creatine. Water
   1 t/m 7 aug op je doel. Vandaag is 30 augustus. */
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
  await page.clock.install({ time: new Date('2026-08-30T10:00:00') });
  await page.goto(T.PAGINA);
  await page.evaluate(() => {
    const st = GD.store, D = GD.date, L = GD.lifts;
    GD.GOALS.forEach((g) => st.setWeight(g.key, g.key === 'creatine' ? 1 : 0));
    st.setSetting('gewichtRichting', 'aankomen');
    st.setSetting('gewichtDoel', 71.5);
    st.setSetting('waterDoel', 3000);

    D.range('2026-08-01', '2026-08-29').forEach((d, i) => {
      st.setField(d, 'gewicht', +(70 + i * 0.5 / 7).toFixed(3));
      st.setField(d, 'creatine', d === '2026-08-15' ? 'nee' : 'ja');
      if (d <= '2026-08-07') st.setField(d, 'waterMl', 3000);
    });

    const sid = L.addSchema('Push');
    const bank = L.addOefening('Bankdrukken');
    const pull = L.addOefening('Pullups', { type: 'reps' });
    const lat = L.addOefening('Lateral raise', { perArm: true });
    [bank, pull, lat].forEach((o) => L.addToSchema(sid, o));
    const set = (d, o, z, kg, reps) => { L.setVeld(d, o, z, 'kg', kg); L.setVeld(d, o, z, 'reps', reps); };
    set('2026-08-03', bank, '', 40, 8);
    set('2026-08-07', bank, '', 42.5, 8);
    set('2026-08-12', bank, '', 45, 6);
    set('2026-08-20', bank, '', 47.5, 8);
    set('2026-08-28', bank, '', 50, 5);
    L.setVeld('2026-08-03', pull, '', 'reps', 6);
    L.setVeld('2026-08-10', pull, '', 'reps', 8);
    L.setVeld('2026-08-17', pull, '', 'reps', 10);
    set('2026-08-03', lat, 'r', 8, 12); set('2026-08-03', lat, 'l', 8, 12);
    set('2026-08-10', lat, 'r', 10, 10); set('2026-08-10', lat, 'l', 9, 10);
    set('2026-08-17', lat, 'r', 10, 10); set('2026-08-17', lat, 'l', 10, 9);
    L.setDagSchema(D.today(), sid);
    st.writeNow();
    window.__ids = { bank, pull, lat };
  });
  await page.reload();
  return { ctx, page };
}

async function main() {
  const browser = await T.lanceer();
  const { ctx, page } = await bouw(browser);

  console.log('\nWat er uit je gegevens volgt');
  {
    const r = await page.evaluate(() => {
      const L = GD.lifts;
      const id = (n) => L.zoekOpNaam(n).id;
      const alle = GD.mijlpalen.alle();
      const op = {};
      alle.forEach((m) => { op[m.id] = m.datum; });
      // Wanneer het weekgemiddelde voor het eerst een kilo boven het begin
      // staat: hier nagerekend, los van de app.
      const D = GD.date;
      const w = (d) => 70 + D.dagenTussen('2026-08-01', d) * 0.5 / 7;
      const begin = D.range('2026-08-01', '2026-08-07').reduce((s, d) => s + w(d), 0) / 7;
      let kiloDag = null, doelDag = null;
      D.range('2026-08-07', '2026-08-29').forEach((d) => {
        const gem = D.range(D.addDays(d, -6), d).reduce((s, x) => s + w(x), 0) / 7;
        if (!kiloDag && gem - begin >= 1) kiloDag = d;
        if (!doelDag && gem >= 71.5) doelDag = d;
      });
      return {
        op, kiloDag, doelDag, n: alle.length,
        bank: id('Bankdrukken'), pull: id('Pullups'), lat: id('Lateral raise'),
        bankTitel: (alle.filter((m) => m.id === 'k|' + id('Bankdrukken') + '|kg|50')[0] || {}).titel,
        bankTekst: (alle.filter((m) => m.id === 'k|' + id('Bankdrukken') + '|kg|50')[0] || {}).tekst
      };
    });
    const k = (o, rest) => r.op['k|' + o + '|' + rest];
    check('bankdrukken: 45 kg op 12 aug, 50 kg op 28 aug', k(r.bank, 'kg|45') === '2026-08-12' &&
      k(r.bank, 'kg|50') === '2026-08-28', r.op);
    check('je startgewicht is geen mijlpaal', !k(r.bank, 'kg|40') && !k(r.bank, 'kg|5'));
    check('met een titel en waar je begon', r.bankTitel === 'Voor het eerst 50 kg bij Bankdrukken' &&
      r.bankTekst === '50 kg × 5 — je begon op 40 kg × 8 (3 aug).', [r.bankTitel, r.bankTekst]);
    check('geschat 1RM 10% sterker op 20 aug (47,5 × 8)', k(r.bank, 'pct|10') === '2026-08-20' && !k(r.bank, 'pct|25'), r.op);
    check('pull-ups: 10 reps op 17 aug, 5 was al je start', k(r.pull, 'reps|10') === '2026-08-17' && !k(r.pull, 'reps|5'), r.op);
    check('per arm telt de zwakste kant: 10 kg pas op 17 aug', k(r.lat, 'kg|10') === '2026-08-17', r.op);
    check('+1 kg op de dag dat je weekgemiddelde het haalt', r.op['g|kg|1'] === r.kiloDag && !!r.kiloDag, [r.op['g|kg|1'], r.kiloDag]);
    check('streefgewicht 71,5 kg', r.op['g|doel|71.5'] === r.doelDag && !!r.doelDag, [r.op['g|doel|71.5'], r.doelDag]);
    check('creatine 7 en 14 dagen op rij', r.op['r|creatine|7'] === '2026-08-07' && r.op['r|creatine|14'] === '2026-08-14', r.op);
    check('goede dagen lopen mee', r.op['r|goed|7'] === '2026-08-07' && r.op['r|goed|14'] === '2026-08-14', r.op);
    check('water 7 dagen op rij', r.op['r|water|7'] === '2026-08-07' && !r.op['r|water|14'], r.op);
    const dubbel = await page.evaluate(() => GD.mijlpalen.alle().filter((m) => m.id === 'r|creatine|7').length);
    check('na de onderbreking van 15 aug geen tweede "7 op rij"', dubbel === 1, dubbel);
  }

  console.log('\nOp de dag zelf');
  {
    await page.click('[data-nav="prev"]');
    await page.click('[data-nav="prev"]');
    const kaart = await page.textContent('.mijlpaal-kaart');
    check('28 aug: een kaart met de mijlpaal', /Mijlpaal/.test(kaart) && /28 aug/.test(kaart) &&
      /Voor het eerst 50 kg bij Bankdrukken/.test(kaart), kaart);
    await page.click('[data-nav="today"]');
    check('vandaag nog niets', (await page.$$('.mijlpaal-kaart')).length === 0);

    const voor = await page.evaluate(() => localStorage.getItem('goaldash.v1'));
    const bank = await page.evaluate(() => GD.lifts.zoekOpNaam('Bankdrukken').id);
    await page.fill('[data-lift="kg"][data-oef="' + bank + '"]', '55');
    await page.press('[data-lift="kg"][data-oef="' + bank + '"]', 'Tab');
    await page.fill('[data-lift="reps"][data-oef="' + bank + '"]', '5');
    await page.press('[data-lift="reps"][data-oef="' + bank + '"]', 'Tab');
    await page.waitForTimeout(50);
    // 55 kg is geen rond gewicht (boven de 50 per tien), maar 55 × 5 is wel
    // 26% boven je start.
    check('een nieuwe mijlpaal meldt zich meteen', /^Mijlpaal: Bankdrukken 25% sterker!$/
      .test(await page.textContent('#toast')), await page.textContent('#toast'));
    const vandaag = await page.textContent('.mijlpaal-kaart');
    check('en staat bovenaan, met "vandaag"', /vandaag/.test(vandaag) && /Bankdrukken 25% sterker/.test(vandaag) &&
      !/55 kg bij/.test(vandaag), vandaag);

    await page.evaluate(() => GD.store.writeNow());
    const na = JSON.parse(await page.evaluate(() => localStorage.getItem('goaldash.v1')));
    check('mijlpalen worden nergens opgeslagen', !/mijlpa/i.test(JSON.stringify(na)) && voor !== null);
  }

  console.log('\nHet maandscherm');
  {
    await page.click('.tab[data-view="maand"]');
    const kaart = await page.textContent('.mijlpalen-maand');
    check('een kaart Mijlpalen met wat je in augustus haalde', /In augustus/.test(kaart) &&
      /Bankdrukken 25% sterker/.test(kaart) && /14 dagen op rij creatine/.test(kaart), kaart);
    check('nieuwste bovenaan', (await page.$$eval('.mijlpalen-maand .mijlpaal-datum', (l) => l.map((x) => x.textContent)))[0] === '30 aug');
    check('bijna: 60 kg bankdrukken', /Bijna/.test(kaart) && /60 kg bij Bankdrukken/.test(kaart) &&
      /Je zwaarste is 55 kg/.test(kaart), kaart);
    const blok = await page.textContent('.review');
    check('de maandafsluiting noemt ze', /mijlpalen/.test(blok) && /Voor het eerst 50 kg bij Bankdrukken \(28 aug\)/.test(blok));

    await page.clock.setSystemTime(new Date('2026-09-05T10:00:00'));
    await page.reload();
    await page.click('.tab[data-view="maand"]');
    const sep = await page.textContent('.mijlpalen-maand');
    check('september: nog niets, en de rest ingeklapt', /Deze maand nog geen mijlpaal/.test(sep) &&
      /Alle mijlpalen/.test(sep) && await page.isHidden('#inklap-mijlpalen'), sep);
    await page.click('[data-action="inklap"][data-sectie="mijlpalen"]');
    check('uitklappen laat ze allemaal zien', await page.isVisible('#inklap-mijlpalen') &&
      /50 kg bij Bankdrukken/.test(await page.textContent('#inklap-mijlpalen')));
  }

  check('geen fouten', !page.fouten.length, page.fouten);
  await ctx.close();
  await browser.close();
  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
