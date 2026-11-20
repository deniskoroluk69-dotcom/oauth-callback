/**
 * Точка входу для пререндеру публічних сторінок під час збірки (vite build --ssr).
 * Перевіряльники Meta/Google/TikTok часто не виконують JavaScript, тому
 * головна й юридичні сторінки мають бути готовим HTML.
 */
import { LANGS, setLang, type Lang } from './i18n';
import { PUBLIC_PATHS, type Ctx } from './router';
import { ROUTES, headHtml, headInfo, notFoundPage, renderPage } from './routes';

export interface StaticPage {
  file: string;
  lang: Lang;
  head: string;
  body: string;
}

export function renderAll(): StaticPage[] {
  const out: StaticPage[] = [];
  const mk = (lang: Lang, path: string): Ctx => ({
    lang,
    path,
    query: new URLSearchParams(),
    user: null,
    backend: null,
    navigate: () => undefined,
  });
  for (const lang of LANGS) {
    setLang(lang);
    for (const path of PUBLIC_PATHS) {
      const page = ROUTES[path];
      const ctx = mk(lang, path);
      out.push({
        file: path === '/' ? `${lang}/index.html` : `${lang}${path}.html`,
        lang,
        head: headHtml(headInfo(page, ctx), lang),
        body: renderPage(page, ctx),
      });
    }
  }
  // Сторінки кабінету: GitHub Pages не вміє перенаправляти всі шляхи на index.html,
  // тому для кожної створюємо окремий файл-оболонку (вміст малює JavaScript).
  const APP_SHELLS: [string, string][] = [
    ['/login', 'login.html'],
    ['/app', 'app/index.html'],
    ['/app/connections', 'app/connections.html'],
    ['/app/dashboard', 'app/dashboard.html'],
    ['/app/settings', 'app/settings.html'],
  ];
  for (const lang of LANGS) {
    setLang(lang);
    for (const [path, file] of APP_SHELLS) {
      const page = ROUTES[path === '/app' ? '/app/dashboard' : path];
      const ctx = mk(lang, path === '/app' ? '/app/dashboard' : path);
      out.push({ file: `${lang}/${file}`, lang, head: headHtml(headInfo(page, ctx), lang), body: '' });
    }
  }
  // Двомовна статична 404.
  setLang('uk');
  const ctx = mk('uk', '/404');
  out.push({ file: '404.html', lang: 'uk', head: headHtml(headInfo(notFoundPage, ctx), 'uk'), body: renderPage(notFoundPage, ctx) });
  return out;
}
