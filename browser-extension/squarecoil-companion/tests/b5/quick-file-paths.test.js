'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  QUICK_FILE_PATHS_HOST_ID, exactQuickFileRoute, normalizeWindowsPath,
  validateHttpLink, extractQuickFileReferences, createQuickFilePathsService
} = require('../../src/presentation/quick-file-paths');

class Element {
  constructor(tag = 'div', classes = '') {
    this.tagName = tag.toUpperCase(); this.className = classes; this.id = '';
    this.parentElement = null; this.children = []; this.attributes = new Map(); this.listeners = new Map();
    this._text = ''; this._innerText = null; this.value = ''; this.hidden = false;
  }
  get textContent() { return this._text; }
  set textContent(value) { this._text = String(value); }
  get innerText() { return this._innerText ?? this._text; }
  set innerText(value) { this._innerText = String(value); }
  get isConnected() { let node = this; while (node.parentElement) node = node.parentElement; return node.documentRoot === true; }
  append(...nodes) { for (const node of nodes) { node.remove(); node.parentElement = this; this.children.push(node); } }
  insertBefore(node, reference) { node.remove(); const index = this.children.indexOf(reference); if (index < 0) throw new Error('reference-missing'); node.parentElement = this; this.children.splice(index, 0, node); }
  remove() { if (this.parentElement) this.parentElement.children = this.parentElement.children.filter(child => child !== this); this.parentElement = null; }
  setAttribute(name, value) { this.attributes.set(name, String(value)); if (name === 'id') this.id = String(value); }
  getAttribute(name) { return name === 'id' ? this.id || null : this.attributes.get(name) ?? null; }
  addEventListener(name, listener) { const listeners = this.listeners.get(name) || []; listeners.push(listener); this.listeners.set(name, listeners); }
  removeEventListener(name, listener) { this.listeners.set(name, (this.listeners.get(name) || []).filter(item => item !== listener)); }
  async fire(name) { const event = { target: this, preventDefault() {} }; for (const listener of this.listeners.get(name) || []) await listener(event); }
  attachShadow() { this.shadowRoot = new Element('shadow'); this.shadowRoot.parentElement = this; return this.shadowRoot; }
  contains(other) { for (let node = other; node; node = node.parentElement) if (node === this) return true; return false; }
  closest(selector) { if (selector === '[hidden], [aria-hidden="true"]') { for (let node = this; node; node = node.parentElement) if (node.hidden || node.getAttribute('aria-hidden') === 'true') return node; } return null; }
  matches(selector) {
    selector = selector.trim();
    if (selector === 'a[href]') return this.tagName === 'A' && Boolean(this.getAttribute('href'));
    if (selector.startsWith('#')) return this.id === selector.slice(1);
    if (selector.startsWith('.')) return this.className.split(/\s+/).includes(selector.slice(1));
    const [tag, className] = selector.split('.');
    return this.tagName.toLowerCase() === tag.toLowerCase() && (!className || this.className.split(/\s+/).includes(className));
  }
  querySelectorAll(selector) {
    const selectors = selector.split(',').map(item => item.trim());
    const direct = selectors.every(item => item.startsWith(':scope > '));
    if (direct) return this.children.filter(child => selectors.some(item => child.matches(item.slice(9))));
    const found = [];
    function visit(node) { for (const child of node.children) { if (selectors.some(item => child.matches(item))) found.push(child); visit(child); } }
    visit(this); return found;
  }
  querySelector(selector) { return this.querySelectorAll(selector)[0] || null; }
}

function harness(pathname = '/project_designs.php') {
  const root = new Element('html'); root.documentRoot = true;
  const head = new Element('head'); const body = new Element('body'); const content = new Element('main'); content.id = 'content';
  root.append(head, body); body.append(content);
  const document = {
    documentElement: root, head, body,
    createElement(tag) { return new Element(tag); },
    querySelectorAll(selector) { return root.querySelectorAll(selector); },
    querySelector(selector) { return root.querySelector(selector); },
    getElementById(id) { return root.querySelector(`#${id}`); }
  };
  const listeners = new Map();
  const window = {
    location: { pathname, search: '?id=910001' },
    setTimeout, clearTimeout,
    addEventListener(name, listener) { listeners.set(name, listener); },
    removeEventListener(name, listener) { if (listeners.get(name) === listener) listeners.delete(name); },
    getComputedStyle() { return { display: 'block', visibility: 'visible' }; }
  };
  function addDesignDescription(text, href = '') {
    const panel = new Element('section', 'panel'); panel.id = 'descriptionbox';
    const heading = new Element('header', 'panel-heading'); heading.textContent = 'Description';
    const description = new Element('div', 'panel-body'); description.innerText = text; description.textContent = text;
    if (href) { const anchor = new Element('a'); anchor.setAttribute('href', href); anchor.textContent = 'Check Set'; description.append(anchor); }
    panel.append(heading, description); content.append(panel);
    return { panel, heading, description };
  }
  function addNotes(value, classes = 'important-notes') {
    const wrapper = new Element('div'); const textarea = new Element('textarea', classes);
    textarea.value = value; wrapper.append(textarea); content.append(wrapper); return { wrapper, textarea };
  }
  return { root, head, body, content, document, window, listeners, addDesignDescription, addNotes };
}

