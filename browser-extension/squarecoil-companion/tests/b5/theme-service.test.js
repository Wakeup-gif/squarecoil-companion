'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { STYLE_ID, ROOT_THEME_ATTRIBUTE, ROOT_ROUTE_ATTRIBUTE, EDITOR_STYLE_ID, EDITOR_FRAME_ATTRIBUTE,
  DARK_WEBSITE_LOGO_PATH, ROUTE_BY_PATH, classifyWebsiteRoute, createThemeService } = require('../../src/presentation/theme-service');

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.id = '';
    this.textContent = '';
    this.attributes = new Map();
    this.children = [];
    this.parent = null;
    this.listeners = new Map();
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return name === 'id' ? this.id || null : this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'id') this.id = ''; }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  addEventListener(type, listener) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(listener);
  }
  removeEventListener(type, listener) { this.listeners.get(type)?.delete(listener); }
  dispatch(type) { for (const listener of this.listeners.get(type) || []) listener({ target: this }); }
  matches(selector) { return this.tagName === 'IMG' ? selector.includes('img') : this.tagName === 'HEADER' && selector.includes('header.navbar'); }
  contains(element) { return this === element || this.children.some(child => child.contains?.(element)); }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(child => child !== this); this.parent = null; }
}

function editorFrame() {
  const frame = new FakeElement('iframe');
  const root = new FakeElement('html');
  const head = new FakeElement('head');
  const body = new FakeElement('body');
  const listeners = new Map();
  frame.contentDocument = {
    documentElement: root,
    head,
    body,
    createElement(tag) { return new FakeElement(tag); },
    getElementById(id) { return head.children.find(child => child.id === id) || null; }
  };
  frame.addEventListener = (type, listener) => listeners.set(type, listener);
  frame.removeEventListener = (type, listener) => { if (listeners.get(type) === listener) listeners.delete(type); };
  return { frame, head, listeners };
}

function media(matches = false) {
  const listeners = new Set();
  return {
    matches,
    listeners,
    addEventListener(_type, listener) { listeners.add(listener); },
    removeEventListener(_type, listener) { listeners.delete(listener); },
    set(value) { this.matches = value; for (const listener of [...listeners]) listener({ matches: value }); }
  };
}

function harness({ glass = true, logoInitiallyAvailable = true,
  pathname = '/dashboard.php', editorFrames = [], assetUrlAvailable = true } = {}) {
  const root = new FakeElement('html');
  const head = new FakeElement('head');
  let logo = new FakeElement('img');
  logo.setAttribute('src', '/native-logo.png');
  const dark = media(false);
  const forced = media(false);
  const reducedTransparency = media(false);
  const documentListeners = new Map();
  const windowListeners = new Map();
  const observers = new Set();
  let logoAvailable = logoInitiallyAvailable;
  const document = {
    documentElement: root,
    head,
    createElement(tag) { return new FakeElement(tag); },
    querySelector(selector) { return selector.includes('img') && logoAvailable ? logo : null; },
    querySelectorAll(selector) {
      if (selector === `#${STYLE_ID}`) return head.children.filter(child => child.id === STYLE_ID);
      if (selector === 'iframe.cke_wysiwyg_frame') return editorFrames;
      return [];
    },
    addEventListener(type, listener) { documentListeners.set(type, listener); },
    removeEventListener(type, listener) { if (documentListeners.get(type) === listener) documentListeners.delete(type); }
  };
  const window = {
    location: { pathname },
    MutationObserver: class {
      constructor(callback) { this.callback = callback; this.connected = false; observers.add(this); }
      observe(target, options) { this.connected = true; this.target = target; this.options = options; }
      disconnect() { this.connected = false; }
    },
    matchMedia(query) {
      if (query.includes('forced-colors')) return forced;
      if (query.includes('reduced-transparency')) return reducedTransparency;
      return dark;
    },
    CSS: { supports() { return glass; } },
    addEventListener(type, listener) { windowListeners.set(type, listener); },
    removeEventListener(type, listener) { if (windowListeners.get(type) === listener) windowListeners.delete(type); }
  };
  const service = createThemeService({ document, window,
    resolveAssetUrl: path => assetUrlAvailable ? `chrome-extension://test/${path}` : null });
  return { service, document, window, root, head, get logo() { return logo; }, dark, forced, reducedTransparency, documentListeners, windowListeners, observers,
    showLogo() { logoAvailable = true; },
    replaceLogo(source = '/new-native-logo.png') {
      const previous = logo;
      logo = new FakeElement('img');
      logo.setAttribute('src', source);
      return previous;
    },
    mutate(records) { for (const observer of observers) if (observer.connected) observer.callback(records); }
  };
}

