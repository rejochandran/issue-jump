// Provider network functions, against canned API responses. No real requests are made.
import { test, beforeEach } from 'node:test';
import assert from 'node:assert/strict';
import { providerOf } from '../extension/lib/providers/index.js';
import { request } from '../extension/lib/http.js';

let calls = [];
let routes = [];

/** Register a canned response for requests whose URL contains `match`. */
const reply = (match, data, status = 200) => routes.push({ match, data, status });

beforeEach(() => {
  calls = [];
  routes = [];
  globalThis.fetch = async (url, init = {}) => {
    calls.push({ url: String(url), ...init });
    const route = routes.find((r) => String(url).includes(r.match));
    if (!route) throw new TypeError('network down');
    return { ok: route.status >= 200 && route.status < 300, status: route.status, json: async () => route.data };
  };
});

const jira = { id: 'j', type: 'jira', site: 'https://acme.atlassian.net', project: 'WEB' };
const github = { id: 'g', type: 'github', repo: 'acme/web', token: '' };
const gitlab = { id: 'l', type: 'gitlab', site: 'https://gitlab.com', project: 'acme/api' };
const linear = { id: 'n', type: 'linear', workspace: 'acme', team: 'ENG', token: 'lin_api_x' };

test('request never throws and reports failures', async () => {
  assert.deepEqual(await request('https://nowhere.example/x'), { ok: false, status: 0 });
  reply('/missing', {}, 404);
  assert.equal((await request('https://x.example/missing')).status, 404);
  assert.equal((await request('https://x.example/missing')).ok, false);
});

test('Jira: issue, missing issue, search, mine, whoami', async () => {
  const p = providerOf('jira');
  reply('/issue/WEB-1?', { fields: { summary: 'Fix login', status: { name: 'In Progress', statusCategory: { colorName: 'yellow' } }, assignee: { displayName: 'Maya' } } });
  assert.deepEqual(await p.issue('WEB-1', jira), { key: 'WEB-1', summary: 'Fix login', status: 'In Progress', statusColor: 'yellow', type: '', assignee: 'Maya' });
  assert.equal(calls[0].credentials, 'include'); // uses the browser session
  assert.ok(calls[0].url.startsWith('https://acme.atlassian.net/rest/api/2/'));

  reply('/issue/WEB-404?', {}, 404);
  assert.deepEqual(await p.issue('WEB-404', jira), { key: 'WEB-404', missing: true });
  assert.equal(await p.issue('WEB-500', jira), null); // network failure

  reply('/issue/picker', { sections: [{ issues: [{ key: 'WEB-1', summaryText: 'Fix login' }] }, { issues: [{ key: 'WEB-1', summaryText: 'Fix login' }, { key: 'WEB-2', summaryText: 'Login page' }] }] });
  assert.deepEqual((await p.search('login', jira)).map((i) => i.key), ['WEB-1', 'WEB-2']);

  reply('/myself', { displayName: 'Maya Okafor' });
  assert.deepEqual(await p.whoami(jira), { name: 'Maya Okafor' });
});

test('Jira: signed out, and the Server fallback for Assigned to me', async () => {
  const p = providerOf('jira');
  reply('/myself', {}, 401);
  assert.deepEqual(await p.whoami(jira), { error: 'auth' });

  // Cloud endpoint missing (Server / Data Center) falls back to the older search.
  reply('api/3/search/jql', {}, 404);
  reply('api/2/search', { issues: [{ key: 'OPS-3', fields: { summary: 'Rotate keys', status: { name: 'To Do' } } }] });
  assert.deepEqual((await p.mine(jira)).map((i) => i.key), ['OPS-3']);

  // Signed out: no fallback, just a failure.
  routes = [];
  reply('api/3/search/jql', {}, 401);
  assert.equal(await p.mine(jira), null);
  assert.equal(calls.filter((c) => c.url.includes('api/2/search')).length, 1);
});

