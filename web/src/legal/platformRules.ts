/**
 * Правила кожної платформи, яких дотримується сервіс: офіційні документи,
 * правила зберігання й видалення, відкликання доступу.
 * Використовується в Privacy Policy (блок у розділі кожної платформи), Terms і Data deletion.
 *
 * Посилання перевірено 2026-11-19. Не вдалося перевірити автоматично (потрібен вхід):
 * Threads Supplemental Terms (help.instagram.com) і сторінку налаштувань LinkedIn —
 * перевірте їх вручну перед поданням.
 */
import { STALE_DATA_DAYS, type PlatformId } from '@platforms';
import { SITE, botLabel } from '../config/site';
import type { Lang } from '../i18n';
import { esc } from '../lib/dom';

const ext = (url: string, label: string) => `<a href="${url}" target="_blank" rel="noopener noreferrer">${label}</a>`;
const A = SITE.APP_NAME;

export { STALE_DATA_DAYS };

export const LINKS = {
  ytApiTerms: 'https://developers.google.com/youtube/terms/api-services-terms-of-service',
  ytDevPolicies: 'https://developers.google.com/youtube/terms/developer-policies',
  googleUserData: 'https://developers.google.com/terms/api-services-user-data-policy',
  ytTerms: 'https://www.youtube.com/t/terms',
  googlePrivacy: 'https://policies.google.com/privacy',
  googlePermissions: 'https://myaccount.google.com/permissions',
  metaPlatformTerms: 'https://developers.facebook.com/terms/',
  metaDevPolicies: 'https://developers.facebook.com/devpolicy/',
  metaPrivacy: 'https://www.facebook.com/privacy/policy/',
  metaTerms: 'https://www.facebook.com/terms',
  igTerms: 'https://help.instagram.com/581066165581870',
  metaBusinessIntegrations: 'https://www.facebook.com/settings?tab=business_tools',
  threadsTerms: 'https://help.instagram.com/769983657850450',
  tiktokDevTerms: 'https://www.tiktok.com/legal/tik-tok-developer-terms-of-service',
  tiktokTerms: 'https://www.tiktok.com/legal/terms-of-service',
  tiktokPrivacy: 'https://www.tiktok.com/legal/privacy-policy',
  linkedinApiTerms: 'https://www.linkedin.com/legal/l/api-terms-of-use',
  linkedinUserAgreement: 'https://www.linkedin.com/legal/user-agreement',
  linkedinPrivacy: 'https://www.linkedin.com/legal/privacy-policy',
  linkedinPermitted: 'https://www.linkedin.com/mypreferences/d/data-sharing-for-permitted-services',
  telegramBotTerms: 'https://telegram.org/tos/bot-developers',
  telegramTerms: 'https://telegram.org/tos',
  telegramPrivacy: 'https://telegram.org/privacy',
} as const;

type RulesPlatform = Exclude<PlatformId, 'facebook' | 'instagram'> | 'meta';

interface Rules {
  /** Документи для розробників, яких ми дотримуємось. */
  dev: [string, string][];
  /** Умови й політика платформи для користувачів. */
  user: [string, string][];
  /** Конкретні зобов'язання. */
  commitments: string[];
  /** Як відкликати доступ на боці платформи. */
  revoke: string;
}

