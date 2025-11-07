/**
 * ============================================================================
 * ISDE AUTOMATISERING - CENTRAAL CONFIGURATIE BESTAND
 * ============================================================================
 *
 * Alle hard-coded waarden op één plek.
 * Bij externe wijzigingen (API updates, website migratie, etc): pas hier aan!
 *
 * WAAROM CONFIG BESTAND?
 * - API endpoint wijzigt van v1 naar v2 → 1 regel aanpassen i.p.v. 6+ plekken
 * - Model deprecatie door Mistral → 1 regel aanpassen
 * - Geen time bombs (2030 hard-coded jaar vervangen door dynamische berekening)
 * - Rate limits tunen → 1 plek aanpassen
 * - Simpeler om te onderhouden
 */

const CONFIG = {
  // ============================================================================
  // MISTRAL AI API CONFIGURATIE
  // ============================================================================

  /**
   * Mistral API base endpoint.
   * Als Mistral migreert naar v2, pas hier aan (niet in 6+ bestanden).
   */
  MISTRAL_API_ENDPOINT: 'https://api.mistral.ai/v1',

  /**
   * Mistral AI model namen.
   * Als Mistral models depreceert, pas hier aan.
   */
  MISTRAL_MODELS: {
    // Voor OCR extractie uit PDF/images (pixtral = vision model)
    OCR: 'pixtral-12b-2409',

    // Voor text extraction en data parsing
    EXTRACTION: 'mistral-small-latest',

    // Voor OCR via dedicated endpoint
    OCR_LATEST: 'mistral-ocr-latest'
  },

  /**
   * Rate limiting voor Mistral API.
   * 2.5 seconden tussen calls om 429 rate limit errors te voorkomen.
   * Pas aan als Mistral rate limits wijzigen.
   */
  API_DELAY_MS: 2500,

  /**
   * Maximum tokens per API request.
   * Voorkomt te lange responses en controleert kosten.
   */
  MAX_TOKENS: {
    OCR: 1000,
    EXTRACTION: 500,
    CHAT: 1000
  },

  // ============================================================================
  // RETRY & ERROR HANDLING
  // ============================================================================

  /**
   * Aantal retries voor transient failures (netwerk hiccups, 5xx errors).
   */
  MAX_RETRIES: 3,

  /**
   * Exponential backoff delays voor retries (in milliseconden).
   * [500ms, 1000ms, 2000ms] = 1e retry na 500ms, 2e na 1s, 3e na 2s
   */
  RETRY_DELAYS_MS: [500, 1000, 2000],

  /**
   * Maximum aantal keer dat dezelfde stap mag worden uitgevoerd.
   * Voorkomt infinite loops in automatisering.
   */
  MAX_STEP_RETRIES: 4,

  // ============================================================================
  // DATA VALIDATIE
  // ============================================================================

  /**
   * Datum range validatie.
   * BELANGRIJK: Gebruikt dynamische berekening om time bomb te voorkomen!
   * Voor 2025: MIN=2010, MAX=2045 (20 jaar in de toekomst)
   */
  DATE_RANGE: {
    MIN_YEAR: 2010,
    // ✅ Dynamisch berekend - geen hard-coded 2030 time bomb meer!
    MAX_YEAR: new Date().getFullYear() + 20
  },

  /**
   * BSN (Burgerservicenummer) validatie.
   */
  BSN: {
    LENGTH: 9,
    MIN_VALUE: 100000000,
    MAX_VALUE: 999999999
  },

  /**
   * IBAN validatie.
   */
  IBAN: {
    NL_LENGTH: 18,
    PATTERN: /^NL\d{2}[A-Z]{4}\d{10}$/
  },

  /**
   * Telefoonnummer validatie.
   */
  PHONE: {
    MIN_LENGTH: 10,
    MAX_LENGTH: 15
  },

  // ============================================================================
  // WEBSITE CONFIGURATIE
  // ============================================================================

  /**
   * Doelwebsite domein.
   * Als overheid migreert naar nieuw domein (bijv. eloket.overheid.nl),
   * pas hier aan i.p.v. in meerdere bestanden.
   */
  TARGET_DOMAIN: 'eloket.dienstuitvoering.nl',

  /**
   * Volledige website URL.
   */
  TARGET_URL: 'https://eloket.dienstuitvoering.nl',

  // ============================================================================
  // TIMING & DELAYS
  // ============================================================================

  /**
   * Standaard delays voor DOM interacties (in milliseconden).
   * Gebruikt voor wachten op page loads, animations, etc.
   */
  DELAYS: {
    // Korte delay voor quick animations
    SHORT: 500,

    // Normale delay voor page transitions
    NORMAL: 1000,

    // Lange delay voor slow page loads
    LONG: 2000,

    // Extra lange delay voor initial page load
    EXTRA_LONG: 3000
  },

  /**
   * Timeouts voor wacht-operaties (in milliseconden).
   */
  TIMEOUTS: {
    // Element verschijnt op pagina
    ELEMENT_APPEARS: 10000,

    // Page navigatie compleet
    PAGE_LOAD: 10000,

    // File upload compleet
    FILE_UPLOAD: 30000
  },

  /**
   * Polling configuratie voor wachten op DOM elementen.
   */
  POLLING: {
    // Hoe vaak checken (in ms)
    INTERVAL_MS: 100,

    // Maximum aantal pogingen
    MAX_ATTEMPTS: 100,

    // = 100 attempts * 100ms = 10 seconden totaal
  },

  // ============================================================================
  // CHROME STORAGE
  // ============================================================================

  /**
   * Storage keys gebruikt in chrome.storage.local/session.
   */
  STORAGE_KEYS: {
    AUTOMATION_CONFIG: 'automationConfig',
    AUTOMATION_STEP: 'automationStep',
    TAB_ID: 'tabId',
    SETTINGS: 'settings',
    LAST_CLICK_TIME: 'lastNieuweAanvraagClick',
    USAGE_STATS: 'usageStatistics',
    AUTOMATION_START_TIME: 'automationStartTime'
  },

  /**
   * Storage quota limiet (Chrome heeft ~10MB local storage).
   */
  MAX_STORAGE_SIZE_MB: 8,

  // ============================================================================
  // PDF PROCESSING
  // ============================================================================

  /**
   * PDF.js worker configuratie.
   */
  PDF: {
    WORKER_SRC: 'pdf.worker.min.js',
    MAX_IMAGE_WIDTH: 2000,
    MAX_IMAGE_HEIGHT: 2000
  },

  /**
   * Maximum bestand grootte voor uploads (in bytes).
   * 10MB = redelijke limiet voor PDFs/images.
   */
  MAX_FILE_SIZE_BYTES: 10 * 1024 * 1024, // 10MB

  // ============================================================================
  // LOGGING & DEBUG
  // ============================================================================

  /**
   * Debug mode (extra console.log output).
   * Zet op false voor productie.
   */
  DEBUG_MODE: true,

  /**
   * Hoeveel characters van extracted text loggen.
   */
  LOG_TEXT_PREVIEW_LENGTH: 500,

  // ============================================================================
  // FEATURE FLAGS
  // ============================================================================

  /**
   * Feature flags om functionality aan/uit te zetten.
   */
  FEATURES: {
    // Auto-fill formulieren
    AUTO_FILL: true,

    // Auto-upload documenten
    AUTO_UPLOAD: true,

    // Auto-submit formulier
    AUTO_SUBMIT: true,

    // OCR extractie gebruiken
    USE_OCR: true,

    // Keep-alive audio om throttling te voorkomen
    USE_KEEP_ALIVE: true
  }
};

