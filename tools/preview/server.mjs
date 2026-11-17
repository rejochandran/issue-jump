// Serves the popup in a normal browser tab with a fake `chrome` API and fake Jira data,
// so the UI can be worked on without reloading the extension.
//
//   npm run preview            then open http://localhost:8765/
//
// Scenes: /popup.html?scene=default | empty | setup | signedout     (add &tab=blank for a new-tab page)
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
    let file = path.startsWith('/__') ? join(here, path.slice(3)) : join(root, normalize(path));
    if (!file.startsWith(root) && !file.startsWith(here)) throw new Error('outside root');
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
