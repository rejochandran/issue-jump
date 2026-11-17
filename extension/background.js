import {
  getSettings, saveSettings, detectSite, analyze, openKeys, openUrls, recordOpen, enrichHistory,
  getHistory, sortHistory, issueUrl, searchUrl,
} from './lib/jira.js';

const MENU_ID = 'issue-jump-selection';
const HINT = 'Open a Jira issue: type a key like <match>ABC-123</match>, a number, or a few words';

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({ id: MENU_ID, title: 'Open “%s” in Jira', contexts: ['selection'] });
  await ready();
});

/** Settings with a Jira site, detecting one from open tabs when none is saved yet. */
async function ready() {
  const settings = await getSettings();
  if (!settings.site) {
    // Only a Jira Cloud tab is adopted silently; anything else goes through the setup screen.
    const found = await detectSite();
    if (found?.trusted) {
      settings.site = found.site;
      await saveSettings({ site: settings.site });
    }
  }
  return settings;
}

function openSetup() {
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
}

/** Open whatever the text means: issue keys if it has any, otherwise a Jira text search. */
async function jump(text, mode, tab) {
  const settings = await ready();
  if (!settings.site) return openSetup();
  const { keys } = analyze(text, settings.project);
  if (!keys.length) {
    const q = String(text || '').trim();
    if (q) await openUrls([searchUrl(q, settings)], { mode, tab });
    return;
  }
  await openKeys(keys, { mode, tab, settings });
  await recordOpen(keys.map((key) => ({ key })), settings);
  enrichHistory(keys, settings);
}

// Right-click selected text: open the issue(s) in a new tab next to the current one.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) jump(info.selectionText, 'new', tab);
});

// The popup asks for summaries to be fetched after it has closed.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'enrich' && Array.isArray(msg.keys)) {
    getSettings().then((settings) => enrichHistory(msg.keys, settings));
  }
});

// ---------- Omnibox: type "j", a space, then a key ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

chrome.omnibox.setDefaultSuggestion({ description: HINT });

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const settings = await getSettings();
  const { keys } = analyze(text, settings.project);
  const q = text.trim();
  let description = HINT;
  if (keys.length && settings.site) {
    description = `Open <match>${esc(keys.join(', '))}</match> <dim>${esc(issueUrl(keys[0], settings))}</dim>`;
  } else if (q) {
    description = `Search Jira for <match>${esc(q)}</match>`;
  }
  chrome.omnibox.setDefaultSuggestion({ description });

  const needle = q.toLowerCase();
  const matches = sortHistory(await getHistory())
    .filter((h) => !keys.includes(h.key) && `${h.key} ${h.summary}`.toLowerCase().includes(needle))
    .slice(0, 6);
  suggest(matches.map((h) => ({
    content: h.key,
    description: `<match>${esc(h.key)}</match>${h.summary ? ` <dim>${esc(h.summary)}</dim>` : ''}`,
  })));
});

chrome.omnibox.onInputEntered.addListener(async (text, disposition) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  jump(text, disposition === 'currentTab' ? 'current' : 'new', tab);
});
