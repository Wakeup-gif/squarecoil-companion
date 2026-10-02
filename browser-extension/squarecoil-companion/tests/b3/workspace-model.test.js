'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  DEFAULT_TIMER_LIMITS_MS,
  thresholdLevel,
  deriveTabWorkspace,
  focusIntentFromTimer,
  focusIntentIsCurrent,
  moveContext,
  placeContext
} = require('../../src/workspace/model');

function row(index, values = {}) {
  return {
    contextId: values.contextId || `job:${index}`,
    kind: values.kind || 'job',
    label: values.label || `Job ${index}`,
    lastSeenAtMs: values.lastSeenAtMs ?? index,
    workspaceMembership: 'RECENT',
    archivedAtMs: null,
    ...values
  };
}

test('UT-B3-WORKSPACE-001 threshold comparison uses unrounded Today and high-to-low equality', () => {
  assert.equal(thresholdLevel(DEFAULT_TIMER_LIMITS_MS.yellow - 1), 'NONE');
  assert.equal(thresholdLevel(DEFAULT_TIMER_LIMITS_MS.yellow), 'YELLOW');
  assert.equal(thresholdLevel(DEFAULT_TIMER_LIMITS_MS.orange), 'ORANGE');
  assert.equal(thresholdLevel(DEFAULT_TIMER_LIMITS_MS.red), 'RED');
  assert.equal(thresholdLevel(DEFAULT_TIMER_LIMITS_MS.red + 1), 'RED');
});

test('UT-B3-WORKSPACE-002 five numbered-job slots exclude General Contexts and protect current truth', () => {
  const rows = [row(0, { contextId: 'general:production', kind: 'general', label: 'Production General' })]
    .concat(Array.from({ length: 8 }, (_, index) => row(index + 1)));
  const value = deriveTabWorkspace(rows, {
    selectedContextId: 'job:8',
    operationalContextId: 'job:7',
    hiddenContextIds: ['job:7'],
    durableOrder: rows.map(item => item.contextId)
  });
  assert.equal(value.visibleRows.filter(item => item.kind === 'job').length, 5);
  assert.equal(value.visibleRows.some(item => item.contextId === 'general:production'), true);
  assert.equal(value.visibleRows.some(item => item.contextId === 'job:7'), true);
  assert.equal(value.visibleRows.some(item => item.contextId === 'job:8'), true);
});

test('UT-B3-WORKSPACE-003 automatic overflow uses lastSeen and durable-order tie break without conflating recorded activity', () => {
  const rows = Array.from({ length: 6 }, (_, index) => row(index + 1, {
    lastSeenAtMs: index === 5 ? 1 : 100,
    lastRecordedActivityAtMs: index === 5 ? 999_999 : 1
  }));
  const value = deriveTabWorkspace(rows, { durableOrder: ['job:5', 'job:4', 'job:3', 'job:2', 'job:1', 'job:6'] });
  assert.deepEqual(value.overflowContextIds, ['job:6']);
});

test('UT-B3-WORKSPACE-004 remote hide may remove selected tab chrome while operational truth always overrides hidden state', () => {
  const rows = Array.from({ length: 3 }, (_, index) => row(index + 1));
  const value = deriveTabWorkspace(rows, {
    selectedContextId: 'job:2',
    operationalContextId: 'job:1',
    hiddenContextIds: ['job:1', 'job:2']
  });
  assert.equal(value.dispositionByContextId['job:1'], 'VISIBLE');
  assert.equal(value.dispositionByContextId['job:2'], 'HIDDEN');
});

test('UT-B3-WORKSPACE-005 focus intent exists only for real incoming Context observations and stays revision-bound', () => {
  const timer = {
    revision: 8,
    currentContextId: 'job:2',
    lastObservation: {
      type: 'CONTEXT_CHANGED',
      priorContextId: 'job:1',
      contextId: 'job:2',
      observationId: 'observation-2',
      observedAtMs: 200
    }
  };
  const intent = focusIntentFromTimer(timer);
  assert.equal(intent.contextId, 'job:2');
  assert.equal(focusIntentIsCurrent(intent, timer), true);
  assert.equal(focusIntentIsCurrent(intent, { ...timer, currentContextId: 'job:3' }), false);
  assert.equal(focusIntentFromTimer({ ...timer, lastObservation: { ...timer.lastObservation, type: 'CONTEXT_VERIFIED' } }), null);
});

test('UT-B3-WORKSPACE-006 durable reorder moves presentation only and preserves every Context identity', () => {
  assert.deepEqual(moveContext(['job:1', 'job:2', 'job:3'], 'job:3', 'job:1'), ['job:3', 'job:1', 'job:2']);
  assert.deepEqual(moveContext(['job:1', 'job:2'], 'job:1'), ['job:2', 'job:1']);
});

test('UT-B3-WORKSPACE-007 placement-aware reorder supports before, after, and strip-end drops without losing identity', () => {
  const order = ['job:1', 'job:2', 'job:3', 'job:4'];
  assert.deepEqual(placeContext(order, 'job:4', 'job:2', 'before'), ['job:1', 'job:4', 'job:2', 'job:3']);
  assert.deepEqual(placeContext(order, 'job:1', 'job:3', 'after'), ['job:2', 'job:3', 'job:1', 'job:4']);
  assert.deepEqual(placeContext(order, 'job:2', null, 'after'), ['job:1', 'job:3', 'job:4', 'job:2']);
  assert.deepEqual(new Set(placeContext(order, 'job:4', 'job:1', 'after')), new Set(order));
});

test('UT-B3-WORKSPACE-008 only exact RECENT membership can appear in tabs', () => {
  const rows = [
    row(1, { lastSeenAtMs: 30 }),
    row(2, { lastSeenAtMs: 20, workspaceMembership: 'INACTIVE_NON_RECENT' }),
    row(3, { lastSeenAtMs: 10, workspaceMembership: 'ARCHIVED', archivedAtMs: 10 })
  ];
  const value = deriveTabWorkspace(rows, { durableOrder: ['job:3', 'job:2', 'job:1'] });
  assert.deepEqual(value.order, ['job:1']);
  assert.deepEqual(value.visibleRows.map(item => item.contextId), ['job:1']);
});
