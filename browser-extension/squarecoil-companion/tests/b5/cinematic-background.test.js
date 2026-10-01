'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  CINEMATIC_STYLE_ID, CINEMATIC_HOST_ID, CINEMATIC_ATTRIBUTE, CINEMATIC_STATUS,
  decodedImageSizeIsSafe, createCinematicBackground
} = require('../../src/presentation/cinematic-background');

class Element {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase(); this.id = ''; this.className = ''; this.parent = null; this.children = [];
    this.attributes = new Map(); this.styleValues = new Map(); this.stylePriorities = new Map();
    this.style = {
      setProperty: (name, value, priority = '') => { this.styleValues.set(name, value); this.stylePriorities.set(name, priority); },
      removeProperty: name => { const value = this.styleValues.get(name) || ''; this.styleValues.delete(name); this.stylePriorities.delete(name); return value; },
      getPropertyValue: name => this.styleValues.get(name) || '',
      getPropertyPriority: name => this.stylePriorities.get(name) || ''
    };
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return name === 'id' ? this.id || null : this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'id') this.id = ''; }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  prepend(child) { child.parent = this; this.children.unshift(child); return child; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
  querySelector(selector) {
    const match = /^\[data-layer="([ab])"\]$/.exec(selector);
    if (match) return this.children.find(child => child.getAttribute('data-layer') === match[1]) || null;
    return null;
  }
}

function media(matches = false) {
  const listeners = new Set();
  return { matches, listeners, addEventListener(_type, listener) { listeners.add(listener); },
    removeEventListener(_type, listener) { listeners.delete(listener); },
    set(value) { this.matches = value; for (const listener of [...listeners]) listener(); } };
}

