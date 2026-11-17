// Settings and history, against an in-memory stand-in for chrome.storage.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import {
  getSettings, saveTrackers, addHistory, getHistory, updateHistory, removeHistory, clearHistory, recordOpen, enrichHistory, canLookup,
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
