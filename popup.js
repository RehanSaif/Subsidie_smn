// File handling
let betaalbewijsData = null;
let factuurData = null;
let machtigingsbewijsData = null;

// Machtigingsformulier OCR handler
document.getElementById('machtigingsformulier').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    const nameDiv = document.getElementById('machtigingName');
    nameDiv.textContent = `✓ ${file.name}`;
    nameDiv.style.display = 'inline-block';

    const statusDiv = document.getElementById('extractionStatus');
    statusDiv.textContent = '🔄 Gegevens worden geëxtraheerd...';
    statusDiv.style.display = 'block';
    statusDiv.style.color = '#FFC012';

    try {
      // Extract data from the form
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
        document.getElementById('houseNumber').value = extractedData.houseNumber;
        fieldsFound++;
      }

      if (fieldsFound > 0) {
        statusDiv.textContent = `✅ ${fieldsFound} veld(en) succesvol ingevuld!`;
        statusDiv.style.color = '#2b8a3e';
      } else {
        statusDiv.textContent = '⚠️ Geen gegevens gevonden. Controleer de console voor details.';
        statusDiv.style.color = '#f59f00';
      }

      // Auto-save after extraction
      autoSaveConfig();

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
  }
});

document.getElementById('machtigingsbewijsDoc').addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (file) {
    console.log('📎 Machtigingsbewijs uploaded (session only):', file.name);
    machtigingsbewijsData = await fileToBase64(file);
    const nameDiv = document.getElementById('machtigingsbewijsName');
    nameDiv.textContent = `✓ ${file.name}`;
    nameDiv.style.display = 'inline-block';
    console.log('✓ Machtigingsbewijs ready for automation (will be cleared after use)');
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

// Extract data from machtigingsformulier using Mistral Pixtral
async function extractDataFromForm(file) {
  console.log('=== Starting extraction with Mistral ===');
  console.log('File:', file.name, 'Type:', file.type, 'Size:', file.size);

  try {
    // Get API key
    const { mistralApiKey } = await chrome.storage.local.get(['mistralApiKey']);
    if (!mistralApiKey) {
      throw new Error('Geen Mistral API key ingesteld. Voer eerst je API key in.');
    }

    // Convert file to base64
    let base64Image;
    if (file.type === 'application/pdf') {
      console.log('Converting PDF to base64 image...');
      const statusDiv = document.getElementById('extractionStatus');
      statusDiv.textContent = '🔄 PDF converteren...';
      base64Image = await pdfToBase64Image(file);
    } else {
      console.log('Converting image to base64...');
      base64Image = await imageToBase64(file);
    }

    // Extract the base64 data (remove data:image/png;base64, prefix)
    const base64Data = base64Image.split(',')[1];

    console.log('Calling Mistral API...');
    const statusDiv = document.getElementById('extractionStatus');
    statusDiv.textContent = '🔄 Gegevens extraheren met AI...';

    const response = await fetch('https://api.mistral.ai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${mistralApiKey}`
      },
      body: JSON.stringify({
        model: 'pixtral-12b-2409',
        messages: [
          {
            role: 'user',
            content: [
              {
                type: 'text',
                text: `Extract the following information from this Dutch machtigingsformulier (authorization form). Return ONLY a valid JSON object with these exact keys, nothing else:

{
  "bsn": "9-digit BSN number if found, otherwise null",
  "initials": "initials (voorletters) if found, otherwise null",
  "lastName": "last name (achternaam) if found, otherwise null",
  "email": "email address if found, otherwise null",
  "phone": "phone number (telefoonnummer) if found, otherwise null",
  "iban": "IBAN if found, otherwise null",
  "bic": "BIC code if found, otherwise null",
  "street": "street name from address (adres) field if found, otherwise null",
  "postalCode": "postal code (postcode) if found, otherwise null",
  "city": "city/place name (plaats) if found, otherwise null",
  "houseNumber": "house number (huisnummer) from address if found, otherwise null"
}

Important: Return ONLY valid JSON, no markdown, no explanation, no additional text.`
              },
              {
                type: 'image_url',
                image_url: `data:image/png;base64,${base64Data}`
              }
            ]
          }
        ],
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

// Auto-save configuration on input change (DOCUMENTS ARE NOT SAVED)
function autoSaveConfig() {
  chrome.storage.local.get(['isdeConfig'], (result) => {
    const config = result.isdeConfig || {};

    config.bsn = document.getElementById('bsn').value;
    config.initials = document.getElementById('initials').value;
    config.lastName = document.getElementById('lastName').value;
    config.gender = document.getElementById('gender').value;
    config.phone = document.getElementById('phone').value;
    config.email = document.getElementById('email').value;
    config.iban = document.getElementById('iban').value;
    config.bic = document.getElementById('bic').value;
    config.street = document.getElementById('street').value;
    config.postalCode = document.getElementById('postalCode').value;
    config.city = document.getElementById('city').value;
    config.houseNumber = document.getElementById('houseNumber').value;
    config.houseAddition = document.getElementById('houseAddition').value;
    config.purchaseDate = document.getElementById('purchaseDate').value;
    config.installationDate = document.getElementById('installationDate').value;
    config.meldCode = document.getElementById('meldCode').value;

    // Documents are NOT saved - they must be uploaded fresh each time
    // config.betaalbewijs = betaalbewijsData;
    // config.factuur = factuurData;
    // config.machtigingsbewijs = machtigingsbewijsData;

    // Keep existing companyName and kvkNumber from settings
    chrome.storage.local.set({ isdeConfig: config });
  });
}

// Load configuration on startup
function loadConfiguration() {
  chrome.storage.local.get(['isdeConfig'], (result) => {
    // Load form config
    if (result.isdeConfig) {
      const config = result.isdeConfig;
      document.getElementById('bsn').value = config.bsn || '';
      document.getElementById('initials').value = config.initials || '';
      document.getElementById('lastName').value = config.lastName || '';
      document.getElementById('gender').value = config.gender || 'male';
      document.getElementById('phone').value = config.phone || '';
      document.getElementById('email').value = config.email || '';
      document.getElementById('iban').value = config.iban || '';
      document.getElementById('bic').value = config.bic || '';
      document.getElementById('street').value = config.street || '';
      document.getElementById('postalCode').value = config.postalCode || '';
      document.getElementById('city').value = config.city || '';
      document.getElementById('houseNumber').value = config.houseNumber || '';
      document.getElementById('houseAddition').value = config.houseAddition || '';
      document.getElementById('purchaseDate').value = config.purchaseDate || '';
      document.getElementById('installationDate').value = config.installationDate || '';
      document.getElementById('meldCode').value = config.meldCode || '';

      // Documents are NOT loaded from storage - they must be uploaded fresh each time
      // Reset document variables to null
      betaalbewijsData = null;
      factuurData = null;
      machtigingsbewijsData = null;
      console.log('🔄 Document variables reset - please upload documents fresh for each session');
    }
  });
}

// Add auto-save listeners to all inputs
document.querySelectorAll('input, select').forEach(element => {
  element.addEventListener('change', autoSaveConfig);
  element.addEventListener('blur', autoSaveConfig);
});

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