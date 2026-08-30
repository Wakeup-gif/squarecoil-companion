'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const {
  BING_ORIGIN_PATTERN, CACHE_KEY, CACHE_MAX_AGE_MS, FRESH_CACHE_MAX_AGE_MS, MAX_IMAGE_BYTES,
  WALLPAPER_STATUS, metadataUrl, extractBingImageId, canonicalBingImageUrl,
  normalizeBingImageUrl, createWallpaperProvider
} = require('../../src/extension/wallpaper-provider');

const root = path.resolve(__dirname, '..', '..');

function responseHeaders(values = {}) {
  const normalized = new Map(Object.entries(values).map(([key, value]) => [key.toLowerCase(), String(value)]));
  return { get(name) { return normalized.get(String(name).toLowerCase()) ?? null; } };
}

test('UT-B5-CINE-013 provider policy sends only fixed public Bing parameters and rejects unapproved image URLs', async () => {
  const requests = [];
  const permissions = { async contains() { return true; }, async request() { return true; }, async remove() { return true; } };
  const storage = { async get() { return {}; }, async set() {} };
  const fetch = async (url, init) => {
    requests.push(String(url));
    assert.equal(init.redirect, 'error');
    if (requests.length === 1) return { ok: true, url: String(url), redirected: false, async json() { return { images: [{
      url: '/th?id=OHR.PublicWallpaper_UHD.jpg&rf=LaDigue_UHD.jpg&pid=hp&w=3840&h=2160&rs=1&c=4', title: 'Public image', startdate: '20260828'
    }] }; } };
    return { ok: true, url: String(url), redirected: false,
      headers: responseHeaders({ 'content-type': 'image/jpeg', 'content-length': '4' }),
      async arrayBuffer() { return Uint8Array.from([1, 2, 3, 4]).buffer; } };
  };
  const provider = createWallpaperProvider({ permissions, storage, fetch, markets: ['en-US'] });
  const result = await provider.getWallpaper();
  assert.equal(result.ok, true); assert.equal(result.source, 'REMOTE');
  assert.equal(result.statusCode, WALLPAPER_STATUS.ACTIVE);
  assert.equal(requests[0], metadataUrl());
  assert.equal(requests[1], 'https://www.bing.com/th?id=OHR.PublicWallpaper_UHD.jpg&w=3840&h=2160&rs=1&c=4');
  assert.equal(requests.every(url => !/squarecoil|project|timer|user|job/i.test(new URL(url).search)), true);
  assert.equal(normalizeBingImageUrl('https://evil.example/th?id=OHR.X_UHD.jpg'), null);
  assert.equal(normalizeBingImageUrl('https://www.bing.com/th?id=private-value'), null);
});

test('UT-B5-CINE-021 current Bing image shape is reduced to one internally controlled canonical request', () => {
  const current = 'https://www.bing.com/th?id=OHR.CurrentWallpaper_UHD.jpg&rf=LaDigue_UHD.jpg&pid=hp&w=3840&h=2160&rs=1&c=4';
  const canonical = 'https://www.bing.com/th?id=OHR.CurrentWallpaper_UHD.jpg&w=3840&h=2160&rs=1&c=4';
  assert.equal(normalizeBingImageUrl(current), canonical);
  assert.equal(normalizeBingImageUrl('/th?id=OHR.CurrentWallpaper_UHD.jpg&rf=LaDigue_UHD.jpg&pid=hp'),
    canonical);
  assert.equal(extractBingImageId(current), 'OHR.CurrentWallpaper_UHD.jpg');
  assert.equal(canonicalBingImageUrl('OHR.CurrentWallpaper_UHD.jpg'), canonical);
});

