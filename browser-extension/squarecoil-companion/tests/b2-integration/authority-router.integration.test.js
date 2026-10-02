'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AUTHORITY_PROTOCOL_VERSION,
  AUTHORITY_MESSAGES
} = require('../../src/extension/authority-protocol');
const { createAuthorityRouter } = require('../../src/extension/authority-router');
const { createChromeAuthorityAdapter } = require('../../src/persistence/chrome-storage');
const { createAuthoritativeKernel } = require('../../src/data/store');
const { TIMER_COMMANDS } = require('../../src/timer/service');

function createIdFactory(namespace) {
  let sequence = 0;
  return prefix => `${namespace}-${prefix}-${String(++sequence).padStart(4, '0')}`;
}

function request(type, runtimeInstanceId, values = {}) {
  request.sequence = (request.sequence || 0) + 1;
  return {
    type,
    protocolVersion: AUTHORITY_PROTOCOL_VERSION,
    requestId: `request-${String(request.sequence).padStart(8, '0')}`,
    runtimeInstanceId,
    ...values
  };
}

function context(tabId, documentToken) {
  return {
    tabId,
    expectedDocumentId: `browser-document-${tabId}`,
    documentToken,
    buildId: 'build-b2-integration',
    packageVersion: '0.7.1',
    candidateFingerprint: 'a'.repeat(64)
  };
}

function createKernelAdapter() {
  const sessionsByRuntime = new Map();
  const listeners = new Set();
  const calls = {
    initialize: 0,
    connect: [],
    heartbeat: [],
    disconnect: [],
    read: [],
    command: [],
    unsubscribe: 0
  };
  let revision = 0;
  let ownerRuntimeId = null;
  let failDisconnects = 0;

  const adapter = {
    async initialize() {
      calls.initialize += 1;
    },
    async connect(identity) {
      calls.connect.push(identity);
      let session = sessionsByRuntime.get(identity.runtimeId);
      if (!session) {
        if (!ownerRuntimeId) ownerRuntimeId = identity.runtimeId;
        session = Object.freeze({
          kernelSessionId: `kernel-${identity.runtimeId}`,
          runtimeId: identity.runtimeId
        });
        sessionsByRuntime.set(identity.runtimeId, session);
      }
      return {
        session,
        disposition: identity.runtimeId === ownerRuntimeId ? 'OWNER' : 'OBSERVER_CONNECTED',
        epoch: 3,
        revision
      };
    },
    async heartbeat(session) {
      calls.heartbeat.push(session);
      return {
        disposition: session.runtimeId === ownerRuntimeId ? 'OWNER' : 'OBSERVER_CONNECTED',
        epoch: 3,
        revision
      };
    },
    async disconnect(session) {
      calls.disconnect.push(session);
      if (failDisconnects > 0) {
        failDisconnects -= 1;
        throw new Error('durable-release-failed');
      }
    },
    async read(session) {
      calls.read.push(session);
      return { revision, value: `shared:${revision}` };
    },
    async command(session, envelope) {
      calls.command.push({ session, envelope });
      revision += 1;
      const event = { revision, commandId: envelope.commandId };
      for (const listener of [...listeners]) listener(event);
      return { committed: true, revision, committedBy: ownerRuntimeId };
    },
    async subscribe(listener) {
      listeners.add(listener);
      return () => {
        calls.unsubscribe += 1;
        listeners.delete(listener);
      };
    },
    failNextDisconnect() {
      failDisconnects += 1;
    },
    calls,
    get ownerRuntimeId() { return ownerRuntimeId; },
    get listenerCount() { return listeners.size; }
  };
  return adapter;
}

