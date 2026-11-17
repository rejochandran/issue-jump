// Sanity checks that run in CI before anything is built or published.
import { readFileSync, existsSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('..', import.meta.url));
const ext = join(root, 'extension');
const errors = [];
const fail = (message) => errors.push(message);

const manifest = JSON.parse(readFileSync(join(ext, 'manifest.json'), 'utf8'));
const pkg = JSON.parse(readFileSync(join(root, 'package.json'), 'utf8'));
const changelog = readFileSync(join(root, 'CHANGELOG.md'), 'utf8');

if (manifest.manifest_version !== 3) fail('manifest_version must be 3');
if (!/^\d+\.\d+\.\d+$/.test(manifest.version)) fail(`manifest version "${manifest.version}" must look like 1.2.3`);
if (manifest.version !== pkg.version) fail(`package.json (${pkg.version}) and manifest.json (${manifest.version}) versions differ`);
if (!changelog.includes(`## [${manifest.version}]`)) fail(`CHANGELOG.md has no "## [${manifest.version}]" section`);
if (manifest.description.length > 132) fail(`manifest description is ${manifest.description.length} characters; the store allows 132`);
if (manifest.name.length > 75) fail('manifest name is longer than 75 characters');

// Every file the manifest points at must exist.
const referenced = [
  manifest.action?.default_popup,
  manifest.background?.service_worker,
  ...Object.values(manifest.icons || {}),
  ...Object.values(manifest.action?.default_icon || {}),
].filter(Boolean);
for (const file of new Set(referenced)) if (!existsSync(join(ext, file))) fail(`manifest references missing file: ${file}`);

// Permissions are part of the store listing, so changes must be deliberate.
const allowed = { permissions: ['contextMenus', 'storage', 'tabs'], optional_permissions: ['clipboardRead', 'history'] };
for (const [field, expected] of Object.entries(allowed)) {
  const actual = [...(manifest[field] || [])].sort();
  if (JSON.stringify(actual) !== JSON.stringify(expected)) {
    fail(`${field} changed to [${actual}]. Update scripts/check.mjs, PRIVACY.md and store/listing.md together.`);
  }
}

const walk = (dir) => readdirSync(dir).flatMap((name) => {
  const path = join(dir, name);
  return statSync(path).isDirectory() ? walk(path) : [path];
});
const files = walk(ext);

for (const file of files.filter((f) => f.endsWith('.js'))) {
  try {
    execFileSync(process.execPath, ['--check', file], { stdio: 'pipe' });
  } catch (e) {
    fail(`syntax error in ${file.replace(root, '')}:\n${e.stderr}`);
  }
  // The store rejects remotely hosted code and eval.
  const source = readFileSync(file, 'utf8');
  if (/\beval\s*\(|new Function\s*\(/.test(source)) fail(`${file.replace(root, '')} uses eval or new Function`);
  if (/import\s*\(\s*['"]https?:/.test(source) || /from\s+['"]https?:/.test(source)) fail(`${file.replace(root, '')} imports remote code`);
}
for (const file of files.filter((f) => f.endsWith('.html'))) {
  const source = readFileSync(file, 'utf8');
  if (/<script[^>]+src=["']https?:/.test(source)) fail(`${file.replace(root, '')} loads a remote script`);
  if (/<script(?![^>]*\bsrc=)[^>]*>\s*\S/.test(source)) fail(`${file.replace(root, '')} has an inline script, which MV3 blocks`);
}

if (errors.length) {
  console.error(errors.map((e) => `✗ ${e}`).join('\n'));
  process.exit(1);
}
console.log(`✓ manifest, versions and ${files.length} extension files look good (v${manifest.version})`);
