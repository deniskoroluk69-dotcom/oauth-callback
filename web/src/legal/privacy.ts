import { SITE } from '../config/site';
import type { Lang } from '../i18n';
import { fmtDate } from '../i18n';
import { esc } from '../lib/dom';
import { STALE_DATA_DAYS, rulesBlock } from './platformRules';

const A = SITE.APP_NAME;
const C = esc(SITE.COMPANY);
const ADDR = SITE.ADDRESS ? esc(SITE.ADDRESS) : '';
const MAIL = `<a href="mailto:${esc(SITE.SUPPORT_EMAIL)}">${esc(SITE.SUPPORT_EMAIL)}</a>`;
const ext = (url: string, label = url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const LIMITED_USE = `${A}' use and transfer of information received from Google APIs adheres to the ${ext('https://developers.google.com/terms/api-services-user-data-policy', 'Google API Services User Data Policy')}, including the Limited Use requirements.`;

function table(head: string[], rows: string[][]): string {
  return `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map((r) => `<tr>${r.map((c) => `<td>${c}</td>`).join('')}</tr>`)
    .join('')}</tbody></table></div>`;
}

function toc(items: [string, string][]): string {
  return `<nav class="toc" aria-label="TOC"><strong>${items.length ? '' : ''}</strong><ol>${items.map(([id, l]) => `<li><a href="#${id}">${l}</a></li>`).join('')}</ol></nav>`;
}

export function privacyHtml(lang: Lang): string {
  const date = fmtDate(SITE.LEGAL_UPDATED, { day: 'numeric', month: 'long', year: 'numeric' });
  return lang === 'uk' ? uk(date) : en(date);
}

/* ======================================================================= */
function uk(date: string): string {
  const H = ['Право (scope)', 'Що читаємо', 'Для чого'];
  return `
<h1>Політика конфіденційності</h1>
<p class="updated">Оновлено: ${date}</p>
<p>Ця політика пояснює, які дані збирає сервіс <strong>${A}</strong> (далі — «Сервіс», «ми»), навіщо, як ми їх зберігаємо і як ви можете відкликати доступ та видалити свої дані. Коротко: <strong>ми лише читаємо статистику ваших власних каналів, нічого не публікуємо, не продаємо дані й не використовуємо їх для реклами.</strong></p>
${toc([
  ['owner', 'Хто ми'],
  ['collect', 'Які дані ми збираємо'],
  ['use', 'Як ми використовуємо дані'],
  ['not', 'Чого ми не робимо'],
  ['google', 'Google / YouTube'],
  ['meta', 'Meta: Facebook та Instagram'],
  ['threads', 'Threads'],
  ['tiktok', 'TikTok'],
  ['telegram', 'Telegram'],
  ['storage', 'Зберігання та безпека'],
  ['retention', 'Строки зберігання'],
  ['revoke', 'Відкликання доступу та видалення'],
  ['rights', 'Ваші права'],
  ['cookies', 'Файли cookie та локальне сховище'],
  ['children', 'Діти'],
  ['changes', 'Зміни політики'],
  ['contact', 'Контакти'],
])}

<h2 id="owner">1. Хто ми</h2>
<p>Власник і контролер даних: <strong>${C}</strong>${ADDR ? `, адреса: ${ADDR}` : ''}. Пошта для питань щодо даних: ${MAIL}.</p>

<h2 id="collect">2. Які дані ми збираємо</h2>
<h3>2.1. Дані облікового запису</h3>
<ul>
  <li>Адреса електронної пошти, ім'я (якщо передає Google), унікальний ідентифікатор користувача — для входу (Firebase Authentication).</li>
  <li>Налаштування: мова, тема, пошта для сповіщень.</li>
  <li>Повідомлення, які ви надсилаєте через форму контактів (ім'я, пошта, текст).</li>
</ul>
<h3>2.2. Дані підключених платформ</h3>
<p>Коли ви підключаєте платформу, вона на своїй сторінці показує перелік прав і просить вашого дозволу. Ми запитуємо <strong>лише права на читання</strong>. Отримуємо:</p>
<ul>
  <li><strong>Токени доступу</strong> (access / refresh tokens) — щоб щодня отримувати статистику без вашої участі. Зберігаються лише на сервері в зашифрованому вигляді, ніколи не передаються у браузер.</li>
  <li><strong>Ідентифікатор і назва акаунта / сторінки / каналу</strong>, посилання на нього та аватар — щоб показати, що саме підключено.</li>
  <li><strong>Агреговані показники</strong>: кількість підписників, перегляди, охоплення, покази, взаємодії (вподобання, коментарі, поширення), час перегляду — за днями.</li>
  <li><strong>Публікації</strong>: ідентифікатор, назва або перші рядки тексту, посилання на оригінал, мініатюра, дата і показники цієї публікації.</li>
</ul>
<p>Ми <strong>не</strong> отримуємо паролі від платформ, особисті повідомлення, списки ваших підписників чи персональні дані ваших глядачів — лише агреговану статистику.</p>

<h2 id="use">3. Як ми використовуємо дані</h2>
<ul>
  <li>Показати вам статистику ваших каналів у кабінеті: графіки, порівняння періодів, топ публікацій.</li>
  <li>Щодня автоматично оновлювати статистику та продовжувати доступ (оновлювати токени).</li>
  <li>Надсилати службові листи: «підключіть платформу знову», коли доступ закінчується, та відповіді на ваші звернення.</li>
  <li>Забезпечувати безпеку й стабільність Сервісу (захист від зловживань, діагностика помилок без вмісту токенів).</li>
</ul>
<p>Правові підстави (GDPR): виконання договору — надання Сервісу (ст. 6(1)(b)); ваша згода — на підключення кожної платформи (ст. 6(1)(a)), яку можна відкликати будь-коли; законний інтерес — безпека Сервісу (ст. 6(1)(f)).</p>

<h2 id="not">4. Чого ми не робимо</h2>
<ul>
  <li>Не публікуємо, не видаляємо й не змінюємо нічого у ваших акаунтах.</li>
  <li>Не продаємо і не здаємо в оренду ваші дані.</li>
  <li>Не використовуємо дані для реклами, ретаргетингу чи профілювання.</li>
  <li>Не використовуємо дані платформ для навчання моделей штучного інтелекту.</li>
  <li>Не передаємо дані третім особам, крім постачальника хостингу — <strong>Google Cloud / Firebase</strong> (Google Ireland Ltd.), який обробляє дані лише за нашим дорученням. Виняток — якщо цього вимагає закон.</li>
  <li>Люди з нашої команди не переглядають ваші дані, крім випадків, коли ви самі просите про допомогу, це потрібно для безпеки або цього вимагає закон.</li>
</ul>

<h2 id="google">5. Google / YouTube</h2>
<p>Сервіс використовує YouTube API Services. Права, які ми запитуємо через Google OAuth:</p>
${table(H, [
  ['<code>youtube.readonly</code>', 'Назва, ID, аватар каналу; кількість підписників; список і показники ваших відео', 'Показати, який канал підключено, і топ відео'],
  ['<code>yt-analytics.readonly</code>', 'Звіти YouTube Analytics за днями: перегляди, час перегляду, нові/втрачені підписники, вподобання, коментарі, поширення; Shorts / довгі відео', 'Графіки по днях і порівняння періодів'],
])}
<blockquote lang="en">${LIMITED_USE}</blockquote>
<p>Зокрема, ми використовуємо дані Google лише для показу вам вашої статистики, не передаємо їх третім особам (крім хостингу), не використовуємо для реклами й не дозволяємо людям читати їх без вашої згоди.</p>
<p>Використовуючи YouTube-функції, ви також погоджуєтеся з ${ext('https://www.youtube.com/t/terms', 'Умовами використання YouTube')}. Як Google обробляє дані: ${ext('https://policies.google.com/privacy', 'Політика конфіденційності Google')}. Відкликати доступ можна будь-коли на сторінці ${ext('https://myaccount.google.com/permissions', 'myaccount.google.com/permissions')} або кнопкою «Відключити» в кабінеті. Дані YouTube оновлюються щодня; якщо ви відкликаєте доступ, ми видаляємо збережені дані протягом 7 днів.</p>

${rulesBlock('youtube', 'uk')}

<h2 id="meta">6. Meta: Facebook та Instagram</h2>
${table(H, [
  ['<code>pages_show_list</code>', 'Перелік Сторінок Facebook, якими ви керуєте', 'Дати вам вибрати Сторінки для підключення'],
  ['<code>pages_read_engagement</code>', 'Дописи Сторінки та їхні реакції, коментарі, поширення; кількість підписників', 'Топ публікацій і показники взаємодій'],
  ['<code>read_insights</code>', 'Insights Сторінки за днями: охоплення, покази, нові підписники, перегляди', 'Графіки по днях'],
  ['<code>instagram_basic</code>', 'ID, ім\'я профілю Instagram Business/Creator, кількість підписників, список медіа', 'Показати підключений профіль і публікації'],
  ['<code>instagram_manage_insights</code>', 'Insights профілю та медіа: охоплення, перегляди, взаємодії, нові підписники; рілси / дописи', 'Графіки і топ публікацій'],
  ['<code>business_management</code>', 'Лише якщо Сторінка належить бізнес-портфоліо: перелік активів портфоліо', 'Знайти Сторінки, що керуються через Business Manager (запитується тільки коли потрібно)'],
])}
<p>Відкликати доступ: кнопка «Відключити» в кабінеті або Facebook → Налаштування → ${ext('https://www.facebook.com/settings?tab=business_tools', 'Бізнес-інтеграції')}. Коли ви видаляєте застосунок у Facebook, ми отримуємо сповіщення й автоматично видаляємо токени та дані. Ви також можете надіслати запит на видалення через Facebook — статус запиту можна перевірити на сторінці <a href="/uk/data-deletion">Видалення даних</a>.</p>

${rulesBlock('meta', 'uk')}

<h2 id="threads">7. Threads</h2>
${table(H, [
  ['<code>threads_basic</code>', 'ID, ім\'я профілю, аватар; список ваших дописів', 'Показати підключений профіль і дописи'],
  ['<code>threads_manage_insights</code>', 'Перегляди, вподобання, відповіді, репости, цитування, кількість підписників', 'Графіки і топ дописів'],
])}
<p>Відкликати доступ: кабінет або Threads → Налаштування → Акаунт → Вебсайти та застосунки.</p>

${rulesBlock('threads', 'uk')}

<h2 id="tiktok">8. TikTok</h2>
${table(H, [
  ['<code>user.info.basic</code>', 'open_id, відображуване ім\'я, аватар', 'Показати підключений акаунт'],
  ['<code>user.info.profile</code>', 'Посилання на профіль, біо, ознака верифікації', 'Посилання на профіль у кабінеті'],
  ['<code>user.info.stats</code>', 'Кількість підписників, вподобань, відео', 'Динаміка підписників і вподобань'],
  ['<code>video.list</code>', 'Список ваших публічних відео: назва, посилання, обкладинка, перегляди, вподобання, коментарі, поширення', 'Топ відео та сумарні перегляди'],
])}
<p>Відкликати доступ: кабінет або TikTok → Налаштування та конфіденційність → Безпека → Керування дозволами застосунків.</p>

${rulesBlock('tiktok', 'uk')}

<h2 id="telegram">9. Telegram</h2>
<p>Telegram підключається без OAuth: ви додаєте нашого бота адміністратором свого каналу <strong>без прав на публікацію</strong>. Бот читає: назву та @username каналу, кількість підписників (щодня) і нові дописи каналу (текст перших рядків, дата, посилання). Щоб відключити — видаліть бота з адміністраторів або натисніть «Відключити» в кабінеті.</p>

${rulesBlock('telegram', 'uk')}

<h2 id="storage">10. Зберігання та безпека</h2>
<ul>
  <li>Дані зберігаються в Google Cloud / Firebase (Firestore, Cloud Functions) у регіоні <strong>europe-west1 (Бельгія, ЄС)</strong>.</li>
  <li>Токени доступу шифруються на сервері за схемою envelope encryption: кожен набір токенів шифрується окремим ключем AES-256-GCM, який, у свою чергу, зашифрований ключем у Google Cloud KMS. Колекція з токенами повністю закрита для доступу з браузера.</li>
  <li>Усі з'єднання — лише HTTPS (TLS), з HSTS і суворою політикою безпеки вмісту.</li>
  <li>Доступ службових акаунтів обмежено мінімально необхідними ролями; токени й ключі ніколи не записуються в журнали.</li>
  <li>Google як постачальник хостингу може обробляти дані за межами ЄС; такі передачі захищені стандартними договірними положеннями ЄС (SCC) згідно з умовами обробки даних Google Cloud.</li>
</ul>

<h2 id="retention">11. Строки зберігання</h2>
${table(['Дані', 'Скільки зберігаємо'], [
  ['Токени доступу', 'Доки платформа підключена. Видаляються одразу після відключення.'],
  ['Статистика й публікації', 'Доки існує ваш акаунт або доки підключена платформа.'],
  ['Дані облікового запису', 'Доки ви не видалите акаунт.'],
  ['Повідомлення з форми контактів', 'До 12 місяців.'],
  ['Технічні журнали (без токенів)', 'До 30 днів.'],
  ['Дані, які не вдалося оновити (напр. доступ відкликано)', `Видаляються автоматично через ${STALE_DATA_DAYS} днів без оновлення.`],
])}
<p>Після відключення платформи, видалення акаунта або запиту на видалення ми видаляємо відповідні дані <strong>протягом 7 днів</strong> (зазвичай — одразу).</p>

<h2 id="revoke">12. Відкликання доступу та видалення даних</h2>
<ul>
  <li><strong>У кабінеті:</strong> «Мої платформи» → «Відключити» — ми відкликаємо токен на платформі (де є така можливість) і видаляємо токени та статистику цієї платформи.</li>
  <li><strong>Увесь акаунт:</strong> «Налаштування» → «Видалити акаунт і всі дані».</li>
  <li><strong>На боці платформи:</strong> ${ext('https://myaccount.google.com/permissions', 'Google')}, ${ext('https://www.facebook.com/settings?tab=business_tools', 'Facebook / Instagram')}, ${ext('https://www.threads.net/settings/account', 'Threads')}, ${ext('https://www.tiktok.com/setting/security', 'TikTok')}.</li>
  <li><strong>Сторінка</strong> <a href="/uk/data-deletion">Видалення даних</a> або лист на ${MAIL}.</li>
</ul>
<p>Строк виконання — до 7 днів.</p>

<h2 id="rights">13. Ваші права</h2>
<p>Відповідно до GDPR і Закону України «Про захист персональних даних» ви маєте право: отримати доступ до своїх даних і їхню копію; виправити неточні дані; видалити дані; обмежити обробку чи заперечити проти неї; на перенесення даних; відкликати згоду в будь-який момент; подати скаргу до наглядового органу (в Україні — Уповноважений Верховної Ради з прав людини; в ЄС — орган захисту даних вашої країни). Щоб скористатися правами, напишіть на ${MAIL} — ми відповімо протягом 30 днів.</p>

<h2 id="cookies">14. Файли cookie та локальне сховище</h2>
<p>Ми не використовуємо рекламні чи аналітичні cookie. Використовуємо лише необхідне: сесію входу Firebase (локальне сховище браузера), збережені мову й тему, службовий cookie <code>__session</code> на 10 хвилин під час підключення платформи (захист від підробки запитів), а також Firebase App Check / reCAPTCHA для захисту форм від спаму.</p>

<h2 id="children">15. Діти</h2>
<p>Сервіс не призначений для осіб, молодших за 16 років, і ми свідомо не збираємо їхні дані.</p>

<h2 id="changes">16. Зміни політики</h2>
<p>Ми можемо оновлювати цю політику. Дата «Оновлено» вгорі показує останню редакцію. Про суттєві зміни повідомимо листом або в кабінеті заздалегідь.</p>

<h2 id="contact">17. Контакти</h2>
<p>${C}${ADDR ? `, ${ADDR}` : ''}. Пошта: ${MAIL}. Також можна скористатися <a href="/uk/contact">формою контактів</a>.</p>
<p class="faint">Англомовна версія: <a href="/en/privacy">Privacy Policy (English)</a>.</p>`;
}

/* ======================================================================= */
function en(date: string): string {
  const H = ['Permission (scope)', 'What we read', 'Why'];
  return `
<h1>Privacy Policy</h1>
<p class="updated">Last updated: ${date}</p>
<p>This policy explains what data <strong>${A}</strong> (the “Service”, “we”) collects, why, how we store it, and how you can revoke access and delete your data. In short: <strong>we only read statistics of your own channels, never post anything, never sell your data and never use it for advertising.</strong></p>
${toc([
  ['owner', 'Who we are'],
  ['collect', 'Data we collect'],
  ['use', 'How we use data'],
  ['not', 'What we never do'],
  ['google', 'Google / YouTube'],
  ['meta', 'Meta: Facebook and Instagram'],
  ['threads', 'Threads'],
  ['tiktok', 'TikTok'],
  ['telegram', 'Telegram'],
  ['storage', 'Storage and security'],
  ['retention', 'Retention'],
  ['revoke', 'Revoking access and deleting data'],
  ['rights', 'Your rights'],
  ['cookies', 'Cookies and local storage'],
  ['children', 'Children'],
  ['changes', 'Changes to this policy'],
  ['contact', 'Contact'],
])}

<h2 id="owner">1. Who we are</h2>
<p>Owner and data controller: <strong>${C}</strong>${ADDR ? `, address: ${ADDR}` : ''}. Contact for data questions: ${MAIL}.</p>

<h2 id="collect">2. Data we collect</h2>
<h3>2.1. Account data</h3>
<ul>
  <li>Email address, name (if provided by Google) and a unique user ID — to sign you in (Firebase Authentication).</li>
  <li>Preferences: language, theme, notification email.</li>
  <li>Messages you send via the contact form (name, email, text).</li>
</ul>
<h3>2.2. Data from connected platforms</h3>
<p>When you connect a platform, the platform shows you the list of permissions on its own page and asks for your consent. We request <strong>read-only permissions only</strong>. We receive:</p>
<ul>
  <li><strong>Access tokens</strong> (access / refresh tokens) — to fetch statistics daily without your involvement. They are stored only on the server, encrypted, and never sent to the browser.</li>
  <li><strong>Account / page / channel ID and name</strong>, its link and avatar — to show what exactly is connected.</li>
  <li><strong>Aggregated metrics</strong>: followers, views, reach, impressions, engagements (likes, comments, shares), watch time — per day.</li>
  <li><strong>Posts</strong>: ID, title or first lines of text, link to the original, thumbnail, date and the metrics of that post.</li>
</ul>
<p>We do <strong>not</strong> receive your platform passwords, private messages, lists of your followers or personal data of your audience — only aggregated statistics.</p>

<h2 id="use">3. How we use data</h2>
<ul>
  <li>To show you statistics of your channels in your dashboard: charts, period comparison, top posts.</li>
  <li>To refresh statistics automatically every day and keep access valid (token refresh).</li>
  <li>To send service emails: “please reconnect the platform” when access is about to expire, and replies to your requests.</li>
  <li>To keep the Service secure and stable (abuse prevention, error diagnostics without token contents).</li>
</ul>
<p>Legal bases (GDPR): performance of a contract — providing the Service (Art. 6(1)(b)); your consent — for connecting each platform (Art. 6(1)(a)), which you can withdraw at any time; legitimate interest — security of the Service (Art. 6(1)(f)).</p>

<h2 id="not">4. What we never do</h2>
<ul>
  <li>We never post, delete or change anything in your accounts.</li>
  <li>We never sell or rent your data.</li>
  <li>We never use your data for advertising, retargeting or profiling.</li>
  <li>We never use platform data to train artificial intelligence models.</li>
  <li>We never share data with third parties except our hosting provider — <strong>Google Cloud / Firebase</strong> (Google Ireland Ltd.), which processes data only on our instructions — unless required by law.</li>
  <li>No member of our team reads your data unless you ask us for help, it is necessary for security purposes, or it is required by law.</li>
</ul>

<h2 id="google">5. Google / YouTube</h2>
<p>The Service uses YouTube API Services. Permissions we request via Google OAuth:</p>
${table(H, [
  ['<code>youtube.readonly</code>', 'Channel name, ID, avatar; subscriber count; list and metrics of your videos', 'Show which channel is connected and your top videos'],
  ['<code>yt-analytics.readonly</code>', 'Daily YouTube Analytics reports: views, watch time, subscribers gained/lost, likes, comments, shares; Shorts / long-form', 'Daily charts and period comparison'],
])}
<blockquote>${LIMITED_USE}</blockquote>
<p>In particular, we use Google user data only to show you your own statistics, we do not transfer it to third parties (except hosting), do not use it for advertising and do not allow humans to read it without your consent.</p>
<p>By using YouTube features you also agree to the ${ext('https://www.youtube.com/t/terms', 'YouTube Terms of Service')}. How Google handles data: ${ext('https://policies.google.com/privacy', 'Google Privacy Policy')}. You can revoke access at any time at ${ext('https://myaccount.google.com/permissions', 'myaccount.google.com/permissions')} or with the “Disconnect” button in your dashboard. YouTube data is refreshed daily; if you revoke access, we delete stored data within 7 days.</p>

${rulesBlock('youtube', 'en')}

<h2 id="meta">6. Meta: Facebook and Instagram</h2>
${table(H, [
  ['<code>pages_show_list</code>', 'List of Facebook Pages you manage', 'Let you choose which Pages to connect'],
  ['<code>pages_read_engagement</code>', 'Page posts and their reactions, comments, shares; follower count', 'Top posts and engagement metrics'],
  ['<code>read_insights</code>', 'Daily Page Insights: reach, impressions, new followers, views', 'Daily charts'],
  ['<code>instagram_basic</code>', 'Instagram Business/Creator account ID, username, follower count, media list', 'Show the connected profile and its posts'],
  ['<code>instagram_manage_insights</code>', 'Account and media insights: reach, views, engagements, new followers; reels / posts', 'Charts and top posts'],
  ['<code>business_management</code>', 'Only if a Page belongs to a business portfolio: list of portfolio assets', 'Find Pages managed via Business Manager (requested only when needed)'],
])}
<p>Revoke access: the “Disconnect” button in your dashboard or Facebook → Settings → ${ext('https://www.facebook.com/settings?tab=business_tools', 'Business integrations')}. When you remove the app on Facebook, we receive a notification and automatically delete tokens and data. You can also submit a data deletion request via Facebook — check its status on the <a href="/en/data-deletion">Data Deletion</a> page.</p>

${rulesBlock('meta', 'en')}

<h2 id="threads">7. Threads</h2>
${table(H, [
  ['<code>threads_basic</code>', 'Profile ID, username, avatar; list of your posts', 'Show the connected profile and posts'],
  ['<code>threads_manage_insights</code>', 'Views, likes, replies, reposts, quotes, follower count', 'Charts and top posts'],
])}
<p>Revoke access: your dashboard or Threads → Settings → Account → Website permissions.</p>

${rulesBlock('threads', 'en')}

<h2 id="tiktok">8. TikTok</h2>
${table(H, [
  ['<code>user.info.basic</code>', 'open_id, display name, avatar', 'Show the connected account'],
  ['<code>user.info.profile</code>', 'Profile link, bio, verification status', 'Profile link in the dashboard'],
  ['<code>user.info.stats</code>', 'Follower, like and video counts', 'Follower and like trends'],
  ['<code>video.list</code>', 'Your public videos: title, link, cover, views, likes, comments, shares', 'Top videos and total views'],
])}
<p>Revoke access: your dashboard or TikTok → Settings and privacy → Security → Manage app permissions.</p>

${rulesBlock('tiktok', 'en')}

<h2 id="telegram">9. Telegram</h2>
<p>Telegram is connected without OAuth: you add our bot as an administrator of your channel <strong>with no posting rights</strong>. The bot reads: channel title and @username, subscriber count (daily) and new channel posts (first lines of text, date, link). To disconnect, remove the bot from administrators or click “Disconnect” in your dashboard.</p>

${rulesBlock('telegram', 'en')}

<h2 id="storage">10. Storage and security</h2>
<ul>
  <li>Data is stored in Google Cloud / Firebase (Firestore, Cloud Functions) in the <strong>europe-west1 (Belgium, EU)</strong> region.</li>
  <li>Access tokens are encrypted on the server using envelope encryption: each token set is encrypted with its own AES-256-GCM key, which in turn is encrypted with a key in Google Cloud KMS. The token collection is completely closed to browser access.</li>
  <li>All connections use HTTPS (TLS) only, with HSTS and a strict Content Security Policy.</li>
  <li>Service accounts have the minimum necessary roles; tokens and keys are never written to logs.</li>
  <li>As our hosting provider, Google may process data outside the EU; such transfers are protected by the EU Standard Contractual Clauses (SCCs) under the Google Cloud data processing terms.</li>
</ul>

<h2 id="retention">11. Retention</h2>
${table(['Data', 'How long we keep it'], [
  ['Access tokens', 'While the platform is connected. Deleted immediately on disconnect.'],
  ['Statistics and posts', 'While your account exists or while the platform is connected.'],
  ['Account data', 'Until you delete your account.'],
  ['Contact form messages', 'Up to 12 months.'],
  ['Technical logs (no tokens)', 'Up to 30 days.'],
  ['Data that could not be refreshed (e.g. access revoked)', `Deleted automatically after ${STALE_DATA_DAYS} days without a refresh.`],
])}
<p>After you disconnect a platform, delete your account or submit a deletion request, we delete the relevant data <strong>within 7 days</strong> (usually immediately).</p>

<h2 id="revoke">12. Revoking access and deleting data</h2>
<ul>
  <li><strong>In your dashboard:</strong> “My platforms” → “Disconnect” — we revoke the token on the platform (where supported) and delete that platform's tokens and statistics.</li>
  <li><strong>Whole account:</strong> “Settings” → “Delete account and all data”.</li>
  <li><strong>On the platform side:</strong> ${ext('https://myaccount.google.com/permissions', 'Google')}, ${ext('https://www.facebook.com/settings?tab=business_tools', 'Facebook / Instagram')}, ${ext('https://www.threads.net/settings/account', 'Threads')}, ${ext('https://www.tiktok.com/setting/security', 'TikTok')}.</li>
  <li><strong>The</strong> <a href="/en/data-deletion">Data Deletion</a> page or an email to ${MAIL}.</li>
</ul>
<p>Requests are completed within 7 days.</p>

<h2 id="rights">13. Your rights</h2>
<p>Under the GDPR and the Law of Ukraine “On Personal Data Protection” you have the right to: access your data and get a copy; rectify inaccurate data; erase your data; restrict or object to processing; data portability; withdraw consent at any time; lodge a complaint with a supervisory authority (in Ukraine — the Ukrainian Parliament Commissioner for Human Rights; in the EU — the data protection authority of your country). To exercise your rights, email ${MAIL} — we reply within 30 days.</p>

<h2 id="cookies">14. Cookies and local storage</h2>
<p>We do not use advertising or analytics cookies. We only use what is necessary: the Firebase sign-in session (browser local storage), your saved language and theme, a 10-minute service cookie <code>__session</code> while you connect a platform (cross-site request forgery protection), and Firebase App Check / reCAPTCHA to protect forms from spam.</p>

<h2 id="children">15. Children</h2>
<p>The Service is not intended for people under 16, and we do not knowingly collect their data.</p>

<h2 id="changes">16. Changes to this policy</h2>
<p>We may update this policy. The “Last updated” date at the top shows the latest version. We will notify you of material changes in advance by email or in your dashboard.</p>

<h2 id="contact">17. Contact</h2>
<p>${C}${ADDR ? `, ${ADDR}` : ''}. Email: ${MAIL}. You can also use the <a href="/en/contact">contact form</a>.</p>
<p class="faint">Ukrainian version: <a href="/uk/privacy">Політика конфіденційності (українською)</a>.</p>`;
}
