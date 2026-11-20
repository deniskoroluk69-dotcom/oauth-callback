// Пререндер сторінок у статичний HTML після `vite build` (для GitHub Pages).
import { readFileSync, writeFileSync, mkdirSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const webDir = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(webDir, 'dist');
const ssrDir = join(webDir, 'dist-ssr');

const { renderAll } = await import(pathToFileURL(join(ssrDir, 'prerender-entry.js')).href);
const template = readFileSync(join(dist, 'index.html'), 'utf8');

let count = 0;
for (const p of renderAll()) {
  const html = template
    .replace('<html lang="uk">', `<html lang="${p.lang}">`)
    .replace('<title>KnB Stats</title>', '')
    .replace('<!--head-->', p.head)
    .replace('<!--app-->', p.body);
  const out = join(dist, p.file);
  mkdirSync(dirname(out), { recursive: true });
  writeFileSync(out, html);
  count++;
}
rmSync(ssrDir, { recursive: true, force: true });

// Власний домен для GitHub Pages.
if (process.env.VITE_SITE_DOMAIN) writeFileSync(join(dist, 'CNAME'), `${process.env.VITE_SITE_DOMAIN.trim()}\n`);

// Попередження, якщо в зібраних сторінках лишилися незаповнені плейсхолдери.
const leftovers = new Set();
for (const f of ['uk/index.html', 'en/privacy.html', 'en/terms.html', 'en/data-deletion.html']) {
  for (const m of readFileSync(join(dist, f), 'utf8').matchAll(/\[(?:[A-Z_]{4,})\]/g)) leftovers.add(m[0]);
}
console.log(`prerendered ${count} pages`);
if (leftovers.size) console.warn(`⚠ Незаповнені плейсхолдери на сторінках: ${[...leftovers].join(', ')}`);
