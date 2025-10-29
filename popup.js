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
 * Deze sectie bevat alle sanitization/validatie functies voor formuliervelden.
 * Elke functie:
 * - Normaliseert het format (spaties, hoofdletters, etc.)
 * - Corrigeert veelvoorkomende OCR fouten (O/0 verwarring)
 * - Valideert de input (lengte, checksums, ranges)
 * - Logt warnings bij ongeldige waarden
 * - Retourneert genormaliseerde waarde of null
 */

/**
 * Sanitize BSN (Burgerservicenummer).
 * - Verwijdert alle niet-cijfer karakters
 * - Valideert lengte (moet exact 9 cijfers zijn)
 * - Valideert 11-proef checksum
 * @param {string|number} bsnRaw - Ruwe BSN input
 * @returns {string|null} Gesanitized BSN of null
 */
function sanitizeBSN(bsnRaw) {
  if (!bsnRaw) return null;

  let bsn = String(bsnRaw).trim();

  // Fix OCR errors in BSN (all positions should be digits)
  // Common OCR mistakes: O→0, I/l→1, S→5, B→8, Z→2, G→6
  bsn = bsn.replace(/O/g, '0')    // O → 0
           .replace(/[Il]/g, '1')  // I or l → 1
           .replace(/S/g, '5')     // S → 5
           .replace(/B/g, '8')     // B → 8
           .replace(/Z/g, '2')     // Z → 2
           .replace(/G/g, '6');    // G → 6

  // Verwijder alle niet-cijfer karakters
  bsn = bsn.replace(/\D/g, '');

  // Valideer lengte
  if (bsn.length !== 9) {
    console.warn(`Invalid BSN length: ${bsn.length} (expected 9)`);
    return bsn; // Return anyway maar log warning
  }

  // 11-proef validatie (BSN checksum)
  const weights = [9, 8, 7, 6, 5, 4, 3, 2, -1];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(bsn[i]) * weights[i];
  }

  if (sum % 11 !== 0) {
    console.warn(`BSN failed 11-proef validation: ${bsn}`);
    // Return anyway - sommige speciale BSN's kunnen afwijken
  }

  return bsn;
}

/**
 * Sanitize IBAN (bankrekeningnummer).
 * - Verwijdert spaties en punten
 * - Maakt uppercase
 * - Corrigeert AI/OCR fouten (O/0, I/1, S/5, B/8, etc.)
 * - Valideert en corrigeert bank codes (RABO, INGB, ABNA, etc.)
 * - Valideert NL IBAN formaat (18 karakters)
 * - Valideert IBAN modulo-97 checksum
 * @param {string} ibanRaw - Ruwe IBAN input
 * @returns {string|null} Gesanitized IBAN of null
 */
function sanitizeIBAN(ibanRaw) {
  if (!ibanRaw) return null;

  let iban = String(ibanRaw).trim();

  // ⚡ FIELD SPLITTING: Verwijder BIC code indien gecombineerd
  // Common patterns:
  // - "NL91RABO0123456789 RABONL2U" (spatie gescheiden)
  // - "NL91RABO0123456789 BIC: RABONL2U" (met label)
  // - "NL91RABO0123456789RABONL2U" (direct aan elkaar - BIC is 8 of 11 chars)

  // Remove "BIC:" label eerst
  iban = iban.replace(/\s*BIC\s*:\s*/gi, ' ');

  // Als er spaties zijn, zoek het deel dat begint met NL
  if (iban.includes(' ')) {
    const parts = iban.split(/\s+/);
    // Neem het deel dat begint met NL en ongeveer 18 chars is
    const ibanPart = parts.find(part => part.toUpperCase().startsWith('NL') && part.length >= 16 && part.length <= 20);
    if (ibanPart) {
      iban = ibanPart;
    } else {
      iban = parts[0]; // Fallback: neem eerste deel
    }
  }

  // Verwijder spaties, punten, maak uppercase
  iban = iban.replace(/[\s.]/g, '').toUpperCase();

  // Als IBAN langer is dan 18 chars, check voor BIC aan het einde
  if (iban.length > 18 && iban.startsWith('NL')) {
    const potentialBic = iban.substring(18);
    // Check of wat overblijft lijkt op een BIC (8 of 11 chars, bevat NL2)
    if ((potentialBic.length === 8 || potentialBic.length === 11) && potentialBic.includes('NL2')) {
      console.log(`IBAN contained BIC code, removed: ${potentialBic}`);
      iban = iban.substring(0, 18);
    }
  }

  // Valideer minimale lengte
  if (iban.length < 10) {
    console.warn(`IBAN too short: ${iban}`);
    return iban;
  }

  // Valideer NL IBAN formaat
  if (!iban.startsWith('NL')) {
    console.warn(`IBAN does not start with NL: ${iban}`);
  }

  // NL IBAN format: NL + 2 digits (checksum) + 4 letters (bank) + 10 digits (account)
  // Position:      0-1  2-3                 4-7                8-17

  // Fix OCR errors per section:
  // 1. Checksum (positions 2-3): should be digits
  if (iban.length >= 4) {
    let checksum = iban.substring(2, 4);
    checksum = checksum.replace(/O/g, '0')
                       .replace(/[Il]/g, '1')
                       .replace(/S/g, '5')
                       .replace(/B/g, '8')
                       .replace(/Z/g, '2');
    iban = iban.substring(0, 2) + checksum + iban.substring(4);
  }

  // 2. Bank code (positions 4-7): should be 4 letters
  //    Fix common OCR errors and validate against known bank codes
  if (iban.length >= 8) {
    let bankCode = iban.substring(4, 8);

    // List of valid Dutch bank codes
    const validBankCodes = [
      'RABO', 'INGB', 'ABNA', 'SNSB', 'ASNB', 'TRIO', 'BUNQ', 'KNAB',
      'RBRB', 'FVLB', 'HAND', 'NNBA', 'REVOLT', 'AEGO', 'BITSNL', 'ISBK'
    ];

    // Try to fix OCR errors in bank code (digits → letters)
    const bankCodeFixed = bankCode.replace(/0/g, 'O')
                                   .replace(/1/g, 'I')
                                   .replace(/5/g, 'S')
                                   .replace(/8/g, 'B')
                                   .replace(/2/g, 'Z')
                                   .replace(/4/g, 'A')
                                   .replace(/6/g, 'G');

    // Check if fixed bank code is valid
    if (validBankCodes.includes(bankCodeFixed)) {
      if (bankCode !== bankCodeFixed) {
        console.log(`IBAN bank code corrected: ${bankCode} → ${bankCodeFixed}`);
        bankCode = bankCodeFixed;
      }
    } else if (!validBankCodes.includes(bankCode)) {
      // Try common specific corrections
      if (bankCode === 'RAB0' || bankCode === 'RABO') bankCode = 'RABO';
      else if (bankCode.startsWith('RAB') && bankCode.length === 4) bankCode = 'RABO';
      else if (bankCode === 'ING8' || bankCode === 'INGB') bankCode = 'INGB';
      else if (bankCode.startsWith('ING') && bankCode.length === 4) bankCode = 'INGB';
      else if (bankCode === 'ABN4' || bankCode === 'A8NA') bankCode = 'ABNA';
      else if (bankCode.startsWith('ABN') && bankCode.length === 4) bankCode = 'ABNA';
      else if (bankCode === '5NSB' || bankCode === 'SNS8') bankCode = 'SNSB';
      else if (bankCode.startsWith('SNS') && bankCode.length === 4) bankCode = 'SNSB';
      else if (bankCode === 'TR10') bankCode = 'TRIO';
      else if (bankCode === '8UNQ') bankCode = 'BUNQ';
      else {
        console.warn(`Unknown bank code in IBAN: ${bankCode} (expected RABO, INGB, ABNA, SNSB, etc.)`);
      }
    }

    iban = iban.substring(0, 4) + bankCode + iban.substring(8);
  }

  // 3. Account number (positions 8-17): should be 10 digits
  if (iban.length >= 18) {
    let accountNumber = iban.substring(8, 18);
    accountNumber = accountNumber.replace(/O/g, '0')
                                 .replace(/[Il]/g, '1')
                                 .replace(/S/g, '5')
                                 .replace(/B/g, '8')
                                 .replace(/Z/g, '2')
                                 .replace(/G/g, '6');
    iban = iban.substring(0, 8) + accountNumber + iban.substring(18);
  }

  // Validate total length
  if (iban.length !== 18) {
    console.warn(`Invalid NL IBAN length: ${iban.length} (expected 18)`);
    return iban; // Return anyway
  }

  // IBAN modulo-97 checksum validatie
  const rearranged = iban.substring(4) + iban.substring(0, 4);
  let numericString = '';
  for (let char of rearranged) {
    if (char >= '0' && char <= '9') {
      numericString += char;
    } else {
      numericString += (char.charCodeAt(0) - 55).toString(); // A=10, B=11, etc
    }
  }

  // BigInt voor grote getallen
  const remainder = BigInt(numericString) % 97n;
  if (remainder !== 1n) {
    console.warn(`IBAN failed checksum validation: ${iban}`);
  }

  return iban;
}

