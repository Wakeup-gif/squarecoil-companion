'use strict';

const { createChromeAuthorityAdapter } = require('../persistence/chrome-storage');
const { createAuthoritativeKernel } = require('../data/store');
const { selectWorkdayZone } = require('../data/workday-zone');
const { createAuthorityCommandDispatcher } = require('../data/command-dispatcher');

const AUTHORITY_STORAGE_KEY = 'squarecoilCompanionB2AuthorityV1';
const AUTHORITY_LOCK_NAME = 'squarecoil-companion:b2-authority-v1';

function createDefaultAuthorityKernel(options = {}) {
  const area = options.area;
  const lockManager = options.lockManager;
  if (!area) throw new Error('authority-storage-area-required');
  if (!lockManager || typeof lockManager.request !== 'function') {
    throw new Error('authority-web-locks-required');
  }
  const now = options.now || (() => Date.now());
  const workdayZone = selectWorkdayZone({
    configuredZone: options.configuredWorkdayZone,
    runtimeZone: options.runtimeWorkdayZone,
    intl: options.intl
  });
  const adapter = createChromeAuthorityAdapter({
    area,
    key: options.storageKey || AUTHORITY_STORAGE_KEY,
    lockManager,
    lockName: options.lockName || AUTHORITY_LOCK_NAME
  });
  return createAuthoritativeKernel({
    adapter,
    now,
    makeId: options.makeId,
    leaseDurationMs: options.leaseDurationMs,
    receiptLimit: options.receiptLimit,
    workdayZone: workdayZone.zone,
    workdayZoneDisposition: workdayZone,
    applyCommand: createAuthorityCommandDispatcher({
      now,
      makeId: options.makeId,
      verificationGraceMs: options.verificationGraceMs,
      clockSkewMs: options.clockSkewMs,
      buildVersion: options.buildVersion,
      migrationHandler: options.migrationHandler,
      timerHandler: options.timerHandler,
      dataSafetyHandler: options.dataSafetyHandler
    })
  });
}

module.exports = {
  AUTHORITY_STORAGE_KEY,
  AUTHORITY_LOCK_NAME,
  createDefaultAuthorityKernel
};
