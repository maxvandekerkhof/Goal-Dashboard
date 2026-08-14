/* Goal Dashboard — dagcheck: mailt je als er van gisteren nog iets openstaat.
 *
 * De app draait alleen in je browser, en die staat 's ochtends dicht. Het
 * kijken en het mailen gebeurt daarom hier, in je eigen Supabase-project.
 * pg_cron wekt deze functie elk uur; per gebruiker kijken we of het bij hem
 * het gekozen uur is en of er in de dag ervoor nog velden leeg zijn. Is alles
 * ingevuld, dan gaat er niets uit — anders went je aan mail die je negeert.
 *
 * De sleutels staan als secret in de functie (Edge Functions → Secrets) en
 * nooit in de repo: de service-role sleutel omzeilt alle beveiliging en hoort
 * alleen op een server te staan.
 */

/** Je dagen lopen op Nederlandse tijd, ook als de server in UTC draait. */
const ZONE = 'Europe/Amsterdam';

/**
 * Spiegelt de doelen uit js/config.js. Voeg je daar een doel toe, zet het dan
 * ook hier neer — de functie kan de code van de app niet inlezen.
 */
export const DOELEN = [
  { key: 'creatine', label: 'Creatine' },
  { key: 'ontbijt', label: 'Ontbijt' },
  { key: 'lunch', label: 'Lunch' },
  { key: 'avondeten', label: 'Avondeten' },
  { key: 'gesport', label: 'Gesport' },
  { key: 'postworkout', label: 'Post-workout maaltijd' },
  { key: 'overload', label: 'Progressive overload' },
  { key: 'water', label: 'Water' },
  { key: 'eiwit', label: 'Eiwitdoel' },
  { key: 'calorieen', label: 'Caloriedoel' }
];

/* ------------------------------- datums -------------------------------- */

/** "YYYY-MM-DD" in de opgegeven tijdzone (en-CA geeft precies die volgorde). */
export function lokaleDatum(nu: Date, zone: string = ZONE): string {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: zone, year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(nu);
}

/** Het uur van de klok daar, 0 t/m 23. */
export function lokaalUur(nu: Date, zone: string = ZONE): number {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: zone, hour: '2-digit', hourCycle: 'h23'
  }).format(nu));
}

