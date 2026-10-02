'use strict';

const COORDINATION_SCHEMA_VERSION = 1;

const DISPOSITIONS = Object.freeze({
  OWNER: 'OWNER',
  OBSERVER_CONNECTED: 'OBSERVER_CONNECTED',
  RELEASED: 'RELEASED',
  REJECTED: 'REJECTED'
});

function isSafeCounter(value) {
  return Number.isSafeInteger(value) && value >= 0;
}

function requireSafeCounter(value, name) {
  if (!isSafeCounter(value)) throw new Error(`${name}-invalid`);
  return value;
}

function requireTimestamp(value, name) {
  if (!Number.isSafeInteger(value) || value < 0) throw new Error(`${name}-invalid`);
  return value;
}

function requireText(value, name) {
  const normalized = String(value || '').trim();
  if (!normalized) throw new Error(`${name}-required`);
  return normalized;
}

function normalizePrincipal(input = {}) {
  const tabId = Number(input.tabId);
  if (!Number.isSafeInteger(tabId) || tabId < 0) throw new Error('tab-id-invalid');
  return Object.freeze({
    runtimeId: requireText(input.runtimeId, 'runtime-id'),
    documentToken: requireText(input.documentToken, 'document-token'),
    tabId
  });
}

function samePrincipal(left, right) {
  return Boolean(
    left &&
    right &&
    left.runtimeId === right.runtimeId &&
    left.documentToken === right.documentToken &&
    left.tabId === right.tabId
  );
}

function nextCounter(value, name) {
  requireSafeCounter(value, name);
  if (value === Number.MAX_SAFE_INTEGER) throw new Error(`${name}-exhausted`);
  return value + 1;
}

function addDuration(nowMs, leaseDurationMs) {
  requireTimestamp(nowMs, 'coordination-now');
  if (!Number.isSafeInteger(leaseDurationMs) || leaseDurationMs <= 0) {
    throw new Error('lease-duration-invalid');
  }
  const value = nowMs + leaseDurationMs;
  if (!Number.isSafeInteger(value)) throw new Error('lease-expiry-overflow');
  return value;
}

function createCoordinationState() {
  return {
    schemaVersion: COORDINATION_SCHEMA_VERSION,
    coordinationRevision: 0,
    ownerRuntimeId: null,
    ownerDocumentToken: null,
    ownerTabId: null,
    coordinationEpoch: 0,
    fencingToken: 0,
    leaseExpiry: null,
    lastHeartbeat: null
  };
}

function ownerPrincipal(state) {
  if (!state.ownerRuntimeId) return null;
  return Object.freeze({
    runtimeId: state.ownerRuntimeId,
    documentToken: state.ownerDocumentToken,
    tabId: state.ownerTabId
  });
}

function readCoordinationState(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error('coordination-state-invalid');
  }
  if (value.schemaVersion !== COORDINATION_SCHEMA_VERSION) {
    throw new Error('coordination-schema-unsupported');
  }

  const coordinationRevision = requireSafeCounter(
    value.coordinationRevision,
    'coordination-revision'
  );
  const coordinationEpoch = requireSafeCounter(value.coordinationEpoch, 'coordination-epoch');
  const fencingToken = requireSafeCounter(value.fencingToken, 'fencing-token');
  const hasOwner = value.ownerRuntimeId !== null;

  if (!hasOwner) {
    if (
      value.ownerDocumentToken !== null ||
      value.ownerTabId !== null ||
      value.leaseExpiry !== null ||
      value.lastHeartbeat !== null
    ) {
      throw new Error('unowned-coordination-retains-owner-state');
    }
  } else {
    normalizePrincipal({
      runtimeId: value.ownerRuntimeId,
      documentToken: value.ownerDocumentToken,
      tabId: value.ownerTabId
    });
    if (coordinationEpoch < 1 || fencingToken < 1) {
      throw new Error('owned-coordination-fence-invalid');
    }
    requireTimestamp(value.leaseExpiry, 'lease-expiry');
    requireTimestamp(value.lastHeartbeat, 'last-heartbeat');
    if (value.leaseExpiry <= value.lastHeartbeat) {
      throw new Error('lease-window-invalid');
    }
  }

  return {
    schemaVersion: COORDINATION_SCHEMA_VERSION,
    coordinationRevision,
    ownerRuntimeId: hasOwner ? requireText(value.ownerRuntimeId, 'owner-runtime-id') : null,
    ownerDocumentToken: hasOwner ? requireText(value.ownerDocumentToken, 'owner-document-token') : null,
    ownerTabId: hasOwner ? Number(value.ownerTabId) : null,
    coordinationEpoch,
    fencingToken,
    leaseExpiry: hasOwner ? value.leaseExpiry : null,
    lastHeartbeat: hasOwner ? value.lastHeartbeat : null
  };
}

function isLeaseActive(state, nowMs) {
  requireTimestamp(nowMs, 'coordination-now');
  return Boolean(state.ownerRuntimeId && nowMs < state.leaseExpiry);
}