/**
 * Sanitize telefoonnummer.
 * - Verwijdert alle niet-cijfer karakters (behalve + voor landcode)
 * - Converteert +31 naar 0 prefix
 * - Valideert lengte (10 cijfers)
 * - Waarschuwt voor service nummers (085, 088, 090, 091)
 * @param {string} phoneRaw - Ruwe telefoon input
 * @returns {string|null} Gesanitized telefoon of null
 */
function sanitizePhone(phoneRaw) {
  if (!phoneRaw) return null;

  let phone = String(phoneRaw).trim();

  // Fix OCR errors BEFORE removing non-digit chars
  // Common mistakes at start: O→0, I→1
  phone = phone.replace(/^O/g, '0')      // O at start → 0
               .replace(/^0O/g, '00')     // 0O at start → 00
               .replace(/O/g, '0')        // All O → 0
               .replace(/[Il]/g, '1');    // I or l → 1

  // Verwijder alle niet-cijfer karakters behalve +
  phone = phone.replace(/[^\d+]/g, '');

  // Handle +31 landcode
  if (phone.startsWith('+31')) {
    phone = '0' + phone.substring(3);
  } else if (phone.startsWith('0031')) {
    phone = '0' + phone.substring(4);
  } else if (phone.startsWith('31') && phone.length >= 11) {
    phone = '0' + phone.substring(2);
  }

  // Filter ongewenste nummers
  if (phone.startsWith('085') || phone.startsWith('088') ||
      phone.startsWith('090') || phone.startsWith('091')) {
    console.warn(`Service number detected, may not be personal: ${phone}`);
  }

  // Valideer lengte (NL nummers zijn 10 cijfers met leading 0)
  if (phone.length !== 10) {
    console.warn(`Invalid phone length: ${phone.length} (expected 10)`);
  }

  // Valideer start (moet 06 of 0xx zijn)
  if (!phone.startsWith('0')) {
    console.warn(`Phone should start with 0: ${phone}`);
    return '0' + phone; // Auto-fix
  }

  return phone;
}

/**
 * Sanitize email adres.
 * - Verwijdert spaties
 * - Maakt lowercase
 * - Verwijdert trailing leestekens (OCR errors)
 * - Filtert bedrijfsemail (@samangroep, @saman)
 * - Valideert email format
 * @param {string} emailRaw - Ruwe email input
 * @returns {string|null} Gesanitized email of null
 */
function sanitizeEmail(emailRaw) {
  if (!emailRaw) return null;

  // Verwijder spaties, maak lowercase
  let email = String(emailRaw).replace(/\s/g, '').toLowerCase().trim();

  // Verwijder trailing punt/komma (OCR errors)
  email = email.replace(/[.,;]+$/, '');

  // Filter bedrijfsemail
  if (email.includes('@samangroep') || email.includes('@saman')) {
    console.warn(`Company email filtered: ${email}`);
    return null;
  }

  // Basic email validatie
  const emailRegex = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  if (!emailRegex.test(email)) {
    console.warn(`Invalid email format: ${email}`);
    return email; // Return anyway voor handmatige correctie
  }

  // Check for common OCR errors
  email = email.replace(/,/g, '.'); // Komma → punt in domein

  return email;
}

/**
 * Sanitize voorletters.
 * - Corrigeert OCR fouten (cijfers → letters)
 * - Verwijdert overblijvende cijfers en speciale tekens
 * - Normaliseert format naar "J.H.M." (met punten)
 * - Maakt uppercase
 * @param {string} initialsRaw - Ruwe voorletters input
 * @returns {string|null} Gesanitized voorletters of null
 */
function sanitizeInitials(initialsRaw) {
  if (!initialsRaw) return null;

  let initials = String(initialsRaw).trim();

  // ⚡ FIELD SPLITTING: Extract alleen initials als achternaam erbij staat
  // Patterns:
  // - "J.H.M. Jansen" (initials + achternaam)
  // - "Jan Hendrik Maria" (volledige voornamen - neem eerste letters)

  // Fix OCR errors EERST: voorletters kunnen ALLEEN letters zijn (A-Z)
  // Common OCR mistakes: cijfers → letters
  initials = initials.replace(/5/g, 'S')   // 5 → S (zeer vaak in voorletters!)
                     .replace(/0/g, 'O')   // 0 → O
                     .replace(/1/g, 'I')   // 1 → I
                     .replace(/8/g, 'B')   // 8 → B
                     .replace(/2/g, 'Z')   // 2 → Z
                     .replace(/6/g, 'G');  // 6 → G

  // Verwijder alles behalve letters, punten en spaties
  initials = initials.replace(/[^a-zA-Z.\s]/g, '');

  // Als er meerdere woorden zijn EN laatste woord begint met hoofdletter
  // → extract alleen voorletters (niet achternaam)
  const words = initials.split(/\s+/).filter(w => w.length > 0);
  if (words.length > 1) {
    // Als laatste woord > 2 chars en geen punten heeft → waarschijnlijk achternaam
    const lastWord = words[words.length - 1];
    if (lastWord.length > 2 && !lastWord.includes('.')) {
      console.log(`Extracted initials from combined field, removed surname: ${lastWord}`);
      // Neem alleen eerste woorden (voor de achternaam)
      initials = words.slice(0, -1).join(' ');
    }
  }

  // Split op spaties/punten
  let letters = initials.split(/[\s.]+/).filter(l => l.length > 0);

  // Maak uppercase en voeg punten toe
  letters = letters.map(l => l.charAt(0).toUpperCase());

  // Join met punt tussen elke letter
  initials = letters.join('.') + (letters.length > 0 ? '.' : '');

  // Valideer: maximaal 10 voorletters is realistisch
  if (letters.length > 10) {
    console.warn(`Unusual number of initials: ${letters.length}`);
  }

  return initials;
}

