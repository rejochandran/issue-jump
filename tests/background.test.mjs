// The service worker: address bar, right-click menu and first-run setup,
// against a stand-in for the chrome API that records what would be opened.
import { test, before, beforeEach } from 'node:test';
import assert from 'node:assert/strict';

const listeners = {};
const on = (name) => ({ addListener: (fn) => { listeners[name] = fn; } });
let store;
let tabs;
let opened;
let suggestion;

globalThis.chrome = {
  runtime: { onInstalled: on('installed'), onMessage: on('message'), getURL: (p) => `chrome-extension://id/${p}` },
  contextMenus: { create: (item) => { store.menu = item; }, onClicked: on('menu') },
  omnibox: { setDefaultSuggestion: (s) => { suggestion = s.description; }, onInputChanged: on('typing'), onInputEntered: on('entered') },
  storage: {},
  permissions: { contains: async () => false },
  tabs: {
    query: async (q) => (q.active ? tabs.filter((t) => t.active) : tabs),
    create: async (o) => { opened.push(['create', o.url, o.active !== false]); return { index: 1 }; },
    update: async (_id, o) => { opened.push(['update', o.url]); },
  },
};

const jira = { id: 'j', type: 'jira', enabled: true, site: 'https://acme.atlassian.net', project: 'WEB', template: '' };
const github = { id: 'g', type: 'github', enabled: true, repo: 'acme/web' };
const settle = () => new Promise((r) => setTimeout(r, 20));

before(async () => { await import('../extension/background.js'); });

beforeEach(() => {
  store = { sync: { trackers: [jira, github], numbersTo: 'j' }, local: {} };
  opened = [];
  tabs = [{ id: 1, index: 0, windowId: 1, active: true, url: 'https://example.com/' }];
  const area = (name) => ({
    get: async (d) => ({ ...(d && typeof d === 'object' ? d : {}), ...structuredClone(store[name]) }),
    set: async (patch) => { Object.assign(store[name], structuredClone(patch)); },
    remove: async (keys) => { [].concat(keys).forEach((k) => delete store[name][k]); },
  });
  chrome.storage.sync = area('sync');
  chrome.storage.local = area('local');
  globalThis.fetch = async () => { throw new TypeError('no network in tests'); };
});

test('address bar: Enter opens in the current tab, other dispositions in a new one', async () => {
  await listeners.entered('web-12', 'currentTab');
  await settle();
  assert.deepEqual(opened, [['update', 'https://acme.atlassian.net/browse/WEB-12']]);

  opened = [];
  await listeners.entered('acme/web#7', 'newForegroundTab');
  await settle();
  assert.deepEqual(opened, [['create', 'https://github.com/acme/web/issues/7', true]]);
  assert.deepEqual(store.local.history.map((h) => h.key).sort(), ['WEB-12', 'acme/web#7']);
});

test('address bar: text that is not an issue becomes a search in the main tracker', async () => {
  await listeners.entered('checkout bug', 'currentTab');
  await settle();
  assert.equal(opened.length, 1);
  assert.ok(opened[0][1].startsWith('https://acme.atlassian.net/issues/?jql='));
  assert.equal(store.local.history, undefined); // a search is not an issue
});

test('address bar: suggestions come from recent issues and are escaped', async () => {
  store.local.history = [
    { tracker: 'j', key: 'WEB-1', url: 'x', summary: 'Fix <b>login</b> & "quotes"', ts: 2, pinned: false },
    { tracker: 'j', key: 'OPS-2', url: 'x', summary: 'Rotate keys', ts: 1, pinned: false },
  ];
  let suggested;
  await listeners.typing('login', (s) => { suggested = s; });
  assert.equal(suggested.length, 1);
  assert.equal(suggested[0].content, 'WEB-1');
  assert.ok(suggested[0].description.includes('&lt;b&gt;login&lt;/b&gt; &amp; &quot;quotes&quot;'));
  assert.ok(suggestion.includes('Search for'));

  await listeners.typing('7', () => {});
  assert.ok(suggestion.includes('WEB-7'));
});

test('right-click: selected keys open in new tabs beside the current one', async () => {
  await listeners.menu({ menuItemId: 'issue-jump-selection', selectionText: 'see WEB-3 and WEB-4' }, tabs[0]);
  await settle();
  assert.deepEqual(opened, [
    ['create', 'https://acme.atlassian.net/browse/WEB-3', true],
    ['create', 'https://acme.atlassian.net/browse/WEB-4', false],
  ]);
  opened = [];
  await listeners.menu({ menuItemId: 'something-else', selectionText: 'WEB-9' }, tabs[0]);
  await settle();
  assert.deepEqual(opened, []);
});

test('first use: unmistakable trackers in open tabs are added, look-alikes are not', async () => {
  store.sync = {};
  tabs = [
    { id: 1, index: 0, windowId: 1, active: true, url: 'https://acme.atlassian.net/browse/WEB-5' },
    { id: 2, index: 1, windowId: 1, active: false, url: 'https://tracker.evil.example/browse/WEB-5' },
  ];
  await listeners.entered('9', 'currentTab');
  await settle();
  assert.deepEqual(store.sync.trackers.map((t) => [t.type, t.site, t.project]), [['jira', 'https://acme.atlassian.net', 'WEB']]);
  assert.deepEqual(opened, [['update', 'https://acme.atlassian.net/browse/WEB-9']]);
});

test('first use with nothing recognisable opens the setup page and saves nothing', async () => {
  store.sync = {};
  tabs = [{ id: 1, index: 0, windowId: 1, active: true, url: 'https://jira.corp.example/browse/OPS-4' }];
  await listeners.entered('OPS-4', 'currentTab');
  await settle();
  assert.deepEqual(opened, [['create', 'chrome-extension://id/popup.html', true]]);
  assert.equal(store.sync.trackers, undefined);
});

test('install registers the right-click item', async () => {
  await listeners.installed();
  assert.equal(store.menu.id, 'issue-jump-selection');
  assert.deepEqual(store.menu.contexts, ['selection']);
});
