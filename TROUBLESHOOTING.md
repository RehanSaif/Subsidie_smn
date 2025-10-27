# Troubleshooting Guide: ISDE Subsidie Automatisering

## Inhoudsopgave
1. [Veelvoorkomende Problemen](#veelvoorkomende-problemen)
2. [Selector ID's Zijn Veranderd](#selector-ids-zijn-veranderd)
3. [Nieuwe Pagina Toegevoegd aan Flow](#nieuwe-pagina-toegevoegd-aan-flow)
4. [OCR Extractie Problemen](#ocr-extractie-problemen)
5. [Automatisering Blijft Hangen](#automatisering-blijft-hangen)
6. [Document Upload Mislukt](#document-upload-mislukt)
7. [API Fouten](#api-fouten)
8. [Browser Console Debugging](#browser-console-debugging)

---

## Veelvoorkomende Problemen

### 1. Website Crashed / Pagina Herlaadt

**Symptomen:**
- RVO/eloket site crashed
- Pagina wordt automatisch herladen
- Er verschijnt een recovery dialoog

**Wat Er Gebeurt:**

Bij een site crash of onverwachte page reload detecteert de extensie automatisch dat de voortgang verloren kan zijn gegaan. Je krijgt dan een dialoog te zien:

```
⚠️ Automatisering Onderbroken

De automatisering werd onderbroken bij stap:
[laatste bekende stap]

Wil je doorgaan vanaf deze stap of opnieuw beginnen?

[✓ Hervatten]  [⟳ Opnieuw Beginnen]
```

**Opties:**

1. **✓ Hervatten**:
   - Gaat verder vanaf de laatste opgeslagen stap
   - Gebruikt persistent opgeslagen voortgang
   - Beste keuze als crash vlak voor voltooiing gebeurde

2. **⟳ Opnieuw Beginnen**:
   - Begint het proces vanaf nul
   - Wist alle voortgang
   - Beste keuze als er iets fout ging en je opnieuw wilt starten

**Hoe Het Werkt:**

De extensie slaat automatisch voortgang op bij elke stap:
- `chrome.storage.local` (persistent, blijft na crash)
- Timestamp (recovery data max 1 uur geldig)
- Laatste URL en configuratie

Als `sessionStorage` leeg is na page reload, checkt de extensie voor recovery data.

**Handmatige Recovery:**

Als de dialoog niet verschijnt maar je wilt hervatten:

```javascript
// Open console (F12) en run:
chrome.storage.local.get(['automation_recovery'], (result) => {
  console.log('Recovery data:', result.automation_recovery);
});

// Om handmatig te hervatten:
const recoveryData = result.automation_recovery;
sessionStorage.setItem('automationConfig', recoveryData.config);
sessionStorage.setItem('automationStep', recoveryData.step);
// Reload de pagina
```

**Recovery Data Verwijderen:**

Als je de recovery dialoog niet meer wilt zien:

```javascript
// Voor huidige tab:
// De extensie verwijdert automatisch bij "Stop" of "Opnieuw beginnen"

// Voor alle tabs (handmatig opruimen):
chrome.storage.local.get(null, (allData) => {
  const recoveryKeys = Object.keys(allData).filter(key =>
    key.startsWith('automation_recovery')
  );
  chrome.storage.local.remove(recoveryKeys);
  console.log('Alle recovery data verwijderd:', recoveryKeys.length);
});
```

**Multi-Tab Support:**

✅ **Je kunt meerdere tabbladen tegelijk gebruiken!**

- Elke tab heeft een uniek session ID
- Recovery data wordt per tab opgeslagen
- Tabs overschrijven elkaars data NIET
- Bij crash wordt de meest recente recovery data voor die tab getoond

**Voorbeeld:**
```
Tab 1: Klant A - stap 6 (personal_info_done)
Tab 2: Klant B - stap 10 (bag_different_done)
Tab 3: Klant C - stap 15 (warmtepomp_selected)

Als Tab 2 crashed → krijgt alleen Tab 2 recovery dialoog voor Klant B
Tabs 1 en 3 blijven normaal doorwerken
```

**Beperkingen:**

- Recovery data is max 1 uur geldig
- Bij "Stop" knop klikken wordt recovery data voor die tab gewist
- Recovery werkt alleen voor crashes, niet voor handmatig sluiten
- Oude recovery data wordt automatisch opgeruimd (>1 uur)

---

### 2. Automatisering Start Niet

**Symptomen:**
- "Start Automatisering" knop doet niets
- Geen status panel verschijnt
- Console toont error

**Mogelijke Oorzaken & Oplossingen:**

#### A. Niet op juiste website
```
Error: "Ga eerst naar https://eloket.dienstuitvoering.nl"
```

**Oplossing:**
- Zorg dat je op `eloket.dienstuitvoering.nl` bent
- Log in met eHerkenning als dat nog niet is gebeurd

#### B. Content script niet geladen
```
Console error: "Could not establish connection"
```

**Oplossing:**
```javascript
// background.js handelt dit automatisch af
// Maar je kunt handmatig reloaden:
// 1. Open chrome://extensions
// 2. Zoek "ISDE Automatisering"
// 3. Klik op reload icoon
// 4. Herlaad de eloket.nl pagina
```

#### C. Validatie fouten
```
Status: "Vul eerst alle verplichte velden in: BSN, Telefoon, ..."
```

**Oplossing:**
- Controleer dat ALLE velden zijn ingevuld
- Verplichte velden zie je in de rode foutmelding
- Upload BEIDE documenten (betaalbewijs + factuur)

### 3. Loop Detectie: Zelfde Stap Herhaalt

**Symptomen:**
```
Status panel: "⚠️ LOOP GEDETECTEERD: Stap 'date_continued' wordt herhaald"
Console: "🛑 LOOP DETECTED: Same step executed 3 times"
```

**Betekenis:**
De automatisering is 3 keer op dezelfde stap geweest zonder vooruitgang. Dit betekent meestal dat:
1. Een selector is veranderd en het element niet wordt gevonden
2. De website structuur is gewijzigd
3. Een validatie fout op de website voorkomt doorgaan

**Oplossing:**

1. **Klik "Hervat" en probeer opnieuw**:
   - De loop counter wordt gereset bij handmatig ingrijpen
   - Soms is het een tijdelijk probleem

2. **Controleer de Console** voor errors:
   ```javascript
   // Zoek naar:
   "Element #selector-id not found within timeout"
   "Click cancelled - automation paused"
   ```

3. **Handmatig de Stap Voltooien**:
   - Vul handmatig het veld in of klik de knop
   - Klik "Hervat" om door te gaan

4. **Check of Selector Veranderd Is**:
   - Zie sectie [Selector ID's Zijn Veranderd](#selector-ids-zijn-veranderd)

**Crash Recovery Tip:**
Als je na loop detectie handmatig de stap wilt overslaan en verder wilt:
```javascript
// In console: sla huidige stap over
sessionStorage.setItem('automationStep', 'volgende_stap_naam');
// Klik dan "Hervat" in status panel
```

---

## Selector ID's Zijn Veranderd

### Probleem
De eloket.nl website wijzigt soms de HTML element IDs. Dit breekt de automatisering omdat de code specifieke selectors gebruikt.

**Symptomen:**
```
Console: "Element #link_aanv\\.0\\.link_aanv_persoon\\.0\\.edBSNnummer not found"
Status: Loop detectie activeert
Automatisering blijft hangen op bepaalde stap
```

### Oplossing Stappenplan

#### Stap 1: Identificeer het Ontbrekende Element

1. **Open Chrome DevTools** (F12)
2. **Ga naar Console tab**
3. **Zoek de foutmelding**:
   ```
   Element #old-selector-id not found within timeout
   ```
4. **Noteer de selector** die niet gevonden wordt

#### Stap 2: Vind de Nieuwe Selector

1. **Ga naar Elements tab** in DevTools
2. **Gebruik de element selector** (icoon linksboven, of Ctrl+Shift+C)
3. **Klik op het veld** op de pagina dat ingevuld moet worden
4. **In de Elements tab zie je nu het element**:
   ```html
   <input type="text" id="nieuw-id" name="..." />
   ```
5. **Kopieer het nieuwe ID**: `nieuw-id`

#### Stap 3: Update de Code

**Bestand**: `content.js`

**Voor Input Velden:**

Zoek in `content.js` naar de oude selector en vervang deze:

```javascript
// VOOR (oude selector)
await fillInput('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edBSNnummer', config.bsn);

// NA (nieuwe selector)
await fillInput('#nieuw-bsn-id', config.bsn);
```

**Voor Knoppen:**

```javascript
// VOOR
await clickElement('#btn12');

// NA
await clickElement('#nieuwe-knop-id');
```

**Let op met Special Characters:**
Sommige IDs hebben punten of andere speciale karakters. Deze moeten escaped worden met `\\`:

```javascript
// ID: link_aanv.0.edBSNnummer
// Selector: '#link_aanv\\.0\\.edBSNnummer'  // Let op de \\
```

#### Stap 4: Update ook Stap Detectie

Als het element gebruikt wordt in `detectCurrentStep()`, update het daar ook:

```javascript
// content.js, functie detectCurrentStep() (regel ~652)

// VOOR
if (document.querySelector('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edBSNnummer') &&
    document.querySelector('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edVoorletters2')) {
  console.log('🎯 Detected: info_acknowledged - Personal details page');
  return 'info_acknowledged';
}

// NA
if (document.querySelector('#nieuw-bsn-id') &&
    document.querySelector('#nieuw-initials-id')) {
  console.log('🎯 Detected: info_acknowledged - Personal details page');
  return 'info_acknowledged';
}
```

#### Stap 5: Test de Wijziging

1. **Reload de extensie**:
   - Ga naar `chrome://extensions`
   - Klik reload bij "ISDE Automatisering"

2. **Reload de eloket.nl pagina**

3. **Start automatisering opnieuw**

### Veelgebruikte Selector Locaties

Hier zijn de belangrijkste plaatsen waar selectors voorkomen:

**Persoonlijke Gegevens (Stap 6)** - `content.js` regel ~1189-1230:
```javascript
'#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edBSNnummer'        // BSN
'#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edVoorletters2'    // Voorletters
'#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edAchternaam2'     // Achternaam
'#link_aanv\\.0\\.link_aanv_persoon\\.0\\.eddGeslacht_man2'  // Geslacht Man
'#link_aanv\\.0\\.link_aanv_persoon\\.0\\.eddGeslacht_vrouw2' // Geslacht Vrouw
'#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edTelefoonnummer'  // Telefoon
'#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edEmail'           // Email
'#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edIBAN'            // IBAN
// etc.
```

**Intermediair Gegevens (Stap 7-8)** - `content.js` regel ~1282-1310:
```javascript
'#link_int\\.0\\.link_int_organisatie\\.0\\.edExtraContactpersoon_v_int' // Voorletters
'#link_int\\.0\\.link_int_organisatie\\.0\\.edExtraContactpersoon_a_int' // Achternaam
// etc.
```

**Installatie Details (Stap 13)** - `content.js` regel ~1455-1478:
```javascript
'#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.DatumAangeschaft'   // Aankoopdatum
'#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.DatumInstallatie' // Installatiedatum
// etc.
```

**Meldcode Lookup (Stap 16-17)** - `content.js` regel ~1500-1580:
```javascript
'#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.lookup_meldcode' // Lookup knop
'#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.btnLookupZoek'  // Zoek knop
```

**Document Upload (Stap 18)** - `content.js` regel ~1665-1750:
```javascript
'#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.Bijlagen_NogToevoegen_ISDEPA_Meldcode\\.0\\.btn_ToevoegenBijlage' // Upload knop
'#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.Bijlagen_NogToevoegen_ISDEPA_Meldcode\\.0\\.toevoegen_bestand' // File input
```

### Quick Fix: Alleen Selector Naam Veranderd

Als **alleen de ID naam verandert** (niet de structuur), is het heel simpel:

**Voorbeeld:**
```
OUD ID: btn_volgende_pagina
NIEUW ID: btn_next_page
```

**Stappen:**

1. **Find & Replace in content.js**:
   ```
   Ctrl+F (of Cmd+F op Mac)
   Zoek: #btn_volgende_pagina
   Vervang met: #btn_next_page
   Replace All
   ```

2. **Escaping Controleren**:
   - Als de nieuwe ID punten heeft: gebruik `\\.`
   - Als de nieuwe ID geen punten heeft: geen escaping nodig

   **Voorbeelden**:
   ```javascript
   // Geen punten - geen escaping
   '#btn_next_page'

   // Met punten - WEL escaping
   '#link\\.0\\.btn_next'
   ```

3. **Reload & Test**:
   - `chrome://extensions` → Reload
   - Test de automatisering

**Let op**: Als er MEERDERE selectors zijn veranderd:
- Doe Find & Replace voor elk afzonderlijk
- Of: gebruik Regex replace voor patronen

**Regex Voorbeeld** (geavanceerd):
```javascript
// Als alle #btn_ ID's zijn veranderd naar #button_
Zoek met regex: #btn_(\w+)
Vervang met: #button_$1
```

### Quick Reference: Selector Replacement

```javascript
// STAP 1: Find in file (Ctrl+F in content.js)
// Zoek naar de oude selector

// STAP 2: Replace
// Vervang met nieuwe selector (let op \\ escaping!)

// STAP 3: Check detectCurrentStep()
// Zoek naar dezelfde selector in detectCurrentStep() functie

// STAP 4: Reload & Test
```

---

## Nieuwe Pagina Toegevoegd aan Flow

### Probleem
De eloket.nl website voegt soms een nieuwe pagina toe in de flow, bijvoorbeeld een extra validatiestap of informatieve pagina.

**Symptomen:**
```
Automatisering blijft hangen
Console: "Detected: unknown - No matching elements found"
Status panel toont "Unknown step"
```

### Oplossing Stappenplan

#### Stap 1: Identificeer de Nieuwe Pagina

1. **Gebruik Chrome DevTools Console**
2. **Zoek naar de detectie output**:
   ```
   ⚠️ Detected: unknown - No matching elements found
   ```
3. **Bekijk de pagina** en noteer:
   - Wat is de titel/header tekst?
   - Wat moet er gebeuren? (knop klikken, veld invullen, etc.)
   - Wat is de volgende stap na deze pagina?

#### Stap 2: Vind Unieke Identifier

**Methode 1: Uniek Element ID**

1. Open DevTools Elements tab
2. Zoek naar een uniek element op de pagina:
   - Een specifieke knop
   - Een uniek formulierveld
   - Een header met specifieke ID
3. Kopieer het ID

**Methode 2: Unieke Tekst**

Als er geen uniek ID is, gebruik tekst:
```javascript
// Zoek naar element met specifieke tekst
const hasUniqueText = Array.from(document.querySelectorAll('*')).some(el =>
  el.textContent && el.textContent.includes('Unieke Tekst Op Pagina')
);
```

#### Stap 3: Voeg Stap Detectie Toe

**Bestand**: `content.js`
**Functie**: `detectCurrentStep()` (regel ~652)

**Voeg BOVENAAN de functie toe** (voor de `return 'unknown'` regel):

```javascript
// Stap XX: Nieuwe pagina beschrijving
// Detecteer aan de hand van unieke element of tekst
if (document.querySelector('#uniek-element-id')) {
  console.log('🎯 Detected: nieuwe_pagina_naam - Beschrijving');
  return 'nieuwe_pagina_naam';
}

// OF met tekst detectie:
const hasNieuwePageText = Array.from(document.querySelectorAll('*')).some(el =>
  el.textContent && el.textContent.includes('Specifieke Tekst Op Nieuwe Pagina')
);

if (hasNieuwePageText) {
  console.log('🎯 Detected: nieuwe_pagina_naam - Beschrijving');
  return 'nieuwe_pagina_naam';
}
```

**Belangrijke Plaatsing:**
- Voeg detectie toe **OP DE JUISTE PLEK** in de detectie volgorde
- Specifiekere detecties bovenaan, generieke onderaan
- Als de nieuwe pagina elementen heeft die ook op andere pagina's voorkomen, zorg dat je meer checks hebt

**Voorbeeld met Meerdere Checks**:
```javascript
// Nieuwe bevestigingspagina met "Akkoord" checkbox EN "Bevestig" knop
// Beide moeten aanwezig zijn om false positives te voorkomen
if (document.querySelector('#akkoord-checkbox') &&
    document.querySelector('#bevestig-knop')) {
  console.log('🎯 Detected: extra_bevestiging - Extra bevestiging pagina');
  return 'extra_bevestiging';
}
```

#### Stap 4: Voeg Stap Logica Toe

**Bestand**: `content.js`
**Functie**: `startFullAutomation()` (regel ~911)

Voeg de stap logica toe **OP DE JUISTE PLEK** in de flow (tussen de huidige stappen):

```javascript
// Stap XX: Nieuwe pagina beschrijving
if (currentStep === 'nieuwe_pagina_naam') {
  console.log('Step XX: Nieuwe pagina beschrijving');
  updateStatus('Actie uitvoeren op nieuwe pagina', 'XX - Nieuwe Pagina', detectedStep);

  // Wat moet er gebeuren? Bijvoorbeeld:
  // 1. Checkbox aanvinken
  await clickElement('#akkoord-checkbox');
  await new Promise(r => setTimeout(r, 500));

  // 2. Knop klikken
  await clickElement('#bevestig-knop');

  // 3. Update naar volgende stap
  sessionStorage.setItem('automationStep', 'volgende_bestaande_stap');
  return;
}
```

**Let op de Volgorde:**
- Als nieuwe pagina komt **VOOR** bestaande stap: voeg code **BOVEN** die stap toe
- Als nieuwe pagina komt **NA** bestaande stap: voeg code **ONDER** die stap toe
- Update `automationStep` naar de correcte volgende stap in de flow

#### Stap 5: Update Flow Documentatie (Optioneel)

Update `TECHNISCHE_OVERDRACHT.md` sectie "Automatisering Flow" met de nieuwe stap.

### Voorbeeld: Extra Bevestigingspagina

**Scenario**: Website voegt een nieuwe "Privacy Akkoord" pagina toe tussen stap 5 en 6.

**1. Detectie Toevoegen** (content.js, regel ~865, vlak voor stap 6 detectie):
```javascript
// Step 5.5: Privacy akkoord (nieuwe pagina)
if (document.querySelector('#privacy-akkoord-checkbox') &&
    document.querySelector('#privacy-volgende-btn')) {
  console.log('🎯 Detected: privacy_akkoord - Privacy akkoord pagina');
  return 'privacy_akkoord';
}

// Step 6: Personal info (bestaande code)
if (document.querySelector('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edBSNnummer') &&
    document.querySelector('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edVoorletters2')) {
  console.log('🎯 Detected: info_acknowledged - Personal details page');
  return 'info_acknowledged';
}
```

**2. Logica Toevoegen** (content.js, regel ~1185, vlak voor stap 6 logica):
```javascript
// Step 5.5: Privacy akkoord
if (currentStep === 'privacy_akkoord') {
  console.log('Step 5.5: Privacy akkoord aanvinken');
  updateStatus('Privacy akkoord accepteren', '5.5 - Privacy', detectedStep);

  // Vink checkbox aan
  await clickElement('#privacy-akkoord-checkbox');
  await new Promise(r => setTimeout(r, 800));

  // Klik volgende
  await clickElement('#privacy-volgende-btn');

  // Ga door naar stap 6 (persoonlijke info)
  sessionStorage.setItem('automationStep', 'info_acknowledged');
  return;
}

// Step 6: Personal information (bestaande code blijft ongewijzigd)
if (document.querySelector('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edBSNnummer') &&
    currentStep === 'info_acknowledged') {
  // ... bestaande code ...
}
```

### Quick Reference: Nieuwe Pagina Toevoegen

```javascript
// DETECTIE (content.js, detectCurrentStep functie)
// 1. Vind uniek element of tekst
// 2. Voeg detectie toe op juiste plek in functie
if (document.querySelector('#uniek-id')) {
  return 'nieuwe_stap_naam';
}

// LOGICA (content.js, startFullAutomation functie)
// 1. Voeg stap logica toe op juiste plek in flow
// 2. Voer actie uit (click, fill, etc.)
// 3. Set automationStep naar volgende stap
if (currentStep === 'nieuwe_stap_naam') {
  await clickElement('#knop');
  sessionStorage.setItem('automationStep', 'volgende_stap');
  return;
}

// RELOAD & TEST
```

---

## OCR Extractie Problemen

### 1. Geen Gegevens Geëxtraheerd

**Symptomen:**
```
Status: "⚠️ Geen gegevens gevonden. Controleer de console voor details."
Console: "=== Final extracted data === {}"
```

**Mogelijke Oorzaken:**

#### A. PDF Is Gescand (Geen Tekst)
```
Console: "⚠️ PDF has no extractable text, using Vision AI OCR..."
```

**Dit is normaal** - de extensie valt automatisch terug op Vision AI.

**Als Vision AI ook faalt:**
- Document is van te lage kwaliteit
- Tekst is niet leesbaar (handgeschreven, slecht gescand)

**Oplossing:**
- Gebruik een betere scan (hogere DPI, 300+ aanbevolen)
- Zorg voor goede contrast en scherpte
- Rechte scan (niet scheef)

#### B. Mistral API Key Ontbreekt
```
Error: "Geen Mistral API key ingesteld. Voer eerst je API key in via instellingen."
```

**Oplossing:**
1. Klik tandwiel icoon in popup
2. Voer Mistral API key in
3. Klik "Opslaan"

#### C. API Rate Limit
```
Error: "Mistral API rate limit bereikt. Wacht even (30-60 seconden)"
```

**Oplossing:**
- Wacht 30-60 seconden
- Probeer opnieuw
- Check je Mistral API usage op console.mistral.ai

#### D. Document Format Niet Herkend
```
Error: "Mistral OCR error (413): File too large"
```

**Oplossing:**
- Verklein het bestand:
  - PDF: comprimeer in Acrobat/Preview
  - Afbeelding: verklein resolutie tot max 2000px breed
  - Converteer naar JPEG met lagere kwaliteit

### 2. Verkeerde Gegevens Geëxtraheerd

**Symptomen:**
- BSN is verkeerd
- IBAN heeft foute cijfers
- Naam is bedrijfsnaam ipv klantnaam

**Mogelijke Oorzaken:**

#### A. OCR Verwart Klant en Bedrijf

**Debug in Console:**
```javascript
// Zoek naar:
console.log('=== FULL OCR TEXT FOR DEBUGGING ===');
// Bekijk of klantgegevens aanwezig zijn in tekst
```

**Oplossing:**
- Handmatig corrigeer velden
- AI instructies zijn al geoptimaliseerd om dit te voorkomen:
  ```javascript
  // popup.js regel ~632
  content: `Extract the CUSTOMER information from this Dutch machtigingsformulier text.

  IMPORTANT: Extract the FILLED-IN customer data, NOT the company information
  (like SAMAN, Gouwepoort, Zierikzee).`
  ```

#### B. OCR Fouten in IBAN

**Dit wordt automatisch gecorrigeerd** in `fillInput()` functie:
```javascript
// content.js regel ~486
// O → 0, I → 1, S → 5 conversie
```

**Als het nog steeds fout is:**
- Controleer handmatig in formulier
- IBAN moet NL + 2 cijfers + 4 letters + 10 cijfers zijn

### 3. Aardgasgebruik Checkbox Verkeerd

**Symptomen:**
```
Console: "⚠️ Vision AI is uncertain about gas usage, skipping..."
Console: "⚠️ WARNING: Vision AI chose 'Nee' - verify this is correct!"
```

**Betekenis:**
- Vision AI kan niet duidelijk zien welke checkbox is aangevinkt
- Of: Vision AI is onzeker

**Oplossing:**
1. **Controleer het veld handmatig** in de popup
2. **Selecteer de juiste waarde** (Ja/Nee)
3. **Verbeter document kwaliteit**:
   - Gebruik een scherpere scan
   - Zorg dat checkboxes duidelijk zichtbaar zijn
   - Omcirkelde of aangevinkte boxes werken het beste

**Vision AI Detectie Logica** (popup.js regel ~817):
- **Omcirkeld/Aangevinkt** = geselecteerd
- **Doorgestreept** = NIET geselecteerd
- **Onduidelijk** = vision AI geeft "unknown" terug

### 4. AI Prompts Verbeteren voor Betere Extractie

Als OCR systematisch verkeerde data extraheert, kun je de AI prompts aanpassen.

**Bestand**: `popup.js`

#### A. Klantgegevens Extractie Verbeteren

**Locatie**: `popup.js` regel ~924-968 (in functie `extractDataFromForm`)

**Huidige Prompt**:
```javascript
content: `Extract the CUSTOMER information from this Dutch machtigingsformulier text.

IMPORTANT: Extract the FILLED-IN customer data, NOT the company information
(like SAMAN, Gouwepoort, Zierikzee).

Look for customer details after these labels:
- "Achternaam en voorletters" - extract last name and initials
- "Geslacht" - return "male" for "Man/M" or "female" for "Vrouw/V"
...`
```

**Voorbeelden van Aanpassingen**:

1. **Als AI steeds bedrijfsnaam pakt in plaats van klantnaam**:
   ```javascript
   // VOEG TOE aan prompt:
   VERY IMPORTANT: Skip these company names and look for the CUSTOMER name below:
   - SAMAN Groep
   - [Voeg andere bedrijfsnamen toe die vaak verschijnen]

   The customer name typically appears AFTER company address section.
   ```

2. **Als BSN niet wordt gevonden**:
   ```javascript
   // VOEG TOE:
   BSN is ALWAYS 9 digits. Look for patterns like:
   - "BSN: 123456789"
   - "BSN-nummer: 123 456 789"
   - "Burgerservicenummer: 123-45-6789"

   Remove all spaces and dashes from BSN before returning.
   ```

3. **Als IBAN steeds fout is**:
   ```javascript
   // VOEG TOE:
   IBAN format: NL + 2 digits + 4 LETTERS + 10 digits
   Example: NL12ABCD0123456789

   CRITICAL: Return IBAN WITHOUT spaces, dots, or BIC code.
   If you see "NL12 ABCD 0123 4567 89 RABONL2U", return only "NL12ABCD0123456789"
   ```

4. **Voor specifiek document formaat**:
   ```javascript
   // VOEG TOE:
   The document follows this structure:
   [Beschrijf de structuur van jullie specifieke formulier]

   Company information: Top section
   Customer information: Middle section, starts after "Klantgegevens"
   Installation address: Bottom section
   ```

#### B. Meldcode Extractie Verbeteren

**Locatie**: `popup.js` regel ~691-703 (in functie `extractMeldcodeFromFactuur`)

**Huidige Prompt**:
```javascript
content: `Extract from this Dutch invoice text:
1. Meldcode: typically starts with "KA" followed by 5 digits (e.g., KA06175)
2. Installation date (installatiedatum): the date when the heat pump was installed`
```

**Voorbeelden van Aanpassingen**:

1. **Als meldcode niet wordt gevonden**:
   ```javascript
   // VERVANG met:
   content: `Extract from this Dutch invoice text:

   1. MELDCODE (CRITICAL):
      - Format: KA followed by EXACTLY 5 digits
      - Examples: KA06175, KA12345, KA99999
      - Look in these sections:
        * Near "Meldcode"
        * Near "RVO meldcode"
        * In tables with warmtepomp/heat pump information
      - Common locations:
        * Top right of invoice
        * In product description table
        * Near installation details

   2. Installation date (installatiedatum):
      - The date when equipment was installed
      - Format: DD-MM-YYYY
      - Look near: "datum installatie", "geplaatst op", "installation date"

   If meldcode appears multiple times, return the FIRST occurrence.`
   ```

2. **Als datum in verkeerd formaat komt**:
   ```javascript
   // VOEG TOE:
   IMPORTANT DATE FORMAT:
   - ALWAYS return date as DD-MM-YYYY
   - If you find "2024-03-15", convert to "15-03-2024"
   - If you find "15/03/2024", convert to "15-03-2024"
   - If you find "15 maart 2024", convert to "15-03-2024"
   ```

#### C. Vision AI Checkbox Detectie Verbeteren

**Locatie**: `popup.js` regel ~1130-1155 (in Vision AI call voor gas usage)

**Huidige Prompt**:
```javascript
text: `Look at this Dutch machtigingsformulier image. Find the question:
"Gebruikt u na installatie van deze warmtepomp nog aardgas voor ruimte verwarming?"

The question has two options: "Ja" and "nee". ONE is selected, ONE is NOT selected.

CRITICAL: The SELECTED answer shows what the person chose. Look for these indicators:

SELECTED (chosen answer):
- CIRCLED (has a circle around it)
- CHECKED box (☑ or ✓)
- NOT crossed out / NOT strikethrough
...`
```

**Voorbeelden van Aanpassingen**:

1. **Als checkboxes anders gemarkeerd zijn in jullie formulieren**:
   ```javascript
   // VOEG TOE:
   SELECTED indicators for YOUR forms:
   - Has a THICK pen mark / highlighted
   - Has asterisk (*) next to it
   - Has [X] mark in box
   - Text is underlined
   - [Beschrijf hoe jullie formulieren markering doen]
   ```

2. **Als layout anders is**:
   ```javascript
   // VOEG TOE:
   The question appears in this format on our forms:
   □ Ja  □ Nee

   OR

   ○ Ja  ○ Nee

   The FILLED option (■ or ●) is the selected answer.
   ```

#### D. Test je Prompt Wijzigingen

**Stappenplan**:

1. **Backup originele prompt**:
   ```javascript
   // Kopieer de oude prompt naar een comment voor het geval
   /* ORIGINAL PROMPT:
   content: `Extract the CUSTOMER information...`
   */
   ```

2. **Maak wijziging**:
   ```javascript
   content: `Extract the CUSTOMER information...

   [JOUW NIEUWE INSTRUCTIES HIER]`
   ```

3. **Test met echte documenten**:
   - Reload extensie
   - Upload test document
   - Check console logs voor extracted data
   - Vergelijk met verwachte resultaten

4. **Itereer**:
   - Als het beter is maar nog niet perfect: verfijn verder
   - Als het slechter is: revert naar backup
   - Document je wijzigingen voor toekomstige referentie

**Debug Logging Toevoegen**:

Om te zien wat AI precies ziet:
```javascript
// Voeg toe VOOR de AI call:
console.log('=== TEXT BEING SENT TO AI ===');
console.log(extractedText.substring(0, 1000)); // Eerste 1000 characters
console.log('=== END TEXT ===');

// Voeg toe NA de AI call:
console.log('=== AI RAW RESPONSE ===');
console.log(data.choices[0].message.content);
console.log('=== END RESPONSE ===');
```

Dit helpt je begrijpen waarom AI bepaalde keuzes maakt.

**Veelvoorkomende Prompt Verbeteringen**:

| Probleem | Oplossing in Prompt |
|----------|---------------------|
| AI vindt veld niet | Voeg meer voorbeelden en locaties toe waar veld kan staan |
| AI pakt verkeerde data | Voeg expliciete exclusies toe (NOT the company name) |
| Format is verkeerd | Geef exact format voorbeeld en conversie instructies |
| Inconsistente resultaten | Maak instructies meer specifiek en step-by-step |
| AI zegt "null" te veel | Geef meer context over waar te zoeken en hoe te herkennen |

---

## Automatisering Blijft Hangen

### 1. Stuck op Specifieke Stap

**Symptomen:**
```
Status panel: "Step: date_continued" (verandert niet)
Console: Geen nieuwe log berichten
```

**Debug Stappen:**

#### A. Check Console voor Errors
```javascript
// Zoek naar:
"Element #selector not found within timeout"
"Click cancelled - automation paused or stopped"
```

**Oplossing:**
- Als element niet gevonden: zie [Selector ID's Zijn Veranderd](#selector-ids-zijn-veranderd)
- Als paused: klik "Hervat" in status panel

#### B. Check of Stap Detectie Werkt

Open Console en run:
```javascript
// Kopieer detectCurrentStep functie en run handmatig
detectCurrentStep();
// Kijk welke stap wordt gedetecteerd
```

**Als "unknown" returned:**
- Zie [Nieuwe Pagina Toegevoegd aan Flow](#nieuwe-pagina-toegevoegd-aan-flow)

**Als correcte stap returned:**
- Stap detectie werkt, maar logica faalt
- Check de stap logica in `startFullAutomation()`

#### C. Handmatig Doorstappen

1. **Klik "Pauze"** in status panel
2. **Voer de stap handmatig uit** (vul veld in of klik knop)
3. **Klik "Hervat"**
4. Automatisering gaat door vanaf volgende stap

### 2. Stuck op Meldcode Lookup

**Symptomen:**
```
Status: "Step: meldcode_lookup_opened"
Console: "Meldcode not found in table"
```

**Mogelijke Oorzaken:**

#### A. Meldcode Is Verkeerd
- Check `config.meldCode` in console
- Formaat moet zijn: `KA#####` (bijv. KA06175)

**Oplossing:**
- Handmatig de juiste meldcode invoeren in popup
- Of: verbeter factuur OCR extractie

#### B. Zoekresultaten Laden Langzaam
- Website reageert traag
- Zoekresultaten zijn nog niet geladen

**Oplossing:**
```javascript
// content.js regel ~1540
// Verhoog de wachttijd in de meldcode lookup:

// VOOR
await new Promise(r => setTimeout(r, 2000));

// NA (voor langzamere website)
await new Promise(r => setTimeout(r, 5000));
```

#### C. Tabel Structuur Veranderd
- Website gebruikt andere HTML structuur

**Debug:**
```javascript
// In console, check of table rows gevonden worden:
document.querySelectorAll('tr').length;
// Als 0: tabel selector is veranderd
```

**Oplossing:**
- Update de tabel selector in content.js regel ~1565

### 3. Infinite Loop: Automatisering Herstart Steeds Zelfde Stap

**Symptomen:**
- Loop detectie activeert NIET (step count reset)
- Automatisering gaat terug naar eerdere stap
- Console toont steeds dezelfde stappen

**Mogelijke Oorzaken:**

#### A. Page Navigation Loop
- Na klik gaat het terug naar vorige pagina

**Oplossing:**
```javascript
// Voeg check toe voor laatste klik timestamp
const lastClickTime = sessionStorage.getItem('lastClickFor_StapX');
const now = Date.now();

if (lastClickTime && (now - parseInt(lastClickTime)) < 5000) {
  console.log('⚠️ Already clicked recently, waiting...');
  return;
}

sessionStorage.setItem('lastClickFor_StapX', now.toString());
// ... voer klik uit
```

#### B. Stap Detectie Te Breed
- Detecteert verkeerde stap

**Oplossing:**
- Maak detectie specifieker met extra checks
- Zie [Nieuwe Pagina Toegevoegd](#nieuwe-pagina-toegevoegd-aan-flow) voor betere detectie

---

## Document Upload Mislukt

### 1. Bestanden Worden Niet Geüpload

**Symptomen:**
```
Console: "File input not found"
Website toont error: "U moet een bestand uploaden"
```

**Mogelijke Oorzaken:**

#### A. File Input Selector Veranderd
```javascript
// content.js regel ~1670
const fileInput = document.querySelector('#file-input-id');
if (!fileInput) {
  console.error('File input not found');
}
```

**Oplossing:**
- Find nieuwe file input selector
- Update in `uploadFile()` functie calls

#### B. Bestanden Te Groot
- Chrome heeft limiet voor file uploads

**Oplossing:**
- Comprimeer bestanden
- PDF: gebruik PDF compressor
- Afbeeldingen: verklein tot max 2-3 MB

#### C. Verkeerd Bestandstype
- Website accepteert alleen bepaalde types

**Check in popup.html** welke types toegestaan zijn:
```html
<input type="file" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png">
```

**Oplossing:**
- Converteer bestand naar toegestaan type
- Update accept attribuut als nodig

### 2. Upload Succesvol maar Niet Opgeslagen

**Symptomen:**
```
Console: "✅ File uploaded successfully"
Maar: website toont nog steeds "Geen bestand"
```

**Mogelijke Oorzaken:**

#### A. Opslaan Knop Niet Geklikt
- Na upload moet er vaak een "Opslaan" of "Toevoegen" knop geklikt worden

**Check in content.js** na upload:
```javascript
// Stap 18: na bestanden uploaden
await clickElement('#opslaan-knop');  // Moet er zijn!
```

**Oplossing:**
- Voeg opslaan knop klik toe na uploads

#### B. Website Validatie Faalt
- Website valideert bestandstype of grootte
- Validatie error wordt niet gedetecteerd

**Debug:**
- Klik pauze na upload
- Check handmatig of error bericht verschijnt
- Pas bestand aan indien nodig

---

## API Fouten

### Mistral AI API Errors

#### 1. 401 Unauthorized
```
Error: "Mistral API key is ongeldig. Controleer je API key in instellingen."
```

**Oplossing:**
- Controleer API key in instellingen
- Genereer nieuwe key op console.mistral.ai
- Copy-paste zorgvuldig (geen spaties)

#### 2. 429 Rate Limit
```
Error: "Mistral API rate limit bereikt. Wacht 30-60 seconden."
```

**Betekenis:**
- Te veel requests in korte tijd
- Mistral free tier heeft limieten

**Oplossing:**
- Wacht 60 seconden
- Upgrade Mistral plan voor hogere limits
- Verminder aantal OCR calls door handmatig data in te voeren

#### 3. 413 Payload Too Large
```
Error: "Bestand te groot voor OCR. Probeer een kleiner bestand of lagere resolutie."
```

**Oplossing:**
- Comprimeer PDF
- Verklein afbeelding resolutie
- Split grote PDF's in meerdere pagina's

#### 4. 500 Internal Server Error
```
Error: "Mistral API error (500): Internal Server Error"
```

**Betekenis:**
- Mistral server probleem
- Tijdelijke storing

**Oplossing:**
- Wacht 5-10 minuten
- Probeer opnieuw
- Check Mistral status page

#### 5. Network Error
```
Error: "Failed to fetch"
```

**Betekenis:**
- Internet connectie probleem
- CORS issue (zou niet moeten gebeuren)

**Oplossing:**
- Check internet verbinding
- Reload extensie
- Restart browser

---

## Browser Console Debugging

### Console Logs Begrijpen

De extensie gebruikt emoji's voor verschillende log types:

```javascript
// STAP DETECTIE
🎯 Detected: step_name            // Huidige stap gedetecteerd

// SUCCESS
✅ BSN found via regex            // Succesvol
✓ Betaalbewijs ready              // Klaar

// INFORMATIE
📎 Document uploaded              // Document actie
📦 Files stored                   // Opslag actie
🔄 Gegevens extraheren            // Proces bezig

// WAARSCHUWING
⚠️ Vision AI is uncertain         // Mogelijk probleem
⚠️ No matching elements found     // Let op

// ERROR
❌ Extraction Error               // Fout opgetreden
🛑 LOOP DETECTED                  // Kritieke waarschuwing
```

### Debugging Checklist

Als automatisering niet werkt:

1. **Open DevTools** (F12)
2. **Ga naar Console tab**
3. **Filter op emoji's** of zoek naar laatste bericht
4. **Check voor errors** (rood in console)
5. **Noteer laatste gedetecteerde stap**:
   ```
   🎯 Detected: personal_info_done
   ```
6. **Check of actie werd uitgevoerd**:
   ```
   ✅ BSN filled: 123456789
   ```
7. **Als error:**
   ```
   ❌ Element #selector not found
   ```
   - Zie [Selector ID's Zijn Veranderd](#selector-ids-zijn-veranderd)

### Handmatige Stap Debugging

Om een specifieke stap te debuggen:

```javascript
// 1. Open console op eloket.nl
// 2. Check huidige stap detectie
detectCurrentStep();
// Returns: "personal_info_done"

// 3. Check of element bestaat
document.querySelector('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edBSNnummer');
// Als null: selector veranderd

// 4. Vind alle inputs op pagina
document.querySelectorAll('input[type="text"]').forEach((el, i) => {
  console.log(i, el.id, el.name);
});
// Vind de juiste selector

// 5. Test de selector
document.querySelector('#nieuwe-selector').value = 'test';
// Als het werkt, update de code
```

### Performance Debugging

Als automatisering traag is:

```javascript
// Check aantal actieve timeouts
console.log('Active timeouts:', activeTimeouts.length);

// Check of veel loops
console.log('Step execution count:', stepExecutionCount);
console.log('Last executed step:', lastExecutedStep);

// Check session storage grootte
console.log('Session storage:',
  JSON.stringify(sessionStorage).length, 'bytes');
```

---

## Veelgestelde Vragen

### Q: Kan ik de automatisering pauzeren?
**A:** Ja, klik "Pauze" in het status panel. Klik "Hervat" om door te gaan.

### Q: Worden mijn klantgegevens opgeslagen?
**A:** Nee, alle gegevens worden gewist zodra je de popup sluit. Alleen API key en bedrijfsgegevens worden opgeslagen.

### Q: Kan ik meerdere aanvragen tegelijk doen?
**A:** Nee, elke tab kan maar 1 automatisering tegelijk draaien. Open meerdere tabs voor parallelle aanvragen.

### Q: Wat als de website verandert?
**A:** Gebruik deze guide om selectors en stappen bij te werken. Alle wijzigingen zijn in `content.js`.

### Q: Moet ik programmeren kunnen gebruiken?
**A:** Basis JavaScript kennis is handig voor selector updates. Volg de stap-voor-stap instructies in deze guide.

### Q: Kan ik de extensie debuggen zonder eHerkenning?
**A:** Ja, maar je komt niet verder dan de login. Test OCR extractie kan wel zonder login (alleen popup testen).

### Q: Werkt het in Firefox/Safari?
**A:** Nee, alleen Chrome. De extensie gebruikt Chrome-specifieke APIs (Manifest V3).

---

## Contact & Hulp

Als je vastloopt:

1. **Check deze Troubleshooting Guide** eerst
2. **Bekijk TECHNISCHE_OVERDRACHT.md** voor code uitleg
3. **Check console logs** met emoji's
4. **Probeer handmatig de stap** en klik Hervat

Voor complexe problemen:
- Kopieer console logs
- Noteer de stap waar het vastloopt
- Beschrijf wat je al geprobeerd hebt

---

**Document Versie**: 1.0
**Laatste Update**: 2025-01-26
**Auteur**: Rehan (met hulp van Claude AI)
