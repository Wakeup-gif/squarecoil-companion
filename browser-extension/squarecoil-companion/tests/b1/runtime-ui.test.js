'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createRuntimeUi, ROOT_ID } = require('../../src/platform/runtime-ui');
const { BUILD_ID } = require('../../src/core/build-identity');

class FakeCustomEvent {
  constructor(type, options = {}) {
    this.type = type;
    this.detail = options.detail;
  }
}

class FakeElement {
  constructor(doc) {
    this.doc = doc;
    this.id = '';
    this.dataset = {};
    this.style = { cssText: '' };
    this.attributes = {};
    this.listeners = new Map();
    this.isConnected = false;
    this.innerHTML = '';
  }

  setAttribute(name, value) {
    this.attributes[name] = String(value);
  }

  addEventListener(type, handler) {
    if (!this.listeners.has(type)) this.listeners.set(type, new Set());
    this.listeners.get(type).add(handler);
  }

  removeEventListener(type, handler) {
    this.listeners.get(type)?.delete(handler);
  }

  dispatchEvent(event) {
    for (const handler of this.listeners.get(event.type) || []) handler.call(this, event);
    return true;
  }

  querySelector() {
    return null;
  }

  remove() {
    this.isConnected = false;
  }
}

function createFakeDocument() {
  const nodes = [];
  const doc = {
    defaultView: { CustomEvent: FakeCustomEvent },
    documentElement: null,
    body: null,
    createElement: () => new FakeElement(doc),
    querySelectorAll: selector => {
      if (selector === `#${ROOT_ID}`) return nodes.filter(node => node.isConnected && node.id === ROOT_ID);
      if (selector === '[data-squarecoil-companion-root="rebuild"]') {
        return nodes.filter(node => node.isConnected && node.dataset.squarecoilCompanionRoot === 'rebuild');
      }
      return [];
    }
  };
  const host = {
    appendChild(element) {
      if (!nodes.includes(element)) nodes.push(element);
      element.isConnected = true;
      return element;
    }
  };
  doc.documentElement = host;
  doc.body = host;
  doc._nodes = nodes;
  return doc;
}

test('recreating a removed owned root rebinds the interaction controller', async () => {
  const doc = createFakeDocument();
  const ui = createRuntimeUi({ document: doc, runtimeInstanceId: 'r1', buildId: BUILD_ID });

  const first = await ui.ensure();
  assert.equal(first.interactionReady, true);
  const firstRoot = doc.querySelectorAll(`#${ROOT_ID}`)[0];
  assert.ok(firstRoot);

  firstRoot.remove();
  assert.equal(ui.snapshot().interactionReady, false);

  const second = await ui.ensure();
  const secondRoot = doc.querySelectorAll(`#${ROOT_ID}`)[0];
  assert.ok(secondRoot);
  assert.notEqual(secondRoot, firstRoot);
  assert.equal(second.interactionReady, true);
  assert.equal(ui.snapshot().interactionReady, true);
});

test('runtime UI refuses a foreign timer root instead of taking it over', async () => {
  const doc = createFakeDocument();
  const foreign = doc.createElement('section');
  foreign.id = ROOT_ID;
  foreign.dataset.squarecoilCompanionRoot = 'legacy-or-foreign';
  doc.body.appendChild(foreign);

  const ui = createRuntimeUi({ document: doc, runtimeInstanceId: 'r1', buildId: BUILD_ID });
  await assert.rejects(() => ui.ensure(), /ownership-conflict:foreign-timer-root/);
});

test('runtime UI refuses to adopt an unknown rebuild root without ownership identity', async () => {
  const doc = createFakeDocument();
  const ambiguous = doc.createElement('section');
  ambiguous.id = ROOT_ID;
  ambiguous.dataset.squarecoilCompanionRoot = 'rebuild';
  doc.body.appendChild(ambiguous);

  const ui = createRuntimeUi({ document: doc, runtimeInstanceId: 'r1', buildId: BUILD_ID });
  await assert.rejects(() => ui.ensure(), /ownership-conflict:root-runtime-identity-missing/);
});

test('known owned root can restore metadata stripped after initialization', async () => {
  const doc = createFakeDocument();
  const ui = createRuntimeUi({ document: doc, runtimeInstanceId: 'r1', buildId: BUILD_ID });
  await ui.ensure();
  const owned = doc.querySelectorAll(`#${ROOT_ID}`)[0];
  delete owned.dataset.runtimeInstanceId;
  delete owned.dataset.buildId;

  const result = await ui.ensure();
  assert.equal(result.interactionReady, true);
  assert.equal(owned.dataset.runtimeInstanceId, 'r1');
  assert.equal(owned.dataset.buildId, BUILD_ID);
});

test('connected owned root with a changed id is repaired without leaking a second root', async () => {
  const doc = createFakeDocument();
  const ui = createRuntimeUi({ document: doc, runtimeInstanceId: 'r1', buildId: BUILD_ID, documentToken: 'document-token-owned-root-01' });
  await ui.ensure();
  const owned = doc.querySelectorAll(`#${ROOT_ID}`)[0];

  owned.id = 'ussign-job-timer-renamed';
  const result = await ui.ensure();

  assert.equal(result.interactionReady, true);
  assert.equal(owned.id, ROOT_ID);
  assert.equal(doc.querySelectorAll(`#${ROOT_ID}`).length, 1);
  assert.equal(doc._nodes.filter(node => node.isConnected).length, 1);
});

test('MAIN lifecycle fallback keeps technical codes in datasets without overwriting workspace status copy', async () => {
  const doc = createFakeDocument();
  const ui = createRuntimeUi({ document: doc, runtimeInstanceId: 'r1', buildId: BUILD_ID });
  await ui.ensure();
  const owned = doc.querySelectorAll(`#${ROOT_ID}`)[0];
  const workspaceStatus = { textContent: 'Needs attention' };
  const fallbackStatus = { textContent: '' };
  owned.querySelector = selector => selector === '[data-sc-lifecycle-fallback-status]' ? fallbackStatus
    : selector === '[data-sc-status]' ? workspaceStatus : null;

  ui.setLifecycle({ state: 'DEGRADED', reason: 'coordination-not-implemented-b1' });

  assert.equal(owned.dataset.lifecycleState, 'DEGRADED');
  assert.equal(owned.dataset.lifecycleReason, 'coordination-not-implemented-b1');
  assert.equal(workspaceStatus.textContent, 'Needs attention');
  assert.equal(fallbackStatus.textContent, 'Companion is reconnecting. No SquareCoil data was changed.');
});

test('teardown removes the owned root and interaction readiness', async () => {
  const doc = createFakeDocument();
  const ui = createRuntimeUi({ document: doc, runtimeInstanceId: 'r1', buildId: BUILD_ID });
  await ui.ensure();
  await ui.teardown();
  assert.equal(doc.querySelectorAll(`#${ROOT_ID}`).length, 0);
  assert.equal(ui.snapshot().interactionReady, false);
});