/**
 * Sanitize achternaam.
 * - Normaliseert spaties
 * - Capitaliseert correct met Nederlandse voorvoegsels (van, de, der, etc)
 * - Waarschuwt bij cijfers
 * @param {string} lastNameRaw - Ruwe achternaam input
 * @returns {string|null} Gesanitized achternaam of null
 */
function sanitizeLastName(lastNameRaw) {
  if (!lastNameRaw) return null;

  // Trim en normaliseer spaties
  let lastName = String(lastNameRaw).trim().replace(/\s+/g, ' ');

  // Warn als cijfers aanwezig
  if (/\d/.test(lastName)) {
    console.warn(`Last name contains digits: ${lastName}`);
  }

  // Split op spaties voor voorvoegsel handling
  const parts = lastName.split(' ');

  // Nederlandse voorvoegsels (lowercase)
  const prefixes = ['van', 'de', 'der', 'den', 'het', "'t", 'te', 'ter', 'ten', 'vande', 'vanden', 'van de', 'van den', 'van der'];

  // Capitalize eerste deel, lowercase voor voorvoegsels
  const normalized = parts.map((part, index) => {
    const lowerPart = part.toLowerCase();
    if (index > 0 && prefixes.includes(lowerPart)) {
      return lowerPart;
    }
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  });

  lastName = normalized.join(' ');

  // Valideer minimale lengte
  if (lastName.replace(/\s/g, '').length < 2) {
    console.warn(`Last name very short: ${lastName}`);
  }

  return lastName;
}

/**
 * Sanitize straatnaam.
 * - Normaliseert spaties
 * - Capitaliseert elk woord
 * - Verwijdert huisnummer als het erbij zit
 * @param {string} streetRaw - Ruwe straat input
 * @returns {string|null} Gesanitized straat of null
 */
function sanitizeStreet(streetRaw) {
  if (!streetRaw) return null;

  // Trim en normaliseer spaties
  let street = String(streetRaw).trim().replace(/\s+/g, ' ');

  // Verwijder huisnummer als het erbij zit (cijfers aan eind)
  street = street.replace(/\s*\d+.*$/, '').trim();

  // Capitalize elk woord
  street = street.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');

  // Valideer minimale lengte
  if (street.length < 3) {
    console.warn(`Street name very short: ${street}`);
  }

  return street;
}

/**
 * Sanitize huisnummer en toevoeging.
 * - Split nummer en toevoeging
 * - Verwijdert spaties uit toevoeging
 * - Maakt toevoeging uppercase
 * - Valideert nummer range (1-9999)
 * @param {string} houseNumberRaw - Ruwe huisnummer input
 * @returns {Object} {number: string, addition: string|null}
 */
function sanitizeHouseNumber(houseNumberRaw) {
  if (!houseNumberRaw) return { number: null, addition: null };

  // Verwijder leading/trailing spaties
  let combined = String(houseNumberRaw).trim();

  // Match nummer en toevoeging
  const match = combined.match(/^(\d+)(.*)$/);

  if (!match) {
    console.warn(`Could not parse house number: ${combined}`);
    return { number: combined, addition: null };
  }

  let number = match[1];
  let addition = match[2].trim();

  // Verwijder spaties uit toevoeging
  addition = addition.replace(/\s/g, '');

  // Uppercase toevoeging
  addition = addition.toUpperCase();

  // Valideer nummer range (1-9999 is realistisch)
  const numValue = parseInt(number);
  if (numValue < 1 || numValue > 9999) {
    console.warn(`Unusual house number: ${numValue}`);
  }

  return {
    number: number,
    addition: addition || null
  };
}

/**
 * Sanitize postcode.
 * - Verwijdert spaties
 * - Maakt uppercase
 * - Corrigeert O/0 verwarring in cijfer gedeelte
 * - Valideert NL format (4 cijfers + 2 letters)
 * - Retourneert format "1234 AB" met spatie
 * @param {string} postalCodeRaw - Ruwe postcode input
 * @returns {string|null} Gesanitized postcode of null
 */
function sanitizePostalCode(postalCodeRaw) {
  if (!postalCodeRaw) return null;

  let postal = String(postalCodeRaw).toUpperCase().trim();

  // ⚡ FIELD SPLITTING: Extract postcode uit volledig adres
  // Patterns:
  // - "1065JD Amsterdam" (postcode + plaats)
  // - "Insulindestraat 59 1065JD Amsterdam" (volledig adres)
  // Nederlandse postcode = 4 cijfers + 2 letters (herkenbaar patroon)

  // Zoek postcode patroon: 4 cijfers gevolgd door 2 letters
  const postalMatch = postal.match(/\b(\d{4}\s?[A-Z]{2})\b/);
  if (postalMatch) {
    console.log(`Extracted postal code from combined field: ${postalMatch[1]}`);
    postal = postalMatch[1];
  }

  // Verwijder alle spaties
  postal = postal.replace(/\s/g, '');

  // Fix OCR errors per section:
  // First 4 positions: should be digits (fix O→0, I→1, S→5, B→8, Z→2, G→6)
  if (postal.length >= 4) {
    let digits = postal.substring(0, 4);
    digits = digits.replace(/O/g, '0')
                   .replace(/[Il]/g, '1')
                   .replace(/S/g, '5')
                   .replace(/B/g, '8')
                   .replace(/Z/g, '2')
                   .replace(/G/g, '6');
    postal = digits + postal.substring(4);
  }

  // Last 2 positions: should be letters (fix 0→O, 1→I, 5→S, 8→B)
  // But only if they're actually digits (don't fix if already correct)
  if (postal.length >= 6) {
    let letters = postal.substring(4, 6);
    // Only convert if digit is found in letter position
    letters = letters.replace(/0/g, 'O')
                     .replace(/1/g, 'I')
                     .replace(/5/g, 'S')
                     .replace(/8/g, 'B');
    postal = postal.substring(0, 4) + letters;
  }

  // Valideer NL postcode format: 4 cijfers + 2 letters
  const postalRegex = /^(\d{4})([A-Z]{2})$/;
  const match = postal.match(postalRegex);

  if (!match) {
    console.warn(`Invalid postal code format: ${postal} (expected: 1234AB)`);
    return postal; // Return anyway voor handmatige correctie
  }

  // Return met standaard spatie: "1234 AB"
  return `${match[1]} ${match[2]}`;
}

/**
 * Sanitize plaatsnaam.
 * - Normaliseert spaties
 * - Capitaliseert elk woord
 * - Behoudt speciale karakters ('-', apostroffen)
 * - Waarschuwt bij cijfers
 * @param {string} cityRaw - Ruwe plaatsnaam input
 * @returns {string|null} Gesanitized plaatsnaam of null
 */
