'use strict';

const STATES = Object.freeze({
  UNINITIALIZED: 'UNINITIALIZED',
  BOOTING: 'BOOTING',
  READY: 'READY',
  DEGRADED: 'DEGRADED',
  RECOVERING: 'RECOVERING',
  FAILED: 'FAILED'
});

const MODES = Object.freeze({ ENABLED: 'ENABLED', DISABLED: 'DISABLED' });
const POSITIVE_COORDINATION = new Set(['OWNER', 'OBSERVER_CONNECTED']);
const DEFAULT_RECOVERY_DELAYS = Object.freeze([250, 1000, 3000]);
const CORE_ACQUIRE_ORDER = Object.freeze([
  'ownership',
  'persistence',
  'ui',
  'features',
  'bridge',
  'coordination'
]);
const CORE_TEARDOWN_ORDER = Object.freeze([
  'coordination',
  'bridge',
  'features',
  'ui',
  'persistence'
]);

function errorMessage(error) {
  return String(error && (error.message || error) || 'unknown-error');
}

function isReloadRequiredReason(value) {
  return /reload-required|ownership-conflict|version-mismatch|legacy-runtime|teardown-incomplete/.test(String(value || ''));
}

function classifyCapabilityError(error, fallbackReason) {
  const message = errorMessage(error);
  const normalized = message.toLowerCase();
  if (normalized.includes('ownership-conflict') || normalized.includes('duplicate-runtime')) {
    return { state: STATES.FAILED, reason: 'ownership-conflict', error };
  }
  if (normalized.includes('version-mismatch')) {
    return { state: STATES.FAILED, reason: 'version-mismatch-reload-required', error };
  }
  if (normalized.includes('legacy-runtime')) {
    return { state: STATES.FAILED, reason: 'legacy-runtime-reload-required', error };
  }
  return { state: STATES.DEGRADED, reason: fallbackReason, error };
}

function isConcreteIdentity(value, unknownValue) {
  const normalized = String(value || '').trim();
  return Boolean(normalized && normalized !== unknownValue);
}