function rules(p: RulesPlatform, lang: Lang): Rules {
  const uk = lang === 'uk';
  const days = STALE_DATA_DAYS;
  const common = uk
    ? [
        'Дані показуємо лише вам — власнику підключеного акаунта. Не продаємо, не передаємо й не використовуємо їх для реклами чи профілювання.',
        `Якщо дані не вдається оновити ${days} днів (наприклад, доступ відкликано), ми автоматично видаляємо їх.`,
        'Після «Відключити», видалення акаунта або запиту на видалення дані видаляються протягом 7 днів (зазвичай — одразу).',
      ]
    : [
        'Data is shown only to you, the owner of the connected account. We never sell or share it, or use it for advertising or profiling.',
        `If data cannot be refreshed for ${days} days (for example, because access was revoked), we delete it automatically.`,
        'After “Disconnect”, account deletion or a deletion request, data is deleted within 7 days (usually immediately).',
      ];

  switch (p) {
    case 'youtube':
      return {
        dev: [
          [LINKS.ytApiTerms, 'YouTube API Services Terms of Service'],
          [LINKS.ytDevPolicies, 'YouTube API Services Developer Policies'],
          [LINKS.googleUserData, 'Google API Services User Data Policy (Limited Use)'],
        ],
        user: [
          [LINKS.ytTerms, uk ? 'Умови використання YouTube' : 'YouTube Terms of Service'],
          [LINKS.googlePrivacy, uk ? 'Політика конфіденційності Google' : 'Google Privacy Policy'],
        ],
        commitments: [
          ...(uk
            ? [
                `${A} використовує YouTube API Services. Підключаючи канал, ви погоджуєтеся з Умовами використання YouTube.`,
                'Неопубліковані дані YouTube Analytics бачите лише ви; ми не показуємо їх іншим користувачам.',
                `Дані YouTube оновлюються щодня; дані, які не вдалося оновити ${days} днів, видаляються.`,
                'Біля кожного блоку з даними YouTube вказано джерело — YouTube.',
              ]
            : [
                `${A} uses YouTube API Services. By connecting a channel you agree to the YouTube Terms of Service.`,
                'Non-public YouTube Analytics data is visible only to you; we never show it to other users.',
                `YouTube data is refreshed daily; data that cannot be refreshed for ${days} days is deleted.`,
                'Every block with YouTube data is labelled with its source — YouTube.',
              ]),
          ...common.slice(0, 1),
          ...common.slice(2),
        ],
        revoke: uk
          ? `${ext(LINKS.googlePermissions, 'myaccount.google.com/permissions')} → ${A} → «Видалити доступ».`
          : `${ext(LINKS.googlePermissions, 'myaccount.google.com/permissions')} → ${A} → “Remove access”.`,
      };
    case 'meta':
      return {
        dev: [
          [LINKS.metaPlatformTerms, 'Meta Platform Terms'],
          [LINKS.metaDevPolicies, 'Meta Developer Policies'],
        ],
        user: [
          [LINKS.metaTerms, uk ? 'Умови Meta (Facebook)' : 'Meta Terms (Facebook)'],
          [LINKS.igTerms, uk ? 'Умови використання Instagram' : 'Instagram Terms of Use'],
          [LINKS.metaPrivacy, uk ? 'Політика конфіденційності Meta' : 'Meta Privacy Policy'],
        ],
        commitments: [
          ...(uk
            ? [
                'Дані платформи Meta використовуємо лише для показу вам статистики ваших Сторінок і профілів Instagram. Не передаємо їх брокерам даних, рекламним мережам чи для стеження.',
                'Коли ви видаляєте застосунок у Facebook, Meta надсилає нам сповіщення — ми автоматично видаляємо токени й дані.',
                'Запит на видалення через Facebook обробляється автоматично; статус можна перевірити на сторінці «Видалення даних» за кодом.',
                'Ми видаляємо дані Meta також на вимогу Meta.',
              ]
            : [
                'We use Meta Platform Data only to show you statistics of your own Pages and Instagram profiles. We never transfer it to data brokers or ad networks, or use it for surveillance.',
                'When you remove the app on Facebook, Meta notifies us and we automatically delete the tokens and data.',
                'Deletion requests sent via Facebook are processed automatically; check the status with your code on the Data Deletion page.',
                'We also delete Meta data whenever Meta requires us to.',
              ]),
          ...common,
        ],
        revoke: uk
          ? `Facebook → Налаштування → ${ext(LINKS.metaBusinessIntegrations, 'Бізнес-інтеграції')} → ${A} → «Видалити».`
          : `Facebook → Settings → ${ext(LINKS.metaBusinessIntegrations, 'Business integrations')} → ${A} → “Remove”.`,
      };
    case 'threads':
      return {
        dev: [
          [LINKS.metaPlatformTerms, 'Meta Platform Terms'],
          [LINKS.metaDevPolicies, 'Meta Developer Policies'],
        ],
        user: [
          [LINKS.threadsTerms, uk ? 'Додаткові умови Threads' : 'Threads Supplemental Terms of Use'],
          [LINKS.metaPrivacy, uk ? 'Політика конфіденційності Meta' : 'Meta Privacy Policy'],
        ],
        commitments: [
          ...(uk
            ? [
                'Коли ви видаляєте застосунок у налаштуваннях Threads або надсилаєте запит на видалення, ми отримуємо сповіщення й автоматично видаляємо токени та дані.',
                'Довгостроковий токен Threads продовжується автоматично; якщо продовжити не вдалося, надсилаємо лист «підключіть знову».',
              ]
            : [
                'When you remove the app in Threads settings or send a deletion request, we are notified and automatically delete the tokens and data.',
                'The long-lived Threads token is renewed automatically; if renewal fails, we email you to reconnect.',
              ]),
          ...common,
        ],
        revoke: uk ? `Threads → Налаштування → Акаунт → Вебсайти та застосунки → ${A} → «Видалити».` : `Threads → Settings → Account → Website permissions → ${A} → “Remove”.`,
      };
    case 'tiktok':
      return {
        dev: [[LINKS.tiktokDevTerms, 'TikTok Developer Terms of Service']],
        user: [
          [LINKS.tiktokTerms, uk ? 'Умови використання TikTok' : 'TikTok Terms of Service'],
          [LINKS.tiktokPrivacy, uk ? 'Політика конфіденційності TikTok' : 'TikTok Privacy Policy'],
        ],
        commitments: [
          ...(uk
            ? [
                'Отримуємо лише дані, дозволені на сторінці входу TikTok: профіль, лічильники підписників і вподобань, список ваших публічних відео з показниками.',
                'Ми не завантажуємо й не зберігаємо самі відео — лише назви, посилання, обкладинки й цифри.',
                'Під час «Відключити» ми відкликаємо токен через API TikTok.',
              ]
            : [
                'We only receive data you allow on the TikTok login screen: profile, follower and like counts, and the list of your public videos with their metrics.',
                'We never download or store the videos themselves — only titles, links, covers and numbers.',
                'On “Disconnect” we revoke the token via the TikTok API.',
              ]),
          ...common,
        ],
        revoke: uk ? 'TikTok → Профіль → Налаштування та конфіденційність → Безпека → Керування дозволами застосунків.' : 'TikTok → Profile → Settings and privacy → Security → Manage app permissions.',
      };
    case 'linkedin':
      return {
        dev: [[LINKS.linkedinApiTerms, 'LinkedIn API Terms of Use']],
        user: [
          [LINKS.linkedinUserAgreement, uk ? 'Угода користувача LinkedIn' : 'LinkedIn User Agreement'],
          [LINKS.linkedinPrivacy, uk ? 'Політика конфіденційності LinkedIn' : 'LinkedIn Privacy Policy'],
        ],
        commitments: [
          ...(uk
            ? [
                'Читаємо лише агреговану статистику Сторінок компаній, адміністратором яких ви є. Персональні дані окремих учасників LinkedIn не збираємо.',
                'З файлу експорту беремо лише денні показники; сам файл не зберігаємо.',
                'Під час «Відключити» ми відкликаємо токен через API LinkedIn.',
              ]
            : [
                'We only read aggregated statistics of company Pages you administer. We never collect personal data of individual LinkedIn members.',
                'From an export file we take only daily metrics; the file itself is not stored.',
                'On “Disconnect” we revoke the token via the LinkedIn API.',
              ]),
          ...common,
        ],
        revoke: uk
          ? `LinkedIn → Налаштування → Конфіденційність даних → ${ext(LINKS.linkedinPermitted, 'Дозволені сервіси')} → ${A} → «Видалити».`
          : `LinkedIn → Settings → Data privacy → ${ext(LINKS.linkedinPermitted, 'Permitted services')} → ${A} → “Remove”.`,
      };
    case 'telegram':
      return {
        dev: [[LINKS.telegramBotTerms, 'Telegram Bot Platform Developer Terms of Service']],
        user: [
          [LINKS.telegramTerms, uk ? 'Умови використання Telegram' : 'Telegram Terms of Service'],
          [LINKS.telegramPrivacy, uk ? 'Політика конфіденційності Telegram' : 'Telegram Privacy Policy'],
        ],
        commitments: [
          ...(uk
            ? [
                `${esc(botLabel('uk')).replace(/^б/, 'Б')} не потребує прав на публікацію, редагування чи видалення повідомлень і ніколи нічого не пише в канал.`,
                'Бот читає лише кількість підписників і нові дописи каналів, де його додано адміністратором. Особисті повідомлення й списки підписників не збираються.',
                'Бот не розсилає повідомлень і не використовує дані для реклами.',
              ]
            : [
                `${esc(botLabel('en')).replace(/^t/, 'T')} needs no rights to post, edit or delete messages and never writes anything to your channel.`,
                'The bot only reads the subscriber count and new posts of channels where it was added as an administrator. Private messages and subscriber lists are never collected.',
                'The bot never sends broadcast messages and does not use data for advertising.',
              ]),
          ...common,
        ],
        revoke: uk ? `Видаліть ${esc(botLabel('uk', 'acc'))} з адміністраторів каналу (Канал → Адміністратори).` : `Remove ${esc(botLabel('en'))} from channel administrators (Channel → Administrators).`,
      };
    case 'podcast':
      return {
        dev: [],
        user: [],
        commitments: uk
          ? [
              'Читаємо лише публічну RSS-стрічку, яку ви вказали. Жодних прав доступу не потрібно.',
              'Зберігаємо лише назви, дати, тривалість і посилання на епізоди; аудіофайли не завантажуємо. Права на вміст належать власнику подкасту.',
              'Підключайте лише власний подкаст або той, яким ви уповноважені керувати.',
              common[2],
            ]
          : [
              'We only read the public RSS feed you provide. No access permissions are needed.',
              'We store only episode titles, dates, durations and links; audio files are never downloaded. Content rights belong to the podcast owner.',
              'Connect only a podcast you own or are authorised to manage.',
              common[2],
            ],
        revoke: uk ? '«Мої платформи» → «Відключити».' : '“My platforms” → “Disconnect”.',
      };
  }
}