test('UT-B5-CINE-030 reordered and additional Bing metadata parameters are discarded instead of forwarded', () => {
  const canonical = 'https://www.bing.com/th?id=OHR.CurrentWallpaper_UHD.jpg&w=3840&h=2160&rs=1&c=4';
  assert.equal(normalizeBingImageUrl('/th?pid=changed&c=999&id=OHR.CurrentWallpaper_UHD.jpg&newFlag=anything&w=12&rf=https%3A%2F%2Fevil.example%2Fx.jpg'), canonical);
  assert.equal(normalizeBingImageUrl('/th?tracking=value&id=OHR.CurrentWallpaper_UHD.jpg&idOnlyMetadata=no'), canonical);
});

test('UT-B5-CINE-031 duplicate, encoded-path, malformed, or non-public image IDs fail closed', () => {
  assert.equal(normalizeBingImageUrl('/th?id=OHR.CurrentWallpaper_UHD.jpg&id=OHR.Duplicate_UHD.jpg'), null);
  assert.equal(normalizeBingImageUrl('/th?id=OHR.Bad%2FPath_UHD.jpg'), null);
  assert.equal(normalizeBingImageUrl('/th?id=OHR.Bad%5CPath_UHD.jpg'), null);
  assert.equal(normalizeBingImageUrl('/th?id=OHR.CurrentWallpaper.jpg'), null);
  assert.equal(normalizeBingImageUrl('/th?id=ohr.CurrentWallpaper_UHD.jpg'), null);
  assert.equal(normalizeBingImageUrl('/th?id=OHR.%00CurrentWallpaper_UHD.jpg'), null);
  assert.equal(normalizeBingImageUrl('/th?other=1'), null);
});

test('UT-B5-CINE-032 wrong origins, ports, protocols, credentials, paths, fragments, and private URLs fail closed', () => {
  assert.equal(normalizeBingImageUrl('https://www.bing.com/other?id=OHR.CurrentWallpaper_UHD.jpg'), null);
  assert.equal(normalizeBingImageUrl('https://images.example/th?id=OHR.CurrentWallpaper_UHD.jpg'), null);
  assert.equal(normalizeBingImageUrl('http://www.bing.com/th?id=OHR.CurrentWallpaper_UHD.jpg'), null);
  assert.equal(normalizeBingImageUrl('https://www.bing.com:444/th?id=OHR.CurrentWallpaper_UHD.jpg'), null);
  assert.equal(normalizeBingImageUrl('https://user@www.bing.com/th?id=OHR.CurrentWallpaper_UHD.jpg'), null);
  assert.equal(normalizeBingImageUrl('https://127.0.0.1/th?id=OHR.CurrentWallpaper_UHD.jpg'), null);
  assert.equal(normalizeBingImageUrl('https://www.bing.com/th/private?id=OHR.CurrentWallpaper_UHD.jpg'), null);
  assert.equal(normalizeBingImageUrl('https://www.bing.com/th?id=OHR.CurrentWallpaper_UHD.jpg#fragment'), null);
});

test('UT-B5-CINE-015 only the toolbar popup can request optional Bing access; removal remains cache-clearing', async () => {
  const calls = [];
  const permissions = {
    async contains(details) { calls.push(['contains', details]); return false; },
    async remove(details) { calls.push(['remove', details]); return true; }
  };
  const storage = { async get() { return {}; }, async set() {}, async remove(key) { calls.push(['cache-remove', key]); } };
  const provider = createWallpaperProvider({ permissions, storage, fetch: async () => { throw new Error('unexpected-fetch'); } });
  assert.equal(provider.requestPermission, undefined);
  assert.deepEqual(await provider.removePermission(), { ok: true, removed: true, cacheCleared: true, reason: null });
  assert.deepEqual(calls, [
    ['remove', { origins: [BING_ORIGIN_PATTERN] }],
    ['cache-remove', CACHE_KEY]
  ]);
  const controller = fs.readFileSync(path.join(root, 'src/content/controller.js'), 'utf8');
  const background = fs.readFileSync(path.join(root, 'src/extension/background-entry.js'), 'utf8');
  const popup = fs.readFileSync(path.join(root, 'src/popup/popup.js'), 'utf8');
  assert.doesNotMatch(controller, /SC_COMPANION_B5B_REQUEST_PERMISSION|permissions\?\.request/);
  assert.doesNotMatch(background, /SC_COMPANION_B5B_REQUEST_PERMISSION/);
  assert.match(popup, /enableWallpaper[^]*addEventListener\('click', grantWallpaperPermission\)/);
  assert.match(popup, /chrome\.permissions\?\.request\?\.\(\{ origins: \[BING_ORIGIN_PATTERN\] \}\)/);
});

