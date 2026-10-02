'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createLifecycleController, MODES } = require('../../src/core/lifecycle');
const { createFeatureRegistry } = require('../../src/core/feature-registry');
const { BUILD_ID } = require('../../src/core/build-identity');

function createAdapters(overrides = {}) {
  const teardownCounts = { ownership: 0, persistence: 0, ui: 0, features: 0, bridge: 0, coordination: 0 };
  const adapters = {
    ownership: {
      ensure: async () => ({ oneOwner: true }),
      teardown: async () => { teardownCounts.ownership += 1; }
    },
    persistence: {
      ensure: async () => ({ available: true }),
      teardown: async () => { teardownCounts.persistence += 1; }
    },
    ui: {
      ensure: async () => ({ rootCount: 1, owned: true, interactionReady: true, teardownRegistered: true }),
      teardown: async () => { teardownCounts.ui += 1; }
    },
    features: {
      ensure: async () => ({ initialized: true, teardownRegistered: true }),
      teardown: async () => { teardownCounts.features += 1; }
    },
    bridge: {
      ensure: async () => ({ initialized: true, teardownRegistered: true }),
      observeInitial: async () => ({ attempted: true, kind: 'STATE_UNKNOWN' }),
      teardown: async () => { teardownCounts.bridge += 1; }
    },
    coordination: {
      ensure: async () => ({ disposition: 'OWNER' }),
      teardown: async () => { teardownCounts.coordination += 1; }
    }
  };

  for (const [name, patch] of Object.entries(overrides)) {
    adapters[name] = { ...adapters[name], ...patch };
  }
  return { adapters, teardownCounts };
}

function createController(adapters, overrides = {}) {
  return createLifecycleController({
    runtimeInstanceId: 'runtime-test-1',
    buildId: BUILD_ID,
    packageVersion: '0.7.1',
    adapters,
    recoveryDelays: [0, 0, 0],
    sleep: async () => {},
    ...overrides
  });
}

test('READY requires all L1 readiness assertions including ownership and positive coordination', async () => {
  const { adapters } = createAdapters();
  const lifecycle = createController(adapters);
  const result = await lifecycle.boot();
  assert.equal(result.state, 'READY');
  assert.equal(result.reason, 'ready');
  assert.equal(result.readiness.oneLifecycleOwner, true);
  assert.equal(result.readiness.coordinationDisposition, 'OWNER');
  assert.equal(result.readiness.interactionReady, true);
});

test('B1 live coordination placeholder cannot falsely report READY', async () => {
  const { adapters } = createAdapters({
    coordination: { ensure: async () => ({ disposition: 'UNAVAILABLE_B1' }) }
  });
  const lifecycle = createController(adapters);
  const result = await lifecycle.boot();
  assert.equal(result.state, 'DEGRADED');
  assert.equal(result.reason, 'coordination-not-implemented-b1');
  assert.equal(result.readiness.coordinationPositive, false);
});

test('recovery returns to the truthful B1 coordination-only degraded state instead of exhausting', async () => {
  let uiChecks = 0;
  const { adapters } = createAdapters({
    ui: {
      ensure: async () => {
        uiChecks += 1;
        if (uiChecks === 2) throw new Error('transient-ui-check-failed');
        return { rootCount: 1, owned: true, interactionReady: true, teardownRegistered: true };
      }
    },
    coordination: { ensure: async () => ({ disposition: 'UNAVAILABLE_B1' }) }
  });
  const lifecycle = createController(adapters);
  const booted = await lifecycle.boot();
  assert.equal(booted.reason, 'coordination-not-implemented-b1');

  const recovered = await lifecycle.recover();
  assert.equal(recovered.state, 'DEGRADED');
  assert.equal(recovered.reason, 'coordination-not-implemented-b1');
  assert.equal(recovered.recoveryAttempt, 2);
  assert.equal(recovered.readiness.coordinationPositive, false);
});

test('lifecycle owner must be positively confirmed', async () => {
  const { adapters } = createAdapters({ ownership: { ensure: async () => ({ oneOwner: false }) } });
  const lifecycle = createController(adapters);
  const result = await lifecycle.boot();
  assert.equal(result.state, 'DEGRADED');
  assert.equal(result.reason, 'lifecycle-owner-unconfirmed');
});