function sanitizeCity(cityRaw) {
  if (!cityRaw) return null;

  // Trim en normaliseer spaties
  let city = String(cityRaw).trim().replace(/\s+/g, ' ');

  // Warn als cijfers aanwezig
  if (/\d/.test(city)) {
    console.warn(`City name contains digits: ${city}`);
  }

  // Capitalize elk woord, behalve tussenvoegsels
  const words = city.split(/(\s|-)/); // Split op spaties en streepjes maar behoud delimiters

  const normalized = words.map((word, index) => {
    if (word === ' ' || word === '-' || word === "'") return word;

    // Kleine woorden lowercase (tenzij eerste woord)
    if (index > 0 && ['aan', 'bij', 'op', 'onder'].includes(word.toLowerCase())) {
      return word.toLowerCase();
    }

    // Capitalize
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  city = normalized.join('');

  // Valideer minimale lengte
  if (city.length < 2) {
    console.warn(`City name very short: ${city}`);
  }

  return city;
}

/**
 * Sanitize geslacht.
 * - Normaliseert verschillende varianten naar "male" of "female"
 * - Accepteert: man/vrouw, M/V, male/female, mannelijk/vrouwelijk
 * - Default fallback naar "male" bij onbekende waarde
 * @param {string} genderRaw - Ruwe geslacht input
 * @returns {string|null} "male", "female", of null
 */
function sanitizeGender(genderRaw) {
  if (!genderRaw) return null;

  // Lowercase voor matching
  const gender = String(genderRaw).toLowerCase().trim();

  // Map naar male/female
  if (gender === 'male' || gender === 'man' || gender === 'm' || gender === 'mannelijk') {
    return 'male';
  }

  if (gender === 'female' || gender === 'vrouw' || gender === 'v' || gender === 'woman' || gender === 'vrouwelijk') {
    return 'female';
  }

  console.warn(`Unknown gender value: ${genderRaw}`);
  return 'male'; // Default fallback
}

/**
 * Sanitize aardgasgebruik.
 * - Normaliseert verschillende varianten naar "yes" of "no"
 * - Accepteert: ja/nee, yes/no, 1/0, true/false
 * - Retourneert null bij onbekende waarde (voor handmatige invul)
 * @param {string} gasUsageRaw - Ruwe aardgas input
 * @returns {string|null} "yes", "no", of null
 */
function sanitizeGasUsage(gasUsageRaw) {
  if (!gasUsageRaw) return null;

  // Lowercase voor matching
  const gas = String(gasUsageRaw).toLowerCase().trim();

  // Map naar yes/no
  if (gas === 'yes' || gas === 'ja' || gas === '1' || gas === 'true') {
    return 'yes';
  }

  if (gas === 'no' || gas === 'nee' || gas === '0' || gas === 'false') {
    return 'no';
  }

  console.warn(`Unknown gas usage value: ${gasUsageRaw}`);
  return null; // Laat leeg voor handmatige invul
}

/**
 * Sanitize meldcode.
 * - Verwijdert spaties en streepjes
 * - Maakt uppercase
 * - Corrigeert O/0 verwarring in cijfer gedeelte
 * - Valideert format: KA + exact 5 cijfers
 * - Waarschuwt bij verdachte codes (KA00000)
 * @param {string} meldCodeRaw - Ruwe meldcode input
 * @returns {string|null} Gesanitized meldcode of null
 */
function sanitizeMeldCode(meldCodeRaw) {
  if (!meldCodeRaw) return null;

  let code = String(meldCodeRaw).trim();

  // ⚡ FIELD SPLITTING: Verwijder labels en extra info
  // Patterns:
  // - "Meldcode: KA12345"
  // - "KA12345 Type: Installatie"

  // Verwijder "Meldcode:" label
  code = code.replace(/^Meldcode\s*:\s*/i, '');

  // Extract alleen KA##### patroon
  const meldCodeMatch = code.match(/\b(K[A04O]\d{5})\b/i);
  if (meldCodeMatch) {
    code = meldCodeMatch[1];
  }

  // Verwijder spaties en streepjes, maak uppercase
  code = code.replace(/[\s-]/g, '').toUpperCase();

  // Fix OCR errors in prefix (should be "KA")
  // Common mistakes: K4 → KA, KÅ → KA
  if (code.length >= 2) {
    let prefix = code.substring(0, 2);
    if (prefix === 'K4' || prefix === 'K0' || prefix === 'KO') {
      prefix = 'KA';
      console.log(`Meldcode prefix corrected: ${code.substring(0, 2)} → KA`);
    }
    code = prefix + code.substring(2);
  }

  // Fix OCR errors in digit section (positions 2-6: should be 5 digits)
  if (code.length >= 7 && code.startsWith('KA')) {
    let digits = code.substring(2, 7);
    digits = digits.replace(/O/g, '0')
                   .replace(/[Il]/g, '1')
                   .replace(/S/g, '5')
                   .replace(/B/g, '8')
                   .replace(/Z/g, '2')
                   .replace(/G/g, '6');
    code = 'KA' + digits + code.substring(7);
  }

  // Valideer format: KA + exact 5 cijfers
  const meldCodeRegex = /^KA(\d{5})$/;
  const match = code.match(meldCodeRegex);

  if (!match) {
    console.warn(`Invalid meldcode format: ${code} (expected: KA#####, like KA12345)`);
    return code; // Return anyway voor handmatige correctie
  }

  // Extra validatie: cijfers mogen niet allemaal 0 zijn
  if (match[1] === '00000') {
    console.warn(`Suspicious meldcode (all zeros): ${code}`);
  }

  return code;
}

/**
 * Sanitize installatiedatum.
 * - Converteert verschillende datum formaten naar DD-MM-YYYY
 * - Accepteert: DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, YYYY-MM-DD
 * - Corrigeert O/0 verwarring
 * - Valideert datum geldigheid (geen 31 feb)
 * - Valideert realistische range (2020-2030)
 * - Waarschuwt bij toekomstige datums
 * @param {string} dateRaw - Ruwe datum input
 * @returns {string|null} Datum in format DD-MM-YYYY of null
 */
function sanitizeInstallationDate(dateRaw) {
  if (!dateRaw) return null;

  let date = String(dateRaw).trim();

  // ⚡ FIELD SPLITTING: Verwijder labels en extra info
  // Patterns:
  // - "Installatiedatum: 15-06-2024"
  // - "Datum 15-06-2024"
  // - "15-06-2024 Factuur: 12345"

  // Verwijder bekende labels
  date = date.replace(/^(Installatie)?[Dd]atum\s*:\s*/i, '')
             .replace(/^Datum\s+(installatie)?\s*:\s*/i, '');

  // Extract eerste datum patroon (DD-MM-YYYY of varianten)
  const datePatternMatch = date.match(/(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4})/);
  if (datePatternMatch) {
    date = datePatternMatch[1];
  }

  // Fix O/0 verwarring
  date = date.replace(/O/g, '0');

  // Parse verschillende formaten naar DD-MM-YYYY
  let day, month, year;

  // Probeer DD-MM-YYYY of DD/MM/YYYY of DD.MM.YYYY
  let match = date.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})$/);
  if (match) {
    day = match[1].padStart(2, '0');
    month = match[2].padStart(2, '0');
    year = match[3].length === 2 ? '20' + match[3] : match[3];
  } else {
    // Probeer YYYY-MM-DD (ISO format)
    match = date.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})$/);
    if (match) {
      year = match[1];
      month = match[2].padStart(2, '0');
      day = match[3].padStart(2, '0');
    } else {
      console.warn(`Could not parse installation date: ${dateRaw}`);
      return dateRaw;
    }
  }

  // Valideer ranges
  const dayNum = parseInt(day);
  const monthNum = parseInt(month);
  const yearNum = parseInt(year);

  if (dayNum < 1 || dayNum > 31) {
    console.warn(`Invalid day in date: ${day}`);
  }
  if (monthNum < 1 || monthNum > 12) {
    console.warn(`Invalid month in date: ${month}`);
  }
  if (yearNum < 2020 || yearNum > 2030) {
    console.warn(`Unusual year in installation date: ${year} (expected 2020-2030)`);
  }

  // Check of datum in toekomst is
  const parsedDate = new Date(yearNum, monthNum - 1, dayNum);
  const today = new Date();
  today.setHours(0, 0, 0, 0); // Reset tijd voor vergelijking

  if (parsedDate > today) {
    console.warn(`Installation date is in the future: ${day}-${month}-${year}`);
  }

  // Valideer dat datum bestaat (geen 31 feb etc)
  const testDate = new Date(yearNum, monthNum - 1, dayNum);
  if (testDate.getDate() !== dayNum || testDate.getMonth() !== monthNum - 1) {
    console.warn(`Invalid date (day doesn't exist in month): ${day}-${month}-${year}`);
  }

  // Return in NL format: DD-MM-YYYY
  return `${day}-${month}-${year}`;
}

