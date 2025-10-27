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
    const statusDiv = document.getElementById('extractionStatus');
    statusDiv.textContent = '🔄 Gegevens worden geëxtraheerd...';
    statusDiv.style.display = 'block';
    statusDiv.style.color = '#FFC012';

    try {
      // Voer OCR extractie uit op het machtigingsformulier
      const extractedData = await extractDataFromForm(file);

      console.log('Extracted data result:', extractedData);

      // Tel hoeveel velden succesvol zijn gevonden
      let fieldsFound = 0;

      // Vul BSN veld in
      if (extractedData.bsn) {
        document.getElementById('bsn').value = extractedData.bsn;
        fieldsFound++;
      }

      // Vul voorletters veld in
      if (extractedData.initials) {
        document.getElementById('initials').value = extractedData.initials;
        fieldsFound++;
      }

      // Vul achternaam veld in
      if (extractedData.lastName) {
        document.getElementById('lastName').value = extractedData.lastName;
        fieldsFound++;
      }

      // Vul geslacht veld in (male/female)
      if (extractedData.gender) {
        document.getElementById('gender').value = extractedData.gender;
        fieldsFound++;
      }

      // Vul telefoonnummer veld in
      if (extractedData.phone) {
        document.getElementById('phone').value = extractedData.phone;
        fieldsFound++;
      }

      // Vul e-mailadres veld in
      if (extractedData.email) {
        document.getElementById('email').value = extractedData.email;
        fieldsFound++;
      }

      // Vul IBAN bankrekeningnummer in
      if (extractedData.iban) {
        document.getElementById('iban').value = extractedData.iban;
        fieldsFound++;
      }

      // Vul straatnaam veld in
      if (extractedData.street) {
        document.getElementById('street').value = extractedData.street;
        fieldsFound++;
      }

      // Vul postcode veld in
      if (extractedData.postalCode) {
        document.getElementById('postalCode').value = extractedData.postalCode;
        fieldsFound++;
      }

      // Vul plaatsnaam veld in
      if (extractedData.city) {
        document.getElementById('city').value = extractedData.city;
        fieldsFound++;
      }

      // Splits huisnummer in nummer en toevoeging
      // Bijvoorbeeld: "59A01" wordt gesplitst in "59" en "A01"
      if (extractedData.houseNumber) {
        // Match: cijfers aan het begin (59) en alles daarna (A01)
        const houseNumberMatch = extractedData.houseNumber.match(/^(\d+)(.*)$/);
        if (houseNumberMatch) {
          const number = houseNumberMatch[1];
          const addition = houseNumberMatch[2];

          document.getElementById('houseNumber').value = number;
          if (addition) {
            document.getElementById('houseAddition').value = addition;
            fieldsFound++;
          }
          fieldsFound++;
        } else {
          // Als geen match, gebruik de hele waarde
          document.getElementById('houseNumber').value = extractedData.houseNumber;
          fieldsFound++;
        }
      }

      // Vul aardgasgebruik veld in (yes/no)
      if (extractedData.gasUsage) {
        document.getElementById('gasUsage').value = extractedData.gasUsage;
        fieldsFound++;
      }

      // Toon succesbericht met aantal gevonden velden
      if (fieldsFound > 0) {
        statusDiv.textContent = `✅ ${fieldsFound} veld(en) succesvol ingevuld!`;
        statusDiv.style.color = '#2b8a3e';
      } else {
        statusDiv.textContent = '⚠️ Geen gegevens gevonden. Controleer de console voor details.';
        statusDiv.style.color = '#f59f00';
      }

      // Update de status van de "Start Automatisering" knop
      updateStartButtonState();

      // Verberg status na 5 seconden
      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 5000);
    } catch (error) {
      // Behandel extractie fouten
      console.error('Extraction error:', error);
      console.error('Error stack:', error.stack);
      statusDiv.textContent = `❌ Fout: ${error.message}`;
      statusDiv.style.color = '#c92a2a';

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
    const statusDiv = document.getElementById('factuurExtractionStatus');
    if (statusDiv) {
      statusDiv.textContent = '🔄 Meldcode wordt geëxtraheerd uit factuur...';
      statusDiv.style.display = 'block';
      statusDiv.style.color = '#FFC012';
    }

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
        if (statusDiv) {
          statusDiv.textContent = `✅ Gevonden: ${fieldsFound.join(', ')}`;
          statusDiv.style.color = '#2b8a3e';
          setTimeout(() => {
            statusDiv.style.display = 'none';
          }, 3000);
        }
      } else {
        // Waarschuwing als geen gegevens gevonden
        if (statusDiv) {
          statusDiv.textContent = '⚠️ Geen meldcode of datum gevonden in factuur';
          statusDiv.style.color = '#f59f00';
          setTimeout(() => {
            statusDiv.style.display = 'none';
          }, 3000);
        }
      }

      // Update de status van de "Start Automatisering" knop
      updateStartButtonState();
    } catch (error) {
      // Behandel extractie fouten
      console.error('Factuur extraction error:', error);
      if (statusDiv) {
        statusDiv.textContent = `❌ Fout bij extraheren factuur: ${error.message}`;
        statusDiv.style.color = '#c92a2a';
        setTimeout(() => {
          statusDiv.style.display = 'none';
        }, 5000);
      }
      updateStartButtonState();
    }

    // Update knop status na factuur upload
    updateStartButtonState();
  }
});

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
                { type: 'text', text: 'Extract all text from this invoice image, including meldcode and dates.' },
                { type: 'image_url', image_url: `data:image/png;base64,${base64Data}` }
              ]
            }],
            max_tokens: 1000
          })
        });

        // Behandel API fouten
        if (!response.ok) {
          let errorMessage = response.statusText;
          try {
            const errorData = await response.json();
            errorMessage = errorData.error?.message || errorMessage;
          } catch (e) {
            // Kon error response niet parsen
          }

          // Speciale behandeling voor rate limit fouten
          if (response.status === 429) {
            throw new Error(`Mistral API rate limit bereikt. Wacht even (30-60 seconden) voordat je het opnieuw probeert.`);
          }

          throw new Error(`Mistral API error (${response.status}): ${errorMessage}`);
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
              { type: 'text', text: 'Extract all text from this image.' },
              { type: 'image_url', image_url: `data:image/png;base64,${base64Data}` }
            ]
          }],
          max_tokens: 1000
        })
      });

      // Behandel API fouten
      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
          // Kon error response niet parsen
        }

        // Speciale behandeling voor rate limit fouten
        if (response.status === 429) {
          throw new Error(`Mistral API rate limit bereikt. Wacht even (30-60 seconden) voordat je het opnieuw probeert.`);
        }

        throw new Error(`Mistral API error (${response.status}): ${errorMessage}`);
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
        let errorMessage = response.statusText;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
          // Kon error response niet parsen
        }

        // Speciale behandeling voor rate limit fouten
        if (response.status === 429) {
          throw new Error(`Mistral API rate limit bereikt. Wacht even (30-60 seconden) voordat je het opnieuw probeert.`);
        }

        throw new Error(`Mistral API error (${response.status}): ${errorMessage}`);
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

    const statusDiv = document.getElementById('extractionStatus');
    let textContent;

    // Gebruik Mistral Document AI OCR voor betere extractie
    console.log('Using Mistral Document AI OCR...');
    if (statusDiv) {
      statusDiv.textContent = '🔄 Document OCR met Mistral AI...';
    }

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

    if (statusDiv) {
      statusDiv.textContent = '🔄 Document wordt geanalyseerd...';
    }

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

    if (statusDiv) {
      statusDiv.textContent = '🔄 Gegevens extraheren met AI...';
    }

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
- "Achternaam en voorletters" or "Saif" - extract last name and initials
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
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        // Kon error response niet parsen
      }

      // Speciale behandeling voor rate limit fouten
      if (response.status === 429) {
        throw new Error(`Mistral API rate limit bereikt. Wacht even (30-60 seconden) voordat je het opnieuw probeert.`);
      }

      throw new Error(`Mistral API error (${response.status}): ${errorMessage}`);
    }

    const data = await response.json();
    console.log('Mistral API response:', data);

    let content = data.choices[0].message.content;
    console.log('Extracted content:', content);

    // Verwijder markdown code blocks indien aanwezig
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    console.log('Cleaned content:', content);

    // Parse JSON response naar object
    const extractedData = JSON.parse(content);

    // ========================================================================
    // REGEX FALLBACKS VOOR GEMISTE VELDEN
    // ========================================================================
    // Als AI bepaalde velden mist, proberen we ze te vinden met regex patronen
    console.log('🔍 Applying regex fallbacks for missing fields...');

    // BSN fallback: 9 cijfers, optioneel met spaties of streepjes
    if (!extractedData.bsn) {
      const bsnMatch = extractedText.match(/BSN[:\s]*(\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d[\s-]?\d)/i);
      if (bsnMatch) {
        extractedData.bsn = bsnMatch[1].replace(/[\s-]/g, ''); // Verwijder spaties en streepjes
        console.log('✅ BSN found via regex:', extractedData.bsn);
      }
    }

    // IBAN fallback: NL + 2 cijfers + 4 letters + 10 cijfers
    if (!extractedData.iban) {
      const ibanMatch = extractedText.match(/(?:IBAN[:\s]*)?([NL]{2}\s?[0-9]{2}\s?[A-Z]{4}\s?[0-9]{4}\s?[0-9]{4}\s?[0-9]{2})/i);
      if (ibanMatch) {
        extractedData.iban = ibanMatch[1].replace(/\s/g, '').replace(/\./g, '').toUpperCase(); // Verwijder spaties en punten
        console.log('✅ IBAN found via regex:', extractedData.iban);
      }
    }

    // Maak IBAN schoon als het door AI gevonden is maar spaties/punten bevat
    if (extractedData.iban) {
      extractedData.iban = extractedData.iban.replace(/\s/g, '').replace(/\./g, '').toUpperCase();
      console.log('✅ IBAN cleaned (removed spaces/dots):', extractedData.iban);
    }

    // Email fallback: standaard email patroon
    if (!extractedData.email) {
      // Sluit bedrijfs-emails uit zoals @samangroep
      const emailMatch = extractedText.match(/([a-z0-9._-]+@[a-z0-9._-]+\.[a-z]{2,6})/gi);
      if (emailMatch) {
        // Filter bedrijfs-emails eruit
        const personalEmail = emailMatch.find(email =>
          !email.toLowerCase().includes('@samangroep') &&
          !email.toLowerCase().includes('@saman')
        );
        if (personalEmail) {
          extractedData.email = personalEmail.toLowerCase();
          console.log('✅ Email found via regex:', extractedData.email);
        }
      }
    }

    // Telefoon fallback: Nederlandse telefoonpatronen
    if (!extractedData.phone) {
      const phoneMatch = extractedText.match(/(?:Telefoon|Tel)[:\s]*((?:06|0[0-9]{1,2})[\s-]?[0-9]{3,4}[\s-]?[0-9]{4})/i);
      if (phoneMatch) {
        extractedData.phone = phoneMatch[1].replace(/[\s-]/g, ''); // Verwijder spaties en streepjes
        console.log('✅ Phone found via regex:', extractedData.phone);
      }
    }

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

      if (statusDiv) {
        statusDiv.textContent = '🔄 Aardgas checkbox detecteren met Vision AI...';
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

    console.log('=== Final extracted data ===', extractedData);
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
  document.getElementById('bsn').value = '';
  document.getElementById('initials').value = '';
  document.getElementById('lastName').value = '';
  document.getElementById('gender').value = 'male';
  document.getElementById('phone').value = '';
  document.getElementById('email').value = '';
  document.getElementById('iban').value = '';
  document.getElementById('street').value = '';
  document.getElementById('postalCode').value = '';
  document.getElementById('city').value = '';
  document.getElementById('houseNumber').value = '';
  document.getElementById('houseAddition').value = '';
  document.getElementById('purchaseDate').value = '';
  document.getElementById('installationDate').value = '';
  document.getElementById('meldCode').value = '';
  document.getElementById('gasUsage').value = '';

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
  const requiredFields = [
    { id: 'bsn', label: 'BSN' },
    { id: 'initials', label: 'Voorletters' },
    { id: 'lastName', label: 'Achternaam' },
    { id: 'phone', label: 'Telefoonnummer' },
    { id: 'email', label: 'E-mailadres' },
    { id: 'iban', label: 'IBAN' },
    { id: 'street', label: 'Straatnaam' },
    { id: 'houseNumber', label: 'Huisnummer' },
    { id: 'postalCode', label: 'Postcode' },
    { id: 'city', label: 'Plaats' },
    { id: 'purchaseDate', label: 'Aankoopdatum' },
    { id: 'installationDate', label: 'Installatiedatum' },
    { id: 'meldCode', label: 'Meldcode' },
    { id: 'gasUsage', label: 'Aardgas gebruik' }
  ];

  const missingFields = [];

  // Controleer alle formuliervelden
  for (const field of requiredFields) {
    const value = document.getElementById(field.id).value.trim();
    if (!value) {
      missingFields.push(field.label);
    }
  }

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
  const inputFields = [
    'bsn', 'initials', 'lastName', 'phone', 'email', 'iban',
    'street', 'houseNumber', 'postalCode', 'city',
    'purchaseDate', 'installationDate', 'meldCode', 'gasUsage'
  ];

  inputFields.forEach(fieldId => {
    const field = document.getElementById(fieldId);
    if (field) {
      field.addEventListener('input', updateStartButtonState);
      field.addEventListener('change', updateStartButtonState);
    }
  });

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