test('sentinel runtime identity cannot satisfy READY', async () => {
  const { adapters } = createAdapters();
  const lifecycle = createController(adapters, { runtimeInstanceId: 'runtime-unknown' });
  const result = await lifecycle.boot();
  assert.equal(result.state, 'DEGRADED');
  assert.equal(result.reason, 'runtime-identity-invalid');
});

test('READY requires teardown ownership for every core adapter', async () => {
  const { adapters } = createAdapters();
  delete adapters.coordination.teardown;
  const lifecycle = createController(adapters);
  const result = await lifecycle.boot();
  assert.equal(result.state, 'DEGRADED');
  assert.equal(result.reason, 'teardown-unregistered');
  assert.equal(result.readiness.teardownRegistered, false);
});

test('an unregistered core teardown is rejected before its adapter can allocate', async () => {
  let coordinationAllocations = 0;
  const { adapters } = createAdapters({
    coordination: {
      ensure: async () => {
        coordinationAllocations += 1;
        return { disposition: 'OWNER' };
      }
    }
  });
  delete adapters.coordination.teardown;
  const lifecycle = createController(adapters);
  const booted = await lifecycle.boot();
  assert.equal(booted.reason, 'teardown-unregistered');
  assert.equal(coordinationAllocations, 0);

  const disabled = await lifecycle.setMode(MODES.DISABLED);
  assert.equal(disabled.state, 'UNINITIALIZED');
  assert.equal(disabled.reason, 'user-disabled');

  const enabled = await lifecycle.setMode(MODES.ENABLED);
  assert.equal(enabled.state, 'UNINITIALIZED');
  assert.equal(enabled.reason, 'fresh-runtime-required');
  assert.equal(coordinationAllocations, 0);
});

test('a feature missing teardown cannot initialize and clean disable remains possible', async () => {
  let allocations = 0;
  const registry = createFeatureRegistry();
  registry.register('leaked-feature', {
    initialize: async () => { allocations += 1; }
  });
  const { adapters } = createAdapters({
    features: {
      ensure: registry.ensure,
      teardown: registry.teardown
    }
  });
  const lifecycle = createController(adapters);
  const booted = await lifecycle.boot();
  assert.equal(booted.reason, 'teardown-unregistered');
  assert.equal(allocations, 0);

  const disabled = await lifecycle.setMode(MODES.DISABLED);
  assert.equal(disabled.state, 'UNINITIALIZED');
  assert.equal(disabled.reason, 'user-disabled');

  const enabled = await lifecycle.setMode(MODES.ENABLED);
  assert.equal(enabled.state, 'UNINITIALIZED');
  assert.equal(enabled.reason, 'fresh-runtime-required');
  assert.equal(allocations, 0);
});

test('persistence failure denies READY', async () => {
  const { adapters } = createAdapters({
    persistence: { ensure: async () => ({ available: false }) }
  });
  const lifecycle = createController(adapters);
  const result = await lifecycle.boot();
  assert.equal(result.state, 'DEGRADED');
  assert.equal(result.reason, 'persistence-unavailable');
});

test('recover can return a known runtime to READY without creating another lifecycle owner', async () => {
  let uiChecks = 0;
  const { adapters } = createAdapters({
    ui: {
      ensure: async () => {
        uiChecks += 1;
        return { rootCount: 1, owned: true, interactionReady: uiChecks > 1, teardownRegistered: true };
      }
    }
  });
  const lifecycle = createController(adapters);
  const first = await lifecycle.boot();
  assert.equal(first.state, 'DEGRADED');
  assert.equal(first.reason, 'interaction-init-failed');
  const recovered = await lifecycle.recover();
  assert.equal(recovered.state, 'READY');
  assert.equal(recovered.runtimeInstanceId, first.runtimeInstanceId);
});

test('ownership conflict thrown by a core adapter fails reload-safe instead of degrading generically', async () => {
  const { adapters } = createAdapters({
    ui: { ensure: async () => { throw new Error('ownership-conflict:multiple-timer-roots'); } }
  });
  const lifecycle = createController(adapters);
  const result = await lifecycle.boot();
  assert.equal(result.state, 'FAILED');
  assert.equal(result.reason, 'ownership-conflict');
});

