/* Ronde 1: niets meer kwijt kunnen raken. Elke check is een eis; de audit
   liet zien dat de oude code hem niet haalt. Supabase is nagebootst. */
const T = require('./lib');
const fs = require('fs');

const BASIS = T.PAGINA;
const BACKUP = T.prive('backup-24.json');
/* Wat er in die back-up staat, zodat de controles niet vastzitten aan één
   bepaalde versie ervan (en je getallen niet in deze openbare code staan). */
const IN_BACKUP = BACKUP ? (() => {
  const b = JSON.parse(BACKUP);
  const e = Object.values(b.entries);
  return {
    dagen: e.length,
    sets: e.reduce((n, d) => n + Object.keys(d.oefeningen || {}).length, 0),
    doel: b.settings.calorieDoel,
    oefeningen: b.settings.oefeningen.length
  };
})() : null;
let ok = 0, fout = 0;
function check(naam, waar, extra) {
  if (waar) { ok++; console.log('  ok   ' + naam); }
  else { fout++; console.log('  FOUT ' + naam + (extra !== undefined ? '  → ' + JSON.stringify(extra) : '')); }
}

function nepSupabase() {
  const db = { dagen: {}, instellingen: null, vertraging: 0, fouten: 0 };
  async function handler(route) {
    const req = route.request();
    const pad = new URL(req.url()).pathname;
    const json = (status, body) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body) });
    if (pad.startsWith('/auth/v1/')) {
      return json(200, { access_token: 't2', refresh_token: 'r2', expires_in: 3600, user: { id: 'u1', email: 'test@voorbeeld.nl' } });
    }
    if (pad === '/rest/v1/dagen') {
      if (req.method() === 'GET') return json(200, Object.values(db.dagen));
      if (db.vertraging) await new Promise((r) => setTimeout(r, db.vertraging));
      const rijen = JSON.parse(req.postData());
      const datums = rijen.map((r) => r.datum);
      if (new Set(datums).size !== datums.length) {
        db.fouten++;
        return json(500, { code: '21000', message: 'ON CONFLICT DO UPDATE command cannot affect row a second time' });
      }
      rijen.forEach((r) => { db.dagen[r.datum] = r; });
      return route.fulfill({ status: 201, body: '' });
    }
    if (pad === '/rest/v1/instellingen') {
      if (req.method() === 'GET') return json(200, db.instellingen ? [db.instellingen] : []);
      db.instellingen = JSON.parse(req.postData())[0];
      return route.fulfill({ status: 201, body: '' });
    }
    if (pad === '/rest/v1/voeding') return json(200, []);
    return json(404, { message: 'onbekend' });
  }
  return { db, handler };
}

async function context(browser, nep) {
  const ctx = await browser.newContext({ viewport: { width: 393, height: 900 } });
  if (nep) {
    await ctx.addInitScript(() => {
      if (!localStorage.getItem('goaldash.sync')) {
        localStorage.setItem('goaldash.sync', JSON.stringify({
          url: 'https://mock.supabase.co', anonKey: 'k',
          session: { access_token: 't', refresh_token: 'r', user_id: 'u1', email: 'test@voorbeeld.nl', verloopt: Date.now() + 864e5 }
        }));
      }
    });
    await ctx.route('https://mock.supabase.co/**', nep.handler);
  }
  return ctx;
}

async function open(ctx, antwoord) {
  const page = await ctx.newPage();
  page.fouten = [];
  page.dialogen = [];
  page.on('pageerror', (e) => page.fouten.push(e.message));
  page.on('dialog', (d) => { page.dialogen.push(d.message()); d.type() === 'prompt' ? d.accept(page.antwoord || '') : d.accept(); });
  page.antwoord = antwoord;
  await page.goto(BASIS);
  return page;
}

async function sync(page) {
  await page.waitForFunction(() => !GD.sync.status().bezig);
  return page.evaluate(() => GD.sync.syncNow().then((r) => r, (e) => ({ fout: e.message })));
}

