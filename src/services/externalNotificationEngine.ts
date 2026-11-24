import { Capacitor } from '@capacitor/core';
import { recentEpisodesLocal } from './cloudCatalogService';
import { getDataSaverEnabled } from '../utils/appPreferences';
import {
  cancelNativeSystemNotifications,
  dispatchNativeSystemNotification,
} from '../utils/systemPermissions';

const SENT_OS_NOTIFS_KEY = 'mod_ext_notif_sent_ids_v1';
const KNOWN_EPISODES_KEY = 'mod_ext_notif_known_episodes_v1';
const KNOWN_DISCOVERY_KEY = 'mod_ext_notif_known_discovery_v1';
const LAST_LIVE_DISCOVERY_AT_KEY = 'mod_ext_notif_last_live_at_v1';
const LAST_WARM_POOL_AT_KEY = 'mod_ext_notif_last_warm_at_v1';

const SCHEDULED_DISCOVERY_IDS = [900101, 900102];
const LIVE_DISCOVERY_COOLDOWN_MS = 2 * 60 * 60 * 1000; // Minimum 2 hours between live background OS alerts
const WARM_POOL_COOLDOWN_MS = 45 * 60 * 1000; // Minimum 45 minutes between foreground discovery pool refreshes
const LIVE_POLL_INTERVAL_MS = 30 * 60 * 1000; // 30 minutes while hidden

export interface DiscoveryAlertCandidate {
  key: string;
  title: string;
  body: string;
  imageUrl?: string;
  linkTo: string;
  kind: 'new_episode' | 'new_anime' | 'new_manga';
}

const SELF_ACTIVITY_PATTERNS: RegExp[] = [
  /شاهدت\s*الحلقة/i,
  /تم\s*تسجيل\s*مشاهدة/i,
  /أكملت\s*(?:الأنمي|مشاهدة)/i,
  /حصلت\s*على/i,
  /ربحت/i,
  /كوينز/i,
  /نقطة\s*خبرة/i,
  /\bXP\b/i,
  /تسجيل\s*حضور/i,
  /المهمة\s*اليومية/i,
  /إنجاز\s*مميز/i,
  /تذكرة\s*الموسم/i,
  /كود\s*الهدية/i,
  /استرداد\s*كود/i,
];

