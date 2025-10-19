// Global flag to track if automation has been stopped
let automationStopped = false;

// Create status panel functions
function createStatusPanel() {
  // Remove existing panel if present
  const existingPanel = document.getElementById('isde-automation-panel');
  if (existingPanel) {
    existingPanel.remove();
  }

  const panel = document.createElement('div');
  panel.id = 'isde-automation-panel';
  panel.innerHTML = `
    <div style="position: fixed; top: 20px; right: 20px; width: 320px; background: white; border: 2px solid #4CAF50; border-radius: 8px; padding: 15px; box-shadow: 0 4px 6px rgba(0,0,0,0.1); z-index: 999999; font-family: Arial, sans-serif;">
      <h3 style="margin: 0 0 10px 0; color: #333; font-size: 16px;">🤖 ISDE Automatisering</h3>
      <div id="automation-status" style="color: #666; margin-bottom: 8px; font-size: 13px;">Bezig met opstarten...</div>
      <div id="current-step" style="color: #4CAF50; font-weight: bold; margin-bottom: 8px; font-size: 14px; padding: 8px; background: #f0f9f0; border-radius: 4px;"></div>
      <div id="detected-step" style="color: #999; margin-bottom: 10px; font-size: 11px;"></div>
      <div style="display: flex; gap: 5px; flex-wrap: wrap;">
        <button id="continue-automation" style="background: #FFC012; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; flex: 1;">Doorgaan</button>
        <button id="stop-automation" style="background: #dc3545; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; font-weight: 600; flex: 1;">Stop</button>
        <button id="close-panel" style="background: #666; color: white; border: none; padding: 8px 12px; border-radius: 4px; cursor: pointer; font-size: 12px; width: 100%;">Verbergen</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  document.getElementById('close-panel').addEventListener('click', () => {
    panel.style.display = 'none';
  });

  document.getElementById('continue-automation').addEventListener('click', () => {
    const config = JSON.parse(sessionStorage.getItem('automationConfig') || '{}');
    console.log('🔄 Manual continue clicked, resuming automation');

    // Check if modal is open and force step to meldcode_lookup_opened
    const modalOpen = Array.from(document.querySelectorAll('*')).some(el =>
      el.textContent && el.textContent.includes('Selecteer hier uw keuze')
    );

    if (modalOpen) {
      console.log('✅ Meldcode modal detected, setting step to meldcode_lookup_opened');
      sessionStorage.setItem('automationStep', 'meldcode_lookup_opened');
    }

    updateStatus('Resuming automation...', 'Continuing');
    startFullAutomation(config);
  });

  document.getElementById('stop-automation').addEventListener('click', () => {
    console.log('Stop automation clicked');
    // Set global flag to stop automation
    automationStopped = true;
    // Clear all automation state
    sessionStorage.removeItem('automationConfig');
    sessionStorage.removeItem('automationStep');
    sessionStorage.removeItem('lastNieuweAanvraagClick');
    // Remove the panel completely
    panel.remove();
    console.log('Automation stopped and panel removed');
  });
}

function updateStatus(message, step, detectedStep) {
  const statusDiv = document.getElementById('automation-status');
  const stepDiv = document.getElementById('current-step');
  const detectedDiv = document.getElementById('detected-step');

  if (statusDiv) statusDiv.textContent = message;
  if (stepDiv) stepDiv.textContent = `Step: ${step || ''}`;
  if (detectedDiv && detectedStep) {
    detectedDiv.textContent = `Detected: ${detectedStep}`;
  }
}

// Listen for messages from popup or background
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startAutomation') {
    console.log('Starting automation with config:', request.config);
    // Reset stop flag when starting new automation
    automationStopped = false;
    // Clear any existing automation state
    sessionStorage.removeItem('automationStep');
    sessionStorage.removeItem('automationConfig');
    console.log('Cleared automation state, starting fresh');
    createStatusPanel();
    updateStatus('Automation started', 'Initializing');
    startFullAutomation(request.config);
    sendResponse({status: 'started'});
    return false;
  } else if (request.action === 'fillCurrentPage') {
    fillCurrentPage(request.config);
    sendResponse({status: 'success', message: 'Current page filled!'});
  }
});

// Helper function to wait for element
function waitForElement(selector, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkElement = () => {
      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`Element ${selector} not found within timeout`));
      } else {
        setTimeout(checkElement, 100);
      }
    };

    checkElement();
  });
}

// Helper function to wait for element by text content
function waitForElementByText(searchText, timeout = 10000) {
  return new Promise((resolve, reject) => {
    const startTime = Date.now();

    const checkElement = () => {
      const links = document.querySelectorAll('a');
      for (let link of links) {
        if (link.textContent.includes(searchText) || link.innerText.includes(searchText)) {
          resolve(link);
          return;
        }
      }

      if (Date.now() - startTime > timeout) {
        reject(new Error(`Element containing "${searchText}" not found within timeout`));
      } else {
        setTimeout(checkElement, 100);
      }
    };

    checkElement();
  });
}

// Helper function to click element
async function clickElement(selectorOrElement) {
  let element;
  if (typeof selectorOrElement === 'string') {
    element = await waitForElement(selectorOrElement);
  } else {
    element = selectorOrElement;
  }
  element.scrollIntoView({behavior: 'smooth', block: 'center'});
  await new Promise(r => setTimeout(r, 500));
  element.click();
  await new Promise(r => setTimeout(r, 1000));
}

// Helper function to fill input - paste entire value instantly
async function fillInput(selector, value) {
  if (!value) return;
  const element = await waitForElement(selector);
  element.scrollIntoView({behavior: 'smooth', block: 'center'});
  await new Promise(r => setTimeout(r, 400 + Math.random() * 200)); // Wait before interacting

  // Focus the field first
  element.focus();
  await new Promise(r => setTimeout(r, 250 + Math.random() * 150));

  // Clear existing value first
  element.value = '';
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await new Promise(r => setTimeout(r, 150 + Math.random() * 100));

  // Paste the entire value
  element.value = value;
  element.dispatchEvent(new Event('input', { bubbles: true }));

  await new Promise(r => setTimeout(r, 200 + Math.random() * 150));

  element.dispatchEvent(new Event('change', { bubbles: true }));

  await new Promise(r => setTimeout(r, 150 + Math.random() * 100));

  element.blur();
  await new Promise(r => setTimeout(r, 300 + Math.random() * 200)); // Wait after to let validation complete
}

// Helper function to upload a file
async function uploadFile(fileData) {
  if (!fileData) return;

  try {
    // Find the file input element (it's inside the modal)
    const fileInput = await waitForElement('#lip_modalWindow div.content input[type="file"], #lip_attachments_resumable input[type="file"]', 5000);

    // Convert base64 data to Blob
    const response = await fetch(fileData.data);
    const blob = await response.blob();

    // Create a File object from the Blob
    const file = new File([blob], fileData.name, { type: fileData.type });

    // Create DataTransfer to simulate file selection
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    // Trigger change event to notify the form
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    console.log('File uploaded successfully:', fileData.name);
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

// Fill current page based on detected fields
function fillCurrentPage(config) {
  // Implementation remains the same as before
  const fields = [
    ['#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edBSNnummer', config.bsn],
    ['#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edVoorletters2', config.initials],
    ['#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edAchternaam2', config.lastName],
    ['#link_aanv\\.0\\.link_aanv_persoon\\.0\\.link_aanv_persoon_telefoon\\.0\\.edTelefoonField3', config.phone],
    ['#link_aanv\\.0\\.link_aanv_persoon\\.0\\.link_aanv_persoon_email\\.0\\.edEmailField3', config.email],
    ['#link_aanv\\.0\\.edIBAN', config.iban],
    ['#link_aanv\\.0\\.link_aanv_adres_vst\\.0\\.edPostcode', config.postalCode],
    ['#link_aanv\\.0\\.link_aanv_adres_vst\\.0\\.edHuisnummer2', config.houseNumber],
    ['#link_aanv\\.0\\.link_aanv_adres_vst\\.0\\.edToevoeging2', config.houseAddition],
    ['#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.InstallBedrijf_Naam', config.companyName],
    ['#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.InstallBedrijf_KvK', config.kvkNumber]
  ];
  
  fields.forEach(([selector, value]) => {
    const field = document.querySelector(selector);
    if (field && value) {
      field.value = value;
      field.dispatchEvent(new Event('change', { bubbles: true }));
    }
  });
}

// Detect current page/step by looking at DOM elements
// This is the PRIMARY way to determine where we are - more reliable than sessionStorage
function detectCurrentStep() {
  // Check from most specific to least specific to avoid false matches

  // Step 20: Final terms (must have both checkbox AND submit button)
  if (document.querySelector('#cbAccoord') && document.querySelector('input[value="Indienen"]')) {
    console.log('🎯 Detected: final_confirmed - Terms page with submit button');
    return 'final_confirmed';
  }

  // Step 19.5: Final review page (Verzenden tab - "Controleer uw gegevens")
  const hasControleerGegevens = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && el.textContent.includes('Controleer uw gegevens')
  );
  const hasPersoonsgegevens = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && el.textContent.includes('Persoonsgegevens')
  );
  const hasVerzendenTab = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && el.textContent.trim() === 'Verzenden'
  );

  if (hasControleerGegevens && hasPersoonsgegevens && hasVerzendenTab) {
    console.log('🎯 Detected: final_review_page - Final review page (Verzenden tab)');
    return 'final_review_page';
  }

  // Step 19: Final confirmation question
  if (document.querySelector('#QuestionEmbedding_585_default')) {
    console.log('🎯 Detected: final_confirmation - Final confirmation question');
    return 'final_confirmation';
  }

  // Step 18.4: "Vervolgstap" modal after file upload
  const hasVervolgstapModal = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && (
      el.textContent.includes('Vervolgstap') ||
      el.textContent.includes('U heeft deze maatregel volledig ingevuld')
    )
  );
  const hasKiezenButton = Array.from(document.querySelectorAll('input, button')).some(btn =>
    (btn.value && btn.value.includes('Kiezen')) ||
    (btn.textContent && btn.textContent.includes('Kiezen'))
  );

  if (hasVervolgstapModal && hasKiezenButton) {
    console.log('🎯 Detected: vervolgstap_modal - Follow-up step modal after file upload');
    return 'vervolgstap_modal';
  }

  // Step 18.6: "Zijn alle maatregelen toegevoegd?" confirmation dialog
  const hasMaatregelenDialog = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && el.textContent.includes('Zijn alle maatregelen toegevoegd')
  );
  const hasJaVolgendeButton = Array.from(document.querySelectorAll('input, button')).some(btn =>
    (btn.value && btn.value.includes('Ja, volgende')) ||
    (btn.textContent && btn.textContent.includes('Ja, volgende'))
  );

  if (hasMaatregelenDialog && hasJaVolgendeButton) {
    console.log('🎯 Detected: measure_confirmation_dialog - Maatregelen confirmation dialog');
    return 'measure_confirmation_dialog';
  }

  // Step 18.7: Final measure overview with subsidy amount
  const hasVoorlopigSubsidiebedrag = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && el.textContent.includes('Voorlopig subsidiebedrag')
  );
  const hasAangevraagdeMaatregelen = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && el.textContent.includes('Aangevraagde maatregelen')
  );

  if ((hasVoorlopigSubsidiebedrag || hasAangevraagdeMaatregelen) && document.querySelector('#btnVolgendeTab')) {
    console.log('🎯 Detected: final_measure_overview - Final measure overview with subsidy amount');
    return 'final_measure_overview';
  }

  // Step 18.5: Maatregel toegevoegd page (after file upload)
  // Check for the page that shows the added measure with "Wijzig" and "Verwijder" buttons
  // Look for specific measure table with Meldcode column
  const hasMeldcodeInTable = Array.from(document.querySelectorAll('td, th')).some(cell =>
    cell.textContent && cell.textContent.trim() === 'Meldcode'
  );

  // Also check for the "Maatregel toevoegen" button (button to add another measure)
  const hasMaatregelToevoegenButton = Array.from(document.querySelectorAll('input, button, a')).some(btn =>
    (btn.value && btn.value.includes('Maatregel toevoegen')) ||
    (btn.textContent && btn.textContent.trim() === 'Maatregel toevoegen')
  );

  // Check for exact "Wijzig" button (not "Wijzigen" which appears on other pages)
  const hasExactWijzigButton = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"]')).some(btn =>
    btn.value && btn.value.trim() === 'Wijzig'
  );

  if ((hasMeldcodeInTable && hasMaatregelToevoegenButton) || hasExactWijzigButton) {
    console.log('🎯 Detected: measure_overview - Maatregel toegevoegd page');
    return 'measure_overview';
  }

  // Step 18: File upload page
  if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.Bijlagen_NogToevoegen_ISDEPA_Meldcode\\.0\\.btn_ToevoegenBijlage')) {
    console.log('🎯 Detected: meldcode_selected - File upload page');
    return 'meldcode_selected';
  }

  // Step 17: Meldcode lookup table (check for unique text or table with meldcode data)
  // Look for the modal title "Selecteer hier uw keuze" OR search instruction text OR table with meldcode entries
  const hasMeldcodeModal = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && (
      el.textContent.includes('Selecteer hier uw keuze') ||
      el.textContent.includes('Geef uw zoekopdracht en klik op "Zoeken"')
    )
  );
  const hasTableWithMeldcodes = Array.from(document.querySelectorAll('td')).some(td =>
    td.textContent && td.textContent.match(/KA\d{5}/)
  );

  if (hasMeldcodeModal || hasTableWithMeldcodes) {
    console.log('🎯 Detected: meldcode_lookup_opened - Meldcode modal/table');
    return 'meldcode_lookup_opened';
  }

  // Step 16: Meldcode lookup button
  if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.lookup_meldcode')) {
    console.log('🎯 Detected: date_continued - Meldcode lookup button visible');
    return 'date_continued';
  }

  // Step 16.5: Meldcode search within warmtepomp wizard (step 3 of modal)
  const hasMeldcodeSearch = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && (
      el.textContent.includes('Zoek de meldcode voor deze maatregel') ||
      el.textContent.includes('Meldcode en toegepast materiaal')
    )
  );
  const hasWarmtepompWizard = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && el.textContent.includes('Geselecteerde maatregel: Warmtepomp')
  );

  if (hasMeldcodeSearch && hasWarmtepompWizard) {
    console.log('🎯 Detected: meldcode_search_in_wizard - Meldcode search within warmtepomp wizard');
    return 'meldcode_search_in_wizard';
  }

  // Step 13: Installation details modal (date fields)
  if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.DatumAangeschaft') &&
      document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.DatumInstallatie')) {
    console.log('🎯 Detected: warmtepomp_selected - Installation date modal');
    return 'warmtepomp_selected';
  }

  // Step 12: Warmtepomp choice radio button
  if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.choice_warmtepomp')) {
    console.log('🎯 Detected: measure_added - Warmtepomp selection modal');
    return 'measure_added';
  }

  // Step 11: Add measure button
  if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.addInvestering')) {
    console.log('🎯 Detected: bag_different_done - Add measure page');
    return 'bag_different_done';
  }

  // Step 10.5: Installation address form (appears after BAG different)
  // Check for "Kadaster gegevens" section which is unique to this page
  const hasKadasterSection = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && el.textContent.trim() === 'Kadaster gegevens'
  );
  if (hasKadasterSection && document.querySelector('input[value="Volgende"]')) {
    console.log('🎯 Detected: bag_address_form - Installation address form with Kadaster section');
    return 'bag_address_form';
  }

  // Step 10: BAG different checkbox
  if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.BAGafwijkend_J')) {
    console.log('🎯 Detected: address_different_done - BAG page');
    return 'address_different_done';
  }

  // Step 9: Address different checkbox
  if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.Adresafwijkend_J')) {
    console.log('🎯 Detected: correspondence_done - Address page');
    return 'correspondence_done';
  }

  // Step 7-8: Intermediary page (BOTH contact person AND digital correspondence on same page)
  if (document.querySelector('#link_int\\.0\\.link_int_organisatie\\.0\\.edExtraContactpersoon_n_int') &&
      document.querySelector('#link_int\\.0\\.edDigitaleCorrespondentie_J')) {
    console.log('🎯 Detected: personal_info_done - Intermediary page (combined)');
    return 'personal_info_done';
  }

  // Step 6: Personal info (BSN + initials confirms this page)
  if (document.querySelector('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edBSNnummer') &&
      document.querySelector('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edVoorletters2')) {
    console.log('🎯 Detected: info_acknowledged - Personal details page');
    return 'info_acknowledged';
  }

  // Step 5: Info acknowledgment checkbox
  if (document.querySelector('#FWS_Aanvraag_ISDEPA\\.0\\.InfoGelezen_JN')) {
    console.log('🎯 Detected: declarations_done - Info acknowledgment page');
    return 'declarations_done';
  }

  // Step 4: Declarations (multiple unique checkboxes)
  if (document.querySelector('#NaarWaarheid') &&
      document.querySelector('#cbTussenpersoonJ') &&
      document.querySelector('#FWS_Aanvraag_ISDEPA\\.0\\.edTypePand_eigenWoning_print')) {
    console.log('🎯 Detected: first_volgende_clicked - Declarations page');
    return 'first_volgende_clicked';
  }

  // Step 3: First Volgende button
  if (document.querySelector('#btn12')) {
    console.log('🎯 Detected: isde_selected - First Volgende page');
    return 'isde_selected';
  }

  // Step 2: ISDE catalog page - SIMPLE detection
  // Just check if the catalog link exists (ID starts with "catalog_NieuweAanvraag")
  const catalogLink = document.querySelector('a[id^="catalog_NieuweAanvraag"], a[id^="catalog_nieuweaanvraag"]');

  console.log('Simple detection:');
  console.log('  - Found catalog link:', !!catalogLink);
  if (catalogLink) {
    console.log('  - Catalog link ID:', catalogLink.id);
  }

  if (catalogLink) {
    console.log('🎯 Detected: nieuwe_aanvraag_clicked - ISDE catalog (found catalog link)');
    return 'nieuwe_aanvraag_clicked';
  }

  // Step 1: Start page
  // Has the "Nieuwe aanvraag" button but NOT the catalog link
  if (document.querySelector('#page_1_navigation_3_link')) {
    console.log('🎯 Detected: start - Main page');
    return 'start';
  }

  console.log('⚠️ Detected: unknown - No matching elements found');
  return 'unknown';
}

// Main automation function following the exact recording
async function startFullAutomation(config) {
  // Check if automation has been stopped by user
  if (automationStopped) {
    console.log('❌ Automation stopped by user, not continuing');
    return;
  }

  try {
    const currentUrl = window.location.href;
    console.log('Current URL:', currentUrl);

    // Detect current step from DOM rather than just sessionStorage
    const detectedStep = detectCurrentStep();
    const sessionStep = sessionStorage.getItem('automationStep') || 'start';

    console.log('Detected step from DOM:', detectedStep);
    console.log('Session step:', sessionStep);

    // IMPORTANT: Only trust detection if it makes sense with session, or if session is empty
    // This prevents detection from overwriting correct session state when page is still loading
    let currentStep;
    if (!sessionStep || sessionStep === 'start') {
      // No session or at start - trust detection
      currentStep = detectedStep !== 'unknown' ? detectedStep : sessionStep;
    } else if (detectedStep !== 'unknown' && detectedStep !== 'start') {
      // Both have values - trust detection if it's not 'start' (common false positive)
      currentStep = detectedStep;
      sessionStorage.setItem('automationStep', detectedStep);
    } else {
      // Detection failed or returned 'start' - trust session
      console.log('⚠️ Detection unclear, trusting session storage');
      currentStep = sessionStep;
    }

    console.log('Using step:', currentStep);

    // Update status to show detected step
    updateStatus('Ready to continue', currentStep, detectedStep);

    // Step 1: Click "Nieuwe aanvraag" link (page_1_navigation_3_link from recording)
    if (currentStep === 'start') {
      console.log('Step 1: Looking for Nieuwe aanvraag link');

      // Check if we already clicked recently to prevent infinite loop
      const lastClickTime = sessionStorage.getItem('lastNieuweAanvraagClick');
      const now = Date.now();
      if (lastClickTime && (now - parseInt(lastClickTime)) < 5000) {
        console.log('⚠️ Already clicked Nieuwe aanvraag recently, waiting for navigation...');
        updateStatus('Waiting for page navigation...', '1 - Navigation');
        return;
      }

      // Use exact selector from recording
      const nav3Link = document.querySelector('#page_1_navigation_3_link');
      console.log('Found #page_1_navigation_3_link:', !!nav3Link);

      if (nav3Link) {
        console.log('Step 1: Clicking Nieuwe aanvraag link');
        updateStatus('Clicking Nieuwe aanvraag link', '1 - Navigation');

        // Mark that we clicked to prevent loops
        sessionStorage.setItem('lastNieuweAanvraagClick', now.toString());
        sessionStorage.setItem('automationStep', 'nieuwe_aanvraag_clicked');
        sessionStorage.setItem('automationConfig', JSON.stringify(config));

        await clickElement(nav3Link);

        // After clicking, a page navigation will occur
        // The window.load event will restart automation at Step 2
        console.log('Navigation triggered, waiting for page to load...');

        // Fallback: If load event doesn't fire, poll for the catalog page
        let pollCount = 0;
        const pollInterval = setInterval(() => {
          pollCount++;
          console.log(`Polling for catalog page (${pollCount})...`);

          const catalogLink = document.querySelector('a[id^="catalog_NieuweAanvraag"]');
          if (catalogLink) {
            console.log('✅ Catalog page detected via polling!');
            clearInterval(pollInterval);
            updateStatus('Catalog page loaded', 'nieuwe_aanvraag_clicked');
            setTimeout(() => startFullAutomation(config), 1000);
          } else if (pollCount > 15) {
            console.log('⚠️ Polling timeout, stopping');
            clearInterval(pollInterval);
          }
        }, 1000);

        return;
      } else {
        console.log('No navigation link found, may need to be on the right starting page');
        updateStatus('Please navigate to the eLoket main page first', 'Waiting');
      }
    }
    
    // Step 2: Click ISDE aanvragen link (try multiple strategies)
    if (currentStep === 'nieuwe_aanvraag_clicked') {
      console.log('Step 2: Looking for ISDE aanvragen link');

      // Clear the click timestamp since we successfully navigated
      sessionStorage.removeItem('lastNieuweAanvraagClick');

      // Try multiple selector strategies
      let isdeLink = null;

      // Strategy 1: Direct ID search for catalog links
      if (!isdeLink) {
        const allLinks = document.querySelectorAll('a[id]');
        console.log('Total links with IDs found:', allLinks.length);
        for (let link of allLinks) {
          if (link.id.includes('catalog_NieuweAanvraag')) {
            console.log('Found catalog link with ID:', link.id);
            isdeLink = link;
            break;
          }
        }
      }

      // Strategy 2: aria-label
      if (!isdeLink) {
        isdeLink = document.querySelector('a[aria-label*="ISDE aanvragen"]');
        if (isdeLink) {
          console.log('Found ISDE link by aria-label');
        }
      }

      // Strategy 3: ID pattern with catalog prefix
      if (!isdeLink) {
        isdeLink = document.querySelector('a[id*="catalog_NieuweAanvraag"]');
        if (isdeLink) {
          console.log('Found ISDE link by catalog ID pattern');
        }
      }

      // Strategy 4: Any link with page_3_navigation_link
      if (!isdeLink) {
        isdeLink = document.querySelector('a[id*="page_3_navigation_link"]');
        if (isdeLink) {
          console.log('Found ISDE link by generic ID pattern');
        }
      }

      // Strategy 5: Text content search
      if (!isdeLink) {
        const links = document.querySelectorAll('a');
        console.log('Searching through', links.length, 'links by text content');
        for (let link of links) {
          const text = link.textContent || link.innerText || '';
          if (text.includes('ISDE') && (text.includes('warmtepomp') || text.includes('aanvragen'))) {
            isdeLink = link;
            console.log('Found ISDE link by text content:', text.substring(0, 50));
            break;
          }
        }
      }

      if (isdeLink) {
        console.log('Step 2: Clicking ISDE aanvragen link');
        updateStatus('Clicking ISDE aanvragen link', '2 - ISDE Selection', detectedStep);
        await clickElement(isdeLink);
        sessionStorage.setItem('automationStep', 'isde_selected');
        return;
      } else {
        console.log('ISDE link not found, may need manual intervention');
        updateStatus('Please manually click ISDE aanvragen link', '2 - Manual Action Required', detectedStep);
        return;
      }
    }

    // Step 3: Click first Volgende button
    if (document.querySelector('#btn12') && currentStep === 'isde_selected') {
      console.log('Step 3: Clicking first Volgende');
      updateStatus('Clicking Volgende button', '3 - First Volgende', detectedStep);
      // Set the step BEFORE clicking to ensure it's saved
      sessionStorage.setItem('automationStep', 'first_volgende_clicked');
      console.log('Set automationStep to:', sessionStorage.getItem('automationStep'));
      await clickElement('#btn12');
      return;
    }
    
    // Step 4: Declarations page
    if (document.querySelector('#NaarWaarheid') && currentStep === 'first_volgende_clicked') {
      console.log('Step 4: Filling declarations');
      updateStatus('Filling declaration checkboxes', '4 - Declarations', detectedStep);
      await clickElement('#NaarWaarheid');
      await clickElement('#cbTussenpersoonJ');
      await clickElement('#link_aanv\\.0\\.cbFWS_Deelnemer_SoortP'); // Added participant type checkbox
      await clickElement('#FWS_Aanvraag_ISDEPA\\.0\\.edTypePand_eigenWoning_print');
      await clickElement('#FWS_Aanvraag_ISDEPA\\.0\\.edReedsGeinstalleerd_j_print');
      await clickElement('#FWS_Aanvraag_ISDEPA\\.0\\.edAankoopbewijs_j_print');
      await clickElement('#btn14');
      sessionStorage.setItem('automationStep', 'declarations_done');
      return;
    }

    // Step 5: Information acknowledgment
    if (document.querySelector('#FWS_Aanvraag_ISDEPA\\.0\\.InfoGelezen_JN') && currentStep === 'declarations_done') {
      console.log('Step 5: Acknowledging information');
      updateStatus('Acknowledging information', '5 - Info Acknowledgment', detectedStep);
      await clickElement('#FWS_Aanvraag_ISDEPA\\.0\\.InfoGelezen_JN');
      await clickElement('#btnVolgendeTab');
      sessionStorage.setItem('automationStep', 'info_acknowledged');
      return;
    }

    // Step 6: Personal information
    if (document.querySelector('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edBSNnummer') && currentStep === 'info_acknowledged') {
      console.log('Step 6: Filling personal information');
      updateStatus('Filling personal information', '6 - Personal Details', detectedStep);
      
      // Fill fields with extra delays to avoid robot detection
      await fillInput('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edBSNnummer', config.bsn);
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
      
      await fillInput('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edVoorletters2', config.initials);
      await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
      
      await fillInput('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edAchternaam2', config.lastName);
      await new Promise(r => setTimeout(r, 700 + Math.random() * 300));
      
      // Gender selection based on config
      if (config.gender === 'male') {
        await clickElement('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.eddGeslacht_man2');
      } else if (config.gender === 'female') {
        await clickElement('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.eddGeslacht_vrouw2');
      }
      await new Promise(r => setTimeout(r, 600 + Math.random() * 400));
      
      await fillInput('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.link_aanv_persoon_telefoon\\.0\\.edTelefoonField3', config.phone);
      await new Promise(r => setTimeout(r, 800 + Math.random() * 400));
      
      await fillInput('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.link_aanv_persoon_email\\.0\\.edEmailField3', config.email);
      await new Promise(r => setTimeout(r, 900 + Math.random() * 500));
      
      await fillInput('#link_aanv\\.0\\.edIBAN', config.iban);
      await new Promise(r => setTimeout(r, 1000 + Math.random() * 500));
      
      await fillInput('#link_aanv\\.0\\.link_aanv_adres_vst\\.0\\.edPostcode', config.postalCode);
      await new Promise(r => setTimeout(r, 700 + Math.random() * 300));
      
      await fillInput('#link_aanv\\.0\\.link_aanv_adres_vst\\.0\\.edHuisnummer2', config.houseNumber);
      await new Promise(r => setTimeout(r, 600 + Math.random() * 300));
      
      await fillInput('#link_aanv\\.0\\.link_aanv_adres_vst\\.0\\.edToevoeging2', config.houseAddition);
      await new Promise(r => setTimeout(r, 700 + Math.random() * 400));
      
      // Check postal address different checkbox
      await clickElement('#link_aanv\\.0\\.edPostadres_anders_J');
      await new Promise(r => setTimeout(r, 1000));
      
      await clickElement('#btnVolgendeTab');
      sessionStorage.setItem('automationStep', 'personal_info_done');
      return;
    }
    
    // Step 7 & 8 COMBINED: Intermediary page (both questions on same page)
    if (document.querySelector('#link_int\\.0\\.link_int_organisatie\\.0\\.edExtraContactpersoon_n_int') &&
        document.querySelector('#link_int\\.0\\.edDigitaleCorrespondentie_J') &&
        currentStep === 'personal_info_done') {
      console.log('Step 7-8: Filling intermediary page (contact person + digital correspondence)');
      updateStatus('Filling intermediary information', '7-8 - Intermediary', detectedStep);

      // Click BOTH radio buttons on this page before clicking Volgende
      // 1. Digital correspondence - "Ja" (Yes to digital correspondence)
      await clickElement('#link_int\\.0\\.edDigitaleCorrespondentie_J');
      await new Promise(r => setTimeout(r, 500));

      // 2. Extra contact person - "Nee" (No to extra contact person)
      await clickElement('#link_int\\.0\\.link_int_organisatie\\.0\\.edExtraContactpersoon_n_int');
      await new Promise(r => setTimeout(r, 500));

      // Now click Volgende after BOTH are filled
      await clickElement('#btnVolgendeTab');
      sessionStorage.setItem('automationStep', 'correspondence_done');
      return;
    }
    
    // Step 9: Address different OR fill address if form is shown
    if (currentStep === 'correspondence_done') {
      console.log('Step 8: Handling address page');
      updateStatus('Handling address information', '8 - Address');
      
      // Check if we need to select "address different"
      const addressDifferentCheckbox = document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.Adresafwijkend_J');
      
      // Check if we're on the address form page (as shown in screenshot)
      const postcodeField = document.querySelector('input[name*="Postcode"], input[placeholder*="3038 JD"]');
      const huisnummerField = document.querySelector('input[name*="Huisnummer"], input[placeholder*="59"]');
      
      if (addressDifferentCheckbox) {
        console.log('Found address different checkbox, clicking');
        await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.Adresafwijkend_J');
        
        const nextButton = document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.next');
        if (nextButton) {
          await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.next');
        }
      } else if (postcodeField || huisnummerField) {
        console.log('On address form page, need to click Volgende');
        // We're on the address form, just need to click Volgende
        const volgendeButton = document.querySelector('input[value="Volgende"]') || 
                              document.querySelector('#btnVolgendeTab');
        if (volgendeButton) {
          await clickElement(volgendeButton);
        }
      }
      
      sessionStorage.setItem('automationStep', 'address_different_done');
      return;
    }
    
    // Step 10: BAG different
    if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.BAGafwijkend_J') && currentStep === 'address_different_done') {
      console.log('Step 9: Setting BAG different');
      updateStatus('Setting BAG different', '9 - BAG Settings');
      await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.BAGafwijkend_J');
      
      // Try to find and click the "next" button first
      const nextButton = document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.next');
      if (nextButton) {
        await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.next');
      }
      
      await new Promise(r => setTimeout(r, 1500));
      
      // Try both possible selectors for Volgende button
      const volgendeTab = document.querySelector('#btnVolgendeTab') || 
                         document.querySelector('input[value="Volgende"]') ||
                         document.querySelector('button:contains("Volgende")');
      
      if (volgendeTab) {
        console.log('Found Volgende button, clicking');
        await clickElement(volgendeTab);
      } else {
        console.log('Volgende button not found, may need manual intervention');
      }
      
      sessionStorage.setItem('automationStep', 'bag_different_done');
      return;
    }
    
    // Step 10.5: Installation address form (click Volgende to continue)
    // This page appears after BAG different, so check if we're on it
    if (currentStep === 'bag_address_form' ||
        (currentStep === 'bag_different_done' && detectedStep === 'bag_address_form') ||
        (currentStep === 'address_different_done' && detectedStep === 'bag_address_form')) {
      console.log('Step 10.5: On installation address form, clicking Volgende');
      updateStatus('Continuing from address form', '10.5 - Address Form', detectedStep);

      // Just click Volgende - the address is already filled from previous steps
      const volgendeButton = document.querySelector('input[value="Volgende"]') ||
                            document.querySelector('#btnVolgendeTab');
      if (volgendeButton) {
        await clickElement(volgendeButton);
        // After clicking Volgende, we should reach the "Add measure" page
        sessionStorage.setItem('automationStep', 'address_form_completed');
      }
      return;
    }

    // Step 11: Add measure
    if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.addInvestering') &&
        (currentStep === 'bag_different_done' || currentStep === 'address_form_completed')) {
      console.log('Step 11: Adding measure');
      updateStatus('Adding measure', '11 - Add Measure', detectedStep);
      await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.addInvestering');
      sessionStorage.setItem('automationStep', 'measure_added');

      // Wait for modal to open, then continue automation
      console.log('Waiting for measure modal to open...');
      await new Promise(r => setTimeout(r, 1500));

      // Continue automation to select warmtepomp
      setTimeout(() => {
        startFullAutomation(config);
      }, 500);
      return;
    }
    
    // Step 12: Select warmtepomp
    if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.choice_warmtepomp') && currentStep === 'measure_added') {
      console.log('Step 12: Selecting warmtepomp');
      updateStatus('Selecting warmtepomp', '12 - Measure Selection', detectedStep);
      await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.choice_warmtepomp');
      sessionStorage.setItem('automationStep', 'meldcode_search_in_wizard');

      // Wait for wizard to show meldcode search step
      console.log('Waiting for meldcode search step to appear...');
      await new Promise(r => setTimeout(r, 1500));

      // Continue automation to search for meldcode
      setTimeout(() => {
        startFullAutomation(config);
      }, 500);
      return;
    }

    // Step 12.5: Meldcode search within warmtepomp wizard
    if (currentStep === 'meldcode_search_in_wizard' || detectedStep === 'meldcode_search_in_wizard') {
      console.log('Step 12.5: Searching for meldcode in warmtepomp wizard');
      updateStatus('Searching for meldcode', '12.5 - Meldcode Search', detectedStep);

      // Wait for modal to be fully loaded
      await new Promise(r => setTimeout(r, 800));

      // Try to find the search input field
      const searchInput = document.querySelector('#lip_matchcode') ||
                         document.querySelector('input[name="lip_matchcode"]') ||
                         document.querySelector('input[type="text"]');

      if (searchInput && config.meldCode) {
        console.log('✅ Found meldcode search field, filling with:', config.meldCode);
        searchInput.focus();
        searchInput.value = config.meldCode;
        searchInput.dispatchEvent(new Event('input', { bubbles: true }));
        searchInput.dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 500));

        // Click the search button (the [...] button or Zoeken button)
        const searchButton = document.querySelector('input[type="submit"][value*="Zoeken"]') ||
                            document.querySelector('button[type="submit"]');

        if (searchButton) {
          console.log('✅ Clicking search button');
          searchButton.click();
          await new Promise(r => setTimeout(r, 2000)); // Wait for search results
          console.log('✅ Search completed, waiting for results...');
        } else {
          console.log('⚠️ Search button not found, trying to find meldcode directly');
        }

        // Wait for results
        await new Promise(r => setTimeout(r, 1000));

        // Find and click the meldcode from results
        const meldcodeLinks = document.querySelectorAll('td a, table a');
        let meldcodeClicked = false;

        for (let link of meldcodeLinks) {
          if (link.textContent.includes(config.meldCode)) {
            console.log('✅ Found matching meldcode link:', link.textContent);
            link.click();
            meldcodeClicked = true;
            await new Promise(r => setTimeout(r, 1000));
            break;
          }
        }

        if (!meldcodeClicked) {
          // Try clicking the first result
          const firstLink = document.querySelector('td a[href*="meldcode"], table a, #row_0 a');
          if (firstLink) {
            console.log('⚠️ Exact match not found, clicking first meldcode result');
            firstLink.click();
            await new Promise(r => setTimeout(r, 1000));
          }
        }

        // Click Volgende to advance to next step of wizard (date fields)
        const volgendeBtn = document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.wizard_investering_volgende') ||
                           document.querySelector('input[value="Volgende"]');

        if (volgendeBtn) {
          console.log('✅ Clicking Volgende to advance to date fields');
          await clickElement(volgendeBtn);
        }

        sessionStorage.setItem('automationStep', 'warmtepomp_selected');

        // Continue automation to fill dates
        setTimeout(() => {
          startFullAutomation(config);
        }, 1500);
        return;
      } else {
        console.log('⚠️ Search input not found or no meldcode configured');
        updateStatus('Please search for meldcode manually', '12.5 - Manual Action Required');
        return;
      }
    }
    
    // Step 13: Fill installation details and dates
    if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.DatumAangeschaft') && currentStep === 'warmtepomp_selected') {
      console.log('Step 13: Setting purchase and installation dates');
      updateStatus('Setting dates and installation details', '13 - Installation Details', detectedStep);

      // Wait for modal fields to be fully ready
      await new Promise(r => setTimeout(r, 800));

      // Set purchase date (DatumAangeschaft) - use fillInput for consistency
      await fillInput('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.DatumAangeschaft', config.purchaseDate || '28-10-2024');

      // Set installation date (DatumInstallatie)
      await fillInput('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.DatumInstallatie', config.installationDate || '30-10-2024');

      // Extra delay after filling dates before clicking checkboxes
      await new Promise(r => setTimeout(r, 1200));

      // IMPORTANT: Click gas usage radio button based on config
      console.log('Setting gas usage based on config:', config.gasUsage);
      if (config.gasUsage === 'no') {
        console.log('Clicking Nee for gas usage...');
        await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.GebruikAardgas_jn_N');
      } else {
        console.log('Clicking Ja for gas usage...');
        await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.GebruikAardgas_jn_J');
      }

      // Extra wait after gas checkbox
      await new Promise(r => setTimeout(r, 800));

      console.log('Clicking Dutch installation company checkbox...');
      await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.InstallBedrijf_NL_jn_J');

      // Wait longer for form to reveal KvK and company name fields after clicking "Ja"
      console.log('Waiting for KvK and company name fields to appear...');
      await new Promise(r => setTimeout(r, 2500));

      // Verify KvK field is now visible before filling
      const kvkField = document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.InstallBedrijf_KvK');
      if (kvkField) {
        console.log('✅ KvK field found, filling...');
        await fillInput('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.InstallBedrijf_KvK', config.kvkNumber);
      } else {
        console.error('❌ KvK field still not found after waiting!');
        alert('KvK field not found. Please manually check the "Dutch company" checkbox and fill the KvK field, then click Continue.');
        return;
      }

      // Fill company name
      await fillInput('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.InstallBedrijf_Naam', config.companyName);

      // Click Volgende to go to next step
      console.log('Clicking Volgende after filling installation details');
      await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.wizard_investering_volgende');
      sessionStorage.setItem('automationStep', 'installation_details_done');

      // Continue automation after modal closes
      setTimeout(() => {
        startFullAutomation(config);
      }, 1500);
      return;
    }
    
    // Step 14: Continue after installation details (removed redundant company details step)
    if (currentStep === 'installation_details_done' && document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.wizard_investering_volgende')) {
      console.log('Step 14: Continuing after installation details');
      await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.wizard_investering_volgende');
      sessionStorage.setItem('automationStep', 'date_continued');
      return;
    }
    
    // Step 16: Select meldcode
    if (currentStep === 'date_continued') {
      console.log('Step 16: Checking for meldcode modal...');

      // Check if modal is already open
      const modalAlreadyOpen = Array.from(document.querySelectorAll('*')).some(el =>
        el.textContent && el.textContent.includes('Selecteer hier uw keuze')
      );

      if (modalAlreadyOpen) {
        console.log('✅ Step 16: Meldcode modal already open, proceeding to search');
        sessionStorage.setItem('automationStep', 'meldcode_lookup_opened');
        // Continue to next step immediately to start searching
        setTimeout(() => startFullAutomation(config), 1000);
        return;
      }

      // Modal not open yet, click the lookup button
      const lookupButton = document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.lookup_meldcode');
      if (lookupButton) {
        console.log('Step 16: Opening meldcode lookup');
        await clickElement(lookupButton);
        sessionStorage.setItem('automationStep', 'meldcode_lookup_opened');

        // Wait for modal to open, then continue
        setTimeout(() => startFullAutomation(config), 1500);
        return;
      }
    }
    
    // Step 17: Search and select meldcode
    if (currentStep === 'meldcode_lookup_opened') {
      console.log('Step 17: Searching for meldcode');
      updateStatus('Searching for meldcode', '17 - Meldcode Search', detectedStep);

      // First, fill the search field if meldcode is provided
      if (config.meldCode) {
        console.log('🔍 Filling meldcode search field with:', config.meldCode);

        // Wait a bit for modal to be fully loaded
        await new Promise(r => setTimeout(r, 800));

        // Try to find the search input field
        const searchInput = document.querySelector('#lip_matchcode') ||
                           document.querySelector('input[name="lip_matchcode"]') ||
                           document.querySelector('input[placeholder*="zoekterm"]');

        console.log('Search input found:', !!searchInput);
        if (searchInput) {
          console.log('Search input ID:', searchInput.id);
          console.log('Search input name:', searchInput.name);

          // Directly fill the field (simpler than fillInput function)
          searchInput.focus();
          searchInput.value = config.meldCode;
          searchInput.dispatchEvent(new Event('input', { bubbles: true }));
          searchInput.dispatchEvent(new Event('change', { bubbles: true }));

          console.log('✅ Meldcode filled:', searchInput.value);

          await new Promise(r => setTimeout(r, 500));

          // Click the search button (Zoeken)
          const searchButton = document.querySelector('input[type="submit"][value*="Zoeken"]') ||
                              document.querySelector('button[type="submit"]') ||
                              document.querySelector('input[value="Zoeken"]');

          console.log('Search button found:', !!searchButton);
          if (searchButton) {
            console.log('🔍 Clicking search button...');
            searchButton.click();
            await new Promise(r => setTimeout(r, 2000)); // Wait for search results
            console.log('✅ Search completed, waiting for results...');
          } else {
            console.warn('⚠️ Search button not found!');
          }
        } else {
          console.error('❌ Search input field not found!');
        }
      }

      // Now find and click the meldcode from results
      let meldcodeClicked = false;

      // Try to find specific meldcode if provided
      if (config.meldCode) {
        console.log('Looking for meldcode in results:', config.meldCode);
        const links = document.querySelectorAll('td a, table a');
        for (let link of links) {
          if (link.textContent.includes(config.meldCode)) {
            console.log('Found matching meldcode link:', link.textContent);
            link.click();
            meldcodeClicked = true;
            await new Promise(r => setTimeout(r, 1500));
            break;
          }
        }
      }

      // Fallback: click first meldcode link if specific one not found
      if (!meldcodeClicked) {
        console.log('Clicking first available meldcode');
        const firstLink = document.querySelector('td a[href*="meldcode"], table a, #row_0 a');
        if (firstLink) {
          firstLink.click();
          await new Promise(r => setTimeout(r, 1500));
        } else {
          console.log('No meldcode link found, manual intervention needed');
          updateStatus('Please click a meldcode manually', '17 - Manual Action Required');
          return;
        }
      }

      // Click Volgende button after selecting meldcode
      await new Promise(r => setTimeout(r, 1000));
      const volgendeBtn = document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.wizard_investering_volgende');
      if (volgendeBtn) {
        await clickElement(volgendeBtn);
      }
      sessionStorage.setItem('automationStep', 'meldcode_selected');

      // Continue automation after meldcode selection
      setTimeout(() => {
        startFullAutomation(config);
      }, 1500);
      return;
    }
    
    // Step 18: File upload page
    if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.Bijlagen_NogToevoegen_ISDEPA_Meldcode\\.0\\.btn_ToevoegenBijlage') && currentStep === 'meldcode_selected') {
      console.log('Step 18: File upload page');
      updateStatus('Uploading documents', '18 - Document Upload', detectedStep);

      // Upload betaalbewijs (payment proof) - first document
      if (config.betaalbewijs) {
        console.log('Uploading betaalbewijs:', config.betaalbewijs.name);
        await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.Bijlagen_NogToevoegen_ISDEPA_Meldcode\\.0\\.btn_ToevoegenBijlage');
        await new Promise(r => setTimeout(r, 1500));
        await uploadFile(config.betaalbewijs);
        await new Promise(r => setTimeout(r, 2000));
      }

      // Upload factuur (invoice) - second document
      if (config.factuur) {
        console.log('Uploading factuur:', config.factuur.name);
        await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.Bijlagen_NogToevoegen_ISDEPA_Meldcode\\.1\\.btn_ToevoegenBijlage');
        await new Promise(r => setTimeout(r, 1500));
        await uploadFile(config.factuur);
        await new Promise(r => setTimeout(r, 2000));
      }

      if (!config.betaalbewijs || !config.factuur) {
        console.log('Missing documents - manual intervention required');
        updateStatus('Please upload missing documents manually', '18 - Manual Upload Required');
        alert('Please upload betaalbewijs and/or factuur manually, then click Continue.');
        return;
      }

      // Click the Volgende button to proceed
      console.log('Looking for Volgende button after document upload...');

      // Wait a bit for uploads to complete
      await new Promise(r => setTimeout(r, 1500));

      // Try the specific wizard button first
      let volgendeButton = document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.wizard_investering_volgende');

      if (!volgendeButton) {
        volgendeButton = document.querySelector('input[value="Volgende"]');
      }

      // If not found, search through all buttons
      if (!volgendeButton) {
        const buttons = document.querySelectorAll('button, input[type="submit"], input[type="button"]');
        for (let btn of buttons) {
          if (btn.textContent.includes('Volgende') || btn.value?.includes('Volgende')) {
            volgendeButton = btn;
            break;
          }
        }
      }

      if (volgendeButton) {
        console.log('✅ Found Volgende button:', volgendeButton.id || volgendeButton.value);
        console.log('Button type:', volgendeButton.tagName, 'Value:', volgendeButton.value);

        // Scroll into view and click directly
        volgendeButton.scrollIntoView({behavior: 'smooth', block: 'center'});
        await new Promise(r => setTimeout(r, 800));

        // Try direct click first
        console.log('Clicking Volgende button directly...');
        volgendeButton.click();

        await new Promise(r => setTimeout(r, 1000));

        sessionStorage.setItem('automationStep', 'files_handled');

        // Continue automation after clicking Volgende
        console.log('✅ Volgende clicked, continuing to next step...');
        setTimeout(() => {
          startFullAutomation(config);
        }, 2000);
        return;
      } else {
        console.log('⚠️ Volgende button not found, may need manual intervention');
        updateStatus('Please click Volgende manually', '18 - Manual Action');
        alert('Documents uploaded. Please click Volgende manually to continue.');
        return;
      }
    }

    // Step 18.4: "Vervolgstap" modal - appears after file upload
    // Check directly for the modal presence regardless of step
    const hasVervolgstapModalNow = Array.from(document.querySelectorAll('*')).some(el =>
      el.textContent && (
        el.textContent.includes('Vervolgstap') ||
        el.textContent.includes('U heeft deze maatregel volledig ingevuld')
      )
    );

    if ((currentStep === 'vervolgstap_modal' ||
         currentStep === 'files_handled' ||
         detectedStep === 'vervolgstap_modal') &&
        hasVervolgstapModalNow) {
      console.log('Step 18.4: Vervolgstap modal present, clicking Volgende');
      updateStatus('Handling follow-up step modal', '18.4 - Vervolgstap Modal', detectedStep);

      await new Promise(r => setTimeout(r, 800));

      // Find the "Volgende" button in the modal
      let volgendeButton = null;
      const buttons = document.querySelectorAll('input[type="submit"], input[type="button"], button');

      console.log(`Checking ${buttons.length} buttons for "Volgende"`);
      for (let btn of buttons) {
        const buttonText = btn.value || btn.textContent || '';
        console.log(`Button text: "${buttonText.trim()}"`);
        if (buttonText.trim() === 'Volgende') {
          volgendeButton = btn;
          console.log('✅ Found "Volgende" button in modal');
          break;
        }
      }

      if (volgendeButton) {
        volgendeButton.scrollIntoView({behavior: 'smooth', block: 'center'});
        await new Promise(r => setTimeout(r, 500));

        volgendeButton.click();
        console.log('✅ Clicked "Volgende" in modal');

        await new Promise(r => setTimeout(r, 1500));
        sessionStorage.setItem('automationStep', 'vervolgstap_completed');

        // Continue automation
        setTimeout(() => {
          startFullAutomation(config);
        }, 2000);
        return;
      } else {
        console.log('⚠️ "Volgende" button not found in modal');
        updateStatus('Please click "Volgende" manually', '18.4 - Manual Action');
        return;
      }
    }

    // Step 18.5: Measure overview page - "Maatregel toegevoegd" page with Wijzig/Verwijder buttons
    if (currentStep === 'measure_overview' ||
        (currentStep === 'files_handled' && detectedStep === 'measure_overview') ||
        (currentStep === 'vervolgstap_completed' && detectedStep === 'measure_overview')) {
      console.log('Step 18.5: On measure overview page (Maatregel toegevoegd), clicking Volgende');
      updateStatus('Continuing from measure overview', '18.5 - Measure Overview', detectedStep);

      // Wait a bit for the page to be fully loaded
      await new Promise(r => setTimeout(r, 1000));

      // Find and click the Volgende button
      const volgendeButton = document.querySelector('#btnVolgendeTab');

      if (volgendeButton) {
        console.log('✅ Found Volgende button on measure overview page');
        volgendeButton.scrollIntoView({behavior: 'smooth', block: 'center'});
        await new Promise(r => setTimeout(r, 500));

        volgendeButton.click();
        console.log('✅ Clicked Volgende, checking for confirmation dialog...');

        await new Promise(r => setTimeout(r, 1000));
        sessionStorage.setItem('automationStep', 'measure_overview_clicked');

        // Continue automation to handle potential dialog
        setTimeout(() => {
          startFullAutomation(config);
        }, 1500);
        return;
      } else {
        console.log('⚠️ Volgende button not found on measure overview page');
        updateStatus('Please click Volgende manually', '18.5 - Manual Action');
        return;
      }
    }

    // Step 18.6: "Zijn alle maatregelen toegevoegd?" confirmation dialog
    if (currentStep === 'measure_overview_clicked' || detectedStep === 'measure_confirmation_dialog') {
      console.log('Step 18.6: Checking for measure confirmation dialog');

      // Check if the dialog is present
      const hasMaatregelenDialog = Array.from(document.querySelectorAll('*')).some(el =>
        el.textContent && el.textContent.includes('Zijn alle maatregelen toegevoegd')
      );

      if (hasMaatregelenDialog) {
        console.log('Step 18.6: Found measure confirmation dialog, clicking "Ja, volgende"');
        updateStatus('Confirming measures completed', '18.6 - Measure Confirmation', detectedStep);

        await new Promise(r => setTimeout(r, 800));

        // Find the "Ja, volgende" button
        let jaVolgendeButton = null;
        const buttons = document.querySelectorAll('input[type="submit"], input[type="button"], button');

        for (let btn of buttons) {
          const buttonText = btn.value || btn.textContent || '';
          if (buttonText.includes('Ja, volgende')) {
            jaVolgendeButton = btn;
            console.log('✅ Found "Ja, volgende" button');
            break;
          }
        }

        if (jaVolgendeButton) {
          jaVolgendeButton.scrollIntoView({behavior: 'smooth', block: 'center'});
          await new Promise(r => setTimeout(r, 500));

          jaVolgendeButton.click();
          console.log('✅ Clicked "Ja, volgende", proceeding to next step');

          await new Promise(r => setTimeout(r, 1000));
          sessionStorage.setItem('automationStep', 'measure_confirmed');

          // Continue automation
          setTimeout(() => {
            startFullAutomation(config);
          }, 2000);
          return;
        } else {
          console.log('⚠️ "Ja, volgende" button not found');
          updateStatus('Please click "Ja, volgende" manually', '18.6 - Manual Action');
          return;
        }
      } else {
        // No dialog appeared, continue to next step
        console.log('No confirmation dialog found, continuing to final confirmation');
        sessionStorage.setItem('automationStep', 'measure_confirmed');
        setTimeout(() => {
          startFullAutomation(config);
        }, 1000);
        return;
      }
    }

    // Step 18.7: Final measure overview page with subsidy amount - click Volgende
    if (currentStep === 'final_measure_overview' ||
        (currentStep === 'measure_confirmed' && detectedStep === 'final_measure_overview')) {
      console.log('Step 18.7: On final measure overview page, clicking Volgende');
      updateStatus('Continuing from final measure overview', '18.7 - Final Overview', detectedStep);

      await new Promise(r => setTimeout(r, 1000));

      const volgendeButton = document.querySelector('#btnVolgendeTab');
      if (volgendeButton) {
        console.log('✅ Found Volgende button on final measure overview');
        volgendeButton.scrollIntoView({behavior: 'smooth', block: 'center'});
        await new Promise(r => setTimeout(r, 500));

        volgendeButton.click();
        console.log('✅ Clicked Volgende, proceeding to next step');

        await new Promise(r => setTimeout(r, 1000));
        sessionStorage.setItem('automationStep', 'final_measure_overview_done');

        setTimeout(() => {
          startFullAutomation(config);
        }, 2000);
        return;
      } else {
        console.log('⚠️ Volgende button not found');
        updateStatus('Please click Volgende manually', '18.7 - Manual Action');
        return;
      }
    }

    // Step 19.5: Final review page (Verzenden tab)
    if (currentStep === 'final_review_page' || detectedStep === 'final_review_page') {
      console.log('Step 19.5: Op eindcontrole pagina, scroll naar beneden en klik Volgende');
      updateStatus('Gegevens controleren', '19.5 - Eindcontrole', detectedStep);

      // Scroll naar beneden om alle gegevens te tonen
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });

      await new Promise(r => setTimeout(r, 1500));

      // Zoek en klik de Volgende knop
      const volgendeButton = document.querySelector('#btnVolgendeTab') ||
                            document.querySelector('input[value="Volgende"]');

      if (volgendeButton) {
        console.log('✅ Volgende knop gevonden, doorgaan naar bevestiging');
        await clickElement(volgendeButton);
        sessionStorage.setItem('automationStep', 'final_review_done');
        return;
      } else {
        console.log('⚠️ Volgende knop niet gevonden');
        updateStatus('Klik handmatig op Volgende', '19.5 - Handmatige actie vereist');
        return;
      }
    }

    // Step 19: Final confirmation - "Ja, volgende" button
    if (document.querySelector('#QuestionEmbedding_585_default') &&
        (currentStep === 'files_handled' || currentStep === 'measure_overview_done' || currentStep === 'measure_confirmed' || currentStep === 'final_measure_overview_done' || currentStep === 'final_review_done')) {
      console.log('Step 19: Final confirmation');
      updateStatus('Laatste bevestiging', '19 - Bevestiging', detectedStep);
      await clickElement('#QuestionEmbedding_585_default');
      await clickElement('#btnVolgendeTab');
      sessionStorage.setItem('automationStep', 'final_confirmed');
      return;
    }

    // Step 20: Accept terms - scroll to bottom for manual review
    if (document.querySelector('#cbAccoord') && currentStep === 'final_confirmed') {
      console.log('Step 20: Laatste pagina bereikt, scrollen naar beneden voor handmatige controle');
      updateStatus('✅ Voltooid! Controleer en verstuur', '20 - Eindcontrole', detectedStep);

      // Scroll naar beneden
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });

      // Wacht even tot scroll klaar is
      await new Promise(r => setTimeout(r, 1000));

      // Houd het automatiseringspaneel zichtbaar maar geef voltooiing aan
      updateStatus('✅ Klaar voor verzending - Controleer het formulier hieronder en klik op Indienen wanneer u klaar bent', 'KLAAR', detectedStep);

      // Verwijder sessionStorage niet voor het geval gebruiker moet doorgaan
      // sessionStorage.clear();

      console.log('✅ Automatisering voltooid - wacht op handmatige verzending');
      return;
    }

    console.log('Geen overeenkomende stap gevonden, wacht op laden van pagina of handmatige actie');
    updateStatus('Wacht op volgende stap...', currentStep, detectedStep);
    
  } catch (error) {
    console.error('Automation error:', error);
    alert('Automation error: ' + error.message);
  }
}

// Check if we need to continue automation after page load
window.addEventListener('load', () => {
  // Don't continue if automation has been stopped
  if (automationStopped) {
    console.log('❌ Automation stopped, not continuing on page load');
    return;
  }

  const automationConfig = sessionStorage.getItem('automationConfig');
  if (automationConfig) {
    const config = JSON.parse(automationConfig);
    const currentStep = sessionStorage.getItem('automationStep');
    console.log('Continuing automation after page load, step:', currentStep);
    // Recreate status panel after page load
    createStatusPanel();
    updateStatus('Page loaded, continuing automation...', currentStep);

    // Simple delay then continue - no retry loop
    setTimeout(() => {
      console.log('Starting automation after page load');
      startFullAutomation(config);
    }, 2000);
  }
});

// Also listen for DOM content loaded as backup
document.addEventListener('DOMContentLoaded', () => {
  // Don't continue if automation has been stopped
  if (automationStopped) {
    console.log('❌ Automation stopped, not continuing on DOM load');
    return;
  }

  const automationConfig = sessionStorage.getItem('automationConfig');
  if (automationConfig) {
    const config = JSON.parse(automationConfig);
    const currentStep = sessionStorage.getItem('automationStep');
    console.log('DOM loaded, checking automation step:', currentStep);

    // Always show the panel if automation is in progress
    createStatusPanel();
    const detectedStep = detectCurrentStep();
    updateStatus('Waiting...', currentStep, detectedStep);

    if (currentStep && currentStep !== 'start') {
      setTimeout(() => {
        startFullAutomation(config);
      }, 2000);
    }
  }
});

// Also check periodically if panel needs to be recreated (in case DOM changes)
setInterval(() => {
  // Don't recreate panel if automation has been stopped
  if (automationStopped) {
    return;
  }

  const automationConfig = sessionStorage.getItem('automationConfig');
  if (automationConfig && !document.getElementById('isde-automation-panel')) {
    console.log('Status panel missing, recreating...');
    createStatusPanel();
    const currentStep = sessionStorage.getItem('automationStep');
    const detectedStep = detectCurrentStep();
    updateStatus('Ready', currentStep, detectedStep);
  }
}, 2000);