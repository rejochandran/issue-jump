// Logic shared by the popup and the service worker.
// The top half is pure (no chrome.*) and unit tested. The bottom half wraps
// chrome.storage, chrome.tabs and chrome.permissions.
import { PROVIDERS, providerOf, takesKeys, projectOf } from './providers/index.js';

export const DEFAULTS = {
  trackers: [], // [{ id, type, enabled, ...provider fields }]
  numbersTo: '', // id of the tracker that bare numbers go to
  prefixes: {}, // learned: project prefix -> tracker id, e.g. { WEB: 'jira-1' }
  mode: 'auto', // auto | new | current
  autoClipboard: false,
  preview: true,
};

const HISTORY_LIMIT = 30;
const KEY = /[A-Za-z][A-Za-z0-9_]{0,14}-\d{1,7}(?![A-Za-z0-9_])/g;

// ---------- Pure: understanding what was typed ----------

const refFor = (t, key) => ({ tracker: t.id, key, url: providerOf(t).url(key, t) });

/**
 * Work out what the user means.
 *
 * `trackers` are the enabled trackers, `numbersTo` the id bare numbers go to and
 * `prefixes` the learned prefix -> tracker map.
 *
 * Returns { items, text }. Each item is { key, refs } where refs lists every
 * tracker the key could belong to, best guess first. `text` is true when the
 * input also holds words that are not issue references, so it should be searched.
 *
 * Understands ABC-123, abc123, "ABC 123", owner/repo#12, group/project!34, #12,
 * bare numbers, tracker links, and lists of any of those. Inside a sentence only
 * explicit forms count, so "fix 500 error" is a search and not issue 500.
 */
