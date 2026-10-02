'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createDefaultAuthorityKernel, AUTHORITY_STORAGE_KEY } = require('../../src/extension/authority-kernel');
const { createAuthorityRouter } = require('../../src/extension/authority-router');
const { createAuthorityClient } = require('../../src/extension/authority-client');
const { createAuthorityUpdateTransport } = require('../../src/extension/authority-update-transport');
const { AUTHORITY_MESSAGES, AUTHORITY_PROTOCOL_VERSION } = require('../../src/extension/authority-protocol');
const { createTrustedTransitionCore } = require('../../src/content/trusted-transition-core');
const { createSquareCoilBridgeService } = require('../../src/squarecoil/bridge-service');
const { LEGACY_KEYS } = require('../../src/data/legacy-preflight');

class FakeTimers {
  constructor() { this.intervals = new Map(); this.sequence = 0; }
  setTimeout(callback, delayMs) { return setTimeout(callback, delayMs); }
  clearTimeout(id) { clearTimeout(id); }
  setInterval(callback, delayMs) {
    const id = ++this.sequence;
    this.intervals.set(id, { callback, delayMs });
    return id;
  }
  clearInterval(id) { this.intervals.delete(id); }
}

function ids(namespace) {
  let sequence = 0;
  return prefix => `${namespace}-${prefix}-${String(++sequence).padStart(6, '0')}`;
}

function runtimeMessageSurface() {
  const listeners = new Set();
  return {
    addListener(listener) { listeners.add(listener); },
    removeListener(listener) { listeners.delete(listener); },
    async deliver(message) {
      let acknowledgment;
      for (const listener of listeners) {
        listener(message, {}, value => { acknowledgment = value; });
      }
      return acknowledgment;
    }
  };
}

function createFixture(options = {}) {
  const values = {};
  const area = {
    async get(key) { return { [key]: values[key] === undefined ? undefined : structuredClone(values[key]) }; },
    async set(patch) { Object.assign(values, structuredClone(patch)); },
    read() { return structuredClone(values[AUTHORITY_STORAGE_KEY]); }
  };
  let lockQueue = Promise.resolve();
  const lockManager = {
    request(_name, _options, callback) {
      const run = lockQueue.then(callback, callback);
      lockQueue = run.then(() => undefined, () => undefined);
      return run;
    }
  };
  const clock = { value: 1_000 };
  const kernel = createDefaultAuthorityKernel({
    area,
    lockManager,
    runtimeWorkdayZone: 'UTC',
    now: () => clock.value,
    makeId: ids('kernel-core'),
    leaseDurationMs: options.leaseDurationMs ?? 60_000,
    buildVersion: '0.8.0-b2.2'
  });
  const clients = [];
  const runtimes = new Map();
  const deliveries = [];
  const acknowledgedTransport = createAuthorityUpdateTransport({ tabs: {
    async sendMessage(tabId, message, target) {
      deliveries.push({ tabId, documentId: target?.documentId || null, message });
      const runtime = runtimes.get(`${tabId}\u0000${target?.documentId || ''}`);
      if (!runtime) throw new Error('integration-runtime-unavailable');
      return runtime.deliver(message);
    }
  } });
  const router = createAuthorityRouter({
    adapter: kernel,
    workerInstanceId: 'worker-trusted-core-001',
    randomId: ids('router-core'),
    now: () => clock.value,
    publish: options.acknowledgedUpdates ? acknowledgedTransport.publish : async update => {
      for (const client of clients) {
        client.value.handleWorkerUpdate({
          type: AUTHORITY_MESSAGES.UPDATE,
          protocolVersion: AUTHORITY_PROTOCOL_VERSION,
          ...update
        });
      }
      return true;
    }
  });
  function client(tabId, runtimeInstanceId) {
    const documentToken = `document-trusted-core-${tabId}`;
    const expectedDocumentId = `browser-document-${tabId}`;
    const context = {
      tabId,
      expectedDocumentId,
      documentToken,
      buildId: 'build-trusted-core-integration',
      packageVersion: '0.8.0-b2.2',
      candidateFingerprint: 'd'.repeat(64)
    };
    const runtime = runtimeMessageSurface();
    const value = createAuthorityClient({
      send: message => router.route(context, message),
      runtimeInstanceId,
      documentToken,
      runtimeOnMessage: options.acknowledgedUpdates ? runtime : null,
      requestTimeoutMs: 2_000,
      heartbeatIntervalMs: 30_000,
      randomId: ids(`client-core-${tabId}`),
      timers: new FakeTimers()
    });
    clients.push({ value, context, runtime });
    runtimes.set(`${tabId}\u0000${expectedDocumentId}`, runtime);
    return value;
  }
  return { area, clock, client, deliveries, router };
}

