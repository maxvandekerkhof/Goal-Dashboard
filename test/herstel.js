/* Herstel na een blessure: je eerste sessies van elke oefening tellen alleen
   mee als ze vooruitgaan, en een plateau telt pas vanaf daarna. Met verzonnen
   data, geen eigen data nodig. Vandaag is 25 oktober; geblesseerd van 6 tot en
   met 10 oktober. */
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

  await page.evaluate(() => {
    const st = GD.store, L = GD.lifts, D = GD.date;
    st.reset();
    const sid = L.addSchema('Push');
    const bank = L.addOefening('Bankdrukken');
    const squat = L.addOefening('Squat');
    const curl = L.addOefening('Curl');
    const roei = L.addOefening('Roeien');
    const lat = L.addOefening('Lateral raise', { perArm: true });
    [bank, squat, curl, roei, lat].forEach((o) => L.addToSchema(sid, o));
    const set = (d, o, z, kg, reps) => {
      L.setVeld(d, o, z, 'kg', kg); L.setVeld(d, o, z, 'reps', reps);
      st.setField(d, 'gesport', 'ja');
    };

    // Vóór de blessure.
    set('2026-10-01', bank, '', 60, 8);
    set('2026-10-04', bank, '', 62.5, 8);
    set('2026-10-02', squat, '', 80, 5);
    set('2026-10-01', lat, 'r', 10, 12); set('2026-10-01', lat, 'l', 10, 12);
    ['2026-09-01', '2026-09-08', '2026-09-15', '2026-09-22', '2026-09-29'].forEach((d) => set(d, roei, '', 40, 10));

    D.range('2026-10-06', '2026-10-10').forEach((d) => st.setField(d, 'gesport', 'blessure'));

    // Terug.
    set('2026-10-13', bank, '', 50, 8);          // lichter: herstel 1
    set('2026-10-13', squat, '', 85, 5);         // toch vooruit
    set('2026-10-14', curl, '', 12, 10);         // pas na de blessure begonnen
    set('2026-10-14', lat, 'r', 8, 12);          // rechts lichter
    set('2026-10-14', lat, 'l', 10, 13);         // links vooruit
    set('2026-10-15', bank, '', 50, 8);          // gelijk: herstel 2
    set('2026-10-16', curl, '', 10, 10);         // lichter, maar geen herstel
    set('2026-10-17', bank, '', 55, 8);          // vooruit: herstel 3, telt
    set('2026-10-20', bank, '', 52.5, 8);        // vierde sessie: weer gewoon
    ['2026-10-13', '2026-10-15', '2026-10-17', '2026-10-20', '2026-10-22', '2026-10-24']
      .forEach((d) => set(d, roei, '', 35, 10));
    st.writeNow();
    window.__ids = { bank, squat, curl, roei, lat };
  });

  const regel = (datum, naam, zijde) => page.evaluate((a) => {
    const r = GD.lifts.dagResultaat(a[0]).regels.filter((x) => x.naam === a[1] && x.zijde.key === (a[2] || ''))[0];
    return r ? { status: r.status, echt: r.detail ? r.detail.status : null, sessie: r.herstel ? r.herstel.sessie : 0 } : null;
  }, [datum, naam, zijde]);
  const dag = (datum) => page.evaluate((d) => {
    const r = GD.lifts.dagResultaat(d);
    const item = GD.score.scoreDay(d, false).items.filter((i) => i.key === 'overload')[0];
    return { waarde: r.waarde, vergeleken: r.vergeleken, vooruit: r.vooruit, herstel: r.herstel,
      terug: r.terug, telt: item.included, reden: item.reason };
  }, datum);

  console.log('\nDe eerste drie sessies na je blessure');
  {
    let r = await regel('2026-10-13', 'Bankdrukken');
    check('lichter dan vóór de blessure heet herstel, geen terug', r.status === 'herstel' && r.echt === 'terug' && r.sessie === 1, r);
    r = await regel('2026-10-15', 'Bankdrukken');
    check('gelijk in de tweede sessie: ook herstel', r.status === 'herstel' && r.echt === 'gelijk' && r.sessie === 2, r);
    r = await regel('2026-10-17', 'Bankdrukken');
    check('vooruit in de derde sessie telt gewoon', r.status === 'vooruit' && r.sessie === 3, r);
    r = await regel('2026-10-20', 'Bankdrukken');
    check('de vierde sessie oordeelt weer zoals altijd', r.status === 'terug' && r.sessie === 0, r);
    r = await regel('2026-10-13', 'Squat');
    check('wie na een blessure vooruitgaat, krijgt dat gewoon', r.status === 'vooruit' && r.sessie === 1, r);
  }

  console.log('\nHet dagdoel');
  {
    let r = await dag('2026-10-13');
    // Bankdrukken en Roeien zijn herstel, Squat ging vooruit.
    check('herstel telt niet mee, vooruit wel: 1 van de 1 is Ja', r.waarde === 'ja' && r.vergeleken === 1 && r.herstel === 2, r);
    r = await dag('2026-10-15');
    check('alleen herstel: het doel valt weg, met "herstel" als reden',
      r.waarde === 'herstel' && r.telt === false && r.reden === 'herstel', r);
    r = await dag('2026-10-20');
    // Bankdrukken terug, Roeien gelijk: 0,4 van 2, afgezet tegen 0,8.
    check('daarna telt terug weer gewoon mee', r.waarde === 'deels' && r.vergeleken === 2 && r.terug === 1 && r.herstel === 0, r);
  }

  console.log('\nAlleen voor oefeningen van vóór de blessure');
  {
    const r = await regel('2026-10-16', 'Curl');
    check('pas na de blessure begonnen: lichter is gewoon terug', r.status === 'terug' && r.sessie === 0, r);
  }

  console.log('\nPer arm');
  {
    const re = await regel('2026-10-14', 'Lateral raise', 'r');
    const li = await regel('2026-10-14', 'Lateral raise', 'l');
    check('rechts lichter: herstel', re.status === 'herstel', re);
    check('links vooruit: telt', li.status === 'vooruit', li);
    const r = await dag('2026-10-14');
    check('de curl van die dag is een startpunt en telt ook niet mee',
      r.vergeleken === 1 && r.vooruit === 1 && r.herstel === 1 && r.waarde === 'ja', r);
  }

  console.log('\nPlateau');
  {
    const p = (datum) => page.evaluate((d) => {
      const x = GD.lifts.plateau(window.__ids.roei, '', d);
      return { sessies: x.sessies, niveau: x.niveau, van: x.reeks.length ? x.reeks[0].datum : null };
    }, datum);
    let r = await p('2026-10-05');
    check('vóór de blessure: vier sessies stil', r.sessies === 4 && r.niveau === 'let-op', r);
    r = await p('2026-10-08');
    check('geblesseerd: die melding laat de app los', r.niveau === 'geen', r);
    const lijst = await page.evaluate(() => GD.lifts.plateaus('2026-10-08').length);
    check('en hij staat ook niet in de weekafsluiting', lijst === 0, lijst);
    r = await p('2026-10-17');
    check('drie herstelsessies op hetzelfde gewicht zijn geen plateau', r.sessies === 0, r);
    r = await p('2026-10-24');
    check('daarna begint de telling', r.sessies === 3 && r.niveau === 'let-op' && r.van === '2026-10-20', r);
  }

  console.log('\nHet volgt je blessuredagen');
  {
    await page.evaluate(() => GD.date.range('2026-10-06', '2026-10-10').forEach((d) => GD.store.setField(d, 'gesport', 'rustdag')));
    let r = await regel('2026-10-13', 'Bankdrukken');
    check('maak je er rustdagen van, dan is lichter weer terug', r.status === 'terug', r);
    await page.evaluate(() => GD.date.range('2026-10-06', '2026-10-10').forEach((d) => GD.store.setField(d, 'gesport', 'blessure')));
    r = await regel('2026-10-13', 'Bankdrukken');
    check('en terug naar blessure maakt het weer herstel', r.status === 'herstel', r);

    // Een nieuwe blessure begint de telling opnieuw.
    await page.evaluate(() => {
      const L = GD.lifts, id = window.__ids.bank;
      GD.store.setField('2026-10-21', 'gesport', 'blessure');
      L.setVeld('2026-10-23', id, '', 'kg', 45); L.setVeld('2026-10-23', id, '', 'reps', 8);
      GD.store.setField('2026-10-23', 'gesport', 'ja');
    });
    r = await regel('2026-10-23', 'Bankdrukken');
    check('na een tweede blessure is het weer sessie 1', r.status === 'herstel' && r.sessie === 1, r);
  }

  console.log('\nOp het scherm');
  {
    await page.evaluate(() => { GD.store.writeNow(); });
    await page.reload();
    await page.evaluate(() => { GD.ui.anchor = '2026-10-13'; });
    await page.click('.tab[data-view="dag"]');
    const lifts = await page.textContent('.lifts');
    check('een chip "herstel" bij de oefening', /herstel/.test(lifts));
    check('met welke sessie het is', /Sessie 1 van 3 na je blessure/.test(lifts), lifts);
    check('het dagdoel noemt de herstelsessie', /1 van de 1 vooruit · 2 herstel/.test(await page.textContent('main')));

    await page.evaluate(() => { GD.ui.anchor = '2026-10-15'; });
    await page.click('.tab[data-view="dag"]');
    const tekst = await page.textContent('main');
    check('alleen herstel: het doel legt uit waarom het niet meetelt', /Je eerste sessies na je blessure/.test(tekst));
    check('de kaart Oefeningen zegt herstel', /herstel/.test(await page.textContent('.card-head:has(h2:text("Oefeningen"))')));
    const breed = await page.evaluate(() => document.documentElement.scrollWidth);
    check('past op een telefoon', breed <= 393, breed);
  }

  check('geen fouten', !fouten.length, fouten);
  await ctx.close();
  await browser.close();
  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