/**
 * Sanitize aankoopdatum.
 * - Converteert verschillende datum formaten naar DD-MM-YYYY
 * - Accepteert: DD-MM-YYYY, DD/MM/YYYY, DD.MM.YYYY, YYYY-MM-DD
 * - Corrigeert O/0 verwarring
 * - Valideert datum geldigheid
 * - Valideert realistische range (2020-2030)
 * - Waarschuwt bij toekomstige datums
 * - Valideert logische volgorde: aankoop <= installatie
 * @param {string} dateRaw - Ruwe datum input
 * @param {string} installationDate - Installatiedatum voor volgorde check (optioneel)
 * @returns {string|null} Datum in format DD-MM-YYYY of null
 */
function sanitizePurchaseDate(dateRaw, installationDate = null) {
  if (!dateRaw) return null;

  // Verwijder spaties, fix O/0 verwarring
  let date = String(dateRaw).trim().replace(/O/g, '0');

  // Parse verschillende formaten naar DD-MM-YYYY
  let day, month, year;

  // Probeer DD-MM-YYYY of DD/MM/YYYY of DD.MM.YYYY
  let match = date.match(/^(\d{1,2})[-\/\.](\d{1,2})[-\/\.](\d{2,4})$/);
  if (match) {
    day = match[1].padStart(2, '0');
    month = match[2].padStart(2, '0');
    year = match[3].length === 2 ? '20' + match[3] : match[3];
  } else {
    // Probeer YYYY-MM-DD (ISO format)
    match = date.match(/^(\d{4})[-\/\.](\d{1,2})[-\/\.](\d{1,2})$/);
    if (match) {
      year = match[1];
      month = match[2].padStart(2, '0');
      day = match[3].padStart(2, '0');
    } else {
      console.warn(`Could not parse purchase date: ${dateRaw}`);
      return dateRaw;
    }
  }

  // Valideer ranges
  const dayNum = parseInt(day);
  const monthNum = parseInt(month);
  const yearNum = parseInt(year);

  if (dayNum < 1 || dayNum > 31) {
    console.warn(`Invalid day in date: ${day}`);
  }
  if (monthNum < 1 || monthNum > 12) {
    console.warn(`Invalid month in date: ${month}`);
  }
  if (yearNum < 2020 || yearNum > 2030) {
    console.warn(`Unusual year in purchase date: ${year} (expected 2020-2030)`);
  }

  // Check of datum in toekomst is
  const parsedDate = new Date(yearNum, monthNum - 1, dayNum);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (parsedDate > today) {
    console.warn(`Purchase date is in the future: ${day}-${month}-${year}`);
  }

  // Valideer dat datum bestaat
  const testDate = new Date(yearNum, monthNum - 1, dayNum);
  if (testDate.getDate() !== dayNum || testDate.getMonth() !== monthNum - 1) {
    console.warn(`Invalid date (day doesn't exist in month): ${day}-${month}-${year}`);
  }

  // Als installationDate bekend is, valideer dat aankoop <= installatie
  if (installationDate) {
    const installMatch = installationDate.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (installMatch) {
      const installDate = new Date(
        parseInt(installMatch[3]),
        parseInt(installMatch[2]) - 1,
        parseInt(installMatch[1])
      );

      if (parsedDate > installDate) {
        console.warn(`Purchase date (${day}-${month}-${year}) is after installation date (${installationDate})`);
      }
    }
  }

  // Return in NL format: DD-MM-YYYY
  return `${day}-${month}-${year}`;
}

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
document.getElementById('machtigingsformulier').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    // Toon bestandsnaam in de UI
    const nameDiv = document.getElementById('machtigingName');
    nameDiv.textContent = `✓ ${file.name}`;
    nameDiv.style.display = 'inline-block';

    // Converteer bestand naar base64 en sla op voor upload naar formulier
    machtigingsbewijsData = await fileToBase64(file);
    console.log('📎 Machtigingsformulier uploaded (session only):', file.name);

    // Toon extractie status aan gebruiker
    showExtractionStatus('🔄 Gegevens worden geëxtraheerd...', 'extractionStatus', 'processing', 0);

    try {
      // Voer OCR extractie uit op het machtigingsformulier
      const extractedData = await extractDataFromForm(file);
      console.log('Extracted data result:', extractedData);

      // Vul formuliervelden in met geëxtraheerde data
      const fieldsFound = fillFormFields(extractedData);

      // Toon succesbericht met aantal gevonden velden
      if (fieldsFound > 0) {
        showExtractionStatus(`✅ ${fieldsFound} veld(en) succesvol ingevuld!`, 'extractionStatus', 'success', 5000);
      } else {
        showExtractionStatus('⚠️ Geen gegevens gevonden. Controleer de console voor details.', 'extractionStatus', 'warning', 5000);
      }

      // Update de status van de "Start Automatisering" knop
      updateStartButtonState();
    } catch (error) {
      // Behandel extractie fouten
      console.error('Extraction error:', error);
      console.error('Error stack:', error.stack);
      showExtractionStatus(`❌ Fout: ${error.message}`, 'extractionStatus', 'error', 0);

      // Update knop status ook bij fout
      updateStartButtonState();
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
document.getElementById('betaalbewijsDoc').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    console.log('📎 Betaalbewijs uploaded (session only):', file.name);

    // Converteer bestand naar base64 en sla op
    betaalbewijsData = await fileToBase64(file);

    // Toon bestandsnaam in de UI
    const nameDiv = document.getElementById('betaalbewijsName');
    nameDiv.textContent = `✓ ${file.name}`;
    nameDiv.style.display = 'inline-block';

    console.log('✓ Betaalbewijs ready for automation (will be cleared after use)');

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
document.getElementById('factuurDoc').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    console.log('📎 Factuur uploaded (session only):', file.name);

    // Converteer bestand naar base64 en sla op
    factuurData = await fileToBase64(file);

    // Toon bestandsnaam in de UI
    const nameDiv = document.getElementById('factuurName');
    nameDiv.textContent = `✓ ${file.name}`;
    nameDiv.style.display = 'inline-block';

    console.log('✓ Factuur ready for automation (will be cleared after use)');

    // Toon extractie status voor meldcode en datum
    showExtractionStatus('🔄 Meldcode wordt geëxtraheerd uit factuur...', 'factuurExtractionStatus', 'processing', 0);

    try {
      // Voer meldcode en datum extractie uit
      const { meldcode, installationDate } = await extractMeldcodeFromFactuur(file);

      let fieldsFound = [];

      // Vul meldcode veld in als gevonden
      if (meldcode) {
        document.getElementById('meldCode').value = meldcode;
        fieldsFound.push('Meldcode: ' + meldcode);
        console.log('✅ Meldcode extracted:', meldcode);
      }

      // Vul installatiedatum veld in als gevonden
      if (installationDate) {
        document.getElementById('installationDate').value = installationDate;
        fieldsFound.push('Installatiedatum: ' + installationDate);
        console.log('✅ Installation date extracted:', installationDate);
      }

      // Toon succesmelding met gevonden gegevens
      if (fieldsFound.length > 0) {
        showExtractionStatus(`✅ Gevonden: ${fieldsFound.join(', ')}`, 'factuurExtractionStatus', 'success', 3000);
      } else {
        showExtractionStatus('⚠️ Geen meldcode of datum gevonden in factuur', 'factuurExtractionStatus', 'warning', 3000);
      }

      // Update de status van de "Start Automatisering" knop
      updateStartButtonState();
    } catch (error) {
      // Behandel extractie fouten
      console.error('Factuur extraction error:', error);
      showExtractionStatus(`❌ Fout bij extraheren factuur: ${error.message}`, 'factuurExtractionStatus', 'error', 5000);
      updateStartButtonState();
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

  let fieldsFound = 0;

  // Vul standaard velden in
  fieldMappings.forEach(field => {
    if (extractedData[field]) {
      const element = document.getElementById(field);
      if (element) {
        element.value = extractedData[field];
        fieldsFound++;
      }
    }
  });

  // Speciale behandeling voor huisnummer (splits logica)
  if (extractedData.houseNumber) {
    const houseNumberMatch = extractedData.houseNumber.match(/^(\d+)(.*)$/);
    if (houseNumberMatch) {
      const number = houseNumberMatch[1];
      const addition = houseNumberMatch[2];

      document.getElementById('houseNumber').value = number;
      fieldsFound++;

      if (addition) {
        document.getElementById('houseAddition').value = addition;
        fieldsFound++;
      }
    } else {
      document.getElementById('houseNumber').value = extractedData.houseNumber;
      fieldsFound++;
    }
  }

  return fieldsFound;
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

        // Gebruik Mistral Pixtral Vision AI voor OCR
        const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mistralApiKey}`
          },
          body: JSON.stringify({
            model: 'pixtral-12b-2409',
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

      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mistralApiKey}`
        },
        body: JSON.stringify({
          model: 'pixtral-12b-2409',
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

      const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${mistralApiKey}`
        },
        body: JSON.stringify({
          model: 'mistral-small-latest',
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
async function extractDataFromForm(file) {
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
    showExtractionStatus('🔄 Document OCR met Mistral AI...', 'extractionStatus', 'processing', 0);

    // Converteer bestand naar base64 voor OCR API
    let base64Document;
    if (file.type === 'application/pdf') {
      // Voor PDF: converteer naar base64
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
      base64Document = `data:application/pdf;base64,${btoa(binary)}`;
    } else {
      // Voor afbeeldingen: converteer naar base64
      base64Document = await imageToBase64(file);
    }

    showExtractionStatus('🔄 Document wordt geanalyseerd...', 'extractionStatus', 'processing', 0);

    // Stap 1: Extraheer tekst met Mistral OCR
    console.log('Calling Mistral OCR API...');
    const ocrResponse = await fetch('https://api.mistral.ai/v1/ocr', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`
      },
      body: JSON.stringify({
        model: 'mistral-ocr-latest',
        document: {
          type: 'document_url',
          document_url: base64Document
        }
      })
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

    showExtractionStatus('🔄 Gegevens extraheren met AI...', 'extractionStatus', 'processing', 0);

    // Stap 2: Gebruik text model voor gestructureerde data extractie
    console.log('Calling Mistral text model for structured extraction...');
    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`
      },
      body: JSON.stringify({
        model: 'mistral-small-latest',
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

      showExtractionStatus('🔄 Aardgas checkbox detecteren met Vision AI...', 'extractionStatus', 'processing', 0);

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
        visionBase64 = base64Document;
      }

      const visionData = visionBase64.split(',')[1];

      try {
        // Roep Vision AI aan voor checkbox detectie
        const visionResponse = await fetch('https://api.mistral.ai/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${mistralApiKey}`
          },
          body: JSON.stringify({
            model: 'pixtral-12b-2409',
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

    // Personal data
    if (extractedData.bsn) extractedData.bsn = sanitizeBSN(extractedData.bsn);
    if (extractedData.initials) extractedData.initials = sanitizeInitials(extractedData.initials);
    if (extractedData.lastName) extractedData.lastName = sanitizeLastName(extractedData.lastName);
    if (extractedData.gender) extractedData.gender = sanitizeGender(extractedData.gender);

    // Contact data
    if (extractedData.phone) extractedData.phone = sanitizePhone(extractedData.phone);
    if (extractedData.email) extractedData.email = sanitizeEmail(extractedData.email);
    if (extractedData.iban) extractedData.iban = sanitizeIBAN(extractedData.iban);

    // Address data
    if (extractedData.street) extractedData.street = sanitizeStreet(extractedData.street);
    if (extractedData.houseNumber) {
      const houseData = sanitizeHouseNumber(extractedData.houseNumber);
      extractedData.houseNumber = houseData.number;
      if (houseData.addition) extractedData.houseAddition = houseData.addition;
    }
    if (extractedData.postalCode) extractedData.postalCode = sanitizePostalCode(extractedData.postalCode);
    if (extractedData.city) extractedData.city = sanitizeCity(extractedData.city);

    // Other fields
    if (extractedData.gasUsage) extractedData.gasUsage = sanitizeGasUsage(extractedData.gasUsage);

    console.log('=== Final extracted data (after sanitization) ===', extractedData);
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
 * Reset alle formuliervelden naar lege waarden bij het openen van de popup.
 *
 * FUNCTIONALITEIT:
 * - Wist alle persoonlijke gegevens velden
 * - Reset document variabelen naar null
 * - Zorgt ervoor dat gebruiker documenten opnieuw moet uploaden
 *
 * PRIVACY & VEILIGHEID:
 * Data wordt NIET opgeslagen tussen sessies. Dit voorkomt dat gevoelige
 * klantgegevens persistent worden opgeslagen in de browser.
 */
function loadConfiguration() {
  // Reset alle formuliervelden naar leeg bij opstarten
  getAllFieldIds().forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.value = fieldId === 'gender' ? 'male' : '';
    }
  });

  // Reset document variabelen naar null
  betaalbewijsData = null;
  factuurData = null;
  machtigingsbewijsData = null;

  console.log('🔄 Plugin gestart met lege velden - upload documenten om gegevens automatisch in te vullen');
}

