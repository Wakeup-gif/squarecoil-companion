'use strict';

// Read-only adapter for the September 7 dashboard. The canonical ledger/query
// services own time; this layer groups their exact values for chart display.
const { deepFreeze, assertLocalDate } = require('../data/model');
const { DAY_MS, localDateAt, nextLocalDateBoundary, weekStartDate,
  createQueryService, virtualActiveSegments } = require('../data/ledger');
const { createTimerReadModel, readableDocument } = require('../timer/read-model');
const { createDataSafetyReadModel } = require('../data/data-safety');

const PALETTE = Object.freeze(['#ce9053', '#639e91', '#699ac4', '#a294bc', '#b4a067', '#c38c94', '#83a8b4', '#8aa0b9']);
const PERIODS = new Set(['day', 'week', 'month']);
function shiftDate(date, days) { return new Date(Date.parse(`${date}T12:00:00Z`) + days * DAY_MS).toISOString().slice(0, 10); }
function monthStart(date) { return `${date.slice(0, 7)}-01`; }
function nextMonth(date) { const d = new Date(`${monthStart(date)}T12:00:00Z`); d.setUTCMonth(d.getUTCMonth() + 1); return d.toISOString().slice(0, 10); }
function colorFor(id) { let hash = 0; for (const char of String(id)) hash = (Math.imul(hash, 31) + char.charCodeAt(0)) >>> 0; return PALETTE[hash % PALETTE.length]; }
function jobHref(row) {
  const id = String(row.projectId || '');
  // Same established navigation contract as the Companion Open Job action.
  return row.kind === 'job' && /^[1-9]\d{0,9}$/.test(id) ? `/project.php?id=${encodeURIComponent(id)}` : null;
}
function localDayStart(date, zone) {
  let cursor = Date.parse(`${date}T12:00:00Z`) - 36 * 60 * 60 * 1000;
  for (let pass = 0; pass < 5; pass += 1) {
    cursor = nextLocalDateBoundary(cursor, zone);
    if (localDateAt(cursor, zone) === date) return cursor;
  }
  throw new Error('analytics-local-date-boundary-unavailable');
}
function periodRange(period, anchor, zone) {
  const date = assertLocalDate(anchor);
  if (!PERIODS.has(period)) throw new Error('analytics-period-invalid');
  const start = period === 'day' ? date : period === 'week'
    ? weekStartDate(localDayStart(date, zone), zone) : monthStart(date);
  return { start, end: period === 'day' ? shiftDate(start, 1) : period === 'week' ? shiftDate(start, 7) : nextMonth(start) };
}
function chartBuckets(period, range, zone, today) {
  const buckets = [];
  if (period === 'day') {
    const start = localDayStart(range.start, zone), end = localDayStart(range.end, zone);
    const formatter = new Intl.DateTimeFormat('en-US', { timeZone: zone, hour: 'numeric', timeZoneName: 'short' });
    for (let cursor = start; cursor < end; cursor += 3600000) {
      buckets.push({ id: String(cursor), date: range.start, startAtMs: cursor, endAtMs: Math.min(end, cursor + 3600000),
        label: formatter.format(cursor), future: range.start > today });
    }
  } else {
    for (let date = range.start; date < range.end; date = shiftDate(date, 1)) {
      buckets.push({ id: date, date, label: new Intl.DateTimeFormat('en-US', { timeZone: 'UTC',
        ...(period === 'week' ? { weekday: 'short' } : { day: 'numeric' }) }).format(new Date(`${date}T12:00:00Z`)), future: date > today });
    }
  }
  return buckets;
}

function createAnalyticsSnapshot(source, options = {}) {
  const document = readableDocument(source);
  const atMs = options.atMs ?? Date.now();
  const timer = createTimerReadModel(() => document, { now: () => atMs }).snapshot({ atMs });
  const data = createDataSafetyReadModel(document);
  const queries = createQueryService(() => document, { now: () => atMs });
  const today = localDateAt(atMs, document.workdayZone);
  const period = options.period || 'week';
  const anchor = options.anchor ? assertLocalDate(options.anchor) : today;
  const range = periodRange(period, anchor, document.workdayZone);
  const buckets = chartBuckets(period, range, document.workdayZone, today);
  if (period === 'day') for (const bucket of buckets) bucket.future = bucket.startAtMs >= atMs;
  const segments = [...document.ledger, ...virtualActiveSegments(document, atMs)];
  const protection = new Map([...data.recentRows, ...data.archivedRows].map(row => [row.contextId, row.protected]));
  const orderIndex = new Map(data.workspace.order.map((id, index) => [id, index]));
  const rows = timer.contextRows.map(row => {
    const scope = row.archivedAtMs !== null || row.workspaceMembership === 'ARCHIVED' ? 'archived'
      : row.workspaceMembership === 'RECENT' ? 'tracked' : 'history';
    const daily = queries.getContextByDay(row.contextId, { atMs, startDate: range.start, endDate: range.end });
    const dailyMap = new Map(daily.map(item => [item.localDate, item.durationMs]));
    let values;
    if (period === 'day') {
      const selected = segments.filter(item => item.contextId === row.contextId && item.localDate === range.start);
      // Existing split segments retain their recorded time zone/date. Avoid
      // silently redistributing old-zone records into the current workday.
      const compatible = selected.every(item => item.workdayZone === document.workdayZone);
      values = compatible ? buckets.map(bucket => selected.reduce((total, item) => total +
        Math.max(0, Math.min(item.endAtMs, bucket.endAtMs) - Math.max(item.startAtMs, bucket.startAtMs)), 0)) : null;
    } else values = buckets.map(bucket => dailyMap.get(bucket.date) || 0);
    return { ...row, id: row.contextId, scope, color: colorFor(row.contextId), href: jobHref(row),
      protected: protection.get(row.contextId) === true || row.isOperational,
      periodMs: daily.reduce((total, item) => total + item.durationMs, 0), values,
      metadataAvailable: false };
  }).sort((a, b) => (orderIndex.get(a.contextId) ?? Number.MAX_SAFE_INTEGER) -
    (orderIndex.get(b.contextId) ?? Number.MAX_SAFE_INTEGER) || (b.lastSeenAtMs || 0) - (a.lastSeenAtMs || 0) || a.contextId.localeCompare(b.contextId));
  const periodMs = timer.byDayRows.filter(row => row.localDate >= range.start && row.localDate < range.end)
    .reduce((total, row) => total + row.durationMs, 0);
  const legacyMs = rows.reduce((total, row) => total + row.legacyUnattributedMs, 0);
  return deepFreeze({ revision: timer.revision, queryAtMs: atMs, preferenceRevision: timer.sourcePreferenceRevision,
    today, period, anchor, range, workdayZone: timer.workdayZone, timeBasis: timer.timeBasis,
    todayMs: timer.todayTotalMs, weekMs: timer.weekTotalMs, periodMs, legacyMs,
    provisional: timer.todayTotalIsProvisional || timer.weekTotalIsProvisional,
    safetyHeld: Boolean(timer.running?.held), buckets, rows,
    hasRecordedTime: timer.byDayRows.length > 0, coverageStart: timer.byDayRows.at(-1)?.localDate || null,
    intradayAvailable: rows.every(row => row.values !== null),
    scopeCounts: Object.fromEntries(['tracked', 'history', 'archived'].map(scope => [scope, rows.filter(row => row.scope === scope).length])) });
}

module.exports = { PALETTE, PERIODS, shiftDate, periodRange, chartBuckets, jobHref, createAnalyticsSnapshot };
