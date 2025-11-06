/**
 * ============================================================================
 * SANITIZATION FRAMEWORK
 * ============================================================================
 *
 * Centraal systeem voor het sanitizen en valideren van alle gebruikersinput.
 * Vooral gericht op het corrigeren van veelvoorkomende OCR fouten van Mistral AI.
 *
 * OCR ERROR PATTERNS:
 * - O (letter) ↔ 0 (cijfer): Zeer vaak in postcodes, BSN, IBAN
 * - I/l (letters) ↔ 1 (cijfer): Vaak in voorletters, telefoon
 * - S (letter) ↔ 5 (cijfer): Vaak in postcodes, voorletters
 * - B (letter) ↔ 8 (cijfer): IBAN bank codes, BSN
 * - Z (letter) ↔ 2 (cijfer): Minder vaak maar voorkomend
 * - G (letter) ↔ 6 (cijfer): Minder vaak
 *
 * VALIDATIE LEVELS:
 * 1. Format correctie (spaties, case)
 * 2. OCR error correctie (O→0, etc.)
 * 3. Checksum validatie (BSN 11-proef, IBAN modulo-97)
 * 4. Range validatie (dates, phone length)
 * 5. Business logic (purchase <= installation date)
 *
 * @author Rehan (met hulp van Claude AI)
 * @version 1.0
 */

// ============================================================================
// OCR ERROR PATTERNS (herbruikbare regex)
// ============================================================================

const OCR_PATTERNS = {
  // Letters die cijfers moeten zijn
  LETTER_TO_DIGIT: {
    O_TO_0: /O/g,
    I_TO_1: /[Il]/g,
    S_TO_5: /S/g,
    B_TO_8: /B/g,
    Z_TO_2: /Z/g,
    G_TO_6: /G/g,
  },

  // Cijfers die letters moeten zijn
  DIGIT_TO_LETTER: {
    ZERO_TO_O: /0/g,
    ONE_TO_I: /1/g,
    FIVE_TO_S: /5/g,
    EIGHT_TO_B: /8/g,
    TWO_TO_Z: /2/g,
    SIX_TO_G: /6/g,
    FOUR_TO_A: /4/g,
  },
};

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Corrigeer OCR fouten: letters → cijfers
 */
function fixLettersToDigits(str) {
  return str
    .replace(OCR_PATTERNS.LETTER_TO_DIGIT.O_TO_0, '0')
    .replace(OCR_PATTERNS.LETTER_TO_DIGIT.I_TO_1, '1')
    .replace(OCR_PATTERNS.LETTER_TO_DIGIT.S_TO_5, '5')
    .replace(OCR_PATTERNS.LETTER_TO_DIGIT.B_TO_8, '8')
    .replace(OCR_PATTERNS.LETTER_TO_DIGIT.Z_TO_2, '2')
    .replace(OCR_PATTERNS.LETTER_TO_DIGIT.G_TO_6, '6');
}

/**
 * Corrigeer OCR fouten: cijfers → letters
 */
function fixDigitsToLetters(str) {
  return str
    .replace(OCR_PATTERNS.DIGIT_TO_LETTER.ZERO_TO_O, 'O')
    .replace(OCR_PATTERNS.DIGIT_TO_LETTER.ONE_TO_I, 'I')
    .replace(OCR_PATTERNS.DIGIT_TO_LETTER.FIVE_TO_S, 'S')
    .replace(OCR_PATTERNS.DIGIT_TO_LETTER.EIGHT_TO_B, 'B')
    .replace(OCR_PATTERNS.DIGIT_TO_LETTER.TWO_TO_Z, 'Z')
    .replace(OCR_PATTERNS.DIGIT_TO_LETTER.SIX_TO_G, 'G')
    .replace(OCR_PATTERNS.DIGIT_TO_LETTER.FOUR_TO_A, 'A');
}

// ============================================================================
// SANITIZATION FUNCTIONS
// ============================================================================

/**
 * Sanitize BSN (Burgerservicenummer).
 * - Corrigeert OCR fouten
 * - Verwijdert niet-cijfers
 * - Valideert 11-proef checksum
 * @param {string} bsnRaw - Ruwe BSN input
 * @returns {string|null} Gesanitized BSN of null
 */