export function resolve(input, { trackers = [], numbersTo = '', prefixes = {} } = {}) {
  const raw = String(input || '').trim();
  if (!raw) return { items: [], text: false };

  const keyed = trackers.filter(takesKeys);
  const numberTracker = trackers.find((t) => t.id === numbersTo) || trackers[0];

  const forKey = (rawKey) => {
    const key = rawKey.toUpperCase();
    const prefix = key.split('-')[0];
    const learned = keyed.find((t) => t.id === prefixes[prefix]);
    const owners = keyed.filter((t) => projectOf(t) === prefix);
    const candidates = learned ? [learned] : owners.length ? owners : keyed;
    return candidates.length ? { key, refs: candidates.map((t) => refFor(t, key)) } : null;
  };

  const forRef = (path, mark, n) => {
    const hits = [];
    for (const t of trackers) {
      const key = providerOf(t).fromRef?.(path, mark, n, t);
      if (key) hits.push({ t, key, home: (t.repo || t.project || '').toLowerCase() === path.toLowerCase() });
    }
    hits.sort((a, b) => Number(b.home) - Number(a.home));
    const best = hits.some((h) => h.home) ? hits.filter((h) => h.home) : hits;
    return best.length ? { key: best[0].key, refs: best.map((h) => refFor(h.t, h.key)) } : null;
  };

  const forNumber = (mark, n) => {
    // "!34" is a merge request, so it goes to a tracker that has them.
    const order = [numberTracker, ...trackers].filter(Boolean);
    for (const t of order) {
      const key = providerOf(t).fromNumber?.(n, t, mark);
      if (key && (mark !== '!' || key.includes('!'))) return { key, refs: [refFor(t, key)] };
      if (mark !== '!') break;
    }
    return null;
  };

  // "ABC 123" is a key only when it is the whole input.
  const spaced = raw.match(/^([A-Za-z][A-Za-z0-9_]{0,14})\s+(\d{1,7})$/);
  if (spaced) {
    const item = forKey(`${spaced[1]}-${spaced[2]}`);
    if (item) return { items: [item], text: false };
  }

  const explicit = [];
  const all = [];
  let text = false;
  const add = (item, isExplicit) => {
    if (!item) { text = true; return; }
    all.push(item);
    if (isExplicit) explicit.push(item);
  };

  for (const token of raw.split(/[\s,;|]+/).filter(Boolean)) {
    if (/^https?:\/\//i.test(token)) {
      let url = null;
      try { url = new URL(token); } catch { /* fall through to key matching */ }
      const owner = url && trackers.map((t) => ({ t, key: providerOf(t).fromUrl?.(url, t) })).find((h) => h.key);
      if (owner) { add({ key: owner.key, refs: [refFor(owner.t, owner.key)] }, true); continue; }
    }
    const ref = token.match(/^([\w.-]+(?:\/[\w.-]+)+)([#!])(\d{1,7})$/);
    if (ref) { add(forRef(ref[1], ref[2], ref[3]), true); continue; }

    const found = token.match(KEY);
    if (found) { found.forEach((k) => add(forKey(k), true)); continue; }

    const glued = token.match(/^([A-Za-z](?:[A-Za-z0-9_]{0,14}[A-Za-z_])?)(\d{1,7})$/);
    if (glued && keyed.length) { add(forKey(`${glued[1]}-${glued[2]}`), false); continue; }

    const bare = token.match(/^([#!]?)(\d{1,7})$/);
    if (bare) { add(forNumber(bare[1], bare[2]), false); continue; }

    text = true;
  }

  const seen = new Set();
  const items = (text ? explicit : all).filter((i) => {
    const id = `${i.refs[0].tracker}:${i.key}`;
    return !seen.has(id) && seen.add(id);
  });
  return { items, text };
}

/** Issue references in a tab: its address first, then uppercase keys in its title. */
export function refsOnPage(tab, ctx) {
  const out = [];
  const seen = new Set();
  const take = (item) => {
    const ref = item?.refs[0];
    if (ref && !seen.has(`${ref.tracker}:${ref.key}`)) { seen.add(`${ref.tracker}:${ref.key}`); out.push(ref); }
  };
  if (/^https?:/.test(tab?.url || '')) resolve(tab.url, ctx).items.forEach(take);
  const inTitle = String(tab?.title || '').match(/\b[A-Z][A-Z0-9_]{1,9}-\d{1,7}\b/g) || [];
  inTitle.forEach((k) => resolve(k, ctx).items.forEach(take));
  return out.slice(0, 4);
}

// ---------- Pure: tabs ----------

const BLANK_PREFIXES = [
  'chrome://newtab', 'chrome://new-tab-page', 'chrome-search://local-ntp',
  'edge://newtab', 'brave://newtab', 'vivaldi://newtab', 'about:blank', 'about:newtab',
];

export function isBlankTab(tab) {
  if (!tab) return false;
  const url = tab.pendingUrl || tab.url || '';
  return url === '' || BLANK_PREFIXES.some((p) => url.startsWith(p));
}

/** Decide whether the first URL replaces the current tab. */
export function resolvesToCurrent(mode, tab) {
  if (mode === 'current') return true;
  if (mode === 'new') return false;
  return isBlankTab(tab);
}

/** What makes two tracker entries "the same tracker". */
export function signature(t) {
  return `${t.type}:${t.site || t.workspace || t.template || ''}`.toLowerCase();
}

/**
 * Look for trackers among open tabs.
 *
 * Returns [{ type, ...fields, trusted }], most recently used first, skipping any
 * that match `existing`. `trusted` means the address can only belong to that
 * service (github.com, gitlab.com, linear.app, <name>.atlassian.net), so it may
 * be added without asking. A self-hosted page that merely looks like a tracker,
 * or one of several Jira Cloud sites, is only ever a suggestion to confirm.
 */
export function detectTrackers(tabs, existing = []) {
  const ranked = [...tabs].sort((a, b) => (Number(b.active) - Number(a.active)) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)));
  const found = new Map();
  for (const tab of ranked) {
    let url;
    try { url = new URL(tab.url || ''); } catch { continue; }
    if (!/^https?:$/.test(url.protocol)) continue;
    for (const p of PROVIDERS) {
      const hit = p.detect?.(url);
      if (!hit) continue;
      const entry = { type: p.type, ...hit };
      const sig = signature(entry);
      const prior = found.get(sig);
      if (!prior) found.set(sig, entry);
      else for (const [k, v] of Object.entries(entry)) if (v && !prior[k]) prior[k] = v; // fill in a repo or project seen later
      break;
    }
  }
  const list = [...found.values()];
  // With several Jira Cloud sites open there is no safe way to pick one.
  const jiraCloud = list.filter((e) => e.type === 'jira' && e.trusted);
  if (jiraCloud.length > 1) jiraCloud.forEach((e) => { e.trusted = false; });
  const have = new Set(existing.map(signature));
  return list.filter((e) => !have.has(signature(e)));
}

export function sortHistory(history) {
  return [...history].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.ts - a.ts));
}

/** Turn settings saved by 1.0 (one Jira site) into the tracker list. */
export function migrate(raw) {
  const s = { ...DEFAULTS, ...raw };
  if (!Array.isArray(s.trackers)) s.trackers = [];
  if (!s.trackers.length && (raw.site || raw.template)) {
    let site = raw.site || '';
    try { if (!site) site = new URL(String(raw.template).replaceAll('{key}', 'X-1')).origin; } catch { /* ignore */ }
    if (site) {
      const template = raw.template && raw.template !== `${site}/browse/{key}` ? raw.template : '';
      s.trackers = [{ id: 'jira', type: 'jira', enabled: true, site, project: raw.project || '', template }];
    }
  }
  s.trackers = s.trackers.filter((t) => providerOf(t));
  if (!s.trackers.some((t) => t.id === s.numbersTo)) s.numbersTo = s.trackers[0]?.id || '';
  delete s.site; delete s.template; delete s.project;
  return s;
}

export const enabledTrackers = (settings) => settings.trackers.filter((t) => t.enabled !== false);

/** The context `resolve` needs, from settings. */
export const contextOf = (settings) => ({ trackers: enabledTrackers(settings), numbersTo: settings.numbersTo, prefixes: settings.prefixes });

export function newTracker(type, fields = {}) {
  return { id: `${type}-${Math.random().toString(36).slice(2, 8)}`, type, enabled: true, ...fields };
}

// ---------- Settings ----------

/** Settings with each tracker's token (kept on this device only) merged in. */
export async function getSettings() {
  const [raw, { tokens }] = await Promise.all([chrome.storage.sync.get(null), chrome.storage.local.get({ tokens: {} })]);
  const s = migrate(raw);
  s.trackers = s.trackers.map((t) => ({ ...t, token: tokens[t.id] || '' }));
  return s;
}

export function saveSettings(patch) {
  return chrome.storage.sync.set(patch);
}

/** Save the tracker list. Tokens go to local storage so they never sync. */
export async function saveTrackers(settings) {
  const tokens = {};
  const trackers = settings.trackers.map(({ token, ...rest }) => { if (token) tokens[rest.id] = token; return rest; });
  if (!trackers.some((t) => t.id === settings.numbersTo)) settings.numbersTo = trackers[0]?.id || '';
  await Promise.all([
    chrome.storage.sync.set({ trackers, numbersTo: settings.numbersTo }),
    chrome.storage.sync.remove(['site', 'template', 'project']),
    chrome.storage.local.set({ tokens }),
  ]);
}

export async function findTrackers(existing = []) {
  try { return detectTrackers(await chrome.tabs.query({}), existing); } catch { return []; }
}

/** Whether lookups (previews, search) can run for this tracker right now. */
export async function canLookup(t) {
  const p = providerOf(t);
  const origins = p.origins(t);
  if (!p.issue || !origins.length) return false;
  return chrome.permissions.contains({ origins }).catch(() => false);
}

/** Ask Chrome for access to these trackers' sites. Must be called from a user gesture. */
export function requestAccess(trackers) {
  const origins = [...new Set(trackers.flatMap((t) => providerOf(t).origins(t)))];
  if (!origins.length) return Promise.resolve(true);
  return chrome.permissions.request({ origins }).catch(() => false);
}

// ---------- Opening ----------

/** Open URLs. The first one follows `mode`; the rest open as background tabs after it. */
export async function openUrls(urls, { mode, tab }) {
  if (!urls.length) return;
  let index = tab ? tab.index + 1 : undefined;
  const windowId = tab?.windowId;

  if (tab && resolvesToCurrent(mode, tab)) {
    await chrome.tabs.update(tab.id, { url: urls[0] });
  } else {
    const t = await chrome.tabs.create({ url: urls[0], index, windowId, active: true });
    index = t.index + 1;
  }
  for (const url of urls.slice(1)) {
    const t = await chrome.tabs.create({ url, index, windowId, active: false });
    index = t.index + 1;
  }
}

// ---------- History ----------

const same = (a, b) => a.key === b.key && (a.tracker || '') === (b.tracker || '');

export async function getHistory() {
  const { history } = await chrome.storage.local.get({ history: [] });
  return history;
}

async function writeHistory(history) {
  const pinned = history.filter((h) => h.pinned);
  const rest = history.filter((h) => !h.pinned).sort((a, b) => b.ts - a.ts).slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ history: [...pinned, ...rest] });
}

