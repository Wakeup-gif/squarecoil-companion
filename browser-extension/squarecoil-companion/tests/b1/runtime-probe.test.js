'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { PROBE_RESULTS, classifyRuntimeProbe } = require('../../src/core/runtime-probe');
const { BUILD_ID } = require('../../src/core/build-identity');
const DOCUMENT_TOKEN = 'document-token-current-12345';
const PACKAGE_VERSION = '0.7.1';
const CANDIDATE_FINGERPRINT = 'a'.repeat(64);

function probe(overrides = {}) {
  const result = {
    runtimeGlobalPresent: false,
    runtimeGlobalReadable: true,
    runtimeHealthReadable: false,
    runtimeMethodSurfaceValid: false,
    runtimeBuildId: null,
    runtimePackageVersion: null,
    runtimeCandidateFingerprint: null,
    runtimeInstanceId: null,
    runtimeDocumentToken: null,
    runtimeSnapshot: null,
    documentToken: DOCUMENT_TOKEN,
    rootCount: 0,
    roots: [],
    hasLegacyRuntime: false,
    ...overrides
  };
  if (result.runtimeSnapshot) {
    if (!Object.hasOwn(overrides, 'runtimeGlobalPresent')) result.runtimeGlobalPresent = true;
    if (!Object.hasOwn(overrides, 'runtimeHealthReadable')) result.runtimeHealthReadable = true;
    if (!Object.hasOwn(overrides, 'runtimeMethodSurfaceValid')) result.runtimeMethodSurfaceValid = true;
    if (!Object.hasOwn(overrides, 'runtimeBuildId')) result.runtimeBuildId = result.runtimeSnapshot.buildId;
    if (!Object.hasOwn(overrides, 'runtimePackageVersion')) result.runtimePackageVersion = result.runtimeSnapshot.packageVersion;
    if (!Object.hasOwn(overrides, 'runtimeCandidateFingerprint')) result.runtimeCandidateFingerprint = result.runtimeSnapshot.candidateFingerprint;
    if (!Object.hasOwn(overrides, 'runtimeInstanceId')) result.runtimeInstanceId = result.runtimeSnapshot.runtimeInstanceId;
    if (!Object.hasOwn(overrides, 'runtimeDocumentToken')) result.runtimeDocumentToken = result.runtimeSnapshot.documentToken;
  }
  return result;
}

function readyRuntime(overrides = {}) {
  return {
    buildId: BUILD_ID,
    packageVersion: PACKAGE_VERSION,
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    state: 'READY',
    mode: 'ENABLED',
    teardownInProgress: false,
    runtimeInstanceId: 'runtime-current-12345',
    documentToken: DOCUMENT_TOKEN,
    readiness: {
      oneLifecycleOwner: true,
      validRuntimeIdentity: true,
      oneOwnedRoot: true,
      interactionReady: true,
      persistenceAvailable: true,
      bridgeInitialized: true,
      initialObservationAttempted: true,
      featureRegistryInitialized: true,
      teardownRegistered: true,
      coordinationPositive: true
    },
    ui: { rootPresent: true, interactionReady: true },
    ...overrides
  };
}

function ownedRoot(overrides = {}) {
  return {
    rebuildOwned: true,
    runtimeInstanceId: 'runtime-current-12345',
    buildId: BUILD_ID,
    packageVersion: PACKAGE_VERSION,
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    documentToken: DOCUMENT_TOKEN,
    ...overrides
  };
}

test('package version and candidate fingerprint drift require a reload boundary', () => {
  const current = readyRuntime();
  const currentProbe = probe({ runtimeSnapshot: current, rootCount: 1, roots: [ownedRoot()] });
  assert.equal(
    classifyRuntimeProbe(currentProbe, BUILD_ID, '0.7.2', CANDIDATE_FINGERPRINT),
    PROBE_RESULTS.VERSION_MISMATCH
  );
  assert.equal(
    classifyRuntimeProbe(currentProbe, BUILD_ID, PACKAGE_VERSION, 'b'.repeat(64)),
    PROBE_RESULTS.VERSION_MISMATCH
  );
});

test('fresh page classifies NONE', () => {
  assert.equal(classifyRuntimeProbe(probe(), BUILD_ID), PROBE_RESULTS.NONE);
});

test('legacy timer globals classify LEGACY_RUNTIME', () => {
  assert.equal(classifyRuntimeProbe(probe({ hasLegacyRuntime: true }), BUILD_ID), PROBE_RESULTS.LEGACY_RUNTIME);
});

test('one unowned rebuild root classifies ORPHAN_ROOT_ONLY', () => {
  assert.equal(classifyRuntimeProbe(probe({
    rootCount: 1,
    roots: [{ rebuildOwned: true, runtimeInstanceId: 'old-runtime', buildId: BUILD_ID, documentToken: DOCUMENT_TOKEN }]
  }), BUILD_ID), PROBE_RESULTS.ORPHAN_ROOT_ONLY);
});