export function dagErvoor(datum: string): string {
  const d = new Date(datum + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

/** "woensdag 13 augustus" */
export function datumInWoorden(datum: string): string {
  return new Intl.DateTimeFormat('nl-NL', {
    timeZone: 'UTC', weekday: 'long', day: 'numeric', month: 'long'
  }).format(new Date(datum + 'T00:00:00Z'));
}

/* ------------------------------ wat is leeg ----------------------------- */

function leeg(v: unknown): boolean {
  return v === null || v === undefined || v === '';
}

/**
 * Welke doelen staan er voor deze dag nog open?
 *
 * Volgt dezelfde regels als de app: een doel op gewicht 0 telt niet mee, de
 * post-workout maaltijd en progressive overload alleen op een dag waarop je
 * echt getraind hebt, en eiwit en calorieën zijn ingevuld zodra de grammen of
 * de kilocalorieën er staan (dan leidt de app het antwoord zelf af).
 */
export function openstaand(dag: Record<string, unknown> | null, instellingen: Record<string, unknown> | null): string[] {
  const e = (dag || {}) as Record<string, unknown>;
  const s = (instellingen || {}) as Record<string, unknown>;
  const gewichten = (s.weights || {}) as Record<string, number>;
  const autoMacro = s.autoMacro !== false;
  const getraind = e.gesport === 'ja';
  const oefeningenIngevuld = !!(e.oefeningen && typeof e.oefeningen === 'object' &&
    Object.keys(e.oefeningen as object).length);

  const open: string[] = [];
  for (const doel of DOELEN) {
    if (gewichten[doel.key] === 0) continue;

    if (doel.key === 'water') {
      if (leeg(e.waterMl)) open.push(doel.label);
      continue;
    }
    if (doel.key === 'eiwit') {
      if (leeg(e.eiwit) && !(autoMacro && !leeg(e.eiwitGram))) open.push(doel.label);
      continue;
    }
    if (doel.key === 'calorieen') {
      if (leeg(e.calorieen) && !(autoMacro && !leeg(e.kcal))) open.push(doel.label);
      continue;
    }
    // Zonder training vervallen deze twee, net als in de dagscore.
    if ((doel.key === 'postworkout' || doel.key === 'overload') && !getraind) continue;
    // Heb je je oefeningen ingevuld, dan rekent de app de overload zelf uit.
    if (doel.key === 'overload' && oefeningenIngevuld) continue;

    if (leeg(e[doel.key])) open.push(doel.label);
  }
  return open;
}

/* -------------------------------- de mail ------------------------------- */

function escHtml(s: string): string {
  return s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

export function mailTekst(open: string[], datum: string, appUrl: string) {
  const dag = datumInWoorden(datum);
  const onderwerp = open.length
    ? (open.length === 1
      ? 'Nog één ding open van ' + dag
      : 'Nog ' + open.length + ' dingen open van ' + dag)
    : 'Alles ingevuld voor ' + dag;

  const kop = open.length
    ? 'Van ' + dag + ' staat dit nog leeg:'
    : 'Van ' + dag + ' is alles ingevuld. Deze mail is een test, dus die komt toch even langs.';

  const tekst = kop +
    (open.length ? '\n\n' + open.map((o) => '- ' + o).join('\n') : '') +
    '\n\nInvullen kan hier: ' + appUrl + '\n';

  const html = '<div style="font-family:system-ui,-apple-system,Segoe UI,sans-serif;font-size:15px;line-height:1.5;color:#14181f">' +
    '<p>' + escHtml(kop) + '</p>' +
    (open.length
      ? '<ul>' + open.map((o) => '<li>' + escHtml(o) + '</li>').join('') + '</ul>'
      : '') +
    '<p><a href="' + escHtml(appUrl) + '">Openen in Goal Dashboard</a></p>' +
    '</div>';

  return { onderwerp, tekst, html };
}

/* ------------------------------- omgeving ------------------------------- */

type Omgeving = {
  url: string;
  sleutel: string;
  mailSleutel: string;
  mailVan: string;
  cron: string;
  appUrl: string;
};

function env(naam: string): string {
  // deno-lint-ignore no-explicit-any
  const d = (globalThis as any).Deno;
  return (d && d.env && d.env.get(naam)) || '';
}

function leesOmgeving(): { omgeving?: Omgeving; fout?: string } {
  const url = env('SUPABASE_URL') || env('PROJECT_URL');
  const sleutel = env('SUPABASE_SERVICE_ROLE_KEY') || env('SERVICE_ROLE_KEY');
  const mailSleutel = env('RESEND_SLEUTEL');
  if (!url || !sleutel) return { fout: 'SUPABASE_URL of SUPABASE_SERVICE_ROLE_KEY ontbreekt.' };
  if (!mailSleutel) return { fout: 'RESEND_SLEUTEL ontbreekt in de secrets van deze functie.' };
  return {
    omgeving: {
      url: url.replace(/\/+$/, ''),
      sleutel,
      mailSleutel,
      mailVan: env('MAIL_VAN') || 'Goal Dashboard <onboarding@resend.dev>',
      cron: env('CRON_SLEUTEL'),
      appUrl: env('APP_URL') || 'https://maxvandekerkhof.github.io/Goal-Dashboard/'
    }
  };
}

/** Vergelijkt zonder op het eerste verschil te stoppen. */
function veiligGelijk(a: string, b: string): boolean {
  if (!a || !b || a.length !== b.length) return false;
  let verschil = 0;
  for (let i = 0; i < a.length; i++) verschil |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return verschil === 0;
}

/* ------------------------------- opvragen ------------------------------- */

async function db(o: Omgeving, pad: string, opties: RequestInit = {}): Promise<unknown> {
  const res = await fetch(o.url + '/rest/v1/' + pad, {
    method: opties.method || 'GET',
    headers: Object.assign({
      apikey: o.sleutel,
      Authorization: 'Bearer ' + o.sleutel,
      'Content-Type': 'application/json'
    }, opties.headers || {}),
    body: opties.body
  });
  if (!res.ok) throw new Error('Database gaf ' + res.status + ': ' + (await res.text()));
  const tekst = await res.text();
  return tekst ? JSON.parse(tekst) : null;
}

/** Het adres waarmee je in de app inlogt, als je geen ander adres opgaf. */
async function accountAdres(o: Omgeving, userId: string): Promise<string> {
  const res = await fetch(o.url + '/auth/v1/admin/users/' + encodeURIComponent(userId), {
    headers: { apikey: o.sleutel, Authorization: 'Bearer ' + o.sleutel }
  });
  if (!res.ok) return '';
  const body = await res.json();
  return body && body.email ? String(body.email) : '';
}

async function gebruikerVanToken(o: Omgeving, token: string): Promise<{ id: string; email: string } | null> {
  const res = await fetch(o.url + '/auth/v1/user', {
    headers: { apikey: o.sleutel, Authorization: 'Bearer ' + token }
  });
  if (!res.ok) return null;
  const body = await res.json();
  if (!body || !body.id) return null;
  return { id: String(body.id), email: body.email ? String(body.email) : '' };
}

async function verstuurMail(o: Omgeving, naar: string, onderwerp: string, tekst: string, html: string) {
  const res = await fetch('https://api.resend.com/emails', {
    method: 'POST',
    headers: {
      Authorization: 'Bearer ' + o.mailSleutel,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({ from: o.mailVan, to: [naar], subject: onderwerp, text: tekst, html })
  });
  if (!res.ok) throw new Error('Mailen mislukt (' + res.status + '): ' + (await res.text()));
}

/* ------------------------------- het werk ------------------------------- */

type Rij = { user_id: string; uur: number; naar: string | null; laatst_verstuurd: string | null };

async function verwerk(o: Omgeving, rij: Rij, test: boolean, nu: Date) {
  const vandaag = lokaleDatum(nu);
  const gisteren = dagErvoor(vandaag);

  const dagen = await db(o, 'dagen?select=data,verwijderd&user_id=eq.' +
    encodeURIComponent(rij.user_id) + '&datum=eq.' + gisteren) as Array<Record<string, unknown>>;
  const rijDag = dagen && dagen[0];
  const dag = rijDag && !rijDag.verwijderd ? (rijDag.data as Record<string, unknown>) : null;

  const inst = await db(o, 'instellingen?select=data&user_id=eq.' +
    encodeURIComponent(rij.user_id)) as Array<Record<string, unknown>>;
  const instellingen = inst && inst[0] ? (inst[0].data as Record<string, unknown>) : null;

  const open = openstaand(dag, instellingen);
  if (!open.length && !test) return { user_id: rij.user_id, verstuurd: false, reden: 'alles ingevuld' };

  const naar = (rij.naar && rij.naar.trim()) || await accountAdres(o, rij.user_id);
  if (!naar) return { user_id: rij.user_id, verstuurd: false, reden: 'geen adres' };

  const mail = mailTekst(open, gisteren, o.appUrl);
  await verstuurMail(o, naar, mail.onderwerp, mail.tekst, mail.html);

  // Bij een test laten we de datum staan, anders blijft de echte mail van
  // vandaag achterwege omdat we hem "al verstuurd" hebben.
  if (!test) {
    await db(o, 'herinneringen?user_id=eq.' + encodeURIComponent(rij.user_id), {
      method: 'PATCH',
      headers: { Prefer: 'return=minimal' },
      body: JSON.stringify({ laatst_verstuurd: vandaag })
    });
  }

  return { user_id: rij.user_id, verstuurd: true, naar, datum: gisteren, open };
}

async function sweep(o: Omgeving, nu: Date) {
  const uur = lokaalUur(nu);
  const vandaag = lokaleDatum(nu);
  const rijen = await db(o,
    'herinneringen?select=user_id,uur,naar,laatst_verstuurd&aan=is.true&uur=eq.' + uur) as Rij[];

  const uitkomsten = [];
  for (const rij of rijen || []) {
    if (rij.laatst_verstuurd === vandaag) {
      uitkomsten.push({ user_id: rij.user_id, verstuurd: false, reden: 'vandaag al gemaild' });
      continue;
    }
    try {
      uitkomsten.push(await verwerk(o, rij, false, nu));
    } catch (e) {
      uitkomsten.push({ user_id: rij.user_id, verstuurd: false, fout: String(e && (e as Error).message || e) });
    }
  }
  return { uur, bekeken: (rijen || []).length, uitkomsten };
}

/* -------------------------------- ingang -------------------------------- */

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json',
      // De testknop draait in je browser en die wil dit terugzien.
      'Access-Control-Allow-Origin': '*'
    }
  });
}