function sanitizeBSN(bsnRaw) {
  if (!bsnRaw) return null;

  let bsn = String(bsnRaw).trim();
  bsn = fixLettersToDigits(bsn);
  bsn = bsn.replace(/\D/g, '');

  if (bsn.length !== 9) {
    console.warn(`Invalid BSN length: ${bsn.length} (expected 9)`);
    return null;
  }

  // 11-proef validatie
  const weights = [9, 8, 7, 6, 5, 4, 3, 2, -1];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(bsn[i]) * weights[i];
  }

  if (sum % 11 !== 0) {
    console.warn(`BSN failed 11-proef validation: ${bsn}`);
    return null;
  }

  return bsn;
}

/**
 * Sanitize IBAN (bankrekeningnummer).
 * - Extraheert IBAN uit gecombineerde velden (verwijdert BIC)
 * - Corrigeert OCR fouten per sectie (checksum, bank code, account)
 * - Valideert modulo-97 checksum
 * @param {string} ibanRaw - Ruwe IBAN input
 * @returns {string|null} Gesanitized IBAN of null
 */
function sanitizeIBAN(ibanRaw) {
  if (!ibanRaw) return null;

  let iban = String(ibanRaw).trim().toUpperCase();

  // Extract ALLEEN IBAN (verwijder BIC indien aanwezig)
  const ibanMatch = iban.match(/NL[A-Z0-9]{2}[A-Z0-9]{4}[A-Z0-9]{10}/);
  if (ibanMatch) {
    iban = ibanMatch[0];
  }

  iban = iban.replace(/[\s.]/g, '');

  if (iban.length < 10) return null;
  if (!iban.startsWith('NL')) {
    console.warn(`IBAN does not start with NL: ${iban}`);
  }

  // Fix checksum (positions 2-3): should be digits
  if (iban.length >= 4) {
    let checksum = fixLettersToDigits(iban.substring(2, 4));
    iban = iban.substring(0, 2) + checksum + iban.substring(4);
  }

  // Fix bank code (positions 4-7): should be 4 letters
  if (iban.length >= 8) {
    let bankCode = iban.substring(4, 8);
    const validBankCodes = ['RABO', 'INGB', 'ABNA', 'SNSB', 'ASNB', 'TRIO', 'BUNQ', 'KNAB'];

    const bankCodeFixed = fixDigitsToLetters(bankCode);
    if (validBankCodes.includes(bankCodeFixed)) {
      bankCode = bankCodeFixed;
    } else if (!validBankCodes.includes(bankCode)) {
      // Common specific corrections
      if (bankCode.startsWith('RAB')) bankCode = 'RABO';
      else if (bankCode.startsWith('ING')) bankCode = 'INGB';
      else if (bankCode.startsWith('ABN')) bankCode = 'ABNA';
      else if (bankCode.startsWith('SNS')) bankCode = 'SNSB';
    }
    iban = iban.substring(0, 4) + bankCode + iban.substring(8);
  }

  // Fix account number (positions 8-17): should be 10 digits
  if (iban.length >= 18) {
    let accountNumber = fixLettersToDigits(iban.substring(8, 18));
    iban = iban.substring(0, 8) + accountNumber + iban.substring(18);
  }

  if (iban.length !== 18) {
    console.warn(`Invalid NL IBAN length: ${iban.length} (expected 18)`);
    return null;
  }

  // IBAN modulo-97 checksum validatie
  const rearranged = iban.substring(4) + iban.substring(0, 4);
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
    console.warn(`IBAN failed checksum validation: ${iban}`);
    return null;
  }

  return iban;
}

/**
 * Sanitize telefoonnummer.
 * - Corrigeert OCR fouten
 * - Converteert +31 naar 0 prefix
 * - Valideert lengte (10 cijfers)
 * @param {string} phoneRaw - Ruwe telefoon input
 * @returns {string|null} Gesanitized telefoon of null
 */
function sanitizePhone(phoneRaw) {
  if (!phoneRaw) return null;

  let phone = String(phoneRaw).trim();
  phone = phone.replace(/^O/g, '0').replace(/^0O/g, '00');
  phone = fixLettersToDigits(phone);
  phone = phone.replace(/[^\d+]/g, '');

  // Handle +31 landcode
  if (phone.startsWith('+31')) {
    phone = '0' + phone.substring(3);
  } else if (phone.startsWith('0031')) {
    phone = '0' + phone.substring(4);
  } else if (phone.startsWith('31') && phone.length >= 11) {
    phone = '0' + phone.substring(2);
  }

  // Waarschuwing voor service nummers
  if (phone.startsWith('085') || phone.startsWith('088') ||
      phone.startsWith('090') || phone.startsWith('091')) {
    console.warn(`Service number detected: ${phone}`);
  }

  if (phone.length !== 10) {
    console.warn(`Invalid phone length: ${phone.length} (expected 10)`);
    return null;
  }

  if (!phone.startsWith('0')) {
    console.warn(`Phone should start with 0: ${phone}`);
    return null;
  }

  return phone;
}

