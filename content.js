/**
 * ============================================================================
 * ISDE SUBSIDIE AUTOMATISERING - CHROME EXTENSIE CONTENT SCRIPT
 * ============================================================================
 *
 * Doel:
 * Dit content script automatiseert het volledige ISDE subsidie aanvraagproces
 * voor warmtepompen via het eLoket portaal van de overheid.
 *
 * Belangrijkste componenten:
 * 1. Globale variabelen en vlaggen voor status tracking
 * 2. Helper functies voor timeouts en status paneel beheer
 * 3. Message listener voor communicatie met de popup/background
 * 4. Helper functies voor DOM interactie (wachten, klikken, invullen)
 * 5. detectCurrentStep() - detecteert huidige pagina in het aanvraagproces
 * 6. startFullAutomation() - hoofdloop die door alle stappen navigeert
 *
 * Workflow:
 * - Gebruiker start automatisering via popup
 * - Script detecteert huidige stap in het proces
 * - Vult formuliervelden in, klikt op knoppen, upload bestanden
 * - Navigeert door alle ~20 stappen tot finale indiening
 * - Gebruiker kan pauzeren, hervatten of stoppen via status paneel
 *
 * @author Chrome Extension
 * @version 1.0
 */

// ============================================================================
// SECTIE 1: GLOBALE VARIABELEN EN VLAGGEN
// ============================================================================

/**
 * Globale vlag om bij te houden of de automatisering is gestopt door de gebruiker.
 * Wanneer true, wordt alle verdere automatisering direct afgebroken.
 */
let automationStopped = false;

/**
 * Globale vlag om bij te houden of de automatisering is gepauzeerd door de gebruiker.
 * Wanneer true, wacht de automatisering tot de gebruiker op "Hervat" klikt.
 */
let automationPaused = false;

/**
 * Array om alle actieve timeouts bij te houden zodat we ze kunnen annuleren
 * wanneer de gebruiker pauzeert of stopt. Voorkomt zombie-timers.
 */
let activeTimeouts = [];

/**
 * Unieke tab identifier voor multi-tab support.
 * Elke tab krijgt een eigen ID zodat recovery data niet interfereert tussen tabs.
 */
