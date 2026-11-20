import { IS_DEMO, SITE } from './config/site';
import { t, type Lang } from './i18n';
import { esc } from './lib/dom';
import { href, type Ctx, type Page } from './router';
import { appLayout, publicLayout } from './components/layout';
import { homePage } from './pages/home';
import { contactPage, deletionPage, notFoundPage, privacyPage, termsPage } from './pages/public';
import { loginPage } from './pages/login';
import { connectionsPage } from './pages/connections';
import { dashboardPage } from './pages/dashboard';
import { settingsPage } from './pages/settings';
import { consentPage } from './pages/consent';

export const ROUTES: Record<string, Page> = {
  '/': homePage,
  '/privacy': privacyPage,
  '/terms': termsPage,
  '/data-deletion': deletionPage,
  '/contact': contactPage,
  '/login': loginPage,
  '/app/connections': connectionsPage,
  '/app/dashboard': dashboardPage,
  '/app/settings': settingsPage,
  // Імітація сторінки дозволу — лише в демо-збірці.
  ...(IS_DEMO ? { '/app/consent': consentPage } : {}),
};

export { notFoundPage };

export function renderPage(page: Page, ctx: Ctx, innerOverride?: string): string {
  const inner = innerOverride ?? page.render(ctx);
  return page.layout === 'app' ? appLayout(ctx, inner) : publicLayout(ctx, inner);
}

const ORIGIN = `https://${SITE.DOMAIN}`;

export interface HeadInfo {
  title: string;
  description: string;
  canonical: string;
  alternates: { lang: Lang | 'x-default'; url: string }[];
  index: boolean;
}

export function headInfo(page: Page, ctx: Ctx): HeadInfo {
  const isPrivate = page.layout === 'app' || page === notFoundPage || ctx.path === '/login';
  return {
    title: t(`meta.${page.meta}.title`),
    description: t(`meta.${page.meta}.description`),
    canonical: `${ORIGIN}${href(ctx.path, ctx.lang)}`,
    alternates: [
      { lang: 'uk', url: `${ORIGIN}${href(ctx.path, 'uk')}` },
      { lang: 'en', url: `${ORIGIN}${href(ctx.path, 'en')}` },
      { lang: 'x-default', url: `${ORIGIN}${href(ctx.path, 'en')}` },
    ],
    index: !isPrivate,
  };
}

/** Теги <head> як рядок — для пререндеру. */
export function headHtml(h: HeadInfo, lang: Lang): string {
  return [
    `<title>${esc(h.title)}</title>`,
    `<meta name="description" content="${esc(h.description)}">`,
    `<meta name="robots" content="${h.index ? 'index,follow' : 'noindex,nofollow'}">`,
    `<link rel="canonical" href="${esc(h.canonical)}">`,
    ...h.alternates.map((a) => `<link rel="alternate" hreflang="${a.lang}" href="${esc(a.url)}">`),
    `<meta property="og:title" content="${esc(h.title)}">`,
    `<meta property="og:description" content="${esc(h.description)}">`,
    `<meta property="og:type" content="website">`,
    `<meta property="og:locale" content="${lang === 'uk' ? 'uk_UA' : 'en_US'}">`,
  ].join('\n    ');
}

/** Оновлення <head> у браузері при переході між сторінками. */
export function applyHead(h: HeadInfo, lang: Lang) {
  document.title = h.title;
  document.documentElement.lang = lang;
  document.head.querySelectorAll('[data-head]').forEach((el) => el.parentNode?.removeChild(el));
  document.head
    .querySelectorAll('meta[name="description"],meta[name="robots"],link[rel="canonical"],link[rel="alternate"],meta[property^="og:"]')
    .forEach((el) => el.parentNode?.removeChild(el));
  const tpl = document.createElement('template');
  tpl.innerHTML = headHtml(h, lang).replace(/<title>.*?<\/title>/, '');
  tpl.content.querySelectorAll('*').forEach((el) => el.setAttribute('data-head', ''));
  document.head.appendChild(tpl.content);
}
