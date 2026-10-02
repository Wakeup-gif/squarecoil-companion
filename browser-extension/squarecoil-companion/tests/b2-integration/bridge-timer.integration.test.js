'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const { migrationFailureReason } = require('../../src/content/trusted-transition-core');
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
    async set(patch) {
      if (options.failMigrationWrite && Object.keys(patch[AUTHORITY_STORAGE_KEY]?.document?.migration?.completedSources || {}).length) {
        options.failMigrationWrite = false;
        throw new Error('fictional-persistence-failure');
      }
      Object.assign(values, structuredClone(patch));
    },
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

test('IT-B2-BRIDGE-TIMER-011 malformed startup is preserved without time and repaired action-7 fragment starts once', async () => {
  const fixture = createFixture();
  const client = fixture.client(607, 'runtime-clock-parser-recovery');
  const bridge = {};
  const page = { clockedOut: false, fetches: 0 };
  const environment = nativeBridgeEnvironment(fixture.clock, page);
  const requests = [];
  let html = '<span id="clockin-remaining-time"><a href="/project.php?id=260801">';
  environment.document.querySelectorAll = () => [];
  environment.fetch = async (url, options) => {
    requests.push({ url, body: options.body });
    return { ok: true, text: async () => html };
  };
  const core = createTrustedTransitionCore({
    authorityClient: client, legacyStorage: emptyLegacyStorage,
    now: () => fixture.clock.value, randomId: ids('clock-parser-recovery-command'),
    bridgeEnvironment: environment, createBridge: nativeBridgeFactory(bridge)
  });

  const failed = await core.ensure();
  const failedDocument = fixture.area.read().document;
  assert.equal(failed.bridge.capability, 'UNAVAILABLE');
  assert.equal(failed.bridge.lastError, 'UNCLOSED_AUDITED_CLOCK_ELEMENT');
  assert.equal(failed.timer.nativeDisposition, 'SQUARECOIL_STATE_UNKNOWN');
  assert.equal(failedDocument.timer.lastObservation.type, 'STATE_UNKNOWN');
  assert.equal(failedDocument.timer.lastObservation.stateCertainty, 'UNKNOWN');
  assert.equal(failedDocument.timer.active, null);
  assert.equal(failedDocument.timer.pending, null);
  assert.equal(failedDocument.ledger.length, 0);
  assert.equal(Object.keys(failedDocument.contexts).length, 0);
  assert.equal(failedDocument.revision, 1);
  const initialGeneration = failed.bridge.bridgeGeneration;

  fixture.clock.value = 1_500;
  html = '<a href="/project.php?id=260801">260801 - Production</a>' +
    '<a href="/project.php?id=260802">260802 - Fabrication</a>';
  const conflicting = await core.verifyNow('conflicting-header-fragment');
  const conflictingDocument = fixture.area.read().document;
  assert.equal(conflicting.timer.nativeDisposition, 'SQUARECOIL_STATE_UNKNOWN');
  assert.equal(conflictingDocument.timer.lastObservation.type, 'STATE_CONFLICT');
  assert.equal(conflictingDocument.timer.active, null);
  assert.equal(conflictingDocument.ledger.length, 0);
  assert.equal(Object.keys(conflictingDocument.contexts).length, 0);

  fixture.clock.value = 2_000;
  html = '<a href="/project.php?id=260801">260801 - Production</a>';
  const recovered = await core.verifyNow('repaired-header-fragment');
  const recoveredDocument = fixture.area.read().document;
  assert.equal(recovered.bridge.capability, 'SERVER_FALLBACK');
  assert.equal(recovered.bridge.lastError, null);
  assert.equal(recovered.bridge.bridgeGeneration, initialGeneration);
  assert.equal(recovered.bridge.requestCount, 3);
  assert.equal(recoveredDocument.timer.lastObservation.type, 'CONTEXT_DETECTED');
  assert.equal(recoveredDocument.timer.active.contextId, 'job:260801');
  assert.equal(recoveredDocument.timer.active.startedAtMs, 2_000);
  assert.equal(recoveredDocument.timer.pending, null);
  assert.equal(recoveredDocument.ledger.length, 0);
  assert.equal(recoveredDocument.revision, 3);
  assert.equal(requests.length, 3);
  assert.ok(requests.every(request => request.body === 'action=7'));
  assert.equal(recovered.bridge.nativeMutationRequestCount, 0);
  await core.teardown();
  await client.teardown();
});

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


// Historical producers: workspace.pauseSelected writes manualPausedKey + Pending;
// runtime.observe(out) removes Pending, then onClick(clear-all) removes the Context
// without clearing manualPausedKey. Archive history is unaffected by that journey.
function orphanPauseJourney() {
  const current = { schema: 3, contexts: { 'job:123': { key: 'job:123', projectId: '123' } },
    active: null, pending: { key: 'job:123', detectedAt: 100 },
    meta: { manualPausedKey: 'job:123', observedClockKey: 'job:123' } };
  current.pending = null;
  current.meta.observedClockKey = null;
  current.contexts = {};
  return current;
}

