// Any other tracker (Kaneo, Plane, YouTrack, Redmine, Bugzilla, an internal tool...).
// Jump only: the user supplies a link pattern and the extension fills in the key.
import { hostOf, originOf } from '../http.js';

export default {
  type: 'custom',
  label: 'Custom',
  fields: [
    { name: 'name', label: 'Name', placeholder: 'Kaneo', required: true },
    { name: 'template', label: 'Issue link', placeholder: 'https://tracker.example.com/issues/{key}', required: true, help: 'Open any issue in your tracker, copy its address and replace the issue key or number with {key}.' },
    { name: 'style', label: 'Issues are written as', choices: [['key', 'ABC-123'], ['number', '123']] },
    { name: 'project', label: 'Default project', placeholder: 'ABC', short: true, upper: true, when: (t) => t.style !== 'number', help: 'Lets you type just the number.' },
  ],

  clean(t) {
    const name = String(t.name || '').trim().slice(0, 30);
    const template = String(t.template || '').trim();
    if (!name) return { error: 'Give the tracker a name.' };
    if (!(template.includes('{key}') && originOf(template))) return { error: 'The link needs a full address containing {key}.' };
    const style = t.style === 'number' ? 'number' : 'key';
    return { name, template, style, project: style === 'key' ? String(t.project || '').toUpperCase().replace(/[^A-Z0-9_]/g, '') : '' };
  },

  title: (t) => t.name,
  detail: (t) => hostOf(originOf(t.template) || ''),
  home: (t) => originOf(t.template),
  origins: () => [],
  accepts: (t) => t.style !== 'number', // ABC-123 style keys

  url: (key, t) => t.template.replaceAll('{key}', encodeURIComponent(key)),
  fromNumber: (n, t) => (t.style === 'number' ? String(n) : t.project ? `${t.project}-${n}` : null),
};
