// Shared logic for the popup and the service worker.
// Pure helpers (parsing, URL building) are kept free of chrome.* so they can be unit tested.

export const DEFAULTS = {
  site: '', // Jira origin, e.g. https://acme.atlassian.net
  template: '', // optional custom issue URL containing {key}; empty = {site}/browse/{key}
  project: '', // default project key, lets the user type a bare number
  mode: 'auto', // auto | new | current
  autoClipboard: false,
  preview: true,
};

const HISTORY_LIMIT = 30;

// ---------- Pure helpers ----------

/**
 * Read free text typed or pasted by the user.
 * Returns { keys, text } where `text` is true when the input also contains
 * words that are not issue keys (so it should be treated as a search).
 *
 * Accepts ABC-123, abc-123, abc123, "ABC 123", 123 (with a default project),
 * full URLs, and comma/space separated lists of any of those.
 * Inside a sentence only explicit KEY-123 forms count, so "fix 500 error"
 * is a search and not ABC-500.
 */
export function analyze(input, project = '') {
  const raw = String(input || '').trim();
  if (!raw) return { keys: [], text: false };

  // "ABC 123" is a key only when it is the whole input.
  const spaced = raw.match(/^([A-Za-z][A-Za-z0-9_]{0,14})\s+(\d{1,7})$/);
  if (spaced) return { keys: [`${spaced[1]}-${spaced[2]}`.toUpperCase()], text: false };

  const explicit = [];
  const all = [];
  let text = false;
  for (const t of raw.split(/[\s,;|]+/).filter(Boolean)) {
    const found = t.match(/[A-Za-z][A-Za-z0-9_]{0,14}-\d{1,7}(?![A-Za-z0-9_])/g);
    if (found) { explicit.push(...found); all.push(...found); continue; }
    const glued = t.match(/^([A-Za-z](?:[A-Za-z0-9_]{0,14}[A-Za-z_])?)(\d{1,7})$/);
    if (glued) { all.push(`${glued[1]}-${glued[2]}`); continue; }
    const bare = t.match(/^#?(\d{1,7})$/);
    if (bare && project) { all.push(`${project}-${bare[1]}`); continue; }
    text = true;
  }
  const keys = [...new Set((text ? explicit : all).map((k) => k.toUpperCase()))];
  return { keys, text };
}

export function parseKeys(input, project = '') {
  return analyze(input, project).keys;
}

/** Stricter detection for page titles and URLs: uppercase keys only. */
export function detectKeys(text) {
  const found = String(text || '').match(/\b[A-Z][A-Z0-9_]{1,9}-\d{1,7}\b/g) || [];
  return [...new Set(found)];
}

/** Turn whatever the user pasted into a Jira origin, or null. */
export function normalizeSite(input) {
  let v = String(input || '').trim();
  if (!v) return null;
  if (/^[a-z0-9-]+$/i.test(v)) v = `${v}.atlassian.net`; // bare workspace name
  if (!/^https?:\/\//i.test(v)) v = `https://${v}`;
  try {
    const u = new URL(v);
    if (!u.hostname.includes('.') && u.hostname !== 'localhost') return null;
    return u.origin;
  } catch { return null; }
}

export function originOf(url) {
  try { return new URL(String(url).replaceAll('{key}', 'X-1')).origin; } catch { return null; }
}

export function hostOf(site) {
  return String(site || '').replace(/^https?:\/\//, '');
}

export function isValidTemplate(t) {
  return typeof t === 'string' && t.includes('{key}') && !!originOf(t);
}

export function issueUrl(key, settings) {
  const template = settings.template || `${settings.site}/browse/{key}`;
  return template.replaceAll('{key}', encodeURIComponent(key));
}

export function projectUrl(key, settings) {
  return `${settings.site}/browse/${encodeURIComponent(key)}`;
}

export function searchUrl(text, settings) {
  const q = String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
  return `${settings.site}/issues/?jql=${encodeURIComponent(`text ~ "${q}" ORDER BY updated DESC`)}`;
}

export function projectOf(key) {
  return String(key).split('-')[0];
}

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

/**
 * Look for a Jira site among open tabs.
 *
 * Returns { site, trusted }. A site is adopted without asking only when it is the one
 * and only Jira Cloud address (https://<name>.atlassian.net) among the open tabs.
 * With several Cloud sites open there is no safe way to pick, and a page elsewhere
 * that merely looks like Jira (a /browse/KEY-1 path) could be an impostor, so in
 * both cases the best guess is only offered as a suggestion the user must confirm.
 */
export function pickSiteFromTabs(tabs) {
  const ranked = [...tabs].sort((a, b) => (b.active - a.active) || ((b.lastAccessed || 0) - (a.lastAccessed || 0)));
  const cloud = [];
  let lookalike = null;
  for (const t of ranked) {
    let u;
    try { u = new URL(t.url || ''); } catch { continue; }
    if (u.protocol === 'https:' && /^[a-z0-9-]+\.atlassian\.net$/i.test(u.hostname)) {
      if (!cloud.includes(u.origin)) cloud.push(u.origin);
    } else if (!lookalike && /^https?:$/.test(u.protocol) && /\/browse\/[A-Z][A-Z0-9_]+-\d+/.test(u.pathname)) {
      lookalike = u.origin;
    }
  }
  if (cloud.length) return { site: cloud[0], trusted: cloud.length === 1 };
  return lookalike ? { site: lookalike, trusted: false } : null;
}

export function sortHistory(history) {
  return [...history].sort((a, b) => (Number(b.pinned) - Number(a.pinned)) || (b.ts - a.ts));
}

// ---------- Settings ----------

export async function getSettings() {
  const raw = await chrome.storage.sync.get(null);
  const s = { ...DEFAULTS, ...raw };
  // Migrate installs that only stored a full URL template.
  if (!s.site && s.template) s.site = originOf(s.template) || '';
  if (s.template && s.template === `${s.site}/browse/{key}`) s.template = '';
  return s;
}

export function saveSettings(patch) {
  return chrome.storage.sync.set(patch);
}

/** { site, trusted } from open tabs, or null. Only a trusted result may be saved without asking. */
export async function detectSite() {
  try {
    return pickSiteFromTabs(await chrome.tabs.query({}));
  } catch { return null; }
}

export function hasAccess(site) {
  if (!site) return Promise.resolve(false);
  return chrome.permissions.contains({ origins: [`${site}/*`] }).catch(() => false);
}

/** Must be called from a user gesture. */
export function requestAccess(site) {
  return chrome.permissions.request({ origins: [`${site}/*`] }).catch(() => false);
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

export function openKeys(keys, { mode, tab, settings }) {
  return openUrls(keys.map((k) => issueUrl(k, settings)), { mode, tab });
}

// ---------- History ----------

export async function getHistory() {
  const { history } = await chrome.storage.local.get({ history: [] });
  return history;
}

async function writeHistory(history) {
  const pinned = history.filter((h) => h.pinned);
  const rest = history.filter((h) => !h.pinned).sort((a, b) => b.ts - a.ts).slice(0, HISTORY_LIMIT);
  await chrome.storage.local.set({ history: [...pinned, ...rest] });
}

export async function addHistory(entries) {
  const history = await getHistory();
  const now = Date.now();
  entries.forEach((e, i) => {
    const ts = now - i; // keep the order the user typed them
    const existing = history.find((h) => h.key === e.key);
    if (existing) Object.assign(existing, e.summary ? e : {}, { ts });
    else history.push({ summary: '', status: '', statusColor: '', pinned: false, ...e, ts });
  });
  await writeHistory(history);
}

export async function updateHistory(key, patch) {
  const history = await getHistory();
  const item = history.find((h) => h.key === key);
  if (!item) return;
  Object.assign(item, patch);
  await writeHistory(history);
}

export async function removeHistory(key) {
  await writeHistory((await getHistory()).filter((h) => h.key !== key));
}

export async function clearHistory({ keepPinned = true } = {}) {
  const history = keepPinned ? (await getHistory()).filter((h) => h.pinned) : [];
  await chrome.storage.local.set({ history });
}

// ---------- Jira REST (uses the browser's existing Jira session, nothing is stored) ----------

async function rest(settings, path, signal) {
  if (!settings.site) return { ok: false, status: 0 };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);
  signal?.addEventListener('abort', () => ctrl.abort());
  try {
    const res = await fetch(`${settings.site}/rest/${path}`, {
      credentials: 'include',
      signal: ctrl.signal,
      headers: { Accept: 'application/json' },
    });
    const data = res.ok ? await res.json().catch(() => null) : null;
    return { ok: res.ok && data !== null, status: res.status, data };
  } catch {
    return { ok: false, status: 0 };
  } finally {
    clearTimeout(timer);
  }
}

function shapeIssue(key, fields = {}) {
  return {
    key,
    summary: fields.summary || '',
    status: fields.status?.name || '',
    statusColor: fields.status?.statusCategory?.colorName || '', // blue-gray | yellow | green
    type: fields.issuetype?.name || '',
    assignee: fields.assignee?.displayName || '',
    priority: fields.priority?.name || '',
  };
}

/** Who is signed in. Returns { name } or { error: 'auth' | 'network' }. */
export async function whoAmI(settings, signal) {
  const r = await rest(settings, 'api/2/myself', signal);
  if (r.ok) return { name: r.data.displayName || r.data.name || '' };
  return { error: r.status === 401 || r.status === 403 ? 'auth' : 'network' };
}

export async function fetchIssue(key, settings, signal) {
  const r = await rest(settings, `api/2/issue/${encodeURIComponent(key)}?fields=summary,status,issuetype,assignee,priority`, signal);
  if (r.status === 404) return { key, missing: true };
  if (!r.ok) return null;
  return shapeIssue(key, r.data.fields);
}

/** Jira's own quick search: matches keys, partial keys and summary text. */
export async function searchIssues(query, settings, signal) {
  const r = await rest(settings, `api/2/issue/picker?showSubTasks=true&query=${encodeURIComponent(query)}`, signal);
  if (!r.ok) return null;
  const seen = new Set();
  const out = [];
  for (const section of r.data.sections || []) {
    for (const i of section.issues || []) {
      if (seen.has(i.key)) continue;
      seen.add(i.key);
      out.push({ key: i.key, summary: i.summaryText || '' });
    }
  }
  return out;
}

export async function searchProjects(query, settings, signal) {
  const r = await rest(settings, `api/2/project/search?maxResults=4&query=${encodeURIComponent(query)}`, signal);
  if (!r.ok) return [];
  return (r.data.values || []).map((p) => ({ key: p.key, name: p.name }));
}

/** Open issues assigned to the signed-in user, most recently updated first. */
export async function myIssues(settings, signal) {
  const jql = encodeURIComponent('assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC');
  const q = `jql=${jql}&fields=summary,status&maxResults=25`;
  let r = await rest(settings, `api/3/search/jql?${q}`, signal); // Jira Cloud
  if (!r.ok && r.status !== 401 && r.status !== 403) r = await rest(settings, `api/2/search?${q}`, signal); // Server / Data Center
  if (!r.ok) return null;
  return (r.data.issues || []).map((i) => shapeIssue(i.key, i.fields));
}

/** Fill in summary and status for history entries after the popup has closed. */
export async function enrichHistory(keys, settings) {
  if (!settings.preview || !(await hasAccess(settings.site))) return;
  await Promise.all(keys.map(async (key) => {
    const issue = await fetchIssue(key, settings);
    if (issue && !issue.missing) {
      await updateHistory(key, { summary: issue.summary, status: issue.status, statusColor: issue.statusColor });
    }
  }));
}

/** Record opened issues, and learn the default project from the first one opened. */
export async function recordOpen(entries, settings) {
  await addHistory(entries);
  if (!settings.project && entries[0]) {
    settings.project = projectOf(entries[0].key);
    await saveSettings({ project: settings.project });
  }
}
