/* Goal Dashboard - weekafsluiting: wat ging er goed, en klopt je eten met je gewicht? */
(function (global) {
  'use strict';

  var GD = global.GD;
  var store = GD.store;
  var D = GD.date;
  var S = GD.score;

  /* Eén kilo lichaamsgewicht komt ruwweg overeen met 7700 kcal. Een vuistregel,
     geen natuurwet: hij is goed genoeg om te zien of je bij moet sturen, niet
     om op de kilo nauwkeurig te rekenen. Staat in score.js, want je verbruik
     rekent er ook mee en die twee mogen nooit uit elkaar lopen. */
  var KCAL_PER_KG = S.KCAL_PER_KG;

  /* Het rapport gaat over maandag t/m vrijdag: het weekend is bewust de vrije
     ruimte en hoort er niet in. Maar het verschijnt pas op zaterdag, want de
     voeding van vrijdag komt 's avonds laat uit Apple Health binnen — op
     vrijdagavond zou de week dus nog niet compleet zijn. */
  var LAATSTE_DAG = 4;      // 0 = maandag, 4 = vrijdag
  var TOT_UUR = 12;         // zondag nog tot 12:00, als je zaterdag gemist hebt

  /** Maandag t/m vrijdag van de week waarin `datum` valt. */
  function dagen(datum) {
    var start = D.startOfWeek(datum);
    return D.range(start, D.addDays(start, LAATSTE_DAG));
  }

  /** De maandag van de week; gebruikt om te onthouden welke afsluiting je zag. */
  function weekSleutel(datum) {
    return D.startOfWeek(datum);
  }

  /** Staat de afsluiting nu op de dagpagina? Zaterdag de hele dag, zondag tot 12:00. */
  function vensterOpen(nu) {
    var d = nu || new Date();
    var dag = d.getDay();
    if (dag === 6) return true;
    if (dag === 0) return d.getHours() < TOT_UUR;
    return false;
  }

  function gezien(datum) {
    return store.settings().weekafsluitingGezien === weekSleutel(datum);
  }

  function markeerGezien(datum) {
    store.setSetting('weekafsluitingGezien', weekSleutel(datum));
  }

  function afgerond(n, stap) {
    return Math.round(n / stap) * stap;
  }

  /**
   * Hoeveel kcal per dag je bij zou moeten stellen om je tempo te halen.
   * Positief = meer eten, negatief = minder.
   *
   * Dezelfde rekensom als de regel op de dagkaart (S.kcalStap), met het teken
   * omgedraaid: die zegt hoeveel je te veel eet, deze hoeveel er bij moet.
   * Dus ook hier op 10 kcal afgerond en nooit meer dan 300 per stap. Stonden
   * er eerder twee regels (50 en 500 hier, 10 en 300 daar), dan noemden de
   * dagkaart en de weekafsluiting op zaterdag onder elkaar een ander getal.
   */
  function bijstelling(perWeek, richting, tempo) {
    var stap = S.kcalStap(perWeek, richting, tempo).stap;
    return stap === 0 ? 0 : -stap;
  }

  /** "+0,39 kg per week" bij de trendlijn, "+0,12 kg in een week" zonder. */
  function beweging(g) {
    return g.uitTrend
      ? kgTekst(g.perWeek) + ' per week (de lijn door ' + g.trendVenster + ' dagen)'
      : kgTekst(g.perWeek) + ' in een week';
  }

  /**
   * Wat er te zeggen valt in de twee weken na een nieuw caloriedoel. Staat op
   * de dagkaart en in de weekafsluiting, dus één tekst voor allebei.
   * `a` is `advies` uit S.gewichtMelding met `rust` erin.
   *
   * Geen getal om je doel op te zetten: je gewicht loopt nog achter op wat je
   * nu eet. Wel of je het nieuwe doel haalt — zolang dat niet lukt, kan de
   * weegschaal niets laten zien — en na een week de lijn sinds de aanpassing.
   */
  function rustTekst(a, s) {
    var w = a.wissel, z = a.sinds;
    var t = 'Op ' + D.formatShort(w.datum) + ' zette je je caloriedoel van ' + w.van + ' op ' +
      w.naar + ' kcal. ';
    if (z.kcalDagen) {
      var gem = Math.round(z.kcalGem);
      var gehaald = doelGehaald(z.kcalGem, { calorieDoel: w.naar, calorieRichting: s.calorieRichting,
        calorieMarge: s.calorieMarge });
      t += 'Sindsdien at je gemiddeld ' + gem + ' kcal per dag' + (gehaald
        ? ', dus je nieuwe doel lukt. '
        : ' — dat haalt het nieuwe doel nog niet, en zolang dat zo is kan de weegschaal er ' +
          'niets van laten zien. ');
    }
    if (z.perWeek !== null) {
      t += 'Je gewicht sinds de aanpassing: ' + kgTekst(z.perWeek) + ' per week, uit ' +
        z.wegingen + ' wegingen in ' + (z.dagen + 1) + ' dagen. ';
    } else if (z.dagen < S.SINDS_MIN_DAGEN) {
      t += 'Vanaf ' + D.formatShort(D.addDays(w.datum, S.SINDS_MIN_DAGEN)) + ' zie je hier hoe je ' +
        'gewicht sindsdien loopt' + (z.wegingen < S.SINDS_MIN_WEEG
          ? ', als je tot dan minstens ' + S.SINDS_MIN_WEEG + ' keer weegt' : '') + '. ';
    } else {
      var nog = S.SINDS_MIN_WEEG - z.wegingen;
      t += 'Weeg je nog ' + nog + ' keer, dan zie je hier hoe je gewicht sindsdien loopt. ';
    }
    t += 'Je gewicht heeft een week of twee nodig om op ander eten te reageren, dus pas op ' +
      D.formatShort(w.totDatum) + ' kijk ik opnieuw of je doel klopt.';
    return t;
  }

  /**
   * De kern van de afsluiting: klopt wat je at met wat de weegschaal deed?
   *
   * Twee losse cijfers zeggen weinig — "2400 kcal" is pas een probleem als je
   * ook niet aankomt, en "+0,8 kg" pas als je dat niet wilde. Daarom worden ze
   * hier tegen elkaar gelegd.
   */
  function eetAdvies(gewicht, kcalGem, kcalDagen, geweest, s) {
    var richting = s.gewichtRichting || 'uit';
    var doel = S.num(s.calorieDoel, 0);
    var uit = {
      status: 'onbekend', kop: '', tekst: '', bijstellen: 0, nieuwDoel: null,
      kcalGem: kcalGem, kcalDagen: kcalDagen
    };

    if (richting === 'uit') {
      uit.status = 'geen-doel';
      uit.kop = 'Geen gewichtsdoel ingesteld';
      uit.tekst = 'Zet bij Instellingen een gewichtsdoel en tempo, dan kijk ik hier na of je eten ' +
        'en je gewicht met elkaar kloppen.';
      return uit;
    }

    if (kcalDagen < 3) {
      uit.status = 'te-weinig-kcal';
      uit.kop = 'Te weinig calorieën ingevuld';
      uit.tekst = 'Je vulde je calorieën ' + kcalDagen + ' van de ' + geweest + ' dag' +
        (geweest === 1 ? '' : 'en') + ' in. Met minder dan drie dagen kan ik niet zien of het aan ' +
        'je eten ligt — dan blijft het gokken.' +
        (gewicht.perWeek === null ? '' : ' Je gewicht ging ' + beweging(gewicht) + '.');
      return uit;
    }

    if (gewicht.perWeek === null) {
      uit.status = 'te-weinig-gewicht';
      uit.kop = 'Te weinig weegmomenten';
      uit.tekst = 'Je at gemiddeld ' + Math.round(kcalGem) + ' kcal, maar zonder gewicht van deze ' +
        'én vorige week kan ik niet zeggen of dat te veel of te weinig was. Weeg jezelf een paar ' +
        'ochtenden per week, steeds op hetzelfde moment.';
      return uit;
    }

    // Net een nieuw doel: het oude eten zit nog in de weegschaal. Eerst kijken
    // of het nieuwe werkt, in plaats van er meteen weer een stap op te zetten.
    if (gewicht.rust) {
      uit.status = 'rust';
      uit.kop = 'Nieuw caloriedoel — even afwachten';
      uit.tekst = rustTekst(gewicht.rust, s);
      return uit;
    }

    var tempo = Math.abs(S.num(s.gewichtTempo, 0.25));
    var kcal = bijstelling(gewicht.perWeek, richting, tempo);
    // Staat er genoeg in voor een verbruikschatting, dan komt het nieuwe doel
    // daarvandaan — hetzelfde getal als op de dagkaart. Anders je doel plus de
    // bijstelling.
    var voorstel = gewicht.advies && gewicht.advies.nieuwDoel
      ? gewicht.advies.nieuwDoel : afgerond(doel + kcal, 10);
    uit.bijstellen = kcal;

    var marge = Math.max(100, doel * 0.05);
    var onderDoel = doel > 0 && kcalGem < doel - marge;
    var bovenDoel = doel > 0 && kcalGem > doel + marge;
    var gemTekst = Math.round(kcalGem) + ' kcal per dag';
    var doelTekst = Math.round(doel) + ' kcal';

    if (gewicht.status === 'op-schema') {
      uit.status = 'op-schema';
      uit.kop = 'Eten en gewicht kloppen met elkaar';
      uit.tekst = 'Je zat op ' + gemTekst + ' en je gewicht ging ' + beweging(gewicht) +
        ' — precies het tempo dat je wilde. Verander niets aan wat je eet.';
      // De weegschaal doet het goed terwijl het doel op rood staat: dan klopt
      // niet je eten, maar het doel. Anders zou de app hier "verander niets"
      // zeggen en tegelijk je caloriedoel de hele week afkeuren.
      if (doel > 0 && !doelGehaald(kcalGem, s)) {
        uit.nieuwDoel = afgerond(kcalGem, 10);
        uit.tekst += ' Je eigen doel van ' + doelTekst + ' haalde je daarbij niet, terwijl je ' +
          'gewicht wél doet wat je wilt. Dan is dat doel te streng afgesteld: rond de ' +
          uit.nieuwDoel + ' kcal past bij je tempo.';
      }
      return uit;
    }

    var teLangzaam = kcal > 0;

    /* Eén week weegschaal is zomaar een halve kilo vocht. Een caloriedoel
       verzetten op die ene meting is precies hoe je gaat jojoën: de week erna
       staat de schaal weer anders en verzet je het terug. Dus eerst kijken of
       dezelfde afwijking er twee weken op rij staat. */
    if (!gewicht.bevestigd) {
      uit.status = 'afwachten';
      uit.bijstellen = 0;
      uit.kop = 'Eén week — nog even aankijken';
      uit.tekst = 'Je at gemiddeld ' + gemTekst + ' en je gewicht ging ' +
        beweging(gewicht) + ', ' + (teLangzaam ? 'minder' : 'meer') + ' dan je ' +
        (richting === 'behouden' ? 'marge' : 'tempo') + '. ' +
        (gewicht.vorigeStatus
          ? 'Maar de week ervóór deed je gewicht iets anders, dus dit kan schommeling zijn.'
          : 'Er is nog geen week ervóór om dit naast te leggen.') +
        (doel > 0
          ? ' Je doel van ' + doelTekst + ' blijft daarom staan. Zegt volgende week hetzelfde, ' +
            'dan wordt het advies ongeveer ' + afgerond(doel + kcal, 10) + ' kcal per dag.'
          : ' Er verandert daarom nog niets aan je eten.');
      return uit;
    }

    uit.status = teLangzaam ? 'te-weinig-gegeten' : 'te-veel-gegeten';

    if (teLangzaam) {
      uit.kop = richting === 'aankomen'
        ? 'Je komt te langzaam aan'
        : 'Je valt langzamer af dan je wilde';
      if (onderDoel) {
        uit.tekst = 'Je at gemiddeld ' + gemTekst + ', onder je doel van ' + doelTekst +
          ', en je gewicht ging ' + beweging(gewicht) + '. Dat past bij elkaar: er ging te ' +
          'weinig in. Haal eerst je eigen doel — dat scheelt al ongeveer ' +
          Math.round(doel - kcalGem) + ' kcal per dag.';
      } else {
        uit.nieuwDoel = voorstel;
        uit.tekst = 'Je haalde je doel van ' + doelTekst + ' wél (gemiddeld ' + gemTekst +
          '), maar je gewicht ging ' + beweging(gewicht) + '. Dan is je doel zelf te laag ' +
          'voor wat je verbruikt. Zet het op ongeveer ' + uit.nieuwDoel + ' kcal en kijk over ' +
          'twee weken opnieuw.';
      }
    } else {
      uit.kop = richting === 'aankomen'
        ? 'Je komt sneller aan dan je tempo'
        : 'Je valt sneller af dan je tempo';
      if (bovenDoel) {
        uit.tekst = 'Je at gemiddeld ' + gemTekst + ', boven je doel van ' + doelTekst +
          ', en je gewicht ging ' + beweging(gewicht) + '. ' +
          (richting === 'aankomen'
            ? 'Sneller aankomen is vooral vet, geen extra spier. '
            : 'Te snel afvallen kost spiermassa. ') +
          'Terug naar je doel is waarschijnlijk genoeg.';
      } else {
        uit.nieuwDoel = voorstel;
        uit.tekst = 'Je zat met ' + gemTekst + ' rond je doel van ' + doelTekst +
          ', maar je gewicht ging ' + beweging(gewicht) + '. Dan is je doel te hoog ' +
          'voor wat je verbruikt: ongeveer ' + uit.nieuwDoel + ' kcal past beter bij je tempo.';
      }
    }
    return uit;
  }

  /** Haalde je je caloriedoel? Zelfde regel als de app op de dag gebruikt. */
  function doelGehaald(kcal, s) {
    var doel = S.num(s.calorieDoel, 0);
    if (!doel) return true;
    if (s.calorieRichting === 'min') return kcal >= doel;
    if (s.calorieRichting === 'rond') return Math.abs(kcal - doel) <= S.num(s.calorieMarge, 0);
    return kcal <= doel;
  }

  function kgTekst(n) {
    var v = Math.round(n * 100) / 100;
    return (v > 0 ? '+' : (v < 0 ? '−' : '')) + Math.abs(v).toFixed(2).replace('.', ',') + ' kg';
  }

  /* Onder deze verhouding gaat een vast eiwitdoel knellen: bij spieropbouw
     wordt 1,6 tot 2,2 gram eiwit per kilo lichaamsgewicht aangehouden. */
  var EIWIT_MIN_PER_KG = 1.6;

  function getal(n, dec) {
    return n.toFixed(dec).replace('.', ',');
  }

  /** "doel 165 g", en als het meebeweegt met je gewicht ook waar dat vandaan komt. */
  function doelTekst(info) {
    var t = 'doel ' + Math.round(info.doel) + ' g';
    if (!info.afgeleid) return t;
    return t + ' (' + getal(info.perKg, 1) + ' g per kilo bij ' + getal(info.gewicht, 1) + ' kg)';
  }

  /**
   * Een vast eiwitdoel zakt vanzelf weg terwijl je aankomt: het getal blijft
   * staan, jij wordt zwaarder, en de verhouding wordt stilletjes te laag.
   * Daar zegt de afsluiting dan één keer per week iets van.
   */
  function eiwitAchterstand(info) {
    if (info.afgeleid || !info.gewicht || info.gewicht <= 0 || !info.vast) return '';
    var perKg = info.vast / info.gewicht;
    if (perKg >= EIWIT_MIN_PER_KG) return '';
    return ' Let op je doel zelf: ' + Math.round(info.vast) + ' g bij ' + getal(info.gewicht, 1) +
      ' kg is ' + getal(perKg, 2) + ' g per kilo, en voor spieropbouw wordt 1,6 tot 2,2 ' +
      'aangehouden. Zet je doel bij Instellingen op "per kilo lichaamsgewicht", dan blijft die ' +
      'verhouding staan ook als je zwaarder wordt.';
  }

  function eiwitAdvies(gem, dagen, geweest, s, datum) {
    var info = S.eiwitDoel(datum, s);
    var doel = info.doel;
    var extra = eiwitAchterstand(info);
    if (!dagen) {
      return { status: 'onbekend', tekst: 'Je vulde deze week geen eiwitten in.' + extra };
    }
    if (dagen < 3) {
      return {
        status: 'onbekend',
        tekst: 'Eiwitten maar ' + dagen + ' van de ' + geweest + ' dagen ingevuld — te weinig om ' +
          'iets over te zeggen.' + extra
      };
    }
    if (doel > 0 && gem < doel * 0.9) {
      return {
        status: 'onder',
        tekst: 'Gemiddeld ' + Math.round(gem) + ' g eiwit tegen een ' + doelTekst(info) +
          '. Dat is ' + Math.round(doel - gem) + ' g per dag te weinig — juist bij spieropbouw ' +
          'is dat het cijfer dat telt.' + extra
      };
    }
    return {
      status: 'goed',
      tekst: 'Gemiddeld ' + Math.round(gem) + ' g eiwit per dag, ' + doelTekst(info) + '. Prima.' + extra
    };
  }

  /**
   * Alles van één week op een rij. `datum` mag elke dag in die week zijn.
   */
  function maak(datum) {
    var s = store.settings();
    var vandaag = D.today();
    var reeks = dagen(datum);
    var geweest = reeks.filter(function (d) { return d <= vandaag; });
    var period = S.scorePeriod(reeks);
    var st = period.stats;

    /* Gewicht, in twee lagen.

       Het oordeel komt van de lijn door je wegingen van drie weken, precies
       zoals op de dagkaart en op dezelfde peildatum: de zondag van deze week,
       of vandaag als die nog niet voorbij is. Zo staan op zaterdag de dagkaart
       en de afsluiting onder elkaar met hetzelfde oordeel en hetzelfde getal.
       Eerder vergeleek de afsluiting alleen werkweek met werkweek, en dan kon
       een vlakke week in een stijgende lijn "je komt niet aan" opleveren terwijl
       de dagkaart "te snel" zei.

       Zonder genoeg wegingen voor die lijn valt het terug op de werkweek tegen
       dezelfde dagen een week eerder — en die week nog eens tegen de week
       dáárvoor. Eén week weegschaal zegt te weinig om je eten op bij te
       stellen; pas als beide vergelijkingen hetzelfde zeggen is het een trend.
       De werkweekgemiddelden staan er in beide gevallen bij, als informatie. */
    var peildatum = D.addDays(D.startOfWeek(datum), 6);
    if (peildatum > vandaag) peildatum = vandaag;
    var gm = S.gewichtMelding(peildatum);

    /* Alleen de dagen die al geweest zijn, en een week eerder diezelfde dagen.
       Kijk je op dinsdag, dan stond je deze week twee keer op de weegschaal en
       vorige week zeven keer; die twee tegen dat weekgemiddelde afzetten meet
       het verschil tussen dinsdag en het weekend, niet je voortgang. */
    var meet = geweest.length ? geweest : reeks;
    var nu = S.weightAvg(meet);
    var vorig = S.weightAvg(meet.map(function (d) { return D.addDays(d, -7); }));
    var eerder = S.weightAvg(meet.map(function (d) { return D.addDays(d, -14); }));
    var tempo = Math.abs(S.num(s.gewichtTempo, 0.25));
    var richting = s.gewichtRichting || 'uit';
    var gewicht = {
      richting: richting,
      avg: nu.avg, metingen: nu.count,
      vorigeAvg: vorig.avg, vorigeMetingen: vorig.count,
      eerdereAvg: eerder.avg, eerdereMetingen: eerder.count,
      delta: null, doelDelta: tempo, status: 'te-weinig', tekst: '',
      bevestigd: false, vorigeStatus: null, vorigeDelta: null,
      // Waar het oordeel op rust: de trend per week, of het werkweekverschil.
      perWeek: null, uitTrend: false, trendDagen: gm.trendDagen,
      trendVenster: gm.trendVenster, advies: null, peildatum: peildatum,
      rust: gm.advies && gm.advies.rust ? gm.advies : null
    };
    if (richting !== 'uit' && gm.uitTrend) {
      gewicht.uitTrend = true;
      gewicht.perWeek = gm.trendPerWeek;
      gewicht.status = gm.status;
      gewicht.pct = gm.pct;
      gewicht.bevestigd = true;
      gewicht.advies = gm.advies;
      if (nu.avg !== null && vorig.avg !== null) gewicht.delta = nu.avg - vorig.avg;
    } else if (richting !== 'uit' && nu.avg !== null && vorig.avg !== null) {
      gewicht.delta = nu.avg - vorig.avg;
      var oordeel = S.gewichtStatus(gewicht.delta, richting, tempo);
      gewicht.status = oordeel.status;
      gewicht.pct = oordeel.pct;
      if (eerder.avg !== null) {
        gewicht.vorigeDelta = vorig.avg - eerder.avg;
        gewicht.vorigeStatus = S.gewichtStatus(gewicht.vorigeDelta, richting, tempo).status;
      }
      gewicht.bevestigd = gewicht.vorigeStatus === oordeel.status;
      gewicht.perWeek = gewicht.delta;
      gewicht.tekst = kgTekst(gewicht.delta) + ' tegenover vorige week (' +
        nu.count + ' en ' + vorig.count + ' weegmomenten).';
    }

    /* Beste en zwakste doel: alleen doelen die deze week echt meetelden. */
    var meetellend = period.breakdown.filter(function (b) {
      return b.pct !== null && S.weightOf(b.goal, s) > 0 && b.days > 0;
    });
    var gesorteerd = meetellend.slice().sort(function (a, b) { return b.pct - a.pct; });

    return {
      weekStart: reeks[0],
      dagen: reeks,
      geweest: geweest.length,
      label: 'week ' + D.isoWeek(reeks[0]),
      periode: D.formatShort(reeks[0]) + ' – ' + D.formatShort(reeks[reeks.length - 1]),
      peildatum: peildatum,
      period: period,
      pct: period.pct,
      ingevuld: period.logged,
      goedeDagen: st.goodDays,
      trainDagen: st.trainDays,
      rustDagen: st.restDays,
      beste: gesorteerd.length ? gesorteerd[0] : null,
      zwakste: gesorteerd.length > 1 ? gesorteerd[gesorteerd.length - 1] : null,
      gewicht: gewicht,
      eten: eetAdvies(gewicht, st.kcalAvg, st.kcalDays, geweest.length, s),
      eiwit: eiwitAdvies(st.proteinAvg, st.proteinDays, geweest.length, s, reeks[reeks.length - 1]),
      kcalDagen: st.kcalDays,
      kcalGem: st.kcalAvg,
      eiwitDagen: st.proteinDays,
      eiwitGem: st.proteinAvg
    };
  }

  /* ------------------------------ maand ------------------------------ */

  /* De maandafsluiting staat de eerste drie dagen van een nieuwe maand op je
     dagpagina, en daarna altijd bovenaan het maandoverzicht. Op de eerste is
     de voeding van de laatste dag 's nachts al binnengekomen. */
  var MAAND_DAGEN = 3;

  /* Zo lang terug kijkt "vóór je aanpassing": vier weken, genoeg voor een lijn
     en kort genoeg om niet een doel van twee aanpassingen terug mee te nemen. */
  var VOOR_DAGEN = 28;

  function maandSleutel(datum) { return datum.slice(0, 7); }

  /** Staat de afsluiting van vorige maand nu op de dagpagina? */
  function maandVensterOpen(datum) {
    return +(datum || D.today()).slice(8, 10) <= MAAND_DAGEN;
  }

  /** `datum` is een dag in de maand waar de afsluiting over gaat. */
  function maandGezien(datum) {
    return store.settings().maandafsluitingGezien === maandSleutel(datum);
  }

  function markeerMaandGezien(datum) {
    store.setSetting('maandafsluitingGezien', maandSleutel(datum));
  }

  function maandNaam(datum) { return D.monthName(datum); }

  function kortMaand(datum) { return D.monthName(datum).slice(0, 3); }

  /** Haalde je het caloriedoel van díé dag? Zelfde regel als de dagscore. */
  function kcalGehaald(kcal, doel, s) {
    if (!doel) return true;
    if (s.calorieRichting === 'min') return kcal >= doel;
    if (s.calorieRichting === 'rond') return Math.abs(kcal - doel) <= S.num(s.calorieMarge, 0);
    return kcal <= doel;
  }

  /**
   * Gewicht en eten tussen twee datums (allebei inclusief).
   * -> { dagen, wegingen, perWeek, kcalGem, kcalDagen }
   *
   * Een lijn door alle wegingen, niet begin min eind: dan bepaalt niet één
   * ochtend met een volle darm de hele maand. Pas vanaf een week en vijf
   * wegingen, net als na een nieuw caloriedoel. Eten telt alleen voor dagen die
   * voorbij zijn, en met `zonderEerste` niet voor de eerste dag: de dag van een
   * aanpassing is half oud, half nieuw.
   */
  function stuk(van, tot, zonderEerste) {
    var vandaag = D.today();
    if (tot > vandaag) tot = vandaag;
    var punten = [], kcalSom = 0, kcalDagen = 0;
    if (van > tot) return { dagen: 0, wegingen: 0, perWeek: null, kcalGem: null, kcalDagen: 0 };
    D.range(van, tot).forEach(function (d, i) {
      var e = store.entry(d);
      if (!e) return;
      var kg = S.num(e.gewicht);
      if (kg !== null) punten.push({ x: i, y: kg, w: 1 });
      var k = S.num(e.kcal);
      if (k !== null && d < vandaag && !(zonderEerste && d === van)) { kcalSom += k; kcalDagen++; }
    });
    var dagen = D.dagenTussen(van, tot);
    var h = dagen >= S.SINDS_MIN_DAGEN && punten.length >= S.SINDS_MIN_WEEG
      ? S.trendHelling(punten) : null;
    return {
      dagen: dagen, wegingen: punten.length, perWeek: h === null ? null : h * 7,
      kcalGem: kcalDagen ? kcalSom / kcalDagen : null, kcalDagen: kcalDagen
    };
  }

  /**
   * Nieuwe records en sterker geworden oefeningen in een maand.
   * -> { records: [{naam, kg, reps, datum}], vooruit, vergeleken, sterker: [naam] }
   *
   * Een record is een set die alles daarvoor verslaat: zwaarder dan ooit, of
   * even zwaar met meer herhalingen. Je eerste sessie ooit is geen record, daar
   * valt niets aan te verslaan. Per oefening alleen het beste van de maand,
   * en de lijst begint bij de grootste stap: `winst` is hoeveel zwaarder (of
   * bij je eigen lichaamsgewicht: hoeveel meer herhalingen) dan je oude record.
   *
   * "Sterker" gaat op je geschatte 1RM: je laatste sessie van de maand tegen
   * je laatste sessie daarvoor (of je eerste van de maand, als je de oefening
   * net begon).
   */
  function maandKracht(start, eind) {
    var L = GD.lifts;
    var records = [], sterker = [], vergeleken = 0;
    if (!L) return { records: records, vooruit: 0, vergeleken: 0, sterker: sterker };
    L.oefeningen().forEach(function (oef) {
      L.zijden(oef).forEach(function (z) {
        var h = L.historie(oef.id, z.key);
        var maxKg = null, maxReps = 0, beste = null, winst = 0, basis = null, laatste = null;
        h.forEach(function (r) {
          if (r.datum > eind) return;
          if (r.datum >= start) {
            var beter = maxKg !== null && (r.kg > maxKg || (r.kg === maxKg && r.reps > maxReps));
            if (beter) {
              beste = r;
              winst = r.kg > maxKg
                ? (maxKg > 0 ? (r.kg - maxKg) / maxKg : 1)
                : (maxReps > 0 ? (r.reps - maxReps) / maxReps : 1);
            }
            if (!basis) basis = r;
            laatste = r;
          } else {
            basis = r;
          }
          if (maxKg === null || r.kg > maxKg) { maxKg = r.kg; maxReps = r.reps; }
          else if (r.kg === maxKg && r.reps > maxReps) maxReps = r.reps;
        });
        var naam = oef.naam + (z.kort ? ' (' + z.kort + ')' : '');
        if (beste) {
          records.push({
            naam: naam,
            kg: beste.kg, reps: beste.reps, datum: beste.datum, winst: winst
          });
        }
        if (laatste && basis && basis !== laatste) {
          vergeleken++;
          if (L.geschat1RM(laatste.kg, laatste.reps) > L.geschat1RM(basis.kg, basis.reps)) sterker.push(naam);
        }
      });
    });
    records.sort(function (a, b) { return b.winst - a.winst; });
    return { records: records, vooruit: sterker.length, vergeleken: vergeleken, sterker: sterker };
  }

  /**
   * De cijfers van één maand. `datum` mag elke dag in die maand zijn.
   * Loopt de maand nog, dan tellen alleen de dagen tot en met vandaag, en
   * voor je eten alleen de dagen die voorbij zijn.
   */
  function maandKern(datum) {
    var s = store.settings();
    var vandaag = D.today();
    var start = D.startOfMonth(datum);
    var eind = D.endOfMonth(datum);
    var reeks = D.range(start, eind);
    var geweest = reeks.filter(function (d) { return d <= vandaag; });
    var period = S.scorePeriod(reeks);
    var st = period.stats;

    var kcal = { som: 0, dagen: 0, gehaald: 0 };
    var eiwit = { som: 0, dagen: 0, gehaald: 0 };
    var water = { som: 0, dagen: 0, gehaald: 0 };
    var waterDoel = S.num(s.waterDoel, 0);
    geweest.forEach(function (d) {
      if (d >= vandaag) return;
      var e = store.entry(d);
      if (!e) return;
      var k = S.num(e.kcal);
      if (k !== null) {
        kcal.som += k; kcal.dagen++;
        if (kcalGehaald(k, S.calorieDoelOp(d, s), s)) kcal.gehaald++;
      }
      var p = S.num(e.eiwitGram);
      if (p !== null) {
        eiwit.som += p; eiwit.dagen++;
        if (p >= S.eiwitDoel(d, s).doel) eiwit.gehaald++;
      }
      var w = S.num(e.waterMl);
      if (w !== null) {
        water.som += w; water.dagen++;
        if (w >= waterDoel) water.gehaald++;
      }
    });

    // Begin en eind van de maand als gemiddelde van een week: één weging
    // schommelt makkelijk een halve kilo door vocht.
    var beginW = S.weightAvg(geweest.slice(0, 7));
    var eindW = S.weightAvg(geweest.slice(-7));
    var lijn = stuk(start, eind);
    var n = geweest.length;

    return {
      start: start, eind: eind, dagen: reeks.length, geweest: n,
      loopt: eind >= vandaag,
      pct: period.pct, ingevuld: period.logged, goedeDagen: st.goodDays,
      breakdown: period.breakdown,
      trainDagen: st.trainDays, trainPerWeek: n ? st.trainDays / n * 7 : null,
      kcalGem: kcal.dagen ? kcal.som / kcal.dagen : null, kcalDagen: kcal.dagen,
      kcalGehaald: kcal.gehaald,
      eiwitGem: eiwit.dagen ? eiwit.som / eiwit.dagen : null, eiwitDagen: eiwit.dagen,
      eiwitGehaald: eiwit.gehaald,
      waterGem: water.dagen ? water.som / water.dagen : null, waterDagen: water.dagen,
      waterGehaald: water.gehaald,
      wegingen: st.weights.length,
      laatsteGewicht: st.weightEnd,
      beginAvg: beginW.avg, eindAvg: eindW.avg,
      // Pas na twee weken: anders overlappen begin- en eindweek.
      verschil: n >= 14 && beginW.avg !== null && eindW.avg !== null ? eindW.avg - beginW.avg : null,
      perWeek: lijn.perWeek
    };
  }

  var VELDEN = {
    calorieDoel: { naam: 'caloriedoel', eenheid: ' kcal' },
    calorieRichting: {
      naam: 'soort caloriedoel',
      woorden: { max: 'maximum', min: 'minimum', rond: 'rond je doel' }
    },
    eiwitDoel: { naam: 'eiwitdoel', eenheid: ' g' },
    eiwitBasis: {
      naam: 'eiwitdoel',
      woorden: { vast: 'een vast getal', gewicht: 'per kilo lichaamsgewicht' }
    },
    eiwitPerKg: { naam: 'eiwit per kilo', eenheid: ' g' },
    waterDoel: { naam: 'waterdoel', eenheid: ' ml' },
    gewichtDoel: { naam: 'streefgewicht', eenheid: ' kg' },
    gewichtRichting: {
      naam: 'gewichtsdoel',
      woorden: { aankomen: 'aankomen', afvallen: 'afvallen', behouden: 'op gewicht blijven', uit: 'uit' }
    },
    gewichtTempo: { naam: 'tempo', eenheid: ' kg per week' }
  };

  function waardeTekst(veld, v) {
    var info = VELDEN[veld];
    if (v === null || v === undefined || v === '') return 'leeg';
    if (info.woorden) return info.woorden[v] || String(v);
    var n = S.num(v);
    if (n === null) return String(v);
    return String(Math.round(n * 100) / 100).replace('.', ',') + info.eenheid;
  }

  /**
   * Wat je in deze maand aan je doelen veranderde, oudste eerst.
   * -> [{ datum, veld, van, naar, tekst }]
   */
  function maandWijzigingen(start, eind) {
    var s = store.settings();
    var uit = [];
    Object.keys(VELDEN).forEach(function (veld) {
      S.doelGeschiedenis(veld, s).forEach(function (r) {
        if (r.datum < start || r.datum > eind) return;
        var info = VELDEN[veld];
        uit.push({
          datum: r.datum, veld: veld, van: r.van, naar: r.naar,
          tekst: D.formatShort(r.datum) + ': ' + info.naam + ' van ' + waardeTekst(veld, r.van) +
            ' naar ' + waardeTekst(veld, r.naar)
        });
      });
    });
    return uit.sort(function (a, b) { return a.datum < b.datum ? -1 : (a.datum > b.datum ? 1 : 0); });
  }

  /**
   * Je laatste aanpassing van je caloriedoel die bij deze maand hoort: in deze
   * maand zelf, of in de maand ervoor — dan zie je nu pas wat hij deed.
   * -> null, of { datum, van, naar, inMaand, voor, na }
   */
  function maandCalorieWissel(start, eind) {
    var lijst = S.doelGeschiedenis('calorieDoel', store.settings()).filter(function (r) {
      return r.datum <= eind && r.datum >= D.addMonths(start, -1);
    });
    if (!lijst.length) return null;
    var w = lijst[lijst.length - 1];
    return {
      datum: w.datum, van: w.van, naar: w.naar, inMaand: w.datum >= start,
      voor: stuk(D.addDays(w.datum, -VOOR_DAGEN), D.addDays(w.datum, -1)),
      na: stuk(w.datum, eind, true),
      // Na deze datum zegt de lijn sinds de aanpassing iets.
      vanaf: D.addDays(w.datum, S.SINDS_MIN_DAGEN)
    };
  }

  /**
   * De maandafsluiting: alles van één maand, naast de maand ervoor.
   * `datum` mag elke dag in die maand zijn.
   */
  function maakMaand(datum) {
    var s = store.settings();
    var nu = maandKern(datum);
    var vorigeDatum = D.addMonths(D.startOfMonth(datum), -1);
    var vorig = maandKern(vorigeDatum);
    var richting = s.gewichtRichting || 'uit';
    var tempo = Math.abs(S.num(s.gewichtTempo, 0.25));

    var meetellend = nu.breakdown.filter(function (b) {
      return b.pct !== null && S.weightOf(b.goal, s) > 0 && b.days > 0;
    });
    var gesorteerd = meetellend.slice().sort(function (a, b) { return b.pct - a.pct; });
    function vorigePct(key) {
      var b = vorig.breakdown.filter(function (x) { return x.key === key; })[0];
      return b && b.pct !== null && b.days > 0 ? b.pct : null;
    }

    return {
      sleutel: maandSleutel(nu.start),
      naam: maandNaam(nu.start),
      label: maandNaam(nu.start) + ' ' + nu.start.slice(0, 4),
      periode: D.formatShort(nu.start) + ' – ' + D.formatShort(nu.eind),
      vorigeNaam: maandNaam(vorig.start),
      vorigeKort: kortMaand(vorig.start),
      nu: nu,
      vorig: vorig.ingevuld ? vorig : null,
      richting: richting,
      tempo: tempo,
      gewichtStatus: richting !== 'uit' && nu.perWeek !== null
        ? S.gewichtStatus(nu.perWeek, richting, tempo).status : null,
      wijzigingen: maandWijzigingen(nu.start, nu.eind),
      calorieWissel: maandCalorieWissel(nu.start, nu.eind),
      kracht: maandKracht(nu.start, nu.eind),
      beste: gesorteerd.length ? gesorteerd[0] : null,
      zwakste: gesorteerd.length > 1 ? gesorteerd[gesorteerd.length - 1] : null,
      vorigePct: vorigePct
    };
  }

  /* ------------------------- gewicht over een periode ------------------------- */

  /* Begin en eind zijn het gemiddelde van je eerste en laatste week aan
     wegingen, zodra er twee weken tussen zitten. Eén ochtend na een zoute
     maaltijd verschuift dan niet je hele periode. Korter dan dat, dan de eerste
     en de laatste weging zelf. */
  var GEMIDDELD_VANAF = 14;
  var WEEK = 7;

  /**
   * Je gewicht van `van` tot en met `tot`, allebei "YYYY-MM-DD".
   * -> { van, tot, eind, dagen, punten: [{date, w}], wegingen, begin, eindGewicht,
   *      gemiddeld, verschil, perWeek, lijn, laagste, hoogste, kcalGem, kcalDagen,
   *      calorieWissels: [{datum, van, naar}], wijzigingen }
   *
   * `eind` is `tot`, maar nooit later dan vandaag. Liggen de datums verkeerd
   * om, dan draait de functie ze om.
   */
  function maakGewicht(van, tot) {
    if (van > tot) { var t = van; van = tot; tot = t; }
    var vandaag = D.today();
    var eind = tot > vandaag ? vandaag : tot;
    var uit = {
      van: van, tot: tot, eind: eind, dagen: van > eind ? 0 : D.dagenTussen(van, eind) + 1,
      punten: [], wegingen: 0, begin: null, eindGewicht: null, gemiddeld: null,
      verschil: null, perWeek: null, lijn: null, weekGemiddeld: false, laagste: null, hoogste: null,
      kcalGem: null, kcalDagen: 0, calorieWissels: [], wijzigingen: []
    };
    if (van > eind) return uit;

    var regressie = [], kcalSom = 0;
    D.range(van, eind).forEach(function (d, i) {
      var e = store.entry(d);
      if (!e) return;
      var kg = S.num(e.gewicht);
      if (kg !== null) {
        uit.punten.push({ date: d, w: kg });
        regressie.push({ x: i, y: kg, w: 1 });
      }
      var k = S.num(e.kcal);
      if (k !== null && d < vandaag) { kcalSom += k; uit.kcalDagen++; }
    });
    if (uit.kcalDagen) uit.kcalGem = kcalSom / uit.kcalDagen;

    uit.calorieWissels = S.doelGeschiedenis('calorieDoel', store.settings()).filter(function (r) {
      return r.datum >= van && r.datum <= eind;
    });
    uit.wijzigingen = maandWijzigingen(van, eind);

    var p = uit.punten;
    uit.wegingen = p.length;
    if (!p.length) return uit;

    function gem(lijst) {
      return lijst.reduce(function (a, q) { return a + q.w; }, 0) / lijst.length;
    }
    var eerste = p[0].date, laatste = p[p.length - 1].date;
    uit.gemiddeld = gem(p);
    uit.weekGemiddeld = D.dagenTussen(eerste, laatste) >= GEMIDDELD_VANAF - 1;
    if (uit.weekGemiddeld) {
      var beginTot = D.addDays(eerste, WEEK - 1), eindVanaf = D.addDays(laatste, -(WEEK - 1));
      uit.begin = gem(p.filter(function (q) { return q.date <= beginTot; }));
      uit.eindGewicht = gem(p.filter(function (q) { return q.date >= eindVanaf; }));
    } else {
      uit.begin = p[0].w;
      uit.eindGewicht = p[p.length - 1].w;
    }
    if (p.length > 1) uit.verschil = uit.eindGewicht - uit.begin;

    p.forEach(function (q) {
      if (!uit.laagste || q.w < uit.laagste.w) uit.laagste = q;
      if (!uit.hoogste || q.w > uit.hoogste.w) uit.hoogste = q;
    });

    // Dezelfde drempel als na een nieuw caloriedoel: minder dan een week of
    // vijf wegingen geeft een lijn die vooral ruis volgt.
    if (D.dagenTussen(eerste, laatste) >= S.SINDS_MIN_DAGEN && p.length >= S.SINDS_MIN_WEEG) {
      var h = S.trendHelling(regressie);
      if (h !== null) {
        uit.perWeek = h * 7;
        // De lijn zelf, van je eerste tot je laatste weging, voor in de grafiek.
        var mx = regressie.reduce(function (a, q) { return a + q.x; }, 0) / regressie.length;
        var y0 = uit.gemiddeld - h * mx;
        var x0 = regressie[0].x, x1 = regressie[regressie.length - 1].x;
        uit.lijn = [{ date: eerste, w: y0 + h * x0 }, { date: laatste, w: y0 + h * x1 }];
      }
    }
    return uit;
  }

  GD.review = {
    maakGewicht: maakGewicht,
    maandSleutel: maandSleutel,
    maandVensterOpen: maandVensterOpen,
    maandGezien: maandGezien,
    markeerMaandGezien: markeerMaandGezien,
    maakMaand: maakMaand,
    dagen: dagen,
    weekSleutel: weekSleutel,
    vensterOpen: vensterOpen,
    gezien: gezien,
    markeerGezien: markeerGezien,
    bijstelling: bijstelling,
    kgTekst: kgTekst,
    rustTekst: rustTekst,
    maak: maak,
    KCAL_PER_KG: KCAL_PER_KG
  };
})(window);
