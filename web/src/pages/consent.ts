import { PLATFORMS, isPlatformId } from '@platforms';
import { SITE } from '../config/site';
import { t } from '../i18n';
import { esc } from '../lib/dom';
import type { Page } from '../router';
import { ICON, platformIcon } from '../components/icons';

/** Лише для демо: імітація сторінки дозволу платформи (у робочій версії її показує сама платформа). */
export const consentPage: Page = {
  meta: 'consent',
  layout: 'public',
  auth: true,
  render(ctx) {
    const id = ctx.query.get('platform');
    if (!id || !isPlatformId(id)) return `<p class="container">404</p>`;
    const p = PLATFORMS[id];
    const providerName = p.provider === 'google' ? 'Google' : p.provider === 'meta' ? 'Facebook (Meta)' : p.name;
    return `
    <div class="consent">
      <div class="alert alert-warn">${t('consent.demoNote', { platform: esc(providerName) })}</div>
      <div class="auth-card" style="max-width:none">
        <div style="display:flex;gap:12px;align-items:center;margin-bottom:12px">${platformIcon(id)}<span style="font-size:1.4rem">⇄</span><span class="logo-mark">${ICON.logo}</span></div>
        <h1 style="font-size:1.25rem">${t('consent.wants', { app: SITE.APP_NAME, platform: esc(providerName) })}</h1>
        <p class="muted">${ctx.user?.email ? esc(ctx.user.email) : ''}</p>
        <ul class="scopes-list">${p.scopes.map((s) => `<li>${ICON.check}<code>${esc(s.replace('https://www.googleapis.com/auth/', ''))}</code></li>`).join('')}</ul>
        <p class="readonly-note">${ICON.shield}<span>${t('consent.readOnly')}</span></p>
        <div class="dialog-actions">
          <button class="btn btn-ghost" data-deny>${t('consent.deny')}</button>
          <button class="btn btn-primary" data-allow>${t('consent.allow')}</button>
        </div>
      </div>
    </div>`;
  },
  mount(root, ctx) {
    const id = ctx.query.get('platform');
    if (!id || !isPlatformId(id) || !ctx.backend?.demo) return;
    const go = async (allow: boolean) => {
      const to = await ctx.backend!.demo!.consent(id, allow, ctx.lang);
      ctx.navigate(to, { replace: true });
    };
    root.querySelector('[data-allow]')?.addEventListener('click', () => void go(true));
    root.querySelector('[data-deny]')?.addEventListener('click', () => void go(false));
  },
};