test('disable during BOOTING invalidates the boot so READY cannot publish afterward', async () => {
  let releasePersistence;
  const persistenceGate = new Promise(resolve => { releasePersistence = resolve; });
  const { adapters } = createAdapters({
    persistence: { ensure: async () => persistenceGate }
  });
  const lifecycle = createController(adapters);

  const bootTask = lifecycle.boot();
  await Promise.resolve();
  const disableTask = lifecycle.setMode(MODES.DISABLED);
  releasePersistence({ available: true });

  const bootResult = await bootTask;
  const disableResult = await disableTask;
  assert.notEqual(bootResult.state, 'READY');
  assert.equal(disableResult.state, 'UNINITIALIZED');
  assert.equal(disableResult.mode, 'DISABLED');
  assert.equal(disableResult.reason, 'user-disabled');
  assert.equal(lifecycle.snapshot().state, 'UNINITIALIZED');
});

test('re-enable during teardown waits for the lock and retires the old Runtime Instance ID', async () => {
  let releaseTeardown;
  let markTeardownStarted;
  const teardownGate = new Promise(resolve => { releaseTeardown = resolve; });
  const teardownStarted = new Promise(resolve => { markTeardownStarted = resolve; });
  let uiEnsures = 0;
  const { adapters } = createAdapters({
    ui: {
      ensure: async () => {
        uiEnsures += 1;
        return { rootCount: 1, owned: true, interactionReady: true, teardownRegistered: true };
      }
    },
    bridge: {
      teardown: async () => {
        markTeardownStarted();
        await teardownGate;
      }
    }
  });
  const lifecycle = createController(adapters);
  await lifecycle.boot();

  const disableTask = lifecycle.setMode(MODES.DISABLED);
  await teardownStarted;

  let enableSettled = false;
  const enableTask = lifecycle.setMode(MODES.ENABLED).then(result => {
    enableSettled = true;
    return result;
  });
  await Promise.resolve();
  assert.equal(enableSettled, false);

  releaseTeardown();
  await disableTask;
  const enabled = await enableTask;

  assert.equal(enabled.mode, 'ENABLED');
  assert.equal(enabled.state, 'UNINITIALIZED');
  assert.equal(enabled.reason, 'fresh-runtime-required');
  assert.equal(uiEnsures, 1);

  const prohibitedReuse = await lifecycle.boot();
  assert.equal(prohibitedReuse.state, 'UNINITIALIZED');
  assert.equal(prohibitedReuse.reason, 'fresh-runtime-required');
  const prohibitedRevalidation = await lifecycle.revalidate();
  const prohibitedRecovery = await lifecycle.recover();
  assert.equal(prohibitedRevalidation.state, 'UNINITIALIZED');
  assert.equal(prohibitedRevalidation.reason, 'fresh-runtime-required');
  assert.equal(prohibitedRecovery.state, 'UNINITIALIZED');
  assert.equal(prohibitedRecovery.reason, 'fresh-runtime-required');
  assert.equal(uiEnsures, 1);
});

test('incomplete teardown remains FAILED and a later boot call cannot stack a new generation', async () => {
  let uiEnsures = 0;
  const { adapters } = createAdapters({
    ui: {
      ensure: async () => {
        uiEnsures += 1;
        return { rootCount: 1, owned: true, interactionReady: true, teardownRegistered: true };
      }
    },
    bridge: { teardown: async () => { throw new Error('bridge-release-failed'); } }
  });
  const lifecycle = createController(adapters);
  await lifecycle.boot();
  const failedTeardown = await lifecycle.teardown();
  assert.equal(failedTeardown.state, 'FAILED');
  assert.equal(failedTeardown.reason, 'teardown-incomplete');

  const afterBootRequest = await lifecycle.boot();
  assert.equal(afterBootRequest.state, 'FAILED');
  assert.equal(uiEnsures, 1);
});

