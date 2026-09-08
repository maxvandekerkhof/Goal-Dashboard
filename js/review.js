/* Goal Dashboard - weekafsluiting: wat ging er goed, en klopt je eten met je gewicht? */
(function (global) {
  'use strict';

  var GD = global.GD;
  var store = GD.store;
  var D = GD.date;
  var S = GD.score;

  /* Eén kilo lichaamsgewicht komt ruwweg overeen met 7700 kcal. Een vuistregel,
     geen natuurwet: hij is goed genoeg om te zien of je bij moet sturen, niet
     om op de kilo nauwkeurig te rekenen. */
  var KCAL_PER_KG = 7700;

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
   * Positief = meer eten, negatief = minder. Ruim afgerond, en begrensd:
   * een sprong van meer dan 500 kcal per dag is nooit een verstandig advies
   * op basis van één week meten.
   */
  function bijstelling(delta, richting, tempo) {
    var doelDelta = richting === 'aankomen' ? tempo : (richting === 'afvallen' ? -tempo : 0);
    var gat = doelDelta - delta;
    var kcal = afgerond((gat * KCAL_PER_KG) / 7, 50);
    return GD.clamp(kcal, -500, 500);
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
        (gewicht.delta === null ? '' : ' Je gewicht deed deze week ' + kgTekst(gewicht.delta) + '.');
      return uit;
    }

    if (gewicht.delta === null) {
      uit.status = 'te-weinig-gewicht';
      uit.kop = 'Te weinig weegmomenten';
      uit.tekst = 'Je at gemiddeld ' + Math.round(kcalGem) + ' kcal, maar zonder gewicht van deze ' +
        'én vorige week kan ik niet zeggen of dat te veel of te weinig was. Weeg jezelf een paar ' +
        'ochtenden per week, steeds op hetzelfde moment.';
      return uit;
    }

    var tempo = Math.abs(S.num(s.gewichtTempo, 0.25));
    var kcal = bijstelling(gewicht.delta, richting, tempo);
    uit.bijstellen = kcal;

    var marge = Math.max(100, doel * 0.05);
    var onderDoel = doel > 0 && kcalGem < doel - marge;
    var bovenDoel = doel > 0 && kcalGem > doel + marge;
    var gemTekst = Math.round(kcalGem) + ' kcal per dag';
    var doelTekst = Math.round(doel) + ' kcal';

    if (gewicht.status === 'op-schema') {
      uit.status = 'op-schema';
      uit.kop = 'Eten en gewicht kloppen met elkaar';
      uit.tekst = 'Je zat op ' + gemTekst + ' en je gewicht ging ' + kgTekst(gewicht.delta) +
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
      uit.tekst = 'Je at gemiddeld ' + gemTekst + ' en je gewicht deed ' +
        kgTekst(gewicht.delta) + ', ' + (teLangzaam ? 'minder' : 'meer') + ' dan je ' +
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
          ', en je gewicht deed ' + kgTekst(gewicht.delta) + '. Dat past bij elkaar: er ging te ' +
          'weinig in. Haal eerst je eigen doel — dat scheelt al ongeveer ' +
          Math.round(doel - kcalGem) + ' kcal per dag.';
      } else {
        uit.nieuwDoel = afgerond(doel + kcal, 10);
        uit.tekst = 'Je haalde je doel van ' + doelTekst + ' wél (gemiddeld ' + gemTekst +
          '), maar je gewicht deed ' + kgTekst(gewicht.delta) + '. Dan is je doel zelf te laag ' +
          'voor wat je verbruikt. Zet het op ongeveer ' + uit.nieuwDoel + ' kcal en kijk over ' +
          'twee weken opnieuw.';
      }
    } else {
      uit.kop = richting === 'aankomen'
        ? 'Je komt sneller aan dan je tempo'
        : 'Je valt sneller af dan je tempo';
      if (bovenDoel) {
        uit.tekst = 'Je at gemiddeld ' + gemTekst + ', boven je doel van ' + doelTekst +
          ', en je gewicht deed ' + kgTekst(gewicht.delta) + '. ' +
          (richting === 'aankomen'
            ? 'Sneller aankomen is vooral vet, geen extra spier. '
            : 'Te snel afvallen kost spiermassa. ') +
          'Terug naar je doel is waarschijnlijk genoeg.';
      } else {
        uit.nieuwDoel = afgerond(doel + kcal, 10);
        uit.tekst = 'Je zat met ' + gemTekst + ' rond je doel van ' + doelTekst +
          ', maar je gewicht deed ' + kgTekst(gewicht.delta) + '. Dan is je doel te hoog ' +
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

  function eiwitAdvies(gem, dagen, geweest, s) {
    var doel = S.num(s.eiwitDoel, 0);
    if (!dagen) {
      return { status: 'onbekend', tekst: 'Je vulde deze week geen eiwitten in.' };
    }
    if (dagen < 3) {
      return {
        status: 'onbekend',
        tekst: 'Eiwitten maar ' + dagen + ' van de ' + geweest + ' dagen ingevuld — te weinig om ' +
          'iets over te zeggen.'
      };
    }
    if (doel > 0 && gem < doel * 0.9) {
      return {
        status: 'onder',
        tekst: 'Gemiddeld ' + Math.round(gem) + ' g eiwit tegen een doel van ' + Math.round(doel) +
          ' g. Dat is ' + Math.round(doel - gem) + ' g per dag te weinig — juist bij spieropbouw ' +
          'is dat het cijfer dat telt.'
      };
    }
    return {
      status: 'goed',
      tekst: 'Gemiddeld ' + Math.round(gem) + ' g eiwit per dag, doel ' + Math.round(doel) + ' g. Prima.'
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

    /* Gewicht: deze werkweek tegen dezelfde dagen een week eerder — en die week
       nog eens tegen de week dáárvoor. Eén week weegschaal zegt te weinig om je
       eten op bij te stellen; pas als beide vergelijkingen hetzelfde zeggen is
       het een trend. */
    var nu = S.weightAvg(reeks);
    var vorig = S.weightAvg(reeks.map(function (d) { return D.addDays(d, -7); }));
    var eerder = S.weightAvg(reeks.map(function (d) { return D.addDays(d, -14); }));
    var tempo = Math.abs(S.num(s.gewichtTempo, 0.25));
    var richting = s.gewichtRichting || 'uit';
    var gewicht = {
      richting: richting,
      avg: nu.avg, metingen: nu.count,
      vorigeAvg: vorig.avg, vorigeMetingen: vorig.count,
      eerdereAvg: eerder.avg, eerdereMetingen: eerder.count,
      delta: null, doelDelta: tempo, status: 'te-weinig', tekst: '',
      bevestigd: false, vorigeStatus: null, vorigeDelta: null
    };
    if (richting !== 'uit' && nu.avg !== null && vorig.avg !== null) {
      gewicht.delta = nu.avg - vorig.avg;
      var oordeel = S.gewichtStatus(gewicht.delta, richting, tempo);
      gewicht.status = oordeel.status;
      gewicht.pct = oordeel.pct;
      if (eerder.avg !== null) {
        gewicht.vorigeDelta = vorig.avg - eerder.avg;
        gewicht.vorigeStatus = S.gewichtStatus(gewicht.vorigeDelta, richting, tempo).status;
      }
      gewicht.bevestigd = gewicht.vorigeStatus === oordeel.status;
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
      eiwit: eiwitAdvies(st.proteinAvg, st.proteinDays, geweest.length, s),
      kcalDagen: st.kcalDays,
      kcalGem: st.kcalAvg,
      eiwitDagen: st.proteinDays,
      eiwitGem: st.proteinAvg
    };
  }

  GD.review = {
    dagen: dagen,
    weekSleutel: weekSleutel,
    vensterOpen: vensterOpen,
    gezien: gezien,
    markeerGezien: markeerGezien,
    bijstelling: bijstelling,
    kgTekst: kgTekst,
    maak: maak,
    KCAL_PER_KG: KCAL_PER_KG
  };
})(window);
