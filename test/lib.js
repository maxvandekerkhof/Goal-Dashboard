/* Gedeeld door alle testsuites: browser starten, waar de app staat, en je
   eigen back-up als die er is.

   Je eigen gegevens horen niet in deze repo — die is openbaar. Suites die met
   je echte gewicht en calorieën rekenen, lezen ze uit test/prive/ (staat in
   .gitignore) en slaan die stukken over als de map leeg is. */
const fs = require('fs');
const path = require('path');

function playwright() {
  try {
    return require('playwright');
  } catch (e) {
    // In de Claude Code-omgeving staat Playwright globaal geïnstalleerd.
    return require('/opt/node22/lib/node_modules/playwright');
  }
}

const { chromium } = playwright();

/* Een vaste Chromium als die er is (CHROMIUM, of die van de Claude Code-
   omgeving); anders de browser die Playwright zelf installeerde. */
function lanceer() {
  const opties = { args: ['--no-sandbox'] };
  const vast = process.env.CHROMIUM || '/opt/pw-browsers/chromium-1194/chrome-linux/chrome';
  if (fs.existsSync(vast)) opties.executablePath = vast;
  return chromium.launch(opties);
}

const WORTEL = process.env.WORTEL || 'http://127.0.0.1:8741';
const PAGINA = WORTEL + '/index.html';

/** Een bestand uit test/prive/, of null als het er niet is. */
function prive(naam) {
  const pad = path.join(__dirname, 'prive', naam);
  return fs.existsSync(pad) ? fs.readFileSync(pad, 'utf8') : null;
}

function overslaan(wat) {
  console.log('  --   ' + wat + ' (overgeslagen: geen eigen back-up in test/prive/)');
}

module.exports = { chromium, lanceer, WORTEL, PAGINA, prive, overslaan };
