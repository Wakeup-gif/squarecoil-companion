'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { evaluateB2ReadySettlement } = require('../../src/core/b2-ready-settlement');
const {
  AUTHORITY_PROTOCOL_VERSION,
  AUTHORITY_CONTROL_MESSAGES,
  createB2SettlementAcknowledgment,
  isB2SettlementAcknowledgment
} = require('../../src/extension/authority-protocol');

function shell() {
  return {
    mode: 'ENABLED',
    state: 'DEGRADED',
    reason: 'coordination-not-implemented-b1',
    teardownInProgress: false,
    readiness: {
      oneLifecycleOwner: true,
      validRuntimeIdentity: true,
      oneOwnedRoot: true,
      interactionReady: true,
      persistenceAvailable: true,
      bridgeInitialized: true,
      initialObservationAttempted: true,
      featureRegistryInitialized: true,
      teardownRegistered: true
    }
  };
}

function authority(disposition = 'OWNER') {
  return {
    enabled: true,
    healthy: true,
    subscribed: true,
    errorFree: true,
    capturedAtMs: Date.now() - 1_000,
    leaseExpiry: Date.now() + 60_000,
    disposition,
    coordinationEpoch: 3,
    workerInstanceId: 'worker-settlement-current',
    revision: 7
  };
}

function core(overrides = {}) {
  return {
    initialized: true,
    disposed: false,
    blocked: false,
    authorityOwner: true,
    authorityTenure: {
      coordinationEpoch: 3,
      workerInstanceId: 'worker-settlement-current'
    },
    revision: 7,
    readModelError: null,
    preflight: {
      checked: true,
      blocked: false,
      disposition: 'NOT_REQUIRED',
      reason: 'legacy-not-present'
    },
    bridge: {
      initialized: true,
      active: true,
      owner: true,
      disposed: false,
      listenersAttached: true,
      verificationInFlight: false,
      capability: 'FULL',
      requestCount: 1,
      ownerInitialObservationCompleted: true,
      authorityTenure: {
        coordinationEpoch: 3,
        workerInstanceId: 'worker-settlement-current'
      }
    },
    ...overrides
  };
}

test('UT-B2-READY-001 READY-C01 settles an OWNER only after lifecycle, migration, trusted core, and Bridge prerequisites pass', () => {
  assert.deepEqual(evaluateB2ReadySettlement(shell(), authority(), core()), {
    ready: true,
    reason: 'ready',
    authorityDisposition: 'OWNER',
    migrationDisposition: 'NOT_REQUIRED',
    bridgeCapability: 'FULL'
  });
});

test('UT-B2-READY-002 READY-C02 settles an OBSERVER_CONNECTED with initialized listeners without making it a writer', () => {
  const observerCore = core({
    authorityOwner: false,
    bridge: { ...core().bridge, owner: false, requestCount: 0 }
  });
  assert.equal(evaluateB2ReadySettlement(shell(), authority('OBSERVER_CONNECTED'), observerCore).ready, true);
});

test('UT-B2-READY-003 READY-C03 every unresolved or blocked migration disposition fails closed', () => {
  for (const disposition of ['REQUIRED', 'IN_PROGRESS', 'SOURCE_CHANGED_AFTER_COMPLETION', 'UNAVAILABLE', 'FAILED']) {
    const value = evaluateB2ReadySettlement(shell(), authority(), core({
      blocked: true,
      preflight: {
        checked: true,
        blocked: true,
        disposition,
        reason: `migration-${disposition.toLowerCase()}`
      }
    }));
    assert.equal(value.ready, false, disposition);
  }
});

test('UT-B2-READY-004 READY-C04 verification fallback is READY but UNAVAILABLE Bridge is not', () => {
  const fallback = core({ bridge: { ...core().bridge, capability: 'VERIFICATION_FALLBACK' } });
  assert.equal(evaluateB2ReadySettlement(shell(), authority(), fallback).ready, true);
  const unavailable = core({ bridge: { ...core().bridge, capability: 'UNAVAILABLE' } });
  assert.deepEqual(evaluateB2ReadySettlement(shell(), authority(), unavailable), {
    ready: false,
    reason: 'bridge-unavailable',
    bridgeCapability: 'UNAVAILABLE'
  });
});

test('UT-B2-READY-005 READY remains fail closed for stale shell, unhealthy authority, incomplete core, and malformed evidence', () => {
  assert.equal(evaluateB2ReadySettlement({ ...shell(), teardownInProgress: true }, authority(), core()).ready, false);
  assert.equal(evaluateB2ReadySettlement(shell(), { ...authority(), healthy: false }, core()).ready, false);
  assert.equal(evaluateB2ReadySettlement(shell(), authority(), core({ initialized: false })).ready, false);
  assert.equal(evaluateB2ReadySettlement(shell(), authority(), {}).ready, false);
});

test('UT-B2-READY-006 B2 settlement delivery requires an exact runtime and document acknowledgment', () => {
  const message = {
    type: AUTHORITY_CONTROL_MESSAGES.GET_B2_SETTLEMENT,
    protocolVersion: AUTHORITY_PROTOCOL_VERSION,
    settlementId: 'settlement-request-001',
    settlementMode: 'REFRESH',
    workerInstanceId: 'worker-settlement-001',
    documentToken: 'document-settlement-001',
    runtimeInstanceId: 'runtime-settlement-001'
  };
  const acknowledgment = createB2SettlementAcknowledgment(message, authority(), core());
  assert.equal(isB2SettlementAcknowledgment(acknowledgment, message), true);
  assert.equal(isB2SettlementAcknowledgment({ ...acknowledgment, extra: true }, message), false);
  assert.equal(isB2SettlementAcknowledgment({ ...acknowledgment, runtimeInstanceId: 'runtime-stale-001' }, message), false);
  assert.equal(isB2SettlementAcknowledgment({ ...acknowledgment, documentToken: 'document-stale-001' }, message), false);
  assert.equal(isB2SettlementAcknowledgment({ ...acknowledgment, workerInstanceId: 'worker-stale-001' }, message), false);
  assert.equal(isB2SettlementAcknowledgment({ ...acknowledgment, settlementId: 'settlement-stale-001' }, message), false);
  assert.equal(isB2SettlementAcknowledgment({ ...acknowledgment, settlementMode: 'CONFIRM' }, message), false);
});