test('IT-B2-PLATFORM-005 platform boundary routes OWNER and OBSERVER through one initialized worker authority', async () => {
  const adapter = createKernelAdapter();
  const published = [];
  const router = createAuthorityRouter({
    adapter,
    workerInstanceId: 'worker-generation-0001',
    randomId: createIdFactory('router-one'),
    publish: async update => { published.push(update); return true; }
  });
  const ownerRuntime = 'runtime-owner-00000001';
  const observerRuntime = 'runtime-observer-00001';
  const ownerContext = context(11, 'document-owner-00000001');
  const observerContext = context(12, 'document-observer-00001');

  const owner = await router.route(ownerContext, request(AUTHORITY_MESSAGES.CONNECT, ownerRuntime));
  const observer = await router.route(observerContext, request(AUTHORITY_MESSAGES.CONNECT, observerRuntime));

  assert.equal(owner.ok, true);
  assert.equal(owner.disposition, 'OWNER');
  assert.equal(observer.ok, true);
  assert.equal(observer.disposition, 'OBSERVER_CONNECTED');
  assert.equal(adapter.calls.initialize, 1);
  assert.deepEqual(adapter.calls.connect[0], {
    runtimeId: ownerRuntime,
    documentToken: ownerContext.documentToken,
    tabId: ownerContext.tabId
  });
  assert.equal(Object.hasOwn(owner, 'fencingToken'), false);

  await router.route(ownerContext, request(AUTHORITY_MESSAGES.SUBSCRIBE, ownerRuntime, { sessionId: owner.sessionId }));
  await router.route(observerContext, request(AUTHORITY_MESSAGES.SUBSCRIBE, observerRuntime, { sessionId: observer.sessionId }));
  const initial = await router.route(observerContext, request(AUTHORITY_MESSAGES.READ, observerRuntime, { sessionId: observer.sessionId }));
  const privateCommand = await router.route(observerContext, request(AUTHORITY_MESSAGES.COMMAND, observerRuntime, {
    sessionId: observer.sessionId,
    command: {
      commandId: 'command-private-00001',
      type: TIMER_COMMANDS.LOCAL_PAUSE,
      expectedRevision: 0,
      fencingToken: 99
    }
  }));
  const revisionlessCommand = await router.route(observerContext, request(AUTHORITY_MESSAGES.COMMAND, observerRuntime, {
    sessionId: observer.sessionId,
    command: { commandId: 'command-no-revision-001', type: TIMER_COMMANDS.LOCAL_PAUSE }
  }));
  const commanded = await router.route(observerContext, request(AUTHORITY_MESSAGES.COMMAND, observerRuntime, {
    sessionId: observer.sessionId,
    command: {
      commandId: 'command-observer-0001',
      type: TIMER_COMMANDS.LOCAL_PAUSE,
      expectedRevision: 0
    }
  }));

  assert.deepEqual(initial.result, { revision: 0, value: 'shared:0' });
  assert.equal(privateCommand.ok, false);
  assert.equal(privateCommand.reason, 'authority-private-command-field-rejected');
  assert.equal(revisionlessCommand.ok, false);
  assert.equal(revisionlessCommand.reason, 'authority-command-expected-revision-invalid');
  assert.equal(commanded.ok, true);
  assert.equal(commanded.result.committedBy, ownerRuntime);
  assert.equal(adapter.calls.command.length, 1);
  assert.equal(adapter.calls.command[0].session.runtimeId, observerRuntime);
  assert.equal(published.length, 2);
  assert.deepEqual(published.map(item => item.runtimeInstanceId).sort(), [observerRuntime, ownerRuntime].sort());
  assert.equal(router.snapshot().sessionCount, 2);
});