let currentTabId = sessionStorage.getItem('tabId');
if (!currentTabId) {
  currentTabId = `tab_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  sessionStorage.setItem('tabId', currentTabId);
  console.log('🆔 Generated new tab ID:', currentTabId);
} else {
  console.log('🆔 Existing tab ID:', currentTabId);
}

/**
 * Page Visibility API - Log wanneer tab hidden/visible wordt (voor debugging)
 */
document.addEventListener('visibilitychange', () => {
  if (document.hidden) {
    console.log('⚠️ Tab is hidden - keep-alive audio should prevent throttling');
  } else {
    console.log('✅ Tab is visible again');
  }
});

/**
 * Loop detectie: houdt bij hoeveel keer dezelfde stap is uitgevoerd.
 * Als een stap te vaak wordt herhaald, pauzeert de automatisering automatisch
 * om een oneindige loop te voorkomen.
 */
let lastExecutedStep = null;
let stepExecutionCount = 0;
const MAX_STEP_RETRIES = 2; // Auto-pauze na 2 pogingen op dezelfde stap

/**
 * Audio object voor keep-alive functionaliteit.
 * Speelt een stille audio loop af om Chrome tab throttling te voorkomen.
 * Dit zorgt ervoor dat inactive tabs op normale snelheid blijven draaien.
 */
let keepAliveAudio = null;

// ============================================================================
// SECTIE 2: AUDIO KEEP-ALIVE VOOR MULTI-TAB ONDERSTEUNING
// ============================================================================

/**
 * Start een stille audio loop om tab throttling te voorkomen.
 *
 * PROBLEEM:
 * Chrome vertraagt inactive tabs drastisch (factor 100-1000x). Dit betekent
 * dat setTimeout/setInterval vertragen en automatisering bijna stopt.
 *
 * OPLOSSING:
 * Door een stille audio loop af te spelen, denkt Chrome dat de tab actieve
 * media content heeft en wordt throttling uitgeschakeld. Dit zorgt ervoor
 * dat meerdere tabs parallel kunnen runnen zonder vertraging.
 *
 * GEBRUIK:
 * - Wordt automatisch gestart bij het begin van automatisering
 * - Wordt gestopt wanneer automatisering klaar is of wordt gestopt
 * - Gebruikt een 0.5 seconden stille audio die herhaald wordt
 */
function startKeepAlive() {
  if (keepAliveAudio) {
    console.log('🔊 Keep-alive is al actief');
    return;
  }

  try {
    // METHODE 1: Web Locks API - Meest betrouwbaar voor background tabs
    if ('locks' in navigator) {
      // Request een lock die nooit vrijgegeven wordt (tot stopKeepAlive())
      navigator.locks.request(`isde_automation_${currentTabId}`, { mode: 'exclusive' }, async () => {
        console.log('🔒 Web Lock acquired - tab blijft actief in achtergrond');

        // Deze promise resolved nooit, dus de lock blijft actief
        return new Promise(resolve => {
          // Sla de resolve functie op zodat we de lock kunnen vrijgeven
          window.keepAliveLockResolve = resolve;
        });
      }).catch(err => {
        console.warn('⚠️ Web Locks API failed:', err);
      });
    }

    // METHODE 2: Stille audio als fallback
    const silentAudio = 'data:audio/mp3;base64,SUQzBAAAAAAAI1RTU0UAAAAPAAADTGF2ZjU4Ljc2LjEwMAAAAAAAAAAAAAAA//tQAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAWGluZwAAAA8AAAACAAADhAC7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7u7//////////////////////////////////////////////////////////////////8AAAAATGF2YzU4LjEzAAAAAAAAAAAAAAAAJAAAAAAAAAAAA4T0Mq+JAAAAAAAAAAAAAAAAAAAAAP/7kGQAD/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABExBTUUzLjEwMFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVf/7kGQAD/AAAGkAAAAIAAANIAAAAQAAAaQAAAAgAAA0gAAABFVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVVQ==';

    keepAliveAudio = new Audio(silentAudio);
    keepAliveAudio.loop = true;
    keepAliveAudio.volume = 0.01;
    keepAliveAudio.muted = true; // Volledig muted voor betere autoplay compatibiliteit

    const playPromise = keepAliveAudio.play();

    if (playPromise !== undefined) {
      playPromise
        .then(() => {
          console.log('🔊 Keep-alive audio gestart als extra bescherming');
          console.log('✅ Meerdere tabs kunnen nu parallel runnen zonder vertraging');
        })
        .catch((error) => {
          console.warn('⚠️ Audio fallback geblokkeerd, maar Web Locks zou moeten werken:', error.message);
        });
    }

    // METHODE 3: requestAnimationFrame loop als extra bescherming
    let rafId;
    const rafLoop = () => {
      if (keepAliveAudio) { // Check of keep-alive nog actief is
        rafId = requestAnimationFrame(rafLoop);
      }
    };
    rafId = requestAnimationFrame(rafLoop);
    window.keepAliveRafId = rafId;

    console.log('✅ Multi-layered keep-alive geactiveerd (Web Locks + Audio + RAF)');
  } catch (error) {
    console.error('❌ Fout bij starten keep-alive:', error);
  }
}

/**
 * Stopt de keep-alive systemen.
 *
 * Wordt aangeroepen wanneer:
 * - Automatisering succesvol is afgerond
 * - Gebruiker de automatisering stopt
 * - Er een fatale fout optreedt
 */
function stopKeepAlive() {
  try {
    // Stop Web Lock
    if (window.keepAliveLockResolve) {
      window.keepAliveLockResolve();
      window.keepAliveLockResolve = null;
      console.log('🔓 Web Lock vrijgegeven');
    }

    // Stop Audio
    if (keepAliveAudio) {
      keepAliveAudio.pause();
      keepAliveAudio.currentTime = 0;
      keepAliveAudio = null;
      console.log('🔇 Keep-alive audio gestopt');
    }

    // Stop RAF loop
    if (window.keepAliveRafId) {
      cancelAnimationFrame(window.keepAliveRafId);
      window.keepAliveRafId = null;
      console.log('⏹️ RAF loop gestopt');
    }

    console.log('✅ Alle keep-alive systemen gestopt');
  } catch (error) {
    console.error('❌ Fout bij stoppen keep-alive:', error);
  }
}

/**
 * Unthrottled delay functie die ook werkt in background tabs.
 *
 * PROBLEEM:
 * setTimeout wordt in background tabs vertraagd naar minimaal 1000ms door Chrome.
 * Dit maakt automatisering 10x langzamer wanneer tab niet actief is.
 *
 * OPLOSSING:
 * Gebruik requestAnimationFrame (RAF) voor korte delays. RAF wordt niet geThrottled
 * zolang de keep-alive audio/Web Lock actief is.
 *
 * @param {number} ms - Aantal milliseconden om te wachten
 * @returns {Promise} Promise die resolved na de opgegeven tijd
 */
function unthrottledDelay(ms) {
  return new Promise((resolve, reject) => {
    const startTime = performance.now();

    const checkTime = () => {
      // CHECK: Stop flag tijdens delay
      if (automationStopped) {
        console.log('❌ Delay interrupted - automation stopped');
        reject(new Error('Automation stopped'));
        return;
      }

      // CHECK: Pause flag tijdens delay
      if (automationPaused) {
        // Don't reject or log repeatedly, just wait and check again
        requestAnimationFrame(checkTime);
        return;
      }

      const elapsed = performance.now() - startTime;
      if (elapsed >= ms) {
        resolve();
      } else {
        // Gebruik RAF voor snelle, unthrottled timing
        requestAnimationFrame(checkTime);
      }
    };

    requestAnimationFrame(checkTime);
  });
}

// ============================================================================
// SECTIE 3: HELPER FUNCTIES VOOR TIMEOUT BEHEER
// ============================================================================

/**
 * Creëert een timeout die wordt bijgehouden in de activeTimeouts array.
 * Hierdoor kunnen we alle timeouts annuleren wanneer de gebruiker pauzeert of stopt.
 *
 * @param {Function} callback - De functie die na de delay wordt uitgevoerd
 * @param {number} delay - Vertraging in milliseconden
 * @returns {number} Het timeout ID
 */
function createTimeout(callback, delay) {
  const timeoutId = setTimeout(() => {
    // Verwijder van actieve timeouts wanneer deze wordt uitgevoerd
    const index = activeTimeouts.indexOf(timeoutId);
    if (index > -1) {
      activeTimeouts.splice(index, 1);
    }
    callback();
  }, delay);
  activeTimeouts.push(timeoutId);
  return timeoutId;
}

/**
 * Wist alle actieve timeouts en leegt de array.
 * Wordt aangeroepen wanneer de gebruiker de automatisering pauzeert of stopt.
 */
function clearAllTimeouts() {
  console.log(`Clearing ${activeTimeouts.length} active timeouts`);
  activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
  activeTimeouts = [];
}

// ============================================================================
// SECTIE 3: STATUS PANEEL FUNCTIES
// ============================================================================

/**
 * Creëert een visueel status paneel rechtsboven op de pagina.
 * Dit paneel toont:
 * - Huidige status van de automatisering
 * - Gedetecteerde stap
 * - Configuratiegegevens (inklapbaar)
 * - Bedieningsknoppen (Pauze, Hervat, Stop)
 *
 * Het paneel blijft zichtbaar tijdens het hele automatiseringsproces en
 * geeft de gebruiker controle over de automatisering.
 */
function createStatusPanel() {
  // Verwijder bestaand paneel indien aanwezig (voorkomt duplicaten)
  const existingPanel = document.getElementById('isde-automation-panel');
  if (existingPanel) {
    existingPanel.remove();
  }

  // Creëer het paneel element met volledige styling en structuur
  const panel = document.createElement('div');
  panel.id = 'isde-automation-panel';
  panel.innerHTML = `
    <div style="position: fixed; top: 20px; right: 20px; width: 320px; background: white; border-radius: 24px; padding: 20px; box-shadow: 0 4px 16px rgba(0,0,0,0.12); z-index: 999999; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica', 'Arial', sans-serif;">
      <div id="panel-header" style="display: flex; align-items: center; justify-content: space-between; margin-bottom: 16px;">
        <div style="color: #495057; font-weight: 600; font-size: 15px;">ISDE Automatisering</div>
        <button id="toggle-config-data" style="background: #e7f5ff; color: #1971c2; border: none; padding: 6px 12px; border-radius: 8px; cursor: pointer; font-size: 11px; font-weight: 600; transition: all 0.2s;">
          <span id="toggle-icon" style="display: inline-block; transition: transform 0.2s;">▶</span>
        </button>
      </div>

      <div id="config-data-container" style="display: none; margin-bottom: 12px; padding: 14px; background: #f8f9fa; border-radius: 12px; max-height: 320px; overflow-y: auto; font-size: 12px; border: 1px solid #e9ecef;">
        <div id="config-data-content"></div>
      </div>

      <div style="background: #f8f9fa; border-radius: 12px; padding: 12px; margin-bottom: 12px;">
        <div id="automation-status" style="color: #868e96; margin-bottom: 6px; font-size: 13px;">Bezig met opstarten...</div>
        <div id="current-step" style="color: #FFC012; font-weight: 600; margin-bottom: 6px; font-size: 14px;"></div>
        <div id="detected-step" style="color: #adb5bd; font-size: 11px;"></div>
      </div>

      <div style="display: flex; gap: 8px; flex-wrap: wrap;">
        <button id="pause-automation" style="background: #ff9800; color: white; border: none; padding: 10px 16px; border-radius: 12px; cursor: pointer; font-size: 13px; font-weight: 600; flex: 1; transition: all 0.2s;">⏸ Pauze</button>
        <button id="continue-automation" style="background: #FFC012; color: white; border: none; padding: 10px 16px; border-radius: 12px; cursor: pointer; font-size: 13px; font-weight: 600; flex: 1; display: none; transition: all 0.2s;">▶ Hervat</button>
        <button id="stop-automation" style="background: #dc3545; color: white; border: none; padding: 10px 16px; border-radius: 12px; cursor: pointer; font-size: 13px; font-weight: 600; flex: 1; transition: all 0.2s;">⏹ Stop</button>
      </div>
    </div>
  `;
  document.body.appendChild(panel);

  // Add hover effects
  const style = document.createElement('style');
  style.textContent = `
    #toggle-config-data:hover {
      background: #d0ebff !important;
      transform: scale(1.05);
    }
    #pause-automation:hover {
      background: #f59f00 !important;
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(245, 159, 0, 0.3);
    }
    #continue-automation:hover {
      background: #f0b200 !important;
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(255, 192, 18, 0.3);
    }
    #stop-automation:hover {
      background: #c92a2a !important;
      transform: translateY(-1px);
      box-shadow: 0 4px 8px rgba(220, 53, 69, 0.3);
    }
    #config-data-container::-webkit-scrollbar {
      width: 6px;
    }
    #config-data-container::-webkit-scrollbar-track {
      background: #e9ecef;
      border-radius: 3px;
    }
    #config-data-container::-webkit-scrollbar-thumb {
      background: #adb5bd;
      border-radius: 3px;
    }
    #config-data-container::-webkit-scrollbar-thumb:hover {
      background: #868e96;
    }
  `;
  document.head.appendChild(style);

  // -------------------------------------------------------------------------
  // Event Handler: Toggle knop voor configuratie gegevens
  // -------------------------------------------------------------------------
  // Toont/verbergt de configuratiegegevens in het paneel wanneer de gebruiker
  // op de pijl knop klikt. Gegevens worden opgehaald uit sessionStorage.
  document.getElementById('toggle-config-data').addEventListener('click', () => {
    const container = document.getElementById('config-data-container');
    const icon = document.getElementById('toggle-icon');
    const content = document.getElementById('config-data-content');

    if (container.style.display === 'none') {
      // Toon configuratie gegevens
      const config = JSON.parse(sessionStorage.getItem('automationConfig') || '{}');

      // Format config data nicely
      let html = '<div style="color: #212529; line-height: 1.8;">';

      // Personal info section
      html += '<div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e9ecef;"><strong style="color: #FFC012; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Persoonlijke Gegevens</strong></div>';
      html += `<div style="margin-bottom: 12px;">`;
      html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">BSN</span> <span style="color: #212529; font-weight: 500;">${config.bsn || '-'}</span></div>`;
      html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">Naam</span> <span style="color: #212529; font-weight: 500;">${config.initials || ''} ${config.lastName || '-'}</span></div>`;
      html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">Geslacht</span> <span style="color: #212529; font-weight: 500;">${config.gender === 'male' ? 'Man' : 'Vrouw'}</span></div>`;
      html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">Telefoon</span> <span style="color: #212529; font-weight: 500;">${config.phone || '-'}</span></div>`;
      html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">E-mail</span> <span style="color: #212529; font-weight: 500;">${config.email || '-'}</span></div>`;
      html += `<div style="display: flex; justify-content: space-between;"><span style="color: #868e96; font-size: 11px;">IBAN</span> <span style="color: #212529; font-weight: 500;">${config.iban || '-'}</span></div>`;
      html += `</div>`;

      // Address section
      html += '<div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e9ecef;"><strong style="color: #FFC012; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Adresgegevens</strong></div>';
      html += `<div style="margin-bottom: 12px;">`;
      html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">Adres</span> <span style="color: #212529; font-weight: 500;">${config.street || '-'} ${config.houseNumber || ''} ${config.houseAddition || ''}</span></div>`;
      html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">Postcode</span> <span style="color: #212529; font-weight: 500;">${config.postalCode || '-'}</span></div>`;
      html += `<div style="display: flex; justify-content: space-between;"><span style="color: #868e96; font-size: 11px;">Plaats</span> <span style="color: #212529; font-weight: 500;">${config.city || '-'}</span></div>`;
      html += `</div>`;

      // Installation details section
      html += '<div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e9ecef;"><strong style="color: #FFC012; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Installatie Details</strong></div>';
      html += `<div style="margin-bottom: 12px;">`;
      html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">Aankoopdatum</span> <span style="color: #212529; font-weight: 500;">${config.purchaseDate || '-'}</span></div>`;
      html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">Installatiedatum</span> <span style="color: #212529; font-weight: 500;">${config.installationDate || '-'}</span></div>`;
      html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">Meldcode</span> <span style="color: #212529; font-weight: 500;">${config.meldCode || '-'}</span></div>`;
      html += `<div style="display: flex; justify-content: space-between;"><span style="color: #868e96; font-size: 11px;">Aardgas gebruik</span> <span style="color: #212529; font-weight: 500;">${config.gasUsage === 'yes' ? 'Ja' : config.gasUsage === 'no' ? 'Nee' : '-'}</span></div>`;
      html += `</div>`;

      // Company details section
      if (config.companyName || config.kvkNumber) {
        html += '<div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e9ecef;"><strong style="color: #FFC012; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Bedrijfsgegevens</strong></div>';
        html += `<div style="margin-bottom: 12px;">`;
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">Bedrijfsnaam</span> <span style="color: #212529; font-weight: 500;">${config.companyName || '-'}</span></div>`;
        html += `<div style="display: flex; justify-content: space-between;"><span style="color: #868e96; font-size: 11px;">KvK-nummer</span> <span style="color: #212529; font-weight: 500;">${config.kvkNumber || '-'}</span></div>`;
        html += `</div>`;
      }

      // Contact person section
      if (config.contactInitials || config.contactLastName) {
        html += '<div style="margin-bottom: 12px; padding-bottom: 8px; border-bottom: 1px solid #e9ecef;"><strong style="color: #FFC012; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Contactpersoon Intermediair</strong></div>';
        html += `<div style="margin-bottom: 12px;">`;
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">Naam</span> <span style="color: #212529; font-weight: 500;">${config.contactInitials || ''} ${config.contactLastName || '-'}</span></div>`;
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">Geslacht</span> <span style="color: #212529; font-weight: 500;">${config.contactGender === 'male' ? 'Man' : 'Vrouw'}</span></div>`;
        html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">Telefoon</span> <span style="color: #212529; font-weight: 500;">${config.contactPhone || '-'}</span></div>`;
        html += `<div style="display: flex; justify-content: space-between;"><span style="color: #868e96; font-size: 11px;">E-mail</span> <span style="color: #212529; font-weight: 500;">${config.contactEmail || '-'}</span></div>`;
        html += `</div>`;
      }

      // Documents section
      html += '<div style="margin-bottom: 8px; padding-bottom: 8px; border-bottom: 1px solid #e9ecef;"><strong style="color: #FFC012; font-size: 12px; text-transform: uppercase; letter-spacing: 0.5px;">Documenten</strong></div>';
      html += `<div>`;
      const betaalbewijsStatus = (config.betaalbewijs ? '✅ ' + config.betaalbewijs.name : (config.betaalbewijsKey ? '✅ Geüpload' : '❌ Niet geüpload'));
      const factuurStatus = (config.factuur ? '✅ ' + config.factuur.name : (config.factuurKey ? '✅ Geüpload' : '❌ Niet geüpload'));
      const machtigingsbewijsStatus = (config.machtigingsbewijs ? '✅ ' + config.machtigingsbewijs.name : (config.machtigingsbewijsKey ? '✅ Geüpload' : '⚪ Optioneel'));
      html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">Betaalbewijs</span> <span style="color: #212529; font-weight: 500; font-size: 11px;">${betaalbewijsStatus}</span></div>`;
      html += `<div style="display: flex; justify-content: space-between; margin-bottom: 4px;"><span style="color: #868e96; font-size: 11px;">Factuur</span> <span style="color: #212529; font-weight: 500; font-size: 11px;">${factuurStatus}</span></div>`;
      html += `<div style="display: flex; justify-content: space-between;"><span style="color: #868e96; font-size: 11px;">Machtigingsbewijs</span> <span style="color: #212529; font-weight: 500; font-size: 11px;">${machtigingsbewijsStatus}</span></div>`;
      html += `</div>`;

      html += '</div>';

      content.innerHTML = html;
      container.style.display = 'block';
      icon.textContent = '▼';
    } else {
      // Hide config data
      container.style.display = 'none';
      icon.textContent = '▶';
    }
  });

  // -------------------------------------------------------------------------
  // Event Handler: Pauze knop
  // -------------------------------------------------------------------------
  // Pauzeert de automatisering. Alle actieve timeouts worden gewist en de
  // automatisering stopt totdat de gebruiker op "Hervat" klikt.
  document.getElementById('pause-automation').addEventListener('click', () => {
    console.log('⏸ Pause automation clicked');
    automationPaused = true;

    // Stop alle actieve timeouts (maar behoud de array voor status tracking)
    console.log(`⏸ Pausing - clearing ${activeTimeouts.length} active timeouts`);
    activeTimeouts.forEach(timeoutId => clearTimeout(timeoutId));
    activeTimeouts = [];

    // Update UI - verberg pauze knop, toon hervat knop
    document.getElementById('pause-automation').style.display = 'none';
    document.getElementById('continue-automation').style.display = 'block';

    updateStatus('⏸ Gepauzeerd - klik Hervat om door te gaan', 'GEPAUZEERD');
    console.log('✅ Automation paused - all pending actions stopped. Click Hervat to continue from current step.');
  });

  // -------------------------------------------------------------------------
  // Event Handler: Hervat/Doorgaan knop
  // -------------------------------------------------------------------------
  // Hervat de automatisering na een pauze of handmatige interventie.
  // Reset loop detectie tellers omdat de gebruiker handmatig heeft ingegrepen.
  document.getElementById('continue-automation').addEventListener('click', () => {
    const config = JSON.parse(sessionStorage.getItem('automationConfig') || '{}');

    // Als gepauzeerd, hervat de automatisering
    if (automationPaused) {
      console.log('▶ Resume automation clicked');
      automationPaused = false;

      // Reset loop detectie tellers na hervatten (gebruiker heeft handmatig ingegrepen)
      lastExecutedStep = null;
      stepExecutionCount = 0;
      console.log('🔄 Loop detection counters reset after manual intervention');

      // Update UI - toon pauze knop, verberg hervat knop
      document.getElementById('pause-automation').style.display = 'block';
      document.getElementById('continue-automation').style.display = 'none';

      updateStatus('▶ Hervatten...', 'Hervatten');
      startFullAutomation(config);
      return;
    }

    // Handmatig doorgaan (niet vanuit pauze)
    console.log('🔄 Manual continue clicked, resuming automation');

    // Controleer of meldcode modal open is en forceer stap naar meldcode_lookup_opened
    const modalOpen = Array.from(document.querySelectorAll('*')).some(el =>
      el.textContent && el.textContent.includes('Selecteer hier uw keuze')
    );

    if (modalOpen) {
      console.log('✅ Meldcode modal detected, setting step to meldcode_lookup_opened');
      sessionStorage.setItem('automationStep', 'meldcode_lookup_opened');
    }

    updateStatus('Automatisering hervatten...', 'Doorgaan');
    startFullAutomation(config);
  });

  // -------------------------------------------------------------------------
  // Event Handler: Stop knop
  // -------------------------------------------------------------------------
  // Stopt de automatisering volledig. Wist alle timeouts, reset alle vlaggen,
  // verwijdert het paneel en wist de automatisering status uit sessionStorage.
  document.getElementById('stop-automation').addEventListener('click', (e) => {
    // Prevent event bubbling
    e.preventDefault();
    e.stopPropagation();

    console.log('❌ ========================================');
    console.log('❌ STOP BUTTON CLICKED - FORCE STOPPING');
    console.log('❌ ========================================');

    // DIRECT paneel verwijderen voor immediate feedback
    const panelToRemove = document.getElementById('isde-automation-panel');
    if (panelToRemove) {
      panelToRemove.style.opacity = '0.3';
      panelToRemove.style.pointerEvents = 'none';
      console.log('🔒 Panel locked - removing...');
    }

    // Zet globale vlaggen om automatisering te stoppen
    automationStopped = true;
    automationPaused = false;

    // Reset loop detectie tellers
    lastExecutedStep = null;
    stepExecutionCount = 0;

    // Stop keep-alive audio
    try {
      stopKeepAlive();
      console.log('✅ Keep-alive audio stopped');
    } catch (error) {
      console.log('⚠️ Error stopping keep-alive:', error);
    }

    // Wis alle wachtende timeouts
    try {
      clearAllTimeouts();
      console.log('✅ All timeouts cleared');
    } catch (error) {
      console.log('⚠️ Error clearing timeouts:', error);
    }

    // KRITIEK: Zet persistent stop flag in sessionStorage
    sessionStorage.setItem('automationStoppedByUser', 'true');
    console.log('✅ Persistent stop flag set');

    // Wis alle automatisering status uit sessionStorage
    sessionStorage.removeItem('automationConfig');
    sessionStorage.removeItem('automationStep');
    sessionStorage.removeItem('lastNieuweAanvraagClick');
    console.log('✅ Session storage cleared');

    // Wis crash recovery data voor deze specifieke tab
    const recoveryKey = `automation_recovery_${currentTabId}`;
    chrome.storage.local.remove(recoveryKey, () => {
      console.log(`✅ Recovery data removed for tab ${currentTabId}`);
    });

    // Sluit alle open modals (warmtepomp wizard, meldcode lookup, etc.)
    try {
      // Strategy 1: Trigger ESC key to close modals
      const escEvent = new KeyboardEvent('keydown', {
        key: 'Escape',
        code: 'Escape',
        keyCode: 27,
        which: 27,
        bubbles: true,
        cancelable: true
      });
      document.dispatchEvent(escEvent);

      // Strategy 2: Find and click close buttons
      const closeButtons = document.querySelectorAll('button[title="Sluiten"], button[aria-label="Sluiten"], .close, .modal-close, [class*="close"]');
      closeButtons.forEach(btn => {
        if (btn.offsetParent !== null) {
          btn.click();
        }
      });

      // Strategy 3: Remove any overlay/backdrop elements
      const overlays = document.querySelectorAll('.modal-backdrop, .overlay, [class*="backdrop"], [class*="overlay"]');
      overlays.forEach(overlay => overlay.remove());

      console.log('✅ Modals closed');
    } catch (error) {
      console.log('⚠️ Error closing modals:', error);
    }

    // Verwijder het paneel volledig na korte delay voor visuele feedback
    setTimeout(() => {
      const finalPanel = document.getElementById('isde-automation-panel');
      if (finalPanel) {
        finalPanel.remove();
        console.log('✅ Panel removed');
      }
      console.log('❌ ========================================');
      console.log('❌ AUTOMATION STOPPED COMPLETELY');
      console.log('❌ ========================================');
    }, 100);
  });
}

