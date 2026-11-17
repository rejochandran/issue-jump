// The trackers Issue Jump knows about. To add one, create a module next to
// this file and list it here. docs/providers.md describes the interface.
import jira from './jira.js';
import github from './github.js';
import gitlab from './gitlab.js';
import linear from './linear.js';
import custom from './custom.js';

export const PROVIDERS = [jira, github, gitlab, linear, custom];

const byType = Object.fromEntries(PROVIDERS.map((p) => [p.type, p]));

/** The provider for a tracker (or a type name). */
export const providerOf = (trackerOrType) => byType[typeof trackerOrType === 'string' ? trackerOrType : trackerOrType?.type];

/** Display name of a configured tracker: "Jira", or the user's name for a custom one. */
export const titleOf = (t) => providerOf(t)?.title?.(t) || providerOf(t)?.label || 'Tracker';

/** Whether a tracker takes ABC-123 style keys. */
export const takesKeys = (t) => { const p = providerOf(t); return p.accepts ? p.accepts(t) : !!p.keys; };

/** The project or team that bare numbers belong to, if set. */
export const projectOf = (t) => (providerOf(t).project ? providerOf(t).project(t) : t.project) || '';