/**
 * Sanitize email adres.
 * - Verwijdert spaties, maakt lowercase
 * - Filtert bedrijfsemail
 * - Valideert email format
 * @param {string} emailRaw - Ruwe email input
 * @returns {string|null} Gesanitized email of null
 */
function sanitizeEmail(emailRaw) {
  if (!emailRaw) return null;

  let email = String(emailRaw).replace(/\s/g, '').toLowerCase().trim();
  email = email.replace(/[.,;]+$/, '');
  email = email.replace(/,/g, '.');

  // Filter bedrijfsemail
  if (email.includes('@samangroep') || email.includes('@saman')) {
    console.warn(`Company email filtered: ${email}`);
    return null;
  }

  const emailRegex = /^[a-z0-9._+-]+@[a-z0-9.-]+\.[a-z]{2,}$/;
  if (!emailRegex.test(email)) {
    console.warn(`Invalid email format: ${email}`);
    return null;
  }

  return email;
}

/**
 * Sanitize voorletters.
 * - Corrigeert OCR fouten (cijfers → letters)
 * - Normaliseert format naar "J.H.M."
 * @param {string} initialsRaw - Ruwe voorletters input
 * @returns {string|null} Gesanitized voorletters of null
 */
function sanitizeInitials(initialsRaw) {
  if (!initialsRaw) return null;

  let initials = String(initialsRaw).trim();
  initials = fixDigitsToLetters(initials);
  initials = initials.replace(/[^a-zA-Z.\s]/g, '');

  const letters = [];
  for (let char of initials) {
    if (/[a-zA-Z]/.test(char)) {
      letters.push(char.toUpperCase());
    }
  }

  if (letters.length > 10) {
    console.warn(`Unusual number of initials: ${letters.length}`);
    return letters.slice(0, 10).join('.') + '.';
  }

  return letters.length > 0 ? letters.join('.') + '.' : null;
}

/**
 * Sanitize achternaam.
 * - Corrigeert OCR fouten
 * - Capitaliseert correct met Nederlandse voorvoegsels
 * @param {string} lastNameRaw - Ruwe achternaam input
 * @returns {string|null} Gesanitized achternaam of null
 */
function sanitizeLastName(lastNameRaw) {
  if (!lastNameRaw) return null;

  let lastName = String(lastNameRaw).trim().replace(/\s+/g, ' ');
  const hadDigits = /\d/.test(lastName);
  lastName = fixDigitsToLetters(lastName);

  if (hadDigits) {
    console.log(`Last name had OCR errors, corrected: ${lastNameRaw} → ${lastName}`);
  }

  const parts = lastName.split(' ');
  const prefixes = ['van', 'de', 'der', 'den', 'het', "'t", 'te', 'ter', 'ten'];

  const normalized = parts.map((part, index) => {
    const lowerPart = part.toLowerCase();
    if (index > 0 && prefixes.includes(lowerPart)) {
      return lowerPart;
    }
    return part.charAt(0).toUpperCase() + part.slice(1).toLowerCase();
  });

  return normalized.join(' ');
}

/**
 * Sanitize straatnaam.
 * - Verwijdert huisnummer als het erbij zit
 * - Capitaliseert elk woord
 * @param {string} streetRaw - Ruwe straat input
 * @returns {string|null} Gesanitized straat of null
 */
function sanitizeStreet(streetRaw) {
  if (!streetRaw) return null;

  let street = String(streetRaw).trim().replace(/\s+/g, ' ');
  street = street.replace(/\s*\d+.*$/, '').trim();

  street = street.split(' ').map(word =>
    word.charAt(0).toUpperCase() + word.slice(1).toLowerCase()
  ).join(' ');

  if (street.length < 3) {
    console.warn(`Street name very short: ${street}`);
  }

  return street;
}

/**
 * Sanitize huisnummer en toevoeging.
 * - Split nummer en toevoeging
 * - Maakt toevoeging uppercase
 * @param {string} houseNumberRaw - Ruwe huisnummer input
 * @returns {Object} {number: string, addition: string|null}
 */
