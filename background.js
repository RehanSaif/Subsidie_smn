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

/**
 * Event listener voor wanneer de gebruiker op de extensie icoon klikt
 *
 * Deze functie opent de side panel in plaats van een apart venster.
 * De side panel blijft open wanneer je van tab wisselt en is geen apart browser venster.
 */
chrome.action.onClicked.addListener(async (tab) => {
  // Open de side panel voor het huidige venster
  await chrome.sidePanel.open({ windowId: tab.windowId });
  console.log('Side panel opened for window:', tab.windowId);
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
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startAutomationFromPopup') {
    // Zoek de momenteel actieve tab in het huidige venster
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const currentTab = tabs[0];

      // Stuur een bericht naar het content script in de actieve tab
      // Dit bericht bevat de actie en de configuratie voor de automatisering
      chrome.tabs.sendMessage(currentTab.id, {
        action: 'startAutomation',
        config: request.config
      }, (response) => {
        if (chrome.runtime.lastError) {
          // Er is een fout opgetreden - waarschijnlijk is het content script niet geladen
          // Probeer het content script handmatig te injecteren
          chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            files: ['content.js']
          }, () => {
            // Wacht 500ms om het script de kans te geven om te initialiseren
            // Stuur dan het bericht opnieuw
            setTimeout(() => {
              chrome.tabs.sendMessage(currentTab.id, {
                action: 'startAutomation',
                config: request.config
              });
            }, 500);
          });
        }
      });
    });

    // Stuur een bevestiging terug naar de afzender
    sendResponse({status: 'started'});
    // Return true om aan te geven dat we asynchroon zullen antwoorden
    return true;
  }
});