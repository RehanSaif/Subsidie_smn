/**
 * ============================================================================
 * POPUP.JS - Chrome Extensie voor ISDE Subsidieaanvraag Automatisering
 * ============================================================================
 *
 * Dit bestand beheert de popup interface van de Chrome extensie voor het
 * automatisch invullen van ISDE subsidieaanvraag formulieren.
 *
 * HOOFDFUNCTIONALITEIT:
 * - Uploaden van documenten (machtigingsformulier, betaalbewijs, factuur)
 * - OCR-extractie van klantgegevens uit documenten via Mistral AI
 * - Validatie van formuliervelden
 * - Configuratiebeheer (bedrijfsgegevens, API sleutels)
 * - Communicatie met content script voor formulier automatisering
 *
 * DOCUMENTVERWERKING:
 * - Machtigingsformulier: Klantgegevens extractie (BSN, naam, adres, IBAN, etc.)
 * - Factuur: Meldcode en installatiedatum extractie
 * - Betaalbewijs: Opgeslagen voor upload naar subsidieformulier
 *
 * AI TECHNOLOGIE:
 * - Mistral OCR API voor documenttekst extractie
 * - Pixtral Vision AI voor checkbox detectie en gescande documenten
 * - Mistral Small voor gestructureerde data extractie
 * ============================================================================
 */

// ============================================================================
// POPUP SELECTOR REGISTRY
// ============================================================================
/**
 * Centraal register van alle popup UI selectors.
 * Bij HTML wijzigingen: update hier, niet in 120+ plekken!
 */
const POPUP_SELECTORS = {
  // Form fields - Customer data
  bsn: 'bsn',
  initials: 'initials',
  lastName: 'lastName',
  gender: 'gender',
  phone: 'phone',
  email: 'email',
  iban: 'iban',
  street: 'street',
  postalCode: 'postalCode',
  city: 'city',
  houseNumber: 'houseNumber',
  houseAddition: 'houseAddition',
  purchaseDate: 'purchaseDate',
  installationDate: 'installationDate',
  meldCode: 'meldCode',
  gasUsage: 'gasUsage',

  // Document uploads
  betaalbewijsDoc: 'betaalbewijsDoc',
  factuurDoc: 'factuurDoc',
  machtigingsformulier: 'machtigingsformulier',
  betaalbewijsName: 'betaalbewijsName',
  factuurName: 'factuurName',
  machtigingName: 'machtigingName',
  extractionStatus: 'extractionStatus',
  factuurExtractionStatus: 'factuurExtractionStatus',

  // Settings fields
  mistralApiKey: 'mistralApiKey',
  settingsCompanyName: 'settingsCompanyName',
  settingsKvkNumber: 'settingsKvkNumber',
  settingsContactInitials: 'settingsContactInitials',
  settingsContactLastName: 'settingsContactLastName',
  settingsContactGender: 'settingsContactGender',
  settingsContactPhone: 'settingsContactPhone',
  settingsContactEmail: 'settingsContactEmail',
  settingsStatus: 'settingsStatus',

  // Buttons
  startAutomation: 'startAutomation',
  resetInfo: 'resetInfo',
  saveSettingsBtn: 'saveSettingsBtn',
  settingsBtn: 'settingsBtn',
  backBtn: 'backBtn',

  // UI elements
  status: 'status',
  mainView: 'mainView',
  settingsView: 'settingsView',

  // CSS class selectors
  fieldWarning: '.field-warning',
  fieldInput: '.field-input',
  fieldRequiredMissing: '.field-required-missing',
  view: '.view',
};

// ============================================================================
// BESTANDSOPSLAG VARIABELEN
// ============================================================================
// Deze variabelen slaan de geüploade documenten op als base64 data tijdens
// de huidige sessie. Data wordt NIET opgeslagen tussen sessies - na afsluiten
// van de popup moeten bestanden opnieuw worden geüpload.

/** @type {Object|null} Betaalbewijs document data (base64) voor upload naar subsidieformulier */
let betaalbewijsData = null;

/** @type {Object|null} Factuur document data (base64) met meldcode en installatiedatum */
let factuurData = null;

/** @type {Object|null} Machtigingsformulier data (base64) voor OCR extractie van klantgegevens */
let machtigingsbewijsData = null;

// ============================================================================
// MISTRAL API RATE LIMITER
// ============================================================================
/**
 * Global rate limiter voor Mistral API calls om 429 errors te voorkomen.
 * Zorgt ervoor dat er minimaal 2.5 seconden tussen elke API call zit.
 */
let lastMistralApiCall = 0;

/**
 * Wacht tot rate limit window voorbij is voordat een nieuwe API call wordt gedaan.
 * Gebruikt CONFIG.API_DELAY_MS voor de delay tussen calls.
 * @returns {Promise<void>}
 */
async function waitForMistralRateLimit() {
  const now = Date.now();
  const timeSinceLastCall = now - lastMistralApiCall;

  if (timeSinceLastCall < CONFIG.API_DELAY_MS) {
    const waitTime = CONFIG.API_DELAY_MS - timeSinceLastCall;
    console.log(`⏳ Rate limiting: wachten ${Math.round(waitTime / 1000)} seconden...`);
    await new Promise(resolve => setTimeout(resolve, waitTime));
  }

  lastMistralApiCall = Date.now();
}

// ============================================================================
// PER-TAB FORM DATA STORAGE
// ============================================================================
/**
 * Tab-specifieke formulier data opslag.
 * Elke tab heeft zijn eigen formulier data die automatisch wordt opgeslagen en geladen.
 */

/**
 * Flag om aan te geven dat tab data wordt geladen.
 * Voorkomt dat auto-save wordt getriggerd tijdens het laden van nieuwe tab data.
 */
let isLoadingTabData = false;

/**
 * Houdt bij welke browser window deze side panel instantie volgt.
 * Wordt gebruikt om tab events uit andere windows te negeren.
 */
let currentTrackedWindowId = null;

/**
 * Namespace voor opslag sleutels zodat incognito en normale profielen nooit
 * elkaars data overschrijven (zelfs met overlappende tab ID's).
 */
const STORAGE_NAMESPACE = (chrome.extension && chrome.extension.inIncognitoContext) ? 'incog' : 'normal';

/**
 * Helper om consistente storage keys op te bouwen.
 * @param {string} prefix - Prefix voor het type data (formData/documents/automation)
 * @param {number|string} tabId - Tab ID
 * @returns {string} samengestelde storage key
 */
function buildStorageKey(prefix, tabId) {
  return `${prefix}_${STORAGE_NAMESPACE}_${tabId}`;
}

/**
 * Biedt achterwaartse compatibiliteit: probeer oude key (zonder namespace) als
 * de nieuwe key nog geen data bevat.
 */
function getLegacyKey(prefix, tabId) {
  return `${prefix}_tab_${tabId}`;
}

/**
 * Haalt het huidige tab ID op.
 * Voor een popup moeten we expliciet het browser window vinden, niet het popup window.
 * @returns {Promise<number>} Tab ID van de actieve tab
 */
async function getCurrentTabId() {
  // Methode 1: Probeer alle normale browser windows te vinden
  const windows = await chrome.windows.getAll({
    populate: true,
    windowTypes: ['normal']
  });

  console.log(`🔍 Found ${windows.length} browser windows`);

  // Zoek het meest recent gefocuste window
  const focusedWindow = windows.find(w => w.focused) || windows[0];

  if (focusedWindow) {
    currentTrackedWindowId = focusedWindow.id;
    // Vind de actieve tab in dit window
    const activeTab = focusedWindow.tabs.find(t => t.active);

    if (activeTab) {
      console.log(`🔍 Current tab ID: ${activeTab.id}, URL: ${activeTab.url}, Window: ${focusedWindow.id}`);
      return activeTab.id;
    }
  }

  // Fallback: probeer direct query (zou niet moeten gebeuren)
  console.warn('⚠️ Fallback: using direct tab query');
  const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
  if (tab) {
    currentTrackedWindowId = tab.windowId;
    console.log(`🔍 Fallback tab ID: ${tab.id}, URL: ${tab.url}`);
    return tab.id;
  }

  throw new Error('Geen actieve tab gevonden');
}

/**
 * Slaat formulier data op voor een specifieke tab.
 * @param {number} tabId - Tab ID
 * @param {Object} formData - Formulier data om op te slaan
 */
async function saveFormDataForTab(tabId, formData) {
  const key = buildStorageKey('formData', tabId);
  await chrome.storage.local.set({ [key]: formData });
  console.log(`💾 Form data saved for tab ${tabId}:`, formData);
}

/**
 * Laadt formulier data voor een specifieke tab.
 * @param {number} tabId - Tab ID
 * @returns {Promise<Object|null>} Opgeslagen formulier data of null
 */
async function loadFormDataForTab(tabId) {
  const key = buildStorageKey('formData', tabId);
  let result = await chrome.storage.local.get(key);

  if (!result[key]) {
    const legacyKey = getLegacyKey('formData', tabId);
    if (legacyKey !== key) {
      result = await chrome.storage.local.get(legacyKey);
      if (result[legacyKey]) {
        console.log(`📂 Migrating legacy form data for tab ${tabId}`);
        await chrome.storage.local.set({ [key]: result[legacyKey] });
        await chrome.storage.local.remove(legacyKey);
      }
    }
  }

  const data = result[key] || result[getLegacyKey('formData', tabId)] || null;
  console.log(`📂 Loading form data for tab ${tabId}:`, data || 'No saved data');
  return data;
}

/**
 * Verzamelt alle formulier data van de huidige DOM.
 * @returns {Object} Object met alle formulier veld waarden
 */
function collectFormData() {
  const formData = {};

  // Verzamel alle input velden
  getAllFieldIds().forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      formData[fieldId] = field.value;
    }
  });

  return formData;
}

/**
 * Auto-save functie: slaat formulier data op voor de huidige tab.
 * Wordt aangeroepen bij elke input wijziging.
 */
async function autoSaveFormData() {
  try {
    // Skip auto-save if we're currently loading data
    if (isLoadingTabData) {
      console.log('⏸️ Auto-save skipped: loading tab data');
      return;
    }

    // Capture tab ID at the START of this function
    const tabId = currentTrackedTabId;
    if (tabId === null) {
      console.warn('⚠️ Cannot auto-save: no tab ID tracked yet');
      return;
    }

    // Collect form data from UI
    const formData = collectFormData();

    // CRITICAL: Re-check that we're still on the same tab
    // If user switched tabs while we were collecting data, abort save
    if (currentTrackedTabId !== tabId) {
      console.warn(`⚠️ Auto-save aborted: tab changed from ${tabId} to ${currentTrackedTabId} during collection`);
      return;
    }

    console.log(`💾 AUTO-SAVING for tab ${tabId}:`, Object.keys(formData).filter(k => formData[k]).length, 'fields with data');
    await saveFormDataForTab(tabId, formData);

    // Final check after async operation
    if (currentTrackedTabId !== tabId) {
      console.warn(`⚠️ Tab changed to ${currentTrackedTabId} after save completed for tab ${tabId}`);
    }
  } catch (error) {
    console.error('Error auto-saving form data:', error);
  }
}

/**
 * Ruimt oude formulier data op van gesloten tabs.
 * Behoudt alleen data van open tabs.
 */
async function cleanupClosedTabsData() {
  try {
    const allTabs = await chrome.tabs.query({});
    const openTabIds = new Set(allTabs.map(tab => tab.id));

    const storage = await chrome.storage.local.get(null);
    const keysToRemove = [];

    const newPrefixes = [
      `formData_${STORAGE_NAMESPACE}_`,
      `documents_${STORAGE_NAMESPACE}_`,
      `automation_config_${STORAGE_NAMESPACE}_`
    ];

    for (const key in storage) {
      let tabId = null;

      for (const prefix of newPrefixes) {
        if (key.startsWith(prefix)) {
          tabId = parseInt(key.slice(prefix.length), 10);
          break;
        }
      }

      // Legacy fallback
      if (tabId === null) {
        if (key.startsWith('formData_tab_')) {
          tabId = parseInt(key.replace('formData_tab_', ''), 10);
        } else if (key.startsWith('documents_tab_')) {
          tabId = parseInt(key.replace('documents_tab_', ''), 10);
        } else if (key.startsWith('automation_config_')) {
          tabId = parseInt(key.replace('automation_config_', ''), 10);
        }
      }

      if (tabId !== null && !Number.isNaN(tabId) && !openTabIds.has(tabId)) {
        keysToRemove.push(key);
      }
    }

    if (keysToRemove.length > 0) {
      await chrome.storage.local.remove(keysToRemove);
      console.log(`🧹 Cleaned up data for ${keysToRemove.length} closed tabs`);
    }
  } catch (error) {
    console.error('Error cleaning up closed tabs data:', error);
  }
}

/**
 * Slaat geüploade documenten op voor een specifieke tab.
 * @param {number} tabId - Tab ID
 * @param {Object} documents - Object met documenten: { betaalbewijs, factuur, machtigingsbewijs }
 */
async function saveDocumentsForTab(tabId, documents) {
  const key = buildStorageKey('documents', tabId);
  await chrome.storage.local.set({ [key]: documents });
  console.log(`📎 Documents saved for tab ${tabId}:`, {
    betaalbewijs: documents.betaalbewijs?.name || null,
    factuur: documents.factuur?.name || null,
    machtigingsbewijs: documents.machtigingsbewijs?.name || null
  });
}

/**
 * Laadt geüploade documenten voor een specifieke tab.
 * @param {number} tabId - Tab ID
 * @returns {Promise<Object|null>} Opgeslagen documenten of null
 */
async function loadDocumentsForTab(tabId) {
  const key = buildStorageKey('documents', tabId);
  let result = await chrome.storage.local.get(key);

  if (!result[key]) {
    const legacyKey = getLegacyKey('documents', tabId);
    if (legacyKey !== key) {
      result = await chrome.storage.local.get(legacyKey);
      if (result[legacyKey]) {
        console.log(`📂 Migrating legacy documents for tab ${tabId}`);
        await chrome.storage.local.set({ [key]: result[legacyKey] });
        await chrome.storage.local.remove(legacyKey);
      }
    }
  }

  const data = result[key] || result[getLegacyKey('documents', tabId)] || null;
  console.log(`📂 Loading documents for tab ${tabId}:`, data ? 'Found' : 'No documents');
  return data;
}

/**
 * Slaat een enkel document op voor de huidige tab.
 * @param {string} documentType - Type: 'betaalbewijs', 'factuur', of 'machtigingsbewijs'
 * @param {Object} documentData - Document data object
 */
/**
 * Slaat een document op voor een specifieke tab (met expliciet tab ID)
 * @param {number} tabId - Tab ID
 * @param {string} documentType - Type: 'betaalbewijs', 'factuur', of 'machtigingsbewijs'
 * @param {Object} documentData - Document data object
 */
async function saveDocumentForTab(tabId, documentType, documentData) {
  try {
    if (tabId === null) {
      console.warn('⚠️ Cannot save document: no tab ID provided');
      return;
    }

    console.log(`💾 Saving ${documentType} for tab ${tabId}`);

    // Laad huidige documenten voor deze tab
    const existingDocuments = await loadDocumentsForTab(tabId) || {};

    // Update het specifieke document
    existingDocuments[documentType] = documentData;

    // Sla alles op
    await saveDocumentsForTab(tabId, existingDocuments);

    // Update ook de globale variabelen voor backwards compatibility
    if (documentType === 'betaalbewijs') betaalbewijsData = documentData;
    if (documentType === 'factuur') factuurData = documentData;
    if (documentType === 'machtigingsbewijs') machtigingsbewijsData = documentData;
  } catch (error) {
    console.error(`Error saving ${documentType} for tab ${tabId}:`, error);
  }
}

async function saveDocumentForCurrentTab(documentType, documentData) {
  // Wrapper that uses current tracked tab ID
  return saveDocumentForTab(currentTrackedTabId, documentType, documentData);
}

/**
 * Verwijdert een document voor een specifieke tab
 * @param {number} tabId - Tab ID
 * @param {string} documentType - Type document ('betaalbewijs', 'factuur', 'machtigingsbewijs')
 */
async function deleteDocumentForTab(tabId, documentType) {
  const existingDocuments = await loadDocumentsForTab(tabId) || {};
  delete existingDocuments[documentType];
  await saveDocumentsForTab(tabId, existingDocuments);
  console.log(`🗑️ Deleted ${documentType} for tab ${tabId}`);
}

/**
 * Wist formuliervelden die bij een specifiek documenttype horen
 * @param {number} tabId - Tab ID
 * @param {string} documentType - Type document
 */