test('UT-B5-CINE-016 concurrent consumers share one provider retrieval', async () => {
  let fetchCalls = 0;
  let releaseMetadata;
  let markMetadataStarted;
  const metadataStarted = new Promise(resolve => { markMetadataStarted = resolve; });
  const permissions = { async contains() { return true; }, async request() { return true; }, async remove() { return true; } };
  const storage = { async get() { return {}; }, async set() {}, async remove() {} };
  const fetch = async url => {
    fetchCalls += 1;
    if (fetchCalls === 1) {
      markMetadataStarted();
      await new Promise(resolve => { releaseMetadata = resolve; });
      return { ok: true, url: String(url), redirected: false,
        async json() { return { images: [{ url: '/th?id=OHR.Shared_UHD.jpg' }] }; } };
    }
    return { ok: true, url: String(url), redirected: false,
      headers: responseHeaders({ 'content-type': 'image/jpeg', 'content-length': '1' }),
      async arrayBuffer() { return Uint8Array.from([1]).buffer; } };
  };
  const provider = createWallpaperProvider({ permissions, storage, fetch, markets: ['en-US'] });
  const first = provider.getWallpaper();
  const second = provider.getWallpaper();
  await metadataStarted;
  releaseMetadata();
  const [a, b] = await Promise.all([first, second]);
  assert.deepEqual(a, b); assert.equal(a.source, 'REMOTE'); assert.equal(fetchCalls, 2);
});

test('UT-B5-CINE-017 fresh cache is reused without permission or network access', async () => {
  let permissionChecks = 0; let fetchCalls = 0;
  const now = 50_000_000;
  const cached = { schemaVersion: 1, fetchedAtMs: now - FRESH_CACHE_MAX_AGE_MS + 1,
    dataUrl: 'data:image/jpeg;base64,AQ==', title: 'Fresh cache', imageDate: '20260828' };
  const permissions = { async contains() { permissionChecks += 1; return false; }, async request() { return false; }, async remove() { return false; } };
  const storage = { async get() { return { [CACHE_KEY]: cached }; }, async set() {}, async remove() {} };
  const provider = createWallpaperProvider({ permissions, storage, now: () => now, fetch: async () => { fetchCalls += 1; } });
  const result = await provider.getWallpaper();
  assert.equal(result.ok, true); assert.equal(result.source, 'CACHE_FRESH');
  assert.equal(permissionChecks, 0); assert.equal(fetchCalls, 0);
});

test('UT-B5-CINE-018 invalid or future-dated cache is removed and fails closed', async () => {
  const removed = [];
  const now = 50_000_000;
  let value = { schemaVersion: 1, fetchedAtMs: now + 1, dataUrl: 'data:image/jpeg;base64,AQ==' };
  const permissions = { async contains() { return false; }, async request() { return false; }, async remove() { return false; } };
  const storage = { async get() { return value ? { [CACHE_KEY]: value } : {}; }, async set() {},
    async remove(key) { removed.push(key); value = null; } };
  const provider = createWallpaperProvider({ permissions, storage, now: () => now, fetch: async () => { throw new Error('unexpected-fetch'); } });
  const result = await provider.getWallpaper();
  assert.equal(result.ok, false); assert.equal(result.reason, 'optional-origin-permission-required');
  assert.deepEqual(removed, [CACHE_KEY]);
});

