'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createChromeAuthorityAdapter } = require('../../src/persistence/chrome-storage');
const {
  DEFAULT_RECEIPT_LIMIT,
  createAuthoritativeKernel
} = require('../../src/data/store');

function fakeStorageArea() {
  const values = {};
  let failWrite = false;
  return {
    async get(key) {
      return { [key]: values[key] === undefined ? undefined : structuredClone(values[key]) };
    },
    async set(patch) {
      if (failWrite) throw new Error('synthetic-storage-failure');
      Object.assign(values, structuredClone(patch));
    },
    setFailure(value) { failWrite = value; },
    value(key) { return values[key] === undefined ? null : structuredClone(values[key]); }
  };
}

function lockManager() {
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

function deterministicIds() {
  let value = 0;
  return prefix => `${prefix}-${++value}`;
}

function requester(runtimeId, documentToken, tabId) {
  return { runtimeId, documentToken, tabId };
}

function fixture(options = {}) {
  const area = options.area || fakeStorageArea();
  const locks = options.locks || lockManager();
  const clock = options.clock || { value: 1000 };
  const adapter = createChromeAuthorityAdapter({
    area,
    key: 'authority',
    lockManager: locks
  });
  const kernel = createAuthoritativeKernel({
    adapter,
    now: () => clock.value,
    makeId: options.makeId || deterministicIds(),
    leaseDurationMs: options.leaseDurationMs || 100,
    receiptLimit: options.receiptLimit || DEFAULT_RECEIPT_LIMIT,
    workdayZone: 'UTC',
    workdayZoneDisposition: {
      source: 'CONFIGURED',
      fallback: false,
      diagnostic: null
    },
    applyCommand: async (document, command, context) => {
      document.timer.lastReason = command.reason;
      return {
        reason: command.reason,
        requesterRuntimeId: context.requester.runtimeId,
        requesterDisposition: context.requesterDisposition,
        ownerRuntimeId: 'must-be-redacted',
        nested: {
          fencingToken: 999,
          safe: 'retained'
        }
      };
    }
  });
  return { area, locks, clock, adapter, kernel };
}

test('IT-B2-AUTH-001 owner and observer get scoped sessions without fencing credentials', async () => {
  const { kernel } = fixture();
  const owner = await kernel.connect(requester('runtime-a', 'document-a', 1));
  const observer = await kernel.connect(requester('runtime-b', 'document-b', 2));

  assert.equal(owner.disposition, 'OWNER');
  assert.equal(observer.disposition, 'OBSERVER_CONNECTED');
  assert.equal(owner.coordinationEpoch, 1);
  assert.equal(observer.coordinationEpoch, 1);
  assert.equal(JSON.stringify(owner).includes('fencingToken'), false);
  assert.equal(JSON.stringify(observer).includes('ownerRuntimeId'), false);
  assert.notEqual(owner.session.sessionId, observer.session.sessionId);
});

test('IT-B2-AUTH-002 observer command commits once through the current owner fence', async () => {
  const { area, kernel } = fixture();
  const owner = await kernel.connect(requester('runtime-a', 'document-a', 1));
  const observer = await kernel.connect(requester('runtime-b', 'document-b', 2));
  const command = { commandId: 'observer-1', expectedRevision: 0, reason: 'observer-pause' };
  const first = await kernel.command(observer.session, command);
  const duplicate = await kernel.command(observer.session, command);
  const persisted = area.value('authority');

  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(first.revision, 1);
  assert.equal(duplicate.revision, 1);
  assert.equal(persisted.document.timer.lastReason, 'observer-pause');
  assert.deepEqual(persisted.document.commitFence, {
    ownerRuntimeId: owner.session.runtimeId,
    coordinationEpoch: 1,
    fencingToken: 1
  });
  assert.equal(JSON.stringify(first).includes('fencingToken'), false);
  assert.equal(JSON.stringify(first).includes('ownerRuntimeId'), false);
  assert.equal(first.result.nested.safe, 'retained');
  assert.equal(first.result.requesterDisposition, 'OBSERVER_CONNECTED');
  assert.equal(JSON.stringify(persisted.document.commandReceipts).includes('fencingToken'), false);
  assert.equal(JSON.stringify(persisted.document.commandReceipts).includes('ownerRuntimeId'), false);
  await assert.rejects(
    () => kernel.command(observer.session, { ...command, reason: 'collision' }),
    /command-id-conflict/
  );
});

test('IT-B2-AUTH-003 takeover invalidates stale requester epochs before mutation', async () => {
  const { area, clock, kernel } = fixture();
  const owner = await kernel.connect(requester('runtime-a', 'document-a', 1));
  const observer = await kernel.connect(requester('runtime-b', 'document-b', 2));
  clock.value = 1100;
  const takeover = await kernel.heartbeat(observer.session);

  assert.equal(takeover.disposition, 'OWNER');
  assert.equal(takeover.coordinationEpoch, 2);
  await assert.rejects(
    () => kernel.command(owner.session, {
      commandId: 'stale-owner-write',
      expectedRevision: 0,
      reason: 'must-not-land'
    }),
    /stale-requester-coordination-epoch/
  );
  assert.equal(area.value('authority').document.revision, 0);
  assert.equal(area.value('authority').document.timer.lastReason, 'initialized');

  const resynchronized = await kernel.read(owner.session);
  assert.equal(resynchronized.disposition, 'OBSERVER_CONNECTED');
  const routed = await kernel.command(owner.session, {
    commandId: 'resynchronized-observer',
    expectedRevision: 0,
    reason: 'safe-after-resync'
  });
  assert.equal(routed.revision, 1);
  assert.equal(area.value('authority').document.commitFence.ownerRuntimeId, 'runtime-b');
  assert.equal(area.value('authority').document.commitFence.coordinationEpoch, 2);
});

test('IT-B2-AUTH-004 worker restart preserves data and requires requester reconnect', async () => {
  const shared = fixture();
  const firstOwner = await shared.kernel.connect(requester('runtime-a', 'document-a', 1));
  await shared.kernel.command(firstOwner.session, {
    commandId: 'before-restart',
    expectedRevision: 0,
    reason: 'persisted-before-restart'
  });

  const restarted = fixture({
    area: shared.area,
    locks: shared.locks,
    clock: shared.clock,
    makeId: deterministicIds()
  }).kernel;
  await assert.rejects(
    () => restarted.read(firstOwner.session),
    /requester-session-reconnect-required/
  );
  const reconnected = await restarted.connect(requester('runtime-a', 'document-a', 1));
  const state = await restarted.read(reconnected.session);

  assert.equal(reconnected.disposition, 'OWNER');
  assert.equal(reconnected.coordinationEpoch, 1);
  assert.equal(reconnected.revision, 1);
  assert.equal(state.document.timer.lastReason, 'persisted-before-restart');
  assert.equal(JSON.stringify(state).includes('commandReceipts'), false);
  assert.equal(JSON.stringify(state).includes('fencingToken'), false);
});

test('IT-B2-AUTH-005 failed persistence keeps the last committed document', async () => {
  const { area, kernel } = fixture();
  const owner = await kernel.connect(requester('runtime-a', 'document-a', 1));
  area.setFailure(true);
  await assert.rejects(
    () => kernel.command(owner.session, {
      commandId: 'failed-write',
      expectedRevision: 0,
      reason: 'must-not-stick'
    }),
    /synthetic-storage-failure/
  );
  area.setFailure(false);
  const state = await kernel.read(owner.session);
  assert.equal(state.revision, 0);
  assert.equal(state.document.timer.lastReason, 'initialized');
});

test('UT-B2-AUTH-001 receipts are bounded and an evicted replay is stale, not re-executed', async () => {
  const { area, kernel } = fixture({ receiptLimit: 2 });
  const owner = await kernel.connect(requester('runtime-a', 'document-a', 1));
  for (let index = 0; index < 3; index += 1) {
    await kernel.command(owner.session, {
      commandId: `bounded-${index}`,
      expectedRevision: index,
      reason: `commit-${index}`
    });
  }
  const persisted = area.value('authority').document;
  assert.deepEqual(persisted.commandReceiptOrder, ['bounded-1', 'bounded-2']);
  assert.deepEqual(Object.keys(persisted.commandReceipts).sort(), ['bounded-1', 'bounded-2']);
  await assert.rejects(
    () => kernel.command(owner.session, {
      commandId: 'bounded-0',
      expectedRevision: 0,
      reason: 'commit-0'
    }),
    /stale-revision/
  );
  assert.equal(area.value('authority').document.revision, 3);
});

test('IT-B2-AUTH-006 notifications are post-commit, immutable snapshots without credentials', async () => {
  const { kernel } = fixture();
  const events = [];
  const unsubscribe = kernel.subscribe(event => events.push(event));
  const owner = await kernel.connect(requester('runtime-a', 'document-a', 1));
  await kernel.command(owner.session, {
    commandId: 'notify-1',
    expectedRevision: 0,
    reason: 'notified'
  });
  unsubscribe();

  const event = events.at(-1);
  assert.equal(event.reason, 'authoritative-command');
  assert.equal(event.revision, 1);
  assert.equal(event.document.timer.lastReason, 'notified');
  assert.equal(Object.isFrozen(event.document), true);
  assert.equal(Object.isFrozen(event.document.timer), true);
  assert.equal(JSON.stringify(event).includes('fencingToken'), false);
  assert.equal(JSON.stringify(event).includes('commandReceipts'), false);
});

test('UT-B2-AUTH-004 command handlers cannot mutate store-owned commit metadata', async () => {
  const area = fakeStorageArea();
  const locks = lockManager();
  const adapter = createChromeAuthorityAdapter({ area, key: 'authority', lockManager: locks });
  const kernel = createAuthoritativeKernel({
    adapter,
    now: () => 1000,
    makeId: deterministicIds(),
    leaseDurationMs: 100,
    workdayZone: 'UTC',
    workdayZoneDisposition: { source: 'CONFIGURED', fallback: false, diagnostic: null },
    applyCommand: async document => {
      document.commandReceiptOrder.push('forged');
      return { ok: true };
    }
  });
  const owner = await kernel.connect(requester('runtime-a', 'document-a', 1));
  await assert.rejects(
    () => kernel.command(owner.session, {
      commandId: 'protected-metadata',
      expectedRevision: 0,
      reason: 'must-not-commit'
    }),
    /authority-command-mutated-protected-metadata/
  );
  assert.equal(area.value('authority').document.revision, 0);
  assert.deepEqual(area.value('authority').document.commandReceiptOrder, []);
});

test('IT-B2-AUTH-007 queued commands sample lease time only after acquiring the storage lock', async () => {
  const { adapter, area, clock, kernel } = fixture({ leaseDurationMs: 100 });
  const owner = await kernel.connect(requester('runtime-a', 'document-a', 1));
  let releaseBlocker;
  let blockerEntered = false;
  const blockerGate = new Promise(resolve => { releaseBlocker = resolve; });
  const blocker = adapter.runExclusive(async () => {
    blockerEntered = true;
    await blockerGate;
    return { next: null, result: null };
  });
  while (!blockerEntered) await Promise.resolve();

  const queuedCommand = kernel.command(owner.session, {
    commandId: 'queued-after-expiry',
    expectedRevision: 0,
    reason: 'must-not-commit'
  });
  await new Promise(resolve => setImmediate(resolve));
  clock.value = 1100;
  releaseBlocker();
  await blocker;

  await assert.rejects(() => queuedCommand, /coordination-owner-unavailable/);
  assert.equal(area.value('authority').document.revision, 0);
  assert.equal(area.value('authority').document.timer.lastReason, 'initialized');
});
