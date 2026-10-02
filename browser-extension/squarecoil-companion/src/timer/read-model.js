'use strict';

const {
  TIMER_STATES,
  deepClone,
  deepFreeze,
  isNonNegativeInteger,
  isTimestamp,
  timerKind,
  validateDocument
} = require('../data/model');
const {
  DAY_MS,
  createQueryService,
  effectiveActiveEnd,
  localDateAt,
  virtualActiveSegments,
  weekStartDate
} = require('../data/ledger');
const {
  DEFAULT_TIMER_LIMITS_MS,
  normalizeTimerLimits,
  thresholdLevel,
  focusIntentFromTimer
} = require('../workspace/model');
const { normalizePreferenceSnapshot } = require('../preferences/preferences');

const DEFAULT_VERIFICATION_GRACE_MS = 90 * 1000;
const DEFAULT_HISTORY_LIMIT = 100;
const MAX_HISTORY_LIMIT = Number.MAX_SAFE_INTEGER;

function operationalContextId(timer) {
  return timer.active?.contextId || timer.pending?.contextId || timer.localPause?.contextId || null;
}

function freshPositiveObservation(timer, contextId, atMs, verificationGraceMs) {
  const observation = timer.lastObservation;
  if (!observation || observation.contextId !== contextId) return false;
  if (!isTimestamp(observation.observedAtMs) || observation.observedAtMs > atMs) return false;
  if (atMs - observation.observedAtMs > verificationGraceMs) return false;
  return ['CONTEXT_DETECTED', 'CONTEXT_CHANGED', 'CONTEXT_VERIFIED', 'CONTEXT_METADATA_UPDATED'].includes(observation.type);
}

function readableDocument(source) {
  const document = deepClone(source);
  if (!document?.authorityView?.redacted) return document;
  if (document.authorityView.schemaVersion !== 1) throw new Error('timer-read-model-authority-view-unsupported');
  delete document.authorityView;
  document.commandReceipts = {};
  document.commandReceiptOrder = [];
  if (document.revision > 0) document.commitFence = { ownerRuntimeId: 'redacted-authority-owner', coordinationEpoch: 1, fencingToken: 1 };
  if (document.timer?.active) {
    if (document.timer.active.accrualOwnershipBound !== true) throw new Error('timer-read-model-active-ownership-unproven');
    delete document.timer.active.accrualOwnershipBound;
    document.timer.active.accrualOwnerToken = 'redacted-authority-owner';
  }
  if (document.checkpoint?.ownershipEvidence) {
    const evidence = document.checkpoint.ownershipEvidence;
    const disposition = String(evidence.disposition || '').toUpperCase();
    if (['OWNER', 'OBSERVER_CONNECTED'].includes(disposition)) {
      if (evidence.ownershipBound !== true) throw new Error('timer-read-model-checkpoint-ownership-unproven');
      document.checkpoint.ownershipEvidence = { ownerRuntimeId: 'redacted-authority-owner', coordinationEpoch: 1, fencingToken: 'redacted-authority-fence', disposition };
    } else document.checkpoint.ownershipEvidence = { ownerRuntimeId: null, coordinationEpoch: null, fencingToken: null, disposition };
  }
  return document;
}

function contextLabel(context) {
  return String(context?.currentLabel || context?.label || context?.shortLabel || context?.projectId || 'Unknown Context');
}

function contextStatus(document, contextId) {
  if (document.timer.active?.contextId === contextId) {
    if (document.timer.active.safetyHold) return 'VERIFICATION_HOLD';
    if (document.timer.active.provisionalSinceMs) return 'RUNNING_PROVISIONAL';
    return 'RUNNING';
  }
  if (document.timer.pending?.contextId === contextId) return 'AWAITING_CHOICE';
  if (document.timer.localPause?.contextId === contextId) return 'LOCALLY_PAUSED';
  return 'NOT_RUNNING';
}

function lastRecordedActivity(document, contextId) {
  let latest = 0;
  for (const segment of document.ledger) if (segment.contextId === contextId) latest = Math.max(latest, segment.endAtMs);
  if (document.timer.active?.contextId === contextId) latest = Math.max(latest, document.timer.active.lastVerifiedAtMs, document.timer.active.startedAtMs);
  if (document.timer.pending?.contextId === contextId) latest = Math.max(latest, document.timer.pending.lastContinuityVerifiedAtMs);
  if (document.timer.localPause?.contextId === contextId) latest = Math.max(latest, document.timer.localPause.pausedAtMs);
  return latest || null;
}

