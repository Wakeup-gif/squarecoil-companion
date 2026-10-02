'use strict';

const { assertLocalDate, deepFreeze, isTimestamp } = require('./model');
const { DAY_MS, localDateAt, virtualActiveSegments, weekStartDate } = require('./ledger');

// A caller must clone and validate its document first. This summary belongs to
// that one snapshot and one query time; it never remembers a revision or treats
// a previously read record as trusted. Stored localDate attribution is retained.
function createQuerySummary(document, atMs, options = {}) {
  if (!isTimestamp(atMs)) throw new Error('query-summary-at-invalid');
  // The data tools need only totals. Do not introduce calendar queries there:
  // valid idle documents can have timestamps outside date-string week ranges.
  const totalsOnly = options.totalsOnly === true;
  const todayDate = totalsOnly ? null : localDateAt(atMs, document.workdayZone);
  const currentWeekStart = totalsOnly ? null : weekStartDate(atMs, document.workdayZone);
  const currentWeekEnd = totalsOnly ? null : new Date(Date.parse(`${currentWeekStart}T12:00:00Z`) + 7 * DAY_MS).toISOString().slice(0, 10);
  const attributed = new Map();
  const today = new Map();
  const byContextDay = new Map();
  const byDay = new Map();
  const recorded = new Map();
  const lastRecorded = new Map();
  const legacy = new Map(Object.values(document.contexts).map(context =>
    [context.contextId, Math.max(0, Number(context.legacyUnattributedMs) || 0)]));
  const allSegments = [];
  let todayTotalMs = 0;
  let weekTotalMs = 0;

  function add(segment, finalized) {
    const { contextId, localDate, durationMs } = segment;
    attributed.set(contextId, (attributed.get(contextId) || 0) + durationMs);
    if (totalsOnly) return;
    allSegments.push(segment);
    if (localDate === todayDate) {
      today.set(contextId, (today.get(contextId) || 0) + durationMs);
      todayTotalMs += durationMs;
    }
    if (localDate >= currentWeekStart && localDate < currentWeekEnd) weekTotalMs += durationMs;
    const days = byContextDay.get(contextId) || new Map();
    days.set(localDate, (days.get(localDate) || 0) + durationMs);
    byContextDay.set(contextId, days);
    const day = byDay.get(localDate) || { durationMs: 0, contexts: new Map() };
    day.durationMs += durationMs;
    // Zero-duration rows still establish a day/context entry and its tie break.
    day.contexts.set(contextId, (day.contexts.get(contextId) || 0) + durationMs);
    byDay.set(localDate, day);
    if (finalized) {
      recorded.set(contextId, (recorded.get(contextId) || 0) + durationMs);
      lastRecorded.set(contextId, Math.max(lastRecorded.get(contextId) || 0, segment.endAtMs));
    }
  }

  for (const segment of document.ledger) add(segment, true);
  for (const segment of virtualActiveSegments(document, atMs)) add(segment, false);
  // Legacy balance is added after attributed time, matching canonical sums.
  const getContextTotal = contextId => (attributed.get(contextId) || 0) + (legacy.get(contextId) || 0);
  if (totalsOnly) return Object.freeze({ getContextTotal });
  const { active, pending, localPause } = document.timer;
  if (active) lastRecorded.set(active.contextId, Math.max(lastRecorded.get(active.contextId) || 0,
    active.lastVerifiedAtMs, active.startedAtMs));
  if (pending) lastRecorded.set(pending.contextId, Math.max(lastRecorded.get(pending.contextId) || 0,
    pending.lastContinuityVerifiedAtMs));
  if (localPause) lastRecorded.set(localPause.contextId, Math.max(lastRecorded.get(localPause.contextId) || 0,
    localPause.pausedAtMs));

  return Object.freeze({
    todayDate,
    currentWeekStart,
    currentWeekEnd,
    allSegments: Object.freeze(allSegments),
    getContextToday: contextId => today.get(contextId) || 0,
    getContextTotal,
    getContextRecordedTotal: contextId => recorded.get(contextId) || 0,
    getLastRecordedActivity: contextId => lastRecorded.get(contextId) || null,
    getTodayTotal: () => todayTotalMs,
    getWeekTotal: () => weekTotalMs,
    getContextByDay: contextId => deepFreeze([...(byContextDay.get(contextId) || new Map())]
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([localDate, durationMs]) => ({ localDate, durationMs }))),
    getDayByContext: localDate => {
      const date = assertLocalDate(localDate);
      return deepFreeze([...(byDay.get(date)?.contexts || new Map())]
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([contextId, durationMs]) => ({ contextId, durationMs })));
    },
    getDaySummaries: () => deepFreeze([...byDay.entries()].map(([localDate, day]) => {
      const top = [...day.contexts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0] || null;
      return { localDate, durationMs: day.durationMs, contextCount: day.contexts.size,
        topContextId: top?.[0] || null, topContextDurationMs: top?.[1] || 0 };
    }).sort((left, right) => right.localDate.localeCompare(left.localDate)))
  });
}

module.exports = { createQuerySummary };
