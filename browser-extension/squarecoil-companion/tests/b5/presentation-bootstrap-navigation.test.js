'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { CACHE_KEY } = require('../../src/presentation/wallpaper-cache');

const source = fs.readFileSync(path.join(__dirname, '..', '..', 'src', 'content', 'presentation-bootstrap.js'), 'utf8');
const AUTHORITY_KEY = 'squarecoilCompanionB2AuthorityV1';

function element(tag = 'div') {
  const attributes = new Map();
  const values = new Map();
  const priorities = new Map();
  const classes = new Set();
  return {
    tagName: tag.toUpperCase(), children: [], style: {
      setProperty(name, value, priority = '') { values.set(name, value); priorities.set(name, priority); },
      getPropertyValue: name => values.get(name) || '',
      getPropertyPriority: name => priorities.get(name) || '',
      removeProperty(name) { values.delete(name); priorities.delete(name); }
    },
    classList: { add: (...names) => names.forEach(name => classes.add(name)), remove: name => classes.delete(name) },
    setAttribute: (name, value) => attributes.set(name, String(value)),
    getAttribute: name => attributes.get(name) ?? null,
    removeAttribute: name => attributes.delete(name),
    appendChild(child) { child.parent = this; this.children.push(child); return child; },
    remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); }
  };
}

function harness(options = {}) {
  const root = element('html');
  const head = element('head');
  root.appendChild(head);
  const all = () => [root, ...root.children, ...head.children];
  const document = {
    documentElement: root, head,
    createElement: element,
    getElementById: id => all().find(item => item.id === id) || null
  };
  const listeners = new Map();
  const window = {
    location: { pathname: '/project.php' },
    matchMedia: () => ({ matches: false }),
    setTimeout: () => 1, clearTimeout() {},
    addEventListener: (name, callback) => listeners.set(name, callback),
    removeEventListener: name => listeners.delete(name)
  };
  window.top = window;
  let themeWrites = 0;
  let fetches = 0;
  let markerApplies = 0;
  let markerSchedules = 0;
  let storageListener;
  let theme = 'SLEEK_DARK';
  let releaseFetch;
  const rawCache = { schemaVersion: 1, fetchedAtMs: Date.now(), dataUrl: 'data:image/jpeg;base64,AQ==' };
  const storedPreferences = () => ({ websiteTheme: theme,
    ...(options.photoOff ? { preferencesSchemaVersion: 3, cinematicBackground: 'NONE' } : {}) });
  const storage = {
    local: { async get() { return { timerEnabled: true,
      [AUTHORITY_KEY]: { document: { dataSafety: { preferences: storedPreferences() } } },
      [CACHE_KEY]: options.noCache ? null : rawCache }; } },
    onChanged: { addListener(listener) { storageListener = listener; }, removeListener() {} }
  };
  const context = { document, window,
    chrome: { storage, runtime: { getURL: value => value } },
    fetch: async () => { fetches += 1;
      if (options.deferFetch) await new Promise(resolve => { releaseFetch = resolve; });
      return { ok: true, text: async () => '/* Presentation-only port of the pinned SquareCoil Tampermonkey source chain */' }; },
    require(request) {
      if (request.includes('presentation-markers')) return { createPresentationMarkers: () => ({
        apply() { markerApplies += 1; }, schedule() { markerSchedules += 1; }, remove() {}, teardown() {}
      }) };
      if (request.includes('build-identity')) return { CANDIDATE_FINGERPRINT: 'test' };
      if (request.includes('wallpaper-cache')) return require('../../src/presentation/wallpaper-cache');
      throw new Error(request);
    },
    module: { exports: {} }, Date, Map, Set, Object, String, Boolean
  };
  const originalCreate = document.createElement;
  document.createElement = tag => {
    const created = originalCreate(tag);
    let content = '';
    Object.defineProperty(created, 'textContent', {
      get: () => content,
      set(value) { content = value; if (created.id === 'squarecoil-companion-site-theme') themeWrites += 1; }
    });
    return created;
  };
  vm.runInNewContext(source, context);
  const api = context.__squareCoilCompanionPresentationBootstrap;
  return { api, root, window, listeners, rawCache,
    releaseFetch: () => releaseFetch?.(),
    changeTheme(value) { const previous = theme; theme = value; storageListener({ [AUTHORITY_KEY]: {
      oldValue: { document: { dataSafety: { preferences: { websiteTheme: previous } } } },
      newValue: { document: { dataSafety: { preferences: { websiteTheme: value } } } }
    } }, 'local'); },
    unrelatedWrite() { storageListener({ [AUTHORITY_KEY]: { oldValue: { document: { dataSafety: { preferences: { websiteTheme: theme } } } },
      newValue: { document: { dataSafety: { preferences: { websiteTheme: theme } } } } } }, 'local'); },
    stats: () => ({ themeWrites, fetches, markerApplies, markerSchedules }) };
}

