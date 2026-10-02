'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AUTHORITY_STORAGE_KEY,
  createDefaultAuthorityKernel
} = require('../../src/extension/authority-kernel');
const { createAuthorityRouter } = require('../../src/extension/authority-router');
const { createAuthorityClient } = require('../../src/extension/authority-client');
const {
  AUTHORITY_PROTOCOL_VERSION,
  AUTHORITY_MESSAGES
} = require('../../src/extension/authority-protocol');
const { AUTHORITY_COMMANDS } = require('../../src/data/migration-command');
const { LEGACY_SOURCE_KEYS } = require('../../src/data/migration');
const { TIMER_COMMANDS } = require('../../src/timer/service');

class FakeTimers {
  constructor() {
    this.intervals = new Map();
    this.sequence = 0;
  }

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

function storageArea() {
  const values = {};
  let writes = 0;
  let documentWrites = 0;
  return {
    async get(key) {
      return { [key]: values[key] === undefined ? undefined : structuredClone(values[key]) };
    },
    async set(patch) {
      writes += 1;
      const priorRevision = values[AUTHORITY_STORAGE_KEY]?.document?.revision ?? null;
      const nextRevision = patch[AUTHORITY_STORAGE_KEY]?.document?.revision ?? priorRevision;
      if (priorRevision !== null && nextRevision !== priorRevision) documentWrites += 1;
      Object.assign(values, structuredClone(patch));
    },
    read(key = AUTHORITY_STORAGE_KEY) {
      return values[key] === undefined ? null : structuredClone(values[key]);
    },
    get writes() { return writes; },
    get documentWrites() { return documentWrites; }
  };
}

function exclusiveLocks() {
  let queue = Promise.resolve();
  return {
    request(_name, options, callback) {
      assert.equal(options.mode, 'exclusive');
      const run = queue.then(callback, callback);
      queue = run.then(() => undefined, () => undefined);
      return run;
    }
  };
}

function context(tabId, documentToken) {
  return {
    tabId,
    expectedDocumentId: `browser-document-${tabId}`,
    documentToken,
    buildId: 'build-b2-2-authority-integration',
    packageVersion: '0.8.0-b2.2',
    candidateFingerprint: 'c'.repeat(64)
  };
}

function createFixture(startAtMs = 1_000) {
  const area = storageArea();
  const clock = { value: startAtMs };
  const kernel = createDefaultAuthorityKernel({
    area,
    lockManager: exclusiveLocks(),
    runtimeWorkdayZone: 'UTC',
    now: () => clock.value,
    makeId: ids('kernel'),
    leaseDurationMs: 60_000,
    buildVersion: '0.8.0-b2.2'
  });
  const clients = [];
  let router = null;
  router = createAuthorityRouter({
    adapter: kernel,
    workerInstanceId: 'worker-b2-2-authority',
    randomId: ids('router'),
    publish: async update => {
      for (const client of clients) {
        client.handleWorkerUpdate({
          type: AUTHORITY_MESSAGES.UPDATE,
          protocolVersion: AUTHORITY_PROTOCOL_VERSION,
          ...update
        });
      }
      return true;
    }
  });

  function client(tabId, runtimeInstanceId, documentToken) {
    const workerContext = context(tabId, documentToken);
    const value = createAuthorityClient({
      send: message => router.route(workerContext, message),
      runtimeInstanceId,
      documentToken,
      requestTimeoutMs: 2_000,
      heartbeatIntervalMs: 30_000,
      randomId: ids(`client-${tabId}`),
      timers: new FakeTimers()
    });
    clients.push(value);
    return value;
  }

  return { area, clock, kernel, router, client };
}

function observation(overrides = {}) {
  return {
    type: 'CONTEXT_DETECTED',
    bridgeGeneration: 1,
    bridgeSeq: 0,
    observationId: 'observation-job-123-0001',
    observedAtMs: 1_000,
    source: 'DOM',
    stateCertainty: 'OBSERVED_DOM',
    boundaryAtMs: 1_000,
    boundaryCertainty: 'DETECTED',
    transitionCandidateId: null,
    verificationId: 'verification-job-123-001',
    context: {
      contextId: 'job:123',
      kind: 'job',
      projectId: '123',
      label: 'Job 123',
      shortLabel: '123'
    },
    ...overrides
  };
}

async function rejection(promise, message, detail = null) {
  await assert.rejects(promise, error => {
    assert.equal(error.message, message);
    if (detail !== null) assert.match(String(error.response?.detail || ''), detail);
    return true;
  });
}

test('IT-B2-TIMER-AUTH-001 authenticated OWNER/OBSERVER commands share one atomic Timer/Ledger commit path', async () => {
  const fixture = createFixture();
  const ownerRuntimeId = 'runtime-timer-owner-0001';
  const observerRuntimeId = 'runtime-timer-observer-01';
  const owner = fixture.client(101, ownerRuntimeId, 'document-timer-owner-001');
  const observer = fixture.client(102, observerRuntimeId, 'document-timer-observer-01');

  assert.equal((await owner.ensure()).disposition, 'OWNER');
  assert.equal((await observer.ensure()).disposition, 'OBSERVER_CONNECTED');

  await rejection(observer.command({
    type: TIMER_COMMANDS.ACCEPT_OBSERVATION,
    commandId: 'observer-bridge-rejected-001',
    expectedRevision: 0,
    observation: observation()
  }), 'authority-command-owner-required');

  const started = await owner.command({
    type: TIMER_COMMANDS.ACCEPT_OBSERVATION,
    commandId: 'owner-bridge-start-000001',
    expectedRevision: 0,
    observation: observation()
  });
  assert.equal(started.revision, 1);
  assert.equal(started.result.state, 'ACTIVE');

  const activeRead = await observer.read();
  const activeSessionId = activeRead.document.timer.active.sessionId;
  fixture.clock.value = 1_500;
  const documentWritesBeforePause = fixture.area.documentWrites;
  const pause = {
    type: TIMER_COMMANDS.LOCAL_PAUSE,
    commandId: 'observer-local-pause-0001',
    expectedRevision: 1,
    contextId: 'job:123',
    expectedSessionId: activeSessionId,
    originatedAtMs: 1_500
  };
  const paused = await observer.command(pause);
  assert.equal(paused.duplicate, false);
  assert.equal(paused.revision, 2);
  assert.equal(paused.result.state, 'LOCAL_PAUSED');
  assert.equal(fixture.area.documentWrites, documentWritesBeforePause + 1);

  const persistedAfterPause = fixture.area.read().document;
  assert.equal(persistedAfterPause.revision, 2);
  assert.equal(persistedAfterPause.timer.active, null);
  assert.equal(persistedAfterPause.timer.localPause.contextId, 'job:123');
  assert.equal(persistedAfterPause.ledger.length, 1);
  assert.equal(persistedAfterPause.ledger[0].durationMs, 500);
  assert.equal(persistedAfterPause.ledger[0].provenance.originRuntimeId, observerRuntimeId);
  assert.equal(persistedAfterPause.commandReceiptOrder.length, 2);
  assert.equal(persistedAfterPause.commitFence.ownerRuntimeId, ownerRuntimeId);
  assert.equal(persistedAfterPause.commitFence.fencingToken, 1);
  assert.deepEqual(persistedAfterPause.checkpoint.ownershipEvidence, {
    ownerRuntimeId,
    coordinationEpoch: 1,
    fencingToken: '1',
    disposition: 'OWNER'
  });

  const replay = await observer.command(pause);
  assert.equal(replay.duplicate, true);
  assert.equal(replay.revision, 2);
  assert.equal(fixture.area.documentWrites, documentWritesBeforePause + 1);
  assert.equal(fixture.area.read().document.revision, 2);
  assert.equal(fixture.area.read().document.ledger.length, 1);

  await rejection(observer.command({
    ...pause,
    commandId: 'observer-stale-pause-0001'
  }), 'authority-command-failed', /stale-revision/);
  await rejection(observer.command({
    ...pause,
    commandId: 'observer-private-pause-001',
    fencingToken: 999
  }), 'authority-private-command-field-rejected');
  await rejection(observer.command({
    ...pause,
    commandId: 'observer-spoofed-origin-01',
    originRuntimeId: ownerRuntimeId
  }), 'authority-command-origin-runtime-mismatch');
  assert.equal(fixture.area.read().document.revision, 2);

  const reconciled = await owner.command({
    type: TIMER_COMMANDS.RECONCILE_OWNERSHIP,
    commandId: 'owner-reconcile-local-pause-01',
    expectedRevision: 2,
    observation: observation({
      type: 'CONTEXT_VERIFIED',
      bridgeSeq: 1,
      observationId: 'observation-job-123-0002',
      observedAtMs: 1_500,
      boundaryAtMs: null,
      boundaryCertainty: 'NONE',
      verificationId: 'verification-job-123-002'
    })
  });
  assert.equal(reconciled.revision, 3);
  assert.equal(reconciled.result.state, 'LOCAL_PAUSED');

  const publicState = await observer.read();
  const publicJson = JSON.stringify(publicState);
  assert.equal(publicJson.includes('commitFence'), false);
  assert.equal(publicJson.includes('commandReceipts'), false);
  assert.equal(publicJson.includes('accrualOwnerToken'), false);
  assert.equal(Object.hasOwn(observer.snapshot(), 'sessionId'), false);

  await observer.teardown();
  await owner.teardown();
});

test('IT-B2-TIMER-AUTH-002 MIGRATE_V07 remains direct-kernel only and coexists with later TIMER commits', async () => {
  const fixture = createFixture(2_000);
  const runtimeId = 'runtime-migration-owner-001';
  const documentToken = 'document-migration-owner-01';
  const principal = { runtimeId, documentToken, tabId: 201 };
  const directOwner = await fixture.kernel.connect(principal);
  const legacySources = {
    [LEGACY_SOURCE_KEYS.CURRENT]: JSON.stringify({
      contexts: {
        'job:260702': {
          key: 'job:260702',
          projectId: 260702,
          name: 'Migration Fixture',
          accumulatedMs: 1_000,
          sessions: [{ id: 'legacy-session-1', startAtMs: 0, endAtMs: 1_000 }]
        }
      }
    })
  };
  const migrated = await fixture.kernel.command(directOwner.session, {
    type: AUTHORITY_COMMANDS.MIGRATE_V07,
    commandId: 'direct-migration-v07-0001',
    expectedRevision: 0,
    legacySources
  });
  assert.equal(migrated.revision, 1);
  assert.equal(migrated.result.migrated, true);

  const client = fixture.client(principal.tabId, runtimeId, documentToken);
  assert.equal((await client.ensure()).disposition, 'OWNER');
  await rejection(client.command({
    type: AUTHORITY_COMMANDS.MIGRATE_V07,
    commandId: 'content-migration-rejected-01',
    expectedRevision: 1,
    legacySources
  }), 'authority-command-not-public');
  assert.equal(fixture.area.read().document.revision, 1);

  const pending = await client.command({
    type: TIMER_COMMANDS.ACCEPT_OBSERVATION,
    commandId: 'post-migration-observation-01',
    expectedRevision: 1,
    observation: observation({
      observationId: 'observation-job-260702-01',
      verificationId: 'verification-job-260702-1',
      observedAtMs: 2_000,
      boundaryAtMs: 2_000,
      context: {
        contextId: 'job:260702',
        kind: 'job',
        projectId: '260702',
        label: 'Migration Fixture',
        shortLabel: '260702'
      }
    })
  });
  assert.equal(pending.revision, 2);
  assert.equal(pending.result.state, 'PENDING');
  const persisted = fixture.area.read().document;
  assert.equal(persisted.ledger.reduce((sum, row) => sum + row.durationMs, 0), 1_000);
  assert.equal(persisted.timer.pending.contextId, 'job:260702');
  assert.deepEqual(persisted.commandReceiptOrder, [
    'direct-migration-v07-0001',
    'post-migration-observation-01'
  ]);

  await client.teardown();
});