async function clearFieldsForDocumentType(tabId, documentType) {
  // Laad bestaande form data en documenten
  const existingData = await loadFormDataForTab(tabId) || {};
  const existingDocuments = await loadDocumentsForTab(tabId) || {};

  // Bepaal welke velden gewist moeten worden per documenttype
  let fieldsToClear = [];

  if (documentType === 'machtigingsbewijs') {
    // Machtigingsformulier bevat:
    // - Persoonlijke gegevens: BSN, naam, geslacht
    // - Contact: telefoon, email, IBAN
    // - Adres: straat, huisnummer, postcode, plaats
    // - Aardgas gebruik
    // NIET: purchaseDate, installationDate, meldCode (die worden handmatig of via factuur ingevuld)
    fieldsToClear = [
      'bsn', 'initials', 'lastName', 'gender',
      'phone', 'email', 'iban',
      'street', 'houseNumber', 'houseAddition', 'postalCode', 'city',
      'gasUsage'
    ];
  } else if (documentType === 'factuur') {
    // Factuur bevat meldCode en installationDate
    fieldsToClear = ['meldCode', 'installationDate'];
  } else if (documentType === 'betaalbewijs') {
    // Betaalbewijs heeft geen OCR velden
    fieldsToClear = [];
  }

  // Wis de velden uit form data
  fieldsToClear.forEach(field => {
    delete existingData[field];
  });

  // Sla bijgewerkte data op
  await saveFormDataForTab(tabId, existingData);

  // Wis de velden in de UI (alleen als we in dezelfde tab zijn)
  if (currentTrackedTabId === tabId) {
    fieldsToClear.forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.value = '';
        // Verwijder ook warning styling
        field.classList.remove('has-warning');
      }

      // Verberg warning message voor dit veld
      const warningDiv = document.getElementById(`${fieldId}Warning`);
      if (warningDiv) {
        warningDiv.classList.remove('visible');
        warningDiv.textContent = '';
      }
    });

    // Verberg ook de status berichten
    if (documentType === 'machtigingsbewijs') {
      const statusDiv = document.getElementById(POPUP_SELECTORS.extractionStatus);
      if (statusDiv) statusDiv.style.display = 'none';
    } else if (documentType === 'factuur') {
      const statusDiv = document.getElementById(POPUP_SELECTORS.factuurExtractionStatus);
      if (statusDiv) statusDiv.style.display = 'none';
    }
  }

  console.log(`🗑️ Cleared ${fieldsToClear.length} fields for ${documentType} in tab ${tabId}`);
}

/**
 * Toont bestandsnaam met delete button in de UI
 * @param {string} nameDivId - ID van het naam div element
 * @param {string} fileName - Naam van het bestand
 * @param {string} documentType - Type document voor delete functie
 */
function displayFileNameWithDelete(nameDivId, fileName, documentType) {
  const nameDiv = document.getElementById(nameDivId);
  if (!nameDiv) return;

  // Clear existing content
  nameDiv.innerHTML = '';

  // Create text span
  const textSpan = document.createElement('span');
  textSpan.textContent = `✓ ${fileName}`;

  // Create delete button
  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = '×';
  deleteBtn.className = 'file-delete-btn';
  deleteBtn.title = 'Verwijder bestand en velden';
  deleteBtn.onclick = async (e) => {
    e.preventDefault();
    e.stopPropagation();

    const tabId = currentTrackedTabId;

    // Delete document from storage
    await deleteDocumentForTab(tabId, documentType);

    // Hide the name div
    nameDiv.style.display = 'none';
    nameDiv.innerHTML = '';

    // Reset het file input element zodat je opnieuw kunt uploaden
    let inputId;
    if (documentType === 'machtigingsbewijs') {
      inputId = 'machtigingsformulier';
    } else if (documentType === 'betaalbewijs') {
      inputId = 'betaalbewijsDoc';
    } else if (documentType === 'factuur') {
      inputId = 'factuurDoc';
    }

    if (inputId) {
      const inputElement = document.getElementById(inputId);
      if (inputElement) {
        inputElement.value = '';
      }
    }

    // Wis ook de velden die door dit document zijn ingevuld
    await clearFieldsForDocumentType(tabId, documentType);

    // Update start button state
    updateStartButtonState();

    console.log(`✓ ${documentType} en gerelateerde velden verwijderd voor tab ${tabId}`);
  };

  // Append to nameDiv
  nameDiv.appendChild(textSpan);
  nameDiv.appendChild(deleteBtn);
  nameDiv.style.display = 'inline-flex';
}

// ============================================================================
// FORMULIERVELDEN CONFIGURATIE
// ============================================================================
/**
 * Centrale configuratie voor alle formuliervelden.
 * Gebruikt voor validatie, reset, en event listener setup.
 */
const FORM_FIELDS = {
  personal: ['bsn', 'initials', 'lastName', 'gender'],
  contact: ['phone', 'email', 'iban'],
  address: ['street', 'houseNumber', 'houseAddition', 'postalCode', 'city'],
  installation: ['purchaseDate', 'installationDate', 'meldCode', 'gasUsage']
};

/**
 * Labels voor alle verplichte velden (exclusief houseAddition).
 */
const FIELD_LABELS = {
  bsn: 'BSN',
  initials: 'Voorletters',
  lastName: 'Achternaam',
  gender: 'Geslacht',
  phone: 'Telefoonnummer',
  email: 'E-mailadres',
  iban: 'IBAN',
  street: 'Straatnaam',
  houseNumber: 'Huisnummer',
  postalCode: 'Postcode',
  city: 'Plaats',
  purchaseDate: 'Aankoopdatum',
  installationDate: 'Installatiedatum',
  meldCode: 'Meldcode',
  gasUsage: 'Aardgas gebruik'
};

/**
 * Haalt alle veld IDs op uit de configuratie.
 * @returns {Array<string>} Array met alle veld IDs
 */
function getAllFieldIds() {
  return Object.values(FORM_FIELDS).flat();
}

/**
 * Haalt alle verplichte veld IDs op (exclusief houseAddition).
 * @returns {Array<string>} Array met verplichte veld IDs
 */
function getRequiredFieldIds() {
  return Object.keys(FIELD_LABELS);
}

// ============================================================================
// SANITIZATION FUNCTIONS
// ============================================================================
/**
 * All sanitization functions are now imported from sanitization.js
 * This includes: sanitizeBSN, sanitizeIBAN, sanitizePhone, sanitizeEmail,
 * sanitizeInitials, sanitizeLastName, sanitizeStreet, sanitizeHouseNumber,
 * sanitizePostalCode, sanitizeCity, sanitizeGender, sanitizeGasUsage,
 * sanitizeMeldCode, sanitizeInstallationDate, sanitizePurchaseDate
 */

// ============================================================================
// EVENT LISTENER: MACHTIGINGSFORMULIER UPLOAD
// ============================================================================
/**
 * Behandelt het uploaden van het machtigingsformulier.
 *
 * FUNCTIONALITEIT:
 * 1. Slaat het bestand op voor later gebruik (upload naar subsidieformulier)
 * 2. Voert OCR uit om klantgegevens te extraheren
 * 3. Vult automatisch de formuliervelden in met geëxtraheerde data
 * 4. Toont status feedback aan de gebruiker
 * 5. Update de status van de "Start" knop
 *
 * GEËXTRAHEERDE VELDEN:
 * - BSN (Burgerservicenummer)
 * - Voorletters en achternaam
 * - Geslacht (man/vrouw)
 * - Contactgegevens (telefoon, email)
 * - Adresgegevens (straat, huisnummer, postcode, plaats)
 * - IBAN bankrekeningnummer
 * - Aardgasgebruik (ja/nee)
 */
document.getElementById(POPUP_SELECTORS.machtigingsformulier).addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    // Capture tab ID at start of upload (before any async operations)
    const uploadTabId = currentTrackedTabId;
    console.log('📎 Machtigingsformulier uploaded:', file.name, 'for tab', uploadTabId);

    // Converteer bestand naar base64
    const fileData = await fileToBase64(file);

    // Sla op voor deze specifieke tab (niet currentTrackedTabId, die kan inmiddels veranderd zijn)
    await saveDocumentForTab(uploadTabId, 'machtigingsbewijs', fileData);

    // Toon bestandsnaam met delete button in de UI
    displayFileNameWithDelete('machtigingName', file.name, 'machtigingsbewijs');

    console.log('✓ Machtigingsformulier saved for current tab');

    // Toon extractie status alleen als user nog in dezelfde tab is
    if (currentTrackedTabId === uploadTabId) {
      showExtractionStatus('🔄 Gegevens worden geëxtraheerd...', 'extractionStatus', 'processing', 0);
    }

    try {
      // Voer OCR extractie uit op het machtigingsformulier
      const extractedData = await extractDataFromForm(file, uploadTabId);
      console.log('Extracted data result:', extractedData);

      // Check if user switched tabs during OCR
      const tabSwitched = (currentTrackedTabId !== uploadTabId);

      if (tabSwitched) {
        console.warn(`⚠️ Tab switched during machtigingsformulier OCR (from ${uploadTabId} to ${currentTrackedTabId}). Saving data without UI update.`);

        // Don't update UI - user is in different tab
        // Load existing data from upload tab and merge extracted fields
        const existingData = await loadFormDataForTab(uploadTabId) || {};
        const updatedData = { ...existingData };

        // Merge extracted data (only non-null values)
        let fieldsUpdated = 0;
        for (const [key, value] of Object.entries(extractedData)) {
          if (value !== null && value !== undefined && value !== '') {
            updatedData[key] = value;
            fieldsUpdated++;
          }
        }

        // Save directly to storage without UI update
        await saveFormDataForTab(uploadTabId, updatedData);
        console.log(`💾 Machtigingsformulier OCR data saved to background tab ${uploadTabId} (${fieldsUpdated} fields)`);

      } else {
        // User is still in same tab - normal flow with UI updates
        // Vul formuliervelden in met geëxtraheerde data
        const result = fillFormFields(extractedData);
        const fieldsFound = result.fieldsFound;
        const hasWarnings = result.hasWarnings;

        // Toon succesbericht met aantal gevonden velden
        if (fieldsFound > 0) {
          if (hasWarnings) {
            // Als er warnings zijn, toon aangepast bericht en wacht langer
            const warningFields = Object.keys(result.warnings).join(', ');
            showExtractionStatus(`✅ ${fieldsFound} veld(en) ingevuld - controleer validatie warnings voor: ${warningFields}`, 'extractionStatus', 'warning', 8000);
            console.warn(`⚠️ Velden ingevuld met validatie warnings:`, result.warnings);

            // Wacht 3 seconden extra zodat gebruiker warnings kan zien
            await new Promise(resolve => setTimeout(resolve, 3000));
          } else {
            showExtractionStatus(`✅ ${fieldsFound} veld(en) succesvol ingevuld!`, 'extractionStatus', 'success', 5000);
          }
        } else {
          showExtractionStatus('⚠️ Geen gegevens gevonden. Controleer de console voor details.', 'extractionStatus', 'warning', 5000);
        }

        // Save form data from UI
        const formData = collectFormData();
        console.log(`💾 Saving machtigingsformulier OCR data to tab ${uploadTabId}`);
        await saveFormDataForTab(uploadTabId, formData);

        // MARKEER LEGE VERPLICHTE VELDEN na OCR extractie
        // Wacht even zodat UI update compleet is
        await new Promise(resolve => setTimeout(resolve, 500));

        // Valideer en markeer ontbrekende velden (maar toon geen error message)
        const missingFields = validateRequiredFields(true);
        if (missingFields.length > 0) {
          console.log(`📌 Marking ${missingFields.length} empty required fields:`, missingFields.join(', '));
          showExtractionStatus(`ℹ️ Vul nog handmatig in: ${missingFields.join(', ')}`, 'extractionStatus', 'info', 10000);
        }
      }

      // Update de status van de "Start Automatisering" knop
      // Only update if still in same tab
      if (!tabSwitched) {
        updateStartButtonState();
      }
    } catch (error) {
      // Behandel extractie fouten
      console.error('Machtigingsformulier extraction error:', error);
      console.error('Error stack:', error.stack);

      // Only show error in UI if still in same tab
      if (currentTrackedTabId === uploadTabId) {
        showExtractionStatus(`❌ Fout: ${error.message}`, 'extractionStatus', 'error', 0);
        updateStartButtonState();
      } else {
        console.warn(`⚠️ Machtigingsformulier extraction failed for tab ${uploadTabId}, but user is now in tab ${currentTrackedTabId}. Error not shown in UI.`);
      }
    }
  }
});

// ============================================================================
// EVENT LISTENER: BETAALBEWIJS UPLOAD
// ============================================================================
/**
 * Behandelt het uploaden van het betaalbewijs document.
 *
 * FUNCTIONALITEIT:
 * - Converteert bestand naar base64 formaat
 * - Slaat data op in sessie variabele (niet persistent)
 * - Toont bestandsnaam in UI
 * - Update de status van de "Start" knop
 *
 * GEBRUIK:
 * Het betaalbewijs wordt later geüpload naar het subsidieformulier
 * tijdens de automatisering. Geen OCR extractie nodig voor dit document.
 */
document.getElementById(POPUP_SELECTORS.betaalbewijsDoc).addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    // Capture tab ID at start of upload
    const uploadTabId = currentTrackedTabId;
    console.log('📎 Betaalbewijs uploaded:', file.name, 'for tab', uploadTabId);

    // Verwijder rode markering zodra bestand is geüpload
    e.target.classList.remove('field-required-missing');

    // Converteer bestand naar base64
    const fileData = await fileToBase64(file);

    // Sla op voor deze specifieke tab
    await saveDocumentForTab(uploadTabId, 'betaalbewijs', fileData);

    // Toon bestandsnaam met delete button in de UI
    displayFileNameWithDelete('betaalbewijsName', file.name, 'betaalbewijs');

    console.log('✓ Betaalbewijs saved for current tab');

    // Update de status van de "Start Automatisering" knop
    updateStartButtonState();
  }
});

// ============================================================================
// EVENT LISTENER: FACTUUR UPLOAD
// ============================================================================
/**
 * Behandelt het uploaden van de factuur document.
 *
 * FUNCTIONALITEIT:
 * 1. Slaat het factuurbestand op voor upload naar subsidieformulier
 * 2. Voert OCR extractie uit om meldcode en installatiedatum te vinden
 * 3. Vult automatisch de meldcode en installatiedatum velden in
 * 4. Toont extractie status aan de gebruiker
 *
 * GEËXTRAHEERDE GEGEVENS:
 * - Meldcode: Format KA##### (bijvoorbeeld KA06175)
 * - Installatiedatum: Datum van warmtepomp installatie (DD-MM-YYYY)
 */
document.getElementById(POPUP_SELECTORS.factuurDoc).addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    // Capture tab ID at start of upload (before any async operations)
    const uploadTabId = currentTrackedTabId;
    console.log('📎 Factuur uploaded:', file.name, 'for tab', uploadTabId);

    // Verwijder rode markering zodra bestand is geüpload
    e.target.classList.remove('field-required-missing');

    // Converteer bestand naar base64
    const fileData = await fileToBase64(file);

    // Sla op voor deze specifieke tab (niet currentTrackedTabId, die kan inmiddels veranderd zijn)
    await saveDocumentForTab(uploadTabId, 'factuur', fileData);

    // Toon bestandsnaam met delete button in de UI
    displayFileNameWithDelete('factuurName', file.name, 'factuur');

    console.log('✓ Factuur saved for current tab');

    // Toon extractie status alleen als user nog in dezelfde tab is
    if (currentTrackedTabId === uploadTabId) {
      showExtractionStatus('🔄 Meldcode wordt geëxtraheerd uit factuur...', 'factuurExtractionStatus', 'processing', 0);
    }

    try {
      // Voer meldcode en datum extractie uit
      const { meldcode, installationDate } = await extractMeldcodeFromFactuur(file);

      // Check if user switched tabs during OCR
      const tabSwitched = (currentTrackedTabId !== uploadTabId);

      if (tabSwitched) {
        console.warn(`⚠️ Tab switched during factuur OCR (from ${uploadTabId} to ${currentTrackedTabId}). Saving data without UI update.`);

        // Don't update UI - user is in different tab
        // Load existing data from upload tab and merge new fields
        const existingData = await loadFormDataForTab(uploadTabId) || {};
        const updatedData = { ...existingData };

        if (meldcode) {
          updatedData.meldCode = meldcode;
          console.log('✅ Meldcode extracted:', meldcode, '(saved to background tab)');
        }
        if (installationDate) {
          updatedData.installationDate = installationDate;
          console.log('✅ Installation date extracted:', installationDate, '(saved to background tab)');
        }

        // Save directly to storage without UI update
        await saveFormDataForTab(uploadTabId, updatedData);
        console.log(`💾 Factuur OCR data saved to background tab ${uploadTabId}`);

      } else {
        // User is still in same tab - normal flow with UI updates
        let fieldsFound = [];

        // Vul meldcode veld in als gevonden
        if (meldcode) {
          document.getElementById(POPUP_SELECTORS.meldCode).value = meldcode;
          fieldsFound.push('Meldcode: ' + meldcode);
          console.log('✅ Meldcode extracted:', meldcode);
        }

        // Vul installatiedatum veld in als gevonden
        if (installationDate) {
          document.getElementById(POPUP_SELECTORS.installationDate).value = installationDate;
          fieldsFound.push('Installatiedatum: ' + installationDate);
          console.log('✅ Installation date extracted:', installationDate);
        }

        // Toon succesmelding met gevonden gegevens
        if (fieldsFound.length > 0) {
          showExtractionStatus(`✅ Gevonden: ${fieldsFound.join(', ')}`, 'factuurExtractionStatus', 'success', 3000);
        } else {
          showExtractionStatus('⚠️ Geen meldcode of datum gevonden in factuur', 'factuurExtractionStatus', 'warning', 3000);
        }

        // Save form data from UI
        const formData = collectFormData();
        console.log(`💾 Saving factuur OCR data to tab ${uploadTabId}`);
        await saveFormDataForTab(uploadTabId, formData);

        // MARKEER LEGE VERPLICHTE VELDEN na factuur extractie
        // Wacht even zodat UI update compleet is
        await new Promise(resolve => setTimeout(resolve, 500));

        // Valideer en markeer ontbrekende velden
        const missingFields = validateRequiredFields(true);
        if (missingFields.length > 0) {
          console.log(`📌 Marking ${missingFields.length} empty required fields after factuur OCR:`, missingFields.join(', '));
        }
      }

      // Update de status van de "Start Automatisering" knop
      // Only update if still in same tab
      if (!tabSwitched) {
        updateStartButtonState();
      }
    } catch (error) {
      // Behandel extractie fouten
      console.error('Factuur extraction error:', error);

      // Only show error in UI if still in same tab
      if (currentTrackedTabId === uploadTabId) {
        showExtractionStatus(`❌ Fout bij extraheren factuur: ${error.message}`, 'factuurExtractionStatus', 'error', 5000);
        updateStartButtonState();
      } else {
        console.warn(`⚠️ Factuur extraction failed for tab ${uploadTabId}, but user is now in tab ${currentTrackedTabId}. Error not shown in UI.`);
      }
    }
  }
});

