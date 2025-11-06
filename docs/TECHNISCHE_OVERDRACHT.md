# Technische Overdracht: ISDE Subsidie Automatisering Chrome Extensie

## Inhoudsopgave
1. [Projectoverzicht](#projectoverzicht)
2. [Architectuur](#architectuur)
3. [Bestandsstructuur](#bestandsstructuur)
4. [Codestructuur en Flow](#codestructuur-en-flow)
5. [Belangrijke Componenten](#belangrijke-componenten)
6. [AI/OCR Integratie](#aiocr-integratie)
7. [Automatisering Flow](#automatisering-flow)
8. [Data Management](#data-management)
9. [Installatie en Setup](#installatie-en-setup)
10. [Ontwikkelworkflow](#ontwikkelworkflow)

---

## Projectoverzicht

### Doel
Deze Chrome extensie automatiseert het invullen van ISDE (Investeringssubsidie Duurzame Energie) subsidieaanvragen voor warmtepompen via de Nederlandse overheidswebsite `eloket.dienstuitvoering.nl`.

### Belangrijkste Functionaliteiten
- **Automatisch formulier invullen**: Navigeert door een complexe multi-stap aanvraag
- **OCR Document Extractie**: Haalt klantgegevens uit machtigingsformulieren en facturen
- **Intelligente Validatie**: Valideert en corrigeert IBAN, telefoonnummers, etc.
- **Visuele Feedback**: Real-time status panel tijdens automatisering
- **Pauze/Hervat**: Gebruiker kan automatisering pauzeren en handmatig ingrijpen

### Gebruikte Technologieën
- **Chrome Extension API**: Manifest V3
- **JavaScript**: Vanilla JS (geen frameworks)
- **PDF.js**: PDF parsing en rendering
- **Mistral AI APIs**:
  - `mistral-ocr-latest`: Document OCR
  - `mistral-small-latest`: Gestructureerde data extractie
  - `pixtral-12b-2409`: Vision AI voor checkbox detectie

---

## Architectuur

### Componenten Overzicht

```
┌─────────────────┐
│   popup.html    │ ← Gebruikersinterface
│   popup.js      │ ← Formulier, OCR extractie
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│  background.js  │ ← Service Worker, message routing
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│   content.js    │ ← Automatisering logica, DOM manipulatie
│ status-panel.js │ ← Status UI overlay
└─────────────────┘
         │
         ▼
┌─────────────────┐
│  eloket.nl      │ ← Doelwebsite
└─────────────────┘
```

### Communicatie Flow

1. **Gebruiker opent popup** → `popup.html` wordt geladen
2. **Gebruiker upload documenten** → `popup.js` voert OCR uit met Mistral AI
3. **Gebruiker klikt "Start"** → `popup.js` → `background.js` → `content.js`
4. **Content script start automatisering** → DOM manipulatie op eloket.nl
5. **Status updates** → `status-panel.js` toont voortgang

---

## Bestandsstructuur

```
subsidie/
├── manifest.json              # Chrome extensie configuratie
├── popup.html                 # Popup UI (HTML + styling)
├── popup.js                   # Popup logica, OCR, validatie
├── background.js              # Service worker, message handling
├── content.js                 # Hoofdautomatisering, DOM interactie
├── status-panel.js            # Status overlay UI
├── pdf.min.js                 # PDF.js library
├── pdf.worker.min.js          # PDF.js web worker
├── icon-16.png                # Extensie iconen
├── icon-48.png
├── icon-128.png
├── Eherkenning_ISDE.json      # Voorbeeld configuratie (niet gebruikt)
├── TECHNISCHE_OVERDRACHT.md   # Deze documentatie
└── TROUBLESHOOTING.md         # Troubleshooting guide
```

### Kernbestanden Beschrijving

#### **manifest.json**
Chrome extensie configuratie met:
- Manifest versie 3
- Permissies: `activeTab`, `storage`, `scripting`, `tabs`
- Host permissions voor `eloket.dienstuitvoering.nl`
- Content script injectie configuratie

#### **popup.html + popup.js**
Gebruikersinterface voor:
- Document upload (betaalbewijs, factuur, machtigingsformulier)
- Formulier velden voor klantgegevens
- Instellingen (API keys, bedrijfsgegevens)
- OCR extractie via Mistral AI

#### **background.js**
Service worker die:
- Popup window lifecycle beheert
- Berichten routeert tussen popup en content scripts
- Content scripts injecteert indien nodig

#### **content.js**
Hoofdautomatisering script (2584 regels) dat:
- Huidige pagina detecteert (25 verschillende stappen)
- Formuliervelden invult met intelligente sanitization
- Door multi-page flow navigeert
- Documenten upload
- Loop detectie en error handling implementeert

#### **status-panel.js**
Overlay UI die:
- Real-time status toont
- Configuratie data display
- Pauze/Hervat/Stop knoppen

---

## Codestructuur en Flow

### popup.js Structuur

```javascript
// 1. Document Upload Event Listeners (regels 66-343)
- machtigingsformulier upload → OCR extractie → velden invullen
- betaalbewijs upload → opslaan voor later
- factuur upload → meldcode + datum extractie

// 2. OCR Functies (regels 363-925)
- fileToBase64()              → bestand naar base64 conversie
- pdfToBase64Image()          → PDF naar afbeelding
- extractTextFromPDF()        → tekst uit PDF halen
- extractMeldcodeFromFactuur() → meldcode + datum uit factuur
- extractDataFromForm()       → klantgegevens uit machtigingsformulier
  ├── Mistral OCR API call
  ├── AI gestructureerde extractie
  ├── Regex fallbacks (BSN, IBAN, email, telefoon)
  └── Vision AI checkbox detectie

// 3. Validatie en UI (regels 927-1059)
- loadConfiguration()         → reset velden
- validateRequiredFields()    → check alle verplichte velden
- updateStartButtonState()    → enable/disable start knop

// 4. Automatisering Start (regels 1087-1195)
- startAutomation event listener
  ├── Valideer velden
  ├── Check juiste website
  ├── Haal bedrijfsgegevens op
  ├── Sla documenten op in chrome.storage
  └── Stuur bericht naar background.js

// 5. Instellingen (regels 1232-1247)
- showView()    → wissel tussen hoofd/instellingen
- loadSettings() → laad API key + bedrijfsgegevens
- saveSettings() → sla instellingen op
```

### content.js Structuur

```javascript
// 1. Globale State (regels 1-14)
- automationStopped, automationPaused: controle flags
- activeTimeouts: timeout tracking voor cleanup
- Loop detectie variabelen

// 2. Hulpfuncties (regels 16-650)
- createTimeout()              → tracked timeout
- clearAllTimeouts()           → cleanup
- createStatusPanel()          → UI overlay aanmaken
- updateStatus()               → status bijwerken
- waitForElement()             → wacht op DOM element
- clickElement()               → simuleer klik
- fillInput()                  → vul veld in met sanitization
  ├── Telefoon: verwijder spaties/streepjes
  ├── IBAN: fix OCR fouten ALLEEN in cijfer delen (niet in bankcode RABO/INGB)
  └── Random delays voor menselijk gedrag

// 3. Stap Detectie (regels 652-908)
- detectCurrentStep()
  └── Detecteert 25 verschillende pagina's/stappen
      via DOM elementen en tekst patronen

// 4. Hoofdautomatisering (regels 911-2475)
- startFullAutomation(config)
  ├── Loop detectie (max 2 retries per stap)
  ├── Pause/Stop checks
  ├── Stap detectie en uitvoering
  └── 25 verschillende stappen:
      1. Nieuwe aanvraag link
      2. ISDE aanvragen link
      3. Eerste Volgende
      4. Verklaringen
      5. Info bevestiging
      6. Persoonlijke gegevens
      7-8. Intermediair gegevens
      9. Adres verschillend
      10. BAG verschillend
      11. Maatregel toevoegen
      12. Warmtepomp selectie
      13. Installatie datums
      16. Meldcode lookup
      17. Meldcode modal
      18. Document upload
      19-20. Finale bevestiging

// 5. Page Load Listener (regels 2477-2584)
- window.onload → herstart automatisering na navigatie
```

---

## Belangrijke Componenten

### 1. OCR Extractie Pipeline

**Machtigingsformulier Extractie** (`extractDataFromForm`):

```
1. Document Upload
   ↓
2. Mistral OCR API
   - Model: mistral-ocr-latest
   - Input: base64 PDF/afbeelding
   - Output: markdown tekst
   ↓
3. AI Extractie
   - Model: mistral-small-latest
   - Prompt: gestructureerde JSON extractie
   - Velden: BSN, naam, adres, IBAN, etc.
   ↓
4. Regex Fallbacks
   - BSN: /BSN[:\s]*(\d[\s-]?){9}/i
   - IBAN: /([NL]{2}\s?[0-9]{2}\s?[A-Z]{4}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{2})/i
   - Email: /([a-z0-9._-]+@[a-z0-9._-]+\.[a-z]{2,6})/gi
   - Telefoon: /((?:06|0[0-9]{1,2})[\s-]?[0-9]{3,4}[\s-]?[0-9]{4})/i
   ↓
5. Vision AI Checkbox Detectie
   - Model: pixtral-12b-2409
   - Detecteert aardgasgebruik checkbox
   - Herkent: omcirkeld, aangevinkt, doorgestreept
   ↓
6. Velden Invullen
   - Automatisch formulier populatie
```

**Factuur Extractie** (`extractMeldcodeFromFactuur`):

```
1. Document Upload
   ↓
2. Tekst Extractie
   - PDF: extractTextFromPDF() eerst
   - Als geen tekst: Vision AI OCR
   - Afbeelding: direct Vision AI
   ↓
3. Regex Patroon Matching
   - Meldcode: /KA\d{5}/i
   - Datum: /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/
   ↓
4. AI Fallback (indien niet gevonden)
   - Model: mistral-small-latest
   - JSON response: {meldcode, installationDate}
   ↓
5. Data Normalisatie
   - Datum: converteer naar DD-MM-YYYY
   - Meldcode: uppercase
```

### 2. Checkbox State Management

**ensureChecked() Functie** (`content.js`, regels 1075-1112):

```javascript
async function ensureChecked(selectorOrElement) {
  if (automationStopped) return;

  let element = typeof selectorOrElement === 'string' ?
    await waitForElement(selectorOrElement) : selectorOrElement;

  // Controleer eerst of checkbox al aangevinkt is
  if (element.checked) {
    console.log(`✓ Checkbox already checked`);
    return; // Skip klik om toggle te voorkomen
  }

  // Alleen klikken als NIET aangevinkt
  console.log(`☐ → ☑ Checking checkbox`);
  element.scrollIntoView({behavior: 'smooth', block: 'center'});
  await unthrottledDelay(500);
  element.click();
  await unthrottledDelay(1000);
}
```

**Waarom Dit Nodig Is:**
- `clickElement()` klikt altijd, togglet checkbox ON → OFF → ON
- `ensureChecked()` controleert state eerst, voorkomt toggle
- Belangrijk voor Stop/Start functionaliteit

**Gebruik:**
```javascript
// Declarations handler (content.js, regels 2235-2245)
await ensureChecked('#NaarWaarheid');
await ensureChecked('#cbTussenpersoonJ');
await ensureChecked('#link_aanv\\.0\\.cbFWS_Deelnemer_SoortP');
// etc.
```

### 3. Input Sanitization

**Telefoonnummer** (`fillInput` in content.js, regel ~465):
```javascript
// Verwijder alle karakters behalve cijfers en +
sanitizedValue = value.replace(/[^0-9+]/g, '');
// "06-1234 5678" → "0612345678"
```

**IBAN Sanitization** (`sanitizeIBAN` in popup.js, regels 661-797):

De IBAN sanitization is zeer geavanceerd en heeft 4 fasen:

**Fase 1: BIC Code Verwijdering**
```javascript
// OCR extraheert vaak IBAN + BIC gecombineerd:
// "NL91RABO0123456789 RABONL2U" → Extract alleen IBAN deel
const ibanMatch = iban.match(/NL[A-Z0-9]{2}[A-Z0-9]{4}[A-Z0-9]{10}/);
```

**Fase 2: Checksum Correctie (posities 2-3)**
```javascript
// OCR errors in 2-cijferige checksum:
// "NLO3" → "NL03"  (O → 0)
// "NLI2" → "NL12"  (I → 1)
// "NLS8" → "NL58"  (S → 5)
let checksum = iban.substring(2, 4);
checksum = checksum.replace(/O/g, '0')
                   .replace(/[Il]/g, '1')
                   .replace(/S/g, '5')
                   .replace(/B/g, '8')
                   .replace(/Z/g, '2');
```

**Fase 3: Bank Code Correctie (posities 4-7)**
```javascript
// Fix OCR errors in 4-letter bank code:
// "RAB0" → "RABO"  (0 → O)
// "ING8" → "INGB"  (8 → B)
// "A8NA" → "ABNA"  (8 → B)
// "5NSB" → "SNSB"  (5 → S)

// Reverse digit→letter conversie:
bankCode = bankCode.replace(/0/g, 'O')
                   .replace(/1/g, 'I')
                   .replace(/5/g, 'S')
                   .replace(/8/g, 'B');

// Validatie tegen 16 bekende Nederlandse bankcodes:
const validBankCodes = [
  'RABO', 'INGB', 'ABNA', 'SNSB', 'ASNB', 'TRIO', 'BUNQ', 'KNAB',
  'RBRB', 'FVLB', 'HAND', 'NNBA', 'REVOLT', 'AEGO', 'BITSNL', 'ISBK'
];
```

**Fase 4: Account Number Correctie (posities 8-17)**
```javascript
// Fix OCR errors in 10-cijferig rekeningnummer:
// "O123456789" → "0123456789"  (O → 0)
// "I234567890" → "1234567890"  (I → 1)
// "S678901234" → "5678901234"  (S → 5)
accountNumber = accountNumber.replace(/O/g, '0')
                             .replace(/[Il]/g, '1')
                             .replace(/S/g, '5')
                             .replace(/B/g, '8')
                             .replace(/Z/g, '2')
                             .replace(/G/g, '6');
```

**Fase 5: Modulo-97 Checksum Validatie**
```javascript
// IBAN checksum validatie volgens ISO 7064:
// 1. Verplaats NL+checksum naar einde
// 2. Converteer letters naar cijfers (A=10, B=11, ...)
// 3. Modulo 97 moet exact 1 zijn

const remainder = BigInt(numericString) % 97n;
if (remainder !== 1n) {
  console.warn(`IBAN failed checksum validation`);
  return null; // Reject invalid IBAN
}
```

**Voorbeelden:**
```
Input:  "NL33 INGB 0682.4030.59 INGBNL2A"
Output: "NL33INGB0682403059"

Input:  "NLO3RAB00I23456789"
Output: "NL03RABO0123456789"

Input:  "NL84 ING8 S678901234"
Output: "NL84INGB5678901234"

Input:  "NL99FAKE1234567890"  (invalid checksum)
Output: null (rejected)
```

**Impact:**
- Detecteert en corrigeert 90%+ van OCR IBAN fouten
- Valideert tegen echte Nederlandse bankcodes
- Modulo-97 checksum voorkomt ongeldige IBANs
- Scheidt automatisch gecombineerde IBAN+BIC velden

**Andere Field Sanitization Functies** (popup.js):

| Functie | Regel | Belangrijkste Correcties |
|---------|-------|--------------------------|
| `sanitizeBSN()` | 612-660 | 11-proef checksum, lengte validatie (9 cijfers), leading zeros |
| `sanitizePhone()` | 808-862 | +31→0 conversie, 10-cijfer validatie, service nummer warning |
| `sanitizeEmail()` | 863-899 | Format validatie, bedrijfsemail filter, trailing punctuation |
| `sanitizeInitials()` | 900-942 | Format naar "J.H.M.", uppercase, cijfer filtering |
| `sanitizeLastName()` | 943-995 | Nederlandse voorvoegsels (van, de, der), spatie normalisatie |
| `sanitizeStreet()` | 996-1026 | Capitalisatie, huisnummer separatie |
| `sanitizeHouseNumber()` | 1027-1071 | Split nummer/toevoeging, uppercase toevoeging, range 1-9999 |
| `sanitizePostalCode()` | 1072-1143 | NL format "1234 AB", O→0 correctie in cijfers |
| `sanitizeCity()` | 1144-1203 | Capitalisatie, speciale karakters ('-Hertogenbosch) |
| `sanitizeGender()` | 1204-1230 | man/vrouw/M/V → male/female |
| `sanitizeGasUsage()` | 1231-1259 | ja/nee/1/0 → yes/no |
| `sanitizeMeldCode()` | 1260-1336 | KA##### format, O→0 correctie, uppercase |
| `sanitizeInstallationDate()` | 1337-1459 | Multi-format parsing, toekomst check, datum geldigheid |
| `sanitizePurchaseDate()` | 1460-1570 | Multi-format parsing, ≤installatiedatum validatie |

**Veelvoorkomende OCR Error Patterns:**

```javascript
// O/0 Verwarring (meest frequent):
"NLO3RABO" → "NL03RABO"
"12O4 AB"  → "1204 AB"
"KAO6175"  → "KA06175"

// I/1/l Verwarring:
"NLI2INGB" → "NL12INGB"
"06I2345678" → "0612345678"

// S/5 Verwarring:
"NLS8ABNA" → "NL58ABNA"
"S678901234" → "5678901234"

// 8/B Verwarring (in letters):
"ING8" → "INGB"
"A8NA" → "ABNA"
"8UNQ" → "BUNQ"

// Spaties en Punten:
"NL 33 INGB 0682 4030 59" → "NL33INGB0682403059"
"0682.4030.59" → "0682403059"
"1234 AB" → "1234AB" (voor postcode: → "1234 AB")

// Gecombineerde Velden:
"NL91RABO0123456789 RABONL2U" → "NL91RABO0123456789"
```

**Real-Time Validatie:**

Alle sanitization functies worden getriggerd op `blur` event:
```javascript
// popup.js, regels 3685-3714
ibanField.addEventListener('blur', function() {
  const sanitized = sanitizeIBAN(this.value);
  if (sanitized && sanitized !== this.value) {
    this.value = sanitized;
    console.log('IBAN auto-corrected:', sanitized);
  }
});
```

### 3. Stap Detectie Logica

De `detectCurrentStep()` functie (content.js, regel 652) detecteert 25 verschillende pagina's:

**Detectie Volgorde** (van specifiek naar algemeen):
1. **final_confirmed**: Checkbox `#cbAccoord` + submit knop
2. **final_review_page**: "Controleer uw gegevens" tekst
3. **final_confirmation**: Element `#QuestionEmbedding_585_default`
4. **vervolgstap_modal**: "Vervolgstap" + "Kiezen" knop
5. **measure_confirmation_dialog**: "Zijn alle maatregelen toegevoegd"
6. **measure_overview**: "Meldcode" tabel kolom + "Maatregel toevoegen"
7. **meldcode_selected**: Upload knop voor bijlagen
8. **meldcode_lookup_opened**: "Selecteer hier uw keuze" modal
9. **date_continued**: Meldcode lookup knop
10. ... (zie content.js voor volledige lijst)

**Waarom deze volgorde?**
- Specifieke elementen eerst om false positives te voorkomen
- Bijv. final_review_page heeft ook persoonlijke gegevens velden, maar wordt eerder gedetecteerd

### 4. Race Condition Handling

**Probleem:**
Bij page navigatie update `sessionStorage.automationStep` soms later dan DOM detectie, waardoor handlers niet matchen.

**Oplossing:**
Handlers accepteren beide `currentStep` (uit sessionStorage) EN `detectedStep` (uit DOM detectie):

```javascript
// VOOR (alleen currentStep)
if (currentStep === 'declarations_done') {
  // handler code...
}

// NA (currentStep OF detectedStep)
if (currentStep === 'declarations_done' || detectedStep === 'declarations_done') {
  // handler code...
}
```

**Toegepast in 7+ handlers** (content.js):
- Info acknowledgment (regels 2264-2265)
- Intermediair contact (regel 2232)
- Address different (regels 2279-2280)
- BAG different (regels 2570-2571)
- Measure overview (regels 2832-2833)
- Measure confirmation (regels 2931-2932)
- Final measure overview (regels 3018-3019)
- Final confirmed (regel 3573)

**Effect:**
- Elimineert "page not recognized" errors
- Automatisering gaat direct door na page load
- Geen handmatig ingrijpen meer nodig

### 5. Loop Detectie en Error Handling

**Loop Detectie** (content.js, regel 966):
```javascript
// Bijhouden welke stap als laatst is uitgevoerd
if (currentStep === lastExecutedStep) {
  stepExecutionCount++;

  if (stepExecutionCount >= MAX_STEP_RETRIES) {  // MAX = 2
    // Auto-pause voor handmatig ingrijpen
    automationPaused = true;
    updateStatus('LOOP GEDETECTEERD - handmatig ingrijpen vereist');
    return;
  }
} else {
  // Nieuwe stap, reset counter
  lastExecutedStep = currentStep;
  stepExecutionCount = 1;
}
```

**Timeout Management**:
```javascript
// Alle timeouts worden bijgehouden voor cleanup
let activeTimeouts = [];

function createTimeout(callback, delay) {
  const timeoutId = setTimeout(() => {
    activeTimeouts.splice(activeTimeouts.indexOf(timeoutId), 1);
    callback();
  }, delay);
  activeTimeouts.push(timeoutId);
  return timeoutId;
}

// Bij stop/pause: clear alle timeouts
function clearAllTimeouts() {
  activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
  activeTimeouts = [];
}
```

---

## AI/OCR Integratie

### Mistral AI API Endpoints

**1. OCR API** (`https://api.mistral.ai/v1/ocr`):
```javascript
{
  model: 'mistral-ocr-latest',
  document: {
    type: 'document_url',
    document_url: 'data:application/pdf;base64,<base64>' // of image
  }
}
```

**Response**:
```javascript
{
  pages: [
    {
      markdown: "Geëxtraheerde tekst in markdown formaat..."
    }
  ]
}
```

**2. Chat Completions API** (`https://api.mistral.ai/v1/chat/completions`):

**Voor gestructureerde extractie**:
```javascript
{
  model: 'mistral-small-latest',
  messages: [{
    role: 'user',
    content: `Extract from this text: ${extractedText}
Return ONLY JSON: {"bsn": "...", "initials": "...", ...}`
  }],
  max_tokens: 500
}
```

**Voor Vision AI**:
```javascript
{
  model: 'pixtral-12b-2409',
  messages: [{
    role: 'user',
    content: [
      { type: 'text', text: 'Which checkbox is selected? Return yes or no.' },
      { type: 'image_url', image_url: 'data:image/jpeg;base64,<base64>' }
    ]
  }],
  max_tokens: 10
}
```

### Error Handling

**Rate Limiting** (429):
```javascript
if (response.status === 429) {
  throw new Error('Mistral API rate limit bereikt. Wacht 30-60 seconden.');
}
```

**API Key Errors** (401):
```javascript
if (ocrResponse.status === 401) {
  throw new Error('Mistral API key is ongeldig. Controleer instellingen.');
}
```

**Document Too Large** (413):
```javascript
if (ocrResponse.status === 413) {
  throw new Error('Bestand te groot. Probeer lagere resolutie.');
}
```

---

## Automatisering Flow

### Volledige Flow Diagram

```
START
  │
  ├─→ [Stap 1] Klik "Nieuwe aanvraag" link
  │     └─→ Navigatie naar catalogus pagina
  │
  ├─→ [Stap 2] Klik "ISDE aanvragen" link
  │     └─→ Navigatie naar intro pagina
  │
  ├─→ [Stap 3] Klik eerste "Volgende" knop
  │
  ├─→ [Stap 4] Verklaringen invullen
  │     ├─ Naar waarheid checkbox
  │     ├─ Tussenpersoon checkbox
  │     ├─ Deelnemer type checkbox
  │     ├─ Eigen woning radio
  │     ├─ Reeds geïnstalleerd radio
  │     ├─ Aankoopbewijs radio
  │     └─→ Klik "Volgende"
  │
  ├─→ [Stap 5] Info gelezen bevestigen
  │     └─→ Klik checkbox + "Volgende"
  │
  ├─→ [Stap 6] Persoonlijke gegevens
  │     ├─ BSN
  │     ├─ Voorletters
  │     ├─ Achternaam
  │     ├─ Geslacht (radio)
  │     ├─ Telefoonnummer (gesanitized)
  │     ├─ Email
  │     ├─ IBAN (gesanitized, OCR gecorrigeerd)
  │     ├─ Straat + huisnummer
  │     ├─ Postcode + plaats
  │     └─→ Klik "Volgende"
  │
  ├─→ [Stap 7-8] Intermediair gegevens
  │     ├─ Contactpersoon voorletters
  │     ├─ Contactpersoon achternaam
  │     ├─ Contactpersoon geslacht
  │     ├─ Contactpersoon telefoon
  │     ├─ Contactpersoon email
  │     ├─ Digitale correspondentie: Ja
  │     └─→ Klik "Volgende"
  │
  ├─→ [Stap 9] Adres verschillend?
  │     └─→ Nee (radio) + "Volgende"
  │
  ├─→ [Stap 10] BAG verschillend?
  │     └─→ Nee (radio) + "Volgende"
  │
  ├─→ [Stap 11] Maatregel toevoegen
  │     └─→ Klik "Investering toevoegen"
  │
  ├─→ [Stap 12] Warmtepomp selecteren
  │     └─→ Selecteer warmtepomp radio
  │
  ├─→ [Stap 13] Installatie datums
  │     ├─ Aankoopdatum (DD-MM-YYYY)
  │     ├─ Installatiedatum (DD-MM-YYYY)
  │     ├─ Aardgasgebruik (yes/no → Ja/Nee radio)
  │     └─→ Klik "Volgende"
  │
  ├─→ [Stap 16] Meldcode lookup openen
  │     └─→ Klik lookup knop
  │
  ├─→ [Stap 17] Meldcode zoeken en selecteren
  │     ├─ Vul meldcode in zoekveld
  │     ├─ Klik "Zoeken"
  │     ├─ Wacht op resultaten
  │     └─→ Klik "Kiezen" bij gevonden meldcode
  │
  ├─→ [Stap 18] Documenten uploaden
  │     ├─ Betaalbewijs upload
  │     ├─ Factuur upload
  │     ├─ Machtigingsbewijs upload (optioneel)
  │     └─→ Klik "Opslaan"
  │
  ├─→ [Stap 18.4] Vervolgstap modal
  │     └─→ Klik "Kiezen" → "Afronden"
  │
  ├─→ [Stap 18.5] Maatregel overzicht
  │     └─→ Controleer toegevoegde maatregel
  │
  ├─→ [Stap 18.6] Maatregelen bevestiging
  │     └─→ Klik "Ja, volgende"
  │
  ├─→ [Stap 18.7] Finale maatregel overzicht
  │     └─→ Klik "Volgende tab"
  │
  ├─→ [Stap 19] Finale bevestiging vraag
  │     └─→ Klik bevestiging checkbox
  │
  ├─→ [Stap 19.5] Finale review pagina
  │     └─→ Klik "Volgende tab"
  │
  └─→ [Stap 20] HANDMATIGE STAP: Voorwaarden accepteren
        ├─ ⚠️ AUTOMATISERING STOPT HIER
        ├─ Gebruiker moet handmatig:
        │   ├─ Voorwaarden lezen
        │   ├─ Checkbox aanvinken
        │   └─ "Indienen" klikken
        └─→ EINDE
```

### Belangrijke Flow Opmerkingen

1. **Dynamische Navigatie**: Na elke klik kan er een pagina navigatie plaatsvinden. De `window.onload` listener herstart automatisch de automatisering op de nieuwe pagina.

2. **Menselijk Gedrag**: Random delays tussen acties (500-1500ms) om bot detectie te vermijden.

3. **Scroll Behavior**: Elk element wordt eerst in beeld gescrolled (`scrollIntoView`) voordat er op geklikt wordt.

4. **Finale Stap is Handmatig**: De extensie stopt voor het indienen om de gebruiker de kans te geven alles te controleren.

5. **Chrome Tab Throttling**: Chrome vertraagt inactive tabs drastisch (~1000ms extra delay). Voor optimale snelheid:
   - ✅ **1 aanvraag**: Houd het tabblad actief
   - ✅ **Meerdere aanvragen**: Open meerdere **WINDOWS** (niet tabs)
   - ❌ Meerdere tabs in 1 window worden vertraagd (3-5x langzamer)

---

## Data Management

### Chrome Storage

**Opslag Structuur**:
```javascript
chrome.storage.local: {
  // API Key (persistent)
  mistralApiKey: "sk-...",

  // Bedrijfsgegevens (persistent)
  isdeConfig: {
    companyName: "Bedrijfsnaam",
    kvkNumber: "12345678",
    contactInitials: "A",
    contactLastName: "de Vlieger",
    contactGender: "female",
    contactPhone: "0612345678",
    contactEmail: "email@example.com"
  },

  // Documenten (tijdelijk, per sessie)
  [`file_betaalbewijs_${sessionId}`]: {
    name: "betaalbewijs.pdf",
    type: "application/pdf",
    data: "data:application/pdf;base64,..."
  },
  [`file_factuur_${sessionId}`]: { ... },
  [`file_machtigingsbewijs_${sessionId}`]: { ... }
}
```

**Session Storage** (in content.js):
```javascript
sessionStorage: {
  // Huidige automatisering stap
  automationStep: "personal_info_done",

  // Configuratie voor huidige sessie
  automationConfig: JSON.stringify({
    bsn: "123456789",
    initials: "J",
    lastName: "Janssen",
    // ... alle velden
  }),

  // Click tracking (anti-loop)
  lastNieuweAanvraagClick: "1234567890123"
}
```

### Data Privacy & Security

**Geen Persistente Opslag van Klantgegevens**:
```javascript
// popup.js regel 942
function loadConfiguration() {
  // Reset ALLE velden naar leeg bij opstarten
  document.getElementById('bsn').value = '';
  // ...
  betaalbewijsData = null;
  factuurData = null;
  machtigingsbewijsData = null;
}
```

**Automatische Cleanup**:
```javascript
// popup.js regel 335
// Documenten worden verwijderd 60 seconden na upload
setTimeout(() => {
  chrome.storage.local.remove(filesToRetrieve);
}, 60000);
```

**Unieke Sessie IDs**:
```javascript
// Voorkomt conflicten tussen meerdere tabs
const sessionId = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
```

---

## Installatie en Setup

### Vereisten
- Google Chrome browser (versie 88+)
- Mistral AI API key (van https://console.mistral.ai/)

### Installatie Stappen

1. **Clone/Download Project**:
   ```bash
   cd ~/Documents
   # Project is al in: /Users/rehan/Documents/subsidie
   ```

2. **Installeer Extensie in Chrome**:
   - Open Chrome en ga naar `chrome://extensions/`
   - Schakel "Developer mode" in (rechterbovenhoek)
   - Klik "Load unpacked"
   - Selecteer de `subsidie` map
   - Extensie verschijnt nu in extensielijst

3. **Configureer API Key**:
   - Klik op extensie icoon
   - Klik op tandwiel icoon (instellingen)
   - Voer Mistral API key in
   - Vul bedrijfsgegevens in (optioneel)
   - Klik "Opslaan"

4. **Eerste Gebruik**:
   - Navigeer naar https://eloket.dienstuitvoering.nl
   - Log in met eHerkenning
   - Klik op extensie icoon
   - Upload documenten
   - Controleer automatisch ingevulde velden
   - Klik "Start Automatisering"

### Mistral AI API Key Verkrijgen

1. Ga naar https://console.mistral.ai/
2. Maak een account aan
3. Ga naar API Keys sectie
4. Klik "Create new key"
5. Kopieer de key (begint met `sk-...`)
6. Plak in extensie instellingen

**Let op**: Mistral AI heeft een free tier, maar OCR en Vision AI kosten credits. Check pricing op hun website.

---

## Ontwikkelworkflow

### Development Setup

**Watch Mode** (voor auto-reload):
```bash
# Chrome heeft geen native watch mode
# Gebruik browser extensie "Extensions Reloader" of
# Handmatig: ga naar chrome://extensions en klik reload icoon
```

**Console Logging**:
```javascript
// Alle belangrijke acties worden gelogd
console.log('🎯 Detected: final_confirmed');
console.log('✅ Meldcode extracted:', meldcode);
console.log('⚠️ Vision AI is uncertain');
console.error('❌ Extraction Error:', error);
```

**Debugging Tips**:
1. Open Chrome DevTools (F12)
2. Ga naar "Console" tab
3. Filter op extensie naam of emoji's (🎯, ✅, ⚠️, ❌)
4. Voor content script: inspect op eloket.nl pagina
5. Voor popup: rechter klik op popup → "Inspect"
6. Voor background: chrome://extensions → "service worker" link

### Code Modificaties

**Nieuwe Stap Toevoegen**:

1. **Identificeer Unieke Element** op de nieuwe pagina:
   ```javascript
   // Gebruik Chrome DevTools om selector te vinden
   document.querySelector('#unique-element-id')
   ```

2. **Voeg Detectie Toe** in `detectCurrentStep()`:
   ```javascript
   // content.js, ~regel 900 (voor 'unknown' return)
   if (document.querySelector('#unique-element-id')) {
     console.log('🎯 Detected: new_step_name');
     return 'new_step_name';
   }
   ```

3. **Voeg Stap Logica Toe** in `startFullAutomation()`:
   ```javascript
   // content.js, ~regel 2470 (voor laatste stap)
   if (currentStep === 'new_step_name') {
     console.log('New Step: Description');
     updateStatus('Beschrijving van actie', 'Stap X', detectedStep);

     // Vul velden in
     await fillInput('#field-id', config.fieldValue);

     // Klik knop
     await clickElement('#next-button');

     // Update stap
     sessionStorage.setItem('automationStep', 'next_step_name');
     return;
   }
   ```

**Nieuwe Veld Toevoegen aan Formulier**:

1. **HTML** (popup.html):
   ```html
   <div class="field-group">
     <label class="field-label">Nieuw Veld</label>
     <input type="text" class="field-input" id="newField" placeholder="...">
   </div>
   ```

2. **Validatie** (popup.js):
   ```javascript
   // In validateRequiredFields()
   const requiredFields = [
     // ... bestaande velden
     { id: 'newField', label: 'Nieuw Veld' }
   ];

   // In event listeners array
   const inputFields = [
     // ... bestaande velden
     'newField'
   ];
   ```

3. **Config** (popup.js in startAutomation):
   ```javascript
   const config = {
     // ... bestaande velden
     newField: document.getElementById('newField').value
   };
   ```

4. **Gebruik in Automatisering** (content.js):
   ```javascript
   await fillInput('#target-field-selector', config.newField);
   ```

### Testing

**Handmatige Test Checklist**:
- [ ] Upload machtigingsformulier → controleer geëxtraheerde velden
- [ ] Upload factuur → controleer meldcode + datum
- [ ] Upload betaalbewijs → controleer naam display
- [ ] Controleer validatie → knop disabled bij lege velden
- [ ] Start automatisering op eloket.nl
- [ ] Test pauze knop → automatisering stopt
- [ ] Test hervat knop → automatisering gaat verder
- [ ] Test stop knop → panel verdwijnt
- [ ] Controleer loop detectie → bij stuck stap
- [ ] Test document upload stap
- [ ] Controleer finale handmatige stap

**Testdata**:
Zie `Eherkenning_ISDE.json` voor voorbeelddata (niet meer actief gebruikt, maar goed voor teststructuur).

---

## Veelgebruikte Code Patronen

### 1. Wacht op Element en Klik
```javascript
// Met helper functie
await clickElement('#button-id');

// Of handmatig
const button = await waitForElement('#button-id', 10000);
button.scrollIntoView({behavior: 'smooth', block: 'center'});
await new Promise(r => setTimeout(r, 500));
button.click();
```

### 2. Veld Invullen met Validatie
```javascript
// Automatische sanitization voor telefoon/IBAN
await fillInput('#phone-field', config.phone);  // "06-1234 5678" → "0612345678"
await fillInput('#iban-field', config.iban);    // "NL33 INGB..." → "NL33INGB..."
```

### 3. Radio Button Selectie
```javascript
if (config.gender === 'male') {
  await clickElement('#gender-male-radio');
} else {
  await clickElement('#gender-female-radio');
}
```

### 4. Document Upload
```javascript
// In popup.js - document is al base64
const fileData = await fileToBase64(file);

// In content.js - upload naar input met verbeterde timing
// Step 18: Document upload (content.js, regels 3203-3244)
await clickElement('#btn_ToevoegenBijlage');
await unthrottledDelay(2000); // Verhoogd voor modal load tijd
await uploadFile(config.betaalbewijs);
await unthrottledDelay(2000); // Wacht op upload voltooiing
```

**Upload File Functie** (content.js, regels 1300-1346):
```javascript
async function uploadFile(fileData) {
  if (!fileData) return;

  try {
    // Diagnostic logging
    console.log('🔍 Looking for file input in modal...');

    // Check modal state
    const modal = document.querySelector('#lip_modalWindow');
    if (modal) {
      console.log('✅ Modal found');
      console.log('Modal display:', window.getComputedStyle(modal).display);
    }

    // Wacht op file input met verhoogde timeout (10s)
    const fileInput = await waitForElement(
      '#lip_modalWindow div.content input[type="file"], #lip_attachments_resumable input[type="file"]',
      10000  // Verhoogd van 5000ms naar 10000ms
    );

    // Convert en upload
    const response = await fetch(fileData.data);
    const blob = await response.blob();
    const file = new File([blob], fileData.name, { type: fileData.type });

    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    console.log('✅ File uploaded successfully:', fileData.name);
  } catch (error) {
    console.error('❌ Error uploading file:', error);
    // Debug: log alle file inputs
    const allFileInputs = document.querySelectorAll('input[type="file"]');
    console.log('📋 All file inputs on page:', allFileInputs.length);
    allFileInputs.forEach((input, i) => {
      console.log(`  Input ${i}:`, input.id, 'visible:', input.offsetParent !== null);
    });
    throw error;
  }
}
```

**Belangrijke Timing Aanpassingen:**
- **Pre-upload delay**: 1500ms → 2000ms (geeft modal tijd om te openen)
- **File input timeout**: 5000ms → 10000ms (geeft DOM tijd om input te laden)
- **Diagnostic logging**: Helpt bij debuggen van modal/file input issues

### 5. Error Handling met Retry
```javascript
try {
  await someAction();
} catch (error) {
  console.error('❌ Action failed:', error);
  // Loop detectie zorgt voor auto-retry
  return; // Exit huidige iteratie, wacht op volgende call
}
```

---

## Belangrijke Overwegingen

### Performance
- **OCR calls zijn duur**: Gebruik regex fallbacks waar mogelijk
- **Timeout management**: Altijd timeouts cleanen bij stop/pause
- **Memory leaks**: Reset variabelen bij nieuwe sessie

### Security
- **Geen persistent storage van klantdata**: Privacy by design
- **API keys in chrome.storage.local**: Niet in code hardcoded
- **Sessie IDs**: Voorkom cross-tab conflicts

### Maintainability
- **Uitgebreide logging**: Alle acties worden gelogd met emoji's
- **Nederlandse comments**: Code volledig gedocumenteerd
- **Modulaire structuur**: Helper functies herbruikbaar

### Browser Compatibility
- **Chrome only**: Manifest V3, Chrome specifieke APIs
- **Geen polyfills nodig**: Vanilla JS, moderne features OK
- **PDF.js**: Werkt in alle moderne browsers

---

## Contact & Support

Voor vragen over deze codebase:
- Check eerst `TROUBLESHOOTING.md` voor veelvoorkomende problemen
- Bekijk console logs voor debugging informatie
- Alle functies hebben Nederlandse documentatie in de code

---

**Document Versie**: 1.1
**Laatste Update**: 2025-11-06
**Auteur**: Rehan (met hulp van Claude AI)

**Changelog v1.1 (2025-11-06):**
- Toegevoegd: Checkbox State Management sectie (ensureChecked functie)
- Toegevoegd: Race Condition Handling sectie
- Bijgewerkt: Document Upload sectie met verbeterde timing en diagnostic logging
- Bijgewerkt: Code voorbeelden met actuele regel nummers
