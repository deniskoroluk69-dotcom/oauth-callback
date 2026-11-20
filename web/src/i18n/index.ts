import uk from './uk.json';
import en from './en.json';

export type Lang = 'uk' | 'en';
export const LANGS: Lang[] = ['uk', 'en'];
const DICTS: Record<Lang, unknown> = { uk, en };
const LANG_KEY = 'knb-lang';

let current: Lang = 'uk';

export function setLang(l: Lang) {
  current = l;
  if (typeof document !== 'undefined') document.documentElement.lang = l;
}
export function getLang(): Lang {
  return current;
}
export function isLang(v: unknown): v is Lang {
  return v === 'uk' || v === 'en';
}

export function rememberLang(l: Lang) {
  try {
    localStorage.setItem(LANG_KEY, l);
  } catch {
    /* storage unavailable */
  }
}

/** Мова для `/`: збережений вибір → мова браузера → українська. */
export function preferredLang(): Lang {
  try {
    const saved = localStorage.getItem(LANG_KEY);
    if (isLang(saved)) return saved;
  } catch {
    /* ignore */
  }
  const nav = (typeof navigator !== 'undefined' ? navigator.languages || [navigator.language] : []).map((x) =>
    x.toLowerCase(),
  );
  for (const n of nav) {
    if (n.startsWith('uk') || n.startsWith('ru')) return 'uk';
    if (n.startsWith('en')) return 'en';
  }
  return 'uk';
}

function lookup(dict: unknown, key: string): unknown {
  return key
    .split('.')
    .reduce<unknown>((o, k) => (o && typeof o === 'object' ? (o as Record<string, unknown>)[k] : undefined), dict);
}

/** Переклад з підстановкою {var}. Значення змінних НЕ екрануються — екрануйте самі, якщо треба. */
export function t(key: string, vars?: Record<string, string | number>, lang: Lang = current): string {
  let s = lookup(DICTS[lang], key);
  if (typeof s !== 'string') s = lookup(DICTS.uk, key);
  if (typeof s !== 'string') return key;
  return vars ? s.replace(/\{(\w+)\}/g, (_, k) => (k in vars ? String(vars[k]) : `{${k}}`)) : s;
}

const locale = (l: Lang = current) => (l === 'uk' ? 'uk-UA' : 'en-GB');

export function fmtNum(n: number | undefined | null, opts: Intl.NumberFormatOptions = {}): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat(locale(), { maximumFractionDigits: 1, ...opts }).format(n);
}

export function fmtCompact(n: number | undefined | null): string {
  if (n === undefined || n === null || Number.isNaN(n)) return '—';
  return new Intl.NumberFormat(locale(), { notation: 'compact', maximumFractionDigits: 1 }).format(n);
}

export function fmtPct(n: number | null | undefined, signed = true): string {
  if (n === null || n === undefined || !Number.isFinite(n)) return '—';
  const s = new Intl.NumberFormat(locale(), {
    maximumFractionDigits: 1,
    signDisplay: signed ? 'exceptZero' : 'auto',
  }).format(n);
  return `${s}%`;
}

export function fmtDate(
  v: number | string | Date,
  opts: Intl.DateTimeFormatOptions = { day: 'numeric', month: 'short', year: 'numeric' },
): string {
  const d = typeof v === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(v) ? new Date(`${v}T12:00:00Z`) : new Date(v);
  return new Intl.DateTimeFormat(locale(), { timeZone: 'Europe/Kyiv', ...opts }).format(d);
}

export function fmtDateTime(v: number): string {
  return fmtDate(v, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

export function fmtRelative(ts: number | null | undefined): string {
  if (!ts) return t('common.never');
  const diff = Date.now() - ts;
  const min = Math.round(diff / 60000);
  if (min < 1) return t('common.justNow');
  if (min < 60) return t('common.minutesAgo', { n: min });
  const h = Math.round(min / 60);
  if (h < 24) return t('common.hoursAgo', { n: h });
  return t('common.daysAgo', { n: Math.round(h / 24) });
}
