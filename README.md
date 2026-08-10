# Goal Dashboard

Een dashboard voor je sport- en voedingsdoelen, met per **dag**, **week** en **maand**
een percentage dat verkleurt van **donkerrood (0%)** naar **donkergroen (100%)**.

Geen installatie, geen account, geen server: het is één statische pagina en je data
staat in je eigen browser.

## Snel starten

**Lokaal:** open `index.html` in je browser. Klaar.

**Als één bestand:** `goal-dashboard-standalone.html` bevat het hele dashboard (stijl en
scripts inline) en werkt los van de rest van de map — handig om te bewaren of te mailen.
Opnieuw genereren na een wijziging: `python3 tools/build-standalone.py`.

**Op je telefoon (aanrader):** zet het online via GitHub Pages —
_Settings → Pages → Source: Deploy from a branch → branch `main`, map `/ (root)`_.
Daarna staat het op `https://<gebruikersnaam>.github.io/Goal-Dashboard/`, en kun je het
via "Zet op beginscherm" als app-icoon op je telefoon zetten.

## Wat je bijhoudt

| Doel | Opties | Standaardgewicht |
| --- | --- | --- |
| Gewicht | zelf invullen (kg) | eigen trendscore, zie onder |
| Creatine gepakt | Ja / Nee | ×1 |
| Ontbijt | Ja (eiwitrijk) / Ja / Nee | ×1 |
| Lunch | Ja (eiwitrijk) / Ja / Nee | ×1 |
| Avondeten | Ja (eiwitrijk) / Ja / Nee | ×1 |
| Post-workout maaltijd | Ja (eiwitrijk) / Ja / Nee | ×1 |
| Water | teller met +25 cl / +50 cl / +1 L | ×1 |
| Gesport | Ja / Nee / Rustdag | ×2 |
| Progressive overload | Ja / Deels / Nee | ×1,5 |
| Eiwitdoel behaald | Ja / Nee | ×2 |
| Caloriedoel behaald | Ja / Nee | ×1,5 |

Daarnaast kun je per dag je gewicht, eiwitten (g) en calorieën (kcal) invullen, plus een
korte notitie. Alle gewichten zijn aanpasbaar in **Instellingen**; op 0 telt een doel
helemaal niet mee.

## Hoe de score werkt

Je score is **behaalde punten ÷ haalbare punten**, uitgedrukt in procenten.

- _Ja (eiwitrijk)_ = 100% van de punten, _Ja_ = 60%, _Nee_ = 0%.
- Bij progressive overload telt _Deels_ voor de helft.
- **Rustdag** haalt "gesport" uit de berekening — een rustdag verpest je score dus niet.
- **Progressive overload** en de **post-workout maaltijd** tellen alleen mee op dagen dat
  je écht getraind hebt.
- Voor **vandaag** tellen alleen de doelen die je al hebt ingevuld, zodat je percentage
  meegroeit met de dag. Bij **afgelopen dagen** telt niet-ingevuld als niet gedaan.
- Lege dagen in het verleden tellen als 0% (uit te zetten in Instellingen). Dagen van
  vóór je allereerste invoer tellen nooit mee — toen gebruikte je het dashboard nog niet.
- **Gewicht** telt niet mee in je dagscore — het is een uitkomst, geen gedrag dat je op
  één dag kunt halen. Het krijgt een eigen percentage, zie hieronder.

## Waterteller

Op de dagweergave staat een aparte kaart met drie knoppen: **+25 cl**, **+50 cl** en
**+1 L**. Elke tik telt op bij je totaal van die dag, met een balk die verkleurt naar je
doel toe (standaard 3 liter, aan te passen in Instellingen). Vertikt: met **−25 cl** en
**−50 cl** corrigeer je een misklik, in het kleine veld typ je desnoods het exacte aantal
milliliters, en **Wissen** zet de dag terug op nul.

Water scoort naar rato: 2,25 van de 3 liter is 75%. Eén bijzonderheid: **zolang de dag
loopt telt de teller pas mee zodra je je doel haalt.** Anders zou je dagscore om negen uur
's ochtends kelderen door een doel waar je de hele dag nog aan werkt. Bij afgelopen dagen
telt gewoon het deel dat je haalde, dus je week- en maandcijfers blijven eerlijk.

*Neem gisteren over* kopieert je waterstand bewust niet — een teller begint elke dag op nul.

## Gewichtstrend

