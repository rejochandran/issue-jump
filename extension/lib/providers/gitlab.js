// GitLab issues and merge requests, on gitlab.com or a self-hosted instance.
// Lookups use the browser's existing GitLab session. Keys look like group/project#12 and group/project!34.
import { request, failure, hostOf, normalizeSite } from '../http.js';

const PATH = /^[\w.-]+(?:\/[\w.-]+)+$/;
const RESERVED = new Set(['users', 'explore', 'dashboard', 'help', 'admin', 'search', 'groups', 'projects', '-', 'profile', 'api', 'oauth', 'import', 'snippets', 'assets']);

const api = (t, path, signal) => request(`${t.site}/api/v4/${path}`, { credentials: 'include', signal });
const id = (path) => encodeURIComponent(path);

function split(key) {
  const mark = key.includes('!') ? '!' : '#';
  const [path, number] = key.split(mark);
  return { path, number, kind: mark === '!' ? 'merge_requests' : 'issues' };
}

function shape(key, i, mr) {
  const open = i.state === 'opened';
  return {
    key,
    summary: i.title || '',
    status: open ? (i.draft ? 'Draft' : 'Open') : i.state === 'merged' ? 'Merged' : 'Closed',
    statusColor: open ? (mr ? 'yellow' : '') : 'green',
    type: mr ? 'Merge request' : 'Issue',
    assignee: i.assignee?.name || '',
  };
}

export default {
  type: 'gitlab',
  label: 'GitLab',
  repoRefs: true,
  fields: [
    { name: 'site', label: 'Site', placeholder: 'gitlab.com', required: true },
    { name: 'project', label: 'Default project', placeholder: 'group/project', help: 'Lets you type just #12, !34 or the number.' },
  ],

  clean(t) {
    const site = normalizeSite(t.site || 'gitlab.com');
    if (!site) return { error: 'Enter your GitLab address, for example gitlab.com' };
    const project = String(t.project || '').trim().replace(/^https?:\/\/[^/]+\//i, '').replace(/\/-\/.*$/, '').replace(/^\/|\/$/g, '');
    if (project && !PATH.test(project)) return { error: 'Write the project as group/project.' };
    return { site, project };
  },

  detail: (t) => t.project || hostOf(t.site),
  home: (t) => `${t.site}/users/sign_in`,
  host: (t) => hostOf(t.site),
  /** "Fix login (#12) · Issues · acme / api · GitLab" -> "Fix login" */
  titleFrom: (title) => title.split(' · ')[0].replace(/\s*\([#!]\d+\)$/, '').trim(),
  origins: (t) => [`${t.site}/*`],

  url: (key, t) => { const { path, number, kind } = split(key); return `${t.site}/${path}/-/${kind}/${number}`; },
  searchUrl: (text, t) => (t.project
    ? `${t.site}/${t.project}/-/issues?search=${encodeURIComponent(text)}`
    : `${t.site}/search?scope=issues&search=${encodeURIComponent(text)}`),
  fromNumber: (n, t, mark) => (t.project ? `${t.project}${mark === '!' ? '!' : '#'}${n}` : null),
  fromRef: (path, mark, n) => (PATH.test(path) ? `${path}${mark}${n}` : null),
  fromUrl(u, t) {
    if (u.origin !== t.site) return null;
    const m = u.pathname.match(/^\/(.+?)\/-\/(issues|merge_requests)\/(\d+)/);
    return m ? `${m[1]}${m[2] === 'issues' ? '#' : '!'}${m[3]}` : null;
  },

  detect(u) {
    if (u.protocol !== 'https:' || u.hostname !== 'gitlab.com') return null;
    const path = u.pathname.split('/-/')[0].split('/').filter(Boolean);
    const project = path.length >= 2 && !RESERVED.has(path[0].toLowerCase()) ? path.join('/') : '';
    return { site: u.origin, project, trusted: true };
  },

  async whoami(t, signal) {
    const r = await api(t, 'user', signal);
    return r.ok ? { name: r.data.name || r.data.username || '' } : failure(r);
  },
  async issue(key, t, signal) {
    const { path, number, kind } = split(key);
    const r = await api(t, `projects/${id(path)}/${kind}/${number}`, signal);
    if (r.status === 404) return { key, missing: true };
    return r.ok ? shape(key, r.data, kind === 'merge_requests') : null;
  },
  async search(query, t, signal) {
    if (!t.project) return [];
    const r = await api(t, `projects/${id(t.project)}/issues?per_page=7&search=${encodeURIComponent(query)}`, signal);
    return r.ok ? r.data.map((i) => shape(`${t.project}#${i.iid}`, i)) : null;
  },
  async mine(t, signal) {
    const r = await api(t, 'issues?scope=assigned_to_me&state=opened&per_page=25', signal);
    return r.ok ? r.data.map((i) => shape(i.references?.full || `#${i.iid}`, i)) : null;
  },
};