function migration073Sources(current = orphanPauseJourney()) {
  return {
    [LEGACY_KEYS[0]]: JSON.stringify(current),
    [LEGACY_KEYS[1]]: JSON.stringify({ contexts: { 'job:456': {
      key: 'job:456', type: 'job', projectId: '456', label: 'Fictional retained history',
      accumulatedMs: 3_600_000, sessions: [{ id: 'retained-session', cycleId: 'retained-cycle',
        startAt: 10_000, endAt: 3_610_000, durationMs: 3_600_000 }]
    } } }),
    [LEGACY_KEYS[2]]: JSON.stringify([{ type: 'fictional-activity' }])
  };
}

function readonly073Storage(sources) {
  return {
    getItem(key) { return sources[key] ?? null; },
    setItem() { assert.fail('retained source write'); },
    removeItem() { assert.fail('retained source removal'); },
    clear() { assert.fail('retained source clear'); }
  };
}

function assert073History(document) {
  assert.equal(document.ledger.length, 1);
  assert.equal(document.ledger[0].durationMs, 3_600_000);
  assert.equal(document.contexts['job:456'].legacyUnattributedMs, 0);
  assert.equal(document.contexts['job:123'], undefined);
  assert.equal(Object.keys(document.migration.completedSources).length, 1);
  assert.equal(document.timer.pending, null);
  assert.equal(document.timer.localPause, null);
  assert.equal(document.migration.recoveryCandidates?.localPause, undefined);
}

test('IT-B2-MIG-COMPAT-001 authentic orphan hint preserves hours and bytes before fresh real Bridge timing', async () => {
  const fixture = createFixture();
  const client = fixture.client(730, 'runtime-orphan-pause-073');
  const sources = migration073Sources();
  const retained = structuredClone(sources);
  const bridge = {};
  const page = { clockedOut: true, fetches: 0 };
  const core = createTrustedTransitionCore({ authorityClient: client,
    legacyStorage: readonly073Storage(sources), now: () => fixture.clock.value,
    randomId: ids('orphan-073'), bridgeEnvironment: nativeBridgeEnvironment(fixture.clock, page),
    createBridge: nativeBridgeFactory(bridge) });
  try {
    const settled = await core.ensure();
    assert.equal(settled.blocked, false);
    assert.equal(settled.preflight.disposition, 'COMPLETE_MATCH');
    assert.equal(page.fetches, 1);
    const migrated = fixture.area.read().document;
    assert073History(migrated);
    assert.equal(migrated.timer.active, null);
    assert.deepEqual(migrated.migration.diagnostics.filter(row => row.code === 'LEGACY_ORPHAN_MANUAL_PAUSE_IGNORED')
      .map(({ code }) => ({ code })), [{ code: 'LEGACY_ORPHAN_MANUAL_PAUSE_IGNORED' }]);
    const revision = migrated.revision;
    await core.settle();
    assert.equal(fixture.area.read().document.revision, revision);
    page.clockedOut = false;
    fixture.clock.value = 2_000;
    await core.verifyNow('fresh-current-clock');
    const current = fixture.area.read().document;
    assert073History(current);
    assert.equal(current.timer.active.contextId, 'job:260801');
    assert.equal(current.timer.active.startedAtMs, 2_000);
    fixture.clock.value = 3_000;
    await core.verifyNow('fresh-clock-verification');
    fixture.clock.value = 4_000;
    await core.prepareDisable();
    const finalized = fixture.area.read().document;
    assert.equal(finalized.timer.active, null);
    assert.deepEqual(finalized.ledger.map(row => row.durationMs), [3_600_000, 2_000]);
    assert.equal(finalized.ledger[1].contextId, 'job:260801');
    assert.equal(bridge.value.snapshot().nativeMutationRequestCount, 0);
    assert.deepEqual(sources, retained);
  } finally { await core.teardown(); await client.teardown(); }
});

