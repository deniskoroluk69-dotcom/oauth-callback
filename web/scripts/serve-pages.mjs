// Локальний перегляд зібраного сайту так, як його віддає GitHub Pages:
// /path → path, path.html або path/index.html; інакше 404.html зі статусом 404.
//   npm --prefix web run build && npm --prefix web run preview:pages
import { createServer } from 'node:http';
import { readFile, stat } from 'node:fs/promises';
import { extname, join, normalize } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = fileURLToPath(new URL('../dist/', import.meta.url));
const port = Number(process.env.PORT || 4173);
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.svg': 'image/svg+xml', '.woff2': 'font/woff2', '.json': 'application/json' };

async function file(p) {
  try {
    return (await stat(p)).isFile() ? p : null;
  } catch {
    return null;
  }
}

createServer(async (req, res) => {
  const url = new URL(req.url, 'http://x');
  const rel = normalize(decodeURIComponent(url.pathname)).replace(/^([/\\])+/, '');
  if (rel.startsWith('..')) return res.writeHead(400).end();
  const base = join(root, rel);
  const found = (await file(base)) || (await file(`${base}.html`)) || (await file(join(base, 'index.html')));
  const target = found || join(root, '404.html');
  res.writeHead(found ? 200 : 404, { 'Content-Type': TYPES[extname(target)] || 'application/octet-stream' });
  res.end(await readFile(target));
}).listen(port, () => console.log(`GitHub Pages preview: http://localhost:${port}`));
