import {
  getSettings, saveTrackers, findTrackers, newTracker, contextOf, enabledTrackers, resolve,
  openUrls, recordOpen, enrichHistory, getHistory, sortHistory,
} from './lib/core.js';
import { providerOf, titleOf } from './lib/providers/index.js';

const MENU_ID = 'issue-jump-selection';
const HINT = 'Jump to an issue: type a key like <match>ABC-123</match>, a number, or a few words';

chrome.runtime.onInstalled.addListener(async () => {
  chrome.contextMenus.create({ id: MENU_ID, title: 'Jump to “%s”', contexts: ['selection'] });
  await ready();
});

/**
 * Settings with at least one tracker. On first use, trackers that can only be
 * what they look like (see detectTrackers) are added from open tabs.
 */
async function ready() {
  const settings = await getSettings();
  if (!settings.trackers.length) {
    const found = (await findTrackers()).filter((f) => f.trusted);
    if (found.length) {
      settings.trackers = found.map(({ trusted, type, ...fields }) => newTracker(type, fields));
      await saveTrackers(settings);
    }
  }
  return settings;
}

function openSetup() {
  chrome.tabs.create({ url: chrome.runtime.getURL('popup.html') });
}

/** Open whatever the text means: issues if it names any, otherwise a search in the main tracker. */
async function jump(text, mode, tab) {
  const settings = await ready();
  const trackers = enabledTrackers(settings);
  if (!trackers.length) return openSetup();

  const { items } = resolve(text, contextOf(settings));
  if (!items.length) {
    const q = String(text || '').trim();
    const main = trackers.find((t) => t.id === settings.numbersTo && providerOf(t).searchUrl) || trackers.find((t) => providerOf(t).searchUrl);
    if (q && main) await openUrls([providerOf(main).searchUrl(q, main)], { mode, tab });
    return;
  }
  const refs = items.map((i) => i.refs[0]);
  await openUrls(refs.map((r) => r.url), { mode, tab });
  await recordOpen(refs, settings);
  enrichHistory(refs, settings);
}

// Right-click selected text: open the issue(s) in a new tab next to the current one.
chrome.contextMenus.onClicked.addListener((info, tab) => {
  if (info.menuItemId === MENU_ID) jump(info.selectionText, 'new', tab);
});

// The popup asks for summaries to be fetched after it has closed.
chrome.runtime.onMessage.addListener((msg) => {
  if (msg?.type === 'enrich' && Array.isArray(msg.refs)) {
    getSettings().then((settings) => enrichHistory(msg.refs, settings));
  }
});

// ---------- Omnibox: type "j", a space, then a key ----------

const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' }[c]));

chrome.omnibox.setDefaultSuggestion({ description: HINT });

chrome.omnibox.onInputChanged.addListener(async (text, suggest) => {
  const settings = await getSettings();
  const { items } = resolve(text, contextOf(settings));
  const q = text.trim();
  let description = HINT;
  if (items.length) {
    const first = items[0].refs[0];
    const tracker = settings.trackers.find((t) => t.id === first.tracker);
    description = `Open <match>${esc(items.map((i) => i.key).join(', '))}</match> <dim>${esc(titleOf(tracker))}</dim>`;
  } else if (q) {
    description = `Search for <match>${esc(q)}</match>`;
  }
  chrome.omnibox.setDefaultSuggestion({ description });

  const typed = new Set(items.map((i) => i.key));
  const needle = q.toLowerCase();
  const matches = sortHistory(await getHistory())
    .filter((h) => !typed.has(h.key) && `${h.key} ${h.summary}`.toLowerCase().includes(needle))
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
