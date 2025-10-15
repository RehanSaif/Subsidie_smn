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
      if (extractedData.bic) {
        document.getElementById('bic').value = extractedData.bic;
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

      setTimeout(() => {
        statusDiv.style.display = 'none';
      }, 5000);
    } catch (error) {
      console.error('Extraction error:', error);
      console.error('Error stack:', error.stack);
      statusDiv.textContent = `❌ Fout: ${error.message}`;
      statusDiv.style.color = '#c92a2a';
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
      const meldcode = await extractMeldcodeFromFactuur(file);

      if (meldcode) {
        document.getElementById('meldCode').value = meldcode;
        console.log('✅ Meldcode extracted:', meldcode);

        if (statusDiv) {
          statusDiv.textContent = `✅ Meldcode gevonden: ${meldcode}`;
          statusDiv.style.color = '#2b8a3e';
          setTimeout(() => {
            statusDiv.style.display = 'none';
          }, 3000);
        }
      } else {
        if (statusDiv) {
          statusDiv.textContent = '⚠️ Geen meldcode gevonden in factuur';
          statusDiv.style.color = '#f59f00';
          setTimeout(() => {
            statusDiv.style.display = 'none';
          }, 3000);
        }
      }
    } catch (error) {
      console.error('Meldcode extraction error:', error);
      if (statusDiv) {
        statusDiv.textContent = `❌ Fout bij extraheren meldcode: ${error.message}`;
        statusDiv.style.color = '#c92a2a';
        setTimeout(() => {
          statusDiv.style.display = 'none';
        }, 5000);
      }
    }
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

// Extract meldcode from factuur using Mistral
async function extractMeldcodeFromFactuur(file) {
  console.log('=== Starting meldcode extraction with Mistral ===');
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
        const errorData = await response.json();
        throw new Error(`Mistral API error: ${errorData.error?.message || response.statusText}`);
      }

      const data = await response.json();
      textContent = data.choices[0].message.content;
    }

    console.log('Text extracted, searching for meldcode...');

    // Search for meldcode pattern in text
    const meldcodeMatch = textContent.match(/KA\d{5}/i);
    if (meldcodeMatch) {
      const meldcode = meldcodeMatch[0].toUpperCase();
      console.log('✅ Meldcode found in text:', meldcode);
      return meldcode;
    }

    // If no pattern found, use AI to find it
    console.log('No direct pattern found, asking AI...');

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
          content: `Find the meldcode in this invoice text. The meldcode typically starts with "KA" followed by 5 digits (e.g., KA06175).

Invoice text:
${textContent.substring(0, 2000)}

Return ONLY the meldcode or "null" if not found.`
        }],
        max_tokens: 20
      })
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Mistral API error: ${errorData.error?.message || response.statusText}`);
    }

    const data = await response.json();
    let content = data.choices[0].message.content.trim();
    console.log('AI response:', content);

    // Clean up response
    if (content === 'null' || content === 'NULL' || !content) {
      return null;
    }

    // Extract meldcode pattern from AI response
    const aiMatch = content.match(/KA\d{5}/i);
    if (aiMatch) {
      return aiMatch[0].toUpperCase();
    }

    return null;

  } catch (error) {
    console.error('Meldcode Extraction Error:', error);
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

    console.log('Extracted text from OCR:', extractedText.substring(0, 500));

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
- "BIC" - if present
- "Gebruikt u na installatie van deze warmtepomp nog aardgas voor ruimte verwarming?" - return "yes" for "Ja" or "no" for "nee"

Return ONLY valid JSON:

{
  "bsn": "BSN or null",
  "initials": "initials or null",
  "lastName": "last name or null",
  "gender": "male or female or null",
  "email": "email or null",
  "phone": "phone or null",
  "iban": "IBAN or null",
  "bic": "BIC or null",
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
      const errorData = await response.json();
      throw new Error(`Mistral API error: ${errorData.error?.message || response.statusText}`);
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
  document.getElementById('bic').value = '';
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

// Start automation
document.getElementById('startAutomation').addEventListener('click', () => {
  chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
    const currentTab = tabs[0];

    // Check if we're on the correct website
    if (!currentTab.url || !currentTab.url.includes('eloket.dienstuitvoering.nl')) {
      showStatus('Ga eerst naar https://eloket.dienstuitvoering.nl', 'error');
      return;
    }

    // DO NOT save documents - we'll pass them to automation but not persist them
    console.log('🚀 Starting automation - documents will NOT be saved for next session');

    // Get the full config including company details from storage
    chrome.storage.local.get(['isdeConfig'], (result) => {
      const config = {
        bsn: document.getElementById('bsn').value,
        initials: document.getElementById('initials').value,
        lastName: document.getElementById('lastName').value,
        gender: document.getElementById('gender').value,
        phone: document.getElementById('phone').value,
        email: document.getElementById('email').value,
        iban: document.getElementById('iban').value,
        bic: document.getElementById('bic').value,
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
      }, (response) => {
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

function loadSettings() {
  chrome.storage.local.get(['mistralApiKey', 'isdeConfig'], (result) => {
    // Load API key
    if (result.mistralApiKey) {
      document.getElementById('mistralApiKey').value = result.mistralApiKey;
    }

    // Load company details from config
    if (result.isdeConfig) {
      const config = result.isdeConfig;
      document.getElementById('settingsCompanyName').value = config.companyName || '';
      document.getElementById('settingsKvkNumber').value = config.kvkNumber || '';
    }
  });
}

function saveSettings() {
  const mistralApiKey = document.getElementById('mistralApiKey').value;
  const companyName = document.getElementById('settingsCompanyName').value;
  const kvkNumber = document.getElementById('settingsKvkNumber').value;

  // Save API key
  chrome.storage.local.set({ mistralApiKey: mistralApiKey });

  // Update company details in config
  chrome.storage.local.get(['isdeConfig'], (result) => {
    const config = result.isdeConfig || {};
    config.companyName = companyName;
    config.kvkNumber = kvkNumber;

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