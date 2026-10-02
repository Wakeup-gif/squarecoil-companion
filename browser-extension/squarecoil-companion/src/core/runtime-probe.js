'use strict';

const { isConcreteDocumentToken } = require('./document-eligibility');

const PROBE_RESULTS = Object.freeze({
  NONE: 'NONE',
  HEALTHY_SAME_BUILD: 'HEALTHY_SAME_BUILD',
  BOOTING_SAME_BUILD: 'BOOTING_SAME_BUILD',
  DEGRADED_SAME_BUILD: 'DEGRADED_SAME_BUILD',
  RECOVERING_SAME_BUILD: 'RECOVERING_SAME_BUILD',
  FAILED_SAME_BUILD: 'FAILED_SAME_BUILD',
  VERSION_MISMATCH: 'VERSION_MISMATCH',
  LEGACY_RUNTIME: 'LEGACY_RUNTIME',
  OWNERSHIP_CONFLICT: 'OWNERSHIP_CONFLICT',
  ORPHAN_ROOT_ONLY: 'ORPHAN_ROOT_ONLY'
});

const READY_ASSERTIONS = Object.freeze([
  'oneLifecycleOwner',
  'validRuntimeIdentity',
  'oneOwnedRoot',
  'interactionReady',
  'persistenceAvailable',
  'bridgeInitialized',
  'initialObservationAttempted',
  'featureRegistryInitialized',
  'teardownRegistered',
  'coordinationPositive'
]);

function readySnapshotIsHealthy(runtime) {
  const readiness = runtime && runtime.readiness;
  if (!readiness) return false;
  if (runtime.mode !== 'ENABLED' || runtime.teardownInProgress === true) return false;
  if (!READY_ASSERTIONS.every(key => readiness[key] === true)) return false;
  if (!runtime.ui || runtime.ui.rootPresent !== true || runtime.ui.interactionReady !== true) return false;
  return true;
}

function isConcreteIdentity(value) {
  const identity = String(value || '').trim();
  return identity.length >= 8 && identity.length <= 200;
}