function resolveHistoryLimit(value) {
  if (value === undefined) return DEFAULT_HISTORY_LIMIT;
  if (!Number.isSafeInteger(value) || value < 1) throw new Error('timer-read-model-history-limit-invalid');
  return value;
}

function logicalHistory(document) {
  const segments = document.ledger.slice().sort((left, right) =>
    left.startAtMs - right.startAtMs || left.endAtMs - right.endAtMs || left.segmentId.localeCompare(right.segmentId)
  );
  const groups = [];
  for (const segment of segments) {
    const previous = groups.at(-1);
    const safeContinuation = Boolean(previous &&
      previous.sessionId === segment.sessionId &&
      previous.cycleId === segment.cycleId &&
      previous.contextId === segment.contextId &&
      previous.endAtMs === segment.startAtMs &&
      previous.workdayZone === segment.workdayZone);
    if (safeContinuation) {
      previous.endAtMs = segment.endAtMs;
      previous.durationMs += segment.durationMs;
      previous.endReason = segment.endReason || previous.endReason;
      previous.segmentIds.push(segment.segmentId);
      if (!previous.localDates.includes(segment.localDate)) previous.localDates.push(segment.localDate);
      previous.segmentProvenance.push({ segmentId: segment.segmentId, source: segment.source || null, certainty: segment.certainty || null, provenance: deepClone(segment.provenance || null) });
      continue;
    }
    const context = document.contexts[segment.contextId] || null;
    groups.push({
      logicalSessionId: `${segment.sessionId}:${segment.cycleId}:${segment.contextId}:${segment.startAtMs}`,
      sessionId: segment.sessionId,
      cycleId: segment.cycleId,
      contextId: segment.contextId,
      label: contextLabel(context),
      shortLabel: String(context?.shortLabel || context?.projectId || 'General'),
      projectId: context?.kind === 'job' ? String(context.projectId) : null,
      startAtMs: segment.startAtMs,
      endAtMs: segment.endAtMs,
      durationMs: segment.durationMs,
      localDate: segment.localDate,
      localDates: [segment.localDate],
      workdayZone: segment.workdayZone,
      startCause: segment.startCause || null,
      endReason: segment.endReason || null,
      segmentIds: [segment.segmentId],
      segmentProvenance: [{ segmentId: segment.segmentId, source: segment.source || null, certainty: segment.certainty || null, provenance: deepClone(segment.provenance || null) }]
    });
  }
  return groups.sort((left, right) =>
    right.endAtMs - left.endAtMs || right.startAtMs - left.startAtMs || left.logicalSessionId.localeCompare(right.logicalSessionId)
  );
}

function timeBasis(document, deviceTimeZone) {
  const disposition = document.workdayZoneDisposition || { source: 'UNKNOWN', fallback: document.workdayZone === 'UTC', diagnostic: null };
  const deviceMismatch = Boolean(deviceTimeZone && deviceTimeZone !== document.workdayZone);
  const disclosed = disposition.fallback === true || deviceMismatch || Boolean(disposition.diagnostic);
  return {
    timeZone: document.workdayZone,
    source: disposition.source,
    fallback: disposition.fallback === true,
    diagnostic: disposition.diagnostic || null,
    deviceTimeZone: deviceTimeZone || null,
    deviceMismatch,
    disclosed,
    label: `Time basis: ${document.workdayZone}${disposition.fallback === true ? ' fallback' : ''}`
  };
}

