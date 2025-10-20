// File handling
let betaalbewijsData = null;
let factuurData = null;
let machtigingsbewijsData = null;

// Machtigingsformulier handler - doet zowel OCR als bestand opslaan
document.getElementById('machtigingsformulier').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    const nameDiv = document.getElementById('machtigingName');
    nameDiv.textContent = `✓ ${file.name}`;
    nameDiv.style.display = 'inline-block';

    // Sla het bestand op voor uploaden naar formulier
    machtigingsbewijsData = await fileToBase64(file);
    console.log('📎 Machtigingsformulier uploaded (session only):', file.name);

    const statusDiv = document.getElementById('extractionStatus');
    statusDiv.textContent = '🔄 Gegevens worden geëxtraheerd...';
    statusDiv.style.display = 'block';
    statusDiv.style.color = '#FFC012';

    try {
      // Extract data from the form via OCR
      const extractedData = await extractDataFromForm(file);

      console.log('Extracted data result:', extractedData);

      // Count how many fields were found
      let fieldsFound = 0;

      // Fill in the fields with extracted data
      if (extractedData.bsn) {
        document.getElementById('bsn').value = extractedData.bsn;
        fieldsFound++;
      }
      if (extractedData.initials) {
        document.getElementById('initials').value = extractedData.initials;
        fieldsFound++;
      }
      if (extractedData.lastName) {
        document.getElementById('lastName').value = extractedData.lastName;
        fieldsFound++;
      }
      if (extractedData.gender) {
        document.getElementById('gender').value = extractedData.gender;
        fieldsFound++;
      }
      if (extractedData.phone) {
        document.getElementById('phone').value = extractedData.phone;
        fieldsFound++;
      }
      if (extractedData.email) {
        document.getElementById('email').value = extractedData.email;
        fieldsFound++;
      }
      if (extractedData.iban) {
        document.getElementById('iban').value = extractedData.iban;
        fieldsFound++;
      }
      if (extractedData.street) {
        document.getElementById('street').value = extractedData.street;
        fieldsFound++;
      }
      if (extractedData.postalCode) {
        document.getElementById('postalCode').value = extractedData.postalCode;
        fieldsFound++;
      }
      if (extractedData.city) {
        document.getElementById('city').value = extractedData.city;
        fieldsFound++;
      }
      if (extractedData.houseNumber) {
        // Split house number into number and addition
        // Match: leading digits (59) and everything after (A01)
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
          // If no match, just use the whole value
          document.getElementById('houseNumber').value = extractedData.houseNumber;
          fieldsFound++;
        }
      }
      if (extractedData.gasUsage) {
        document.getElementById('gasUsage').value = extractedData.gasUsage;
        fieldsFound++;
      }

      if (fieldsFound > 0) {
        statusDiv.textContent = `✅ ${fieldsFound} veld(en) succesvol ingevuld!`;
        statusDiv.style.color = '#2b8a3e';
      } else {
        statusDiv.textContent = '⚠️ Geen gegevens gevonden. Controleer de console voor details.';
        statusDiv.style.color = '#f59f00';
      }

      // Update button state after extraction
      updateStartButtonState();

      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 5000);
    } catch (error) {
      console.error('Extraction error:', error);
      console.error('Error stack:', error.stack);
      statusDiv.textContent = `❌ Fout: ${error.message}`;
      statusDiv.style.color = '#c92a2a';

      // Update button state even on error
      updateStartButtonState();
    }
  }
});

document.getElementById('betaalbewijsDoc').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    console.log('📎 Betaalbewijs uploaded (session only):', file.name);
    betaalbewijsData = await fileToBase64(file);
    const nameDiv = document.getElementById('betaalbewijsName');
    nameDiv.textContent = `✓ ${file.name}`;
    nameDiv.style.display = 'inline-block';
    console.log('✓ Betaalbewijs ready for automation (will be cleared after use)');
    updateStartButtonState();
  }
});

