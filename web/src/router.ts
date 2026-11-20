import type { Lang } from './i18n';
import type { AppUser, Backend } from './services/types';

export interface Ctx {
  lang: Lang;
  /** Шлях без мовного префікса: '/', '/privacy', '/app/dashboard'. */
  path: string;
  query: URLSearchParams;
  user: AppUser | null;
  /** null під час пререндеру (на сервері збірки). */
  backend: Backend | null;
  navigate: (to: string, opts?: { replace?: boolean }) => void;
}

export interface Page {
  /** Ключ у meta.* перекладів. */
  meta: string;
  layout: 'public' | 'app' | 'bare';
  auth?: boolean;
  /** Публічні сторінки рендеряться синхронно (для пререндеру). */
  render(ctx: Ctx): string;
  mount?(root: HTMLElement, ctx: Ctx): void | (() => void);
}

export function href(path: string, lang: Lang): string {
  if (path === '/' || path === '') return `/${lang}/`;
  return `/${lang}${path.startsWith('/') ? path : `/${path}`}`;
}

export const PUBLIC_PATHS = ['/', '/privacy', '/terms', '/data-deletion', '/contact'] as const;
