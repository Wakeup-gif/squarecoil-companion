'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { STYLE_ID, ROOT_THEME_ATTRIBUTE, ROOT_ROUTE_ATTRIBUTE, EDITOR_STYLE_ID, EDITOR_FRAME_ATTRIBUTE,
  ROUTE_BY_PATH, classifyWebsiteRoute, createThemeService } = require('../../src/presentation/theme-service');

class FakeElement {
  constructor(tag = 'div') {
    this.tagName = tag.toUpperCase();
    this.id = '';
    this.textContent = '';
    this.attributes = new Map();
    this.children = [];
    this.parent = null;
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return name === 'id' ? this.id || null : this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'id') this.id = ''; }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
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
  pathname = '/dashboard.php', editorFrames = [] } = {}) {
  const root = new FakeElement('html');
  const head = new FakeElement('head');
  const logo = new FakeElement('img');
  logo.setAttribute('src', '/native-logo.png');
  const dark = media(false);
  const forced = media(false);
  const reducedTransparency = media(false);
  const documentListeners = new Map();
  const windowListeners = new Map();
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
    matchMedia(query) {
      if (query.includes('forced-colors')) return forced;
      if (query.includes('reduced-transparency')) return reducedTransparency;
      return dark;
    },
    CSS: { supports() { return glass; } },
    addEventListener(type, listener) { windowListeners.set(type, listener); },
    removeEventListener(type, listener) { if (windowListeners.get(type) === listener) windowListeners.delete(type); }
  };
  const service = createThemeService({ document, window });
  return { service, document, window, root, head, logo, dark, forced, reducedTransparency, documentListeners, windowListeners,
    showLogo() { logoAvailable = true; } };
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

test('UT-B5-THEME-005 non-native themes use the repository-established website PNG path without a packaged asset', () => {
  const h = harness();
  const snapshot = h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  assert.equal(snapshot.websiteThemeEffective, 'SLEEK_DARK');
  assert.equal(snapshot.logoStatus, 'configured-website-logo');
  assert.equal(h.logo.getAttribute('src'), 'images/US-Sign&-Mill-Logo - sized for SC site.png');
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

test('UT-B5-THEME-008 document-ready recovery applies the fixed website logo when the header appears after document start', () => {
  const h = harness({ logoInitiallyAvailable: false });
  const before = h.service.apply(preferences({ websiteTheme: 'SLEEK_DARK' }));
  assert.equal(before.logoStatus, 'website-logo-not-found');
  h.showLogo();
  h.documentListeners.get('DOMContentLoaded')();
  assert.equal(h.service.snapshot().logoStatus, 'configured-website-logo');
  assert.equal(h.logo.getAttribute('src'), 'images/US-Sign&-Mill-Logo - sized for SC site.png');
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
  for (const marker of ['--sc-site-shell:rgba(248,251,254,.82)', 'data-squarecoil-companion-logo="brand"', '#pmlt>div:has(>#duplicate)', '.fc .fc-event', 'backdrop-filter:none!important']) {
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

test('UT-B5-THEME-030 every non-native theme uses only the fixed website PNG path and Original restores native attributes', () => {
  const h = harness();
  h.logo.setAttribute('srcset', '/native-logo-2x.png 2x');
  for (const [revision, websiteTheme] of ['REFINED_LIGHT', 'SLEEK_DARK', 'LIGHT_GLASS'].entries()) {
    const snapshot = h.service.apply(preferences({ websiteTheme, preferenceRevision: revision + 1 }));
    assert.equal(snapshot.logoStatus, 'configured-website-logo');
    assert.equal(h.logo.getAttribute('src'), 'images/US-Sign&-Mill-Logo - sized for SC site.png');
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
    '--sc-site-canvas:#e8eef3',
    ':is(#main,#content_wrapper,#content)',
    ':is(.card,.panel,.panel-default,.well,.modal-content,.dropdown-menu,.tab-content)',
    ':is(input,select,textarea,.form-control,.gui-input,.gui-textarea)',
    'data-squarecoil-companion-logo="brand"',
    'body.sb-l-m :is(header.navbar,.navbar) #toggle_sidemenu_l'
  ]) assert.match(css, new RegExp(marker.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  assert.doesNotMatch(css, /content:"SC"/);
  h.service.teardown();
});
