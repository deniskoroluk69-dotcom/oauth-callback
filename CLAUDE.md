# CLAUDE.md — правила для Claude Code у цьому репозиторії

## Абсолютні заборони
- **Секрети ніколи не в коді, не в git і не в чаті.** Ключі застосунків — лише в Google Secret Manager
  (`firebase functions:secrets:set NAME`). Не проси користувача вставити ключ у чат — давай команду, яку він виконає сам.
- **Не деплой** (`firebase deploy`, `gcloud ...`) без явного підтвердження користувача. Деплой — лише через PR → main → GitHub Actions зі схваленням середовища `production`.
- **Токени користувачів ніколи не потрапляють у браузер, логи чи відповіді клієнту.** Лише колекція `secrets/` (зашифровано KMS), доступ — лише з Cloud Functions.
- **Лише читання.** Не додавай scopes на запис/публікацію. Сервіс нічого не змінює в акаунтах користувачів.
- Не логуй тіла відповідей платформ і не додавай їх у текст помилок (використовуй `lib/log.ts` і `lib/http.ts`).

## Структура
- **Хостинг:** сайт (`web/`) — GitHub Pages на `kdstatsforme.pp.ua` (workflow `pages.yml`); API — Firebase Hosting на `api.kdstatsforme.pp.ua` (`firebase.json` → лише `/connect/**`, `/hooks/**`). Файл `web/public/googlea59a6ba8bb1403ca.html` — підтвердження Google Search Console, не видаляти.
- `functions/src/config/platforms.ts` — єдине джерело правди про платформи (прапорець `enabled`). Імпортується і фронтендом (alias `@platforms`).
- `functions/src/platforms/*` — OAuth-провайдери й збирачі статистики.
- `functions/src/sync/*` — диспетчер, воркер Cloud Tasks, оновлення токенів під блокуванням.
- `web/src` — Vite + TypeScript без фреймворків; i18n у `web/src/i18n/{uk,en}.json`, юридичні тексти в `web/src/legal`.
- `web/src/services/demoBackend.ts` — демо без мережі (`npm run dev:demo`).

## Обов'язково перед PR
```bash
npm --prefix web run typecheck
npm --prefix functions run typecheck
npm --prefix functions test
npm run test:rules:emulator
node scripts/secret-scan.mjs
```

## Правила змін
- Будь-який новий текст — одразу в обох мовах (`uk.json` і `en.json`; юридичні тексти — обидві функції в `legal/*`).
- Зміна прав (scopes) платформи → онови Privacy Policy (таблиця «право → для чого») і README.
- TikTok/LinkedIn ротують refresh token: оновлення токена лише через `getFreshTokens` під `withLock`, новий токен записується одразу.
- Нові колекції Firestore — закриті правилами за замовчуванням; додай тест у `tests/rules.test.ts`.
- Обіцянка в політиці: видалення даних ≤ 7 днів. Не ламай `deleteConnection` / `deleteUserData`.