/** Entries are { tracker, key, url, summary?, status?, statusColor?, pinned? }. */
export async function addHistory(entries) {
  const history = await getHistory();
  const now = Date.now();
  entries.forEach((e, i) => {
    const ts = now - i; // keep the order the user typed them
    const existing = history.find((h) => same(h, e));
    if (existing) Object.assign(existing, e.summary ? e : { url: e.url }, { ts });
    else history.push({ summary: '', status: '', statusColor: '', pinned: false, ...e, ts });
  });
  await writeHistory(history);
}

export async function updateHistory(ref, patch) {
  const history = await getHistory();
  const item = history.find((h) => same(h, ref));
  if (!item) return;
  Object.assign(item, patch);
  await writeHistory(history);
}

export async function removeHistory(ref) {
  await writeHistory((await getHistory()).filter((h) => !same(h, ref)));
}

export async function clearHistory({ keepPinned = true } = {}) {
  const history = keepPinned ? (await getHistory()).filter((h) => h.pinned) : [];
  await chrome.storage.local.set({ history });
}

/**
 * Record opened issues and learn from them: which tracker a key prefix belongs
 * to, and the default project when none is set yet.
 */
export async function recordOpen(entries, settings) {
  await addHistory(entries);
  let learned = false;
  let trackersChanged = false;
  for (const e of entries) {
    const t = settings.trackers.find((x) => x.id === e.tracker);
    if (!t || !takesKeys(t) || !/^[A-Z][A-Z0-9_]*-\d+$/.test(e.key)) continue;
    const prefix = e.key.split('-')[0];
    if (settings.prefixes[prefix] !== t.id) { settings.prefixes = { ...settings.prefixes, [prefix]: t.id }; learned = true; }
    if (!projectOf(t)) { t[t.type === 'linear' ? 'team' : 'project'] = prefix; trackersChanged = true; }
  }
  if (learned) await saveSettings({ prefixes: settings.prefixes });
  if (trackersChanged) await saveTrackers(settings);
}

/** Fill in summary and status for history entries after the popup has closed. */
export async function enrichHistory(refs, settings) {
  if (!settings.preview) return;
  await Promise.all(refs.map(async (ref) => {
    const t = settings.trackers.find((x) => x.id === ref.tracker);
    if (!t || !(await canLookup(t))) return;
    const issue = await providerOf(t).issue(ref.key, t);
    if (issue && !issue.missing) await updateHistory(ref, { summary: issue.summary, status: issue.status, statusColor: issue.statusColor });
  }));
}