function preferences(values = {}) {
  return { preferencesSchemaVersion: 1, preferenceRevision: values.preferenceRevision || 1,
    timerAppearance: values.timerAppearance || 'LIGHT', panelFinish: values.panelFinish || 'SOLID',
    websiteTheme: values.websiteTheme || 'ORIGINAL', yellowMinutes: 60, orangeMinutes: 120, redMinutes: 240 };
}

test('UT-B5-THEME-001 Refined Light reapplication owns exactly one style layer and Original removes only that layer', () => {
  const h = harness();
  const unrelated = new FakeElement('style');
  unrelated.id = 'native-squarecoil-style';
  h.head.appendChild(unrelated);
  h.service.apply(preferences({ websiteTheme: 'REFINED_LIGHT' }));
  h.service.apply(preferences({ websiteTheme: 'REFINED_LIGHT' }));
  assert.equal(h.document.querySelectorAll(`#${STYLE_ID}`).length, 1);
  assert.equal(h.root.getAttribute(ROOT_THEME_ATTRIBUTE), 'REFINED_LIGHT');
  h.service.apply(preferences({ websiteTheme: 'ORIGINAL', preferenceRevision: 2 }));
  assert.equal(h.document.querySelectorAll(`#${STYLE_ID}`).length, 0);
  assert.equal(h.head.children.includes(unrelated), true);
});

test('UT-B5-THEME-041 unrelated preference commits do not rewrite the same site logo', () => {
  const h = harness();
  const setAttribute = h.logo.setAttribute.bind(h.logo);
  let logoWrites = 0;
  h.logo.setAttribute = (name, value) => { logoWrites += 1; setAttribute(name, value); };
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  const initialWrites = logoWrites;
  assert.ok(initialWrites > 0);
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK', preferenceRevision: 2 }));
  assert.equal(logoWrites, initialWrites);
  h.service.teardown();
});

test('UT-B5-THEME-042 pageshow keeps an unchanged local theme layer and updates only its route', () => {
  const h = harness({ pathname: '/project.php' });
  h.service.apply(preferences({ websiteTheme: 'REFINED_LIGHT' }));
  const style = h.document.querySelectorAll(`#${STYLE_ID}`)[0];
  let cssWrites = 0;
  let currentCss = style.textContent;
  Object.defineProperty(style, 'textContent', {
    get() { return currentCss; },
    set(value) { cssWrites += 1; currentCss = value; }
  });
  h.windowListeners.get('pageshow')();
  assert.equal(h.document.querySelectorAll(`#${STYLE_ID}`)[0], style);
  assert.equal(cssWrites, 0);
  h.window.location.pathname = '/project_designs.php';
  h.windowListeners.get('pageshow')();
  assert.equal(h.document.querySelectorAll(`#${STYLE_ID}`)[0], style);
  assert.equal(h.root.getAttribute(ROOT_ROUTE_ATTRIBUTE), 'PROJECT_DESIGNS');
  assert.equal(cssWrites, 0);
  h.service.teardown();
});

test('UT-B5-THEME-043 repeated CKEditor scans keep the same style bytes and frame marker', () => {
  const editor = editorFrame();
  const h = harness({ pathname: '/project_designs.php', editorFrames: [editor.frame] });
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  const style = editor.head.children.find(child => child.id === EDITOR_STYLE_ID);
  let cssWrites = 0;
  let currentCss = style.textContent;
  Object.defineProperty(style, 'textContent', {
    get() { return currentCss; },
    set(value) { cssWrites += 1; currentCss = value; }
  });
  let markerWrites = 0;
  const setAttribute = editor.frame.setAttribute.bind(editor.frame);
  editor.frame.setAttribute = (name, value) => { markerWrites += 1; setAttribute(name, value); };
  h.windowListeners.get('pageshow')();
  editor.listeners.get('load')();
  assert.equal(editor.head.children.find(child => child.id === EDITOR_STYLE_ID), style);
  assert.equal(cssWrites, 0);
  assert.equal(markerWrites, 0);
  h.service.teardown();
});