function classifyRuntimeProbe(probe = {}, targetBuildId, targetPackageVersion = null, targetCandidateFingerprint = null) {
  const runtime = probe.runtimeSnapshot || null;
  const runtimeGlobalPresent = probe.runtimeGlobalPresent === true;
  const runtimeGlobalReadable = probe.runtimeGlobalReadable !== false;
  const rootCount = Number(probe.rootCount || 0);
  const roots = Array.isArray(probe.roots) ? probe.roots : [];
  const hasLegacy = probe.hasLegacyRuntime === true;
  const documentToken = String(probe.documentToken || '');
  const claimPresent = probe.claimPresent === true;
  const claimReadable = probe.claimReadable !== false;
  const claim = probe.claim || null;
  const requirePackageIdentity = Boolean(targetPackageVersion);
  const requireCandidateIdentity = Boolean(targetCandidateFingerprint);

  if (runtime && hasLegacy) return PROBE_RESULTS.OWNERSHIP_CONFLICT;
  if (runtime && claimPresent) return PROBE_RESULTS.OWNERSHIP_CONFLICT;
  if (runtimeGlobalPresent && !runtimeGlobalReadable) return PROBE_RESULTS.OWNERSHIP_CONFLICT;
  if (runtime && !runtimeGlobalPresent) return PROBE_RESULTS.OWNERSHIP_CONFLICT;
  if (runtime && runtimeGlobalPresent) {
    if (!probe.runtimeBuildId) return PROBE_RESULTS.OWNERSHIP_CONFLICT;
    if (probe.runtimeBuildId !== runtime.buildId) {
      return probe.runtimeBuildId !== targetBuildId || runtime.buildId !== targetBuildId
        ? PROBE_RESULTS.VERSION_MISMATCH
        : PROBE_RESULTS.OWNERSHIP_CONFLICT;
    }
    if (probe.runtimeBuildId !== targetBuildId) return PROBE_RESULTS.VERSION_MISMATCH;
    if (requirePackageIdentity) {
      if (!probe.runtimePackageVersion || !runtime.packageVersion) return PROBE_RESULTS.OWNERSHIP_CONFLICT;
      if (probe.runtimePackageVersion !== runtime.packageVersion) {
        return probe.runtimePackageVersion !== targetPackageVersion || runtime.packageVersion !== targetPackageVersion
          ? PROBE_RESULTS.VERSION_MISMATCH
          : PROBE_RESULTS.OWNERSHIP_CONFLICT;
      }
      if (runtime.packageVersion !== targetPackageVersion) return PROBE_RESULTS.VERSION_MISMATCH;
    }
    if (requireCandidateIdentity) {
      if (!probe.runtimeCandidateFingerprint || !runtime.candidateFingerprint) return PROBE_RESULTS.OWNERSHIP_CONFLICT;
      if (probe.runtimeCandidateFingerprint !== runtime.candidateFingerprint) {
        return probe.runtimeCandidateFingerprint !== targetCandidateFingerprint || runtime.candidateFingerprint !== targetCandidateFingerprint
          ? PROBE_RESULTS.VERSION_MISMATCH
          : PROBE_RESULTS.OWNERSHIP_CONFLICT;
      }
      if (runtime.candidateFingerprint !== targetCandidateFingerprint) return PROBE_RESULTS.VERSION_MISMATCH;
    }
    if (probe.runtimeHealthReadable !== true || probe.runtimeMethodSurfaceValid !== true) {
      return PROBE_RESULTS.OWNERSHIP_CONFLICT;
    }
    if (!isConcreteIdentity(probe.runtimeInstanceId) || probe.runtimeInstanceId !== runtime.runtimeInstanceId) {
      return PROBE_RESULTS.OWNERSHIP_CONFLICT;
    }
    if (!isConcreteDocumentToken(probe.runtimeDocumentToken) || probe.runtimeDocumentToken !== documentToken || probe.runtimeDocumentToken !== runtime.documentToken) {
      return PROBE_RESULTS.OWNERSHIP_CONFLICT;
    }
  }

  if (runtime) {
    if (runtime.buildId !== targetBuildId) return PROBE_RESULTS.VERSION_MISMATCH;
    if (!isConcreteIdentity(runtime.runtimeInstanceId) || !isConcreteDocumentToken(runtime.documentToken) || runtime.documentToken !== documentToken) {
      return PROBE_RESULTS.OWNERSHIP_CONFLICT;
    }
    if (probe.runtimeInstanceId && probe.runtimeInstanceId !== runtime.runtimeInstanceId) {
      return PROBE_RESULTS.OWNERSHIP_CONFLICT;
    }
    if (rootCount > 1) return PROBE_RESULTS.OWNERSHIP_CONFLICT;

    if (rootCount === 1) {
      const root = roots[0] || {};
      if (root.rebuildOwned !== true) return PROBE_RESULTS.OWNERSHIP_CONFLICT;
      if (!isConcreteIdentity(root.runtimeInstanceId) || root.runtimeInstanceId !== runtime.runtimeInstanceId) {
        return PROBE_RESULTS.OWNERSHIP_CONFLICT;
      }
      if (!root.buildId || root.buildId !== runtime.buildId) {
        return PROBE_RESULTS.OWNERSHIP_CONFLICT;
      }
      if (requirePackageIdentity) {
        if (!root.packageVersion) return PROBE_RESULTS.OWNERSHIP_CONFLICT;
        if (root.packageVersion !== runtime.packageVersion) {
          return root.packageVersion !== targetPackageVersion || runtime.packageVersion !== targetPackageVersion
            ? PROBE_RESULTS.VERSION_MISMATCH
            : PROBE_RESULTS.OWNERSHIP_CONFLICT;
        }
      }
      if (requireCandidateIdentity) {
        if (!root.candidateFingerprint) return PROBE_RESULTS.OWNERSHIP_CONFLICT;
        if (root.candidateFingerprint !== runtime.candidateFingerprint) {
          return root.candidateFingerprint !== targetCandidateFingerprint || runtime.candidateFingerprint !== targetCandidateFingerprint
            ? PROBE_RESULTS.VERSION_MISMATCH
            : PROBE_RESULTS.OWNERSHIP_CONFLICT;
        }
      }
      if (!root.documentToken || root.documentToken !== runtime.documentToken) {
        return PROBE_RESULTS.OWNERSHIP_CONFLICT;
      }
    }

    switch (runtime.state) {
      case 'READY':
        return rootCount === 1 && readySnapshotIsHealthy(runtime)
          ? PROBE_RESULTS.HEALTHY_SAME_BUILD
          : PROBE_RESULTS.DEGRADED_SAME_BUILD;
      case 'BOOTING': return PROBE_RESULTS.BOOTING_SAME_BUILD;
      case 'DEGRADED': return PROBE_RESULTS.DEGRADED_SAME_BUILD;
      case 'RECOVERING': return PROBE_RESULTS.RECOVERING_SAME_BUILD;
      case 'FAILED': return PROBE_RESULTS.FAILED_SAME_BUILD;
      case 'UNINITIALIZED': return PROBE_RESULTS.DEGRADED_SAME_BUILD;
      default: return PROBE_RESULTS.OWNERSHIP_CONFLICT;
    }
  }

  // A present but unreadable/malformed lifecycle handle is not a fresh page.
  // Injecting beside it would be exactly the "try another runtime" behavior
  // prohibited by L1, so retain the page and require a safe reload boundary.
  if (runtimeGlobalPresent) {
    if (probe.runtimeBuildId && probe.runtimeBuildId !== targetBuildId) return PROBE_RESULTS.VERSION_MISMATCH;
    return PROBE_RESULTS.OWNERSHIP_CONFLICT;
  }

  if (hasLegacy) return PROBE_RESULTS.LEGACY_RUNTIME;

  if (claimPresent) {
    if (!claimReadable || !claim || !claim.buildId) return PROBE_RESULTS.OWNERSHIP_CONFLICT;
    if (claim.buildId !== targetBuildId) return PROBE_RESULTS.VERSION_MISMATCH;
    if (requirePackageIdentity && claim.packageVersion !== targetPackageVersion) {
      return claim.packageVersion ? PROBE_RESULTS.VERSION_MISMATCH : PROBE_RESULTS.OWNERSHIP_CONFLICT;
    }
    if (requireCandidateIdentity && claim.candidateFingerprint !== targetCandidateFingerprint) {
      return claim.candidateFingerprint ? PROBE_RESULTS.VERSION_MISMATCH : PROBE_RESULTS.OWNERSHIP_CONFLICT;
    }
    if (!isConcreteIdentity(claim.claimId) || !isConcreteIdentity(claim.runtimeInstanceId) || !isConcreteDocumentToken(claim.documentToken) || claim.documentToken !== documentToken) {
      return PROBE_RESULTS.OWNERSHIP_CONFLICT;
    }
    return rootCount === 0 ? PROBE_RESULTS.BOOTING_SAME_BUILD : PROBE_RESULTS.OWNERSHIP_CONFLICT;
  }

  if (rootCount > 1) return PROBE_RESULTS.OWNERSHIP_CONFLICT;
  if (rootCount === 1) {
    const root = roots[0] || {};
    if (root.rebuildOwned !== true || !isConcreteIdentity(root.runtimeInstanceId) || !root.buildId || !isConcreteDocumentToken(root.documentToken)) {
      return PROBE_RESULTS.OWNERSHIP_CONFLICT;
    }
    if (root.buildId !== targetBuildId) return PROBE_RESULTS.VERSION_MISMATCH;
    if (requirePackageIdentity && root.packageVersion !== targetPackageVersion) {
      return root.packageVersion ? PROBE_RESULTS.VERSION_MISMATCH : PROBE_RESULTS.OWNERSHIP_CONFLICT;
    }
    if (requireCandidateIdentity && root.candidateFingerprint !== targetCandidateFingerprint) {
      return root.candidateFingerprint ? PROBE_RESULTS.VERSION_MISMATCH : PROBE_RESULTS.OWNERSHIP_CONFLICT;
    }
    if (root.documentToken !== documentToken) return PROBE_RESULTS.OWNERSHIP_CONFLICT;
    return PROBE_RESULTS.ORPHAN_ROOT_ONLY;
  }

  return PROBE_RESULTS.NONE;
}

module.exports = { PROBE_RESULTS, READY_ASSERTIONS, readySnapshotIsHealthy, isConcreteIdentity, classifyRuntimeProbe };
