/**
 * Status Panel UI Module voor ISDE Automatisering
 *
 * Dit bestand bevat de functionaliteit voor het maken en beheren van een
 * zwevend statuspaneel dat de voortgang van de automatisering weergeeft.
 * Het paneel toont real-time updates van de huidige status en stap, en
 * biedt controles voor het pauzeren of sluiten van de automatisering.
 *
 * Belangrijkste functionaliteiten:
 * - Aanmaken van een visueel statuspaneel overlay
 * - Real-time status updates met gekleurde feedback
 * - Pauzeer en sluit knoppen voor gebruikerscontrole
 * - Integratie met sessionStorage voor status persistentie
 */

/**
 * Maakt een zwevend statuspaneel aan en injecteert het in de pagina
 *
 * Deze functie creëert een visueel paneel rechtsboven in de browser viewport
 * dat de status van de automatisering toont. Het paneel bevat:
 * - Een titel sectie
 * - Een status indicator die real-time updates ontvangt
 * - Een huidige stap indicator
 * - Een pauzeer knop om de automatisering te stoppen
 * - Een sluit knop om het paneel te verwijderen
 *
 * Het paneel heeft een vaste positie en blijft zichtbaar tijdens scrollen.
 * Als het paneel al bestaat, wordt de functie voortijdig beëindigd.
 */
function createStatusPanel() {
  // Controleer of het paneel al bestaat om duplicaten te voorkomen
  if (document.getElementById('isde-automation-panel')) {
    return;
  }

  // Maak een nieuwe div element aan voor het statuspaneel
  const panel = document.createElement('div');
  panel.id = 'isde-automation-panel';

  // Definieer de volledige HTML structuur van het paneel met inline styling
  // Inline styling wordt gebruikt om conflicten met pagina CSS te voorkomen
  panel.innerHTML = `
    <div style="
      position: fixed;
      top: 20px;
      right: 20px;
      width: 300px;
      background: white;
      border: 2px solid #4CAF50;
      border-radius: 8px;
      padding: 15px;
      box-shadow: 0 4px 6px rgba(0,0,0,0.1);
      z-index: 999999;
      font-family: Arial, sans-serif;
    ">
      <h3 style="margin: 0 0 10px 0; color: #333;">ISDE Automation Status</h3>
      <div id="automation-status" style="color: #666; margin-bottom: 10px;">Ready</div>
      <div id="current-step" style="color: #4CAF50; font-weight: bold; margin-bottom: 10px;"></div>
      <button id="pause-automation" style="
        background: #f44336;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
        margin-right: 10px;
      ">Pause</button>
      <button id="close-panel" style="
        background: #666;
        color: white;
        border: none;
        padding: 8px 16px;
        border-radius: 4px;
        cursor: pointer;
      ">Close</button>
    </div>
  `;

  // Voeg het paneel toe aan de body van de pagina
  document.body.appendChild(panel);

  // Voeg event listener toe aan de sluit knop
  // Bij klik wordt het paneel verwijderd en de sessionStorage flag gewist
  document.getElementById('close-panel').addEventListener('click', () => {
    panel.remove();
    sessionStorage.removeItem('showAutomationPanel');
  });

  // Voeg event listener toe aan de pauzeer knop
  // Bij klik wordt een pauzeer flag in sessionStorage gezet en de status bijgewerkt
  document.getElementById('pause-automation').addEventListener('click', () => {
    sessionStorage.setItem('automationPaused', 'true');
    updateStatus('Automation paused', 'warning');
  });
}

/**
 * Werkt de status informatie in het paneel bij
 *
 * Deze functie update de tekstuele en visuele status van het automatisering paneel.
 * De functie kan verschillende types status tonen met corresponderende kleuren:
 * - 'success': Groen (#4CAF50) voor succesvolle acties
 * - 'error': Rood (#f44336) voor fouten
 * - 'warning': Oranje (#ff9800) voor waarschuwingen
 * - 'info' (default): Grijs (#666) voor algemene informatie
 *
 * De functie haalt ook de huidige stap op uit sessionStorage en toont deze
 * in een leesbaar formaat (underscores worden vervangen door spaties).
 *
 * @param {string} message - Het statusbericht dat moet worden weergegeven
 * @param {string} type - Het type status: 'success', 'error', 'warning', of 'info' (default)
 */
function updateStatus(message, type = 'info') {
  const statusDiv = document.getElementById('automation-status');
  const stepDiv = document.getElementById('current-step');

  // Als het status paneel niet bestaat, maak het dan eerst aan
  if (!statusDiv) {
    createStatusPanel();
  }

  // Werk de status tekst en kleur bij op basis van het type
  if (statusDiv) {
    statusDiv.textContent = message;

    // Bepaal de kleur op basis van het status type
    // Gebruik een ternary operator chain voor compacte conditie logica
    statusDiv.style.color = type === 'success' ? '#4CAF50' :    // Groen voor succes
                           type === 'error' ? '#f44336' :        // Rood voor fouten
                           type === 'warning' ? '#ff9800' : '#666'; // Oranje voor waarschuwing, grijs voor info
  }

  // Werk de huidige stap indicator bij als er een stap in sessionStorage staat
  const currentStep = sessionStorage.getItem('automationStep');
  if (stepDiv && currentStep) {
    // Vervang underscores met spaties voor betere leesbaarheid
    stepDiv.textContent = `Current step: ${currentStep.replace(/_/g, ' ')}`;
  }
}

/**
 * Exporteer functies naar het window object voor globale toegang
 *
 * Door deze functies aan het window object toe te voegen, kunnen ze worden
 * aangeroepen vanuit andere scripts in de extensie, zoals het content script.
 */
window.createStatusPanel = createStatusPanel;
window.updateStatus = updateStatus;