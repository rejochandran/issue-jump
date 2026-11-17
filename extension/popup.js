import {
  getSettings, saveSettings, saveTrackers, findTrackers, newTracker, signature, canLookup, requestAccess,
  contextOf, enabledTrackers, resolve, refsOnPage, resolvesToCurrent, openUrls,
  getHistory, sortHistory, recordOpen, addHistory, updateHistory, removeHistory, clearHistory,
} from './lib/core.js';
import { PROVIDERS, providerOf, titleOf, projectOf } from './lib/providers/index.js';

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
  can: {}, // tracker id -> lookups (previews, search) are possible
  signedOut: new Set(), // tracker ids whose session has expired
  list: 'recent', // recent | mine
  mine: undefined, // undefined = not loaded, null = failed, [] = loaded
  query: { items: [], text: false, raw: '' },
  remote: { for: '', groups: [], projects: [] },
  issues: new Map(), // "tracker:key" -> fetched issue (null when the lookup failed)
  rows: [],
  sel: 0,
  held: null, // open mode forced by a held modifier key
  notice: null,
  suggestions: [], // trackers seen in tabs but not added
  draft: null, // tracker being edited
  firstRun: false,
};

let lookupTimer = null;
let lookupAbort = null;

// ---------- Small helpers ----------

// Static, trusted SVG only. Anything from a tracker, a page or the user goes through textContent.
const ICONS = {
  star: '<svg viewBox="0 0 16 16" width="13" height="13"><path fill="currentColor" d="M8 1.8l1.9 3.9 4.3.6-3.1 3 .7 4.3L8 11.6l-3.8 2 .7-4.3-3.1-3 4.3-.6z"/></svg>',
  starOff: '<svg viewBox="0 0 16 16" width="13" height="13"><path fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round" d="M8 2.4l1.7 3.5 3.9.6-2.8 2.7.7 3.9L8 11.2l-3.5 1.9.7-3.9-2.8-2.7 3.9-.6z"/></svg>',
  copy: '<svg viewBox="0 0 16 16" width="13" height="13"><rect x="5.5" y="5.5" width="8" height="8" rx="1.8" fill="none" stroke="currentColor" stroke-width="1.2"/><path d="M10.5 5.5v-1a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v4a2 2 0 0 0 2 2h1" fill="none" stroke="currentColor" stroke-width="1.2"/></svg>',
  remove: '<svg viewBox="0 0 16 16" width="13" height="13"><path d="M4.5 4.5l7 7M11.5 4.5l-7 7" fill="none" stroke="currentColor" stroke-width="1.3" stroke-linecap="round"/></svg>',
  search: '<svg viewBox="0 0 16 16" width="14" height="14"><circle cx="7" cy="7" r="4.2" fill="none" stroke="currentColor" stroke-width="1.4"/><path d="M10.2 10.2l3.3 3.3" stroke="currentColor" stroke-width="1.4" stroke-linecap="round"/></svg>',
  stack: '<svg viewBox="0 0 16 16" width="14" height="14"><path d="M8 2.5l5.5 3L8 8.5l-5.5-3zM2.5 8.5L8 11.5l5.5-3M2.5 11L8 14l5.5-3" fill="none" stroke="currentColor" stroke-width="1.2" stroke-linejoin="round"/></svg>',
  chevron: '<svg viewBox="0 0 16 16" width="12" height="12"><path d="M6 3l5 5-5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"/></svg>',
};

