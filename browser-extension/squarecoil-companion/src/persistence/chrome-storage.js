'use strict';

const { deepClone } = require('../data/model');

function requireRecord(value, name) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${name}-invalid`);
  }
  return value;
}

function createChromeAuthorityAdapter(options = {}) {
  const area = options.area;
  const key = String(options.key || '').trim();
  const lockManager = options.lockManager || globalThis.navigator?.locks;
  const lockName = String(options.lockName || `squarecoil-authority:${key}`);

  if (!area || typeof area.get !== 'function' || typeof area.set !== 'function') {
    throw new Error('chrome-storage-area-required');
  }
  if (!key) throw new Error('chrome-storage-key-required');
  if (!lockManager || typeof lockManager.request !== 'function') {
    throw new Error('exclusive-storage-lock-required');
  }

  async function load() {
    const result = await area.get(key);
    const value = result && result[key];
    return value === undefined || value === null ? null : deepClone(value);
  }

  function sameCommitIdentity(expected, actual) {
    return Boolean(
      expected &&
      actual &&
      expected.kernelRevision === actual.kernelRevision &&
      expected.kernelCommitId === actual.kernelCommitId
    );
  }

  async function runExclusive(operation) {
    if (typeof operation !== 'function') throw new Error('storage-operation-required');
    return lockManager.request(lockName, { mode: 'exclusive' }, async () => {
      const current = await load();
      const outcome = requireRecord(
        await operation(current === null ? null : deepClone(current)),
        'storage-operation-result'
      );
      const shouldWrite = outcome.next !== undefined && outcome.next !== null;
      if (!shouldWrite) {
        return {
          written: false,
          record: current === null ? null : deepClone(current),
          result: deepClone(outcome.result)
        };
      }

      const next = requireRecord(deepClone(outcome.next), 'storage-next-record');
      await area.set({ [key]: next });
      const persisted = await load();
      if (!sameCommitIdentity(next, persisted)) {
        throw new Error('persistence-readback-identity-mismatch');
      }
      return {
        written: true,
        record: deepClone(persisted),
        result: deepClone(outcome.result)
      };
    });
  }

  return Object.freeze({ load, runExclusive });
}

module.exports = { createChromeAuthorityAdapter };