test('IT-B2-MIG-COMPAT-002 strict real router failures preserve authority and recover on explicit same-core retry', async () => {
  const cases = [
    [current => { current.localPause = { key: 'job:123' }; }, 'legacy-local-pause-context-missing'],
    [current => { current.localPause = 'malformed-private-pause'; }, 'legacy-local-pause-invalid'],
    [current => { current.active = { key: 'job:123' }; }, 'legacy-active-context-missing'],
    [current => { current.pending = { key: 'job:123' }; }, 'legacy-pending-context-missing'],
    [current => { current.contexts = { 'job:789': { key: 'job:789', projectId: '789', sessions: [
      { id: 'same-private-id', startAt: 100, endAt: 200 },
      { id: 'same-private-id', startAt: 300, endAt: 400 }
    ] } }; }, 'legacy-session-id-conflict']
  ];
  for (const [index, [breakSource, reason]] of cases.entries()) {
    const fixture = createFixture();
    const client = fixture.client(740 + index, `runtime-strict-migration-073-${index}`);
    await client.ensure();
    const before = fixture.area.read().document;
    const current = orphanPauseJourney();
    breakSource(current);
    const sources = migration073Sources(current);
    const original = structuredClone(sources);
    const statuses = [];
    const core = createTrustedTransitionCore({ authorityClient: client,
      legacyStorage: readonly073Storage(sources), now: () => fixture.clock.value,
      randomId: ids(`strict-073-${index}`), createBridge: bridgeFactory({}),
      onStatusChange: status => statuses.push(status) });
    try {
      const failed = await core.ensure();
      assert.equal(failed.blocked, true);
      assert.equal(failed.lastError, reason);
      // Exercise the production controller's bounded settlement projection
      // on the real router/client/core failure, not a manufactured error.
      const controllerSource = fs.readFileSync(path.resolve(__dirname, '../../src/content/controller.js'), 'utf8');
      const projectionStart = controllerSource.indexOf('  function settlementCoreSnapshot(');
      const projectionEnd = controllerSource.indexOf('  // This handle exists', projectionStart);
      const project = vm.runInNewContext('(' + controllerSource.slice(projectionStart, projectionEnd).trim() + ')',
        { migrationFailureReason });
      const projected = project(failed);
      assert.equal(projected.migrationError, reason);
      assert.equal(Object.hasOwn(projected, 'lastError'), false);
      assert.equal(Object.hasOwn(projected, 'timer'), false);
      assert.equal(failed.bridge, null);
      assert.deepEqual(fixture.area.read().document, before);
      assert.deepEqual(sources, original);
      assert.equal(JSON.stringify(statuses).includes('same-private-id'), false);
      assert.equal(JSON.stringify(statuses).includes('malformed-private-pause'), false);
      // Repair only this fictional fixture; never mutate a real retained profile.
      sources[LEGACY_KEYS[0]] = JSON.stringify(orphanPauseJourney());
      const recovered = await core.settle();
      assert.equal(recovered.blocked, false);
      assert.equal(recovered.preflight.disposition, 'COMPLETE_MATCH');
      assert.equal(recovered.lastError, null);
      assert.notEqual(recovered.bridge, null);
      assert073History(fixture.area.read().document);
      assert.equal(fixture.area.read().document.timer.active, null);
      const revision = fixture.area.read().document.revision;
      await core.settle();
      assert.equal(fixture.area.read().document.revision, revision);
    } finally { await core.teardown(); await client.teardown(); }
  }
});

test('IT-B2-MIG-COMPAT-003 failed migration persistence rolls back and imports once on same-core retry', async () => {
  const fixture = createFixture({ failMigrationWrite: true });
  const client = fixture.client(750, 'runtime-persistence-migration-073');
  await client.ensure();
  const before = fixture.area.read().document;
  const sources = migration073Sources();
  const retained = structuredClone(sources);
  const core = createTrustedTransitionCore({ authorityClient: client,
    legacyStorage: readonly073Storage(sources), now: () => fixture.clock.value,
    randomId: ids('persistence-073'), createBridge: bridgeFactory({}) });
  try {
    const failed = await core.ensure();
    assert.equal(failed.blocked, true);
    assert.equal(failed.lastError, 'authority-command-failed');
    assert.equal(failed.bridge, null);
    assert.deepEqual(fixture.area.read().document, before);
    const retry = await core.settle();
    assert.equal(retry.blocked, false);
    assert.equal(retry.preflight.disposition, 'COMPLETE_MATCH');
    assert073History(fixture.area.read().document);
    const revision = fixture.area.read().document.revision;
    await core.settle();
    assert.equal(fixture.area.read().document.revision, revision);
    assert.deepEqual(sources, retained);
  } finally { await core.teardown(); await client.teardown(); }
});


test('IT-B2-MIG-PAD-001 live-profile padded shape preserves totals and reaches fresh Bridge without retained writes', async () => {
  const fixture = createFixture();
  const client = fixture.client(760, 'runtime-padded-migration');
  const bridge = {};
  const page = { clockedOut: true, fetches: 0 };
  const padded = { key: 'job:001234', type: 'job', projectId: '001234', label: 'Fictional padded job',
    accumulatedMs: 7_200_000, sessions: [{ id: 'padded-session', cycleId: 'padded-cycle',
      startAt: 10_000, endAt: 3_610_000, durationMs: 3_600_000 }] };
  const sources = migration073Sources({ schema: 3, contexts: { 'job:001234': padded },
    active: null, pending: { key: 'job:001234' }, meta: { manualPausedKey: 'job:001234' } });
  const retained = structuredClone(sources);
  const core = createTrustedTransitionCore({ authorityClient: client, legacyStorage: readonly073Storage(sources),
    now: () => fixture.clock.value, randomId: ids('padded'),
    bridgeEnvironment: nativeBridgeEnvironment(fixture.clock, page), createBridge: nativeBridgeFactory(bridge) });
  try {
    const result = await core.ensure();
    assert.equal(result.blocked, false);
    assert.equal(result.preflight.disposition, 'COMPLETE_MATCH');
    const migrated = fixture.area.read().document;
    assert.equal(migrated.contexts['job:001234'], undefined);
    assert.equal(migrated.contexts['job:1234'].projectId, '1234');
    assert.equal(migrated.contexts['job:1234'].legacyUnattributedMs, 3_600_000);
    assert.deepEqual(migrated.ledger.map(row => row.durationMs), [3_600_000, 3_600_000]);
    assert.equal(migrated.timer.active, null);
    assert.equal(migrated.timer.pending, null);
    assert.equal(migrated.timer.localPause, null);
    const revision = migrated.revision;
    await core.settle();
    assert.equal(fixture.area.read().document.revision, revision);
    page.clockedOut = false;
    fixture.clock.value = 2_000;
    await core.verifyNow('fresh-post-padded-migration');
    assert.equal(fixture.area.read().document.timer.active.contextId, 'job:260801');
    assert.equal(bridge.value.snapshot().nativeMutationRequestCount, 0);
    assert.deepEqual(sources, retained);
  } finally { await core.teardown(); await client.teardown(); }
});

