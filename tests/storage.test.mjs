// Settings and history, against an in-memory stand-in for chrome.storage.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSettings, saveTrackers, addHistory, getHistory, updateHistory, removeHistory, clearHistory, recordOpen, enrichHistory, canLookup, mergeSeen, seenInBrowser,
} from '../extension/lib/core.js';

let store;
let granted;

beforeEach(() => {
  store = { sync: {}, local: {} };
  granted = [];
  const area = (name) => ({
    get: async (defaults) => ({ ...(defaults && typeof defaults === 'object' ? defaults : {}), ...structuredClone(store[name]) }),
    set: async (patch) => { Object.assign(store[name], structuredClone(patch)); },
    remove: async (keys) => { [].concat(keys).forEach((k) => delete store[name][k]); },
  });
  globalThis.chrome = {
    storage: { sync: area('sync'), local: area('local') },
    permissions: { contains: async ({ origins }) => origins.every((o) => granted.includes(o)) },
  };
  globalThis.fetch = async () => { throw new TypeError('no network in tests'); };
});

const jira = { id: 'j', type: 'jira', enabled: true, site: 'https://acme.atlassian.net', project: '', template: '' };
const linear = { id: 'n', type: 'linear', enabled: true, workspace: 'acme', team: '', token: 'lin_api_secret' };
const ref = (tracker, key) => ({ tracker, key, url: `https://x.example/${key}` });

test('tokens are saved on the device and never synced', async () => {
  const settings = { trackers: [jira, linear], numbersTo: 'j', prefixes: {} };
  await saveTrackers(settings);
  assert.equal(JSON.stringify(store.sync).includes('lin_api_secret'), false);
  assert.deepEqual(store.local.tokens, { n: 'lin_api_secret' });
  const loaded = await getSettings();
  assert.equal(loaded.trackers.find((t) => t.id === 'n').token, 'lin_api_secret');
  assert.equal(loaded.trackers.find((t) => t.id === 'j').token, '');
});

test('removing a tracker drops its token and repoints bare numbers', async () => {
  await saveTrackers({ trackers: [jira, linear], numbersTo: 'n', prefixes: {} });
  const settings = await getSettings();
  settings.trackers = settings.trackers.filter((t) => t.id !== 'n');
  await saveTrackers(settings);
  assert.deepEqual(store.local.tokens, {});
  assert.equal(store.sync.numbersTo, 'j');
});

test('settings from 1.0 load as a Jira tracker and old keys are cleared on save', async () => {
  store.sync = { site: 'https://acme.atlassian.net', project: 'WEB', mode: 'new' };
  const settings = await getSettings();
  assert.equal(settings.trackers[0].type, 'jira');
  assert.equal(settings.trackers[0].project, 'WEB');
  await saveTrackers(settings);
  assert.equal('site' in store.sync, false);
  assert.equal(store.sync.trackers.length, 1);
});

test('history: newest first by time, same key in two trackers kept apart', async () => {
  await addHistory([ref('j', 'OPS-1'), ref('n', 'OPS-1')]);
  let h = await getHistory();
  assert.equal(h.length, 2);
  assert.ok(h[0].ts > h[1].ts);

  await updateHistory(ref('n', 'OPS-1'), { pinned: true, summary: 'Linear one' });
  h = await getHistory();
  assert.equal(h.find((x) => x.tracker === 'n').summary, 'Linear one');
  assert.equal(h.find((x) => x.tracker === 'j').summary, '');

  await removeHistory(ref('j', 'OPS-1'));
  assert.deepEqual((await getHistory()).map((x) => x.tracker), ['n']);
});

test('history: reopening keeps the title and pin, and the list is capped', async () => {
  await addHistory([{ ...ref('j', 'WEB-1'), summary: 'Fix login', pinned: true }]);
  await addHistory([ref('j', 'WEB-1')]);
  const [item] = await getHistory();
  assert.equal(item.summary, 'Fix login');
  assert.equal(item.pinned, true);

  await addHistory(Array.from({ length: 40 }, (_, i) => ref('j', `WEB-${100 + i}`)));
  const h = await getHistory();
  assert.equal(h.filter((x) => !x.pinned).length, 30);
  assert.equal(h.filter((x) => x.pinned).length, 1);

  await clearHistory({ keepPinned: true });
  assert.deepEqual((await getHistory()).map((x) => x.key), ['WEB-1']);
});

