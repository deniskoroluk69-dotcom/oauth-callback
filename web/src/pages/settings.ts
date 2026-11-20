import { t, isLang, rememberLang } from '../i18n';
import { applyTheme, getTheme, type Theme } from '../lib/theme';
import { esc, openDialog, toast } from '../lib/dom';
import { href, type Page } from '../router';

export const settingsPage: Page = {
  meta: 'settings',
  layout: 'app',
  auth: true,
  render: (ctx) => `
    <div class="page-head"><div><h1 tabindex="-1">${t('settings.title')}</h1></div></div>
    <div style="display:grid;gap:16px;max-width:720px">
      <form class="panel" id="prefs" novalidate>
        <h2 style="font-size:1.0625rem">${t('settings.profile')}</h2>
        <p class="muted" style="font-size:.875rem">${t('settings.signedInAs', { email: esc(ctx.user?.email ?? '') })}</p>
        <div class="field">
          <span class="label" id="lbl-lang">${t('settings.language')}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="lbl-lang">
            <label><input type="radio" name="lang" value="uk" ${ctx.lang === 'uk' ? 'checked' : ''}><span>Українська</span></label>
            <label><input type="radio" name="lang" value="en" ${ctx.lang === 'en' ? 'checked' : ''}><span>English</span></label>
          </div>
        </div>
        <div class="field">
          <span class="label" id="lbl-theme">${t('settings.theme')}</span>
          <div class="segmented" role="radiogroup" aria-labelledby="lbl-theme">
            ${(['system', 'light', 'dark'] as Theme[])
              .map((th) => `<label><input type="radio" name="theme" value="${th}" ${getTheme() === th ? 'checked' : ''}><span>${t(`settings.theme${th[0].toUpperCase()}${th.slice(1)}`)}</span></label>`)
              .join('')}
          </div>
        </div>
        <div class="field">
          <label for="s-email">${t('settings.notifyEmail')}</label>
          <input class="input" id="s-email" name="notifyEmail" type="email" autocomplete="email" value="${esc(ctx.user?.email ?? '')}">
          <span class="hint">${t('settings.notifyHint')}</span>
        </div>
        <button class="btn btn-primary" type="submit">${t('settings.save')}</button>
      </form>

      <section class="panel" style="border-color:color-mix(in srgb,var(--danger) 40%,var(--border))" aria-labelledby="danger-h">
        <h2 id="danger-h" style="font-size:1.0625rem;color:var(--danger)">${t('settings.danger')}</h2>
        <p class="muted">${t('settings.deleteText')}</p>
        <button class="btn btn-danger-outline" type="button" data-delete>${t('settings.deleteBtn')}</button>
      </section>
    </div>`,
  mount(root, ctx) {
    const backend = ctx.backend!;
    const form = root.querySelector('#prefs') as HTMLFormElement;
    const emailInput = root.querySelector('#s-email') as HTMLInputElement;
    backend
      .getProfile()
      .then((p) => {
        if (p.notifyEmail) emailInput.value = p.notifyEmail;
      })
      .catch(() => undefined);

    form.addEventListener('change', (e) => {
      const el = e.target as HTMLInputElement;
      if (el.name === 'theme') applyTheme(el.value as Theme);
    });

    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const lang = String(fd.get('lang'));
      const theme = String(fd.get('theme')) as Theme;
      const notifyEmail = String(fd.get('notifyEmail') || '').trim();
      if (notifyEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(notifyEmail)) {
        toast(t('login.err.email'), 'error');
        return;
      }
      try {
        await backend.saveProfile({ lang: isLang(lang) ? lang : ctx.lang, theme, notifyEmail });
        toast(t('settings.saved', undefined, isLang(lang) ? lang : ctx.lang), 'ok');
        if (isLang(lang) && lang !== ctx.lang) {
          rememberLang(lang);
          location.href = href('/app/settings', lang);
        }
      } catch {
        toast(t('common.error'), 'error');
      }
    });

    root.querySelector('[data-delete]')!.addEventListener('click', () => {
      const word = t('settings.deleteWord');
      openDialog(
        `<form class="dialog-body" novalidate>
          <h2 class="dialog-title">${t('settings.deleteTitle')}</h2>
          <p>${t('settings.deleteText')}</p>
          <div class="field"><label for="del-word">${t('settings.deleteConfirm', { word: `<strong>${esc(word)}</strong>` })}</label><input class="input" id="del-word" autocomplete="off"></div>
          <div class="dialog-actions">
            <button type="button" class="btn btn-ghost" data-close>${t('common.cancel')}</button>
            <button type="submit" class="btn btn-danger" disabled>${t('settings.deleteBtn')}</button>
          </div>
        </form>`,
        (dlg) => {
          const input = dlg.querySelector('#del-word') as HTMLInputElement;
          const btn = dlg.querySelector('[type=submit]') as HTMLButtonElement;
          input.addEventListener('input', () => (btn.disabled = input.value.trim() !== word));
          dlg.querySelector('form')!.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (input.value.trim() !== word) return;
            btn.disabled = true;
            btn.innerHTML = `<span class="spinner"></span> ${t('settings.deleting')}`;
            try {
              await backend.deleteAccount();
              dlg.close();
              toast(t('settings.deleted'), 'ok');
              ctx.navigate('/', { replace: true });
            } catch {
              btn.disabled = false;
              btn.textContent = t('settings.deleteBtn');
              toast(t('common.error'), 'error');
            }
          });
        },
      );
    });
  },
};