test('IT-B2-MIG-SYNC-001 delayed OBSERVER callback uses current OWNER and migrates preserved history once', async () => {
  const fixture = createFixture();
  const page = { clockedOut: true, fetches: 0 };
  const bridge = {};
  const firstOwner = fixture.client(780, 'runtime-delayed-first-owner');
  const client = fixture.client(781, 'runtime-delayed-migration');
  await firstOwner.ensure();
  const sources = migration073Sources();
  const retained = structuredClone(sources);
  let migrationCommands = 0;
  const authority = { ...client, migrationCommand: (...args) => {
    migrationCommands += 1; return client.migrationCommand(...args);
  } };
  const core = createTrustedTransitionCore({ authorityClient: authority,
    legacyStorage: readonly073Storage(sources), now: () => fixture.clock.value,
    randomId: ids('delayed-migration'), bridgeEnvironment: nativeBridgeEnvironment(fixture.clock, page),
    createBridge: nativeBridgeFactory(bridge) });
  try {
    assert.equal((await core.ensure()).preflight.disposition, 'REQUIRED');
    const staleObserver = client.snapshot();
    await firstOwner.teardown();
    fixture.clock.value += 60_001;
    await client.heartbeat();
    assert.equal(client.snapshot().disposition, 'OWNER');
    await core.handleAuthoritySnapshot(staleObserver);
    assert.equal(core.snapshot().authorityOwner, true);
    assert.equal(core.snapshot().preflight.disposition, 'COMPLETE_MATCH');
    assert.equal(core.snapshot().blocked, false);
    assert073History(fixture.area.read().document);
    await core.handleAuthoritySnapshot(staleObserver);
    assert.equal(migrationCommands, 1);
    page.clockedOut = false;
    fixture.clock.value += 1_000;
    await core.verifyNow('fresh-after-delayed-migration');
    assert.equal(fixture.area.read().document.timer.active.contextId, 'job:260801');
    fixture.clock.value += 2_000;
    await core.verifyNow('accrue-after-delayed-migration');
    assert.equal(fixture.area.read().document.ledger[0].durationMs, 3_600_000);
    await core.prepareDisable();
    assert.deepEqual(fixture.area.read().document.ledger.map(row => row.durationMs), [3_600_000, 2_000]);
    assert.equal(fixture.area.read().document.ledger[1].contextId, 'job:260801');
    assert.equal(bridge.value.snapshot().nativeMutationRequestCount, 0);
    assert.deepEqual(sources, retained);
  } finally { await core.teardown(); await client.teardown(); await firstOwner.teardown(); }
});

test('IT-B2-MIG-SYNC-002 stale unavailable health retains a real migration failure and stale OWNER cannot import', async () => {
  const fixture = createFixture();
  const client = fixture.client(782, 'runtime-delayed-failed-migration');
  await client.ensure();
  const before = fixture.area.read().document;
  const current = orphanPauseJourney();
  current.localPause = 'malformed-private-pause';
  const sources = migration073Sources(current);
  const retained = structuredClone(sources);
  let migrationCommands = 0;
  const authority = { ...client, migrationCommand: (...args) => {
    migrationCommands += 1;
    return client.migrationCommand(...args);
  } };
  const core = createTrustedTransitionCore({ authorityClient: authority,
    legacyStorage: readonly073Storage(sources), now: () => fixture.clock.value,
    randomId: ids('delayed-failed-migration'), createBridge: bridgeFactory({}) });
  try {
    const failed = await core.ensure();
    assert.equal(failed.authorityOwner, true);
    assert.equal(failed.preflight.disposition, 'FAILED');
    assert.equal(failed.lastError, 'legacy-local-pause-invalid');
    assert.equal(migrationCommands, 1);
    const currentOwner = client.snapshot();

    const unchanged = await core.handleAuthoritySnapshot({
      ...currentOwner, healthy: false, disposition: 'UNAVAILABLE'
    });
    assert.equal(client.snapshot().disposition, 'OWNER');
    assert.equal(unchanged.authorityOwner, true);
    assert.deepEqual(unchanged.authorityTenure, failed.authorityTenure);
    assert.equal(unchanged.preflight.disposition, 'FAILED');
    assert.equal(unchanged.status, 'legacy-preflight-failed');
    assert.equal(unchanged.lastError, 'legacy-local-pause-invalid');
    assert.equal(unchanged.bridge, null);
    assert.equal(migrationCommands, 1);
    assert.deepEqual(fixture.area.read().document, before);
    assert.deepEqual(sources, retained);

    // A previously positive callback cannot revive a now disconnected client.
    await client.teardown();
    assert.equal(client.snapshot().disposition, 'UNAVAILABLE');
    await assert.rejects(core.handleAuthoritySnapshot(currentOwner), /authority-teardown-requested/);
    const disconnected = core.snapshot();
    assert.equal(disconnected.authorityOwner, false);
    assert.equal(disconnected.preflight.disposition, 'FAILED');
    assert.equal(disconnected.lastError, 'legacy-local-pause-invalid');
    assert.equal(disconnected.bridge, null);
    assert.equal(migrationCommands, 1);
    assert.deepEqual(fixture.area.read().document, before);
    assert.deepEqual(sources, retained);
  } finally { await core.teardown(); await client.teardown(); }
});