function contextEvent(type, bridgeSeq, context, atMs, priorContextId = null) {
  return {
    type,
    bridgeGeneration: 1,
    bridgeSeq,
    observationId: `integration-observation-${bridgeSeq}`,
    observedAtMs: atMs,
    source: 'SERVER_ACTION_7',
    stateCertainty: 'VERIFIED_SERVER',
    boundaryAtMs: ['CONTEXT_DETECTED', 'CONTEXT_CHANGED'].includes(type) ? atMs : null,
    boundaryCertainty: ['CONTEXT_DETECTED', 'CONTEXT_CHANGED'].includes(type) ? 'DETECTED' : 'NONE',
    transitionCandidateId: null,
    verificationId: `integration-verification-${bridgeSeq}`,
    priorContextId,
    context
  };
}

function job(projectId, label) {
  return {
    contextId: `job:${projectId}`,
    kind: 'job',
    projectId,
    label,
    shortLabel: projectId
  };
}

function bridgeFactory(holder, initialEvents = []) {
  return options => {
    let owner = false;
    let disposed = false;
    const bridge = {
      async ensure(value) {
        owner = value.owner === true;
        if (owner && initialEvents.length) await options.onEvents(initialEvents);
        return bridge.snapshot();
      },
      async setOwner(value) { owner = value === true; return bridge.snapshot(); },
      async verifyNow() { holder.verifications = (holder.verifications || 0) + 1; return bridge.snapshot(); },
      async teardown() { disposed = true; owner = false; return bridge.snapshot(); },
      snapshot() {
        return { initialized: true, active: !disposed, disposed, owner, capability: 'SYNTHETIC_A3' };
      },
      async emit(events) {
        if (!owner || disposed) throw new Error('synthetic-bridge-not-owner');
        return options.onEvents(events);
      }
    };
    holder.value = bridge;
    return bridge;
  };
}

function nativeBridgeEnvironment(clock, state) {
  function element(innerHTML = '', textContent = '') {
    return { innerHTML, textContent, hidden: false, style: { display: '', visibility: '' },
      getAttribute() { return null; } };
  }
  const listeners = new Map();
  const document = {
    visibilityState: 'visible',
    documentElement: {},
    querySelectorAll(selector) {
      if (!state.clockedOut && selector === '#clockin-remaining-time') {
        return [element('<a href="/project.php?id=260801">260801 - Production</a>',
          '260801 - Production')];
      }
      if (state.clockedOut && selector === '#clockin') return [element()];
      if (!state.clockedOut && selector === '#clockout') return [element()];
      if (selector === '.timeclock-container') return [element()];
      return [];
    },
    addEventListener(type, listener) { listeners.set(`document:${type}`, listener); },
    removeEventListener(type) { listeners.delete(`document:${type}`); }
  };
  class MutationObserver {
    observe() {}
    disconnect() {}
  }
  const window = {
    location: { origin: 'https://ussignandmill.squarecoil.net' },
    URL,
    AbortController,
    MutationObserver,
    Element: class {},
    addEventListener(type, listener) { listeners.set(`window:${type}`, listener); },
    removeEventListener(type) { listeners.delete(`window:${type}`); }
  };
  return {
    document,
    window,
    timers: new FakeTimers(),
    now: () => clock.value,
    fetch: async () => {
      state.fetches += 1;
      return { ok: true, text: async () => state.clockedOut
        ? '<span id="clockin-remaining-time"></span>'
        : '<span id="clockin-remaining-time"><a href="/project.php?id=260801">260801 - Production</a></span>' };
    }
  };
}