// ============================================================================
// HELPER FUNCTIES
// ============================================================================

/**
 * Bouwt volledige Mistral API URL voor een specifiek endpoint.
 * @param {string} endpoint - bijv. 'chat/completions' of 'ocr'
 * @returns {string} Volledige URL
 */
CONFIG.getMistralUrl = function(endpoint) {
  return `${this.MISTRAL_API_ENDPOINT}/${endpoint}`;
};

/**
 * Controleert of een URL het target domain bevat.
 * @param {string} url - URL om te checken
 * @returns {boolean} True als URL het target domain bevat
 */
CONFIG.isTargetDomain = function(url) {
  return url && url.includes(this.TARGET_DOMAIN);
};

/**
 * Geeft de juiste delay terug voor een specifieke operatie.
 * @param {string} type - 'SHORT', 'NORMAL', 'LONG', 'EXTRA_LONG'
 * @returns {number} Delay in milliseconden
 */
CONFIG.getDelay = function(type = 'NORMAL') {
  return this.DELAYS[type] || this.DELAYS.NORMAL;
};

/**
 * Valideert of een jaar binnen de toegestane range valt.
 * @param {number} year - Jaar om te valideren
 * @returns {boolean} True als jaar binnen range
 */
CONFIG.isValidYear = function(year) {
  return year >= this.DATE_RANGE.MIN_YEAR && year <= this.DATE_RANGE.MAX_YEAR;
};

// ============================================================================
// EXPORT
// ============================================================================

// Maak CONFIG beschikbaar voor alle scripts
if (typeof window !== 'undefined') {
  window.CONFIG = CONFIG;
}

// Voor Node.js omgeving (als dat ooit nodig is)
if (typeof module !== 'undefined' && module.exports) {
  module.exports = CONFIG;
}
