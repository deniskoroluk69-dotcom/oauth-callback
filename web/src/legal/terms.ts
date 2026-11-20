import { SITE } from '../config/site';
import type { Lang } from '../i18n';
import { fmtDate } from '../i18n';
import { esc } from '../lib/dom';
import { termsTable } from './platformRules';

const A = SITE.APP_NAME;
const C = esc(SITE.COMPANY);
const ADDR = SITE.ADDRESS ? esc(SITE.ADDRESS) : '';
const MAIL = `<a href="mailto:${esc(SITE.SUPPORT_EMAIL)}">${esc(SITE.SUPPORT_EMAIL)}</a>`;
const ext = (url: string, label = url) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const YT_SENTENCE = `By connecting a YouTube channel, you agree to be bound by the ${ext('https://www.youtube.com/t/terms', 'YouTube Terms of Service')}.`;

export function termsHtml(lang: Lang): string {
  const date = fmtDate(SITE.LEGAL_UPDATED, { day: 'numeric', month: 'long', year: 'numeric' });
  return lang === 'uk' ? uk(date) : en(date);
}

function uk(date: string): string {
  return `
<h1>Умови використання</h1>
<p class="updated">Оновлено: ${date}</p>
<p>Ці Умови регулюють використання сервісу <strong>${A}</strong> (далі — «Сервіс»), який надає ${C}${ADDR ? ` (${ADDR})` : ''}. Створюючи акаунт або користуючись Сервісом, ви погоджуєтеся з цими Умовами та з <a href="/uk/privacy">Політикою конфіденційності</a>.</p>

<h2>1. Опис Сервісу</h2>
<p>Сервіс дозволяє підключити ваші власні акаунти в YouTube, Facebook, Instagram, Threads, TikTok, LinkedIn, Telegram і подкаст (RSS) та переглядати їхню статистику в одному кабінеті. Сервіс <strong>лише читає</strong> статистику за наданими вами правами й нічого не публікує, не видаляє і не змінює у ваших акаунтах.</p>

<h2>2. Акаунт</h2>
<ul>
  <li>Вам має бути щонайменше 16 років (або більше, якщо цього вимагають правила підключеної платформи).</li>
  <li>Ви відповідаєте за збереження доступу до свого акаунта й за дії, виконані з нього.</li>
  <li>Вказуйте правдиву адресу пошти — на неї надходять службові повідомлення.</li>
</ul>

<h2>3. Підключення платформ</h2>
<ul>
  <li>Підключайте <strong>лише власні канали або ті, якими ви уповноважені керувати</strong> (наприклад, як адміністратор Сторінки компанії).</li>
  <li>Підключаючи платформу, ви дозволяєте Сервісу отримувати статистику за правами, які показала платформа на своїй сторінці дозволу. Відкликати дозвіл можна будь-коли в кабінеті або в налаштуваннях платформи.</li>
  <li>Доступність даних залежить від API платформ, які можуть змінюватися, обмежуватися чи припинятися без нашого контролю.</li>
</ul>

<h2>4. Умови сторонніх платформ</h2>
<p>Використовуючи функції, пов'язані з певною платформою, ви також погоджуєтеся з її правилами:</p>
<blockquote lang="en">${YT_SENTENCE}</blockquote>
<p>Тобто: підключаючи канал YouTube, ви погоджуєтеся дотримуватися Умов використання YouTube. Для кожної платформи діють її власні умови, а ми як розробник дотримуємось її правил для застосунків:</p>
${termsTable('uk')}
<p>Як ми виконуємо правила кожної платформи (зберігання, видалення, відкликання доступу), описано в <a href="/uk/privacy">Політиці конфіденційності</a>.</p>

<h2>5. Заборонене використання</h2>
<p>Заборонено:</p>
<ul>
  <li>підключати чужі акаунти без дозволу їхнього власника;</li>
  <li>намагатися отримати доступ до даних інших користувачів, обходити обмеження чи захист Сервісу;</li>
  <li>здійснювати автоматизовані масові запити, навантажувальні атаки, розбирати чи копіювати Сервіс;</li>
  <li>використовувати Сервіс з порушенням закону або правил підключених платформ;</li>
  <li>перепродавати доступ до Сервісу без письмової згоди ${C}.</li>
</ul>

<h2>6. Дані та конфіденційність</h2>
<p>Як ми збираємо, використовуємо, зберігаємо й видаляємо дані, описано в <a href="/uk/privacy">Політиці конфіденційності</a>. Ваші дані належать вам; ви можете видалити їх у будь-який момент (див. <a href="/uk/data-deletion">Видалення даних</a>).</p>

<h2>7. Вартість</h2>
<p>Наразі Сервіс надається безкоштовно. Про запровадження платних функцій ми повідомимо заздалегідь; без вашої явної згоди плата не стягуватиметься.</p>

<h2>8. Інтелектуальна власність</h2>
<p>Сервіс, його дизайн і програмний код належать ${C}. Назви та логотипи платформ належать їхнім власникам і використовуються лише для позначення джерела даних.</p>

<h2>9. Відмова від гарантій</h2>
<p>Сервіс надається <strong>«як є» (as is)</strong> і «як доступний». Ми докладаємо розумних зусиль для точності й безперервності роботи, але не гарантуємо, що Сервіс працюватиме без перерв чи помилок, або що дані платформ будуть повними й точними — вони надходять від сторонніх API.</p>

<h2>10. Обмеження відповідальності</h2>
<p>У межах, дозволених законом, ${C} не несе відповідальності за непрямі збитки, втрачену вигоду чи втрату даних, що виникли через використання або неможливість використання Сервісу, а також за дії чи збої сторонніх платформ.</p>

<h2>11. Припинення</h2>
<p>Ви можете будь-коли припинити користування Сервісом і видалити акаунт у налаштуваннях. Ми можемо призупинити або припинити доступ у разі порушення цих Умов чи вимог платформ, повідомивши вас, якщо це можливо. Після припинення ваші дані видаляються протягом 7 днів.</p>

<h2>12. Зміни Умов</h2>
<p>Ми можемо змінювати ці Умови. Про суттєві зміни повідомимо заздалегідь листом або в кабінеті. Продовження користування після набрання змінами чинності означає згоду з ними.</p>

<h2>13. Застосовне право</h2>
<p>Ці Умови регулюються правом ${esc(SITE.JURISDICTION_UK)}. Це не обмежує ваших прав як споживача за законодавством країни вашого проживання.</p>

<h2>14. Контакти</h2>
<p>${C}${ADDR ? `, ${ADDR}` : ''}. Пошта: ${MAIL}.</p>
<p class="faint">Англомовна версія: <a href="/en/terms">Terms of Service (English)</a>.</p>`;
}