test('UT-B5-THEME-002 Auto keeps one current color-scheme listener and changes only effective presentation', () => {
  const h = harness();
  const auto = preferences({ timerAppearance: 'AUTO' });
  assert.equal(h.service.apply(auto).timerAppearanceEffective, 'LIGHT');
  assert.equal(h.dark.listeners.size, 1);
  h.service.apply(auto);
  assert.equal(h.dark.listeners.size, 1);
  h.dark.set(true);
  const changed = h.service.snapshot();
  assert.equal(changed.timerAppearancePreference, 'AUTO');
  assert.equal(changed.timerAppearanceEffective, 'DARK');
  h.service.apply(preferences({ timerAppearance: 'LIGHT', preferenceRevision: 2 }));
  assert.equal(h.dark.listeners.size, 0);
});

test('UT-B5-THEME-003 unsupported Glass retains the preference and reports Solid fallback', () => {
  const h = harness({ glass: false });
  const snapshot = h.service.apply(preferences({ panelFinish: 'GLASS' }));
  assert.equal(snapshot.panelFinishPreference, 'GLASS');
  assert.equal(snapshot.panelFinishEffective, 'SOLID_FALLBACK');
});

test('UT-B5-THEME-100 Clear uses glass and responds to reduced transparency without rewriting the preference', () => {
  const h = harness();
  assert.equal(h.service.apply(preferences({ timerAppearance: 'CLEAR', panelFinish: 'SOLID' })).panelFinishEffective, 'GLASS');
  h.reducedTransparency.set(true);
  const snapshot = h.service.snapshot();
  assert.equal(snapshot.timerAppearancePreference, 'CLEAR');
  assert.equal(snapshot.panelFinishEffective, 'SOLID_FALLBACK');
});

test('UT-B5-THEME-004 forced colors yields native website presentation without rewriting the durable theme', () => {
  const h = harness();
  h.forced.set(true);
  const snapshot = h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK', panelFinish: 'GLASS' }));
  assert.equal(snapshot.websiteThemePreference, 'SLEEK_DARK');
  assert.equal(snapshot.websiteThemeEffective, 'ORIGINAL');
  assert.equal(snapshot.panelFinishEffective, 'SOLID_FALLBACK');
  assert.equal(h.document.querySelectorAll(`#${STYLE_ID}`).length, 0);
  assert.equal(h.root.getAttribute(ROOT_ROUTE_ATTRIBUTE), null);
});

test('UT-B5-THEME-005 Sleek Dark uses the approved bundled custom logo', () => {
  const h = harness();
  const snapshot = h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  assert.equal(snapshot.websiteThemeEffective, 'SLEEK_DARK');
  assert.equal(snapshot.logoStatus, 'dark-logo-loading');
  assert.equal(h.logo.getAttribute('src'), `chrome-extension://test/${DARK_WEBSITE_LOGO_PATH}`);
});

test('UT-B5-THEME-006 teardown removes listeners and Companion-owned presentation resources', () => {
  const h = harness();
  h.service.apply(preferences({ timerAppearance: 'AUTO', panelFinish: 'GLASS', websiteTheme: 'REFINED_LIGHT' }));
  assert.equal(h.dark.listeners.size, 1);
  assert.equal(h.forced.listeners.size, 1);
  assert.equal(h.reducedTransparency.listeners.size, 1);
  h.service.teardown();
  assert.equal(h.dark.listeners.size, 0);
  assert.equal(h.forced.listeners.size, 0);
  assert.equal(h.reducedTransparency.listeners.size, 0);
  assert.equal(h.documentListeners.size, 0);
  assert.equal(h.windowListeners.size, 0);
  assert.equal(h.document.querySelectorAll(`#${STYLE_ID}`).length, 0);
  assert.equal(h.root.getAttribute(ROOT_ROUTE_ATTRIBUTE), null);
});