const BLURB = {
  jira: 'Cloud, Server and Data Center',
  github: 'Issues and pull requests',
  gitlab: 'Issues and merge requests',
  linear: 'Issues',
  custom: 'Kaneo, Plane, YouTrack or anything with a link',
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

const listOf = (words) => (words.length < 2 ? words.join('') : `${words.slice(0, -1).join(', ')} and ${words[words.length - 1]}`);

function modeFor(e) {
  if (e?.metaKey || e?.ctrlKey || e?.button === 1) return 'new';
  if (e?.shiftKey) return 'current';
  return state.settings.mode;
}

const cid = (ref) => `${ref.tracker}:${ref.key}`;
const trackerOf = (id) => state.settings.trackers.find((t) => t.id === id);
const active = () => enabledTrackers(state.settings);
/** Trackers that can be asked for previews and search right now. */
const live = () => (state.settings.preview ? active().filter((t) => state.can[t.id] && !state.signedOut.has(t.id)) : []);
const mineable = () => live().filter((t) => { const p = providerOf(t); return p.mine && (!p.canMine || p.canMine(t)); });

function show(view) {
  app.dataset.view = view;
  if (view === 'main') requestAnimationFrame(() => input.focus());
}

async function refreshAccess() {
  const entries = await Promise.all(state.settings.trackers.map(async (t) => [t.id, await canLookup(t)]));
  state.can = Object.fromEntries(entries);
}

// ---------- Opening ----------

function known(ref) {
  const id = cid(ref);
  return state.issues.get(id)
    || state.remote.groups.flatMap((g) => g.issues).find((i) => cid(i) === id)
    || (state.mine || []).find((i) => cid(i) === id);
}

async function openIssues(refs, mode) {
  const entries = refs.map((ref) => {
    const k = known(ref);
    const base = { tracker: ref.tracker, key: ref.key, url: ref.url };
    return k?.summary ? { ...base, summary: k.summary, status: k.status || '', statusColor: k.statusColor || '' } : base;
  });
  await recordOpen(entries, state.settings);
  const unknown = entries.filter((e) => !e.status).map(({ tracker, key }) => ({ tracker, key }));
  if (unknown.length && state.settings.preview) chrome.runtime.sendMessage({ type: 'enrich', refs: unknown }).catch(() => {});
  await openUrls(refs.map((r) => r.url), { mode, tab: state.tab });
  window.close();
}

async function activate(row, mode) {
  if (!row) return;
  if (row.kind === 'issue') return openIssues([row.ref], mode);
  if (row.kind === 'many') return openIssues(row.refs, mode);
  await openUrls([row.url], { mode, tab: state.tab });
  window.close();
}

// ---------- Building the list ----------

function issueRow(ref, base = {}, extra = {}) {
  const saved = state.history.find((h) => h.key === ref.key && h.tracker === ref.tracker);
  const fetched = state.issues.get(cid(ref));
  const fresh = fetched && !fetched.missing ? fetched : {};
  return {
    kind: 'issue',
    ref: { tracker: ref.tracker, key: ref.key, url: ref.url },
    key: ref.key,
    url: ref.url,
    title: fresh.summary || base.summary || saved?.summary || '',
    status: fresh.status || base.status || saved?.status || '',
    statusColor: fresh.statusColor || base.statusColor || saved?.statusColor || '',
    pinned: !!saved?.pinned,
    saved: !!saved,
    ts: extra.showTime ? saved?.ts : undefined,
    placeholder: fetched?.missing ? 'Not found, or you don’t have access' : 'Open issue',
    ...extra,
  };
}

function buildRows() {
  const { items, text, raw } = state.query;
  const sections = [];
  const shown = new Set();
  const fresh = (refs) => refs.filter((r) => !shown.has(cid(r)) && shown.add(cid(r)));

  if (!raw) {
    const onPage = fresh(refsOnPage(state.tab, contextOf(state.settings)));
    if (onPage.length) sections.push({ label: 'On this page', rows: onPage.map((r) => issueRow(r)) });

    if (state.list === 'mine') {
      const section = { tabs: true, rows: [] };
      if (state.mine === undefined) section.info = 'Loading…';
      else if (state.mine === null) section.info = 'Couldn’t reach your tracker. Check that you’re signed in.';
      else if (!state.mine.length) section.info = 'Nothing open is assigned to you.';
      else section.rows = state.mine.map((i) => issueRow(i, i));
      sections.push(section);
    } else {
      const recent = sortHistory(state.history);
      const section = { tabs: true, rows: recent.map((h) => issueRow(h, h, { showTime: true, removable: true })) };
      if (!recent.length) section.info = 'Type an issue key or number, paste a link, or search by a few words. Issues you open are kept here.';
      sections.push(section);
    }
    return sections;
  }

  // What Enter does comes first.
  const top = [];
  if (items.length === 1) {
    // A key that several trackers could own: once one of them has it, drop the ones that don't.
    const got = (r) => { const i = state.issues.get(cid(r)); return i && !i.missing; };
    const lacks = (r) => state.issues.get(cid(r))?.missing;
    const refs = items[0].refs.some(got) ? items[0].refs.filter((r) => !lacks(r)) : items[0].refs;
    for (const ref of refs) {
      const t = trackerOf(ref.tracker);
      const pending = live().includes(t) && !state.issues.has(cid(ref));
      // When a key could belong to several trackers, say which one each row opens.
      top.push(issueRow(ref, {}, { ...(pending ? { placeholder: '' } : {}), ...(refs.length > 1 ? { tag: titleOf(t) } : {}) }));
      shown.add(cid(ref));
    }
  } else if (items.length > 1) {
    const refs = items.map((i) => i.refs[0]);
    const here = resolvesToCurrent(state.held || state.settings.mode, state.tab);
    top.push({ kind: 'many', refs, lead: 'stack', title: `Open all ${refs.length}`, meta: here ? 'first here, rest in new tabs' : 'in new tabs' });
    refs.forEach((r) => { shown.add(cid(r)); top.push(issueRow(r)); });
  }
  if (top.length) sections.push({ rows: top });

  if (items.length <= 1) {
    const needle = raw.toLowerCase();
    const prefix = items[0]?.key.toLowerCase();
    const local = sortHistory(state.history).filter((h) => {
      const hay = `${h.key} ${h.summary || ''}`.toLowerCase();
      return hay.includes(needle) || (prefix && h.key.toLowerCase().startsWith(prefix));
    }).filter((h) => !shown.has(cid(h))).slice(0, 5);
    local.forEach((h) => shown.add(cid(h)));
    if (local.length) sections.push({ label: 'Recent', rows: local.map((h) => issueRow(h, h, { showTime: true, removable: true })) });

    if (state.remote.for === raw) {
      const several = active().length > 1;
      for (const group of state.remote.groups) {
        const found = fresh(group.issues).slice(0, several ? 5 : 7);
        if (found.length) sections.push({ label: `In ${titleOf(group.tracker)}`, rows: found.map((i) => issueRow(i, i)) });
      }
      if (state.remote.projects.length) {
        sections.push({ label: 'Projects', rows: state.remote.projects.map((p) => ({ kind: 'link', key: p.key, title: p.name, meta: 'Project', url: p.url })) });
      }
    }
  }

  if (text || !items.length) {
    const searchable = active().filter((t) => providerOf(t).searchUrl).slice(0, 2);
    if (searchable.length) {
      sections.push({ rows: searchable.map((t) => ({ kind: 'link', lead: 'search', title: `Search ${titleOf(t)} for “${raw}”`, url: providerOf(t).searchUrl(raw, t) })) });
    }
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
  if (row.tag) {
    meta.append(el('span', 'txt', row.tag));
  } else if (row.status) {
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
    if (section.tabs) nodes.push(mineable().length ? renderTabs() : el('div', 'group', 'Recent'));
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

function setNotice(notice) {
  state.notice = notice;
  $('notice').hidden = !notice;
  if (!notice) return;
  $('noticeText').textContent = notice.text;
  $('noticeAction').textContent = notice.action;
  $('noticeClose').hidden = !notice.dismiss;
}

// ---------- Lookups ----------

function remember(ref, issue) {
  state.issues.set(cid(ref), issue);
  if (issue && !issue.missing && state.history.some((h) => h.key === ref.key && h.tracker === ref.tracker)) {
    updateHistory(ref, { summary: issue.summary, status: issue.status, statusColor: issue.statusColor });
  }
}

function onQuery() {
  const raw = input.value.trim();
  state.query = { ...resolve(raw, contextOf(state.settings)), raw };
  state.sel = 0;
  render();

  clearTimeout(lookupTimer);
  lookupAbort?.abort();
  const askable = live();
  if (!raw || !askable.length) return;

  lookupTimer = setTimeout(async () => {
    lookupAbort = new AbortController();
    const { signal } = lookupAbort;
    const { items, text } = state.query;
    const jobs = [];

    const refs = items.slice(0, 8).flatMap((i) => i.refs.slice(0, 3));
    for (const ref of refs.filter((r) => !state.issues.has(cid(r)))) {
      const t = trackerOf(ref.tracker);
      if (!askable.includes(t)) continue;
      jobs.push(providerOf(t).issue(ref.key, t, signal).then((issue) => {
        if (signal.aborted) return;
        remember(ref, issue);
        render();
      }));
    }

    if (items.length <= 1 && raw.length >= 2 && state.remote.for !== raw) {
      state.remote = { for: raw, groups: [], projects: [] };
      const wantProjects = (text || !items.length) && /^[\p{L}\p{N}_ -]+$/u.test(raw);
      for (const t of askable) {
        const p = providerOf(t);
        if (p.search) {
          jobs.push(p.search(raw, t, signal).then((found) => {
            if (signal.aborted || state.remote.for !== raw || !found?.length) return;
            state.remote.groups.push({ tracker: t, issues: found.map((i) => ({ ...i, tracker: t.id, url: p.url(i.key, t) })) });
            state.remote.groups.sort((a, b) => askable.indexOf(a.tracker) - askable.indexOf(b.tracker));
            render();
          }));
        }
        if (p.projects && wantProjects) {
          jobs.push(p.projects(raw, t, signal).then((found) => {
            if (signal.aborted || state.remote.for !== raw || !found?.length) return;
            state.remote.projects.push(...found);
            render();
          }));
        }
      }
    }
    await Promise.all(jobs);
  }, 180);
}

/** Fill in summaries for rows that only have a key (issues found on the page, old history). */
async function hydrate() {
  const askable = live();
  const onPage = refsOnPage(state.tab, contextOf(state.settings));
  const bare = state.history.filter((h) => !h.summary).slice(0, 4);
  const refs = [...onPage, ...bare].filter((r, i, all) => !state.issues.has(cid(r)) && all.findIndex((x) => cid(x) === cid(r)) === i);
  let changed = false;
  await Promise.all(refs.map(async (ref) => {
    const t = trackerOf(ref.tracker);
    if (!askable.includes(t)) return;
    remember(ref, await providerOf(t).issue(ref.key, t));
    changed = true;
  }));
  if (changed) render();
}

async function loadMine() {
  if (state.mine) return;
  state.mine = undefined;
  render();
  const lists = await Promise.all(mineable().map(async (t) => {
    const found = await providerOf(t).mine(t);
    return found && found.map((i) => ({ ...i, tracker: t.id, url: providerOf(t).url(i.key, t) }));
  }));
  state.mine = lists.length && lists.every((l) => l === null) ? null : lists.flatMap((l) => l || []);
  render();
}

function setList(name) {
  state.list = name;
  state.sel = 0;
  chrome.storage.local.set({ list: name });
  render();
  if (name === 'mine') loadMine();
}

async function checkSessions() {
  const askable = live().filter((t) => providerOf(t).whoami);
  const answers = await Promise.all(askable.map(async (t) => [t, await providerOf(t).whoami(t)]));
  const out = answers.filter(([, me]) => me.error === 'auth').map(([t]) => t);
  if (!out.length) return;
  out.forEach((t) => state.signedOut.add(t.id));
  if (!mineable().length) state.list = 'recent';
  render();
  if (!state.notice) {
    const t = out[0];
    setNotice(t.token
      ? { id: 'edit', tracker: t.id, text: `${titleOf(t)} didn’t accept the saved key.`, action: 'Fix' }
      : { id: 'signin', tracker: t.id, text: `Sign in to ${titleOf(t)} to see previews and search.`, action: 'Sign in' });
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
  else if (e.key === 'Tab' && !input.value && mineable().length) { e.preventDefault(); setList(state.list === 'recent' ? 'mine' : 'recent'); }
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
  if (!state.settings || app.dataset.view !== 'main') return;
  if (state.query.items.length > 1) render(); else renderEnter();
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
    await removeHistory(row.ref);
  } else if (act === 'pin') {
    if (row.saved) await updateHistory(row.ref, { pinned: !row.pinned });
    else await addHistory([{ ...row.ref, summary: row.title, status: row.status, statusColor: row.statusColor, pinned: true }]);
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
  const n = state.notice;
  if (!n) return;
  if (n.id === 'signin') {
    const t = trackerOf(n.tracker);
    await openUrls([providerOf(t).home(t)], { mode: 'new', tab: state.tab });
    window.close();
  } else if (n.id === 'edit') {
    editTracker(trackerOf(n.tracker));
  } else if (n.id === 'access') {
    // Still inside the click, so Chrome can show its permission prompt.
    if (await requestAccess(n.trackers)) await afterTrackersChanged();
  } else if (n.id === 'welcome') {
    dismissNotice();
    openSettings();
  } else if (n.id === 'found') {
    const s = n.suggestion;
    dismissNotice();
    if (s.trusted) await addSuggestion(s); else editTracker(draftFrom(s), true);
  }
});

$('noticeClose').addEventListener('click', dismissNotice);

function dismissNotice() {
  const n = state.notice;
  if (n?.id === 'welcome') chrome.storage.local.set({ welcomed: true });
  if (n?.id === 'found') {
    chrome.storage.local.get({ dismissed: [] }).then(({ dismissed }) => chrome.storage.local.set({ dismissed: [...new Set([...dismissed, signature(n.suggestion)])] }));
  }
  setNotice(null);
}

/** Pick the one notice worth showing, most useful first. */
function chooseNotice({ adopted = [], welcomed, dismissed = [] }) {
  const blocked = active().filter((t) => { const p = providerOf(t); return p.issue && p.origins(t).length && !state.can[t.id]; });
  if (state.settings.preview && blocked.length) {
    return { id: 'access', trackers: blocked, text: `Turn on previews for ${listOf([...new Set(blocked.map(titleOf))])}.`, action: 'Allow' };
  }
  if (adopted.length || (!welcomed && !state.history.length && state.settings.trackers.length)) {
    return { id: 'welcome', text: `Set up with ${listOf([...new Set(active().map(titleOf))])}.`, action: 'Review', dismiss: true };
  }
  const fresh = state.suggestions.find((s) => !dismissed.includes(signature(s)));
  if (fresh) return { id: 'found', suggestion: fresh, text: `Found ${providerOf(fresh.type).label} in your tabs.`, action: 'Add', dismiss: true };
  return null;
}

// ---------- Settings ----------

const MODE_HELP = {
  auto: 'This tab only when it’s blank.',
  new: 'Always a new tab.',
  current: 'Always this tab.',
};

function trackerRow(t, { note, noteClass, stateClass } = {}) {
  const b = el('button', 'trow');
  b.type = 'button';
  b.append(el('span', `state ${stateClass || ''}`), el('span', 'name', titleOf(t)), el('span', 'where', providerOf(t).detail(t) || ''));
  b.append(el('span', `note ${noteClass || ''}`, note || ''), icon('chevron', 'go'));
  return b;
}

/** A short status for a tracker: what works, or the one thing left to do. */
async function trackerStatus(t) {
  const p = providerOf(t);
  if (t.enabled === false) return { note: 'Off', stateClass: 'off' };
  if (!p.issue || !state.settings.preview) return { note: 'Links only' };
  if (p.needsToken && !t.token) return { note: 'Add API key', noteClass: 'todo', stateClass: 'warn', full: 'Jumping works. Add an API key for previews and search.' };
  if (!state.can[t.id]) return { note: 'Allow access', noteClass: 'todo', stateClass: 'warn', full: 'Jumping works. Save to allow access for previews and search.' };
  const me = await p.whoami(t);
  if (me.error === 'auth') return { note: t.token ? 'Check key' : 'Sign in', noteClass: 'todo', stateClass: 'warn', full: t.token ? 'The saved key was not accepted.' : 'You’re not signed in, so previews are off. Jumping still works.' };
  if (me.error) return { note: 'Can’t reach it', stateClass: 'warn', full: 'Couldn’t reach this tracker.' };
  return { note: me.name ? 'Signed in' : 'Public only', full: me.name ? `Signed in as ${me.name}.` : me.note };
}

function renderSettings() {
  const s = state.settings;
  $('sPreview').checked = s.preview;
  $('sClipboard').checked = s.autoClipboard;
  $('sMode').querySelectorAll('button').forEach((b) => b.setAttribute('aria-checked', String(b.dataset.mode === s.mode)));
  $('sModeHelp').textContent = MODE_HELP[s.mode];
  $('version').textContent = `v${chrome.runtime.getManifest().version}`;
  const on = active();
  $('siteLabel').textContent = on.length === 1 ? providerOf(on[0]).detail(on[0]) || titleOf(on[0]) : on.length ? `${on.length} trackers` : 'Settings';

  // Rows appear at once; each status fills in when its check returns.
  $('trackerList').replaceChildren(...s.trackers.map((t) => {
    const row = trackerRow(t, t.enabled === false ? { note: 'Off', stateClass: 'off' } : {});
    row.addEventListener('click', () => editTracker(t));
    trackerStatus(t).then((st) => {
      row.querySelector('.note').textContent = st.note;
      row.querySelector('.note').className = `note ${st.noteClass || ''}`;
      row.querySelector('.state').className = `state ${st.stateClass || ''}`;
    });
    return row;
  }));

  const numeric = on.filter((t) => providerOf(t).fromNumber);
  $('numbersRow').hidden = numeric.length < 2;
  $('sNumbers').replaceChildren(...numeric.map((t) => {
    const o = el('option', '', [titleOf(t), projectOf(t) || t.repo || ''].filter(Boolean).join(' · '));
    o.value = t.id;
    o.selected = t.id === s.numbersTo;
    return o;
  }));
}

function openSettings() {
  renderSettings();
  show('settings');
}

function backToMain() {
  show('main');
  onQuery();
  checkSessions();
  hydrate();
}

async function update(patch, message = 'Saved') {
  Object.assign(state.settings, patch);
  await saveSettings(patch);
  renderSettings();
  if (message) toast(message);
}

/** Re-read what is possible after trackers or permissions change, then repaint. */
async function afterTrackersChanged() {
  await refreshAccess();
  state.signedOut.clear();
  state.mine = undefined;
  state.issues.clear();
  state.remote = { for: '', groups: [], projects: [] };
  state.suggestions = await findTrackers(state.settings.trackers);
  setNotice(chooseNotice(await chrome.storage.local.get({ welcomed: true, dismissed: [] })));
  renderSettings();
  if (app.dataset.view === 'main') backToMain();
}

$('openSettings').addEventListener('click', openSettings);
$('closeSettings').addEventListener('click', backToMain);

document.addEventListener('keydown', (e) => {
  const view = app.dataset.view;
  if (e.key === 'Escape' && view !== 'main' && view !== 'loading' && !state.firstRun) {
    e.preventDefault();
    $(view === 'settings' ? 'closeSettings' : view === 'add' ? 'addBack' : 'trackerBack').click();
  }
  if (e.key === ',' && (e.metaKey || e.ctrlKey) && !state.firstRun) {
    e.preventDefault();
    if (view === 'main') openSettings(); else backToMain();
  }
});

$('sPreview').addEventListener('change', async () => { await update({ preview: $('sPreview').checked }); });
$('sNumbers').addEventListener('change', () => update({ numbersTo: $('sNumbers').value }));

$('sClipboard').addEventListener('change', async () => {
  let on = $('sClipboard').checked;
  if (on) on = await chrome.permissions.request({ permissions: ['clipboardRead'] }).catch(() => false);
  await update({ autoClipboard: on }, on || !$('sClipboard').checked ? 'Saved' : 'Permission not granted');
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

// ---------- Adding a tracker ----------

const draftFrom = ({ trusted, type, ...fields }) => newTracker(type, fields);

async function addSuggestion(suggestion) {
  state.settings.trackers.push(draftFrom(suggestion));
  await saveTrackers(state.settings);
  state.firstRun = false;
  await afterTrackersChanged();
  toast(`Added ${providerOf(suggestion.type).label}`);
}

function openAdd() {
  $('welcome').hidden = !state.firstRun;
  $('addHead').hidden = state.firstRun;

  // Pages that look like a tracker but could not be confirmed are offered here, never added silently.
  $('foundBlock').hidden = !state.suggestions.length;
  $('foundList').replaceChildren(...state.suggestions.map((s) => {
    const row = trackerRow({ ...s, id: '' }, { note: 'Add', noteClass: 'todo', stateClass: 'off' });
    row.addEventListener('click', async () => {
      if (!s.trusted) return editTracker(draftFrom(s), true);
      const first = state.firstRun;
      await addSuggestion(s);
      if (first) backToMain(); else openSettings();
    });
    return row;
  }));

  $('typeList').replaceChildren(...PROVIDERS.map((p) => {
    const b = el('button', 'trow type');
    b.type = 'button';
    b.append(el('span', 'name', p.label), el('span', 'where', BLURB[p.type] || ''), icon('chevron', 'go'));
    b.addEventListener('click', () => editTracker(newTracker(p.type, p.type === 'gitlab' ? { site: 'https://gitlab.com' } : {}), true));
    return b;
  }));
  show('add');
}

$('addTracker').addEventListener('click', openAdd);
$('addBack').addEventListener('click', openSettings);

// ---------- One tracker ----------

function collectDraft() {
  for (const node of $('trackerFields').querySelectorAll('[data-field]')) {
    state.draft.values[node.dataset.field] = node.dataset.value ?? node.value;
  }
}

function renderTrackerFields() {
  const { values, type } = state.draft;
  const nodes = [];
  for (const f of providerOf(type).fields) {
    if (f.when && !f.when(values)) continue;
    const wrap = el('div', 'field');
    const parts = [];
    let control;
    if (f.choices) {
      parts.push(el('span', 'label', f.label));
      control = el('div', 'seg');
      control.dataset.value = values[f.name] || f.choices[0][0];
      for (const [value, label] of f.choices) {
        const b = el('button', '', label);
        b.type = 'button';
        b.setAttribute('aria-checked', String(control.dataset.value === value));
        b.addEventListener('click', () => { collectDraft(); state.draft.values[f.name] = value; renderTrackerFields(); });
        control.append(b);
      }
    } else {
      control = el('input', f.short ? 'short' : '');
      control.id = `f-${f.name}`;
      control.type = f.secret ? 'password' : 'text';
      control.spellcheck = false;
      control.placeholder = f.placeholder || '';
      control.value = (f.name === 'site' ? String(values.site || '').replace(/^https:\/\//, '') : values[f.name]) || '';
      if (f.upper) control.addEventListener('input', () => { control.value = control.value.toUpperCase(); });
      if (!f.advanced) {
        const label = el('label', '', f.label);
        label.htmlFor = control.id;
        parts.push(label);
      }
    }
    control.dataset.field = f.name;
    parts.push(control);
    if (f.help) {
      const help = el('p', 'sub', f.help);
      if (f.link) {
        const a = el('a', '', 'Create one');
        a.href = f.link; a.target = '_blank'; a.rel = 'noreferrer';
        help.append(' ', a);
      }
      parts.push(help);
    }
    if (f.advanced) {
      const details = el('details', 'adv');
      details.open = !!values[f.name];
      details.append(el('summary', '', f.label), ...parts);
      wrap.append(details);
    } else {
      wrap.append(...parts);
    }
    nodes.push(wrap);
  }
  $('trackerFields').replaceChildren(...nodes);
}

function editTracker(tracker, isNew = false) {
  const p = providerOf(tracker);
  state.draft = { id: tracker.id, type: tracker.type, isNew, values: { ...tracker } };
  $('trackerTitle').textContent = isNew ? (p.type === 'custom' ? 'Add a tracker' : `Add ${p.label}`) : titleOf(tracker);
  $('tEnabled').hidden = isNew;
  $('tEnabled').checked = tracker.enabled !== false;
  $('trackerRemove').hidden = isNew;
  $('trackerSave').textContent = isNew ? 'Add' : 'Save';
  $('trackerError').hidden = true;
  $('trackerStatus').textContent = '';
  renderTrackerFields();
  show('tracker');
  if (!isNew) trackerStatus(tracker).then((st) => { if (state.draft?.id === tracker.id) $('trackerStatus').textContent = st.full || ''; });
  requestAnimationFrame(() => $('trackerFields').querySelector('input')?.focus());
}

$('trackerBack').addEventListener('click', () => (state.draft?.isNew ? openAdd() : openSettings()));

$('trackerForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  collectDraft();
  const { draft } = state;
  const p = providerOf(draft.type);
  const cleaned = p.clean(draft.values);
  const fail = (message) => { $('trackerError').hidden = false; $('trackerError').textContent = message; };
  $('trackerError').hidden = true;
  if (cleaned.error) return fail(cleaned.error);

  const tracker = { id: draft.id, type: draft.type, enabled: draft.isNew ? true : $('tEnabled').checked, ...cleaned };
  const twin = state.settings.trackers.find((t) => t.id !== tracker.id && signature(t) === signature(tracker));
  if (twin) return fail('That tracker is already added.');

  // Still inside the click, so Chrome can show its permission prompt for this tracker's site.
  if (p.issue && p.origins(tracker).length && !(await canLookup(tracker))) await requestAccess([tracker]);

  const at = state.settings.trackers.findIndex((t) => t.id === tracker.id);
  if (at >= 0) state.settings.trackers[at] = tracker; else state.settings.trackers.push(tracker);
  await saveTrackers(state.settings);
  const wasFirst = state.firstRun;
  state.firstRun = false;
  await chrome.storage.local.set({ welcomed: true });
  await afterTrackersChanged();
  toast(draft.isNew ? `Added ${titleOf(tracker)}` : 'Saved');
  if (wasFirst) backToMain(); else openSettings();
});

$('trackerRemove').addEventListener('click', async () => {
  const { id } = state.draft;
  const name = titleOf(trackerOf(id));
  state.settings.trackers = state.settings.trackers.filter((t) => t.id !== id);
  await saveTrackers(state.settings);
  await afterTrackersChanged();
  toast(`Removed ${name}`);
  if (!state.settings.trackers.length) { state.firstRun = true; openAdd(); } else openSettings();
});

// ---------- Boot ----------

async function tryClipboard() {
  if (!state.settings.autoClipboard || input.value) return;
  try {
    if (!(await chrome.permissions.contains({ permissions: ['clipboardRead'] }))) return;
    const text = (await navigator.clipboard.readText()).trim();
    if (!text || text.length > 300 || /^[#!]?\d+$/.test(text)) return; // a bare number is too ambiguous
    const found = resolve(text, contextOf(state.settings));
    if (!found.items.length || found.text) return;
    input.value = found.items.map((i) => i.key).join(', ');
    input.select();
    onQuery();
  } catch { /* clipboard unavailable */ }
}

async function start() {
  const [settings, tabs, history, local, self] = await Promise.all([
    getSettings(),
    chrome.tabs.query({ active: true, currentWindow: true }),
    getHistory(),
    chrome.storage.local.get({ list: 'recent', welcomed: false, dismissed: [] }),
    chrome.tabs.getCurrent().catch(() => null),
  ]);
  state.settings = settings;
  state.tab = tabs[0] || null;
  document.body.classList.toggle('tab', !!self);

  // History saved by 1.0 has no tracker or link; give it the first tracker that takes keys.
  const legacy = settings.trackers.find((t) => providerOf(t).keys);
  state.history = history.map((h) => (h.tracker || !legacy ? h : { ...h, tracker: legacy.id, url: providerOf(legacy).url(h.key, legacy) }));

  // First run: add the trackers that are unmistakably open in a tab. Anything less certain is only offered.
  let adopted = [];
  state.suggestions = await findTrackers(settings.trackers);
  if (!settings.trackers.length) {
    adopted = state.suggestions.filter((s) => s.trusted);
    if (!adopted.length) {
      state.firstRun = true;
      return openAdd();
    }
    settings.trackers = adopted.map(draftFrom);
    await saveTrackers(settings);
    state.suggestions = state.suggestions.filter((s) => !s.trusted);
  }

  await refreshAccess();
  state.list = mineable().length ? local.list : 'recent';
  setNotice(chooseNotice({ adopted, welcomed: local.welcomed, dismissed: local.dismissed }));

  renderSettings();
  show('main');
  onQuery();
  if (state.list === 'mine') loadMine();
  checkSessions();
  hydrate();
  tryClipboard();
}

start();