function nativeBridgeFactory(holder) {
  return options => {
    const service = createSquareCoilBridgeService(options);
    holder.value = service;
    holder.completions = 0;
    return Object.freeze({
      ensure: values => service.ensure(values),
      setOwner: (value, authorityTenure) => service.setOwner(value, authorityTenure),
      verifyNow: trigger => service.verifyNow(trigger),
      async observeNativeCompletion(evidence) {
        holder.completions += 1;
        const result = await service.observeNativeCompletion(evidence);
        holder.lastCompletion = result;
        return result;
      },
      teardown: () => service.teardown(),
      snapshot: () => service.snapshot()
    });
  };
}

function countingAuthority(client, holder) {
  return Object.freeze({
    ...client,
    command(command) {
      holder.commands.push(command);
      return client.command(command);
    }
  });
}

const emptyLegacyStorage = { getItem() { return null; } };

async function waitFor(predicate, message) {
  for (let attempt = 0; attempt < 50; attempt += 1) {
    if (predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 0));
  }
  assert.fail(message);
}

test('IT-B2-BRIDGE-TIMER-001 Bridge events cross the owner fence into one Timer/Ledger truth and synchronized read models', async () => {
  const fixture = createFixture();
  const ownerClient = fixture.client(301, 'runtime-trusted-owner-0001');
  const observerClient = fixture.client(302, 'runtime-trusted-observer-01');
  const ownerBridge = {};
  const first = contextEvent(
    'CONTEXT_DETECTED',
    1,
    job('260701', '260701 - Design'),
    1_000
  );
  const ownerCore = createTrustedTransitionCore({
    authorityClient: ownerClient,
    legacyStorage: emptyLegacyStorage,
    now: () => fixture.clock.value,
    randomId: ids('owner-core-command'),
    createBridge: bridgeFactory(ownerBridge, [first])
  });
  await ownerCore.ensure();
  assert.equal(ownerCore.snapshot().readModelError, null);
  assert.equal(ownerCore.snapshot().timer.timerState, 'ACTIVE');
  assert.equal(ownerCore.snapshot().timer.currentContextId, 'job:260701');

  const observerBridge = {};
  const observerCore = createTrustedTransitionCore({
    authorityClient: observerClient,
    legacyStorage: emptyLegacyStorage,
    now: () => fixture.clock.value,
    randomId: ids('observer-core-command'),
    createBridge: bridgeFactory(observerBridge)
  });
  await observerCore.ensure();
  assert.equal(observerCore.snapshot().authorityOwner, false);
  assert.equal(observerCore.snapshot().timer.currentContextId, 'job:260701');

  const publicActive = await observerClient.read();
  assert.equal(publicActive.document.authorityView.redacted, true);
  assert.equal(Object.hasOwn(publicActive.document.timer.active, 'accrualOwnerToken'), false);
  assert.equal(publicActive.document.timer.active.accrualOwnershipBound, true);

  const settledWhileLive = await ownerCore.settle(await ownerClient.ensure());
  assert.equal(settledWhileLive.recoveryMode, null);
  assert.equal(settledWhileLive.timer.timerState, 'ACTIVE');
  assert.equal(settledWhileLive.timer.currentContextId, 'job:260701');

  fixture.clock.value = 1_500;
  await ownerBridge.value.emit([
    contextEvent(
      'CONTEXT_CHANGED',
      2,
      job('260702', '260702 - Fabrication'),
      1_500,
      'job:260701'
    )
  ]);
  assert.equal(ownerCore.snapshot().timer.currentContextId, 'job:260702');
  assert.equal(ownerCore.snapshot().timer.selectedContextTotalMs, 0);
  assert.equal(observerCore.snapshot().timer.currentContextId, 'job:260702');
  assert.equal(fixture.area.read().document.ledger.length, 1);
  assert.equal(fixture.area.read().document.ledger[0].durationMs, 500);

  fixture.clock.value = 1_800;
  const disabled = await ownerCore.prepareDisable();
  const revisionAfterDisable = fixture.area.read().document.revision;
  await ownerCore.prepareDisable();
  assert.equal(disabled.disabled, true);
  assert.equal(fixture.area.read().document.revision, revisionAfterDisable);
  assert.equal(fixture.area.read().document.timer.active, null);
  assert.deepEqual(fixture.area.read().document.ledger.map(row => row.durationMs), [500, 300]);

  await observerCore.teardown();
  await ownerCore.teardown();
  await observerClient.teardown();
  await ownerClient.teardown();
});

