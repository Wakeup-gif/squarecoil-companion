'use strict';

const {
  deepClone,
  deepFreeze,
  isTimestamp,
  validateSegment,
  assertWorkdayZone,
  assertLocalDate
} = require('./model');

const DAY_MS = 24 * 60 * 60 * 1000;
const formatterCache = new Map();

function assertTimeZone(timeZone) {
  return assertWorkdayZone(String(timeZone || ''));
}

function dateFormatter(timeZone) {
  const zone = assertTimeZone(timeZone);
  if (!formatterCache.has(zone)) {
    formatterCache.set(zone, new Intl.DateTimeFormat('en-CA', {
      timeZone: zone,
      year: 'numeric',
      month: '2-digit',
      day: '2-digit'
    }));
  }
  return formatterCache.get(zone);
}

function localDateAt(timestampMs, timeZone) {
  if (!isTimestamp(timestampMs)) throw new Error('timestamp-invalid');
  const values = {};
  for (const part of dateFormatter(timeZone).formatToParts(new Date(timestampMs))) {
    if (part.type !== 'literal') values[part.type] = part.value;
  }
  return [values.year, values.month, values.day].join('-');
}

function nextLocalDateBoundary(timestampMs, timeZone) {
  const date = localDateAt(timestampMs, timeZone);
  let low = timestampMs + 1;
  let high = timestampMs + (36 * 60 * 60 * 1000);
  while (localDateAt(high, timeZone) === date) {
    high += DAY_MS;
    if (high - timestampMs > 3 * DAY_MS) throw new Error('workday-boundary-not-found');
  }
  while (low < high) {
    const mid = low + Math.floor((high - low) / 2);
    if (localDateAt(mid, timeZone) === date) low = mid + 1;
    else high = mid;
  }
  return low;
}

function splitInterval(input, options = {}) {
  if (!input || typeof input !== 'object') throw new Error('interval-invalid');
  for (const field of ['sessionId', 'cycleId', 'contextId']) {
    if (typeof input[field] !== 'string' || !input[field].trim()) {
      throw new Error('interval-' + field + '-required');
    }
  }
  const startAtMs = Number(input.startAtMs);
  const endAtMs = Number(input.endAtMs);
  if (!isTimestamp(startAtMs) || !isTimestamp(endAtMs) || endAtMs < startAtMs) {
    throw new Error('interval-invalid');
  }
  const workdayZone = assertTimeZone(input.workdayZone || options.workdayZone);
  const makeId = options.makeId || ((sessionId, index) => String(sessionId) + ':segment:' + index);
  const createdAtMs = input.createdAtMs === undefined ? Date.now() : input.createdAtMs;
  if (!isTimestamp(createdAtMs)) throw new Error('interval-created-at-invalid');
  const rows = [];
  let cursor = startAtMs;
  let index = 0;

  if (startAtMs === endAtMs) return rows;

  while (cursor < endAtMs) {
    const boundary = nextLocalDateBoundary(cursor, workdayZone);
    const segmentEnd = Math.min(endAtMs, boundary);
    const segment = {
      segmentId: String(makeId(input.sessionId, index)),
      sessionId: String(input.sessionId),
      cycleId: String(input.cycleId),
      contextId: String(input.contextId),
      startAtMs: cursor,
      endAtMs: segmentEnd,
      durationMs: segmentEnd - cursor,
      localDate: localDateAt(cursor, workdayZone),
      workdayZone,
      startCause: input.startCause || null,
      endReason: input.endReason || input.reason || null,
      source: input.source || 'companion',
      certainty: input.certainty || 'VERIFIED',
      createdAtMs,
      provenance: input.provenance || null
    };
    validateSegment(segment);
    rows.push(segment);
    cursor = segmentEnd;
    index += 1;
  }
  return rows;
}

function materialIdentity(segment) {
  return [
    segment.contextId,
    segment.startAtMs,
    segment.endAtMs,
    segment.durationMs
  ].join('|');
}

function intervalFingerprint(segment) {
  return materialIdentity(segment);
}

function dedupeSegments(segments) {
  const byId = new Map();
  const byFingerprint = new Map();
  const result = [];
  for (const source of segments || []) {
    const segment = { ...source };
    validateSegment(segment);
    const existingId = byId.get(segment.segmentId);
    if (existingId) {
      if (materialIdentity(existingId) !== materialIdentity(segment)) {
        throw new Error('segment-id-conflict:' + segment.segmentId);
      }
      continue;
    }
    const fingerprint = intervalFingerprint(segment);
    const existingInterval = byFingerprint.get(fingerprint);
    if (existingInterval) {
      throw new Error(
        'duplicate-segment-interval:' + existingInterval.segmentId + ':' + segment.segmentId
      );
    }
    byId.set(segment.segmentId, segment);
    byFingerprint.set(fingerprint, segment);
    result.push(segment);
  }
  return result;
}

function effectiveActiveEnd(active, nowMs) {
  if (!active) return null;
  if (!isTimestamp(active.startedAtMs) || !isTimestamp(nowMs)) {
    throw new Error('active-effective-end-invalid');
  }
  let endAtMs = Math.max(active.startedAtMs, Number(nowMs));
  if (active.safetyHold && isTimestamp(active.safetyHold.holdAtMs)) {
    endAtMs = Math.min(endAtMs, active.safetyHold.holdAtMs);
  }
  return endAtMs;
}