// Auto-opslaan is uitgeschakeld - formulierdata wordt niet bewaard tussen sessies

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
function validateRequiredFields() {
  const missingFields = [];

  // Controleer alle verplichte formuliervelden
  getRequiredFieldIds().forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field && !field.value.trim()) {
      missingFields.push(FIELD_LABELS[fieldId]);
    }
  });

  // Controleer of documenten zijn geüpload
  if (!betaalbewijsData) {
    missingFields.push('Betaalbewijs');
  }
  if (!factuurData) {
    missingFields.push('Factuur');
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
  const startButton = document.getElementById('startAutomation');
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
      field.addEventListener('input', updateStartButtonState);
      field.addEventListener('change', updateStartButtonState);
    }
  });

  // ========================================================================
  // FIELD WARNING HELPER
  // ========================================================================
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

  // ========================================================================
  // REAL-TIME SANITIZATION EVENT LISTENERS
  // ========================================================================
  // Automatically sanitize field values when user leaves the field (blur event)

  // BSN sanitization
  const bsnField = document.getElementById('bsn');
  if (bsnField) {
    bsnField.addEventListener('blur', function() {
      if (this.value) {
        const originalValue = this.value;
        const sanitized = sanitizeBSN(this.value);

        if (sanitized) {
          this.value = sanitized;

          // Check for length warnings
          const digitCount = sanitized.replace(/\D/g, '').length;
          if (digitCount < 9) {
            showFieldWarning('bsn', 'bsnWarning', `⚠️ BSN te kort: ${digitCount} cijfers (verwacht 9)`);
          } else if (digitCount > 9) {
            showFieldWarning('bsn', 'bsnWarning', `⚠️ BSN te lang: ${digitCount} cijfers (verwacht 9)`);
          } else {
            // Length is correct, hide warning
            showFieldWarning('bsn', 'bsnWarning', null);
          }
        }
      } else {
        // Clear warning when field is empty
        showFieldWarning('bsn', 'bsnWarning', null);
      }
    });
  }

  // IBAN sanitization
  const ibanField = document.getElementById('iban');
  if (ibanField) {
    ibanField.addEventListener('blur', function() {
      if (this.value) {
        const sanitized = sanitizeIBAN(this.value);

        if (sanitized) {
          this.value = sanitized;

          // Check for length and checksum warnings
          if (sanitized.length !== 18) {
            showFieldWarning('iban', 'ibanWarning', `⚠️ IBAN ongeldige lengte: ${sanitized.length} karakters (verwacht 18)`);
          } else {
            // Check checksum validity
            const rearranged = sanitized.substring(4) + sanitized.substring(0, 4);
            let numericString = '';
            for (let char of rearranged) {
              if (char >= '0' && char <= '9') {
                numericString += char;
              } else {
                numericString += (char.charCodeAt(0) - 55).toString();
              }
            }
            const remainder = BigInt(numericString) % 97n;

            if (remainder !== 1n) {
              showFieldWarning('iban', 'ibanWarning', `⚠️ IBAN checksum validatie mislukt`);
            } else {
              showFieldWarning('iban', 'ibanWarning', null);
            }
          }
        }
      } else {
        showFieldWarning('iban', 'ibanWarning', null);
      }
    });
  }

  // Phone sanitization
  const phoneField = document.getElementById('phone');
  if (phoneField) {
    phoneField.addEventListener('blur', function() {
      if (this.value) {
        const sanitized = sanitizePhone(this.value);

        if (sanitized) {
          this.value = sanitized;

          // Check for length warnings
          if (sanitized.length !== 10) {
            showFieldWarning('phone', 'phoneWarning', `⚠️ Telefoonnummer ongeldige lengte: ${sanitized.length} cijfers (verwacht 10)`);
          } else if (!sanitized.startsWith('0')) {
            showFieldWarning('phone', 'phoneWarning', `⚠️ Telefoonnummer moet beginnen met 0`);
          } else {
            showFieldWarning('phone', 'phoneWarning', null);
          }
        }
      } else {
        showFieldWarning('phone', 'phoneWarning', null);
      }
    });
  }

  // Email sanitization
  const emailField = document.getElementById('email');
  if (emailField) {
    emailField.addEventListener('blur', function() {
      if (this.value) {
        const sanitized = sanitizeEmail(this.value);

        if (sanitized === null) {
          // Company email filtered
          this.value = '';
          showFieldWarning('email', 'emailWarning', `⚠️ Bedrijfsemail niet toegestaan (@samangroep / @saman)`);
        } else {
          this.value = sanitized;

          // Check email format
          const emailRegex = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
          if (!emailRegex.test(sanitized)) {
            showFieldWarning('email', 'emailWarning', `⚠️ Ongeldig email formaat`);
          } else {
            showFieldWarning('email', 'emailWarning', null);
          }
        }
      } else {
        showFieldWarning('email', 'emailWarning', null);
      }
    });
  }

  // Initials sanitization
  const initialsField = document.getElementById('initials');
  if (initialsField) {
    initialsField.addEventListener('blur', function() {
      if (this.value) {
        const sanitized = sanitizeInitials(this.value);
        if (sanitized) this.value = sanitized;
      }
    });
  }

  // LastName sanitization
  const lastNameField = document.getElementById('lastName');
  if (lastNameField) {
    lastNameField.addEventListener('blur', function() {
      if (this.value) {
        const sanitized = sanitizeLastName(this.value);
        if (sanitized) this.value = sanitized;
      }
    });
  }

  // Street sanitization
  const streetField = document.getElementById('street');
  if (streetField) {
    streetField.addEventListener('blur', function() {
      if (this.value) {
        const sanitized = sanitizeStreet(this.value);
        if (sanitized) this.value = sanitized;
      }
    });
  }

  // HouseNumber sanitization
  const houseNumberField = document.getElementById('houseNumber');
  const houseAdditionField = document.getElementById('houseAddition');
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
  const postalCodeField = document.getElementById('postalCode');
  if (postalCodeField) {
    postalCodeField.addEventListener('blur', function() {
      if (this.value) {
        const sanitized = sanitizePostalCode(this.value);
        if (sanitized) this.value = sanitized;
      }
    });
  }

  // City sanitization
  const cityField = document.getElementById('city');
  if (cityField) {
    cityField.addEventListener('blur', function() {
      if (this.value) {
        const sanitized = sanitizeCity(this.value);
        if (sanitized) this.value = sanitized;
      }
    });
  }

  // MeldCode sanitization
  const meldCodeField = document.getElementById('meldCode');
  if (meldCodeField) {
    meldCodeField.addEventListener('blur', function() {
      if (this.value) {
        const sanitized = sanitizeMeldCode(this.value);
        if (sanitized) this.value = sanitized;
      }
    });
  }

  // InstallationDate sanitization
  const installationDateField = document.getElementById('installationDate');
  if (installationDateField) {
    installationDateField.addEventListener('blur', function() {
      if (this.value) {
        const sanitized = sanitizeInstallationDate(this.value);
        if (sanitized) this.value = sanitized;
      }
    });
  }

  // PurchaseDate sanitization (with installationDate validation)
  const purchaseDateField = document.getElementById('purchaseDate');
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
 * 2. Controleer of gebruiker op juiste website is (eloket.dienstuitvoering.nl)
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
document.getElementById('startAutomation').addEventListener('click', () => {
  // Valideer alle verplichte velden
  const missingFields = validateRequiredFields();

  if (missingFields.length > 0) {
    showStatus(`Vul eerst alle verplichte velden in: ${missingFields.join(', ')}`, 'error');
    return;
  }

  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    const currentTab = tabs[0];

    // Controleer of we op de juiste website zijn
    if (!currentTab.url || !currentTab.url.includes('eloket.dienstuitvoering.nl')) {
      showStatus('Ga eerst naar https://eloket.dienstuitvoering.nl', 'error');
      return;
    }

    // Documenten worden NIET opgeslagen - alleen doorgegeven aan automatisering
    console.log('🚀 Starting automation - documents will NOT be saved for next session');

    // Haal volledige config op inclusief bedrijfsgegevens en contactpersoon uit storage
    chrome.storage.local.get(['isdeConfig'], (result) => {
      const config = {
        // Klantgegevens uit formulier
        bsn: document.getElementById('bsn').value,
        initials: document.getElementById('initials').value,
        lastName: document.getElementById('lastName').value,
        gender: document.getElementById('gender').value,
        phone: document.getElementById('phone').value,
        email: document.getElementById('email').value,
        iban: document.getElementById('iban').value,
        street: document.getElementById('street').value,
        postalCode: document.getElementById('postalCode').value,
        city: document.getElementById('city').value,
        houseNumber: document.getElementById('houseNumber').value,
        houseAddition: document.getElementById('houseAddition').value,
        purchaseDate: document.getElementById('purchaseDate').value,
        installationDate: document.getElementById('installationDate').value,
        meldCode: document.getElementById('meldCode').value,
        gasUsage: document.getElementById('gasUsage').value,

        // Bedrijfsgegevens uit instellingen
        companyName: result.isdeConfig?.companyName || '',
        kvkNumber: result.isdeConfig?.kvkNumber || '',

        // Contactpersoon details uit instellingen (met standaard waarden)
        contactInitials: result.isdeConfig?.contactInitials || 'A',
        contactLastName: result.isdeConfig?.contactLastName || 'de Vlieger',
        contactGender: result.isdeConfig?.contactGender || 'female',
        contactPhone: result.isdeConfig?.contactPhone || '0682795068',
        contactEmail: result.isdeConfig?.contactEmail || 'administratie@saman.nl',

        // Document data (wordt later vervangen door storage keys)
        betaalbewijs: betaalbewijsData,
        factuur: factuurData,
        machtigingsbewijs: machtigingsbewijsData
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

        // Stuur bericht naar background script om automatisering te starten
        chrome.runtime.sendMessage({
          action: 'startAutomationFromPopup',
          config: config
        }, () => {
          showStatus('Automatisering gestart. Het formulier wordt stap voor stap ingevuld.', 'info');
          // Popup blijft open - gebruiker kan van tab wisselen en terugkomen
        });
      });
    });
  });
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
  const statusDiv = document.getElementById('status');
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
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });

  // Toon geselecteerde weergave
  document.getElementById(viewId).classList.add('active');

  // Toon/verberg terug knop
  const backBtn = document.getElementById('backBtn');
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
document.getElementById('settingsBtn').addEventListener('click', () => {
  loadSettings();
  showView('settingsView');
});