test('IT-B2-BRIDGE-TIMER-005 observer fallback hint prompts OWNER verification without a Timer boundary', async () => {
  const fixture = createFixture();
  const ownerClient = fixture.client(401, 'runtime-hint-owner-00001');
  const observerClient = fixture.client(402, 'runtime-hint-observer-001');
  const ownerBridge = {};
  const ownerCore = createTrustedTransitionCore({ authorityClient: ownerClient,
    legacyStorage: emptyLegacyStorage, now: () => fixture.clock.value,
    randomId: ids('hint-owner-command'), createBridge: bridgeFactory(ownerBridge) });
  await ownerCore.ensure();
  await observerClient.ensure();
  const before = ownerCore.snapshot();
  await observerClient.forwardNativeEvidence({ kind: 'PASSIVE_ACTIVITY_HINT',
    sourceRuntimeId: observerClient.snapshot().runtimeInstanceId,
    documentToken: observerClient.snapshot().documentToken });
  await waitFor(() => ownerBridge.verifications === 1, 'OWNER did not promptly verify observer hint');
  const after = ownerCore.snapshot();
  assert.equal(after.revision, before.revision);
  assert.equal(after.ledgerSegmentCount, before.ledgerSegmentCount);
  assert.equal(after.timer.timerState, before.timer.timerState);
  await observerClient.teardown();
  await ownerCore.teardown();
  await ownerClient.teardown();
});