function virtualActiveSegments(document, nowMs) {
  const active = document && document.timer && document.timer.active;
  if (!active) return [];
  const endAtMs = effectiveActiveEnd(active, nowMs);
  if (endAtMs <= active.startedAtMs) return [];
  return splitInterval({
    sessionId: active.sessionId,
    cycleId: active.cycleId,
    contextId: active.contextId,
    startAtMs: active.startedAtMs,
    endAtMs,
    workdayZone: document.workdayZone,
    startCause: active.startCause,
    endReason: null,
    source: active.source,
    certainty: active.safetyHold ? 'HELD' : active.certainty || 'VERIFIED',
    createdAtMs: active.startedAtMs
  }, {
    makeId: (_sessionId, index) => 'virtual:' + active.sessionId + ':' + index
  });
}

function weekStartDate(timestampMs, timeZone) {
  const localDate = localDateAt(timestampMs, timeZone);
  const noonUtc = Date.parse(localDate + 'T12:00:00Z');
  const day = new Date(noonUtc).getUTCDay();
  const daysFromMonday = (day + 6) % 7;
  return new Date(noonUtc - daysFromMonday * DAY_MS).toISOString().slice(0, 10);
}

function sumDuration(segments) {
  return segments.reduce((total, segment) => total + segment.durationMs, 0);
}

function createQueryService(getDocument, options = {}) {
  const now = options.now || (() => Date.now());

  function snapshot() {
    const value = getDocument();
    if (!value) throw new Error('data-document-unavailable');
    return value;
  }

  function allSegments(document, atMs) {
    return [...document.ledger, ...virtualActiveSegments(document, atMs)];
  }

  function getContextToday(contextId, atMs = now()) {
    const document = snapshot();
    const date = localDateAt(atMs, document.workdayZone);
    return sumDuration(allSegments(document, atMs).filter(row => row.contextId === contextId && row.localDate === date));
  }

  function getTodayTotal(atMs = now()) {
    const document = snapshot();
    const date = localDateAt(atMs, document.workdayZone);
    return sumDuration(allSegments(document, atMs).filter(row => row.localDate === date));
  }

  function getContextTotal(contextId, atMs = now()) {
    const document = snapshot();
    const attributed = sumDuration(allSegments(document, atMs).filter(row => row.contextId === contextId));
    return attributed + Math.max(0, Number(document.contexts[contextId] && document.contexts[contextId].legacyUnattributedMs) || 0);
  }

  function getWeekTotal(atMs = now()) {
    const document = snapshot();
    const start = weekStartDate(atMs, document.workdayZone);
    const startNoon = Date.parse(start + 'T12:00:00Z');
    const end = new Date(startNoon + 7 * DAY_MS).toISOString().slice(0, 10);
    return sumDuration(allSegments(document, atMs).filter(row => row.localDate >= start && row.localDate < end));
  }

  function getContextHistory(contextId) {
    return deepFreeze(snapshot().ledger
      .filter(row => row.contextId === contextId)
      .map(row => deepClone(row))
      .slice()
      .sort((a, b) => a.startAtMs - b.startAtMs || a.segmentId.localeCompare(b.segmentId)));
  }

  function getContextByDay(contextId, range = {}) {
    const document = snapshot();
    const atMs = range.atMs === undefined ? now() : range.atMs;
    const startDate = range.startDate == null ? null : assertLocalDate(range.startDate, 'range.startDate');
    const endDate = range.endDate == null ? null : assertLocalDate(range.endDate, 'range.endDate');
    if (startDate && endDate && startDate > endDate) throw new Error('range-date-order-invalid');
    const totals = new Map();
    for (const row of allSegments(document, atMs)) {
      if (row.contextId !== contextId) continue;
      if (startDate && row.localDate < startDate) continue;
      if (endDate && row.localDate >= endDate) continue;
      totals.set(row.localDate, (totals.get(row.localDate) || 0) + row.durationMs);
    }
    return deepFreeze([...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([localDate, durationMs]) => ({ localDate, durationMs })));
  }

  function getDayByContext(localDate, atMs = now()) {
    const document = snapshot();
    const targetDate = assertLocalDate(localDate);
    const totals = new Map();
    for (const row of allSegments(document, atMs)) {
      if (row.localDate !== targetDate) continue;
      totals.set(row.contextId, (totals.get(row.contextId) || 0) + row.durationMs);
    }
    return deepFreeze([...totals.entries()]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([contextId, durationMs]) => ({ contextId, durationMs })));
  }

  return {
    getContextToday,
    getTodayTotal,
    getContextTotal,
    getWeekTotal,
    getContextByDay,
    getDayByContext,
    getContextHistory
  };
}

module.exports = {
  DAY_MS,
  assertTimeZone,
  localDateAt,
  nextLocalDateBoundary,
  splitInterval,
  intervalFingerprint,
  dedupeSegments,
  effectiveActiveEnd,
  virtualActiveSegments,
  weekStartDate,
  createQueryService
};