test('foreign root without lifecycle owner is an ownership conflict', () => {
  assert.equal(classifyRuntimeProbe(probe({
    rootCount: 1,
    roots: [{ rebuildOwned: false }]
  }), BUILD_ID), PROBE_RESULTS.OWNERSHIP_CONFLICT);
});

test('orphan recovery requires concrete current-build and current-document ownership proof', () => {
  assert.equal(classifyRuntimeProbe(probe({
    rootCount: 1,
    roots: [{ rebuildOwned: true, runtimeInstanceId: null, buildId: BUILD_ID, documentToken: DOCUMENT_TOKEN }]
  }), BUILD_ID), PROBE_RESULTS.OWNERSHIP_CONFLICT);
  assert.equal(classifyRuntimeProbe(probe({
    rootCount: 1,
    roots: [{ rebuildOwned: true, runtimeInstanceId: 'x', buildId: BUILD_ID, documentToken: DOCUMENT_TOKEN }]
  }), BUILD_ID), PROBE_RESULTS.OWNERSHIP_CONFLICT);
  assert.equal(classifyRuntimeProbe(probe({
    rootCount: 1,
    roots: [{ rebuildOwned: true, runtimeInstanceId: 'old-runtime', buildId: 'other-build', documentToken: DOCUMENT_TOKEN }]
  }), BUILD_ID), PROBE_RESULTS.VERSION_MISMATCH);
  assert.equal(classifyRuntimeProbe(probe({
    rootCount: 1,
    roots: [{ rebuildOwned: true, runtimeInstanceId: 'old-runtime', buildId: BUILD_ID, documentToken: 'other-document-token-12345' }]
  }), BUILD_ID), PROBE_RESULTS.OWNERSHIP_CONFLICT);
});

test('a valid same-document injection claim is BOOTING and malformed claims are conflicts', () => {
  assert.equal(classifyRuntimeProbe(probe({
    claimPresent: true,
    claimReadable: true,
    claim: {
      claimId: 'claim-current-12345',
      buildId: BUILD_ID,
      runtimeInstanceId: 'runtime-current-12345',
      documentToken: DOCUMENT_TOKEN
    }
  }), BUILD_ID), PROBE_RESULTS.BOOTING_SAME_BUILD);
  assert.equal(classifyRuntimeProbe(probe({ claimPresent: true, claimReadable: false }), BUILD_ID), PROBE_RESULTS.OWNERSHIP_CONFLICT);
  assert.equal(classifyRuntimeProbe(probe({
    claimPresent: true,
    claimReadable: true,
    claim: { claimId: 'claim-current-12345', buildId: 'other-build', runtimeInstanceId: 'runtime-current-12345', documentToken: DOCUMENT_TOKEN }
  }), BUILD_ID), PROBE_RESULTS.VERSION_MISMATCH);
});

test('present but unreadable runtime global is an ownership conflict, not a fresh page', () => {
  assert.equal(classifyRuntimeProbe(probe({
    runtimeGlobalPresent: true,
    runtimeBuildId: BUILD_ID
  }), BUILD_ID), PROBE_RESULTS.OWNERSHIP_CONFLICT);
});

test('unreadable runtime global from another build still requires version transition', () => {
  assert.equal(classifyRuntimeProbe(probe({
    runtimeGlobalPresent: true,
    runtimeBuildId: 'other-build'
  }), BUILD_ID), PROBE_RESULTS.VERSION_MISMATCH);
});

test('runtime global identity must agree with its health snapshot identity', () => {
  assert.equal(classifyRuntimeProbe(probe({
    runtimeGlobalPresent: true,
    runtimeBuildId: 'other-build',
    runtimeSnapshot: readyRuntime(),
    rootCount: 1,
    roots: [ownedRoot()]
  }), BUILD_ID), PROBE_RESULTS.VERSION_MISMATCH);
  assert.equal(classifyRuntimeProbe(probe({
    runtimeGlobalPresent: true,
    runtimeBuildId: null,
    runtimeSnapshot: readyRuntime(),
    rootCount: 1,
    roots: [ownedRoot()]
  }), BUILD_ID), PROBE_RESULTS.OWNERSHIP_CONFLICT);
});

test('runtime handle identity and callable surface must agree with the health snapshot', () => {
  assert.equal(classifyRuntimeProbe(probe({
    runtimeSnapshot: readyRuntime(),
    runtimeDocumentToken: 'different-document-token-12345',
    rootCount: 1,
    roots: [ownedRoot()]
  }), BUILD_ID), PROBE_RESULTS.OWNERSHIP_CONFLICT);
  assert.equal(classifyRuntimeProbe(probe({
    runtimeSnapshot: readyRuntime(),
    runtimeMethodSurfaceValid: false,
    rootCount: 1,
    roots: [ownedRoot()]
  }), BUILD_ID), PROBE_RESULTS.OWNERSHIP_CONFLICT);
});