test('UT-B5-THEME-007 reduced transparency keeps Glass durable but resolves it to Solid fallback', () => {
  const h = harness();
  h.service.apply(preferences({ panelFinish: 'GLASS' }));
  assert.equal(h.reducedTransparency.listeners.size, 1);
  h.reducedTransparency.set(true);
  const snapshot = h.service.snapshot();
  assert.equal(snapshot.panelFinishPreference, 'GLASS');
  assert.equal(snapshot.panelFinishEffective, 'SOLID_FALLBACK');
  assert.equal(snapshot.reducedTransparency, true);
});

test('UT-B5-THEME-008 document-ready recovery applies the bundled dark logo when the header appears after document start', () => {
  const h = harness({ logoInitiallyAvailable: false });
  const before = h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  assert.equal(before.logoStatus, 'website-logo-not-found');
  h.showLogo();
  h.documentListeners.get('DOMContentLoaded')();
  assert.equal(h.service.snapshot().logoStatus, 'dark-logo-loading');
  assert.equal(h.logo.getAttribute('src'), `chrome-extension://test/${DARK_WEBSITE_LOGO_PATH}`);
  assert.equal(h.document.querySelectorAll(`#${STYLE_ID}`).length, 1);
});

test('UT-B5-THEME-009 canonical preference read-model identity retains its revision in effective presentation', () => {
  const h = harness();
  const snapshot = h.service.apply({ ...preferences({ preferenceRevision: 12 }), preferencesSchemaVersion: undefined,
    schemaVersion: 1, initialized: true });
  assert.equal(snapshot.preferenceRevision, 12);
});

test('UT-B5-THEME-010 probe-backed route classification is exact and bounded', () => {
  for (const [pathname, route] of Object.entries(ROUTE_BY_PATH)) assert.equal(classifyWebsiteRoute({ pathname }), route);
  assert.equal(classifyWebsiteRoute({ pathname: '/folder/leads.php' }), 'GENERIC');
  assert.equal(classifyWebsiteRoute({ pathname: '/monthly_report.php' }), 'GENERIC');
});

test('UT-B5-THEME-011 Sleek Dark applies the probe-backed Leads adapter and Original removes route ownership', () => {
  const h = harness({ pathname: '/leads.php' });
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  assert.equal(h.root.getAttribute(ROOT_ROUTE_ATTRIBUTE), 'LEADS');
  assert.match(h.document.querySelectorAll(`#${STYLE_ID}`)[0].textContent,
    /admin-form :is\(\.gui-input,\.gui-textarea,select\.input-sm\)/);
  h.service.apply(preferences({ websiteTheme: 'ORIGINAL', preferenceRevision: 2 }));
  assert.equal(h.root.getAttribute(ROOT_ROUTE_ATTRIBUTE), null);
});

test('UT-B5-THEME-012 Install Calendar adapter preserves native semantic event border colors', () => {
  const h = harness({ pathname: '/calendar.php' });
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  assert.equal(h.root.getAttribute(ROOT_ROUTE_ATTRIBUTE), 'INSTALL_CALENDAR');
  const css = h.document.querySelectorAll(`#${STYLE_ID}`)[0].textContent;
  assert.match(css, /dropdown-menu\.list-group\.dropdown-persist/);
  assert.match(css, /fc \.fc-event \.cp/);
  const eventRule = css.match(/\.fc \.fc-event\{([^}]*)\}/)?.[1] || '';
  assert.match(eventRule, /border-width:2px/);
  assert.doesNotMatch(eventRule, /border-color/);
});

test('UT-B5-THEME-013 pageshow reclassifies an eligible SquareCoil route without stacking styles', () => {
  const h = harness({ pathname: '/leads.php' });
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  h.window.location.pathname = '/calendar.php';
  h.windowListeners.get('pageshow')();
  assert.equal(h.root.getAttribute(ROOT_ROUTE_ATTRIBUTE), 'INSTALL_CALENDAR');
  assert.equal(h.document.querySelectorAll(`#${STYLE_ID}`).length, 1);
});