test('GitHub: public lookups send no credentials, a token is sent only to api.github.com', async () => {
  const p = providerOf('github');
  reply('/repos/acme/web/issues/7', { number: 7, title: 'Flaky test', state: 'open' });
  assert.deepEqual(await p.issue('acme/web#7', github), { key: 'acme/web#7', summary: 'Flaky test', status: 'Open', statusColor: '', type: 'Issue', assignee: '' });
  assert.equal(calls[0].credentials, 'omit');
  assert.equal(calls[0].headers.Authorization, undefined);

  reply('/repos/acme/web/issues/9', { number: 9, title: 'Add cache', state: 'closed', pull_request: { merged_at: '2026-01-01' } });
  const merged = await p.issue('acme/web#9', { ...github, token: 'ghp_x' });
  assert.equal(merged.status, 'Merged');
  assert.equal(merged.type, 'Pull request');
  assert.equal(calls[1].headers.Authorization, 'Bearer ghp_x');
  assert.ok(calls.every((c) => c.url.startsWith('https://api.github.com/')));

  reply('/search/issues', { items: [{ number: 7, title: 'Flaky test', state: 'open', repository_url: 'https://api.github.com/repos/acme/web' }] });
  assert.deepEqual((await p.search('flaky', github)).map((i) => i.key), ['acme/web#7']);
  assert.ok(decodeURIComponent(calls[2].url).includes('repo:acme/web'));

  assert.deepEqual(await p.mine(github), []); // needs a token
  assert.equal(p.canMine(github), false);
  assert.equal((await p.whoami(github)).name, '');
});

test('GitLab: issues and merge requests use the session and the encoded project path', async () => {
  const p = providerOf('gitlab');
  reply('/projects/acme%2Fapi/issues/12', { iid: 12, title: 'Slow query', state: 'opened' });
  assert.equal((await p.issue('acme/api#12', gitlab)).status, 'Open');
  assert.equal(calls[0].credentials, 'include');

  reply('/projects/acme%2Fapi/merge_requests/34', { iid: 34, title: 'Add index', state: 'merged' });
  const mr = await p.issue('acme/api!34', gitlab);
  assert.equal(mr.status, 'Merged');
  assert.equal(mr.type, 'Merge request');

  reply('/issues?scope=assigned_to_me', [{ iid: 5, title: 'Review', state: 'opened', references: { full: 'acme/web#5' } }]);
  assert.deepEqual((await p.mine(gitlab)).map((i) => i.key), ['acme/web#5']);

  assert.deepEqual(await p.search('x', { ...gitlab, project: '' }), []); // nothing to search without a project
});

test('Linear: nothing is requested without an API key', async () => {
  const p = providerOf('linear');
  const bare = { ...linear, token: '' };
  assert.equal(await p.issue('ENG-1', bare), null);
  assert.deepEqual(await p.search('x', bare), []);
  assert.deepEqual(await p.mine(bare), []);
  assert.deepEqual(p.origins(bare), []);
  assert.equal(calls.length, 0);
  assert.equal(p.url('ENG-1', bare), 'https://linear.app/acme/issue/ENG-1'); // jumping still works
});

test('Linear: lookups with an API key', async () => {
  const p = providerOf('linear');
  reply('api.linear.app/graphql', { data: { issue: { identifier: 'ENG-1', title: 'Latency', state: { name: 'In Progress', type: 'started' }, assignee: { name: 'Maya' } } } });
  assert.deepEqual(await p.issue('ENG-1', linear), { key: 'ENG-1', summary: 'Latency', status: 'In Progress', statusColor: 'yellow', assignee: 'Maya' });
  assert.equal(calls[0].method, 'POST');
  assert.equal(calls[0].headers.Authorization, 'lin_api_x');
  assert.deepEqual(JSON.parse(calls[0].body).variables, { id: 'ENG-1' }); // the key is a variable, never spliced into the query

  routes = [];
  reply('api.linear.app/graphql', { data: { issue: null } });
  assert.deepEqual(await p.issue('ENG-404', linear), { key: 'ENG-404', missing: true });

  routes = [];
  reply('api.linear.app/graphql', { errors: [{ message: 'auth' }] }, 401);
  assert.deepEqual(await p.whoami(linear), { error: 'auth' });
});

test('custom trackers make no requests at all', () => {
  const p = providerOf('custom');
  assert.equal(p.issue, undefined);
  assert.equal(p.search, undefined);
  assert.deepEqual(p.origins({}), []);
});
