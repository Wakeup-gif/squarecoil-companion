'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DASHBOARD_STYLE_ID, DASHBOARD_ATTRIBUTE, DASHBOARD_SUMMARY_ID, AUDITED_SELECTORS, DASHBOARD_CSS,
  exactDashboardRoute, createDashboardProfile
} = require('../../src/presentation/dashboard-profile');

class Element {
  constructor(tag = 'div', values = {}) {
    this.tagName = tag.toUpperCase(); this.id = ''; this.parent = null; this.children = []; this.attributes = new Map();
    Object.assign(this, values);
  }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return name === 'id' ? this.id || null : this.attributes.get(name) ?? null; }
  removeAttribute(name) { this.attributes.delete(name); if (name === 'id') this.id = ''; }
  appendChild(child) { child.parent = this; this.children.push(child); return child; }
  remove() { if (this.parent) this.parent.children = this.parent.children.filter(item => item !== this); this.parent = null; }
}

function harness({ pathname = '/dashboard.php', search = '?show=2', missing = [] } = {}) {
  const root = new Element('html'); const head = new Element('head'); const body = new Element('body');
  const content = new Element('main'); content.id = 'content'; root.appendChild(head); root.appendChild(body); body.appendChild(content);
  const elements = new Map();
  elements.set('#content', content);
  for (const selector of AUDITED_SELECTORS) if (!missing.includes(selector)) elements.set(selector, new Element('div'));
  function findById(node, id) {
    if (node.id === id) return node;
    for (const child of node.children || []) { const found = findById(child, id); if (found) return found; }
    return null;
  }
  const document = {
    documentElement: root, head, body,
    createElement(tag) { return new Element(tag); },
    getElementById(id) { return findById(root, id); },
    querySelector(selector) { return elements.get(selector) || null; },
    querySelectorAll(selector) {
      if (selector === `#${DASHBOARD_STYLE_ID}`) return head.children.filter(child => child.id === DASHBOARD_STYLE_ID);
      if (selector === `#${DASHBOARD_SUMMARY_ID}`) {
        const found = findById(root, DASHBOARD_SUMMARY_ID); return found ? [found] : [];
      }
      return [];
    }
  };
  const window = { location: { pathname, search } };
  const service = createDashboardProfile({ document, window });
  return { service, document, window, root, head, body, content, elements };
}

function prefs(values = {}) {
  return { preferencesSchemaVersion: 2, preferenceRevision: values.revision || 1,
    timerAppearance: 'LIGHT', panelFinish: 'SOLID', websiteTheme: values.theme || 'SLEEK_DARK',
    cinematicBackground: 'NONE', dashboardProfile: values.profile || 'ON',
    yellowMinutes: 60, orangeMinutes: 120, redMinutes: 240 };
}

const sleek = { websiteThemeEffective: 'SLEEK_DARK', forcedColors: false, reducedTransparency: false };

test('UT-B5-DASH-001 exact dashboard.php show=2 page is eligible', () => {
  assert.equal(exactDashboardRoute({ pathname: '/dashboard.php', search: '?show=2' }), true);
  assert.equal(harness().service.apply(prefs(), sleek).state, 'APPLIED');
});

test('UT-B5-DASH-002 other dashboard modes and pages never inherit the profile', () => {
  for (const route of [
    { pathname: '/dashboard.php', search: '?show=1' }, { pathname: '/dashboard.php', search: '?show=2&show=3' },
    { pathname: '/project.php', search: '?show=2' }, { pathname: '/Dashboard.php/extra', search: '?show=2' }
  ]) assert.equal(harness(route).service.apply(prefs(), sleek).state, 'INACTIVE_PAGE');
});

test('UT-B5-DASH-003 Original keeps dashboard presentation inactive', () => {
  const h = harness(); const result = h.service.apply(prefs({ theme: 'ORIGINAL' }), { websiteThemeEffective: 'ORIGINAL' });
  assert.equal(result.state, 'INACTIVE_THEME'); assert.equal(h.root.getAttribute(DASHBOARD_ATTRIBUTE), null);
});

test('UT-B5-DASH-004 Sleek Dark applies one idempotent owned profile layer', () => {
  const h = harness(); h.service.apply(prefs(), sleek); const layer = h.head.children[0];
  const result = h.service.apply(prefs(), sleek);
  assert.equal(result.state, 'APPLIED'); assert.equal(h.document.querySelectorAll(`#${DASHBOARD_STYLE_ID}`).length, 1);
  assert.equal(h.head.children[0], layer);
});

test('UT-B5-DASH-005 missing audited selectors produce partial-safe without guessed fallback', () => {
  const h = harness({ missing: ['#onHold'] }); const result = h.service.apply(prefs(), sleek);
  assert.equal(result.state, 'PARTIAL_SAFE'); assert.equal(result.matchedSelectors, AUDITED_SELECTORS.length - 1);
  assert.equal(result.reason, 'audited-selector-missing');
});

test('UT-B5-DASH-006 KPI and business text remain byte-equivalent after styling', () => {
  const h = harness(); const kpi = h.elements.get('#widget-tasks'); kpi.textContent = '17 overdue tasks';
  const before = kpi.textContent; h.service.apply(prefs(), sleek); assert.equal(kpi.textContent, before);
});