test('UT-B5-THEME-033 timer storage writes and same-route events do not reapply the Glass stylesheet', async () => {
  const h = harness();
  await h.api.reconcileStored('settle');
  assert.equal(h.api.snapshot().activeTheme, 'SLEEK_DARK');
  assert.deepEqual(h.stats(), { themeWrites: 1, fetches: 1, markerApplies: 1, markerSchedules: 0 });
  for (let index = 0; index < 10; index += 1) h.unrelatedWrite();
  h.listeners.get('pageshow')();
  await Promise.resolve();
  await h.api.reconcile('SLEEK_DARK', 'controller-reapply');
  assert.deepEqual(h.stats(), { themeWrites: 1, fetches: 1, markerApplies: 1, markerSchedules: 0 });
  h.window.location.pathname = '/project_designs.php';
  h.listeners.get('pageshow')();
  assert.equal(h.stats().markerSchedules, 1);
  h.api.teardown();
});

test('UT-B5-THEME-034 a cached photograph warms the page and gives ownership to the cinematic host', async () => {
  const h = harness();
  await h.api.reconcileStored('settle');
  assert.equal(h.api.warmWallpaper().dataUrl, h.rawCache.dataUrl);
  assert.equal(h.root.getAttribute('data-squarecoil-companion-warm-wallpaper'), 'active');
  assert.match(h.root.style.getPropertyValue('background-image'), /^url\("data:image\/jpeg/);
  h.api.releaseWarmWallpaper();
  assert.equal(h.root.style.getPropertyValue('background-image'), '');
  assert.equal(h.root.getAttribute('data-squarecoil-companion-warm-wallpaper'), null);
  h.changeTheme('ORIGINAL');
  await h.api.reconcileStored('native');
  assert.equal(h.api.snapshot().activeTheme, 'ORIGINAL');
  assert.equal(h.api.warmWallpaper(), null);
  h.api.teardown();
});

test('UT-B5-THEME-035 an offline page starts with the same dark fallback gradient', async () => {
  const h = harness({ noCache: true });
  await h.api.reconcileStored('settle');
  assert.equal(h.api.warmWallpaper().source, 'FALLBACK');
  assert.equal(h.api.warmWallpaper().dataUrl, null);
  assert.match(h.root.style.getPropertyValue('background-image'), /^radial-gradient/);
  h.api.releaseWarmWallpaper();
  assert.equal(h.root.style.getPropertyValue('background-image'), '');
  h.api.teardown();
});

test('UT-B5-THEME-036 the cached wallpaper paints before a slow theme stylesheet resolves', async () => {
  const h = harness({ deferFetch: true });
  const pending = h.api.reconcile('SLEEK_DARK', 'early-paint', h.rawCache);
  assert.equal(h.api.warmWallpaper().dataUrl, h.rawCache.dataUrl);
  assert.match(h.root.style.getPropertyValue('background-image'), /^url\("data:image\/jpeg/);
  assert.equal(h.api.snapshot().stylePresent, false);
  await Promise.resolve();
  h.releaseFetch();
  await pending;
  h.api.teardown();
});

test('UT-B5-THEME-037 turning Bing photos off never prepaints a retained cached photograph', async () => {
  const h = harness({ photoOff: true });
  await h.api.reconcileStored('settle');
  assert.equal(h.api.warmWallpaper().source, 'FALLBACK');
  assert.equal(h.api.warmWallpaper().dataUrl, null);
  assert.match(h.root.style.getPropertyValue('background-image'), /^radial-gradient/);
  h.api.teardown();
});