test('IT-B2-PLATFORM-025 NAT-C06/C07/C08 observer completion is sanitized, routed only to OWNER, and invalid evidence is rejected', async () => {
  const adapter = createKernelAdapter();
  const published = [];
  const router = createAuthorityRouter({ adapter, workerInstanceId: 'worker-native-evidence-01',
    randomId: createIdFactory('native'), publish: async update => { published.push(update); return true; } });
  const ownerRuntime = 'runtime-native-owner-001';
  const observerRuntime = 'runtime-native-observer-01';
  const ownerContext = context(81, 'document-native-owner-01');
  const observerContext = context(82, 'document-native-observer-01');
  const owner = await router.route(ownerContext, request(AUTHORITY_MESSAGES.CONNECT, ownerRuntime));
  const observer = await router.route(observerContext, request(AUTHORITY_MESSAGES.CONNECT, observerRuntime));
  await router.route(ownerContext, request(AUTHORITY_MESSAGES.SUBSCRIBE, ownerRuntime, { sessionId: owner.sessionId }));
  const evidence = { kind: 'NATIVE_MUTATION_COMPLETION', successful: true, nativeAction: 4,
    completedAtMs: Date.now(), completionKey: 'completion-native-0001', sourceRuntimeId: observerRuntime,
    documentToken: observerContext.documentToken, provenance: 'AUDITED_SQUARECOIL_COMPLETION_HOOK' };
  const valid = await router.route(observerContext, request(AUTHORITY_MESSAGES.FORWARD_NATIVE_EVIDENCE,
    observerRuntime, { sessionId: observer.sessionId, evidence }));
  assert.equal(valid.ok, false);
  assert.equal(valid.reason, 'authority-native-evidence-rejected');
  assert.equal(published.length, 0);
  assert.equal(adapter.calls.command.length, 0);

  for (const invalid of [
    { ...evidence, completedAtMs: Date.now() - 20_000, completionKey: 'completion-stale-0001' },
    { ...evidence, nativeAction: 7, completionKey: 'completion-action-0001' },
    { ...evidence, successful: false, completionKey: 'completion-failed-001' },
    { ...evidence, documentToken: 'document-wrong-generation', completionKey: 'completion-wrong-001' },
    { ...evidence, provenance: 'CLICK', completionKey: 'completion-click-0001' }
  ]) {
    const rejected = await router.route(observerContext, request(AUTHORITY_MESSAGES.FORWARD_NATIVE_EVIDENCE,
      observerRuntime, { sessionId: observer.sessionId, evidence: invalid }));
    assert.equal(rejected.ok, false);
    assert.equal(rejected.reason, 'authority-native-evidence-rejected');
  }
  assert.equal(published.length, 0);
});

test('IT-B2-PLATFORM-026 webRequest completion uses stable identity, coalesces, and rejects retired generations', async () => {
  const adapter = createKernelAdapter();
  const published = [];
  const router = createAuthorityRouter({ adapter, workerInstanceId: 'worker-webrequest-native',
    randomId: createIdFactory('webrequest'), publish: async update => { published.push(update); return true; } });
  router.setNativeObservationAvailable(true);
  const ownerRuntime = 'runtime-webrequest-owner';
  const observerRuntime = 'runtime-webrequest-observer';
  const ownerContext = context(91, 'document-webrequest-owner');
  const observerContext = context(92, 'document-webrequest-observer');
  const owner = await router.route(ownerContext, request(AUTHORITY_MESSAGES.CONNECT, ownerRuntime));
  const observer = await router.route(observerContext, request(AUTHORITY_MESSAGES.CONNECT, observerRuntime));
  await router.route(ownerContext, request(AUTHORITY_MESSAGES.SUBSCRIBE, ownerRuntime, { sessionId: owner.sessionId }));
  await router.route(observerContext, request(AUTHORITY_MESSAGES.SUBSCRIBE, observerRuntime, { sessionId: observer.sessionId }));
  const completion = { requestId: 'chrome-request-stable-001', tabId: observerContext.tabId,
    documentId: observerContext.expectedDocumentId, nativeAction: 2, completedAtMs: Date.now() };
  assert.equal((await router.observeNativeCompletion(completion)).changed, true);
  assert.equal((await router.observeNativeCompletion(completion)).changed, false);
  assert.equal(published.length, 1);
  assert.equal(published[0].event.nativeEvidence.completionKey,
    'webrequest:worker-webrequest-native:chrome-request-stable-001');
  assert.equal(published[0].event.nativeEvidence.provenance, 'EXTENSION_WEBREQUEST_COMPLETION');
  await router.route(observerContext, request(AUTHORITY_MESSAGES.DISCONNECT, observerRuntime,
    { sessionId: observer.sessionId }));
  const late = await router.observeNativeCompletion({ ...completion, requestId: 'chrome-request-late-002' });
  assert.equal(late.accepted, false);
  assert.equal(late.reason, 'native-observation-runtime-invalid');
  assert.equal(published.length, 1);
});