export async function handler(req: Request): Promise<Response> {
  // De app zelf stuurt vanuit de browser een preflight vooruit.
  if (req.method === 'OPTIONS') {
    return new Response(null, {
      status: 204,
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'authorization, apikey, content-type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS'
      }
    });
  }
  if (req.method !== 'POST') return json({ fout: 'Alleen POST.' }, 405);

  const { omgeving, fout } = leesOmgeving();
  if (!omgeving) return json({ fout }, 500);

  const nu = new Date();

  // Route 1: de klok. pg_cron stuurt de sleutel mee die alleen jij kent.
  const meegestuurd = req.headers.get('x-cron-sleutel') || '';
  if (meegestuurd) {
    if (!omgeving.cron || !veiligGelijk(meegestuurd, omgeving.cron)) {
      return json({ fout: 'Onjuiste cron-sleutel.' }, 401);
    }
    return json(await sweep(omgeving, nu));
  }

  // Route 2: de testknop in de app, met het token van je eigen sessie.
  const token = (req.headers.get('Authorization') || '').replace(/^Bearer\s+/i, '').trim();
  if (token) {
    const gebruiker = await gebruikerVanToken(omgeving, token);
    if (!gebruiker) return json({ fout: 'Niet ingelogd.' }, 401);
    const rijen = await db(omgeving, 'herinneringen?select=user_id,uur,naar,laatst_verstuurd&user_id=eq.' +
      encodeURIComponent(gebruiker.id)) as Rij[];
    const rij: Rij = (rijen && rijen[0]) || {
      user_id: gebruiker.id, uur: 9, naar: gebruiker.email, laatst_verstuurd: null
    };
    const uitkomst = await verwerk(omgeving, rij, true, nu);
    return json(uitkomst, 200);
  }

  return json({ fout: 'Geen toegang.' }, 401);
}

// deno-lint-ignore no-explicit-any
const deno = (globalThis as any).Deno;
if (deno && typeof deno.serve === 'function') deno.serve(handler);
