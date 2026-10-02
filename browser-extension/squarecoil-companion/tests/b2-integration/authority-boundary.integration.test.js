'use strict';

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AUTHORITY_PROTOCOL_VERSION,
  AUTHORITY_MESSAGES,
  AUTHORITY_CONTROL_MESSAGES,
  B2_SETTLEMENT_ACK
} = require('../../src/extension/authority-protocol');
const { createAuthorityRouter } = require('../../src/extension/authority-router');
const {
  KERNEL_ONLY_DISPOSITION,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  createAuthorityClient,
  createLifecycleAuthorityAdapter
} = require('../../src/extension/authority-client');
const { DEFAULT_LEASE_MS } = require('../../src/data/store');
const { createLifecycleController } = require('../../src/core/lifecycle');
const { createA3Harness } = require('../b1-integration/harness');

const LIFECYCLE_MESSAGES = Object.freeze({
  BOOT: 'SC_COMPANION_BOOT',
  ENABLE: 'SC_COMPANION_SET_ENABLED',
  RETRY_TEARDOWN: 'SC_COMPANION_RETRY_TEARDOWN'
});

function isolatedAuthority(page) {
  return page.isolatedSandbox?.__squareCoilCompanionAuthorityHealth || null;
}

function b2SettlementMessage(page, suffix) {
  const authority = isolatedAuthority(page).snapshot();
  return {
    type: AUTHORITY_CONTROL_MESSAGES.GET_B2_SETTLEMENT,
    protocolVersion: AUTHORITY_PROTOCOL_VERSION,
    settlementId: `settlement-${suffix}`,
    settlementMode: 'REFRESH',
    workerInstanceId: authority.workerInstanceId,
    documentToken: page.documentToken,
    runtimeInstanceId: page.health.runtimeInstanceId
  };
}

class FakeTimers {
  constructor() {
    this.intervals = new Map();
    this.intervalSequence = 0;
  }

  setTimeout(callback, delayMs) { return setTimeout(callback, delayMs); }
  clearTimeout(id) { clearTimeout(id); }

  setInterval(callback, delayMs) {
    const id = ++this.intervalSequence;
    this.intervals.set(id, { callback, delayMs });
    return id;
  }

  clearInterval(id) { this.intervals.delete(id); }
  get intervalCount() { return this.intervals.size; }
  get intervalDelays() { return [...this.intervals.values()].map(entry => entry.delayMs); }
}

function ids(namespace) {
  let sequence = 0;
  return prefix => `${namespace}-${prefix}-${String(++sequence).padStart(6, '0')}`;
}

