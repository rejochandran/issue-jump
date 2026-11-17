import {
  getSettings, saveSettings, detectSite, hasAccess, requestAccess, normalizeSite, hostOf, isValidTemplate,
  analyze, detectKeys, issueUrl, projectUrl, searchUrl, resolvesToCurrent, openUrls,
  getHistory, sortHistory, recordOpen, addHistory, updateHistory, removeHistory, clearHistory,
  whoAmI, fetchIssue, searchIssues, searchProjects, myIssues,
} from './lib/jira.js';

const $ = (id) => document.getElementById(id);
const app = $('app');
const input = $('input');
const results = $('results');

const isMac = /mac/i.test(navigator.userAgentData?.platform || navigator.platform || '');
$('modKey').textContent = isMac ? '⌘' : 'Ctrl';

const state = {
  settings: null,
  tab: null, // the tab the popup was opened on
  history: [],
  access: false, // host permission for the Jira site
  signedOut: false,
  list: 'recent', // recent | mine
  mine: undefined, // undefined = not loaded, null = failed, [] = loaded
  query: { keys: [], text: false, raw: '' },
  remote: { for: '', issues: [], projects: [] },
  issues: new Map(), // key -> fetched issue (or null when the lookup failed)
  rows: [],
  sel: 0,
  held: null, // open mode forced by a held modifier key
  notice: null,
};

let lookupTimer = null;
let lookupAbort = null;

// ---------- Small helpers ----------

// Static, trusted SVG only. Anything from Jira or the user goes through textContent.
const ICONS = {
  star: '<svg viewBox="0 0 16 16" width="13" height="13"><path fill="currentColor" d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>',
  starOff: '<svg viewBox="0 0 16 16" width="13" height="13"><path fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" d="M8 2.4l1.7 3.5 3.9.6-2.8 2.7.7 3.9L8 11.2l-3.5 1.9.7-3.9-2.8-2.7 3.9-.6z"/></svg>',
  copy: '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="5.5" y="5.5" width="8" height="8" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.5 5.5v-1a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  remove: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  search: '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.2 10.2l3.3 3.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  stack: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 2.5l5.5 3L8 8.5l-5.5-3zM2.5 8.5L8 11.5l5.5-3M2.5 11L8 14l5.5-3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
};

function icon(name, className) {
  const span = document.createElement('span');
  if (className) span.className = className;
  span.innerHTML = ICONS[name];
  return span;
}

function el(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text != null) node.textContent = text;
  return node;
}

function toast(message) {
  const t = $('toast');
  t.textContent = message;
  t.classList.add('show');
  clearTimeout(toast.timer);
  toast.timer = setTimeout(() => t.classList.remove('show'), 1500);
}

function ago(ts) {
  const s = (Date.now() - ts) / 1000;
  if (s < 60) return 'now';
  if (s < 3600) return `${Math.floor(s / 60)}m`;
  if (s < 86400) return `${Math.floor(s / 3600)}h`;
  if (s < 86400 * 7) return `${Math.floor(s / 86400)}d`;
  return new Date(ts).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
}

function modeFor(e) {
  if (e?.metaKey || e?.ctrlKey || e?.button === 1) return 'new';
  if (e?.shiftKey) return 'current';
  return state.settings.mode;
}

const lookupsOn = () => state.settings.preview && state.access && !!state.settings.site;

function show(view) {
  app.dataset.view = view;
  if (view === 'main') requestAnimationFrame(() => input.focus());
}

// ---------- Opening ----------

async function openIssues(keys, mode) {
  const entries = keys.map((key) => {
    const known = state.issues.get(key) || state.remote.issues.find((i) => i.key === key) || (state.mine || []).find((i) => i.key === key);
    return known?.summary ? { key, summary: known.summary, status: known.status || '', statusColor: known.statusColor || '' } : { key };
  });
  await recordOpen(entries, state.settings);
  const unknown = entries.filter((e) => !e.status).map((e) => e.key);
  if (unknown.length && lookupsOn()) chrome.runtime.sendMessage({ type: 'enrich', keys: unknown }).catch(() => {});
  await openUrls(keys.map((k) => issueUrl(k, state.settings)), { mode, tab: state.tab });
  window.close();
}

async function activate(row, mode) {
  if (!row) return;
  if (row.kind === 'issue') return openIssues([row.key], mode);
  if (row.kind === 'many') return openIssues(row.keys, mode);
  await openUrls([row.url], { mode, tab: state.tab });
  window.close();
}

