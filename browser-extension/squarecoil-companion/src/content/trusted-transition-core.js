'use strict';

const { inspectLegacyMigration, MIGRATION_DISPOSITIONS } = require('../data/legacy-preflight');
const { LEGACY_SOURCE_KEYS } = require('../data/migration-schema');
const AUTHORITY_COMMANDS = Object.freeze({ MIGRATE_V07: 'MIGRATE_V07' });
const { timerKind, deepClone, deepFreeze, isRecord } = require('../data/model');
const { TIMER_COMMANDS } = require('../timer/commands');
const { createTimerReadModel } = require('../timer/read-model');
const { createAnalyticsSnapshot } = require('../presentation/analytics-data');
const { createSquareCoilBridgeService } = require('../squarecoil/bridge-service');
const {
  DATA_COMMAND_TYPES,
  createDataSafetyReadModel,
  createFullBackup,
  createHistoryCsv,
  createTimeReportCsv,
  stageDataOperation
} = require('../data/data-safety');
const {
  PREFERENCE_COMMANDS,
  normalizePreferenceSnapshot
} = require('../preferences/preferences');

const RECOVERY_MODES = Object.freeze({
  CONTROLLED: 'CONTROLLED_RELOAD',
  INTERRUPTED: 'UNEXPECTED_INTERRUPTION'
});

const RECOVERY_ELIGIBLE_EVENTS = new Set([
  'CONTEXT_DETECTED',
  'CONTEXT_CHANGED',
  'CONTEXT_VERIFIED',
  'CONTEXT_METADATA_UPDATED',
  'CONTEXT_LEFT',
  'CLOCKED_OUT'
]);

const USER_TIMER_COMMANDS = new Set([
  TIMER_COMMANDS.RESUME,
  TIMER_COMMANDS.START_FRESH,
  TIMER_COMMANDS.LOCAL_PAUSE,
  TIMER_COMMANDS.LOCAL_RESUME
]);

