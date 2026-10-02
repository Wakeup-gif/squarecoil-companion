'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createChromeAuthorityAdapter } = require('../../src/persistence/chrome-storage');

function fakeStorageArea(options = {}) {
  const values = {};
  return {
    async get(key) {
      return { [key]: values[key] === undefined ? undefined : structuredClone(values[key]) };
    },
    async set(patch) {
      if (options.failWrite?.()) throw new Error('synthetic-storage-failure');
      Object.assign(values, structuredClone(patch));
      if (options.tamperReadback) values.authority.kernelCommitId = 'tampered';
    },
    value(key) {
      return values[key] === undefined ? null : structuredClone(values[key]);
    }
  };
}

function serializedLockManager() {
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

function record(revision, label) {
  return {
    kernelSchemaVersion: 1,
    kernelRevision: revision,
    kernelCommitId: `kernel-${revision}-${label}`,
    updatedAtMs: revision,
    label
  };
}

test('UT-B2-PERSIST-001 mutation fails closed when an exclusive cross-context lock is unavailable', () => {
  assert.throws(() => createChromeAuthorityAdapter({
    area: fakeStorageArea(),
    key: 'authority',
    lockManager: {}
  }), /exclusive-storage-lock-required/);
});

test('IT-B2-PERSIST-001 two adapter instances serialize read-modify-write without a lost update', async () => {
  const area = fakeStorageArea();
  const locks = serializedLockManager();
  const left = createChromeAuthorityAdapter({ area, key: 'authority', lockManager: locks });
  const right = createChromeAuthorityAdapter({ area, key: 'authority', lockManager: locks });
  await left.runExclusive(async () => ({ next: record(0, 'seed'), result: null }));

  let firstEntered = false;
  let releaseFirst;
  const firstGate = new Promise(resolve => { releaseFirst = resolve; });
  const first = left.runExclusive(async current => {
    firstEntered = true;
    await firstGate;
    return { next: record(current.kernelRevision + 1, 'left'), result: 'left' };
  });
  while (!firstEntered) await Promise.resolve();
  const second = right.runExclusive(async current => ({
    next: record(current.kernelRevision + 1, 'right'),
    result: 'right'
  }));
  releaseFirst();
  const results = await Promise.all([first, second]);

  assert.deepEqual(results.map(value => value.result), ['left', 'right']);
  assert.equal(area.value('authority').kernelRevision, 2);
  assert.equal(area.value('authority').label, 'right');
});

test('UT-B2-PERSIST-002 read-back identity mismatch fails closed', async () => {
  const area = fakeStorageArea({ tamperReadback: true });
  const adapter = createChromeAuthorityAdapter({
    area,
    key: 'authority',
    lockManager: serializedLockManager()
  });
  await assert.rejects(
    () => adapter.runExclusive(async () => ({ next: record(0, 'candidate'), result: null })),
    /persistence-readback-identity-mismatch/
  );
});

module.exports = { fakeStorageArea, serializedLockManager };