/**
 * Update de status weergave in het paneel.
 *
 * @param {string} message - Het statusbericht om weer te geven
 * @param {string} step - De huidige stap naam
 * @param {string} detectedStep - De gedetecteerde stap (optioneel)
 */
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

// ============================================================================
// SECTIE 4: MESSAGE LISTENER VOOR COMMUNICATIE MET POPUP/BACKGROUND
// ============================================================================

/**
 * Luistert naar berichten van de popup of background script.
 * Ondersteunde acties:
 * - 'startAutomation': Start de volledige automatisering met de meegegeven config
 * - 'fillCurrentPage': Vult alleen de huidige pagina (voor testen)
 *
 * Bij 'startAutomation':
 * 1. Reset alle vlaggen en timeouts
 * 2. Creëert status paneel
 * 3. Haalt bestandsgegevens op uit chrome.storage.local
 * 4. Start de automatisering loop
 */
chrome.runtime.onMessage.addListener((request, _sender, sendResponse) => {
  if (request.action === 'startAutomation') {
    console.log('Starting automation with config:', request.config);
    // Reset vlaggen bij het starten van nieuwe automatisering
    automationStopped = false;
    automationPaused = false;
    // Wis persistent stop flag - nieuwe automatisering start
    sessionStorage.removeItem('automationStoppedByUser');
    // Reset loop detectie tellers
    lastExecutedStep = null;
    stepExecutionCount = 0;
    // Wis alle wachtende timeouts van vorige runs
    clearAllTimeouts();

    // Detecteer huidige pagina EERST (voordat we iets wissen)
    const currentDetectedStep = detectCurrentStep();
    console.log('🎯 === PAGE DETECTION RESULT ===');
    console.log('Detected step:', currentDetectedStep);

    // WIS OUDE RECOVERY DATA - gebruiker start VERSE automatisering
    const recoveryKey = `automation_recovery_${currentTabId}`;
    chrome.storage.local.remove(recoveryKey, () => {
      console.log(`🧹 Oude recovery data verwijderd voor tab ${currentTabId} (verse start)`);
    });

    // Sla nieuwe config op IN SESSIONSTORAGE VOORDAT we oude data wissen
    // Dit voorkomt dat recovery modal verschijnt bij page navigation
    sessionStorage.setItem('automationConfig', JSON.stringify(request.config));

    // Als we op een bekende pagina zijn (niet start/unknown), begin daar
    if (currentDetectedStep !== 'start' && currentDetectedStep !== 'unknown') {
      console.log('✅ Starting automation from CURRENT page:', currentDetectedStep);
      sessionStorage.setItem('automationStep', currentDetectedStep);
      updateStatus(`Automatisering gestart vanaf: ${currentDetectedStep}`, 'Detectie succesvol');
    } else if (currentDetectedStep === 'start') {
      console.log('✅ Starting automation from START page');
      sessionStorage.setItem('automationStep', 'start');
      updateStatus('Automatisering gestart vanaf startpagina', 'Begin');
    } else {
      console.error('❌ COULD NOT DETECT CURRENT PAGE - cannot start automation');
      console.error('Please navigate to a recognized page or the start page');

      updateStatus(
        '⚠️ Kan huidige pagina niet herkennen. Navigeer naar een bekende pagina of de startpagina en probeer opnieuw.',
        'DETECTIE MISLUKT'
      );

      return; // Stop - start automatisering niet
    }

    console.log('Cleared old automation state, starting fresh');

    // Start audio keep-alive om tab throttling te voorkomen
    startKeepAlive();

    createStatusPanel();
    updateStatus('Automatisering gestart', 'Initialiseren');

    // Toon belangrijke waarschuwing: houd tab actief
    const initialWarning = document.createElement('div');
    initialWarning.style.cssText = `
      position: fixed;
      top: 80px;
      right: 20px;
      background: #d1ecf1;
      border: 2px solid #17a2b8;
      border-radius: 8px;
      padding: 14px 18px;
      max-width: 320px;
      font-size: 13px;
      color: #0c5460;
      z-index: 10001;
      box-shadow: 0 4px 12px rgba(0,0,0,0.15);
      line-height: 1.5;
    `;
    initialWarning.innerHTML = `
      <strong>✅ Multi-tab ondersteuning actief!</strong><br>
      Dit tabblad kan op de achtergrond draaien zonder vertraging.
      Je kunt <strong>meerdere tabs tegelijk</strong> laten runnen.
    `;
    document.body.appendChild(initialWarning);

    // Verwijder waarschuwing na 8 seconden
    setTimeout(() => {
      initialWarning.remove();
    }, 8000);

    // Haal bestandsgegevens op uit chrome.storage.local als er keys zijn opgegeven
    // Dit is nodig omdat bestanden niet direct via messages kunnen worden verzonden
    const filesToRetrieve = [];
    if (request.config.betaalbewijsKey) filesToRetrieve.push(request.config.betaalbewijsKey);
    if (request.config.factuurKey) filesToRetrieve.push(request.config.factuurKey);
    if (request.config.machtigingsbewijsKey) filesToRetrieve.push(request.config.machtigingsbewijsKey);

    if (filesToRetrieve.length > 0) {
      console.log('📥 Retrieving files from chrome.storage.local:', filesToRetrieve);
      chrome.storage.local.get(filesToRetrieve, (result) => {
        // Vervang keys met daadwerkelijke bestandsgegevens
        if (request.config.betaalbewijsKey) {
          request.config.betaalbewijs = result[request.config.betaalbewijsKey];
          delete request.config.betaalbewijsKey;
        }
        if (request.config.factuurKey) {
          request.config.factuur = result[request.config.factuurKey];
          delete request.config.factuurKey;
        }
        if (request.config.machtigingsbewijsKey) {
          request.config.machtigingsbewijs = result[request.config.machtigingsbewijsKey];
          delete request.config.machtigingsbewijsKey;
        }

        console.log('✅ Files retrieved successfully for session:', request.config.sessionId);
        startFullAutomation(request.config);

        // Ruim opslag op nadat automatisering klaar is (60 seconden is voldoende)
        // Elk tabblad heeft een unieke sessie ID, dus dit verwijdert alleen bestanden van DIT tabblad
        setTimeout(() => {
          chrome.storage.local.remove(filesToRetrieve, () => {
            console.log('🧹 Cleaned up temporary files from storage for session:', request.config.sessionId);
          });
        }, 60000); // 60 seconden - genoeg tijd voor bestand upload stap
      });
    } else {
      startFullAutomation(request.config);
    }

    sendResponse({status: 'started'});
    return false;
  } else if (request.action === 'fillCurrentPage') {
    fillCurrentPage(request.config);
    sendResponse({status: 'success', message: 'Current page filled!'});
  }
});

// ============================================================================
// SECTIE 5: HELPER FUNCTIES VOOR DOM INTERACTIE
// ============================================================================

/**
 * Wacht tot een element met de opgegeven CSS selector verschijnt in de DOM.
 * Gebruikt polling elke 100ms om te controleren of het element aanwezig is.
 *
 * @param {string} selector - CSS selector van het element
 * @param {number} timeout - Maximale wachttijd in milliseconden (standaard: 10000)
 * @returns {Promise<Element>} Het gevonden element
 * @throws {Error} Als het element niet wordt gevonden binnen de timeout
 */
function waitForElement(selector, timeout = 10000) {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now();

    const checkElement = async () => {
      // CHECK: Stop flag
      if (automationStopped) {
        reject(new Error('Automation stopped'));
        return;
      }

      // CHECK: Pause flag - wait but don't advance
      if (automationPaused) {
        await unthrottledDelay(100);
        checkElement();
        return;
      }

      const element = document.querySelector(selector);
      if (element) {
        resolve(element);
      } else if (Date.now() - startTime > timeout) {
        reject(new Error(`Element ${selector} not found within timeout`));
      } else {
        await unthrottledDelay(100);
        checkElement();
      }
    };

    checkElement();
  });
}

/**
 * Wacht tot een element (link) met de opgegeven tekstinhoud verschijnt.
 * Zoekt specifiek naar <a> elementen die de zoektekst bevatten.
 *
 * @param {string} searchText - De tekst om naar te zoeken in link elementen
 * @param {number} timeout - Maximale wachttijd in milliseconden (standaard: 10000)
 * @returns {Promise<Element>} Het gevonden link element
 * @throws {Error} Als het element niet wordt gevonden binnen de timeout
 */
function waitForElementByText(searchText, timeout = 10000) {
  return new Promise(async (resolve, reject) => {
    const startTime = Date.now();

    const checkElement = async () => {
      // CHECK: Stop flag
      if (automationStopped) {
        reject(new Error('Automation stopped'));
        return;
      }

      // CHECK: Pause flag - wait but don't advance
      if (automationPaused) {
        await unthrottledDelay(100);
        checkElement();
        return;
      }

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
        await unthrottledDelay(100);
        checkElement();
      }
    };

    checkElement();
  });
}

/**
 * Klikt op een element met mensachtig gedrag.
 * Scrolt eerst het element in beeld, wacht even, en klikt dan.
 * Controleert voor en tijdens elke stap of de automatisering is gepauzeerd of gestopt.
 *
 * @param {string|Element} selectorOrElement - CSS selector of het element zelf
 */
async function clickElement(selectorOrElement) {
  // Controleer of automatisering is gestopt (niet gepauzeerd - pauze wordt afgehandeld door delays)
  if (automationStopped) {
    console.log('❌ Click cancelled - automation stopped');
    return;
  }

  // Verkrijg het element (ofwel via selector ofwel gebruik direct element)
  let element;
  if (typeof selectorOrElement === 'string') {
    element = await waitForElement(selectorOrElement);
  } else {
    element = selectorOrElement;
  }

  // Controleer opnieuw na wachten
  if (automationStopped) {
    console.log('❌ Click cancelled - automation stopped');
    return;
  }

  // Scroll element in beeld (mensachtig gedrag)
  element.scrollIntoView({behavior: 'smooth', block: 'center'});
  await unthrottledDelay(500); // Delay zal pauzeren als automationPaused=true

  // Laatste controle voor de klik
  if (automationStopped) {
    console.log('❌ Click cancelled - automation stopped');
    return;
  }

  // Voer de klik uit en wacht daarna
  element.click();
  await unthrottledDelay(1000); // Delay zal pauzeren als automationPaused=true
}

/**
 * Vult een invoerveld met de opgegeven waarde.
 * Simuleert mensachtig gedrag door:
 * - Element in beeld te scrollen
 * - Willekeurige vertragingen toe te voegen
 * - Veld te focussen voor het invullen
 * - Input events te triggeren
 *
 * Bevat speciale sanitatie logica voor:
 * - Telefoonnummers (verwijdert spaties, streepjes)
 * - IBAN nummers (corrigeert OCR fouten, verwijdert BIC codes)
 *
 * @param {string} selector - CSS selector van het invoerveld
 * @param {string} value - De waarde om in te vullen
 */