test('opening an issue teaches the prefix and the default project', async () => {
  const settings = { trackers: [structuredClone(jira), structuredClone(linear)], numbersTo: 'j', prefixes: {} };
  await recordOpen([ref('n', 'ENG-7')], settings);
  assert.deepEqual(store.sync.prefixes, { ENG: 'n' });
  assert.equal(settings.trackers.find((t) => t.id === 'n').team, 'ENG');
  assert.equal(JSON.stringify(store.sync).includes('lin_api_secret'), false);

  await recordOpen([ref('j', 'WEB-2')], settings);
  assert.deepEqual(store.sync.prefixes, { ENG: 'n', WEB: 'j' });
  assert.equal(settings.trackers.find((t) => t.id === 'j').project, 'WEB');
});

test('imported issues merge in without disturbing what is there', async () => {
  const now = Date.now();
  await addHistory([{ ...ref('j', 'WEB-1'), summary: 'Opened here', pinned: true }]);
  assert.equal(await mergeSeen([]), false);
  assert.equal(await mergeSeen([
    { ...ref('j', 'WEB-1'), summary: 'Other title', ts: now - 5000 }, // older than our own open: no change
    { ...ref('j', 'WEB-2'), summary: 'Seen in Jira', status: 'To Do', ts: now - 60000 },
    { ...ref('j', 'WEB-3'), ts: 0 }, // no time, ignored
  ]), true);
  const h = await getHistory();
  assert.deepEqual(h.map((x) => x.key).sort(), ['WEB-1', 'WEB-2']);
  assert.equal(h.find((x) => x.key === 'WEB-1').summary, 'Opened here');
  assert.equal(h.find((x) => x.key === 'WEB-1').pinned, true);
  // Same data again changes nothing.
  assert.equal(await mergeSeen([{ ...ref('j', 'WEB-2'), summary: 'Seen in Jira', status: 'To Do', ts: now - 60000 }]), false);
  // A later view moves it up and refreshes the status.
  assert.equal(await mergeSeen([{ ...ref('j', 'WEB-2'), status: 'Done', statusColor: 'green', ts: now + 1000 }]), true);
  assert.equal((await getHistory()).find((x) => x.key === 'WEB-2').status, 'Done');
});

test('removed and cleared issues do not come back from imports', async () => {
  const now = Date.now();
  await mergeSeen([{ ...ref('j', 'WEB-1'), ts: now - 1000 }, { ...ref('j', 'WEB-2'), ts: now - 2000 }]);
  await removeHistory(ref('j', 'WEB-1'));
  await mergeSeen([{ ...ref('j', 'WEB-1'), ts: now - 500 }]);
  assert.deepEqual((await getHistory()).map((x) => x.key), ['WEB-2']);

  // Opening it yourself brings it back for good.
  await recordOpen([ref('j', 'WEB-1')], { trackers: [structuredClone(jira)], prefixes: {} });
  await removeHistory(ref('j', 'WEB-2'));
  assert.deepEqual(store.local.hidden, ['j:WEB-2']);

  await clearHistory();
  assert.equal(await mergeSeen([{ ...ref('j', 'WEB-9'), ts: now - 500 }]), false); // viewed before the clear
  assert.equal(await mergeSeen([{ ...ref('j', 'WEB-9'), ts: Date.now() + 1000 }]), true); // viewed after it
});

test('browser history is read only when switched on and permitted', async () => {
  let searches = 0;
  globalThis.chrome.history = { search: async () => { searches += 1; return [{ url: 'https://acme.atlassian.net/browse/WEB-7', title: '[WEB-7] From history - Jira', lastVisitTime: 5 }]; } };
  const settings = { trackers: [jira], useHistory: false };
  assert.deepEqual(await seenInBrowser(settings), []);
  settings.useHistory = true;
  assert.deepEqual(await seenInBrowser(settings), []); // switched on, permission not granted
  assert.equal(searches, 0);
  globalThis.chrome.permissions.contains = async ({ permissions }) => (permissions || []).includes('history');
  const found = await seenInBrowser(settings);
  assert.deepEqual(found.map((e) => [e.key, e.summary]), [['WEB-7', 'From history']]);
  assert.equal(searches, 1);
});

test('lookups need granted access, and background fills make no request without it', async () => {
  assert.equal(await canLookup(jira), false);
  granted = ['https://acme.atlassian.net/*'];
  assert.equal(await canLookup(jira), true);
  assert.equal(await canLookup({ ...linear, token: '' }), false); // nothing to look up without a key
  assert.equal(await canLookup({ id: 'k', type: 'custom', template: 'https://k.example/{key}' }), false);

  granted = [];
  let requested = 0;
  globalThis.fetch = async () => { requested += 1; throw new TypeError('x'); };
  await addHistory([ref('j', 'WEB-1')]);
  await enrichHistory([ref('j', 'WEB-1')], { preview: true, trackers: [jira] });
  await enrichHistory([ref('j', 'WEB-1')], { preview: false, trackers: [jira] });
  assert.equal(requested, 0);
});