// ---------- Building the list ----------

function issueRow(issue, extra = {}) {
  const saved = state.history.find((h) => h.key === issue.key);
  const fetched = state.issues.get(issue.key);
  const live = fetched && !fetched.missing ? fetched : {};
  return {
    kind: 'issue',
    key: issue.key,
    title: live.summary || issue.summary || saved?.summary || '',
    status: live.status || issue.status || saved?.status || '',
    statusColor: live.statusColor || issue.statusColor || saved?.statusColor || '',
    pinned: !!saved?.pinned,
    saved: !!saved,
    ts: extra.showTime ? saved?.ts : undefined,
    url: issueUrl(issue.key, state.settings),
    placeholder: fetched?.missing ? 'Not found, or you don’t have access' : 'Open issue',
    ...extra,
  };
}

function buildRows() {
  const { keys, text, raw } = state.query;
  const sections = [];
  const shown = new Set();
  const take = (list) => list.filter((i) => !shown.has(i.key) && shown.add(i.key));

  if (!raw) {
    const onPage = take(detectKeys(`${state.tab?.title || ''} ${state.tab?.url || ''}`).slice(0, 4).map((key) => ({ key })));
    if (onPage.length) sections.push({ label: 'On this page', rows: onPage.map((i) => issueRow(i)) });

    if (state.list === 'mine') {
      const section = { tabs: true, rows: [] };
      if (state.mine === undefined) section.info = 'Loading…';
      else if (state.mine === null) section.info = 'Couldn’t reach Jira. Check that you’re signed in.';
      else if (!state.mine.length) section.info = 'Nothing open is assigned to you.';
      else section.rows = state.mine.map((i) => issueRow(i));
      sections.push(section);
    } else {
      const recent = sortHistory(state.history);
      const section = { tabs: true, rows: recent.map((h) => issueRow(h, { showTime: true, removable: true })) };
      if (!recent.length) section.info = `Type a key like ${state.settings.project || 'ABC'}-123, paste a link, or search by a few words. Issues you open are kept here.`;
      sections.push(section);
    }
    return sections;
  }

  // What Enter does comes first.
  const top = [];
  if (keys.length === 1) {
    const fetched = state.issues.get(keys[0]);
    const pending = lookupsOn() && fetched === undefined;
    top.push(issueRow({ key: keys[0] }, pending ? { placeholder: '' } : {}));
    shown.add(keys[0]);
  } else if (keys.length > 1) {
    top.push({ kind: 'many', keys, lead: 'stack', title: `Open all ${keys.length}`, meta: resolvesToCurrent(state.held || state.settings.mode, state.tab) ? 'first here, rest in new tabs' : 'in new tabs' });
    keys.forEach((k) => { shown.add(k); top.push(issueRow({ key: k })); });
  }
  if (top.length) sections.push({ rows: top });

  if (keys.length <= 1) {
    const needle = raw.toLowerCase();
    const prefix = keys[0]?.toLowerCase();
    const local = take(sortHistory(state.history).filter((h) => {
      const hay = `${h.key} ${h.summary || ''}`.toLowerCase();
      return hay.includes(needle) || (prefix && h.key.toLowerCase().startsWith(prefix));
    })).slice(0, 5);
    if (local.length) sections.push({ label: 'Recent', rows: local.map((h) => issueRow(h, { showTime: true, removable: true })) });

    if (state.remote.for === raw) {
      const found = take(state.remote.issues).slice(0, 7);
      if (found.length) sections.push({ label: 'In Jira', rows: found.map((i) => issueRow(i)) });
      if (state.remote.projects.length) {
        sections.push({
          label: 'Projects',
          rows: state.remote.projects.map((p) => ({ kind: 'link', key: p.key, title: p.name, meta: 'Project', url: projectUrl(p.key, state.settings) })),
        });
      }
    }
  }

  if (text || !keys.length) {
    sections.push({ rows: [{ kind: 'link', lead: 'search', title: `Search Jira for “${raw}”`, url: searchUrl(raw, state.settings) }] });
  }
  return sections;
}