test('UT-B1-LC-23 keeps failed cleanup sticky and retries only outstanding ownership', async () => {
  const names = ['ownership', 'persistence', 'ui', 'features', 'bridge', 'coordination'];
  const ensureCounts = Object.fromEntries(names.map(name => [name, 0]));
  const teardownCounts = Object.fromEntries(names.map(name => [name, 0]));
  const teardownOrder = [];
  let bridgeFailuresRemaining = 2;
  const resultFor = {
    ownership: { oneOwner: true },
    persistence: { available: true },
    ui: { rootCount: 1, owned: true, interactionReady: true, teardownRegistered: true },
    features: { initialized: true, teardownRegistered: true },
    bridge: { initialized: true, teardownRegistered: true },
    coordination: { disposition: 'OWNER' }
  };
  const adapters = Object.fromEntries(names.map(name => [name, {
    ensure: async () => {
      ensureCounts[name] += 1;
      return resultFor[name];
    },
    teardown: async () => {
      teardownCounts[name] += 1;
      teardownOrder.push(name);
      if (name === 'bridge' && bridgeFailuresRemaining > 0) {
        bridgeFailuresRemaining -= 1;
        throw new Error('bridge-release-failed');
      }
    }
  }]));
  adapters.bridge.observeInitial = async () => ({ attempted: true, kind: 'STATE_UNKNOWN' });

  const oldLifecycle = createController(adapters, {
    runtimeInstanceId: 'runtime-old-generation',
    initiallyOwnedAdapters: ['ownership']
  });
  const booted = await oldLifecycle.boot();
  assert.equal(booted.state, 'READY');
  assert.deepEqual(ensureCounts, Object.fromEntries(names.map(name => [name, 1])));

  const failedDisable = await oldLifecycle.setMode(MODES.DISABLED);
  assert.equal(failedDisable.state, 'FAILED');
  assert.equal(failedDisable.mode, 'DISABLED');
  assert.equal(failedDisable.reason, 'teardown-incomplete');
  assert.equal(failedDisable.cleanupRequired, true);
  assert.deepEqual(failedDisable.outstandingResources, ['ownership', 'bridge']);
  assert.equal(teardownCounts.ownership, 0);

  const ensureSnapshot = { ...ensureCounts };
  const teardownSnapshot = { ...teardownCounts };
  const lockedResults = await Promise.all([
    oldLifecycle.boot(),
    oldLifecycle.revalidate(),
    oldLifecycle.recover(),
    oldLifecycle.setMode(MODES.DISABLED),
    oldLifecycle.setMode(MODES.ENABLED)
  ]);
  for (const locked of lockedResults) {
    assert.equal(locked.state, 'FAILED');
    assert.equal(locked.mode, 'DISABLED');
    assert.equal(locked.reason, 'teardown-incomplete');
  }
  assert.deepEqual(ensureCounts, ensureSnapshot);
  assert.deepEqual(teardownCounts, teardownSnapshot);

  const failedRetry = await oldLifecycle.retryTeardown();
  assert.equal(failedRetry.state, 'FAILED');
  assert.equal(failedRetry.reason, 'teardown-incomplete');
  assert.deepEqual(failedRetry.outstandingResources, ['ownership', 'bridge']);
  assert.equal(failedRetry.teardownInProgress, false);
  assert.equal(teardownCounts.bridge, 2);
  assert.equal(teardownCounts.ownership, 0);
  for (const name of ['coordination', 'features', 'ui', 'persistence']) {
    assert.equal(teardownCounts[name], teardownSnapshot[name]);
  }

  const successfulRetry = await oldLifecycle.retryTeardown();
  assert.equal(successfulRetry.state, 'UNINITIALIZED');
  assert.equal(successfulRetry.mode, 'DISABLED');
  assert.equal(successfulRetry.reason, 'user-disabled');
  assert.deepEqual(successfulRetry.outstandingResources, []);
  assert.equal(successfulRetry.teardownInProgress, false);
  assert.equal(teardownCounts.bridge, 3);
  assert.equal(teardownCounts.ownership, 1);
  assert.deepEqual(teardownOrder.slice(-2), ['bridge', 'ownership']);

  await oldLifecycle.boot();
  const retired = await oldLifecycle.setMode(MODES.ENABLED);
  assert.equal(retired.state, 'UNINITIALIZED');
  assert.equal(retired.reason, 'fresh-runtime-required');
  assert.deepEqual(ensureCounts, ensureSnapshot);

  const freshLifecycle = createController(adapters, {
    runtimeInstanceId: 'runtime-new-generation',
    initiallyOwnedAdapters: ['ownership']
  });
  const fresh = await freshLifecycle.boot();
  assert.equal(fresh.state, 'READY');
  assert.notEqual(fresh.runtimeInstanceId, booted.runtimeInstanceId);
  assert.deepEqual(ensureCounts, Object.fromEntries(names.map(name => [name, 2])));
});