test('UT-B5-CINE-026 permission removal invalidates an active fetch and cannot repopulate revoked cache', async () => {
  let permitted = true;
  let releaseImage;
  let markImageStarted;
  const imageStarted = new Promise(resolve => { markImageStarted = resolve; });
  let cached = null;
  let setCalls = 0;
  const permissions = {
    async contains() { return permitted; },
    async request() { permitted = true; return true; },
    async remove() { permitted = false; return true; }
  };
  const storage = {
    async get() { return cached ? { [CACHE_KEY]: cached } : {}; },
    async set(value) { setCalls += 1; cached = value[CACHE_KEY]; },
    async remove() { cached = null; }
  };
  let fetchCalls = 0;
  const fetch = async url => {
    fetchCalls += 1;
    if (fetchCalls === 1) return { ok: true, url: String(url), redirected: false,
      async json() { return { images: [{ url: '/th?id=OHR.Revoked_UHD.jpg' }] }; } };
    markImageStarted();
    await new Promise(resolve => { releaseImage = resolve; });
    return { ok: true, url: String(url), redirected: false,
      headers: responseHeaders({ 'content-type': 'image/jpeg', 'content-length': '1' }),
      async arrayBuffer() { return Uint8Array.from([1]).buffer; } };
  };
  const provider = createWallpaperProvider({ permissions, storage, fetch, markets: ['en-US'] });
  const retrieval = provider.getWallpaper();
  await imageStarted;
  const removal = await provider.removePermission();
  releaseImage();
  const result = await retrieval;
  assert.equal(removal.cacheCleared, true);
  assert.equal(result.ok, false);
  assert.match(result.reason, /provider-invalidated|optional-origin-permission-required/);
  assert.equal(setCalls, 0);
  assert.equal(cached, null);
  const after = await provider.getWallpaper();
  assert.equal(after.ok, false);
  assert.equal(after.reason, 'optional-origin-permission-required');
});

test('UT-B5-CINE-027 redirected metadata or image responses never cross the exact Bing boundary', async () => {
  const permissions = { async contains() { return true; }, async request() { return true; }, async remove() { return true; } };
  let setCalls = 0;
  const storage = { async get() { return {}; }, async set() { setCalls += 1; }, async remove() {} };
  let calls = 0;
  const fetch = async (url, init) => {
    calls += 1;
    assert.equal(init.redirect, 'error');
    if (calls === 1) return { ok: true, url: String(url), redirected: false,
      async json() { return { images: [{ url: '/th?id=OHR.Redirected_UHD.jpg' }] }; } };
    return { ok: true, url: 'https://images.example/redirected.jpg', redirected: true,
      headers: responseHeaders({ 'content-type': 'image/jpeg', 'content-length': '1' }),
      async arrayBuffer() { return Uint8Array.from([1]).buffer; } };
  };
  const result = await createWallpaperProvider({ permissions, storage, fetch, markets: ['en-US'] }).getWallpaper();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bing-response-rejected');
  assert.equal(result.detail, 'response-origin-policy-rejected');
  assert.equal(result.statusCode, WALLPAPER_STATUS.RESPONSE_REJECTED);
  assert.equal(setCalls, 0);
});

test('UT-B5-CINE-028 a lying content length cannot bypass the streamed image byte ceiling', async () => {
  const permissions = { async contains() { return true; }, async request() { return true; }, async remove() { return true; } };
  let setCalls = 0;
  const storage = { async get() { return {}; }, async set() { setCalls += 1; }, async remove() {} };
  let calls = 0;
  const fetch = async url => {
    calls += 1;
    if (calls === 1) return { ok: true, url: String(url), redirected: false,
      async json() { return { images: [{ url: '/th?id=OHR.Oversized_UHD.jpg' }] }; } };
    const chunks = [new Uint8Array(MAX_IMAGE_BYTES), new Uint8Array([1])];
    return { ok: true, url: String(url), redirected: false,
      headers: responseHeaders({ 'content-type': 'image/jpeg', 'content-length': '1' }),
      body: { getReader() { return { async read() { return chunks.length ? { done: false, value: chunks.shift() } : { done: true }; }, async cancel() {} }; } } };
  };
  const result = await createWallpaperProvider({ permissions, storage, fetch, markets: ['en-US'] }).getWallpaper();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'bing-response-rejected');
  assert.equal(result.detail, 'body-size-rejected');
  assert.equal(setCalls, 0);
});