// ============================================================================
// HULPFUNCTIE: MISTRAL API ERROR HANDLING
// ============================================================================
/**
 * Uniforme error handling voor Mistral API responses.
 *
 * @param {Response} response - De fetch response object
 * @throws {Error} Met geformatteerde foutmelding
 *
 * FUNCTIONALITEIT:
 * - Parseert error response van Mistral API
 * - Geeft specifieke melding bij rate limiting (429)
 * - Gooit Error met status code en bericht
 */
async function handleMistralApiError(response) {
  let errorMessage = response.statusText;
  try {
    const errorData = await response.json();
    errorMessage = errorData.error?.message || errorMessage;
  } catch (e) {
    // Kon error response niet parsen
  }

  if (response.status === 429) {
    throw new Error('Mistral API rate limit bereikt. Wacht even (30-60 seconden) voordat je het opnieuw probeert.');
  }

  throw new Error(`Mistral API error (${response.status}): ${errorMessage}`);
}

// ============================================================================
// HULPFUNCTIE: STATUS DIV WEERGAVE
// ============================================================================
/**
 * Toont status bericht met automatische timeout.
 *
 * @param {string} message - Het te tonen bericht
 * @param {string} statusDivId - ID van het status div element
 * @param {string} type - Type: 'processing', 'success', 'warning', of 'error'
 * @param {number} autohideDuration - Tijd in ms voordat bericht verdwijnt (0 = niet verbergen)
 */
function showExtractionStatus(message, statusDivId, type = 'processing', autohideDuration = 3000) {
  const statusDiv = document.getElementById(statusDivId);
  if (!statusDiv) return;

  const colors = {
    processing: '#FFC012',
    success: '#2b8a3e',
    warning: '#f59f00',
    error: '#c92a2a'
  };

  statusDiv.textContent = message;
  statusDiv.style.display = 'block';
  statusDiv.style.color = colors[type] || colors.processing;

  if (autohideDuration > 0) {
    setTimeout(() => {
      statusDiv.style.display = 'none';
    }, autohideDuration);
  }
}

// ============================================================================
// HULPFUNCTIE: FORMULIERVELDEN INVULLEN
// ============================================================================
/**
 * Vult formuliervelden in met geëxtraheerde data.
 *
 * @param {Object} extractedData - Object met geëxtraheerde velden
 * @returns {number} Aantal succesvol ingevulde velden
 */
function fillFormFields(extractedData) {
  const fieldMappings = [
    'bsn', 'initials', 'lastName', 'gender', 'phone',
    'email', 'iban', 'street', 'postalCode', 'city', 'gasUsage'
  ];

  // Mapping van fieldId naar warningId
  const warningIds = {
    'bsn': 'bsnWarning',
    'initials': 'initialsWarning',
    'lastName': 'lastNameWarning',
    'gender': 'genderWarning',
    'phone': 'phoneWarning',
    'email': 'emailWarning',
    'iban': 'ibanWarning',
    'street': 'streetWarning',
    'postalCode': 'postalCodeWarning',
    'city': 'cityWarning',
    'gasUsage': 'gasUsageWarning'
  };

  let fieldsFound = 0;

  // Haal validatie warnings op
  const validationWarnings = extractedData._validationWarnings || {};

  // Vul standaard velden in
  fieldMappings.forEach(field => {
    if (extractedData[field]) {
      const element = document.getElementById(field);
      if (element) {
        element.value = extractedData[field];
        fieldsFound++;
      }
    }

    // Toon warning als validatie gefaald is
    if (validationWarnings[field] && warningIds[field]) {
      showFieldWarning(field, warningIds[field], validationWarnings[field]);
    }
  });

  // Speciale behandeling voor huisnummer (splits logica)
  if (extractedData.houseNumber) {
    const houseNumberMatch = extractedData.houseNumber.match(/^(\d+)(.*)$/);
    if (houseNumberMatch) {
      const number = houseNumberMatch[1];
      const addition = houseNumberMatch[2];

      document.getElementById(POPUP_SELECTORS.houseNumber).value = number;
      fieldsFound++;

      if (addition) {
        document.getElementById(POPUP_SELECTORS.houseAddition).value = addition;
        fieldsFound++;
      }
    } else {
      document.getElementById(POPUP_SELECTORS.houseNumber).value = extractedData.houseNumber;
      fieldsFound++;
    }
  }

  // Vul houseAddition apart in als het in extractedData zit
  if (extractedData.houseAddition) {
    document.getElementById(POPUP_SELECTORS.houseAddition).value = extractedData.houseAddition;
    // Check of we dit veld al hebben geteld (als het uit split kwam)
    if (!extractedData.houseNumber || !extractedData.houseNumber.match(/^(\d+)(.+)$/)) {
      fieldsFound++;
    }
  }

  // Bepaal of er validatie warnings zijn
  const hasWarnings = Object.keys(validationWarnings).length > 0;

  // Return object met info over gevonden velden en warnings
  return {
    fieldsFound,
    hasWarnings,
    warnings: validationWarnings
  };
}

// ============================================================================
// HULPFUNCTIE: REGEX FALLBACKS VOOR DATA EXTRACTIE
// ============================================================================
/**
 * Centraliseert regex patronen voor fallback extractie.
 *
 * @param {Object} extractedData - Object met geëxtraheerde data (kan incomplete zijn)
 * @param {string} extractedText - De volledige geëxtraheerde tekst uit document
 * @returns {Object} Het extractedData object aangevuld met regex fallbacks
 */
function applyRegexFallbacks(extractedData, extractedText) {
  const regexFallbacks = {
    bsn: {
      pattern: /BSN[:\s]*(\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d)/i,
      clean: (match) => match[1].replace(/[\s-]/g, ''),
      field: 'bsn'
    },
    iban: {
      pattern: /(?:IBAN[:\s]*)?([NL]{2}\s?[0-9]{2}\s?[A-Z]{4}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{2})/i,
      clean: (match) => match[1].replace(/\s/g, '').replace(/\./g, '').toUpperCase(),
      field: 'iban'
    },
    phone: {
      pattern: /(?:Telefoon|Tel)[:\s]*((?:06|0[0-9]{1,2})[\s-]?[0-9]{3,4}[\s-]?[0-9]{4})/i,
      clean: (match) => match[1].replace(/[\s-]/g, ''),
      field: 'phone'
    },
    email: {
      pattern: /([a-z0-9._-]+@[a-z0-9._-]+\.[a-z]{2,6})/gi,
      clean: (matches) => {
        // Filter bedrijfs-emails eruit
        const personalEmail = matches.find(email =>
          !email.toLowerCase().includes('@samangroep') &&
          !email.toLowerCase().includes('@saman')
        );
        return personalEmail ? personalEmail.toLowerCase() : null;
      },
      field: 'email',
      multiMatch: true
    }
  };

  console.log('🔍 Applying regex fallbacks for missing fields...');

  Object.entries(regexFallbacks).forEach(([key, { pattern, clean, field, multiMatch }]) => {
    if (!extractedData[field]) {
      if (multiMatch) {
        const matches = extractedText.match(pattern);
        if (matches) {
          const cleanedValue = clean(matches);
          if (cleanedValue) {
            extractedData[field] = cleanedValue;
            console.log(`✅ ${field} found via regex:`, extractedData[field]);
          }
        }
      } else {
        const match = extractedText.match(pattern);
        if (match) {
          extractedData[field] = clean(match);
          console.log(`✅ ${field} found via regex:`, extractedData[field]);
        }
      }
    }
  });

  // Maak IBAN schoon als het door AI gevonden is maar spaties/punten bevat
  if (extractedData.iban) {
    extractedData.iban = extractedData.iban.replace(/\s/g, '').replace(/\./g, '').toUpperCase();
    console.log('✅ IBAN cleaned (removed spaces/dots):', extractedData.iban);
  }

  return extractedData;
}

// ============================================================================
// HULPFUNCTIE: BESTAND NAAR BASE64 CONVERSIE
// ============================================================================
/**
 * Converteert een bestand naar base64 gecodeerde data.
 *
 * @param {File} file - Het te converteren bestand
 * @returns {Promise<Object>} Promise die resolvet met object met:
 *   - name: bestandsnaam
 *   - type: MIME type (bijv. "application/pdf", "image/jpeg")
 *   - data: base64 gecodeerde data met data URL prefix
 *
 * GEBRUIK:
 * Base64 formaat wordt gebruikt voor:
 * - Opslag in Chrome storage
 * - Upload naar subsidieformulier
 * - Verzending naar Mistral AI API's
 */
function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve({
      name: file.name,
      type: file.type,
      data: reader.result
    });
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// PDF CONVERSIE: PDF NAAR BASE64 AFBEELDING
// ============================================================================
/**
 * Converteert de eerste pagina van een PDF naar een base64 afbeelding.
 *
 * PROCES:
 * 1. Laadt PDF met PDF.js library
 * 2. Rendert eerste pagina op canvas met 2x schaal (betere kwaliteit)
 * 3. Converteert canvas naar PNG base64
 *
 * @param {File} file - PDF bestand om te converteren
 * @returns {Promise<string>} Base64 gecodeerde PNG afbeelding met data URL
 *
 * GEBRUIK:
 * Gebruikt voor Vision AI OCR wanneer PDF geen extracteerbare tekst bevat
 * (gescande documenten). Hogere schaal (2.0) zorgt voor betere OCR resultaten.
 */
async function pdfToBase64Image(file) {
  console.log('Starting PDF conversion, file type:', file.type);
  const arrayBuffer = await file.arrayBuffer();
  console.log('ArrayBuffer size:', arrayBuffer.byteLength);

  // Laad PDF document met PDF.js
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  console.log('PDF loaded, pages:', pdf.numPages);

  // Haal eerste pagina op
  const page = await pdf.getPage(1);
  console.log('Page loaded');

  // Bepaal viewport met 2x schaal voor betere kwaliteit
  const viewport = page.getViewport({ scale: 2.0 });
  console.log('Viewport:', viewport.width, 'x', viewport.height);

  // Maak canvas element aan voor rendering
  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  // Render PDF pagina naar canvas
  await page.render({
    canvasContext: context,
    viewport: viewport
  }).promise;

  console.log('PDF rendered to canvas successfully');

  // Converteer canvas naar base64 PNG
  const base64 = canvas.toDataURL('image/png');
  return base64;
}

// ============================================================================
// AFBEELDING CONVERSIE: AFBEELDING NAAR BASE64
// ============================================================================
/**
 * Converteert een afbeeldingsbestand naar base64 formaat.
 *
 * @param {File} file - Afbeeldingsbestand (JPEG, PNG, etc.)
 * @returns {Promise<string>} Base64 gecodeerde afbeelding met data URL
 *
 * GEBRUIK:
 * Wordt gebruikt voor Vision AI OCR wanneer het geüploade bestand
 * al een afbeelding is (geen PDF conversie nodig).
 */
async function imageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ============================================================================
// PDF TEKST EXTRACTIE
// ============================================================================
/**
 * Extraheert tekst uit een PDF bestand met PDF.js.
 *
 * FUNCTIONALITEIT:
 * - Extraheert tekst uit elke pagina van de PDF
 * - Optioneel alleen eerste pagina voor betere prestaties
 * - Gebruikt voor PDF's met embedded tekst (niet gescand)
 *
 * @param {File} file - PDF bestand om tekst uit te extraheren
 * @param {boolean} firstPageOnly - Als true, alleen eerste pagina extraheren
 * @returns {Promise<string>} Geëxtraheerde tekst uit PDF
 *
 * GEBRUIK:
 * Als geëxtraheerde tekst < 10 karakters, is het waarschijnlijk een
 * gescande PDF zonder embedded tekst. Dan wordt Vision AI OCR gebruikt.
 */
async function extractTextFromPDF(file, firstPageOnly = false) {
  console.log('Extracting text from PDF...');
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  console.log('Total pages in PDF:', pdf.numPages);

  let fullText = '';

  // Bepaal hoeveel pagina's te extraheren
  const maxPage = firstPageOnly ? 1 : pdf.numPages;
  console.log('Will extract from page(s):', maxPage);

  // Loop door alle te extraheren pagina's
  for (let i = 1; i <= maxPage; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items.map(item => item.str).join(' ');
    fullText += pageText + '\n';
    console.log(`Page ${i} text length:`, pageText.length);
  }

  console.log(`Extracted text from ${maxPage} page(s), total length:`, fullText.length);
  console.log('First 500 chars of extracted text:', fullText.substring(0, 500));
  return fullText;
}

// ============================================================================
// OCR FUNCTIE: MELDCODE EN INSTALLATIEDATUM EXTRACTIE UIT FACTUUR
// ============================================================================
/**
 * Extraheert meldcode en installatiedatum uit factuur met Mistral AI.
 *
 * PROCES:
 * 1. Haalt Mistral API key op uit instellingen
 * 2. Voor PDF's: probeert eerst tekst extractie, anders Vision AI OCR
 * 3. Voor afbeeldingen: gebruikt direct Vision AI OCR
 * 4. Zoekt meldcode patroon (KA#####) met regex
 * 5. Zoekt datum patronen (DD-MM-YYYY, YYYY-MM-DD)
 * 6. Bij ontbrekende data: gebruikt AI voor gestructureerde extractie
 *
 * @param {File} file - Factuur bestand (PDF of afbeelding)
 * @returns {Promise<Object>} Object met meldcode en installationDate
 *
 * MELDCODE FORMAT:
 * - Start met "KA" gevolgd door 5 cijfers (bijv. KA06175)
 *
 * DATUM FORMATS ONDERSTEUND:
 * - DD-MM-YYYY (Nederlands formaat)
 * - DD/MM/YYYY
 * - YYYY-MM-DD (wordt geconverteerd naar DD-MM-YYYY)
 *
 * ERROR HANDLING:
 * - Geen API key: specifieke foutmelding
 * - Rate limit (429): wacht 30-60 seconden melding
 * - Andere API fouten: status code en bericht
 */
