// Background service worker to handle automation
chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === 'startAutomationFromPopup') {
    // Get the active tab
    chrome.tabs.query({active: true, currentWindow: true}, (tabs) => {
      const currentTab = tabs[0];
      
      // Send message to content script
      chrome.tabs.sendMessage(currentTab.id, {
        action: 'startAutomation',
        config: request.config
      }, (response) => {
        if (chrome.runtime.lastError) {
          // Try injecting content script first
          chrome.scripting.executeScript({
            target: { tabId: currentTab.id },
            files: ['content.js']
          }, () => {
            // Try sending message again after injection
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
    
    sendResponse({status: 'started'});
    return true;
  }
});