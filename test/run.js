/* Draait alle testsuites tegen de app in deze map.

   node test/run.js              alles
   node test/run.js advies       alleen suites waarvan de naam dit bevat

   Start zelf een kleine webserver op een vrije poort, zodat er niets anders
   hoeft te draaien. Elke suite is een los script dat met 0 eindigt als alles
   klopt. */
const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const ROOT = path.resolve(__dirname, '..');
const SOORT = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8', '.json': 'application/json', '.png': 'image/png',
  '.svg': 'image/svg+xml'
};

const SUITES = [
  'dagscore', 'voedingsdoelen', 'eiwitdoel', 'overload', 'verbruik', 'gewicht',
  'gegevensveiligheid', 'advies', 'kleine-punten', 'schermen'
];

const server = http.createServer((req, res) => {
  const pad = path.join(ROOT, decodeURIComponent(req.url.split('?')[0]));
  if (!pad.startsWith(ROOT) || !fs.existsSync(pad) || fs.statSync(pad).isDirectory()) {
    res.writeHead(404); res.end(); return;
  }
  res.writeHead(200, { 'Content-Type': SOORT[path.extname(pad)] || 'application/octet-stream' });
  fs.createReadStream(pad).pipe(res);
});

/* Eén suite draaien. Asynchroon: de webserver hierboven draait in hetzelfde
   proces en moet de pagina's kunnen blijven serveren terwijl de suite loopt. */
function draai(suite, wortel) {
  return new Promise((klaar) => {
    const kind = spawn(process.execPath, [path.join(__dirname, suite + '.js')], {
      stdio: 'inherit', env: Object.assign({}, process.env, { WORTEL: wortel })
    });
    kind.on('exit', (code) => klaar(code === 0));
  });
}

server.listen(0, '127.0.0.1', async () => {
  const wortel = 'http://127.0.0.1:' + server.address().port;
  const filter = process.argv[2];
  const mislukt = [];
  if (!fs.existsSync(path.join(__dirname, 'prive'))) {
    console.log('Geen test/prive/: de stukken die met je eigen back-up rekenen worden overgeslagen.\n' +
      'Zet daar backup-23.json en backup-24.json neer om ze mee te draaien.\n');
  }
  for (const s of SUITES.filter((x) => !filter || x.indexOf(filter) >= 0)) {
    console.log('\n######## ' + s);
    if (!(await draai(s, wortel))) mislukt.push(s);
  }
  server.close();
  console.log('\n' + (mislukt.length ? 'MISLUKT: ' + mislukt.join(', ') : 'Alle suites geslaagd.'));
  process.exit(mislukt.length ? 1 : 0);
});
