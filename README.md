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
| Progressive overload | volgt uit je oefeningen, zie onder | ×1,5 |
| Eiwitdoel behaald | Ja / Nee | ×2 |
| Caloriedoel behaald | Ja / Nee | ×1,5 |

Daarnaast kun je per dag je gewicht, eiwitten (g) en calorieën (kcal) invullen, plus een
korte notitie. Zodra de grammen en kilocalorieën er staan, bepaalt de app "Eiwitdoel
behaald" en "Caloriedoel behaald" zelf aan de hand van je doelen; handmatig aanklikken
heeft altijd voorrang. Die twee getallen kunnen ook automatisch binnenkomen uit
MyFitnessPal — zie [Voeding uit Apple Health](#voeding-uit-apple-health). Alle gewichten zijn aanpasbaar in **Instellingen**; op 0 telt een
doel helemaal niet mee.

## Hoe de score werkt

Je score is **behaalde punten ÷ haalbare punten**, uitgedrukt in procenten.

- _Ja (eiwitrijk)_ = 100% van de punten, _Ja_ = 60%, _Nee_ = 0%.
- Bij progressive overload telt _Deels_ voor de helft. Die waarde bepaalt de app zelf uit je
  ingevulde oefeningen; zie [Oefeningen en progressive overload](#oefeningen-en-progressive-overload).
- **Rustdag** haalt "gesport" uit de berekening — een rustdag verpest je score dus niet.
- **Progressive overload** en de **post-workout maaltijd** tellen alleen mee op dagen dat
  je écht getraind hebt.
- Zolang **vandaag** loopt zie je een **tussenstand**: de punten die je al binnen hebt,
  gedeeld door alle punten die vandaag te halen waren. De vage ring eromheen is waar je nog
  op uit kunt komen, en de chip *"… % raak tot nu toe"* zegt hoe goed je de ingevulde doelen
  deed. De ring staat dan in één kleur — rood-naar-groen is een oordeel, en een halve dag
  verdient dat nog niet. Bij **afgelopen dagen** telt niet-ingevuld als niet gedaan en komt
  het oordeel (*Prima*, *Uitstekend*, …) terug.
- Lege dagen in het verleden tellen als 0% (uit te zetten in Instellingen). Dagen van
  vóór je allereerste invoer tellen nooit mee — toen gebruikte je het dashboard nog niet.
- **Gewicht** telt niet mee in je dagscore — het is een uitkomst, geen gedrag dat je op
  één dag kunt halen. Het krijgt een eigen percentage, zie hieronder.

## Oefeningen en progressive overload

Op de dagweergave kies je één **trainingsschema** (Push, Pull, …) en vul je per oefening je
**beste set** in: gewicht en reps. Klein eronder staat waar je begon en wat je vorige keer
deed, zodat je meteen weet wat je moet verslaan.

```
Incline bench press
  [40] kg × [10] reps                          ↑ vooruit
  Start 40 kg × 6  ·  Vorige 40 kg × 8  12 aug
```

De "vorige keer" is de laatste sessie waarin díe oefening voorkomt — niet gisteren. Train je
maandag push en woensdag pull, dan vergelijkt hij je bankdrukken gewoon met vorige maandag.

**Wanneer telt het als vooruit?** Als gewicht én reps gelijk of hoger zijn en er minstens
één omhoog gaat. Gaat de één omhoog en de ander omlaag (40 kg × 10 → 45 kg × 6), dan beslist
**gewicht × reps**.

Daaruit volgt automatisch het doel *Progressive overload*: alle vergeleken oefeningen
vooruit = **Ja**, een deel = **Deels**, geen enkele = **Nee**. De knoppen bij dat doel staan
daarom op slot zodra je oefeningen hebt ingevuld. Een oefening die je voor het eerst doet
valt nergens mee te vergelijken en telt die dag niet mee — je startpunt kan geen misser zijn.

Twee soorten oefeningen, in te stellen per oefening:

- **Alleen reps** voor pull-ups, leg raises en alles zonder extra gewicht.
- **Per arm** voor lateral raises en tricep overhead: rechts en links krijgen elk hun eigen
  invulvelden, eigen historie en eigen oordeel. Blijft links achter, dan zie je dat.

### Grafiek per oefening

Naast elke oefening staat een **📈**-knop. Die klapt het hele verloop van díe oefening uit:
elke ingevulde sessie als punt, je beste sessie met een ring eromheen, en eronder in het
kort hoeveel sessies je hebt, hoeveel procent je sinds je startpunt bent opgeschoven en wat
je record is.

De lijn volgt je **geschatte 1RM** — `gewicht × (1 + reps ÷ 30)` — zodat 40 kg × 10 boven
40 kg × 8 uitkomt en je niet twee lijnen naast elkaar hoeft te lezen. Bij oefeningen zonder
gewicht (pull-ups, leg raises) volgt de lijn gewoon je herhalingen. Houd je een oefening per
arm bij, dan krijgen rechts en links elk hun eigen lijn.

In **Instellingen → Trainingsschema's** beheer je je schema's: oefeningen toevoegen, van
volgorde wisselen, uit een schema halen (je ingevulde sessies blijven staan) en met **↺**
opnieuw beginnen met tellen, bijvoorbeeld na een blessure of een deload. Staat er nog niets,
dan zet één knop **Push** en **Pull** voor je klaar.

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

### Eén regel op de dagkaart

Onder je meetwaarden staat de korte versie van hetzelfde verhaal:

```
⚖️ +0,30 kg deze week — op schema (doel +0,25 per week).
```

Dat vergelijkt de **laatste zeven dagen met de zeven dagen daarvóór** — een rollend venster,
geen kalenderweek, zodat de regel ook op een dinsdag ergens op slaat. Een halve tot
anderhalve keer je tempo telt als *op schema*; daaronder is het *trager dan je tempo*,
daarboven *sneller* (met de opmerking dat dat vooral vet oplevert). Weeg je te weinig, dan
zegt de regel dat in plaats van een cijfer te verzinnen.

## Weekafsluiting

Bovenaan de **weekweergave** staat een rapport van je werkweek, en op **vrijdag vanaf 17:00
tot zaterdag 12:00** verschijnt datzelfde rapport ook bovenaan je dagpagina. Daar kun je het
wegklikken met *Verbergen tot volgende week*; in het weekoverzicht blijft het gewoon staan.

De afsluiting gaat over **maandag tot en met vrijdag**. Het weekend blijft er bewust buiten:
dat is de vrije ruimte, en die hoort niet in een rapportcijfer.

Je krijgt vier cijfers (weekscore, goede dagen, keer getraind, en op hoeveel dagen je je
calorieën écht hebt ingevuld) en daaronder een paar blokken met een oordeel: eten tegenover
gewicht, je gewichtstrend, je eiwitten, en je sterkste en zwakste doel van die week.

### Eten tegenover gewicht

Dit is het blok waar het om draait. Losse cijfers zeggen weinig — 2300 kcal is pas een
probleem als je ook niet aankomt, en +0,8 kg pas als je dat niet wilde. De app legt ze naast
elkaar en trekt er één conclusie uit:

| Wat de weegschaal doet | Wat je at | Wat je te horen krijgt |
| --- | --- | --- |
| Op tempo | maakt niet uit | Niets veranderen. Haalde je je caloriedoel daarbij níet, dan is dat doel te streng afgesteld en krijg je een passender getal. |
| Te weinig aangekomen | onder je doel | Er ging simpelweg te weinig in: haal eerst je eigen doel, en hoeveel kcal per dag dat scheelt. |
| Te weinig aangekomen | doel gehaald | Dan is je doel zelf te laag voor je verbruik — met een voorstel voor een nieuw doel. |
| Te snel aangekomen | boven je doel | Dat is vooral vetaanzet; terug naar je doel is genoeg. |
| Te snel aangekomen | rond je doel | Je doel staat te hoog — met een voorstel voor een nieuw doel. |

Bij **afvallen** en **op gewicht blijven** werkt hetzelfde blok, met de richting omgedraaid.

Het bijstelladvies rekent met de vuistregel dat één kilo lichaamsgewicht ongeveer **7700
kcal** is: goed genoeg om te zien of je moet bijsturen, te grof om op de kilo nauwkeurig te
rekenen. Het advies is daarom afgerond op 50 kcal en gaat nooit verder dan 500 kcal per dag
— een grotere sprong op basis van één week meten is nooit verstandig.

Twee dingen kan de app niet: **met minder dan drie ingevulde caloriedagen** zegt hij dat, in
plaats van een advies te verzinnen op basis van gokwerk. En zonder gewicht in deze én de
vorige week is er niets te vergelijken; dan vraagt hij je een paar ochtenden te wegen.

## Synchroniseren tussen telefoon en laptop

Standaard staat je data alleen in de browser waarin je hem invult. Wil je op allebei je
apparaten kunnen invullen, koppel het dashboard dan aan een gratis **Supabase**-project.
Je logt in met een e-mailadres en een zelfgekozen wachtwoord.

### Eenmalig klaarzetten

1. Maak een gratis account op [supabase.com](https://supabase.com) en daarna een nieuw
   project. Regio **Frankfurt** ligt het dichtstbij.
2. Open in het project de **SQL Editor**, plak het blok hieronder en klik op **Run**.
   Verwacht *"Success. No rows returned"*.
3. Kopieer de **project-URL** (te vinden onder *Settings → Data API*, of achter de knop
   *Connect*) en de **publishable key** (*Settings → API Keys*; in oudere projecten heet
   die *anon public*) naar *Instellingen → Synchroniseren* in het dashboard, en klik op
   *Verbinding opslaan*. Nooit de *secret*- of *service_role*-sleutel gebruiken.
4. Ga naar **Authentication → Sign In / Providers → Email** en zet **Confirm email uit**.
   Anders wacht Supabase op een bevestigingsmail voordat je kunt inloggen.
5. Maak in het dashboard één keer een account aan met je e-mailadres en een zelfgekozen
   wachtwoord. Zet daarna in datzelfde Supabase-scherm *Allow new users to sign up* uit,
   dan kan niemand anders zich nog bij jouw project aanmelden.

Op je tweede apparaat herhaal je alleen stap 3 en log je in met datzelfde adres en
wachtwoord.

**Waarom een wachtwoord en geen code per e-mail?** De app kan ook met een eenmalige code
overweg, maar die zit alleen in de mail als je de sjabloon *Magic link or OTP* aanpast met
`{{ .Token }}` — en dat kan Supabase alleen als je een eigen mailserver (SMTP) hebt
ingesteld. De magic link zelf werkt wel, maar opent op een telefoon vaak een ander venster
dan de app op je beginscherm, waardoor je daar alsnog niet ingelogd bent. Een wachtwoord
omzeilt dat allebei. De code-route zit nog wel in de app, onder *Liever een code per
e-mail?*, voor als je later SMTP instelt.

```sql
create table if not exists public.dagen (
  user_id uuid not null references auth.users on delete cascade,
  datum date not null,
  data jsonb,
  verwijderd boolean not null default false,
  bijgewerkt timestamptz not null default now(),
  primary key (user_id, datum)
);

create table if not exists public.instellingen (
  user_id uuid primary key references auth.users on delete cascade,
  data jsonb not null,
  bijgewerkt timestamptz not null default now()
);

alter table public.dagen enable row level security;
alter table public.instellingen enable row level security;

create policy "eigen dagen" on public.dagen
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "eigen instellingen" on public.instellingen
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
```

### Hoe het werkt

- Je browser blijft de plek waar de app mee werkt, dus **invullen zonder bereik werkt
  gewoon**. Zodra je weer online bent loopt het vanzelf gelijk.
- Er wordt gesynchroniseerd bij het openen van de app, een paar seconden na een wijziging,
  bij terugkeren naar het tabblad, en met de knop *Nu synchroniseren*.
- **Per dag wint de laatste wijziging.** Vul je 's ochtends op je telefoon je water in en
  's avonds op je laptop je gewicht, dan blijft allebei staan, omdat je laptop die dag
  eerst ophaalt en daarna aanvult.
- Pas je dezelfde dag op beide apparaten aan **zonder er tussendoor te synchroniseren**,
  dan overschrijft de laatste de hele dag — ook de velden die het andere apparaat had
  ingevuld. Dat is de prijs van deze eenvoudige regel.
- Wissen synchroniseert mee: een dag die je hier weghaalt, verdwijnt ook op je andere
  apparaat.

### Goed om te weten

- De **anon key is bedoeld om openbaar te zijn**; je gegevens zijn beschermd doordat het
  SQL-blok row level security aanzet, zodat alleen jouw ingelogde account bij jouw rijen
  kan. Sla hem gerust op in je browser.
- Gratis Supabase-projecten **pauzeren na ongeveer een week zonder gebruik**. Bij dagelijks
  gebruik merk je dat niet, maar na een lange vakantie moet je het project in het
  Supabase-dashboard weer starten. Je lokale data blijft in de tussentijd gewoon werken.
- Welke wijziging "de laatste" is, wordt bepaald door de **klok van je apparaten**. Staat er
  ergens een klok flink verkeerd, dan kan een oudere wijziging winnen.
- De back-up uit *Je data* blijft gewoon werken en is een prima extra vangnet.

### Veiligheid

- **Alleen de publishable/anon key hoort in de app.** De *secret*- of *service_role*-sleutel
  negeert row level security volledig: wie hem heeft, leest en wist alles in het project.
  Die hoort nergens in een browser, in deze repo, of in een gesprek. Is er ooit een
  weggelekt, trek hem dan in onder *Settings → API Keys* en reset het databasewachtwoord
  onder *Settings → Database*.
- **Zet *Allow new users to sign up* uit** zodra je eigen account bestaat (stap 5). Omdat
  *Confirm email* uit staat, is aanmelden anders vrij: bij jouw gegevens komt niemand — dat
  blokkeert row level security — maar een vreemde kan je gratis project wel vol laten lopen.
- **Kies een lang, uniek wachtwoord.** Supabase eist er maar zes tekens, en dit wachtwoord
  is het enige slot op je gewichts- en voedingsgegevens.
- De app **laadt niets van buiten** — geen CDN, geen fonts, geen statistieken — en praat
  alleen met jouw eigen Supabase-project. Dat staat vastgelegd in de
  `Content-Security-Policy` in `index.html`. Draai je Supabase op een eigen domein in plaats
  van `*.supabase.co`, vul dat adres dan aan bij `connect-src`.
- **Uitloggen trekt de sessie ook bij Supabase in**, dus een token dat ooit van je apparaat
  is gehaald werkt daarna niet meer. Je andere apparaat blijft wel ingelogd.
- Publiceer je via GitHub Pages, dan **delen al je Pages-projecten één adres**
  (`gebruikersnaam.github.io`). Alles wat daar staat kan bij de opgeslagen gegevens van deze
  app. Zet er dus geen code van anderen naast, of geef het dashboard een eigen (sub)domein.

## Voeding uit Apple Health

Je calorieën en eiwitten kunnen ook vanzelf binnenkomen, zodat je ze niet meer overtypt.
De keten is:

```
MyFitnessPal  ──▶  Apple Health  ──▶  Shortcut  ──▶  Supabase  ──▶  dit dashboard
  (of Lifesum)       (op je iPhone)    (23:30)      (tabel voeding)
```

Een webpagina kan niet bij Apple Health — HealthKit is een native iOS-framework. Maar de
Shortcuts-app kan dat wél, en die kan ook een webverzoek doen. Daarmee heb je geen eigen
iOS-app, geen Xcode en geen developer-account nodig.

**Waarom een aparte tabel?** Bij het synchroniseren wordt een dagrij in zijn geheel
vervangen — dat is hoe "de laatste wijziging wint" werkt. Zou de koppeling rechtstreeks in
`dagen` schrijven, dan wist een rij met alleen calorieën je water, je vinkjes en je
oefeningen van die dag. De tabel `voeding` staat daarom los, wordt alleen door de Shortcut
gevuld en alleen door het dashboard gelezen.

Zet de koppeling aan onder **Instellingen → Voeding uit Apple Health**. Daar staat ook het
SQL-blok voor de tabel en de complete stappenlijst voor de Shortcut, met jouw eigen
project-URL er al in ingevuld.

Zet in de Shortcut bij *Zoek gezondheidswaarden* de **Eenheid** op `kcal` (en op `g` voor
eiwitten). Doe je dat niet, dan kan Health kilojoules teruggeven en staat je caloriedoel er
een factor 4,184 naast zonder dat het opvalt. Controleer na de eerste keer dus of er rond
de 2.000 à 3.000 staat, niet 10.000.

### Wie wint bij verschil?

| Situatie | Wat er gebeurt |
| --- | --- |
| Veld leeg | Health vult het in, met het label *↻ uit Apple Health* |
| Kwam uit Health en Health werkt bij | Volgt vanzelf mee (je middagstand wordt je eindstand) |
| Jij tikt zelf een getal in | Jouw getal blijft staan, ook na synchroniseren |
| Jij tikt iets in en Health zegt iets anders | Je ziet *Health: 2437 kcal · overnemen* en kiest zelf |
| Stond er al iets vóór de koppeling | Blijft met rust gelaten |

Dat onthouden we per veld in `kcalBron` en `eiwitGramBron`. Wis je het veld weer, dan blijft
het leeg — tenzij die dag verder helemaal leeg is, want dan verdwijnt de hele dag en daarmee
ook de herinnering dat je het weghaalde.

Omdat `autoMacro` de vinkjes *Eiwitdoel behaald* en *Caloriedoel behaald* uit deze getallen
afleidt, vinken die zichzelf aan zodra de cijfers binnen zijn. En de
[weekafsluiting](#weekafsluiting) weigert advies te geven onder drie ingevulde caloriedagen —
met deze koppeling staat die teller vanzelf vol.

Gaat er iets mis met de tabel (bijvoorbeeld: het SQL-blok is nog niet gedraaid), dan blijft
de rest van het synchroniseren gewoon werken. Je dagen zijn belangrijker dan deze extra's.

## Je data

Alles staat in `localStorage` van de browser waarin je het gebruikt. Zonder de koppeling
hierboven gaat er niets naar een server, maar synchroniseert het ook niet vanzelf tussen
apparaten — en het verdwijnt als je je browsergegevens wist.

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
- **📈** naast een oefening klapt de grafiek van díe oefening uit.
- Het icoon rechtsboven wisselt tussen donker en licht.
- Ben je ingelogd voor synchronisatie, dan staat er een **⟳** naast: die synchroniseert
  vanaf elke pagina, zonder eerst naar de instellingen te gaan. Hij draait terwijl hij
  bezig is, en de tooltip vertelt wanneer er voor het laatst is bijgewerkt.

## Structuur

```
index.html          pagina en scriptvolgorde
css/style.css       stijl, donker en licht thema
js/config.js        doeldefinities, standaardinstellingen, kleurschaal 0 -> 100
js/store.js         opslag (localStorage), import/export, datum-helpers
js/lifts.js         oefeningen, trainingsschema's en de progressive-overload-regel
js/score.js         scoreberekening per dag en per periode, streaks, gewichtstrend
js/charts.js        SVG-ring, balken, kalender, gewichts- en oefeninggrafiek
js/review.js        weekafsluiting: eten tegenover gewicht, adviezen
js/voeding.js       calorieën en eiwitten uit Apple Health toepassen
js/sync.js          synchronisatie via de REST-API van Supabase
js/app.js           weergave en interactie

tools/build-standalone.py       bouwt het losse bestand hieronder
goal-dashboard-standalone.html  gegenereerd: alles in één bestand
```

Geen build-stap, geen dependencies — aanpassen en verversen is genoeg. Wil je een doel
toevoegen of andere puntentelling? Dat regel je in `js/config.js`.