function createTimerReadModel(getDocument, options = {}) {
  if (typeof getDocument !== 'function') throw new Error('timer-read-model-source-required');
  const now = options.now || (() => Date.now());
  const verificationGraceMs = options.verificationGraceMs ?? DEFAULT_VERIFICATION_GRACE_MS;
  if (!isNonNegativeInteger(verificationGraceMs)) throw new Error('timer-read-model-verification-grace-invalid');
  const configuredTimerLimits = options.timerLimits ? normalizeTimerLimits(options.timerLimits) : null;
  const configuredPreferenceRevision = isNonNegativeInteger(options.sourcePreferenceRevision) ? options.sourcePreferenceRevision : null;

  function snapshot(view = {}) {
    const source = getDocument();
    if (!source) throw new Error('data-document-unavailable');
    const document = readableDocument(source);
    validateDocument(document);
    const preferences = normalizePreferenceSnapshot(document.dataSafety?.preferences);
    const timerLimits = configuredTimerLimits || normalizeTimerLimits({
      yellow: preferences.yellowMinutes * 60_000,
      orange: preferences.orangeMinutes * 60_000,
      red: preferences.redMinutes * 60_000
    });
    const sourcePreferenceRevision = configuredPreferenceRevision ?? preferences.preferenceRevision;
    const atMs = view.atMs === undefined ? now() : view.atMs;
    if (!isTimestamp(atMs)) throw new Error('timer-read-model-at-invalid');
    const historyLimit = resolveHistoryLimit(view.historyLimit);
    const queries = createQueryService(() => document, { now: () => atMs });
    const state = timerKind(document.timer);
    const currentContextId = operationalContextId(document.timer);
    const requestedSelection = view.selectedContextId || currentContextId;
    const selectedContextId = requestedSelection && document.contexts[requestedSelection] ? requestedSelection : null;
    const active = document.timer.active;
    const held = Boolean(active?.safetyHold);
    const provisional = Boolean(active?.provisionalSinceMs) && !held;
    const effectiveEndAtMs = active ? effectiveActiveEnd(active, atMs) : null;
    const positiveCurrent = currentContextId ? freshPositiveObservation(document.timer, currentContextId, atMs, verificationGraceMs) : false;
    const pendingReady = state === TIMER_STATES.PENDING && document.timer.pending.continuityState === 'VALID' && positiveCurrent;
    const localResumeReady = state === TIMER_STATES.LOCAL_PAUSED && positiveCurrent;
    const todayDate = localDateAt(atMs, document.workdayZone);
    const currentWeekStart = weekStartDate(atMs, document.workdayZone);
    const currentWeekEnd = new Date(Date.parse(`${currentWeekStart}T12:00:00Z`) + 7 * DAY_MS).toISOString().slice(0, 10);
    const allSegments = [...document.ledger, ...virtualActiveSegments(document, atMs)];

    const contextRows = Object.values(document.contexts).map(context => {
      const contextId = context.contextId;
      const recordedAtMs = lastRecordedActivity(document, contextId);
      const lastSeenAtMs = isTimestamp(context.lastSeenAtMs) ? context.lastSeenAtMs : null;
      const todayMs = queries.getContextToday(contextId, atMs);
      const totalMs = queries.getContextTotal(contextId, atMs);
      const containsLiveContribution = active?.contextId === contextId && effectiveEndAtMs > active.startedAtMs;
      return {
        contextId,
        kind: context.kind,
        projectId: context.kind === 'job' ? String(context.projectId) : null,
        label: contextLabel(context),
        shortLabel: String(context.shortLabel || context.projectId || 'General'),
        workspaceMembership: context.workspaceMembership || null,
        archivedAtMs: context.archivedAtMs ?? null,
        lastSeenAtMs,
        lastRecordedActivityAtMs: recordedAtMs,
        todayMs,
        totalMs,
        legacyUnattributedMs: Math.max(0, Number(context.legacyUnattributedMs) || 0),
        status: contextStatus(document, contextId),
        isOperational: contextId === currentContextId,
        isSelected: contextId === selectedContextId,
        isProvisional: containsLiveContribution && provisional,
        isSafetyHeld: containsLiveContribution && held,
        thresholdLevel: thresholdLevel(todayMs, timerLimits),
        sourceStateRevision: document.revision,
        sourcePreferenceRevision,
        queryAtMs: atMs
      };
    }).sort((left, right) =>
      left.isOperational !== right.isOperational ? (left.isOperational ? -1 : 1) :
        (right.lastSeenAtMs || 0) - (left.lastSeenAtMs || 0) || left.contextId.localeCompare(right.contextId)
    );
    const rowById = new Map(contextRows.map(row => [row.contextId, row]));

    const todayByContext = queries.getDayByContext(todayDate, atMs).map(row => {
      const contextRow = rowById.get(row.contextId);
      return {
        contextId: row.contextId,
        label: contextRow?.label || 'Unknown Context',
        shortLabel: contextRow?.shortLabel || 'General',
        durationMs: row.durationMs,
        lastRecordedActivityAtMs: contextRow?.lastRecordedActivityAtMs || null,
        status: contextRow?.status || 'NOT_RUNNING',
        isProvisional: contextRow?.isProvisional === true,
        isSafetyHeld: contextRow?.isSafetyHeld === true,
        sourceStateRevision: document.revision,
        queryAtMs: atMs
      };
    });
    if (currentContextId && !todayByContext.some(row => row.contextId === currentContextId)) {
      const contextRow = rowById.get(currentContextId);
      todayByContext.push({
        contextId: currentContextId,
        label: contextRow?.label || 'Unknown Context',
        shortLabel: contextRow?.shortLabel || 'General',
        durationMs: 0,
        lastRecordedActivityAtMs: contextRow?.lastRecordedActivityAtMs || null,
        status: contextRow?.status || 'NOT_RUNNING',
        isProvisional: false,
        isSafetyHeld: contextRow?.isSafetyHeld === true,
        sourceStateRevision: document.revision,
        queryAtMs: atMs
      });
    }
    todayByContext.sort((left, right) => right.durationMs - left.durationMs ||
      (right.lastRecordedActivityAtMs || 0) - (left.lastRecordedActivityAtMs || 0) || left.contextId.localeCompare(right.contextId));

    const byDayMap = new Map();
    for (const segment of allSegments) {
      const row = byDayMap.get(segment.localDate) || { localDate: segment.localDate, durationMs: 0, contextIds: new Set(), top: new Map() };
      row.durationMs += segment.durationMs;
      row.contextIds.add(segment.contextId);
      row.top.set(segment.contextId, (row.top.get(segment.contextId) || 0) + segment.durationMs);
      byDayMap.set(segment.localDate, row);
    }
    const byDayRows = [...byDayMap.values()].map(row => {
      const top = [...row.top.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0] || null;
      return {
        localDate: row.localDate,
        durationMs: row.durationMs,
        contextCount: row.contextIds.size,
        topContextId: top?.[0] || null,
        topContextLabel: top ? rowById.get(top[0])?.label || 'Unknown Context' : null,
        topContextDurationMs: top?.[1] || 0
      };
    }).sort((left, right) => right.localDate.localeCompare(left.localDate));

    const byContextRows = contextRows.filter(row => row.totalMs > 0 || row.isOperational).slice().sort((left, right) =>
      (right.lastRecordedActivityAtMs || 0) - (left.lastRecordedActivityAtMs || 0) || left.contextId.localeCompare(right.contextId));
    const logicalRows = logicalHistory(document);
    const historyRows = logicalRows.slice(0, historyLimit);
    const contextDetails = Object.create(null);
    const selectedContextRow = selectedContextId ? rowById.get(selectedContextId) : null;
    if (selectedContextRow) {
      const row = selectedContextRow;
      const dailyRows = queries.getContextByDay(row.contextId, { atMs });
      const weekMs = dailyRows.filter(day => day.localDate >= currentWeekStart && day.localDate < currentWeekEnd)
        .reduce((total, day) => total + day.durationMs, 0);
      const finalizedSessions = logicalRows.filter(session => session.contextId === row.contextId);
      const datedMs = document.ledger.filter(segment => segment.contextId === row.contextId)
        .reduce((total, segment) => total + segment.durationMs, 0);
      contextDetails[row.contextId] = { ...row, weekMs, datedMs, dailyRows, finalizedSessions, hasMoreSessions: false };
    }

    const lastObservation = document.timer.lastObservation ? {
      type: document.timer.lastObservation.type,
      contextId: document.timer.lastObservation.contextId || null,
      priorContextId: document.timer.lastObservation.priorContextId || null,
      observedAtMs: document.timer.lastObservation.observedAtMs ?? null,
      bridgeGeneration: document.timer.lastObservation.bridgeGeneration ?? null,
      bridgeSeq: document.timer.lastObservation.bridgeSeq ?? null,
      observationId: document.timer.lastObservation.observationId || null,
      streamRuntimeId: document.timer.lastObservation.streamRuntimeId || null
    } : null;
    const lastFocusTransition = document.timer.lastFocusTransition ? {
      type: document.timer.lastFocusTransition.type,
      contextId: document.timer.lastFocusTransition.contextId || null,
      priorContextId: document.timer.lastFocusTransition.priorContextId || null,
      observedAtMs: document.timer.lastFocusTransition.observedAtMs ?? null,
      bridgeGeneration: document.timer.lastFocusTransition.bridgeGeneration ?? null,
      bridgeSeq: document.timer.lastFocusTransition.bridgeSeq ?? null,
      observationId: document.timer.lastFocusTransition.observationId || null,
      streamRuntimeId: document.timer.lastFocusTransition.streamRuntimeId || null
    } : null;
    const nativeDisposition = lastObservation?.type === 'CLOCKED_OUT'
      ? 'SQUARECOIL_CLOCKED_OUT'
      : lastObservation?.type === 'CONTEXT_LEFT'
        ? 'NO_TRACKABLE_CONTEXT'
        : ['STATE_UNKNOWN', 'STATE_CONFLICT'].includes(lastObservation?.type)
          ? 'SQUARECOIL_STATE_UNKNOWN'
          : currentContextId ? 'TRACKABLE_CONTEXT' : 'NO_CURRENT_CONTEXT';

    const base = {
      revision: document.revision,
      sourceStateRevision: document.revision,
      sourcePreferenceRevision,
      updatedAtMs: document.updatedAtMs,
      workdayZone: document.workdayZone,
      workdayZoneDisposition: deepClone(document.workdayZoneDisposition),
      timeBasis: timeBasis(document, view.deviceTimeZone),
      queryAtMs: atMs,
      timerLimits,
      timerState: state,
      operationalStatus: currentContextId ? contextStatus(document, currentContextId) : 'NOT_RUNNING',
      nativeDisposition,
      reason: document.timer.lastReason || null,
      currentContextId,
      currentContext: currentContextId ? deepClone(document.contexts[currentContextId]) : null,
      selectedContextId,
      selectedContext: selectedContextId ? deepClone(document.contexts[selectedContextId]) : null,
      todayTotalMs: queries.getTodayTotal(atMs),
      weekTotalMs: queries.getWeekTotal(atMs),
      currentContextTodayMs: currentContextId ? queries.getContextToday(currentContextId, atMs) : 0,
      currentContextTotalMs: currentContextId ? queries.getContextTotal(currentContextId, atMs) : 0,
      selectedContextTodayMs: selectedContextId ? queries.getContextToday(selectedContextId, atMs) : 0,
      selectedContextTotalMs: selectedContextId ? queries.getContextTotal(selectedContextId, atMs) : 0,
      todayTotalIsProvisional: provisional,
      weekTotalIsProvisional: provisional,
      contextRows,
      todayByContext,
      byDayRows,
      byContextRows,
      contextDetails,
      historyRows,
      historyTotal: logicalRows.length,
      historyLimit,
      historyHasMore: historyRows.length < logicalRows.length,
      lastObservation,
      lastFocusTransition,
      running: active ? {
        sessionId: active.sessionId,
        cycleId: active.cycleId,
        startedAtMs: active.startedAtMs,
        effectiveEndAtMs,
        elapsedMs: Math.max(0, effectiveEndAtMs - active.startedAtMs),
        lastVerifiedAtMs: active.lastVerifiedAtMs,
        provisional,
        held,
        holdAtMs: active.safetyHold?.holdAtMs ?? null,
        holdReason: active.safetyHold?.reason ?? null
      } : null,
      pending: document.timer.pending ? {
        contextId: document.timer.pending.contextId,
        safeStartAnchorMs: document.timer.pending.safeStartAnchorMs,
        lastContinuityVerifiedAtMs: document.timer.pending.lastContinuityVerifiedAtMs,
        continuityState: document.timer.pending.continuityState
      } : null,
      localPause: document.timer.localPause ? {
        contextId: document.timer.localPause.contextId,
        cycleId: document.timer.localPause.cycleId,
        pausedAtMs: document.timer.localPause.pausedAtMs
      } : null,
      availableActions: {
        localPause: state === TIMER_STATES.ACTIVE,
        resume: pendingReady,
        startFresh: pendingReady,
        localResume: localResumeReady
      },
      commandPreconditions: {
        expectedRevision: document.revision,
        expectedContextId: currentContextId,
        expectedSessionId: active?.sessionId || null
      }
    };
    base.focusIntent = focusIntentFromTimer(base);
    return deepFreeze(base);
  }
  return { snapshot };
}

module.exports = {
  DEFAULT_VERIFICATION_GRACE_MS,
  DEFAULT_HISTORY_LIMIT,
  MAX_HISTORY_LIMIT,
  operationalContextId,
  freshPositiveObservation,
  readableDocument,
  contextLabel,
  contextStatus,
  lastRecordedActivity,
  logicalHistory,
  timeBasis,
  createTimerReadModel
};