test('IT-B2-PLATFORM-027 lease takeover reconciles cached OWNER and routes native evidence only to the current owner', async () => {
  const values = {};
  const storageArea = {
    async get(key) { return { [key]: values[key] === undefined ? undefined : structuredClone(values[key]) }; },
    async set(patch) { Object.assign(values, structuredClone(patch)); }
  };
  let lockQueue = Promise.resolve();
  const lockManager = {
    request(_name, _options, callback) {
      const run = lockQueue.then(callback, callback);
      lockQueue = run.then(() => undefined, () => undefined);
      return run;
    }
  };
  let nowMs = 1_000;
  let idSequence = 0;
  const kernel = createAuthoritativeKernel({
    adapter: createChromeAuthorityAdapter({ area: storageArea, key: 'takeover-authority', lockManager }),
    now: () => nowMs,
    makeId: prefix => `${prefix}-${++idSequence}`,
    leaseDurationMs: 100,
    workdayZone: 'UTC',
    workdayZoneDisposition: { source: 'CONFIGURED', fallback: false, diagnostic: null },
    applyCommand: async () => ({ applied: true })
  });
  const published = [];
  const router = createAuthorityRouter({ adapter: kernel, workerInstanceId: 'worker-takeover-native',
    randomId: createIdFactory('takeover-native'),
    publish: async update => { published.push(update); return true; } });
  router.setNativeObservationAvailable(true);
  const runtimeA = 'runtime-takeover-owner-a';
  const runtimeB = 'runtime-takeover-owner-b';
  const contextA = context(101, 'document-takeover-owner-a');
  const contextB = context(102, 'document-takeover-owner-b');
  const connectionA = await router.route(contextA, request(AUTHORITY_MESSAGES.CONNECT, runtimeA));
  const connectionB = await router.route(contextB, request(AUTHORITY_MESSAGES.CONNECT, runtimeB));
  await router.route(contextA, request(AUTHORITY_MESSAGES.SUBSCRIBE, runtimeA,
    { sessionId: connectionA.sessionId }));
  await router.route(contextB, request(AUTHORITY_MESSAGES.SUBSCRIBE, runtimeB,
    { sessionId: connectionB.sessionId }));

  nowMs = 1_101;
  const takeover = await router.route(contextB, request(AUTHORITY_MESSAGES.HEARTBEAT, runtimeB,
    { sessionId: connectionB.sessionId }));
  assert.equal(takeover.disposition, 'OWNER');
  const afterTakeover = router.snapshot();
  assert.equal(afterTakeover.currentOwnerSessionId, connectionB.sessionId);
  assert.deepEqual(afterTakeover.sessions.map(session => [session.runtimeInstanceId, session.disposition]), [
    [runtimeA, 'OBSERVER_CONNECTED'],
    [runtimeB, 'OWNER']
  ]);
  published.length = 0;

  const completion = { requestId: 'request-after-owner-takeover', tabId: contextA.tabId,
    documentId: contextA.expectedDocumentId, nativeAction: 2, completedAtMs: Date.now() };
  assert.equal((await router.observeNativeCompletion(completion)).changed, true);
  assert.equal((await router.observeNativeCompletion(completion)).changed, false);
  const hint = await router.route(contextA, request(AUTHORITY_MESSAGES.FORWARD_NATIVE_EVIDENCE, runtimeA, {
    sessionId: connectionA.sessionId,
    evidence: { kind: 'PASSIVE_ACTIVITY_HINT', sourceRuntimeId: runtimeA,
      documentToken: contextA.documentToken }
  }));

  assert.equal(hint.ok, true);
  assert.equal(hint.result.verificationOnly, true);
  assert.equal(published.length, 2);
  assert.ok(published.every(update => update.runtimeInstanceId === runtimeB));
  assert.equal(published.filter(update => update.event.nativeEvidence).length, 1);
  assert.equal(published.filter(update => update.event.verificationHint).length, 1);
  assert.equal(published.some(update => update.runtimeInstanceId === runtimeA), false);
});

