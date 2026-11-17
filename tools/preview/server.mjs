// Serves the popup in a normal browser tab with a fake `chrome` API and fake Jira data,
// so the UI can be worked on without reloading the extension.
//
//   npm run preview            then open http://localhost:8765/
//
// Scenes: /popup.html?scene=default | single | empty | fresh | setup | signedout | noproject | history | hostile
// Extras: &tab=blank (a new-tab page), &q=text, &view=settings|add|tracker (&n=1), &found=1 with scene=setup
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = join(here, '..', '..', 'extension');
const port = Number(process.env.PORT) || 8765;
const types = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.png': 'image/png', '.json': 'application/json' };

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://localhost');
  let path = url.pathname === '/' ? '/__index.html' : url.pathname;
  try {
    // /__tests/x is served from tests/ui, other /__x from this folder, everything else from extension/.
    const tests = join(here, '..', '..', 'tests', 'ui');
    let file = path.startsWith('/__tests/') ? join(tests, normalize(path.slice(9)))
      : path.startsWith('/__') ? join(here, normalize(path.slice(3)))
      : join(root, normalize(path));
    if (![root, here, tests].some((dir) => file.startsWith(dir))) throw new Error('outside root');
    let body = await readFile(file);
    if (path === '/popup.html') {
      body = body.toString().replace('<script type="module" src="popup.js">', '<script src="/__stub.js"></script>\n  <script type="module" src="popup.js">');
    }
    res.writeHead(200, { 'Content-Type': types[extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' });
    res.end(body);
  } catch {
    res.writeHead(404).end('Not found');
  }
}).listen(port, () => console.log(`Preview at http://localhost:${port}/`));
