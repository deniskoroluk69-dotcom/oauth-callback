import { PLATFORMS, PLATFORM_ORDER, isPlatformId, type PlatformId } from '@platforms';
import { botLabel } from '../config/site';
import { fmtDate, fmtRelative, t } from '../i18n';
import { confirmDialog, esc, openDialog, toast } from '../lib/dom';
import type { Ctx, Page } from '../router';
import { ICON, platformIcon } from '../components/icons';
import { UserError, type Connection } from '../services/types';

const errText = (e: unknown) => (e instanceof UserError ? t(e.key, e.vars) : t('common.error'));

function cardStatus(id: PlatformId, list: Connection[]): string {
  const p = PLATFORMS[id];
  if (!p.enabled && !list.length) return 'soon';
  if (!list.length) return 'none';
  if (list.some((c) => c.status === 'needs_reconnect')) return 'needs_reconnect';
  if (list.some((c) => c.status === 'error')) return 'error';
  if (list.every((c) => c.status === 'disconnected')) return 'disconnected';
  return 'active';
}

function shortScope(s: string) {
  return s.replace('https://www.googleapis.com/auth/', '');
}

function accountRow(c: Connection): string {
  const reconnect = c.status === 'needs_reconnect' || c.status === 'disconnected';
  return `
  <li class="acc" data-conn="${esc(c.id)}">
    <div class="acc-top">
      <span class="acc-name">${c.accountUrl ? `<a href="${esc(c.accountUrl)}" target="_blank" rel="noopener noreferrer">${esc(c.accountName)}</a>` : esc(c.accountName)}</span>
      <span class="status status-${esc(c.status)}">${t(`connections.status.${c.status}`)}</span>
    </div>
    <div class="acc-meta">${t('connections.lastSync', { when: fmtRelative(c.lastSyncAt) })}${
      c.expiresAt ? ` · ${t('connections.expires', { date: fmtDate(c.expiresAt) })}` : ''
    }</div>
    ${c.lastError && c.status !== 'active' ? `<div class="acc-meta" style="color:var(--warn)">${esc(t(c.lastError))}</div>` : ''}
    <div class="acc-actions">
      ${reconnect ? `<button class="btn btn-primary btn-sm" data-reconnect="${esc(c.platform)}">${ICON.refresh}${t('connections.reconnect')}</button>` : `<button class="btn btn-secondary btn-sm" data-refresh="${esc(c.id)}">${ICON.refresh}${t('connections.refresh')}</button>`}
      <button class="btn btn-ghost btn-sm" data-disconnect="${esc(c.id)}" data-name="${esc(c.accountName)}">${t('connections.disconnect')}</button>
    </div>
  </li>`;
}

function card(id: PlatformId, list: Connection[]): string {
  const p = PLATFORMS[id];
  const st = cardStatus(id, list);
  const scopes = p.scopes.length ? `<p class="scopes" style="margin:0">${t('connections.scopes', { scopes: p.scopes.map(shortScope).join(', ') })}</p>` : '';
  let actions = '';
  if (p.enabled) {
    actions = `<button class="btn ${list.length ? 'btn-secondary' : 'btn-primary'}" data-connect="${id}">${list.length ? `+ ${t('connections.addAccount')}` : t('connections.connect')}</button>`;
  } else {
    actions = `<button class="btn btn-secondary" disabled aria-disabled="true">${t('common.soon')}</button>`;
  }
  return `
  <article class="card conn-card" aria-labelledby="h-${id}">
    <div class="conn-head">
      ${platformIcon(id)}
      <div style="min-width:0;flex:1"><h2 id="h-${id}">${esc(p.name)}</h2></div>
      <span class="status status-${st}">${t(`connections.status.${st}`)}</span>
    </div>
    ${!p.enabled ? `<p class="muted" style="margin:0;font-size:.875rem">${t('connections.soonText')}</p>` : ''}
    ${id === 'telegram' ? `<p class="faint" style="margin:0">${t('connections.telegram.viewsSoon')}</p>` : ''}
    ${list.length ? `<ul class="acc-list" style="list-style:none;padding:0;margin:0">${list.map(accountRow).join('')}</ul>` : ''}
    ${scopes}
    <div class="conn-actions">${actions}</div>
  </article>`;
}

