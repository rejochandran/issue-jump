// Jira Cloud and Jira Server / Data Center. Lookups use the browser's existing Jira session.
import { request, failure, hostOf, normalizeSite, originOf } from '../http.js';

const api = (t, path, signal) => request(`${t.site}/rest/${path}`, { credentials: 'include', signal });

function shape(key, fields = {}) {
  return {
    key,
    summary: fields.summary || '',
    status: fields.status?.name || '',
    statusColor: fields.status?.statusCategory?.colorName || '', // blue-gray | yellow | green
    type: fields.issuetype?.name || '',
    assignee: fields.assignee?.displayName || '',
  };
}

export default {
  type: 'jira',
  label: 'Jira',
  keys: true, // understands ABC-123
  fields: [
    { name: 'site', label: 'Site', placeholder: 'yourcompany.atlassian.net', required: true },
    { name: 'project', label: 'Default project', placeholder: 'ABC', short: true, upper: true, help: 'Lets you type just the number.' },
    { name: 'template', label: 'Custom issue link', placeholder: '{site}/browse/{key}', advanced: true, help: 'Use {key} where the issue key goes. Leave empty for the default.' },
  ],

  clean(t) {
    const site = normalizeSite(t.site, '.atlassian.net');
    if (!site) return { error: 'Enter your Jira address, for example yourcompany.atlassian.net' };
    const template = String(t.template || '').trim();
    if (template && !(template.includes('{key}') && originOf(template))) return { error: 'The custom link needs a full address containing {key}.' };
    return { site, project: String(t.project || '').toUpperCase().replace(/[^A-Z0-9_]/g, ''), template: template === `${site}/browse/{key}` ? '' : template };
  },

  detail: (t) => hostOf(t.site),
  home: (t) => t.site,
  origins: (t) => [`${t.site}/*`],

  url: (key, t) => (t.template || `${t.site}/browse/{key}`).replaceAll('{key}', encodeURIComponent(key)),
  searchUrl(text, t) {
    const q = String(text).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
    return `${t.site}/issues/?jql=${encodeURIComponent(`text ~ "${q}" ORDER BY updated DESC`)}`;
  },
  fromNumber: (n, t) => (t.project ? `${t.project}-${n}` : null),
  fromUrl(u, t) {
    if (u.origin !== t.site) return null;
    const m = `${u.pathname}${u.search}`.match(/[A-Z][A-Z0-9_]{0,14}-\d{1,7}(?![A-Za-z0-9_])/);
    return m ? m[0] : null;
  },

  /** A tab on <name>.atlassian.net is Jira Cloud. Elsewhere a /browse/KEY-1 path only hints at Jira. */
  detect(u) {
    if (u.protocol === 'https:' && /^[a-z0-9-]+\.atlassian\.net$/i.test(u.hostname)) return { site: u.origin, trusted: true };
    if (/\/browse\/[A-Z][A-Z0-9_]+-\d+/.test(u.pathname)) return { site: u.origin, trusted: false };
    return null;
  },

  async whoami(t, signal) {
    const r = await api(t, 'api/2/myself', signal);
    return r.ok ? { name: r.data.displayName || r.data.name || '' } : failure(r);
  },
  async issue(key, t, signal) {
    const r = await api(t, `api/2/issue/${encodeURIComponent(key)}?fields=summary,status,issuetype,assignee`, signal);
    if (r.status === 404) return { key, missing: true };
    return r.ok ? shape(key, r.data.fields) : null;
  },
  /** Jira's own quick search: matches keys, partial keys and summary text. */
  async search(query, t, signal) {
    const r = await api(t, `api/2/issue/picker?showSubTasks=true&query=${encodeURIComponent(query)}`, signal);
    if (!r.ok) return null;
    const seen = new Set();
    return (r.data.sections || []).flatMap((s) => s.issues || [])
      .filter((i) => !seen.has(i.key) && seen.add(i.key))
      .map((i) => ({ key: i.key, summary: i.summaryText || '' }));
  },
  async projects(query, t, signal) {
    const r = await api(t, `api/2/project/search?maxResults=4&query=${encodeURIComponent(query)}`, signal);
    return r.ok ? (r.data.values || []).map((p) => ({ key: p.key, name: p.name, url: `${t.site}/browse/${encodeURIComponent(p.key)}` })) : [];
  },
  async mine(t, signal) {
    const q = `jql=${encodeURIComponent('assignee = currentUser() AND statusCategory != Done ORDER BY updated DESC')}&fields=summary,status&maxResults=25`;
    let r = await api(t, `api/3/search/jql?${q}`, signal); // Jira Cloud
    if (!r.ok && r.status !== 401 && r.status !== 403) r = await api(t, `api/2/search?${q}`, signal); // Server / Data Center
    return r.ok ? (r.data.issues || []).map((i) => shape(i.key, i.fields)) : null;
  },
};