test('IT-B2-PLATFORM-006 teardown retains exact authority ownership until a failed disconnect succeeds', async () => {
  const adapter = createKernelAdapter();
  const router = createAuthorityRouter({
    adapter,
    workerInstanceId: 'worker-generation-0002',
    randomId: createIdFactory('router-two')
  });
  const runtimeId = 'runtime-teardown-000001';
  const runtimeContext = context(21, 'document-teardown-00001');
  const connected = await router.route(runtimeContext, request(AUTHORITY_MESSAGES.CONNECT, runtimeId));
  await router.route(runtimeContext, request(AUTHORITY_MESSAGES.SUBSCRIBE, runtimeId, { sessionId: connected.sessionId }));
  adapter.failNextDisconnect();

  const failed = await router.route(runtimeContext, request(AUTHORITY_MESSAGES.DISCONNECT, runtimeId, { sessionId: connected.sessionId }));
  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'authority-disconnect-failed');
  assert.equal(router.snapshot().sessionCount, 1);
  assert.equal(adapter.listenerCount, 0);

  const retried = await router.route(runtimeContext, request(AUTHORITY_MESSAGES.DISCONNECT, runtimeId, { sessionId: connected.sessionId }));
  assert.equal(retried.ok, true);
  assert.equal(retried.disconnected, true);
  assert.equal(router.snapshot().sessionCount, 0);
  assert.equal(adapter.calls.disconnect.length, 2);
  assert.equal(adapter.calls.disconnect[0], adapter.calls.disconnect[1]);
});

test('IT-B2-PLATFORM-007 worker restart rejects the old transport session and reconnects the same durable runtime idempotently', async () => {
  const adapter = createKernelAdapter();
  const runtimeId = 'runtime-restart-0000001';
  const runtimeContext = context(31, 'document-restart-000001');
  const firstRouter = createAuthorityRouter({
    adapter,
    workerInstanceId: 'worker-before-restart',
    randomId: createIdFactory('before')
  });
  const before = await firstRouter.route(runtimeContext, request(AUTHORITY_MESSAGES.CONNECT, runtimeId));
  const secondRouter = createAuthorityRouter({
    adapter,
    workerInstanceId: 'worker-after-restart',
    randomId: createIdFactory('after')
  });

  const stale = await secondRouter.route(runtimeContext, request(AUTHORITY_MESSAGES.READ, runtimeId, { sessionId: before.sessionId }));
  assert.equal(stale.ok, false);
  assert.equal(stale.reason, 'authority-session-unknown');
  assert.equal(stale.reconnectRequired, true);

  const reconnected = await secondRouter.route(runtimeContext, request(AUTHORITY_MESSAGES.CONNECT, runtimeId));
  assert.equal(reconnected.ok, true);
  assert.equal(reconnected.disposition, 'OWNER');
  assert.notEqual(reconnected.sessionId, before.sessionId);
  assert.equal(reconnected.workerInstanceId, 'worker-after-restart');
  assert.equal(adapter.ownerRuntimeId, runtimeId);
  assert.equal(adapter.calls.connect.length, 2);
});

test('IT-B2-PLATFORM-012 teardown after worker restart reconnects only to release the exact runtime', async () => {
  const adapter = createKernelAdapter();
  const runtimeId = 'runtime-restart-teardown-001';
  const runtimeContext = context(32, 'document-restart-teardown-01');
  const firstRouter = createAuthorityRouter({
    adapter,
    workerInstanceId: 'worker-before-restart-teardown',
    randomId: createIdFactory('before-teardown')
  });
  const before = await firstRouter.route(
    runtimeContext,
    request(AUTHORITY_MESSAGES.CONNECT, runtimeId)
  );
  const secondRouter = createAuthorityRouter({
    adapter,
    workerInstanceId: 'worker-after-restart-teardown',
    randomId: createIdFactory('after-teardown')
  });

  const disconnected = await secondRouter.route(runtimeContext, request(
    AUTHORITY_MESSAGES.DISCONNECT,
    runtimeId,
    { sessionId: before.sessionId }
  ));

  assert.equal(disconnected.ok, true);
  assert.equal(disconnected.disconnected, true);
  assert.equal(disconnected.recoveredAfterWorkerRestart, true);
  assert.equal(secondRouter.snapshot().sessionCount, 0);
  assert.equal(adapter.calls.connect.length, 2);
  assert.deepEqual(adapter.calls.connect[0], adapter.calls.connect[1]);
  assert.equal(adapter.calls.disconnect.length, 1);
});