async function fillInput(selector, value) {
  if (!value) return;

  // Controleer of automatisering is gestopt (niet gepauzeerd - pauze wordt afgehandeld door delays)
  if (automationStopped) {
    console.log('❌ Fill cancelled - automation stopped');
    return;
  }

  // Wacht op het element en scroll in beeld
  const element = await waitForElement(selector);
  element.scrollIntoView({behavior: 'smooth', block: 'center'});
  await unthrottledDelay(400 + Math.random() * 200); // Delay zal pauzeren als automationPaused=true

  if (automationStopped) {
    console.log('❌ Fill cancelled - automation stopped');
    return;
  }

  // Focus het veld eerst (mensachtig gedrag)
  element.focus();
  await unthrottledDelay(250 + Math.random() * 150); // Delay zal pauzeren als automationPaused=true

  if (automationStopped) {
    console.log('❌ Fill cancelled - automation stopped');
    return;
  }

  // Wis bestaande waarde eerst
  element.value = '';
  element.dispatchEvent(new Event('input', { bubbles: true }));
  await unthrottledDelay(150 + Math.random() * 100); // Delay zal pauzeren als automationPaused=true

  // Saniteer waarden op basis van veldtype
  let sanitizedValue = value;

  // -------------------------------------------------------------------------
  // Telefoonnummer sanitatie
  // -------------------------------------------------------------------------
  // Verwijdert streepjes, spaties en andere leestekens uit telefoonnummers
  if (selector.includes('Telefoon') || selector.includes('telefoon')) {
    // Behoud alleen cijfers en het + teken
    sanitizedValue = value.replace(/[^0-9+]/g, '');
    console.log(`📞 Sanitized phone: "${value}" → "${sanitizedValue}"`);
  }

  // -------------------------------------------------------------------------
  // IBAN sanitatie
  // -------------------------------------------------------------------------
  // Corrigeert veelvoorkomende OCR fouten en verwijdert BIC codes
  if (selector.includes('IBAN') || selector.includes('iban')) {
    console.log(`🏦 Original IBAN value: "${value}"`);

    // Verwijder punten/perioden die OCR mogelijk heeft toegevoegd
    sanitizedValue = sanitizedValue.replace(/\./g, '');

    // Verwijder BIC codes (zoals RABONL2U, ABNANL2A, etc.)
    // BIC is 8-11 tekens: 4 letters (bank) + 2 letters (land) + 2 tekens (locatie) + optioneel 3 tekens (filiaal)
    // Veelvoorkomend patroon: RABONL2U, ABNANL2A, INGBNL2A
    // Verwijder elke achtergebleven hoofdletter reeks die lijkt op een BIC na het IBAN
    sanitizedValue = sanitizedValue.replace(/([A-Z]{4}[A-Z]{2}[A-Z0-9]{2}([A-Z0-9]{3})?)$/g, '');

    // Corrigeer OCR fouten: O→0, I/l→1, S→5
    // Pas dit alleen toe in het cijfergedeelte (na NL)
    if (sanitizedValue.toUpperCase().startsWith('NL')) {
      // Remove all spaces first to work with clean IBAN
      const cleanIban = sanitizedValue.replace(/\s/g, '');

      // Extract just the IBAN part (NL + 16 characters = 18 total)
      // Pattern: NL + 2 digits + 4 letters + 10 digits
      const ibanMatch = cleanIban.match(/^(NL[0-9]{2}[A-Z]{4}[0-9]{10})/i);

      if (ibanMatch) {
        // IBAN structure: NL + 2 digits + 4 LETTERS + 10 digits
        // Only fix OCR errors in digit parts, NOT in the 4-letter bank code
        const nlPrefix = ibanMatch[1].substring(0, 2).toUpperCase(); // NL
        const checkDigits = ibanMatch[1].substring(2, 4); // 2 digits
        const bankCode = ibanMatch[1].substring(4, 8).toUpperCase(); // 4 LETTERS (RABO, INGB, etc.)
        const accountNumber = ibanMatch[1].substring(8); // 10 digits

        // Fix OCR errors ONLY in check digits (O→0, I→1, etc.)
        const fixedCheckDigits = checkDigits
          .replace(/O/g, '0')
          .replace(/I/g, '1')
          .replace(/l/g, '1')
          .replace(/S/g, '5')
          .replace(/Y/g, '4');

        // Fix OCR errors ONLY in account number (O→0, I→1, etc.)
        const fixedAccountNumber = accountNumber
          .replace(/O/g, '0')
          .replace(/I/g, '1')
          .replace(/l/g, '1')
          .replace(/S/g, '5');

        // Bank code stays as LETTERS (don't convert O to 0 here!)
        sanitizedValue = nlPrefix + fixedCheckDigits + bankCode + fixedAccountNumber;
        console.log(`🏦 Sanitized IBAN (matched pattern): "${value}" → "${sanitizedValue}"`);
      } else {
        // Fallback: assume structure and clean up carefully
        const nlPrefix = sanitizedValue.substring(0, 2).toUpperCase();
        const rest = sanitizedValue.substring(2).replace(/\s/g, '').substring(0, 16);

        if (rest.length >= 6) {
          // Extract parts: 2 check digits + 4 bank letters + up to 10 account digits
          const checkDigits = rest.substring(0, 2);
          const bankCode = rest.substring(2, 6).toUpperCase(); // Keep as letters
          const accountNumber = rest.substring(6);

          // Fix OCR only in digit parts
          const fixedCheckDigits = checkDigits
            .replace(/O/g, '0')
            .replace(/I/g, '1')
            .replace(/l/g, '1')
            .replace(/S/g, '5');

          const fixedAccountNumber = accountNumber
            .replace(/O/g, '0')
            .replace(/I/g, '1')
            .replace(/l/g, '1')
            .replace(/S/g, '5');

          sanitizedValue = nlPrefix + fixedCheckDigits + bankCode + fixedAccountNumber;
          console.log(`🏦 Sanitized IBAN (fallback with structure): "${value}" → "${sanitizedValue}"`);
        } else {
          // Can't parse structure, just keep as-is
          sanitizedValue = nlPrefix + rest.toUpperCase();
          console.log(`🏦 Sanitized IBAN (fallback minimal): "${value}" → "${sanitizedValue}"`);
        }
      }
    }
  }

  // Paste the sanitized value
  element.value = sanitizedValue;
  element.dispatchEvent(new Event('input', { bubbles: true }));

  await unthrottledDelay(200 + Math.random() * 150);

  element.dispatchEvent(new Event('change', { bubbles: true }));

  await unthrottledDelay(150 + Math.random() * 100);

  element.blur();
  await unthrottledDelay(300 + Math.random() * 200); // Wait after to let validation complete
}

/**
 * Upload een bestand naar een file input veld.
 * Converteert base64 data naar een File object en simuleert een bestandsselectie.
 *
 * @param {Object} fileData - Object met bestandsgegevens
 * @param {string} fileData.data - Base64 encoded bestandsdata
 * @param {string} fileData.name - Bestandsnaam
 * @param {string} fileData.type - MIME type van het bestand
 * @throws {Error} Als het uploaden mislukt
 */
async function uploadFile(fileData) {
  if (!fileData) return;

  try {
    // Zoek het file input element (zit in de modal)
    const fileInput = await waitForElement('#lip_modalWindow div.content input[type="file"], #lip_attachments_resumable input[type="file"]', 5000);

    // Converteer base64 data naar Blob
    const response = await fetch(fileData.data);
    const blob = await response.blob();

    // Creëer een File object van de Blob
    const file = new File([blob], fileData.name, { type: fileData.type });

    // Creëer DataTransfer om bestandsselectie te simuleren
    const dataTransfer = new DataTransfer();
    dataTransfer.items.add(file);
    fileInput.files = dataTransfer.files;

    // Trigger change event om het formulier te notificeren
    fileInput.dispatchEvent(new Event('change', { bubbles: true }));

    console.log('File uploaded successfully:', fileData.name);
  } catch (error) {
    console.error('Error uploading file:', error);
    throw error;
  }
}

/**
 * Vult de huidige pagina met gegevens uit de configuratie.
 * Wordt gebruikt voor testen of handmatig invullen.
 * Zoekt naar bekende velden en vult deze in met de juiste waarden.
 *
 * @param {Object} config - Configuratie object met gebruikersgegevens
 */
function fillCurrentPage(config) {
  // Persoonlijke informatie en bedrijfsvelden
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

  // Contact person fields - try multiple possible selectors
  const contactFields = [
    {
      selectors: [
        '#link_int\\.0\\.edVoorletters',
        '#link_int\\.0\\.link_int_persoon\\.0\\.edVoorletters',
        '#link_int\\.0\\.link_int_organisatie\\.0\\.edVoorletters'
      ],
      value: config.contactInitials
    },
    {
      selectors: [
        '#link_int\\.0\\.edAchternaam',
        '#link_int\\.0\\.link_int_persoon\\.0\\.edAchternaam',
        '#link_int\\.0\\.link_int_organisatie\\.0\\.edAchternaam'
      ],
      value: config.contactLastName
    },
    {
      selectors: [
        '#link_int\\.0\\.link_int_telefoon\\.0\\.edTelefoonField',
        '#link_int\\.0\\.link_int_persoon\\.0\\.link_int_persoon_telefoon\\.0\\.edTelefoonField',
        '#link_int\\.0\\.link_int_organisatie\\.0\\.link_int_organisatie_telefoon\\.0\\.edTelefoonField'
      ],
      value: config.contactPhone
    },
    {
      selectors: [
        '#link_int\\.0\\.link_int_email\\.0\\.edEmailField',
        '#link_int\\.0\\.link_int_persoon\\.0\\.link_int_persoon_email\\.0\\.edEmailField',
        '#link_int\\.0\\.link_int_organisatie\\.0\\.link_int_organisatie_email\\.0\\.edEmailField'
      ],
      value: config.contactEmail
    }
  ];

  contactFields.forEach(({ selectors, value }) => {
    if (value) {
      for (const selector of selectors) {
        const field = document.querySelector(selector);
        if (field) {
          field.value = value;
          field.dispatchEvent(new Event('change', { bubbles: true }));
          break;
        }
      }
    }
  });
}

// ============================================================================
// SECTIE 6: STAP DETECTIE FUNCTIE
// ============================================================================

/**
 * Detecteert de huidige stap in het aanvraagproces door de DOM te analyseren.
 * Dit is de PRIMAIRE manier om te bepalen waar we zijn - betrouwbaarder dan sessionStorage.
 *
 * De functie controleert van meest specifiek naar minst specifiek om false positives te voorkomen.
 *
 * Stappenlijst (in volgorde van controle):
 * 1. final_confirmed - Eindvoorwaarden pagina met indienen knop
 * 2. final_review_page - Finale review pagina (Verzenden tab)
 * 3. final_confirmation - Finale bevestigingsvraag
 * 4. vervolgstap_modal - Vervolgstap modal na bestand upload
 * 5. measure_confirmation_dialog - "Zijn alle maatregelen toegevoegd?" dialoog
 * 6. final_measure_overview - Finale maatregel overzicht met subsidiebedrag
 * 7. measure_overview - Maatregel toegevoegd pagina
 * 8. meldcode_selected - Bestand upload pagina
 * 9. meldcode_lookup_opened - Meldcode lookup tabel/modal
 * 10. date_continued - Meldcode lookup knop zichtbaar
 * 11. meldcode_search_in_wizard - Meldcode zoeken binnen warmtepomp wizard
 * 12. warmtepomp_selected - Installatie datum modal
 * 13. measure_added - Warmtepomp selectie modal
 * 14. bag_different_done - Maatregel toevoegen pagina
 * 15. bag_address_form - Installatie adres formulier
 * 16. address_different_done - BAG pagina
 * 17. correspondence_done - Adres pagina
 * 18. personal_info_done - Intermediair pagina
 * 19. info_acknowledged - Persoonlijke gegevens pagina
 * 20. declarations_done - Info bevestiging pagina
 * 21. first_volgende_clicked - Verklaringen pagina
 * 22. isde_selected - Eerste Volgende pagina
 * 23. nieuwe_aanvraag_clicked - ISDE catalogus pagina
 * 24. start - Hoofdpagina
 * 25. unknown - Geen overeenkomende elementen gevonden
 *
 * @returns {string} De gedetecteerde stap naam
 */