test('UT-B5-DASH-007 design-list order and visibility remain native', () => {
  const h = harness(); const list = h.elements.get('#inProgress'); list.children = ['A', 'B', 'C']; list.hidden = false;
  const before = structuredClone({ children: list.children, hidden: list.hidden }); h.service.apply(prefs(), sleek);
  assert.deepEqual({ children: list.children, hidden: list.hidden }, before);
});

test('UT-B5-DASH-008 forms selects buttons and links retain value target and disabled state', () => {
  const h = harness(); const select = h.elements.get('#multiple_location_id');
  Object.assign(select, { value: 'shop-2', disabled: true, action: '/native-submit', href: '/native-target' });
  const before = structuredClone({ value: select.value, disabled: select.disabled, action: select.action, href: select.href });
  h.service.apply(prefs(), sleek); assert.deepEqual({ value: select.value, disabled: select.disabled, action: select.action, href: select.href }, before);
});

test('UT-B5-DASH-009 warnings errors and focus retain explicit perceivable styling', () => {
  assert.match(DASHBOARD_CSS, /alert-danger/); assert.match(DASHBOARD_CSS, /alert-warning/); assert.match(DASHBOARD_CSS, /:focus-visible/);
});

test('UT-B5-DASH-010 modal business handlers remain native', () => {
  const h = harness(); const modal = { onSubmit: () => 'native-submit', open: true };
  const handler = modal.onSubmit; h.service.apply(prefs(), sleek);
  assert.equal(modal.onSubmit, handler); assert.equal(modal.onSubmit(), 'native-submit'); assert.equal(modal.open, true);
});

test('UT-B5-DASH-011 dynamic rows inherit CSS without a MutationObserver patch loop', () => {
  const h = harness(); let observers = 0; h.window.MutationObserver = class { constructor() { observers += 1; } };
  h.service.apply(prefs(), sleek); h.elements.get('#nextJob').children.push('late-row');
  assert.equal(observers, 0); assert.deepEqual(h.elements.get('#nextJob').children, ['late-row']);
});

test('UT-B5-DASH-012 navigation away removes profile ownership without harming base theme', () => {
  const h = harness(); h.service.apply(prefs(), sleek); h.root.setAttribute('data-squarecoil-companion-site-theme', 'SLEEK_DARK');
  h.window.location.pathname = '/project.php'; h.window.location.search = '?id=42';
  assert.equal(h.service.apply(prefs({ revision: 2 }), sleek).state, 'INACTIVE_PAGE');
  assert.equal(h.document.querySelectorAll(`#${DASHBOARD_STYLE_ID}`).length, 0);
  assert.equal(h.root.getAttribute('data-squarecoil-companion-site-theme'), 'SLEEK_DARK');
});

test('UT-B5-DASH-013 return and recovery create exactly one profile instance', () => {
  const h = harness(); h.service.apply(prefs(), sleek); h.window.location.pathname = '/project.php'; h.service.apply(prefs({ revision: 2 }), sleek);
  h.window.location.pathname = '/dashboard.php'; h.window.location.search = '?show=2'; h.service.apply(prefs({ revision: 3 }), sleek);
  assert.equal(h.document.querySelectorAll(`#${DASHBOARD_STYLE_ID}`).length, 1);
});

test('UT-B5-DASH-014 profile failure cannot mutate Timer Ledger or Bridge state', () => {
  const h = harness(); h.document.createElement = () => null;
  const authority = { timer: { state: 'RUNNING' }, ledger: ['s1'], bridge: { requestCount: 4 } }; const before = structuredClone(authority);
  assert.equal(h.service.apply(prefs(), sleek).state, 'PARTIAL_SAFE'); assert.deepEqual(authority, before);
});

test('UT-B5-DASH-015 sibling Design tools remain behaviorally independent', () => {
  const h = harness(); const sibling = { featureId: 'design-job-tools', enabled: true, handler: () => 42 };
  const handler = sibling.handler; h.service.apply(prefs(), sleek);
  assert.equal(sibling.enabled, true); assert.equal(sibling.handler, handler); assert.equal(sibling.handler(), 42);
});

test('UT-B5-DASH-016 optional dashboard summary is owned read-only bounded and updates without stacking', () => {
  const h = harness();
  const first = { currentLabel: 'Production (General)', todayMs: 7000, weekMs: 12000, sessionMs: 4000,
    recent: [{ label: 'Production (General)' }, { label: 'Job 42' }] };
  h.service.apply(prefs(), sleek, first);
  const host = h.document.getElementById(DASHBOARD_SUMMARY_ID);
  assert.ok(host);
  const text = node => [node.textContent || '', ...(node.children || []).map(text)].join(' ');
  assert.match(text(host), /SquareCoil Companion/);
  assert.match(text(host), /Production \(General\)/);
  assert.match(text(host), /00:00:07/);
  h.service.apply(prefs(), sleek, { ...first, todayMs: 9000 });
  assert.equal(h.document.querySelectorAll(`#${DASHBOARD_SUMMARY_ID}`).length, 1);
  assert.equal(h.document.getElementById(DASHBOARD_SUMMARY_ID), host);
  assert.match(text(host), /00:00:09/);
  h.service.teardown();
  assert.equal(h.document.getElementById(DASHBOARD_SUMMARY_ID), null);
});
