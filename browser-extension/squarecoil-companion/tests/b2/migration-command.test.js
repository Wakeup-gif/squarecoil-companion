'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createChromeAuthorityAdapter } = require('../../src/persistence/chrome-storage');
const { createAuthoritativeKernel } = require('../../src/data/store');
const {
  AUTHORITY_COMMANDS,
  captureV07LegacySources,
  hasCapturedLegacySource,
  createMigrationCommandHandler
} = require('../../src/data/migration-command');
const {
  LEGACY_SOURCE_KEYS,
  V07_MIGRATION_MARKER_ID
} = require('../../src/data/migration');

function storageArea() {
  let value = null;
  let fail = false;
  return {
    async get(key) { return { [key]: value === null ? undefined : structuredClone(value) }; },
    async set(patch) {
      if (fail) throw new Error('synthetic-storage-failure');
      value = structuredClone(patch.authority);
    },
    failNext(valueToSet) { fail = valueToSet; },
    snapshot() { return value === null ? null : structuredClone(value); }
  };
}

function exclusiveLocks() {
  let queue = Promise.resolve();
  return {
    request(_name, _options, callback) {
      const run = queue.then(callback, callback);
      queue = run.then(() => undefined, () => undefined);
      return run;
    }
  };
}

function ids() {
  let next = 0;
  return prefix => `${prefix}-${++next}`;
}

function fixture() {
  const area = storageArea();
  const adapter = createChromeAuthorityAdapter({
    area,
    key: 'authority',
    lockManager: exclusiveLocks()
  });
  const kernel = createAuthoritativeKernel({
    adapter,
    now: () => 2_000,
    makeId: ids(),
    workdayZone: 'UTC',
    workdayZoneDisposition: {
      source: 'CONFIGURED',
      fallback: false,
      diagnostic: null
    },
    applyCommand: createMigrationCommandHandler({ now: () => 2_000 })
  });
  return { area, kernel };
}

function legacySources() {
  return {
    [LEGACY_SOURCE_KEYS.CURRENT]: JSON.stringify({
      contexts: {
        'job:260702': {
          key: 'job:260702',
          projectId: 260702,
          name: 'Migration Fixture',
          accumulatedMs: 1_000,
          sessions: [{ id: 'session-1', startAtMs: 0, endAtMs: 1_000 }]
        }
      }
    }),
    [LEGACY_SOURCE_KEYS.ACTIVITY]: '{malformed non-authoritative activity'
  };
}

test('UT-B2-MIG-19 legacy capture reads only the three allowlisted keys and never writes', () => {
  const reads = [];
  let writes = 0;
  const values = legacySources();
  const storage = {
    getItem(key) {
      reads.push(key);
      return Object.prototype.hasOwnProperty.call(values, key) ? values[key] : null;
    },
    setItem() { writes += 1; },
    removeItem() { writes += 1; }
  };
  const captured = captureV07LegacySources(storage);

  assert.deepEqual(reads, Object.values(LEGACY_SOURCE_KEYS));
  assert.equal(writes, 0);
  assert.equal(hasCapturedLegacySource(captured), true);
  assert.deepEqual(captured, values);
  assert.equal(Object.isFrozen(captured), true);
});

test('UT-B2-MIG-20 migration commits rebuilt data and completion marker in one fenced envelope', async () => {
  const { area, kernel } = fixture();
  const owner = await kernel.connect({ runtimeId: 'runtime-a', documentToken: 'document-a', tabId: 1 });
  const sources = legacySources();
  const before = structuredClone(sources);
  const command = {
    type: AUTHORITY_COMMANDS.MIGRATE_V07,
    commandId: 'migration-v07-source-1',
    expectedRevision: 0,
    legacySources: sources
  };

  const first = await kernel.command(owner.session, command);
  const duplicate = await kernel.command(owner.session, command);
  const persisted = area.snapshot();

  assert.equal(first.duplicate, false);
  assert.equal(duplicate.duplicate, true);
  assert.equal(first.revision, 1);
  assert.equal(persisted.document.ledger.reduce((sum, row) => sum + row.durationMs, 0), 1_000);
  assert.equal(
    persisted.document.migration.completedSources[V07_MIGRATION_MARKER_ID].completionState,
    'COMPLETE'
  );
  assert.equal(persisted.document.commitFence.ownerRuntimeId, 'runtime-a');
  assert.deepEqual(sources, before);
});

test('UT-B2-MIG-21 failed migration persistence leaves no marker or rebuilt time', async () => {
  const { area, kernel } = fixture();
  const owner = await kernel.connect({ runtimeId: 'runtime-a', documentToken: 'document-a', tabId: 1 });
  const before = area.snapshot();
  area.failNext(true);

  await assert.rejects(() => kernel.command(owner.session, {
    type: AUTHORITY_COMMANDS.MIGRATE_V07,
    commandId: 'migration-v07-failed',
    expectedRevision: 0,
    legacySources: legacySources()
  }), /synthetic-storage-failure/);

  area.failNext(false);
  assert.deepEqual(area.snapshot(), before);
});