test('IT-B2-PLATFORM-018 stale pre-restart disconnect cannot retire a newer same-principal session', async () => {
  const adapter = createKernelAdapter();
  const runtimeId = 'runtime-stale-disconnect-001';
  const runtimeContext = context(33, 'document-stale-disconnect-01');
  const firstRouter = createAuthorityRouter({
    adapter,
    workerInstanceId: 'worker-before-stale-disconnect',
    randomId: createIdFactory('before-stale-disconnect')
  });
  const oldConnection = await firstRouter.route(
    runtimeContext,
    request(AUTHORITY_MESSAGES.CONNECT, runtimeId)
  );
  const currentRouter = createAuthorityRouter({
    adapter,
    workerInstanceId: 'worker-after-stale-disconnect',
    randomId: createIdFactory('after-stale-disconnect')
  });
  const currentConnection = await currentRouter.route(
    runtimeContext,
    request(AUTHORITY_MESSAGES.CONNECT, runtimeId)
  );

  const staleDisconnect = await currentRouter.route(runtimeContext, request(
    AUTHORITY_MESSAGES.DISCONNECT,
    runtimeId,
    { sessionId: oldConnection.sessionId }
  ));
  const heartbeat = await currentRouter.route(runtimeContext, request(
    AUTHORITY_MESSAGES.HEARTBEAT,
    runtimeId,
    { sessionId: currentConnection.sessionId }
  ));

  assert.equal(staleDisconnect.ok, false);
  assert.equal(staleDisconnect.reason, 'authority-stale-disconnect-rejected');
  assert.equal(staleDisconnect.currentSessionActive, true);
  assert.equal(staleDisconnect.reconnectRequired, false);
  assert.equal(heartbeat.ok, true);
  assert.equal(heartbeat.sessionId, currentConnection.sessionId);
  assert.equal(currentRouter.snapshot().sessionCount, 1);
  assert.equal(adapter.calls.disconnect.length, 0);

  const exactDisconnect = await currentRouter.route(runtimeContext, request(
    AUTHORITY_MESSAGES.DISCONNECT,
    runtimeId,
    { sessionId: currentConnection.sessionId }
  ));
  assert.equal(exactDisconnect.ok, true);
  assert.equal(currentRouter.snapshot().sessionCount, 0);
  assert.equal(adapter.calls.disconnect.length, 1);
});

test('IT-B2-PLATFORM-008 authority readiness fails closed without an adapter or positive disposition', async () => {
  const runtimeId = 'runtime-failclosed-0001';
  const runtimeContext = context(41, 'document-failclosed-001');
  const unavailable = createAuthorityRouter({
    workerInstanceId: 'worker-unavailable-0001',
    randomId: createIdFactory('unavailable')
  });
  const missing = await unavailable.route(runtimeContext, request(AUTHORITY_MESSAGES.CONNECT, runtimeId));
  assert.equal(missing.ok, false);
  assert.equal(missing.reason, 'authority-adapter-unavailable');
  assert.equal(unavailable.snapshot().sessionCount, 0);

  const adapter = createKernelAdapter();
  adapter.connect = async () => ({ session: { opaque: true }, disposition: 'UNAVAILABLE', revision: 0 });
  const negative = createAuthorityRouter({
    adapter,
    workerInstanceId: 'worker-negative-000001',
    randomId: createIdFactory('negative')
  });
  const denied = await negative.route(runtimeContext, request(AUTHORITY_MESSAGES.CONNECT, runtimeId));
  assert.equal(denied.ok, false);
  assert.equal(denied.reason, 'authority-positive-disposition-required');
  assert.equal(denied.disposition, 'UNAVAILABLE');
  assert.equal(negative.snapshot().sessionCount, 0);
});

test('IT-B2-PLATFORM-009 transient initialization failure is retryable without replacing the authority adapter', async () => {
  const adapter = createKernelAdapter();
  const initialize = adapter.initialize;
  let attempts = 0;
  adapter.initialize = async () => {
    attempts += 1;
    if (attempts === 1) throw new Error('synthetic-initialize-outage');
    return initialize.call(adapter);
  };
  const router = createAuthorityRouter({
    adapter,
    workerInstanceId: 'worker-init-retry-0001',
    randomId: createIdFactory('init-retry')
  });
  const runtimeId = 'runtime-init-retry-0001';
  const runtimeContext = context(45, 'document-init-retry-001');

  const failed = await router.route(runtimeContext, request(AUTHORITY_MESSAGES.CONNECT, runtimeId));
  const recovered = await router.route(runtimeContext, request(AUTHORITY_MESSAGES.CONNECT, runtimeId));

  assert.equal(failed.ok, false);
  assert.equal(failed.reason, 'authority-connect-failed');
  assert.equal(recovered.ok, true);
  assert.equal(recovered.disposition, 'OWNER');
  assert.equal(attempts, 2);
});