document.getElementById('factuurDoc').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    console.log('📎 Factuur uploaded (session only):', file.name);
    factuurData = await fileToBase64(file);
    const nameDiv = document.getElementById('factuurName');
    nameDiv.textContent = `✓ ${file.name}`;
    nameDiv.style.display = 'inline-block';
    console.log('✓ Factuur ready for automation (will be cleared after use)');

    // Extract meldcode from factuur
    const statusDiv = document.getElementById('factuurExtractionStatus');
    if (statusDiv) {
      statusDiv.textContent = '🔄 Meldcode wordt geëxtraheerd uit factuur...';
      statusDiv.style.display = 'block';
      statusDiv.style.color = '#FFC012';
    }

    try {
      const { meldcode, installationDate } = await extractMeldcodeFromFactuur(file);

      let fieldsFound = [];

      if (meldcode) {
        document.getElementById('meldCode').value = meldcode;
        fieldsFound.push('Meldcode: ' + meldcode);
        console.log('✅ Meldcode extracted:', meldcode);
      }

      if (installationDate) {
        document.getElementById('installationDate').value = installationDate;
        fieldsFound.push('Installatiedatum: ' + installationDate);
        console.log('✅ Installation date extracted:', installationDate);
      }

      if (fieldsFound.length > 0) {
        if (statusDiv) {
          statusDiv.textContent = `✅ Gevonden: ${fieldsFound.join(', ')}`;
          statusDiv.style.color = '#2b8a3e';
          setTimeout(() => {
            statusDiv.style.display = 'none';
          }, 3000);
        }
      } else {
        if (statusDiv) {
          statusDiv.textContent = '⚠️ Geen meldcode of datum gevonden in factuur';
          statusDiv.style.color = '#f59f00';
          setTimeout(() => {
            statusDiv.style.display = 'none';
          }, 3000);
        }
      }

      // Update button state after extraction
      updateStartButtonState();
    } catch (error) {
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

    // Update button state when factuur is uploaded
    updateStartButtonState();
  }
});

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

// Convert PDF to image base64
async function pdfToBase64Image(file) {
  console.log('Starting PDF conversion, file type:', file.type);
  const arrayBuffer = await file.arrayBuffer();
  console.log('ArrayBuffer size:', arrayBuffer.byteLength);

  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  console.log('PDF loaded, pages:', pdf.numPages);

  const page = await pdf.getPage(1);
  console.log('Page loaded');

  const viewport = page.getViewport({ scale: 2.0 });
  console.log('Viewport:', viewport.width, 'x', viewport.height);

  const canvas = document.createElement('canvas');
  const context = canvas.getContext('2d');
  canvas.height = viewport.height;
  canvas.width = viewport.width;

  await page.render({
    canvasContext: context,
    viewport: viewport
  }).promise;

  console.log('PDF rendered to canvas successfully');

  // Convert canvas to base64
  const base64 = canvas.toDataURL('image/png');
  return base64;
}

