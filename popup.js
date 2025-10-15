// popup.js
document.addEventListener('DOMContentLoaded', async () => {
  const enabledEl = document.getElementById('enabled');
  const logsList = document.getElementById('logsList');
  const openOptions = document.getElementById('openOptions');
  const clearLogsBtn = document.getElementById('clearLogs');

  // load settings
  chrome.storage.local.get(['settings','dlp_logs'], (res) => {
    const s = res.settings || {};
    enabledEl.checked = s.enabled !== false;
    const logs = res.dlp_logs || [];
    renderLogs(logs.slice(0,20));
  });

  enabledEl.onchange = () => {
    chrome.storage.local.get(['settings'], (res) => {
      const s = res.settings || {};
      s.enabled = enabledEl.checked;
      chrome.storage.local.set({settings:s});
    });
  };

  openOptions.onclick = () => chrome.runtime.openOptionsPage();

  clearLogsBtn.onclick = () => {
    chrome.storage.local.set({dlp_logs: []}, () => {
      renderLogs([]);
    });
  };

  function renderLogs(arr) {
    if (!arr || arr.length===0) { logsList.innerHTML = '<i>No events</i>'; return; }
    logsList.innerHTML = arr.map(l => {
      return `<div style="margin-bottom:6px;border-bottom:1px dashed #ddd;padding-bottom:6px">
        <div style="font-weight:600">${l.action}</div>
        <div style="font-size:11px;color:#555">${l.ts || ''}</div>
        <div style="font-size:12px;margin-top:4px">${escapeHtml(JSON.stringify(l, null, 2))}</div>
      </div>`;
    }).join('');
  }

  function escapeHtml(s) {
    return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
  }
});
