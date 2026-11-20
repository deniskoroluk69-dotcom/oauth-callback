import { IS_DEMO } from '../config/site';
import { t } from '../i18n';
import { esc } from '../lib/dom';
import { href, type Ctx, type Page } from '../router';
import { ICON } from '../components/icons';
import { UserError } from '../services/types';

function errText(e: unknown): string {
  if (e instanceof UserError) return t(e.key, e.vars);
  return t('common.error');
}

export function safeNext(ctx: Ctx): string {
  const n = ctx.query.get('next');
  // Лише внутрішні шляхи кабінету — захист від open redirect.
  return n && /^\/app\/[a-z-]+$/.test(n) ? n : '/app/dashboard';
}

export function verifyScreen(ctx: Ctx): string {
  return `
  <div class="auth-wrap"><div class="auth-card" id="verify-card">
    <h1>${t('login.verifyTitle')}</h1>
    <p class="muted">${t('login.verifyText', { email: esc(ctx.user?.email ?? '') })}</p>
    <div id="verify-msg" aria-live="polite"></div>
    <div style="display:grid;gap:10px">
      <button class="btn btn-primary" data-verified>${t('login.verifyDone')}</button>
      <button class="btn btn-secondary" data-resend>${t('login.verifyResend')}</button>
      <button class="btn btn-ghost" data-logout>${t('nav.logout')}</button>
    </div>
  </div></div>`;
}

export function mountVerify(root: HTMLElement, ctx: Ctx) {
  const msg = root.querySelector('#verify-msg') as HTMLElement;
  root.querySelector('[data-resend]')?.addEventListener('click', async () => {
    try {
      await ctx.backend!.resendVerification();
      msg.innerHTML = `<div class="alert alert-ok">${t('login.verifySent')}</div>`;
    } catch (e) {
      msg.innerHTML = `<div class="alert alert-error">${errText(e)}</div>`;
    }
  });
  root.querySelector('[data-verified]')?.addEventListener('click', async () => {
    const u = await ctx.backend!.reloadUser();
    if (u?.emailVerified) ctx.navigate(safeNext(ctx), { replace: true });
    else msg.innerHTML = `<div class="alert alert-info">${t('login.verifyText', { email: esc(u?.email ?? '') })}</div>`;
  });
}

export const loginPage: Page = {
  meta: 'login',
  layout: 'public',
  render(ctx) {
    const L = ctx.lang;
    const agree = t('login.agree', {
      terms: `<a href="${href('/terms', L)}">${t('footer.terms')}</a>`,
      privacy: `<a href="${href('/privacy', L)}">${t('footer.privacy')}</a>`,
    });
    return `
    <div class="auth-wrap">
      <div class="auth-card">
        <h1 id="auth-title">${t('login.title')}</h1>
        <p class="muted">${t('login.subtitle')}</p>
        ${IS_DEMO ? `<div class="alert alert-info">${t('login.demoHint')}</div>` : ''}
        ${ctx.backend?.mode === 'unavailable' ? `<div class="alert alert-warn" role="status">${t('common.unavailable')}</div>` : ''}
        <div id="auth-msg" aria-live="polite"></div>
        <button class="btn btn-secondary btn-block btn-lg" type="button" data-google>${ICON.google}${t('login.google')}</button>
        <div class="divider">${t('login.or')}</div>
        <form id="auth-form" novalidate>
          <div class="field"><label for="l-email">${t('login.email')}</label><input class="input" id="l-email" name="email" type="email" autocomplete="email" required></div>
          <div class="field"><label for="l-pass">${t('login.password')}</label><input class="input" id="l-pass" name="password" type="password" autocomplete="current-password" minlength="6" required></div>
          <button class="btn btn-primary btn-block btn-lg" type="submit" data-submit>${t('login.signIn')}</button>
        </form>
        <div style="display:flex;justify-content:space-between;gap:12px;flex-wrap:wrap;margin-top:14px;font-size:.875rem">
          <button class="link-btn" type="button" data-toggle>${t('login.toSignUp')}</button>
          <button class="link-btn" type="button" data-forgot>${t('login.forgot')}</button>
        </div>
        <p class="hint" style="margin:18px 0 0">${agree}</p>
      </div>
    </div>`;
  },
  mount(root, ctx) {
    let mode: 'in' | 'up' = 'in';
    const msg = root.querySelector('#auth-msg') as HTMLElement;
    const form = root.querySelector('#auth-form') as HTMLFormElement;
    const submit = root.querySelector('[data-submit]') as HTMLButtonElement;
    const toggle = root.querySelector('[data-toggle]') as HTMLButtonElement;
    const pass = root.querySelector('#l-pass') as HTMLInputElement;
    const show = (html: string, kind = 'error') => (msg.innerHTML = html ? `<div class="alert alert-${kind}">${html}</div>` : '');
    const done = () => ctx.navigate(safeNext(ctx), { replace: true });

    toggle.addEventListener('click', () => {
      mode = mode === 'in' ? 'up' : 'in';
      submit.textContent = mode === 'in' ? t('login.signIn') : t('login.signUp');
      toggle.textContent = mode === 'in' ? t('login.toSignUp') : t('login.toSignIn');
      pass.autocomplete = mode === 'in' ? 'current-password' : 'new-password';
      show('');
    });

    root.querySelector('[data-google]')!.addEventListener('click', async () => {
      show('');
      try {
        await ctx.backend!.signInWithGoogle();
        done();
      } catch (e) {
        show(errText(e));
      }
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
      const password = pass.value;
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show(t('login.err.email'));
      if (password.length < 6) return show(t('login.err.weak'));
      submit.disabled = true;
      try {
        if (mode === 'in') await ctx.backend!.signInWithEmail(email, password);
        else await ctx.backend!.signUpWithEmail(email, password, ctx.lang);
        done();
      } catch (err) {
        show(errText(err));
      } finally {
        submit.disabled = false;
      }
    });

    root.querySelector('[data-forgot]')!.addEventListener('click', async () => {
      const email = (form.elements.namedItem('email') as HTMLInputElement).value.trim();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return show(t('login.err.email'));
      try {
        await ctx.backend!.resetPassword(email, ctx.lang);
      } catch {
        /* однакова відповідь, щоб не розкривати існування акаунта */
      }
      show(t('login.resetSent'), 'ok');
    });
  },
};
