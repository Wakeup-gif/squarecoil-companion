'use strict';

const MAX_VISIBLE_JOB_TABS = 5;
const DEFAULT_TIMER_LIMITS_MS = Object.freeze({
  yellow: 60 * 60 * 1000,
  orange: 120 * 60 * 1000,
  red: 240 * 60 * 1000
});
const THRESHOLD_LABELS = Object.freeze({
  NONE: 'Below timer limit',
  YELLOW: 'Yellow timer limit',
  ORANGE: 'Orange timer limit',
  RED: 'Red timer limit'
});

function safeCounter(value, fallback = 0) {
  return Number.isSafeInteger(value) && value >= 0 ? value : fallback;
}

function normalizeTimerLimits(input = DEFAULT_TIMER_LIMITS_MS) {
  const yellow = safeCounter(input.yellow, DEFAULT_TIMER_LIMITS_MS.yellow);
  const orange = safeCounter(input.orange, DEFAULT_TIMER_LIMITS_MS.orange);
  const red = safeCounter(input.red, DEFAULT_TIMER_LIMITS_MS.red);
  if (!(yellow <= orange && orange <= red)) throw new Error('workspace-threshold-order-invalid');
  return Object.freeze({ yellow, orange, red });
}

function thresholdLevel(todayMs, inputLimits = DEFAULT_TIMER_LIMITS_MS) {
  const value = Math.max(0, Number(todayMs) || 0);
  const limits = normalizeTimerLimits(inputLimits);
  if (value >= limits.red) return 'RED';
  if (value >= limits.orange) return 'ORANGE';
  if (value >= limits.yellow) return 'YELLOW';
  return 'NONE';
}

function stableRowOrder(rows, durableOrder = []) {
  const known = new Map((rows || []).map(row => [String(row.contextId), row]));
  const result = [];
  for (const value of durableOrder || []) {
    const contextId = String(value);
    if (known.has(contextId) && !result.includes(contextId)) result.push(contextId);
  }
  const remaining = [...known.values()].filter(row => !result.includes(String(row.contextId)));
  remaining.sort((left, right) =>
    (right.lastSeenAtMs || 0) - (left.lastSeenAtMs || 0) ||
    String(left.contextId).localeCompare(String(right.contextId))
  );
  for (const row of remaining) result.push(String(row.contextId));
  return result;
}

function deriveTabWorkspace(rows, state = {}) {
  const eligible = (rows || []).filter(row =>
    row?.contextId && row.archivedAtMs == null &&
    String(row.workspaceMembership || '').toUpperCase() === 'RECENT'
  );
  const byId = new Map(eligible.map(row => [String(row.contextId), row]));
  const order = stableRowOrder(eligible, state.durableOrder);
  const orderIndex = new Map(order.map((contextId, index) => [contextId, index]));
  const hidden = new Set((state.hiddenContextIds || []).map(String));
  const selectedContextId = state.selectedContextId ? String(state.selectedContextId) : null;
  const operationalContextId = state.operationalContextId ? String(state.operationalContextId) : null;

  // Operational truth is never hidden. A remotely hidden inspection target may
  // remain selected while its tab chrome disappears.
  if (operationalContextId) hidden.delete(operationalContextId);

  const general = eligible.filter(row => row.kind === 'general' && !hidden.has(String(row.contextId)));
  const jobs = eligible.filter(row => row.kind !== 'general' && !hidden.has(String(row.contextId)));
  const protectedIds = new Set([
    operationalContextId,
    selectedContextId && !hidden.has(selectedContextId) ? selectedContextId : null
  ].filter(Boolean));
  const protectedJobs = jobs.filter(row => protectedIds.has(String(row.contextId)));
  const remainingJobs = jobs.filter(row => !protectedIds.has(String(row.contextId))).sort((left, right) =>
    (right.lastSeenAtMs || 0) - (left.lastSeenAtMs || 0) ||
    (orderIndex.get(String(left.contextId)) ?? Number.MAX_SAFE_INTEGER) -
      (orderIndex.get(String(right.contextId)) ?? Number.MAX_SAFE_INTEGER) ||
    String(left.contextId).localeCompare(String(right.contextId))
  );
  const jobCapacity = Math.max(MAX_VISIBLE_JOB_TABS, protectedJobs.length);
  const visibleJobIds = new Set([
    ...protectedJobs.map(row => String(row.contextId)),
    ...remainingJobs.slice(0, Math.max(0, jobCapacity - protectedJobs.length)).map(row => String(row.contextId))
  ]);
  const visibleIds = new Set([
    ...general.map(row => String(row.contextId)),
    ...visibleJobIds
  ]);
  const visibleRows = order.filter(contextId => visibleIds.has(contextId)).map(contextId => byId.get(contextId));
  const overflowContextIds = order.filter(contextId => byId.get(contextId)?.kind !== 'general' &&
    !hidden.has(contextId) && !visibleIds.has(contextId));
  const dispositionByContextId = Object.create(null);
  for (const contextId of order) {
    dispositionByContextId[contextId] = hidden.has(contextId)
      ? 'HIDDEN'
      : visibleIds.has(contextId) ? 'VISIBLE' : 'OVERFLOW';
  }
  return Object.freeze({
    order: Object.freeze(order),
    visibleRows: Object.freeze(visibleRows),
    overflowContextIds: Object.freeze(overflowContextIds),
    dispositionByContextId: Object.freeze(dispositionByContextId)
  });
}

