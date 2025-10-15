// service_worker.js
chrome.runtime.onInstalled.addListener(() => {
  console.log('DLP Mail Blocker installed');
  // Provide default settings if not set
  chrome.storage.local.get(['settings'], (res) => {
    if (!res.settings) {
      const defaults = {
        enabled: true,
        personal_domains: ["gmail.com","yahoo.com","hotmail.com","outlook.com","protonmail.com","icloud.com"],
        whitelist_domains: [],
        pii_patterns_enabled: true,
        pii_patterns: {
          "NIK_16": "\\b\\d{16}\\b",
          "Phone": "\\b(?:\\+62|62|0)\\d{8,13}\\b",
          "Email_in_body": "[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\\.[a-zA-Z]{2,}",
          "CreditCard": "\\b(?:\\d[ -]*?){13,19}\\b"
        },
        block_on_pii: true,
        allow_override_with_justification: true,
        log_events: true
      };
      chrome.storage.local.set({settings: defaults});
    }
  });
});

// Example showing a notification (not strictly necessary)
function showNotification(title, message) {
  chrome.notifications.create({
    type: "basic",
    iconUrl: "icons/icon48.png",
    title,
    message
  });
} 

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg.type === "notify") {
    showNotification(msg.title, msg.message);
    sendResponse({ok:true});
  }
});