function detectCurrentStep() {
  console.log('🔍 === STARTING PAGE DETECTION ===');
  console.log('Current URL:', window.location.href);
  console.log('Page title:', document.title);

  // Controleer van meest specifiek naar minst specifiek om false matches te voorkomen

  // -------------------------------------------------------------------------
  // Stap 20: Eindvoorwaarden pagina
  // -------------------------------------------------------------------------
  // Moet BEIDE elementen hebben: akkoord checkbox EN indienen knop
  if (document.querySelector('#cbAccoord') && document.querySelector('input[value="Indienen"]')) {
    console.log('🎯 Detected: final_confirmed - Terms page with submit button');
    return 'final_confirmed';
  }

  // -------------------------------------------------------------------------
  // Stap 19.5: Finale review pagina (Verzenden tab - "Controleer uw gegevens")
  // -------------------------------------------------------------------------
  // CONTROLEER DIT VROEG om false positives van eerdere stappen te voorkomen
  const hasControleerGegevens = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && el.textContent.includes('Controleer uw gegevens')
  );
  const hasVerzendenTab = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && el.textContent.includes('Verzenden')
  );
  const hasIntroductieTab = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && el.textContent.includes('Introductie')
  );
  const hasFormulierTab = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && el.textContent.includes('Formulier')
  );

  // More relaxed check - just need "Controleer uw gegevens" OR (Verzenden tab + Introductie/Formulier tabs)
  if (hasControleerGegevens || (hasVerzendenTab && (hasIntroductieTab || hasFormulierTab))) {
    // Additional check: if we see the yellow "Verzenden" tab (indicating we're on that tab)
    const isOnVerzendenTab = Array.from(document.querySelectorAll('.tabs-selected, .tab-active, [class*="selected"], [class*="active"]')).some(el =>
      el.textContent && el.textContent.includes('Verzenden')
    );

    if (isOnVerzendenTab || hasControleerGegevens) {
      console.log('🎯 Detected: final_review_page - Final review page (Verzenden tab)');
      return 'final_review_page';
    }
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
  // BUT ONLY if we're NOT on the final review page (which also has these fields visible)
  if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.DatumAangeschaft') &&
      document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.DatumInstallatie') &&
      !hasControleerGegevens && !hasVerzendenTab) {
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
  // Check for "Kadaster gegevens" or "Installatieadres" section which is unique to this page
  const hasKadasterSection = Array.from(document.querySelectorAll('*')).some(el =>
    el.textContent && (
      el.textContent.includes('Kadaster gegevens') ||
      el.textContent.includes('Installatieadres')
    )
  );

  // Also check for the specific page title or header
  const hasInstallatieadresTitle = Array.from(document.querySelectorAll('h1, h2, h3, .page-title, [class*="title"]')).some(el =>
    el.textContent && el.textContent.includes('Installatieadres')
  );

  if ((hasKadasterSection || hasInstallatieadresTitle) && document.querySelector('input[value="Volgende"]')) {
    console.log('🎯 Detected: bag_address_form - Installation address form');
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

  // Step 2.5: Maatregel catalog page (after clicking "Maatregel toevoegen" button)
  // This page shows different measure types: Warmtepomp, Isolatie, Zonneboiler, etc.
  // Each has a "Selecteren" button next to it
  // IMPORTANT: This should NOT match the measure overview page (which has Wijzig/Verwijder)
  const hasMaatregelSelecterenButtons = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"], button')).some(btn =>
    (btn.value && btn.value.trim() === 'Selecteren') ||
    (btn.textContent && btn.textContent.trim() === 'Selecteren')
  );

  // Check for page title "Maatregel selecteren"
  const hasMaatregelSelecterenTitle = Array.from(document.querySelectorAll('h1, h2, h3, .page-title, [class*="title"]')).some(el =>
    el.textContent && el.textContent.includes('Maatregel selecteren')
  );

  // Check that we're NOT on the measure overview page (which has "Wijzig" button)
  const hasWijzigButton = Array.from(document.querySelectorAll('input[type="submit"], input[type="button"]')).some(btn =>
    btn.value && btn.value.trim() === 'Wijzig'
  );

  // Only detect catalog if we have the title OR selecteren buttons, AND we don't have Wijzig button
  if ((hasMaatregelSelecterenButtons || hasMaatregelSelecterenTitle) && !hasWijzigButton) {
    console.log('🎯 Detected: measure_catalog_page - Maatregel selecteren catalog');
    return 'measure_catalog_page';
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

// ============================================================================
// SECTIE 7: HOOFD AUTOMATISERING FUNCTIE
// ============================================================================

/**
 * Hoofdfunctie voor volledige ISDE subsidie automatisering.
 * Volgt exact de opgenomen workflow door alle stappen heen.
 *
 * Werking:
 * 1. Controleert of automatisering gestopt/gepauzeerd is
 * 2. Detecteert huidige stap via DOM analyse
 * 3. Vergelijkt met sessionStorage voor betrouwbaarheid
 * 4. Voert loop detectie uit om infinite loops te voorkomen
 * 5. Voert acties uit voor de huidige stap
 * 6. Navigeert naar volgende stap
 * 7. Herhaalt tot volledige aanvraag is ingediend
 *
 * Loop detectie:
 * - Houdt bij hoeveel keer dezelfde stap wordt uitgevoerd
 * - Pauzeert automatisch na MAX_STEP_RETRIES pogingen
 * - Voorkomt infinite loops en vraagt om handmatige interventie
 *
 * Pauze/Stop mechanisme:
 * - Controleert voor elke actie of gebruiker heeft gepauzeerd/gestopt
 * - Stopt direct bij stop commando
 * - Wacht bij pauze tot gebruiker op "Hervat" klikt
 *
 * @param {Object} config - Configuratie object met alle gebruikersgegevens en bestanden
 */
async function startFullAutomation(config) {
  // -------------------------------------------------------------------------
  // Kritische controles: stop en pauze
  // -------------------------------------------------------------------------
  if (automationStopped) {
    console.log('❌ Automation stopped by user, not continuing');
    clearAllTimeouts(); // Wis alle wachtende timeouts
    return;
  }

  if (automationPaused) {
    console.log('⏸ Automation paused by user, waiting for resume');
    return;
  }

  try {
    const currentUrl = window.location.href;
    console.log('Current URL:', currentUrl);

    // Dubbele controle dat automatisering niet gestopt of gepauzeerd is
    if (automationStopped) {
      console.log('❌ Automation stopped during execution');
      return;
    }

    if (automationPaused) {
      console.log('⏸ Automation paused during execution');
      return;
    }

    // -------------------------------------------------------------------------
    // Stap detectie: Combineer DOM analyse met sessionStorage
    // -------------------------------------------------------------------------
    const detectedStep = detectCurrentStep();
    const sessionStep = sessionStorage.getItem('automationStep') || 'start';

    console.log('Detected step from DOM:', detectedStep);
    console.log('Session step:', sessionStep);

    // BELANGRIJK: Vertrouw detectie alleen als het logisch is met sessie, of als sessie leeg is
    // Dit voorkomt dat detectie correcte sessie status overschrijft tijdens laden
    let currentStep;
    if (!sessionStep || sessionStep === 'start') {
      // Geen sessie of bij start - vertrouw detectie
      if (detectedStep !== 'unknown' && detectedStep !== 'start') {
        currentStep = detectedStep;
        sessionStorage.setItem('automationStep', detectedStep);
        console.log('✅ Starting from detected page:', detectedStep);
      } else if (detectedStep === 'start') {
        // Detectie zegt we zijn op de startpagina
        currentStep = 'start';
        sessionStorage.setItem('automationStep', 'start');
        console.log('✅ Detected start page, beginning from start');
      } else {
        // Detectie faalde ('unknown') - pauzeer en vraag gebruiker
        console.error('⚠️ CANNOT DETECT CURRENT PAGE');
        console.error('Session step:', sessionStep);
        console.error('Detected step:', detectedStep);

        automationPaused = true;
        updateStatus(
          '⚠️ Kan huidige pagina niet herkennen. Klik op "Hervat" wanneer je op de juiste pagina bent, of begin vanaf de startpagina.',
          'PAGINA DETECTIE MISLUKT',
          'unknown'
        );

        // Toon pause/resume buttons
        const pauseBtn = document.getElementById('pause-automation');
        const resumeBtn = document.getElementById('continue-automation');
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (resumeBtn) resumeBtn.style.display = 'block';

        return; // Stop hier
      }
    } else if (detectedStep !== 'unknown' && detectedStep !== 'start') {
      // Beide hebben waarden - vertrouw detectie als het niet 'start' is (veelvoorkomende false positive)
      currentStep = detectedStep;
      sessionStorage.setItem('automationStep', detectedStep);
      console.log('✅ Updated to detected step:', detectedStep);
    } else {
      // Detectie mislukt of retourneerde 'start' - vertrouw sessie
      console.log('⚠️ Detection unclear, trusting session storage:', sessionStep);
      currentStep = sessionStep;
    }

    console.log('Using step:', currentStep);

    // Sla voortgang periodiek op voor crash recovery
    saveProgressForRecovery();

    // -------------------------------------------------------------------------
    // Loop detectie: Voorkom infinite loops
    // -------------------------------------------------------------------------
    if (currentStep === lastExecutedStep) {
      stepExecutionCount++;
      console.log(`⚠️ Loop detected: Step "${currentStep}" executed ${stepExecutionCount} times`);

      if (stepExecutionCount >= MAX_STEP_RETRIES) {
        console.log('🛑 LOOP DETECTED: Same step executed too many times, auto-pausing for manual intervention');
        automationPaused = true;

        // Update UI om pauze status te tonen
        const pauseBtn = document.getElementById('pause-automation');
        const resumeBtn = document.getElementById('continue-automation');
        if (pauseBtn) pauseBtn.style.display = 'none';
        if (resumeBtn) resumeBtn.style.display = 'block';

        updateStatus(
          `⚠️ LOOP GEDETECTEERD: Stap "${currentStep}" wordt herhaald. Los dit handmatig op en klik op "Hervat" om door te gaan.`,
          'HANDMATIG INGRIJPEN VEREIST'
        );

        // Reset teller zodat gebruiker het opnieuw kan proberen na handmatige interventie
        stepExecutionCount = 0;
        lastExecutedStep = null;
        return;
      }
    } else {
      // Andere stap, reset teller
      lastExecutedStep = currentStep;
      stepExecutionCount = 1;
    }

    // Update status om gedetecteerde stap te tonen
    updateStatus('Klaar om door te gaan', currentStep, detectedStep);

    // =========================================================================
    // STAP 1: Klik op "Nieuwe aanvraag" link
    // =========================================================================
    // Dit is de startpagina. We klikken op de "Nieuwe aanvraag" link om naar
    // de cataloguspagina te navigeren waar we ISDE kunnen selecteren.
    if (currentStep === 'start') {
      console.log('Step 1: Looking for Nieuwe aanvraag link');

      // Controleer of we recent al geklikt hebben om infinite loop te voorkomen
      const lastClickTime = sessionStorage.getItem('lastNieuweAanvraagClick');
      const now = Date.now();
      if (lastClickTime && (now - parseInt(lastClickTime)) < 5000) {
        console.log('⚠️ Already clicked Nieuwe aanvraag recently, waiting for navigation...');
        updateStatus('Wachten op pagina navigatie...', '1 - Navigatie');
        return;
      }

      // Gebruik exacte selector uit opname
      const nav3Link = document.querySelector('#page_1_navigation_3_link');
      console.log('Found #page_1_navigation_3_link:', !!nav3Link);

      if (nav3Link) {
        console.log('Step 1: Clicking Nieuwe aanvraag link');
        updateStatus('Klik op Nieuwe aanvraag link', '1 - Navigatie');

        // Markeer dat we geklikt hebben om loops te voorkomen
        sessionStorage.setItem('lastNieuweAanvraagClick', now.toString());
        sessionStorage.setItem('automationStep', 'nieuwe_aanvraag_clicked');
        sessionStorage.setItem('automationConfig', JSON.stringify(config));

        await clickElement(nav3Link);

        // After clicking, a page navigation will occur
        // The window.load event will restart automation at Step 2
        console.log('Navigation triggered, waiting for page to load...');

        // Fallback: If load event doesn't fire, poll for the catalog page
        let pollCount = 0;
        const pollForCatalog = async () => {
          while (pollCount < 15) {
            pollCount++;
            console.log(`Polling for catalog page (${pollCount})...`);

            const catalogLink = document.querySelector('a[id^="catalog_NieuweAanvraag"]');
            if (catalogLink) {
              console.log('✅ Catalog page detected via polling!');
              updateStatus('Catalogus pagina geladen', 'nieuwe_aanvraag_geklikt');
              createTimeout(() => startFullAutomation(config), 1000);
              return;
            }

            await unthrottledDelay(1000);
          }
          console.log('⚠️ Polling timeout, stopping');
        };
        pollForCatalog();

        return;
      } else {
        console.log('No navigation link found, may need to be on the right starting page');
        updateStatus('Navigeer eerst naar de eLoket hoofdpagina', 'Wachten');
      }
    }
    
    // Step 2: Click ISDE aanvragen link (try multiple strategies)
    if (currentStep === 'nieuwe_aanvraag_clicked') {
      console.log('Step 2: Looking for ISDE aanvragen link');

      // Clear the click timestamp since we successfully navigated
      sessionStorage.removeItem('lastNieuweAanvraagClick');

      // Wait for the page to load and ISDE links to appear
      console.log('Waiting for ISDE links to appear...');
      await unthrottledDelay(1500); // Initial wait for page transition

      // Wait specifically for catalog links or any ISDE-related link to appear
      let waitAttempts = 0;
      const maxWaitAttempts = 10; // Wait up to 5 seconds total (10 x 500ms)
      while (waitAttempts < maxWaitAttempts) {
        const catalogLinks = document.querySelectorAll('a[id*="catalog"]').length;
        const allLinks = document.querySelectorAll('a').length;
        console.log(`Wait attempt ${waitAttempts + 1}: Found ${catalogLinks} catalog links, ${allLinks} total links`);

        // If we see a reasonable number of links, the page is probably loaded
        if (catalogLinks > 0 || allLinks > 20) {
          console.log('✅ Page appears loaded with links');
          break;
        }

        await unthrottledDelay(500);
        waitAttempts++;
      }

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
        updateStatus('Klik op ISDE aanvragen link', '2 - ISDE Selectie', detectedStep);
        await clickElement(isdeLink);
        sessionStorage.setItem('automationStep', 'isde_selected');
        return;
      } else {
        console.log('ISDE link not found, may need manual intervention');
        updateStatus('Klik handmatig op ISDE aanvragen link', '2 - Handmatige actie vereist', detectedStep);
        return;
      }
    }

    // Step 3: Click first Volgende button
    if (document.querySelector('#btn12') && currentStep === 'isde_selected') {
      console.log('Step 3: Clicking first Volgende');
      updateStatus('Klik op Volgende knop', '3 - Eerste Volgende', detectedStep);
      // Set the step BEFORE clicking to ensure it's saved
      sessionStorage.setItem('automationStep', 'first_volgende_clicked');
      console.log('Set automationStep to:', sessionStorage.getItem('automationStep'));
      await clickElement('#btn12');
      return;
    }
    
    // Step 4: Declarations page
    if (document.querySelector('#NaarWaarheid') && currentStep === 'first_volgende_clicked') {
      console.log('Step 4: Filling declarations');
      updateStatus('Verklaringen invullen', '4 - Verklaringen', detectedStep);
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
      updateStatus('Informatie bevestigen', '5 - Info Bevestiging', detectedStep);
      await clickElement('#FWS_Aanvraag_ISDEPA\\.0\\.InfoGelezen_JN');
      await clickElement('#btnVolgendeTab');
      sessionStorage.setItem('automationStep', 'info_acknowledged');
      return;
    }

    // =========================================================================
    // STAP 6: Persoonlijke informatie invullen
    // =========================================================================
    // Vult alle persoonlijke gegevens in: BSN, naam, telefoon, email, IBAN, adres.
    // Gebruikt extra vertragingen tussen velden om robot detectie te vermijden.
    if (document.querySelector('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edBSNnummer') && currentStep === 'info_acknowledged') {
      console.log('Step 6: Filling personal information');
      updateStatus('Persoonlijke gegevens invullen', '6 - Persoonlijke Gegevens', detectedStep);

      // Vul velden met extra vertragingen om robot detectie te voorkomen
      await fillInput('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edBSNnummer', config.bsn);
      await unthrottledDelay(1000 + Math.random() * 500);
      
      await fillInput('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edVoorletters2', config.initials);
      await unthrottledDelay(800 + Math.random() * 400);
      
      await fillInput('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.edAchternaam2', config.lastName);
      await unthrottledDelay(700 + Math.random() * 300);
      
      // Gender selection based on config
      if (config.gender === 'male') {
        await clickElement('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.eddGeslacht_man2');
      } else if (config.gender === 'female') {
        await clickElement('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.eddGeslacht_vrouw2');
      }
      await unthrottledDelay(600 + Math.random() * 400);
      
      await fillInput('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.link_aanv_persoon_telefoon\\.0\\.edTelefoonField3', config.phone);
      await unthrottledDelay(800 + Math.random() * 400);
      
      await fillInput('#link_aanv\\.0\\.link_aanv_persoon\\.0\\.link_aanv_persoon_email\\.0\\.edEmailField3', config.email);
      await unthrottledDelay(900 + Math.random() * 500);
      
      await fillInput('#link_aanv\\.0\\.edIBAN', config.iban);
      await unthrottledDelay(1000 + Math.random() * 500);
      
      await fillInput('#link_aanv\\.0\\.link_aanv_adres_vst\\.0\\.edPostcode', config.postalCode);
      await unthrottledDelay(700 + Math.random() * 300);
      
      await fillInput('#link_aanv\\.0\\.link_aanv_adres_vst\\.0\\.edHuisnummer2', config.houseNumber);
      await unthrottledDelay(600 + Math.random() * 300);
      
      await fillInput('#link_aanv\\.0\\.link_aanv_adres_vst\\.0\\.edToevoeging2', config.houseAddition);
      await unthrottledDelay(700 + Math.random() * 400);
      
      // Check postal address different checkbox
      await clickElement('#link_aanv\\.0\\.edPostadres_anders_J');
      await unthrottledDelay(1000);
      
      await clickElement('#btnVolgendeTab');
      sessionStorage.setItem('automationStep', 'personal_info_done');
      return;
    }
    
    // Step 7 & 8 COMBINED: Intermediary page (both questions on same page)
    if (document.querySelector('#link_int\\.0\\.link_int_organisatie\\.0\\.edExtraContactpersoon_n_int') &&
        document.querySelector('#link_int\\.0\\.edDigitaleCorrespondentie_J') &&
        currentStep === 'personal_info_done') {
      console.log('Step 7-8: Filling intermediary page (contact person + digital correspondence)');
      updateStatus('Intermediair gegevens invullen', '7-8 - Intermediair', detectedStep);

      // Fill regular intermediary contact person fields from config
      console.log('=== FILLING INTERMEDIARY CONTACT PERSON ===');
      console.log('Config values:', {
        initials: config.contactInitials,
        lastName: config.contactLastName,
        gender: config.contactGender,
        phone: config.contactPhone,
        email: config.contactEmail
      });

      try {
        // Wait a bit for the page to be fully loaded
        await unthrottledDelay(1000);

        // Try multiple selector patterns for contact person fields
        const possibleSelectors = {
          initials: [
            // Correct selector based on HTML inspection
            '#link_int\\.0\\.link_int_contactpersoon\\.0\\.ediVoorletters',
            '#link_int\\.0\\.edVoorletters',
            '#link_int\\.0\\.link_int_persoon\\.0\\.edVoorletters',
            '#link_int\\.0\\.link_int_organisatie\\.0\\.edVoorletters',
            '#link_int\\.0\\.link_int_contactpersoon\\.0\\.edVoorletters'
          ],
          lastName: [
            // Correct selector based on HTML inspection
            '#link_int\\.0\\.link_int_contactpersoon\\.0\\.ediAchternaam',
            '#link_int\\.0\\.edAchternaam',
            '#link_int\\.0\\.link_int_persoon\\.0\\.edAchternaam',
            '#link_int\\.0\\.link_int_organisatie\\.0\\.edAchternaam',
            '#link_int\\.0\\.link_int_contactpersoon\\.0\\.edAchternaam'
          ],
          genderMale: [
            // Correct selector based on HTML inspection
            '#link_int\\.0\\.link_int_contactpersoon\\.0\\.Geslacht_man',
            '#link_int\\.0\\.eddGeslacht_man',
            '#link_int\\.0\\.link_int_persoon\\.0\\.eddGeslacht_man',
            '#link_int\\.0\\.link_int_organisatie\\.0\\.eddGeslacht_man',
            '#link_int\\.0\\.link_int_contactpersoon\\.0\\.eddGeslacht_man'
          ],
          genderFemale: [
            // Correct selector based on HTML inspection
            '#link_int\\.0\\.link_int_contactpersoon\\.0\\.Geslacht_vrouw',
            '#link_int\\.0\\.eddGeslacht_vrouw',
            '#link_int\\.0\\.link_int_persoon\\.0\\.eddGeslacht_vrouw',
            '#link_int\\.0\\.link_int_organisatie\\.0\\.eddGeslacht_vrouw',
            '#link_int\\.0\\.link_int_contactpersoon\\.0\\.eddGeslacht_vrouw'
          ],
          phone: [
            // Correct selector based on HTML inspection
            '#link_int\\.0\\.link_int_contactpersoon\\.0\\.link_int_contact_telefoon\\.0\\.edTelefoonField',
            '#link_int\\.0\\.link_int_telefoon\\.0\\.edTelefoonField',
            '#link_int\\.0\\.link_int_persoon\\.0\\.link_int_persoon_telefoon\\.0\\.edTelefoonField',
            '#link_int\\.0\\.link_int_organisatie\\.0\\.link_int_organisatie_telefoon\\.0\\.edTelefoonField',
            '#link_int\\.0\\.link_int_contactpersoon\\.0\\.link_int_contactpersoon_telefoon\\.0\\.edTelefoonField'
          ],
          email: [
            // Correct selector based on HTML inspection
            '#link_int\\.0\\.link_int_contactpersoon\\.0\\.link_int_contact_email\\.0\\.edEmailField',
            '#link_int\\.0\\.link_int_email\\.0\\.edEmailField',
            '#link_int\\.0\\.link_int_persoon\\.0\\.link_int_persoon_email\\.0\\.edEmailField',
            '#link_int\\.0\\.link_int_organisatie\\.0\\.link_int_organisatie_email\\.0\\.edEmailField',
            '#link_int\\.0\\.link_int_contactpersoon\\.0\\.link_int_contactpersoon_email\\.0\\.edEmailField'
          ]
        };

        // Fill initials
        console.log('Trying to fill initials...');
        if (config.contactInitials) {
          let filled = false;
          for (const selector of possibleSelectors.initials) {
            const field = document.querySelector(selector);
            if (field) {
              console.log(`Found initials field with selector: ${selector}, current value: "${field.value}"`);
              await fillInput(selector, config.contactInitials);
              console.log(`✅ Filled contact initials to "${config.contactInitials}" using ${selector}`);
              filled = true;
              break;
            } else {
              console.log(`❌ Selector not found: ${selector}`);
            }
          }
          if (!filled) console.warn('⚠️ Could not find initials field!');
        }

        // Fill last name
        console.log('Trying to fill last name...');
        if (config.contactLastName) {
          let filled = false;
          for (const selector of possibleSelectors.lastName) {
            const field = document.querySelector(selector);
            if (field) {
              console.log(`Found lastName field with selector: ${selector}, current value: "${field.value}"`);
              await fillInput(selector, config.contactLastName);
              console.log(`✅ Filled contact last name to "${config.contactLastName}" using ${selector}`);
              filled = true;
              break;
            } else {
              console.log(`❌ Selector not found: ${selector}`);
            }
          }
          if (!filled) console.warn('⚠️ Could not find lastName field!');
        }

        // Fill gender
        console.log('Trying to fill gender...');
        if (config.contactGender === 'female') {
          let filled = false;
          for (const selector of possibleSelectors.genderFemale) {
            const field = document.querySelector(selector);
            if (field) {
              console.log(`Found genderFemale radio with selector: ${selector}`);
              await clickElement(selector);
              console.log(`✅ Selected female gender using ${selector}`);
              filled = true;
              break;
            } else {
              console.log(`❌ Selector not found: ${selector}`);
            }
          }
          if (!filled) console.warn('⚠️ Could not find female gender radio!');
        } else if (config.contactGender === 'male') {
          let filled = false;
          for (const selector of possibleSelectors.genderMale) {
            const field = document.querySelector(selector);
            if (field) {
              console.log(`Found genderMale radio with selector: ${selector}`);
              await clickElement(selector);
              console.log(`✅ Selected male gender using ${selector}`);
              filled = true;
              break;
            } else {
              console.log(`❌ Selector not found: ${selector}`);
            }
          }
          if (!filled) console.warn('⚠️ Could not find male gender radio!');
        }

        // Fill phone
        console.log('Trying to fill phone...');
        if (config.contactPhone) {
          let filled = false;
          for (const selector of possibleSelectors.phone) {
            const field = document.querySelector(selector);
            if (field) {
              console.log(`Found phone field with selector: ${selector}, current value: "${field.value}"`);
              await fillInput(selector, config.contactPhone);
              console.log(`✅ Filled contact phone to "${config.contactPhone}" using ${selector}`);
              filled = true;
              break;
            } else {
              console.log(`❌ Selector not found: ${selector}`);
            }
          }
          if (!filled) console.warn('⚠️ Could not find phone field!');
        }

        // Fill email
        console.log('Trying to fill email...');
        if (config.contactEmail) {
          let filled = false;
          for (const selector of possibleSelectors.email) {
            const field = document.querySelector(selector);
            if (field) {
              console.log(`Found email field with selector: ${selector}, current value: "${field.value}"`);
              await fillInput(selector, config.contactEmail);
              console.log(`✅ Filled contact email to "${config.contactEmail}" using ${selector}`);
              filled = true;
              break;
            } else {
              console.log(`❌ Selector not found: ${selector}`);
            }
          }
          if (!filled) console.warn('⚠️ Could not find email field!');
        }

        console.log('✅ Finished attempting to fill contact person details');
      } catch (error) {
        console.error('❌ Error filling contact person details:', error);
        console.log('⚠️ Some contact person fields may not have been filled - continuing...');
      }

      await unthrottledDelay(800);

      // 1. Digital correspondence - "Ja" (Yes to digital correspondence)
      await clickElement('#link_int\\.0\\.edDigitaleCorrespondentie_J');
      await unthrottledDelay(500);

      // 2. Extra contact person - "Nee" (No to extra contact person)
      await clickElement('#link_int\\.0\\.link_int_organisatie\\.0\\.edExtraContactpersoon_n_int');
      await unthrottledDelay(500);

      // Now click Volgende after BOTH are filled
      await clickElement('#btnVolgendeTab');
      sessionStorage.setItem('automationStep', 'correspondence_done');
      return;
    }
    
    // Step 9: Address different OR fill address if form is shown
    if (currentStep === 'correspondence_done') {
      console.log('Step 8: Handling address page');
      updateStatus('Adresinformatie verwerken', '8 - Adres');
      
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
      updateStatus('BAG adres instellen', '9 - BAG Instellingen');
      await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.BAGafwijkend_J');
      
      // Try to find and click the "next" button first
      const nextButton = document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.next');
      if (nextButton) {
        await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.next');
      }
      
      await unthrottledDelay(1500);
      
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

      // Check if automation was stopped
      if (automationStopped) {
        console.log('❌ Automation stopped, not continuing with address form');
        return;
      }

      console.log('Step 10.5: On installation address form, need to confirm address');
      updateStatus('Installatieadres bevestigen', '10.5 - Adresformulier', detectedStep);

      // First, we need to select "Ja" for the question about installation address
      // Look for radio buttons that ask about accepting the installation address
      const radioButtons = document.querySelectorAll('input[type="radio"]');
      let addressConfirmRadio = null;

      for (const radio of radioButtons) {
        // Find the "Ja" option near text about installation address
        const label = radio.closest('label, tr, div');
        if (label && label.textContent.includes('installatieadres') && radio.value === 'Ja') {
          addressConfirmRadio = radio;
          break;
        }
      }

      // If we can't find via value, try to find any radio button near the installation address question
      if (!addressConfirmRadio) {
        const allRadios = Array.from(document.querySelectorAll('input[type="radio"]'));
        // Look for the first radio button (usually "Ja") in a group
        for (let i = 0; i < allRadios.length; i++) {
          const radio = allRadios[i];
          const container = radio.closest('table, div, fieldset');
          if (container && container.textContent.includes('installatieadres')) {
            // Take the first radio (should be "Ja")
            addressConfirmRadio = radio;
            break;
          }
        }
      }

      if (addressConfirmRadio && !addressConfirmRadio.checked) {
        console.log('Clicking "Ja" for installation address confirmation');
        await clickElement(addressConfirmRadio);
        await unthrottledDelay(500);
      }

      // Check again after radio button click
      if (automationStopped) {
        console.log('❌ Automation stopped during address confirmation');
        return;
      }

      // Now click Volgende
      const volgendeButton = document.querySelector('input[value="Volgende"]') ||
                            document.querySelector('#btnVolgendeTab');
      if (volgendeButton) {
        console.log('Clicking Volgende on installation address form');
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
      updateStatus('Maatregel toevoegen', '11 - Maatregel Toevoegen', detectedStep);
      await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.addInvestering');
      sessionStorage.setItem('automationStep', 'measure_added');

      // Wait for modal to open, then continue automation
      console.log('Waiting for measure modal to open...');
      await unthrottledDelay(1500);

      // Continue automation to select warmtepomp
      setTimeout(() => {
        startFullAutomation(config);
      }, 500);
      return;
    }
    
    // Step 12: Select warmtepomp
    if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.choice_warmtepomp') && currentStep === 'measure_added') {
      console.log('Step 12: Selecting warmtepomp');
      updateStatus('Warmtepomp selecteren', '12 - Maatregel Selectie', detectedStep);
      await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.choice_warmtepomp');
      sessionStorage.setItem('automationStep', 'meldcode_search_in_wizard');

      // Wait for wizard to show meldcode search step
      console.log('Waiting for meldcode search step to appear...');
      await unthrottledDelay(1500);

      // Continue automation to search for meldcode
      setTimeout(() => {
        startFullAutomation(config);
      }, 500);
      return;
    }

    // Step 12.5: Meldcode search within warmtepomp wizard
    if (currentStep === 'meldcode_search_in_wizard' || detectedStep === 'meldcode_search_in_wizard') {
      console.log('Step 12.5: Searching for meldcode in warmtepomp wizard');
      updateStatus('Meldcode zoeken', '12.5 - Meldcode Zoeken', detectedStep);

      // Wait for modal to be fully loaded
      await unthrottledDelay(800);

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
        await unthrottledDelay(500);

        // Click the search button (the [...] button or Zoeken button)
        const searchButton = document.querySelector('input[type="submit"][value*="Zoeken"]') ||
                            document.querySelector('button[type="submit"]');

        if (searchButton) {
          console.log('✅ Clicking search button');
          searchButton.click();
          await unthrottledDelay(2000); // Wait for search results
          console.log('✅ Search completed, waiting for results...');
        } else {
          console.log('⚠️ Search button not found, trying to find meldcode directly');
        }

        // Wait for results
        await unthrottledDelay(1000);

        // Find and click the meldcode from results
        const meldcodeLinks = document.querySelectorAll('td a, table a');
        let meldcodeClicked = false;

        for (let link of meldcodeLinks) {
          if (link.textContent.includes(config.meldCode)) {
            console.log('✅ Found matching meldcode link:', link.textContent);
            link.click();
            meldcodeClicked = true;
            await unthrottledDelay(1000);
            break;
          }
        }

        if (!meldcodeClicked) {
          // Try clicking the first result
          const firstLink = document.querySelector('td a[href*="meldcode"], table a, #row_0 a');
          if (firstLink) {
            console.log('⚠️ Exact match not found, clicking first meldcode result');
            firstLink.click();
            await unthrottledDelay(1000);
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
        updateStatus('Zoek handmatig naar meldcode', '12.5 - Handmatige actie vereist');
        return;
      }
    }
    
    // Step 13: Fill installation details and dates
    if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.DatumAangeschaft') && currentStep === 'warmtepomp_selected') {
      console.log('Step 13: Setting purchase and installation dates');
      updateStatus('Datums en installatiedetails instellen', '13 - Installatie Details', detectedStep);

      // Wait for modal fields to be fully ready
      await unthrottledDelay(800);

      // Set purchase date (DatumAangeschaft) - only if provided
      await fillInput('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.DatumAangeschaft', config.purchaseDate);

      // Set installation date (DatumInstallatie) - only if provided
      await fillInput('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.DatumInstallatie', config.installationDate);

      // Extra delay after filling dates before clicking checkboxes
      await unthrottledDelay(1200);

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
      await unthrottledDelay(1200);

      console.log('Clicking Dutch installation company checkbox (Ja)...');

      // Wait for the radio button to be visible and clickable
      const dutchCompanyRadio = document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.InstallBedrijf_NL_jn_J');

      if (dutchCompanyRadio) {
        // Scroll to element first
        dutchCompanyRadio.scrollIntoView({behavior: 'smooth', block: 'center'});
        await unthrottledDelay(500);

        // For radio buttons, we need to set checked property AND trigger change event
        dutchCompanyRadio.checked = true;

        // Trigger change event to notify form
        const changeEvent = new Event('change', { bubbles: true });
        dutchCompanyRadio.dispatchEvent(changeEvent);

        // Also trigger click event for any click handlers
        const clickEvent = new MouseEvent('click', { bubbles: true, cancelable: true, view: window });
        dutchCompanyRadio.dispatchEvent(clickEvent);

        console.log('✅ Set Dutch company Ja radio button (checked + events)');
        await unthrottledDelay(800);
      } else {
        console.error('❌ Dutch company radio button not found!');
      }

      // Wait longer for form to reveal KvK and company name fields after clicking "Ja"
      console.log('Waiting for KvK and company name fields to appear...');
      await unthrottledDelay(2500);

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
      console.log('Step 14: Doorgaan na installatiedetails');
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
        createTimeout(() => startFullAutomation(config), 1000);
        return;
      }

      // Modal not open yet, click the lookup button
      const lookupButton = document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.lookup_meldcode');
      if (lookupButton) {
        console.log('Step 16: Opening meldcode lookup');
        await clickElement(lookupButton);
        sessionStorage.setItem('automationStep', 'meldcode_lookup_opened');

        // Wait for modal to open, then continue
        createTimeout(() => startFullAutomation(config), 1500);
        return;
      }
    }
    
    // Step 17: Search and select meldcode
    if (currentStep === 'meldcode_lookup_opened') {
      console.log('Step 17: Searching for meldcode');
      updateStatus('Meldcode zoeken', '17 - Meldcode Zoeken', detectedStep);

      // First, fill the search field if meldcode is provided
      if (config.meldCode) {
        console.log('🔍 Filling meldcode search field with:', config.meldCode);

        // Wait a bit for modal to be fully loaded
        await unthrottledDelay(800);

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

          await unthrottledDelay(500);

          // Click the search button (Zoeken)
          const searchButton = document.querySelector('input[type="submit"][value*="Zoeken"]') ||
                              document.querySelector('button[type="submit"]') ||
                              document.querySelector('input[value="Zoeken"]');

          console.log('Search button found:', !!searchButton);
          if (searchButton) {
            console.log('🔍 Clicking search button...');
            searchButton.click();
            await unthrottledDelay(2000); // Wait for search results
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
            await unthrottledDelay(1500);
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
          await unthrottledDelay(1500);
        } else {
          console.log('No meldcode link found, manual intervention needed');
          updateStatus('Klik handmatig op een meldcode', '17 - Handmatige actie vereist');
          return;
        }
      }

      // Click Volgende button after selecting meldcode
      await unthrottledDelay(1000);
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

    // =========================================================================
    // STAP 18: Documenten uploaden
    // =========================================================================
    // Upload betaalbewijs (verplicht) en factuur (verplicht).
    // Voor elk bestand:
    // 1. Klik op "Toevoegen bijlage" knop
    // 2. Wacht op modal
    // 3. Upload bestand via file input
    // 4. Wacht op upload voltooiing
    if (document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.Bijlagen_NogToevoegen_ISDEPA_Meldcode\\.0\\.btn_ToevoegenBijlage') && currentStep === 'meldcode_selected') {
      console.log('Step 18: File upload page');
      updateStatus('Documenten uploaden', '18 - Documenten Uploaden', detectedStep);

      // Upload betaalbewijs (betaalbewijs) - eerste document (VERPLICHT)
      if (config.betaalbewijs) {
        console.log('Uploading betaalbewijs:', config.betaalbewijs.name);
        await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.Bijlagen_NogToevoegen_ISDEPA_Meldcode\\.0\\.btn_ToevoegenBijlage');
        await unthrottledDelay(1500);
        await uploadFile(config.betaalbewijs);
        await unthrottledDelay(2000);
      }

      // Upload factuur (factuur) - tweede document (VERPLICHT)
      if (config.factuur) {
        console.log('Uploading factuur:', config.factuur.name);
        await clickElement('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.Bijlagen_NogToevoegen_ISDEPA_Meldcode\\.1\\.btn_ToevoegenBijlage');
        await unthrottledDelay(1500);
        await uploadFile(config.factuur);
        await unthrottledDelay(2000);
      }

      // Controleer of verplichte documenten aanwezig zijn
      if (!config.betaalbewijs || !config.factuur) {
        console.log('Missing documents - manual intervention required');
        updateStatus('Upload ontbrekende documenten handmatig', '18 - Handmatige upload vereist');
        alert('Upload betaalbewijs en/of factuur handmatig, en klik daarna op Hervat.');
        return;
      }

      // Click the Volgende button to proceed
      console.log('Looking for Volgende button after document upload...');

      // Wait a bit for uploads to complete
      await unthrottledDelay(1500);

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
        await unthrottledDelay(800);

        // Try direct click first
        console.log('Clicking Volgende button directly...');
        volgendeButton.click();

        await unthrottledDelay(1000);

        sessionStorage.setItem('automationStep', 'files_handled');

        // Continue automation after clicking Volgende
        console.log('✅ Volgende clicked, continuing to next step...');
        setTimeout(() => {
          startFullAutomation(config);
        }, 2000);
        return;
      } else {
        console.log('⚠️ Volgende button not found, may need manual intervention');
        updateStatus('Klik handmatig op Volgende', '18 - Handmatige actie');
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
      console.log('Step 18.4: Vervolgstap modal present, looking for action button');
      updateStatus('Vervolgstap modal verwerken', '18.4 - Vervolgstap Modal', detectedStep);

      await unthrottledDelay(800);

      // Find the action button in the modal - try multiple button names
      let actionButton = null;
      const buttons = document.querySelectorAll('input[type="submit"], input[type="button"], button');

      console.log(`Checking ${buttons.length} buttons for action button`);
      for (let btn of buttons) {
        const buttonText = (btn.value || btn.textContent || '').trim();
        console.log(`Button text: "${buttonText}"`);

        // Try multiple button names that might appear in this modal
        if (buttonText === 'Volgende' ||
            buttonText === 'Kiezen' ||
            buttonText.includes('Volgende') ||
            buttonText.includes('Kiezen')) {
          actionButton = btn;
          console.log(`✅ Found action button: "${buttonText}"`);
          break;
        }
      }

      if (actionButton) {
        const buttonText = (actionButton.value || actionButton.textContent || '').trim();
        actionButton.scrollIntoView({behavior: 'smooth', block: 'center'});
        await unthrottledDelay(500);

        actionButton.click();
        console.log(`✅ Clicked "${buttonText}" button in modal`);

        await unthrottledDelay(1500);

        // After vervolgstap modal, go directly to measure_overview step
        // Don't rely on detection, just proceed to the overview
        sessionStorage.setItem('automationStep', 'measure_overview');
        console.log('→ Forced step to measure_overview after vervolgstap modal');

        // Continue automation
        setTimeout(() => {
          startFullAutomation(config);
        }, 2000);
        return;
      } else {
        console.log('⚠️ Action button not found in modal, logging all button texts for debugging:');
        buttons.forEach(btn => {
          console.log(`  - "${(btn.value || btn.textContent || '').trim()}"`);
        });
        updateStatus('Klik handmatig op de button in de modal', '18.4 - Handmatige actie');

        // Auto-pause to prevent loop
        automationPaused = true;
        return;
      }
    }

    // Step 18.5: Measure overview page - "Maatregel toegevoegd" page with Wijzig/Verwijder buttons
    // After vervolgstap modal, we force step to measure_overview regardless of detection
    if (currentStep === 'measure_overview') {
      console.log('Step 18.5: Looking for Volgende button on measure overview page');
      updateStatus('Doorgaan vanaf maatregeloverzicht', '18.5 - Maatregeloverzicht', detectedStep);

      // Wait a bit for the page to be fully loaded
      await unthrottledDelay(1500);

      // Strategy 1: Try to find the main Volgende button (overview page)
      let volgendeButton = document.querySelector('#btnVolgendeTab');

      // Strategy 2: If not found, maybe we're still in wizard - try wizard Volgende button
      if (!volgendeButton) {
        console.log('Main Volgende not found, checking for wizard Volgende...');
        volgendeButton = document.querySelector('#FWS_Object\\.0\\.FWS_Objectlokatie\\.0\\.FWS_Objectlokatie_ISDEPA\\.0\\.FWS_ObjectLocatie_ISDEPA_Meldcode\\.0\\.wizard_investering_volgende');
      }

      if (volgendeButton) {
        console.log('✅ Found Volgende button');
        volgendeButton.scrollIntoView({behavior: 'smooth', block: 'center'});
        await unthrottledDelay(500);

        volgendeButton.click();
        console.log('✅ Clicked Volgende, checking for confirmation dialog...');

        await unthrottledDelay(1000);
        sessionStorage.setItem('automationStep', 'measure_overview_clicked');

        // Continue automation to handle potential dialog
        setTimeout(() => {
          startFullAutomation(config);
        }, 1500);
        return;
      } else {
        console.log('⚠️ No Volgende button found (neither main nor wizard)');
        updateStatus('Klik handmatig op Volgende', '18.5 - Handmatige actie');

        // Pause to prevent loop
        automationPaused = true;
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
        updateStatus('Maatregelen bevestigen', '18.6 - Maatregel Bevestiging', detectedStep);

        await unthrottledDelay(800);

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
          await unthrottledDelay(500);

          jaVolgendeButton.click();
          console.log('✅ Clicked "Ja, volgende", proceeding to next step');

          await unthrottledDelay(1000);
          sessionStorage.setItem('automationStep', 'measure_confirmed');

          // Continue automation
          setTimeout(() => {
            startFullAutomation(config);
          }, 2000);
          return;
        } else {
          console.log('⚠️ "Ja, volgende" button not found');
          updateStatus('Klik handmatig op "Ja, volgende"', '18.6 - Handmatige actie');
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
      updateStatus('Doorgaan vanaf eindoverzicht', '18.7 - Eindoverzicht', detectedStep);

      await unthrottledDelay(1000);

      const volgendeButton = document.querySelector('#btnVolgendeTab');
      if (volgendeButton) {
        console.log('✅ Found Volgende button on final measure overview');
        volgendeButton.scrollIntoView({behavior: 'smooth', block: 'center'});
        await unthrottledDelay(500);

        volgendeButton.click();
        console.log('✅ Clicked Volgende, proceeding to next step');

        await unthrottledDelay(1000);
        sessionStorage.setItem('automationStep', 'final_measure_overview_done');

        setTimeout(() => {
          startFullAutomation(config);
        }, 2000);
        return;
      } else {
        console.log('⚠️ Volgende button not found');
        updateStatus('Klik handmatig op Volgende', '18.7 - Handmatige actie');
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

      await unthrottledDelay(1500);

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

    // =========================================================================
    // STAP 20: Eindvoorwaarden accepteren - LAATSTE STAP
    // =========================================================================
    // Dit is de LAATSTE stap van de automatisering.
    // We scrollen naar beneden zodat de gebruiker de voorwaarden kan controleren.
    // De gebruiker moet HANDMATIG de checkbox aanvinken en op "Indienen" klikken
    // voor de finale verzending. Dit is opzettelijk handmatig om de gebruiker
    // volledige controle te geven over de uiteindelijke indiening.
    if (document.querySelector('#cbAccoord') && currentStep === 'final_confirmed') {
      console.log('Step 20: Laatste pagina bereikt, scrollen naar beneden voor handmatige controle');
      updateStatus('✅ Voltooid! Controleer en verstuur', '20 - Eindcontrole', detectedStep);

      // Scroll naar beneden zodat gebruiker voorwaarden kan zien
      window.scrollTo({
        top: document.body.scrollHeight,
        behavior: 'smooth'
      });

      // Wacht even tot scroll klaar is
      await unthrottledDelay(1000);

      // Houd het automatiseringspaneel zichtbaar maar geef voltooiing aan
      updateStatus('✅ Klaar voor verzending - Controleer het formulier hieronder en klik op Indienen wanneer u klaar bent', 'KLAAR', detectedStep);

      // Verwijder sessionStorage niet voor het geval gebruiker moet doorgaan
      // sessionStorage.clear();

      // Stop keep-alive audio nu automatisering klaar is
      stopKeepAlive();

      console.log('✅ Automatisering voltooid - wacht op handmatige verzending');
      return;
    }

    console.log('Geen overeenkomende stap gevonden, wacht op laden van pagina of handmatige actie');
    updateStatus('Wacht op volgende stap...', currentStep, detectedStep);
    
  } catch (error) {
    // Als de error door stop button komt, niet tonen
    if (error.message === 'Automation stopped') {
      console.log('✅ Automation gracefully stopped during execution');
      return;
    }

    // Anders is het een echte fout
    console.error('Automation error:', error);
    alert('Automation error: ' + error.message);
  }
}

// ============================================================================
// SECTIE 8: CRASH RECOVERY & PAGE LOAD EVENT LISTENER
// ============================================================================

/**
 * Sla voortgang periodiek op voor crash recovery.
 * Dit gebeurt in chrome.storage.local (persistent) zodat na een crash
 * de voortgang hersteld kan worden.
 *
 * MULTI-TAB SUPPORT:
 * Gebruikt sessionId (uniek per tab) om recovery data te isoleren.
 * Dit voorkomt dat meerdere tabs elkaars recovery data overschrijven.
 */
async function saveProgressForRecovery() {
  const config = sessionStorage.getItem('automationConfig');
  const step = sessionStorage.getItem('automationStep');

  if (config && step) {
    // Gebruik de currentTabId (uniek per tab) voor multi-tab support
    const recoveryKey = `automation_recovery_${currentTabId}`;

    const recoveryData = {
      config: config,
      step: step,
      timestamp: Date.now(),
      url: window.location.href,
      tabId: currentTabId
    };

    await chrome.storage.local.set({ [recoveryKey]: recoveryData });
    console.log(`💾 Progress saved for recovery (tab ${currentTabId}):`, step);
  }
}

/**
 * Probeer te herstellen van een crash.
 * Toont een dialoog aan de gebruiker om te kiezen tussen hervatten of opnieuw starten.
 *
 * MULTI-TAB SUPPORT:
 * Zoekt naar recovery data voor alle sessies, maar geeft prioriteit aan de meest recente
 * die niet te oud is. Dit voorkomt conflicten tussen meerdere tabs.
 *
 * @returns {boolean} True als recovery succesvol, false als gebruiker opnieuw wil starten
 */
function attemptCrashRecovery() {
  return new Promise((resolve) => {
    // Check alleen voor recovery data van DEZE specifieke tab
    const recoveryKey = `automation_recovery_${currentTabId}`;

    chrome.storage.local.get(recoveryKey, (result) => {
      if (!result[recoveryKey]) {
        console.log(`ℹ️ Geen recovery data gevonden voor tab ${currentTabId}`);
        resolve(false);
        return;
      }

      const recoveryData = result[recoveryKey];
      const age = Date.now() - recoveryData.timestamp;

      // Skip te oude data (max 1 uur)
      if (age > 3600000) {
        console.log(`⚠️ Recovery data te oud voor tab ${currentTabId}, wordt verwijderd`);
        chrome.storage.local.remove(recoveryKey);
        resolve(false);
        return;
      }

      console.log(`✅ Recovery data gevonden voor tab ${currentTabId}:`, recoveryData.step);

      // Maak recovery panel
      const panel = document.createElement('div');
      panel.id = 'crash-recovery-panel';
      panel.style.cssText = `
        position: fixed;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        background: white;
        border: 3px solid #ff9800;
        border-radius: 16px;
        padding: 30px;
        box-shadow: 0 8px 32px rgba(0,0,0,0.3);
        z-index: 9999999;
        max-width: 450px;
        font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif;
      `;

      panel.innerHTML = `
        <div style="text-align: center;">
          <div style="font-size: 48px; margin-bottom: 16px;">⚠️</div>
          <h2 style="margin: 0 0 16px 0; color: #ff9800; font-size: 20px;">Automatisering Onderbroken</h2>
          <p style="color: #666; margin-bottom: 8px; font-size: 14px;">
            De automatisering werd onderbroken bij stap:
          </p>
          <p style="background: #f8f9fa; padding: 12px; border-radius: 8px; margin-bottom: 20px; font-weight: 600; color: #212529;">
            ${recoveryData.step.replace(/_/g, ' ')}
          </p>
          <p style="color: #666; font-size: 13px; margin-bottom: 24px;">
            Wil je doorgaan vanaf deze stap of opnieuw beginnen?
          </p>
          <div style="display: flex; gap: 12px; justify-content: center;">
            <button id="recovery-resume" style="
              background: #28a745;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
            ">✓ Hervatten</button>
            <button id="recovery-restart" style="
              background: #6c757d;
              color: white;
              border: none;
              padding: 12px 24px;
              border-radius: 8px;
              font-size: 14px;
              font-weight: 600;
              cursor: pointer;
              transition: all 0.2s;
            ">⟳ Opnieuw Beginnen</button>
          </div>
        </div>
      `;

      document.body.appendChild(panel);

      // Add hover effects
      const style = document.createElement('style');
      style.textContent = `
        #recovery-resume:hover { background: #218838 !important; transform: translateY(-1px); }
        #recovery-restart:hover { background: #5a6268 !important; transform: translateY(-1px); }
      `;
      document.head.appendChild(style);

      // Event listeners
      document.getElementById('recovery-resume').addEventListener('click', () => {
        console.log('✅ Gebruiker kiest: Hervatten vanaf', recoveryData.step);
        panel.remove();
        style.remove();

        // Herstel session storage
        sessionStorage.setItem('automationConfig', recoveryData.config);
        sessionStorage.setItem('automationStep', recoveryData.step);

        // Verwijder deze specifieke recovery data (niet alle recovery data!)
        chrome.storage.local.remove(recoveryKey);

        resolve(true);
      });

      document.getElementById('recovery-restart').addEventListener('click', () => {
        console.log('🔄 Gebruiker kiest: Opnieuw beginnen');
        panel.remove();
        style.remove();

        // Verwijder alle automation data voor deze sessie
        sessionStorage.removeItem('automationConfig');
        sessionStorage.removeItem('automationStep');
        chrome.storage.local.remove(recoveryKey);

        resolve(false);
      });
    });
  });
}

/**
 * Event listener voor Page Visibility API.
 * Met audio keep-alive is tab throttling uitgeschakeld.
 * Logging blijft beschikbaar voor debugging doeleinden.
 */
document.addEventListener('visibilitychange', () => {
  if (document.hidden && !automationStopped && !automationPaused) {
    console.log('ℹ️ Tab op achtergrond - maar audio keep-alive voorkomt throttling');
  } else if (!document.hidden) {
    console.log('ℹ️ Tab is weer actief');
  }
});

/**
 * Event listener die automatisering hervat na een pagina navigatie.
 *
 * CRASH RECOVERY:
 * - Als sessionStorage leeg is maar recovery data bestaat → vraag gebruiker
 * - Als recovery data oud is (>1 uur) → negeer en start normaal
 * - Gebruiker kan kiezen: hervatten of opnieuw beginnen
 *
 * NORMALE NAVIGATIE:
 * - sessionStorage blijft behouden → hervat automatisch
 * - Voortgang wordt periodiek opgeslagen als backup
 *
 * Dit zorgt ervoor dat de automatisering naadloos door het hele proces kan navigeren,
 * zelfs over meerdere pagina's heen, en kan herstellen van crashes.
 */
window.addEventListener('load', async () => {
  // Check persistent stop flag EERST
  const stoppedByUser = sessionStorage.getItem('automationStoppedByUser');
  if (stoppedByUser === 'true' || automationStopped) {
    console.log('❌ Automation stopped by user, not continuing on page load');
    // Wis de config om zeker te zijn
    sessionStorage.removeItem('automationConfig');
    sessionStorage.removeItem('automationStep');
    return;
  }

  let automationConfig = sessionStorage.getItem('automationConfig');
  let currentStep = sessionStorage.getItem('automationStep');

  // CRASH RECOVERY: als sessionStorage leeg is, probeer te herstellen
  if (!automationConfig || !currentStep) {
    console.log('🔍 SessionStorage leeg, checking for crash recovery...');
    const recovered = await attemptCrashRecovery();

    if (recovered) {
      // Herstel was succesvol, haal data opnieuw op
      automationConfig = sessionStorage.getItem('automationConfig');
      currentStep = sessionStorage.getItem('automationStep');
      console.log('✅ Crash recovery succesvol, hervatten vanaf:', currentStep);
    } else {
      console.log('ℹ️ Geen recovery of gebruiker koos opnieuw beginnen');
      return;
    }
  }

  if (automationConfig) {
    const config = JSON.parse(automationConfig);
    console.log('Automatisering doorgaan na pagina laden, stap:', currentStep);

    // Sla voortgang op voor crash recovery
    await saveProgressForRecovery();

    // Recreate status panel after page load
    createStatusPanel();

    // Check if paused
    if (automationPaused) {
      updateStatus('⏸ Gepauzeerd - klik Hervat om door te gaan', 'GEPAUZEERD');
      // Update button visibility
      if (document.getElementById('pause-automation')) {
        document.getElementById('pause-automation').style.display = 'none';
        document.getElementById('continue-automation').style.display = 'block';
      }
      return;
    }

    updateStatus('Pagina geladen, automatisering doorgaan...', currentStep);

    // Simple delay then continue - no retry loop
    createTimeout(() => {
      if (automationStopped) {
        console.log('❌ Automation stopped before timeout executed');
        return;
      }
      if (automationPaused) {
        console.log('⏸ Automation paused before timeout executed');
        return;
      }
      console.log('Starting automation after page load');
      startFullAutomation(config);
    }, 2000);
  }
});

// Also listen for DOM content loaded as backup
document.addEventListener('DOMContentLoaded', () => {
  // Check persistent stop flag
  const stoppedByUser = sessionStorage.getItem('automationStoppedByUser');
  if (stoppedByUser === 'true' || automationStopped) {
    console.log('❌ Automation stopped by user, not continuing on DOM load');
    clearAllTimeouts(); // Clear any pending timeouts
    sessionStorage.removeItem('automationConfig');
    sessionStorage.removeItem('automationStep');
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
    updateStatus('Wachten...', currentStep, detectedStep);

    if (currentStep && currentStep !== 'start') {
      createTimeout(() => {
        if (automationStopped) {
          console.log('❌ Automation stopped before timeout executed');
          return;
        }
        if (automationPaused) {
          console.log('⏸ Automation paused before timeout executed');
          return;
        }
        startFullAutomation(config);
      }, 2000);
    }
  }
});

// Also check periodically if panel needs to be recreated (in case DOM changes)
// Using unthrottled loop to work properly in background tabs
(async () => {
  while (true) {
    await unthrottledDelay(2000);

    // Don't recreate panel if automation has been stopped
    if (automationStopped) {
      continue;
    }

    const automationConfig = sessionStorage.getItem('automationConfig');
    if (automationConfig && !document.getElementById('isde-automation-panel')) {
      console.log('Status panel missing, recreating...');
      createStatusPanel();
      const currentStep = sessionStorage.getItem('automationStep');
      const detectedStep = detectCurrentStep();
      updateStatus('Klaar', currentStep, detectedStep);
    }
  }
})();