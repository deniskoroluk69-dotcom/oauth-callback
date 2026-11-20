# KnB Stats

Сайт, через який користувач сам підключає свої соцмережі (YouTube, Facebook, Instagram, Threads, TikTok, LinkedIn, Telegram, подкаст), а сервер автоматично отримує, зберігає (зашифровано) й продовжує токени та щодня о 05:00 за Києвом збирає статистику.

- **Сайт:** Vite + TypeScript (без фреймворків), **GitHub Pages** на `kdstatsforme.pp.ua`, пререндер усіх сторінок (`/uk/...`, `/en/...`).
- **API:** Firebase Hosting на піддомені `api.kdstatsforme.pp.ua` (лише `/connect/**` і `/hooks/**` → Cloud Functions).
- **Бекенд:** Cloud Functions 2nd gen (Node 22, `europe-west1`), Firestore, Cloud KMS (envelope encryption), Cloud Scheduler → Cloud Tasks.
- **Листи:** розширення «Trigger Email from Firestore».
- **Лише читання.** Сервіс нічого не публікує й не змінює в акаунтах користувачів.

```
/web                 фронтенд (i18n, сторінки, стилі, демо-бекенд)
/functions           Cloud Functions: connect/*, hooks/*, sync/*, api/*, platforms/*
/functions/src/config/platforms.ts   прапорці enabled для кожної платформи
/tests               тести правил Firestore (емулятор)
/firestore.rules, /firestore.indexes.json, /firebase.json
/.github/workflows   ci.yml (перевірки на PR), deploy.yml (деплой після злиття в main)
```

---

## 0. Демо без жодних ключів

```bash
npm run install:all
```

```bash
npm run dev:demo
```

Відкрийте http://localhost:5173 — усе працює в браузері на тестових даних: вхід, «Мої платформи» (імітація сторінок дозволу, вибір каналів/Сторінок, Telegram, RSS, імпорт LinkedIn), дашборд, налаштування, видалення акаунта. У демо на сторінці «Мої платформи» є «Інструменти демо»: імітувати нічний збір і прострочений токен. Статус запиту Meta на видалення: `/uk/data-deletion?code=DEMO123` (або `PENDING1`, `NOTFOUND1`).

---

## 1. Встановлення й локальний запуск з емуляторами

Потрібно: Node 22+, Java 21 (для емуляторів), `npm i -g firebase-tools`.

```bash
npm run install:all
```

1. `functions/.env.local` і `functions/.secret.local` уже містять **фіктивні** значення лише для емулятора (обидва файли в `.gitignore`). `KMS_KEY_NAME=local` вмикає локальний тестовий ключ шифрування — у продакшені він заборонений кодом.
2. Створіть `web/.env.local` на основі `web/.env.example` і задайте `VITE_USE_EMULATORS=true`, `VITE_FIREBASE_PROJECT_ID=demo-knb-stats`, `VITE_FIREBASE_API_KEY=demo-key`.
3. Запуск:

```bash
npm --prefix web run build && npm run emulators
```

```bash
npm --prefix web run dev
```

- Сайт через Hosting-емулятор: http://localhost:5000 (з rewrites `/connect/**`, `/hooks/**`), dev-сервер Vite: http://localhost:5173 (проксіює `/connect` і `/hooks` на 5000), Emulator UI: http://localhost:4000.
- Повний шлях з реальними платформами (вхід → підключення → збір → дашборд → відключення) потребує **тестових** ключів платформ: покладіть їх у `functions/.secret.local` (не в git) і зареєструйте callback `http://localhost:5000/connect/<provider>/callback` у консолі платформи (Google і TikTok sandbox дозволяють localhost; Meta — лише HTTPS, використовуйте тунель або staging).

Тести:

```bash
npm --prefix functions test
```

```bash
npm run test:rules:emulator
```

```bash
node scripts/secret-scan.mjs
```

---

## 2. Секрети (Secret Manager)

Кожну команду виконуєте **ви** — значення вводяться в терміналі й не потрапляють у git чи чат:

```bash
firebase functions:secrets:set GOOGLE_CLIENT_ID
firebase functions:secrets:set GOOGLE_CLIENT_SECRET
firebase functions:secrets:set META_APP_ID
firebase functions:secrets:set META_APP_SECRET
firebase functions:secrets:set THREADS_APP_ID
firebase functions:secrets:set THREADS_APP_SECRET
firebase functions:secrets:set TIKTOK_CLIENT_KEY
firebase functions:secrets:set TIKTOK_CLIENT_SECRET
firebase functions:secrets:set TIKTOK_SANDBOX_CLIENT_KEY
firebase functions:secrets:set TIKTOK_SANDBOX_CLIENT_SECRET
firebase functions:secrets:set LINKEDIN_CLIENT_ID
firebase functions:secrets:set LINKEDIN_CLIENT_SECRET
firebase functions:secrets:set TELEGRAM_BOT_TOKEN
firebase functions:secrets:set TELEGRAM_WEBHOOK_SECRET
```

Для платформи, яку ще не налаштовано, задайте значення `unused` (деплой вимагає наявності всіх секретів). `TELEGRAM_WEBHOOK_SECRET` — довільний випадковий рядок (наприклад, `openssl rand -hex 32`).

Параметри (не секрети) — у `functions/.env.<project-id>` (у `.gitignore`), шаблон `functions/.env.example`:
`PUBLIC_BASE_URL`, `KMS_KEY_NAME`, `ADMIN_EMAIL`, `TELEGRAM_BOT_USERNAME`, `META_LOGIN_CONFIG_ID`.

### Cloud KMS і мінімальні ролі

```bash
gcloud kms keyrings create knb-stats --location europe-west1
gcloud kms keys create tokens --keyring knb-stats --location europe-west1 --purpose encryption --rotation-period 90d --next-rotation-time $(date -u -d '+90 days' +%Y-%m-%dT%H:%M:%SZ)
```

Службовому акаунту функцій (`<project-number>-compute@developer.gserviceaccount.com` або окремому) — лише:
- `roles/cloudkms.cryptoKeyEncrypterDecrypter` **на конкретному ключі** `tokens`;
- `roles/datastore.user`, `roles/cloudtasks.enqueuer`, `roles/secretmanager.secretAccessor` (Firebase додає під час деплою для потрібних секретів);
- приберіть `roles/editor`, якщо його видано за замовчуванням.

### Розширення «Trigger Email»

```bash
firebase ext:install firebase/firestore-send-email --project [FIREBASE_PROJECT]
```

Параметри — `extensions/firestore-send-email.env`; пароль SMTP вводиться під час встановлення (зберігається як секрет).

### App Check

Firebase Console → App Check → зареєструйте веб-застосунок з **reCAPTCHA Enterprise**, ключ сайту — у `VITE_RECAPTCHA_SITE_KEY`. Увімкніть Enforcement для Cloud Functions і Firestore.

---

## 3. Публікація: сайт на GitHub Pages, API на Firebase

GitHub Pages віддає лише статичні файли, тому сервер (обмін коду на токени, зберігання токенів, щоденний збір, hooks) працює у Firebase на окремому піддомені того самого домену.

| Що | Де | Адреса |
|---|---|---|
| Сайт (головна, політики, кабінет) | GitHub Pages, репозиторій `oauth-callback` | `https://kdstatsforme.pp.ua` |
| API (OAuth callback, hooks) | Firebase Hosting → Cloud Functions | `https://api.kdstatsforme.pp.ua` |

### 3.1 Сайт на GitHub Pages
1. Завантажте цей проєкт у репозиторій (див. «Перенесення в репозиторій oauth-callback» нижче).
2. **Settings → Pages → Build and deployment → Source: GitHub Actions.** (Зараз Pages для репозиторію вимкнено — домен віддає 404 і помилку сертифіката.)
3. **Custom domain:** `kdstatsforme.pp.ua` → Save → дочекайтеся перевірки DNS → увімкніть **Enforce HTTPS** (сертифікат видається до 24 год).
4. DNS домену вже вказує на GitHub Pages (A-записи `185.199.108–111.153`) — нічого міняти не треба.
5. Після кожного злиття в `main` workflow **Pages** (`.github/workflows/pages.yml`) збирає й публікує сайт. Запустити вручну: Actions → Pages → Run workflow.
6. Файл підтвердження Google Search Console `googlea59a6ba8bb1403ca.html` перенесено зі старого сайту в `web/public/` — він публікується в корені сайту. Не видаляйте його, інакше Google зніме підтвердження домену (потрібне для OAuth Branding).

**Settings → Secrets and variables → Actions → Variables** (усі значення публічні, секретів тут немає):