test('IT-B2-BRIDGE-TIMER-006 takeover routes one acknowledged native clock-out through only the current OWNER', async () => {
  const fixture = createFixture({ leaseDurationMs: 100, acknowledgedUpdates: true });
  fixture.router.setNativeObservationAvailable(true);
  const runtimeA = 'runtime-native-expired-owner-a';
  const runtimeB = 'runtime-native-current-owner-b';
  const clientA = fixture.client(701, runtimeA);
  const clientB = fixture.client(702, runtimeB);
  const commandsA = { commands: [] };
  const commandsB = { commands: [] };
  const bridgeA = {};
  const bridgeB = {};
  const page = { clockedOut: false, fetches: 0 };
  const coreA = createTrustedTransitionCore({
    authorityClient: countingAuthority(clientA, commandsA),
    legacyStorage: emptyLegacyStorage,
    now: () => fixture.clock.value,
    randomId: ids('native-takeover-a'),
    bridgeEnvironment: nativeBridgeEnvironment(fixture.clock, page),
    createBridge: nativeBridgeFactory(bridgeA)
  });
  const coreB = createTrustedTransitionCore({
    authorityClient: countingAuthority(clientB, commandsB),
    legacyStorage: emptyLegacyStorage,
    now: () => fixture.clock.value,
    randomId: ids('native-takeover-b'),
    bridgeEnvironment: nativeBridgeEnvironment(fixture.clock, page),
    createBridge: nativeBridgeFactory(bridgeB)
  });

  await coreA.ensure();
  await coreB.ensure();
  assert.equal(coreA.snapshot().authorityOwner, true);
  assert.equal(coreB.snapshot().authorityOwner, false);
  assert.equal(fixture.area.read().document.timer.active.contextId, 'job:260801');

  fixture.clock.value = 1_101;
  await clientB.heartbeat();
  await clientA.heartbeat();
  await coreA.handleAuthoritySnapshot(clientA.snapshot());
  await coreB.handleAuthoritySnapshot(clientB.snapshot());
  assert.equal(coreA.snapshot().authorityOwner, false);
  assert.equal(coreB.snapshot().authorityOwner, true);
  assert.equal(fixture.router.snapshot().currentOwnerSessionId,
    fixture.router.snapshot().sessions.find(session => session.runtimeInstanceId === runtimeB).sessionId);

  const beforeNative = fixture.area.read().document;
  const commandsABeforeNative = commandsA.commands.length;
  const commandsBBeforeNative = commandsB.commands.length;
  const fetchesBeforeNative = page.fetches;
  const completionAtMs = 1_110;
  page.clockedOut = true;
  fixture.clock.value = 1_120;
  const first = await fixture.router.observeNativeCompletion({
    tabId: 701,
    documentId: 'browser-document-701',
    requestId: 'request-takeover-action-two-001',
    nativeAction: 2,
    completedAtMs: completionAtMs
  });
  const duplicate = await fixture.router.observeNativeCompletion({
    tabId: 701,
    documentId: 'browser-document-701',
    requestId: 'request-takeover-action-two-001',
    nativeAction: 2,
    completedAtMs: completionAtMs
  });
  assert.deepEqual(first, { accepted: true, changed: true, reason: 'native-observation-forwarded' });
  assert.deepEqual(duplicate, { accepted: true, changed: false, reason: 'native-observation-coalesced' });
  await waitFor(() => fixture.area.read().document.timer.active === null,
    'current OWNER did not commit the native-confirmed clock-out');

  const afterNative = fixture.area.read().document;
  const nativeDeliveries = fixture.deliveries.filter(delivery => delivery.message.event?.nativeEvidence);
  assert.equal(nativeDeliveries.length, 1);
  assert.equal(nativeDeliveries[0].tabId, 702);
  assert.equal(nativeDeliveries[0].message.runtimeInstanceId, runtimeB);
  assert.equal(nativeDeliveries.some(delivery => delivery.tabId === 701), false);
  assert.equal(bridgeA.completions, 0);
  assert.equal(bridgeB.completions, 1);
  assert.equal(bridgeB.lastCompletion.accepted, true);
  assert.equal(bridgeB.lastCompletion.needsVerification, true);
  assert.equal(page.fetches, fetchesBeforeNative + 1);
  assert.equal(commandsA.commands.length, commandsABeforeNative);
  assert.equal(commandsB.commands.length, commandsBBeforeNative + 1);
  assert.equal(afterNative.revision, beforeNative.revision + 1);
  assert.equal(afterNative.timer.lastObservation.type, 'CLOCKED_OUT');
  assert.equal(afterNative.timer.lastObservation.boundaryAtMs, completionAtMs);
  assert.equal(afterNative.timer.lastObservation.boundaryCertainty, 'NATIVE_CONFIRMED');
  assert.equal(afterNative.ledger.length, 1);
  assert.equal(afterNative.ledger[0].endAtMs, completionAtMs);

  await coreB.teardown();
  await coreA.teardown();
  await clientB.teardown();
  await clientA.teardown();
});

test('IT-B2-BRIDGE-TIMER-002 MIG-C01 production OWNER performs one migration before creating the Bridge', async () => {
  const fixture = createFixture();
  const client = fixture.client(401, 'runtime-legacy-blocked-001');
  let bridgeCreated = false;
  const core = createTrustedTransitionCore({
    authorityClient: client,
    legacyStorage: {
      getItem(key) { return key === LEGACY_KEYS[0] ? '{"contexts":{}}' : null; }
    },
    now: () => fixture.clock.value,
    randomId: ids('legacy-core-command'),
    createBridge: bridgeFactory({})
  });

  const result = await core.ensure();
  bridgeCreated = result.bridge !== null;
  assert.equal(result.blocked, false, JSON.stringify(result));
  assert.equal(result.preflight.disposition, 'COMPLETE_MATCH');
  assert.equal(bridgeCreated, true);
  assert.equal(fixture.area.read().document.migration.completedSources['squarecoil-v07-localstorage-v1'].completionState, 'COMPLETE');
  assert.equal(fixture.area.read().document.revision, 1);
  assert.equal(JSON.stringify(result).includes('synthetic'), false);

  await core.teardown();
  await client.teardown();
});