function harness(options = {}) {
  const root = new Element('html'); const head = new Element('head'); const body = new Element('body');
  root.appendChild(head); root.appendChild(body);
  const forced = media(false); const transparency = media(false); const motion = media(options.reducedMotion === true);
  const listeners = new Map(); const timers = new Map(); let timerId = 0;
  const all = () => [root, ...root.children, ...head.children, ...body.children,
    ...body.children.flatMap(child => child.children || [])];
  const document = {
    documentElement: root, head, body, hidden: options.hidden === true,
    createElement(tag) { return new Element(tag); },
    getElementById(id) { return all().find(node => node.id === id) || null; },
    querySelectorAll(selector) {
      const ids = [...String(selector).matchAll(/#([A-Za-z0-9_-]+)/g)].map(match => match[1]);
      return all().filter(node => ids.includes(node.id));
    },
    addEventListener(type, listener) { listeners.set(type, listener); },
    removeEventListener(type, listener) { if (listeners.get(type) === listener) listeners.delete(type); }
  };
  const window = {
    matchMedia(query) { if (query.includes('forced-colors')) return forced; if (query.includes('transparency')) return transparency; return motion; },
    setTimeout(callback, delay) { const id = ++timerId; timers.set(id, { callback, delay }); return id; },
    clearTimeout(id) { timers.delete(id); },
    Image: class {}
  };
  let calls = 0;
  let imageLoads = 0;
  let warmSettles = 0;
  const provider = options.provider || (async () => ({ ok: true, source: 'REMOTE', dataUrl: 'data:image/png;base64,AAAA' }));
  const service = createCinematicBackground({ document, window, refreshIntervalMs: 1000, now: options.now,
    initialWallpaper: options.initialWallpaper, onWarmSettled: () => { warmSettles += 1; },
    fetchWallpaper: request => { calls += 1; return provider(request, calls); },
    loadImage: dataUrl => { imageLoads += 1; return options.loadImage ? options.loadImage(dataUrl) : true; } });
  return { service, document, window, root, head, body, forced, transparency, motion, listeners, timers,
    calls: () => calls, imageLoads: () => imageLoads, warmSettles: () => warmSettles,
    fireVisibility() { listeners.get('visibilitychange')?.(); } };
}

function prefs(values = {}) {
  return { preferencesSchemaVersion: 2, preferenceRevision: values.revision || 1,
    timerAppearance: 'LIGHT', panelFinish: 'SOLID', websiteTheme: values.theme || 'SLEEK_DARK',
    cinematicBackground: values.cinematic || 'CINEMATIC',
    yellowMinutes: 60, orangeMinutes: 120, redMinutes: 240 };
}

const sleek = { websiteThemeEffective: 'SLEEK_DARK', forcedColors: false, reducedTransparency: false };
const light = { websiteThemeEffective: 'LIGHT_GLASS', forcedColors: false, reducedTransparency: false };

test('UT-B5-CINE-001 an older Glass plus NONE snapshot automatically restores the integrated background', () => {
  const h = harness();
  const snapshot = h.service.apply(prefs({ cinematic: 'NONE' }), sleek);
  assert.equal(snapshot.state, 'LOADING_INITIAL'); assert.equal(h.calls(), 1);
  assert.ok(h.document.getElementById(CINEMATIC_HOST_ID));
});

test('UT-B5-CINE-002 eligible enable displays only after candidate image readiness', async () => {
  let resolveReady; const h = harness({ loadImage: () => new Promise(resolve => { resolveReady = resolve; }) });
  h.service.apply(prefs(), sleek); await Promise.resolve();
  assert.equal(h.service.snapshot().state, 'LOADING_INITIAL'); assert.equal(h.service.snapshot().imageDisplayed, false);
  resolveReady(true); await h.service.refresh();
  assert.equal(h.service.snapshot().state, 'SHOWING'); assert.equal(h.service.snapshot().imageDisplayed, true);
});

test('UT-B5-CINE-051 unrelated preference revisions keep one in-flight wallpaper request', async () => {
  let finishFetch;
  const h = harness({ provider: () => new Promise(resolve => { finishFetch = resolve; }) });
  h.service.apply(prefs(), sleek);
  const host = h.document.getElementById(CINEMATIC_HOST_ID);
  assert.equal(h.calls(), 1);
  h.service.apply(prefs({ revision: 2 }), sleek);
  assert.equal(h.calls(), 1);
  assert.equal(h.document.getElementById(CINEMATIC_HOST_ID), host);
  finishFetch({ ok: true, source: 'REMOTE', dataUrl: 'data:image/png;base64,AAAA' });
  await h.service.refresh();
  assert.equal(h.service.snapshot().state, 'SHOWING');
  h.service.teardown();
});

test('UT-B5-CINE-003 current good image stays displayed while a refresh is pending', async () => {
  let secondResolve; const h = harness({ provider: async (_request, count) => count === 1
    ? { ok: true, source: 'REMOTE', dataUrl: 'data:image/png;base64,AAAA' }
    : new Promise(resolve => { secondResolve = resolve; }) });
  h.service.apply(prefs(), sleek); await h.service.refresh();
  const refresh = h.service.refresh('manual'); await Promise.resolve();
  assert.equal(h.service.snapshot().state, 'REFRESHING'); assert.equal(h.service.snapshot().imageDisplayed, true);
  secondResolve({ ok: true, source: 'REMOTE', dataUrl: 'data:image/png;base64,BBBB' }); await refresh;
});

test('UT-B5-CINE-004 remote and cache failure degrades to an approved embedded fallback', async () => {
  const h = harness({ provider: async () => ({ ok: false, reason: 'network-down' }) });
  h.service.apply(prefs(), sleek); await h.service.refresh();
  assert.equal(h.service.snapshot().state, 'DEGRADED_FALLBACK'); assert.equal(h.service.snapshot().source, 'FALLBACK');
});

test('UT-B5-CINE-005 failed candidate readiness never replaces the current accepted image', async () => {
  let loads = 0; const h = harness({ loadImage: () => ++loads === 1,
    provider: async (_request, count) => ({ ok: true, source: 'REMOTE', dataUrl: `data:image/png;base64,${count === 1 ? 'AAAA' : 'BBBB'}` }) });
  h.service.apply(prefs(), sleek); await h.service.refresh();
  await h.service.refresh('manual');
  assert.equal(h.service.snapshot().state, 'SHOWING');
  assert.equal(h.service.snapshot().reason, 'bing-response-rejected');
  assert.equal(h.service.snapshot().failureCode, CINEMATIC_STATUS.RESPONSE_REJECTED);
});

test('UT-B5-CINE-006 a late request cannot overwrite a newer theme generation', async () => {
  let resolveProvider; const h = harness({ provider: () => new Promise(resolve => { resolveProvider = resolve; }) });
  h.service.apply(prefs(), sleek); await Promise.resolve();
  h.service.apply(prefs({ revision: 2, theme: 'ORIGINAL' }), { websiteThemeEffective: 'ORIGINAL' });
  resolveProvider({ ok: true, source: 'REMOTE', dataUrl: 'data:image/png;base64,AAAA' }); await Promise.resolve(); await Promise.resolve();
  assert.equal(h.service.snapshot().state, 'DISABLED'); assert.equal(h.document.getElementById(CINEMATIC_HOST_ID), null);
});

test('UT-B5-CINE-007 Original derives the background off and removes cinematic artifacts', async () => {
  const h = harness(); h.service.apply(prefs(), sleek); await h.service.refresh();
  const snapshot = h.service.apply(prefs({ revision: 2, theme: 'ORIGINAL' }), { websiteThemeEffective: 'ORIGINAL' });
  assert.equal(snapshot.preference, 'NONE'); assert.equal(snapshot.state, 'DISABLED');
  assert.equal(h.root.getAttribute(CINEMATIC_ATTRIBUTE), null);
});

test('UT-B5-CINE-008 returning to Glass starts its integrated background again and raw NONE cannot split it', async () => {
  const h = harness(); h.service.apply(prefs(), sleek); await h.service.refresh();
  h.service.apply(prefs({ revision: 2, theme: 'ORIGINAL' }), { websiteThemeEffective: 'ORIGINAL' });
  const restored = h.service.apply(prefs({ revision: 3 }), sleek);
  assert.equal(restored.state, 'LOADING_INITIAL');
  await h.service.refresh();
  assert.equal(h.service.snapshot().state, 'SHOWING'); assert.equal(h.service.snapshot().imageDisplayed, true);
  const off = h.service.apply(prefs({ revision: 4, cinematic: 'NONE' }), sleek);
  assert.notEqual(off.state, 'DISABLED');
});

test('UT-B5-CINE-009 reduced motion keeps the selected image static', async () => {
  const h = harness({ reducedMotion: true }); h.service.apply(prefs(), sleek); await h.service.refresh();
  assert.equal(h.service.snapshot().reducedMotion, true);
  assert.equal(h.document.getElementById(CINEMATIC_HOST_ID).getAttribute('data-reduced-motion'), 'true');
});

test('UT-B5-CINE-010 forced colors suspends presentation while preserving Cinematic', async () => {
  const h = harness(); h.service.apply(prefs(), sleek); await h.service.refresh();
  h.forced.set(true);
  assert.equal(h.service.snapshot().state, 'SUSPENDED_ACCESSIBILITY');
  assert.equal(h.service.snapshot().preference, 'CINEMATIC'); assert.equal(h.document.getElementById(CINEMATIC_HOST_ID), null);
});

test('UT-B5-CINE-011 hidden and visible lifecycle does not stack requests or refresh timers', async () => {
  const h = harness({ hidden: true }); h.service.apply(prefs(), sleek);
  assert.equal(h.calls(), 0); assert.equal(h.timers.size, 0);
  h.document.hidden = false; h.fireVisibility(); await h.service.refresh();
  assert.equal(h.calls(), 1); assert.equal(h.timers.size, 1);
  h.fireVisibility(); assert.equal(h.timers.size, 1);
});

test('UT-B5-CINE-043 an overdue hidden image refreshes on return without fetching while hidden', async () => {
  let clock = 10000;
  const h = harness({ now: () => clock });
  h.service.apply(prefs(), sleek); await h.service.refresh();
  assert.equal(h.service.snapshot().nextRefreshAtMs, 11000);
  h.document.hidden = true; h.fireVisibility();
  assert.equal(h.timers.size, 0);
  assert.equal(h.service.snapshot().nextRefreshAtMs, 11000);
  clock = 15000;
  await h.service.refresh('scheduled');
  assert.equal(h.calls(), 1, 'no hidden-page network refresh');
  h.document.hidden = false; h.fireVisibility();
  assert.equal(h.calls(), 2, 'overdue wallpaper starts refreshing immediately on return');
  await h.service.refresh();
  assert.equal(h.timers.size, 1);
  assert.equal(h.service.snapshot().nextRefreshAtMs, 16000);
  h.service.teardown();
});

test('UT-B5-CINE-044 repeated tab switching preserves the deadline and Native still clears it', async () => {
  let clock = 0;
  const h = harness({ now: () => clock });
  h.service.apply(prefs(), sleek); await h.service.refresh();
  for (clock = 100; clock <= 900; clock += 100) {
    h.document.hidden = true; h.fireVisibility();
    assert.equal(h.timers.size, 0);
    h.document.hidden = false; h.fireVisibility();
    assert.equal(h.calls(), 1);
    assert.equal(h.service.snapshot().nextRefreshAtMs, 1000, 'visibility changes must not postpone rotation');
    assert.equal(h.timers.size, 1);
    assert.equal([...h.timers.values()][0].delay, 1000 - clock);
  }
  const [timerId, timer] = [...h.timers][0];
  h.timers.delete(timerId); timer.callback(); await h.service.refresh();
  assert.equal(h.calls(), 2);
  assert.equal(h.service.snapshot().nextRefreshAtMs, 2000);
  h.document.hidden = true; h.fireVisibility();
  h.service.apply(prefs({ theme: 'ORIGINAL', revision: 2 }), { websiteThemeEffective: 'ORIGINAL' });
  h.document.hidden = false; h.fireVisibility();
  assert.equal(h.service.snapshot().nextRefreshAtMs, null);
  assert.equal(h.timers.size, 0);
  assert.equal(h.calls(), 2);
  assert.equal(h.document.getElementById(CINEMATIC_HOST_ID), null);
  h.service.teardown();
});

test('UT-B5-CINE-012 teardown and recovery own at most one host and style', async () => {
  const h = harness(); h.service.apply(prefs(), sleek); await h.service.refresh();
  assert.equal(h.document.querySelectorAll(`#${CINEMATIC_HOST_ID}`).length, 1);
  h.service.teardown();
  assert.equal(h.document.querySelectorAll(`#${CINEMATIC_HOST_ID}`).length, 0);
  assert.equal(h.document.querySelectorAll(`#${CINEMATIC_STYLE_ID}`).length, 0);
});

test('UT-B5-CINE-014 provider failure changes no supplied Timer Ledger or native-clock state', async () => {
  const authority = { timer: { state: 'RUNNING', revision: 9 }, ledger: [{ segmentId: 's1' }], nativeMutationAttempts: 0 };
  const before = structuredClone(authority);
  const h = harness({ provider: async () => { throw new Error('provider-failed'); } });
  h.service.apply(prefs(), sleek); await h.service.refresh();
  assert.deepEqual(authority, before);
});

test('UT-B5-CINE-019 removed owned nodes are restored once without a second provider request', async () => {
  const h = harness(); h.service.apply(prefs(), sleek); await h.service.refresh();
  const host = h.document.getElementById(CINEMATIC_HOST_ID); const style = h.document.getElementById(CINEMATIC_STYLE_ID);
  host.remove(); style.remove();
  const restored = h.service.apply(prefs(), sleek);
  assert.equal(restored.state, 'SHOWING'); assert.equal(restored.ownedHostCount, 1); assert.equal(restored.ownedStyleCount, 1);
  assert.equal(h.calls(), 1);
});

test('UT-B5-CINE-020 fresh cache is healthy presentation evidence rather than remote-failure degradation', async () => {
  const h = harness({ provider: async () => ({ ok: true, source: 'CACHE_FRESH', reason: 'fresh-cache-reused',
    dataUrl: 'data:image/jpeg;base64,AQ==' }) });
  h.service.apply(prefs(), sleek); await h.service.refresh();
  assert.equal(h.service.snapshot().state, 'SHOWING'); assert.equal(h.service.snapshot().source, 'CACHE_FRESH');
  assert.equal(h.service.snapshot().statusCode, CINEMATIC_STATUS.RECENT_CACHE);
});

test('UT-B5-CINE-022 a no-permission fallback keeps its truthful reason across Dark to Light restoration', async () => {
  const h = harness({ provider: async () => ({ ok: false, reason: 'bing-origin-access-restricted' }) });
  h.service.apply(prefs(), sleek); await h.service.refresh();
  assert.equal(h.service.snapshot().state, 'DEGRADED_FALLBACK');
  assert.equal(h.service.snapshot().reason, 'bing-origin-access-restricted');

  const restored = h.service.apply(prefs({ revision: 2, theme: 'LIGHT_GLASS' }), light);
  assert.equal(restored.state, 'DEGRADED_FALLBACK');
  assert.equal(restored.source, 'FALLBACK');
  assert.equal(restored.reason, 'bing-origin-access-restricted');
  assert.equal(h.document.getElementById(CINEMATIC_HOST_ID).getAttribute('data-theme'), 'LIGHT_GLASS');
});

test('UT-B5-CINE-023 accessibility suspension wins when forced colors makes the effective website theme Native', () => {
  const h = harness();
  const snapshot = h.service.apply(prefs(), {
    websiteThemeEffective: 'ORIGINAL',
    forcedColors: true,
    reducedTransparency: false
  });
  assert.equal(snapshot.state, 'SUSPENDED_ACCESSIBILITY');
  assert.equal(snapshot.reason, 'accessibility-override');
  assert.equal(snapshot.preference, 'CINEMATIC');
  assert.equal(h.calls(), 0);
});

test('UT-B5-CINE-024 a retained remote image keeps its truthful source across a transient theme suspension', async () => {
  const h = harness();
  h.service.apply(prefs(), sleek); await h.service.refresh();
  assert.equal(h.service.snapshot().source, 'REMOTE');

  const suspended = h.service.apply(prefs({ revision: 2 }), { websiteThemeEffective: 'ORIGINAL' });
  assert.equal(suspended.state, 'SUSPENDED_THEME');
  assert.equal(suspended.source, null);
  assert.equal(suspended.imageDisplayed, false);

  const restored = h.service.apply(prefs({ revision: 3 }), sleek);
  assert.equal(restored.state, 'SHOWING');
  assert.equal(restored.source, 'REMOTE');
  assert.equal(restored.imageDisplayed, true);
  assert.equal(h.calls(), 1);
});

test('UT-B5-CINE-025 a retained cache image restores as degraded cache instead of losing provenance', async () => {
  const h = harness({ provider: async () => ({ ok: true, source: 'CACHE_RETAINED', reason: 'network-unavailable',
    failureCode: CINEMATIC_STATUS.NETWORK_UNAVAILABLE,
    dataUrl: 'data:image/jpeg;base64,AQ==' }) });
  h.service.apply(prefs(), sleek); await h.service.refresh();
  assert.equal(h.service.snapshot().state, 'DEGRADED_CACHE');
  assert.equal(h.service.snapshot().source, 'CACHE_RETAINED');
  assert.equal(h.service.snapshot().statusCode, CINEMATIC_STATUS.RETAINED_CACHE);
  assert.equal(h.service.snapshot().failureCode, CINEMATIC_STATUS.NETWORK_UNAVAILABLE);

  h.service.apply(prefs({ revision: 2 }), { websiteThemeEffective: 'ORIGINAL' });
  const restored = h.service.apply(prefs({ revision: 3 }), sleek);
  assert.equal(restored.state, 'DEGRADED_CACHE');
  assert.equal(restored.source, 'CACHE_RETAINED');
  assert.equal(restored.imageDisplayed, true);
  assert.equal(h.calls(), 1);
});

test('UT-B5-CINE-045 a warm page paints the cached image immediately and reuses it without decoding', async () => {
  const dataUrl = 'data:image/jpeg;base64,AQ==';
  const h = harness({ initialWallpaper: { dataUrl, source: 'CACHE_FRESH' },
    provider: async () => ({ ok: true, source: 'CACHE_FRESH', reason: 'fresh-cache-reused', dataUrl }) });
  const initial = h.service.apply(prefs(), sleek);
  assert.equal(initial.state, 'SHOWING');
  assert.equal(initial.imageDisplayed, true);
  assert.equal(h.warmSettles(), 1);
  assert.equal(h.calls(), 0);
  assert.equal(h.imageLoads(), 0);
  const active = h.document.getElementById(CINEMATIC_HOST_ID).children.find(child => child.getAttribute('data-active') === 'true');
  assert.match(active.style.getPropertyValue('--us-squarecoil-cine-image'), /^url\("data:image\/jpeg/);
  await h.service.refresh('manual');
  assert.equal(h.calls(), 1);
  assert.equal(h.imageLoads(), 0);
  assert.equal(h.warmSettles(), 1);
});

test('UT-B5-CINE-046 an old warm cache stays visible while one update is requested', async () => {
  let resolveProvider;
  const h = harness({ initialWallpaper: { dataUrl: 'data:image/jpeg;base64,AQ==', source: 'CACHE_RETAINED' },
    provider: () => new Promise(resolve => { resolveProvider = resolve; }) });
  const initial = h.service.apply(prefs(), sleek);
  assert.equal(initial.imageDisplayed, true);
  assert.equal(h.calls(), 1);
  assert.equal(h.imageLoads(), 0);
  assert.equal(h.warmSettles(), 1);
  resolveProvider({ ok: false, reason: 'network-unavailable' });
  await h.service.refresh();
  assert.equal(h.service.snapshot().imageDisplayed, true);
  assert.equal(h.calls(), 1);
});

test('UT-B5-CINE-047 a warm gradient stays until the offline fallback host is ready', async () => {
  const h = harness({ initialWallpaper: { dataUrl: null, source: 'FALLBACK' },
    provider: async () => ({ ok: false, reason: 'network-unavailable' }) });
  h.service.apply(prefs(), sleek);
  assert.ok(h.document.getElementById(CINEMATIC_HOST_ID));
  assert.equal(h.warmSettles(), 1);
  await h.service.refresh();
  assert.equal(h.service.snapshot().state, 'DEGRADED_FALLBACK');
  assert.equal(h.warmSettles(), 1);
  assert.equal(h.imageLoads(), 0);
});

test('UT-B5-CINE-048 a missing painted layer is repaired even when cache returns the same image', async () => {
  const dataUrl = 'data:image/jpeg;base64,AQ==';
  const h = harness({ initialWallpaper: { dataUrl, source: 'CACHE_FRESH' },
    provider: async () => ({ ok: true, source: 'CACHE_FRESH', dataUrl }) });
  h.service.apply(prefs(), sleek);
  const host = h.document.getElementById(CINEMATIC_HOST_ID);
  const active = host.children.find(child => child.getAttribute('data-active') === 'true');
  active.style.removeProperty('--us-squarecoil-cine-image');
  await h.service.refresh('manual');
  assert.equal(h.service.snapshot().imageDisplayed, true);
  assert.equal(h.imageLoads(), 1);
  assert.equal(host.children.filter(child => child.getAttribute('data-active') === 'true').length, 1);
  assert.equal(host.children.filter(child => child.style.getPropertyValue('--us-squarecoil-cine-image')).length, 1);
});

test('UT-B5-CINE-039 the active layer owns an important authoritative image property under both Glass themes', async () => {
  const h = harness();
  h.service.apply(prefs(), sleek); await h.service.refresh();
  let host = h.document.getElementById(CINEMATIC_HOST_ID);
  let active = host.children.find(child => child.getAttribute('data-active') === 'true');
  assert.match(active.style.getPropertyValue('--us-squarecoil-cine-image'), /^url\("data:image\/png/);
  assert.equal(active.style.getPropertyPriority('--us-squarecoil-cine-image'), 'important');
  assert.equal(active.style.getPropertyValue('background-image'), '');

  h.service.apply(prefs({ revision: 2, theme: 'LIGHT_GLASS' }), light);
  host = h.document.getElementById(CINEMATIC_HOST_ID);
  active = host.children.find(child => child.getAttribute('data-active') === 'true');
  assert.equal(host.getAttribute('data-theme'), 'LIGHT_GLASS');
  assert.equal(active.style.getPropertyPriority('--us-squarecoil-cine-image'), 'important');
});

test('UT-B5-CINE-040 decoded image dimensions reject empty, excessive-axis, and decompression-bomb candidates', () => {
  assert.equal(decodedImageSizeIsSafe(3840, 2160), true);
  assert.equal(decodedImageSizeIsSafe(0, 2160), false);
  assert.equal(decodedImageSizeIsSafe(9000, 1000), false);
  assert.equal(decodedImageSizeIsSafe(8000, 6000), false);
  assert.equal(decodedImageSizeIsSafe(100.5, 100), false);
});

test('UT-B5-CINE-041 fallback, permission, rejection, network, cache, and accessibility statuses remain distinct', async () => {
  for (const [reason, expected] of [
    ['bing-origin-access-restricted', CINEMATIC_STATUS.ACCESS_RESTRICTED],
    ['bing-response-rejected', CINEMATIC_STATUS.RESPONSE_REJECTED],
    ['network-unavailable', CINEMATIC_STATUS.NETWORK_UNAVAILABLE]
  ]) {
    const h = harness({ provider: async () => ({ ok: false, reason, failureCode: expected, statusCode: expected }) });
    h.service.apply(prefs(), sleek); await h.service.refresh();
    const snapshot = h.service.snapshot();
    assert.equal(snapshot.statusCode, expected);
    assert.equal(snapshot.failureCode, expected);
    assert.equal(snapshot.fallbackStatus, CINEMATIC_STATUS.GRADIENT_FALLBACK);
  }
  const accessible = harness();
  const snapshot = accessible.service.apply(prefs(), { websiteThemeEffective: 'ORIGINAL', forcedColors: true });
  assert.equal(snapshot.statusCode, CINEMATIC_STATUS.ACCESSIBILITY_OVERRIDE);
  assert.equal(snapshot.fallbackStatus, 'NONE');
});