| Змінна | Значення |
|---|---|
| `VITE_SITE_DOMAIN` | `kdstatsforme.pp.ua` |
| `VITE_API_BASE_URL` | `https://api.kdstatsforme.pp.ua` |
| `VITE_SUPPORT_EMAIL` | пошта підтримки (за замовчуванням `testfortest111111@gmail.com`) |
| `VITE_COMPANY` | власник (за замовчуванням `Kons na Bis business club`) |
| `VITE_ADDRESS` | адреса; порожньо → не показується |
| `VITE_TELEGRAM_BOT` | ім'я бота без @; порожньо → у текстах «бот KnB Stats» |
| `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, `VITE_FIREBASE_APP_ID` | Firebase Console → Project settings → Web app (публічні ідентифікатори) |
| `VITE_RECAPTCHA_SITE_KEY` | ключ reCAPTCHA Enterprise для App Check |

Поки змінні Firebase не задано, сайт повністю працює як публічний (головна, політики, контакти — для перевіряльників цього достатньо), а вхід у кабінет показує «тимчасово недоступний». Жодних позначок «демо» в робочій збірці немає.

### 3.2 API на піддомені
1. Firebase Console → Hosting → **Add custom domain** → `api.kdstatsforme.pp.ua`; додайте в DNS запис, який покаже консоль (зазвичай A або CNAME для `api`).
2. `functions/.env.<project-id>`: `PUBLIC_BASE_URL=https://api.kdstatsforme.pp.ua`, `SITE_URL=https://kdstatsforme.pp.ua`.
3. Authentication → Settings → **Authorized domains** → додайте `kdstatsforme.pp.ua`.
4. Деплой API (лише після вашого рішення): `firebase deploy --only hosting,functions,firestore` або workflow **Deploy API** (запускається, коли задано змінні `GCP_WIF_PROVIDER` тощо).

Як це працює: «Підключити» на сайті надсилає запит на `https://api.kdstatsforme.pp.ua/connect/<платформа>/start` (дозволено лише з `kdstatsforme.pp.ua`, CORS) → браузер переходить на `https://api.kdstatsforme.pp.ua/connect/<платформа>/go` (там ставиться захисний cookie) → сторінка дозволу платформи → `https://api.kdstatsforme.pp.ua/connect/<платформа>/callback` → повернення на `https://kdstatsforme.pp.ua/uk/app/connections`.

### Перенесення в репозиторій oauth-callback

Локальна копія вже містить історію `oauth-callback` і готовий коміт, який замінює старі файли новим сайтом. Опублікувати (виконуєте ви):

```bash
git push origin main
```

## 4. Налаштування в консолях платформ

Значення для копіювання (сайт — `kdstatsforme.pp.ua`, API — `api.kdstatsforme.pp.ua`):

| Що | Адреса |
|---|---|
| Головна | `https://kdstatsforme.pp.ua/en/` (українська: `https://kdstatsforme.pp.ua/uk/`) |
| Privacy Policy | `https://kdstatsforme.pp.ua/en/privacy` |
| Terms of Service | `https://kdstatsforme.pp.ua/en/terms` |
| Data deletion (інструкція) | `https://kdstatsforme.pp.ua/en/data-deletion` |
| Контакти | `https://kdstatsforme.pp.ua/en/contact` |
| Google callback | `https://api.kdstatsforme.pp.ua/connect/google/callback` |
| Meta callback | `https://api.kdstatsforme.pp.ua/connect/meta/callback` |
| Threads callback | `https://api.kdstatsforme.pp.ua/connect/threads/callback` |
| TikTok callback | `https://api.kdstatsforme.pp.ua/connect/tiktok/callback` |
| LinkedIn callback | `https://api.kdstatsforme.pp.ua/connect/linkedin/callback` |
| Meta Deauthorize callback | `https://api.kdstatsforme.pp.ua/hooks/meta/deauthorize` |
| Meta Data deletion request URL | `https://api.kdstatsforme.pp.ua/hooks/meta/data-deletion` |
| Threads Uninstall callback | `https://api.kdstatsforme.pp.ua/hooks/threads/uninstall` |
| Threads Delete callback | `https://api.kdstatsforme.pp.ua/hooks/threads/delete` |
| Telegram webhook | `https://api.kdstatsforme.pp.ua/hooks/telegram` |

> **Зі старого сайту:** якщо в тестових застосунках (Google, TikTok) redirect URI вказували на сторінки `kdstatsforme.pp.ua/...`, замініть їх на адреси `api.kdstatsforme.pp.ua/connect/.../callback` з таблиці вище. Старий текст «внутрішній інструмент клубу» на сайті замінено описом сервісу для власників каналів — опис застосунку в консолях (Branding, App Review) має збігатися з головною сторінкою.