test('IT-B2-PLATFORM-001 real authoritative kernel is compatible without leaking fence or owner identity', async () => {
  const values = {};
  const storageArea = {
    async get(key) {
      return { [key]: values[key] === undefined ? undefined : structuredClone(values[key]) };
    },
    async set(patch) {
      Object.assign(values, structuredClone(patch));
    }
  };
  let lockQueue = Promise.resolve();
  const lockManager = {
    request(_name, _options, callback) {
      const run = lockQueue.then(callback, callback);
      lockQueue = run.then(() => undefined, () => undefined);
      return run;
    }
  };
  let nowMs = 1000;
  let idSequence = 0;
  const kernel = createAuthoritativeKernel({
    adapter: createChromeAuthorityAdapter({ area: storageArea, key: 'authority', lockManager }),
    now: () => nowMs,
    makeId: prefix => `${prefix}-${++idSequence}`,
    leaseDurationMs: 100,
    workdayZone: 'UTC',
    workdayZoneDisposition: { source: 'CONFIGURED', fallback: false, diagnostic: null },
    applyCommand: async (document, command, commandContext) => {
      document.timer.lastReason = command.reason;
      // Deliberately return private-looking fields: the platform boundary must
      // strip them even if a future command adapter accidentally includes one.
      return {
        applied: true,
        fencingToken: commandContext.fencingToken,
        ownerRuntimeId: commandContext.owner?.runtimeId
      };
    }
  });
  const publications = [];
  const router = createAuthorityRouter({
    adapter: kernel,
    workerInstanceId: 'worker-real-kernel-0001',
    randomId: createIdFactory('real-kernel'),
    publish: async update => { publications.push(update); return true; }
  });
  const ownerRuntime = 'runtime-real-owner-0001';
  const observerRuntime = 'runtime-real-observer-01';
  const ownerContext = context(51, 'document-real-owner-001');
  const observerContext = context(52, 'document-real-observer-01');

  const owner = await router.route(ownerContext, request(AUTHORITY_MESSAGES.CONNECT, ownerRuntime));
  const observer = await router.route(observerContext, request(AUTHORITY_MESSAGES.CONNECT, observerRuntime));
  const subscribed = await router.route(observerContext, request(AUTHORITY_MESSAGES.SUBSCRIBE, observerRuntime, {
    sessionId: observer.sessionId
  }));
  const initial = await router.route(observerContext, request(AUTHORITY_MESSAGES.READ, observerRuntime, {
    sessionId: observer.sessionId
  }));
  const commanded = await router.route(observerContext, request(AUTHORITY_MESSAGES.COMMAND, observerRuntime, {
    sessionId: observer.sessionId,
    command: {
      commandId: 'real-observer-command-01',
      type: TIMER_COMMANDS.LOCAL_PAUSE,
      expectedRevision: 0,
      reason: 'observer-routed'
    }
  }));
  nowMs = 1050;
  const heartbeat = await router.route(ownerContext, request(AUTHORITY_MESSAGES.HEARTBEAT, ownerRuntime, {
    sessionId: owner.sessionId
  }));
  const disconnected = await router.route(observerContext, request(AUTHORITY_MESSAGES.DISCONNECT, observerRuntime, {
    sessionId: observer.sessionId
  }));

  assert.equal(owner.disposition, 'OWNER');
  assert.equal(observer.disposition, 'OBSERVER_CONNECTED');
  assert.equal(subscribed.subscribed, true);
  assert.equal(initial.result.revision, 0);
  assert.equal(commanded.result.revision, 1);
  assert.equal(commanded.result.result.applied, true);
  assert.equal(heartbeat.ok, true);
  assert.equal(disconnected.disconnected, true);
  assert.ok(publications.length >= 1);
  const crossedBoundary = JSON.stringify({ owner, observer, subscribed, initial, commanded, heartbeat, publications });
  assert.equal(crossedBoundary.includes('fencingToken'), false);
  assert.equal(crossedBoundary.includes('ownerRuntimeId'), false);
  assert.equal(crossedBoundary.includes('commitFence'), false);
  assert.equal(crossedBoundary.includes('commandReceipts'), false);
});