In de week- en maandweergave staat een aparte kaart die je **weekgemiddelde vergelijkt met
dat van de week ervoor** (in de maandweergave: maand tegen maand), met dezelfde kleurschaal
van donkerrood naar donkergroen.

Stel in **Instellingen → Gewichtsdoel** in wat je wilt:

| Richting | 100% (donkergroen) bij | 0% (donkerrood) bij |
| --- | --- | --- |
| Aankomen | toename ≥ je tempo | gelijk gebleven of gezakt |
| Afvallen | afname ≥ je tempo | gelijk gebleven of gestegen |
| Op gewicht blijven | verschil van 0 | verschil groter dan je marge |
| Niet bijhouden | kaart wordt verborgen | — |

Het **tempo** is hoeveel kg per week je wilt opschuiven; daartussenin loopt de score
evenredig (de helft van je tempo = 50%). Voor een rustige bulk is 0,25 tot 0,5 kg per week
gebruikelijk — kom je ruim sneller aan, dan blijft de score 100% maar krijg je een
opmerking dat dat meestal extra vetaanzet betekent.

Weeg bij voorkeur elke dag: het gemiddelde vangt dagschommelingen op die per losse meting
zomaar een kilo kunnen schelen. Bij minder dan drie metingen in een periode waarschuwt de
kaart dat de vergelijking gevoelig is voor toeval.

Week- en maandpercentages tellen punten over alle dagen bij elkaar op. Een week met veel
rustdagen wordt dus niet afgestraft, omdat op zo'n dag ook minder punten haalbaar waren.

## MyFitnessPal koppelen

MyFitnessPal heeft **geen open publieke API meer**, dus een live koppeling is niet
mogelijk. Wat wel werkt is hun CSV-export:

1. Open MyFitnessPal in de browser → **Reports** → **Nutrition**.
2. Kies je periode en klik op **Export**.
3. In het dashboard: **Instellingen → MyFitnessPal / CSV importeren → CSV-bestand kiezen**.

De kolommen voor datum, calorieën en eiwit worden automatisch herkend, meerdere
maaltijdregels per dag worden bij elkaar opgeteld, en je krijgt eerst een voorbeeld te
zien voordat er iets wordt weggeschreven. Standaard blijven handmatig ingevulde waarden
staan; vink _Bestaande waarden overschrijven_ aan als de export voorrang moet krijgen.

Elke andere CSV met een datum-, calorie- en eiwitkolom werkt net zo goed — handig als je
een andere app gebruikt.

Zodra kcal en eiwitten bekend zijn, worden "Eiwitdoel behaald" en "Caloriedoel behaald"
automatisch bepaald aan de hand van je doelen. Handmatig aanklikken heeft altijd voorrang.

## Je data

Alles staat in `localStorage` van de browser waarin je het gebruikt. Dat betekent:
niets gaat naar een server, maar het synchroniseert ook niet vanzelf tussen apparaten,
en het verdwijnt als je je browsergegevens wist.

Gebruik daarom **Instellingen → Je data**:

- **Back-up downloaden** — schrijft alles naar één JSON-bestand.
- **Back-up terugzetten** — samenvoegen met of vervangen van je huidige data. Zo zet je
  je geschiedenis ook op een tweede apparaat.

## Bediening

- Tabs bovenaan: **Dag**, **Week**, **Maand**, **Instellingen**.
- `‹` en `›` (of pijltjestoetsen) om een dag, week of maand op te schuiven; `T` springt
  terug naar vandaag.
- Klik in de week- of maandweergave op een dag om hem meteen in te vullen.
- **Neem gisteren over** kopieert de antwoorden van gisteren, handig op vaste dagen.
- Het icoon rechtsboven wisselt tussen donker en licht.

## Structuur

```
index.html          pagina en scriptvolgorde
css/style.css       stijl, donker en licht thema
js/config.js        doeldefinities, standaardinstellingen, kleurschaal 0 -> 100
js/store.js         opslag (localStorage), import/export, datum-helpers
js/score.js         scoreberekening per dag en per periode, streaks
js/charts.js        SVG-ring, balken, kalender en gewichtsgrafiek
js/mfp.js           CSV-parser voor MyFitnessPal-exports
js/app.js           weergave en interactie

tools/build-standalone.py       bouwt het losse bestand hieronder
goal-dashboard-standalone.html  gegenereerd: alles in één bestand
```

Geen build-stap, geen dependencies — aanpassen en verversen is genoeg. Wil je een doel
toevoegen of andere puntentelling? Dat regel je in `js/config.js`.