### Google Cloud (YouTube)
1. **APIs & Services → Library:** увімкніть *YouTube Data API v3* і *YouTube Analytics API*.
2. **Google Auth Platform → Branding:** App name `KnB Stats`, support email `testfortest111111@gmail.com`, логотип 120×120, Application home page `https://kdstatsforme.pp.ua/en/`, Privacy `https://kdstatsforme.pp.ua/en/privacy`, Terms `https://kdstatsforme.pp.ua/en/terms`, Authorized domains: `kdstatsforme.pp.ua` (покриває і `api.kdstatsforme.pp.ua`). Підтвердіть домен у Google Search Console.
3. **Audience:** User type *External* → **Publish app** (статус *In production*).
4. **Data access:** додайте `https://www.googleapis.com/auth/youtube.readonly` і `https://www.googleapis.com/auth/yt-analytics.readonly` (sensitive → потрібна верифікація).
5. **Clients → Create client → Web application:** Authorized JavaScript origins `https://kdstatsforme.pp.ua`, Authorized redirect URIs `https://api.kdstatsforme.pp.ua/connect/google/callback`. Client ID/Secret → секрети `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`.
6. Якщо проходите аудит YouTube API Services — заповніть форму аудиту квот (YouTube API Services – Audit and Quota Extension).

### Meta (Facebook + Instagram + Threads)
1. **developers.facebook.com → Create app** → тип *Business*.
2. **App settings → Basic:** App domains `kdstatsforme.pp.ua`, `api.kdstatsforme.pp.ua`, Privacy Policy URL, Terms of Service URL, User data deletion → *Data deletion callback URL* `https://api.kdstatsforme.pp.ua/hooks/meta/data-deletion`, категорія, іконка 1024×1024, Contact email. App ID/Secret → секрети `META_APP_ID`, `META_APP_SECRET`.
3. **Add product → Facebook Login for Business → Configurations → Create configuration:** тип *User access token*; права `pages_show_list`, `pages_read_engagement`, `read_insights`, `instagram_basic`, `instagram_manage_insights` (+ `business_management` лише якщо Сторінки в бізнес-портфоліо). Отриманий **Configuration ID** → параметр `META_LOGIN_CONFIG_ID`.
4. **Facebook Login for Business → Settings:** Valid OAuth Redirect URIs `https://api.kdstatsforme.pp.ua/connect/meta/callback`; Deauthorize callback `https://api.kdstatsforme.pp.ua/hooks/meta/deauthorize`; увімкніть *Enforce HTTPS*, *Use Strict Mode*.
5. **Threads** (окремий use case «Access the Threads API»): Redirect callback `https://api.kdstatsforme.pp.ua/connect/threads/callback`, Uninstall `https://api.kdstatsforme.pp.ua/hooks/threads/uninstall`, Delete `https://api.kdstatsforme.pp.ua/hooks/threads/delete`; права `threads_basic`, `threads_manage_insights`. Threads App ID/Secret → `THREADS_APP_ID`, `THREADS_APP_SECRET`.
6. **App Review → Permissions and features:** запросіть Advanced Access для кожного права з описом і відео (сценарій нижче). Пройдіть Business Verification.
7. Перемкніть застосунок у режим **Live**.

### TikTok
1. **developers.tiktok.com → Manage apps → Create app.**
2. Basic information: іконка, назва, категорія, опис, **Terms of Service URL**, **Privacy Policy URL**, Platforms → **Web** → Website URL `https://kdstatsforme.pp.ua/en/` (сайт має бути доступний і не лише сторінкою входу).
3. **Add products → Login Kit:** Redirect URI `https://api.kdstatsforme.pp.ua/connect/tiktok/callback`; scopes `user.info.basic`, `user.info.profile`, `user.info.stats`, `video.list`.
4. **Sandbox:** створіть sandbox, додайте тестові акаунти; ключі sandbox → `TIKTOK_SANDBOX_CLIENT_KEY/SECRET`; у `functions/src/config/platforms.ts` `TIKTOK_ENV = 'sandbox'`.
5. **Submit for review** з відео. Після схвалення: production-ключі → `TIKTOK_CLIENT_KEY/SECRET`, `TIKTOK_ENV = 'production'`, деплой.

