import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  analyze, parseKeys, detectKeys, normalizeSite, issueUrl, searchUrl, isValidTemplate,
  isBlankTab, resolvesToCurrent, pickSiteFromTabs, sortHistory, projectOf,
} from '../extension/lib/jira.js';

test('parses the common ways of writing a key', () => {
  assert.deepEqual(parseKeys('ABC-123'), ['ABC-123']);
  assert.deepEqual(parseKeys('abc-123'), ['ABC-123']);
  assert.deepEqual(parseKeys('abc123'), ['ABC-123']);
  assert.deepEqual(parseKeys('ABC 123'), ['ABC-123']);
  assert.deepEqual(parseKeys('  ABC-123  '), ['ABC-123']);
  assert.deepEqual(parseKeys('P2-14'), ['P2-14']);
});

test('bare numbers need a default project', () => {
  assert.deepEqual(parseKeys('123', 'ABC'), ['ABC-123']);
  assert.deepEqual(parseKeys('#123', 'ABC'), ['ABC-123']);
  assert.deepEqual(parseKeys('123'), []);
});

test('pulls keys out of links', () => {
  assert.deepEqual(parseKeys('https://acme.atlassian.net/browse/ABC-12'), ['ABC-12']);
  assert.deepEqual(parseKeys('https://acme.atlassian.net/jira/software/projects/ABC/boards/1?selectedIssue=ABC-77'), ['ABC-77']);
  assert.deepEqual(parseKeys('https://github.com/acme/web/tree/feature/ABC-9-fix-login'), ['ABC-9']);
});

test('reads several keys at once, without duplicates', () => {
  assert.deepEqual(parseKeys('ABC-1, abc-2 OPS-3;ABC-1'), ['ABC-1', 'ABC-2', 'OPS-3']);
  assert.deepEqual(parseKeys('1 2 3', 'ABC'), ['ABC-1', 'ABC-2', 'ABC-3']);
});

test('sentences are searches; only explicit keys count inside them', () => {
  assert.deepEqual(analyze('fix 500 error', 'ABC'), { keys: [], text: true });
  assert.deepEqual(analyze('login bug'), { keys: [], text: true });
  assert.deepEqual(analyze('see ABC-12 and ABC-13 please', 'ABC'), { keys: ['ABC-12', 'ABC-13'], text: true });
  assert.deepEqual(analyze('ABC-12'), { keys: ['ABC-12'], text: false });
  assert.deepEqual(analyze(''), { keys: [], text: false });
});

test('detectKeys only trusts uppercase keys', () => {
  assert.deepEqual(detectKeys('ABC-123: fix promo trim · Pull Request #9 · ABC-124'), ['ABC-123', 'ABC-124']);
  assert.deepEqual(detectKeys('utf-8 and sha-256 are not issues'), []);
});

test('normalizeSite accepts whatever people paste', () => {
  assert.equal(normalizeSite('acme'), 'https://acme.atlassian.net');
  assert.equal(normalizeSite('acme.atlassian.net'), 'https://acme.atlassian.net');
  assert.equal(normalizeSite('https://acme.atlassian.net/browse/ABC-1?x=1'), 'https://acme.atlassian.net');
  assert.equal(normalizeSite('http://jira.internal.example:8080/secure/Dashboard.jspa'), 'http://jira.internal.example:8080');
  assert.equal(normalizeSite(''), null);
  assert.equal(normalizeSite('not a url'), null);
});

test('builds issue and search links', () => {
  const site = 'https://acme.atlassian.net';
  assert.equal(issueUrl('ABC-1', { site, template: '' }), `${site}/browse/ABC-1`);
  assert.equal(issueUrl('ABC-1', { site, template: `${site}/jira/browse/{key}/` }), `${site}/jira/browse/ABC-1/`);
  assert.ok(searchUrl('say "hi"', { site }).startsWith(`${site}/issues/?jql=text%20~%20%22say%20%5C%22hi%5C%22%22`));
  assert.equal(isValidTemplate(`${site}/browse/{key}`), true);
  assert.equal(isValidTemplate(`${site}/browse/`), false);
  assert.equal(isValidTemplate('{key}'), false);
  assert.equal(projectOf('ABC-12'), 'ABC');
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

test('finds the Jira Cloud site among open tabs', () => {
  assert.deepEqual(pickSiteFromTabs([
    { url: 'https://example.com/', active: true },
    { url: 'https://acme.atlassian.net/browse/A-1', active: false, lastAccessed: 1 },
    { url: 'https://acme.atlassian.net/jira/your-work', active: false, lastAccessed: 5 },
  ]), { site: 'https://acme.atlassian.net', trusted: true });
  // Two different Cloud sites: suggest the most recent, but make the user confirm.
  assert.deepEqual(pickSiteFromTabs([
    { url: 'https://old.atlassian.net/browse/A-1', active: false, lastAccessed: 1 },
    { url: 'https://acme.atlassian.net/jira/your-work', active: false, lastAccessed: 5 },
  ]), { site: 'https://acme.atlassian.net', trusted: false });
  assert.equal(pickSiteFromTabs([{ url: 'chrome://newtab/', active: true }, { url: 'https://example.com/browse/', active: false }]), null);
});

test('a page that only looks like Jira is never trusted automatically', () => {
  // Self-hosted Jira, or an impostor: offered as a suggestion, not adopted.
  assert.deepEqual(pickSiteFromTabs([{ url: 'https://jira.corp.example/browse/OPS-4', active: true }]),
    { site: 'https://jira.corp.example', trusted: false });
  // A real Cloud tab wins over an active look-alike.
  assert.deepEqual(pickSiteFromTabs([
    { url: 'https://evil.example/browse/ABC-1', active: true },
    { url: 'https://acme.atlassian.net/browse/ABC-1', active: false },
  ]), { site: 'https://acme.atlassian.net', trusted: true });
  // Look-alike hostnames and plain http are not Jira Cloud.
  for (const url of ['https://acme.atlassian.net.evil.example/x', 'https://evil-atlassian.net/x', 'http://acme.atlassian.net/x', 'https://a.b.atlassian.net/x']) {
    assert.equal(pickSiteFromTabs([{ url, active: true }]), null);
  }
});

test('pinned issues sort first, then newest', () => {
  const sorted = sortHistory([{ key: 'A-1', ts: 3, pinned: false }, { key: 'A-2', ts: 1, pinned: true }, { key: 'A-3', ts: 5, pinned: false }]);
  assert.deepEqual(sorted.map((h) => h.key), ['A-2', 'A-3', 'A-1']);
});
