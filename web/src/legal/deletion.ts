import { SITE, botLabel } from '../config/site';
import type { Lang } from '../i18n';
import { fmtDate } from '../i18n';
import { esc } from '../lib/dom';
import { STALE_DATA_DAYS } from './platformRules';

const A = SITE.APP_NAME;
const MAIL = `<a href="mailto:${esc(SITE.SUPPORT_EMAIL)}">${esc(SITE.SUPPORT_EMAIL)}</a>`;
const ext = (url: string, label = url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;

export function deletionHtml(lang: Lang): string {
  const date = fmtDate(SITE.LEGAL_UPDATED, { day: 'numeric', month: 'long', year: 'numeric' });
  if (lang === 'uk') {
    return `
<h1>Видалення даних</h1>
<p class="updated">Оновлено: ${date}</p>
<p>Ви можете в будь-який момент відкликати доступ ${A} до своїх акаунтів і видалити всі свої дані. Ми виконуємо видалення <strong>протягом 7 днів</strong> (зазвичай — одразу).</p>
<div id="deletion-status"></div>

<h2>Спосіб 1. Відключити окрему платформу</h2>
<ol>
  <li>Увійдіть у <a href="/uk/login">кабінет</a>.</li>
  <li>Відкрийте «Мої платформи».</li>
  <li>Біля потрібного акаунта натисніть <strong>«Відключити»</strong> і підтвердьте.</li>
</ol>
<p>Ми відкличемо токен на боці платформи (де є така можливість) і видалимо токени, статистику та публікації цього акаунта.</p>

<h2>Спосіб 2. Видалити акаунт і всі дані</h2>
<ol>
  <li>Увійдіть у кабінет → «Налаштування».</li>
  <li>Натисніть <strong>«Видалити акаунт і всі дані»</strong> та підтвердьте.</li>
</ol>
<p>Ми відкличемо доступ на всіх платформах і видалимо профіль, токени, статистику й публікації.</p>

<h2>Спосіб 3. Через налаштування платформи</h2>
<ul>
  <li><strong>Facebook / Instagram:</strong> Налаштування → ${ext('https://www.facebook.com/settings?tab=business_tools', 'Бізнес-інтеграції')} → ${A} → «Видалити». Ми автоматично отримаємо сповіщення від Meta і видалимо дані. Якщо ви надіслали запит на видалення через Facebook, ви отримаєте посилання на цю сторінку з кодом — за ним видно статус запиту.</li>
  <li><strong>Threads:</strong> Налаштування → Акаунт → Вебсайти та застосунки → ${A} → «Видалити».</li>
  <li><strong>Google / YouTube:</strong> ${ext('https://myaccount.google.com/permissions', 'myaccount.google.com/permissions')} → ${A} → «Видалити доступ».</li>
  <li><strong>TikTok:</strong> Налаштування та конфіденційність → Безпека → Керування дозволами застосунків.</li>
  <li><strong>Telegram:</strong> видаліть ${esc(botLabel('uk', 'acc'))} з адміністраторів каналу.</li>
</ul>
<p>Після відкликання доступу на боці платформи (крім Meta, де ми отримуємо сповіщення автоматично) збір зупиняється, а підключення позначається «Потрібно перепідключити». Щоб видалити вже зібрану статистику, скористайтеся способом 1 або 2.</p>

<h2>Спосіб 4. Листом</h2>
<p>Напишіть на ${MAIL} з адреси, з якою ви входите в ${A}, з темою «Видалення даних». Ми підтвердимо видалення у відповідь протягом 7 днів.</p>

<h2>Що саме видаляється</h2>
<ul>
  <li>зашифровані токени доступу;</li>
  <li>щоденна статистика і дані публікацій;</li>
  <li>записи підключень;</li>
  <li>при видаленні акаунта — профіль і обліковий запис входу.</li>
</ul>
<p>Технічні журнали без особистих даних автоматично видаляються протягом 30 днів.</p>
<p>Якщо ви відкликали доступ на боці платформи і не підключили акаунт знову, вже зібрані дані цієї платформи видаляються автоматично через ${STALE_DATA_DAYS} днів без оновлення.</p>
<p class="faint">English version: <a href="/en/data-deletion">Data Deletion (English)</a>.</p>`;
  }
  return `
<h1>Data Deletion</h1>
<p class="updated">Last updated: ${date}</p>
<p>You can revoke ${A}'s access to your accounts and delete all your data at any time. We complete deletion <strong>within 7 days</strong> (usually immediately).</p>
<div id="deletion-status"></div>

<h2>Option 1. Disconnect a single platform</h2>
<ol>
  <li>Sign in to your <a href="/en/login">dashboard</a>.</li>
  <li>Open “My platforms”.</li>
  <li>Next to the account, click <strong>“Disconnect”</strong> and confirm.</li>
</ol>
<p>We revoke the token on the platform side (where supported) and delete that account's tokens, statistics and posts.</p>

<h2>Option 2. Delete your account and all data</h2>
<ol>
  <li>Sign in → “Settings”.</li>
  <li>Click <strong>“Delete account and all data”</strong> and confirm.</li>
</ol>
<p>We revoke access on all platforms and delete your profile, tokens, statistics and posts.</p>

<h2>Option 3. Via the platform's settings</h2>
<ul>
  <li><strong>Facebook / Instagram:</strong> Settings → ${ext('https://www.facebook.com/settings?tab=business_tools', 'Business integrations')} → ${A} → “Remove”. We automatically receive a notification from Meta and delete the data. If you submitted a deletion request via Facebook, you will receive a link to this page with a confirmation code that shows the status of your request.</li>
  <li><strong>Threads:</strong> Settings → Account → Website permissions → ${A} → “Remove”.</li>
  <li><strong>Google / YouTube:</strong> ${ext('https://myaccount.google.com/permissions', 'myaccount.google.com/permissions')} → ${A} → “Remove access”.</li>
  <li><strong>TikTok:</strong> Settings and privacy → Security → Manage app permissions.</li>
  <li><strong>Telegram:</strong> remove ${esc(botLabel('en'))} from your channel administrators.</li>
</ul>
<p>After you revoke access on the platform side (except Meta, which notifies us automatically), collection stops and the connection is marked “Reconnect required”. To delete statistics already collected, use option 1 or 2.</p>

<h2>Option 4. By email</h2>
<p>Email ${MAIL} from the address you use to sign in to ${A} with the subject “Data deletion”. We will confirm deletion in reply within 7 days.</p>

<h2>What is deleted</h2>
<ul>
  <li>encrypted access tokens;</li>
  <li>daily statistics and post data;</li>
  <li>connection records;</li>
  <li>when deleting your account — your profile and sign-in account.</li>
</ul>
<p>Technical logs without personal data are automatically deleted within 30 days.</p>
<p>If you revoke access on the platform side and do not reconnect, the data already collected for that platform is deleted automatically after ${STALE_DATA_DAYS} days without a refresh.</p>
<p class="faint">Українська версія: <a href="/uk/data-deletion">Видалення даних (українською)</a>.</p>`;
}
