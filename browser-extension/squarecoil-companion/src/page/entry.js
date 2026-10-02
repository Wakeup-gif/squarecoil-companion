'use strict';

const { createLifecycleController, MODES } = require('../core/lifecycle');
const { createFeatureRegistry } = require('../core/feature-registry');
const { BUILD_ID, BUILD_STAGE, CANDIDATE_FINGERPRINT } = require('../core/build-identity');
const {
  DOCUMENT_TOKEN_DATASET_KEY,
  isSupportedTopLevelContext,
  isConcreteDocumentToken
} = require('../core/document-eligibility');
const { createRuntimeUi } = require('../platform/runtime-ui');
const { createBridgeShell } = require('../squarecoil/bridge-shell');
const {
  AUTHORITY_PROTOCOL_VERSION,
  KERNEL_ONLY_DISPOSITION
} = require('../extension/authority-protocol');

const GLOBAL_KEY = '__squareCoilCompanionRuntime';
const BOOTSTRAP_KEY = '__squareCoilCompanionBootstrap';
const CLAIM_KEY = '__squareCoilCompanionInjectionClaim';
const EXPECTED_B1_DEGRADED_REASON = 'coordination-not-implemented-b1';
const HEALTH_MONITOR_INTERVAL_MS = 1000;

function isConcreteIdentity(value) {
  const normalized = String(value || '').trim();
  return normalized.length >= 8 && normalized.length <= 200;
}

function readWindowProperty(key) {
  try {
    return {
      present: Object.prototype.hasOwnProperty.call(window, key),
      readable: true,
      value: window[key]
    };
  } catch (error) {
    return { present: true, readable: false, value: null, error };
  }
}

function isValidRuntimeHandle(value, documentToken, expectedPackageVersion = null) {
  return Boolean(
    value &&
    value.buildId === BUILD_ID &&
    String(value.packageVersion || '').length > 0 &&
    (!expectedPackageVersion || value.packageVersion === expectedPackageVersion) &&
    value.candidateFingerprint === CANDIDATE_FINGERPRINT &&
    value.documentToken === documentToken &&
    isConcreteIdentity(value.runtimeInstanceId) &&
    ['boot', 'revalidate', 'recover', 'teardown', 'retryTeardown', 'setEnabled', 'getHealth']
      .every(name => typeof value[name] === 'function')
  );
}