const list = (items: [string, string][]) => items.map(([u, l]) => ext(u, l)).join(', ');

/** Блок «Правила платформи» в кінці розділу платформи в Privacy Policy. */
export function rulesBlock(p: RulesPlatform, lang: Lang): string {
  const r = rules(p, lang);
  const uk = lang === 'uk';
  return `
<div class="rules-box">
  <h3>${uk ? 'Правила платформи, яких ми дотримуємось' : 'Platform rules we comply with'}</h3>
  ${r.dev.length ? `<p><strong>${uk ? 'Для розробників' : 'Developer terms'}:</strong> ${list(r.dev)}.</p>` : ''}
  ${r.user.length ? `<p><strong>${uk ? 'Для користувачів' : 'User terms'}:</strong> ${list(r.user)}.</p>` : ''}
  <ul>${r.commitments.map((c) => `<li>${c}</li>`).join('')}</ul>
  <p><strong>${uk ? 'Відкликати доступ на боці платформи' : 'Revoke access on the platform side'}:</strong> ${r.revoke} ${uk ? 'Або «Відключити» в кабінеті.' : 'Or click “Disconnect” in your dashboard.'}</p>
</div>`;
}

/** Таблиця для Terms of Service: платформа → умови для користувачів → правила для розробників. */
export function termsTable(lang: Lang): string {
  const uk = lang === 'uk';
  const rows: [string, RulesPlatform][] = [
    ['YouTube', 'youtube'],
    ['Facebook, Instagram', 'meta'],
    ['Threads', 'threads'],
    ['TikTok', 'tiktok'],
    ['LinkedIn', 'linkedin'],
    ['Telegram', 'telegram'],
  ];
  const head = uk ? ['Платформа', 'Ви погоджуєтеся з', 'Ми дотримуємось'] : ['Platform', 'You agree to', 'We comply with'];
  return `<div class="table-wrap"><table><thead><tr>${head.map((h) => `<th scope="col">${h}</th>`).join('')}</tr></thead><tbody>${rows
    .map(([name, p]) => {
      const r = rules(p, lang);
      return `<tr><td><strong>${name}</strong></td><td>${list(r.user)}</td><td>${list(r.dev)}</td></tr>`;
    })
    .join('')}<tr><td><strong>${uk ? 'Подкаст (RSS)' : 'Podcast (RSS)'}</strong></td><td colspan="2">${
    uk ? 'Публічна стрічка; підключайте лише власний подкаст.' : 'Public feed; connect only a podcast you own.'
  }</td></tr></tbody></table></div>`;
}
