// Create and inject a floating status panel
function createStatusPanel() {
  // Check if panel already exists
  if (document.getElementById('isde-automation-panel')) {
    return;
  }

  // Create panel HTML
  const panel = document.createElement('div');
  panel.id = 'isde-automation-panel';
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

  document.body.appendChild(panel);

  // Add event listeners
  document.getElementById('close-panel').addEventListener('click', () => {
    panel.remove();
    sessionStorage.removeItem('showAutomationPanel');
  });

  document.getElementById('pause-automation').addEventListener('click', () => {
    sessionStorage.setItem('automationPaused', 'true');
    updateStatus('Automation paused', 'warning');
  });
}

// Update status in the panel
function updateStatus(message, type = 'info') {
  const statusDiv = document.getElementById('automation-status');
  const stepDiv = document.getElementById('current-step');
  
  if (!statusDiv) {
    createStatusPanel();
  }

  if (statusDiv) {
    statusDiv.textContent = message;
    statusDiv.style.color = type === 'success' ? '#4CAF50' : 
                           type === 'error' ? '#f44336' : 
                           type === 'warning' ? '#ff9800' : '#666';
  }

  // Update current step
  const currentStep = sessionStorage.getItem('automationStep');
  if (stepDiv && currentStep) {
    stepDiv.textContent = `Current step: ${currentStep.replace(/_/g, ' ')}`;
  }
}

// Export functions
window.createStatusPanel = createStatusPanel;
window.updateStatus = updateStatus;