async function extractMeldcodeFromFactuur(file) {
  console.log('=== Starting meldcode and date extraction with Mistral ===');
  console.log('File:', file.name, 'Type:', file.type, 'Size:', file.size);

  try {
    // Haal Mistral API key op uit Chrome storage
    const { mistralApiKey } = await chrome.storage.local.get(['mistralApiKey']);
    if (!mistralApiKey) {
      throw new Error('Geen Mistral API key ingesteld. Voer eerst je API key in via instellingen.');
    }

    let textContent;

    // Bepaal extractie methode op basis van bestandstype
    if (file.type === 'application/pdf') {
      console.log('Extracting text from PDF...');
      textContent = await extractTextFromPDF(file);

      // Controleer of PDF extracteerbare tekst bevat (niet gescand)
      if (!textContent || textContent.trim().length < 10) {
        console.log('⚠️ PDF has no extractable text, using Vision AI OCR...');

        // Converteer PDF naar afbeelding voor Vision AI
        const pdfImage = await pdfToBase64Image(file);
        const base64Data = pdfImage.split(',')[1];

        // Wacht voor rate limiting
        await waitForMistralRateLimit();

        // Gebruik Mistral Pixtral Vision AI voor OCR
        const response = await fetch(CONFIG.getMistralUrl('chat/completions'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mistralApiKey}`
          },
          body: JSON.stringify({
            model: CONFIG.MISTRAL_MODELS.OCR,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Extract all text from this Dutch invoice/factuur image.

PRIORITY: Look specifically for:
1. MELDCODE: A code starting with "KA" followed by 5 digits (like KA06175, KA12345)
2. INSTALLATION DATE (installatiedatum): The date when the heat pump was installed. Look for:
   - "Datum" (this is the installation date!)
   - "Installatiedatum"
   - "Datum installatie"
   - "Datum plaatsing"

   IMPORTANT: Do NOT confuse with:
   - "Vervaldatum" (payment due date - IGNORE THIS)
   - "Factuurdatum" (invoice date - IGNORE THIS)

   The field labeled simply "Datum" is the installation date we need.

Extract ALL text but pay special attention to these two critical pieces of information.`
                },
                { type: 'image_url', image_url: `data:image/png;base64,${base64Data}` }
              ]
            }],
            max_tokens: 1000
          })
        });

        // Behandel API fouten
        if (!response.ok) {
          await handleMistralApiError(response);
        }

        const data = await response.json();
        textContent = data.choices[0].message.content;
        console.log('✅ Text extracted via Vision AI OCR');
      }
    } else {
      // Voor afbeeldingen: gebruik Vision AI OCR
      console.log('Converting image to base64 for OCR...');
      const base64Image = await imageToBase64(file);
      const base64Data = base64Image.split(',')[1];

      // Wacht voor rate limiting
      await waitForMistralRateLimit();

      const response = await fetch(CONFIG.getMistralUrl('chat/completions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mistralApiKey}`
        },
        body: JSON.stringify({
          model: CONFIG.MISTRAL_MODELS.OCR,
          messages: [{
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extract all text from this Dutch invoice/factuur image.

PRIORITY: Look specifically for:
1. MELDCODE: A code starting with "KA" followed by 5 digits (like KA06175, KA12345)
2. INSTALLATION DATE (installatiedatum): The date when the heat pump was installed. Look for:
   - "Datum" (this is the installation date!)
   - "Installatiedatum"
   - "Datum installatie"
   - "Datum plaatsing"

   IMPORTANT: Do NOT confuse with:
   - "Vervaldatum" (payment due date - IGNORE THIS)
   - "Factuurdatum" (invoice date - IGNORE THIS)

   The field labeled simply "Datum" is the installation date we need.

Extract ALL text but pay special attention to these two critical pieces of information.`
              },
              { type: 'image_url', image_url: `data:image/png;base64,${base64Data}` }
            ]
          }],
          max_tokens: 1000
        })
      });

      // Behandel API fouten
      if (!response.ok) {
        await handleMistralApiError(response);
      }

      const data = await response.json();
      textContent = data.choices[0].message.content;
    }

    console.log('Text extracted, searching for meldcode and installation date...');

    // Zoek meldcode patroon in geëxtraheerde tekst (KA + 5 cijfers)
    const meldcodeMatch = textContent.match(/KA\d{5}/i);
    let meldcode = null;
    let installationDate = null;

    if (meldcodeMatch) {
      meldcode = meldcodeMatch[0].toUpperCase();
      console.log('✅ Meldcode found in text:', meldcode);
    }

    // Zoek installatiedatum patronen
    const datePatterns = [
      /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/,  // DD-MM-YYYY or DD/MM/YYYY
      /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/   // YYYY-MM-DD or YYYY/MM/DD
    ];

    for (const pattern of datePatterns) {
      const dateMatch = textContent.match(pattern);
      if (dateMatch) {
        installationDate = dateMatch[1];
        // Converteer YYYY-MM-DD naar DD-MM-YYYY formaat indien nodig
        if (installationDate.match(/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/)) {
          const parts = installationDate.split(/[-\/]/);
          installationDate = `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
        }
        // Normaliseer scheidingsteken naar streepje
        installationDate = installationDate.replace(/\//g, '-');
        console.log('✅ Installation date found in text:', installationDate);
        break;
      }
    }

    // Als niet alle data gevonden via regex, gebruik AI extractie
    if (!meldcode || !installationDate) {
      console.log('Not all data found via regex, asking AI...');

      // Wacht voor rate limiting
      await waitForMistralRateLimit();

      const response = await fetch(CONFIG.getMistralUrl('chat/completions'), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mistralApiKey}`
        },
        body: JSON.stringify({
          model: CONFIG.MISTRAL_MODELS.EXTRACTION,
          messages: [{
            role: 'user',
            content: `Extract from this Dutch invoice text:
1. Meldcode: typically starts with "KA" followed by 5 digits (e.g., KA06175)
2. Installation date (installatiedatum): the date when the heat pump was installed

IMPORTANT FOR DATE:
- Look for fields labeled: "Datum", "Installatiedatum", "Datum installatie", "Datum plaatsing"
- The field "Datum" (without other words) is the installation date
- IGNORE "Vervaldatum" (payment due date)
- IGNORE "Factuurdatum" (invoice date)

Invoice text:
${textContent.substring(0, 2000)}

Return ONLY valid JSON:
{
  "meldcode": "KA##### or null",
  "installationDate": "DD-MM-YYYY or null"
}

Return ONLY JSON, no markdown.`
          }],
          max_tokens: 100
        })
      });

      // Behandel API fouten
      if (!response.ok) {
        await handleMistralApiError(response);
      }

      const data = await response.json();
      let content = data.choices[0].message.content.trim();
      console.log('AI response:', content);

      // Verwijder markdown code blocks indien aanwezig
      content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      try {
        const extracted = JSON.parse(content);

        // Gebruik AI geëxtraheerde meldcode als niet gevonden via regex
        if (!meldcode && extracted.meldcode && extracted.meldcode !== 'null') {
          meldcode = extracted.meldcode.toUpperCase();
          console.log('✅ Meldcode extracted by AI:', meldcode);
        }

        // Gebruik AI geëxtraheerde datum als niet gevonden via regex
        if (!installationDate && extracted.installationDate && extracted.installationDate !== 'null') {
          installationDate = extracted.installationDate;
          console.log('✅ Installation date extracted by AI:', installationDate);
        }
      } catch (parseError) {
        console.warn('Could not parse AI JSON response:', parseError);
      }
    }

    // ========================================================================
    // APPLY SANITIZATION TO EXTRACTED FACTUUR DATA
    // ========================================================================
    console.log('=== Applying sanitization to factuur data ===');

    if (meldcode) meldcode = sanitizeMeldCode(meldcode);
    if (installationDate) installationDate = sanitizeInstallationDate(installationDate);

    console.log('=== Final factuur data (after sanitization) ===', { meldcode, installationDate });
    return { meldcode, installationDate };

  } catch (error) {
    console.error('Extraction Error:', error);
    throw error;
  }
}

// ============================================================================
// OCR FUNCTIE: KLANTGEGEVENS EXTRACTIE UIT MACHTIGINGSFORMULIER
// ============================================================================
/**
 * Extraheert klantgegevens uit machtigingsformulier met Mistral AI.
 *
 * PROCES:
 * 1. Haalt Mistral API key op uit instellingen
 * 2. Converteert document naar base64 (PDF of afbeelding)
 * 3. Voert Mistral Document OCR uit voor tekst extractie
 * 4. Gebruikt AI voor gestructureerde data extractie met specifieke instructies
 * 5. Past regex fallbacks toe voor gemiste velden (BSN, IBAN, email, telefoon)
 * 6. Gebruikt Vision AI voor checkbox detectie (aardgasgebruik vraag)
 *
 * @param {File} file - Machtigingsformulier bestand (PDF of afbeelding)
 * @returns {Promise<Object>} Geëxtraheerde klantgegevens
 *
 * GEËXTRAHEERDE VELDEN:
 * - bsn: 9-cijferig Burgerservicenummer
 * - initials: Voorletters
 * - lastName: Achternaam
 * - gender: "male" of "female"
 * - email: E-mailadres (geen bedrijfs-emails)
 * - phone: Telefoonnummer (06 of 0 prefix, geen 085 nummers)
 * - iban: Bankrekeningnummer (zonder spaties/punten)
 * - street: Straatnaam
 * - houseNumber: Huisnummer (inclusief toevoeging zoals "59A01")
 * - postalCode: Postcode
 * - city: Plaatsnaam
 * - gasUsage: "yes" of "no" (aardgas voor ruimteverwarming na installatie)
 *
 * AI MODELLEN GEBRUIKT:
 * - mistral-ocr-latest: Document OCR voor tekst extractie
 * - mistral-small-latest: Gestructureerde data extractie
 * - pixtral-12b-2409: Vision AI voor checkbox detectie
 *
 * REGEX FALLBACKS:
 * Als AI velden mist, worden regex patronen toegepast voor:
 * - BSN: 9 cijfers met optionele spaties/streepjes
 * - IBAN: NL + 2 cijfers + 4 letters + 10 cijfers
 * - Email: Standaard email patroon (exclusief @samangroep)
 * - Telefoon: Nederlandse telefoonpatronen
 *
 * SPECIALE BEHANDELING AARDGASGEBRUIK:
 * De vraag over aardgasgebruik heeft vaak checkboxes. Vision AI
 * wordt gebruikt om te detecteren welke checkbox is aangevinkt:
 * - Gekruist/doorgestreept = NIET geselecteerd
 * - Omcirkeld/aangevinkt = WEL geselecteerd
 */
async function extractDataFromForm(file, uploadTabId) {
  console.log('=== Starting extraction with Mistral ===');
  console.log('File:', file.name, 'Type:', file.type, 'Size:', file.size);

  try {
    // Haal Mistral API key op uit Chrome storage
    const { mistralApiKey } = await chrome.storage.local.get(['mistralApiKey']);
    if (!mistralApiKey) {
      throw new Error('Geen Mistral API key ingesteld. Voer eerst je API key in via instellingen.');
    }

    let textContent;

    // Gebruik Mistral Document AI OCR voor betere extractie
    console.log('Using Mistral Document AI OCR...');
    if (currentTrackedTabId === uploadTabId) {
      showExtractionStatus('🔄 Document OCR met Mistral AI...', 'extractionStatus', 'processing', 0);
    }

    // Converteer bestand naar base64 voor OCR API
    let base64Document;
    let documentType;
    let documentKey;

    if (file.type === 'application/pdf') {
      // Voor PDF: converteer naar base64
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
      base64Document = `data:application/pdf;base64,${btoa(binary)}`;
      documentType = 'document_url';
      documentKey = 'document_url';
    } else {
      // Voor afbeeldingen: converteer naar base64
      base64Document = await imageToBase64(file);
      documentType = 'image_url';
      documentKey = 'image_url';
    }

    if (currentTrackedTabId === uploadTabId) {
      showExtractionStatus('🔄 Document wordt geanalyseerd...', 'extractionStatus', 'processing', 0);
    }

    // Stap 1: Extraheer tekst met Mistral OCR
    console.log('Calling Mistral OCR API...');
    console.log('Document type:', documentType);

    const ocrRequestBody = {
      model: 'mistral-ocr-latest',
      document: {
        type: documentType
      }
    };
    ocrRequestBody.document[documentKey] = base64Document;

    // Wacht voor rate limiting
    await waitForMistralRateLimit();

    const ocrResponse = await fetch(CONFIG.getMistralUrl('ocr'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`
      },
      body: JSON.stringify(ocrRequestBody)
    });

    // Behandel OCR API fouten met gedetailleerde foutmeldingen
    if (!ocrResponse.ok) {
      let errorMessage = 'Unknown error';
      let errorDetails = '';

      try {
        const errorData = await ocrResponse.json();
        errorMessage = errorData.error?.message || ocrResponse.statusText;
        errorDetails = JSON.stringify(errorData);
        console.error('Mistral OCR API error details:', errorData);
      } catch (e) {
        errorMessage = ocrResponse.statusText;
        console.error('Could not parse OCR error response');
      }

      console.error(`Mistral OCR failed with status ${ocrResponse.status}:`, errorMessage);
      console.error('Full error details:', errorDetails);

      // Geef specifieke foutmeldingen per status code
      if (ocrResponse.status === 401) {
        throw new Error('Mistral API key is ongeldig. Controleer je API key in instellingen.');
      } else if (ocrResponse.status === 429) {
        throw new Error('Mistral API rate limit bereikt. Wacht 30-60 seconden en probeer opnieuw.');
      } else if (ocrResponse.status === 413) {
        throw new Error('Bestand te groot voor OCR. Probeer een kleiner bestand of lagere resolutie.');
      } else {
        throw new Error(`Mistral OCR error (${ocrResponse.status}): ${errorMessage}`);
      }
    }

    const ocrData = await ocrResponse.json();
    console.log('OCR response:', ocrData);

    // Extraheer tekst uit OCR response (alleen eerste pagina)
    let extractedText = '';
    if (ocrData.pages && ocrData.pages.length > 0) {
      extractedText = ocrData.pages[0].markdown || '';
    }

    console.log('Extracted text from OCR (first 500 chars):', extractedText.substring(0, 500));
    console.log('=== FULL OCR TEXT FOR DEBUGGING ===');
    console.log(extractedText);
    console.log('=== END FULL OCR TEXT ===');

    if (currentTrackedTabId === uploadTabId) {
      showExtractionStatus('🔄 Gegevens extraheren met AI...', 'extractionStatus', 'processing', 0);
    }

    // Stap 2: Gebruik text model voor gestructureerde data extractie
    console.log('Calling Mistral text model for structured extraction...');

    // Wacht voor rate limiting
    await waitForMistralRateLimit();

    const response = await fetch(CONFIG.getMistralUrl('chat/completions'), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`
      },
      body: JSON.stringify({
        model: CONFIG.MISTRAL_MODELS.EXTRACTION,
        messages: [{
          role: 'user',
          content: `Extract the CUSTOMER information from this Dutch machtigingsformulier text.

IMPORTANT: Extract the FILLED-IN customer data, NOT the company information (like SAMAN, Gouwepoort, Zierikzee).

Look for customer details after these labels:
- "Achternaam en voorletters" - extract last name and initials
- "Geslacht" - return "male" for "Man/M" or "female" for "Vrouw/V"
- "Adres" - street name (like Insulindestraat)
- House number (like 59A01)
- "Postcode en plaats" - postal code and city
- "Telefoonnummer" - phone (06 or 0 prefix, NOT 085 company numbers)
- "E-mail" - personal email (NOT @samangroep)
- "BSN" - 9-digit BSN number
- "IBAN" - starts with NL (IMPORTANT: return WITHOUT spaces or dots, e.g., NL33INGB0682403059)

VERY IMPORTANT - Gas usage question:
Look for ANY variation of this question about gas usage:
- "Gebruikt u na installatie van deze warmtepomp nog aardgas voor ruimte verwarming?"
- "Gebruikt u nog aardgas"
- "aardgas voor ruimte verwarming"
If you find this question with answer "Ja" → return "yes"
If you find this question with answer "nee" or "Nee" → return "no"
If the question is present but unanswered → return null

Return ONLY valid JSON:

{
  "bsn": "BSN or null",
  "initials": "initials or null",
  "lastName": "last name or null",
  "gender": "male or female or null",
  "email": "email or null",
  "phone": "phone or null",
  "iban": "IBAN or null",
  "street": "street name or null",
  "postalCode": "postal code or null",
  "city": "city or null",
  "houseNumber": "house number or null",
  "gasUsage": "yes or no or null"
}

Text:
${extractedText}

Return ONLY JSON, no markdown.`
        }],
        max_tokens: 500
      })
    });

    // Behandel AI extractie API fouten
    if (!response.ok) {
      await handleMistralApiError(response);
    }

    const data = await response.json();
    console.log('Mistral API response:', data);

    let content = data.choices[0].message.content;
    console.log('Extracted content:', content);

    // Verwijder markdown code blocks indien aanwezig
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    console.log('Cleaned content:', content);

    // Parse JSON response naar object
    let extractedData = JSON.parse(content);

    // Pas regex fallbacks toe voor gemiste velden
    extractedData = applyRegexFallbacks(extractedData, extractedText);
    console.log('🔍 After regex fallbacks:', extractedData);

    // ========================================================================
    // EXTRA VALIDATIE: VISION AI VOOR AARDGAS CHECKBOX DETECTIE
    // ========================================================================
    /**
     * Als AI het aardgasgebruik veld niet heeft gevonden, gebruiken we
     * Vision AI om de aangevinkte checkbox te detecteren.
     *
     * PROCES:
     * 1. Converteer document naar afbeelding (voor PDF: lagere kwaliteit JPEG)
     * 2. Gebruik Pixtral Vision AI om checkboxes te analyseren
     * 3. Detecteer welke optie geselecteerd is op basis van visuele kenmerken:
     *    - Omcirkeld/aangevinkt = geselecteerd
     *    - Doorgestreept = NIET geselecteerd
     * 4. Als Vision AI onzeker is, skip deze stap
     * 5. Als Vision AI faalt, fallback naar tekst-gebaseerde detectie
     */
    if (!extractedData.gasUsage || extractedData.gasUsage === 'null') {
      console.log('Gas usage not found by AI, using Vision AI to detect checkbox...');

      if (currentTrackedTabId === uploadTabId) {
        showExtractionStatus('🔄 Aardgas checkbox detecteren met Vision AI...', 'extractionStatus', 'processing', 0);
      }

      // Converteer document naar afbeelding voor vision analyse
      let visionBase64;
      if (file.type === 'application/pdf') {
        console.log('Converting PDF to image for vision analysis...');
        // Gebruik lagere kwaliteit JPEG voor Vision AI om bestandsgrootte te verminderen
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.2 }); // Lagere schaal voor kleinere afbeelding

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;

        // Converteer naar JPEG met compressie voor kleinere bestandsgrootte
        visionBase64 = canvas.toDataURL('image/jpeg', 0.8);
        console.log('PDF converted to JPEG for Vision AI, size:', visionBase64.length, 'chars');
      } else {
        // Voor afbeeldingen: converteer naar base64
        visionBase64 = await imageToBase64(file);
      }

      const visionData = visionBase64.split(',')[1];

      try {
        // Roep Vision AI aan voor checkbox detectie
        // Wacht voor rate limiting
        await waitForMistralRateLimit();

        const visionResponse = await fetch(CONFIG.getMistralUrl('chat/completions'), {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mistralApiKey}`
          },
          body: JSON.stringify({
            model: CONFIG.MISTRAL_MODELS.OCR,
            messages: [{
              role: 'user',
              content: [
                {
                  type: 'text',
                  text: `Look at this Dutch machtigingsformulier image. Find the question: "Gebruikt u na installatie van deze warmtepomp nog aardgas voor ruimte verwarming?"

The question has two options: "Ja" and "nee". ONE is selected, ONE is NOT selected.

CRITICAL: The SELECTED answer shows what the person chose. Look for these indicators:

SELECTED (chosen answer):
- CIRCLED (has a circle around it)
- CHECKED box (☑ or ✓)
- NOT crossed out / NOT strikethrough
- Has asterisk or underline
- Looks emphasized or highlighted

NOT SELECTED (rejected answer):
- Has STRIKETHROUGH / crossed out line through the text
- Looks faded or de-emphasized
- No marking

STEP BY STEP:
1. Find both options: "Ja" and "nee"
2. Check if "Ja" has strikethrough → if YES, then "nee" is selected → return "no"
3. Check if "nee" has strikethrough → if YES, then "Ja" is selected → return "yes"
4. If one is circled/checked, that one is selected
5. If you cannot clearly tell which is selected → return "unknown"

Return ONLY one word: "yes", "no", or "unknown"`
                },
                {
                  type: 'image_url',
                  image_url: visionBase64.startsWith('data:image/jpeg') ? visionBase64 : `data:image/jpeg;base64,${visionData}`
                }
              ]
            }],
            max_tokens: 10
          })
        });

        if (visionResponse.ok) {
          const visionDataResponse = await visionResponse.json();
          const visionAnswer = visionDataResponse.choices[0].message.content.toLowerCase().trim();
          console.log('=== VISION AI RESPONSE ===');
          console.log('Raw response:', visionDataResponse.choices[0].message.content);
          console.log('Lowercase trimmed:', visionAnswer);
          console.log('=========================');

          // Controleer of Vision AI onzeker is over het antwoord
          const isUncertain = visionAnswer.includes('unknown') ||
                            visionAnswer.includes('cannot determine') ||
                            visionAnswer.includes('not provide a clear') ||
                            visionAnswer.includes('unclear') ||
                            visionAnswer.includes('not sure');

          if (isUncertain) {
            console.log('⚠️ Vision AI is uncertain about gas usage, skipping...');
            // Stel gasUsage niet in, laat null voor handmatig invullen
          } else if (visionAnswer.includes('yes') || visionAnswer === 'ja') {
            extractedData.gasUsage = 'yes';
            console.log('✅ Gas usage "Ja" detected via Vision AI');
          } else if (visionAnswer.includes('no') || visionAnswer === 'nee') {
            extractedData.gasUsage = 'no';
            console.log('✅ Gas usage "Nee" detected via Vision AI');
            console.log('⚠️ WARNING: Vision AI chose "Nee" - verify this is correct!');
          } else {
            console.log('⚠️ Vision AI returned unexpected response, skipping...');
          }
        } else {
          console.error('Vision AI request failed:', visionResponse.status, visionResponse.statusText);
        }
      } catch (visionError) {
        console.warn('Vision AI failed, falling back to text patterns:', visionError);

        // Fallback naar tekst-gebaseerde detectie
        const gasQuestionRegex = /gebruikt.*warmtepomp.*aardgas.*ruimte.*verwarming/i;
        if (gasQuestionRegex.test(extractedText)) {
          console.log('✅ Gas usage question found in text');

          // Log de context rondom de vraag voor debugging
          const questionMatch = extractedText.match(/(gebruikt.*warmtepomp.*aardgas.*ruimte.*verwarming.{0,100})/i);
          if (questionMatch) {
            console.log('Question context:', questionMatch[1]);
          }

          // Probeer "Ja" of "Nee" te vinden binnen 100 karakters na de vraag
          const gasAnswerMatch = extractedText.match(/gebruikt.*warmtepomp.*aardgas.*ruimte.*verwarming.{0,100}(ja|nee)/i);
          if (gasAnswerMatch) {
            const answer = gasAnswerMatch[1].toLowerCase();
            extractedData.gasUsage = answer === 'ja' ? 'yes' : 'no';
            console.log('✅ Gas usage answer found via regex fallback:', extractedData.gasUsage);
          }
        }
      }
    }

    // Converteer null waarden naar undefined (verwijder uit object)
    Object.keys(extractedData).forEach(key => {
      if (extractedData[key] === null || extractedData[key] === 'null') {
        delete extractedData[key];
      }
    });

    // ========================================================================
    // APPLY SANITIZATION TO ALL EXTRACTED FIELDS
    // ========================================================================
    console.log('=== Applying sanitization to extracted data ===');

    // Object om validatie warnings bij te houden
    const validationWarnings = {};

    // Personal data
    if (extractedData.bsn) {
      const original = extractedData.bsn;
      const sanitized = sanitizeBSN(extractedData.bsn);
      if (!sanitized) {
        validationWarnings.bsn = `⚠️ Ongeldig BSN (controleer lengte en checksum)`;
        // Behoud originele waarde zodat het veld ingevuld wordt
        extractedData.bsn = original;
      } else {
        extractedData.bsn = sanitized;
      }
    }
    if (extractedData.initials) {
      const original = extractedData.initials;
      const sanitized = sanitizeInitials(extractedData.initials);
      if (!sanitized) {
        validationWarnings.initials = `⚠️ Ongeldige voorletters`;
        extractedData.initials = original;
      } else {
        extractedData.initials = sanitized;
      }
    }
    if (extractedData.lastName) {
      const original = extractedData.lastName;
      const sanitized = sanitizeLastName(extractedData.lastName);
      if (!sanitized) {
        validationWarnings.lastName = `⚠️ Ongeldige achternaam`;
        extractedData.lastName = original;
      } else {
        extractedData.lastName = sanitized;
      }
    }
    if (extractedData.gender) {
      const original = extractedData.gender;
      const sanitized = sanitizeGender(extractedData.gender);
      if (!sanitized) {
        validationWarnings.gender = `⚠️ Ongeldig geslacht (verwacht: man/vrouw)`;
        extractedData.gender = original;
      } else {
        extractedData.gender = sanitized;
      }
    }

    // Contact data
    if (extractedData.phone) {
      const original = extractedData.phone;
      const sanitized = sanitizePhone(extractedData.phone);
      if (!sanitized) {
        validationWarnings.phone = `⚠️ Ongeldig telefoonnummer (verwacht: 10 cijfers, start met 0)`;
        extractedData.phone = original;
      } else {
        extractedData.phone = sanitized;
      }
    }
    if (extractedData.email) {
      const original = extractedData.email;
      const sanitized = sanitizeEmail(extractedData.email);
      if (!sanitized) {
        validationWarnings.email = `⚠️ Ongeldig e-mailadres`;
        extractedData.email = original;
      } else {
        extractedData.email = sanitized;
      }
    }
    if (extractedData.iban) {
      const original = extractedData.iban;
      const sanitized = sanitizeIBAN(extractedData.iban);
      if (!sanitized) {
        validationWarnings.iban = `⚠️ Ongeldig IBAN (controleer checksum en lengte)`;
        extractedData.iban = original;
      } else {
        extractedData.iban = sanitized;
      }
    }

    // Address data
    if (extractedData.street) {
      const original = extractedData.street;
      const sanitized = sanitizeStreet(extractedData.street);
      if (!sanitized) {
        validationWarnings.street = `⚠️ Ongeldige straatnaam`;
        extractedData.street = original;
      } else {
        extractedData.street = sanitized;
      }
    }
    if (extractedData.houseNumber) {
      const houseData = sanitizeHouseNumber(extractedData.houseNumber);
      extractedData.houseNumber = houseData.number;
      if (houseData.addition) extractedData.houseAddition = houseData.addition;
    }
    if (extractedData.postalCode) {
      const original = extractedData.postalCode;
      const sanitized = sanitizePostalCode(extractedData.postalCode);
      if (!sanitized) {
        validationWarnings.postalCode = `⚠️ Ongeldige postcode (verwacht: 4 cijfers + 2 letters)`;
        extractedData.postalCode = original;
      } else {
        extractedData.postalCode = sanitized;
      }
    }
    if (extractedData.city) {
      const original = extractedData.city;
      const sanitized = sanitizeCity(extractedData.city);
      if (!sanitized) {
        validationWarnings.city = `⚠️ Ongeldige plaatsnaam`;
        extractedData.city = original;
      } else {
        extractedData.city = sanitized;
      }
    }

    // Other fields
    if (extractedData.gasUsage) {
      const original = extractedData.gasUsage;
      const sanitized = sanitizeGasUsage(extractedData.gasUsage);
      if (!sanitized) {
        validationWarnings.gasUsage = `⚠️ Ongeldig aardgas gebruik (verwacht: ja/nee)`;
        extractedData.gasUsage = original;
      } else {
        extractedData.gasUsage = sanitized;
      }
    }

    console.log('=== Final extracted data (after sanitization) ===', extractedData);
    console.log('=== Validation warnings ===', validationWarnings);

    // Voeg validationWarnings toe aan extractedData zodat fillFormFields het kan gebruiken
    extractedData._validationWarnings = validationWarnings;

    return extractedData;

  } catch (error) {
    console.error('Extraction Error:', error);
    throw error;
  }
}