test('same build READY runtime with complete readiness and live interaction is healthy', () => {
  assert.equal(classifyRuntimeProbe(probe({
    runtimeSnapshot: readyRuntime(),
    rootCount: 1,
    roots: [ownedRoot()]
  }), BUILD_ID), PROBE_RESULTS.HEALTHY_SAME_BUILD);
});

test('visible READY root with dead interaction is degraded, never healthy', () => {
  assert.equal(classifyRuntimeProbe(probe({
    runtimeSnapshot: readyRuntime({ ui: { rootPresent: true, interactionReady: false } }),
    rootCount: 1,
    roots: [ownedRoot()]
  }), BUILD_ID), PROBE_RESULTS.DEGRADED_SAME_BUILD);
});

test('READY snapshot cannot remain healthy after teardown begins', () => {
  assert.equal(classifyRuntimeProbe(probe({
    runtimeSnapshot: readyRuntime({ teardownInProgress: true }),
    rootCount: 1,
    roots: [ownedRoot()]
  }), BUILD_ID), PROBE_RESULTS.DEGRADED_SAME_BUILD);
});

test('READY snapshot cannot remain healthy while runtime mode is disabled', () => {
  assert.equal(classifyRuntimeProbe(probe({
    runtimeSnapshot: readyRuntime({ mode: 'DISABLED' }),
    rootCount: 1,
    roots: [ownedRoot()]
  }), BUILD_ID), PROBE_RESULTS.DEGRADED_SAME_BUILD);
});

test('READY label without complete readiness assertions is degraded', () => {
  const runtime = readyRuntime();
  runtime.readiness.coordinationPositive = false;
  assert.equal(classifyRuntimeProbe(probe({
    runtimeSnapshot: runtime,
    rootCount: 1,
    roots: [ownedRoot()]
  }), BUILD_ID), PROBE_RESULTS.DEGRADED_SAME_BUILD);
});

test('same build DEGRADED runtime is reused rather than reinjected', () => {
  assert.equal(classifyRuntimeProbe(probe({
    runtimeSnapshot: { buildId: BUILD_ID, state: 'DEGRADED', runtimeInstanceId: 'runtime-current-12345', documentToken: DOCUMENT_TOKEN },
    rootCount: 1,
    roots: [ownedRoot()]
  }), BUILD_ID), PROBE_RESULTS.DEGRADED_SAME_BUILD);
});

test('different rebuild build requires version-mismatch handling', () => {
  assert.equal(classifyRuntimeProbe(probe({
    runtimeSnapshot: { buildId: 'other-build', state: 'READY', runtimeInstanceId: 'runtime-current-12345', documentToken: DOCUMENT_TOKEN },
    rootCount: 1,
    roots: [ownedRoot()]
  }), BUILD_ID), PROBE_RESULTS.VERSION_MISMATCH);
});

test('runtime/root ownership mismatch is conflict', () => {
  assert.equal(classifyRuntimeProbe(probe({
    runtimeSnapshot: readyRuntime(),
    rootCount: 1,
    roots: [ownedRoot({ runtimeInstanceId: 'runtime-different-12345' })]
  }), BUILD_ID), PROBE_RESULTS.OWNERSHIP_CONFLICT);
});

test('runtime root missing ownership metadata is conflict', () => {
  assert.equal(classifyRuntimeProbe(probe({
    runtimeSnapshot: readyRuntime(),
    rootCount: 1,
    roots: [{ rebuildOwned: true, runtimeInstanceId: null, buildId: null }]
  }), BUILD_ID), PROBE_RESULTS.OWNERSHIP_CONFLICT);
});

test('duplicate roots are conflict even when a runtime exists', () => {
  assert.equal(classifyRuntimeProbe(probe({
    runtimeSnapshot: readyRuntime(),
    rootCount: 2,
    roots: [ownedRoot(), ownedRoot()]
  }), BUILD_ID), PROBE_RESULTS.OWNERSHIP_CONFLICT);
});

test('UNINITIALIZED runtime global is not mistaken for a fresh page', () => {
  assert.equal(classifyRuntimeProbe(probe({
    runtimeSnapshot: { buildId: BUILD_ID, state: 'UNINITIALIZED', runtimeInstanceId: 'runtime-current-12345', documentToken: DOCUMENT_TOKEN },
    rootCount: 0
  }), BUILD_ID), PROBE_RESULTS.DEGRADED_SAME_BUILD);
});
