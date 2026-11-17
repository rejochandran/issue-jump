// Fails a pull request whose description does not explain the change.
// Reads PR_TITLE, PR_BODY, PR_BASE and PR_AUTHOR from the environment (set by CI).
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const title = (process.env.PR_TITLE || '').trim();
const base = process.env.PR_BASE || '';
// Template hints live in HTML comments; they do not count as a description.
const body = (process.env.PR_BODY || '').replace(/<!--[\s\S]*?-->/g, '').replace(/\r/g, '');
const errors = [];

// Dependabot writes its own description (what was updated, release notes). It cannot follow
// the template, and it never targets main, so it is let through for dev only.
if (process.env.PR_AUTHOR === 'dependabot[bot]' && base !== 'main') {
  console.log('✓ automated dependency update; description check skipped');
  process.exit(0);
}

/** The text under a "## Heading", up to the next heading. */
function section(heading) {
  const at = body.toLowerCase().indexOf(`## ${heading.toLowerCase()}`);
  if (at < 0) return null;
  const rest = body.slice(at).split('\n').slice(1).join('\n');
  const end = rest.search(/^## /m);
  return (end < 0 ? rest : rest.slice(0, end)).trim();
}
const words = (text) => (text.match(/[\p{L}\p{N}][\p{L}\p{N}'’.-]*/gu) || []).length;

const required = [
  ['What does this change?', base === 'main' ? 40 : 12, 'what changes for users or for the code, and why'],
  ['How did you test it?', base === 'main' ? 20 : 8, 'what you ran or tried, and what you did not'],
];
for (const [heading, min, hint] of required) {
  const text = section(heading);
  if (text === null) errors.push(`Missing the "## ${heading}" section. Keep the headings from the pull request template.`);
  else if (words(text) < min) errors.push(`"${heading}" needs more detail (${words(text)} words, at least ${min}). Say ${hint}.`);
}

if (title.length < 10) errors.push('The title is too short to say what this does.');

if (base === 'main') {
  const root = fileURLToPath(new URL('..', import.meta.url));
  const { version } = JSON.parse(readFileSync(`${root}extension/manifest.json`, 'utf8'));
  const release = title.match(/^Release (\d+\.\d+\.\d+)$/);
  if (release && release[1] !== version) errors.push(`The title says ${release[1]} but the manifest version is ${version}.`);
  const boxes = body.match(/^- \[[ xX]\]/gm) || [];
  const open = body.match(/^- \[ \]/gm) || [];
  if (!boxes.length) errors.push('Keep the checklist from the template and tick what applies.');
  else if (open.length) errors.push(`${open.length} checklist item(s) are not ticked. Tick them, or remove a line that does not apply and say why above.`);
}

if (errors.length) {
  console.error(`This pull request's description needs work:\n${errors.map((e) => `  ✗ ${e}`).join('\n')}`);
  process.exit(1);
}
console.log('✓ pull request description looks complete');
