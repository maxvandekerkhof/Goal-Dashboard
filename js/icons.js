/* Goal Dashboard - iconen
 *
 * De iconen komen uit Lucide (lucide-static 1.46.0, ISC-licentie): de echte
 * paden, niet nagetekend. Alles op een raster van 24 bij 24 met lijndikte 2,
 * dus ze staan onderling gelijk en volgen de tekstkleur.
 *
 * Emoji zijn hier bewust weg: die zien er op elk apparaat anders uit, schalen
 * niet mee met de tekst en nemen hun eigen kleur mee.
 *
 * Gebruik: GD.icon('water') of GD.icon('water', 22).
 */
(function (global) {
  'use strict';

  var PADEN = {

    /* merk */
    doel: '<circle cx="12" cy="12" r="10" /> <circle cx="12" cy="12" r="6" /> <circle cx="12" '
      + 'cy="12" r="2" />',

    /* doelen */
    creatine: '<path d="m10.5 20.5 10-10a4.95 4.95 0 1 0-7-7l-10 10a4.95 4.95 0 1 0 7 7Z" /> <path '
      + 'd="m8.5 8.5 7 7" />',
    ontbijt: '<path d="M10.2 18H4.774a1.5 1.5 0 0 1-1.352-.97 11 11 0 0 1 .132-6.487" /> <path '
      + 'd="M18 10.2V4.774a1.5 1.5 0 0 0-.97-1.352 11 11 0 0 0-6.486.132" /> <path d="M18 5a4 3 '
      + '0 0 1 4 3 2 2 0 0 1-2 2 10 10 0 0 0-5.139 1.42" /> <path d="M5 18a3 4 0 0 0 3 4 2 2 0 '
      + '0 0 2-2 10 10 0 0 1 1.42-5.14" /> <path d="M8.709 2.554a10 10 0 0 0-6.155 6.155 1.5 '
      + '1.5 0 0 0 .676 1.626l9.807 5.42a2 2 0 0 0 2.718-2.718l-5.42-9.807a1.5 1.5 0 0 '
      + '0-1.626-.676" />',
    lunch: '<path d="M7 21h10" /> <path d="M12 21a9 9 0 0 0 9-9H3a9 9 0 0 0 9 9Z" /> <path '
      + 'd="M11.38 12a2.4 2.4 0 0 1-.4-4.77 2.4 2.4 0 0 1 3.2-2.77 2.4 2.4 0 0 1 3.47-.63 2.4 '
      + '2.4 0 0 1 3.37 3.37 2.4 2.4 0 0 1-1.1 3.7 2.51 2.51 0 0 1 .03 1.1" /> <path d="m13 12 '
      + '4-4" /> <path d="M10.9 7.25A3.99 3.99 0 0 0 4 10c0 .73.2 1.41.54 2" />',
    avondeten: '<path d="m16 2-2.3 2.3a3 3 0 0 0 0 4.2l1.8 1.8a3 3 0 0 0 4.2 0L22 8" /> <path d="M15 '
      + '15 3.3 3.3a4.2 4.2 0 0 0 0 6l7.3 7.3c.7.7 2 .7 2.8 0L15 15Zm0 0 7 7" /> <path d="m2.1 '
      + '21.8 6.4-6.3" /> <path d="m19 5-7 7" />',
    postworkout: '<path d="m6 8 1.75 12.28a2 2 0 0 0 2 1.72h4.54a2 2 0 0 0 2-1.72L18 8" /> <path d="M5 '
      + '8h14" /> <path d="M7 15a6.47 6.47 0 0 1 5 0 6.47 6.47 0 0 0 5 0" /> <path d="m12 8 '
      + '1-6h2" />',
    gesport: '<path d="M17.596 12.768a2 2 0 1 0 2.829-2.829l-1.768-1.767a2 2 0 0 0 '
      + '2.828-2.829l-2.828-2.828a2 2 0 0 0-2.829 2.828l-1.767-1.768a2 2 0 1 0-2.829 2.829z" /> '
      + '<path d="m2.5 21.5 1.4-1.4" /> <path d="m20.1 3.9 1.4-1.4" /> <path d="M5.343 21.485a2 '
      + '2 0 1 0 2.829-2.828l1.767 1.768a2 2 0 1 0 2.829-2.829l-6.364-6.364a2 2 0 1 0-2.829 '
      + '2.829l1.768 1.767a2 2 0 0 0-2.828 2.829z" /> <path d="m9.6 14.4 4.8-4.8" />',
    overload: '<path d="M16 7h6v6" /> <path d="m22 7-8.5 8.5-5-5L2 17" />',
    water: '<path d="M12 22a7 7 0 0 0 7-7c0-2-1-3.9-3-5.5s-3.5-4-4-6.5c-.5 2.5-2 4.9-4 6.5C6 11.1 '
      + '5 13 5 15a7 7 0 0 0 7 7z" />',
    eiwit: '<path d="M15.4 15.63a7.875 6 135 1 1 6.23-6.23 4.5 3.43 135 0 0-6.23 6.23" /> <path '
      + 'd="m8.29 12.71-2.6 2.6a2.5 2.5 0 1 0-1.65 4.65A2.5 2.5 0 1 0 8.7 18.3l2.59-2.59" />',
    calorieen: '<path d="M12 3q1 4 4 6.5t3 5.5a1 1 0 0 1-14 0 5 5 0 0 1 1-3 1 1 0 0 0 5 '
      + '0c0-2-1.5-3-1.5-5q0-2 2.5-4" />',

    /* losse iconen */
    weegschaal: '<path d="M12 3v18" /> <path d="m19 8 3 8a5 5 0 0 1-6 0zV7" /> <path d="M3 7h1a17 17 0 '
      + '0 0 8-2 17 17 0 0 0 8 2h1" /> <path d="m5 8 3 8a5 5 0 0 1-6 0zV7" /> <path d="M7 '
      + '21h10" />',
    rapport: '<rect width="8" height="4" x="8" y="2" rx="1" ry="1" /> <path d="M16 4h2a2 2 0 0 1 2 '
      + '2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" /> <path d="M12 11h4" /> <path '
      + 'd="M12 16h4" /> <path d="M8 11h.01" /> <path d="M8 16h.01" />',
    beker: '<path d="M10 14.66V17a1 1 0 0 1-1 1 2 2 0 0 0-2 2v2" /> <path d="M14 14.66V17a1 1 0 0 '
      + '0 1 1 2 2 0 0 1 2 2v2" /> <path d="M17.916 10H19.5A2.5 2.5 0 0 0 22 7.5V5a1 1 0 0 '
      + '0-1-1h-3" /> <path d="M4 22h16" /> <path d="M6 9a6 6 0 0 0 12 0V3a1 1 0 0 0-1-1H7a1 1 '
      + '0 0 0-1 1z" /> <path d="M6.084 10H4.5A2.5 2.5 0 0 1 2 7.5V5a1 1 0 0 1 1-1h3" />',
    daling: '<path d="M16 17h6v-6" /> <path d="m22 17-8.5-8.5-5 5L2 7" />',
    rust: '<path d="M20.985 12.486a9 9 0 1 1-9.473-9.472c.405-.022.617.46.402.803a6 6 0 0 0 8.268 '
      + '8.268c.344-.215.825-.004.803.401" />',
    grafiek: '<path d="M3 3v16a2 2 0 0 0 2 2h16" /> <path d="m19 9-5 5-4-4-3 3" />',
    sync: '<path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" /> <path d="M21 3v5h-5" '
      + '/> <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" /> <path d="M8 '
      + '16H3v5" />',
    thema: '<path d="M12 2v2" /> <path d="M14.837 16.385a6 6 0 1 1-7.223-7.222c.624-.147.97.66.715 '
      + '1.248a4 4 0 0 0 5.26 5.259c.589-.255 1.396.09 1.248.715" /> <path d="M16 12a4 4 0 0 '
      + '0-4-4" /> <path d="m19 5-1.256 1.256" /> <path d="M20 12h2" />',
    klok: '<circle cx="12" cy="12" r="10" /> <path d="M12 6v6l4 2" />',
    week: '<path d="M3 3v16a2 2 0 0 0 2 2h16" /> <path d="M18 17V9" /> <path d="M13 17V5" /> '
      + '<path d="M8 17v-3" />',
    maand: '<path d="M8 2v3" /> <path d="M16 2v3" /> <rect x="3" y="3" width="18" height="18" '
      + 'rx="2" /> <path d="M3 9h18" /> <path d="M8 13h.01" /> <path d="M12 13h.01" /> <path '
      + 'd="M16 13h.01" /> <path d="M8 17h.01" /> <path d="M12 17h.01" /> <path d="M16 17h.01" '
      + '/>',
    instellingen: '<path d="M9.671 4.136a2.34 2.34 0 0 1 4.659 0 2.34 2.34 0 0 0 3.319 1.915 2.34 2.34 0 '
      + '0 1 2.33 4.033 2.34 2.34 0 0 0 0 3.831 2.34 2.34 0 0 1-2.33 4.033 2.34 2.34 0 0 '
      + '0-3.319 1.915 2.34 2.34 0 0 1-4.659 0 2.34 2.34 0 0 0-3.32-1.915 2.34 2.34 0 0 '
      + '1-2.33-4.033 2.34 2.34 0 0 0 0-3.831A2.34 2.34 0 0 1 6.35 6.051a2.34 2.34 0 0 0 '
      + '3.319-1.915" /> <circle cx="12" cy="12" r="3" />',
    notitie: '<path d="M13.4 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-7.4" /> <path '
      + 'd="M2 6h4" /> <path d="M2 10h4" /> <path d="M2 14h4" /> <path d="M2 18h4" /> <path '
      + 'd="M21.378 5.626a1 1 0 1 0-3.004-3.004l-5.01 5.012a2 2 0 0 0-.506.854l-.837 2.87a.5.5 '
      + '0 0 0 .62.62l2.87-.837a2 2 0 0 0 .854-.506z" />',
    melding: '<circle cx="12" cy="12" r="10" /> <line x1="12" x2="12" y1="8" y2="12" /> <line '
      + 'x1="12" x2="12.01" y1="16" y2="16" />',
    telefoon: '<rect width="14" height="20" x="5" y="2" rx="2" ry="2" /> <path d="M12 18h.01" />',

    /* knoppen */
    vorige: '<path d="m15 18-6-6 6-6" />',
    volgende: '<path d="m9 18 6-6-6-6" />',
    plus: '<path d="M5 12h14" /> <path d="M12 5v14" />',
    min: '<path d="M5 12h14" />',
    kruis: '<path d="M18 6 6 18" /> <path d="m6 6 12 12" />',
    omhoog: '<path d="m5 12 7-7 7 7" /> <path d="M12 19V5" />',
    omlaag: '<path d="M12 5v14" /> <path d="m19 12-7 7-7-7" />',
    opnieuw: '<path d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" /> <path d="M3 3v5h5" />',
    vink: '<path d="M20 6 9 17l-5-5" />',
    download: '<path d="M12 15V3" /> <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /> <path '
      + 'd="m7 10 5 5 5-5" />',
    upload: '<path d="M12 3v12" /> <path d="m17 8-5-5-5 5" /> <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 '
      + '0 0 1-2-2v-4" />',
    prullenbak: '<path d="M10 11v6" /> <path d="M14 11v6" /> <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 '
      + '1-2-2V6" /> <path d="M3 6h18" /> <path d="M8 6V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" />'
  };

  /* Het vlammetje doet dubbel dienst: calorieen en je reeks goede dagen. */
  PADEN.vlam = PADEN.calorieen;

  /**
   * @param {string} naam  sleutel uit PADEN
   * @param {number} [px]  hoogte in pixels; standaard 18
   * @returns {string} inline SVG, of niets als de naam niet bestaat
   */
  function icon(naam, px) {
    var pad = PADEN[naam];
    if (!pad) return '';
    var g = px || 18;
    return '<svg class="ico" width="' + g + '" height="' + g + '" viewBox="0 0 24 24"' +
      ' fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round"' +
      ' stroke-linejoin="round" aria-hidden="true" focusable="false">' + pad + '</svg>';
  }

  global.GD = global.GD || {};
  global.GD.icon = icon;
  global.GD.ICON_PADEN = PADEN;
})(window);
