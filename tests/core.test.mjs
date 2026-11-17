import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolve, refsOnPage, detectTrackers, migrate, signature, isBlankTab, resolvesToCurrent, sortHistory } from '../extension/lib/core.js';
import { providerOf, takesKeys, projectOf } from '../extension/lib/providers/index.js';
import { normalizeSite } from '../extension/lib/http.js';

const jira = { id: 'j', type: 'jira', site: 'https://acme.atlassian.net', project: 'WEB', template: '' };
const github = { id: 'g', type: 'github', repo: 'acme/web' };
const gitlab = { id: 'l', type: 'gitlab', site: 'https://gitlab.com', project: 'acme/api' };
const linear = { id: 'n', type: 'linear', workspace: 'acme', team: 'ENG' };
const kaneo = { id: 'k', type: 'custom', name: 'Kaneo', template: 'https://kaneo.example/issue/{key}', style: 'number' };

const only = (t) => ({ trackers: [t], numbersTo: t.id, prefixes: {} });
const keys = (input, ctx) => resolve(input, ctx).items.map((i) => i.key);
const first = (input, ctx) => resolve(input, ctx).items[0]?.refs[0];

test('Jira: the common ways of writing a key', () => {
  for (const input of ['WEB-123', 'web-123', 'web123', 'WEB 123', '  WEB-123  ']) assert.deepEqual(keys(input, only(jira)), ['WEB-123'], input);
  assert.deepEqual(keys('P2-14', only(jira)), ['P2-14']);
  assert.equal(first('WEB-123', only(jira)).url, 'https://acme.atlassian.net/browse/WEB-123');
});

test('bare numbers use the default project, repository or team', () => {
  assert.deepEqual(keys('123', only(jira)), ['WEB-123']);
  assert.deepEqual(keys('#123', only(jira)), ['WEB-123']);
  assert.deepEqual(keys('123', only({ ...jira, project: '' })), []);
  assert.deepEqual(keys('123', only(github)), ['acme/web#123']);
  assert.deepEqual(keys('123', only(linear)), ['ENG-123']);
  assert.deepEqual(keys('123', only(kaneo)), ['123']);
  assert.equal(first('123', only(kaneo)).url, 'https://kaneo.example/issue/123');
});

test('bare numbers go to the chosen tracker', () => {
  const ctx = { trackers: [jira, github], numbersTo: 'g', prefixes: {} };
  assert.equal(first('42', ctx).tracker, 'g');
  assert.equal(first('42', { ...ctx, numbersTo: 'j' }).key, 'WEB-42');
});

test('GitHub and GitLab references', () => {
  assert.equal(first('octo/repo#7', only(github)).url, 'https://github.com/octo/repo/issues/7');
  assert.equal(first('https://github.com/octo/repo/pull/9', only(github)).key, 'octo/repo#9');
  assert.equal(first('12', only(gitlab)).url, 'https://gitlab.com/acme/api/-/issues/12');
  assert.equal(first('!34', only(gitlab)).url, 'https://gitlab.com/acme/api/-/merge_requests/34');
  assert.equal(first('grp/sub/proj#5', only(gitlab)).key, 'grp/sub/proj#5');
  assert.equal(first('https://gitlab.com/acme/api/-/merge_requests/8', only(gitlab)).key, 'acme/api!8');
  // "!34" finds the tracker that has merge requests, even when numbers go elsewhere.
  assert.equal(first('!34', { trackers: [jira, gitlab], numbersTo: 'j', prefixes: {} }).tracker, 'l');
  // owner/repo#n prefers the tracker whose default matches.
  assert.equal(first('acme/api#3', { trackers: [github, gitlab], numbersTo: 'g', prefixes: {} }).tracker, 'l');
});

test('a key shared by two trackers lists both, until one is known to own the prefix', () => {
  const ctx = { trackers: [jira, linear], numbersTo: 'j', prefixes: {} };
  assert.deepEqual(resolve('OPS-9', ctx).items[0].refs.map((r) => r.tracker), ['j', 'n']);
  assert.deepEqual(resolve('ENG-9', ctx).items[0].refs.map((r) => r.tracker), ['n']); // Linear's default team
  assert.deepEqual(resolve('OPS-9', { ...ctx, prefixes: { OPS: 'n' } }).items[0].refs.map((r) => r.tracker), ['n']);
  assert.equal(first('https://linear.app/acme/issue/OPS-9/some-title', ctx).tracker, 'n');
  assert.equal(first('https://acme.atlassian.net/browse/OPS-9', ctx).tracker, 'j');
});

