/**
 * Параметри й секрети функцій.
 * Секрети зберігаються лише в Google Secret Manager:
 *   firebase functions:secrets:set GOOGLE_CLIENT_SECRET
 * Ніколи не записуйте їх у код, .env чи git.
 */
import { defineSecret, defineString } from 'firebase-functions/params';

export const REGION = 'europe-west1';
export const TIMEZONE = 'Europe/Kyiv';

/** Адреса серверної частини (Firebase Hosting на api-піддомені): OAuth callback, hooks. */
export const PUBLIC_BASE_URL = defineString('PUBLIC_BASE_URL', { description: 'https://api.DOMAIN — адреса API (callback, hooks)' });
/** Адреса сайту (GitHub Pages): куди повертати користувача, посилання в листах. */
export const SITE_URL = defineString('SITE_URL', { description: 'https://DOMAIN — адреса сайту' });
export const KMS_KEY_NAME = defineString('KMS_KEY_NAME', {
  description: 'projects/.../locations/.../keyRings/.../cryptoKeys/... (або "local" лише в емуляторі)',
});
export const ADMIN_EMAIL = defineString('ADMIN_EMAIL', { description: 'Пошта для звітів про збої збору' });
export const TELEGRAM_BOT_USERNAME = defineString('TELEGRAM_BOT_USERNAME', { description: 'Ім\'я бота без @' });
export const META_LOGIN_CONFIG_ID = defineString('META_LOGIN_CONFIG_ID', {
  description: 'config_id конфігурації Facebook Login for Business',
});

export const SECRETS = {
  GOOGLE_CLIENT_ID: defineSecret('GOOGLE_CLIENT_ID'),
  GOOGLE_CLIENT_SECRET: defineSecret('GOOGLE_CLIENT_SECRET'),
  META_APP_ID: defineSecret('META_APP_ID'),
  META_APP_SECRET: defineSecret('META_APP_SECRET'),
  THREADS_APP_ID: defineSecret('THREADS_APP_ID'),
  THREADS_APP_SECRET: defineSecret('THREADS_APP_SECRET'),
  TIKTOK_CLIENT_KEY: defineSecret('TIKTOK_CLIENT_KEY'),
  TIKTOK_CLIENT_SECRET: defineSecret('TIKTOK_CLIENT_SECRET'),
  TIKTOK_SANDBOX_CLIENT_KEY: defineSecret('TIKTOK_SANDBOX_CLIENT_KEY'),
  TIKTOK_SANDBOX_CLIENT_SECRET: defineSecret('TIKTOK_SANDBOX_CLIENT_SECRET'),
  TELEGRAM_BOT_TOKEN: defineSecret('TELEGRAM_BOT_TOKEN'),
  TELEGRAM_WEBHOOK_SECRET: defineSecret('TELEGRAM_WEBHOOK_SECRET'),
};

export const ALL_SECRETS = Object.values(SECRETS);

export const isEmulator = () => process.env.FUNCTIONS_EMULATOR === 'true';

export function baseUrl(): string {
  return PUBLIC_BASE_URL.value().replace(/\/+$/, '');
}

export function siteUrl(): string {
  return SITE_URL.value().replace(/\/+$/, '');
}
