'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { LEGACY_KEYS, inspectLegacyPresence } = require('../../src/data/legacy-preflight');
const { inspectLegacyMigration, MIGRATION_DISPOSITIONS } = require('../../src/data/legacy-preflight');
const { createEmptyDocument } = require('../../src/data/model');
const { migrateV07 } = require('../../src/data/migration');

function storage(values) {
  return { getItem(key) { return Object.hasOwn(values, key) ? values[key] : null; } };
}

function migratedDocument(values) {
  return migrateV07(createEmptyDocument({ nowMs: 1, workdayZone: 'UTC' }), values, { nowMs: 2 }).document;
}

test('UT-B2-MIG-015 legacy preflight reports presence without retaining, exposing, rewriting, or deleting source bytes', () => {
  const source = new Map([[LEGACY_KEYS[0], '{"private":"unchanged"}']]);
  const reads = [];
  const storage = {
    getItem(key) {
      reads.push(key);
      return source.has(key) ? source.get(key) : null;
    },
    setItem() { throw new Error('legacy-preflight-must-not-write'); },
    removeItem() { throw new Error('legacy-preflight-must-not-delete'); }
  };

  const before = new Map(source);
  const result = inspectLegacyPresence(storage);

  assert.equal(result.checked, true);
  assert.equal(result.blocked, true);
  assert.equal(result.reason, 'legacy-migration-required');
  assert.deepEqual(result.presentKeys, [LEGACY_KEYS[0]]);
  assert.deepEqual(reads, LEGACY_KEYS);
  assert.deepEqual(source, before);
  assert.equal(Object.isFrozen(result), true);
  assert.equal(Object.isFrozen(result.presentKeys), true);
});

test('UT-B2-MIG-016 inaccessible legacy storage fails closed without exposing values', () => {
  const result = inspectLegacyPresence({
    getItem() { throw new Error('synthetic-denial-with-sensitive-detail'); }
  });

  assert.deepEqual(result, {
    checked: false,
    blocked: true,
    reason: 'legacy-preflight-unavailable',
    presentKeys: []
  });
});

test('UT-B2-MIG-026 MIG-C03/MIG-C04 retained matching legacy keys resolve COMPLETE_MATCH idempotently', () => {
  const values = { [LEGACY_KEYS[0]]: JSON.stringify({ contexts: {} }) };
  const result = inspectLegacyMigration(storage(values), migratedDocument(values));
  assert.equal(result.disposition, MIGRATION_DISPOSITIONS.COMPLETE_MATCH);
  assert.equal(result.blocked, false);
});

test('UT-B2-MIG-027 MIG-C06 CURRENT or ARCHIVE changes after completion block automatic re-import', () => {
  const values = { [LEGACY_KEYS[0]]: JSON.stringify({ contexts: {} }) };
  const document = migratedDocument(values);
  const changed = { ...values, [LEGACY_KEYS[0]]: JSON.stringify({ contexts: { changed: {} } }) };
  assert.equal(inspectLegacyMigration(storage(changed), document).disposition,
    MIGRATION_DISPOSITIONS.SOURCE_CHANGED_AFTER_COMPLETION);
});

test('UT-B2-MIG-028 MIG-C07 ACTIVITY-only changes are diagnostic and nonblocking', () => {
  const values = {
    [LEGACY_KEYS[0]]: JSON.stringify({ contexts: {} }),
    [LEGACY_KEYS[2]]: JSON.stringify([{ event: 'before' }])
  };
  const document = migratedDocument(values);
  const changed = { ...values, [LEGACY_KEYS[2]]: JSON.stringify([{ event: 'after' }]) };
  const result = inspectLegacyMigration(storage(changed), document);
  assert.equal(result.disposition, MIGRATION_DISPOSITIONS.COMPLETE_MATCH);
  assert.equal(result.activityChanged, true);
  assert.equal(result.blocked, false);
});

test('UT-B2-MIG-032 malformed retained authority source fails before migration and corrected bytes become required', () => {
  const malformed = { [LEGACY_KEYS[0]]: 'A4-SENSITIVE-LEGACY-VALUE-MUST-NOT-LEAK' };
  const failed = inspectLegacyMigration(storage(malformed), createEmptyDocument({ nowMs: 1, workdayZone: 'UTC' }));
  assert.equal(failed.disposition, MIGRATION_DISPOSITIONS.FAILED);
  assert.equal(failed.reason, 'legacy-preflight-failed');
  assert.equal(failed.checked, false);
  assert.deepEqual(failed.presentKeys, [LEGACY_KEYS[0]]);
  assert.equal(JSON.stringify(failed).includes(malformed[LEGACY_KEYS[0]]), false);

  const corrected = inspectLegacyMigration(
    storage({ [LEGACY_KEYS[0]]: JSON.stringify({ contexts: {} }) }),
    createEmptyDocument({ nowMs: 1, workdayZone: 'UTC' })
  );
  assert.equal(corrected.disposition, MIGRATION_DISPOSITIONS.REQUIRED);
  assert.equal(corrected.checked, true);
});
