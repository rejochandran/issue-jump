// Browser tests for the popup. Each case loads popup.html in an iframe with the
// preview stub (fake chrome API, fake tracker data), acts like a user and checks
// what is on screen and what would have been opened.

const cases = [];
const test = (name, fn) => cases.push({ name, fn });
const wait = (ms) => new Promise((r) => setTimeout(r, ms));

function assert(condition, message) {
  if (!condition) throw new Error(message);
}
function equal(actual, expected, message = '') {
  const a = JSON.stringify(actual);
  const e = JSON.stringify(expected);
  if (a !== e) throw new Error(`${message} expected ${e} but got ${a}`.trim());
}

/** Load the popup for a scene. Returns helpers bound to that popup. */
async function open(query) {
  document.querySelector('iframe')?.remove();
  const frame = document.createElement('iframe');
  document.body.append(frame);
  await new Promise((resolve) => { frame.onload = resolve; frame.src = `/popup.html?${query}`; });
  const win = frame.contentWindow;
  const doc = frame.contentDocument;
  const calls = [];
  win.chrome.tabs.create = async (o) => { calls.push(['create', o.url, o.active !== false]); return { index: 1 }; };
  win.chrome.tabs.update = async (_id, o) => { calls.push(['update', o.url]); };
  win.close = () => calls.push(['close']);
  await wait(900); // boot, lookups and imports
  const input = doc.getElementById('input');
  return {
    win, doc, calls, input,
    view: () => doc.getElementById('app').dataset.view,
    rows: () => [...doc.querySelectorAll('#results .item')].map((n) => ({
      key: n.querySelector('.key')?.textContent || '',
      title: n.querySelector('.title').textContent,
      meta: n.querySelector('.meta')?.textContent || '',
      selected: n.classList.contains('sel'),
    })),
    groups: () => [...doc.querySelectorAll('#results .group')].map((n) => n.textContent),
    notice: () => (doc.getElementById('notice').hidden ? '' : doc.getElementById('noticeText').textContent),
    async type(text) { input.value = text; input.dispatchEvent(new win.Event('input')); await wait(700); },
    async press(key, mods = {}) { input.dispatchEvent(new win.KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...mods })); await wait(300); },
    sync: () => win.chrome.storage.sync.get(null),
    local: () => win.chrome.storage.local.get(null),
  };
}

const JIRA = 'https://acme.atlassian.net/browse/';

// ---------- The list ----------

test('shows issues on the page, then recent ones, with titles and statuses', async () => {
  const p = await open('scene=default');
  equal(p.view(), 'main');
  equal(p.groups()[0], 'On this page');
  const rows = p.rows();
  equal(rows[0].key, 'acme/web#212');
  equal(rows[0].title, 'Keep theme after refresh');
  equal(rows[1].key, 'WEB-431');
  assert(rows.some((r) => r.key === 'ENG-58' && r.meta.includes('In Progress')), 'Linear issue with status is listed');
  assert(rows[0].selected && rows.filter((r) => r.selected).length === 1, 'exactly the first row is selected');
});

test('arrow keys move the selection and wrap around', async () => {
  const p = await open('scene=default');
  await p.press('ArrowDown');
  equal(p.rows().findIndex((r) => r.selected), 1);
  await p.press('ArrowUp');
  await p.press('ArrowUp');
  equal(p.rows().findIndex((r) => r.selected), p.rows().length - 1);
});

// ---------- Opening ----------

test('a number opens that issue in a new tab from a normal page', async () => {
  const p = await open('scene=default');
  await p.type('431');
  equal(p.rows()[0].key, 'WEB-431');
  equal(p.rows()[0].title, 'Dark mode toggle resets after refresh');
  equal(p.doc.getElementById('goLabel').textContent, 'New tab');
  await p.press('Enter');
  equal(p.calls, [['create', `${JIRA}WEB-431`, true], ['close']]);
  const { history } = await p.local();
  assert(history.some((h) => h.key === 'WEB-431' && h.tracker === 'jira'), 'opened issue is saved to recent');
});

test('on a blank tab it reuses the tab, and Cmd/Ctrl+Enter still forces a new one', async () => {
  let p = await open('scene=default&tab=blank');
  equal(p.doc.getElementById('goLabel').textContent, 'This tab');
  await p.type('WEB-412');
  await p.press('Enter');
  equal(p.calls[0], ['update', `${JIRA}WEB-412`]);

  p = await open('scene=default&tab=blank');
  await p.type('WEB-412');
  await p.press('Enter', { metaKey: true });
  equal(p.calls[0], ['create', `${JIRA}WEB-412`, true]);
});