test('UT-B5-THEME-014 B5-D CSS contains bounded vendor responsive reduced-motion and print adapters', () => {
  const h = harness({ pathname: '/project_designs.php' });
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  assert.equal(h.root.getAttribute(ROOT_ROUTE_ATTRIBUTE), 'PROJECT_DESIGNS');
  const css = h.document.querySelectorAll(`#${STYLE_ID}`)[0].textContent;
  for (const marker of ['dataTables_wrapper', 'select2-container--default', '.qtip', '.mfp-content', '.fancybox-skin', '.dropzone', '.cke_button_icon', '.gantt-container', '@media(max-width:1100px)', '@media(prefers-reduced-motion:reduce)', '@media print']) {
    assert.match(css, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(css, /\[class\*="gantt"\]/);
  h.service.teardown();
});

test('UT-B5-THEME-015 B5-D same-origin CKEditor document styling is idempotent and Original removes it exactly', () => {
  const editor = editorFrame();
  const h = harness({ pathname: '/project_designs.php', editorFrames: [editor.frame] });
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  assert.equal(editor.head.children.filter(child => child.id === EDITOR_STYLE_ID).length, 1);
  assert.match(editor.head.children.find(child => child.id === EDITOR_STYLE_ID).textContent, /\[style\*="color:black" i\]/);
  assert.equal(editor.frame.getAttribute(EDITOR_FRAME_ATTRIBUTE), 'dark');
  assert.equal(editor.listeners.size, 1);
  h.service.apply(preferences({ websiteTheme: 'ORIGINAL', preferenceRevision: 2 }));
  assert.equal(editor.head.children.filter(child => child.id === EDITOR_STYLE_ID).length, 0);
  assert.equal(editor.frame.getAttribute(EDITOR_FRAME_ATTRIBUTE), null);
  assert.equal(editor.listeners.size, 0);
  h.service.teardown();
});

test('UT-B5-THEME-016 B5-D forced-colors fallback removes outer and CKEditor ownership without changing preference', () => {
  const editor = editorFrame();
  const h = harness({ pathname: '/project_designs.php', editorFrames: [editor.frame] });
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  assert.equal(editor.head.children.filter(child => child.id === EDITOR_STYLE_ID).length, 1);
  h.forced.set(true);
  const snapshot = h.service.snapshot();
  assert.equal(snapshot.websiteThemePreference, 'SLEEK_DARK');
  assert.equal(snapshot.websiteThemeEffective, 'ORIGINAL');
  assert.equal(editor.head.children.filter(child => child.id === EDITOR_STYLE_ID).length, 0);
  assert.equal(editor.frame.getAttribute(EDITOR_FRAME_ATTRIBUTE), null);
  h.service.teardown();
});

test('UT-B5-THEME-017 B5-D inaccessible CKEditor documents fail closed without a false themed marker', () => {
  const attributes = new Map();
  const frame = {
    get contentDocument() { throw new Error('cross-origin'); },
    addEventListener() {}, removeEventListener() {},
    setAttribute(name, value) { attributes.set(name, String(value)); },
    getAttribute(name) { return attributes.get(name) ?? null; },
    removeAttribute(name) { attributes.delete(name); }
  };
  const h = harness({ pathname: '/project_designs.php', editorFrames: [frame] });
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  assert.equal(frame.getAttribute(EDITOR_FRAME_ATTRIBUTE), null);
  assert.equal(h.document.querySelectorAll(`#${STYLE_ID}`).length, 1);
  h.service.teardown();
  assert.equal(frame.getAttribute(EDITOR_FRAME_ATTRIBUTE), null);
});

test('UT-B5-THEME-018 Light Glass owns one pale translucent layer and a same-origin light editor document', () => {
  const editor = editorFrame();
  const h = harness({ pathname: '/project_designs.php', editorFrames: [editor.frame] });
  const snapshot = h.service.apply(preferences({ websiteTheme: 'LIGHT_GLASS' }));
  assert.equal(snapshot.websiteThemeEffective, 'LIGHT_GLASS');
  assert.equal(h.root.getAttribute(ROOT_THEME_ATTRIBUTE), 'LIGHT_GLASS');
  assert.equal(h.document.querySelectorAll(`#${STYLE_ID}`).length, 1);
  const css = h.document.querySelectorAll(`#${STYLE_ID}`)[0].textContent;
  for (const marker of ['--sc-site-shell:rgba(250,253,254,.84)', 'data-squarecoil-companion-logo="brand"', '#pmlt>div:has(>#duplicate)', '.fc .fc-event', 'backdrop-filter:none!important']) {
    assert.match(css, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.equal(editor.frame.getAttribute(EDITOR_FRAME_ATTRIBUTE), 'light-glass');
  assert.match(editor.head.children.find(child => child.id === EDITOR_STYLE_ID).textContent, /background:#f8fafc/);
  h.service.teardown();
});

test('UT-B5-THEME-019 Dark Glass keeps semantic colors website-logo treatment and single-row project actions without remote CSS assets', () => {
  const h = harness({ pathname: '/project_milestones.php' });
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  const css = h.document.querySelectorAll(`#${STYLE_ID}`)[0].textContent;
  for (const marker of ['--sc-site-shell:rgba(7,15,23,.62)', 'data-squarecoil-companion-logo="brand"', '#pmlt>div:has(>#duplicate)', '.alert-danger', '.alert-warning', '.alert-success']) {
    assert.match(css, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  }
  assert.doesNotMatch(css, /https?:\/\/|@import|fonts\.googleapis/);
  h.service.teardown();
});

test('UT-B5-THEME-026 an existing CKEditor layer updates when authoritative Glass changes theme', () => {
  const editor = editorFrame();
  const h = harness({ pathname: '/project_designs.php', editorFrames: [editor.frame] });
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  const style = editor.head.children.find(child => child.id === EDITOR_STYLE_ID);
  assert.match(style.textContent, /background:#0a1118/);
  h.root.setAttribute(ROOT_THEME_ATTRIBUTE, 'LIGHT_GLASS');
  editor.listeners.get('load')();
  assert.equal(editor.head.children.filter(child => child.id === EDITOR_STYLE_ID).length, 1);
  assert.match(style.textContent, /background:#f8fafc/);
  assert.equal(style.getAttribute('data-squarecoil-companion-editor-theme'), 'LIGHT_GLASS');
  assert.equal(editor.frame.getAttribute(EDITOR_FRAME_ATTRIBUTE), 'light-glass');
  h.service.teardown();
});

test('UT-B5-THEME-030 Dark uses the approved asset while Light handling and Original attribute restoration remain intact', () => {
  const h = harness();
  h.logo.setAttribute('srcset', '/native-logo-2x.png 2x');
  for (const [revision, websiteTheme] of ['REFINED_LIGHT', 'SLEEK_DARK', 'LIGHT_GLASS'].entries()) {
    const snapshot = h.service.apply(preferences({ websiteTheme, preferenceRevision: revision + 1 }));
    assert.equal(snapshot.logoStatus, websiteTheme === 'SLEEK_DARK' ? 'dark-logo-loading' : 'configured-website-logo');
    assert.equal(h.logo.getAttribute('src'), websiteTheme === 'SLEEK_DARK' ? `chrome-extension://test/${DARK_WEBSITE_LOGO_PATH}` : 'images/US-Sign&-Mill-Logo - sized for SC site.png');
    assert.equal(h.logo.getAttribute('data-squarecoil-companion-logo-asset'), websiteTheme === 'SLEEK_DARK' ? 'dark' : null);
    assert.equal(h.logo.getAttribute('srcset'), null);
    assert.equal(h.logo.getAttribute('data-squarecoil-companion-logo'), 'brand');
  }
  const restored = h.service.apply(preferences({ websiteTheme: 'ORIGINAL', preferenceRevision: 4 }));
  assert.equal(restored.logoStatus, 'native-logo');
  assert.equal(h.logo.getAttribute('src'), '/native-logo.png');
  assert.equal(h.logo.getAttribute('srcset'), '/native-logo-2x.png 2x');
  assert.equal(h.logo.getAttribute('data-squarecoil-companion-logo'), null);
});

test('UT-B5-THEME-032 Refined Light owns one coherent canvas panel control and collapsed-navigation palette', () => {
  const h = harness();
  h.service.apply(preferences({ websiteTheme: 'REFINED_LIGHT' }));
  const css = h.document.querySelectorAll(`#${STYLE_ID}`)[0].textContent;
  for (const marker of [
    '--sc-site-canvas:#f2f5f6',
    ':is(#main,#content_wrapper,#content)',
    ':is(.card,.panel,.panel-default,.well,.modal-content,.dropdown-menu,.tab-content)',
    ':is(input,select,textarea,.form-control,.gui-input,.gui-textarea)',
    'data-squarecoil-companion-logo="brand"',
    'body.sb-l-m :is(header.navbar,.navbar) #toggle_sidemenu_l'
  ]) assert.match(css, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.match(css, /border-color:transparent!important;box-shadow:0 5px 18px/);
  assert.match(css, /:focus-visible\{outline:2px solid #33738a!important/);
  assert.doesNotMatch(css, /:focus-visible\{outline:3px/);
  assert.doesNotMatch(css, /content:"SC"/);
  h.service.teardown();
});

test('UT-B5-THEME-101 bundled dark logo load success and failure are local presentation state with bounded retry', () => {
  const h = harness();
  h.logo.setAttribute('srcset', '/native-2x.png 2x');
  const dark = preferences({ websiteTheme: 'SLEEK_DARK' });
  h.service.apply(dark);
  h.logo.dispatch('load');
  assert.equal(h.service.snapshot().logoStatus, 'configured-dark-logo');
  h.logo.dispatch('error');
  assert.equal(h.service.snapshot().logoStatus, 'native-logo-fallback');
  assert.equal(h.logo.getAttribute('src'), '/native-logo.png');
  assert.equal(h.logo.getAttribute('srcset'), '/native-2x.png 2x');
  assert.equal(h.logo.getAttribute('data-squarecoil-companion-logo'), 'brand');
  assert.equal(h.logo.getAttribute('data-squarecoil-companion-logo-asset'), null);
  const setAttribute = h.logo.setAttribute.bind(h.logo);
  let writes = 0;
  h.logo.setAttribute = (name, value) => { writes += 1; setAttribute(name, value); };
  h.mutate([{ type: 'attributes', target: h.logo }]);
  h.service.apply(dark);
  assert.equal(writes, 0);
  assert.equal(h.service.snapshot().websiteThemeEffective, 'SLEEK_DARK');
  h.service.apply(preferences({ websiteTheme: 'LIGHT_GLASS', preferenceRevision: 2 }));
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK', preferenceRevision: 3 }));
  assert.equal(h.logo.getAttribute('src'), `chrome-extension://test/${DARK_WEBSITE_LOGO_PATH}`);
  h.service.teardown();
  assert.equal(h.logo.getAttribute('src'), '/native-logo.png');
  assert.equal(h.logo.getAttribute('srcset'), '/native-2x.png 2x');
  assert.equal(h.logo.getAttribute('data-squarecoil-companion-logo'), null);
  assert.equal([...h.observers].some(observer => observer.connected), false);
  assert.equal(h.logo.listeners.get('error').size, 0);
});

test('UT-B5-THEME-102 a header inserted after document ready acquires the dark logo without rewriting the theme', () => {
  const h = harness({ logoInitiallyAvailable: false });
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  h.documentListeners.get('DOMContentLoaded')();
  const style = h.document.querySelectorAll(`#${STYLE_ID}`)[0];
  let writes = 0;
  const currentCss = style.textContent;
  Object.defineProperty(style, 'textContent', { get() { return currentCss; }, set() { writes += 1; } });
  h.showLogo();
  h.mutate([{ type: 'childList', target: h.root, addedNodes: [h.logo], removedNodes: [] }]);
  assert.equal(h.logo.getAttribute('src'), `chrome-extension://test/${DARK_WEBSITE_LOGO_PATH}`);
  assert.equal(writes, 0);
  assert.equal(h.service.snapshot().logoStatus, 'dark-logo-loading');
  h.service.teardown();
});

test('UT-B5-THEME-103 a native src refresh preserves the new native attributes for Original', () => {
  const h = harness();
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  h.logo.setAttribute('src', '/refreshed-native.png');
  h.logo.setAttribute('srcset', '/refreshed-native-2x.png 2x');
  h.mutate([{ type: 'attributes', target: h.logo }]);
  assert.equal(h.logo.getAttribute('src'), `chrome-extension://test/${DARK_WEBSITE_LOGO_PATH}`);
  h.service.apply(preferences({ websiteTheme: 'ORIGINAL', preferenceRevision: 2 }));
  assert.equal(h.logo.getAttribute('src'), '/refreshed-native.png');
  assert.equal(h.logo.getAttribute('srcset'), '/refreshed-native-2x.png 2x');
  h.service.teardown();
});

test('UT-B5-THEME-104 a replaced native img is reconciled and the detached img is restored with no listeners', () => {
  const h = harness();
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  const previous = h.replaceLogo();
  h.mutate([{ type: 'childList', target: h.root, addedNodes: [h.logo], removedNodes: [previous] }]);
  assert.equal(h.logo.getAttribute('src'), `chrome-extension://test/${DARK_WEBSITE_LOGO_PATH}`);
  assert.equal(previous.getAttribute('src'), '/native-logo.png');
  assert.equal(previous.getAttribute('data-squarecoil-companion-logo'), null);
  assert.equal(previous.listeners.get('load').size, 0);
  h.service.apply(preferences({ websiteTheme: 'ORIGINAL', preferenceRevision: 2 }));
  assert.equal(h.logo.getAttribute('src'), '/new-native-logo.png');
  h.service.teardown();
});

test('UT-B5-THEME-105 unavailable extension asset resolution restores a visible native fallback', () => {
  const h = harness({ assetUrlAvailable: false });
  const result = h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  assert.equal(result.logoStatus, 'native-logo-fallback');
  assert.equal(h.logo.getAttribute('src'), '/native-logo.png');
  assert.equal(h.logo.getAttribute('data-squarecoil-companion-logo'), 'brand');
  assert.equal(h.logo.getAttribute('data-squarecoil-companion-logo-asset'), null);
  h.service.teardown();
});

test('UT-B5-THEME-106 local theme logo recovery removes legacy clipping and keeps the approved dark artwork transparent', () => {
  const h = harness();
  for (const [revision, websiteTheme] of ['SLEEK_DARK', 'LIGHT_GLASS', 'REFINED_LIGHT'].entries()) {
    h.service.apply(preferences({ websiteTheme, preferenceRevision: revision + 1 }));
    const css = h.document.querySelectorAll(`#${STYLE_ID}`)[0].textContent;
    const imageRule = /img\[data-squarecoil-companion-logo="brand"\]\{([^}]+)\}/.exec(css)?.[1];
    assert.ok(imageRule);
    assert.match(imageRule, /min-height:0!important/);
    assert.match(imageRule, /max-height:38px!important/);
    assert.match(imageRule, /clip:auto!important;clip-path:none!important/);
    if (websiteTheme === 'SLEEK_DARK') assert.match(css, /img\[data-squarecoil-companion-logo-asset="dark"\]\{background:transparent!important\}/);
  }
  h.service.teardown();
});


test('UT-B5-THEME-107 native refresh during a dark asset failure survives observer reconciliation and Original', () => {
  const h = harness();
  h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  h.logo.dispatch('error');
  h.logo.setAttribute('src', '/updated-after-failure.png');
  h.logo.setAttribute('srcset', '/updated-after-failure-2x.png 2x');
  h.mutate([{ type: 'attributes', target: h.logo }]);
  assert.equal(h.service.snapshot().logoStatus, 'native-logo-fallback');
  assert.equal(h.logo.getAttribute('src'), '/updated-after-failure.png');
  h.service.apply(preferences({ websiteTheme: 'ORIGINAL', preferenceRevision: 2 }));
  assert.equal(h.logo.getAttribute('src'), '/updated-after-failure.png');
  assert.equal(h.logo.getAttribute('srcset'), '/updated-after-failure-2x.png 2x');
  h.service.teardown();
});

test('UT-B5-THEME-108 native fallback updates racing theme switch or teardown retain the latest src and srcset', () => {
  for (const next of ['ORIGINAL', 'LIGHT_GLASS', 'TEARDOWN']) {
    const h = harness();
    h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
    h.logo.dispatch('error');
    h.logo.setAttribute('src', '/latest-native.png');
    h.logo.setAttribute('srcset', '/latest-native-2x.png 2x');
    // Deliberately do not deliver the observer callback before leaving Dark.
    if (next === 'TEARDOWN') h.service.teardown();
    else {
      h.service.apply(preferences({ websiteTheme: next, preferenceRevision: 2 }));
      h.service.apply(preferences({ websiteTheme: 'ORIGINAL', preferenceRevision: 3 }));
      h.service.teardown();
    }
    assert.equal(h.logo.getAttribute('src'), '/latest-native.png', next);
    assert.equal(h.logo.getAttribute('srcset'), '/latest-native-2x.png 2x', next);
  }
});