function createLifecycleController(options = {}) {
  const runtimeInstanceId = String(options.runtimeInstanceId || 'runtime-unknown');
  const buildId = String(options.buildId || 'build-unknown');
  const packageVersion = String(options.packageVersion || '0.0.0');
  const adapters = options.adapters || {};
  const sleep = options.sleep || (ms => new Promise(resolve => setTimeout(resolve, ms)));
  const recoveryDelays = Array.isArray(options.recoveryDelays) && options.recoveryDelays.length
    ? options.recoveryDelays.slice(0, 3)
    : DEFAULT_RECOVERY_DELAYS.slice();
  const outstandingAdapters = new Set(
    (Array.isArray(options.initiallyOwnedAdapters) ? options.initiallyOwnedAdapters : [])
      .filter(name => CORE_ACQUIRE_ORDER.includes(name))
  );

  let mode = MODES.ENABLED;
  let state = STATES.UNINITIALIZED;
  let reason = 'not-started';
  let readiness = null;
  let lastError = null;
  let bootPromise = null;
  let recoveryPromise = null;
  let teardownPromise = null;
  let readinessPromise = null;
  let teardownComplete = false;
  let teardownRequested = false;
  let recoveryAttempt = 0;
  let operationEpoch = 0;

  function transition(nextState, nextReason, error = null) {
    state = nextState;
    reason = String(nextReason || '').trim() || nextState.toLowerCase();
    lastError = error ? errorMessage(error) : null;
    if (typeof options.onTransition === 'function') options.onTransition(snapshot());
  }

  function orderedOutstandingResources() {
    return CORE_ACQUIRE_ORDER.filter(name => outstandingAdapters.has(name));
  }

  function hasIncompleteTeardown() {
    return state === STATES.FAILED && reason === 'teardown-incomplete';
  }

  function snapshot() {
    return {
      buildId,
      packageVersion,
      runtimeInstanceId,
      mode,
      state,
      reason,
      lastError,
      recoveryAttempt,
      teardownInProgress: Boolean(teardownPromise || teardownRequested),
      cleanupRequired: hasIncompleteTeardown(),
      outstandingResources: orderedOutstandingResources(),
      readiness: readiness ? { ...readiness } : null
    };
  }

  function firstReadinessFailure(assertions) {
    const order = [
      ['oneLifecycleOwner', 'lifecycle-owner-unconfirmed'],
      ['validRuntimeIdentity', 'runtime-identity-invalid'],
      ['persistenceAvailable', 'persistence-unavailable'],
      ['oneOwnedRoot', 'timer-root-unavailable'],
      ['interactionReady', 'interaction-init-failed'],
      ['bridgeInitialized', 'bridge-init-failed'],
      ['initialObservationAttempted', 'bridge-initial-observation-missing'],
      ['featureRegistryInitialized', 'feature-registry-init-failed'],
      ['teardownRegistered', 'teardown-unregistered'],
      ['coordinationPositive', 'coordination-not-implemented-b1']
    ];
    for (const [key, code] of order) {
      if (!assertions[key]) return code;
    }
    return 'readiness-failed';
  }

  function operationStillCurrent(epoch) {
    return epoch === operationEpoch && !teardownRequested && mode === MODES.ENABLED;
  }

  function acquisitionContext(epoch) {
    return Object.freeze({
      epoch,
      isCancelled: () => !operationStillCurrent(epoch)
    });
  }

  function adapterContract() {
    const missingEnsure = [];
    const missingTeardown = [];
    for (const name of CORE_ACQUIRE_ORDER) {
      const adapter = adapters[name];
      if (!adapter || typeof adapter.ensure !== 'function') missingEnsure.push(name);
      if (!adapter || typeof adapter.teardown !== 'function') missingTeardown.push(name);
    }
    const missingObservation = !adapters.bridge || typeof adapters.bridge.observeInitial !== 'function';
    return { missingEnsure, missingTeardown, missingObservation };
  }

  async function acquire(name, epoch) {
    if (!operationStillCurrent(epoch)) return { cancelled: true, value: null };
    const adapter = adapters[name];
    outstandingAdapters.add(name);
    const value = await adapter.ensure(acquisitionContext(epoch));
    if (!operationStillCurrent(epoch)) return { cancelled: true, value };
    return { cancelled: false, value };
  }

  async function observeBridge(epoch) {
    if (!operationStillCurrent(epoch)) return { cancelled: true, value: null };
    const value = await adapters.bridge.observeInitial(acquisitionContext(epoch));
    if (!operationStillCurrent(epoch)) return { cancelled: true, value };
    return { cancelled: false, value };
  }

  function cancelledReadiness() {
    return { ok: false, cancelled: true, reason: 'operation-cancelled', readiness: readiness ? { ...readiness } : null };
  }

  async function evaluateReadiness(epoch) {
    if (readinessPromise) return readinessPromise;

    const task = (async () => {
      const contract = adapterContract();
      if (contract.missingTeardown.length) {
        readiness = {
          oneLifecycleOwner: false,
          validRuntimeIdentity: isConcreteIdentity(runtimeInstanceId, 'runtime-unknown') && isConcreteIdentity(buildId, 'build-unknown'),
          oneOwnedRoot: false,
          interactionReady: false,
          persistenceAvailable: false,
          bridgeInitialized: false,
          initialObservationAttempted: false,
          featureRegistryInitialized: false,
          teardownRegistered: false,
          coordinationPositive: false,
          coordinationDisposition: 'UNAVAILABLE',
          bridgeObservation: 'STATE_UNKNOWN',
          missingTeardown: contract.missingTeardown.slice()
        };
        return { ok: false, reason: 'teardown-unregistered', readiness: { ...readiness } };
      }
      if (contract.missingEnsure.length) {
        throw new Error(`core-adapter-ensure-unregistered:${contract.missingEnsure.join(',')}`);
      }
      if (contract.missingObservation) {
        throw new Error('bridge-initial-observation-unregistered');
      }

      const ownershipStep = await acquire('ownership', epoch);
      if (ownershipStep.cancelled) return cancelledReadiness();
      const persistenceStep = await acquire('persistence', epoch);
      if (persistenceStep.cancelled) return cancelledReadiness();
      const uiStep = await acquire('ui', epoch);
      if (uiStep.cancelled) return cancelledReadiness();
      const featuresStep = await acquire('features', epoch);
      if (featuresStep.cancelled || featuresStep.value?.cancelled) return cancelledReadiness();
      const bridgeStep = await acquire('bridge', epoch);
      if (bridgeStep.cancelled) return cancelledReadiness();
      const observationStep = await observeBridge(epoch);
      if (observationStep.cancelled) return cancelledReadiness();
      const coordinationStep = await acquire('coordination', epoch);
      if (coordinationStep.cancelled) return cancelledReadiness();

      const ownership = ownershipStep.value;
      const persistence = persistenceStep.value;
      const ui = uiStep.value;
      const features = featuresStep.value;
      const bridge = bridgeStep.value;
      const observation = observationStep.value;
      const coordination = coordinationStep.value;
      const assertions = {
        oneLifecycleOwner: ownership && ownership.oneOwner === true,
        validRuntimeIdentity: isConcreteIdentity(runtimeInstanceId, 'runtime-unknown') && isConcreteIdentity(buildId, 'build-unknown'),
        oneOwnedRoot: Number(ui && ui.rootCount) === 1 && ui && ui.owned === true,
        interactionReady: ui && ui.interactionReady === true,
        persistenceAvailable: persistence && persistence.available === true,
        bridgeInitialized: bridge && bridge.initialized === true,
        initialObservationAttempted: observation && observation.attempted === true,
        featureRegistryInitialized: features && features.initialized === true,
        teardownRegistered: Boolean(
          ui && ui.teardownRegistered === true &&
          bridge && bridge.teardownRegistered === true &&
          features && features.teardownRegistered === true
        ),
        coordinationPositive: POSITIVE_COORDINATION.has(coordination && coordination.disposition)
      };

      readiness = {
        ...assertions,
        coordinationDisposition: coordination && coordination.disposition || 'UNAVAILABLE',
        bridgeObservation: observation && observation.kind || 'STATE_UNKNOWN'
      };

      return {
        ok: Object.values(assertions).every(Boolean),
        reason: assertions.teardownRegistered ? firstReadinessFailure(assertions) : 'teardown-unregistered',
        readiness: { ...readiness }
      };
    })();

    readinessPromise = task;
    try {
      return await task;
    } finally {
      if (readinessPromise === task) readinessPromise = null;
    }
  }

  function retiredRuntimeSnapshot() {
    if (!teardownComplete || state !== STATES.UNINITIALIZED) return null;
    if (reason !== 'fresh-runtime-required') {
      transition(STATES.UNINITIALIZED, 'fresh-runtime-required');
    }
    return snapshot();
  }

  async function boot() {
    if (teardownPromise) await teardownPromise;
    if (hasIncompleteTeardown()) return snapshot();
    if (mode === MODES.DISABLED) {
      if (state !== STATES.FAILED) transition(STATES.UNINITIALIZED, 'user-disabled');
      return snapshot();
    }
    if (state === STATES.FAILED) return snapshot();
    const retired = retiredRuntimeSnapshot();
    if (retired) return retired;
    if (bootPromise) return bootPromise;
    if (state === STATES.READY) return snapshot();
    if (state === STATES.RECOVERING && recoveryPromise) return recoveryPromise;

    teardownComplete = false;
    teardownRequested = false;
    recoveryAttempt = 0;
    const epoch = ++operationEpoch;

    const task = (async () => {
      transition(STATES.BOOTING, 'boot-in-progress');
      try {
        const result = await evaluateReadiness(epoch);
        if (!operationStillCurrent(epoch) || result.cancelled) return snapshot();
        if (result.ok) transition(STATES.READY, 'ready');
        else transition(STATES.DEGRADED, result.reason);
      } catch (error) {
        if (!operationStillCurrent(epoch)) return snapshot();
        const failure = classifyCapabilityError(error, 'boot-capability-failed');
        transition(failure.state, failure.reason, failure.error);
      }
      return snapshot();
    })();

    bootPromise = task;
    try {
      return await task;
    } finally {
      if (bootPromise === task) bootPromise = null;
    }
  }

  async function revalidate() {
    if (teardownPromise) await teardownPromise;
    if (hasIncompleteTeardown()) return snapshot();
    if (mode === MODES.DISABLED || teardownRequested) return snapshot();
    const retired = retiredRuntimeSnapshot();
    if (retired) return retired;
    if (state === STATES.FAILED) return snapshot();
    if (bootPromise) return bootPromise;
    if (recoveryPromise) return recoveryPromise;

    const epoch = operationEpoch;
    try {
      const result = await evaluateReadiness(epoch);
      if (!operationStillCurrent(epoch) || result.cancelled) return snapshot();
      if (result.ok) transition(STATES.READY, 'ready');
      else transition(STATES.DEGRADED, result.reason);
    } catch (error) {
      if (!operationStillCurrent(epoch)) return snapshot();
      const failure = classifyCapabilityError(error, 'revalidation-failed');
      transition(failure.state, failure.reason, failure.error);
    }
    return snapshot();
  }

  async function recover() {
    if (teardownPromise) await teardownPromise;
    if (hasIncompleteTeardown()) return snapshot();
    if (mode === MODES.DISABLED || teardownRequested) return snapshot();
    let retired = retiredRuntimeSnapshot();
    if (retired) return retired;
    if (recoveryPromise) return recoveryPromise;
    if (bootPromise) await bootPromise;
    if (hasIncompleteTeardown()) return snapshot();
    if (mode === MODES.DISABLED || teardownRequested) return snapshot();
    retired = retiredRuntimeSnapshot();
    if (retired) return retired;
    if (state === STATES.FAILED && isReloadRequiredReason(reason)) return snapshot();

    teardownRequested = false;
    recoveryAttempt = 0;
    const epoch = ++operationEpoch;

    const task = (async () => {
      transition(STATES.RECOVERING, 'recovery-in-progress');
      for (let index = 0; index < recoveryDelays.length; index += 1) {
        recoveryAttempt = index + 1;
        if (recoveryDelays[index] > 0) await sleep(recoveryDelays[index]);
        if (!operationStillCurrent(epoch)) return snapshot();

        try {
          const result = await evaluateReadiness(epoch);
          if (!operationStillCurrent(epoch) || result.cancelled) return snapshot();
          if (result.ok) {
            transition(STATES.READY, 'ready');
            return snapshot();
          }
          if (result.reason === 'coordination-not-implemented-b1') {
            transition(STATES.DEGRADED, result.reason);
            return snapshot();
          }
          reason = result.reason;
          lastError = null;
        } catch (error) {
          if (!operationStillCurrent(epoch)) return snapshot();
          const failure = classifyCapabilityError(error, 'recovery-capability-failed');
          if (failure.state === STATES.FAILED) {
            transition(failure.state, failure.reason, failure.error);
            return snapshot();
          }
          reason = failure.reason;
          lastError = errorMessage(error);
        }
      }

      if (operationStillCurrent(epoch)) transition(STATES.FAILED, 'recovery-exhausted', lastError);
      return snapshot();
    })();

    recoveryPromise = task;
    try {
      return await task;
    } finally {
      if (recoveryPromise === task) recoveryPromise = null;
    }
  }

  async function runTeardown(nextReason, cleanupRetry) {
    if (teardownPromise) {
      await teardownPromise;
      return snapshot();
    }
    if (teardownComplete && state === STATES.UNINITIALIZED) return snapshot();

    teardownRequested = true;
    operationEpoch += 1;

    const task = (async () => {
      const pending = [bootPromise, recoveryPromise, readinessPromise].filter(Boolean);
      if (pending.length) await Promise.allSettled(pending);

      const errors = [];
      const context = Object.freeze({ cleanupRetry: Boolean(cleanupRetry) });
      for (const name of CORE_TEARDOWN_ORDER) {
        if (!outstandingAdapters.has(name)) continue;
        const adapter = adapters[name];
        if (!adapter || typeof adapter.teardown !== 'function') {
          errors.push(`${name}:teardown-unregistered`);
          continue;
        }
        try {
          await adapter.teardown(context);
          outstandingAdapters.delete(name);
        } catch (error) {
          errors.push(`${name}:${errorMessage(error)}`);
        }
      }

      const nonOwnershipOutstanding = [...outstandingAdapters].filter(name => name !== 'ownership');
      if (!nonOwnershipOutstanding.length && outstandingAdapters.has('ownership')) {
        const ownership = adapters.ownership;
        if (!ownership || typeof ownership.teardown !== 'function') {
          errors.push('ownership:teardown-unregistered');
        } else {
          try {
            await ownership.teardown(context);
            outstandingAdapters.delete('ownership');
          } catch (error) {
            errors.push(`ownership:${errorMessage(error)}`);
          }
        }
      }

      readiness = null;
      recoveryAttempt = 0;
      if (errors.length || outstandingAdapters.size) {
        teardownComplete = false;
        const unresolved = orderedOutstandingResources().join(',') || 'unknown';
        const details = errors.length ? errors.join('; ') : `outstanding:${unresolved}`;
        transition(STATES.FAILED, 'teardown-incomplete', new Error(details));
      } else {
        teardownComplete = true;
        transition(STATES.UNINITIALIZED, nextReason);
      }
      teardownRequested = false;
    })();

    const active = task.finally(() => {
      if (teardownPromise === active) teardownPromise = null;
    });
    teardownPromise = active;
    await active;
    return snapshot();
  }

  async function teardown(nextReason = 'teardown-complete') {
    if (teardownPromise) {
      await teardownPromise;
      return snapshot();
    }
    if (hasIncompleteTeardown()) return snapshot();
    return runTeardown(nextReason, false);
  }

  async function retryTeardown() {
    if (!hasIncompleteTeardown()) return snapshot();
    const nextReason = mode === MODES.DISABLED ? 'user-disabled' : 'teardown-complete';
    return runTeardown(nextReason, true);
  }

  async function setMode(nextMode) {
    const requestedMode = nextMode === MODES.DISABLED ? MODES.DISABLED : MODES.ENABLED;
    if (requestedMode === MODES.DISABLED) {
      if (teardownPromise) {
        await teardownPromise;
        return snapshot();
      }
      if (hasIncompleteTeardown()) return snapshot();
      mode = MODES.DISABLED;
      return teardown('user-disabled');
    }

    if (teardownPromise) await teardownPromise;
    if (hasIncompleteTeardown()) return snapshot();
    mode = MODES.ENABLED;
    const retired = retiredRuntimeSnapshot();
    if (retired) return retired;
    if (state === STATES.FAILED && isReloadRequiredReason(reason)) return snapshot();
    if (state === STATES.UNINITIALIZED) return boot();
    return snapshot();
  }

  return {
    STATES,
    MODES,
    snapshot,
    boot,
    revalidate,
    recover,
    teardown,
    retryTeardown,
    setMode
  };
}

module.exports = {
  STATES,
  MODES,
  DEFAULT_RECOVERY_DELAYS,
  CORE_ACQUIRE_ORDER,
  CORE_TEARDOWN_ORDER,
  isReloadRequiredReason,
  createLifecycleController
};
