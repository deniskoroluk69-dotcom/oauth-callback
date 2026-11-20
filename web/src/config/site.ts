/**
 * Параметри сайту. Значення за замовчуванням — для kdstatsforme.pp.ua.
 * Будь-яке можна перевизначити змінною середовища під час збірки
 * (GitHub → Settings → Secrets and variables → Actions → Variables).
 */
const env = import.meta.env;
const v = (value: string | undefined, fallback: string) => (value && value.trim() ? value.trim() : fallback);

export const SITE = {
  APP_NAME: 'KnB Stats',
  /** Домен сайту (GitHub Pages). */
  DOMAIN: v(env.VITE_SITE_DOMAIN, 'kdstatsforme.pp.ua'),
  /** Адреса серверної частини (Firebase): OAuth callback, hooks. Порожньо → той самий домен (локальна розробка). */
  API_BASE: v(env.VITE_API_BASE_URL, '').replace(/\/+$/, ''),
  COMPANY: v(env.VITE_COMPANY, 'Kons na Bis business club'),
  /** Порожньо → рядок адреси не показується. */
  ADDRESS: v(env.VITE_ADDRESS, ''),
  SUPPORT_EMAIL: v(env.VITE_SUPPORT_EMAIL, 'testfortest111111@gmail.com'),
  /** Ім'я Telegram-бота без @. Порожньо → у текстах «бот KnB Stats». */
  TELEGRAM_BOT: v(env.VITE_TELEGRAM_BOT, '').replace(/^@/, ''),
  /** Застосовне право в Умовах використання. */
  JURISDICTION_UK: v(env.VITE_JURISDICTION_UK, 'України'),
  JURISDICTION_EN: v(env.VITE_JURISDICTION_EN, 'Ukraine'),
  /** Дата останнього оновлення юридичних текстів (ISO). */
  LEGAL_UPDATED: '2026-11-20',
  TIMEZONE: 'Europe/Kyiv',
} as const;

export const IS_DEMO = env.VITE_DEMO === 'true';

/** «@bot» або нейтральна назва, якщо бота ще не створено. */
export function botLabel(lang: 'uk' | 'en', form: 'nom' | 'acc' = 'nom'): string {
  if (SITE.TELEGRAM_BOT) return `@${SITE.TELEGRAM_BOT}`;
  if (lang === 'en') return 'the KnB Stats bot';
  return form === 'acc' ? 'бота KnB Stats' : 'бот KnB Stats';
}
