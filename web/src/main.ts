import './styles/main.css';
import './styles/motion.css';
import { isLang, preferredLang, rememberLang, setLang, type Lang } from './i18n';
import { applyTheme, effectiveTheme, getTheme, toggleTheme } from './lib/theme';
import { href, type Ctx } from './router';
import { ROUTES, applyHead, headInfo, notFoundPage, renderPage } from './routes';
import { getBackend } from './services/backend';
import type { AppUser, Backend } from './services/types';
import { mountVerify, safeNext, verifyScreen } from './pages/login';
import { applyMotion, initMotion } from './lib/motion';

const root = document.getElementById('app')!;
let backend: Backend;
let user: AppUser | null = null;
let authReady = false;
let cleanup: (() => void) | void;
let firstRender = true;

function syncMode() {
  document.documentElement.dataset.mode = effectiveTheme();
}
applyTheme(getTheme());
syncMode();
initMotion();
window.addEventListener('themechange', syncMode);
window.matchMedia?.('(prefers-color-scheme: dark)').addEventListener('change', syncMode);

function parse(): { lang: Lang | null; path: string } {
  const segs = location.pathname.split('/').filter(Boolean);
  const lang = isLang(segs[0]) ? segs[0] : null;
  const rest = lang ? segs.slice(1) : segs;
  return { lang, path: `/${rest.join('/')}` };
}

function navigate(to: string, opts: { replace?: boolean } = {}) {
  const url = /^\/(uk|en)(\/|$)/.test(to) ? to : href(to.split('?')[0], parse().lang ?? preferredLang()) + (to.includes('?') ? `?${to.split('?')[1]}` : '');
  history[opts.replace ? 'replaceState' : 'pushState'](null, '', url);
  void route();
}

async function route() {
  if (location.pathname === '/' || location.pathname === '/index.html') {
    history.replaceState(null, '', `/${preferredLang()}/${location.search}`);
  }
  const { lang: maybeLang, path: rawPath } = parse();
  const lang = maybeLang ?? preferredLang();
  setLang(lang);
  if (maybeLang) rememberLang(lang);

  let path = rawPath.length > 1 ? rawPath.replace(/\/+$/, '') : '/';
  if (path === '/app') {
    navigate('/app/dashboard', { replace: true });
    return;
  }
  const page = maybeLang ? (ROUTES[path] ?? notFoundPage) : notFoundPage;
  if (page === notFoundPage) path = rawPath;

  const ctx: Ctx = { lang, path, query: new URLSearchParams(location.search), user, backend, navigate };

  if (page.auth && !user) {
    navigate(`/login?next=${encodeURIComponent(path)}`, { replace: true });
    return;
  }
  const needsVerify = !!user && user.providerId === 'password' && !user.emailVerified;
  if (path === '/login' && user && !needsVerify) {
    navigate(safeNext(ctx), { replace: true });
    return;
  }

  if (typeof cleanup === 'function') cleanup();
  cleanup = undefined;

  if (needsVerify && (page.auth || path === '/login')) {
    root.innerHTML = renderPage(page.layout === 'app' ? { ...ROUTES['/login'] } : page, ctx, verifyScreen(ctx));
    mountVerify(root, ctx);
  } else {
    // Перший показ публічної сторінки: готовий (пререндерений) HTML уже на місці —
    // не перемальовуємо його, щоб анімації не стартували двічі й не було миготіння.
    const keepPrerendered =
      firstRender && !user && page.layout === 'public' && page !== notFoundPage && !!root.querySelector('main') &&
      (root.querySelector('.lang-switch [aria-current="true"]') as HTMLElement | null)?.dataset.lang === lang;
    if (!keepPrerendered) root.innerHTML = renderPage(page, ctx);
    const main = root.querySelector('main') as HTMLElement;
    cleanup = page.mount?.(main, ctx);
  }
  applyHead(headInfo(page, ctx), lang);
  applyMotion(root);

  if (firstRender && location.hash) {
    // Пряме посилання на розділ (напр. /en/privacy#tiktok) — прокрутити після рендеру.
    requestAnimationFrame(() => document.getElementById(decodeURIComponent(location.hash.slice(1)))?.scrollIntoView());
  }
  if (!firstRender) {
    if (location.hash) document.getElementById(location.hash.slice(1))?.scrollIntoView();
    else window.scrollTo(0, 0);
    const h1 = root.querySelector('main h1') as HTMLElement | null;
    if (h1) {
      if (!h1.hasAttribute('tabindex')) h1.setAttribute('tabindex', '-1');
      h1.focus({ preventScroll: true });
    }
  }
  firstRender = false;
}

/* ---------- Глобальні обробники (делегування) ---------- */
document.addEventListener('click', async (e) => {
  const target = e.target as HTMLElement;
  if (target.closest('[data-theme-toggle]')) {
    toggleTheme();
    return;
  }
  if (target.closest('[data-logout]')) {
    await backend.signOut();
    navigate('/', { replace: true });
    return;
  }
  const menu = target.closest('[data-menu]') as HTMLElement | null;
  const sidebar = document.getElementById('sidebar');
  if (menu && sidebar) {
    const open = !sidebar.classList.contains('open');
    sidebar.classList.toggle('open', open);
    menu.setAttribute('aria-expanded', String(open));
    if (open) {
      const scrim = document.createElement('div');
      scrim.className = 'sidebar-scrim';
      scrim.addEventListener('click', () => {
        sidebar.classList.remove('open');
        menu.setAttribute('aria-expanded', 'false');
        scrim.parentNode?.removeChild(scrim);
      });
      document.body.appendChild(scrim);
      (sidebar.querySelector('a') as HTMLElement)?.focus();
    }
    return;
  }

  const a = target.closest('a') as HTMLAnchorElement | null;
  if (!a || e.defaultPrevented || (e as MouseEvent).button !== 0) return;
  const me = e as MouseEvent;
  if (me.metaKey || me.ctrlKey || me.shiftKey || me.altKey || a.target || a.hasAttribute('download')) return;
  const url = new URL(a.href, location.href);
  if (url.origin !== location.origin || !/^\/(uk|en)(\/|$)/.test(url.pathname)) return;
  if (url.pathname === location.pathname && url.search === location.search && url.hash) return; // якір на сторінці
  e.preventDefault();
  document.querySelector('.sidebar-scrim')?.dispatchEvent(new Event('click'));
  history.pushState(null, '', url.pathname + url.search + url.hash);
  void route();
});

window.addEventListener('popstate', () => void route());
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') (document.querySelector('.sidebar-scrim') as HTMLElement | null)?.click();
});

/* ---------- Старт ---------- */
(async () => {
  backend = await getBackend();
  backend.onAuth((u) => {
    const wasSignedIn = !!user;
    user = u;
    if (!authReady) {
      authReady = true;
      void route();
    } else if (wasSignedIn !== !!u) {
      void route();
    }
  });
})();