test('keys inside links and branch names', () => {
  assert.deepEqual(keys('https://acme.atlassian.net/jira/software/projects/WEB/boards/1?selectedIssue=WEB-77', only(jira)), ['WEB-77']);
  assert.deepEqual(keys('https://example.com/tree/feature/WEB-9-fix-login', only(jira)), ['WEB-9']);
});

test('several at once, without duplicates', () => {
  assert.deepEqual(keys('WEB-1, web-2 OPS-3;WEB-1', only(jira)), ['WEB-1', 'WEB-2', 'OPS-3']);
  assert.deepEqual(keys('1 2 3', only(jira)), ['WEB-1', 'WEB-2', 'WEB-3']);
});

test('sentences are searches; only explicit references count inside them', () => {
  assert.deepEqual(resolve('fix 500 error', only(jira)), { items: [], text: true });
  assert.deepEqual(resolve('', only(jira)), { items: [], text: false });
  const mixed = resolve('see WEB-12 and WEB-13 please', only(jira));
  assert.equal(mixed.text, true);
  assert.deepEqual(mixed.items.map((i) => i.key), ['WEB-12', 'WEB-13']);
  // No tracker takes ABC-123 keys, so it is just text.
  assert.deepEqual(resolve('WEB-12', only(github)), { items: [], text: true });
});

test('finds issues on the current page', () => {
  const ctx = { trackers: [jira, github], numbersTo: 'j', prefixes: {} };
  const refs = refsOnPage({ url: 'https://github.com/acme/web/pull/212', title: 'WEB-431: keep theme · Pull Request #212' }, ctx);
  assert.deepEqual(refs.map((r) => r.key), ['acme/web#212', 'WEB-431']);
  assert.deepEqual(refsOnPage({ url: 'chrome://newtab/', title: 'utf-8 and sha-256' }, ctx), []);
});

test('detects trackers from open tabs', () => {
  const found = detectTrackers([
    { url: 'https://example.com/', active: true },
    { url: 'https://github.com/settings/profile', lastAccessed: 9 },
    { url: 'https://github.com/acme/web/issues', lastAccessed: 5 },
    { url: 'https://acme.atlassian.net/jira/your-work', lastAccessed: 4 },
    { url: 'https://linear.app/acme/issue/ENG-4/title', lastAccessed: 3 },
    { url: 'https://gitlab.com/acme/api/-/issues/2', lastAccessed: 2 },
  ]);
  assert.deepEqual(found.map((f) => [f.type, f.trusted]), [['github', true], ['jira', true], ['linear', true], ['gitlab', true]]);
  assert.equal(found[0].repo, 'acme/web'); // filled in from the second GitHub tab
  assert.equal(found[1].project, ''); // no project visible in that Jira address
  assert.equal(found[2].workspace, 'acme');
  assert.equal(found[2].team, 'ENG');
  assert.equal(found[3].project, 'acme/api');
  assert.deepEqual(detectTrackers([{ url: 'https://acme.atlassian.net/x' }], [jira]), []); // already added
});

test('Jira: the project in view becomes the default', () => {
  const project = (url) => detectTrackers([{ url }])[0].project;
  assert.equal(project('https://acme.atlassian.net/browse/WEB-12'), 'WEB');
  assert.equal(project('https://acme.atlassian.net/jira/software/projects/OPS/boards/3'), 'OPS');
  assert.equal(project('https://acme.atlassian.net/jira/software/c/projects/OPS/boards/3?selectedIssue=OPS-9'), 'OPS');
  assert.equal(project('https://acme.atlassian.net/jira/your-work'), '');
  // Seen on a later tab, it still fills in.
  assert.equal(detectTrackers([{ url: 'https://acme.atlassian.net/jira/your-work', active: true }, { url: 'https://acme.atlassian.net/browse/WEB-1' }])[0].project, 'WEB');
});