function focusIntentFromTimer(timer) {
  const observation = timer?.lastFocusTransition || timer?.lastObservation;
  const currentContextId = timer?.currentContextId || null;
  if (!observation || !currentContextId || observation.contextId !== currentContextId) return null;
  if (!['CONTEXT_CHANGED', 'CONTEXT_DETECTED'].includes(observation.type)) return null;
  if (observation.type === 'CONTEXT_CHANGED' && observation.priorContextId === currentContextId) return null;
  const identity = String(observation.observationId || [
    observation.streamRuntimeId || 'stream',
    observation.bridgeGeneration ?? 'generation',
    observation.bridgeSeq ?? 'sequence',
    observation.observedAtMs ?? 'time',
    observation.type,
    currentContextId
  ].join(':'));
  return Object.freeze({
    intentId: `focus:${identity}`,
    contextId: currentContextId,
    priorContextId: observation.priorContextId || null,
    transitionType: observation.type,
    observedAtMs: observation.observedAtMs ?? null,
    sourceStateRevision: timer.revision
  });
}

function focusIntentIsCurrent(intent, timer) {
  return Boolean(
    intent && timer &&
    intent.contextId === timer.currentContextId &&
    Number.isSafeInteger(intent.sourceStateRevision) &&
    intent.sourceStateRevision <= timer.revision
  );
}

function moveContext(order, contextId, beforeContextId = null) {
  const id = String(contextId || '');
  const before = beforeContextId == null ? null : String(beforeContextId);
  const next = (order || []).map(String).filter(value => value !== id);
  if (!id) return next;
  const targetIndex = before === null ? -1 : next.indexOf(before);
  if (targetIndex < 0) next.push(id);
  else next.splice(targetIndex, 0, id);
  return next;
}

function placeContext(order, contextId, targetContextId = null, placement = 'before') {
  const id = String(contextId || '');
  const target = targetContextId == null ? null : String(targetContextId);
  const next = (order || []).map(String).filter(value => value !== id);
  if (!id) return next;
  const targetIndex = target === null ? -1 : next.indexOf(target);
  if (targetIndex < 0) next.push(id);
  else next.splice(placement === 'after' ? targetIndex + 1 : targetIndex, 0, id);
  return next;
}

module.exports = {
  MAX_VISIBLE_JOB_TABS,
  DEFAULT_TIMER_LIMITS_MS,
  THRESHOLD_LABELS,
  normalizeTimerLimits,
  thresholdLevel,
  stableRowOrder,
  deriveTabWorkspace,
  focusIntentFromTimer,
  focusIntentIsCurrent,
  moveContext,
  placeContext
};
