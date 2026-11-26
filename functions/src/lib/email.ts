/**
 * Листи через розширення Firebase «Trigger Email» (firestore-send-email):
 * документ у колекції `mail` → розширення надсилає його через SMTP.
 */
import { getAuth } from 'firebase-admin/auth';
import { db } from './admin';
import { siteUrl } from './env';
import { PLATFORMS, type PlatformId } from '../config/platforms';

type Lang = 'uk' | 'en';

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]!);

const T = {
  reconnect: {
    uk: {
      subject: (p: string) => `KnB Stats: підключіть ${p} знову`,
      body: (p: string, acc: string) => `Доступ KnB Stats до ${p} (${acc}) закінчився або був відкликаний, тому ми не можемо оновлювати статистику. Підключіть акаунт знову — це займе хвилину.`,
      button: 'Підключити знову',
    },
    en: {
      subject: (p: string) => `KnB Stats: please reconnect ${p}`,
      body: (p: string, acc: string) => `KnB Stats' access to ${p} (${acc}) has expired or was revoked, so we cannot update your statistics. Please reconnect the account — it takes a minute.`,
      button: 'Reconnect',
    },
  },
  expiring: {
    uk: {
      subject: (p: string) => `KnB Stats: доступ до ${p} скоро закінчиться`,
      body: (p: string, acc: string, date: string) => `Доступ KnB Stats до ${p} (${acc}) закінчиться ${date}. Щоб статистика оновлювалася без перерв, підключіть акаунт знову.`,
      button: 'Підключити знову',
    },
    en: {
      subject: (p: string) => `KnB Stats: access to ${p} expires soon`,
      body: (p: string, acc: string, date: string) => `KnB Stats' access to ${p} (${acc}) expires on ${date}. Reconnect the account to keep your statistics updating without interruption.`,
      button: 'Reconnect',
    },
  },
  footer: {
    uk: 'Ви отримали цей лист, бо підключили акаунт у KnB Stats. Сервіс лише читає статистику й нічого не публікує.',
    en: 'You received this email because you connected an account to KnB Stats. The service only reads statistics and never posts anything.',
  },
};

function layout(lang: Lang, title: string, text: string, button: string, url: string): string {
  return `<!doctype html><html lang="${lang}"><body style="margin:0;background:#f7f7f8;font-family:Inter,Segoe UI,Arial,sans-serif;color:#17171c">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0"><tr><td align="center" style="padding:32px 16px">
  <table role="presentation" width="100%" style="max-width:560px;background:#fff;border:1px solid #e3e3e8;border-radius:14px" cellpadding="0" cellspacing="0">
  <tr><td style="padding:28px">
    <div style="font-weight:800;font-size:18px;margin-bottom:20px"><span style="display:inline-block;background:linear-gradient(135deg,#f97316,#ea580c,#d9480f);color:#fff;border-radius:8px;padding:4px 8px;margin-right:8px">▮</span>KnB Stats</div>
    <h1 style="font-size:20px;margin:0 0 12px">${esc(title)}</h1>
    <p style="font-size:15px;line-height:1.55;margin:0 0 24px">${esc(text)}</p>
    <a href="${esc(url)}" style="display:inline-block;background:#ea580c;color:#fff;text-decoration:none;font-weight:700;padding:12px 22px;border-radius:10px">${esc(button)}</a>
    <p style="font-size:12px;color:#6f6f7a;margin:28px 0 0">${esc(T.footer[lang])}</p>
  </td></tr></table></td></tr></table></body></html>`;
}

async function recipient(uid: string): Promise<{ to: string | null; lang: Lang }> {
  const prof = (await db().doc(`users/${uid}`).get()).data() ?? {};
  const lang: Lang = prof.lang === 'en' ? 'en' : 'uk';
  let to: string | null = typeof prof.notifyEmail === 'string' && prof.notifyEmail ? prof.notifyEmail : null;
  if (!to) to = (await getAuth().getUser(uid).catch(() => null))?.email ?? null;
  return { to, lang };
}

export async function sendReconnectEmail(uid: string, platform: PlatformId, accountName: string, kind: 'reconnect' | 'expiring', expiresAt?: number) {
  const { to, lang } = await recipient(uid);
  if (!to) return;
  const p = PLATFORMS[platform].name;
  const t = T[kind][lang];
  const date = expiresAt ? new Intl.DateTimeFormat(lang === 'uk' ? 'uk-UA' : 'en-GB', { dateStyle: 'long', timeZone: 'Europe/Kyiv' }).format(expiresAt) : '';
  const text = kind === 'reconnect' ? T.reconnect[lang].body(p, accountName) : T.expiring[lang].body(p, accountName, date);
  const url = `${siteUrl()}/${lang}/app/connections`;
  await db().collection('mail').add({
    to,
    message: { subject: t.subject(p), text: `${text}\n\n${t.button}: ${url}`, html: layout(lang, t.subject(p), text, t.button, url) },
    meta: { uid, platform, kind, createdAt: Date.now() },
  });
}

export async function sendAdminEmail(to: string, subject: string, text: string) {
  if (!to || to.startsWith('[')) return;
  await db().collection('mail').add({ to, message: { subject, text } });
}
