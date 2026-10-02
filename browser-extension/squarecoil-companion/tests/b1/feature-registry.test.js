'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createFeatureRegistry } = require('../../src/core/feature-registry');

test('feature registry initializes once and tears down in reverse order', async () => {
  const calls = [];
  const registry = createFeatureRegistry();
  registry.register('first', {
    initialize: async () => calls.push('init:first'),
    teardown: async () => calls.push('teardown:first')
  });
  registry.register('second', {
    initialize: async () => calls.push('init:second'),
    teardown: async () => calls.push('teardown:second')
  });

  const firstEnsure = await registry.ensure();
  const secondEnsure = await registry.ensure();
  assert.equal(firstEnsure.initialized, true);
  assert.equal(secondEnsure.initialized, true);
  assert.deepEqual(calls, ['init:first', 'init:second']);

  await registry.teardown();
  assert.deepEqual(calls, ['init:first', 'init:second', 'teardown:second', 'teardown:first']);
});

test('failed feature teardown remains registered and is retried before cleanup can succeed', async () => {
  let teardownAttempts = 0;
  const registry = createFeatureRegistry();
  registry.register('retry-release', {
    initialize: async () => {},
    teardown: async () => {
      teardownAttempts += 1;
      if (teardownAttempts === 1) throw new Error('resource-still-live');
    }
  });

  await registry.ensure();
  await assert.rejects(() => registry.teardown(), /retry-release:resource-still-live/);
  assert.deepEqual(registry.snapshot(), [{ name: 'retry-release', initialized: true, teardownOutstanding: true }]);

  await registry.teardown();
  assert.equal(teardownAttempts, 2);
  assert.deepEqual(registry.snapshot(), [{ name: 'retry-release', initialized: false, teardownOutstanding: false }]);
});

test('feature teardown is preflighted before initialization so an unowned leak is never created', async () => {
  let allocations = 0;
  const registry = createFeatureRegistry();
  registry.register('leaked-resource', {
    initialize: async () => { allocations += 1; }
  });

  const readiness = await registry.ensure();
  assert.equal(readiness.initialized, false);
  assert.equal(readiness.teardownRegistered, false);
  await registry.teardown();
  assert.deepEqual(registry.snapshot(), [{ name: 'leaked-resource', initialized: false, teardownOutstanding: false }]);

  await registry.ensure();
  assert.equal(allocations, 0);
});

test('partial initialization retains cleanup ownership and blocks a second initialization', async () => {
  let initializationAttempts = 0;
  let teardownAttempts = 0;
  const registry = createFeatureRegistry();
  registry.register('partial-feature', {
    initialize: async () => {
      initializationAttempts += 1;
      throw new Error('partial-initialize-failed');
    },
    teardown: async () => { teardownAttempts += 1; }
  });

  await assert.rejects(() => registry.ensure(), /partial-initialize-failed/);
  assert.deepEqual(registry.snapshot(), [{ name: 'partial-feature', initialized: false, teardownOutstanding: true }]);
  await assert.rejects(() => registry.ensure(), /initialization-incomplete-cleanup-required/);
  assert.equal(initializationAttempts, 1);

  await registry.teardown();
  assert.equal(teardownAttempts, 1);
  assert.deepEqual(registry.snapshot(), [{ name: 'partial-feature', initialized: false, teardownOutstanding: false }]);
});

test('cancellation between features prevents later initialization and leaves exact cleanup ownership', async () => {
  const calls = [];
  let cancelled = false;
  const registry = createFeatureRegistry();
  registry.register('first', {
    initialize: async () => { calls.push('init:first'); cancelled = true; },
    teardown: async () => calls.push('teardown:first')
  });
  registry.register('second', {
    initialize: async () => calls.push('init:second'),
    teardown: async () => calls.push('teardown:second')
  });

  const result = await registry.ensure({ isCancelled: () => cancelled });
  assert.equal(result.cancelled, true);
  assert.deepEqual(calls, ['init:first']);
  assert.deepEqual(registry.snapshot(), [
    { name: 'first', initialized: true, teardownOutstanding: true },
    { name: 'second', initialized: false, teardownOutstanding: false }
  ]);

  await registry.teardown();
  assert.deepEqual(calls, ['init:first', 'teardown:first']);
});