// ============================================================================
// CONFIGURATIE LADEN BIJ OPSTARTEN
// ============================================================================
/**
 * Laadt tab-specifieke formulier data bij het openen van de popup.
 *
 * FUNCTIONALITEIT:
 * - Laadt opgeslagen formulier data voor de huidige tab
 * - Initialiseert lege velden als er geen opgeslagen data is
 * - Reset document variabelen naar null (documenten niet opgeslagen)
 * - Ruimt data op van gesloten tabs
 * - Zet auto-save event listeners op alle velden
 *
 * PRIVACY & VEILIGHEID:
 * Data wordt opgeslagen PER TAB tijdens de browsersessie. Elke tab heeft
 * zijn eigen onafhankelijke formulier data. Data wordt automatisch opgeruimd
 * wanneer tabs worden gesloten.
 */
async function loadConfiguration() {
  // Set loading flag to prevent auto-save during initial load
  isLoadingTabData = true;

  try {
    // Haal huidige tab ID op
    const tabId = await getCurrentTabId();
    console.log(`🔄 Loading form data for tab ${tabId}`);

    // Laad opgeslagen data voor deze tab
    const savedFormData = await loadFormDataForTab(tabId);

    if (savedFormData) {
      // Laad opgeslagen waarden
      console.log(`✅ Found saved form data for tab ${tabId}`);
      getAllFieldIds().forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field && savedFormData[fieldId] !== undefined) {
          field.value = savedFormData[fieldId];
        }
      });
    } else {
      // Geen opgeslagen data - initialiseer met lege velden
      console.log(`📝 No saved data for tab ${tabId} - starting with empty form`);
      getAllFieldIds().forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
          field.value = '';
        }
      });
    }

    // Laad opgeslagen documenten voor deze tab
    const savedDocuments = await loadDocumentsForTab(tabId);

    if (savedDocuments) {
      console.log(`✅ Found saved documents for tab ${tabId}`);

      // Herstel betaalbewijs
      if (savedDocuments.betaalbewijs) {
        betaalbewijsData = savedDocuments.betaalbewijs;
        displayFileNameWithDelete('betaalbewijsName', savedDocuments.betaalbewijs.name, 'betaalbewijs');
      } else {
        betaalbewijsData = null;
        const nameDiv = document.getElementById(POPUP_SELECTORS.betaalbewijsName);
        if (nameDiv) {
          nameDiv.style.display = 'none';
          nameDiv.innerHTML = '';
        }
      }

      // Herstel factuur
      if (savedDocuments.factuur) {
        factuurData = savedDocuments.factuur;
        displayFileNameWithDelete('factuurName', savedDocuments.factuur.name, 'factuur');
      } else {
        factuurData = null;
        const nameDiv = document.getElementById(POPUP_SELECTORS.factuurName);
        if (nameDiv) {
          nameDiv.style.display = 'none';
          nameDiv.innerHTML = '';
        }
      }

      // Herstel machtigingsbewijs
      if (savedDocuments.machtigingsbewijs) {
        machtigingsbewijsData = savedDocuments.machtigingsbewijs;
        displayFileNameWithDelete('machtigingName', savedDocuments.machtigingsbewijs.name, 'machtigingsbewijs');
      } else {
        machtigingsbewijsData = null;
        const nameDiv = document.getElementById(POPUP_SELECTORS.machtigingName);
        if (nameDiv) {
          nameDiv.style.display = 'none';
          nameDiv.innerHTML = '';
        }
      }
    } else {
      // Geen opgeslagen documenten
      console.log(`📝 No saved documents for tab ${tabId}`);
      betaalbewijsData = null;
      factuurData = null;
      machtigingsbewijsData = null;

      // Reset file input velden
      const betaalbewijsInput = document.getElementById(POPUP_SELECTORS.betaalbewijsDoc);
      const factuurInput = document.getElementById(POPUP_SELECTORS.factuurDoc);
      const machtigingsInput = document.getElementById(POPUP_SELECTORS.machtigingsformulier);
      if (betaalbewijsInput) betaalbewijsInput.value = '';
      if (factuurInput) factuurInput.value = '';
      if (machtigingsInput) machtigingsInput.value = '';

      // Verberg naam divs
      const betaalbewijsName = document.getElementById(POPUP_SELECTORS.betaalbewijsName);
      const factuurName = document.getElementById(POPUP_SELECTORS.factuurName);
      const machtigingName = document.getElementById(POPUP_SELECTORS.machtigingName);
      if (betaalbewijsName) {
        betaalbewijsName.style.display = 'none';
        betaalbewijsName.innerHTML = '';
      }
      if (factuurName) {
        factuurName.style.display = 'none';
        factuurName.innerHTML = '';
      }
      if (machtigingName) {
        machtigingName.style.display = 'none';
        machtigingName.innerHTML = '';
      }
    }

    // Ruim data van gesloten tabs op
    await cleanupClosedTabsData();

    // Setup auto-save listeners voor alle velden
    setupAutoSaveListeners();

    // Set the tracked tab ID
    currentTrackedTabId = tabId;

    // Re-valideer alle velden om warnings te tonen voor ongeldige waardes
    revalidateAllFields();

    // Update start button state op basis van geladen data
    updateStartButtonState();

  } catch (error) {
    console.error('Error loading configuration:', error);
    // Fallback: reset naar lege velden
    getAllFieldIds().forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.value = '';
      }
    });
  } finally {
    // Always reset loading flag
    isLoadingTabData = false;
    console.log(`✅ Finished loading configuration`);
  }
}

/**
 * Zet event listeners op alle formulier velden voor auto-save.
 * Verwijdert eerst oude listeners om duplicaten te voorkomen.
 */
function setupAutoSaveListeners() {
  getAllFieldIds().forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      // Verwijder eerst oude listeners om duplicaten te voorkomen
      field.removeEventListener('input', autoSaveFormData);
      field.removeEventListener('change', autoSaveFormData);

      // Voeg nieuwe listeners toe
      // Gebruik 'input' event voor real-time updates (tijdens typen)
      field.addEventListener('input', autoSaveFormData);
      // Gebruik 'change' event voor dropdowns en andere controls
      field.addEventListener('change', autoSaveFormData);
    }
  });
  console.log('✅ Auto-save listeners setup complete');
}

// ============================================================================
// VALIDATIE: CONTROLEER VERPLICHTE VELDEN
// ============================================================================
/**
 * Controleert of alle verplichte velden zijn ingevuld.
 *
 * VERPLICHTE VELDEN:
 * - Persoonlijke gegevens: BSN, voorletters, achternaam, geslacht
 * - Contactgegevens: telefoon, email
 * - Financieel: IBAN
 * - Adresgegevens: straat, huisnummer, postcode, plaats
 * - Installatie: aankoopdatum, installatiedatum, meldcode, aardgasgebruik
 * - Documenten: betaalbewijs, factuur
 *
 * @returns {Array<string>} Array met labels van ontbrekende velden
 *
 * GEBRUIK:
 * Wordt gebruikt om de "Start Automatisering" knop in/uit te schakelen
 * en om te valideren voordat automatisering start.
 */
function validateRequiredFields(highlightMissing = false) {
  const missingFields = [];

  // Controleer alle verplichte formuliervelden
  getRequiredFieldIds().forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field && !field.value.trim()) {
      missingFields.push(FIELD_LABELS[fieldId]);

      // Markeer veld als leeg (rood)
      if (highlightMissing) {
        field.classList.add('field-required-missing');
      }
    } else if (field && highlightMissing) {
      // Verwijder markering als veld wel ingevuld is
      field.classList.remove('field-required-missing');
    }
  });

  // Controleer of documenten zijn geüpload
  if (!betaalbewijsData) {
    missingFields.push('Betaalbewijs');

    // Markeer betaalbewijs upload sectie
    if (highlightMissing) {
      const betaalbewijsSection = document.getElementById(POPUP_SELECTORS.betaalbewijsDoc);
      if (betaalbewijsSection) {
        betaalbewijsSection.classList.add('field-required-missing');
      }
    }
  } else if (highlightMissing) {
    const betaalbewijsSection = document.getElementById(POPUP_SELECTORS.betaalbewijsDoc);
    if (betaalbewijsSection) {
      betaalbewijsSection.classList.remove('field-required-missing');
    }
  }

  if (!factuurData) {
    missingFields.push('Factuur');

    // Markeer factuur upload sectie
    if (highlightMissing) {
      const factuurSection = document.getElementById(POPUP_SELECTORS.factuurDoc);
      if (factuurSection) {
        factuurSection.classList.add('field-required-missing');
      }
    }
  } else if (highlightMissing) {
    const factuurSection = document.getElementById(POPUP_SELECTORS.factuurDoc);
    if (factuurSection) {
      factuurSection.classList.remove('field-required-missing');
    }
  }

  return missingFields;
}

// ============================================================================
// KNOPSTATUS: UPDATE "START AUTOMATISERING" KNOP
// ============================================================================
/**
 * Update de enabled/disabled status van de "Start Automatisering" knop.
 *
 * FUNCTIONALITEIT:
 * - Valideert alle verplichte velden
 * - Schakelt knop in als alle velden compleet zijn
 * - Schakelt knop uit als velden ontbreken
 * - Past visuele styling aan (opacity, cursor)
 *
 * WORDT AANGEROEPEN:
 * - Na document upload
 * - Na OCR extractie
 * - Bij invoer in formuliervelden (via event listeners)
 */
function updateStartButtonState() {
  const startButton = document.getElementById(POPUP_SELECTORS.startAutomation);
  const missingFields = validateRequiredFields();

  if (missingFields.length > 0) {
    // Er ontbreken velden - knop uitschakelen
    startButton.disabled = true;
    startButton.style.opacity = '0.5';
    startButton.style.cursor = 'not-allowed';
  } else {
    // Alle velden compleet - knop inschakelen
    startButton.disabled = false;
    startButton.style.opacity = '1';
    startButton.style.cursor = 'pointer';
  }
}