test('UT-B5-CINE-029 the request deadline remains active while a response body is stalled', async () => {
  const permissions = { async contains() { return true; }, async request() { return true; }, async remove() { return true; } };
  const storage = { async get() { return {}; }, async set() { throw new Error('unexpected-cache-write'); }, async remove() {} };
  let calls = 0;
  const fetch = async (url, init) => {
    calls += 1;
    if (calls === 1) return { ok: true, url: String(url), redirected: false,
      async json() { return { images: [{ url: '/th?id=OHR.Stalled_UHD.jpg' }] }; } };
    return { ok: true, url: String(url), redirected: false,
      headers: responseHeaders({ 'content-type': 'image/jpeg' }),
      body: { getReader() { return {
        read() { return new Promise((resolve, reject) => {
          const abort = () => reject(new DOMException('Aborted', 'AbortError'));
          if (init.signal.aborted) abort();
          else init.signal.addEventListener('abort', abort, { once: true });
        }); },
        async cancel() {}
      }; } } };
  };
  const startedAt = Date.now();
  const result = await createWallpaperProvider({ permissions, storage, fetch, markets: ['en-US'], requestTimeoutMs: 20 }).getWallpaper();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'network-unavailable');
  assert.equal(result.statusCode, WALLPAPER_STATUS.NETWORK_UNAVAILABLE);
  assert.ok(Date.now() - startedAt < 500, 'stalled body exceeded the bounded test deadline');
});

test('UT-B5-CINE-033 missing optional permission reports its own state and never reaches the network', async () => {
  let fetchCalls = 0;
  const permissions = { async contains() { return false; }, async remove() { return false; } };
  const storage = { async get() { return {}; }, async set() {}, async remove() {} };
  const result = await createWallpaperProvider({ permissions, storage,
    fetch: async () => { fetchCalls += 1; } }).getWallpaper();
  assert.equal(result.ok, false);
  assert.equal(result.reason, 'optional-origin-permission-required');
  assert.equal(result.statusCode, WALLPAPER_STATUS.PERMISSION_REQUIRED);
  assert.equal(fetchCalls, 0);
});

test('UT-B5-CINE-034 HTTP failures and invalid image content types are Bing response rejections', async () => {
  const permissions = { async contains() { return true; }, async remove() { return true; } };
  const storage = { async get() { return {}; }, async set() {}, async remove() {} };
  for (const failure of ['http', 'content-type']) {
    let calls = 0;
    const fetch = async url => {
      calls += 1;
      if (calls === 1) return { ok: true, url: String(url), redirected: false,
        async json() { return { images: [{ url: '/th?id=OHR.ResponsePolicy_UHD.jpg' }] }; } };
      if (failure === 'http') return { ok: false, status: 503, url: String(url), redirected: false,
        headers: responseHeaders({ 'content-type': 'text/plain', 'content-length': '0' }), async arrayBuffer() { return new ArrayBuffer(0); } };
      return { ok: true, status: 200, url: String(url), redirected: false,
        headers: responseHeaders({ 'content-type': 'image/svg+xml', 'content-length': '4' }),
        async arrayBuffer() { return Uint8Array.from([1, 2, 3, 4]).buffer; } };
    };
    const result = await createWallpaperProvider({ permissions, storage, fetch, markets: ['en-US'] }).getWallpaper();
    assert.equal(result.ok, false);
    assert.equal(result.reason, 'bing-response-rejected');
    assert.equal(result.statusCode, WALLPAPER_STATUS.RESPONSE_REJECTED);
    assert.match(result.detail, failure === 'http' ? /image-http-503/ : /image-content-type-rejected/);
  }
});

