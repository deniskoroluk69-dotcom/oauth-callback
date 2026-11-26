#!/usr/bin/env node
// Простий пошук секретів у файлах, що потрапляють у git. Повертає код 1, якщо щось знайдено.
// У CI додатково працює gitleaks (див. .github/workflows/ci.yml).
import { execSync } from 'node:child_process';
import { readdirSync, readFileSync, statSync } from 'node:fs';

const PATTERNS = [
  ['Google API key', /AIza[0-9A-Za-z_-]{35}/],
  ['Google OAuth client secret', /GOCSPX-[0-9A-Za-z_-]{20,}/],
  ['Google OAuth access token', /ya29\.[0-9A-Za-z_-]{20,}/],
  ['Google refresh token', /\b1\/\/0[0-9A-Za-z_-]{30,}/],
  ['Service account private key', /-----BEGIN (RSA |EC )?PRIVATE KEY-----/],
  ['Service account JSON', /"type"\s*:\s*"service_account"/],
  ['Facebook access token', /\bEAA[A-Za-z0-9]{40,}/],
  ['Telegram bot token', /\b\d{8,10}:AA[0-9A-Za-z_-]{33}\b/],
  ['TikTok token', /\bact\.[0-9A-Za-z]{30,}/],
  ['Slack token', /xox[baprs]-[0-9A-Za-z-]{10,}/],
  ['GitHub token', /gh[pousr]_[0-9A-Za-z]{36}/],
  ['Generic secret assignment', /(client_secret|app_secret|api_secret|private_key)\s*[:=]\s*["'][^"'\s[\]]{12,}["']/i],
];

// Файли, які НЕ потрапляють у git (див. .gitignore) — їх не скануємо.
const IGNORED = /^functions\/lib(\/|$)|(^|\/)(node_modules|dist|dist-ssr|\.git|\.firebase|\.emulator-data|\.claude)(\/|$)|(^|\/)\.secret\.local$|(^|\/)\.env(\.(?!example$|demo$)[^/]+)?$/;

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = dir === '.' ? name : `${dir}/${name}`;
    if (IGNORED.test(p)) continue;
    const st = statSync(p);
    if (st.isDirectory()) walk(p, out);
    else out.push(p);
  }
  return out;
}

let files;
try {
  files = execSync('git ls-files -co --exclude-standard', { encoding: 'utf8', stdio: ['ignore', 'pipe', 'ignore'] }).split('\n').filter(Boolean);
} catch {
  files = walk('.'); // ще не git-репозиторій
}

const skip = /(^|\/)(node_modules|dist)\/|^functions\/lib\/|\.(png|jpg|jpeg|gif|webp|woff2?|ico|lock)$|package-lock\.json$|scripts\/secret-scan\.mjs$/;
const findings = [];
for (const f of files) {
  if (skip.test(f)) continue;
  try {
    if (statSync(f).size > 2_000_000) continue;
    const text = readFileSync(f, 'utf8');
    text.split('\n').forEach((line, i) => {
      for (const [name, re] of PATTERNS) if (re.test(line)) findings.push(`${f}:${i + 1}  ${name}`);
    });
  } catch {
    /* бінарний або видалений файл */
  }
}

if (findings.length) {
  console.error('Знайдено можливі секрети:\n' + findings.join('\n'));
  process.exit(1);
}
console.log(`OK: перевірено ${files.length} файлів, секретів не знайдено.`);