function createBoundaryKernel() {
  const sessions = new Map();
  const listeners = new Set();
  const calls = { initialize: 0, connect: 0, subscribe: 0, read: 0, heartbeat: 0, command: 0, disconnect: 0 };
  let revision = 0;
  return {
    async initialize() { calls.initialize += 1; },
    async connect(principal) {
      calls.connect += 1;
      let session = sessions.get(principal.runtimeId);
      if (!session) {
        session = Object.freeze({ sessionId: `kernel-${principal.runtimeId}`, ...principal });
        sessions.set(principal.runtimeId, session);
      }
      return {
        session,
        disposition: 'OWNER',
        coordinationEpoch: 1,
        coordinationRevision: 1,
        leaseExpiry: 5000,
        revision
      };
    },
    async subscribe(listener) {
      calls.subscribe += 1;
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    async read() {
      calls.read += 1;
      return { revision, timer: { status: 'IDLE' } };
    },
    async heartbeat() {
      calls.heartbeat += 1;
      return {
        disposition: 'OWNER',
        coordinationEpoch: 1,
        coordinationRevision: 1,
        leaseExpiry: 5000,
        revision
      };
    },
    async command(_session, command) {
      calls.command += 1;
      revision += 1;
      const event = { revision, commandId: command.commandId };
      for (const listener of [...listeners]) listener(event);
      return { revision, accepted: true };
    },
    async disconnect() { calls.disconnect += 1; },
    calls
  };
}

function workerContext(overrides = {}) {
  return {
    tabId: 71,
    expectedDocumentId: 'browser-document-boundary',
    documentToken: 'document-boundary-000001',
    buildId: 'build-b2-integration',
    packageVersion: '0.7.1',
    candidateFingerprint: 'b'.repeat(64),
    ...overrides
  };
}

test('IT-B2-PLATFORM-002 isolated content client routes read/subscribe through one worker authority and heartbeat owner', async () => {
  const timers = new FakeTimers();
  const adapter = createBoundaryKernel();
  const context = workerContext();
  let client = null;
  let holdReplacementConnect = false;
  let replacementConnectReached = false;
  let releaseReplacementConnect;
  const replacementConnectGate = new Promise(resolve => { releaseReplacementConnect = resolve; });
  let router = createAuthorityRouter({
    adapter,
    workerInstanceId: 'worker-boundary-before',
    randomId: ids('router-before'),
    publish: async update => client.handleWorkerUpdate({
      type: AUTHORITY_MESSAGES.UPDATE,
      protocolVersion: AUTHORITY_PROTOCOL_VERSION,
      ...update
    })
  });
  client = createAuthorityClient({
    send: async message => {
      const response = await router.route(context, message);
      if (holdReplacementConnect && message.type === AUTHORITY_MESSAGES.CONNECT) {
        replacementConnectReached = true;
        await replacementConnectGate;
      }
      return response;
    },
    runtimeInstanceId: 'runtime-boundary-0000001',
    documentToken: context.documentToken,
    heartbeatIntervalMs: 10000,
    requestTimeoutMs: 1000,
    randomId: ids('client'),
    timers
  });
  client.subscribe(() => {});

  const connected = await client.ensure();
  assert.equal(connected.disposition, 'OWNER');
  assert.equal(adapter.calls.initialize, 1);
  assert.equal(adapter.calls.connect, 1);
  assert.equal(adapter.calls.subscribe, 1);
  assert.equal(adapter.calls.read, 1);
  assert.equal(timers.intervalCount, 1);

  const read = await client.read();
  assert.equal(read.revision, 0);
  assert.equal(adapter.calls.read, 3);
  assert.equal(adapter.calls.command, 0);

  router = createAuthorityRouter({
    adapter,
    workerInstanceId: 'worker-boundary-after',
    randomId: ids('router-after')
  });
  holdReplacementConnect = true;
  const reconnecting = client.heartbeat();
  while (!replacementConnectReached) await Promise.resolve();
  const reconnectingSnapshot = client.snapshot();
  assert.equal(reconnectingSnapshot.healthy, false);
  assert.equal(reconnectingSnapshot.disposition, 'UNAVAILABLE');
  assert.equal(reconnectingSnapshot.workerInstanceId, null);
  releaseReplacementConnect();
  await reconnecting;
  assert.equal(client.snapshot().healthy, true);
  assert.equal(client.snapshot().workerInstanceId, 'worker-boundary-after');
  assert.equal(Object.hasOwn(client.snapshot(), 'sessionId'), false);
  assert.equal(adapter.calls.connect, 2);
  assert.equal(timers.intervalCount, 1);

  const disconnected = await client.teardown();
  assert.equal(disconnected.disconnected, true);
  assert.equal(adapter.calls.disconnect, 1);
  assert.equal(timers.intervalCount, 0);
  assert.equal(router.snapshot().sessionCount, 0);
});

test('IT-B2-PLATFORM-003 production authority transport is isolated from MAIN and has no postMessage relay', () => {
  const root = path.resolve(__dirname, '../..');
  const content = fs.readFileSync(path.join(root, 'src/content/controller.js'), 'utf8');
  const page = fs.readFileSync(path.join(root, 'src/page/entry.js'), 'utf8');
  const protocol = require('../../src/extension/authority-protocol');

  assert.match(content, /createAuthorityClient/);
  assert.doesNotMatch(content, /postMessage|createContentAuthorityRelay|PAGE_AUTHORITY_CHANNEL/);
  assert.doesNotMatch(page, /createAuthorityClient|AUTHORITY_MESSAGES|postMessage/);
  assert.equal(Object.hasOwn(protocol, 'PAGE_AUTHORITY_CHANNEL'), false);
  assert.equal(Object.hasOwn(protocol, 'PAGE_DIRECTIONS'), false);
  assert.equal(fs.existsSync(path.join(root, 'src/extension/authority-page-relay.js')), false);
});

test('IT-B2-PLATFORM-011 isolated client exposes only the scoped command method and no private session identity', async () => {
  const timers = new FakeTimers();
  const adapter = createBoundaryKernel();
  const context = workerContext({ tabId: 72, documentToken: 'document-command-boundary-001' });
  const router = createAuthorityRouter({ adapter, workerInstanceId: 'worker-command-boundary', randomId: ids('router-command') });
  const client = createAuthorityClient({
    send: message => router.route(context, message),
    runtimeInstanceId: 'runtime-command-boundary-0001',
    documentToken: context.documentToken,
    requestTimeoutMs: 1000,
    randomId: ids('client-command'),
    timers
  });

  await client.ensure();
  assert.equal(typeof client.command, 'function');
  assert.equal(Object.hasOwn(client.snapshot(), 'sessionId'), false);
  assert.equal(adapter.calls.command, 0);
  await client.teardown();
});

test('IT-B2-PLATFORM-004 kernel OWNER remains non-positive for lifecycle READY until Bridge/Timer wiring exists', async () => {
  let ensureCalls = 0;
  let teardownCalls = 0;
  const privateClient = {
    async ensure() {
      ensureCalls += 1;
      return { disposition: 'OWNER', revision: 0, coordinationEpoch: 1 };
    },
    async teardown() { teardownCalls += 1; }
  };
  const coordination = createLifecycleAuthorityAdapter(privateClient, { allowPositiveReadiness: false });
  const direct = await coordination.ensure();
  assert.equal(direct.authorityDisposition, 'OWNER');
  assert.equal(direct.disposition, KERNEL_ONLY_DISPOSITION);

  const simple = value => ({ ensure: async () => value, teardown: async () => {} });
  const lifecycle = createLifecycleController({
    runtimeInstanceId: 'runtime-lifecycle-gate-001',
    buildId: 'build-lifecycle-gate-001',
    packageVersion: '0.7.1',
    adapters: {
      ownership: simple({ oneOwner: true }),
      persistence: simple({ available: true }),
      ui: simple({ rootCount: 1, owned: true, interactionReady: true, teardownRegistered: true }),
      features: simple({ initialized: true, teardownRegistered: true }),
      bridge: {
        ensure: async () => ({ initialized: true, teardownRegistered: true }),
        observeInitial: async () => ({ attempted: true, kind: 'STATE_UNKNOWN' }),
        teardown: async () => {}
      },
      coordination
    }
  });

  const booted = await lifecycle.boot();
  assert.equal(booted.state, 'DEGRADED');
  assert.equal(booted.reason, 'coordination-not-implemented-b1');
  assert.equal(booted.readiness.coordinationPositive, false);
  assert.equal(booted.readiness.coordinationDisposition, KERNEL_ONLY_DISPOSITION);
  assert.notEqual(booted.state, 'READY');
  assert.equal(ensureCalls, 2);

  await lifecycle.teardown('test-complete');
  assert.equal(teardownCalls, 1);
});

test('IT-B2-PLATFORM-010 default heartbeat has a safe margin before authority lease expiry', async () => {
  assert(DEFAULT_HEARTBEAT_INTERVAL_MS * 2 < DEFAULT_LEASE_MS);
  const timers = new FakeTimers();
  const adapter = createBoundaryKernel();
  const context = workerContext({ tabId: 73, documentToken: 'document-heartbeat-margin-001' });
  const router = createAuthorityRouter({ adapter, workerInstanceId: 'worker-heartbeat-margin', randomId: ids('router-heartbeat') });
  const client = createAuthorityClient({
    send: message => router.route(context, message),
    runtimeInstanceId: 'runtime-heartbeat-margin-0001',
    documentToken: context.documentToken,
    requestTimeoutMs: 1000,
    randomId: ids('client-heartbeat'),
    timers
  });

  const connected = await client.ensure();
  assert.equal(connected.disposition, 'OWNER');
  assert.deepEqual(timers.intervalDelays, [DEFAULT_HEARTBEAT_INTERVAL_MS]);
  await client.teardown();
});

test('IT-B2-PLATFORM-013 isolated teardown recovers from an immediate worker restart without a heartbeat', async () => {
  const timers = new FakeTimers();
  const adapter = createBoundaryKernel();
  const context = workerContext({ tabId: 74, documentToken: 'document-teardown-restart-001' });
  let router = createAuthorityRouter({ adapter, workerInstanceId: 'worker-teardown-before', randomId: ids('router-before') });
  const client = createAuthorityClient({
    send: message => router.route(context, message),
    runtimeInstanceId: 'runtime-teardown-restart-0001',
    documentToken: context.documentToken,
    heartbeatIntervalMs: 10000,
    requestTimeoutMs: 1000,
    randomId: ids('client-teardown'),
    timers
  });

  await client.ensure();
  router = createAuthorityRouter({ adapter, workerInstanceId: 'worker-teardown-after', randomId: ids('router-after') });
  const disconnected = await client.teardown();

  assert.equal(disconnected.disconnected, true);
  assert.equal(disconnected.recoveredAfterWorkerRestart, true);
  assert.equal(adapter.calls.connect, 2);
  assert.equal(adapter.calls.disconnect, 1);
  assert.equal(timers.intervalCount, 0);
  assert.equal(router.snapshot().sessionCount, 0);
});

test('IT-B2-PLATFORM-014 isolated client rejects a mismatched response envelope before adopting authority', async () => {
  const timers = new FakeTimers();
  const client = createAuthorityClient({
    send: async request => ({
      ok: true,
      protocolVersion: AUTHORITY_PROTOCOL_VERSION,
      type: request.type,
      requestId: 'different-authority-request-0001',
      disposition: 'OWNER',
      sessionId: 'forged-session-envelope-0001',
      workerInstanceId: 'forged-worker-envelope-0001'
    }),
    runtimeInstanceId: 'runtime-response-envelope-0001',
    documentToken: 'document-response-envelope-001',
    requestTimeoutMs: 1000,
    randomId: ids('client-response-envelope'),
    timers
  });

  await assert.rejects(client.ensure(), /authority-response-envelope-invalid/);
  assert.equal(client.snapshot().healthy, false);
  assert.equal(client.snapshot().workerInstanceId, null);
  assert.equal(timers.intervalCount, 0);
  client.dispose();
});

test('IT-B2-PLATFORM-015 teardown drains an in-flight CONNECT and releases its late-acquired session', async () => {
  const timers = new FakeTimers();
  const adapter = createBoundaryKernel();
  const context = workerContext({ tabId: 75, documentToken: 'document-connect-teardown-001' });
  const router = createAuthorityRouter({ adapter, workerInstanceId: 'worker-connect-teardown', randomId: ids('router-connect-teardown') });
  let connectReached = false;
  let releaseConnect;
  const connectGate = new Promise(resolve => { releaseConnect = resolve; });
  const client = createAuthorityClient({
    send: async message => {
      const response = await router.route(context, message);
      if (message.type === AUTHORITY_MESSAGES.CONNECT) {
        connectReached = true;
        await connectGate;
      }
      return response;
    },
    runtimeInstanceId: 'runtime-connect-teardown-0001',
    documentToken: context.documentToken,
    requestTimeoutMs: 1000,
    randomId: ids('client-connect-teardown'),
    timers
  });

  const connecting = client.ensure();
  while (!connectReached) await Promise.resolve();
  const tearingDown = client.teardown();
  releaseConnect();
  await assert.rejects(connecting, /authority-teardown-requested/);
  const result = await tearingDown;

  assert.equal(result.disconnected, true);
  assert.equal(adapter.calls.connect, 1);
  assert.equal(adapter.calls.disconnect, 1);
  assert.equal(router.snapshot().sessionCount, 0);
  assert.equal(client.snapshot().enabled, false);
  assert.equal(client.snapshot().healthy, false);
  assert.equal(client.snapshot().disposition, 'UNAVAILABLE');
});

test('IT-B2-PLATFORM-016 teardown drains an in-flight heartbeat before releasing the session', async () => {
  const timers = new FakeTimers();
  const adapter = createBoundaryKernel();
  const context = workerContext({ tabId: 76, documentToken: 'document-heartbeat-teardown-001' });
  const router = createAuthorityRouter({ adapter, workerInstanceId: 'worker-heartbeat-teardown', randomId: ids('router-heartbeat-teardown') });
  let holdHeartbeat = false;
  let heartbeatReached = false;
  let releaseHeartbeat;
  const heartbeatGate = new Promise(resolve => { releaseHeartbeat = resolve; });
  const client = createAuthorityClient({
    send: async message => {
      const response = await router.route(context, message);
      if (holdHeartbeat && message.type === AUTHORITY_MESSAGES.HEARTBEAT) {
        heartbeatReached = true;
        await heartbeatGate;
      }
      return response;
    },
    runtimeInstanceId: 'runtime-heartbeat-teardown-0001',
    documentToken: context.documentToken,
    requestTimeoutMs: 1000,
    randomId: ids('client-heartbeat-teardown'),
    timers
  });

  await client.ensure();
  holdHeartbeat = true;
  const heartbeating = client.heartbeat();
  while (!heartbeatReached) await Promise.resolve();
  const tearingDown = client.teardown();
  releaseHeartbeat();
  await assert.rejects(heartbeating, /authority-teardown-requested/);
  const result = await tearingDown;

  assert.equal(result.disconnected, true);
  assert.equal(adapter.calls.disconnect, 1);
  assert.equal(router.snapshot().sessionCount, 0);
  assert.equal(timers.intervalCount, 0);
});

test('IT-B2-PLATFORM-017 uncertain CONNECT outcome is recovered only to release exact ownership', async () => {
  const timers = new FakeTimers();
  const adapter = createBoundaryKernel();
  const context = workerContext({ tabId: 77, documentToken: 'document-uncertain-connect-001' });
  const router = createAuthorityRouter({ adapter, workerInstanceId: 'worker-uncertain-connect', randomId: ids('router-uncertain-connect') });
  let loseFirstConnectResponse = true;
  let lostSessionId = null;
  const client = createAuthorityClient({
    send: async message => {
      const response = await router.route(context, message);
      if (message.type === AUTHORITY_MESSAGES.CONNECT && loseFirstConnectResponse) {
        loseFirstConnectResponse = false;
        lostSessionId = response.sessionId;
        throw new Error('synthetic-connect-response-loss');
      }
      return response;
    },
    runtimeInstanceId: 'runtime-uncertain-connect-0001',
    documentToken: context.documentToken,
    requestTimeoutMs: 1000,
    randomId: ids('client-uncertain-connect'),
    timers
  });

  await assert.rejects(client.ensure(), /synthetic-connect-response-loss/);
  assert.equal(router.snapshot().sessionCount, 1);
  const result = await client.teardown();

  assert.equal(result.disconnected, true);
  assert.equal(result.sessionId, lostSessionId);
  assert.equal(adapter.calls.connect, 1);
  assert.equal(adapter.calls.disconnect, 1);
  assert.equal(router.snapshot().sessionCount, 0);
});

test('IT-B2-PLATFORM-019 teardown recovers after a restarted worker rejects an in-flight old-session heartbeat', async () => {
  const timers = new FakeTimers();
  const adapter = createBoundaryKernel();
  const context = workerContext({ tabId: 78, documentToken: 'document-restart-heartbeat-teardown-001' });
  let router = createAuthorityRouter({ adapter, workerInstanceId: 'worker-heartbeat-before-restart', randomId: ids('router-heartbeat-before') });
  let holdHeartbeat = false;
  let heartbeatReached = false;
  let releaseHeartbeat;
  const heartbeatGate = new Promise(resolve => { releaseHeartbeat = resolve; });
  const client = createAuthorityClient({
    send: async message => {
      const response = await router.route(context, message);
      if (holdHeartbeat && message.type === AUTHORITY_MESSAGES.HEARTBEAT) {
        heartbeatReached = true;
        await heartbeatGate;
      }
      return response;
    },
    runtimeInstanceId: 'runtime-restart-heartbeat-teardown-001',
    documentToken: context.documentToken,
    requestTimeoutMs: 1000,
    randomId: ids('client-restart-heartbeat-teardown'),
    timers
  });

  await client.ensure();
  router = createAuthorityRouter({ adapter, workerInstanceId: 'worker-heartbeat-after-restart', randomId: ids('router-heartbeat-after') });
  holdHeartbeat = true;
  const heartbeating = client.heartbeat();
  while (!heartbeatReached) await Promise.resolve();
  const tearingDown = client.teardown();
  releaseHeartbeat();
  await assert.rejects(heartbeating, /authority-teardown-requested/);
  const disconnected = await tearingDown;

  assert.equal(disconnected.disconnected, true);
  assert.equal(adapter.calls.connect, 2);
  assert.equal(adapter.calls.disconnect, 1);
  assert.equal(router.snapshot().sessionCount, 0);
  assert.equal(client.snapshot().enabled, false);
  assert.equal(timers.intervalCount, 0);
});

test('IT-B2-PLATFORM-020 replacement CONNECT response loss remains a cleanup obligation', async () => {
  const timers = new FakeTimers();
  const adapter = createBoundaryKernel();
  const context = workerContext({ tabId: 79, documentToken: 'document-reconnect-loss-teardown-001' });
  let router = createAuthorityRouter({ adapter, workerInstanceId: 'worker-reconnect-loss-before', randomId: ids('router-reconnect-loss-before') });
  let loseReplacementConnect = false;
  const client = createAuthorityClient({
    send: async message => {
      const response = await router.route(context, message);
      if (loseReplacementConnect && message.type === AUTHORITY_MESSAGES.CONNECT) {
        loseReplacementConnect = false;
        throw new Error('synthetic-replacement-connect-response-loss');
      }
      return response;
    },
    runtimeInstanceId: 'runtime-reconnect-loss-teardown-001',
    documentToken: context.documentToken,
    requestTimeoutMs: 1000,
    randomId: ids('client-reconnect-loss-teardown'),
    timers
  });

  await client.ensure();
  router = createAuthorityRouter({ adapter, workerInstanceId: 'worker-reconnect-loss-after', randomId: ids('router-reconnect-loss-after') });
  loseReplacementConnect = true;
  await assert.rejects(client.heartbeat(), /synthetic-replacement-connect-response-loss/);
  assert.equal(router.snapshot().sessionCount, 1);
  const disconnected = await client.teardown();

  assert.equal(disconnected.disconnected, true);
  assert.equal(adapter.calls.connect, 2);
  assert.equal(adapter.calls.disconnect, 1);
  assert.equal(router.snapshot().sessionCount, 0);
});

test('IT-B2-PLATFORM-021 live content disable fails closed and explicit retry releases authority before MAIN', async () => {
  const harness = createA3Harness({ authorityKernel: true });
  const page = harness.createPage();
  await harness.startContentController(page);
  const initial = await harness.waitForStableRuntime(page);
  await harness.waitFor(
    () => isolatedAuthority(page)?.snapshot()?.healthy === true,
    'live isolated authority before disable'
  );
  const oldRuntime = page.runtime;
  const originalSendMessage = page.isolatedSandbox.chrome.runtime.sendMessage;
  let failDisconnect = true;
  page.isolatedSandbox.chrome.runtime.sendMessage = async message => {
    if (failDisconnect && message?.type === AUTHORITY_MESSAGES.DISCONNECT) {
      throw new Error('synthetic-live-authority-disconnect-failure');
    }
    return originalSendMessage(message);
  };

  try {
    await harness.storage.set({ timerEnabled: false });
    await harness.waitFor(
      () => page.document.documentElement.dataset.squarecoilCompanionAuthorityCleanup === 'incomplete',
      'sticky authority cleanup marker'
    );
    const failed = await harness.sendFromPage(page, {
      type: LIFECYCLE_MESSAGES.ENABLE,
      enabled: false
    });
    assert.equal(failed.ok, false);
    assert.equal(failed.health.state, 'FAILED');
    assert.equal(failed.health.reason, 'teardown-incomplete');
    assert.equal(failed.authorityCleanupIncomplete, true);
    assert.equal(page.runtime, oldRuntime);
    assert.equal(page.health.runtimeInstanceId, initial.runtimeInstanceId);

    failDisconnect = false;
    const retried = await harness.sendFromPage(page, { type: LIFECYCLE_MESSAGES.RETRY_TEARDOWN });
    await harness.waitFor(() => page.runtime === null && page.roots.length === 0, 'MAIN cleanup after authority retry');
    assert.equal(retried.ok, true);
    assert.equal(retried.health.state, 'UNINITIALIZED');
    assert.equal(page.document.documentElement.dataset.squarecoilCompanionAuthorityCleanup, undefined);
    assert.equal(isolatedAuthority(page).snapshot().enabled, false);
    assert.equal(isolatedAuthority(page).snapshot().healthy, false);
  } finally {
    failDisconnect = false;
    page.isolatedSandbox.chrome.runtime.sendMessage = originalSendMessage;
    await isolatedAuthority(page)?.teardown?.().catch(() => {});
  }
});

test('IT-B2-PLATFORM-022 rapid disable then enable drains teardown before reacquiring same-runtime authority', async () => {
  const harness = createA3Harness({ authorityKernel: true });
  const page = harness.createPage();
  await harness.startContentController(page);
  const initial = await harness.waitForStableRuntime(page);
  await harness.waitFor(
    () => isolatedAuthority(page)?.snapshot()?.healthy === true,
    'live isolated authority before rapid toggle'
  );
  const originalSendMessage = page.isolatedSandbox.chrome.runtime.sendMessage;
  let releaseDisconnect;
  const disconnectGate = new Promise(resolve => { releaseDisconnect = resolve; });
  let disconnectReached = false;
  page.isolatedSandbox.chrome.runtime.sendMessage = async message => {
    if (!disconnectReached && message?.type === AUTHORITY_MESSAGES.DISCONNECT) {
      disconnectReached = true;
      await disconnectGate;
    }
    return originalSendMessage(message);
  };

  try {
    await harness.storage.set({ timerEnabled: false });
    await harness.waitFor(() => disconnectReached, 'held authority disconnect');
    await harness.storage.set({ timerEnabled: true });
    releaseDisconnect();
    await harness.waitFor(
      () => isolatedAuthority(page)?.snapshot()?.healthy === true &&
        page.document.documentElement.dataset.squarecoilCompanionEnabled === 'true',
      'same-runtime authority reacquisition after rapid toggle'
    );
    const current = await harness.waitForStableRuntime(page);
    const authority = isolatedAuthority(page).snapshot();
    assert.equal(harness.storage.snapshot().timerEnabled, true);
    assert.equal(current.runtimeInstanceId, initial.runtimeInstanceId);
    assert.equal(authority.runtimeInstanceId, initial.runtimeInstanceId);
    assert.equal(authority.enabled, true);
    assert.equal(authority.healthy, true);
    assert.equal(page.metrics.companionInjections, 1);
  } finally {
    releaseDisconnect?.();
    page.isolatedSandbox.chrome.runtime.sendMessage = originalSendMessage;
    await isolatedAuthority(page)?.teardown?.().catch(() => {});
  }
});

test('IT-B2-PLATFORM-023 failed authority self-retirement fences a fresh MAIN boot', async () => {
  const harness = createA3Harness({ authorityKernel: true });
  const page = harness.createPage();
  await harness.startContentController(page);
  await harness.waitForStableRuntime(page);
  await harness.waitFor(
    () => isolatedAuthority(page)?.snapshot()?.healthy === true,
    'live isolated authority before self-retirement'
  );
  const originalSendMessage = page.isolatedSandbox.chrome.runtime.sendMessage;
  let failDisconnect = true;
  page.isolatedSandbox.chrome.runtime.sendMessage = async message => {
    if (failDisconnect && message?.type === AUTHORITY_MESSAGES.DISCONNECT) {
      throw new Error('synthetic-self-retirement-disconnect-failure');
    }
    return originalSendMessage(message);
  };

  try {
    delete page.window.__squareCoilCompanionRuntime;
    await page.runIntervals();
    await harness.waitFor(
      () => page.roots.length === 0 &&
        page.document.documentElement.dataset.squarecoilCompanionAuthorityCleanup === 'incomplete',
      'failed isolated cleanup after clean MAIN self-retirement'
    );
    const injectionsBefore = page.metrics.companionInjections;
    const blocked = await harness.sendFromPage(page, { type: LIFECYCLE_MESSAGES.BOOT });
    assert.equal(blocked.ok, false);
    assert.equal(blocked.classification, 'FAILED_SAME_BUILD');
    assert.equal(blocked.health.reason, 'teardown-incomplete');
    assert.equal(blocked.authorityCleanupIncomplete, true);
    assert.equal(page.runtime, null);
    assert.equal(page.metrics.companionInjections, injectionsBefore);
  } finally {
    failDisconnect = false;
    page.isolatedSandbox.chrome.runtime.sendMessage = originalSendMessage;
    await isolatedAuthority(page)?.teardown?.().catch(() => {});
  }
});

test('IT-B2-PLATFORM-024 ownership-conflict self-retirement also stops isolated authority heartbeat', async () => {
  const harness = createA3Harness({ authorityKernel: true });
  const page = harness.createPage();
  await harness.startContentController(page);
  await harness.waitForStableRuntime(page);
  await harness.waitFor(
    () => isolatedAuthority(page)?.snapshot()?.healthy === true,
    'live isolated authority before ownership-conflict retirement'
  );

  page.window.__squareCoilCompanionInjectionClaim = { foreign: true };
  delete page.window.__squareCoilCompanionRuntime;
  await page.runIntervals();
  await harness.waitFor(
    () => isolatedAuthority(page)?.snapshot()?.enabled === false,
    'isolated authority teardown after ownership-conflict retirement'
  );

  assert.equal(page.document.documentElement.dataset.squarecoilCompanionReloadRequired, 'ownership-conflict');
  assert.equal(isolatedAuthority(page).snapshot().healthy, false);
  assert.equal(isolatedAuthority(page).snapshot().subscribed, false);
});

test('IT-B2-PLATFORM-028 same-generation settlement refresh is single-flight and never cached', async () => {
  const harness = createA3Harness({ authorityKernel: true });
  const page = harness.createPage();
  await harness.startContentController(page);
  await harness.waitForStableRuntime(page);
  await harness.waitFor(
    () => isolatedAuthority(page)?.snapshot()?.healthy === true &&
      isolatedAuthority(page)?.coreSnapshot()?.initialized === true,
    'initialized authority and trusted core before settlement single-flight'
  );

  const originalSendMessage = page.isolatedSandbox.chrome.runtime.sendMessage;
  let counts = { heartbeat: 0, subscribe: 0, read: 0 };
  page.isolatedSandbox.chrome.runtime.sendMessage = async message => {
    if (message?.type === AUTHORITY_MESSAGES.HEARTBEAT) counts.heartbeat += 1;
    if (message?.type === AUTHORITY_MESSAGES.SUBSCRIBE) counts.subscribe += 1;
    if (message?.type === AUTHORITY_MESSAGES.READ) counts.read += 1;
    return originalSendMessage(message);
  };

  try {
    const firstMessage = b2SettlementMessage(page, 'single-flight-first-0001');
    const secondMessage = { ...firstMessage, settlementId: 'settlement-single-flight-second-0002' };
    const [first, second] = await Promise.all([
      harness._dispatchContentMessage(page.tabId, firstMessage, { documentId: page.documentId }),
      harness._dispatchContentMessage(page.tabId, secondMessage, { documentId: page.documentId })
    ]);
    assert.equal(first.type, B2_SETTLEMENT_ACK);
    assert.equal(second.type, B2_SETTLEMENT_ACK);
    assert.equal(first.settlementId, firstMessage.settlementId);
    assert.equal(second.settlementId, secondMessage.settlementId);
    const sharedCounts = { ...counts };
    assert.ok(sharedCounts.read > 0);

    counts = { heartbeat: 0, subscribe: 0, read: 0 };
    const thirdMessage = b2SettlementMessage(page, 'single-flight-third-0003');
    const third = await harness._dispatchContentMessage(
      page.tabId,
      thirdMessage,
      { documentId: page.documentId }
    );
    assert.equal(third.type, B2_SETTLEMENT_ACK);
    assert.deepEqual(counts, sharedCounts);
  } finally {
    page.isolatedSandbox.chrome.runtime.sendMessage = originalSendMessage;
    await isolatedAuthority(page)?.teardown?.().catch(() => {});
  }
});

test('IT-B2-PLATFORM-029 settlement response budget reports in-progress once without canceling shared work', async () => {
  const harness = createA3Harness({ authorityKernel: true });
  const page = harness.createPage();
  await harness.startContentController(page);
  await harness.waitForStableRuntime(page);
  await harness.waitFor(
    () => isolatedAuthority(page)?.snapshot()?.healthy === true &&
      isolatedAuthority(page)?.coreSnapshot()?.initialized === true,
    'initialized authority and trusted core before settlement response budget'
  );

  const isolated = page.isolatedSandbox;
  const originalSendMessage = isolated.chrome.runtime.sendMessage;
  const originalSetTimeout = isolated.setTimeout;
  const originalClearTimeout = isolated.clearTimeout;
  const budgetHandle = Object.freeze({ settlementBudget: true });
  let held = false;
  let releaseRefresh;
  const refreshGate = new Promise(resolve => { releaseRefresh = resolve; });
  isolated.chrome.runtime.sendMessage = async message => {
    if (!held && message?.type === AUTHORITY_MESSAGES.HEARTBEAT) {
      held = true;
      await refreshGate;
    }
    return originalSendMessage(message);
  };
  isolated.setTimeout = (callback, delayMs, ...args) => {
    if (delayMs === 15_000) {
      queueMicrotask(() => callback(...args));
      return budgetHandle;
    }
    return originalSetTimeout(callback, delayMs, ...args);
  };
  isolated.clearTimeout = handle => {
    if (handle !== budgetHandle) originalClearTimeout(handle);
  };

  const responses = [];
  const message = b2SettlementMessage(page, 'response-budget-first-0001');
  const listeners = [...harness.contentRuntimeOnMessage.get(page.tabId).listeners];
  try {
    let asyncExpected = false;
    for (const listener of listeners) {
      if (listener(message, {}, value => responses.push(JSON.parse(JSON.stringify(value)))) === true) {
        asyncExpected = true;
      }
    }
    assert.equal(asyncExpected, true);
    await harness.waitFor(
      () => held && responses.length === 1,
      'bounded settlement in-progress response'
    );
    assert.deepEqual(responses, [{ ok: false, reason: 'settlement-refresh-in-progress' }]);

    isolated.setTimeout = originalSetTimeout;
    isolated.clearTimeout = originalClearTimeout;
    releaseRefresh();
    const followupMessage = b2SettlementMessage(page, 'response-budget-followup-0002');
    const followup = await harness._dispatchContentMessage(
      page.tabId,
      followupMessage,
      { documentId: page.documentId }
    );
    assert.equal(followup.type, B2_SETTLEMENT_ACK);
    await harness.tick();
    assert.equal(responses.length, 1);
  } finally {
    releaseRefresh?.();
    isolated.chrome.runtime.sendMessage = originalSendMessage;
    isolated.setTimeout = originalSetTimeout;
    isolated.clearTimeout = originalClearTimeout;
    await isolatedAuthority(page)?.teardown?.().catch(() => {});
  }
});

test('IT-B2-PLATFORM-030 late over-budget settlement work cannot acknowledge a replacement document generation', async () => {
  const harness = createA3Harness({ authorityKernel: true });
  const page = harness.createPage();
  await harness.startContentController(page);
  await harness.waitForStableRuntime(page);
  await harness.waitFor(
    () => isolatedAuthority(page)?.snapshot()?.healthy === true &&
      isolatedAuthority(page)?.coreSnapshot()?.initialized === true,
    'initialized authority and trusted core before replacement-generation settlement race'
  );

  const isolated = page.isolatedSandbox;
  const originalSendMessage = isolated.chrome.runtime.sendMessage;
  const originalSetTimeout = isolated.setTimeout;
  const originalClearTimeout = isolated.clearTimeout;
  const budgetHandle = Object.freeze({ settlementBudgetReplacement: true });
  let held = false;
  let releaseRefresh;
  const refreshGate = new Promise(resolve => { releaseRefresh = resolve; });
  isolated.chrome.runtime.sendMessage = async message => {
    if (!held && message?.type === AUTHORITY_MESSAGES.HEARTBEAT) {
      held = true;
      await refreshGate;
    }
    return originalSendMessage(message);
  };
  isolated.setTimeout = (callback, delayMs, ...args) => {
    if (delayMs === 15_000) {
      queueMicrotask(() => callback(...args));
      return budgetHandle;
    }
    return originalSetTimeout(callback, delayMs, ...args);
  };
  isolated.clearTimeout = handle => {
    if (handle !== budgetHandle) originalClearTimeout(handle);
  };

  const responses = [];
  const oldMessage = b2SettlementMessage(page, 'replacement-race-old-0001');
  const listeners = [...harness.contentRuntimeOnMessage.get(page.tabId).listeners];
  try {
    for (const listener of listeners) {
      listener(oldMessage, {}, value => responses.push(JSON.parse(JSON.stringify(value))));
    }
    await harness.waitFor(
      () => held && responses.length === 1,
      'old generation bounded settlement response'
    );
    assert.deepEqual(responses, [{ ok: false, reason: 'settlement-refresh-in-progress' }]);

    page.setDocumentToken('document-replacement-generation-0002');
    isolated.setTimeout = originalSetTimeout;
    isolated.clearTimeout = originalClearTimeout;
    releaseRefresh();
    await harness.tick();
    await harness.tick();
    assert.equal(responses.length, 1);

    const replacementMessage = {
      ...oldMessage,
      settlementId: 'settlement-replacement-race-new-0002',
      documentToken: page.documentToken
    };
    const replacement = await harness._dispatchContentMessage(
      page.tabId,
      replacementMessage,
      { documentId: page.documentId }
    );
    assert.equal(replacement.ok, false);
    assert.equal(replacement.reason, 'authority-runtime-identity-mismatch');
    assert.notEqual(replacement.type, B2_SETTLEMENT_ACK);
  } finally {
    releaseRefresh?.();
    isolated.chrome.runtime.sendMessage = originalSendMessage;
    isolated.setTimeout = originalSetTimeout;
    isolated.clearTimeout = originalClearTimeout;
    await isolatedAuthority(page)?.teardown?.().catch(() => {});
  }
});
