/* Goal Dashboard - configuratie: doelen, standaardinstellingen, kleurschaal */
(function (global) {
  'use strict';

  var STORAGE_KEY = 'goaldash.v1';

  /* ------------------------------------------------------------------ *
   * Doelen
   *
   * score  : 0..1 (of null = telt niet mee, bv. rustdag)
   * weight : standaard gewicht in de eindscore (aanpasbaar in instellingen)
   * onlyIfTrained : doel telt alleen mee op een dag waarop echt gesport is
   * ------------------------------------------------------------------ */
  var MEAL_OPTIONS = [
    { v: 'eiwitrijk', label: 'Ja (eiwitrijk)', short: 'Eiwitrijk', score: 1 },
    { v: 'ja', label: 'Ja', short: 'Ja', score: 0.6 },
    { v: 'nee', label: 'Nee', short: 'Nee', score: 0 }
  ];

  var GOALS = [
    {
      key: 'creatine',
      label: 'Creatine gepakt',
      icon: '💊',
      weight: 1,
      options: [
        { v: 'ja', label: 'Ja', short: 'Ja', score: 1 },
        { v: 'nee', label: 'Nee', short: 'Nee', score: 0 }
      ]
    },
    { key: 'ontbijt', label: 'Ontbijt', icon: '🥣', weight: 1, options: MEAL_OPTIONS },
    { key: 'lunch', label: 'Lunch', icon: '🥗', weight: 1, options: MEAL_OPTIONS },
    { key: 'avondeten', label: 'Avondeten', icon: '🍽️', weight: 1, options: MEAL_OPTIONS },
    {
      key: 'postworkout',
      label: 'Post-workout maaltijd',
      icon: '🥤',
      weight: 1,
      onlyIfTrained: true,
      options: MEAL_OPTIONS
    },
    {
      key: 'gesport',
      label: 'Gesport',
      icon: '🏋️',
      weight: 2,
      options: [
        { v: 'ja', label: 'Ja', short: 'Ja', score: 1 },
        { v: 'nee', label: 'Nee', short: 'Nee', score: 0 },
        { v: 'rustdag', label: 'Rustdag', short: 'Rust', score: null }
      ]
    },
    {
      key: 'overload',
      label: 'Progressive overload',
      icon: '📈',
      weight: 1.5,
      onlyIfTrained: true,
      options: [
        { v: 'ja', label: 'Ja', short: 'Ja', score: 1 },
        { v: 'deels', label: 'Deels', short: 'Deels', score: 0.5 },
        { v: 'nee', label: 'Nee', short: 'Nee', score: 0 }
      ]
    },
    {
      key: 'eiwit',
      label: 'Eiwitdoel behaald',
      icon: '🍗',
      weight: 2,
      macro: 'protein',
      options: [
        { v: 'ja', label: 'Ja', short: 'Ja', score: 1 },
        { v: 'nee', label: 'Nee', short: 'Nee', score: 0 }
      ]
    },
    {
      key: 'calorieen',
      label: 'Caloriedoel behaald',
      icon: '🔥',
      weight: 1.5,
      macro: 'calories',
      options: [
        { v: 'ja', label: 'Ja', short: 'Ja', score: 1 },
        { v: 'nee', label: 'Nee', short: 'Nee', score: 0 }
      ]
    }
  ];

  var DEFAULT_SETTINGS = {
    eiwitDoel: 150,           // gram per dag
    calorieDoel: 2200,        // kcal per dag
    calorieRichting: 'max',   // 'max' = onder blijven, 'min' = halen, 'rond' = binnen marge
    calorieMarge: 150,        // kcal, alleen bij 'rond'
    gewichtDoel: null,        // kg, optioneel (alleen voor de grafiek)
    goedeDagDrempel: 70,      // % vanaf wanneer een dag als "goed" telt (streak)
    countMissingAsZero: true, // lege dagen in het verleden tellen als 0%
    autoMacro: true,          // eiwit/kcal doel automatisch afleiden uit ingevulde waarden
    theme: 'dark',
    weights: {}               // per doel-key, gevuld met de standaarden hieronder
  };

  GOALS.forEach(function (g) { DEFAULT_SETTINGS.weights[g.key] = g.weight; });

  /* ------------------------------------------------------------------ *
   * Kleurschaal: 0% donkerrood -> 100% donkergroen
   * ------------------------------------------------------------------ */
  var COLOR_STOPS = [
    { p: 0,   c: [122, 12, 18] },   // donkerrood
    { p: 20,  c: [178, 30, 30] },
    { p: 40,  c: [214, 96, 20] },
    { p: 55,  c: [217, 154, 10] },  // amber
    { p: 70,  c: [154, 168, 20] },
    { p: 85,  c: [77, 145, 46] },
    { p: 100, c: [13, 82, 34] }     // donkergroen
  ];

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

  function scoreColor(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return '#3a3f4b';
    var p = clamp(pct, 0, 100);
    var a = COLOR_STOPS[0], b = COLOR_STOPS[COLOR_STOPS.length - 1];
    for (var i = 0; i < COLOR_STOPS.length - 1; i++) {
      if (p >= COLOR_STOPS[i].p && p <= COLOR_STOPS[i + 1].p) {
        a = COLOR_STOPS[i];
        b = COLOR_STOPS[i + 1];
        break;
      }
    }
    var t = b.p === a.p ? 0 : (p - a.p) / (b.p - a.p);
    var rgb = [0, 1, 2].map(function (i) {
      return Math.round(a.c[i] + (b.c[i] - a.c[i]) * t);
    });
    return 'rgb(' + rgb.join(',') + ')';
  }

  /* Leesbare tekstkleur op een score-achtergrond */
  function textOn(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return '#c9cedb';
    var m = /rgb\((\d+),(\d+),(\d+)\)/.exec(scoreColor(pct));
    if (!m) return '#fff';
    var lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
    return lum > 0.62 ? '#14181f' : '#ffffff';
  }

  function scoreLabel(pct) {
    if (pct === null || pct === undefined) return 'Geen data';
    if (pct >= 90) return 'Uitstekend';
    if (pct >= 75) return 'Sterk';
    if (pct >= 60) return 'Prima';
    if (pct >= 40) return 'Kan beter';
    if (pct >= 20) return 'Zwak';
    return 'Slecht';
  }

  global.GD = global.GD || {};
  global.GD.STORAGE_KEY = STORAGE_KEY;
  global.GD.GOALS = GOALS;
  global.GD.DEFAULT_SETTINGS = DEFAULT_SETTINGS;
  global.GD.scoreColor = scoreColor;
  global.GD.textOn = textOn;
  global.GD.scoreLabel = scoreLabel;
  global.GD.clamp = clamp;
  global.GD.goalByKey = function (key) {
    for (var i = 0; i < GOALS.length; i++) if (GOALS[i].key === key) return GOALS[i];
    return null;
  };
})(window);