### LinkedIn
1. **linkedin.com/developers → Create app**, прив'яжіть Сторінку компанії й підтвердіть її (Verify).
2. **Auth:** Authorized redirect URL `https://api.kdstatsforme.pp.ua/connect/linkedin/callback`. Client ID/Secret → `LINKEDIN_CLIENT_ID/SECRET`.
3. **Products → Community Management API → Request access** (заповнити анкету про використання — лише читання аналітики Сторінок; права `r_organization_admin`, `r_organization_social`).
4. До схвалення працює **імпорт експорту** аналітики (кнопка «Завантажити експорт» у кабінеті).

### Telegram
1. У **@BotFather**: `/newbot` → назва `KnB Stats`, username `[BOT_USERNAME]` → токен → секрет `TELEGRAM_BOT_TOKEN` (вводите самі в терміналі).
2. `/setprivacy` → *Enable*; `/setjoingroups` → *Disable*; `/setdescription` — «Read-only statistics bot for KnB Stats. Add me as a channel admin without posting rights.»
3. Зареєструйте webhook (виконайте самі; токен підставте з менеджера паролів):

```bash
curl -s "https://api.telegram.org/bot<TOKEN>/setWebhook" -d "url=https://api.kdstatsforme.pp.ua/hooks/telegram" -d "secret_token=<TELEGRAM_WEBHOOK_SECRET>" -d 'allowed_updates=["channel_post","edited_channel_post"]'
```

4. Параметр `TELEGRAM_BOT_USERNAME`, а також `SITE.TELEGRAM_BOT` у `web/src/config/site.ts`.

---

## 5. Як увімкнути платформу після схвалення

1. `functions/src/config/platforms.ts` → потрібна платформа → `enabled: true` (для TikTok також `TIKTOK_ENV = 'production'`).
2. Переконайтеся, що секрети платформи задані реальними значеннями.
3. PR → CI зелений → злиття в `main` → схвалення деплою в GitHub (середовище `production`).

Вимкнена платформа в кабінеті й на головній показується як «Скоро», а сервер відхиляє її підключення та збір.

---

## 6. Чек-листи перед поданням на перевірку

**Загальне (для всіх):**
- [ ] Домен відкривається по HTTPS, головна описує сервіс (не лише форма входу), є посилання на Privacy / Terms / Data deletion / Contact у футері.
- [ ] Privacy і Terms доступні англійською за прямими посиланнями, без входу; заповнені всі `[...]` (див. розділ 7).
- [ ] У Privacy перелічені всі права, які запитуємо, і для чого (таблиця).
- [ ] Тестовий акаунт для перевіряльника (пошта + пароль) створено, пошту підтверджено.
- [ ] Відео записане англійською (або з англійськими субтитрами), видно адресний рядок браузера.

**Google / YouTube:** Branding заповнено, домен підтверджено в Search Console; Limited Use дослівно в Privacy (є); посилання на Google Privacy Policy і myaccount.google.com/permissions (є); у Terms — фраза про YouTube Terms of Service (є); біля даних YouTube — підпис джерела з посиланням на YouTube (є в дашборді); у відео показано повний OAuth consent screen з назвою застосунку і client ID в URL.

**Meta:** Business Verification; Data deletion callback і Deauthorize callback працюють (перевірте тестовим `signed_request`); для кожного права — окреме пояснення й відео, як саме дані показуються користувачу; тестовий користувач Facebook зі Сторінкою та підключеним Instagram Business.

**TikTok:** Web-платформа з робочим Website URL; Terms і Privacy на тому ж домені; відео з sandbox-акаунтом; описано кожен scope.

**LinkedIn:** Сторінка компанії підтверджена; анкета Community Management API описує лише читання аналітики.

### Сценарій відео-демонстрації (англійською)

1. *“This is KnB Stats, a read-only analytics dashboard for creators and businesses. It never posts anything.”* — покажіть головну `https://kdstatsforme.pp.ua/en/`, прокрутіть до футера: Privacy Policy, Terms, Data deletion.
2. Відкрийте Privacy Policy, покажіть розділ про платформу, яку перевіряють (і Limited Use для Google).
3. Натисніть **Sign in** → увійдіть тестовим акаунтом.
4. **My platforms** → **Connect** на потрібній платформі. Покажіть адресний рядок сторінки дозволу платформи (accounts.google.com / facebook.com / tiktok.com), назву застосунку й перелік прав. *“We request read-only permissions: …”* Натисніть **Allow**.
5. Якщо кілька каналів/Сторінок — покажіть вибір і натисніть **Connect selected**. Картка показує «Connected ✓» та назву акаунта.
6. **Statistics** → покажіть, де використовується кожне право: картки показників, графік по днях (наведіть на точку), порівняння періодів, топ публікацій з посиланням **Open original**, підпис джерела даних (для YouTube — «Data provided by the YouTube Analytics API» з посиланням на YouTube).
7. Поверніться в **My platforms** → **Disconnect** → підтвердьте. *“We revoke the token on the platform and delete all tokens and data.”*
8. **Settings → Delete account and all data** — покажіть діалог (можна скасувати).
9. Для Meta: покажіть видалення застосунку в Facebook → Settings → Business integrations і сторінку статусу `https://kdstatsforme.pp.ua/en/data-deletion?code=…`.

