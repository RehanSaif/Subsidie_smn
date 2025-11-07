/**
 * Background Service Worker voor ISDE Chrome Extensie
 *
 * Dit bestand fungeert als de achtergrond service worker voor de Chrome extensie.
 * Het beheert de popup window lifecycle, handelt communicatie tussen verschillende
 * componenten van de extensie af, en zorgt voor het injecteren en starten van
 * automatiseringsscripts in de actieve browser tabs.
 *
 * Belangrijkste functionaliteiten:
 * - Beheer van popup window (openen, focussen, sluiten)
 * - Communicatie tussen popup en content scripts
 * - Dynamisch injecteren van content scripts indien nodig
 */

// Laad configuratie bestand
importScripts('config.js');

/**
 * Event listener voor wanneer de gebruiker op de extensie icoon klikt
 *
 * Deze functie opent de side panel als een GLOBAL (per-window) panel.
 * Het panel blijft open wanneer je van tab wisselt en toont automatisch
 * de juiste data voor de actieve tab.
 */
chrome.action.onClicked.addListener(async (tab) => {
  // Open de side panel voor het hele window (niet per tab)
  // Dit zorgt ervoor dat het panel blijft open bij tab switches
  await chrome.sidePanel.open({ windowId: tab.windowId });
  console.log('Side panel opened for window:', tab.windowId, 'from tab:', tab.id);
});

/**
 * Message listener voor communicatie tussen extensie componenten
 *
 * Deze listener handelt berichten af die vanuit verschillende delen van de extensie
 * worden verzonden. Momenteel ondersteunt het de 'startAutomationFromPopup' actie
 * die de automatisering in de actieve tab start.
 *
 * Workflow:
 * 1. Ontvang bericht van popup met automatisering configuratie
 * 2. Identificeer de actieve tab
 * 3. Stuur bericht naar content script in die tab
 * 4. Als content script niet geladen is, injecteer het eerst
 * 5. Probeer opnieuw na injectie
 */
const STORAGE_NAMESPACE = (chrome.extension && chrome.extension.inIncognitoContext) ? 'incog' : 'normal';

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startAutomationFromPopup') {
    // Zoek de momenteel actieve tab in het huidige venster
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const currentTab = tabs[0];
      if (!currentTab) {
        console.error('❌ Geen actieve tab gevonden om automatisering te starten');
        return;
      }

      const configKey = `automation_config_${STORAGE_NAMESPACE}_${currentTab.id}`;

      let configToStore;
      try {
        configToStore = JSON.parse(JSON.stringify(request.config));
      } catch (error) {
        console.warn('⚠️ Kon config niet clonen, gebruik directe referentie:', error);
        configToStore = request.config;
      }

      chrome.storage.local.set({ [configKey]: configToStore }, () => {
        if (chrome.runtime.lastError) {
          console.error('❌ Fout bij opslaan automatiseringsconfiguratie:', chrome.runtime.lastError.message);
          return;
        }

        const payload = {
          action: 'startAutomation',
          configKey,
          tabId: currentTab.id,
          config: request.config // fallback/backwards-compatibility
        };

        // Stuur een bericht naar het content script in de actieve tab
        // Dit bericht bevat de actie en een verwijzing naar de configuratie
        chrome.tabs.sendMessage(currentTab.id, payload, (response) => {
          if (chrome.runtime.lastError) {
            console.log('⚠️ Content script not loaded, injecting now...');
            // Er is een fout opgetreden - waarschijnlijk is het content script niet geladen
            // Probeer het content script handmatig te injecteren
            chrome.scripting.executeScript({
              target: { tabId: currentTab.id },
              files: ['content.js']
            }, () => {
              if (chrome.runtime.lastError) {
                console.error('❌ Failed to inject content script:', chrome.runtime.lastError.message);
                return;
              }

              console.log('✅ Content script injected, waiting for initialization...');

              // Retry met exponential backoff: probeer meerdere keren met toenemende delays
              const retryDelays = [500, 1000, 2000]; // 500ms, 1s, 2s
              let retryCount = 0;

              const attemptSend = () => {
                chrome.tabs.sendMessage(currentTab.id, payload, (response) => {
                  if (chrome.runtime.lastError) {
                    retryCount++;
                    if (retryCount < retryDelays.length) {
                      console.log(`⏳ Retry ${retryCount}/${retryDelays.length} after ${retryDelays[retryCount]}ms...`);
                      setTimeout(attemptSend, retryDelays[retryCount]);
                    } else {
                      console.error('❌ All retries exhausted. Content script not responding.');
                    }
                  } else {
                    console.log('✅ Message successfully sent to content script on retry', retryCount + 1);
                  }
                });
              };

              // Start eerste retry
              setTimeout(attemptSend, retryDelays[0]);
            });
          } else {
            console.log('✅ Content script already loaded, message sent successfully');
          }
        });
      });
    });

    // Stuur een bevestiging terug naar de afzender
    sendResponse({status: 'started'});
    // Return true om aan te geven dat we asynchroon zullen antwoorden
    return true;
  }

  if (request.action === 'scheduleDelay') {
    const MAX_DELAY = 60000;
    const delay = Math.max(0, Math.min(MAX_DELAY, Number(request.delay) || 0));

    console.log(`[BG] ⏳ scheduleDelay received: ${delay}ms (sender: ${sender?.tab?.id ?? 'n/a'})`);

    setTimeout(() => {
      try {
        console.log('[BG] ✅ scheduleDelay completed');
        sendResponse({status: 'done'});
      } catch (error) {
        console.warn('[BG] ⚠️ Failed to respond to scheduleDelay:', error);
      }
    }, delay);

    return true;
  }

  // 📊 Statistics: Handle automation completion tracking
  if (request.action === 'automationCompleted') {
    const durationMs = request.durationMs;
    console.log(`📊 Automation completed in ${Math.round(durationMs / 1000)} seconds`);

    // Load current stats
    chrome.storage.local.get([CONFIG.STORAGE_KEYS.USAGE_STATS], (result) => {
      const stats = result[CONFIG.STORAGE_KEYS.USAGE_STATS] || {
        totalCompleted: 0,
        totalStarted: 0,
        firstUseDate: null,
        lastUseDate: null,
        totalDurationMs: 0
      };

      // Update stats
      const updatedStats = {
        ...stats,
        totalCompleted: stats.totalCompleted + 1,
        totalDurationMs: stats.totalDurationMs + durationMs,
        lastUseDate: new Date().toISOString()
      };

      // Set firstUseDate als dit de eerste keer is
      if (!stats.firstUseDate) {
        updatedStats.firstUseDate = new Date().toISOString();
      }

      // Save updated stats
      chrome.storage.local.set({
        [CONFIG.STORAGE_KEYS.USAGE_STATS]: updatedStats
      }, () => {
        console.log('📊 Usage stats updated:', updatedStats);
        sendResponse({status: 'stats_updated'});
      });
    });

    return true; // Async response
  }
});
