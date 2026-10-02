'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createWorkspaceStarter } = require('../../src/ui/workspace-start');

function harness(failures) {
  const callbacks = [];
  const cleared = [];
  const status = { textContent: '' };
  const root = { dataset: {}, querySelector: selector => selector === '[data-sc-lifecycle-fallback-status]' ? status : null };
  let starts = 0;
  const starter = createWorkspaceStarter({
    ui: { start: async () => { starts += 1; if (starts <= failures) throw new Error(`start-failure-${starts}`); } },
    document: { getElementById: () => root },
    retryDelays: [1, 2, 3],
    setTimer(callback) { callbacks.push(callback); return callbacks.length; },
    clearTimer(id) { cleared.push(id); }
  });
  return { starter, callbacks, cleared, root, status, get starts() { return starts; } };
}

test('UT-B5-UI-015 workspace startup retries a bounded failure and recovers without replacing the UI owner', async () => {
  const h = harness(1);
  assert.equal((await h.starter.start()).state, 'RETRY_SCHEDULED');
  await h.callbacks.shift()();
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(h.starter.snapshot().state, 'STARTED');
  assert.equal(h.starts, 2);
  assert.deepEqual(h.root.dataset, {});
});

test('UT-B5-UI-016 exhausted workspace startup exposes an actionable fallback and retirement cancels pending work', async () => {
  const h = harness(99);
  await h.starter.start();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    await h.callbacks.shift()();
    await new Promise(resolve => setImmediate(resolve));
  }
  assert.equal(h.starter.snapshot().state, 'FAILED');
  assert.equal(h.root.dataset.workspaceStartReason, 'workspace-start-failed');
  assert.match(h.status.textContent, /Reload this SquareCoil page/);

  const pending = harness(99);
  await pending.starter.start();
  const retired = pending.starter.retire();
  assert.equal(retired.state, 'RETIRED');
  assert.equal(retired.retryPending, false);
  assert.deepEqual(pending.cleared, [1]);
});