function telegramDialog(ctx: Ctx) {
  const bot = esc(botLabel(ctx.lang, 'acc'));
  openDialog(
    `<form class="dialog-body" novalidate>
      <h2 class="dialog-title">${t('connections.telegram.title')}</h2>
      <ol style="padding-left:1.2em">
        <li>${t('connections.telegram.step1')}</li>
        <li>${t('connections.telegram.step2', { bot: `<strong>${bot}</strong>` })}</li>
        <li>${t('connections.telegram.step3')}</li>
      </ol>
      <div data-msg aria-live="polite"></div>
      <div class="field"><label for="tg-ch">Telegram</label><input class="input" id="tg-ch" placeholder="${t('connections.telegram.placeholder')}" autocomplete="off" required></div>
      <p class="faint">${t('connections.telegram.viewsSoon')}</p>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" data-close>${t('common.cancel')}</button>
        <button type="submit" class="btn btn-primary">${t('connections.telegram.verify')}</button>
      </div>
    </form>`,
    (dlg) => {
      const form = dlg.querySelector('form')!;
      const msg = dlg.querySelector('[data-msg]') as HTMLElement;
      form.addEventListener('submit', async (e) => {
        e.preventDefault();
        const v = (dlg.querySelector('#tg-ch') as HTMLInputElement).value.trim();
        if (!/^@?[A-Za-z][A-Za-z0-9_]{4,31}$/.test(v)) {
          msg.innerHTML = `<div class="alert alert-error">${t('connections.telegram.invalid')}</div>`;
          return;
        }
        const btn = form.querySelector('[type=submit]') as HTMLButtonElement;
        btn.disabled = true;
        try {
          await ctx.backend!.connectTelegram(v.startsWith('@') ? v : `@${v}`);
          dlg.close();
          toast(t('connections.telegram.ok'), 'ok');
        } catch (err) {
          msg.innerHTML = `<div class="alert alert-error">${errText(err)}</div>`;
        } finally {
          btn.disabled = false;
        }
      });
    },
  );
}


async function selectionDialog(ctx: Ctx, id: string) {
  let data;
  try {
    data = await ctx.backend!.getPendingSelection(id);
  } catch (e) {
    toast(errText(e), 'error');
    return;
  }
  openDialog(
    `<form class="dialog-body">
      <h2 class="dialog-title">${t('connections.select.title')}</h2>
      <p class="muted">${t('connections.select.text')}</p>
      <div data-msg aria-live="polite"></div>
      <fieldset style="border:0;padding:0;margin:0"><legend class="sr-only">${t('connections.select.title')}</legend>
      <div class="select-list">
        ${data.accounts
          .map(
            (a) => `<label class="select-item"><input type="checkbox" name="acc" value="${esc(a.id)}" checked>${platformIcon(a.platform, 'sm')}<span><strong>${esc(a.name)}</strong>${a.subtitle ? `<br><span class="faint">${esc(a.subtitle)}</span>` : ''}</span></label>`,
          )
          .join('')}
      </div></fieldset>
      <div class="dialog-actions">
        <button type="button" class="btn btn-ghost" data-close>${t('common.cancel')}</button>
        <button type="submit" class="btn btn-primary">${t('connections.select.confirm')}</button>
      </div>
    </form>`,
    (dlg) => {
      dlg.querySelector('form')!.addEventListener('submit', async (e) => {
        e.preventDefault();
        const ids = Array.from(dlg.querySelectorAll<HTMLInputElement>('input[name=acc]:checked')).map((i) => i.value);
        if (!ids.length) {
          (dlg.querySelector('[data-msg]') as HTMLElement).innerHTML = `<div class="alert alert-error">${t('connections.select.none')}</div>`;
          return;
        }
        try {
          await ctx.backend!.confirmSelection(id, ids);
          dlg.close();
          toast(t('connections.connected', { platform: PLATFORMS[data.platform].name }), 'ok');
        } catch (err) {
          toast(errText(err), 'error');
        }
      });
    },
  );
}

