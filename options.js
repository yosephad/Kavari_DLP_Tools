// options.js
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

function load() {
  chrome.storage.local.get(['settings'], (res) => {
    const s = res.settings || defaults;
    document.getElementById('enabled').checked = s.enabled !== false;
    document.getElementById('personal_domains').value = (s.personal_domains || []).join(', ');
    document.getElementById('whitelist_domains').value = (s.whitelist_domains || []).join(', ');
    document.getElementById('pii_patterns_json').value = JSON.stringify(s.pii_patterns || {}, null, 2);
    document.getElementById('block_on_pii').checked = s.block_on_pii !== false;
    document.getElementById('allow_override').checked = s.allow_override_with_justification !== false;
  });
}

document.getElementById('saveBtn').addEventListener('click', () => {
  try {
    const newSettings = {
      enabled: document.getElementById('enabled').checked,
      personal_domains: document.getElementById('personal_domains').value.split(',').map(s=>s.trim()).filter(Boolean),
      whitelist_domains: document.getElementById('whitelist_domains').value.split(',').map(s=>s.trim()).filter(Boolean),
      pii_patterns: JSON.parse(document.getElementById('pii_patterns_json').value),
      block_on_pii: document.getElementById('block_on_pii').checked,
      allow_override_with_justification: document.getElementById('allow_override').checked
    };
    chrome.storage.local.set({settings: newSettings}, () => {
      document.getElementById('status').innerText = 'Saved';
      setTimeout(()=> document.getElementById('status').innerText = '', 2000);
    });
  } catch(e) {
    document.getElementById('status').innerText = 'Error: invalid JSON for patterns';
  }
});

document.getElementById('resetBtn').addEventListener('click', () => {
  chrome.storage.local.set({settings: defaults}, () => { load(); document.getElementById('status').innerText = 'Reset'; setTimeout(()=>document.getElementById('status').innerText='', 2000); });
});

load();
