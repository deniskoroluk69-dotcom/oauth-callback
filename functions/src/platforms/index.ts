import type { PlatformId, ProviderId } from '../config/platforms';
import { collectYouTube, googleProvider } from './google';
import { collectFacebook, collectInstagram, metaProvider } from './meta';
import { collectThreads, threadsProvider } from './threads';
import { collectTikTok, tiktokProvider } from './tiktok';
import { collectTelegram } from './telegram';
import type { Collector, OAuthProvider } from './types';

export const PROVIDERS: Record<ProviderId, OAuthProvider> = {
  google: googleProvider,
  meta: metaProvider,
  threads: threadsProvider,
  tiktok: tiktokProvider,
};

export const COLLECTORS: Record<PlatformId, Collector> = {
  youtube: collectYouTube,
  facebook: collectFacebook,
  instagram: collectInstagram,
  threads: collectThreads,
  tiktok: collectTikTok,
  telegram: collectTelegram,
};
