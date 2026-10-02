'use strict';

const CACHE_KEY = 'squarecoilCompanionB5BWallpaperCacheV1';
const CACHE_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
const FRESH_CACHE_MAX_AGE_MS = 30 * 60 * 1000;
const FALLBACK_BACKGROUNDS = Object.freeze({
  SLEEK_DARK: 'radial-gradient(circle at 18% 10%,rgba(49,117,151,.92) 0,rgba(26,55,73,.76) 24%,transparent 47%),radial-gradient(circle at 82% 16%,rgba(76,56,123,.62) 0,transparent 38%),linear-gradient(145deg,#132531 0%,#0b141d 48%,#070b10 100%)',
  LIGHT_GLASS: 'radial-gradient(circle at 18% 10%,rgba(255,255,255,.98) 0,rgba(223,239,248,.86) 30%,transparent 55%),radial-gradient(circle at 78% 18%,rgba(163,205,226,.58) 0,transparent 43%),linear-gradient(145deg,#d9e9f2 0%,#bfd4e0 52%,#91adbd 100%)'
});

function cachedWallpaper(raw, nowMs) {
  const item = raw?.[CACHE_KEY];
  if (!item || item.schemaVersion !== 1 || !Number.isSafeInteger(item.fetchedAtMs) ||
      item.fetchedAtMs > nowMs || nowMs - item.fetchedAtMs > CACHE_MAX_AGE_MS) return null;
  if (!/^data:image\/(?:jpeg|png|webp);base64,[A-Za-z0-9+/=]+$/i.test(String(item.dataUrl || '')) ||
      String(item.dataUrl).length > 6_000_000) return null;
  return item;
}

module.exports = { CACHE_KEY, CACHE_MAX_AGE_MS, FRESH_CACHE_MAX_AGE_MS, FALLBACK_BACKGROUNDS, cachedWallpaper };