// ============================================================================
// FIELD WARNING HELPER (GLOBAL)
// ============================================================================
/**
 * Re-valideert alle velden met waardes en toont warnings indien nodig.
 * Wordt aangeroepen na het laden van tab data.
 */
function revalidateAllFields() {
  // Valideer BSN
  const bsnField = document.getElementById(POPUP_SELECTORS.bsn);
  if (bsnField && bsnField.value) {
    const sanitized = sanitizeBSN(bsnField.value);
    if (!sanitized) {
      showFieldWarning('bsn', 'bsnWarning', `⚠️ Ongeldig BSN (controleer lengte en checksum)`);
    }
  }

  // Valideer IBAN
  const ibanField = document.getElementById(POPUP_SELECTORS.iban);
  if (ibanField && ibanField.value) {
    const sanitized = sanitizeIBAN(ibanField.value);
    if (!sanitized) {
      showFieldWarning('iban', 'ibanWarning', `⚠️ Ongeldig IBAN (controleer lengte en checksum)`);
    }
  }

  // Valideer telefoon
  const phoneField = document.getElementById(POPUP_SELECTORS.phone);
  if (phoneField && phoneField.value) {
    const sanitized = sanitizePhone(phoneField.value);
    if (!sanitized) {
      showFieldWarning('phone', 'phoneWarning', `⚠️ Ongeldig telefoonnummer (10 cijfers verwacht)`);
    }
  }

  // Valideer email
  const emailField = document.getElementById(POPUP_SELECTORS.email);
  if (emailField && emailField.value) {
    const sanitized = sanitizeEmail(emailField.value);
    if (!sanitized) {
      showFieldWarning('email', 'emailWarning', `⚠️ Ongeldig e-mailadres`);
    }
  }

  // Valideer voorletters
  const initialsField = document.getElementById(POPUP_SELECTORS.initials);
  if (initialsField && initialsField.value) {
    const sanitized = sanitizeInitials(initialsField.value);
    if (!sanitized) {
      showFieldWarning('initials', 'initialsWarning', `⚠️ Ongeldige voorletters (alleen letters en punten)`);
    }
  }

  // Valideer geslacht - maar toon waarschuwing NIET als veld nog niet is "touched"
  // Waarschuwing wordt alleen getoond via blur event of bij submit attempt
  const genderField = document.getElementById(POPUP_SELECTORS.gender);
  if (genderField && genderField.value) {
    // Als er een waarde is, check of het een geldige waarde is
    const hasValidGender = genderField.value !== '' &&
                          genderField.value !== '-- Selecteer --' &&
                          (genderField.value === 'male' || genderField.value === 'female');

    if (hasValidGender) {
      // Valid gender geselecteerd - verwijder eventuele waarschuwing
      showFieldWarning('gender', 'genderWarning', null);
    }
    // Als invalid, laat bestaande waarschuwing staan (niet opnieuw tonen)
  }
  // Als leeg, doe niets (geen waarschuwing tonen bij page load)

  console.log('✅ Re-validated all fields');
}

/**
 * Show or hide a field warning message
 * @param {string} fieldId - ID of the input field
 * @param {string} warningId - ID of the warning div
 * @param {string|null} message - Warning message to show (null to hide)
 */
function showFieldWarning(fieldId, warningId, message) {
  const field = document.getElementById(fieldId);
  const warningDiv = document.getElementById(warningId);

  if (!field || !warningDiv) return;

  if (message) {
    // Show warning
    warningDiv.textContent = message;
    warningDiv.classList.add('visible');
    field.classList.add('has-warning');
  } else {
    // Hide warning
    warningDiv.textContent = '';
    warningDiv.classList.remove('visible');
    field.classList.remove('has-warning');
  }
}

// ============================================================================
// EVENT LISTENERS: FORMULIERVELDEN VOOR KNOPSTATUS
// ============================================================================
/**
 * Voegt event listeners toe aan alle invoervelden om de knopstatus
 * real-time bij te werken wanneer de gebruiker velden invult.
 *
 * EVENTS:
 * - 'input': Voor directe feedback tijdens typen
 * - 'change': Voor select dropdowns en datum velden
 */
document.addEventListener('DOMContentLoaded', () => {
  // Setup event listeners voor alle verplichte velden
  getRequiredFieldIds().forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener('input', () => {
        // Verwijder rode markering zodra gebruiker begint te typen
        field.classList.remove('field-required-missing');
        updateStartButtonState();
      });
      field.addEventListener('change', () => {
        // Verwijder rode markering bij change event
        field.classList.remove('field-required-missing');
        updateStartButtonState();
      });
    }
  });

  // ========================================================================
  // REAL-TIME SANITIZATION EVENT LISTENERS
  // ========================================================================
  // Automatically sanitize field values when user leaves the field (blur event)

  // BSN sanitization
  const bsnField = document.getElementById(POPUP_SELECTORS.bsn);
  if (bsnField) {
    bsnField.addEventListener('blur', function() {
      if (this.value) {
        const originalValue = this.value;
        const sanitized = sanitizeBSN(this.value);

        if (sanitized) {
          this.value = sanitized;
          // Validatie geslaagd - verberg warning
          showFieldWarning('bsn', 'bsnWarning', null);
        } else {
          // Validatie gefaald - behoud originele waarde en toon warning
          this.value = originalValue;
          showFieldWarning('bsn', 'bsnWarning', `⚠️ Ongeldig BSN (controleer lengte en checksum)`);
        }
      } else {
        // Clear warning when field is empty
        showFieldWarning('bsn', 'bsnWarning', null);
      }
    });
  }

  // IBAN sanitization
  const ibanField = document.getElementById(POPUP_SELECTORS.iban);
  if (ibanField) {
    ibanField.addEventListener('blur', function() {
      if (this.value) {
        const originalValue = this.value;
        const sanitized = sanitizeIBAN(this.value);

        if (sanitized) {
          this.value = sanitized;
          // Validatie geslaagd - verberg warning
          showFieldWarning('iban', 'ibanWarning', null);
        } else {
          // Validatie gefaald - behoud originele waarde en toon warning
          this.value = originalValue;
          showFieldWarning('iban', 'ibanWarning', `⚠️ Ongeldig IBAN (controleer checksum en lengte)`);
        }
      } else {
        showFieldWarning('iban', 'ibanWarning', null);
      }
    });
  }

  // Phone sanitization
  const phoneField = document.getElementById(POPUP_SELECTORS.phone);
  if (phoneField) {
    phoneField.addEventListener('blur', function() {
      if (this.value) {
        const originalValue = this.value;
        const sanitized = sanitizePhone(this.value);

        if (sanitized) {
          this.value = sanitized;
          // Validatie geslaagd - verberg warning
          showFieldWarning('phone', 'phoneWarning', null);
        } else {
          // Validatie gefaald - behoud originele waarde en toon warning
          this.value = originalValue;
          showFieldWarning('phone', 'phoneWarning', `⚠️ Ongeldig telefoonnummer (verwacht: 10 cijfers, start met 0)`);
        }
      } else {
        showFieldWarning('phone', 'phoneWarning', null);
      }
    });
  }

  // Email sanitization
  const emailField = document.getElementById(POPUP_SELECTORS.email);
  if (emailField) {
    emailField.addEventListener('blur', function() {
      if (this.value) {
        const originalValue = this.value;
        const sanitized = sanitizeEmail(this.value);

        if (sanitized) {
          this.value = sanitized;
          // Validatie geslaagd - verberg warning
          showFieldWarning('email', 'emailWarning', null);
        } else {
          // Validatie gefaald - behoud originele waarde en toon warning
          this.value = originalValue;
          showFieldWarning('email', 'emailWarning', `⚠️ Ongeldig e-mailadres`);
        }
      } else {
        showFieldWarning('email', 'emailWarning', null);
      }
    });
  }

  // Initials sanitization
  const initialsField = document.getElementById(POPUP_SELECTORS.initials);
  if (initialsField) {
    initialsField.addEventListener('blur', function() {
      if (this.value) {
        const originalValue = this.value;
        const sanitized = sanitizeInitials(this.value);
        if (sanitized) {
          this.value = sanitized;
          showFieldWarning('initials', 'initialsWarning', null);
        } else {
          this.value = originalValue;
          showFieldWarning('initials', 'initialsWarning', `⚠️ Ongeldige voorletters`);
        }
      } else {
        showFieldWarning('initials', 'initialsWarning', null);
      }
    });
  }

  // LastName sanitization
  const lastNameField = document.getElementById(POPUP_SELECTORS.lastName);
  if (lastNameField) {
    lastNameField.addEventListener('blur', function() {
      if (this.value) {
        const originalValue = this.value;
        const sanitized = sanitizeLastName(this.value);
        if (sanitized) {
          this.value = sanitized;
          showFieldWarning('lastName', 'lastNameWarning', null);
        } else {
          this.value = originalValue;
          showFieldWarning('lastName', 'lastNameWarning', `⚠️ Ongeldige achternaam`);
        }
      } else {
        showFieldWarning('lastName', 'lastNameWarning', null);
      }
    });
  }

  // Gender selection validation
  const genderField = document.getElementById(POPUP_SELECTORS.gender);
  if (genderField) {
    // On change: validate and show/hide warning
    genderField.addEventListener('change', function() {
      const hasValidGender = this.value &&
                            this.value !== '' &&
                            this.value !== '-- Selecteer --' &&
                            (this.value === 'male' || this.value === 'female');

      if (hasValidGender) {
        showFieldWarning('gender', 'genderWarning', null);
      } else {
        showFieldWarning('gender', 'genderWarning', `⚠️ Selecteer geslacht`);
      }
    });

    // On blur: show warning only if touched but invalid
    genderField.addEventListener('blur', function() {
      const hasValidGender = this.value &&
                            this.value !== '' &&
                            this.value !== '-- Selecteer --' &&
                            (this.value === 'male' || this.value === 'female');

      if (!hasValidGender && this.value) {
        // Touched but invalid - show warning
        showFieldWarning('gender', 'genderWarning', `⚠️ Selecteer geslacht`);
      }
    });
  }

  // Street sanitization
  const streetField = document.getElementById(POPUP_SELECTORS.street);
  if (streetField) {
    streetField.addEventListener('blur', function() {
      if (this.value) {
        const originalValue = this.value;
        const sanitized = sanitizeStreet(this.value);
        if (sanitized) {
          this.value = sanitized;
          showFieldWarning('street', 'streetWarning', null);
        } else {
          this.value = originalValue;
          showFieldWarning('street', 'streetWarning', `⚠️ Ongeldige straatnaam`);
        }
      } else {
        showFieldWarning('street', 'streetWarning', null);
      }
    });
  }

  // HouseNumber sanitization
  const houseNumberField = document.getElementById(POPUP_SELECTORS.houseNumber);
  const houseAdditionField = document.getElementById(POPUP_SELECTORS.houseAddition);
  if (houseNumberField) {
    houseNumberField.addEventListener('blur', function() {
      if (this.value) {
        const sanitized = sanitizeHouseNumber(this.value);
        if (sanitized.number) {
          this.value = sanitized.number;
          if (houseAdditionField && sanitized.addition) {
            houseAdditionField.value = sanitized.addition;
          }
        }
      }
    });
  }

  // PostalCode sanitization
  const postalCodeField = document.getElementById(POPUP_SELECTORS.postalCode);
  if (postalCodeField) {
    postalCodeField.addEventListener('blur', function() {
      if (this.value) {
        const originalValue = this.value;
        const sanitized = sanitizePostalCode(this.value);
        if (sanitized) {
          this.value = sanitized;
          showFieldWarning('postalCode', 'postalCodeWarning', null);
        } else {
          this.value = originalValue;
          showFieldWarning('postalCode', 'postalCodeWarning', `⚠️ Ongeldige postcode (verwacht: 4 cijfers + 2 letters)`);
        }
      } else {
        showFieldWarning('postalCode', 'postalCodeWarning', null);
      }
    });
  }

  // City sanitization
  const cityField = document.getElementById(POPUP_SELECTORS.city);
  if (cityField) {
    cityField.addEventListener('blur', function() {
      if (this.value) {
        const originalValue = this.value;
        const sanitized = sanitizeCity(this.value);
        if (sanitized) {
          this.value = sanitized;
          showFieldWarning('city', 'cityWarning', null);
        } else {
          this.value = originalValue;
          showFieldWarning('city', 'cityWarning', `⚠️ Ongeldige plaatsnaam`);
        }
      } else {
        showFieldWarning('city', 'cityWarning', null);
      }
    });
  }

  // MeldCode sanitization
  const meldCodeField = document.getElementById(POPUP_SELECTORS.meldCode);
  if (meldCodeField) {
    meldCodeField.addEventListener('blur', function() {
      if (this.value) {
        const sanitized = sanitizeMeldCode(this.value);
        if (sanitized) this.value = sanitized;
      }
    });
  }

  // InstallationDate sanitization
  const installationDateField = document.getElementById(POPUP_SELECTORS.installationDate);
  if (installationDateField) {
    installationDateField.addEventListener('blur', function() {
      if (this.value) {
        const sanitized = sanitizeInstallationDate(this.value);
        if (sanitized) this.value = sanitized;
      }
    });
  }

  // PurchaseDate sanitization (with installationDate validation)
  const purchaseDateField = document.getElementById(POPUP_SELECTORS.purchaseDate);
  if (purchaseDateField) {
    purchaseDateField.addEventListener('blur', function() {
      if (this.value) {
        const installDate = installationDateField ? installationDateField.value : null;
        const sanitized = sanitizePurchaseDate(this.value, installDate);
        if (sanitized) this.value = sanitized;
      }
    });
  }

  // Initiële knopstatus check bij laden van de pagina
  updateStartButtonState();
});

// ============================================================================
// AUTOMATISERING STARTEN
// ============================================================================
/**
 * Start de subsidieaanvraag automatisering wanneer gebruiker op de knop klikt.
 *
 * PROCES:
 * 1. Valideer alle verplichte velden opnieuw
 * 2. Controleer of gebruiker op juiste website is (CONFIG.TARGET_DOMAIN)
 * 3. Haal bedrijfsgegevens op uit instellingen
 * 4. Bouw configuratie object met alle data
 * 5. Sla documenten op in Chrome storage met uniek sessie ID
 * 6. Stuur bericht naar background script om automatisering te starten
 *
 * CONFIGURATIE OBJECT BEVAT:
 * - Klantgegevens (van machtigingsformulier)
 * - Bedrijfsgegevens (uit instellingen)
 * - Contactpersoon details (uit instellingen)
 * - Document referenties (via sessie keys)
 *
 * SESSIE MANAGEMENT:
 * - Uniek sessie ID wordt gegenereerd (timestamp + random string)
 * - Documenten worden opgeslagen met sessie-specifieke keys
 * - Voorkomt conflicten bij meerdere tabbladen
 * - Documenten worden opgeruimd na gebruik door content script
 */