function renderRow(row, index) {
  const li = el('div', 'item');
  li.role = 'option';
  li.id = `row-${index}`;
  li.dataset.index = index;

  if (row.lead) li.append(icon(row.lead, 'lead'));
  if (row.key) li.append(el('span', 'key', row.key));

  const title = el('span', 'title', row.title || row.placeholder || '');
  if (!row.title) title.classList.add('quiet');
  li.append(title);

  if (row.pinned) li.append(icon('star', 'pinmark'));

  const meta = el('span', 'meta');
  if (row.status) {
    meta.append(el('span', `dot ${row.statusColor || ''}`), el('span', 'txt', row.status));
    meta.title = row.status;
  } else if (row.ts) {
    meta.append(el('span', 'txt time', ago(row.ts)));
  } else if (row.meta) {
    meta.append(el('span', 'txt', row.meta));
    meta.title = row.meta;
  }
  if (meta.childNodes.length) li.append(meta);

  if (row.kind === 'issue') {
    const acts = el('span', 'acts');
    const button = (act, name, label, on) => {
      const b = el('button', `act${on ? ' on' : ''}`);
      b.type = 'button';
      b.tabIndex = -1;
      b.dataset.act = act;
      b.title = label;
      b.setAttribute('aria-label', label);
      b.innerHTML = ICONS[name];
      return b;
    };
    acts.append(button('pin', row.pinned ? 'star' : 'starOff', row.pinned ? 'Unpin' : 'Pin', row.pinned));
    acts.append(button('copy', 'copy', 'Copy link'));
    if (row.removable) acts.append(button('remove', 'remove', 'Remove from recent'));
    li.append(acts);
  }
  return li;
}

function renderTabs() {
  const head = el('div', 'group');
  for (const [id, label] of [['recent', 'Recent'], ['mine', 'Assigned to me']]) {
    const b = el('button', '', label);
    b.type = 'button';
    b.tabIndex = -1;
    b.dataset.list = id;
    b.setAttribute('aria-selected', String(state.list === id));
    head.append(b);
  }
  return head;
}

function render() {
  const sections = buildRows();
  state.rows = sections.flatMap((s) => s.rows);
  state.sel = Math.min(state.sel, Math.max(0, state.rows.length - 1));

  const nodes = [];
  let index = 0;
  for (const section of sections) {
    if (section.tabs) nodes.push(lookupsOn() && !state.signedOut ? renderTabs() : el('div', 'group', 'Recent'));
    else if (section.label) nodes.push(el('div', 'group', section.label));
    for (const row of section.rows) nodes.push(renderRow(row, index++));
    if (section.info) nodes.push(el('div', 'info', section.info));
  }
  results.replaceChildren(...nodes);
  paintSelection();
  renderEnter();
}

function paintSelection() {
  results.querySelectorAll('.item').forEach((n) => {
    const on = Number(n.dataset.index) === state.sel;
    n.classList.toggle('sel', on);
    n.setAttribute('aria-selected', String(on));
  });
  input.setAttribute('aria-activedescendant', state.rows.length ? `row-${state.sel}` : '');
}

function select(index, scroll = true) {
  if (!state.rows.length) return;
  state.sel = (index + state.rows.length) % state.rows.length;
  paintSelection();
  if (scroll) results.querySelector('.item.sel')?.scrollIntoView({ block: 'nearest' });
}

function renderEnter() {
  const here = resolvesToCurrent(state.held || state.settings.mode, state.tab);
  $('goLabel').textContent = here ? 'This tab' : 'New tab';
  $('go').classList.toggle('forced', !!state.held);
}

function renderNotice() {
  const n = state.notice;
  $('notice').hidden = !n;
  if (!n) return;
  $('noticeText').textContent = n.text;
  $('noticeAction').textContent = n.action;
  $('noticeClose').hidden = !n.dismiss;
}

function setNotice(notice) {
  state.notice = notice;
  renderNotice();
}

// ---------- Lookups ----------

function onQuery() {
  const raw = input.value.trim();
  state.query = { ...analyze(raw, state.settings.project), raw };
  state.sel = 0;
  render();

  clearTimeout(lookupTimer);
  lookupAbort?.abort();
  if (!raw || !lookupsOn()) return;

  lookupTimer = setTimeout(async () => {
    lookupAbort = new AbortController();
    const { signal } = lookupAbort;
    const { keys, text } = state.query;
    const jobs = [];

    for (const key of keys.slice(0, 8).filter((k) => !state.issues.has(k))) {
      jobs.push(fetchIssue(key, state.settings, signal).then((issue) => {
        if (signal.aborted) return;
        state.issues.set(key, issue);
        if (issue && !issue.missing && state.history.some((h) => h.key === issue.key)) {
          updateHistory(issue.key, { summary: issue.summary, status: issue.status, statusColor: issue.statusColor });
        }
        render();
      }));
    }

    if (keys.length <= 1 && raw.length >= 2 && state.remote.for !== raw) {
      const wantProjects = (text || !keys.length) && /^[\p{L}\p{N}_ -]+$/u.test(raw);
      jobs.push(Promise.all([
        searchIssues(raw, state.settings, signal),
        wantProjects ? searchProjects(raw, state.settings, signal) : [],
      ]).then(([issues, projects]) => {
        if (signal.aborted) return;
        state.remote = { for: raw, issues: issues || [], projects: projects || [] };
        render();
      }));
    }
    await Promise.all(jobs);
  }, 180);
}