test('IT-B2-BRIDGE-TIMER-003 MIG-C02 waiting OBSERVER adopts completed migration without reload or duplicate import', async () => {
  const fixture = createFixture();
  const ownerClient = fixture.client(501, 'runtime-migration-owner-001');
  const observerClient = fixture.client(502, 'runtime-migration-observer-01');
  const legacyStorage = { getItem(key) { return key === LEGACY_KEYS[0] ? '{"contexts":{}}' : null; } };
  await ownerClient.ensure();

  let observerMigrationCommands = 0;
  const observerAuthority = { ...observerClient, migrationCommand: (...args) => {
    observerMigrationCommands += 1;
    return observerClient.migrationCommand(...args);
  } };
  const observerBridge = {};
  const observerCore = createTrustedTransitionCore({
    authorityClient: observerAuthority,
    legacyStorage,
    now: () => fixture.clock.value,
    randomId: ids('migration-observer-command'),
    createBridge: bridgeFactory(observerBridge)
  });
  assert.equal((await observerCore.ensure()).preflight.disposition, 'REQUIRED');
  assert.equal(observerCore.snapshot().bridge, null);

  let ownerMigrationCommands = 0;
  const ownerAuthority = { ...ownerClient, migrationCommand: (...args) => {
    ownerMigrationCommands += 1;
    return ownerClient.migrationCommand(...args);
  } };
  const ownerCore = createTrustedTransitionCore({
    authorityClient: ownerAuthority,
    legacyStorage,
    now: () => fixture.clock.value,
    randomId: ids('migration-owner-command'),
    createBridge: bridgeFactory({})
  });
  await ownerCore.ensure();
  await waitFor(() => observerCore.snapshot().bridge !== null,
    'waiting observer did not adopt completed migration');

  assert.equal(ownerMigrationCommands, 1);
  assert.equal(observerMigrationCommands, 0);
  assert.equal(observerCore.snapshot().preflight.disposition, 'COMPLETE_MATCH');
  assert.equal(observerCore.snapshot().blocked, false);
  assert.equal(fixture.area.read().document.revision, 1);
  assert.equal(Object.keys(fixture.area.read().document.migration.completedSources).length, 1);

  await observerCore.teardown();
  await ownerCore.teardown();
  await observerClient.teardown();
  await ownerClient.teardown();
});

test('IT-B2-BRIDGE-TIMER-004 MIG-C02 waiting OBSERVER migrates after fenced ownership transfer', async () => {
  const fixture = createFixture();
  const firstOwner = fixture.client(601, 'runtime-migration-first-owner');
  const waitingClient = fixture.client(602, 'runtime-migration-waiting-001');
  const legacyStorage = { getItem(key) { return key === LEGACY_KEYS[0] ? '{"contexts":{}}' : null; } };
  await firstOwner.ensure();

  let migrationCommands = 0;
  const waitingAuthority = { ...waitingClient, migrationCommand: (...args) => {
    migrationCommands += 1;
    return waitingClient.migrationCommand(...args);
  } };
  const waitingCore = createTrustedTransitionCore({
    authorityClient: waitingAuthority,
    legacyStorage,
    now: () => fixture.clock.value,
    randomId: ids('migration-takeover-command'),
    createBridge: bridgeFactory({})
  });
  assert.equal((await waitingCore.ensure()).preflight.disposition, 'REQUIRED');
  await firstOwner.teardown();
  fixture.clock.value += 60_001;
  await waitingClient.heartbeat();
  await waitingCore.handleAuthoritySnapshot(waitingClient.snapshot());

  assert.equal(waitingCore.snapshot().authorityOwner, true);
  assert.equal(waitingCore.snapshot().preflight.disposition, 'COMPLETE_MATCH');
  assert.equal(waitingCore.snapshot().blocked, false);
  assert.notEqual(waitingCore.snapshot().bridge, null);
  assert.equal(migrationCommands, 1);
  assert.equal(fixture.area.read().document.revision, 1);

  await waitingCore.teardown();
  await waitingClient.teardown();
});

