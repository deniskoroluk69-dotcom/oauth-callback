import { SITE } from '../config/site';
import { fmtDateTime, t, type Lang } from '../i18n';

const other = (l: Lang): Lang => (l === 'uk' ? 'en' : 'uk');
import { privacyHtml } from '../legal/privacy';
import { termsHtml } from '../legal/terms';
import { deletionHtml } from '../legal/deletion';
import { esc } from '../lib/dom';
import { href, type Page } from '../router';

export const privacyPage: Page = {
  meta: 'privacy',
  layout: 'public',
  render: (ctx) => `<article class="legal">${privacyHtml(ctx.lang)}</article>`,
};

export const termsPage: Page = {
  meta: 'terms',
  layout: 'public',
  render: (ctx) => `<article class="legal">${termsHtml(ctx.lang)}</article>`,
};

export const deletionPage: Page = {
  meta: 'deletion',
  layout: 'public',
  render: (ctx) => `<article class="legal">${deletionHtml(ctx.lang)}</article>`,
  mount(root, ctx) {
    const code = ctx.query.get('code');
    const box = root.querySelector('#deletion-status') as HTMLElement | null;
    if (!code || !box || !ctx.backend) return;
    if (!/^[A-Za-z0-9_-]{6,64}$/.test(code)) {
      box.innerHTML = `<div class="alert alert-error">${t('deletion.notFound')}</div>`;
      return;
    }
    const byEmail = () =>
      (box.innerHTML = `<div class="alert alert-info">${t('deletion.byEmail', {
        email: `<a href="mailto:${esc(SITE.SUPPORT_EMAIL)}?subject=${encodeURIComponent(`Data deletion ${code}`)}">${esc(SITE.SUPPORT_EMAIL)}</a>`,
        code: `<code>${esc(code)}</code>`,
      })}</div>`);
    // Без серверної частини статус перевірити неможливо — пропонуємо запит поштою.
    if (ctx.backend.mode === 'unavailable') return void byEmail();
    box.innerHTML = `<div class="card" aria-live="polite"><span class="spinner"></span> ${t('common.loading')}</div>`;
    ctx.backend
      .getDeletionStatus(code)
      .then((st) => {
        if (!st) {
          box.innerHTML = `<div class="alert alert-error">${t('deletion.notFound')}</div>`;
          return;
        }
        const done = st.status === 'completed';
        box.innerHTML = `
          <section class="card" aria-labelledby="ds-h" style="margin:20px 0">
            <h2 id="ds-h" style="margin-top:0;padding-top:0">${t('deletion.statusTitle')}</h2>
            <p>${t('deletion.code')}: <code>${esc(code)}</code></p>
            <p><span class="status ${done ? 'status-active' : 'status-needs_reconnect'}">${done ? t('deletion.completed') : t('deletion.received')}</span></p>
            <p class="muted" style="margin:0">${t('deletion.receivedAt')}: ${fmtDateTime(st.createdAt)}${st.completedAt ? ` · ${t('deletion.completedAt')}: ${fmtDateTime(st.completedAt)}` : ''}</p>
          </section>`;
      })
      .catch(() => byEmail());
  },
};

export const contactPage: Page = {
  meta: 'contact',
  layout: 'public',
  render: (ctx) => `
  <div class="legal">
    <h1>${t('contact.title')}</h1>
    <p class="muted">${t('contact.intro')}</p>
    <div class="contact-grid">
      <div class="card">
        <p class="label">${t('contact.emailUs')}</p>
        <p><a href="mailto:${esc(SITE.SUPPORT_EMAIL)}">${esc(SITE.SUPPORT_EMAIL)}</a></p>
        <p class="label">${t('contact.company')}</p>
        <p style="margin:0">${esc(SITE.COMPANY)}${SITE.ADDRESS ? `<br>${esc(SITE.ADDRESS)}` : ''}</p>
      </div>
      <form class="card" id="contact-form" novalidate>
        <div id="contact-msg" aria-live="polite"></div>
        <div class="field"><label for="c-name">${t('contact.name')}</label><input class="input" id="c-name" name="name" required maxlength="100" autocomplete="name"></div>
        <div class="field"><label for="c-email">${t('contact.email')}</label><input class="input" id="c-email" name="email" type="email" required maxlength="200" autocomplete="email"></div>
        <div class="field"><label for="c-msg">${t('contact.message')}</label><textarea class="input" id="c-msg" name="message" required maxlength="5000"></textarea></div>
        <div class="hp" aria-hidden="true"><label>Website<input name="website" tabindex="-1" autocomplete="off"></label></div>
        <button class="btn btn-primary" type="submit">${t('contact.send')}</button>
        <p class="hint" style="margin:12px 0 0">${t('contact.recaptcha')} <a href="${href('/privacy', ctx.lang)}">${t('footer.privacy')}</a></p>
      </form>
    </div>
  </div>`,
  mount(root, ctx) {
    const form = root.querySelector('#contact-form') as HTMLFormElement;
    const msg = root.querySelector('#contact-msg') as HTMLElement;
    form.addEventListener('submit', async (e) => {
      e.preventDefault();
      const fd = new FormData(form);
      const data = {
        name: String(fd.get('name') || '').trim(),
        email: String(fd.get('email') || '').trim(),
        message: String(fd.get('message') || '').trim(),
        hp: String(fd.get('website') || ''),
        lang: ctx.lang,
      };
      if (!data.name || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(data.email) || data.message.length < 5) {
        msg.innerHTML = `<div class="alert alert-error">${t('contact.invalid')}</div>`;
        return;
      }
      if (data.hp) return; // бот заповнив приховане поле
      // Резерв, коли сервер недоступний: відкриваємо поштову програму з готовим листом.
      const viaEmail = () => {
        const subject = `KnB Stats — ${data.name}`;
        const body = `${data.message}

— ${data.name} <${data.email}>`;
        location.href = `mailto:${SITE.SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
        msg.innerHTML = `<div class="alert alert-ok">${t('contact.mailto')}</div>`;
      };
      if (!ctx.backend || ctx.backend.mode === 'unavailable') return viaEmail();
      const btn = form.querySelector('button[type=submit]') as HTMLButtonElement;
      btn.disabled = true;
      try {
        await ctx.backend.submitContact(data);
        form.reset();
        msg.innerHTML = `<div class="alert alert-ok">${t('contact.sent')}</div>`;
      } catch {
        viaEmail();
      } finally {
        btn.disabled = false;
      }
    });
  },
};

export const notFoundPage: Page = {
  meta: 'notFound',
  layout: 'public',
  render: (ctx) => `
  <section class="empty container" style="padding:96px 16px">
    <p style="font-size:4rem;font-weight:800;margin:0;background:var(--accent-grad);-webkit-background-clip:text;background-clip:text;color:transparent">404</p>
    <h1>${t('notFound.title')}</h1>
    <p class="muted">${t('notFound.text')}</p>
    <a class="btn btn-primary" href="${href('/', ctx.lang)}">${t('notFound.home')}</a>
    <div lang="${other(ctx.lang)}" style="margin-top:32px;padding-top:24px;border-top:1px solid var(--border)">
      <p style="font-weight:700;margin-bottom:4px">${t('notFound.title', undefined, other(ctx.lang))}</p>
      <p class="muted">${t('notFound.text', undefined, other(ctx.lang))}</p>
      <a href="${href('/', other(ctx.lang))}">${t('notFound.home', undefined, other(ctx.lang))}</a>
    </div>
  </section>`,
};
