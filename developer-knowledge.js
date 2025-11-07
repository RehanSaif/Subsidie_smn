/**
 * ============================================================================
 * ISDE DEVELOPER KNOWLEDGE BASE
 * ============================================================================
 *
 * Embedded kennis over de ISDE Chrome Extension codebase.
 * Gebruikt door developer-chat.js om relevante context te geven aan de AI.
 */

const CODEBASE_KNOWLEDGE = {

  // ============================================================================
  // PROJECT STRUCTURE
  // ============================================================================

  structure: {
    description: "ISDE Subsidie Automatisering - Chrome Extension voor warmtepomp subsidie aanvragen",

    coreFiles: [
      { file: 'manifest.json', purpose: 'Chrome extension configuratie' },
      { file: 'config.js', purpose: 'Centraal configuratie bestand (API endpoints, models, timeouts)' },
      { file: 'sanitization.js', purpose: '15 sanitization functies voor OCR error correctie' },
      { file: 'background.js', purpose: 'Service worker voor message routing' },
      { file: 'content.js', purpose: 'Hoofdautomatisering script (3700+ lijnen)' },
      { file: 'popup.html', purpose: 'Sidebar UI' },
      { file: 'popup.js', purpose: 'UI logica, OCR extractie, validatie (3800+ lijnen)' }
    ],

    documentation: [
      { file: 'docs/CHANGELOG.md', purpose: 'Versiegeschiedenis en wijzigingen' },
      { file: 'docs/TECHNISCHE_OVERDRACHT.md', purpose: 'Technische documentatie' },
      { file: 'docs/TROUBLESHOOTING.md', purpose: 'Probleemoplossing guide' },
      { file: 'README.md', purpose: 'Project overzicht en installatie' }
    ],

    testFiles: [
      { file: 'test/test_sanitization.html', purpose: '159 tests voor sanitization framework' }
    ]
  },

  // ============================================================================
  // KEY ARCHITECTURE CONCEPTS
  // ============================================================================

  architecture: {
    dataFlow: `
      1. USER uploads documenten in popup.html
      2. POPUP.JS extracts data via Mistral AI OCR
      3. SANITIZATION.JS cleans/validates data (OCR error correctie)
      4. Data opgeslagen in chrome.storage.local
      5. USER klikt "Start automatisering"
      6. BACKGROUND.JS routes message naar CONTENT.JS
      7. CONTENT.JS vult 20+ stappen automatisch in
      8. User controleert en dient handmatig in
    `,

    selectorRegistry: `
      CRITICAL: Alle DOM selectors zijn gecentraliseerd!
      - content.js: SELECTORS object (48 website selectors, regel 85-145)
      - popup.js: POPUP_SELECTORS object (45 UI selectors)

      Bij website HTML wijziging: Update alleen SELECTORS, niet 166+ plekken!
    `,

    ocr: `
      OCR systeem gebruikt Mistral AI:
      - pixtral-12b-2409: Vision model voor PDF/image OCR
      - mistral-small-latest: Text extraction en parsing

      OCR error patterns in sanitization.js:
      - O→0, I→1, S→5, B→8, Z→2, G→6 (cijfer verwarring)
      - Spatie normalisatie, format correctie
    `,

    configuration: `
      config.js (390 regels) bevat ALLE hard-coded waarden:
      - CONFIG.MISTRAL_API_ENDPOINT
      - CONFIG.MISTRAL_MODELS.OCR
      - CONFIG.STORAGE_KEYS.USAGE_STATS
      - CONFIG.MAX_STEP_RETRIES

      Als Mistral API wijzigt → pas config.js aan, niet 6+ bestanden!
    `
  },

  // ============================================================================
  // COMMON DEVELOPMENT TASKS (RECIPES)
  // ============================================================================

  recipes: {

    addFormField: {
      title: "Nieuw formulier veld toevoegen",
      steps: [
        "1. popup.html: Voeg <input> toe met uniek ID",
        "2. popup.js: Voeg POPUP_SELECTORS entry toe",
        "3. popup.js: Voeg validatie toe (validateRequiredFields)",
        "4. popup.js: Voeg sanitization toe indien nodig",
        "5. content.js: Voeg fillInput() call toe in relevante stap handler",
        "6. Test in browser"
      ],
      example: `
// 1. popup.html (rond regel 400)
<div class="field-group">
  <label class="field-label">Nieuw Veld</label>
  <input type="text" class="field-input" id="newField" placeholder="Vul in">
</div>

// 2. popup.js - POPUP_SELECTORS (rond regel 30)
const POPUP_SELECTORS = {
  newField: 'newField',
  // ... andere selectors
};

// 3. popup.js - validateRequiredFields (rond regel 2840)
if (!document.getElementById(POPUP_SELECTORS.newField).value) {
  missingFields.push('Nieuw Veld');
}

// 4. content.js - fillInput in step handler (bijv. regel 2300)
await fillInput(SELECTORS.newFieldSelector, config.newField);
      `
    },

    updateSelector: {
      title: "Selector updaten na website wijziging",
      steps: [
        "1. Open eloket.dienstuitvoering.nl in browser",
        "2. Inspect element (F12) → zoek nieuwe selector",
        "3. content.js: Update SELECTORS object (regel 85-145)",
        "4. Of popup.js: Update POPUP_SELECTORS object",
        "5. Herlaad extension (chrome://extensions)",
        "6. Test de automatisering"
      ],
      example: `
// content.js - SELECTORS object (regel 85-145)
const SELECTORS = {
  // VOOR:
  continueButton: 'input[value="Volgende"]',

  // NA website wijziging:
  continueButton: 'button.next-btn', // <-- update hier!

  bsn: '#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edBSNnummer',
  // ... 46 andere selectors
};

// BELANGRIJK: Test met querySelector in DevTools eerst:
// document.querySelector('button.next-btn')
      `
    },

    addSanitization: {
      title: "Nieuwe sanitization functie toevoegen",
      steps: [
        "1. sanitization.js: Voeg functie toe (rond regel 600)",
        "2. Gebruik OCR_PATTERNS voor common fixes",
        "3. popup.js: Gebruik functie in extraction (rond regel 1400)",
        "4. test/test_sanitization.html: Voeg tests toe",
        "5. Test met echte OCR data"
      ],
      example: `
// sanitization.js - nieuwe functie
function sanitizeKvkNumber(kvkRaw) {
  if (!kvkRaw) return null;

  // Remove non-digits
  let kvk = kvkRaw.replace(/[^0-9]/g, '');

  // OCR fixes: O→0, I→1
  kvk = kvk.replace(/O/g, '0').replace(/I/g, '1');

  // Validate length (8 cijfers)
  if (kvk.length !== 8) {
    console.warn('Invalid KvK length:', kvk.length);
    return null;
  }

  return kvk;
}

// popup.js - gebruik in extraction (rond regel 1400)
const kvkNumber = sanitizeKvkNumber(extractedData.kvk);
      `
    },

    fixLoopDetection: {
      title: "Loop detection error oplossen",
      steps: [
        "1. Check console logs voor welke stap loopt",
        "2. content.js: Zoek stap handler (bijv. 'date_continued')",
        "3. Verify detectCurrentStep() herkent pagina correct",
        "4. Check of await delays voldoende zijn",
        "5. Eventueel CONFIG.MAX_STEP_RETRIES verhogen (config.js)",
        "6. Of verhoog delay tussen acties"
      ],
      example: `
// Console log voorbeeld:
// "⚠️ Loop detected: Step 'date_continued' executed 3 times"

// Oplossing 1: Verhoog delay in step handler
if (currentStep === 'date_continued') {
  console.log('Clicking volgende...');
  await clickElement(continueButton);
  await unthrottledDelay(2000); // Was 1000, nu 2000
  return;
}

// Oplossing 2: Verbeter page detection
function detectCurrentStep() {
  // Voeg meer specifieke check toe
  if (document.querySelector(SELECTORS.meldcodeLookup) &&
      !document.querySelector(SELECTORS.warmtepompChoice)) {
    return 'date_continued';
  }
}

// Oplossing 3: Verhoog max retries (config.js)
MAX_STEP_RETRIES: 5  // Was 4
      `
    },

    addStatistic: {
      title: "Nieuwe statistiek toevoegen",
      steps: [
        "1. config.js: Voeg storage key toe (regel 193-201)",
        "2. popup.js: Voeg getter/setter functie toe (rond regel 3420)",
        "3. popup.html: Voeg UI element toe in Settings tab (rond regel 600)",
        "4. popup.js: Update displayUsageStats() (rond regel 3553)",
        "5. content.js of background.js: Track de metric",
        "6. Test in extension"
      ],
      example: `
// 1. config.js
STORAGE_KEYS: {
  USAGE_STATS: 'usageStatistics',
  NEW_METRIC: 'newMetricKey' // <-- nieuw
}

// 2. popup.js - nieuwe functie
async function trackNewMetric(value) {
  const stats = await getUsageStats();
  stats.newMetric = value;
  await updateUsageStats(stats);
}

// 3. popup.html - Settings tab
<div class="field-group">
  <label class="field-label">Nieuwe Metric</label>
  <div id="statsNewMetric">0</div>
</div>

// 4. popup.js - displayUsageStats()
document.getElementById('statsNewMetric').textContent = stats.newMetric || 0;
      `
    },

    improveOcrAccuracy: {
      title: "OCR extractie verbeteren door prompt optimization",
      steps: [
        "1. Identificeer welk veld niet goed wordt geëxtraheerd",
        "2. popup.js: Zoek de relevante OCR prompt (regel 1430, 1570, of 1750)",
        "3. Maak de prompt SPECIFIEKER voor dat veld",
        "4. Voeg voorbeelden toe van wat je zoekt",
        "5. Voeg expliciete instructies toe over formaat",
        "6. Test met problematische documenten",
        "7. Itereer tot nauwkeurigheid verbetert"
      ],
      explanation: `
BELANGRIJK: OCR nauwkeurigheid hangt sterk af van de prompt!

Mistral AI's Pixtral vision model kan veel beter presteren als je:
- SPECIFIEK vertelt waar naar te zoeken
- VOORBEELDEN geeft van het formaat
- CONTEXT geeft over Nederlandse labels
- ONDERSCHEID maakt tussen vergelijkbare velden
`,
      example: `
// VOORBEELD: Meldcode extractie verbeteren

// ❌ VOOR (vaag):
text: "Extract meldcode from this invoice"

// ✅ NA (specifiek):
text: \`Extract MELDCODE from this Dutch invoice.

CRITICAL: The meldcode is a unique code that:
- Starts with "KA" (capital letters)
- Followed by exactly 5 digits
- Example format: KA06175, KA12345, KA98765
- Often labeled as: "Meldcode", "Meld code", "Code", or near "Warmtepomp"
- Usually appears in the product/service description section

SEARCH LOCATIONS (in order of priority):
1. Near "Meldcode:" label
2. Near "Warmtepomp" text
3. In product description
4. In specifications table

If you find multiple codes, choose the one closest to "Warmtepomp".\`

// VOORBEELD: Installatiedatum vs Factuurdatum onderscheiden

// ❌ VOOR (ambigu):
text: "Extract installation date"

// ✅ NA (ondubbelzinnig):
text: \`Extract INSTALLATION DATE (installatiedatum) from this invoice.

CRITICAL DISTINCTION:
✅ WANT: Installation date = "Datum" or "Installatiedatum" or "Datum installatie"
❌ SKIP: "Factuurdatum" (invoice date)
❌ SKIP: "Vervaldatum" (due date)

The installation date is:
- The date when the heat pump was INSTALLED (not invoiced)
- Usually labeled simply as "Datum" on Dutch invoices
- Format: DD-MM-YYYY or DD/MM/YYYY
- Typically between 2020-2025

If you see multiple dates:
1. "Datum" without other words = INSTALLATION DATE (most common)
2. "Installatiedatum" = INSTALLATION DATE
3. "Factuurdatum" = SKIP THIS
4. "Vervaldatum" = SKIP THIS\`

// VOORBEELD: IBAN met checksumfouten voorkomen

// ❌ VOOR:
text: "Extract IBAN"

// ✅ NA:
text: \`Extract IBAN from Dutch machtigingsformulier.

Dutch IBAN format:
- Always starts with "NL"
- Followed by 2 CHECK DIGITS (00-99)
- Followed by 4 letters (bank code like ABNA, INGB, RABO)
- Followed by 10 digits (account number)
- Total: 18 characters
- Example: NL91ABNA0417164300

CRITICAL for OCR:
- The 2 digits after "NL" are CHECK DIGITS (not random)
- Common OCR errors: O→0, I→1, S→5
- Must be EXACTLY 18 characters
- No spaces in the middle (spaces are added later)

If unclear, look for:
- Label "IBAN:" or "Rekeningnummer:"
- Near "Bank" or bank name (ABN AMRO, ING, Rabobank)
- In the authorization/signature section\`
      `,
      tips: [
        "Voeg VEEL context toe over Nederlandse labels/termen",
        "Geef CONCRETE voorbeelden van het formaat",
        "Onderscheid EXPLICIET tussen vergelijkbare velden",
        "Test met échte problematische PDFs (niet perfect samengestelde testdata)",
        "Gebruik ALL CAPS voor belangrijke instructies",
        "Voeg fallback instructies toe ('If unclear, look for...')",
        "Itereer: test → analyze fails → improve prompt → repeat"
      ],
      locations: `
OCR prompts in popup.js:
- Betaalbewijs OCR: regel 1430-1460 (Vision AI call)
- Factuur OCR: regel 1570-1620 (Vision AI call)
- Machtiging OCR: regel 1750-1850 (OCR API call)
- AI fallback extraction: regel 1570-1600 (text model)
- Checkbox detection: regel 1967-2010 (Vision AI)

TIP: Zoek naar "text:" in popup.js om alle prompts te vinden
      `
    }
  },

  // ============================================================================
  // FILE LOCATIONS (KEY SECTIONS WITH LINE NUMBERS)
  // ============================================================================

  fileLocations: {
    'config.js': {
      description: 'Centraal configuratie bestand',
      sections: {
        'Mistral API config': '31-47',
        'Storage keys': '193-201',
        'Date validation': '95-101',
        'Delays & timeouts': '141-184',
        'Feature flags': '239-253'
      }
    },

    'sanitization.js': {
      description: '15 sanitization functies + OCR patterns',
      sections: {
        'OCR_PATTERNS': '30-110',
        'sanitizeBSN': '180-240',
        'sanitizeIBAN': '250-380',
        'sanitizePhone': '390-420',
        'sanitizePostalCode': '530-570',
        'sanitizeMeldCode': '580-620',
        'sanitizeDates': '625-700'
      }
    },

    'popup.js': {
      description: 'UI logica, OCR extractie, validatie',
      sections: {
        'POPUP_SELECTORS': '25-75',
        'OCR extraction (betaalbewijs)': '1390-1520',
        'OCR extraction (factuur)': '1650-1750',
        'OCR extraction (machtiging)': '1780-1950',
        'Validation': '2840-2920',
        'Start automation handler': '2941-3126',
        'Usage statistics': '3418-3568',
        'Settings save/load': '3343-3416'
      }
    },

    'content.js': {
      description: 'Hoofdautomatisering (20+ stappen)',
      sections: {
        'SELECTORS registry': '85-145',
        'detectCurrentStep()': '1448-1807',
        'startFullAutomation()': '1837-3643',
        'Step handlers start': '1957',
        'Personal info step': '2232-2330',
        'Meldcode lookup step': '3060-3160',
        'File upload step': '3180-3390',
        'Final completion': '3555-3643'
      }
    },

    'background.js': {
      description: 'Service worker, message routing',
      sections: {
        'Message listener': '48-192',
        'Start automation': '49-133',
        'Statistics tracking': '153-191'
      }
    }
  },

  // ============================================================================
  // TROUBLESHOOTING COMMON ISSUES
  // ============================================================================

  troubleshooting: {
    'Loop detection error': {
      symptom: '"Loop detected: Step X executed N times"',
      causes: [
        'Page niet correct gedetecteerd',
        'Element niet gevonden (selector outdated)',
        'Delay te kort (page load niet compleet)'
      ],
      solution: 'Zie recipes.fixLoopDetection voor stappen'
    },

    'Element not found': {
      symptom: '"Element #selector not found"',
      causes: [
        'Website HTML gewijzigd',
        'Selector outdated in SELECTORS',
        'Page niet volledig geladen'
      ],
      solution: 'Update SELECTORS in content.js (regel 85-145), test met DevTools'
    },

    'OCR extraction fails': {
      symptom: 'Veld blijft leeg na document upload, of extractie is incorrect',
      causes: [
        'Slechte PDF/image kwaliteit (laagresolutie scan)',
        'Prompt is te vaag of niet specifiek genoeg',
        'Veld wordt verward met ander veld (bijv. factuurdatum vs installatiedatum)',
        'OCR pattern niet herkend door AI',
        'Mistral API rate limit',
        'Nederlandse labels niet duidelijk in prompt'
      ],
      solution: `
PRIMARY FIX: Verbeter de OCR prompt!
1. popup.js: Zoek relevante prompt (regel 1430, 1570, 1750, 1967)
2. Maak prompt VEEL specifieker:
   - Voeg exacte formaat voorbeelden toe
   - Geef Nederlandse label opties ("Datum", "Installatiedatum", etc.)
   - Onderscheid expliciet tussen vergelijkbare velden
   - Gebruik ALL CAPS voor critical instructions
3. Test met problematische documenten
4. Zie recipes.improveOcrAccuracy voor gedetailleerde voorbeelden

SECONDARY FIXES:
- Check console logs voor Mistral API errors
- Verify PDF kwaliteit (moet leesbaar zijn voor mensen)
- Voeg fallback regex patterns toe in popup.js
- Check sanitization.js voor OCR_PATTERNS correcties

TIP: 80% van OCR problemen worden opgelost door betere prompts!
      `
    },

    'Validation error': {
      symptom: 'Rood veld, "Vul in" foutmelding',
      causes: [
        'Sanitization faalt (returns null)',
        'Format niet verwacht (bijv. spaties)',
        'Checksum validatie faalt (BSN/IBAN)'
      ],
      solution: 'Debug sanitization functie in sanitization.js, check OCR output format, voeg logging toe'
    },

    'Statistics not updating': {
      symptom: 'Teller blijft op 0 in Settings',
      causes: [
        'chrome.storage.local permission fout',
        'Start/completion tracking niet aangeroepen',
        'Storage key typo'
      ],
      solution: 'Check console logs, verify CONFIG.STORAGE_KEYS match, test incrementStarted() call'
    }
  },

  // ============================================================================
  // DEVELOPMENT WORKFLOW
  // ============================================================================

  workflow: {
    testing: `
      1. Code wijzigen
      2. chrome://extensions → Reload extension
      3. Open eloket.dienstuitvoering.nl
      4. Open extension popup (click icon)
      5. Open DevTools (F12) → Console tab
      6. Test functionaliteit
      7. Check console logs voor errors
    `,

    debugging: `
      CRITICAL: Gebruik altijd console.log() voor debugging!

      Nuttige logs:
      - console.log('🔍 Current step:', currentStep);
      - console.log('📊 Extracted data:', data);
      - console.log('⚠️ Element not found:', selector);
      - console.log('✅ Validation passed');

      DevTools tips:
      - querySelector('selector') testen
      - Network tab voor API calls
      - Application → Storage → chrome.storage.local
    `,

    deployment: `
      1. Test thoroughly in chrome://extensions
      2. Update version in manifest.json
      3. Update CHANGELOG.md
      4. Create backup (git commit)
      5. Package extension (.zip)
      6. Test op schone Chrome profile
      7. Deploy naar gebruikers
    `
  }
};

// Maak beschikbaar voor chat
if (typeof window !== 'undefined') {
  window.CODEBASE_KNOWLEDGE = CODEBASE_KNOWLEDGE;
}