test('UT-B2-READY-007 cached, unsubscribed, errored, or expired coordination cannot settle READY', () => {
  for (const stale of [
    { subscribed: false },
    { errorFree: false },
    { leaseExpiry: Date.now() - 1 },
    { capturedAtMs: Date.now() + 60_000 }
  ]) {
    const value = evaluateB2ReadySettlement(shell(), { ...authority(), ...stale }, core());
    assert.equal(value.ready, false);
    assert.equal(value.reason, 'coordination-not-current');
  }
});

test('UT-B2-READY-025 bounded renderer-to-worker clock skew stays current while materially future evidence fails closed', () => {
  const decisionAtMs = 10_000;
  const withinSkew = evaluateB2ReadySettlement(
    shell(),
    { ...authority(), capturedAtMs: decisionAtMs + 500, leaseExpiry: decisionAtMs + 60_000 },
    core(),
    { decisionAtMs }
  );
  assert.equal(withinSkew.ready, true);
  const beyondSkew = evaluateB2ReadySettlement(
    shell(),
    { ...authority(), capturedAtMs: decisionAtMs + 1_001, leaseExpiry: decisionAtMs + 60_000 },
    core(),
    { decisionAtMs }
  );
  assert.equal(beyondSkew.ready, false);
  assert.equal(beyondSkew.reason, 'coordination-not-current');
});

test('UT-B2-READY-008 trusted-core and Bridge ownership must match the current authority disposition', () => {
  assert.equal(evaluateB2ReadySettlement(
    shell(),
    authority('OWNER'),
    core({ authorityOwner: false })
  ).reason, 'trusted-core-authority-mismatch');
  assert.equal(evaluateB2ReadySettlement(
    shell(),
    authority('OWNER'),
    core({ bridge: { ...core().bridge, owner: false } })
  ).reason, 'bridge-authority-mismatch');
  assert.equal(evaluateB2ReadySettlement(
    shell(),
    authority('OWNER'),
    core({ revision: 6 })
  ).reason, 'trusted-core-not-current');
  assert.equal(evaluateB2ReadySettlement(
    shell(),
    authority('OBSERVER_CONNECTED'),
    core({ authorityOwner: false, bridge: { ...core().bridge, owner: true, requestCount: 0 } })
  ).reason, 'bridge-authority-mismatch');
});

test('UT-B2-READY-009 a positive migration disposition is insufficient without checked, unblocked preflight evidence', () => {
  const unchecked = evaluateB2ReadySettlement(shell(), authority(), core({
    preflight: { ...core().preflight, checked: false }
  }));
  assert.equal(unchecked.ready, false);
  assert.equal(unchecked.reason, 'migration-preflight-incomplete');

  const blocked = evaluateB2ReadySettlement(shell(), authority(), core({
    preflight: { ...core().preflight, blocked: true, reason: 'migration-blocked-test' }
  }));
  assert.equal(blocked.ready, false);
  assert.equal(blocked.reason, 'migration-blocked-test');
});

test('UT-B2-READY-010 OWNER requires a completed initial Bridge observation for its current tenure', () => {
  for (const bridge of [
    { ...core().bridge, requestCount: 0 },
    { ...core().bridge, requestCount: -1 },
    { ...core().bridge, requestCount: null },
    { ...core().bridge, requestCount: 1, verificationInFlight: true, ownerInitialObservationCompleted: false }
  ]) {
    const value = evaluateB2ReadySettlement(shell(), authority(), core({
      bridge
    }));
    assert.equal(value.ready, false);
    assert.equal(value.reason, 'bridge-initial-observation-missing');
  }
});

test('UT-B2-READY-020 authority, trusted core, and Bridge must share one exact fencing tenure', () => {
  assert.equal(evaluateB2ReadySettlement(
    shell(),
    { ...authority(), coordinationEpoch: null },
    core()
  ).reason, 'coordination-tenure-unavailable');
  assert.equal(evaluateB2ReadySettlement(
    shell(),
    authority(),
    core({ authorityTenure: { coordinationEpoch: 2, workerInstanceId: 'worker-settlement-current' } })
  ).reason, 'trusted-core-tenure-mismatch');
  assert.equal(evaluateB2ReadySettlement(
    shell(),
    authority(),
    core({
      bridge: {
        ...core().bridge,
        authorityTenure: { coordinationEpoch: 3, workerInstanceId: 'worker-settlement-stale' }
      }
    })
  ).reason, 'bridge-tenure-mismatch');
});

test('UT-B2-READY-021 lease freshness is decided at the final worker gate, not cached by content', () => {
  const expiring = {
    ...authority(),
    capturedAtMs: 1_000,
    leaseExpiry: 2_000
  };
  assert.equal(evaluateB2ReadySettlement(
    shell(),
    expiring,
    core(),
    { decisionAtMs: 1_999 }
  ).ready, true);
  const expired = evaluateB2ReadySettlement(
    shell(),
    expiring,
    core(),
    { decisionAtMs: 2_000 }
  );
  assert.equal(expired.ready, false);
  assert.equal(expired.reason, 'coordination-not-current');
});
