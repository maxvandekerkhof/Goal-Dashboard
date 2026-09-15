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
      icon: 'creatine',
      weight: 1,
      options: [
        { v: 'ja', label: 'Ja', short: 'Ja', score: 1 },
        { v: 'nee', label: 'Nee', short: 'Nee', score: 0 }
      ]
    },
    { key: 'ontbijt', label: 'Ontbijt', icon: 'ontbijt', weight: 1, options: MEAL_OPTIONS },
    { key: 'lunch', label: 'Lunch', icon: 'lunch', weight: 1, options: MEAL_OPTIONS },
    { key: 'avondeten', label: 'Avondeten', icon: 'avondeten', weight: 1, options: MEAL_OPTIONS },
    {
      key: 'postworkout',
      label: 'Post-workout maaltijd',
      icon: 'postworkout',
      weight: 1,
      onlyIfTrained: true,
      options: MEAL_OPTIONS
    },
    {
      key: 'gesport',
      label: 'Gesport',
      icon: 'gesport',
      weight: 2,
      options: [
        { v: 'ja', label: 'Ja', short: 'Ja', score: 1 },
        { v: 'nee', label: 'Nee', short: 'Nee', score: 0 },
        { v: 'rustdag', label: 'Rustdag', short: 'Rust', score: null, reason: 'rustdag' }
      ]
    },
    {
      key: 'overload',
      label: 'Progressive overload',
      icon: 'overload',
      weight: 1.5,
      onlyIfTrained: true,
      options: [
        { v: 'ja', label: 'Ja', short: 'Ja', score: 1 },
        { v: 'deels', label: 'Deels', short: 'Deels', score: 0.5 },
        { v: 'nee', label: 'Nee', short: 'Nee', score: 0 },
        // Alleen automatisch: je eerste sessie van een oefening valt nergens
        // mee te vergelijken, dus die telt niet mee in de dagscore.
        { v: 'nieuw', label: 'Eerste keer', short: 'Nieuw', score: null,
          reason: 'eerste keer', hidden: true }
      ]
    },
    {
      // Teller in plaats van keuzeknoppen: je telt de dag door op naar je doel.
      key: 'water',
      label: 'Water',
      icon: 'water',
      weight: 1,
      type: 'meter',
      field: 'waterMl',
      doelKey: 'waterDoel',
      stappen: [250, 500, 1000]
    },
    {
      key: 'eiwit',
      label: 'Eiwitdoel behaald',
      icon: 'eiwit',
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
      icon: 'calorieen',
      weight: 1.5,
      macro: 'calories',
      options: [
        { v: 'ja', label: 'Ja', short: 'Ja', score: 1 },
        { v: 'nee', label: 'Nee', short: 'Nee', score: 0 }
      ]
    }
  ];

  var DEFAULT_SETTINGS = {
    eiwitDoel: 150,           // gram per dag, bij eiwitBasis 'vast'
    eiwitBasis: 'vast',       // 'vast' = het getal hierboven, 'gewicht' = per kilo lichaamsgewicht
    eiwitPerKg: 1.8,          // gram eiwit per kilo, alleen bij eiwitBasis 'gewicht'
    waterDoel: 3000,          // ml per dag
    calorieDoel: 2200,        // kcal per dag
    calorieRichting: 'max',   // 'max' = onder blijven, 'min' = halen, 'rond' = binnen marge
    calorieMarge: 150,        // kcal, alleen bij 'rond'
    gewichtDoel: null,        // kg, optioneel streefgewicht (lijn in de grafiek)
    gewichtRichting: 'aankomen', // 'aankomen' | 'afvallen' | 'behouden' | 'uit'
    gewichtTempo: 0.25,       // kg per week; bij 'behouden' is dit de marge
    oefeningen: [],           // [{id, naam, type:'gewicht'|'reps', perArm, startDatum}]
    schemas: [],              // [{id, naam, oefeningen:[oefening-id]}]
    voedingSync: false,       // calorieën en eiwitten ophalen uit de tabel voeding
    weekafsluitingGezien: '', // maandag van de week waarvan je de afsluiting wegklikte
    goedeDagDrempel: 70,      // % vanaf wanneer een dag als "goed" telt (streak)
    countMissingAsZero: true, // lege dagen in het verleden tellen als 0%
    autoMacro: true,          // eiwit/kcal doel automatisch afleiden uit ingevulde waarden
    theme: 'dark',
    weights: {}               // per doel-key, gevuld met de standaarden hieronder
  };

  GOALS.forEach(function (g) { DEFAULT_SETTINGS.weights[g.key] = g.weight; });

  /* ------------------------------------------------------------------ *
   * Kleurschaal: 0% rood -> 100% mintgroen
   * ------------------------------------------------------------------ */
  /* Vlakken: balken, ringen, kalendervlakjes. Fel, want een score die je moet
     aankijken hoort op te vallen — het oude donkergroen zakte 's avonds weg in
     een zwart scherm. */
  var COLOR_STOPS = [
    { p: 0,   c: [255, 59, 48] },   // rood
    { p: 20,  c: [255, 107, 43] },
    { p: 40,  c: [255, 159, 10] },
    { p: 55,  c: [255, 214, 10] },  // goud
    { p: 70,  c: [168, 230, 43] },
    { p: 85,  c: [47, 224, 127] },
    { p: 100, c: [0, 229, 160] }    // mintgroen
  ];

  /* Diezelfde tinten, maar donker genoeg om als TEKST op een lichte
     ondergrond te lezen. Fel op zwart werkt; fel op wit niet. */
  var INK_STOPS = [
    { p: 0,   c: [207, 42, 32] },
    { p: 20,  c: [196, 80, 26] },
    { p: 40,  c: [169, 101, 0] },
    { p: 55,  c: [132, 106, 0] },
    { p: 70,  c: [86, 130, 13] },
    { p: 85,  c: [14, 148, 80] },
    { p: 100, c: [0, 129, 91] }
  ];

  function clamp(v, min, max) { return v < min ? min : (v > max ? max : v); }

  function meng(stops, pct) {
    var p = clamp(pct, 0, 100);
    var a = stops[0], b = stops[stops.length - 1];
    for (var i = 0; i < stops.length - 1; i++) {
      if (p >= stops[i].p && p <= stops[i + 1].p) {
        a = stops[i];
        b = stops[i + 1];
        break;
      }
    }
    var t = b.p === a.p ? 0 : (p - a.p) / (b.p - a.p);
    var rgb = [0, 1, 2].map(function (i) {
      return Math.round(a.c[i] + (b.c[i] - a.c[i]) * t);
    });
    return 'rgb(' + rgb.join(',') + ')';
  }

  /** Kleur voor een vlak: balk, ring, kalendervlakje. */
  function scoreColor(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return '#3a4050';
    return meng(COLOR_STOPS, pct);
  }

  function lichtThema() {
    return typeof document !== 'undefined' &&
      document.documentElement.getAttribute('data-theme') === 'light';
  }

  /**
   * Kleur voor een getal of een woord dat op de achtergrond van de pagina
   * staat. In het donker is dat dezelfde felle kleur; op een lichte
   * achtergrond de donkere variant, anders lees je je eigen score niet.
   */
  function scoreInk(pct) {
    if (pct === null || pct === undefined || isNaN(pct)) return 'var(--muted)';
    return lichtThema() ? meng(INK_STOPS, pct) : meng(COLOR_STOPS, pct);
  }

  /* Dezelfde schaal als verloop, voor de balk onder je dagscore. Hij wordt uit
     COLOR_STOPS opgebouwd en niet apart opgeschreven, zodat balk en cijfer
     nooit uit elkaar kunnen lopen. */
  function scaleGradient() {
    return 'linear-gradient(90deg,' + COLOR_STOPS.map(function (s) {
      return 'rgb(' + s.c.join(',') + ') ' + s.p + '%';
    }).join(',') + ')';
  }

  /* Leesbare tekstkleur op een score-achtergrond */
  function textOn(pct) {
    // Geen score, dus het neutrale grijs van scoreColor(null). Dat vlak is in
    // beide thema's donker, dus daar hoort wit op — de gedempte tekstkleur
    // verdween erin zodra de lichte modus aanstond.
    if (pct === null || pct === undefined || isNaN(pct)) return '#ffffff';
    var m = /rgb\((\d+),(\d+),(\d+)\)/.exec(scoreColor(pct));
    if (!m) return '#fff';
    var lum = (0.299 * +m[1] + 0.587 * +m[2] + 0.114 * +m[3]) / 255;
    // De hele schaal is fel, dus staat er bijna altijd donkere tekst op. Wit
    // op mintgroen of goud haalt bij lange na geen leesbaar verschil.
    return lum > 0.45 ? '#0a0c10' : '#ffffff';
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
  global.GD.scoreInk = scoreInk;
  global.GD.scaleGradient = scaleGradient;
  global.GD.textOn = textOn;
  global.GD.scoreLabel = scoreLabel;
  global.GD.clamp = clamp;
  /** "1,75 L" of "750 ml" */
  function formatVolume(ml) {
    if (ml === null || ml === undefined || isNaN(ml)) return '–';
    if (ml < 1000) return Math.round(ml) + ' ml';
    var l = ml / 1000;
    return (Math.round(l * 100) / 100).toFixed(2).replace(/[.,]?0+$/, '').replace('.', ',') + ' L';
  }

  /** "+25 cl" / "+50 cl" / "+1 L" */
  function stepLabel(ml) {
    if (ml % 1000 === 0) return '+' + (ml / 1000) + ' L';
    if (ml % 10 === 0) return '+' + (ml / 10) + ' cl';
    return '+' + ml + ' ml';
  }

  global.GD.formatVolume = formatVolume;
  global.GD.stepLabel = stepLabel;
  global.GD.goalByKey = function (key) {
    for (var i = 0; i < GOALS.length; i++) if (GOALS[i].key === key) return GOALS[i];
    return null;
  };
})(window);
