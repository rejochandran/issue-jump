// Runs the popup's browser tests in headless Chrome and reports the results.
//   npm run test:ui
// Needs Chrome or Chromium. Set CHROME to its path if it is not found.
// To watch them run, start `npm run preview` and open http://localhost:8765/__tests/index.html
import { spawn, execFileSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../..', import.meta.url));
const port = 8793;

function findChrome() {
  const candidates = [
    process.env.CHROME,
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    '/Applications/Chromium.app/Contents/MacOS/Chromium',
    'google-chrome', 'google-chrome-stable', 'chromium', 'chromium-browser',
  ].filter(Boolean);
  for (const c of candidates) {
    if (c.includes('/')) { if (existsSync(c)) return c; continue; }
    try { execFileSync('which', [c], { stdio: 'pipe' }); return c; } catch { /* try the next one */ }
  }
  return null;
}

const chrome = findChrome();
if (!chrome) {
  console.error('Chrome was not found. Install it or set CHROME=/path/to/chrome.');
  process.exit(process.env.CI ? 1 : 0);
}

const server = spawn(process.execPath, ['tools/preview/server.mjs'], { cwd: root, env: { ...process.env, PORT: String(port) }, stdio: 'ignore' });
const stop = () => server.kill();
process.on('exit', stop);
await new Promise((r) => setTimeout(r, 800));

let dom = '';
try {
  dom = execFileSync(chrome, [
    '--headless=new', '--disable-gpu', '--no-sandbox', '--hide-scrollbars', '--window-size=900,900',
    '--virtual-time-budget=180000', '--dump-dom', `http://localhost:${port}/__tests/index.html`,
  ], { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'], timeout: 240000, maxBuffer: 32 * 1024 * 1024 });
} catch (e) {
  console.error(`Chrome failed to run the tests: ${e.message}`);
  process.exit(1);
}

const match = dom.match(/<pre id="result">([\s\S]*?)<\/pre>/);
const decode = (s) => s.replaceAll('&lt;', '<').replaceAll('&gt;', '>').replaceAll('&quot;', '"').replaceAll('&amp;', '&');
let results = [];
try { results = JSON.parse(decode(match?.[1] || '')); } catch { /* handled below */ }
if (!results.length) {
  console.error('The tests did not finish. The page may have crashed or run out of time.');
  process.exit(1);
}

const failed = results.filter((r) => r.error);
for (const r of results) console.log(`${r.error ? '✗' : '✓'} ${r.name}${r.error ? `\n    ${r.error}` : ''}`);
console.log(`\n${results.length - failed.length} passed, ${failed.length} failed`);
process.exit(failed.length ? 1 : 0);