test('only unmistakable addresses are trusted', () => {
  // Self-hosted Jira, or an impostor: a suggestion, never adopted.
  assert.deepEqual(detectTrackers([{ url: 'https://jira.corp.example/browse/OPS-4', active: true }]), [{ type: 'jira', site: 'https://jira.corp.example', project: 'OPS', trusted: false }]);
  // Two Jira Cloud sites: no safe way to pick.
  assert.deepEqual(detectTrackers([{ url: 'https://one.atlassian.net/' }, { url: 'https://two.atlassian.net/' }]).map((f) => f.trusted), [false, false]);
  for (const url of ['https://acme.atlassian.net.evil.example/x', 'https://evil-atlassian.net/x', 'http://acme.atlassian.net/x', 'https://a.b.atlassian.net/x', 'https://github.com.evil.example/a/b', 'http://github.com/a/b', 'https://notlinear.app/acme', 'https://gitlab.com.evil.example/a/b']) {
    assert.deepEqual(detectTrackers([{ url }]), [], url);
  }
});

test('settings from 1.0 become a Jira tracker', () => {
  const s = migrate({ site: 'https://acme.atlassian.net', project: 'WEB', template: 'https://acme.atlassian.net/jira/browse/{key}/', mode: 'new' });
  assert.equal(s.trackers.length, 1);
  assert.deepEqual({ ...s.trackers[0] }, { id: 'jira', type: 'jira', enabled: true, site: 'https://acme.atlassian.net', project: 'WEB', template: 'https://acme.atlassian.net/jira/browse/{key}/' });
  assert.equal(s.numbersTo, 'jira');
  assert.equal(s.mode, 'new');
  assert.equal('site' in s, false);
  assert.deepEqual(migrate({}).trackers, []);
});

test('providers validate what the user enters', () => {
  assert.equal(providerOf('jira').clean({ site: 'acme' }).site, 'https://acme.atlassian.net');
  assert.equal(providerOf('jira').clean({ site: 'https://acme.atlassian.net/browse/WEB-1?x=1' }).site, 'https://acme.atlassian.net');
  assert.ok(providerOf('jira').clean({ site: '' }).error);
  assert.ok(providerOf('jira').clean({ site: 'acme', template: 'https://x.example/browse/' }).error);
  assert.equal(providerOf('github').clean({ repo: 'https://github.com/acme/web/issues' }).repo, 'acme/web');
  assert.ok(providerOf('github').clean({ repo: 'just-a-name' }).error);
  assert.equal(providerOf('gitlab').clean({ site: '', project: 'https://gitlab.com/acme/api/-/issues' }).project, 'acme/api');
  assert.equal(providerOf('linear').clean({ workspace: 'https://linear.app/Acme/team/ENG', team: 'eng' }).workspace, 'acme');
  assert.ok(providerOf('custom').clean({ name: 'Kaneo', template: 'https://kaneo.example/issue/' }).error);
  assert.equal(normalizeSite('http://jira.internal.example:8080/secure/Dashboard.jspa'), 'http://jira.internal.example:8080');
  assert.equal(normalizeSite('not a url'), null);
});

test('provider helpers', () => {
  assert.equal(takesKeys(jira), true);
  assert.equal(takesKeys(github), false);
  assert.equal(takesKeys(kaneo), false);
  assert.equal(takesKeys({ ...kaneo, style: 'key' }), true);
  assert.equal(projectOf(linear), 'ENG');
  assert.equal(signature(jira), 'jira:https://acme.atlassian.net');
  assert.ok(providerOf('jira').searchUrl('say "hi"', jira).includes('text%20~%20%22say%20%5C%22hi%5C%22%22'));
  assert.equal(providerOf('jira').url('WEB-1', { ...jira, template: 'https://acme.atlassian.net/jira/browse/{key}/' }), 'https://acme.atlassian.net/jira/browse/WEB-1/');
});

test('smart mode reuses blank tabs only', () => {
  const blank = { url: 'chrome://newtab/' };
  const page = { url: 'https://example.com/' };
  assert.equal(isBlankTab(blank), true);
  assert.equal(isBlankTab({ url: '', pendingUrl: 'chrome://new-tab-page/' }), true);
  assert.equal(isBlankTab(page), false);
  assert.equal(resolvesToCurrent('auto', blank), true);
  assert.equal(resolvesToCurrent('auto', page), false);
  assert.equal(resolvesToCurrent('new', blank), false);
  assert.equal(resolvesToCurrent('current', page), true);
});

test('pinned issues sort first, then newest', () => {
  const sorted = sortHistory([{ key: 'A-1', ts: 3, pinned: false }, { key: 'A-2', ts: 1, pinned: true }, { key: 'A-3', ts: 5, pinned: false }]);
  assert.deepEqual(sorted.map((h) => h.key), ['A-2', 'A-3', 'A-1']);
});
