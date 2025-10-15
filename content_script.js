// content_script.js
(() => {
  const LOG_KEY = 'dlp_logs';

  // Utility: get settings
  async function getSettings() {
    return new Promise((resolve) => {
      chrome.storage.local.get(['settings'], (res) => resolve(res.settings || {}));
    });
  }

  // Utility: store log
  async function pushLog(entry) {
    const s = await new Promise(r => chrome.storage.local.get([LOG_KEY], r));
    const arr = s[LOG_KEY] || [];
    arr.unshift({ts: new Date().toISOString(), ...entry});
    chrome.storage.local.set({[LOG_KEY]: arr});
  }

  // Default PII patterns (if missing)
  function compilePatterns(patternsObj) {
    const compiled = {};
    for (const [k, v] of Object.entries(patternsObj || {})) {
      try { compiled[k] = new RegExp(v, 'gi'); } catch(e) {}
    }
    return compiled;
  }

  // Heuristics to find recipients and body for Gmail, Outlook, generic forms
  function getGmailComposeElements() {
    // Gmail uses 'textarea' contenteditable or div[aria-label="Message Body"] and inputs for recipients
    const composeAreas = document.querySelectorAll('div[aria-label="Message Body"], div[aria-label="Isi pesan"], div[aria-label="Compose"]');
    // recipients container (To/Cc/Bcc fields)
    const toInputs = document.querySelectorAll('textarea[name=to], input[name=to], input[aria-label^="To"]');
    // better try Gmail specific selectors
    const gmailBody = document.querySelector('[aria-label="Message Body"]') || document.querySelector('[role="textbox"][aria-label*="Message Body"]');
    return {bodyEl: gmailBody, toEls: toInputs};
  }

  function getOutlookComposeElements() {
    // Outlook Web: message body often is iframe or div[aria-label="Message body"]
    const bodyEl = document.querySelector('div[aria-label="Message body"]') || document.querySelector('div[contenteditable="true"][aria-label*="Message body"]');
    const toEls = document.querySelectorAll('input[aria-label="To"], input[aria-label="To:"]');
    return {bodyEl, toEls};
  }

  function extractTextFromElement(el) {
    if (!el) return '';
    if (el.tagName === 'IFRAME') {
      try {
        return el.contentDocument?.body?.innerText || '';
      } catch(e) { return ''; }
    }
    if (el.isContentEditable) return el.innerText || '';
    if (el.value !== undefined) return el.value;
    return el.innerText || '';
  }

  function parseEmailsFromText(text) {
    const re = /[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g;
    const found = text.match(re) || [];
    return Array.from(new Set(found.map(s => s.toLowerCase())));
  }

  function domainOf(email) {
    const parts = email.split('@');
    return parts.length>1 ? parts[1].toLowerCase() : '';
  }

  // Modal / blocking UI
  function createBlockModal(details, allowOverride) {
    // avoid duplicate modal
    if (document.getElementById('dlp-block-modal')) return;
    const overlay = document.createElement('div');
    overlay.id = 'dlp-block-modal';
    overlay.style = `
      position:fixed;top:0;left:0;right:0;bottom:0;
      background:rgba(0,0,0,0.5);display:flex;align-items:center;justify-content:center;
      z-index:2147483647;
    `;
    const box = document.createElement('div');
    box.style = `
      width:480px;background:white;border-radius:8px;padding:18px;font-family:Arial,sans-serif;
      box-shadow:0 6px 30px rgba(0,0,0,0.3);
    `;
    const title = document.createElement('h3');
    title.innerText = 'DLP Blocked: Potential Personal Data / Personal Recipient';
    title.style = 'margin:0 0 8px 0;font-size:16px;';
    const msg = document.createElement('div');
    msg.style = 'font-size:13px;margin-bottom:12px;color:#333';
    msg.innerHTML = `<strong>Detail:</strong><br>${details.replace(/\n/g,'<br>')}`;
    const btnRow = document.createElement('div');
    btnRow.style = 'display:flex;gap:8px;justify-content:flex-end';
    const cancelBtn = document.createElement('button');
    cancelBtn.innerText = 'Cancel Send';
    cancelBtn.style = 'padding:8px 12px;border-radius:6px;border:1px solid #ccc;background:#fff;cursor:pointer;';
    const redactBtn = document.createElement('button');
    redactBtn.innerText = 'Redact Sensitive';
    redactBtn.style = 'padding:8px 12px;border-radius:6px;border:0;background:#f0ad4e;color:#fff;cursor:pointer;';
    const allowBtn = document.createElement('button');
    allowBtn.innerText = 'Allow & Log';
    allowBtn.style = 'padding:8px 12px;border-radius:6px;border:0;background:#28a745;color:#fff;cursor:pointer;';
    btnRow.appendChild(cancelBtn);
    btnRow.appendChild(redactBtn);
    if (allowOverride) btnRow.appendChild(allowBtn);
    box.appendChild(title); box.appendChild(msg); box.appendChild(btnRow);
    overlay.appendChild(box);
    document.body.appendChild(overlay);

    cancelBtn.onclick = () => {
      overlay.remove();
      // do nothing; send was already prevented
    };
    redactBtn.onclick = () => {
      overlay.remove();
      // attempt auto-redact: replace patterns with [REDACTED]
      redactSensitiveInCompose();
    };
    allowBtn.onclick = async () => {
      overlay.remove();
      await pushLog({action: 'override_allow', details});
      // simulate user confirmation by triggering original send attempt programmatically
      triggerOriginalSend();
    };
  }

  // Redact sensitive data: remove matches in body
  function redactSensitiveInCompose() {
    const bodyEls = [
      document.querySelector('div[aria-label="Message Body"]'),
      document.querySelector('div[aria-label="Message body"]'),
      ...document.querySelectorAll('div[contenteditable="true"]')
    ];
    chrome.storage.local.get(['settings'], (res) => {
      const patterns = compilePatterns(res.settings?.pii_patterns || {});
      bodyEls.forEach(el => {
        if (!el) return;
        let text = extractTextFromElement(el);
        for (const p of Object.values(patterns)) text = text.replace(p, '[REDACTED]');
        // replace content
        if (el.isContentEditable) el.innerText = text;
        else if (el.tagName === 'TEXTAREA' || el.tagName === 'INPUT') el.value = text;
      });
    });
  }

  // trigger send programmatically - best effort (click visible send buttons)
  function triggerOriginalSend() {
    const sendSelectors = [
      'div[aria-label^="Send"]','div[aria-label*="Send"]','button[aria-label^="Send"]',
      'button[title="Send"]','button[aria-label="Kirim"]', 'input[value="Send"]'
    ];
    for (const sel of sendSelectors) {
      const el = document.querySelector(sel);
      if (el) { el.click(); return; }
    }
    // fallback: try to submit surrounding forms
    const forms = document.querySelectorAll('form');
    for (const f of forms) {
      try { f.submit(); return; } catch(e) {}
    }
  }

  // main check function
  async function checkBeforeSend(context = {}) {
    const settings = await getSettings();
    if (!settings || settings.enabled === false) return true; // allow

    // gather recipients & body
    const gmail = getGmailComposeElements();
    const outlook = getOutlookComposeElements();

    const bodyText = extractTextFromElement(gmail.bodyEl) || extractTextFromElement(outlook.bodyEl) || '';
    // recipients from inputs or body (for generic)
    let recipients = [];
    const allToEls = [...(gmail.toEls || []), ...(outlook.toEls || [])];
    allToEls.forEach(el => {
      const t = extractTextFromElement(el) || '';
      recipients = recipients.concat(parseEmailsFromText(t));
    });
    // fallback: parse recipients from body if mailto or "To:" present
    if (recipients.length === 0) {
      recipients = recipients.concat(parseEmailsFromText(document.body.innerText));
    }
    recipients = Array.from(new Set(recipients));

    const patterns = compilePatterns(settings.pii_patterns || {});
    const piiFound = {};
    if (settings.pii_patterns_enabled) {
      for (const [name, regex] of Object.entries(patterns)) {
        const m = bodyText.match(regex);
        if (m && m.length) piiFound[name] = Array.from(new Set(m)).slice(0,5);
      }
    }

    // check recipients for personal domains
    const personalHits = [];
    for (const r of recipients) {
      const dom = domainOf(r);
      const isWhitelisted = (settings.whitelist_domains || []).some(w => dom.endsWith(w));
      const isPersonal = (settings.personal_domains || []).some(d => dom === d || dom.endsWith('.' + d));
      if (isPersonal && !isWhitelisted) personalHits.push(r);
    }

    // decide block
    const blockBecauseRecipient = personalHits.length > 0;
    const blockBecausePii = settings.block_on_pii && Object.keys(piiFound).length > 0;
    if (blockBecauseRecipient || blockBecausePii) {
      // log event
      await pushLog({
        action: 'blocked_attempt',
        recipients,
        personalHits,
        piiFound,
        page: location.href
      });

      // prepare details
      let details = '';
      if (personalHits.length) details += `Personal recipients detected: ${personalHits.join(', ')}\n`;
      if (Object.keys(piiFound).length) {
        details += 'PII detected in body You share before allow permision in admin:\n';
        for (const [k, v] of Object.entries(piiFound)) details += ` - ${k}: ${v.join(', ')}\n`;
      }
      // show modal, allow override optionally
      createBlockModal(details, settings.allow_override_with_justification);
      return false; // block send
    }

    return true; // allowed
  }

  // Intercept clicks on send buttons (capture phase)
  function attachInterceptors() {
    const sendButtonSelectorCandidates = [
      'div[aria-label^="Send"]',
      'div[role="button"][aria-label*="Send"]',
      'button[aria-label^="Send"]',
      'button[title="Send"]',
      'input[value="Send"]',
      'button[aria-label="Kirim"]',
      'div[aria-label^="Kirim"]'
    ];
    const observer = new MutationObserver(() => {
      sendButtonSelectorCandidates.forEach(sel => {
        document.querySelectorAll(sel).forEach(btn => {
          if (!btn.dataset.dlpAttached) {
            btn.addEventListener('click', async (ev) => {
              try {
                const ok = await checkBeforeSend({trigger:'click'});
                if (!ok) {
                  ev.stopImmediatePropagation();
                  ev.preventDefault();
                }
              } catch(e) { console.error(e); }
            }, true); // capture
            btn.dataset.dlpAttached = '1';
          }
        });
      });
    });
    observer.observe(document, {childList:true, subtree:true});
    // initial run
    document.querySelectorAll(sendButtonSelectorCandidates.join(',')).forEach(btn => {
      if (!btn.dataset.dlpAttached) {
        btn.addEventListener('click', async (ev) => {
          try {
            const ok = await checkBeforeSend({trigger:'click'});
            if (!ok) {
              ev.stopImmediatePropagation();
              ev.preventDefault();
            }
          } catch(e) { console.error(e); }
        }, true);
        btn.dataset.dlpAttached = '1';
      }
    });

    // keyboard intercept: Ctrl+Enter or Cmd+Enter
    document.addEventListener('keydown', async (ev) => {
      const isSendCombo = (ev.key === 'Enter' && (ev.ctrlKey || ev.metaKey));
      if (isSendCombo) {
        const ok = await checkBeforeSend({trigger:'keyboard'});
        if (!ok) {
          ev.stopImmediatePropagation();
          ev.preventDefault();
        }
      }
    }, true);
  }

  // attempt hooking into mailto links to prevent opening mailto with prefilled personal addresses
  function attachMailtoInterceptor() {
    document.addEventListener('click', async (ev) => {
      const anchor = ev.target.closest && ev.target.closest('a');
      if (anchor && anchor.href && anchor.href.startsWith('mailto:')) {
        const mailto = anchor.href.slice(7);
        const recipients = parseEmailsFromText(mailto);
        const settings = await getSettings();
        const personalHits = recipients.filter(r => {
          const dom = domainOf(r);
          const isWhitelisted = (settings.whitelist_domains || []).some(w => dom.endsWith(w));
          const isPersonal = (settings.personal_domains || []).some(d => dom === d || dom.endsWith('.' + d));
          return isPersonal && !isWhitelisted;
        });
        if (personalHits.length > 0) {
          ev.preventDefault();
          await pushLog({action: 'blocked_mailto', recipients: personalHits, page: location.href});
          const details = `Mailto link contains personal recipients: ${personalHits.join(', ')}`;
          createBlockModal(details, settings.allow_override_with_justification);
        }
      }
    }, true);
  }

  // initialize
  (async function init() {
    try {
      attachInterceptors();
      attachMailtoInterceptor();
      console.log('DLP content script active');
    } catch (e) {
      console.error('DLP init error', e);
    }
  })();

})();