/** Fill in summaries for rows that only have a key (keys found on the page, old history). */
async function hydrate() {
  if (!lookupsOn()) return;
  const onPage = detectKeys(`${state.tab?.title || ''} ${state.tab?.url || ''}`).slice(0, 4);
  const bare = state.history.filter((h) => !h.summary).map((h) => h.key).slice(0, 4);
  const keys = [...new Set([...onPage, ...bare])].filter((k) => !state.issues.has(k));
  await Promise.all(keys.map(async (key) => {
    const issue = await fetchIssue(key, state.settings);
    state.issues.set(key, issue);
    if (issue && !issue.missing && bare.includes(key)) {
      updateHistory(key, { summary: issue.summary, status: issue.status, statusColor: issue.statusColor });
    }
  }));
  if (keys.length) render();
}

async function loadMine() {
  if (state.mine !== undefined && state.mine !== null) return;
  state.mine = undefined;
  render();
  state.mine = await myIssues(state.settings);
  render();
}

function setList(list) {
  state.list = list;
  state.sel = 0;
  chrome.storage.local.set({ list });
  render();
  if (list === 'mine') loadMine();
}

async function checkSession() {
  if (!lookupsOn()) return;
  const me = await whoAmI(state.settings);
  state.signedOut = me.error === 'auth';
  if (state.signedOut) { state.list = 'recent'; render(); }
  if (state.signedOut && !state.notice) {
    setNotice({ id: 'signin', text: 'Sign in to Jira to see previews and search.', action: 'Sign in' });
  }
}

// ---------- Main view events ----------

input.addEventListener('input', onQuery);

$('form').addEventListener('submit', (e) => {
  e.preventDefault();
  activate(state.rows[state.sel], state.held || state.settings.mode);
});

input.addEventListener('keydown', (e) => {
  if (e.key === 'ArrowDown') { e.preventDefault(); select(state.sel + 1); }
  else if (e.key === 'ArrowUp') { e.preventDefault(); select(state.sel - 1); }
  else if (e.key === 'Enter') { e.preventDefault(); activate(state.rows[state.sel], modeFor(e)); }
  else if (e.key === 'Escape' && input.value) { e.preventDefault(); input.value = ''; onQuery(); }
  else if (e.key === 'Tab' && !input.value && lookupsOn() && !state.signedOut) { e.preventDefault(); setList(state.list === 'recent' ? 'mine' : 'recent'); }
  else if (e.key.toLowerCase() === 'c' && (e.metaKey || e.ctrlKey) && input.selectionStart === input.selectionEnd) {
    const row = state.rows[state.sel];
    if (row?.url) { e.preventDefault(); copyLink(row); }
  }
});

// Show where Enter will open while a modifier is held.
function trackModifiers(e) {
  const held = (e.metaKey || e.ctrlKey) ? 'new' : e.shiftKey ? 'current' : null;
  if (held === state.held) return;
  state.held = held;
  if (!state.settings) return;
  if (state.query.keys.length > 1) render(); else renderEnter();
}
document.addEventListener('keydown', trackModifiers);
document.addEventListener('keyup', trackModifiers);
window.addEventListener('blur', () => trackModifiers({}));

async function copyLink(row) {
  try {
    await navigator.clipboard.writeText(row.url);
    toast(row.key ? `Copied link to ${row.key}` : 'Copied link');
  } catch { toast('Couldn’t copy'); }
}