test('boot waits for an explicit cleanup retry and cannot race a new generation into it', async () => {
  let firstFailure = true;
  let retryStarted;
  let releaseRetry;
  const retryGate = new Promise(resolve => { releaseRetry = resolve; });
  const atRetry = new Promise(resolve => { retryStarted = resolve; });
  const { adapters } = createAdapters({
    bridge: {
      teardown: async () => {
        if (firstFailure) {
          firstFailure = false;
          throw new Error('bridge-release-failed');
        }
        retryStarted();
        await retryGate;
      }
    }
  });
  const lifecycle = createController(adapters, { initiallyOwnedAdapters: ['ownership'] });
  await lifecycle.boot();
  const failed = await lifecycle.setMode(MODES.DISABLED);
  assert.equal(failed.reason, 'teardown-incomplete');

  const retryTask = lifecycle.retryTeardown();
  await atRetry;
  let bootSettled = false;
  const bootTask = lifecycle.boot().then(value => {
    bootSettled = true;
    return value;
  });
  await Promise.resolve();
  assert.equal(bootSettled, false);

  releaseRetry();
  const retried = await retryTask;
  const booted = await bootTask;
  assert.equal(retried.state, 'UNINITIALIZED');
  assert.equal(booted.state, 'UNINITIALIZED');
  assert.equal(booted.mode, 'DISABLED');
  assert.deepEqual(booted.outstandingResources, []);
});

test('disable during acquisition prevents every later adapter from initializing', async () => {
  const calls = [];
  let releasePersistence;
  let persistenceStarted;
  const persistenceGate = new Promise(resolve => { releasePersistence = resolve; });
  const atPersistence = new Promise(resolve => { persistenceStarted = resolve; });
  const teardownCalls = [];
  const adapters = {
    ownership: {
      ensure: async () => { calls.push('ownership'); return { oneOwner: true }; },
      teardown: async () => teardownCalls.push('ownership')
    },
    persistence: {
      ensure: async () => {
        calls.push('persistence');
        persistenceStarted();
        await persistenceGate;
        return { available: true };
      },
      teardown: async () => teardownCalls.push('persistence')
    },
    ui: {
      ensure: async () => { calls.push('ui'); return { rootCount: 1, owned: true, interactionReady: true, teardownRegistered: true }; },
      teardown: async () => teardownCalls.push('ui')
    },
    features: {
      ensure: async () => { calls.push('features'); return { initialized: true, teardownRegistered: true }; },
      teardown: async () => teardownCalls.push('features')
    },
    bridge: {
      ensure: async () => { calls.push('bridge'); return { initialized: true, teardownRegistered: true }; },
      observeInitial: async () => { calls.push('observe'); return { attempted: true, kind: 'STATE_UNKNOWN' }; },
      teardown: async () => teardownCalls.push('bridge')
    },
    coordination: {
      ensure: async () => { calls.push('coordination'); return { disposition: 'OWNER' }; },
      teardown: async () => teardownCalls.push('coordination')
    }
  };
  const lifecycle = createController(adapters, { initiallyOwnedAdapters: ['ownership'] });

  const bootTask = lifecycle.boot();
  await atPersistence;
  const disableTask = lifecycle.setMode(MODES.DISABLED);
  releasePersistence();
  await bootTask;
  const disabled = await disableTask;

  assert.equal(disabled.state, 'UNINITIALIZED');
  assert.equal(disabled.reason, 'user-disabled');
  assert.deepEqual(calls, ['ownership', 'persistence']);
  assert.deepEqual(teardownCalls, ['persistence', 'ownership']);
});

test('teardown is idempotent and releases owned adapters once', async () => {
  const { adapters, teardownCounts } = createAdapters();
  const lifecycle = createController(adapters);
  await lifecycle.boot();
  const first = await lifecycle.teardown();
  const second = await lifecycle.teardown();
  assert.equal(first.state, 'UNINITIALIZED');
  assert.equal(second.state, 'UNINITIALIZED');
  assert.deepEqual(teardownCounts, { ownership: 1, persistence: 1, ui: 1, features: 1, bridge: 1, coordination: 1 });
});
