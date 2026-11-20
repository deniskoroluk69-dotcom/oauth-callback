/**
 * Telegram без OAuth: бот додається адміністратором каналу без прав публікації.
 * Щодня — кількість підписників; нові пости — з оновлень каналу (webhook /hooks/telegram).
 * Перегляди постів через службовий акаунт MTProto — окремий етап (не реалізовано).
 */
import { SECRETS } from '../lib/env';
import { fetchJson } from '../lib/http';
import { UserFacingError } from '../lib/errors';
import type { Collector, ContentRow } from './types';

const api = (method: string) => `https://api.telegram.org/bot${SECRETS.TELEGRAM_BOT_TOKEN.value()}/${method}`;

interface TgResp<T> {
  ok: boolean;
  result: T;
  description?: string;
}

async function call<T>(method: string, params: Record<string, string | number>): Promise<T> {
  const r = await fetchJson<TgResp<T>>(api(method), { json: params }).catch(() => null);
  if (!r?.ok) throw new UserFacingError('connections.telegram.notAdmin');
  return r.result;
}

export function normalizeChannel(input: string): string {
  const v = input.trim().replace(/^https?:\/\/t\.me\//i, '@');
  const name = v.startsWith('@') ? v : `@${v}`;
  if (!/^@[A-Za-z][A-Za-z0-9_]{4,31}$/.test(name)) throw new UserFacingError('connections.telegram.invalid');
  return name;
}

export async function verifyChannel(input: string): Promise<{ chatId: string; title: string; username: string; canPost: boolean }> {
  const channel = normalizeChannel(input);
  const chat = await call<{ id: number; title: string; type: string; username?: string }>('getChat', { chat_id: channel });
  if (chat.type !== 'channel') throw new UserFacingError('connections.telegram.notAdmin');
  const me = await call<{ id: number }>('getMe', {});
  const member = await call<{ status: string; can_post_messages?: boolean; can_edit_messages?: boolean }>('getChatMember', {
    chat_id: chat.id,
    user_id: me.id,
  });
  if (member.status !== 'administrator') throw new UserFacingError('connections.telegram.notAdmin');
  return { chatId: String(chat.id), title: chat.title, username: chat.username ?? channel.slice(1), canPost: !!member.can_post_messages };
}

export const collectTelegram: Collector = async ({ connection, to }) => {
  const count = await fetchJson<TgResp<number>>(api('getChatMemberCount'), { json: { chat_id: connection.externalId } });
  if (!count.ok) throw new Error('telegram count failed');
  const prev = connection.snapshot;
  const followers = count.result;
  return {
    daily: [
      {
        date: to,
        followers,
        newFollowers: prev && typeof prev.followers === 'number' && prev.date !== to ? followers - (prev.followers as number) : undefined,
      },
    ],
    content: [],
    snapshot: { date: to, followers },
  };
};

/** Перетворює оновлення channel_post з webhook на публікацію. */
export function channelPostToContent(post: {
  message_id: number;
  date: number;
  text?: string;
  caption?: string;
  chat: { id: number; username?: string };
}): ContentRow {
  const text = post.text ?? post.caption ?? '';
  return {
    postId: String(post.message_id),
    title: text.split('\n')[0].slice(0, 140) || `Post #${post.message_id}`,
    url: post.chat.username ? `https://t.me/${post.chat.username}/${post.message_id}` : 'https://t.me',
    publishedAt: post.date * 1000,
  };
}
