'use strict';

const POSITIVE_AUTHORITY = new Set(['OWNER', 'OBSERVER_CONNECTED']);
const SETTLED_MIGRATION = new Set(['NOT_REQUIRED', 'COMPLETE_MATCH']);
const USABLE_BRIDGE = new Set(['FULL', 'VERIFICATION_FALLBACK', 'DOM_FALLBACK', 'SERVER_FALLBACK']);
const MAX_COORDINATION_CLOCK_SKEW_MS = 1_000;

const SHELL_REQUIREMENTS = Object.freeze([
  'oneLifecycleOwner',
  'validRuntimeIdentity',
  'oneOwnedRoot',
  'interactionReady',
  'persistenceAvailable',
  'bridgeInitialized',
  'initialObservationAttempted',
  'featureRegistryInitialized',
  'teardownRegistered'
]);

function failure(reason, details = {}) {
  return Object.freeze({ ready: false, reason, ...details });
}

function validAuthorityTenure(value) {
  return Boolean(
    Number.isSafeInteger(value?.coordinationEpoch) &&
    value.coordinationEpoch >= 1 &&
    typeof value?.workerInstanceId === 'string' &&
    value.workerInstanceId.length >= 8
  );
}

function sameAuthorityTenure(left, right) {
  return validAuthorityTenure(left) &&
    validAuthorityTenure(right) &&
    left.coordinationEpoch === right.coordinationEpoch &&
    left.workerInstanceId === right.workerInstanceId;
}

function evaluateB2ReadySettlement(shellHealth, authority, core, options = {}) {
  const decisionAtMs = Number.isSafeInteger(options.decisionAtMs) ? options.decisionAtMs : Date.now();
  const readiness = shellHealth?.readiness;
  if (
    shellHealth?.mode !== 'ENABLED' ||
    shellHealth?.teardownInProgress === true ||
    !readiness ||
    !SHELL_REQUIREMENTS.every(key => readiness[key] === true)
  ) return failure(shellHealth?.reason || 'lifecycle-prerequisite-incomplete');

  if (authority?.enabled !== true || authority?.healthy !== true || !POSITIVE_AUTHORITY.has(authority.disposition)) {
    return failure('coordination-unavailable', { authorityDisposition: authority?.disposition || 'UNAVAILABLE' });
  }
  if (
    authority.subscribed !== true ||
    authority.errorFree !== true ||
    !Number.isSafeInteger(authority.capturedAtMs) ||
    !Number.isSafeInteger(authority.leaseExpiry) ||
    authority.capturedAtMs - decisionAtMs > MAX_COORDINATION_CLOCK_SKEW_MS ||
    authority.leaseExpiry <= authority.capturedAtMs ||
    decisionAtMs >= authority.leaseExpiry
  ) {
    return failure('coordination-not-current', { authorityDisposition: authority.disposition });
  }
  if (!validAuthorityTenure(authority)) {
    return failure('coordination-tenure-unavailable', { authorityDisposition: authority.disposition });
  }
  if (core?.initialized !== true || core?.disposed === true) return failure('trusted-core-not-initialized');
  if (core.blocked === true) return failure(core?.preflight?.reason || 'trusted-core-blocked');
  const expectedOwner = authority.disposition === 'OWNER';
  if (core.authorityOwner !== expectedOwner) return failure('trusted-core-authority-mismatch');
  if (!sameAuthorityTenure(authority, core.authorityTenure)) return failure('trusted-core-tenure-mismatch');
  if (
    !Number.isSafeInteger(authority.revision) ||
    authority.revision < 0 ||
    !Number.isSafeInteger(core.revision) ||
    core.revision !== authority.revision
  ) return failure('trusted-core-not-current');
  const migrationDisposition = core?.preflight?.disposition;
  if (core?.preflight?.checked !== true) return failure('migration-preflight-incomplete');
  if (core?.preflight?.blocked === true) {
    return failure(core.preflight.reason || 'migration-blocked', { migrationDisposition: migrationDisposition || 'UNAVAILABLE' });
  }
  if (!SETTLED_MIGRATION.has(migrationDisposition)) {
    return failure(core?.preflight?.reason || 'migration-unsettled', { migrationDisposition: migrationDisposition || 'UNAVAILABLE' });
  }
  if (core.readModelError) return failure('trusted-core-read-model-failed');

  const bridge = core.bridge;
  if (
    bridge?.initialized !== true ||
    bridge?.active !== true ||
    bridge?.disposed === true ||
    bridge?.listenersAttached !== true
  ) return failure('bridge-not-initialized');
  if (!USABLE_BRIDGE.has(bridge.capability)) {
    return failure('bridge-unavailable', { bridgeCapability: bridge?.capability || 'UNAVAILABLE' });
  }
  if (bridge.owner !== expectedOwner) return failure('bridge-authority-mismatch');
  if (!sameAuthorityTenure(authority, bridge.authorityTenure)) return failure('bridge-tenure-mismatch');
  if (expectedOwner && (
    bridge.ownerInitialObservationCompleted !== true ||
    !Number.isSafeInteger(bridge.requestCount) ||
    bridge.requestCount < 1
  )) {
    return failure('bridge-initial-observation-missing');
  }

  return Object.freeze({
    ready: true,
    reason: 'ready',
    authorityDisposition: authority.disposition,
    migrationDisposition,
    bridgeCapability: bridge.capability
  });
}

module.exports = {
  POSITIVE_AUTHORITY,
  SETTLED_MIGRATION,
  USABLE_BRIDGE,
  MAX_COORDINATION_CLOCK_SKEW_MS,
  SHELL_REQUIREMENTS,
  validAuthorityTenure,
  sameAuthorityTenure,
  evaluateB2ReadySettlement
};
