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
  const PROJECTS = [{ key: 'WEB', name: 'Web App' }, { key: 'OPS', name: 'Operations' }, { key: 'MOB', name: 'Mobile' }];

  const store = {
    sync: scene === 'setup' ? {} : { site: SITE, project: 'WEB' },
    local: {
      siteConfirmed: scene !== 'empty',
      history: scene === 'default' || scene === 'signedout' ? [
        { ...ISSUES[0], pinned: true, ts: now - 50 * min },
        { ...ISSUES[1], pinned: false, ts: now - 4 * min },
        { ...ISSUES[4], pinned: false, ts: now - 3 * 60 * min },
        { ...ISSUES[3], pinned: false, ts: now - 26 * 60 * min },
        { ...ISSUES[7], pinned: false, ts: now - 3 * 24 * 60 * min },
      ] : [],
    },
  };
  const area = (name) => ({
    get: async (defaults) => ({ ...(defaults && typeof defaults === 'object' ? defaults : {}), ...store[name] }),
    set: async (patch) => { Object.assign(store[name], patch); },
  });

  const blank = params.get('tab') === 'blank';
  const activeTab = blank
    ? { id: 1, index: 0, windowId: 1, active: true, url: 'chrome://newtab/', title: 'New Tab' }
    : { id: 1, index: 0, windowId: 1, active: true, url: 'https://github.com/acme/web/pull/212', title: 'WEB-431: keep theme after refresh by maya · Pull Request #212' };
  const log = (...a) => console.info('[preview]', ...a);

  window.chrome = {
    storage: { sync: area('sync'), local: area('local') },
    tabs: {
      query: async (q) => (q && q.active ? [activeTab] : scene === 'setup' ? [activeTab] : [activeTab, { url: `${SITE}/jira/your-work`, active: false, lastAccessed: now }]),
      getCurrent: async () => undefined,
      create: async (o) => { log('tabs.create', o.url, o.active === false ? '(background)' : ''); return { index: 1 }; },
      update: async (_id, o) => { log('tabs.update', o.url); },
    },
    permissions: { contains: async () => true, request: async () => true },
    runtime: { sendMessage: async () => {}, getManifest: () => ({ version: '1.0.0' }), getURL: (p) => `/${p}` },
  };
  window.close = () => log('window.close');

  const json = (data, status = 200) => new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } });
  const fields = (i) => ({ summary: i.summary, status: { name: i.status, statusCategory: { colorName: i.statusColor } }, issuetype: { name: i.type }, assignee: { displayName: i.assignee } });
  const realFetch = window.fetch.bind(window);

  window.fetch = async (input, init) => {
    const url = new URL(String(input), location.href);
    if (url.origin !== SITE) return realFetch(input, init);
    await new Promise((r) => setTimeout(r, 120));
    if (scene === 'signedout') return json({}, 401);
    const path = url.pathname.replace(/^\/rest\/api\/\d\//, '');
    const q = (url.searchParams.get('query') || '').toLowerCase();
    if (path === 'myself') return json({ displayName: 'Maya Okafor' });
    if (path.startsWith('issue/picker')) {
      const hits = ISSUES.filter((i) => `${i.key} ${i.summary}`.toLowerCase().includes(q));
      return json({ sections: [{ issues: hits.map((i) => ({ key: i.key, summaryText: i.summary })) }] });
    }
    if (path.startsWith('issue/')) {
      const issue = ISSUES.find((i) => i.key === decodeURIComponent(path.slice(6)));
      return issue ? json({ fields: fields(issue) }) : json({}, 404);
    }
    if (path.startsWith('project/search')) return json({ values: PROJECTS.filter((p) => `${p.key} ${p.name}`.toLowerCase().includes(q)) });
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
    if (params.get('view') === 'settings') document.getElementById('openSettings').click();
  }, 150));
})();
