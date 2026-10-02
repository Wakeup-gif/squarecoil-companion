'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  createCoordinationState,
  connectRuntime,
  renewLease,
  releaseOwnership,
  authorizeOwner
} = require('../../src/coordination/coordinator');

function principal(runtimeId, documentToken, tabId) {
  return { runtimeId, documentToken, tabId };
}

function connect(state, requester, nowMs, leaseDurationMs = 100) {
  return connectRuntime(state, {
    principal: requester,
    nowMs,
    leaseDurationMs
  });
}

test('UT-B2-FENCE-001 same requester reconnect is idempotent and a distinct document is observer-only', () => {
  const requester = principal('runtime-a', 'document-a', 1);
  const first = connect(createCoordinationState(), requester, 1000);
  const reconnected = connect(first.coordination, requester, 1001);
  const sameRuntimeNewDocument = connect(
    first.coordination,
    principal('runtime-a', 'document-b', 1),
    1001
  );

  assert.equal(first.disposition, 'OWNER');
  assert.equal(reconnected.disposition, 'OWNER');
  assert.equal(reconnected.changed, false);
  assert.equal(reconnected.coordination.coordinationEpoch, 1);
  assert.equal(reconnected.coordination.fencingToken, 1);
  assert.equal(sameRuntimeNewDocument.disposition, 'OBSERVER_CONNECTED');
});

test('UT-B2-FENCE-002 expired ownership transfers once and the old requester is fenced out', () => {
  const oldRequester = principal('runtime-a', 'document-a', 1);
  const newRequester = principal('runtime-b', 'document-b', 2);
  const first = connect(createCoordinationState(), oldRequester, 2000, 50);
  const takeover = connect(first.coordination, newRequester, 2050, 50);

  assert.equal(takeover.disposition, 'OWNER');
  assert.equal(takeover.reason, 'EXPIRED_LEASE_TAKEOVER');
  assert.equal(takeover.coordination.coordinationEpoch, 2);
  assert.equal(takeover.coordination.fencingToken, 2);
  assert.deepEqual(authorizeOwner(takeover.coordination, {
    principal: oldRequester,
    nowMs: 2051
  }), { accepted: false, reason: 'NOT_OWNER' });
  assert.deepEqual(authorizeOwner(takeover.coordination, {
    principal: newRequester,
    nowMs: 2051
  }), { accepted: true, reason: 'WRITE_AUTHORIZED' });
});

test('UT-B2-FENCE-003 renewal and release require the exact runtime, document, and tab principal', () => {
  const requester = principal('runtime-a', 'document-a', 7);
  const owner = connect(createCoordinationState(), requester, 3000);
  const impostor = principal('runtime-a', 'document-a', 8);
  const rejectedRenewal = renewLease(owner.coordination, {
    principal: impostor,
    nowMs: 3050,
    leaseDurationMs: 100
  });
  const renewed = renewLease(owner.coordination, {
    principal: requester,
    nowMs: 3050,
    leaseDurationMs: 100
  });
  const rejectedRelease = releaseOwnership(renewed.coordination, {
    principal: impostor,
    nowMs: 3051
  });
  const released = releaseOwnership(renewed.coordination, {
    principal: requester,
    nowMs: 3051
  });

  assert.equal(rejectedRenewal.reason, 'NOT_OWNER');
  assert.equal(renewed.reason, 'LEASE_RENEWED');
  assert.equal(renewed.coordination.leaseExpiry, 3150);
  assert.equal(rejectedRelease.reason, 'NOT_OWNER');
  assert.equal(released.disposition, 'RELEASED');
  assert.equal(released.coordination.ownerRuntimeId, null);
  assert.equal(released.coordination.coordinationEpoch, 1);
  assert.equal(released.coordination.fencingToken, 1);
});
