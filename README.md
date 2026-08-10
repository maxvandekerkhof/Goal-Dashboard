# Goal Dashboard

Een dashboard voor je sport- en voedingsdoelen, met per **dag**, **week** en **maand**
een percentage dat verkleurt van **donkerrood (0%)** naar **donkergroen (100%)**.

Geen installatie, geen account, geen server: het is één statische pagina en je data
staat in je eigen browser.

## Snel starten

**Lokaal:** open `index.html` in je browser. Klaar.

**Op je telefoon (aanrader):** zet het online via GitHub Pages —
_Settings → Pages → Source: Deploy from a branch → branch `main`, map `/ (root)`_.
Daarna staat het op `https://<gebruikersnaam>.github.io/Goal-Dashboard/`, en kun je het
via "Zet op beginscherm" als app-icoon op je telefoon zetten.

## Wat je bijhoudt

| Doel | Opties | Standaardgewicht |
| --- | --- | --- |
| Gewicht | zelf invullen (kg) | telt niet mee in de score |
| Creatine gepakt | Ja / Nee | ×1 |
| Ontbijt | Ja (eiwitrijk) / Ja / Nee | ×1 |
| Lunch | Ja (eiwitrijk) / Ja / Nee | ×1 |
| Avondeten | Ja (eiwitrijk) / Ja / Nee | ×1 |
| Post-workout maaltijd | Ja (eiwitrijk) / Ja / Nee | ×1 |
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
- **Gewicht** is een meetwaarde, geen doel: het beïnvloedt het percentage niet, maar
  staat wel in de grafieken.

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
```

Geen build-stap, geen dependencies — aanpassen en verversen is genoeg. Wil je een doel
toevoegen of andere puntentelling? Dat regel je in `js/config.js`.