test('UT-B5-QFP-001 only the exact Design and project paths are eligible', () => {
  assert.equal(exactQuickFileRoute({ pathname: '/project_designs.php' }), 'design');
  assert.equal(exactQuickFileRoute({ pathname: '/project.php' }), 'notes');
  for (const pathname of ['/dashboard.php', '/edit_design.php', '/project_designs.php/extra', '/projects.php'])
    assert.equal(exactQuickFileRoute({ pathname }), null);
});

test('UT-B5-QFP-002 Windows paths and HTTP(S) links are validated and deduplicated', () => {
  const result = extractQuickFileReferences(
    'C:\\Jobs\\910001\\Design\nC:\\Jobs\\910001\\Design\n\\\\fileserver\\design\\910001\nCheck Set: https://files.example.com/set.pdf\nUnsafe: javascript:alert(1)',
    [{ href: 'https://files.example.com/set.pdf', text: 'Check Set' }]
  );
  assert.deepEqual(result.paths, ['C:\\Jobs\\910001\\Design', '\\\\fileserver\\design\\910001']);
  assert.deepEqual(result.links, [{ href: 'https://files.example.com/set.pdf', label: 'Check Set' }]);
  assert.equal(normalizeWindowsPath('file:///C:/Jobs/910001/Design%20Files'), 'C:\\Jobs\\910001\\Design Files');
  assert.equal(normalizeWindowsPath('relative\\path'), null);
  assert.equal(validateHttpLink('javascript:alert(1)'), null);
  assert.equal(validateHttpLink('https://user:secret@example.com/file'), null);
  assert.equal(validateHttpLink('https://files.example.com/a.pdf'), 'https://files.example.com/a.pdf');
});

test('UT-B5-QFP-003 service defaults off and never scans an unrelated route', () => {
  const h = harness('/dashboard.php'); h.addDesignDescription('C:\\Jobs\\910001\\Design');
  const service = createQuickFilePathsService({ document: h.document, window: h.window });
  assert.equal(service.snapshot().state, 'OFF');
  assert.equal(h.document.getElementById(QUICK_FILE_PATHS_HOST_ID), null);
  assert.equal(service.apply(true).state, 'INACTIVE_PAGE');
  assert.equal(h.document.getElementById(QUICK_FILE_PATHS_HOST_ID), null);
  service.teardown();
});

test('UT-B5-QFP-004 Design toolbar copies a path, opens only a safe link, and restores source on teardown', async () => {
  const h = harness(); const original = 'C:\\Jobs\\910001\\Concepts\nCheck Set: https://files.example.com/check-set';
  const { panel, description } = h.addDesignDescription(original);
  const copies = [];
  const service = createQuickFilePathsService({ document: h.document, window: h.window, copyText: value => copies.push(value) });
  assert.equal(service.apply(true).state, 'APPLIED');
  const host = h.document.getElementById(QUICK_FILE_PATHS_HOST_ID);
  assert.equal(host.parentElement, panel);
  const buttons = host.shadowRoot.querySelectorAll('button');
  assert.equal(buttons.length, 1);
  await buttons[0].fire('click');
  assert.deepEqual(copies, ['C:\\Jobs\\910001\\Concepts']);
  const link = host.shadowRoot.querySelector('a');
  assert.equal(link.href, 'https://files.example.com/check-set');
  assert.equal(link.target, '_blank');
  assert.equal(link.rel, 'noopener noreferrer');
  assert.equal(description.innerText, original);
  service.teardown();
  assert.equal(h.document.getElementById(QUICK_FILE_PATHS_HOST_ID), null);
  assert.equal(description.innerText, original);
  assert.equal(panel.children.length, 2);
});

test('UT-B5-QFP-005 project notes require the exact visible important-notes field', async () => {
  const h = harness('/project.php');
  h.addNotes('C:\\Private\\Unrelated', 'other-notes');
  const service = createQuickFilePathsService({ document: h.document, window: h.window, copyText: async () => {} });
  assert.equal(service.apply(true).state, 'SOURCE_MISSING');
  const { textarea } = h.addNotes('Project folder: C:\\Jobs\\910001\nSurvey: https://survey.example.com/910001');
  assert.equal(service.apply(true).state, 'APPLIED');
  assert.equal(service.snapshot().pathCount, 1);
  assert.equal(service.snapshot().linkCount, 1);
  textarea.value = 'No file references here';
  await textarea.fire('input');
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(service.snapshot().state, 'EMPTY');
  assert.equal(h.document.getElementById(QUICK_FILE_PATHS_HOST_ID), null);
  service.teardown();
});