test('IT-B2-MIG-SYNC-003 migration uses current OWNER established during an unavailable-client read', async () => {
  const fixture = createFixture();
  const firstOwner = fixture.client(783, 'runtime-read-reconnect-first-owner');
  const client = fixture.client(784, 'runtime-read-reconnect-migration');
  await firstOwner.ensure();
  const sources = migration073Sources();
  const retained = structuredClone(sources);
  let unavailableUntilRead = false;
  let migrationCommands = 0;
  const authority = {
    ...client,
    snapshot() {
      const current = client.snapshot();
      return unavailableUntilRead ? {
        ...current, healthy: false, disposition: 'UNAVAILABLE',
        coordinationEpoch: null, workerInstanceId: null
      } : current;
    },
    async read() {
      // Model the real client's read() reconnecting before it returns its
      // authoritative document. All reads and migration still use the router.
      unavailableUntilRead = false;
      return client.read();
    },
    migrationCommand(...args) {
      migrationCommands += 1;
      return client.migrationCommand(...args);
    }
  };
  const core = createTrustedTransitionCore({ authorityClient: authority,
    legacyStorage: readonly073Storage(sources), now: () => fixture.clock.value,
    randomId: ids('read-reconnect-migration'), createBridge: bridgeFactory({}) });
  try {
    assert.equal((await core.ensure()).preflight.disposition, 'REQUIRED');
    assert.equal(migrationCommands, 0);
    await firstOwner.teardown();
    fixture.clock.value += 60_001;
    await client.heartbeat();
    assert.equal(client.snapshot().disposition, 'OWNER');
    unavailableUntilRead = true;
    const unavailable = authority.snapshot();
    const result = await core.handleAuthoritySnapshot(unavailable);
    assert.equal(result.authorityOwner, true);
    assert.deepEqual(result.authorityTenure, {
      coordinationEpoch: client.snapshot().coordinationEpoch,
      workerInstanceId: client.snapshot().workerInstanceId
    });
    assert.equal(result.preflight.disposition, 'COMPLETE_MATCH');
    assert.equal(result.blocked, false);
    assert073History(fixture.area.read().document);
    assert.equal(migrationCommands, 1);
    assert.deepEqual(sources, retained);
  } finally { await core.teardown(); await client.teardown(); await firstOwner.teardown(); }
});

test('IT-B2-MIG-DISPOSE-001 teardown during an OWNER read prevents import and real Bridge attachment', async () => {
  const fixture = createFixture();
  const firstOwner = fixture.client(790, 'runtime-dispose-read-first-owner');
  const client = fixture.client(791, 'runtime-dispose-read-migration');
  await firstOwner.ensure();
  const sources = migration073Sources();
  const retained = structuredClone(sources);
  const bridge = {};
  let releaseRead;
  let readEntered;
  const readGate = new Promise(resolve => { releaseRead = resolve; });
  const entered = new Promise(resolve => { readEntered = resolve; });
  let delayRead = false;
  let migrationCommands = 0;
  const authority = {
    ...client,
    async read() {
      if (delayRead) { readEntered(); await readGate; }
      return client.read();
    },
    migrationCommand(...args) {
      migrationCommands += 1;
      return client.migrationCommand(...args);
    }
  };
  const core = createTrustedTransitionCore({ authorityClient: authority,
    legacyStorage: readonly073Storage(sources), now: () => fixture.clock.value,
    randomId: ids('dispose-read'), bridgeEnvironment: nativeBridgeEnvironment(fixture.clock,
      { clockedOut: true, fetches: 0 }), createBridge: nativeBridgeFactory(bridge) });
  let pending;
  try {
    assert.equal((await core.ensure()).preflight.disposition, 'REQUIRED');
    const staleObserver = client.snapshot();
    const before = fixture.area.read().document;
    await firstOwner.teardown();
    fixture.clock.value += 60_001;
    await client.heartbeat();
    assert.equal(client.snapshot().disposition, 'OWNER');
    delayRead = true;
    pending = core.handleAuthoritySnapshot(staleObserver);
    pending.catch(() => {});
    await entered;
    await core.teardown();
    releaseRead();
    const [completion] = await Promise.allSettled([pending]);
    if (completion.status === 'rejected') {
      assert.match(completion.reason.message, /trusted-transition-core-disposed/);
    }
    assert.equal(migrationCommands, 0);
    assert.equal(bridge.value, undefined);
    assert.equal(core.snapshot().bridge, null);
    assert.equal(core.snapshot().disposed, true);
    assert.equal(core.snapshot().authorityOwner, false);
    assert.equal(core.snapshot().status, 'trusted-core-torn-down');
    assert.deepEqual(fixture.area.read().document, before);
    assert.deepEqual(sources, retained);
  } finally {
    releaseRead();
    if (pending) await Promise.allSettled([pending]);
    if (bridge.value) await bridge.value.teardown();
    await core.teardown(); await client.teardown(); await firstOwner.teardown();
  }
});

