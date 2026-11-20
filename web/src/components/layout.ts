import { SITE, IS_DEMO } from '../config/site';
import { t, type Lang } from '../i18n';
import { esc } from '../lib/dom';
import { href, type Ctx } from '../router';
import { ICON } from './icons';

export function langSwitch(ctx: Ctx): string {
  const qs = ctx.query.toString();
  const link = (l: Lang, label: string) =>
    `<a href="${href(ctx.path, l)}${qs ? `?${esc(qs)}` : ''}" hreflang="${l}" lang="${l}" data-lang="${l}" aria-current="${ctx.lang === l}" aria-label="${l === 'uk' ? 'Українська' : 'English'}">${label}</a>`;
  return `<nav class="lang-switch" aria-label="${t('nav.language')}">${link('uk', 'UA')}${link('en', 'EN')}</nav>`;
}

export function themeButton(): string {
  return `<button class="icon-btn" type="button" data-theme-toggle aria-label="${t('nav.toggleTheme')}" title="${t('nav.toggleTheme')}"><span class="ico-moon">${ICON.moon}</span><span class="ico-sun">${ICON.sun}</span></button>`;
}

function demoBanner() {
  return IS_DEMO ? `<div class="demo-banner" role="note">${t('common.demo')}</div>` : '';
}

export function publicLayout(ctx: Ctx, inner: string): string {
  const L = ctx.lang;
  const home = href('/', L);
  const authBtn = ctx.user
    ? `<a class="btn btn-primary btn-sm" href="${href('/app/dashboard', L)}">${t('nav.cabinet')}</a>`
    : `<a class="btn btn-primary btn-sm" href="${href('/login', L)}"><span class="btn-login-text">${t('nav.login')}</span><span aria-hidden="true">→</span></a>`;
  return `
  <a class="skip-link" href="#main">${t('nav.skip')}</a>
  ${demoBanner()}
  <header class="site-header">
    <div class="container">
      <a class="logo" href="${home}" aria-label="${SITE.APP_NAME}"><span class="logo-mark">${ICON.logo}</span>${SITE.APP_NAME}</a>
      <nav class="main-nav" aria-label="${t('nav.mainNav')}">
        <a href="${home}#features">${t('nav.features')}</a>
        <a href="${home}#how">${t('nav.how')}</a>
        <a href="${home}#platforms">${t('nav.platforms')}</a>
      </nav>
      <div class="header-actions">
        ${langSwitch(ctx)}
        ${themeButton()}
        <span data-auth-slot>${authBtn}</span>
      </div>
    </div>
  </header>
  <main id="main" tabindex="-1">${inner}</main>
  ${footer(ctx)}`;
}

export function footer(ctx: Ctx): string {
  const L = ctx.lang;
  const year = new Date().getFullYear();
  return `
  <footer class="site-footer">
    <div class="container">
      <div class="footer-grid">
        <div>
          <a class="logo" href="${href('/', L)}"><span class="logo-mark">${ICON.logo}</span>${SITE.APP_NAME}</a>
          <p class="muted" style="margin-top:12px;max-width:420px">${t('footer.readOnly')}</p>
        </div>
        <nav class="footer-links" aria-label="Footer">
          <a href="${href('/privacy', L)}">${t('footer.privacy')}</a>
          <a href="${href('/terms', L)}">${t('footer.terms')}</a>
          <a href="${href('/data-deletion', L)}">${t('footer.deletion')}</a>
          <a href="${href('/contact', L)}">${t('footer.contact')}</a>
        </nav>
      </div>
      <div class="footer-legal">
        <span>© ${year} ${esc(SITE.COMPANY)}. ${t('footer.rights')}</span>
        <span>${SITE.ADDRESS ? `${esc(SITE.ADDRESS)} · ` : ''}<a href="mailto:${esc(SITE.SUPPORT_EMAIL)}">${esc(SITE.SUPPORT_EMAIL)}</a></span>
      </div>
    </div>
  </footer>`;
}

export function appLayout(ctx: Ctx, inner: string): string {
  const L = ctx.lang;
  const item = (path: string, icon: string, label: string) =>
    `<a href="${href(path, L)}" ${ctx.path === path ? 'aria-current="page"' : ''}>${icon}<span>${label}</span></a>`;
  const email = ctx.user?.email ?? '';
  const initial = (ctx.user?.displayName || email || '?').trim().charAt(0).toUpperCase();
  return `
  <a class="skip-link" href="#main">${t('nav.skip')}</a>
  ${demoBanner()}
  <div class="app-shell">
    <aside class="sidebar" id="sidebar" aria-label="${t('nav.appNav')}">
      <a class="logo" href="${href('/', L)}"><span class="logo-mark">${ICON.logo}</span>${SITE.APP_NAME}</a>
      <nav class="side-nav">
        ${item('/app/dashboard', ICON.chart, t('nav.dashboard'))}
        ${item('/app/connections', ICON.plug, t('nav.connections'))}
        ${item('/app/settings', ICON.gear, t('nav.settings'))}
      </nav>
      <div class="sidebar-foot">
        <div class="user-chip"><span class="avatar" aria-hidden="true">${esc(initial)}</span><span class="email" title="${esc(email)}">${esc(email)}</span></div>
        <div class="side-tools">${langSwitch(ctx)}${themeButton()}</div>
        <button class="btn btn-ghost btn-sm" type="button" data-logout style="justify-content:flex-start">${ICON.logout}${t('nav.logout')}</button>
        <div class="faint"><a href="${href('/privacy', L)}">${t('footer.privacy')}</a> · <a href="${href('/terms', L)}">${t('footer.terms')}</a></div>
      </div>
    </aside>
    <div class="app-col">
      <div class="app-topbar">
        <button class="icon-btn" type="button" data-menu aria-controls="sidebar" aria-expanded="false" aria-label="${t('nav.menu')}">${ICON.menu}</button>
        <a class="logo" href="${href('/', L)}"><span class="logo-mark">${ICON.logo}</span>${SITE.APP_NAME}</a>
        <div class="side-tools">${themeButton()}</div>
      </div>
      <main id="main" class="app-main" tabindex="-1">${inner}</main>
    </div>
  </div>`;
}

export function bareLayout(ctx: Ctx, inner: string): string {
  return publicLayout(ctx, inner);
}
