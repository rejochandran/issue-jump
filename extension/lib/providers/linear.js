// Linear. Jumping needs only the workspace name. Previews, search and
// "Assigned to me" need a personal API key, because Linear's API does not
// accept the browser session.
import { request, failure } from '../http.js';

const RESERVED = new Set(['login', 'signup', 'settings', 'join', 'integrations', 'oauth', 'auth', 'download', 'pricing', 'docs', 'changelog', 'customers', 'method', 'features', 'homepage', 'team', 'careers', 'contact']);

const gql = (t, query, variables, signal) => request('https://api.linear.app/graphql', {
  method: 'POST', signal, headers: { Authorization: t.token }, body: { query, variables },
});

const FIELDS = 'identifier title state { name type } assignee { name }';

function shape(i) {
  const type = i.state?.type; // triage | backlog | unstarted | started | completed | canceled
  return {
    key: i.identifier,
    summary: i.title || '',
    status: i.state?.name || '',
    statusColor: type === 'started' ? 'yellow' : type === 'completed' || type === 'canceled' ? 'green' : '',
    assignee: i.assignee?.name || '',
  };
}

export default {
  type: 'linear',
  label: 'Linear',
  keys: true,
  fields: [
    { name: 'workspace', label: 'Workspace', placeholder: 'yourcompany', required: true, help: 'The name in your Linear address: linear.app/yourcompany' },
    { name: 'team', label: 'Default team', placeholder: 'ENG', short: true, upper: true, help: 'Lets you type just the number.' },
    { name: 'token', label: 'API key', secret: true, optional: true, placeholder: 'Optional', help: 'Needed for previews, search and Assigned to me. Create one in Linear under Settings, Security & access. Stored on this device only.', link: 'https://linear.app/settings/account/security' },
  ],

  clean(t) {
    const workspace = String(t.workspace || '').trim().replace(/^https?:\/\/linear\.app\//i, '').split('/')[0].toLowerCase();
    if (!/^[a-z0-9-]+$/.test(workspace)) return { error: 'Enter the workspace name from your Linear address.' };
    return { workspace, team: String(t.team || '').toUpperCase().replace(/[^A-Z0-9]/g, ''), token: String(t.token || '').trim() };
  },

  detail: (t) => t.workspace,
  project: (t) => t.team,
  home: () => 'https://linear.app/login',
  host: () => 'linear.app',
  /** "ENG-12 Fix login" -> "Fix login" */
  titleFrom: (title) => title.replace(/^[A-Z][A-Z0-9]*-\d+\s*[-:›]?\s*/, '').replace(/\s+[-–|]\s+Linear$/, '').trim(),
  origins: (t) => (t.token ? ['https://api.linear.app/*'] : []),
  needsToken: true,

  url: (key, t) => `https://linear.app/${t.workspace}/issue/${encodeURIComponent(key)}`,
  searchUrl: (text, t) => `https://linear.app/${t.workspace}/search?q=${encodeURIComponent(text)}`,
  fromNumber: (n, t) => (t.team ? `${t.team}-${n}` : null),
  fromUrl(u, t) {
    if (u.hostname !== 'linear.app') return null;
    const m = u.pathname.match(/^\/([^/]+)\/issue\/([A-Za-z][A-Za-z0-9]*-\d+)/);
    return m && m[1] === t.workspace ? m[2].toUpperCase() : null;
  },

  detect(u) {
    if (u.protocol !== 'https:' || u.hostname !== 'linear.app') return null;
    const [workspace, , key] = u.pathname.split('/').filter(Boolean);
    if (!workspace || RESERVED.has(workspace.toLowerCase())) return null;
    const team = /^[A-Za-z][A-Za-z0-9]*-\d+$/.test(key || '') ? key.split('-')[0].toUpperCase() : '';
    return { workspace: workspace.toLowerCase(), team, trusted: true };
  },

  canMine: (t) => !!t.token,

  async whoami(t, signal) {
    if (!t.token) return { name: '', note: 'Add an API key for previews and search.' };
    const r = await gql(t, '{ viewer { name } }', {}, signal);
    return r.ok && r.data.data?.viewer ? { name: r.data.data.viewer.name } : failure(r.ok ? { status: 401 } : r);
  },
  async issue(key, t, signal) {
    if (!t.token) return null;
    const r = await gql(t, `query($id: String!) { issue(id: $id) { ${FIELDS} } }`, { id: key }, signal);
    if (!r.ok) return null;
    return r.data.data?.issue ? shape(r.data.data.issue) : { key, missing: true };
  },
  async search(query, t, signal) {
    if (!t.token) return [];
    const r = await gql(t, `query($term: String!) { searchIssues(term: $term, first: 7) { nodes { ${FIELDS} } } }`, { term: query }, signal);
    return r.ok && r.data.data ? r.data.data.searchIssues.nodes.map(shape) : null;
  },
  async mine(t, signal) {
    if (!t.token) return [];
    const r = await gql(t, `{ viewer { assignedIssues(first: 25, orderBy: updatedAt, filter: { state: { type: { nin: ["completed", "canceled"] } } }) { nodes { ${FIELDS} } } } }`, {}, signal);
    return r.ok && r.data.data ? r.data.data.viewer.assignedIssues.nodes.map(shape) : null;
  },
};