test('UT-B5-CINE-035 an older safe cache is retained after network failure with both states preserved', async () => {
  const now = 90_000_000;
  const cached = { schemaVersion: 1, fetchedAtMs: now - FRESH_CACHE_MAX_AGE_MS - 1,
    dataUrl: 'data:image/jpeg;base64,AQ==', title: 'Previously validated', imageDate: '20260828' };
  const permissions = { async contains() { return true; }, async remove() { return true; } };
  const storage = { async get() { return { [CACHE_KEY]: cached }; }, async set() {}, async remove() {} };
  const result = await createWallpaperProvider({ permissions, storage, now: () => now, markets: ['en-US'],
    fetch: async () => { throw new TypeError('Failed to fetch'); } }).getWallpaper();
  assert.equal(result.ok, true);
  assert.equal(result.source, 'CACHE_RETAINED');
  assert.equal(result.statusCode, WALLPAPER_STATUS.RETAINED_CACHE);
  assert.equal(result.failureCode, WALLPAPER_STATUS.NETWORK_UNAVAILABLE);
  assert.equal(result.dataUrl, cached.dataUrl);
});

test('UT-B5-CINE-036 an older safe cache is retained after a rejected Bing response', async () => {
  const now = 90_000_000;
  const cached = { schemaVersion: 1, fetchedAtMs: now - FRESH_CACHE_MAX_AGE_MS - 1,
    dataUrl: 'data:image/webp;base64,AQ==', title: 'Previously validated' };
  const permissions = { async contains() { return true; }, async remove() { return true; } };
  const storage = { async get() { return { [CACHE_KEY]: cached }; }, async set() {}, async remove() {} };
  const result = await createWallpaperProvider({ permissions, storage, now: () => now, markets: ['en-US'],
    fetch: async url => ({ ok: false, status: 500, url: String(url), redirected: false,
      headers: responseHeaders({ 'content-type': 'application/json', 'content-length': '0' }), async arrayBuffer() { return new ArrayBuffer(0); } }) }).getWallpaper();
  assert.equal(result.ok, true);
  assert.equal(result.source, 'CACHE_RETAINED');
  assert.equal(result.failureCode, WALLPAPER_STATUS.RESPONSE_REJECTED);
});

test('UT-B5-CINE-037 expired cache is removed and cannot be presented as retained wallpaper', async () => {
  const now = 900_000_000;
  let removed = false;
  const cached = { schemaVersion: 1, fetchedAtMs: now - CACHE_MAX_AGE_MS - 1,
    dataUrl: 'data:image/jpeg;base64,AQ==' };
  const permissions = { async contains() { return false; }, async remove() { return true; } };
  const storage = { async get() { return { [CACHE_KEY]: cached }; }, async set() {}, async remove() { removed = true; } };
  const result = await createWallpaperProvider({ permissions, storage, now: () => now,
    fetch: async () => { throw new Error('unexpected-fetch'); } }).getWallpaper();
  assert.equal(result.ok, false);
  assert.equal(result.statusCode, WALLPAPER_STATUS.PERMISSION_REQUIRED);
  assert.equal(removed, true);
});

test('UT-B5-CINE-038 fixed Bing requests contain no private Companion or SquareCoil vocabulary', () => {
  const metadata = new URL(metadataUrl('en-US'));
  const image = new URL(canonicalBingImageUrl('OHR.PrivacyBoundary_UHD.jpg'));
  for (const request of [metadata, image]) {
    assert.equal(request.protocol, 'https:');
    assert.equal(request.hostname, 'www.bing.com');
    assert.doesNotMatch(`${request.pathname}${request.search}`,
      /job|page|user|timer|identity|cookie|referrer|account|squarecoil|project|customer/i);
  }
  assert.deepEqual([...image.searchParams.keys()], ['id', 'w', 'h', 'rs', 'c']);
});