function en(date: string): string {
  return `
<h1>Terms of Service</h1>
<p class="updated">Last updated: ${date}</p>
<p>These Terms govern your use of <strong>${A}</strong> (the “Service”), provided by ${C}${ADDR ? ` (${ADDR})` : ''}. By creating an account or using the Service you agree to these Terms and to our <a href="/en/privacy">Privacy Policy</a>.</p>

<h2>1. Description of the Service</h2>
<p>The Service lets you connect your own YouTube, Facebook, Instagram, Threads, TikTok, LinkedIn, Telegram and podcast (RSS) accounts and view their statistics in one dashboard. The Service <strong>only reads</strong> statistics using the permissions you grant and never posts, deletes or changes anything in your accounts.</p>

<h2>2. Your account</h2>
<ul>
  <li>You must be at least 16 years old (or older if the rules of a connected platform require it).</li>
  <li>You are responsible for keeping access to your account secure and for activity under it.</li>
  <li>Provide a valid email address — we send service notifications to it.</li>
</ul>

<h2>3. Connecting platforms</h2>
<ul>
  <li>Connect <strong>only channels you own or are authorised to manage</strong> (for example, as an administrator of a company Page).</li>
  <li>By connecting a platform you allow the Service to retrieve statistics under the permissions the platform showed on its consent screen. You can revoke this at any time in your dashboard or in the platform's settings.</li>
  <li>Data availability depends on platform APIs, which may change, be limited or discontinued outside our control.</li>
</ul>

<h2>4. Third-party platform terms</h2>
<p>When you use features related to a platform, you also agree to that platform's rules:</p>
<blockquote>${YT_SENTENCE}</blockquote>
<p>Each platform's own terms apply, and as a developer we comply with its rules for apps:</p>
${termsTable('en')}
<p>How we meet each platform's rules (storage, deletion, revoking access) is described in our <a href="/en/privacy">Privacy Policy</a>.</p>

<h2>5. Prohibited use</h2>
<p>You must not:</p>
<ul>
  <li>connect accounts that are not yours without their owner's permission;</li>
  <li>attempt to access other users' data or bypass limits or security of the Service;</li>
  <li>send automated bulk requests, perform load attacks, reverse-engineer or copy the Service;</li>
  <li>use the Service in violation of the law or of the connected platforms' rules;</li>
  <li>resell access to the Service without written consent of ${C}.</li>
</ul>

<h2>6. Data and privacy</h2>
<p>How we collect, use, store and delete data is described in our <a href="/en/privacy">Privacy Policy</a>. Your data belongs to you; you can delete it at any time (see <a href="/en/data-deletion">Data Deletion</a>).</p>

<h2>7. Fees</h2>
<p>The Service is currently free of charge. We will notify you in advance before introducing any paid features; you will never be charged without your explicit consent.</p>

<h2>8. Intellectual property</h2>
<p>The Service, its design and code belong to ${C}. Platform names and logos belong to their owners and are used only to indicate the data source.</p>

<h2>9. Disclaimer</h2>
<p>The Service is provided <strong>“as is”</strong> and “as available”. We make reasonable efforts to keep it accurate and available, but we do not guarantee that it will be uninterrupted or error-free, or that platform data will be complete and accurate — it comes from third-party APIs.</p>

<h2>10. Limitation of liability</h2>
<p>To the extent permitted by law, ${C} is not liable for indirect damages, lost profits or data loss arising from the use of or inability to use the Service, or for actions or outages of third-party platforms.</p>

<h2>11. Termination</h2>
<p>You may stop using the Service and delete your account in Settings at any time. We may suspend or terminate access if you breach these Terms or platform requirements, notifying you where possible. After termination your data is deleted within 7 days.</p>

<h2>12. Changes to these Terms</h2>
<p>We may change these Terms. We will notify you of material changes in advance by email or in your dashboard. Continuing to use the Service after changes take effect means you accept them.</p>

<h2>13. Governing law</h2>
<p>These Terms are governed by the laws of ${esc(SITE.JURISDICTION_EN)}. This does not limit your rights as a consumer under the laws of your country of residence.</p>

<h2>14. Contact</h2>
<p>${C}${ADDR ? `, ${ADDR}` : ''}. Email: ${MAIL}.</p>
<p class="faint">Ukrainian version: <a href="/uk/terms">Умови використання (українською)</a>.</p>`;
}