document.getElementById(POPUP_SELECTORS.startAutomation).addEventListener('click', () => {
  // Valideer alle verplichte velden EN markeer ze visueel
  const missingFields = validateRequiredFields(true);

  if (missingFields.length > 0) {
    showStatus(`Vul eerst alle verplichte velden in: ${missingFields.join(', ')}`, 'error');

    // Scroll naar het eerste lege veld
    const firstMissingField = document.querySelector(POPUP_SELECTORS.fieldRequiredMissing);
    if (firstMissingField) {
      firstMissingField.scrollIntoView({ behavior: 'smooth', block: 'center' });
      // Focus op het veld na scroll
      setTimeout(() => {
        firstMissingField.focus();
      }, 500);
    }

    return;
  }

  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    const currentTab = tabs[0];

    // KRITIEK: Verify dat currentTrackedTabId matcht met actieve tab
    // Dit voorkomt dat we data van Tab A sturen naar Tab B
    if (currentTrackedTabId !== currentTab.id) {
      console.warn(`⚠️ TAB MISMATCH DETECTED - Auto-syncing...`);
      console.warn(`   currentTrackedTabId: ${currentTrackedTabId}`);
      console.warn(`   Active tab ID: ${currentTab.id}`);

      // Auto-synchroniseer de tabs in plaats van te stoppen
      currentTrackedTabId = currentTab.id;
      console.log(`✅ Auto-synced to tab ${currentTab.id}`);
    } else {
      console.log(`✅ Tab verified: currentTrackedTabId (${currentTrackedTabId}) === active tab (${currentTab.id})`);
    }

    // Controleer of we op de juiste website zijn
    if (!currentTab.url || !CONFIG.isTargetDomain(currentTab.url)) {
      showStatus(`Ga eerst naar ${CONFIG.TARGET_URL}`, 'error');
      return;
    }

    console.log('🚀 Starting automation');
    console.log(`📋 Sending config from tab ${currentTrackedTabId} to content script in tab ${currentTab.id}`);

    // BELANGRIJK: Laad eerst de opgeslagen documenten voor deze tab
    // Dit zorgt ervoor dat documenten beschikbaar blijven na Stop/herstart
    console.log('='.repeat(60));
    console.log('📂 DOCUMENT LOADING DEBUG');
    console.log('📂 Current tracked tab ID:', currentTrackedTabId);
    console.log('📂 Storage namespace:', STORAGE_NAMESPACE);
    console.log('📂 Expected storage key:', `documents_${STORAGE_NAMESPACE}_${currentTrackedTabId}`);
    console.log('='.repeat(60));

    loadDocumentsForTab(currentTrackedTabId).then(savedDocuments => {
      console.log('📂 Loaded documents from storage:', savedDocuments);
      if (savedDocuments) {
        console.log('  ✓ Betaalbewijs:', savedDocuments.betaalbewijs ? savedDocuments.betaalbewijs.name : 'NOT SET');
        console.log('  ✓ Factuur:', savedDocuments.factuur ? savedDocuments.factuur.name : 'NOT SET');
        console.log('  ✓ Machtigingsbewijs:', savedDocuments.machtigingsbewijs ? savedDocuments.machtigingsbewijs.name : 'NOT SET');
      } else {
        console.log('  ❌ NO DOCUMENTS FOUND IN STORAGE FOR THIS TAB!');
      }

      console.log('📂 Global variables:', {
        betaalbewijsData: betaalbewijsData ? betaalbewijsData.name : 'null',
        factuurData: factuurData ? factuurData.name : 'null',
        machtigingsbewijsData: machtigingsbewijsData ? machtigingsbewijsData.name : 'null'
      });

      // Gebruik opgeslagen documenten als ze beschikbaar zijn, anders fallback naar globale variabelen
      const documentsToUse = {
        betaalbewijs: savedDocuments?.betaalbewijs || betaalbewijsData,
        factuur: savedDocuments?.factuur || factuurData,
        machtigingsbewijs: savedDocuments?.machtigingsbewijs || machtigingsbewijsData
      };

      console.log('📂 Final documents to use:', {
        betaalbewijs: documentsToUse.betaalbewijs ? documentsToUse.betaalbewijs.name : 'NOT SET',
        factuur: documentsToUse.factuur ? documentsToUse.factuur.name : 'NOT SET',
        machtigingsbewijs: documentsToUse.machtigingsbewijs ? documentsToUse.machtigingsbewijs.name : 'NOT SET'
      });

      // Haal volledige config op inclusief bedrijfsgegevens en contactpersoon uit storage
      chrome.storage.local.get(['isdeConfig'], (result) => {
        // Log voor debugging multi-tab scenarios
        console.log('📝 Building config for automation:');
        console.log(`   Target tab ID: ${currentTab.id}`);
        console.log(`   Tracked tab ID: ${currentTrackedTabId}`);
        console.log(`   BSN: ${document.getElementById(POPUP_SELECTORS.bsn).value?.substring(0, 3)}... (first 3 digits)`);
        console.log(`   Name: ${document.getElementById(POPUP_SELECTORS.initials).value} ${document.getElementById(POPUP_SELECTORS.lastName).value}`);

        const config = {
        // Klantgegevens uit formulier
        bsn: document.getElementById(POPUP_SELECTORS.bsn).value,
        initials: document.getElementById(POPUP_SELECTORS.initials).value,
        lastName: document.getElementById(POPUP_SELECTORS.lastName).value,
        gender: document.getElementById(POPUP_SELECTORS.gender).value,
        phone: document.getElementById(POPUP_SELECTORS.phone).value,
        email: document.getElementById(POPUP_SELECTORS.email).value,
        iban: document.getElementById(POPUP_SELECTORS.iban).value,
        street: document.getElementById(POPUP_SELECTORS.street).value,
        postalCode: document.getElementById(POPUP_SELECTORS.postalCode).value,
        city: document.getElementById(POPUP_SELECTORS.city).value,
        houseNumber: document.getElementById(POPUP_SELECTORS.houseNumber).value,
        houseAddition: document.getElementById(POPUP_SELECTORS.houseAddition).value,
        purchaseDate: document.getElementById(POPUP_SELECTORS.purchaseDate).value,
        installationDate: document.getElementById(POPUP_SELECTORS.installationDate).value,
        meldCode: document.getElementById(POPUP_SELECTORS.meldCode).value,
        gasUsage: document.getElementById(POPUP_SELECTORS.gasUsage).value,

        // Bedrijfsgegevens uit instellingen
        companyName: result.isdeConfig?.companyName || '',
        kvkNumber: result.isdeConfig?.kvkNumber || '',

        // Contactpersoon details uit instellingen (met standaard waarden)
        contactInitials: result.isdeConfig?.contactInitials || 'A',
        contactLastName: result.isdeConfig?.contactLastName || 'de Vlieger',
        contactGender: result.isdeConfig?.contactGender || 'female',
        contactPhone: result.isdeConfig?.contactPhone || '0682795068',
        contactEmail: result.isdeConfig?.contactEmail || 'administratie@saman.nl',

        // Document data (geladen uit storage, blijft beschikbaar na Stop/herstart)
        betaalbewijs: documentsToUse.betaalbewijs,
        factuur: documentsToUse.factuur,
        machtigingsbewijs: documentsToUse.machtigingsbewijs
      };

      // Log welke documenten worden verzonden
      console.log('🚀 Starting automation with documents:');
      console.log('  - Betaalbewijs:', config.betaalbewijs ? config.betaalbewijs.name : 'Not uploaded');
      console.log('  - Factuur:', config.factuur ? config.factuur.name : 'Not uploaded');
      console.log('  - Machtigingsbewijs:', config.machtigingsbewijs ? config.machtigingsbewijs.name : 'Not uploaded');

      // Sla bestanden op in chrome.storage.local om bericht grootte limiet te vermijden
      // Gebruik timestamp + random string voor uniek sessie ID (zelfs met meerdere tabs)
      const sessionId = `${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
      const filesToStore = {};

      // Sla sessie ID op in config zodat content script weet welke bestanden bij deze tab horen
      config.sessionId = sessionId;

      // Sla documenten op met sessie-specifieke keys
      if (config.betaalbewijs) {
        filesToStore[`file_betaalbewijs_${sessionId}`] = config.betaalbewijs;
        config.betaalbewijsKey = `file_betaalbewijs_${sessionId}`;
        delete config.betaalbewijs; // Verwijder grote data uit config
      }

      if (config.factuur) {
        filesToStore[`file_factuur_${sessionId}`] = config.factuur;
        config.factuurKey = `file_factuur_${sessionId}`;
        delete config.factuur; // Verwijder grote data uit config
      }

      if (config.machtigingsbewijs) {
        filesToStore[`file_machtigingsbewijs_${sessionId}`] = config.machtigingsbewijs;
        config.machtigingsbewijsKey = `file_machtigingsbewijs_${sessionId}`;
        delete config.machtigingsbewijs; // Verwijder grote data uit config
      }

      // Sla bestanden eerst op, dan verstuur bericht
      chrome.storage.local.set(filesToStore, () => {
        console.log('📦 Files stored in chrome.storage.local for session:', sessionId);
        console.log('   Files:', Object.keys(filesToStore));

        // 📊 Statistics: Save start timestamp en increment started counter
        const startTime = Date.now();
        sessionStorage.setItem(CONFIG.STORAGE_KEYS.AUTOMATION_START_TIME, startTime.toString());
        incrementStarted();
        console.log('📊 Automation started, timestamp saved:', startTime);

        // Stuur bericht naar background script om automatisering te starten
        chrome.runtime.sendMessage({
          action: 'startAutomationFromPopup',
          config: config
        }, () => {
          showStatus('Automatisering gestart. Het formulier wordt stap voor stap ingevuld.', 'info');
          // Popup blijft open - gebruiker kan van tab wisselen en terugkomen
        });
      });
      }); // Einde chrome.storage.local.get
    }); // Einde loadDocumentsForTab promise
  });
});

// ============================================================================
// RESET INFO: WIS TAB-SPECIFIEKE DATA
// ============================================================================
/**
 * Event listener voor de "Reset Info" knop.
 * Wist alle opgeslagen formulier data voor de huidige tab.
 *
 * FUNCTIONALITEIT:
 * - Haalt huidige tab ID op
 * - Verwijdert opgeslagen formulier data uit chrome.storage voor deze tab
 * - Reset alle formulier velden naar leeg
 * - Wist document variabelen (betaalbewijs, factuur, machtigingsbewijs)
 * - Toont bevestigingsbericht
 *
 * NOTE: Alleen de data van de HUIDIGE tab wordt gewist.
 * Andere tabs behouden hun opgeslagen data.
 */
document.getElementById(POPUP_SELECTORS.resetInfo).addEventListener('click', async () => {
  try {
    // Gebruik tracked tab ID (consistent met andere functies)
    const tabId = currentTrackedTabId;
    if (tabId === null) {
      console.warn('⚠️ Cannot reset: no tab ID tracked yet');
      showStatus('⚠️ Kan niet resetten: geen tab actief', 'error');
      return;
    }
    console.log(`🗑️ Resetting info for tab ${tabId}`);

    // Verwijder opgeslagen formulier data voor deze tab
    const formDataKey = buildStorageKey('formData', tabId);
    const legacyFormDataKey = getLegacyKey('formData', tabId);
    await chrome.storage.local.remove([formDataKey, legacyFormDataKey]);
    console.log(`✅ Removed storage keys: ${formDataKey}, ${legacyFormDataKey}`);

    // Verwijder opgeslagen documenten voor deze tab
    const documentsKey = buildStorageKey('documents', tabId);
    const legacyDocumentsKey = getLegacyKey('documents', tabId);
    await chrome.storage.local.remove([documentsKey, legacyDocumentsKey]);
    console.log(`✅ Removed storage keys: ${documentsKey}, ${legacyDocumentsKey}`);

    // Reset alle formulier velden naar leeg
    getAllFieldIds().forEach(fieldId => {
      const field = document.getElementById(fieldId);
      if (field) {
        field.value = '';
      }
    });

    // Wis document variabelen
    betaalbewijsData = null;
    factuurData = null;
    machtigingsbewijsData = null;

    // Reset file input velden (anders kun je dezelfde file niet opnieuw uploaden)
    const betaalbewijsInput = document.getElementById(POPUP_SELECTORS.betaalbewijsDoc);
    const factuurInput = document.getElementById(POPUP_SELECTORS.factuurDoc);
    const machtigingsInput = document.getElementById(POPUP_SELECTORS.machtigingsformulier);
    if (betaalbewijsInput) betaalbewijsInput.value = '';
    if (factuurInput) factuurInput.value = '';
    if (machtigingsInput) machtigingsInput.value = '';

    // Verberg document namen in de UI
    const betaalbewijsName = document.getElementById(POPUP_SELECTORS.betaalbewijsName);
    const factuurName = document.getElementById(POPUP_SELECTORS.factuurName);
    const machtigingName = document.getElementById(POPUP_SELECTORS.machtigingName);
    if (betaalbewijsName) {
      betaalbewijsName.style.display = 'none';
      betaalbewijsName.innerHTML = '';
    }
    if (factuurName) {
      factuurName.style.display = 'none';
      factuurName.innerHTML = '';
    }
    if (machtigingName) {
      machtigingName.style.display = 'none';
      machtigingName.innerHTML = '';
    }

    // Verberg alle validatie waarschuwingen
    const allWarnings = document.querySelectorAll(POPUP_SELECTORS.fieldWarning);
    allWarnings.forEach(warning => {
      warning.classList.remove('visible');
      warning.textContent = '';
    });

    // Verwijder warning styling van alle input velden
    const allInputs = document.querySelectorAll(POPUP_SELECTORS.fieldInput);
    allInputs.forEach(input => {
      input.classList.remove('has-warning');
    });

    // Verberg OCR status berichten
    const factuurStatus = document.getElementById(POPUP_SELECTORS.factuurExtractionStatus);
    const machtigingStatus = document.getElementById(POPUP_SELECTORS.extractionStatus);
    if (factuurStatus) factuurStatus.style.display = 'none';
    if (machtigingStatus) machtigingStatus.style.display = 'none';

    // Update de "Start Automatisering" knop status
    updateStartButtonState();

    // Toon succesbericht
    showStatus('✅ Info voor deze tab is gereset', 'success');
    console.log(`✅ Info reset complete for tab ${tabId}`);

  } catch (error) {
    console.error('Error resetting info:', error);
    showStatus('⚠️ Fout bij resetten van info', 'error');
  }
});

// ============================================================================
// UI FEEDBACK: TOON STATUS BERICHT
// ============================================================================
/**
 * Toont een status bericht aan de gebruiker in de popup.
 *
 * @param {string} message - Het te tonen bericht
 * @param {string} type - Type bericht: 'error', 'success', of 'info'
 *
 * FUNCTIONALITEIT:
 * - Toont bericht met kleurcodering op basis van type
 * - Verbergt bericht automatisch na 3 seconden
 */
function showStatus(message, type) {
  const statusDiv = document.getElementById(POPUP_SELECTORS.status);
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
  setTimeout(() => {
    statusDiv.className = 'status';
  }, 3000);
}

// ============================================================================
// NAVIGATIE: WEERGAVE WISSELEN (HOOFD <-> INSTELLINGEN)
// ============================================================================
/**
 * Wisselt tussen de hoofdweergave en instellingen weergave.
 *
 * @param {string} viewId - ID van de weer te geven view ('mainView' of 'settingsView')
 *
 * FUNCTIONALITEIT:
 * - Verbergt alle weergaven
 * - Toont geselecteerde weergave
 * - Toont/verbergt terug knop op basis van huidige weergave
 */
function showView(viewId) {
  // Verberg alle weergaven
  document.querySelectorAll(POPUP_SELECTORS.view).forEach(view => {
    view.classList.remove('active');
  });

  // Toon geselecteerde weergave
  document.getElementById(viewId).classList.add('active');

  // Toon/verberg terug knop
  const backBtn = document.getElementById(POPUP_SELECTORS.backBtn);
  if (viewId === 'settingsView') {
    backBtn.classList.add('visible');
  } else {
    backBtn.classList.remove('visible');
  }
}

// ============================================================================
// EVENT LISTENERS: NAVIGATIE KNOPPEN
// ============================================================================

/** Instellingen knop - toon instellingen weergave */
document.getElementById(POPUP_SELECTORS.settingsBtn).addEventListener('click', () => {
  loadSettings();
  showView('settingsView');
});

/** Terug knop - terug naar hoofdweergave */
document.getElementById(POPUP_SELECTORS.backBtn).addEventListener('click', () => {
  showView('mainView');
});

/** Opslaan knop - sla instellingen op */
document.getElementById(POPUP_SELECTORS.saveSettingsBtn).addEventListener('click', () => {
  saveSettings();
});

// ============================================================================
// EVENT LISTENERS: AUTO-OPSLAAN INSTELLINGEN
// ============================================================================
/**
 * Sla instellingen automatisch op wanneer gebruiker een veld verlaat (blur event).
 * Dit zorgt voor een betere gebruikerservaring zonder handmatig opslaan.
 */
document.getElementById(POPUP_SELECTORS.mistralApiKey).addEventListener('blur', saveSettings);
document.getElementById(POPUP_SELECTORS.settingsCompanyName).addEventListener('blur', saveSettings);
document.getElementById(POPUP_SELECTORS.settingsKvkNumber).addEventListener('blur', saveSettings);
document.getElementById(POPUP_SELECTORS.settingsContactInitials).addEventListener('blur', saveSettings);
document.getElementById(POPUP_SELECTORS.settingsContactLastName).addEventListener('blur', saveSettings);
document.getElementById(POPUP_SELECTORS.settingsContactGender).addEventListener('change', saveSettings);
document.getElementById(POPUP_SELECTORS.settingsContactPhone).addEventListener('blur', saveSettings);
document.getElementById(POPUP_SELECTORS.settingsContactEmail).addEventListener('blur', saveSettings);

// ============================================================================
// INSTELLINGEN LADEN
// ============================================================================
/**
 * Laadt opgeslagen instellingen uit Chrome storage en vult de velden in.
 *
 * GELADEN INSTELLINGEN:
 * - Mistral API key (voor OCR/AI functionaliteit)
 * - Bedrijfsgegevens:
 *   - Bedrijfsnaam
 *   - KVK nummer
 * - Contactpersoon details:
 *   - Voorletters
 *   - Achternaam
 *   - Geslacht
 *   - Telefoonnummer
 *   - E-mailadres
 *
 * STANDAARD WAARDEN:
 * Als contactpersoon details niet zijn opgeslagen, worden standaard waarden
 * gebruikt (A de Vlieger, administratie@saman.nl, etc.)
 */
function loadSettings() {
  chrome.storage.local.get(['mistralApiKey', 'isdeConfig'], (result) => {
    // Laad API key
    if (result.mistralApiKey) {
      document.getElementById(POPUP_SELECTORS.mistralApiKey).value = result.mistralApiKey;
    }

    // Laad bedrijfsgegevens uit config met standaard waarden voor contactpersoon
    const config = result.isdeConfig || {};

    // Bedrijfsgegevens
    document.getElementById(POPUP_SELECTORS.settingsCompanyName).value = config.companyName || '';
    document.getElementById(POPUP_SELECTORS.settingsKvkNumber).value = config.kvkNumber || '';

    // Laad contactpersoon details met standaard waarden
    document.getElementById(POPUP_SELECTORS.settingsContactInitials).value = config.contactInitials || 'A';
    document.getElementById(POPUP_SELECTORS.settingsContactLastName).value = config.contactLastName || 'de Vlieger';
    document.getElementById(POPUP_SELECTORS.settingsContactGender).value = config.contactGender || 'female';
    document.getElementById(POPUP_SELECTORS.settingsContactPhone).value = config.contactPhone || '0682795068';
    document.getElementById(POPUP_SELECTORS.settingsContactEmail).value = config.contactEmail || 'administratie@saman.nl';
  });
}

// ============================================================================
// INSTELLINGEN OPSLAAN
// ============================================================================
/**
 * Slaat alle instellingen op in Chrome storage.
 *
 * OPGESLAGEN INSTELLINGEN:
 * - Mistral API key (apart opgeslagen voor beveiliging)
 * - ISDE configuratie object met:
 *   - Bedrijfsnaam en KVK nummer
 *   - Contactpersoon voorletters, achternaam, geslacht
 *   - Contactpersoon telefoon en email
 *
 * FEEDBACK:
 * Toont succesbericht voor 3 seconden na opslaan.
 */
function saveSettings() {
  const mistralApiKey = document.getElementById(POPUP_SELECTORS.mistralApiKey).value;
  const companyName = document.getElementById(POPUP_SELECTORS.settingsCompanyName).value;
  const kvkNumber = document.getElementById(POPUP_SELECTORS.settingsKvkNumber).value;
  const contactInitials = document.getElementById(POPUP_SELECTORS.settingsContactInitials).value;
  const contactLastName = document.getElementById(POPUP_SELECTORS.settingsContactLastName).value;
  const contactGender = document.getElementById(POPUP_SELECTORS.settingsContactGender).value;
  const contactPhone = document.getElementById(POPUP_SELECTORS.settingsContactPhone).value;
  const contactEmail = document.getElementById(POPUP_SELECTORS.settingsContactEmail).value;

  // Sla API key op
  chrome.storage.local.set({ mistralApiKey: mistralApiKey });

  // Update bedrijfsgegevens en contactpersoon in config
  chrome.storage.local.get(['isdeConfig'], (result) => {
    const config = result.isdeConfig || {};
    config.companyName = companyName;
    config.kvkNumber = kvkNumber;
    config.contactInitials = contactInitials;
    config.contactLastName = contactLastName;
    config.contactGender = contactGender;
    config.contactPhone = contactPhone;
    config.contactEmail = contactEmail;

    chrome.storage.local.set({ isdeConfig: config }, () => {
      const statusDiv = document.getElementById(POPUP_SELECTORS.settingsStatus);
      statusDiv.textContent = 'Instellingen opgeslagen!';
      statusDiv.className = 'status success';

      setTimeout(() => {
        statusDiv.className = 'status';
      }, 3000);
    });
  });
}

// ============================================================================
// USAGE STATISTICS
// ============================================================================

/**
 * Haalt usage statistics op uit Chrome storage.
 * @returns {Promise<Object>} Statistics object
 */
async function getUsageStats() {
  return new Promise((resolve) => {
    chrome.storage.local.get([CONFIG.STORAGE_KEYS.USAGE_STATS], (result) => {
      const stats = result[CONFIG.STORAGE_KEYS.USAGE_STATS] || {
        totalCompleted: 0,
        totalStarted: 0,
        firstUseDate: null,
        lastUseDate: null,
        totalDurationMs: 0  // Som van alle durations
      };
      resolve(stats);
    });
  });
}

/**
 * Update usage statistics in Chrome storage.
 * @param {Object} updates - Partial updates object
 */
async function updateUsageStats(updates) {
  const stats = await getUsageStats();
  const updatedStats = { ...stats, ...updates };

  chrome.storage.local.set({
    [CONFIG.STORAGE_KEYS.USAGE_STATS]: updatedStats
  }, () => {
    console.log('📊 Usage stats updated:', updatedStats);
  });
}

/**
 * Increment completed counter en update gemiddelde tijd.
 * @param {number} durationMs - Tijd in milliseconden voor dit formulier
 */
async function incrementCompleted(durationMs) {
  const stats = await getUsageStats();

  const updates = {
    totalCompleted: stats.totalCompleted + 1,
    totalDurationMs: stats.totalDurationMs + durationMs,
    lastUseDate: new Date().toISOString()
  };

  // Set firstUseDate als dit de eerste keer is
  if (!stats.firstUseDate) {
    updates.firstUseDate = new Date().toISOString();
  }

  await updateUsageStats(updates);

  // Update UI als deze open is
  displayUsageStats();
}

/**
 * Increment started counter.
 */
async function incrementStarted() {
  const stats = await getUsageStats();

  const updates = {
    totalStarted: stats.totalStarted + 1,
    lastUseDate: new Date().toISOString()
  };

  // Set firstUseDate als dit de eerste keer is
  if (!stats.firstUseDate) {
    updates.firstUseDate = new Date().toISOString();
  }

  await updateUsageStats(updates);
}

/**
 * Reset alle statistics naar 0.
 */
async function resetUsageStats() {
  const confirmed = confirm('Weet je zeker dat je alle statistieken wilt resetten?');
  if (!confirmed) return;

  chrome.storage.local.set({
    [CONFIG.STORAGE_KEYS.USAGE_STATS]: {
      totalCompleted: 0,
      totalStarted: 0,
      firstUseDate: null,
      lastUseDate: null,
      totalDurationMs: 0
    }
  }, () => {
    console.log('📊 Usage stats reset');
    displayUsageStats();
  });
}

/**
 * Format duration in milliseconds naar leesbare string.
 * @param {number} ms - Milliseconden
 * @returns {string} Formatted string (bijv. "5 min 30 sec")
 */
function formatDuration(ms) {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;

  if (minutes === 0) {
    return `${seconds} sec`;
  }
  return `${minutes} min ${seconds} sec`;
}

/**
 * Format date naar Nederlandse korte datum.
 * @param {string} isoDate - ISO date string
 * @returns {string} Formatted date (bijv. "6 nov 2025")
 */
function formatShortDate(isoDate) {
  if (!isoDate) return '-';

  const date = new Date(isoDate);
  const months = ['jan', 'feb', 'mrt', 'apr', 'mei', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

  return `${date.getDate()} ${months[date.getMonth()]} ${date.getFullYear()}`;
}

/**
 * Display usage statistics in de Settings tab.
 */
async function displayUsageStats() {
  const stats = await getUsageStats();

  // Bereken gemiddelde tijd
  let avgDuration = 0;
  if (stats.totalCompleted > 0) {
    avgDuration = stats.totalDurationMs / stats.totalCompleted;
  }

  // Update UI elements
  document.getElementById('statsCompleted').textContent = stats.totalCompleted;
  document.getElementById('statsStarted').textContent = stats.totalStarted;
  document.getElementById('statsFirstUse').textContent = formatShortDate(stats.firstUseDate);
  document.getElementById('statsLastUse').textContent = formatShortDate(stats.lastUseDate);
  document.getElementById('statsAvgTime').textContent = stats.totalCompleted > 0 ? formatDuration(avgDuration) : '-';
}

// ============================================================================
// TAB SWITCH DETECTION - VOOR GLOBAL SIDE PANEL
// ============================================================================

/**
 * Houdt het huidige tab ID bij om tab switches te detecteren.
 */
let currentTrackedTabId = null;

/**
 * Unique ID voor huidige reload operatie (om race conditions te voorkomen)
 */
let currentReloadOperationId = 0;

/**
 * Herlaadt formulier data voor een specifieke tab.
 * Deze functie wordt aangeroepen wanneer de gebruiker van tab wisselt.
 *
 * @param {number} tabId - Tab ID om data voor te laden
 */
async function reloadFormDataForTab(tabId, windowId = undefined) {
  // Generate unique operation ID to detect if another reload started
  const operationId = ++currentReloadOperationId;
  console.log(`🔄 Reloading form and document data for tab ${tabId} (operation ${operationId})`);

  // Set loading flag to prevent auto-save during data load
  isLoadingTabData = true;

  try {
    let resolvedWindowId = windowId;
    if (typeof resolvedWindowId !== 'number') {
      try {
        const tabInfo = await chrome.tabs.get(tabId);
        resolvedWindowId = tabInfo.windowId;
      } catch (error) {
        console.warn(`⚠️ Unable to determine window ID for tab ${tabId}:`, error);
      }
    }

    if (typeof resolvedWindowId === 'number') {
      currentTrackedWindowId = resolvedWindowId;
    }

    // Check if this operation was superseded by a newer reload
    const checkSuperseded = () => {
      if (currentReloadOperationId !== operationId) {
        console.warn(`⚠️ Reload operation ${operationId} for tab ${tabId} was superseded by operation ${currentReloadOperationId}. Aborting.`);
        return true;
      }
      return false;
    };
    // Verberg alle OCR status berichten (deze zijn tab-specifiek)
    const factuurStatus = document.getElementById(POPUP_SELECTORS.factuurExtractionStatus);
    const machtigingStatus = document.getElementById(POPUP_SELECTORS.extractionStatus);
    if (factuurStatus) factuurStatus.style.display = 'none';
    if (machtigingStatus) machtigingStatus.style.display = 'none';

    // Verberg alle validatie waarschuwingen (deze zijn tab-specifiek)
    const allWarnings = document.querySelectorAll(POPUP_SELECTORS.fieldWarning);
    allWarnings.forEach(warning => {
      warning.classList.remove('visible');
      warning.textContent = '';
    });

    // Verwijder warning styling van alle input velden
    const allInputs = document.querySelectorAll(POPUP_SELECTORS.fieldInput);
    allInputs.forEach(input => {
      input.classList.remove('has-warning');
    });

    console.log(`🔍 Cleared all UI warnings/status for tab ${tabId}`);

    // Laad opgeslagen formulier data voor deze tab
    const savedFormData = await loadFormDataForTab(tabId);

    // Check if superseded after async operation
    if (checkSuperseded()) return;

    if (savedFormData) {
      // Laad opgeslagen waarden
      console.log(`✅ Found saved form data for tab ${tabId}`);

      // Check before filling fields
      if (checkSuperseded()) return;

      getAllFieldIds().forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field && savedFormData[fieldId] !== undefined) {
          field.value = savedFormData[fieldId];
        }
      });
    } else {
      // Geen opgeslagen data - reset naar lege velden
      console.log(`📝 No saved data for tab ${tabId} - showing empty form`);

      // Check before clearing fields
      if (checkSuperseded()) return;

      getAllFieldIds().forEach(fieldId => {
        const field = document.getElementById(fieldId);
        if (field) {
          field.value = '';
        }
      });
    }

    // Laad opgeslagen documenten voor deze tab
    const savedDocuments = await loadDocumentsForTab(tabId);

    // Check if superseded after async operation
    if (checkSuperseded()) return;

    console.log(`📋 Document state for tab ${tabId}:`, {
      betaalbewijs: savedDocuments?.betaalbewijs ? 'YES' : 'NO',
      factuur: savedDocuments?.factuur ? 'YES' : 'NO',
      machtigingsbewijs: savedDocuments?.machtigingsbewijs ? 'YES' : 'NO'
    });

    // Check if superseded before updating documents
    if (checkSuperseded()) return;

    if (savedDocuments) {
      console.log(`✅ Found saved documents for tab ${tabId}`);

      // Herstel betaalbewijs
      if (savedDocuments.betaalbewijs) {
        betaalbewijsData = savedDocuments.betaalbewijs;
        displayFileNameWithDelete('betaalbewijsName', savedDocuments.betaalbewijs.name, 'betaalbewijs');
        console.log(`  → Showing betaalbewijs: ${savedDocuments.betaalbewijs.name}`);
      } else {
        betaalbewijsData = null;
        const nameDiv = document.getElementById(POPUP_SELECTORS.betaalbewijsName);
        if (nameDiv) {
          nameDiv.style.display = 'none';
          nameDiv.innerHTML = '';
          console.log(`  → Hiding betaalbewijs (not in this tab)`);
        }
      }

      // Check again (UI operations can take time)
      if (checkSuperseded()) return;

      // Herstel factuur
      if (savedDocuments.factuur) {
        factuurData = savedDocuments.factuur;
        displayFileNameWithDelete('factuurName', savedDocuments.factuur.name, 'factuur');
        console.log(`  → Showing factuur: ${savedDocuments.factuur.name}`);
      } else {
        factuurData = null;
        const nameDiv = document.getElementById(POPUP_SELECTORS.factuurName);
        if (nameDiv) {
          nameDiv.style.display = 'none';
          nameDiv.innerHTML = '';
          console.log(`  → Hiding factuur (not in this tab)`);
        }
      }

      // Check again
      if (checkSuperseded()) return;

      // Herstel machtigingsbewijs
      if (savedDocuments.machtigingsbewijs) {
        machtigingsbewijsData = savedDocuments.machtigingsbewijs;
        displayFileNameWithDelete('machtigingName', savedDocuments.machtigingsbewijs.name, 'machtigingsbewijs');
        console.log(`  → Showing machtigingsbewijs: ${savedDocuments.machtigingsbewijs.name}`);
      } else {
        machtigingsbewijsData = null;
        const nameDiv = document.getElementById(POPUP_SELECTORS.machtigingName);
        if (nameDiv) {
          nameDiv.style.display = 'none';
          nameDiv.innerHTML = '';
          console.log(`  → Hiding machtigingsbewijs (not in this tab)`);
        }
      }
    } else {
      // Geen opgeslagen documenten - reset
      console.log(`📝 No saved documents for tab ${tabId}`);
      betaalbewijsData = null;
      factuurData = null;
      machtigingsbewijsData = null;

      // Reset file input velden
      const betaalbewijsInput = document.getElementById(POPUP_SELECTORS.betaalbewijsDoc);
      const factuurInput = document.getElementById(POPUP_SELECTORS.factuurDoc);
      const machtigingsInput = document.getElementById(POPUP_SELECTORS.machtigingsformulier);
      if (betaalbewijsInput) betaalbewijsInput.value = '';
      if (factuurInput) factuurInput.value = '';
      if (machtigingsInput) machtigingsInput.value = '';

      // Verberg document namen
      const betaalbewijsName = document.getElementById(POPUP_SELECTORS.betaalbewijsName);
      const factuurName = document.getElementById(POPUP_SELECTORS.factuurName);
      const machtigingName = document.getElementById(POPUP_SELECTORS.machtigingName);
      if (betaalbewijsName) {
        betaalbewijsName.style.display = 'none';
        betaalbewijsName.innerHTML = '';
      }
      if (factuurName) {
        factuurName.style.display = 'none';
        factuurName.innerHTML = '';
      }
      if (machtigingName) {
        machtigingName.style.display = 'none';
        machtigingName.innerHTML = '';
      }
    }

    // Check if superseded before final updates
    if (checkSuperseded()) return;

    // Update de tracked tab ID
    console.log(`✏️ Updating currentTrackedTabId from ${currentTrackedTabId} to ${tabId}`);
    currentTrackedTabId = tabId;
    if (typeof resolvedWindowId === 'number') {
      console.log(`🪟 Tracking window ${resolvedWindowId}`);
      currentTrackedWindowId = resolvedWindowId;
    }

    // Re-valideer alle velden om warnings te tonen voor ongeldige waardes
    revalidateAllFields();

    // Final check before updating button state
    if (checkSuperseded()) return;

    // Update de "Start Automatisering" knop status
    updateStartButtonState();
  } finally {
    // Only reset loading flag if this is still the current operation
    if (currentReloadOperationId === operationId) {
      // Add small delay before allowing auto-save again
      // This prevents auto-save from triggering immediately while UI is still rendering
      setTimeout(() => {
        // Double-check operation ID hasn't changed during delay
        if (currentReloadOperationId === operationId) {
          isLoadingTabData = false;
          console.log(`✅ Finished loading data for tab ${tabId} (operation ${operationId}) - auto-save re-enabled`);
        }
      }, 100); // 100ms delay to allow UI to stabilize
    } else {
      console.log(`⏭️ Skipped resetting loading flag for operation ${operationId} (current: ${currentReloadOperationId})`);
    }
  }
}

/**
 * Luistert naar tab switches en herlaadt automatisch de juiste data.
 * Dit zorgt ervoor dat de side panel altijd de data van de actieve tab toont.
 */
chrome.tabs.onActivated.addListener(async (activeInfo) => {
  console.log('🔄 Tab switched to:', activeInfo.tabId, 'in window', activeInfo.windowId);

  if (currentTrackedWindowId !== null && activeInfo.windowId !== currentTrackedWindowId) {
    console.log('↩️ Ignoring activation from another window');
    return;
  }

  // Controleer of we van tab zijn gewisseld
  if (currentTrackedTabId !== null && currentTrackedTabId !== activeInfo.tabId) {
    console.log(`↔️ Switching from tab ${currentTrackedTabId} to ${activeInfo.tabId}`);
    await reloadFormDataForTab(activeInfo.tabId, activeInfo.windowId);
  } else if (currentTrackedTabId === null) {
    // Eerste keer dat we een tab detecteren
    currentTrackedTabId = activeInfo.tabId;
    currentTrackedWindowId = activeInfo.windowId;
    console.log(`🎯 Initial tab detected: ${activeInfo.tabId} (window ${activeInfo.windowId})`);
    await reloadFormDataForTab(activeInfo.tabId, activeInfo.windowId);
  }
});

/**
 * Luistert naar tab updates (bijv. URL veranderingen).
 * Als de actieve tab navigeert naar een nieuwe pagina, herlaad de data.
 */
chrome.tabs.onUpdated.addListener(async (tabId, changeInfo, tab) => {
  // Alleen reageren als deze tab actief is, bij onze window hoort, en de URL is veranderd
  if (tab.active && changeInfo.url && currentTrackedTabId === tabId) {
    if (currentTrackedWindowId !== null && tab.windowId !== currentTrackedWindowId) {
      return;
    }
    console.log('🔄 Active tab URL changed to:', changeInfo.url);
    await reloadFormDataForTab(tabId, tab.windowId);
  }
});

// ============================================================================
// INITIALISATIE: LAAD CONFIGURATIE BIJ POPUP OPENEN
// ============================================================================
/**
 * Wordt aangeroepen wanneer de side panel wordt geopend.
 * Laadt tab-specifieke formulier data voor de actieve tab.
 */
window.addEventListener('DOMContentLoaded', async () => {
  await loadConfiguration();

  // Sla de initiële tab ID op
  const tabId = await getCurrentTabId();
  currentTrackedTabId = tabId;

  // Load en display usage statistics
  await displayUsageStats();

  // Wire up reset statistics button
  document.getElementById('resetStatsBtn')?.addEventListener('click', resetUsageStats);

  console.log('✅ Side panel initialization complete, tracking tab:', tabId);
});
