/* Goal Dashboard - iconen
 *
 * Getekende iconen in plaats van emoji. Emoji zien er op elk apparaat anders
 * uit, schalen niet mee met de tekst en nemen hun eigen kleur mee; deze lijnen
 * volgen de tekstkleur en staan overal hetzelfde.
 *
 * Alles op één raster van 20 bij 20, met dezelfde lijndikte, zodat de set als
 * één set leest. Gebruik: GD.icon('water') of GD.icon('water', 22).
 */
(function (global) {
  'use strict';

  var PADEN = {
    /* merk */
    doel: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3.2"/>' +
      '<circle cx="10" cy="10" r=".9" fill="currentColor" stroke="none"/>',

    /* de doelen, met dezelfde sleutel als in GOALS */
    creatine: '<rect x="3.2" y="7.6" width="13.6" height="6.8" rx="3.4"/><path d="M10 7.6v6.8"/>',
    ontbijt: '<path d="M3.4 9.6h13.2a6.6 6.6 0 0 1-13.2 0Z"/><path d="M8 6.6c0-1 1-1.4 1-2.4"/>' +
      '<path d="M11.6 6.6c0-1 1-1.4 1-2.4"/>',
    lunch: '<path d="M16.4 3.6c0 7-4 10-9 10-1.5 0-2.5-.4-2.5-.4S4 6.6 10 4.6c2.4-.8 6.4-1 6.4-1Z"/>' +
      '<path d="M4.2 16.4c2-4 5-6 8.4-7.4"/>',
    avondeten: '<circle cx="10" cy="10" r="7"/><circle cx="10" cy="10" r="3.2"/>',
    postworkout: '<path d="M6.2 7h7.6l-1 9.4a1 1 0 0 1-1 .9H8.2a1 1 0 0 1-1-.9Z"/>' +
      '<path d="M5.6 4.2h8.8L13.8 7H6.2Z"/>',
    gesport: '<path d="M2.6 10h14.8"/><rect x="4.4" y="6" width="3.1" height="8" rx="1"/>' +
      '<rect x="12.5" y="6" width="3.1" height="8" rx="1"/><path d="M2.6 7.9v4.2M17.4 7.9v4.2"/>',
    overload: '<path d="M3 14.6 8 9.2l3 3 6-6.6"/><path d="M12.8 5.6H17v4.2"/>',
    water: '<path d="M10 3.2c3.2 3.6 5 6.1 5 8.3a5 5 0 0 1-10 0c0-2.2 1.8-4.7 5-8.3Z"/>',
    eiwit: '<path d="M10 3.4c3 0 5.2 4.2 5.2 7.4a5.2 5.2 0 0 1-10.4 0C4.8 7.6 7 3.4 10 3.4Z"/>',
    calorieen: '<path d="M10 3.2s.7 2.6-1.2 4.4C7 9.4 5.6 10.6 5.6 12.6a4.4 4.4 0 0 0 8.8 0c0-2.4-1.6-3.6-2.4-5.2' +
      '-.5 1-1.3 1.6-1.3 1.6S11.6 6 10 3.2Z"/>',

    /* losse iconen in de app */
    weegschaal: '<rect x="3.2" y="5.5" width="13.6" height="11" rx="2"/>' +
      '<path d="M6.6 10a3.6 3.6 0 0 1 6.8 0"/><path d="M10 10 8.4 12.2"/>',
    rapport: '<rect x="4.5" y="4.2" width="11" height="12.6" rx="1.6"/>' +
      '<rect x="7.6" y="2.6" width="4.8" height="2.8" rx=".9"/><path d="M7.6 9.4h4.8M7.6 12.6h3.2"/>',
    beker: '<path d="M6.5 3.2h7v3.4a3.5 3.5 0 0 1-7 0Z"/><path d="M6.5 4.4H4v1a2.5 2.5 0 0 0 2.5 2.5"/>' +
      '<path d="M13.5 4.4H16v1A2.5 2.5 0 0 1 13.5 8"/><path d="M8 16.8h4"/><path d="M10 10.2v6.6"/>',
    daling: '<path d="M3 5.4 8 10.8l3-3 6 6.4"/><path d="M12.8 14.4H17v-4.2"/>',
    rust: '<path d="M15.4 12.4A6.2 6.2 0 0 1 7.6 4.6a6.2 6.2 0 1 0 7.8 7.8Z"/>',
    grafiek: '<path d="M3.2 16.4V3.6"/><path d="M3.2 16.4h13.6"/><path d="M6 13.2l3-3.4 2.6 2.2 3.8-4.6"/>',
    sync: '<path d="M16.2 10a6.2 6.2 0 1 1-1.9-4.4"/><path d="M16.6 3.4v3.4h-3.4"/>',
    klok: '<circle cx="10" cy="10" r="6.8"/><path d="M10 6v4.2l2.8 1.7"/>'
  };

  /* Het vlammetje doet dubbel dienst: calorieën én je reeks goede dagen. */
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
    return '<svg class="ico" width="' + g + '" height="' + g + '" viewBox="0 0 20 20"' +
      ' fill="none" stroke="currentColor" stroke-width="1.6" stroke-linecap="round"' +
      ' stroke-linejoin="round" aria-hidden="true" focusable="false">' + pad + '</svg>';
  }

  global.GD = global.GD || {};
  global.GD.icon = icon;
  global.GD.ICON_PADEN = PADEN;
})(window);
