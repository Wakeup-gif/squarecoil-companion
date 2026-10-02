'use strict';

const {
  AUTHORITY_PROTOCOL_VERSION,
  AUTHORITY_MESSAGES,
  KERNEL_ONLY_DISPOSITION,
  createAuthorityUpdateAcknowledgment,
  isConcreteId,
  isPlainObject
} = require('./authority-protocol');

const POSITIVE_DISPOSITIONS = new Set(['OWNER', 'OBSERVER_CONNECTED']);
const DEFAULT_HEARTBEAT_INTERVAL_MS = 5000;

function defaultRandomId(prefix) {
  if (globalThis.crypto && typeof globalThis.crypto.randomUUID === 'function') {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}

// This client is installed only in the extension's isolated content world.
// It never uses window.postMessage, DOM tokens, or MAIN-world callbacks as an
// authentication boundary.
function createAuthorityClient(options = {}) {
  const send = options.send;
  const runtimeOnMessage = options.runtimeOnMessage || null;
  const runtimeInstanceId = String(options.runtimeInstanceId || '');
  const documentToken = String(options.documentToken || '');
  const randomId = options.randomId || defaultRandomId;
  const requestTimeoutMs = Number.isFinite(options.requestTimeoutMs) ? options.requestTimeoutMs : 5000;
  const heartbeatIntervalMs = Number.isFinite(options.heartbeatIntervalMs)
    ? options.heartbeatIntervalMs
    : DEFAULT_HEARTBEAT_INTERVAL_MS;
  const onHealthChange = typeof options.onHealthChange === 'function' ? options.onHealthChange : () => {};
  const timers = options.timers || globalThis;
  if (typeof send !== 'function') throw new Error('authority-client-send-invalid');
  if (!isConcreteId(runtimeInstanceId) || !isConcreteId(documentToken)) {
    throw new Error('authority-client-identity-invalid');
  }
  for (const name of ['setTimeout', 'clearTimeout', 'setInterval', 'clearInterval']) {
    if (typeof timers[name] !== 'function') throw new Error(`authority-client-${name}-invalid`);
  }

  const updateListeners = new Set();
  let sessionId = null;
  let workerInstanceId = null;
  let disposition = 'UNAVAILABLE';
  let coordinationEpoch = null;
  let coordinationRevision = null;
  let leaseExpiry = null;
  let revision = null;
  let nativeObservationAvailable = false;
  let lastSequence = 0;
  let lastError = null;
  let healthy = false;
  let lastPublishedCoordination = null;
  let disposed = false;
  let heartbeatTimer = null;
  let heartbeatPromise = null;
  let connectPromise = null;
  const commandPromises = new Set();
  let teardownPromise = null;
  let teardownRequested = false;
  let connectOutcomeUncertain = false;

  function snapshot() {
    return {
      enabled: !disposed && !teardownRequested,
      healthy,
      disposition,
      workerInstanceId,
      coordinationEpoch,
      coordinationRevision,
      leaseExpiry,
      revision,
      subscribed: heartbeatTimer !== null,
      lastSequence,
      lastError,
      runtimeInstanceId,
      documentToken,
      nativeObservationAvailable
    };
  }

  function publishHealth(nextHealthy, error = null) {
    const nextError = error ? String(error?.message || error) : null;
    const nextCoordination = [
      disposition,
      coordinationEpoch,
      coordinationRevision,
      leaseExpiry,
      revision,
      workerInstanceId
    ].join('|');
    const changed = healthy !== nextHealthy || lastError !== nextError ||
      lastPublishedCoordination !== nextCoordination;
    healthy = nextHealthy;
    lastError = nextError;
    lastPublishedCoordination = nextCoordination;
    if (changed) {
      try { onHealthChange(snapshot()); } catch (_) {}
    }
  }

  function handleWorkerUpdate(message) {
    if (
      disposed ||
      message?.type !== AUTHORITY_MESSAGES.UPDATE ||
      message.protocolVersion !== AUTHORITY_PROTOCOL_VERSION ||
      message.documentToken !== documentToken ||
      message.runtimeInstanceId !== runtimeInstanceId ||
      message.sessionId !== sessionId ||
      message.workerInstanceId !== workerInstanceId ||
      !Number.isInteger(message.sequence) ||
      message.sequence <= lastSequence
    ) return false;
    lastSequence = message.sequence;
    for (const listener of [...updateListeners]) {
      try { listener(message.event, snapshot()); } catch (_) {}
    }
    return true;
  }

  function handleRuntimeUpdate(message, _sender, sendResponse) {
    if (!handleWorkerUpdate(message)) return false;
    if (typeof sendResponse === 'function') {
      sendResponse(createAuthorityUpdateAcknowledgment(message));
    }
    return false;
  }

  if (runtimeOnMessage && typeof runtimeOnMessage.addListener === 'function') {
    runtimeOnMessage.addListener(handleRuntimeUpdate);
  }

  function request(type, values = {}, requestOptions = {}) {
    if (disposed) return Promise.reject(new Error('authority-client-disposed'));
    if (teardownRequested && requestOptions.allowDuringTeardown !== true) {
      return Promise.reject(new Error('authority-teardown-requested'));
    }
    const request = {
      type,
      protocolVersion: AUTHORITY_PROTOCOL_VERSION,
      requestId: randomId('authority-request'),
      runtimeInstanceId,
      ...values
    };
    return new Promise((resolve, reject) => {
      let settled = false;
      const timer = timers.setTimeout(() => {
        if (settled) return;
        settled = true;
        reject(new Error('authority-transport-timeout'));
      }, requestTimeoutMs);
      Promise.resolve().then(() => send(request)).then(response => {
        if (settled) return;
        settled = true;
        timers.clearTimeout(timer);
        if (
          !response ||
          typeof response !== 'object' ||
          response.protocolVersion !== AUTHORITY_PROTOCOL_VERSION ||
          response.type !== type ||
          response.requestId !== request.requestId
        ) {
          reject(new Error('authority-response-envelope-invalid'));
          return;
        }
        resolve(response);
      }, error => {
        if (settled) return;
        settled = true;
        timers.clearTimeout(timer);
        reject(error);
      });
    });
  }

  function requirePositive(response, operation) {
    if (!response || response.ok !== true) {
      const error = new Error(String(response?.reason || `authority-${operation}-failed`));
      error.response = response || null;
      throw error;
    }
    if (!POSITIVE_DISPOSITIONS.has(response.disposition || disposition)) {
      const error = new Error('authority-positive-disposition-required');
      error.response = response;
      throw error;
    }
    return response;
  }

  function acceptConnection(response) {
    const nextSessionId = String(response.sessionId || sessionId || '');
    const nextWorkerInstanceId = String(response.workerInstanceId || workerInstanceId || '');
    if (!isConcreteId(nextSessionId) || !isConcreteId(nextWorkerInstanceId)) {
      throw new Error('authority-connection-identity-invalid');
    }
    if (nextSessionId !== sessionId || nextWorkerInstanceId !== workerInstanceId) lastSequence = 0;
    sessionId = nextSessionId;
    workerInstanceId = nextWorkerInstanceId;
    disposition = String(response.disposition || disposition || 'UNAVAILABLE');
    coordinationEpoch = response.coordinationEpoch ?? coordinationEpoch;
    coordinationRevision = response.coordinationRevision ?? coordinationRevision;
    leaseExpiry = response.leaseExpiry ?? leaseExpiry;
    revision = response.revision ?? revision;
    nativeObservationAvailable = response.nativeObservationAvailable === true;
  }

  function invalidateConnectionForReconnect() {
    // An unknown worker session is no longer healthy even while the exact
    // principal is reconnecting. Publish the unavailable state before any
    // replacement CONNECT can block so observers never see healthy=true with
    // no active worker/session identity.
    connectOutcomeUncertain = true;
    sessionId = null;
    workerInstanceId = null;
    disposition = 'UNAVAILABLE';
    coordinationEpoch = null;
    coordinationRevision = null;
    leaseExpiry = null;
    publishHealth(false);
  }

  async function establishConnection(operation, requestOptions = {}) {
    // Once CONNECT is dispatched, losing or rejecting a positive response can
    // leave an exact-principal session committed remotely. Keep the recovery
    // obligation sticky until a concrete transport session is adopted.
    connectOutcomeUncertain = true;
    const response = await request(AUTHORITY_MESSAGES.CONNECT, {}, requestOptions);
    if (!response || response.ok !== true) connectOutcomeUncertain = false;
    const positive = requirePositive(response, operation);
    acceptConnection(positive);
    connectOutcomeUncertain = false;
    return positive;
  }

  async function connectAndPrepare() {
    if (teardownRequested) throw new Error('authority-teardown-requested');
    if (connectPromise) return connectPromise;
    const task = (async () => {
      if (!sessionId) {
        await establishConnection('connect');
        if (teardownRequested) throw new Error('authority-teardown-requested');
      } else {
        const response = await request(AUTHORITY_MESSAGES.HEARTBEAT, { sessionId });
        if (!response?.ok && response?.reconnectRequired) {
          invalidateConnectionForReconnect();
          await establishConnection('reconnect');
        } else {
          acceptConnection(requirePositive(response, 'heartbeat'));
        }
      }
      if (teardownRequested) throw new Error('authority-teardown-requested');
      acceptConnection(requirePositive(
        await request(AUTHORITY_MESSAGES.SUBSCRIBE, { sessionId }),
        'subscribe'
      ));
      const read = requirePositive(await request(AUTHORITY_MESSAGES.READ, { sessionId }), 'read');
      acceptConnection(read);
      publishHealth(true);
      startHeartbeat();
      return {
        disposition,
        coordinationEpoch,
        coordinationRevision,
        leaseExpiry,
        revision,
        initialRead: read.result
      };
    })();
    connectPromise = task;
    try {
      return await task;
    } catch (error) {
      publishHealth(false, error);
      throw error;
    } finally {
      if (connectPromise === task) connectPromise = null;
    }
  }

  async function heartbeat() {
    if (disposed) throw new Error('authority-client-disposed');
    if (teardownRequested) throw new Error('authority-teardown-requested');
    if (heartbeatPromise) return heartbeatPromise;
    const task = (async () => {
      if (!sessionId) return connectAndPrepare();
      const response = await request(AUTHORITY_MESSAGES.HEARTBEAT, { sessionId });
      if (!response?.ok && response?.reconnectRequired) {
        invalidateConnectionForReconnect();
        return connectAndPrepare();
      }
      acceptConnection(requirePositive(response, 'heartbeat'));
      if (teardownRequested) throw new Error('authority-teardown-requested');
      publishHealth(true);
      return { disposition, coordinationEpoch, coordinationRevision, leaseExpiry, revision };
    })();
    heartbeatPromise = task;
    try {
      return await task;
    } catch (error) {
      publishHealth(false, error);
      throw error;
    } finally {
      if (heartbeatPromise === task) heartbeatPromise = null;
    }
  }

  function startHeartbeat() {
    if (heartbeatTimer !== null || disposed) return;
    heartbeatTimer = timers.setInterval(() => { heartbeat().catch(() => {}); }, heartbeatIntervalMs);
  }

  function stopHeartbeat() {
    if (heartbeatTimer !== null) timers.clearInterval(heartbeatTimer);
    heartbeatTimer = null;
  }

  async function ensure() {
    return connectAndPrepare();
  }

  async function read() {
    await ensure();
    const response = requirePositive(await request(AUTHORITY_MESSAGES.READ, { sessionId }), 'read');
    acceptConnection(response);
    return response.result;
  }

  function command(commandEnvelope) {
    if (!isPlainObject(commandEnvelope)) {
      return Promise.reject(new Error('authority-command-invalid'));
    }
    if (
      commandEnvelope.originRuntimeId !== undefined &&
      commandEnvelope.originRuntimeId !== runtimeInstanceId
    ) {
      return Promise.reject(new Error('authority-command-origin-runtime-mismatch'));
    }
    if (disposed) return Promise.reject(new Error('authority-client-disposed'));
    if (teardownRequested) return Promise.reject(new Error('authority-teardown-requested'));
    const task = (async () => {
      await ensure();
      const response = requirePositive(await request(AUTHORITY_MESSAGES.COMMAND, {
        sessionId,
        command: {
          ...commandEnvelope,
          originRuntimeId: runtimeInstanceId
        }
      }), 'command');
      acceptConnection(response);
      return response.result;
    })();
    commandPromises.add(task);
    task.then(
      () => commandPromises.delete(task),
      () => commandPromises.delete(task)
    );
    return task;
  }

  function migrationCommand(commandEnvelope) {
    if (!isPlainObject(commandEnvelope)) return Promise.reject(new Error('authority-command-invalid'));
    if (disposed || teardownRequested) return Promise.reject(new Error('authority-client-disposed'));
    const task = (async () => {
      await ensure();
      const response = requirePositive(await request(AUTHORITY_MESSAGES.COMMAND, {
        sessionId,
        directOwner: true,
        command: { ...commandEnvelope, originRuntimeId: runtimeInstanceId }
      }), 'command');
      acceptConnection(response);
      return response.result;
    })();
    commandPromises.add(task);
    task.then(
      () => commandPromises.delete(task),
      () => commandPromises.delete(task)
    );
    return task;
  }

  async function forwardNativeEvidence(evidence) {
    if (!isPlainObject(evidence)) throw new Error('authority-native-evidence-invalid');
    await ensure();
    const response = requirePositive(await request(AUTHORITY_MESSAGES.FORWARD_NATIVE_EVIDENCE, {
      sessionId,
      evidence
    }), 'forward-native-evidence');
    acceptConnection(response);
    return response.result;
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') throw new Error('authority-update-listener-invalid');
    updateListeners.add(listener);
    return () => updateListeners.delete(listener);
  }

  function dispose() {
    if (disposed) return;
    if (sessionId) throw new Error('authority-client-dispose-with-live-session');
    disposed = true;
    stopHeartbeat();
    if (runtimeOnMessage && typeof runtimeOnMessage.removeListener === 'function') {
      runtimeOnMessage.removeListener(handleRuntimeUpdate);
    }
    updateListeners.clear();
  }

  async function teardown() {
    if (teardownPromise) return teardownPromise;
    teardownRequested = true;
    stopHeartbeat();
    publishHealth(false);
    const task = (async () => {
      if (connectPromise) {
        try { await connectPromise; } catch (_) {}
      }
      if (heartbeatPromise) {
        try { await heartbeatPromise; } catch (_) {}
      }
      if (commandPromises.size) {
        await Promise.allSettled([...commandPromises]);
      }

      // A transport failure can leave CONNECT committed remotely without a
      // usable local response. Reconnect the exact runtime solely to obtain a
      // releasable session; never claim cleanup while that outcome is unknown.
      if (!sessionId && connectOutcomeUncertain) {
        await establishConnection('teardown-reconnect', { allowDuringTeardown: true });
      }
      if (!sessionId) {
        dispose();
        return { disconnected: true, absent: true };
      }

      const response = await request(
        AUTHORITY_MESSAGES.DISCONNECT,
        { sessionId },
        { allowDuringTeardown: true }
      );
      if (!response || response.ok !== true || response.disconnected !== true) {
        const error = new Error(String(response?.reason || 'authority-disconnect-failed'));
        error.response = response || null;
        publishHealth(false, error);
        throw error;
      }
      sessionId = null;
      workerInstanceId = null;
      disposition = 'UNAVAILABLE';
      connectOutcomeUncertain = false;
      dispose();
      return response;
    })();
    teardownPromise = task;
    try {
      return await task;
    } finally {
      if (teardownPromise === task) teardownPromise = null;
    }
  }

  return Object.freeze({
    ensure,
    read,
    command,
    migrationCommand,
    forwardNativeEvidence,
    subscribe,
    heartbeat,
    teardown,
    dispose,
    snapshot,
    handleWorkerUpdate,
    handleRuntimeUpdate
  });
}

function createLifecycleAuthorityAdapter(client, options = {}) {
  if (!client || typeof client.ensure !== 'function' || typeof client.teardown !== 'function') {
    throw new Error('authority-lifecycle-client-invalid');
  }
  const allowPositiveReadiness = options.allowPositiveReadiness === true;
  return Object.freeze({
    ensure: async () => {
      if (typeof options.onEnsure === 'function') options.onEnsure();
      const result = await client.ensure();
      return {
        ...result,
        authorityDisposition: result.disposition,
        disposition: allowPositiveReadiness ? result.disposition : KERNEL_ONLY_DISPOSITION
      };
    },
    teardown: async () => {
      if (typeof options.onTeardownStart === 'function') options.onTeardownStart();
      return client.teardown();
    }
  });
}

module.exports = {
  KERNEL_ONLY_DISPOSITION,
  DEFAULT_HEARTBEAT_INTERVAL_MS,
  createAuthorityClient,
  createLifecycleAuthorityAdapter
};