test('Shift+Enter replaces the current tab even on a normal page', async () => {
  const p = await open('scene=default');
  await p.type('WEB-412');
  await p.press('Enter', { shiftKey: true });
  equal(p.calls[0], ['update', `${JIRA}WEB-412`]);
});

test('a pasted list opens each issue in its own tracker, first one in front', async () => {
  const p = await open('scene=default');
  await p.type('WEB-412, acme/web#198, ENG-58');
  equal(p.rows()[0].title, 'Open all 3');
  equal(p.rows().slice(1).map((r) => r.key), ['WEB-412', 'acme/web#198', 'ENG-58']);
  await p.press('Enter');
  equal(p.calls.slice(0, 3), [
    ['create', `${JIRA}WEB-412`, true],
    ['create', 'https://github.com/acme/web/issues/198', false],
    ['create', 'https://linear.app/acme/issue/ENG-58', false],
  ]);
});

test('a key two trackers could own settles on the one that has it', async () => {
  const p = await open('scene=default');
  await p.type('OPS-88');
  equal(p.rows().map((r) => [r.key, r.meta.trim()]), [['OPS-88', 'To Do']]);
  equal(p.rows()[0].title, 'Rotate staging database credentials');
});

// ---------- Search ----------

test('words search recent issues and every tracker, then offer a full search', async () => {
  const p = await open('scene=default');
  await p.type('checkout');
  equal(p.groups(), ['Recent', 'In Jira', 'In GitHub']);
  const rows = p.rows();
  assert(rows.some((r) => r.key === 'acme/web#187'), 'GitHub result is listed');
  equal(rows.slice(-2).map((r) => r.title), ['Search Jira for “checkout”', 'Search GitHub for “checkout”']);
  // No issue is repeated across sections.
  const keys = rows.map((r) => r.key).filter(Boolean);
  equal(keys.length, new Set(keys).size, 'duplicate rows:');
});

test('a sentence with a number is a search, not an issue', async () => {
  const p = await open('scene=default');
  await p.type('fix 500 error');
  assert(!p.rows().some((r) => r.key === 'WEB-500'), 'WEB-500 must not be offered');
  assert(p.rows().some((r) => r.title.startsWith('Search Jira for')), 'search row is offered');
});

// ---------- States ----------

test('a number with no default project says so and leads to the setting', async () => {
  const p = await open('scene=noproject&guess=0');
  await p.type('122');
  assert(p.rows()[0].title.startsWith('Set a default project'), `first row was "${p.rows()[0].title}"`);
  await p.press('Enter');
  equal(p.view(), 'tracker');
  equal(p.calls, []);
});

test('a missing default project is filled in from recently viewed issues', async () => {
  const p = await open('scene=noproject');
  await p.type('412');
  equal(p.rows()[0].key, 'WEB-412');
  const { trackers } = await p.sync();
  equal(trackers.find((t) => t.type === 'jira').project, 'WEB');
});

test('signed out: says so, offers no assigned list, and still jumps', async () => {
  const p = await open('scene=signedout');
  assert(p.notice().includes('Sign in to Jira'), `notice was "${p.notice()}"`);
  equal(p.doc.querySelectorAll('[data-list]').length, 0);
  await p.type('WEB-9');
  await p.press('Enter');
  equal(p.calls[0], ['create', `${JIRA}WEB-9`, true]);
});

test('recent issues are filled from Jira and, when switched on, browser history', async () => {
  let p = await open('scene=empty&tab=blank');
  equal(p.rows().map((r) => r.key), ['WEB-431', 'OPS-91', 'WEB-420']);

  p = await open('scene=history&tab=blank');
  const keys = p.rows().map((r) => r.key);
  assert(keys.includes('acme/web#187') && keys.includes('ENG-61') && keys.includes('WEB-405'), `rows were ${keys}`);
  assert(!keys.some((k) => k.includes('pulls')), 'a page that is not an issue must not be listed');
});

test('removing a recent issue keeps it out', async () => {
  const p = await open('scene=single&tab=blank');
  const first = p.rows()[0].key;
  p.doc.querySelector('#results .item [data-act="remove"]').click();
  await wait(400);
  assert(!p.rows().some((r) => r.key === first), `${first} is still listed`);
  equal((await p.local()).hidden, [`jira:${first}`]);
});

// ---------- Setup and settings ----------

test('first run adds the trackers that are unmistakably open in tabs', async () => {
  const p = await open('scene=fresh');
  equal(p.view(), 'main');
  const { trackers } = await p.sync();
  equal(trackers.map((t) => t.type).sort(), ['github', 'jira']);
  equal(trackers.find((t) => t.type === 'github').repo, 'acme/web');
  assert(p.notice().startsWith('Set up with'), `notice was "${p.notice()}"`);
});