function sanitizeHouseNumber(houseNumberRaw) {
  if (!houseNumberRaw) return { number: null, addition: null };

  let combined = String(houseNumberRaw).trim();
  const match = combined.match(/^(\d+)(.*)$/);

  if (!match) {
    console.warn(`Could not parse house number: ${combined}`);
    return { number: combined, addition: null };
  }

  let number = match[1];
  let addition = match[2].trim().replace(/\s/g, '').toUpperCase();

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
 * - Corrigeert O/0 verwarring
 * - Valideert NL format (4 cijfers + 2 letters)
 * - Retourneert "1234 AB" met spatie
 * @param {string} postalCodeRaw - Ruwe postcode input
 * @returns {string|null} Gesanitized postcode of null
 */
function sanitizePostalCode(postalCodeRaw) {
  if (!postalCodeRaw) return null;

  let postal = String(postalCodeRaw).toUpperCase().trim();

  // Extract postcode uit volledig adres
  const postalMatch = postal.match(/(\d[A-Z0-9]{3})\s?([A-Z]{2})(?=\s|$)/);
  if (postalMatch) {
    postal = postalMatch[1] + postalMatch[2];
  }

  postal = postal.replace(/\s/g, '');

  // Fix OCR errors in digits (first 4 positions)
  if (postal.length >= 4) {
    let digits = fixLettersToDigits(postal.substring(0, 4));
    postal = digits + postal.substring(4);
  }

  // Fix OCR errors in letters (last 2 positions)
  if (postal.length >= 6) {
    let letters = fixDigitsToLetters(postal.substring(4, 6));
    postal = postal.substring(0, 4) + letters;
  }

  const postalRegex = /^(\d{4})([A-Z]{2})$/;
  const match = postal.match(postalRegex);

  if (!match) {
    console.warn(`Invalid postal code format: ${postal}`);
    return null;
  }

  return `${match[1]} ${match[2]}`;
}

/**
 * Sanitize plaatsnaam.
 * - Corrigeert OCR fouten
 * - Capitaliseert elk woord
 * @param {string} cityRaw - Ruwe plaatsnaam input
 * @returns {string|null} Gesanitized plaatsnaam of null
 */
function sanitizeCity(cityRaw) {
  if (!cityRaw) return null;

  let city = String(cityRaw).trim().replace(/\s+/g, ' ');
  const hadDigits = /\d/.test(city);
  city = fixDigitsToLetters(city);

  if (hadDigits) {
    console.log(`City name had OCR errors, corrected: ${cityRaw} → ${city}`);
  }

  const words = city.split(/(\s|-)/);
  const normalized = words.map((word, index) => {
    if (word === ' ' || word === '-' || word === "'") return word;
    if (index > 0 && ['aan', 'bij', 'op', 'onder'].includes(word.toLowerCase())) {
      return word.toLowerCase();
    }
    if (word.startsWith("'")) {
      return "'" + word.charAt(1).toUpperCase() + word.slice(2).toLowerCase();
    }
    return word.charAt(0).toUpperCase() + word.slice(1).toLowerCase();
  });

  return normalized.join('');
}

/**
 * Sanitize geslacht.
 * - Normaliseert naar "male" of "female"
 * @param {string} genderRaw - Ruwe geslacht input
 * @returns {string|null} "male", "female", of null
 */
function sanitizeGender(genderRaw) {
  if (!genderRaw) return null;

  const gender = String(genderRaw).toLowerCase().trim();

  if (gender === 'male' || gender === 'man' || gender === 'm' || gender === 'mannelijk') {
    return 'male';
  }

  if (gender === 'female' || gender === 'vrouw' || gender === 'v' || gender === 'woman' || gender === 'vrouwelijk') {
    return 'female';
  }

  console.warn(`Unknown gender value: ${genderRaw}`);
  return null;
}

/**
 * Sanitize aardgasgebruik.
 * - Normaliseert naar "yes" of "no"
 * @param {string} gasUsageRaw - Ruwe aardgas input
 * @returns {string|null} "yes", "no", of null
 */
function sanitizeGasUsage(gasUsageRaw) {
  if (!gasUsageRaw) return null;

  const gas = String(gasUsageRaw).toLowerCase().trim();

  if (gas === 'yes' || gas === 'ja' || gas === '1' || gas === 'true') {
    return 'yes';
  }

  if (gas === 'no' || gas === 'nee' || gas === '0' || gas === 'false') {
    return 'no';
  }

  console.warn(`Unknown gas usage value: ${gasUsageRaw}`);
  return null;
}

/**
 * Sanitize meldcode.
 * - Extraheert uit gecombineerde velden
 * - Corrigeert OCR fouten
 * - Valideert format: KA + 5 cijfers
 * @param {string} meldCodeRaw - Ruwe meldcode input
 * @returns {string|null} Gesanitized meldcode of null
 */
function sanitizeMeldCode(meldCodeRaw) {
  if (!meldCodeRaw) return null;

  let code = String(meldCodeRaw).trim().toUpperCase();

  // Extract meldcode uit gecombineerde input
  const meldCodeMatch = code.match(/K[A04O][A-Z0-9]{5}/i);
  if (meldCodeMatch) {
    code = meldCodeMatch[0];
  }

  code = code.replace(/[\s-]/g, '');

  // Fix prefix (should be "KA")
  if (code.length >= 2) {
    let prefix = code.substring(0, 2);
    if (prefix === 'K4' || prefix === 'K0' || prefix === 'KO') {
      prefix = 'KA';
    }
    code = prefix + code.substring(2);
  }

  // Fix digits (positions 2-6)
  if (code.length >= 7 && code.startsWith('KA')) {
    let digits = fixLettersToDigits(code.substring(2, 7));
    code = 'KA' + digits + code.substring(7);
  }

  const meldCodeRegex = /^KA(\d{5})$/;
  const match = code.match(meldCodeRegex);

  if (!match) {
    console.warn(`Invalid meldcode format: ${code}`);
    return null;
  }

  if (match[1] === '00000') {
    console.warn(`Suspicious meldcode (all zeros): ${code}`);
    return null;
  }

  return code;
}

/**
 * Sanitize datum (installatiedatum en aankoopdatum).
 * - Converteert naar DD-MM-YYYY
 * - Corrigeert OCR fouten
 * - Valideert datum geldigheid
 * @param {string} dateRaw - Ruwe datum input
 * @param {string} maxDate - Maximale datum (voor aankoop vs installatie check)
 * @returns {string|null} Datum in format DD-MM-YYYY of null
 */
function sanitizeDate(dateRaw, maxDate = null) {
  if (!dateRaw) return null;

  let date = String(dateRaw).trim();

  // Extract datum uit gecombineerde velden
  let datePatternMatch = date.match(/(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4})|(\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2})/);
  if (!datePatternMatch) {
    const corrected = fixLettersToDigits(dateRaw);
    datePatternMatch = corrected.match(/(\d{1,2}[-\/\.]\d{1,2}[-\/\.]\d{2,4})|(\d{4}[-\/\.]\d{1,2}[-\/\.]\d{1,2})/);
  }

  if (datePatternMatch) {
    date = datePatternMatch[0];
  }

  date = fixLettersToDigits(date);

  // Parse DD-MM-YYYY of DD/MM/YYYY of DD.MM.YYYY
  let day, month, year;
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
      console.warn(`Could not parse date: ${dateRaw}`);
      return null;
    }
  }

  // Valideer ranges
  const dayNum = parseInt(day);
  const monthNum = parseInt(month);
  const yearNum = parseInt(year);

  if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) {
    console.warn(`Invalid date values: ${day}-${month}-${year}`);
    return null;
  }

  // Valideer dat datum bestaat
  const testDate = new Date(yearNum, monthNum - 1, dayNum);
  if (testDate.getDate() !== dayNum || testDate.getMonth() !== monthNum - 1) {
    console.warn(`Invalid date: ${day}-${month}-${year}`);
    return null;
  }

  // Valideer jaar bereik
  if (yearNum < 2010 || yearNum > 2030) {
    console.warn(`Date out of range: ${year}`);
    return null;
  }

  // Check toekomstige datum
  const parsedDate = new Date(yearNum, monthNum - 1, dayNum);
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  if (parsedDate > today) {
    console.warn(`Date is in the future: ${day}-${month}-${year}`);
    return null;
  }

  // Valideer tegen max datum (bijv. aankoop <= installatie)
  if (maxDate) {
    const maxMatch = maxDate.match(/^(\d{2})-(\d{2})-(\d{4})$/);
    if (maxMatch) {
      const maxDateObj = new Date(parseInt(maxMatch[3]), parseInt(maxMatch[2]) - 1, parseInt(maxMatch[1]));
      if (parsedDate > maxDateObj) {
        console.warn(`Date exceeds max date: ${day}-${month}-${year} > ${maxDate}`);
        return null;
      }
    }
  }

  return `${day}-${month}-${year}`;
}

// Convenience aliases
const sanitizeInstallationDate = sanitizeDate;
const sanitizePurchaseDate = (dateRaw, installationDate) => sanitizeDate(dateRaw, installationDate);