(function startCompanionRuntime() {
  if (!isSupportedTopLevelContext(window)) {
    document.documentElement.dataset.squarecoilCompanionControllerReason = 'unsupported-document';
    return;
  }

  const documentToken = String(document.documentElement.dataset[DOCUMENT_TOKEN_DATASET_KEY] || '');
  if (!isConcreteDocumentToken(documentToken)) {
    document.documentElement.dataset.squarecoilCompanionReloadRequired = 'document-identity-missing';
    return;
  }
  const claimResult = readWindowProperty(CLAIM_KEY);
  const bootstrapResult = readWindowProperty(BOOTSTRAP_KEY);
  const claim = claimResult.readable ? claimResult.value : null;
  const bootstrap = bootstrapResult.readable ? bootstrapResult.value : null;
  const bootstrapPackageVersion = bootstrap?.packageVersion ? String(bootstrap.packageVersion) : null;

  const existingResult = readWindowProperty(GLOBAL_KEY);
  if (existingResult.present) {
    if (existingResult.readable && isValidRuntimeHandle(existingResult.value, documentToken, bootstrapPackageVersion)) return;
    const existingBuild = existingResult.readable && existingResult.value && existingResult.value.buildId;
    document.documentElement.dataset.squarecoilCompanionReloadRequired =
      existingBuild && existingBuild !== BUILD_ID ? 'version-mismatch' : 'ownership-conflict';
    return;
  }

  const packageVersion = String(bootstrapPackageVersion || '0.0.0');

  const validClaim = Boolean(
    claimResult.present &&
    claim &&
    claim.buildId === BUILD_ID &&
    claim.packageVersion === packageVersion &&
    claim.candidateFingerprint === CANDIDATE_FINGERPRINT &&
    claim.documentToken === documentToken &&
    isConcreteIdentity(claim.claimId) &&
    isConcreteIdentity(claim.runtimeInstanceId)
  );
  const validBootstrap = Boolean(
    bootstrapResult.present &&
    bootstrap &&
    bootstrap.buildId === BUILD_ID &&
    bootstrap.packageVersion === packageVersion &&
    bootstrap.candidateFingerprint === CANDIDATE_FINGERPRINT &&
    bootstrap.documentToken === documentToken &&
    bootstrap.claimId === claim?.claimId &&
    bootstrap.runtimeInstanceId === claim?.runtimeInstanceId &&
    bootstrap.enabled === true
  );
  if (!validClaim || !validBootstrap) {
    document.documentElement.dataset.squarecoilCompanionReloadRequired = 'bootstrap-ownership-conflict';
    return;
  }

  const runtimeInstanceId = String(claim.runtimeInstanceId);
  const claimId = String(claim.claimId);
  const ui = createRuntimeUi({
    document,
    runtimeInstanceId,
    buildId: BUILD_ID,
    packageVersion,
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    documentToken
  });
  const bridge = createBridgeShell();
  const registry = createFeatureRegistry();
  const authorityTransportEnabled = bootstrap.authorityTransportEnabled === true &&
    bootstrap.authorityProtocolVersion === AUTHORITY_PROTOCOL_VERSION;

  let pageShowBound = false;
  let healthObserver = null;
  let healthInterval = null;
  let monitorScheduled = false;
  let selfRetirementPromise = null;
  let runtime = null;
  let lifecycle = null;
  let claimReleaseFailed = false;
  function readRootOwnership() {
    const roots = [...document.querySelectorAll('#ussign-job-timer')];
    for (const marked of document.querySelectorAll('[data-squarecoil-companion-root="rebuild"]')) {
      if (!roots.includes(marked)) roots.push(marked);
    }
    const owned = roots.length === 1 &&
      roots[0].id === 'ussign-job-timer' &&
      roots[0].dataset.squarecoilCompanionRoot === 'rebuild' &&
      roots[0].dataset.runtimeInstanceId === runtimeInstanceId &&
      roots[0].dataset.buildId === BUILD_ID &&
      roots[0].dataset.packageVersion === packageVersion &&
      roots[0].dataset.candidateFingerprint === CANDIDATE_FINGERPRINT &&
      roots[0].dataset.documentToken === documentToken;
    return { rootCount: roots.length, owned };
  }

  function installRetirementFence() {
    const currentClaim = readWindowProperty(CLAIM_KEY);
    if (!currentClaim.readable) return false;
    if (currentClaim.present && currentClaim.value !== claim) return false;
    if (!currentClaim.present) {
      try { window[CLAIM_KEY] = claim; } catch (_) { return false; }
    }
    const verified = readWindowProperty(CLAIM_KEY);
    return verified.readable && verified.present && verified.value === claim;
  }

  function retireUnreachableRuntime(reason) {
    if (selfRetirementPromise || !runtime) return;
    const fenced = installRetirementFence();
    document.documentElement.dataset.squarecoilCompanionReloadRequired = fenced
      ? reason
      : 'ownership-conflict';
    selfRetirementPromise = runtime.teardown(reason).catch(error => {
      document.documentElement.dataset.squarecoilCompanionBootError =
        String(error && (error.message || error) || 'self-retirement-failed');
    });
  }

  function onPageShow(event) {
    if (!event || event.persisted !== true || !runtime) return;
    runtime.revalidate().catch(() => {});
  }

  function monitorState() {
    if (!runtime) return 'IGNORE';
    const current = runtime.getHealth();
    if (current.teardownInProgress === true || current.state === 'UNINITIALIZED') return 'IGNORE';
    if (current.state === 'FAILED') {
      return current.outstandingResources?.length ? 'OWNERSHIP_ONLY' : 'IGNORE';
    }
    return current.mode === MODES.ENABLED ? 'ACTIVE' : 'OWNERSHIP_ONLY';
  }

  function scheduleHealthRevalidation() {
    if (monitorScheduled || selfRetirementPromise) return;
    const currentMonitorState = monitorState();
    if (currentMonitorState === 'IGNORE') return;
    const currentRuntime = readWindowProperty(GLOBAL_KEY);
    if (!currentRuntime.readable || !currentRuntime.present || currentRuntime.value !== runtime) {
      retireUnreachableRuntime('runtime-ownership-lost');
      return;
    }
    if (currentMonitorState !== 'ACTIVE') return;
    const currentUi = ui.snapshot();
    const currentOwnership = readRootOwnership();
    if (currentUi.rootPresent && currentUi.interactionReady && currentOwnership.owned) return;
    monitorScheduled = true;
    queueMicrotask(() => {
      monitorScheduled = false;
      const latestMonitorState = monitorState();
      if (latestMonitorState === 'IGNORE') return;
      const latestRuntime = readWindowProperty(GLOBAL_KEY);
      if (!latestRuntime.readable || !latestRuntime.present || latestRuntime.value !== runtime) {
        retireUnreachableRuntime('runtime-ownership-lost');
        return;
      }
      if (latestMonitorState !== 'ACTIVE') return;
      const latestUi = ui.snapshot();
      const latestOwnership = readRootOwnership();
      if (latestUi.rootPresent && latestUi.interactionReady && latestOwnership.owned) return;
      runtime.revalidate().catch(() => {});
    });
  }

  registry.register('page-lifecycle-events', {
    initialize: async () => {
      if (!pageShowBound) {
        window.addEventListener('pageshow', onPageShow);
        pageShowBound = true;
      }
    },
    teardown: async () => {
      if (pageShowBound) window.removeEventListener('pageshow', onPageShow);
      pageShowBound = false;
    }
  });

  registry.register('runtime-health-monitor', {
    initialize: async () => {
      if (!healthObserver) {
        healthObserver = new MutationObserver(scheduleHealthRevalidation);
        healthObserver.observe(document.documentElement, {
          childList: true,
          subtree: true,
          attributes: true,
          attributeFilter: ['id', 'data-squarecoil-companion-root', 'data-runtime-instance-id', 'data-build-id', 'data-package-version', 'data-candidate-fingerprint', 'data-document-token']
        });
      }
      if (healthInterval === null) {
        healthInterval = window.setInterval(scheduleHealthRevalidation, HEALTH_MONITOR_INTERVAL_MS);
      }
    },
    teardown: async () => {
      if (healthObserver) {
        healthObserver.disconnect();
        healthObserver = null;
      }
      if (healthInterval !== null) {
        window.clearInterval(healthInterval);
        healthInterval = null;
      }
      monitorScheduled = false;
    }
  });

  const ownership = {
    ensure: async () => {
      if (claimReleaseFailed) throw new Error('ownership-conflict:injection-claim-release-failed');
      return {
        oneOwner: Boolean(
          runtime &&
          window[GLOBAL_KEY] === runtime &&
          runtime.runtimeInstanceId === runtimeInstanceId &&
          runtime.documentToken === documentToken &&
          runtime.buildId === BUILD_ID &&
          runtime.packageVersion === packageVersion &&
          runtime.candidateFingerprint === CANDIDATE_FINGERPRINT
        )
      };
    },
    teardown: async () => {
      const releaseMarker = (key, expected, label) => {
        const property = readWindowProperty(key);
        if (!property.readable) throw new Error(`${label}-unreadable`);
        if (!property.present) return;
        if (property.value !== expected) throw new Error(`ownership-conflict:different-${label}`);
        let deleted = false;
        try { deleted = delete window[key]; } catch (error) { throw new Error(`${label}-delete-failed:${String(error?.message || error)}`); }
        if (!deleted || readWindowProperty(key).present) throw new Error(`${label}-delete-failed`);
      };

      releaseMarker(BOOTSTRAP_KEY, bootstrap, 'bootstrap-marker');
      releaseMarker(CLAIM_KEY, claim, 'injection-claim');
      const currentResult = readWindowProperty(GLOBAL_KEY);
      if (!currentResult.readable) throw new Error('runtime-global-unreadable');
      if (!currentResult.present) return;
      if (currentResult.value !== runtime) throw new Error('ownership-conflict:different-runtime-global');
      let deleted = false;
      try { deleted = delete window[GLOBAL_KEY]; } catch (error) { throw new Error(`runtime-global-delete-failed:${String(error?.message || error)}`); }
      if (!deleted || readWindowProperty(GLOBAL_KEY).present) throw new Error('runtime-global-delete-failed');
    }
  };

  const persistence = {
    ensure: async () => ({ available: bootstrap.persistenceAvailable === true }),
    teardown: async () => {}
  };

  // Authority ownership lives in the isolated content controller. MAIN-world
  // lifecycle code receives only this non-positive stage marker; it cannot
  // create, heartbeat, mutate, or release an authoritative worker session.
  const coordination = {
    ensure: async () => ({
      disposition: authorityTransportEnabled
        ? KERNEL_ONLY_DISPOSITION
        : (bootstrap.coordinationDisposition || 'UNAVAILABLE_B1')
    }),
    teardown: async () => {}
  };

  lifecycle = createLifecycleController({
    runtimeInstanceId,
    buildId: BUILD_ID,
    packageVersion,
    initiallyOwnedAdapters: ['ownership'],
    adapters: {
      ownership,
      persistence,
      ui,
      features: registry,
      bridge,
      coordination
    },
    onTransition: snapshot => ui.setLifecycle(snapshot)
  });

  async function recoverIfNeeded(result) {
    if (result?.state !== 'DEGRADED') return result;
    const currentUi = ui.snapshot();
    const expectedCoordinationOnly = result.reason === EXPECTED_B1_DEGRADED_REASON &&
      currentUi.rootPresent === true &&
      currentUi.interactionReady === true;
    if (expectedCoordinationOnly) return result;
    return lifecycle.recover();
  }

  async function boot() {
    let result = await lifecycle.boot();
    result = await recoverIfNeeded(result);
    ui.setLifecycle(result);
    return getHealth();
  }

  async function revalidate() {
    let result = await lifecycle.revalidate();
    result = await recoverIfNeeded(result);
    ui.setLifecycle(result);
    return getHealth();
  }

  async function recover() {
    const result = await lifecycle.recover();
    ui.setLifecycle(result);
    return getHealth();
  }

  async function teardown(reason = 'teardown-complete') {
    const result = await lifecycle.teardown(reason);
    ui.setLifecycle(result);
    return getHealth();
  }

  async function retryTeardown() {
    const result = await lifecycle.retryTeardown();
    ui.setLifecycle(result);
    return getHealth();
  }

  async function setEnabled(enabled) {
    const result = await lifecycle.setMode(enabled ? MODES.ENABLED : MODES.DISABLED);
    ui.setLifecycle(result);
    return getHealth();
  }

  function getHealth() {
    return {
      ...lifecycle.snapshot(),
      buildStage: BUILD_STAGE,
      candidateFingerprint: CANDIDATE_FINGERPRINT,
      documentToken,
      claimId,
      ui: ui.snapshot(),
      bridge: bridge.snapshot(),
      authority: {
        kernelTransportAvailable: authorityTransportEnabled,
        connectionHealthOwnedBy: 'ISOLATED_CONTENT',
        enabled: authorityTransportEnabled,
        healthy: false,
        disposition: authorityTransportEnabled
          ? KERNEL_ONLY_DISPOSITION
          : (bootstrap.coordinationDisposition || 'UNAVAILABLE_B1')
      }
    };
  }

  runtime = Object.freeze({
    buildId: BUILD_ID,
    candidateFingerprint: CANDIDATE_FINGERPRINT,
    runtimeInstanceId,
    documentToken,
    claimId,
    packageVersion,
    boot,
    revalidate,
    recover,
    teardown,
    retryTeardown,
    setEnabled,
    getHealth
  });

  window[GLOBAL_KEY] = runtime;
  try {
    if (window[BOOTSTRAP_KEY] === bootstrap) delete window[BOOTSTRAP_KEY];
    if (window[CLAIM_KEY] === claim) delete window[CLAIM_KEY];
    claimReleaseFailed = readWindowProperty(BOOTSTRAP_KEY).present || readWindowProperty(CLAIM_KEY).present;
  } catch (_) {
    claimReleaseFailed = true;
  }

  boot().catch(error => {
    document.documentElement.dataset.squarecoilCompanionBootError = String(error && (error.message || error) || 'boot-error');
  });
})();