---

## 7. Що заповнити

Значення сайту вже заповнено даними зі старого сайту і змінюються змінними GitHub (розділ 3.1) без правки коду:
домен `kdstatsforme.pp.ua`, пошта `testfortest111111@gmail.com`, власник `Kons na Bis business club`, застосовне право — Україна, адреса — не показується.

Ще потрібно:

| Що | Де |
|---|---|
| Ім'я Telegram-бота | змінна `VITE_TELEGRAM_BOT` і `TELEGRAM_BOT_USERNAME` у `functions/.env.<project-id>` |
| Firebase-проєкт | `.firebaserc` (`[FIREBASE_PROJECT]`), змінні `VITE_FIREBASE_*` |
| Параметри функцій | `functions/.env.<project-id>` за шаблоном `functions/.env.example` (`KMS_KEY_NAME`, `META_LOGIN_CONFIG_ID`) |
| SMTP для листів | `extensions/firestore-send-email.env` (`[SMTP_USER]`, `[SMTP_HOST]`) |
| GitHub Variables для деплою API | `GCP_WIF_PROVIDER`, `GCP_DEPLOY_SA`, `PUBLIC_BASE_URL`, `SITE_URL`, `KMS_KEY_NAME`, `ADMIN_EMAIL`, `TELEGRAM_BOT_USERNAME`, `META_LOGIN_CONFIG_ID` |
| Юридична назва й адреса (за бажанням) | змінні `VITE_COMPANY`, `VITE_ADDRESS` |
| Скриншоти кабінету | `web/src/pages/home.ts` — зараз намальовані SVG-ілюстрації |
| Дата «Оновлено» політик | `SITE.LEGAL_UPDATED` у `web/src/config/site.ts` |

## Архітектура коротко

- **Підключення:** `POST https://api…/connect/{provider}/start` з сайту (Firebase ID token, App Check, CORS лише для домену сайту) → state у `oauthStates/{sha256}` (10 хв, uid, PKCE для Google) + одноразовий квиток → браузер відкриває `/connect/{provider}/go` (cookie `__session` з nonce на домені API) → сторінка дозволу → `GET /connect/{provider}/callback` → одноразове споживання state + перевірка cookie → обмін коду → (Meta/Threads) довгостроковий токен → акаунти → кілька? → `pendingSelections` (зашифровано) і вибір у кабінеті → `secrets/{connectionId}` (AES-256-GCM, DEK загорнутий KMS, AAD = connectionId) + `users/{uid}/connections/{id}` → одразу завдання збору з історією.
- **Збір:** `dispatchDaily` (05:00 Europe/Kyiv) → Cloud Tasks `syncConnection` (5 спроб, експоненційна затримка, ліміт 2/с) → блокування `lockUntil` → оновлення токена й негайний запис (TikTok ротує) → дані → `users/{uid}/daily/{connectionId}_{YYYY-MM-DD}`, `users/{uid}/content/{connectionId}_{postId}` → зняття блокування. AuthError → `needs_reconnect` + лист. `nightlyReport` — лог-метрика `sync_failure_rate` + лист адміну, якщо > 20% збоїв платформи.
- **Видалення:** «Відключити», «Видалити акаунт», Meta/Threads hooks — токени й дані видаляються одразу (обіцянка в політиці — ≤ 7 днів).
- **Безпека:** суворий CSP, HSTS, `X-Frame-Options: DENY`, App Check на callable-функціях, правила Firestore (клієнт читає лише свої `users/{uid}/**`, `secrets/**` закрито повністю), редагування секретів у логах (`lib/log.ts`), захист від SSRF для RSS.

> Відомі обмеження прототипу: Meta регулярно змінює набір метрик Insights — перелік винесено в константи `functions/src/platforms/meta.ts`; перед поданням звірте з актуальною документацією Graph API. Перегляди постів Telegram (MTProto) — окремий етап, у кабінеті показано заготовку «Скоро».