function result(state, disposition, changed, reason) {
  return Object.freeze({
    disposition,
    changed,
    reason,
    coordination: readCoordinationState(state)
  });
}

function connectRuntime(persistedState, options = {}) {
  const state = readCoordinationState(persistedState);
  const principal = normalizePrincipal(options.principal);
  const nowMs = requireTimestamp(options.nowMs, 'coordination-now');
  const leaseDurationMs = options.leaseDurationMs;
  addDuration(nowMs, leaseDurationMs);

  if (isLeaseActive(state, nowMs)) {
    if (samePrincipal(ownerPrincipal(state), principal)) {
      return result(state, DISPOSITIONS.OWNER, false, 'OWNER_CONFIRMED');
    }
    return result(state, DISPOSITIONS.OBSERVER_CONNECTED, false, 'OWNER_ACTIVE');
  }

  const coordination = {
    ...state,
    coordinationRevision: nextCounter(state.coordinationRevision, 'coordination-revision'),
    ownerRuntimeId: principal.runtimeId,
    ownerDocumentToken: principal.documentToken,
    ownerTabId: principal.tabId,
    coordinationEpoch: nextCounter(state.coordinationEpoch, 'coordination-epoch'),
    fencingToken: nextCounter(state.fencingToken, 'fencing-token'),
    leaseExpiry: addDuration(nowMs, leaseDurationMs),
    lastHeartbeat: nowMs
  };
  return result(
    coordination,
    DISPOSITIONS.OWNER,
    true,
    state.ownerRuntimeId ? 'EXPIRED_LEASE_TAKEOVER' : 'OWNERSHIP_ACQUIRED'
  );
}

function renewLease(persistedState, options = {}) {
  const state = readCoordinationState(persistedState);
  const principal = normalizePrincipal(options.principal);
  const nowMs = requireTimestamp(options.nowMs, 'coordination-now');
  const leaseDurationMs = options.leaseDurationMs;
  addDuration(nowMs, leaseDurationMs);

  if (!state.ownerRuntimeId) return result(state, DISPOSITIONS.REJECTED, false, 'NO_ACTIVE_OWNER');
  if (!samePrincipal(ownerPrincipal(state), principal)) {
    return result(state, DISPOSITIONS.REJECTED, false, 'NOT_OWNER');
  }
  if (!isLeaseActive(state, nowMs)) {
    return result(state, DISPOSITIONS.REJECTED, false, 'LEASE_EXPIRED');
  }
  if (nowMs < state.lastHeartbeat) {
    return result(state, DISPOSITIONS.REJECTED, false, 'CLOCK_REGRESSION');
  }

  return result({
    ...state,
    coordinationRevision: nextCounter(state.coordinationRevision, 'coordination-revision'),
    leaseExpiry: Math.max(state.leaseExpiry, addDuration(nowMs, leaseDurationMs)),
    lastHeartbeat: nowMs
  }, DISPOSITIONS.OWNER, true, 'LEASE_RENEWED');
}

function releaseOwnership(persistedState, options = {}) {
  const state = readCoordinationState(persistedState);
  const principal = normalizePrincipal(options.principal);
  const nowMs = requireTimestamp(options.nowMs, 'coordination-now');

  if (!state.ownerRuntimeId) return result(state, DISPOSITIONS.RELEASED, false, 'ALREADY_RELEASED');
  if (!samePrincipal(ownerPrincipal(state), principal)) {
    return result(state, DISPOSITIONS.REJECTED, false, 'NOT_OWNER');
  }
  if (!isLeaseActive(state, nowMs)) {
    return result(state, DISPOSITIONS.REJECTED, false, 'LEASE_EXPIRED');
  }

  return result({
    ...state,
    coordinationRevision: nextCounter(state.coordinationRevision, 'coordination-revision'),
    ownerRuntimeId: null,
    ownerDocumentToken: null,
    ownerTabId: null,
    leaseExpiry: null,
    lastHeartbeat: null
  }, DISPOSITIONS.RELEASED, true, 'OWNERSHIP_RELEASED');
}

function authorizeOwner(persistedState, options = {}) {
  const state = readCoordinationState(persistedState);
  const principal = normalizePrincipal(options.principal);
  const nowMs = requireTimestamp(options.nowMs, 'coordination-now');
  if (!state.ownerRuntimeId) return Object.freeze({ accepted: false, reason: 'NO_ACTIVE_OWNER' });
  if (!isLeaseActive(state, nowMs)) return Object.freeze({ accepted: false, reason: 'LEASE_EXPIRED' });
  if (!samePrincipal(ownerPrincipal(state), principal)) {
    return Object.freeze({ accepted: false, reason: 'NOT_OWNER' });
  }
  return Object.freeze({ accepted: true, reason: 'WRITE_AUTHORIZED' });
}

module.exports = {
  COORDINATION_SCHEMA_VERSION,
  DISPOSITIONS,
  isSafeCounter,
  normalizePrincipal,
  samePrincipal,
  createCoordinationState,
  readCoordinationState,
  ownerPrincipal,
  isLeaseActive,
  connectRuntime,
  renewLease,
  releaseOwnership,
  authorizeOwner
};