test('IT-B2-MIG-DISPOSE-002 committed import survives teardown and disconnect without resurrecting a real Bridge', async () => {
  const fixture = createFixture();
  const client = fixture.client(792, 'runtime-dispose-committed-migration');
  await client.ensure();
  const sources = migration073Sources();
  const retained = structuredClone(sources);
  const bridge = {};
  let releaseResponse;
  let commandCommitted;
  const responseGate = new Promise(resolve => { releaseResponse = resolve; });
  const committed = new Promise(resolve => { commandCommitted = resolve; });
  let migrationCommands = 0;
  const authority = {
    ...client,
    async migrationCommand(...args) {
      migrationCommands += 1;
      const result = await client.migrationCommand(...args);
      commandCommitted();
      await responseGate;
      return result;
    }
  };
  const core = createTrustedTransitionCore({ authorityClient: authority,
    legacyStorage: readonly073Storage(sources), now: () => fixture.clock.value,
    randomId: ids('dispose-committed'), bridgeEnvironment: nativeBridgeEnvironment(fixture.clock,
      { clockedOut: true, fetches: 0 }), createBridge: nativeBridgeFactory(bridge) });
  let pending;
  let restartedClient;
  let restartedCore;
  const restartedBridge = {};
  try {
    pending = core.ensure();
    pending.catch(() => {});
    await committed;
    const imported = fixture.area.read().document;
    assert073History(imported);
    await core.teardown();
    await client.teardown();
    assert.equal(client.snapshot().healthy, false);
    assert.equal(client.snapshot().disposition, 'UNAVAILABLE');
    releaseResponse();
    const [completion] = await Promise.allSettled([pending]);
    if (completion.status === 'rejected') {
      assert.match(completion.reason.message, /trusted-transition-core-disposed/);
    }
    assert.equal(migrationCommands, 1);
    assert.equal(bridge.value, undefined);
    assert.equal(core.snapshot().bridge, null);
    assert.equal(core.snapshot().disposed, true);
    assert.equal(core.snapshot().initialized, false);
    assert.equal(core.snapshot().authorityOwner, false);
    assert.equal(core.snapshot().status, 'trusted-core-torn-down');
    assert.deepEqual(fixture.area.read().document, imported);
    assert.deepEqual(sources, retained);

    // A new positive client reads the completed marker rather than importing
    // the same retained sources again after the old initialization was aborted.
    restartedClient = fixture.client(793, 'runtime-dispose-restarted-migration');
    let restartedMigrationCommands = 0;
    const restartedAuthority = { ...restartedClient, migrationCommand: (...args) => {
      restartedMigrationCommands += 1;
      return restartedClient.migrationCommand(...args);
    } };
    restartedCore = createTrustedTransitionCore({ authorityClient: restartedAuthority,
      legacyStorage: readonly073Storage(sources), now: () => fixture.clock.value,
      randomId: ids('dispose-restarted'), bridgeEnvironment: nativeBridgeEnvironment(fixture.clock,
        { clockedOut: true, fetches: 0 }), createBridge: nativeBridgeFactory(restartedBridge) });
    assert.equal((await restartedCore.ensure()).preflight.disposition, 'COMPLETE_MATCH');
    assert.equal(restartedMigrationCommands, 0);
    assert073History(fixture.area.read().document);
    assert.deepEqual(fixture.area.read().document.migration, imported.migration);
    assert.equal(restartedBridge.value.snapshot().nativeMutationRequestCount, 0);
    assert.deepEqual(sources, retained);
  } finally {
    releaseResponse();
    if (pending) await Promise.allSettled([pending]);
    if (bridge.value) await bridge.value.teardown();
    await core.teardown(); await client.teardown();
    if (restartedCore) await restartedCore.teardown();
    if (restartedClient) await restartedClient.teardown();
  }
});

