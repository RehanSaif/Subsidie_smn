// Open popup as a window instead of a popup to keep it open when switching tabs
let popupWindowId = null;

chrome.action.onClicked.addListener((tab) => {
  // Check if popup window is already open
  if (popupWindowId !== null) {
    chrome.windows.get(popupWindowId, (window) => {
      if (chrome.runtime.lastError || !window) {
        // Window was closed, open a new one
        createPopupWindow();
      } else {
        // Window exists, focus it
        chrome.windows.update(popupWindowId, { focused: true });
      }
    });
  } else {
    createPopupWindow();
  }
});

function createPopupWindow() {
  chrome.windows.create({
    url: chrome.runtime.getURL('popup.html'),
    type: 'popup',
    width: 420,
    height: 700,
    focused: true
  }, (window) => {
    popupWindowId = window.id;
  });
}

// Clean up when window is closed
chrome.windows.onRemoved.addListener((windowId) => {
  if (windowId === popupWindowId) {
    popupWindowId = null;
  }
});

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