test('IT-B2-BRIDGE-TIMER-007 concurrent initialization and authority sync submit exactly one migration', async () => {
  const fixture = createFixture();
  const client = fixture.client(603, 'runtime-migration-singleflight');
  const legacyStorage = { getItem(key) { return key === LEGACY_KEYS[0] ? '{"contexts":{}}' : null; } };
  let subscriptions = 0;
  let migrationCommands = 0;
  let bridgeCreations = 0;
  let releaseMigration;
  let markMigrationStarted;
  const migrationStarted = new Promise(resolve => { markMigrationStarted = resolve; });
  const migrationRelease = new Promise(resolve => { releaseMigration = resolve; });
  const guardedAuthority = {
    ...client,
    subscribe(...args) {
      subscriptions += 1;
      return client.subscribe(...args);
    },
    async migrationCommand(...args) {
      migrationCommands += 1;
      markMigrationStarted();
      await migrationRelease;
      return client.migrationCommand(...args);
    }
  };
  const makeBridge = bridgeFactory({});
  const core = createTrustedTransitionCore({
    authorityClient: guardedAuthority,
    legacyStorage,
    now: () => fixture.clock.value,
    randomId: ids('migration-singleflight-command'),
    createBridge(options) {
      bridgeCreations += 1;
      return makeBridge(options);
    }
  });

  const firstEnsure = core.ensure();
  await migrationStarted;
  const secondEnsure = core.ensure();
  const concurrentSync = core.handleAuthoritySnapshot(client.snapshot());
  assert.equal(core.snapshot().initialized, false);
  assert.equal(core.snapshot().preflight.disposition, 'REQUIRED');
  assert.equal(core.snapshot().bridge, null);
  assert.equal(migrationCommands, 1);
  assert.equal(subscriptions, 1);
  assert.equal(bridgeCreations, 0);

  releaseMigration();
  const results = await Promise.all([firstEnsure, secondEnsure, concurrentSync]);
  assert.equal(migrationCommands, 1);
  assert.equal(subscriptions, 1);
  assert.equal(bridgeCreations, 1);
  assert.equal(fixture.area.read().document.revision, 1);
  for (const result of results) {
    assert.equal(result.initialized, true);
    assert.equal(result.blocked, false);
    assert.equal(result.preflight.disposition, 'COMPLETE_MATCH');
    assert.notEqual(result.bridge, null);
  }

  await core.teardown();
  await client.teardown();
});

test('IT-B2-BRIDGE-TIMER-008 settlement refresh rechecks retained migration sources after completion', async () => {
  const fixture = createFixture();
  const client = fixture.client(604, 'runtime-migration-settlement-refresh');
  let legacyValue = '{"contexts":{}}';
  const core = createTrustedTransitionCore({
    authorityClient: client,
    legacyStorage: { getItem(key) { return key === LEGACY_KEYS[0] ? legacyValue : null; } },
    now: () => fixture.clock.value,
    randomId: ids('migration-settlement-refresh-command'),
    createBridge: bridgeFactory({})
  });

  const initial = await core.ensure();
  assert.equal(initial.preflight.disposition, 'COMPLETE_MATCH');
  assert.equal(initial.blocked, false);
  legacyValue = '{"contexts":{"job:changed":{}}}';
  const refreshed = await core.settle(await client.ensure());
  assert.equal(refreshed.blocked, true);
  assert.equal(refreshed.preflight.disposition, 'SOURCE_CHANGED_AFTER_COMPLETION');
  assert.equal(refreshed.preflight.reason, 'legacy-source-changed-after-completion');

  await core.teardown();
  await client.teardown();
});