test('IT-B2-MIG-DISPOSE-003 queued settlements cannot revive torn-down ownership or read a disconnected client', async () => {
  const fixture = createFixture();
  const client = fixture.client(794, 'runtime-dispose-queued-settlement');
  const sources = migration073Sources();
  const retained = structuredClone(sources);
  const bridge = {};
  let releaseRead;
  let readEntered;
  const readGate = new Promise(resolve => { releaseRead = resolve; });
  const entered = new Promise(resolve => { readEntered = resolve; });
  let delayRead = false;
  let delayedReads = 0;
  let migrationCommands = 0;
  const authority = {
    ...client,
    async read() {
      if (!delayRead) return client.read();
      delayedReads += 1;
      const value = await client.read();
      readEntered();
      await readGate;
      return value;
    },
    migrationCommand(...args) {
      migrationCommands += 1;
      return client.migrationCommand(...args);
    }
  };
  const core = createTrustedTransitionCore({ authorityClient: authority,
    legacyStorage: readonly073Storage(sources), now: () => fixture.clock.value,
    randomId: ids('dispose-queued'), bridgeEnvironment: nativeBridgeEnvironment(fixture.clock,
      { clockedOut: true, fetches: 0 }), createBridge: nativeBridgeFactory(bridge) });
  const pending = [];
  try {
    await core.ensure();
    const connected = await client.ensure();
    const imported = fixture.area.read().document;
    assert073History(imported);
    delayRead = true;
    pending.push(core.settle(connected));
    pending[0].catch(() => {});
    await entered;
    pending.push(core.settle(connected));
    pending[1].catch(() => {});
    await core.teardown();
    await client.teardown();
    releaseRead();
    const completions = await Promise.allSettled(pending);
    for (const completion of completions) {
      if (completion.status === 'rejected') {
        assert.match(completion.reason.message, /trusted-transition-core-disposed/);
      }
    }
    assert.equal(delayedReads, 1);
    assert.equal(migrationCommands, 1);
    assert.equal(core.snapshot().disposed, true);
    assert.equal(core.snapshot().authorityOwner, false);
    assert.equal(core.snapshot().status, 'trusted-core-torn-down');
    assert.equal(bridge.value.snapshot().disposed, true);
    assert.equal(bridge.value.snapshot().active, false);
    assert.equal(bridge.value.snapshot().owner, false);
    assert.equal(bridge.value.snapshot().listenersAttached, false);
    assert.equal(bridge.value.snapshot().nativeMutationRequestCount, 0);
    assert.deepEqual(fixture.area.read().document, imported);
    assert.deepEqual(sources, retained);
  } finally {
    releaseRead();
    await Promise.allSettled(pending);
    if (bridge.value) await bridge.value.teardown();
    await core.teardown(); await client.teardown();
  }
});

test('IT-B2-MIG-IDENTITY-001 conflicting identity and unproved same-ID recovery fail before atomic commit', async () => {
  const cases = [
    [() => ({ schema: 3, contexts: { 'job:111111': {
      key: 'job:111111', type: 'job', projectId: '222222', accumulatedMs: 3_600_000, sessions: []
    } }, active: null, pending: null }), 'legacy-context-identity-conflict'],
    [() => ({ schema: 3, contexts: { 'job:123456': {
      key: 'job:123456', type: 'job', projectId: 'malformed', accumulatedMs: 3_600_000, sessions: []
    } }, active: null, pending: null }), 'legacy-context-identity-invalid'],
    [() => ({ schema: 3, contexts: { 'job:123456': {
      key: 'job:123456', type: 'job', projectId: '123456', accumulatedMs: 1_000,
      sessions: [{ id: 'private-conflicting-active-id', startAt: 1_000, endAt: 2_000, durationMs: 1_000 }]
    } }, active: { key: 'job:123456', sessionId: 'private-conflicting-active-id',
      startedAt: 2_000, lastVerifiedAt: 3_000 }, pending: null }), 'legacy-session-id-conflict'],
    [() => ({ schema: 3, contexts: { 'job:123456': {
      key: 'job:123456', type: 'job', projectId: '123456', accumulatedMs: 1_000,
      sessions: [{ id: 'private-conflicting-active-id', durationMs: 1_000 }]
    } }, active: { key: 'job:123456', sessionId: 'private-conflicting-active-id',
      startedAt: 1_000, lastVerifiedAt: 2_000 }, pending: null }), 'legacy-session-id-conflict']
  ];
  for (const [index, [source, reason]] of cases.entries()) {
    const fixture = createFixture();
    const client = fixture.client(810 + index, `runtime-identity-atomic-${index}`);
    await client.ensure();
    const before = fixture.area.read().document;
    const sources = migration073Sources(source());
    const retained = structuredClone(sources);
    let migrationCommands = 0;
    const authority = { ...client, migrationCommand: (...args) => {
      migrationCommands += 1;
      return client.migrationCommand(...args);
    } };
    const statuses = [];
    const core = createTrustedTransitionCore({ authorityClient: authority,
      legacyStorage: readonly073Storage(sources), now: () => fixture.clock.value,
      randomId: ids(`identity-atomic-${index}`), createBridge: bridgeFactory({}),
      onStatusChange: status => statuses.push(status) });
    try {
      const failed = await core.ensure();
      assert.equal(failed.blocked, true);
      assert.equal(failed.preflight.disposition, 'FAILED');
      assert.equal(failed.lastError, reason);
      assert.equal(failed.bridge, null);
      assert.deepEqual(fixture.area.read().document, before);
      assert.equal(migrationCommands, 1);
      assert.deepEqual(sources, retained);
      assert.equal(JSON.stringify(statuses).includes('private-conflicting-active-id'), false);
      // Repair only this fictional test input. The live source must stay untouched.
      sources[LEGACY_KEYS[0]] = JSON.stringify(orphanPauseJourney());
      const recovered = await core.settle();
      assert.equal(recovered.blocked, false);
      assert.equal(recovered.preflight.disposition, 'COMPLETE_MATCH');
      assert.equal(recovered.lastError, null);
      assert.notEqual(recovered.bridge, null);
      assert073History(fixture.area.read().document);
      assert.equal(migrationCommands, 2);
      const revision = fixture.area.read().document.revision;
      await core.settle();
      assert.equal(migrationCommands, 2);
      assert.equal(fixture.area.read().document.revision, revision);
    } finally { await core.teardown(); await client.teardown(); }
  }
});

