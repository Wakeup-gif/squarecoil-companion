'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createPresentationMarkers, PASS_DELAYS_MS } = require('../../src/presentation/presentation-markers');

function node(textContent = '') {
  const attributes = new Map();
  const writes = { set: 0, remove: 0 };
  return {
    textContent, writes,
    getAttribute: name => attributes.get(name) ?? null,
    hasAttribute: name => attributes.has(name),
    setAttribute(name, value) { writes.set += 1; attributes.set(name, String(value)); },
    removeAttribute(name) { writes.remove += 1; attributes.delete(name); }
  };
}

function harness(pathname = '/project_designs.php', semantic = false) {
  const classes = new Set();
  const classWrites = { add: 0, remove: 0 };
  const root = { classList: {
    contains: name => classes.has(name),
    add(name) { classWrites.add += 1; classes.add(name); },
    remove(name) { classWrites.remove += 1; classes.delete(name); }
  } };
  const pending = new Map();
  let nextTimer = 0;
  const window = {
    location: { pathname },
    setTimeout(callback) { const id = ++nextTimer; pending.set(id, callback); return id; },
    clearTimeout(id) { pending.delete(id); },
    addEventListener() {}, removeEventListener() {}
  };
  const summary = node();
  const actionbar = node();
  const cell = node();
  const label = node('Status');
  const value = node('In progress');
  const alert = node('Pending approval');
  const action = node('New');
  const badge = node('0');
  cell.querySelector = selector => selector === '.us-sign-djt-summary-label' ? label :
    selector === '.us-sign-djt-summary-value' ? value : null;
  summary.querySelectorAll = () => [cell];
  actionbar.querySelectorAll = () => [action];
  const document = {
    documentElement: root,
    querySelector(selector) {
      if (!semantic) return null;
      if (selector === '#us-sign-design-summary') return summary;
      if (selector === '#us-sign-design-actionbar') return actionbar;
      return null;
    },
    querySelectorAll(selector) {
      if (selector === '.alert') return semantic ? [alert] : [];
      if (selector === '#badge-task-count, #badge-design-count, #badge-estimate-count') return semantic ? [badge] : [];
      return [];
    },
    addEventListener() {}, removeEventListener() {}
  };
  const markers = createPresentationMarkers({ document, window });
  function flushPasses() {
    const callbacks = [...pending.values()];
    pending.clear();
    for (const callback of callbacks) callback();
    return callbacks.length;
  }
  return { root, classes, classWrites, window, markers, flushPasses,
    nodes: { cell, value, alert, action, badge } };
}

test('UT-B5-THEME-039 delayed passes keep unchanged root markers stable', () => {
  const h = harness();
  h.markers.apply();
  assert.equal(h.flushPasses(), PASS_DELAYS_MS.length);
  assert.equal(h.classes.has('us-sign-design-page'), true);
  assert.deepEqual(h.classWrites, { add: 1, remove: 0 });
  h.markers.schedule();
  h.flushPasses();
  assert.deepEqual(h.classWrites, { add: 1, remove: 0 });
  h.window.location.pathname = '/project.php';
  h.markers.schedule();
  h.flushPasses();
  assert.deepEqual(h.classWrites, { add: 1, remove: 1 });
  h.markers.teardown();
});

test('UT-B5-THEME-040 semantic markers only write changed values and restore originals', () => {
  const h = harness('/project_designs.php', true);
  h.markers.apply();
  h.flushPasses();
  const writes = Object.fromEntries(Object.entries(h.nodes).map(([name, item]) => [name, { ...item.writes }]));
  assert.equal(h.classes.has('us-sign-semantic-project-ux'), true);
  assert.equal(h.nodes.cell.getAttribute('data-us-state'), 'pending');
  assert.equal(h.nodes.value.getAttribute('data-us-state'), 'pending');
  assert.equal(h.nodes.action.getAttribute('data-us-action'), 'primary');
  h.markers.schedule();
  h.flushPasses();
  assert.deepEqual(Object.fromEntries(Object.entries(h.nodes).map(([name, item]) => [name, { ...item.writes }])), writes);
  h.nodes.value.textContent = 'Approved';
  h.markers.schedule();
  h.flushPasses();
  assert.equal(h.nodes.cell.getAttribute('data-us-state'), 'success');
  assert.equal(h.nodes.value.getAttribute('data-us-state'), 'success');
  assert.equal(h.nodes.alert.writes.set, writes.alert.set);
  h.markers.remove();
  assert.equal(h.nodes.cell.getAttribute('data-us-state'), null);
  assert.equal(h.nodes.value.getAttribute('data-us-state'), null);
  assert.equal(h.nodes.action.getAttribute('data-us-action'), null);
  h.markers.teardown();
});