async function rowAction(row, act) {
  if (act === 'copy') return copyLink(row);
  if (act === 'remove') {
    await removeHistory(row.key);
  } else if (act === 'pin') {
    if (row.saved) await updateHistory(row.key, { pinned: !row.pinned });
    else await addHistory([{ key: row.key, summary: row.title, status: row.status, statusColor: row.statusColor, pinned: true }]);
    toast(row.pinned ? `Unpinned ${row.key}` : `Pinned ${row.key}`);
  }
  state.history = await getHistory();
  render();
  input.focus();
}

results.addEventListener('click', (e) => {
  const tabButton = e.target.closest('[data-list]');
  if (tabButton) { setList(tabButton.dataset.list); return input.focus(); }
  const item = e.target.closest('.item');
  if (!item) return;
  const row = state.rows[Number(item.dataset.index)];
  const act = e.target.closest('[data-act]');
  if (act) return rowAction(row, act.dataset.act);
  activate(row, modeFor(e));
});

results.addEventListener('auxclick', (e) => {
  const item = e.target.closest('.item');
  if (item && e.button === 1) activate(state.rows[Number(item.dataset.index)], 'new');
});

results.addEventListener('mousemove', (e) => {
  const item = e.target.closest('.item');
  if (item && Number(item.dataset.index) !== state.sel) select(Number(item.dataset.index), false);
});

$('noticeAction').addEventListener('click', async () => {
  const id = state.notice?.id;
  if (id === 'signin') {
    await openUrls([state.settings.site], { mode: 'new', tab: state.tab });
    window.close();
  } else if (id === 'access') {
    await grantAccess();
  } else if (id === 'detected') {
    dismissDetected();
    openSettings();
  }
});

$('noticeClose').addEventListener('click', dismissDetected);

function dismissDetected() {
  chrome.storage.local.set({ siteConfirmed: true });
  setNotice(null);
}

async function grantAccess() {
  if (await requestAccess(state.settings.site)) {
    state.access = true;
    setNotice(null);
    render();
    checkSession();
    renderSettings();
  }
}

// ---------- Settings ----------

const MODE_HELP = {
  auto: 'This tab only when it’s blank.',
  new: 'Always a new tab.',
  current: 'Always this tab.',
};

function renderSettings() {
  const s = state.settings;
  $('sSite').value = hostOf(s.site);
  $('sProject').value = s.project;
  $('sPreview').checked = s.preview;
  $('sClipboard').checked = s.autoClipboard;
  $('sTemplate').value = s.template;
  $('sTemplate').placeholder = `${s.site || 'https://yourcompany.atlassian.net'}/browse/{key}`;
  $('sMode').querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === s.mode)));
  $('sModeHelp').textContent = MODE_HELP[s.mode];
  $('siteLabel').textContent = hostOf(s.site);
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
}

async function renderSiteStatus() {
  const status = $('sSiteStatus');
  status.classList.remove('bad');
  const link = (label, onClick) => {
    const b = el('button', 'link', label);
    b.type = 'button';
    b.addEventListener('click', onClick);
    return b;
  };
  if (!state.access) {
    status.replaceChildren('Previews and search need access to this site.', link('Allow', grantAccess));
    return;
  }
  if (!state.settings.preview) return status.replaceChildren('Previews and search are off.');
  status.textContent = 'Checking…';
  const me = await whoAmI(state.settings);
  if (me.name) status.textContent = `Signed in as ${me.name}.`;
  else if (me.error === 'auth') status.replaceChildren('Not signed in.', link('Open Jira', () => chrome.tabs.create({ url: state.settings.site })));
  else { status.textContent = 'Couldn’t reach this site.'; status.classList.add('bad'); }
}

function openSettings() {
  renderSettings();
  show('settings');
  renderSiteStatus();
}

async function update(patch, message = 'Saved') {
  Object.assign(state.settings, patch);
  await saveSettings(patch);
  renderSettings();
  if (message) toast(message);
}

$('openSettings').addEventListener('click', openSettings);
$('closeSettings').addEventListener('click', () => { show('main'); onQuery(); });

document.addEventListener('keydown', (e) => {
  if (app.dataset.view === 'settings' && e.key === 'Escape') { e.preventDefault(); $('closeSettings').click(); }
  if (e.key === ',' && (e.metaKey || e.ctrlKey) && app.dataset.view !== 'setup') {
    e.preventDefault();
    if (app.dataset.view === 'settings') $('closeSettings').click(); else openSettings();
  }
});