test('first run with nothing open asks; a look-alike is offered, never added', async () => {
  let p = await open('scene=setup');
  equal(p.view(), 'add');
  assert(!p.doc.getElementById('welcome').hidden, 'welcome is shown');
  equal(p.doc.querySelectorAll('#typeList .trow').length, 5);

  p = await open('scene=setup&found=1');
  equal(p.view(), 'add');
  const found = [...p.doc.querySelectorAll('#foundList .trow')].map((n) => n.textContent);
  equal(found.length, 1);
  assert(found[0].includes('jira.corp.example'), `suggestion was "${found[0]}"`);
  equal((await p.sync()).trackers, undefined, 'nothing may be saved without the user:');
});

test('adding a custom tracker by hand makes its numbers open there', async () => {
  const p = await open('scene=setup');
  [...p.doc.querySelectorAll('#typeList .trow')].find((b) => b.textContent.startsWith('Custom')).click();
  await wait(200);
  equal(p.view(), 'tracker');
  const field = (name) => p.doc.querySelector(`#trackerFields [data-field="${name}"]`);
  field('name').value = 'Kaneo';
  field('template').value = 'https://kaneo.example/task/{key}';
  [...field('style').querySelectorAll('button')].find((b) => b.textContent === '123').click();
  await wait(100);
  p.doc.getElementById('trackerForm').requestSubmit();
  await wait(900);
  equal(p.view(), 'main');
  await p.type('42');
  await p.press('Enter');
  equal(p.calls[0], ['create', 'https://kaneo.example/task/42', true]);
});

test('a bad tracker form is refused with a reason', async () => {
  const p = await open('scene=setup');
  [...p.doc.querySelectorAll('#typeList .trow')].find((b) => b.textContent.startsWith('Custom')).click();
  await wait(200);
  p.doc.querySelector('#trackerFields [data-field="name"]').value = 'Broken';
  p.doc.querySelector('#trackerFields [data-field="template"]').value = 'https://kaneo.example/task/';
  p.doc.getElementById('trackerForm').requestSubmit();
  await wait(400);
  equal(p.view(), 'tracker');
  assert(!p.doc.getElementById('trackerError').hidden, 'an error is shown');
  equal((await p.sync()).trackers, undefined);
});

test('an API key is kept on the device and never synced', async () => {
  const p = await open('scene=setup');
  [...p.doc.querySelectorAll('#typeList .trow')].find((b) => b.textContent.startsWith('Linear')).click();
  await wait(200);
  const field = (name) => p.doc.querySelector(`#trackerFields [data-field="${name}"]`);
  equal(field('token').type, 'password');
  field('workspace').value = 'acme';
  field('token').value = 'lin_api_supersecret';
  p.doc.getElementById('trackerForm').requestSubmit();
  await wait(900);
  assert(!JSON.stringify(await p.sync()).includes('lin_api_supersecret'), 'the key reached synced storage');
  assert(Object.values((await p.local()).tokens).includes('lin_api_supersecret'), 'the key is in local storage');
});

test('settings list every tracker with its state', async () => {
  const p = await open('scene=default&view=settings');
  equal(p.view(), 'settings');
  const rows = [...p.doc.querySelectorAll('#trackerList .trow')].map((n) => [n.querySelector('.name').textContent, n.querySelector('.note').textContent]);
  equal(rows, [['Jira', 'Signed in'], ['GitHub', 'Public only'], ['Linear', 'Signed in']]);
  assert(!p.doc.getElementById('numbersRow').hidden, 'the bare-numbers choice is offered with several trackers');
  equal(p.doc.getElementById('version').textContent.startsWith('v'), true);
});

// ---------- Safety ----------

test('markup in tracker data is shown as text and never runs', async () => {
  const p = await open('scene=hostile&tab=blank');
  await p.type('666');
  const all = p.doc.getElementById('results');
  assert(p.rows().some((r) => r.title.includes('<img src=x')), 'the title is shown literally');
  equal(all.querySelectorAll('img, script, b, i').length, 0, 'injected elements:');
  equal(p.win.__xss, undefined, 'injected script ran:');
  await p.type('bold');
  equal(p.doc.getElementById('results').querySelectorAll('img, script, b, i').length, 0, 'injected elements in search results:');
  equal(p.win.__xss, undefined);
});

// ---------- Runner ----------

const results = [];
for (const { name, fn } of cases) {
  let error = '';
  try { await fn(); } catch (e) { error = String(e?.message || e); }
  results.push({ name, error });
  const line = document.createElement('div');
  line.className = error ? 'fail' : '';
  line.textContent = `${error ? '✗' : '✓'} ${name}${error ? `: ${error}` : ''}`;
  document.getElementById('log').append(line);
}
document.querySelector('iframe')?.remove();
document.getElementById('result').textContent = JSON.stringify(results);