/** Terug knop - terug naar hoofdweergave */
document.getElementById('backBtn').addEventListener('click', () => {
  showView('mainView');
});

/** Opslaan knop - sla instellingen op */
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  saveSettings();
});

// ============================================================================
// EVENT LISTENERS: AUTO-OPSLAAN INSTELLINGEN
// ============================================================================
/**
 * Sla instellingen automatisch op wanneer gebruiker een veld verlaat (blur event).
 * Dit zorgt voor een betere gebruikerservaring zonder handmatig opslaan.
 */
document.getElementById('mistralApiKey').addEventListener('blur', saveSettings);
document.getElementById('settingsCompanyName').addEventListener('blur', saveSettings);
document.getElementById('settingsKvkNumber').addEventListener('blur', saveSettings);
document.getElementById('settingsContactInitials').addEventListener('blur', saveSettings);
document.getElementById('settingsContactLastName').addEventListener('blur', saveSettings);
document.getElementById('settingsContactGender').addEventListener('change', saveSettings);
document.getElementById('settingsContactPhone').addEventListener('blur', saveSettings);
document.getElementById('settingsContactEmail').addEventListener('blur', saveSettings);

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
      document.getElementById('mistralApiKey').value = result.mistralApiKey;
    }

    // Laad bedrijfsgegevens uit config met standaard waarden voor contactpersoon
    const config = result.isdeConfig || {};

    // Bedrijfsgegevens
    document.getElementById('settingsCompanyName').value = config.companyName || '';
    document.getElementById('settingsKvkNumber').value = config.kvkNumber || '';

    // Laad contactpersoon details met standaard waarden
    document.getElementById('settingsContactInitials').value = config.contactInitials || 'A';
    document.getElementById('settingsContactLastName').value = config.contactLastName || 'de Vlieger';
    document.getElementById('settingsContactGender').value = config.contactGender || 'female';
    document.getElementById('settingsContactPhone').value = config.contactPhone || '0682795068';
    document.getElementById('settingsContactEmail').value = config.contactEmail || 'administratie@saman.nl';
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
  const mistralApiKey = document.getElementById('mistralApiKey').value;
  const companyName = document.getElementById('settingsCompanyName').value;
  const kvkNumber = document.getElementById('settingsKvkNumber').value;
  const contactInitials = document.getElementById('settingsContactInitials').value;
  const contactLastName = document.getElementById('settingsContactLastName').value;
  const contactGender = document.getElementById('settingsContactGender').value;
  const contactPhone = document.getElementById('settingsContactPhone').value;
  const contactEmail = document.getElementById('settingsContactEmail').value;

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
      const statusDiv = document.getElementById('settingsStatus');
      statusDiv.textContent = 'Instellingen opgeslagen!';
      statusDiv.className = 'status success';

      setTimeout(() => {
        statusDiv.className = 'status';
      }, 3000);
    });
  });
}

// ============================================================================
// INITIALISATIE: LAAD CONFIGURATIE BIJ POPUP OPENEN
// ============================================================================
/**
 * Wordt aangeroepen wanneer de popup wordt geopend.
 * Reset alle velden naar lege waarden voor nieuwe sessie.
 */
window.addEventListener('DOMContentLoaded', () => {
  loadConfiguration();
});
