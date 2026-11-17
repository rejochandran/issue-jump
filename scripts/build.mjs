// Packs extension/ into dist/issue-jump-<version>.zip, ready for the Chrome Web Store.
//   node scripts/build.mjs          release build
//   node scripts/build.mjs --dev    dev build: renamed and stamped so it can sit next to the store version
import { cpSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const dev = process.argv.includes('--dev');
const dist = join(root, 'dist');
const stage = join(dist, 'extension');

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
cpSync(join(root, 'extension'), stage, { recursive: true, filter: (src) => !src.endsWith('.DS_Store') });

const manifestPath = join(stage, 'manifest.json');
const manifest = JSON.parse(readFileSync(manifestPath, 'utf8'));
let label = manifest.version;
if (dev) {
  const run = process.env.GITHUB_RUN_NUMBER || '0';
  const sha = (process.env.GITHUB_SHA || 'local').slice(0, 7);
  manifest.name = `${manifest.name} (dev)`;
  manifest.version_name = `${manifest.version}-dev.${run}+${sha}`;
  label = `${manifest.version}-dev.${run}`;
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
}

const zip = join(dist, `issue-jump-${label}.zip`);
execFileSync('zip', ['-r', '-q', '-X', zip, '.'], { cwd: stage });
rmSync(stage, { recursive: true, force: true });
console.log(zip.replace(root, ''));
