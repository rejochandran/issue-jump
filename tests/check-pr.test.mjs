// The pull request description check that CI runs.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const script = fileURLToPath(new URL('../scripts/check-pr.mjs', import.meta.url));
const { version } = JSON.parse(readFileSync(new URL('../extension/manifest.json', import.meta.url), 'utf8'));
const run = (env) => spawnSync(process.execPath, [script], { env: { ...process.env, PR_TITLE: '', PR_BODY: '', PR_BASE: 'dev', ...env }, encoding: 'utf8' });

const what = 'Adds a provider for YouTrack so that keys from it can be opened, previewed and searched like the other trackers. '.repeat(3);
const how = 'Ran the unit and popup tests, then loaded the dev build in Chrome and opened several issues against a real YouTrack Cloud account. Self-hosted was not tried.';
const good = `## What does this change?\n\n${what}\n\n## How did you test it?\n\n${how}\n\n## Checklist\n\n- [x] Tests pass\n`;

test('a complete description passes, for dev and for main', () => {
  assert.equal(run({ PR_TITLE: 'feat: add YouTrack', PR_BODY: good }).status, 0);
  assert.equal(run({ PR_TITLE: `Release ${version}`, PR_BODY: good, PR_BASE: 'main' }).status, 0);
});

test('an empty description, or the untouched template, fails', () => {
  assert.equal(run({ PR_TITLE: 'feat: add YouTrack' }).status, 1);
  const template = readFileSync(new URL('../.github/pull_request_template.md', import.meta.url), 'utf8');
  const result = run({ PR_TITLE: 'feat: add YouTrack', PR_BODY: template });
  assert.equal(result.status, 1);
  assert.match(result.stderr, /needs more detail/);
  const release = readFileSync(new URL('../.github/PULL_REQUEST_TEMPLATE/release.md', import.meta.url), 'utf8');
  assert.equal(run({ PR_TITLE: `Release ${version}`, PR_BODY: release, PR_BASE: 'main' }).status, 1);
});

test('a thin description fails, and main asks for more than dev', () => {
  const thin = '## What does this change?\n\nFixes a bug.\n\n## How did you test it?\n\nTests.\n';
  assert.equal(run({ PR_TITLE: 'fix: a bug somewhere', PR_BODY: thin }).status, 1);
  const short = '## What does this change?\n\nKeeps the selected row in place when lookups finish and the list is drawn again.\n\n## How did you test it?\n\nAdded a popup test and tried it by hand in Chrome.\n\n- [x] Tests pass\n';
  assert.equal(run({ PR_TITLE: 'fix: keep selection on refresh', PR_BODY: short }).status, 0);
  assert.equal(run({ PR_TITLE: 'fix: keep selection on refresh', PR_BODY: short, PR_BASE: 'main' }).status, 1);
});

test('a release must match the manifest version and have its checklist ticked', () => {
  const wrong = run({ PR_TITLE: 'Release 99.0.0', PR_BODY: good, PR_BASE: 'main' });
  assert.equal(wrong.status, 1);
  assert.match(wrong.stderr, /manifest version/);
  const unticked = run({ PR_TITLE: `Release ${version}`, PR_BODY: good.replace('[x]', '[ ]'), PR_BASE: 'main' });
  assert.equal(unticked.status, 1);
  assert.match(unticked.stderr, /not ticked/);
});