$('sSite').addEventListener('change', async () => {
  const site = normalizeSite($('sSite').value);
  $('sSite').classList.toggle('bad', !site);
  if (!site) {
    $('sSiteStatus').textContent = 'That doesn’t look like a web address.';
    $('sSiteStatus').classList.add('bad');
    return;
  }
  await update({ site });
  state.access = await hasAccess(site);
  state.mine = undefined;
  state.issues.clear();
  state.remote = { for: '', issues: [], projects: [] };
  renderSiteStatus();
});

$('sProject').addEventListener('input', () => { $('sProject').value = $('sProject').value.toUpperCase().replace(/[^A-Z0-9_]/g, ''); });
$('sProject').addEventListener('change', () => update({ project: $('sProject').value }));
$('sPreview').addEventListener('change', async () => { await update({ preview: $('sPreview').checked }); renderSiteStatus(); });

$('sClipboard').addEventListener('change', async () => {
  let on = $('sClipboard').checked;
  if (on) on = await chrome.permissions.request({ permissions: ['clipboardRead'] }).catch(() => false);
  await update({ autoClipboard: on }, on || !$('sClipboard').checked ? 'Saved' : 'Permission not granted');
});

$('sTemplate').addEventListener('change', () => {
  const value = $('sTemplate').value.trim();
  const ok = !value || isValidTemplate(value);
  $('sTemplate').classList.toggle('bad', !ok);
  $('sTemplateHelp').classList.toggle('bad', !ok);
  if (ok) update({ template: value });
});

$('sMode').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (b) update({ mode: b.dataset.mode });
});

$('clearHistory').addEventListener('click', async () => {
  await clearHistory({ keepPinned: true });
  state.history = await getHistory();
  toast('Cleared. Pinned issues were kept.');
});

$('shortcuts').addEventListener('click', () => chrome.tabs.create({ url: 'chrome://extensions/shortcuts' }));

// ---------- First run ----------

$('setupForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const site = normalizeSite($('setupSite').value);
  const error = $('setupError');
  error.hidden = !!site;
  if (!site) {
    error.textContent = 'Enter your Jira address, for example yourcompany.atlassian.net';
    return;
  }
  // Still inside the click, so Chrome will show its permission prompt for sites outside atlassian.net.
  if (!(await hasAccess(site))) await requestAccess(site);
  await saveSettings({ site });
  await chrome.storage.local.set({ siteConfirmed: true });
  await start();
});

// ---------- Boot ----------

async function tryClipboard() {
  if (!state.settings.autoClipboard || input.value) return;
  try {
    if (!(await chrome.permissions.contains({ permissions: ['clipboardRead'] }))) return;
    const text = (await navigator.clipboard.readText()).trim();
    if (!text || text.length > 300) return;
    // A bare number on the clipboard is too ambiguous, so no default project here.
    const found = analyze(text, '');
    if (!found.keys.length || found.text) return;
    input.value = found.keys.join(', ');
    input.select();
    onQuery();
  } catch { /* clipboard unavailable */ }
}

async function start() {
  const [settings, tabs, history, local, self] = await Promise.all([
    getSettings(),
    chrome.tabs.query({ active: true, currentWindow: true }),
    getHistory(),
    chrome.storage.local.get({ list: 'recent', siteConfirmed: false }),
    chrome.tabs.getCurrent().catch(() => null),
  ]);
  state.settings = settings;
  state.tab = tabs[0] || null;
  state.history = history;
  document.body.classList.toggle('tab', !!self);

  let detected = false;
  if (!settings.site) {
    const found = await detectSite();
    if (!found?.trusted) {
      // A self-hosted look-alike is only prefilled; the user has to confirm it.
      if (found) $('setupSite').value = hostOf(found.site);
      show('setup');
      return requestAnimationFrame(() => $('setupSite').select());
    }
    settings.site = found.site;
    await saveSettings({ site: found.site });
    detected = true;
  }

  state.access = await hasAccess(settings.site);
  state.list = lookupsOn() ? local.list : 'recent';

  if (!state.access && settings.preview) {
    setNotice({ id: 'access', text: `Allow access to ${hostOf(settings.site)} for previews and search.`, action: 'Allow' });
  } else if (detected || (!local.siteConfirmed && !history.length)) {
    setNotice({ id: 'detected', text: `Using ${hostOf(settings.site)}`, action: 'Change', dismiss: true });
  } else {
    setNotice(null);
  }

  renderSettings();
  show('main');
  onQuery();
  if (state.list === 'mine') loadMine();
  checkSession();
  hydrate();
  tryClipboard();
}

start();
