// GitHub issues and pull requests on github.com.
// Public repositories work without a token. A personal access token adds private
// repositories and "Assigned to me". Keys look like owner/repo#123.
import { request, failure } from '../http.js';

const API = 'https://api.github.com';
const RESERVED = new Set(['settings', 'notifications', 'orgs', 'organizations', 'marketplace', 'explore', 'pulls', 'issues', 'search', 'login', 'logout', 'join', 'features', 'sponsors', 'topics', 'about', 'new', 'codespaces', 'copilot', 'pricing', 'enterprise', 'collections', 'trending', 'apps', 'users', 'account', 'dashboard', 'discussions', 'security', 'site', 'readme', 'customer-stories', 'team', 'stars', 'watching', 'gist']);
const REPO = /^[\w.-]+\/[\w.-]+$/;

const api = (t, path, signal) => request(`${API}/${path}`, {
  signal,
  headers: { Accept: 'application/vnd.github+json', 'X-GitHub-Api-Version': '2022-11-28', ...(t.token ? { Authorization: `Bearer ${t.token}` } : {}) },
});

const split = (key) => { const [repo, number] = key.split('#'); return { repo, number }; };

function shape(key, i) {
  const merged = !!i.pull_request?.merged_at;
  const open = i.state === 'open';
  return {
    key,
    summary: i.title || '',
    status: merged ? 'Merged' : open ? (i.draft ? 'Draft' : 'Open') : 'Closed',
    statusColor: open ? (i.pull_request ? 'yellow' : '') : 'green',
    type: i.pull_request ? 'Pull request' : 'Issue',
    assignee: i.assignee?.login || '',
  };
}

const keyOf = (i) => `${(i.repository?.full_name) || String(i.repository_url || '').split('/repos/')[1]}#${i.number}`;

export default {
  type: 'github',
  label: 'GitHub',
  repoRefs: true, // understands owner/repo#123
  fields: [
    { name: 'repo', label: 'Default repository', placeholder: 'owner/name', help: 'Lets you type just #123 or the number.' },
    { name: 'token', label: 'Access token', secret: true, optional: true, placeholder: 'Optional', help: 'Only needed for private repositories and Assigned to me. A fine-grained token with read access to issues and pull requests is enough. Stored on this device only.', link: 'https://github.com/settings/personal-access-tokens/new' },
  ],

  clean(t) {
    const repo = String(t.repo || '').trim().replace(/^https?:\/\/github\.com\//i, '').replace(/\/$/, '').split('/').slice(0, 2).join('/');
    if (repo && !REPO.test(repo)) return { error: 'Write the repository as owner/name.' };
    return { repo, token: String(t.token || '').trim() };
  },

  detail: (t) => t.repo || 'github.com',
  home: () => 'https://github.com/login',
  host: () => 'github.com',
  /** "Fix login by maya · Pull Request #9 · acme/web" -> "Fix login" */
  titleFrom: (title) => title.split(' · ')[0].replace(/\s+by\s+\S+$/, '').trim(),
  origins: () => [`${API}/*`],

  url: (key) => { const { repo, number } = split(key); return `https://github.com/${repo}/issues/${number}`; },
  searchUrl: (text, t) => `https://github.com/search?type=issues&q=${encodeURIComponent(t.repo ? `repo:${t.repo} ${text}` : text)}`,
  fromNumber: (n, t, mark) => (t.repo && mark !== '!' ? `${t.repo}#${n}` : null),
  fromRef: (path, mark, n) => (mark === '#' && REPO.test(path) ? `${path}#${n}` : null),
  fromUrl(u) {
    if (u.hostname !== 'github.com') return null;
    const m = u.pathname.match(/^\/([\w.-]+)\/([\w.-]+)\/(?:issues|pull)\/(\d+)/);
    return m ? `${m[1]}/${m[2]}#${m[3]}` : null;
  },

  detect(u) {
    if (u.protocol !== 'https:' || u.hostname !== 'github.com') return null;
    const [owner, name] = u.pathname.split('/').filter(Boolean);
    const repo = owner && name && !RESERVED.has(owner.toLowerCase()) ? `${owner}/${name}` : '';
    return { repo, trusted: true };
  },

  canMine: (t) => !!t.token,

  async whoami(t, signal) {
    if (!t.token) return { name: '', note: 'Public repositories only. Add a token for private ones.' };
    const r = await api(t, 'user', signal);
    return r.ok ? { name: r.data.login } : failure(r);
  },
  async issue(key, t, signal) {
    const { repo, number } = split(key);
    const r = await api(t, `repos/${repo}/issues/${number}`, signal);
    if (r.status === 404) return { key, missing: true };
    return r.ok ? shape(key, r.data) : null;
  },
  async search(query, t, signal) {
    const q = encodeURIComponent(`${query} ${t.repo ? `repo:${t.repo}` : ''} in:title`.trim());
    const r = await api(t, `search/issues?per_page=7&q=${q}`, signal);
    return r.ok ? (r.data.items || []).map((i) => shape(keyOf(i), i)) : null;
  },
  async mine(t, signal) {
    if (!t.token) return [];
    const r = await api(t, 'issues?filter=assigned&state=open&per_page=25&sort=updated', signal);
    return r.ok ? r.data.map((i) => shape(keyOf(i), i)) : null;
  },
};
