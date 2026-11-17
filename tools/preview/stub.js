// Fake `chrome` API and fake Jira responses for the browser preview. Never shipped.
(() => {
  const params = new URLSearchParams(location.search);
  const scene = params.get('scene') || 'default';
  const SITE = 'https://acme.atlassian.net';
  const now = Date.now();
  const min = 60e3;

  const ISSUES = [
    ['WEB-412', 'Checkout fails when promo code has a trailing space', 'In Progress', 'yellow', 'Bug', 'Maya Okafor'],
    ['WEB-398', 'Add SSO login for enterprise tenants', 'In Review', 'yellow', 'Story', 'Daniel Reyes'],
    ['WEB-431', 'Dark mode toggle resets after refresh', 'To Do', 'blue-gray', 'Bug', 'Maya Okafor'],
    ['WEB-377', 'Migrate image uploads to signed URLs', 'Done', 'green', 'Task', 'Priya Nair'],
    ['OPS-88', 'Rotate staging database credentials', 'To Do', 'blue-gray', 'Task', 'Maya Okafor'],
    ['OPS-91', 'Alert when checkout error rate passes 2%', 'In Progress', 'yellow', 'Task', 'Tom Lindqvist'],
    ['WEB-405', 'Checkout button overlaps footer on small screens', 'To Do', 'blue-gray', 'Bug', 'Daniel Reyes'],
    ['WEB-420', 'Promo codes: support percentage discounts', 'To Do', 'blue-gray', 'Story', 'Priya Nair'],
  ].map(([key, summary, status, statusColor, type, assignee]) => ({ key, summary, status, statusColor, type, assignee }));
  // An issue whose title is markup. It must always be shown as text, never run.
  const HOSTILE = '<img src=x onerror="window.__xss=1"><b>bold</b>';
  if (scene === 'hostile') ISSUES.push({ key: 'WEB-666', summary: HOSTILE, status: '<i>Open</i>', statusColor: '"><script>window.__xss=1</script>', type: 'Bug', assignee: 'Maya Okafor' });
  const PROJECTS = [{ key: 'WEB', name: 'Web App' }, { key: 'OPS', name: 'Operations' }, { key: 'MOB', name: 'Mobile' }];

  const TRACKERS = [
    { id: 'jira', type: 'jira', enabled: true, site: SITE, project: 'WEB', template: '' },
    { id: 'github', type: 'github', enabled: true, repo: 'acme/web' },
    { id: 'linear', type: 'linear', enabled: true, workspace: 'acme', team: 'ENG' },
  ];
  const GH = [
    { number: 212, title: 'Keep theme after refresh', state: 'open', pull_request: {}, repository_url: 'https://api.github.com/repos/acme/web' },
    { number: 198, title: 'Checkout: trim promo codes before validating', state: 'closed', pull_request: { merged_at: '2026-01-01' }, repository_url: 'https://api.github.com/repos/acme/web' },
    { number: 187, title: 'Flaky checkout test on CI', state: 'open', repository_url: 'https://api.github.com/repos/acme/web' },
  ];
  const LINEAR = [
    { identifier: 'ENG-58', title: 'Checkout latency regression', state: { name: 'In Progress', type: 'started' }, assignee: { name: 'Maya Okafor' } },
    { identifier: 'ENG-61', title: 'Rate limit the promo endpoint', state: { name: 'Todo', type: 'unstarted' }, assignee: { name: 'Maya Okafor' } },
  ];
  const hist = (tracker, key, url, issue, pinned, ts) => ({ tracker, key, url, summary: issue.summary || issue.title, status: issue.status || '', statusColor: issue.statusColor || '', pinned, ts });

  const store = {
    sync: scene === 'setup' || scene === 'fresh' ? {} : scene === 'history' ? { trackers: TRACKERS, numbersTo: 'jira', useHistory: true } : scene === 'noproject' ? { trackers: [{ ...TRACKERS[0], project: '' }, TRACKERS[1]], numbersTo: 'jira' } : scene === 'single' || scene === 'signedout' ? { trackers: TRACKERS.slice(0, 1), numbersTo: 'jira' } : { trackers: TRACKERS, numbersTo: 'jira' },
    local: {
      welcomed: scene !== 'empty' && scene !== 'fresh',
      ...(params.get('list') ? { list: params.get('list') } : {}),
      tokens: { linear: 'lin_api_demo' },
      history: ['empty', 'setup', 'history', 'fresh'].includes(scene) ? [] : scene === 'hostile' ? [hist('jira', 'WEB-666', `${SITE}/browse/WEB-666`, { summary: HOSTILE, status: '<i>Open</i>' }, false, now - min)] : [
        hist('jira', 'WEB-412', `${SITE}/browse/WEB-412`, ISSUES[0], true, now - 50 * min),
        ...(scene === 'default' ? [
          hist('github', 'acme/web#198', 'https://github.com/acme/web/issues/198', { title: GH[1].title, status: 'Merged', statusColor: 'green' }, false, now - 2 * min),
          hist('linear', 'ENG-58', 'https://linear.app/acme/issue/ENG-58', { title: LINEAR[0].title, status: 'In Progress', statusColor: 'yellow' }, false, now - 40 * min),
        ] : []),
        hist('jira', 'WEB-398', `${SITE}/browse/WEB-398`, ISSUES[1], false, now - 4 * min),
        hist('jira', 'OPS-88', `${SITE}/browse/OPS-88`, ISSUES[4], false, now - 3 * 60 * min),
        hist('jira', 'WEB-377', `${SITE}/browse/WEB-377`, ISSUES[3], false, now - 26 * 60 * min),
      ],
    },
  };
  const area = (name) => ({
    get: async (defaults) => ({ ...(defaults && typeof defaults === 'object' ? defaults : {}), ...store[name] }),
    set: async (patch) => { Object.assign(store[name], patch); },
    remove: async (keys) => { [].concat(keys).forEach((k) => delete store[name][k]); },
  });

  const blank = params.get('tab') === 'blank';
  const activeTab = blank
    ? { id: 1, index: 0, windowId: 1, active: true, url: 'chrome://newtab/', title: 'New Tab' }
    : { id: 1, index: 0, windowId: 1, active: true, url: 'https://github.com/acme/web/pull/212', title: 'WEB-431: keep theme after refresh by maya · Pull Request #212' };
  const log = (...a) => console.info('[preview]', ...a);

  window.chrome = {
    storage: { sync: area('sync'), local: area('local') },
    tabs: {
      // "setup" has no tracker tabs open; "found" has a self-hosted one that must be confirmed.
      query: async (q) => (q && q.active ? [activeTab]
        : scene === 'setup' && params.get('found') ? [{ url: 'https://newtab.example/', active: true }, { url: 'https://jira.corp.example/browse/OPS-4', lastAccessed: now }]
        : scene === 'setup' ? [{ url: 'https://example.com/', active: true }]
        : [activeTab, { url: `${SITE}/jira/your-work`, active: false, lastAccessed: now }, ...(scene === 'single' ? [{ url: 'https://gitlab.com/acme/api/-/issues', lastAccessed: now - 5 }] : [])]),
      getCurrent: async () => undefined,
      create: async (o) => { log('tabs.create', o.url, o.active === false ? '(background)' : ''); return { index: 1 }; },
      update: async (_id, o) => { log('tabs.update', o.url); },
    },
    permissions: { contains: async () => true, request: async () => true },
    history: {
      search: async ({ text }) => [
        { url: 'https://github.com/acme/web/issues/187', title: 'Flaky checkout test on CI · Issue #187 · acme/web', lastVisitTime: now - 12 * min },
        { url: 'https://github.com/acme/web/pulls', title: 'Pull requests · acme/web', lastVisitTime: now - 11 * min },
        { url: 'https://linear.app/acme/issue/ENG-61/rate-limit-the-promo-endpoint', title: 'ENG-61 Rate limit the promo endpoint', lastVisitTime: now - 90 * min },
        { url: `${SITE}/browse/WEB-405`, title: '[WEB-405] Checkout button overlaps footer on small screens - Jira', lastVisitTime: now - 7 * 60 * min },
      ].filter((v) => v.url.includes(text)),
    },
    runtime: { sendMessage: async () => {}, getManifest: () => ({ version: '1.2.1' }), getURL: (p) => `/${p}` },
  };
  window.close = () => log('window.close');

  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const fields = (i) => ({ summary: i.summary, status: { name: i.status, statusCategory: { colorName: i.statusColor } }, issuetype: { name: i.type }, assignee: { displayName: i.assignee } });
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const url = new URL(String(input), location.href);
    await new Promise((r) => setTimeout(r, 120));
    const q = (url.searchParams.get('query') || url.searchParams.get('q') || '').toLowerCase();

    if (url.origin === 'https://api.github.com') {
      const path = url.pathname;
      const one = path.match(/^\/repos\/acme\/web\/issues\/(\d+)$/);
      if (one) { const hit = GH.find((i) => i.number === Number(one[1])); return hit ? json(hit) : json({}, 404); }
      if (path === '/search/issues') { const words = q.replace(/repo:\S+|in:title/g, '').trim(); return json({ items: GH.filter((i) => i.title.toLowerCase().includes(words)) }); }
      return json({}, 404);
    }
    if (url.origin === 'https://api.linear.app') {
      const body = JSON.parse(init?.body || '{}');
      if (body.query.includes('searchIssues')) return json({ data: { searchIssues: { nodes: LINEAR.filter((i) => i.title.toLowerCase().includes(String(body.variables.term).toLowerCase())) } } });
      if (body.query.includes('assignedIssues')) return json({ data: { viewer: { assignedIssues: { nodes: LINEAR } } } });
      if (body.query.includes('issue(')) return json({ data: { issue: LINEAR.find((i) => i.identifier === body.variables.id) || null } });
      return json({ data: { viewer: { name: 'Maya Okafor' } } });
    }
    if (url.origin !== SITE) return realFetch(input, init);

    if (scene === 'signedout') return json({}, 401);
    const path = url.pathname.replace(/^\/rest\/api\/\d\//, '');
    if (path === 'myself') return json({ displayName: 'Maya Okafor' });
    if (path.startsWith('issue/picker') && !q && params.get('guess') === '0') return json({ sections: [] });
    if (path.startsWith('issue/picker')) {
      const hits = ISSUES.filter((i) => `${i.key} ${i.summary}`.toLowerCase().includes(q));
      return json({ sections: [{ issues: hits.map((i) => ({ key: i.key, summaryText: i.summary })) }] });
    }
    if (path.startsWith('issue/')) {
      const issue = ISSUES.find((i) => i.key === decodeURIComponent(path.slice(6)));
      return issue ? json({ fields: fields(issue) }) : json({}, 404);
    }
    if (path.startsWith('project/search')) return json({ values: PROJECTS.filter((p) => `${p.key} ${p.name}`.toLowerCase().includes(q)) });
    if (path.startsWith('search') && (url.searchParams.get('jql') || '').includes('issueHistory')) {
      const seen = scene === 'empty' ? [ISSUES[2], ISSUES[5], ISSUES[7]] : [ISSUES[2]];
      return json({ issues: seen.map((i, n) => ({ key: i.key, fields: { ...fields(i), lastViewed: new Date(now - (20 + n * 45) * min).toISOString() } })) });
    }
    if (path.startsWith('search')) return json({ issues: ISSUES.filter((i) => i.assignee === 'Maya Okafor' && i.statusColor !== 'green').map((i) => ({ key: i.key, fields: fields(i) })) });
    return json({}, 404);
  };

  // Optional starting state, handy for screenshots: &q=text types into the box, &view=settings opens settings.
  window.addEventListener('load', () => setTimeout(() => {
    const q = params.get('q');
    if (q) {
      const input = document.getElementById('input');
      input.value = q;
      input.dispatchEvent(new Event('input'));
    }
    const view = params.get('view');
    if (view) document.getElementById('openSettings').click();
    if (view === 'add') document.getElementById('addTracker').click();
    if (view === 'tracker') document.querySelectorAll('#trackerList .trow')[Number(params.get('n') || 0)]?.click();
    const type = params.get('type'); // open the form for a new tracker of this type, from whichever screen lists them
    if (type) [...document.querySelectorAll('#typeList .trow')].find((b) => b.textContent.toLowerCase().startsWith(type))?.click();
  }, 150));
})();
