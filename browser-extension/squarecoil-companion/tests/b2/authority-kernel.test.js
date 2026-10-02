'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  AUTHORITY_STORAGE_KEY,
  createDefaultAuthorityKernel
} = require('../../src/extension/authority-kernel');

function areaFixture() {
  const values = {};
  return {
    async get(key) { return { [key]: values[key] === undefined ? undefined : structuredClone(values[key]) }; },
    async set(patch) { Object.assign(values, structuredClone(patch)); },
    read(key) { return values[key] === undefined ? null : structuredClone(values[key]); }
  };
}

function locksFixture() {
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

test('UT-B2-AUTH-002 default authority fails closed without a cross-context Web Lock', () => {
  assert.throws(() => createDefaultAuthorityKernel({
    area: areaFixture(),
    lockManager: null,
    runtimeWorkdayZone: 'UTC'
  }), /authority-web-locks-required/);
});

test('UT-B2-AUTH-003 default authority persists one combined coordination and data envelope', async () => {
  const area = areaFixture();
  let id = 0;
  const kernel = createDefaultAuthorityKernel({
    area,
    lockManager: locksFixture(),
    runtimeWorkdayZone: 'America/New_York',
    now: () => 1_000,
    makeId: prefix => `${prefix}-${++id}`
  });
  const initialized = await kernel.initialize();
  const owner = await kernel.connect({ runtimeId: 'runtime-a', documentToken: 'document-a', tabId: 1 });
  const observer = await kernel.connect({ runtimeId: 'runtime-b', documentToken: 'document-b', tabId: 2 });
  const persisted = area.read(AUTHORITY_STORAGE_KEY);

  assert.equal(initialized.created, true);
  assert.equal(owner.disposition, 'OWNER');
  assert.equal(observer.disposition, 'OBSERVER_CONNECTED');
  assert.equal(persisted.kernelSchemaVersion, 1);
  assert.equal(persisted.coordination.ownerRuntimeId, 'runtime-a');
  assert.equal(persisted.document.workdayZone, 'America/New_York');
  assert.equal(persisted.document.revision, 0);
});

test('UT-B2-AUTH-007 corrupt persisted authority is preserved and blocks startup instead of being replaced', async () => {
  const area = areaFixture();
  const corrupt = {
    kernelSchemaVersion: 1,
    kernelRevision: 9,
    kernelCommitId: 'corrupt-authority-envelope',
    updatedAtMs: 9000,
    coordination: { schemaVersion: 999 },
    document: { schemaVersion: 999 }
  };
  await area.set({ [AUTHORITY_STORAGE_KEY]: corrupt });
  const kernel = createDefaultAuthorityKernel({
    area,
    lockManager: locksFixture(),
    runtimeWorkdayZone: 'UTC',
    now: () => 10_000,
    makeId: prefix => `${prefix}-must-not-be-used`
  });

  await assert.rejects(kernel.initialize(), /coordination-schema-unsupported|authoritative-schema-unsupported/);
  assert.deepEqual(area.read(AUTHORITY_STORAGE_KEY), corrupt);
});