export const connectionsPage: Page = {
  meta: 'connections',
  layout: 'app',
  auth: true,
  render: () => `
    <div class="page-head"><div><h1 tabindex="-1">${t('connections.title')}</h1><p>${t('connections.subtitle')}</p></div></div>
    <div id="conn-grid" class="conn-grid" aria-busy="true"><div class="page-loading"><span class="spinner"></span></div></div>
    <div id="demo-tools"></div>`,
  mount(root, ctx) {
    const backend = ctx.backend!;
    const grid = root.querySelector('#conn-grid') as HTMLElement;

    // Повідомлення після повернення з OAuth.
    const q = ctx.query;
    const connected = q.get('connected');
    const error = q.get('error');
    const select = q.get('select');
    if (connected && isPlatformId(connected)) toast(t('connections.connected', { platform: PLATFORMS[connected].name }), 'ok');
    if (error) toast(t(`connections.err.${['denied', 'expired', 'noAccounts'].includes(error) ? error : 'generic'}`), 'error');
    if (select && /^[A-Za-z0-9_-]{8,64}$/.test(select)) void selectionDialog(ctx, select);
    if (connected || error || select) history.replaceState(null, '', location.pathname);

    const unsub = backend.watchConnections((list) => {
      grid.removeAttribute('aria-busy');
      // Відключені на боці платформи (напр. видалили застосунок у Facebook) показуємо з кнопкою «Підключити знову».
      grid.innerHTML = PLATFORM_ORDER.map((id) => card(id, list.filter((c) => c.platform === id))).join('');
    });

    const onClick = async (e: Event) => {
      const el = (e.target as HTMLElement).closest('button') as HTMLButtonElement | null;
      if (!el) return;
      const d = el.dataset;
      if (d.connect || d.reconnect) {
        const id = (d.connect || d.reconnect) as PlatformId;
        const kind = PLATFORMS[id].connectKind;
        if (kind === 'telegram') return telegramDialog(ctx);
        el.disabled = true;
        try {
          await backend.startConnect(id, ctx.lang);
        } catch (err) {
          toast(errText(err), 'error');
          el.disabled = false;
        }
      } else if (d.refresh) {
        el.disabled = true;
        try {
          const r = await backend.refreshNow(d.refresh);
          if (r.queued) toast(t('connections.refreshQueued'), 'ok');
          else toast(t('connections.refreshTooSoon', { minutes: r.retryInMinutes ?? 60 }), 'info');
        } catch (err) {
          toast(errText(err), 'error');
        } finally {
          el.disabled = false;
        }
      } else if (d.disconnect) {
        const ok = await confirmDialog({
          title: t('connections.disconnect'),
          text: t('connections.confirmDisconnect', { account: d.name || '' }),
          confirm: t('connections.disconnect'),
          cancel: t('common.cancel'),
          danger: true,
        });
        if (!ok) return;
        try {
          await backend.disconnect(d.disconnect);
          toast(t('connections.disconnectedToast'), 'ok');
        } catch (err) {
          toast(errText(err), 'error');
        }
      } else if (d.demo === 'all') {
        await backend.demo?.connectAll();
        toast(t('connections.demo.allDone'), 'ok');
      } else if (d.demo === 'sync') {
        await backend.demo?.simulateNightly();
        toast(t('connections.demo.synced'), 'ok');
      } else if (d.demo === 'expire') {
        await backend.demo?.simulateExpired();
      }
    };
    root.addEventListener('click', onClick);

    if (backend.demo) {
      (root.querySelector('#demo-tools') as HTMLElement).innerHTML = `
        <section class="card demo-tools" aria-label="${t('connections.demo.title')}">
          <h2 style="font-size:1rem">${t('connections.demo.title')}</h2>
          <div class="conn-actions">
            <button class="btn btn-primary btn-sm" data-demo="all">${t('connections.demo.all')}</button>
            <button class="btn btn-secondary btn-sm" data-demo="sync">${ICON.refresh}${t('connections.demo.sync')}</button>
            <button class="btn btn-secondary btn-sm" data-demo="expire">${t('connections.demo.expire')}</button>
          </div>
        </section>`;
    }

    return () => {
      unsub();
      root.removeEventListener('click', onClick);
    };
  },
};