test('IT-B2-MIG-SYNC-004 genuine migration failure remains diagnostic after a real OWNER to OBSERVER transition', async () => {
  const fixture = createFixture();
  const client = fixture.client(795, 'runtime-failed-owner-loss');
  await client.ensure();
  const before = fixture.area.read().document;
  const current = orphanPauseJourney();
  current.localPause = 'malformed-private-pause';
  const sources = migration073Sources(current);
  const retained = structuredClone(sources);
  let migrationCommands = 0;
  const authority = { ...client, migrationCommand: (...args) => {
    migrationCommands += 1;
    return client.migrationCommand(...args);
  } };
  const bridge = {};
  const core = createTrustedTransitionCore({ authorityClient: authority,
    legacyStorage: readonly073Storage(sources), now: () => fixture.clock.value,
    randomId: ids('failed-owner-loss'), bridgeEnvironment: nativeBridgeEnvironment(fixture.clock,
      { clockedOut: true, fetches: 0 }), createBridge: nativeBridgeFactory(bridge) });
  let nextOwner;
  let recoveryOwner;
  try {
    assert.equal((await core.ensure()).lastError, 'legacy-local-pause-invalid');
    assert.equal(migrationCommands, 1);
    fixture.clock.value += 60_001;
    nextOwner = fixture.client(796, 'runtime-failed-next-owner');
    await nextOwner.ensure();
    await client.heartbeat();
    assert.equal(client.snapshot().disposition, 'OBSERVER_CONNECTED');
    const observed = await core.handleAuthoritySnapshot(client.snapshot());
    assert.equal(observed.authorityOwner, false);
    assert.equal(observed.preflight.disposition, 'FAILED');
    assert.equal(observed.status, 'legacy-preflight-failed');
    assert.equal(observed.lastError, 'legacy-local-pause-invalid');
    assert.equal(observed.bridge, null);
    assert.equal(bridge.value, undefined);
    assert.equal(migrationCommands, 1);
    assert.deepEqual(fixture.area.read().document, before);
    assert.deepEqual(sources, retained);
    // Reacquisition retries the real validator, retaining the genuine failure
    // and all original bytes rather than fabricating readiness or time.
    await nextOwner.teardown();
    fixture.clock.value += 60_001;
    await client.heartbeat();
    assert.equal(client.snapshot().disposition, 'OWNER');
    const retried = await core.handleAuthoritySnapshot(client.snapshot());
    assert.equal(retried.authorityOwner, true);
    assert.equal(retried.preflight.disposition, 'FAILED');
    assert.equal(retried.lastError, 'legacy-local-pause-invalid');
    assert.equal(retried.bridge, null);
    assert.equal(migrationCommands, 2);
    assert.deepEqual(fixture.area.read().document, before);
    assert.deepEqual(sources, retained);

    // Changing only this fictional retained input invalidates the remembered
    // failure. An OBSERVER still cannot import until it reacquires ownership.
    fixture.clock.value += 60_001;
    recoveryOwner = fixture.client(797, 'runtime-failed-recovery-owner');
    await recoveryOwner.ensure();
    await client.heartbeat();
    assert.equal(client.snapshot().disposition, 'OBSERVER_CONNECTED');
    sources[LEGACY_KEYS[0]] = JSON.stringify(orphanPauseJourney());
    const repairedSources = structuredClone(sources);
    const waiting = await core.settle();
    assert.equal(waiting.authorityOwner, false);
    assert.equal(waiting.preflight.disposition, 'REQUIRED');
    assert.equal(waiting.lastError, null);
    assert.equal(waiting.bridge, null);
    assert.equal(migrationCommands, 2);
    assert.deepEqual(fixture.area.read().document, before);
    assert.deepEqual(sources, repairedSources);
    await recoveryOwner.teardown();
    fixture.clock.value += 60_001;
    await client.heartbeat();
    assert.equal(client.snapshot().disposition, 'OWNER');
    const recovered = await core.handleAuthoritySnapshot(client.snapshot());
    assert.equal(recovered.preflight.disposition, 'COMPLETE_MATCH');
    assert.equal(recovered.lastError, null);
    assert.equal(migrationCommands, 3);
    assert073History(fixture.area.read().document);
    const revision = fixture.area.read().document.revision;
    await core.settle();
    assert.equal(migrationCommands, 3);
    assert.equal(fixture.area.read().document.revision, revision);
    assert.equal(bridge.value.snapshot().nativeMutationRequestCount, 0);
    assert.deepEqual(sources, repairedSources);
  } finally {
    if (bridge.value) await bridge.value.teardown();
    await core.teardown(); await client.teardown();
    if (nextOwner) await nextOwner.teardown();
    if (recoveryOwner) await recoveryOwner.teardown();
  }
});