function readBoundedHistory(key: string): string[] {
  try {
    if (typeof localStorage === 'undefined') return [];
    const raw = localStorage.getItem(key);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed.filter((x) => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

function writeBoundedHistory(key: string, items: string[], maxCount = 80): void {
  try {
    if (typeof localStorage === 'undefined') return;
    const deduped = Array.from(new Set(items)).slice(-maxCount);
    localStorage.setItem(key, JSON.stringify(deduped));
  } catch {}
}

export function hasSystemNotificationBeenSent(signature: string): boolean {
  if (!signature) return false;
  return readBoundedHistory(SENT_OS_NOTIFS_KEY).includes(signature);
}

export function markSystemNotificationSent(signature: string): void {
  if (!signature) return;
  const list = readBoundedHistory(SENT_OS_NOTIFS_KEY);
  if (!list.includes(signature)) {
    writeBoundedHistory(SENT_OS_NOTIFS_KEY, [...list, signature], 100);
  }
}

/**
 * Determines whether a Firestore/in-app notification is actually a mundane
 * self-activity confirmation (watched episode, XP/coin reward, check-in, admin moderation log)
 * that should ONLY appear inside the app and NEVER be repeated to the OS tray.
 */
export function isSelfActivityOrInternalNotification(notif: any): boolean {
  if (!notif) return true;
  if (notif.isAdminNotification) return true;

  const type = String(notif.type || '').toLowerCase();
  if (
    type === 'reward' ||
    type === 'xp' ||
    type === 'activity' ||
    type === 'self' ||
    type === 'admin_report' ||
    type === 'admin_suggestion' ||
    type === 'admin_recommendation'
  ) {
    return true;
  }

  const combinedText = `${notif.title || ''} ${notif.body || ''}`;
  return SELF_ACTIVITY_PATTERNS.some((rx) => rx.test(combinedText));
}

/**
 * Decides if a live Firestore notification should also be dispatched to the
 * device's OS notification tray.
 * - Never repeats self-activity / reward confirmations ("شاهدت حلقة", XP, etc.)
 * - Never duplicates foreground notifications while the user is actively inside the app
 * - Deduplicates by stable signature so the same notification never fires twice
 */
export function shouldMirrorFirestoreNotificationToOS(notif: any): boolean {
  if (!notif || typeof document === 'undefined') return false;
  if (isSelfActivityOrInternalNotification(notif)) return false;

  // When the user is actively looking at the app, the swipeable in-app toast already informs them.
  if (document.visibilityState === 'visible') return false;

  const signature = `fs:${notif.id || ''}:${notif.title || ''}:${notif.linkTo || ''}`;
  if (hasSystemNotificationBeenSent(signature)) return false;

  markSystemNotificationSent(signature);
  return true;
}

function computeNextFriendlyTimestamp(delayMs: number): Date {
  const target = new Date(Date.now() + delayMs);
  const hour = target.getHours();
  // Keep scheduled outside-app alerts during natural waking hours (09:30 - 23:30)
  if (hour < 9) {
    target.setHours(10, 15, 0, 0);
  } else if (hour >= 23) {
    target.setDate(target.getDate() + 1);
    target.setHours(10, 30, 0, 0);
  }
  return target;
}

function formatEpisodeCandidate(item: any): DiscoveryAlertCandidate | null {
  const animeId = String(item?.anime?._id || item?.anime?.id || item?.animeId || item?.id || '').trim();
  const title = String(item?.anime?.titleAr || item?.anime?.title || item?.title || '').trim();
  if (!animeId || !title) return null;

  const rawEp = item?.episode ?? item?.episodeNumber ?? item?.num ?? item?.ep;
  const epStr = rawEp !== undefined && rawEp !== null && String(rawEp).trim() !== '' ? String(rawEp).trim() : '';
  const key = `ep:${animeId}:${epStr || 'latest'}`;

  return {
    key,
    title: epStr ? `🔥 حلقة جديدة: ${title}` : `🎬 حلقة متاحة الآن: ${title}`,
    body: epStr
      ? `نزلت الحلقة ${epStr} الآن بجودة عالية — لا تفوّت الأحداث وافتح المشاهدة!`
      : `تحديث جديد لحلقات "${title}" متاح الآن على أوتاكو MOD.`,
    imageUrl: item?.anime?.posterUrl || item?.posterUrl || item?.image || undefined,
    linkTo: epStr ? `watch_episode:${animeId}:${epStr}` : `anime_details:${animeId}`,
    kind: 'new_episode',
  };
}

function formatAnimeHighlightCandidate(item: any): DiscoveryAlertCandidate | null {
  const animeId = String(item?._id || item?.id || '').trim();
  const title = String(item?.titleAr || item?.title || '').trim();
  if (!animeId || !title) return null;

  return {
    key: `anime:${animeId}`,
    title: `✨ أنمي مميز بانتظارك: ${title}`,
    body: `أحداث مشوقة وتقييمات قوية — اكتشف القصة وشاهد الحلقات الآن!`,
    imageUrl: item?.posterUrl || item?.imageUrl || item?.image || undefined,
    linkTo: `anime_details:${animeId}`,
    kind: 'new_anime',
  };
}

function formatMangaCandidate(item: any): DiscoveryAlertCandidate | null {
  const mangaId = String(item?._id || item?.id || '').trim();
  const title = String(item?.titleAr || item?.title || '').trim();
  if (!mangaId || !title) return null;

  const isManhwa = item?.mediaFormat === 'manhwa' || item?.countryOfOrigin === 'KR';
  const isManhua = item?.mediaFormat === 'manhua' || item?.countryOfOrigin === 'CN';
  const kindWord = isManhwa ? 'مانهوا' : isManhua ? 'مانها' : 'مانجا';
  const latestCh = item?.latestChapterNum || item?.chaptersCount;

  return {
    key: `manga:${mangaId}:${latestCh || 'hot'}`,
    title: `📖 ${kindWord} متصدرة: ${title}`,
    body: latestCh
      ? `وصل حتى الفصل ${latestCh} — استمتع بقراءة سلسة وتفاعلية الآن!`
      : `فصول جديدة وحماسية متاحة للقراءة الآن على أوتاكو MOD!`,
    imageUrl: item?.posterUrl || item?.coverImage || item?.image || undefined,
    linkTo: `manga_details:${mangaId}`,
    kind: 'new_manga',
  };
}

async function fetchLiveDiscoveryCandidates(preferredMode: 'anime' | 'manga'): Promise<{
  episodeCandidates: DiscoveryAlertCandidate[];
  highlightCandidates: DiscoveryAlertCandidate[];
}> {
  const episodeCandidates: DiscoveryAlertCandidate[] = [];
  const highlightCandidates: DiscoveryAlertCandidate[] = [];

  // 1. Seed immediately from device cache so backgrounding stays instant & offline-safe
  const cachedRecent = recentEpisodesLocal.getCached(1);
  if (cachedRecent?.items?.length) {
    for (const ep of cachedRecent.items.slice(0, 12)) {
      const c = formatEpisodeCandidate(ep);
      if (c) episodeCandidates.push(c);
    }
  }

  // 2. Skip live discovery network fetches if Data Saver mode is active and device cache already has items
  if (getDataSaverEnabled() && episodeCandidates.length > 0) {
    return { episodeCandidates, highlightCandidates };
  }

  // 3. Lightweight network fetch (respecting server Cache-Control headers)
  try {
    const res = await fetch('/api/anime/recent?page=1');
    if (res.ok) {
      const json = await res.json();
      if (json?.success && Array.isArray(json.data)) {
        for (const ep of json.data.slice(0, 15)) {
          const c = formatEpisodeCandidate(ep);
          if (c && !episodeCandidates.some((x) => x.key === c.key)) {
            episodeCandidates.unshift(c);
          }
        }
      }
    }
  } catch {}

  try {
    const mangaOrigin = preferredMode === 'manga' ? 'manhwa' : 'all';
    const res = await fetch(`/api/manga/hub?origin=${mangaOrigin}&page=1`);
    if (res.ok) {
      const json = await res.json();
      const latestManga = Array.isArray(json?.data?.latest) ? json.data.latest : [];
      const trendingManga = Array.isArray(json?.data?.trending) ? json.data.trending : [];
      for (const item of [...latestManga.slice(0, 6), ...trendingManga.slice(0, 6)]) {
        const c = formatMangaCandidate(item);
        if (c && !highlightCandidates.some((x) => x.key === c.key)) {
          highlightCandidates.push(c);
        }
      }
    }
  } catch {}

  return { episodeCandidates, highlightCandidates };
}

function seedKnownEpisodesIfEmpty(episodes: DiscoveryAlertCandidate[]): boolean {
  const known = readBoundedHistory(KNOWN_EPISODES_KEY);
  if (known.length === 0 && episodes.length > 0) {
    writeBoundedHistory(
      KNOWN_EPISODES_KEY,
      episodes.map((e) => e.key),
      120
    );
    return true;
  }
  return false;
}

export function initExternalDiscoveryNotifications(options: {
  getHomeMode: () => 'anime' | 'manga';
  onNavigateLink?: (linkTo: string) => void;
}): () => void {
  if (typeof window === 'undefined') return () => {};

  let disposed = false;
  let cachedCandidates: {
    episodeCandidates: DiscoveryAlertCandidate[];
    highlightCandidates: DiscoveryAlertCandidate[];
  } = { episodeCandidates: [], highlightCandidates: [] };

  const warmPool = async () => {
    if (disposed) return;

    // Seed immediately from local device cache if available without hitting the network on every tab return
    const cachedRecent = recentEpisodesLocal.getCached(1);
    if (cachedRecent?.items?.length && cachedCandidates.episodeCandidates.length === 0) {
      const seeded: DiscoveryAlertCandidate[] = [];
      for (const ep of cachedRecent.items.slice(0, 12)) {
        const c = formatEpisodeCandidate(ep);
        if (c) seeded.push(c);
      }
      if (seeded.length > 0) {
        cachedCandidates = { ...cachedCandidates, episodeCandidates: seeded };
        seedKnownEpisodesIfEmpty(seeded);
      }
    }

    const lastWarmAt = Number(localStorage.getItem(LAST_WARM_POOL_AT_KEY) || '0');
    if (Date.now() - lastWarmAt < WARM_POOL_COOLDOWN_MS) return;

    localStorage.setItem(LAST_WARM_POOL_AT_KEY, String(Date.now()));
    const result = await fetchLiveDiscoveryCandidates(options.getHomeMode());
    if (disposed) return;
    cachedCandidates = result;
    seedKnownEpisodesIfEmpty(result.episodeCandidates);
  };

  const isAppVisible = () =>
    typeof document !== 'undefined' && document.visibilityState === 'visible';

  const checkForBrandNewReleasesWhileHidden = async () => {
    if (disposed || isAppVisible()) return;

    const lastLiveAt = Number(localStorage.getItem(LAST_LIVE_DISCOVERY_AT_KEY) || '0');
    if (Date.now() - lastLiveAt < LIVE_DISCOVERY_COOLDOWN_MS) return;

    const { episodeCandidates, highlightCandidates } = await fetchLiveDiscoveryCandidates(
      options.getHomeMode()
    );
    if (disposed || isAppVisible()) return;

    cachedCandidates = { episodeCandidates, highlightCandidates };

    const wasSeededNow = seedKnownEpisodesIfEmpty(episodeCandidates);
    if (wasSeededNow) return;

    const knownEpKeys = readBoundedHistory(KNOWN_EPISODES_KEY);
    const brandNewEpisode = episodeCandidates.find(
      (ep) => !knownEpKeys.includes(ep.key) && !hasSystemNotificationBeenSent(ep.key)
    );

    if (brandNewEpisode) {
      writeBoundedHistory(KNOWN_EPISODES_KEY, [...knownEpKeys, brandNewEpisode.key], 120);
      markSystemNotificationSent(brandNewEpisode.key);
      localStorage.setItem(LAST_LIVE_DISCOVERY_AT_KEY, String(Date.now()));

      await dispatchNativeSystemNotification({
        id: brandNewEpisode.key,
        title: brandNewEpisode.title,
        body: brandNewEpisode.body,
        imageUrl: brandNewEpisode.imageUrl,
        tag: brandNewEpisode.key,
        extra: { linkTo: brandNewEpisode.linkTo },
        onClick: () => options.onNavigateLink?.(brandNewEpisode.linkTo),
      });
      return;
    }

    // Otherwise check for an unseen new trending anime or manhwa highlight
    const knownDiscoveryKeys = readBoundedHistory(KNOWN_DISCOVERY_KEY);
    const preferredHighlight =
      options.getHomeMode() === 'manga'
        ? highlightCandidates.find(
            (h) =>
              h.kind === 'new_manga' &&
              !knownDiscoveryKeys.includes(h.key) &&
              !hasSystemNotificationBeenSent(h.key)
          ) ||
          highlightCandidates.find(
            (h) => !knownDiscoveryKeys.includes(h.key) && !hasSystemNotificationBeenSent(h.key)
          )
        : highlightCandidates.find(
            (h) => !knownDiscoveryKeys.includes(h.key) && !hasSystemNotificationBeenSent(h.key)
          );

    if (preferredHighlight) {
      writeBoundedHistory(KNOWN_DISCOVERY_KEY, [...knownDiscoveryKeys, preferredHighlight.key], 120);
      markSystemNotificationSent(preferredHighlight.key);
      localStorage.setItem(LAST_LIVE_DISCOVERY_AT_KEY, String(Date.now()));

      await dispatchNativeSystemNotification({
        id: preferredHighlight.key,
        title: preferredHighlight.title,
        body: preferredHighlight.body,
        imageUrl: preferredHighlight.imageUrl,
        tag: preferredHighlight.key,
        extra: { linkTo: preferredHighlight.linkTo },
        onClick: () => options.onNavigateLink?.(preferredHighlight.linkTo),
      });
    }
  };

  const scheduleUpcomingNativeDiscovery = async () => {
    if (!Capacitor.isNativePlatform()) return;
    await cancelNativeSystemNotifications(SCHEDULED_DISCOVERY_IDS);

    const { episodeCandidates, highlightCandidates } = cachedCandidates;
    const pickEpisode =
      episodeCandidates.find((c) => !hasSystemNotificationBeenSent(`sched:${c.key}`)) ||
      episodeCandidates[0];

    const preferredMode = options.getHomeMode();
    const pickHighlight =
      (preferredMode === 'manga'
        ? highlightCandidates.find(
            (c) => c.kind === 'new_manga' && !hasSystemNotificationBeenSent(`sched:${c.key}`)
          )
        : highlightCandidates.find(
            (c) => c.kind === 'new_anime' && !hasSystemNotificationBeenSent(`sched:${c.key}`)
          )) ||
      highlightCandidates.find((c) => !hasSystemNotificationBeenSent(`sched:${c.key}`)) ||
      highlightCandidates[0];

    if (pickEpisode) {
      markSystemNotificationSent(`sched:${pickEpisode.key}`);
      await dispatchNativeSystemNotification({
        id: SCHEDULED_DISCOVERY_IDS[0],
        title: pickEpisode.title,
        body: pickEpisode.body,
        imageUrl: pickEpisode.imageUrl,
        scheduleAt: computeNextFriendlyTimestamp(4 * 60 * 60 * 1000),
        extra: { linkTo: pickEpisode.linkTo },
      });
    }

    if (pickHighlight && pickHighlight.key !== pickEpisode?.key) {
      markSystemNotificationSent(`sched:${pickHighlight.key}`);
      await dispatchNativeSystemNotification({
        id: SCHEDULED_DISCOVERY_IDS[1],
        title: pickHighlight.title,
        body: pickHighlight.body,
        imageUrl: pickHighlight.imageUrl,
        scheduleAt: computeNextFriendlyTimestamp(22 * 60 * 60 * 1000),
        extra: { linkTo: pickHighlight.linkTo },
      });
    }
  };

  const handleVisibilityChange = () => {
    if (document.visibilityState === 'visible') {
      void cancelNativeSystemNotifications(SCHEDULED_DISCOVERY_IDS);
      void warmPool();
    } else {
      void scheduleUpcomingNativeDiscovery();
    }
  };

  // Clear pending re-engagement reminders immediately when user opens the app
  void cancelNativeSystemNotifications(SCHEDULED_DISCOVERY_IDS);
  const initialTimer = window.setTimeout(() => {
    void warmPool();
  }, 4500);

  const pollTimer = window.setInterval(() => {
    if (document.visibilityState === 'hidden') {
      void checkForBrandNewReleasesWhileHidden();
    } else {
      void warmPool();
    }
  }, LIVE_POLL_INTERVAL_MS);

  document.addEventListener('visibilitychange', handleVisibilityChange);

  return () => {
    disposed = true;
    window.clearTimeout(initialTimer);
    window.clearInterval(pollTimer);
    document.removeEventListener('visibilitychange', handleVisibilityChange);
  };
}