test('UT-B5-QFP-006 disabling and route departure remove only Companion ownership', () => {
  const h = harness(); const { description } = h.addDesignDescription('\\\\server\\share\\job');
  const service = createQuickFilePathsService({ document: h.document, window: h.window });
  assert.equal(service.apply(true).state, 'APPLIED');
  const firstHost = h.document.getElementById(QUICK_FILE_PATHS_HOST_ID);
  assert.equal(service.apply(true).ownedRootCount, 1);
  assert.equal(h.document.getElementById(QUICK_FILE_PATHS_HOST_ID), firstHost);
  assert.equal(service.apply(false).state, 'OFF');
  assert.equal(h.listeners.size, 0);
  assert.equal(description.parentElement !== null, true);
  assert.equal(h.document.getElementById(QUICK_FILE_PATHS_HOST_ID), null);
  service.apply(true);
  h.window.location.pathname = '/calendar.php';
  h.listeners.get('popstate')();
  assert.equal(service.snapshot().state, 'INACTIVE_PAGE');
  assert.equal(h.document.getElementById(QUICK_FILE_PATHS_HOST_ID), null);
  assert.equal(description.innerText, '\\\\server\\share\\job');
  service.teardown();
});

test('UT-B5-QFP-007 hidden or ambiguous job fields fail closed', () => {
  const h = harness(); const first = h.addDesignDescription('C:\\Jobs\\910001');
  first.panel.hidden = true;
  const service = createQuickFilePathsService({ document: h.document, window: h.window });
  assert.equal(service.apply(true).state, 'SOURCE_MISSING');
  first.panel.hidden = false;
  h.addDesignDescription('C:\\Jobs\\910002');
  assert.equal(service.apply(true).state, 'SOURCE_MISSING');
  assert.equal(h.document.getElementById(QUICK_FILE_PATHS_HOST_ID), null);
  service.teardown();
});

test('UT-B5-QFP-008 Design page combines Description and one visible Important Details field', async () => {
  const h = harness();
  const { panel, description } = h.addDesignDescription('Design folder: C:\\Jobs\\910001\\Design\nCheck Set: https://files.example.com/check-set');
  const { textarea } = h.addNotes('Project folder: C:\\Jobs\\910001\\Design\nSurvey: https://files.example.com/survey');
  const copies = [];
  const service = createQuickFilePathsService({ document: h.document, window: h.window, copyText: value => copies.push(value) });
  assert.equal(service.apply(true).state, 'APPLIED');
  assert.equal(service.snapshot().pathCount, 1, 'duplicate Description and Important Details paths merge');
  assert.equal(service.snapshot().linkCount, 2);
  const host = h.document.getElementById(QUICK_FILE_PATHS_HOST_ID);
  assert.equal(host.parentElement, panel, 'one toolbar stays beside the Design Description');
  assert.deepEqual(host.shadowRoot.querySelectorAll('a').map(link => link.href),
    ['https://files.example.com/check-set', 'https://files.example.com/survey']);
  await host.shadowRoot.querySelector('button').fire('click');
  assert.deepEqual(copies, ['C:\\Jobs\\910001\\Design']);

  textarea.value = 'Project folder: \\\\fileserver\\jobs\\910001\nSurvey: https://files.example.com/updated';
  await textarea.fire('input');
  await new Promise(resolve => setTimeout(resolve, 120));
  assert.equal(service.snapshot().pathCount, 2);
  assert.equal(service.snapshot().linkCount, 2);
  assert.equal(h.document.getElementById(QUICK_FILE_PATHS_HOST_ID).parentElement, panel);
  service.teardown();
  assert.equal(h.document.getElementById(QUICK_FILE_PATHS_HOST_ID), null);
  assert.equal(description.parentElement, panel);
  assert.equal(textarea.value.includes('updated'), true);
});

test('UT-B5-QFP-009 ambiguous Important Details is ignored while a unique Design Description still works', () => {
  const h = harness(); h.addDesignDescription('C:\\Jobs\\910001\\Design');
  h.addNotes('C:\\Jobs\\Other1'); h.addNotes('C:\\Jobs\\Other2');
  const service = createQuickFilePathsService({ document: h.document, window: h.window });
  assert.equal(service.apply(true).state, 'APPLIED');
  assert.equal(service.snapshot().pathCount, 1);
  service.teardown();
});

test('UT-B5-QFP-010 Description heading actions do not hide files or make an unrelated panel eligible', () => {
  const actionNode = { nodeType: 1, textContent: 'Edit', matches: selector => selector.includes('button') };
  const h = harness();
  const { heading } = h.addDesignDescription('C:\\Jobs\\910001\\Design');
  heading.childNodes = [{ nodeType: 3, nodeValue: 'Description' }, actionNode];
  const service = createQuickFilePathsService({ document: h.document, window: h.window });
  assert.equal(service.apply(true).state, 'APPLIED');
  service.teardown();

  const other = harness();
  const { heading: unrelatedHeading } = other.addDesignDescription('C:\\Jobs\\910002\\Files');
  unrelatedHeading.childNodes = [{ nodeType: 3, nodeValue: 'Files' }, actionNode];
  const unrelatedService = createQuickFilePathsService({ document: other.document, window: other.window });
  assert.equal(unrelatedService.apply(true).state, 'SOURCE_MISSING');
  unrelatedService.teardown();
});