// Convert image file to base64
async function imageToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// Extract text from PDF (optionally only first page for efficiency)
async function extractTextFromPDF(file, firstPageOnly = false) {
  console.log('Extracting text from PDF...');
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  console.log('Total pages in PDF:', pdf.numPages);

  let fullText = '';

  // Extract text from specified pages
  const maxPage = firstPageOnly ? 1 : pdf.numPages;
  console.log('Will extract from page(s):', maxPage);

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

// Extract meldcode and installation date from factuur using Mistral
async function extractMeldcodeFromFactuur(file) {
  console.log('=== Starting meldcode and date extraction with Mistral ===');
  console.log('File:', file.name, 'Type:', file.type, 'Size:', file.size);

  try {
    // Get API key
    const { mistralApiKey } = await chrome.storage.local.get(['mistralApiKey']);
    if (!mistralApiKey) {
      throw new Error('Geen Mistral API key ingesteld. Voer eerst je API key in via instellingen.');
    }

    let textContent;

    // Extract text based on file type
    if (file.type === 'application/pdf') {
      console.log('Extracting text from PDF...');
      textContent = await extractTextFromPDF(file);

      // Check if PDF has no text (scanned PDF)
      if (!textContent || textContent.trim().length < 10) {
        console.log('⚠️ PDF has no extractable text, using Vision AI OCR...');
        // Convert PDF to image and use OCR
        const pdfImage = await pdfToBase64Image(file);
        const base64Data = pdfImage.split(',')[1];

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

        if (!response.ok) {
          let errorMessage = response.statusText;
          try {
            const errorData = await response.json();
            errorMessage = errorData.error?.message || errorMessage;
          } catch (e) {
            // Could not parse error response
          }

          // Special handling for rate limit errors
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
      // For images, use OCR via vision model
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

      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
          // Could not parse error response
        }

        // Special handling for rate limit errors
        if (response.status === 429) {
          throw new Error(`Mistral API rate limit bereikt. Wacht even (30-60 seconden) voordat je het opnieuw probeert.`);
        }

        throw new Error(`Mistral API error (${response.status}): ${errorMessage}`);
      }

      const data = await response.json();
      textContent = data.choices[0].message.content;
    }

    console.log('Text extracted, searching for meldcode and installation date...');

    // Search for meldcode pattern in text
    const meldcodeMatch = textContent.match(/KA\d{5}/i);
    let meldcode = null;
    let installationDate = null;

    if (meldcodeMatch) {
      meldcode = meldcodeMatch[0].toUpperCase();
      console.log('✅ Meldcode found in text:', meldcode);
    }

    // Search for installation date pattern (DD-MM-YYYY or DD/MM/YYYY or similar)
    const datePatterns = [
      /(\d{1,2}[-\/]\d{1,2}[-\/]\d{4})/,  // DD-MM-YYYY or DD/MM/YYYY
      /(\d{4}[-\/]\d{1,2}[-\/]\d{1,2})/   // YYYY-MM-DD or YYYY/MM/DD
    ];

    for (const pattern of datePatterns) {
      const dateMatch = textContent.match(pattern);
      if (dateMatch) {
        installationDate = dateMatch[1];
        // Convert to DD-MM-YYYY format if needed
        if (installationDate.match(/\d{4}[-\/]\d{1,2}[-\/]\d{1,2}/)) {
          const parts = installationDate.split(/[-\/]/);
          installationDate = `${parts[2].padStart(2, '0')}-${parts[1].padStart(2, '0')}-${parts[0]}`;
        }
        // Normalize separator to dash
        installationDate = installationDate.replace(/\//g, '-');
        console.log('✅ Installation date found in text:', installationDate);
        break;
      }
    }

    // If not all data found, use AI to extract it
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

      if (!response.ok) {
        let errorMessage = response.statusText;
        try {
          const errorData = await response.json();
          errorMessage = errorData.error?.message || errorMessage;
        } catch (e) {
          // Could not parse error response
        }

        // Special handling for rate limit errors
        if (response.status === 429) {
          throw new Error(`Mistral API rate limit bereikt. Wacht even (30-60 seconden) voordat je het opnieuw probeert.`);
        }

        throw new Error(`Mistral API error (${response.status}): ${errorMessage}`);
      }

      const data = await response.json();
      let content = data.choices[0].message.content.trim();
      console.log('AI response:', content);

      // Remove markdown code blocks if present
      content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();

      try {
        const extracted = JSON.parse(content);

        if (!meldcode && extracted.meldcode && extracted.meldcode !== 'null') {
          meldcode = extracted.meldcode.toUpperCase();
          console.log('✅ Meldcode extracted by AI:', meldcode);
        }

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

// Extract data from machtigingsformulier using Mistral
async function extractDataFromForm(file) {
  console.log('=== Starting extraction with Mistral ===');
  console.log('File:', file.name, 'Type:', file.type, 'Size:', file.size);

  try {
    // Get API key
    const { mistralApiKey } = await chrome.storage.local.get(['mistralApiKey']);
    if (!mistralApiKey) {
      throw new Error('Geen Mistral API key ingesteld. Voer eerst je API key in via instellingen.');
    }

    const statusDiv = document.getElementById('extractionStatus');
    let textContent;

    // Use Mistral Document AI OCR for better extraction
    console.log('Using Mistral Document AI OCR...');
    if (statusDiv) {
      statusDiv.textContent = '🔄 Document OCR met Mistral AI...';
    }

    // Convert file to base64 for OCR API
    let base64Document;
    if (file.type === 'application/pdf') {
      const arrayBuffer = await file.arrayBuffer();
      const bytes = new Uint8Array(arrayBuffer);
      const binary = bytes.reduce((acc, byte) => acc + String.fromCharCode(byte), '');
      base64Document = `data:application/pdf;base64,${btoa(binary)}`;
    } else {
      // For images, convert to base64
      base64Document = await imageToBase64(file);
    }

    if (statusDiv) {
      statusDiv.textContent = '🔄 Document wordt geanalyseerd...';
    }

    // Step 1: Extract text using Mistral OCR
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

    if (!ocrResponse.ok) {
      const errorData = await ocrResponse.json();
      throw new Error(`Mistral OCR error: ${errorData.error?.message || ocrResponse.statusText}`);
    }

    const ocrData = await ocrResponse.json();
    console.log('OCR response:', ocrData);

    // Extract text from OCR response
    let extractedText = '';
    if (ocrData.pages && ocrData.pages.length > 0) {
      // Only use first page
      extractedText = ocrData.pages[0].markdown || '';
    }

    console.log('Extracted text from OCR (first 500 chars):', extractedText.substring(0, 500));
    console.log('=== FULL OCR TEXT FOR DEBUGGING ===');
    console.log(extractedText);
    console.log('=== END FULL OCR TEXT ===');

    if (statusDiv) {
      statusDiv.textContent = '🔄 Gegevens extraheren met AI...';
    }

    // Step 2: Use text model to extract structured data
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
- "IBAN" - starts with NL

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

    if (!response.ok) {
      let errorMessage = response.statusText;
      try {
        const errorData = await response.json();
        errorMessage = errorData.error?.message || errorMessage;
      } catch (e) {
        // Could not parse error response
      }

      // Special handling for rate limit errors
      if (response.status === 429) {
        throw new Error(`Mistral API rate limit bereikt. Wacht even (30-60 seconden) voordat je het opnieuw probeert.`);
      }

      throw new Error(`Mistral API error (${response.status}): ${errorMessage}`);
    }

    const data = await response.json();
    console.log('Mistral API response:', data);

    let content = data.choices[0].message.content;
    console.log('Extracted content:', content);

    // Remove markdown code blocks if present
    content = content.replace(/```json\s*/g, '').replace(/```\s*/g, '').trim();
    console.log('Cleaned content:', content);

    // Parse the JSON response
    const extractedData = JSON.parse(content);

    // Extra validation: Use Vision AI to detect checked checkbox for gas usage
    if (!extractedData.gasUsage || extractedData.gasUsage === 'null') {
      console.log('Gas usage not found by AI, using Vision AI to detect checkbox...');

      if (statusDiv) {
        statusDiv.textContent = '🔄 Aardgas checkbox detecteren met Vision AI...';
      }

      // Convert document to image for vision analysis
      let visionBase64;
      if (file.type === 'application/pdf') {
        console.log('Converting PDF to image for vision analysis...');
        // Use lower quality JPEG for Vision AI to reduce size
        const arrayBuffer = await file.arrayBuffer();
        const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
        const page = await pdf.getPage(1);
        const viewport = page.getViewport({ scale: 1.2 }); // Lower scale for smaller image

        const canvas = document.createElement('canvas');
        const context = canvas.getContext('2d');
        canvas.height = viewport.height;
        canvas.width = viewport.width;

        await page.render({
          canvasContext: context,
          viewport: viewport
        }).promise;

        // Convert to JPEG with compression for smaller size
        visionBase64 = canvas.toDataURL('image/jpeg', 0.8);
        console.log('PDF converted to JPEG for Vision AI, size:', visionBase64.length, 'chars');
      } else {
        visionBase64 = base64Document;
      }

      const visionData = visionBase64.split(',')[1];

      try {
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

          // Check if Vision AI is uncertain
          const isUncertain = visionAnswer.includes('unknown') ||
                            visionAnswer.includes('cannot determine') ||
                            visionAnswer.includes('not provide a clear') ||
                            visionAnswer.includes('unclear') ||
                            visionAnswer.includes('not sure');

          if (isUncertain) {
            console.log('⚠️ Vision AI is uncertain about gas usage, skipping...');
            // Don't set gasUsage, leave it null to be filled manually
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

        // Fallback to text-based detection
        const gasQuestionRegex = /gebruikt.*warmtepomp.*aardgas.*ruimte.*verwarming/i;
        if (gasQuestionRegex.test(extractedText)) {
          console.log('✅ Gas usage question found in text');

          // Log the area around the question for debugging
          const questionMatch = extractedText.match(/(gebruikt.*warmtepomp.*aardgas.*ruimte.*verwarming.{0,100})/i);
          if (questionMatch) {
            console.log('Question context:', questionMatch[1]);
          }

          // Try to find Ja or Nee within 100 characters after the question
          const gasAnswerMatch = extractedText.match(/gebruikt.*warmtepomp.*aardgas.*ruimte.*verwarming.{0,100}(ja|nee)/i);
          if (gasAnswerMatch) {
            const answer = gasAnswerMatch[1].toLowerCase();
            extractedData.gasUsage = answer === 'ja' ? 'yes' : 'no';
            console.log('✅ Gas usage answer found via regex fallback:', extractedData.gasUsage);
          }
        }
      }
    }

    // Convert null values to undefined
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

// Load configuration on startup
function loadConfiguration() {
  // Reset all form fields to empty on startup
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

  // Reset document variables to null
  betaalbewijsData = null;
  factuurData = null;
  machtigingsbewijsData = null;

  console.log('🔄 Plugin gestart met lege velden - upload documenten om gegevens automatisch in te vullen');
}

// Auto-save is disabled - form data is not persisted between sessions

// Validate all required fields
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

  for (const field of requiredFields) {
    const value = document.getElementById(field.id).value.trim();
    if (!value) {
      missingFields.push(field.label);
    }
  }

  // Check documents
  if (!betaalbewijsData) {
    missingFields.push('Betaalbewijs');
  }
  if (!factuurData) {
    missingFields.push('Factuur');
  }

  return missingFields;
}

// Update button state based on validation
function updateStartButtonState() {
  const startButton = document.getElementById('startAutomation');
  const missingFields = validateRequiredFields();

  if (missingFields.length > 0) {
    startButton.disabled = true;
    startButton.style.opacity = '0.5';
    startButton.style.cursor = 'not-allowed';
  } else {
    startButton.disabled = false;
    startButton.style.opacity = '1';
    startButton.style.cursor = 'pointer';
  }
}

// Add event listeners to all input fields to update button state
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

  // Initial button state check
  updateStartButtonState();
});

// Start automation
document.getElementById('startAutomation').addEventListener('click', () => {
  // Validate all required fields
  const missingFields = validateRequiredFields();

  if (missingFields.length > 0) {
    showStatus(`Vul eerst alle verplichte velden in: ${missingFields.join(', ')}`, 'error');
    return;
  }

  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    const currentTab = tabs[0];

    // Check if we're on the correct website
    if (!currentTab.url || !currentTab.url.includes('eloket.dienstuitvoering.nl')) {
      showStatus('Ga eerst naar https://eloket.dienstuitvoering.nl', 'error');
      return;
    }

    // DO NOT save documents - we'll pass them to automation but not persist them
    console.log('🚀 Starting automation - documents will NOT be saved for next session');

    // Get the full config including company details and contact person from storage
    chrome.storage.local.get(['isdeConfig'], (result) => {
      const config = {
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
        companyName: result.isdeConfig?.companyName || '',
        kvkNumber: result.isdeConfig?.kvkNumber || '',
        // Use default values if not saved in settings
        contactInitials: result.isdeConfig?.contactInitials || 'A',
        contactLastName: result.isdeConfig?.contactLastName || 'de Vlieger',
        contactGender: result.isdeConfig?.contactGender || 'female',
        contactPhone: result.isdeConfig?.contactPhone || '0682795068',
        contactEmail: result.isdeConfig?.contactEmail || 'administratie@saman.nl',
        betaalbewijs: betaalbewijsData,
        factuur: factuurData,
        machtigingsbewijs: machtigingsbewijsData
      };

      // Log documents being sent
      console.log('🚀 Starting automation with documents:');
      console.log('  - Betaalbewijs:', config.betaalbewijs ? config.betaalbewijs.name : 'Not uploaded');
      console.log('  - Factuur:', config.factuur ? config.factuur.name : 'Not uploaded');
      console.log('  - Machtigingsbewijs:', config.machtigingsbewijs ? config.machtigingsbewijs.name : 'Not uploaded');

      // Send message to background script to start automation
      chrome.runtime.sendMessage({
        action: 'startAutomationFromPopup',
        config: config
      }, () => {
        showStatus('Automatisering gestart. Het formulier wordt stap voor stap ingevuld.', 'info');
        // Close popup after a short delay so user sees the message
        setTimeout(() => {
          window.close();
        }, 2000);
      });
    });
  });
});

function showStatus(message, type) {
  const statusDiv = document.getElementById('status');
  statusDiv.textContent = message;
  statusDiv.className = 'status ' + type;
  setTimeout(() => {
    statusDiv.className = 'status';
  }, 3000);
}

// View navigation
function showView(viewId) {
  // Hide all views
  document.querySelectorAll('.view').forEach(view => {
    view.classList.remove('active');
  });

  // Show selected view
  document.getElementById(viewId).classList.add('active');

  // Show/hide back button
  const backBtn = document.getElementById('backBtn');
  if (viewId === 'settingsView') {
    backBtn.classList.add('visible');
  } else {
    backBtn.classList.remove('visible');
  }
}

// Settings button handler
document.getElementById('settingsBtn').addEventListener('click', () => {
  loadSettings();
  showView('settingsView');
});

// Back button handler
document.getElementById('backBtn').addEventListener('click', () => {
  showView('mainView');
});

// Save settings button handler
document.getElementById('saveSettingsBtn').addEventListener('click', () => {
  saveSettings();
});

// Auto-save settings on blur
document.getElementById('mistralApiKey').addEventListener('blur', saveSettings);
document.getElementById('settingsCompanyName').addEventListener('blur', saveSettings);
document.getElementById('settingsKvkNumber').addEventListener('blur', saveSettings);
document.getElementById('settingsContactInitials').addEventListener('blur', saveSettings);
document.getElementById('settingsContactLastName').addEventListener('blur', saveSettings);
document.getElementById('settingsContactGender').addEventListener('change', saveSettings);
document.getElementById('settingsContactPhone').addEventListener('blur', saveSettings);
document.getElementById('settingsContactEmail').addEventListener('blur', saveSettings);

function loadSettings() {
  chrome.storage.local.get(['mistralApiKey', 'isdeConfig'], (result) => {
    // Load API key
    if (result.mistralApiKey) {
      document.getElementById('mistralApiKey').value = result.mistralApiKey;
    }

    // Load company details from config with defaults for contact person
    const config = result.isdeConfig || {};

    // Company details
    document.getElementById('settingsCompanyName').value = config.companyName || '';
    document.getElementById('settingsKvkNumber').value = config.kvkNumber || '';

    // Load contact person details with default values
    document.getElementById('settingsContactInitials').value = config.contactInitials || 'A';
    document.getElementById('settingsContactLastName').value = config.contactLastName || 'de Vlieger';
    document.getElementById('settingsContactGender').value = config.contactGender || 'female';
    document.getElementById('settingsContactPhone').value = config.contactPhone || '0682795068';
    document.getElementById('settingsContactEmail').value = config.contactEmail || 'administratie@saman.nl';
  });
}

function saveSettings() {
  const mistralApiKey = document.getElementById('mistralApiKey').value;
  const companyName = document.getElementById('settingsCompanyName').value;
  const kvkNumber = document.getElementById('settingsKvkNumber').value;
  const contactInitials = document.getElementById('settingsContactInitials').value;
  const contactLastName = document.getElementById('settingsContactLastName').value;
  const contactGender = document.getElementById('settingsContactGender').value;
  const contactPhone = document.getElementById('settingsContactPhone').value;
  const contactEmail = document.getElementById('settingsContactEmail').value;

  // Save API key
  chrome.storage.local.set({ mistralApiKey: mistralApiKey });

  // Update company details and contact person in config
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

// Load saved config on popup open
window.addEventListener('DOMContentLoaded', () => {
  loadConfiguration();
});