/* Terugzetten gaat via de knop; die wacht op sync en kopie, dus even pollen. */
async function zetTerug(page, tekst) {
  const pad = require('path').join(require('os').tmpdir(), 'goaldash-terug.json');
  fs.writeFileSync(pad, tekst);
  await page.click('[data-view="instellingen"]');
  await page.setInputFiles('#file-json', pad);
  await page.waitForFunction(() => /teruggezet|geen back-up|mislukt/.test(document.getElementById('toast').textContent), null, { timeout: 15000 });
  return page.textContent('#toast');
}

async function main() {
  const browser = await T.lanceer();

  console.log('\n2 · Twee tabbladen');
  {
    const ctx = await context(browser);
    const A = await open(ctx);
    const B = await open(ctx);
    const d = await B.evaluate(() => { GD.store.setField(GD.date.today(), 'gewicht', 74.5); GD.store.writeNow(); return GD.date.today(); });
    await A.waitForTimeout(200);
    check('tabblad A ziet het gewicht uit B zonder herladen', await A.evaluate((d) => (GD.store.entry(d) || {}).gewicht === 74.5, d));
    await B.close({ runBeforeUnload: true });
    await A.evaluate(() => {
      Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true });
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const C = await open(ctx);
    check('na weggaan uit het oude tabblad staat het gewicht er nog', await C.evaluate((d) => (GD.store.entry(d) || {}).gewicht === 74.5, d));
    // Beide tabbladen vullen iets anders in op dezelfde dag, verschillende dagen
    const D1 = await open(ctx), D2 = await open(ctx);
    await D1.evaluate(() => GD.store.setField('2026-09-01', 'gewicht', 71.1));
    await D2.evaluate(() => GD.store.setField('2026-09-02', 'gewicht', 72.2));
    await D1.evaluate(() => GD.store.writeNow()); await D2.evaluate(() => GD.store.writeNow());
    await D1.evaluate(() => GD.store.setField('2026-09-03', 'gewicht', 73.3));
    await D1.evaluate(() => GD.store.writeNow());
    const opgeslagen = await C.evaluate(() => JSON.parse(localStorage.getItem('goaldash.v1')).entries);
    check('drie dagen uit twee tabbladen staan er allemaal', ['2026-09-01', '2026-09-02', '2026-09-03'].every((x) => opgeslagen[x]),
      Object.keys(opgeslagen));
    await ctx.close();
  }

  console.log('\n1 · Terugzetten blijft staan');
  {
    const nep = nepSupabase();
    const ctx = await context(browser, nep);
    const page = await open(ctx);
    await sync(page);
    await page.evaluate(() => {
      GD.store.setField('2026-09-10', 'gewicht', 73.9);
      GD.store.setField('2026-09-11', 'gewicht', 73.0);
      GD.store.setSetting('calorieDoel', 2600);
    });
    await sync(page);
    const backup = await page.evaluate(() => GD.store.exportJSON());
    await page.evaluate(() => {
      GD.store.deleteEntry('2026-09-10');                 // per ongeluk gewist
      GD.store.setField('2026-09-11', 'gewicht', 73.4);   // na de back-up bijgewerkt
      GD.store.setSetting('calorieDoel', 2400);
    });
    await sync(page);
    const toast = await zetTerug(page, backup);
    check('melding zegt wat er gebeurde', /1 dag teruggezet, 1 stond hier al in een nieuwere versie/.test(toast), toast);
    await sync(page);
    const na = await page.evaluate(() => ({
      gewist: (GD.store.entry('2026-09-10') || {}).gewicht,
      nieuwer: (GD.store.entry('2026-09-11') || {}).gewicht,
      doel: GD.store.settings().calorieDoel
    }));
    check('gewiste dag is na de volgende sync nog terug', na.gewist === 73.9, na);
    check('dag die hier nieuwer was is niet overschreven', na.nieuwer === 73.4, na);
    check('gewiste dag staat ook in de cloud weer als dag', nep.db.dagen['2026-09-10'] && !nep.db.dagen['2026-09-10'].verwijderd);
    check('instellingen hier en in de cloud zijn gelijk', nep.db.instellingen.data.calorieDoel === na.doel, { hier: na.doel, cloud: nep.db.instellingen.data.calorieDoel });
    check('geen "Annuleren = vervangen" meer', !page.dialogen.some((m) => /Annuleren/.test(m)), page.dialogen);
    check('de vraag zegt dat er niets overschreven wordt', page.dialogen.some((m) => /niets overschreven/.test(m)));
    const kopie = await page.evaluate(() => GD.vangnet && GD.vangnet.lijst().then((l) => l.some((k) => k.soort === 'voor-terugzetten')));
    check('vóór terugzetten is een kopie gemaakt', kopie === true);
    await ctx.close();
  }

  console.log('\n1 · Terugzetten op een leeg apparaat, met je echte back-up');
  if (!BACKUP) T.overslaan('1 · Terugzetten op een leeg apparaat, met je echte back-up'); else {
    const ctx = await context(browser);
    const page = await open(ctx);
    await zetTerug(page, BACKUP);
    const r = await page.evaluate(() => ({
      dagen: GD.store.allDates().length,
      sets: Object.values(GD.store.raw().entries).reduce((n, e) => n + Object.keys(e.oefeningen || {}).length, 0),
      doel: GD.store.settings().calorieDoel,
      oefeningen: GD.store.settings().oefeningen.length
    }));
    check('alle dagen terug', r.dagen === IN_BACKUP.dagen, r);
    check('alle sets terug', r.sets === IN_BACKUP.sets, r);
    check('instellingen uit de back-up (leeg apparaat)', r.doel === IN_BACKUP.doel && r.oefeningen === IN_BACKUP.oefeningen, r);
    await ctx.close();
  }

  console.log('\n1 · Oefeningen die ontbreken komen erbij');
  if (!BACKUP) T.overslaan('1 · Oefeningen die ontbreken komen erbij'); else {
    const ctx = await context(browser);
    const page = await open(ctx);
    await page.evaluate(() => { GD.store.setField('2026-09-01', 'gewicht', 71); GD.lifts.addOefening('Deadlift'); });
    const r = await page.evaluate((b) => {
      GD.store.importJSON(b);
      const namen = GD.store.settings().oefeningen.map((o) => o.naam);
      return { deadlift: namen.indexOf('Deadlift') >= 0, incline: namen.indexOf('Incline bench press') >= 0, aantal: namen.length };
    }, BACKUP);
    check('eigen oefening blijft, die uit de back-up komen erbij', r.deadlift && r.incline && r.aantal === IN_BACKUP.oefeningen + 1, r);
    await ctx.close();
  }

  console.log('\n5 · Synchroniseren loopt niet vast');
  {
    const nep = nepSupabase();
    const ctx = await context(browser, nep);
    const page = await open(ctx);
    await sync(page);
    await page.evaluate(() => GD.store.setField('2026-09-14', 'gewicht', 73.0));
    await sync(page);
    // Dag én wismarkering tegelijk, zoals de oude code na terugzetten achterliet
    await page.evaluate(() => {
      GD.store.setField('2026-09-14', 'gewicht', 73.1);
      const raw = GD.store.raw();
      raw.tombstones['2026-09-14'] = Date.now() - 5;
    });
    const s1 = await sync(page);
    check('sync lukt met dag en wismarkering op dezelfde datum', s1 && !s1.fout, s1);
    check('Supabase kreeg geen dubbele rij', nep.db.fouten === 0);
    check('de nieuwste van de twee ging mee (de dag)', nep.db.dagen['2026-09-14'] && nep.db.dagen['2026-09-14'].data && nep.db.dagen['2026-09-14'].data.gewicht === 73.1);
    await ctx.close();
  }

  console.log('\n10 · Wijziging tijdens een trage sync');
  {
    const nep = nepSupabase();
    const ctx = await context(browser, nep);
    const page = await open(ctx);
    await sync(page);
    nep.db.vertraging = 6000;
    await page.evaluate(() => { GD.store.setField('2026-09-12', 'gewicht', 73.3); GD.sync.syncNow().catch(() => {}); });
    await page.waitForTimeout(500);
    await page.evaluate(() => GD.store.setField('2026-09-13', 'gewicht', 73.5));
    nep.db.vertraging = 0;
    await page.waitForTimeout(12000);
    check('de tweede wijziging staat binnen 12 s in de cloud', !!nep.db.dagen['2026-09-13']);
    await ctx.close();
  }

  console.log('\n11 · Typen tijdens een sync');
  {
    const nep = nepSupabase();
    const ctx = await context(browser, nep);
    const page = await open(ctx);
    await sync(page);
    nep.db.dagen['2026-09-01'] = { datum: '2026-09-01', data: { gewicht: 72.4 }, verwijderd: false, bijgewerkt: new Date(Date.now() + 1000).toISOString() };
    await page.click('input[data-field="gewicht"]');
    await page.keyboard.type('74.6');
    await sync(page);
    check('wat je typte staat nog in het veld', (await page.inputValue('input[data-field="gewicht"]')) === '74.6');
    check('de sync zelf kwam wel binnen', await page.evaluate(() => (GD.store.entry('2026-09-01') || {}).gewicht === 72.4));
    await page.click('h1');                               // veld verlaten
    await page.waitForTimeout(100);
    check('na het verlaten van het veld is alles bijgewerkt en opgeslagen',
      await page.evaluate(() => (GD.store.entry(GD.date.today()) || {}).gewicht === 74.6) &&
      (await page.inputValue('input[data-field="gewicht"]')) === '74.6');
    await ctx.close();
  }

  console.log('\n7 · Een halve dag telt niet mee in Verbruik');
  if (!BACKUP) T.overslaan('7 · Een halve dag telt niet mee in Verbruik'); else {
    const ctx = await context(browser);
    const page = await ctx.newPage();
    await page.clock.install({ time: new Date('2026-09-24T11:00:00') });
    await page.goto(BASIS);
    const r = await page.evaluate((b) => {
      GD.store.importJSON(b);
      const t = GD.date.today(), S = GD.score, s = GD.store.settings();
      const met = S.verbruik(t, s);
      GD.store.setField(t, 'kcal', 2900);
      const vol = S.verbruik(t, s);
      const gm = S.gewichtMelding(t);
      return { dagen: met.kcalDagen, klaar: met.klaar, dagenMetVol: vol.kcalDagen, voorstel: gm.advies && gm.advies.nieuwDoel };
    }, BACKUP);
    check('vandaag (een halve dag, om 11:00) telt niet mee', r.dagen === 13 && r.klaar === false, r);
    check('ook een volle dag telt pas morgen', r.dagenMetVol === 13, r);
    check('dus nog geen voorstel voor een nieuw doel', r.voorstel === null, r);
    await page.clock.setFixedTime(new Date('2026-09-25T09:00:00'));
    const morgen = await page.evaluate(() => GD.score.verbruik(GD.date.today(), GD.store.settings()).kcalDagen);
    check('de dag erna telt 24 september wel mee', morgen === 14, morgen);
    await ctx.close();
  }

  console.log('\n9 · Alles wissen');
  {
    const nep = nepSupabase();
    const ctx = await context(browser, nep);
    const page = await open(ctx, 'iets anders');
    await sync(page);
    await page.evaluate(() => GD.store.setField('2026-09-11', 'gewicht', 73.4));
    await sync(page);
    await page.click('[data-view="instellingen"]');
    await page.click('[data-action="wipe"]');
    await page.waitForTimeout(300);
    check('verkeerd woord getypt: niets gewist', await page.evaluate(() => GD.store.allDates().length === 1));
    page.antwoord = 'wissen';
    await page.click('[data-action="wipe"]');
    await page.waitForFunction(() => GD.store.allDates().length === 0, null, { timeout: 5000 }).catch(() => {});
    const r = await page.evaluate(() => ({
      dagen: GD.store.allDates().length, ingelogd: GD.sync.signedIn()
    }));
    check('met "wissen" is dit apparaat leeg', r.dagen === 0, r);
    check('en ben je uitgelogd, zodat het niet meteen terugkomt', r.ingelogd === false, r);
    check('de cloud is niet aangeraakt', nep.db.dagen['2026-09-11'] && !nep.db.dagen['2026-09-11'].verwijderd);
    check('de vraag zegt eerlijk dat het in Supabase blijft staan', page.dialogen.some((m) => /Supabase-project blijft alles staan/.test(m)));
    const kopie = await page.evaluate(() => GD.vangnet.lijst().then((l) => l.filter((k) => k.soort === 'voor-wissen').map((k) => k.dagen)));
    check('er is vlak voor het wissen een kopie gemaakt, met die dag erin', kopie.length === 1 && kopie[0] === 1, kopie);
    // Terughalen uit die kopie
    await page.evaluate(() => { GD.ui.kopieen = null; });
    await page.click('[data-view="dag"]'); await page.click('[data-view="instellingen"]');
    await page.waitForSelector('[data-action="kopie-terug"]');
    await page.click('[data-action="kopie-terug"]');
    await page.waitForFunction(() => /teruggezet/.test(document.getElementById('toast').textContent));
    check('de kopie terugzetten brengt de dag terug', await page.evaluate(() => (GD.store.entry('2026-09-11') || {}).gewicht === 73.4));
    const tekst = await page.textContent('#view');
    check('onder Je data staat niet meer "er gaat niets naar een server"', !/niets naar een server/.test(tekst));
    await ctx.close();
  }

  console.log('\nVangnet · dagelijkse kopie');
  if (!BACKUP) T.overslaan('Vangnet · dagelijkse kopie'); else {
    const ctx = await context(browser);
    const page = await open(ctx);
    await page.evaluate((b) => GD.store.importJSON(b), BACKUP);
    await page.evaluate(() => GD.store.writeNow());
    await page.reload();
    await page.waitForTimeout(300);
    await page.reload();
    await page.waitForTimeout(300);
    const l = await page.evaluate(() => GD.vangnet.lijst());
    const dag = l.filter((k) => k.soort === 'dag');
    check('één dagelijkse kopie, ook na twee keer openen', dag.length === 1, l);
    check('met al je dagen', dag[0] && dag[0].dagen === IN_BACKUP.dagen, dag[0]);
    const inhoud = await page.evaluate((id) => GD.vangnet.haal(id).then((k) => JSON.parse(k.gegevens).entries['2026-09-21'].oefeningen), dag[0].id);
    check('en met je trainingen erin', inhoud && Object.keys(inhoud).length === 5);
    const bewaard = await page.evaluate(async () => {
      for (let i = 0; i < 18; i++) await GD.vangnet.maak('dag');
      for (let i = 0; i < 8; i++) await GD.vangnet.maak('voor-wissen');
      const l = await GD.vangnet.lijst();
      return { dag: l.filter((k) => k.soort === 'dag').length, overig: l.filter((k) => k.soort !== 'dag').length };
    });
    check('hooguit 14 dagelijkse en 5 andere kopieën', bewaard.dag === 14 && bewaard.overig === 5, bewaard);
    const opslag = await page.evaluate(() => localStorage.getItem('goaldash.v1').length < 60000);
    check('de kopieën staan niet in de gewone opslag', opslag);
    await ctx.close();
  }

  console.log('\nVangnet · herinnering aan een back-up');
  if (!BACKUP) T.overslaan('Vangnet · herinnering aan een back-up'); else {
    const ctx = await context(browser);
    const page = await open(ctx);
    await page.evaluate((b) => GD.store.importJSON(b), BACKUP);
    await page.click('[data-view="dag"]');
    check('zonder back-up staat er een herinnering onder vandaag', /nog geen back-up gedownload/.test(await page.textContent('#view')));
    const [download] = await Promise.all([page.waitForEvent('download'), page.click('#view [data-action="export"]')]);
    const pad = await download.path();
    const terug = JSON.parse(fs.readFileSync(pad, 'utf8'));
    check('de gedownloade back-up bevat al je dagen', Object.keys(terug.entries).length === IN_BACKUP.dagen);
    check('daarna is de herinnering weg', !/nog geen back-up gedownload/.test(await page.textContent('#view')));
    await page.click('[data-view="instellingen"]');
    check('en staat bij Je data "vandaag"', /Laatste back-up op dit apparaat: vandaag/.test(await page.textContent('#view')));
    await ctx.close();
  }

  await browser.close();
  console.log('\n' + ok + ' ok, ' + fout + ' fout');
  process.exit(fout ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(2); });
