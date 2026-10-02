'use strict';

const {
  parseServerSnapshot,
  parseDomSnapshot
} = require('./bridge-parser');
const {
  createBridgeEngineState,
  beginVerification,
  acceptVerification,
  recordNativeCompletion,
  teardownBridge,
  reinitializeBridge
} = require('./bridge-engine');

const ACTION_7_PATH = '/ajax_time_clock.php';
const ACTION_7_BODY = 'action=7';
const AUDITED_SELECTOR = '#clockin,#clockout,#clockin-debug,#clockin-remaining-time,.timeclock-container';
const DEFAULT_HEARTBEAT_MS = 60_000;
const DEFAULT_MUTATION_DEBOUNCE_MS = 180;
const DEFAULT_CLICK_VERIFY_DELAY_MS = 900;
const DEFAULT_FOLLOW_UP_MS = 300;
const DEFAULT_VERIFICATION_TIMEOUT_MS = 8_000;
const NATIVE_ACTIONS = new Set([2, 3, 4]);

function defaultId(prefix) {
  try {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  } catch (_) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function normalizeAuthorityTenure(value) {
  const coordinationEpoch = Number.isSafeInteger(value?.coordinationEpoch) &&
    value.coordinationEpoch >= 0
    ? value.coordinationEpoch
    : null;
  const workerInstanceId = typeof value?.workerInstanceId === 'string' && value.workerInstanceId.trim()
    ? value.workerInstanceId.trim()
    : null;
  return Object.freeze({ coordinationEpoch, workerInstanceId });
}

function sameAuthorityTenure(left, right) {
  return left.coordinationEpoch === right.coordinationEpoch &&
    left.workerInstanceId === right.workerInstanceId;
}

function visible(element) {
  if (!element || element.hidden === true) return false;
  if (String(element.getAttribute?.('aria-hidden') || '').toLowerCase() === 'true') return false;
  const style = element.style || {};
  return style.display !== 'none' && style.visibility !== 'hidden';
}

function exactElement(documentObject, selector) {
  const matches = [...documentObject.querySelectorAll(selector)];
  return matches.length === 1 ? { ok: true, element: matches[0] } : {
    ok: matches.length === 0,
    element: null,
    duplicate: matches.length > 1
  };
}

function readAuditedDomSnapshot(documentObject) {
  if (!documentObject || typeof documentObject.querySelectorAll !== 'function') {
    return { available: false, snapshot: null, reason: 'DOM_UNAVAILABLE' };
  }
  const remaining = exactElement(documentObject, '#clockin-remaining-time');
  const debug = exactElement(documentObject, '#clockin-debug');
  const clockIn = exactElement(documentObject, '#clockin');
  const clockOut = exactElement(documentObject, '#clockout');
  const containers = [...documentObject.querySelectorAll('.timeclock-container')];
  if ([remaining, debug, clockIn, clockOut].some(item => item.duplicate) || containers.length > 1) {
    return { available: false, snapshot: null, reason: 'AMBIGUOUS_AUDITED_CLOCK_DOM' };
  }
  const scope = element => element ? {
    html: String(element.innerHTML || ''),
    text: String(element.textContent || '')
  } : { html: '', text: '' };
  return {
    available: true,
    reason: 'AUDITED_CLOCK_DOM_CAPTURED',
    snapshot: {
      remainingTime: scope(remaining.element),
      debug: scope(debug.element),
      clockInVisible: Boolean(clockIn.element) && visible(clockIn.element),
      clockOutVisible: Boolean(clockOut.element) && visible(clockOut.element)
    }
  };
}

function createSquareCoilBridgeService(options = {}) {
  const documentObject = options.document;
  const windowObject = options.window;
  const fetchFunction = options.fetch;
  const timers = options.timers || globalThis;
  const now = options.now || (() => Date.now());
  const randomId = options.randomId || defaultId;
  const onEvents = typeof options.onEvents === 'function' ? options.onEvents : async () => {};
  const onHealthChange = typeof options.onHealthChange === 'function' ? options.onHealthChange : () => {};
  const onVerificationHint = typeof options.onVerificationHint === 'function' ? options.onVerificationHint : async () => {};
  const sourceRuntimeId = String(options.sourceRuntimeId || '');
  const heartbeatMs = options.heartbeatMs ?? DEFAULT_HEARTBEAT_MS;
  const mutationDebounceMs = options.mutationDebounceMs ?? DEFAULT_MUTATION_DEBOUNCE_MS;
  const clickVerifyDelayMs = options.clickVerifyDelayMs ?? DEFAULT_CLICK_VERIFY_DELAY_MS;
  const followUpMs = options.followUpMs ?? DEFAULT_FOLLOW_UP_MS;
  const verificationTimeoutMs = options.verificationTimeoutMs ?? DEFAULT_VERIFICATION_TIMEOUT_MS;
  if (!documentObject || !windowObject) throw new Error('bridge-browser-context-required');
  if (typeof fetchFunction !== 'function') throw new Error('bridge-fetch-required');
  if (sourceRuntimeId.length < 8) throw new Error('bridge-runtime-id-required');
  for (const value of [heartbeatMs, mutationDebounceMs, clickVerifyDelayMs, followUpMs]) {
    if (!Number.isSafeInteger(value) || value < 0) throw new Error('bridge-timing-invalid');
  }
  if (!Number.isSafeInteger(verificationTimeoutMs) || verificationTimeoutMs < 1) {
    throw new Error('bridge-verification-timeout-invalid');
  }

  let engineState = createBridgeEngineState({
    ...(options.engineOptions || {}),
    observationStreamId: sourceRuntimeId
  });
  let initialized = false;
  let owner = false;
  let disposed = false;
  let observer = null;
  let heartbeatTimer = null;
  let mutationTimer = null;
  let clickTimer = null;
  let followUpTimer = null;
  let verificationPromise = null;
  let activeAbort = null;
  let pendingEvents = [];
  let requestCount = 0;
  let ownerTenure = 0;
  let authorityTenure = normalizeAuthorityTenure();
  let ownerInitialObservationCompleted = false;
  let lastReason = 'not-initialized';
  let lastError = null;
  let lastEventType = null;
  let serverAvailable = null;
  let domAvailable = null;

  function capability() {
    if (serverAvailable === false && domAvailable === false) return 'UNAVAILABLE';
    if (serverAvailable === false && domAvailable !== false) return 'DOM_FALLBACK';
    if (domAvailable === false && serverAvailable !== false) return 'SERVER_FALLBACK';
    return options.completionObservationAvailable === true ? 'FULL' : 'VERIFICATION_FALLBACK';
  }

  function snapshot() {
    return Object.freeze({
      initialized,
      active: engineState.active,
      owner,
      disposed,
      capability: capability(),
      bridgeGeneration: engineState.bridgeGeneration,
      bridgeSeq: engineState.bridgeSeq,
      pendingEventCount: pendingEvents.length,
      verificationInFlight: verificationPromise !== null,
      listenersAttached: initialized && !disposed,
      requestCount,
      authorityTenure,
      ownerInitialObservationCompleted,
      nativeMutationRequestCount: 0,
      lastReason,
      lastError,
      lastEventType
    });
  }

  function publishHealth() {
    try { onHealthChange(snapshot()); } catch (_) {}
  }

  function clearTimer(name) {
    const value = name === 'mutation' ? mutationTimer : name === 'click' ? clickTimer : followUpTimer;
    if (value !== null) timers.clearTimeout(value);
    if (name === 'mutation') mutationTimer = null;
    else if (name === 'click') clickTimer = null;
    else followUpTimer = null;
  }

  function schedule(name, delayMs, trigger) {
    clearTimer(name);
    const id = timers.setTimeout(() => {
      if (name === 'mutation') mutationTimer = null;
      else if (name === 'click') clickTimer = null;
      else followUpTimer = null;
      verifyNow(trigger).catch(() => {});
    }, delayMs);
    if (name === 'mutation') mutationTimer = id;
    else if (name === 'click') clickTimer = id;
    else followUpTimer = id;
  }

  function mutationTouchesAuditedClock(mutation) {
    const ElementCtor = windowObject.Element;
    const isElement = value => Boolean(ElementCtor && value instanceof ElementCtor);
    const target = isElement(mutation.target) ? mutation.target : mutation.target?.parentElement;
    if (target?.matches?.(AUDITED_SELECTOR) || target?.closest?.(AUDITED_SELECTOR)) return true;
    return [...(mutation.addedNodes || [])].some(node => (
      isElement(node) && (node.matches?.(AUDITED_SELECTOR) || node.querySelector?.(AUDITED_SELECTOR))
    ));
  }

  function onMutation(mutations) {
    if (!mutations.some(mutationTouchesAuditedClock)) return;
    schedule('mutation', mutationDebounceMs, 'clock-dom-mutation');
  }

  function onClick(event) {
    const target = event?.target;
    if (!target?.closest?.('.clock-actions')) return;
    schedule('click', clickVerifyDelayMs, 'passive-clock-action-hint');
    if (!owner) onVerificationHint({ kind: 'PASSIVE_ACTIVITY_HINT' }).catch(() => {});
  }

  async function observeNativeCompletion(values = {}) {
    if (disposed || values.successful !== true) return { accepted: false, reason: 'NATIVE_COMPLETION_UNSUCCESSFUL' };
    const nativeAction = Number(values.nativeAction);
    if (!NATIVE_ACTIONS.has(nativeAction)) return { accepted: false, reason: 'UNSUPPORTED_NATIVE_ACTION' };
    const completedAtMs = Number.isSafeInteger(values.completedAtMs) ? values.completedAtMs : now();
    const completionKey = String(values.completionKey || randomId('native-completion'));
    const evidence = Object.freeze({ kind: 'NATIVE_MUTATION_COMPLETION', successful: true, nativeAction,
      completedAtMs, completionKey, requestProjectId: values.requestProjectId || null,
      requestDepartment: values.requestDepartment || null, sourceRuntimeId,
      documentToken: String(options.documentToken || ''), provenance: 'AUDITED_SQUARECOIL_COMPLETION_HOOK' });
    if (!owner) return { accepted: false, reason: 'OBSERVER_EVIDENCE_ROUTED_BY_WORKER' };
    const recorded = recordNativeCompletion(engineState, { ...evidence, bridgeGeneration: engineState.bridgeGeneration });
    engineState = recorded.state;
    if (recorded.needsVerification) await verifyNow('native-mutation-completion');
    return recorded;
  }

  function onFocus() {
    verifyNow('window-focus').catch(() => {});
  }

  function onVisibility() {
    if (documentObject.visibilityState === 'visible') verifyNow('visibility-visible').catch(() => {});
  }

  function attach() {
    if (initialized) return;
    initialized = true;
    documentObject.addEventListener('click', onClick, true);
    windowObject.addEventListener('focus', onFocus);
    documentObject.addEventListener('visibilitychange', onVisibility);
    const MutationObserverCtor = windowObject.MutationObserver;
    if (typeof MutationObserverCtor === 'function' && documentObject.documentElement) {
      observer = new MutationObserverCtor(onMutation);
      observer.observe(documentObject.documentElement, {
        subtree: true,
        childList: true,
        characterData: true,
        attributes: true,
        attributeFilter: ['style', 'class', 'hidden', 'aria-hidden', 'data-time']
      });
    }
    heartbeatTimer = timers.setInterval(() => {
      if (documentObject.visibilityState === 'visible') verifyNow('visible-heartbeat').catch(() => {});
    }, heartbeatMs);
  }

  function currentOwnerTenure(expectedTenure) {
    return !disposed && owner && ownerTenure === expectedTenure;
  }

  function staleOwnerTenureResult() {
    return { accepted: false, changed: false, reason: 'STALE_OWNER_TENURE', events: [], needsVerification: false };
  }

  function invalidateOwnerTenure() {
    if (activeAbort) activeAbort.abort();
    verificationPromise = null;
    const tornDown = teardownBridge(engineState);
    engineState = reinitializeBridge(tornDown.state).state;
    pendingEvents = [];
    clearTimer('followUp');
  }

  function adoptOwnerState(nextOwner, nextAuthorityTenure) {
    const normalizedTenure = normalizeAuthorityTenure(nextAuthorityTenure);
    const changed = owner !== nextOwner || !sameAuthorityTenure(authorityTenure, normalizedTenure);
    if (changed) {
      ownerTenure += 1;
      ownerInitialObservationCompleted = false;
      invalidateOwnerTenure();
    }
    owner = nextOwner;
    authorityTenure = normalizedTenure;
    return changed;
  }

  async function flushEvents(expectedTenure = ownerTenure) {
    while (pendingEvents.length && currentOwnerTenure(expectedTenure)) {
      const event = pendingEvents[0];
      await onEvents([event]);
      if (!currentOwnerTenure(expectedTenure)) return;
      pendingEvents.shift();
      lastEventType = event.type;
    }
  }

  async function runVerification(trigger) {
    if (disposed || !initialized || !owner) {
      lastReason = disposed ? 'bridge-disposed' : !owner ? 'observer-no-server-verification' : 'bridge-not-initialized';
      publishHealth();
      return { accepted: false, reason: lastReason, events: [] };
    }
    const verificationTenure = ownerTenure;
    await flushEvents(verificationTenure);
    if (!currentOwnerTenure(verificationTenure)) return staleOwnerTenureResult();
    const requestStartedAtMs = now();
    const started = beginVerification(engineState, {
      bridgeGeneration: engineState.bridgeGeneration,
      requestStartedAtMs,
      trigger
    });
    engineState = started.state;
    if (!started.accepted) {
      lastReason = started.reason;
      publishHealth();
      return started;
    }

    const observedAtMs = Math.max(requestStartedAtMs, now());
    let serverEvidence;
    const requestAbort = typeof windowObject.AbortController === 'function'
      ? new windowObject.AbortController()
      : null;
    activeAbort = requestAbort;
    let verificationTimeout = null;
    try {
      requestCount += 1;
      const request = fetchFunction(new windowObject.URL(ACTION_7_PATH, windowObject.location.origin).href, {
        method: 'POST',
        credentials: 'same-origin',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded; charset=UTF-8',
          'X-Requested-With': 'XMLHttpRequest'
        },
        body: ACTION_7_BODY,
        cache: 'no-store',
        signal: requestAbort?.signal
      });
      const timeout = new Promise((_, reject) => {
        verificationTimeout = timers.setTimeout(() => {
          reject(new Error('action-7-timeout'));
          if (requestAbort) requestAbort.abort();
        }, verificationTimeoutMs);
      });
      const response = await Promise.race([request, timeout]);
      if (!currentOwnerTenure(verificationTenure)) return staleOwnerTenureResult();
      if (!response || response.ok !== true) throw new Error(`action-7-http-${response?.status || 'failed'}`);
      const html = await response.text();
      if (!currentOwnerTenure(verificationTenure)) return staleOwnerTenureResult();
      serverAvailable = true;
      serverEvidence = parseServerSnapshot(html, { observedAtMs: Math.max(observedAtMs, now()) });
    } catch (error) {
      if (!currentOwnerTenure(verificationTenure)) return staleOwnerTenureResult();
      serverAvailable = false;
      lastError = String(error?.message || error);
      serverEvidence = parseServerSnapshot(null, {
        observedAtMs: Math.max(observedAtMs, now()),
        available: false
      });
    } finally {
      if (verificationTimeout !== null) timers.clearTimeout(verificationTimeout);
      if (activeAbort === requestAbort) activeAbort = null;
    }

    if (!currentOwnerTenure(verificationTenure)) return staleOwnerTenureResult();
    const captured = readAuditedDomSnapshot(documentObject);
    domAvailable = captured.available;
    const domEvidence = parseDomSnapshot(captured.snapshot, {
      observedAtMs: Math.max(serverEvidence.observedAtMs, now()),
      available: captured.available
    });
    if (!currentOwnerTenure(verificationTenure)) return staleOwnerTenureResult();
    const accepted = acceptVerification(engineState, {
      request: started.request,
      evidence: [serverEvidence, domEvidence]
    });
    engineState = accepted.state;
    if (accepted.accepted && accepted.events.length) {
      pendingEvents.push(...accepted.events);
      await flushEvents(verificationTenure);
    }
    if (!currentOwnerTenure(verificationTenure)) return staleOwnerTenureResult();
    if (accepted.accepted) ownerInitialObservationCompleted = true;
    lastReason = accepted.reason;
    if (serverAvailable === true) lastError = null;
    publishHealth();
    if (accepted.needsVerification && currentOwnerTenure(verificationTenure)) {
      schedule('followUp', followUpMs, 'bounded-follow-up');
    }
    return accepted;
  }

  function verifyNow(trigger = 'manual') {
    if (verificationPromise) return verificationPromise;
    const task = runVerification(String(trigger || 'manual'));
    verificationPromise = task;
    return task.finally(() => {
      if (verificationPromise === task) verificationPromise = null;
      publishHealth();
    });
  }

  async function completeOwnerInitialObservation(trigger, expectedTenure) {
    if (verificationPromise) {
      try { await verificationPromise; } catch (_) {}
    }
    if (disposed || !owner || ownerTenure !== expectedTenure) return snapshot();
    if (ownerInitialObservationCompleted) return snapshot();
    await verifyNow(trigger);
    publishHealth();
    return snapshot();
  }

  async function ensure(values = {}) {
    if (disposed) throw new Error('bridge-service-disposed');
    attach();
    const nextOwner = values.owner === true;
    adoptOwnerState(nextOwner, values.authorityTenure);
    lastReason = owner ? 'bridge-owner-initializing' : 'bridge-observer-listening';
    publishHealth();
    if (owner && !ownerInitialObservationCompleted) {
      await completeOwnerInitialObservation('initial-action-7', ownerTenure);
    }
    return snapshot();
  }

  async function setOwner(value, nextAuthorityTenure = authorityTenure) {
    if (disposed) return snapshot();
    const nextOwner = value === true;
    const changed = adoptOwnerState(nextOwner, nextAuthorityTenure);
    lastReason = owner ? 'bridge-owner' : 'bridge-observer-listening';
    publishHealth();
    if (changed && owner) {
      await completeOwnerInitialObservation('authority-owner-acquired', ownerTenure);
    }
    return snapshot();
  }

  async function teardown() {
    if (disposed) return snapshot();
    disposed = true;
    owner = false;
    ownerTenure += 1;
    ownerInitialObservationCompleted = false;
    if (activeAbort) activeAbort.abort();
    if (observer) observer.disconnect();
    observer = null;
    documentObject.removeEventListener('click', onClick, true);
    windowObject.removeEventListener('focus', onFocus);
    documentObject.removeEventListener('visibilitychange', onVisibility);
    if (heartbeatTimer !== null) timers.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
    clearTimer('mutation');
    clearTimer('click');
    clearTimer('followUp');
    const tornDown = teardownBridge(engineState);
    engineState = tornDown.state;
    pendingEvents = [];
    lastReason = tornDown.reason;
    publishHealth();
    return snapshot();
  }

  return Object.freeze({ ensure, setOwner, verifyNow, observeNativeCompletion, teardown, snapshot });
}

module.exports = {
  ACTION_7_PATH,
  ACTION_7_BODY,
  AUDITED_SELECTOR,
  DEFAULT_HEARTBEAT_MS,
  DEFAULT_VERIFICATION_TIMEOUT_MS,
  readAuditedDomSnapshot,
  createSquareCoilBridgeService
};