function defaultId(prefix) {
  try {
    return `${prefix}-${globalThis.crypto.randomUUID()}`;
  } catch (_) {
    return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}`;
  }
}

function normalizeAuthorityTenure(authority) {
  const coordinationEpoch = Number.isSafeInteger(authority?.coordinationEpoch) &&
    authority.coordinationEpoch >= 0
    ? authority.coordinationEpoch
    : null;
  const workerInstanceId = typeof authority?.workerInstanceId === 'string' &&
    authority.workerInstanceId.trim()
    ? authority.workerInstanceId.trim()
    : null;
  return deepFreeze({ coordinationEpoch, workerInstanceId });
}

function sameAuthorityTenure(left, right) {
  return Boolean(
    left &&
    right &&
    left.coordinationEpoch === right.coordinationEpoch &&
    left.workerInstanceId === right.workerInstanceId
  );
}

function legacyPreferencesFromSources(legacySources) {
  const raw = legacySources?.[LEGACY_SOURCE_KEYS.CURRENT];
  if (typeof raw !== 'string') return null;
  try {
    const value = JSON.parse(raw);
    if (!isRecord(value) || !isRecord(value.settings)) return null;
    return deepFreeze({ settings: deepClone(value.settings) });
  } catch (_) {
    return null;
  }
}

function capturedLegacyStorage(legacySources) {
  return Object.freeze({
    getItem(key) {
      return Object.hasOwn(legacySources, key) ? legacySources[key] : null;
    }
  });
}

function captureV07LegacySources(storage) {
  if (!storage || typeof storage.getItem !== 'function') throw new Error('legacy-local-storage-reader-required');
  const captured = {};
  for (const key of Object.values(LEGACY_SOURCE_KEYS)) {
    const value = storage.getItem(key);
    if (value !== null && value !== undefined) captured[key] = String(value);
  }
  return deepFreeze(captured);
}

function retainedLegacyPreferences(storage, document) {
  const legacySources = captureV07LegacySources(storage);
  const capturedPreflight = inspectLegacyMigration(capturedLegacyStorage(legacySources), document);
  return Object.freeze({
    preflight: capturedPreflight,
    preferences: capturedPreflight.disposition === MIGRATION_DISPOSITIONS.COMPLETE_MATCH
      ? legacyPreferencesFromSources(legacySources)
      : null
  });
}

function createTrustedTransitionCore(options = {}) {
  const authorityClient = options.authorityClient;
  const legacyStorage = options.legacyStorage;
  const now = options.now || (() => Date.now());
  const randomId = options.randomId || defaultId;
  const onStatusChange = typeof options.onStatusChange === 'function' ? options.onStatusChange : () => {};
  const createBridge = options.createBridge || (bridgeOptions => createSquareCoilBridgeService(bridgeOptions));
  if (!authorityClient || typeof authorityClient.ensure !== 'function' ||
      typeof authorityClient.read !== 'function' || typeof authorityClient.command !== 'function' ||
      typeof authorityClient.subscribe !== 'function') {
    throw new Error('trusted-transition-authority-client-required');
  }

  let initialized = false;
  let disposed = false;
  let blocked = false;
  let preflight = null;
  let authorityDocument = null;
  let authorityOwner = false;
  let authorityTenure = null;
  let bridge = null;
  let unsubscribe = null;
  let recoveryMode = null;
  let commandQueue = Promise.resolve();
  let reconciliationQueue = Promise.resolve();
  let prepareDisablePromise = null;
  let initializationPromise = null;
  let migrationInFlight = false;
  let pendingLegacyPreferences = null;
  let lastStatus = 'not-initialized';
  let lastError = null;
  const stagedDataPlans = new Map();

  function adopt(value) {
    const documentValue = value?.document || null;
    if (documentValue && typeof documentValue === 'object') {
      const priorRevision = authorityDocument?.revision;
      authorityDocument = deepFreeze(deepClone(documentValue));
      if (Number.isSafeInteger(priorRevision) && authorityDocument.revision !== priorRevision) stagedDataPlans.clear();
      return true;
    }
    return false;
  }

  function determineRecoveryMode(force = false) {
    if (!authorityDocument?.timer?.active) {
      recoveryMode = null;
      return;
    }
    if (recoveryMode && !force) return;
    const checkpoint = authorityDocument.checkpoint;
    const controlled = checkpoint?.terminationDisposition === 'CONTROLLED_RELOAD' &&
      checkpoint?.sessionId === authorityDocument.timer.active.sessionId &&
      checkpoint?.contextId === authorityDocument.timer.active.contextId;
    recoveryMode = controlled ? RECOVERY_MODES.CONTROLLED : RECOVERY_MODES.INTERRUPTED;
  }

  function viewDocument() {
    if (!authorityDocument) return null;
    const value = deepClone(authorityDocument);
    if (recoveryMode && value.timer?.active) {
      value.timer.active.safetyHold = {
        holdAtMs: value.timer.active.lastVerifiedAtMs,
        reason: 'recovery-verification-pending'
      };
      value.timer.active.provisionalSinceMs = value.timer.active.lastVerifiedAtMs;
    }
    return value;
  }

  function timerView(view = {}) {
    if (!authorityDocument) return null;
    return createTimerReadModel(viewDocument, { now }).snapshot({ ...view, atMs: now() });
  }

  function snapshot(view = {}) {
    let readModel = null;
    let readModelError = null;
    try { readModel = timerView(view); }
    catch (error) { readModelError = String(error?.message || error); }
    let data = null;
    let dataReadModelError = null;
    try { if (authorityDocument) data = createDataSafetyReadModel(viewDocument()); }
    catch (error) { dataReadModelError = String(error?.message || error); }
    return deepFreeze({
      initialized,
      disposed,
      blocked,
      status: lastStatus,
      lastError,
      authorityOwner,
      authorityTenure,
      revision: authorityDocument?.revision ?? null,
      ledgerSegmentCount: Array.isArray(authorityDocument?.ledger) ? authorityDocument.ledger.length : null,
      recoveryMode,
      preflight: preflight ? {
        checked: preflight.checked,
        blocked: preflight.blocked,
        reason: preflight.reason,
        disposition: preflight.disposition,
        activityChanged: preflight.activityChanged === true,
        presentKeys: [...preflight.presentKeys]
      } : null,
      bridge: bridge ? bridge.snapshot() : null,
      timer: readModel,
      readModelError,
      data,
      dataReadModelError,
      preferences: normalizePreferenceSnapshot(authorityDocument?.dataSafety?.preferences)
    });
  }

  function publishStatus(status, error = null) {
    lastStatus = status;
    lastError = error ? String(error?.message || error) : null;
    try { onStatusChange(snapshot()); } catch (_) {}
  }

  function serialize(task) {
    const run = commandQueue.then(task, task);
    commandQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  function serializeReconciliation(task) {
    const run = reconciliationQueue.then(task, task);
    reconciliationQueue = run.then(() => undefined, () => undefined);
    return run;
  }

  async function refreshDocument() {
    const read = await authorityClient.read();
    if (!adopt(read)) throw new Error('trusted-transition-document-unavailable');
    return authorityDocument;
  }

  function commandEnvelope(type, values = {}) {
    if (!authorityDocument || !Number.isSafeInteger(authorityDocument.revision)) {
      throw new Error('trusted-transition-revision-unavailable');
    }
    return {
      type,
      commandId: randomId('trusted-command'),
      expectedRevision: authorityDocument.revision,
      ...values
    };
  }

  async function commit(type, values = {}) {
    const envelope = commandEnvelope(type, values);
    try {
      const result = await authorityClient.command(envelope);
      await refreshDocument();
      return result;
    } catch (error) {
      try { await refreshDocument(); } catch (_) {}
      throw error;
    }
  }

  function shouldForwardNonPositive(event) {
    if (!['STATE_UNKNOWN', 'STATE_CONFLICT'].includes(event.type)) return true;
    return Boolean(authorityDocument?.timer?.active || authorityDocument?.timer?.pending);
  }

  async function acceptBridgeEvents(events) {
    return serialize(async () => {
      if (disposed || blocked || !authorityOwner) return { accepted: false, reason: 'trusted-core-not-owner' };
      for (const event of events) {
        if (recoveryMode) {
          if (!RECOVERY_ELIGIBLE_EVENTS.has(event.type)) {
            publishStatus('recovery-verification-pending');
            continue;
          }
          const recoveryType = recoveryMode === RECOVERY_MODES.CONTROLLED
            ? TIMER_COMMANDS.RECONCILE_OWNERSHIP
            : TIMER_COMMANDS.RECOVER_INTERRUPTION;
          await commit(recoveryType, { observation: event });
          recoveryMode = null;
          publishStatus('recovery-reconciled');
          continue;
        }
        if (!shouldForwardNonPositive(event)) continue;
        await commit(TIMER_COMMANDS.ACCEPT_OBSERVATION, { observation: event });
        publishStatus('bridge-event-committed');
      }
      return { accepted: true, revision: authorityDocument?.revision ?? null };
    });
  }

  function bridgeOptions() {
    const bridgeEnvironment = options.bridgeEnvironment || {};
    return {
      ...bridgeEnvironment,
      sourceRuntimeId: authorityClient.snapshot().runtimeInstanceId,
      documentToken: authorityClient.snapshot().documentToken,
      completionObservationAvailable: authorityClient.snapshot().nativeObservationAvailable,
      onForwardEvidence: evidence => authorityClient.forwardNativeEvidence(evidence),
      onVerificationHint: () => authorityClient.forwardNativeEvidence({
        kind: 'PASSIVE_ACTIVITY_HINT',
        sourceRuntimeId: authorityClient.snapshot().runtimeInstanceId,
        documentToken: authorityClient.snapshot().documentToken
      }),
      onEvents: acceptBridgeEvents,
      onHealthChange: value => {
        if (value.lastError) publishStatus('bridge-degraded', value.lastError);
      }
    };
  }

  async function resolveMigrationAndBridge() {
    if (migrationInFlight) {
      publishStatus('legacy-migration-in-progress');
      return snapshot();
    }
    // Re-inspect on every explicit settlement. FAILED and UNAVAILABLE can be
    // transient, and SOURCE_CHANGED may become COMPLETE_MATCH after the old
    // runtime is stopped and the exact retained bytes are restored. The
    // positive disposition allowlist below remains the only unblock path.
    preflight = inspectLegacyMigration(legacyStorage, authorityDocument);
    if (preflight.disposition === MIGRATION_DISPOSITIONS.REQUIRED && authorityOwner) {
      const legacySources = preflight.sources;
      const legacyPreferences = legacyPreferencesFromSources(legacySources);
      if (legacyPreferences) pendingLegacyPreferences = legacyPreferences;
      migrationInFlight = true;
      publishStatus('legacy-migration-in-progress');
      let migrationError = null;
      try {
        const envelope = commandEnvelope(AUTHORITY_COMMANDS.MIGRATE_V07, { legacySources });
        if (typeof authorityClient.migrationCommand !== 'function') {
          throw new Error('trusted-transition-migration-command-unavailable');
        }
        await authorityClient.migrationCommand(envelope);
      } catch (error) {
        migrationError = error;
      }
      try { await refreshDocument(); } catch (error) { migrationError = migrationError || error; }
      preflight = inspectLegacyMigration(legacyStorage, authorityDocument);
      migrationInFlight = false;
      if (migrationError && preflight.disposition !== MIGRATION_DISPOSITIONS.COMPLETE_MATCH) {
        preflight = Object.freeze({ checked: false, blocked: true,
          reason: 'legacy-preflight-failed', disposition: MIGRATION_DISPOSITIONS.FAILED,
          presentKeys: preflight.presentKeys });
        blocked = true;
        publishStatus(preflight.reason, migrationError);
        return snapshot();
      }
    }
    blocked = preflight.blocked;
    if (blocked) {
      publishStatus(preflight.reason);
      return snapshot();
    }
    const preferenceSnapshot = normalizePreferenceSnapshot(authorityDocument?.dataSafety?.preferences);
    if (preferenceSnapshot.initialized) pendingLegacyPreferences = null;
    if (!preferenceSnapshot.initialized && !pendingLegacyPreferences &&
      preflight.disposition === MIGRATION_DISPOSITIONS.COMPLETE_MATCH) {
      let retained;
      try {
        retained = retainedLegacyPreferences(legacyStorage, authorityDocument);
      } catch (_) {
        retained = { preflight: inspectLegacyMigration(legacyStorage, authorityDocument), preferences: null };
      }
      preflight = retained.preflight;
      blocked = preflight.blocked;
      if (blocked) {
        publishStatus(preflight.reason);
        return snapshot();
      }
      pendingLegacyPreferences = retained.preferences;
    }
    if (!preferenceSnapshot.initialized && pendingLegacyPreferences) {
      // Confirm the retained authority-sensitive source still matches before
      // deriving a second authoritative revision from its bounded settings.
      // The source remains read-only throughout this recovery path.
      preflight = inspectLegacyMigration(legacyStorage, authorityDocument);
      blocked = preflight.blocked;
      if (blocked) {
        publishStatus(preflight.reason);
        return snapshot();
      }
      try {
        await commit(PREFERENCE_COMMANDS.INITIALIZE, {
          legacyPreferences: pendingLegacyPreferences,
          expectedPreferenceRevision: preferenceSnapshot.preferenceRevision
        });
        pendingLegacyPreferences = null;
      } catch (error) {
        // Timer/Ledger migration is already proven COMPLETE_MATCH. A settings
        // initialization failure may retry later, but must not relabel the
        // completed migration as FAILED or import it twice.
        publishStatus('legacy-preferences-initialization-deferred', error);
      }
    }
    if (!bridge) {
      // Recovery classification belongs to a fresh Bridge attachment (or an
      // explicit authority reacquisition), not to ordinary health settlement.
      determineRecoveryMode();
      bridge = createBridge(bridgeOptions());
      await bridge.ensure({ owner: authorityOwner, authorityTenure });
    } else {
      await bridge.setOwner(authorityOwner, authorityTenure);
    }
    publishStatus(authorityOwner ? 'trusted-core-owner-active' : 'trusted-core-observer-active');
    return snapshot();
  }

  async function ensure(connection = null) {
    if (disposed) throw new Error('trusted-transition-core-disposed');
    if (initialized) return snapshot();
    if (initializationPromise) return initializationPromise;
    const task = (async () => {
      if (!unsubscribe) unsubscribe = authorityClient.subscribe(event => {
        if (event?.verificationHint && bridge && authorityOwner && !blocked) {
          bridge.verifyNow('forwarded-passive-activity-hint').catch(error => publishStatus('bridge-degraded', error));
          return;
        }
        if (event?.nativeEvidence && bridge && authorityOwner && !blocked) {
          bridge.observeNativeCompletion(event.nativeEvidence).catch(error => publishStatus('bridge-evidence-rejected', error));
          return;
        }
        if (!adopt(event)) return;
        if (!initialized || initializationPromise || disposed) {
          publishStatus('authority-document-updated');
          return;
        }
        if (migrationInFlight || (!blocked && bridge)) {
          publishStatus('authority-document-updated');
          return;
        }
        serializeReconciliation(resolveMigrationAndBridge).catch(error => {
          blocked = true;
          publishStatus('legacy-preflight-failed', error);
        });
      });
      const connected = connection || await authorityClient.ensure();
      adopt(connected?.initialRead);
      await refreshDocument();
      const authority = authorityClient.snapshot();
      authorityOwner = authority.healthy === true && authority.disposition === 'OWNER';
      authorityTenure = normalizeAuthorityTenure(authority);
      await serializeReconciliation(resolveMigrationAndBridge);
      initialized = true;
      try { onStatusChange(snapshot()); } catch (_) {}
      return snapshot();
    })();
    initializationPromise = task;
    try { return await task; }
    finally { if (initializationPromise === task) initializationPromise = null; }
  }

  async function handleAuthoritySnapshot(authority) {
    if (initializationPromise) await initializationPromise;
    if (!initialized || disposed) return snapshot();
    return serializeReconciliation(async () => {
      const nextOwner = authority?.healthy === true && authority.disposition === 'OWNER';
      const nextTenure = normalizeAuthorityTenure(authority);
      const tenureChanged = !sameAuthorityTenure(authorityTenure, nextTenure);
      const changed = authorityOwner !== nextOwner || tenureChanged;
      if (!changed) return snapshot();
      const acquired = !authorityOwner && nextOwner;
      const ownerTenureChanged = authorityOwner && nextOwner && tenureChanged;
      authorityOwner = nextOwner;
      authorityTenure = nextTenure;
      if (blocked || !bridge) {
        await refreshDocument();
        return resolveMigrationAndBridge();
      }
      if (acquired || ownerTenureChanged) {
        await refreshDocument();
        determineRecoveryMode(true);
      }
      await bridge.setOwner(authorityOwner, authorityTenure);
      publishStatus(authorityOwner ? 'trusted-core-owner-active' : 'trusted-core-observer-active');
      return snapshot();
    });
  }

  async function settle(connection = null) {
    if (disposed) throw new Error('trusted-transition-core-disposed');
    const connected = connection || await authorityClient.ensure();
    await ensure(connected);
    return serializeReconciliation(async () => {
      // The connection read may have waited behind initialization or another
      // reconciliation.  Re-read inside this critical section so settlement
      // can never replace a newer subscribed document with that stale value.
      await refreshDocument();
      const authority = authorityClient.snapshot();
      const nextOwner = authority.healthy === true && authority.disposition === 'OWNER';
      const nextTenure = normalizeAuthorityTenure(authority);
      const tenureChanged = !sameAuthorityTenure(authorityTenure, nextTenure);
      const acquired = !authorityOwner && nextOwner;
      const ownerTenureChanged = authorityOwner && nextOwner && tenureChanged;
      authorityOwner = nextOwner;
      authorityTenure = nextTenure;
      if (acquired || ownerTenureChanged) determineRecoveryMode(true);
      return resolveMigrationAndBridge();
    });
  }

  async function verifyNow(trigger = 'manual') {
    if (!bridge || blocked || disposed) return snapshot();
    await bridge.verifyNow(trigger);
    return snapshot();
  }

  async function userCommand(type) {
    if (!USER_TIMER_COMMANDS.has(type)) throw new Error('trusted-transition-user-command-unsupported');
    return serialize(async () => {
      const view = timerView();
      if (!view) throw new Error('trusted-transition-timer-view-unavailable');
      const values = {
        contextId: view.currentContextId,
        originatedAtMs: now()
      };
      if (type === TIMER_COMMANDS.LOCAL_PAUSE) values.expectedSessionId = view.running?.sessionId || null;
      const result = await commit(type, values);
      publishStatus('user-command-committed');
      return result;
    });
  }

  async function preferenceCommand(patch, expectedPreferenceRevision) {
    return serialize(async () => {
      if (!authorityDocument) await refreshDocument();
      const result = await commit(PREFERENCE_COMMANDS.COMMIT, { patch, expectedPreferenceRevision });
      publishStatus('preferences-committed');
      return result;
    });
  }

  async function initializePreferences(legacyPreferences = {}) {
    return serialize(async () => {
      if (!authorityDocument) await refreshDocument();
      const current = normalizePreferenceSnapshot(authorityDocument.dataSafety?.preferences);
      if (current.initialized) return { initialized: true, alreadyInitialized: true, preferences: current };
      const result = await commit(PREFERENCE_COMMANDS.INITIALIZE, {
        legacyPreferences,
        expectedPreferenceRevision: current.preferenceRevision
      });
      publishStatus('preferences-initialized');
      return result;
    });
  }

  function dataExport(kind, values = {}) {
    if (!authorityDocument) throw new Error('trusted-transition-document-unavailable');
    const document = viewDocument();
    if (kind === 'FULL_BACKUP') return createFullBackup(document, {
      ...values,
      appVersion: options.appVersion || options.buildVersion || 'unknown'
    });
    if (kind === 'HISTORY_CSV') return createHistoryCsv(document);
    if (kind === 'TIME_REPORT_CSV') return createTimeReportCsv(document, { ...values, atMs: now() });
    throw new Error('trusted-transition-data-export-unsupported');
  }

  function analyticsSnapshot(view = {}) {
    if (!authorityDocument || disposed || blocked) throw new Error('analytics-source-unavailable');
    return createAnalyticsSnapshot(viewDocument(), { ...view, atMs: now() });
  }

  async function stageDataAction(type, values = {}) {
    if (!DATA_COMMAND_TYPES.has(type)) throw new Error('trusted-transition-data-command-unsupported');
    return serialize(async () => {
      if (!authorityDocument) await refreshDocument();
      const request = deepClone({ type, ...values });
      const staged = stageDataOperation(authorityDocument, request, { nowMs: now() });
      stagedDataPlans.set(staged.plan.planId, { request, plan: staged.plan });
      while (stagedDataPlans.size > 8) stagedDataPlans.delete(stagedDataPlans.keys().next().value);
      return staged.plan;
    });
  }

  async function commitDataAction(planId, values = {}) {
    return serialize(async () => {
      const staged = stagedDataPlans.get(String(planId || ''));
      if (!staged) throw new Error('trusted-transition-data-plan-unavailable');
      const envelope = commandEnvelope(staged.request.type, {
        operationId: randomId('data-operation'),
        stagedRevision: staged.plan.stagedRevision,
        planId: staged.plan.planId,
        request: staged.request,
        confirmationTokens: Array.isArray(values.confirmationTokens) ? values.confirmationTokens.map(String) : [],
        preBackupDisposition: values.preBackupDisposition
      });
      try {
        const result = await authorityClient.command(envelope);
        await refreshDocument();
        stagedDataPlans.clear();
        if (bridge && ['DATA_RESTORE_BACKUP', 'DATA_WIPE_HISTORY'].includes(staged.request.type)) {
          await bridge.verifyNow('post-data-mutation-verification');
        }
        publishStatus('data-operation-committed');
        return result;
      } catch (error) {
        try { await refreshDocument(); } catch (_) {}
        throw error;
      }
    });
  }

  async function prepareDisable() {
    if (prepareDisablePromise) return prepareDisablePromise;
    const task = serialize(async () => {
      if (disposed) return { disabled: true, alreadyDisposed: true };
      if (blocked) return { disabled: false, blocked: true, reason: preflight.reason };
      if (!authorityDocument) await refreshDocument();
      const state = timerKind(authorityDocument.timer);
      if (state !== 'IDLE') {
        await commit(TIMER_COMMANDS.COMPANION_DISABLE, {
          contextId: authorityDocument.timer.active?.contextId ||
            authorityDocument.timer.pending?.contextId ||
            authorityDocument.timer.localPause?.contextId || null,
          expectedSessionId: authorityDocument.timer.active?.sessionId || null,
          originatedAtMs: now()
        });
      }
      if (bridge) await bridge.teardown();
      publishStatus('companion-disable-finalized');
      return { disabled: true, revision: authorityDocument?.revision ?? null };
    });
    prepareDisablePromise = task;
    try { return await task; }
    finally { if (prepareDisablePromise === task) prepareDisablePromise = null; }
  }

  async function prepareControlledTeardown() {
    return serialize(async () => {
      if (disposed || blocked) return { checkpointed: false };
      if (bridge) await bridge.teardown();
      if (authorityOwner && authorityDocument?.timer?.active) {
        await commit(TIMER_COMMANDS.CONTROLLED_TEARDOWN, {
          contextId: authorityDocument.timer.active.contextId,
          expectedSessionId: authorityDocument.timer.active.sessionId
        });
        publishStatus('controlled-teardown-checkpointed');
        return { checkpointed: true };
      }
      return { checkpointed: false };
    });
  }

  async function teardown() {
    if (disposed) return snapshot();
    disposed = true;
    if (bridge) await bridge.teardown();
    if (unsubscribe) unsubscribe();
    unsubscribe = null;
    stagedDataPlans.clear();
    publishStatus('trusted-core-torn-down');
    return snapshot();
  }

  return Object.freeze({
    ensure,
    settle,
    handleAuthoritySnapshot,
    verifyNow,
    userCommand,
    preferenceCommand,
    initializePreferences,
    prepareDisable,
    prepareControlledTeardown,
    teardown,
    snapshot,
    acceptBridgeEvents,
    dataExport,
    analyticsSnapshot,
    stageDataAction,
    commitDataAction
  });
}

module.exports = {
  RECOVERY_MODES,
  RECOVERY_ELIGIBLE_EVENTS,
  legacyPreferencesFromSources,
  createTrustedTransitionCore
};