test('IT-B2-BRIDGE-TIMER-009 queued settlement cannot restore an older authority revision', async () => {
  const fixture = createFixture();
  const sourceClient = fixture.client(605, 'runtime-settlement-current-read');
  const staleConnection = await sourceClient.ensure();
  let currentRead = structuredClone(staleConnection.initialRead);
  let authorityRevision = currentRead.document.revision;
  let disposition = 'OWNER';
  let subscriber = null;
  let releaseDemotion;
  let markDemotionStarted;
  const demotionStarted = new Promise(resolve => { markDemotionStarted = resolve; });
  const demotionRelease = new Promise(resolve => { releaseDemotion = resolve; });
  const authorityClient = {
    async ensure() { return structuredClone(staleConnection); },
    async read() {
      authorityRevision = currentRead.document.revision;
      return structuredClone(currentRead);
    },
    async command() { throw new Error('unexpected-command'); },
    subscribe(listener) { subscriber = listener; return () => { subscriber = null; }; },
    snapshot() {
      return {
        enabled: true,
        healthy: true,
        disposition,
        revision: authorityRevision,
        runtimeInstanceId: 'runtime-settlement-current-read',
        documentToken: 'document-trusted-core-605',
        nativeObservationAvailable: true
      };
    },
    async forwardNativeEvidence() { return { accepted: false }; },
    async teardown() { return { disconnected: true }; }
  };
  let bridgeOwner = false;
  const core = createTrustedTransitionCore({
    authorityClient,
    legacyStorage: { getItem() { return null; } },
    now: () => fixture.clock.value,
    randomId: ids('settlement-current-read-command'),
    createBridge() {
      return {
        async ensure(value) { bridgeOwner = value.owner === true; return this.snapshot(); },
        async setOwner(value) {
          if (value === false) {
            markDemotionStarted();
            await demotionRelease;
          }
          bridgeOwner = value === true;
          return this.snapshot();
        },
        async verifyNow() { return this.snapshot(); },
        async observeNativeCompletion() { return { accepted: false }; },
        async teardown() { bridgeOwner = false; return this.snapshot(); },
        snapshot() {
          return { initialized: true, active: true, disposed: false, owner: bridgeOwner, capability: 'FULL' };
        }
      };
    }
  });

  assert.equal((await core.ensure(staleConnection)).revision, 0);
  disposition = 'OBSERVER_CONNECTED';
  const demotion = core.handleAuthoritySnapshot({ healthy: true, disposition });
  await demotionStarted;

  currentRead = structuredClone(currentRead);
  currentRead.document.revision = 1;
  subscriber(structuredClone(currentRead));
  assert.equal(core.snapshot().revision, 1);
  assert.equal(authorityRevision, 0);

  const settling = core.settle(staleConnection);
  releaseDemotion();
  await demotion;
  const settled = await settling;
  assert.equal(settled.revision, 1);
  assert.equal(authorityRevision, 1);
  assert.equal(settled.authorityOwner, false);

  await core.teardown();
  await sourceClient.teardown();
});

test('IT-B2-BRIDGE-TIMER-010 expired same-principal OWNER reacquisition rotates Bridge tenure and reobserves', async () => {
  const fixture = createFixture({ leaseDurationMs: 50 });
  const client = fixture.client(606, 'runtime-same-principal-reacquire');
  const bridge = {};
  const bridgeState = { clockedOut: false, fetches: 0 };
  const core = createTrustedTransitionCore({
    authorityClient: client,
    legacyStorage: emptyLegacyStorage,
    now: () => fixture.clock.value,
    randomId: ids('same-principal-reacquire-command'),
    bridgeEnvironment: nativeBridgeEnvironment(fixture.clock, bridgeState),
    createBridge: nativeBridgeFactory(bridge)
  });

  const initial = await core.ensure();
  assert.equal(initial.authorityOwner, true);
  assert.deepEqual(initial.authorityTenure, {
    coordinationEpoch: 1,
    workerInstanceId: 'worker-trusted-core-001'
  });
  assert.equal(initial.bridge.ownerInitialObservationCompleted, true);
  assert.equal(bridgeState.fetches, 1);
  const initialBridgeGeneration = initial.bridge.bridgeGeneration;

  fixture.clock.value = 1_050;
  const reacquired = await client.ensure();
  assert.equal(reacquired.disposition, 'OWNER');
  assert.equal(reacquired.coordinationEpoch, 2);

  const settled = await core.settle(reacquired);
  assert.equal(settled.authorityOwner, true);
  assert.deepEqual(settled.authorityTenure, {
    coordinationEpoch: 2,
    workerInstanceId: 'worker-trusted-core-001'
  });
  assert.deepEqual(settled.bridge.authorityTenure, settled.authorityTenure);
  assert.ok(settled.bridge.bridgeGeneration > initialBridgeGeneration);
  assert.equal(settled.bridge.ownerInitialObservationCompleted, true);
  assert.equal(bridgeState.fetches, 2);

  await core.teardown();
  await client.teardown();
});
