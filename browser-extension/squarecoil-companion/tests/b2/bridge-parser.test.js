'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EVIDENCE_KINDS,
  NEGATIVE_KINDS,
  STATE_CERTAINTY,
  AUDITED_GENERAL_CONTEXTS,
  parseServerSnapshot,
  parseDomSnapshot,
  reconcileEvidence
} = require('../../src/squarecoil/bridge-parser');

test('UT-B2-BRIDGE-001 action-7 audited clock element yields one typed Job Context', () => {
  const parsed = parseServerSnapshot(`
    <header><span id="clockin-remaining-time" data-time="01|02|03">
      <a class="job" href="/project.php?id=260702">260702 - Fabrication</a>
    </span></header>
  `, { observedAtMs: 1_000, department: 'Fabrication' });

  assert.equal(parsed.kind, EVIDENCE_KINDS.CONTEXT);
  assert.equal(parsed.stateCertainty, STATE_CERTAINTY.VERIFIED_SERVER);
  assert.equal(parsed.context.contextId, 'job:260702');
  assert.equal(parsed.context.projectId, '260702');
  assert.equal(parsed.context.department, 'Fabrication');
  assert.equal(parsed.provenance, 'CLOCK_PROJECT_LINK');
});

test('UT-B2-BRIDGE-002 Production General is stable, never job:0, despite empty data-time', () => {
  const server = parseServerSnapshot(`
    <span data-time="||||" id="clockin-remaining-time">
      <a href="project.php?id=0">Production (General)</a>
    </span>
  `, { observedAtMs: 2_000 });
  const dom = parseDomSnapshot({
    remainingTimeHtml: '<a href="/project.php?id=0">Production (General)</a>',
    remainingTimeDataTime: '||',
    clockInVisible: true,
    clockOutVisible: false
  }, { observedAtMs: 2_001 });

  for (const parsed of [server, dom]) {
    assert.equal(parsed.kind, EVIDENCE_KINDS.CONTEXT);
    assert.equal(parsed.context.contextId, 'general:production-general');
    assert.equal(parsed.context.kind, 'general');
    assert.equal('projectId' in parsed.context, false);
  }
  assert.equal(AUDITED_GENERAL_CONTEXTS.length, 1);
});

test('UT-B2-BRIDGE-003 only exact id and href attributes inside audited scope are read', () => {
  const wrongId = parseServerSnapshot(`
    <a href="/project.php?id=999999">999999 - Outside</a>
    <span data-id="clockin-remaining-time">
      <a href="/project.php?id=260702">260702 - Fabrication</a>
    </span>
  `, { observedAtMs: 3_000 });
  const wrongHref = parseServerSnapshot(`
    <span id="clockin-remaining-time">
      <a data-href="/project.php?id=260702">Fabrication</a>
    </span>
  `, { observedAtMs: 3_001 });

  assert.equal(wrongId.kind, EVIDENCE_KINDS.STATE_UNKNOWN);
  assert.equal(wrongId.reason, 'AUDITED_CLOCK_ELEMENT_MISSING');
  assert.equal(wrongHref.kind, EVIDENCE_KINDS.STATE_UNKNOWN);
  assert.equal(wrongHref.reason, 'UNSUPPORTED_CLOCK_LABEL');
});

test('UT-B2-BRIDGE-004 malformed or ambiguous clock HTML becomes unknown, never negative', () => {
  const unclosed = parseServerSnapshot(
    '<span id="clockin-remaining-time"><a href="/project.php?id=260702">Job',
    { observedAtMs: 4_000 }
  );
  const duplicateAttribute = parseServerSnapshot(
    '<span id="clockin-remaining-time" id="other"></span>',
    { observedAtMs: 4_001 }
  );
  const duplicateElement = parseServerSnapshot(
    '<span id="clockin-remaining-time"></span><span id="clockin-remaining-time"></span>',
    { observedAtMs: 4_002 }
  );

  for (const parsed of [unclosed, duplicateAttribute, duplicateElement]) {
    assert.equal(parsed.kind, EVIDENCE_KINDS.STATE_UNKNOWN);
    assert.notEqual(parsed.kind, EVIDENCE_KINDS.NEGATIVE_CANDIDATE);
  }
});

test('UT-B2-BRIDGE-005 only audited General and six-digit clock labels form fallback Contexts', () => {
  const unaudited = parseServerSnapshot(`
    <span id="clockin-remaining-time"><a href="project.php?id=0">Warehouse General</a></span>
  `, { observedAtMs: 5_000 });
  const generic = parseDomSnapshot({
    remainingTimeText: 'Change / Clock Out',
    bodyHtml: '<a href="/project.php?id=999999">999999 - Outside</a>'
  }, { observedAtMs: 5_001 });
  const fallback = parseDomSnapshot({
    debugText: '260703 - Installation',
    bodyHtml: '<a href="/project.php?id=999999">999999 - Outside</a>'
  }, { observedAtMs: 5_002 });

  assert.equal(unaudited.kind, EVIDENCE_KINDS.STATE_UNKNOWN);
  assert.equal(generic.kind, EVIDENCE_KINDS.STATE_UNKNOWN);
  assert.equal(fallback.kind, EVIDENCE_KINDS.CONTEXT);
  assert.equal(fallback.context.contextId, 'job:260703');
  assert.equal(fallback.provenance, 'CLOCK_LABEL_SIX_DIGIT_FALLBACK');
});

test('UT-B2-BRIDGE-006 audited control visibility creates distinct unconfirmed negative candidates', () => {
  const clockedOut = parseDomSnapshot({
    remainingTimeDataTime: '||||',
    clockInVisible: true,
    clockOutVisible: false
  }, { observedAtMs: 6_000 });
  const noTrackable = parseDomSnapshot({
    clockInVisible: false,
    clockOutVisible: true
  }, { observedAtMs: 6_001 });
  const emptyDataOnly = parseDomSnapshot({ remainingTimeDataTime: '||' }, { observedAtMs: 6_002 });
  const emptyServer = parseServerSnapshot(
    '<span id="clockin-remaining-time"></span>',
    { observedAtMs: 6_003 }
  );

  assert.equal(clockedOut.negativeKind, NEGATIVE_KINDS.CLOCKED_OUT);
  assert.equal(noTrackable.negativeKind, NEGATIVE_KINDS.NO_TRACKABLE_CONTEXT);
  assert.equal(emptyDataOnly.kind, EVIDENCE_KINDS.STATE_UNKNOWN);
  assert.equal(emptyServer.negativeKind, NEGATIVE_KINDS.NO_CONTEXT);
});

test('UT-B2-BRIDGE-007 fresh positive server and DOM disagreement becomes an explicit conflict', () => {
  const server = parseServerSnapshot(`
    <span id="clockin-remaining-time"><a href="/project.php?id=260701">260701 - Design</a></span>
  `, { observedAtMs: 7_000 });
  const dom = parseDomSnapshot({
    remainingTimeHtml: '<a href="/project.php?id=260702">260702 - Fabrication</a>'
  }, { observedAtMs: 7_001 });
  const reconciled = reconcileEvidence([server, dom]);

  assert.equal(reconciled.kind, EVIDENCE_KINDS.STATE_CONFLICT);
  assert.equal(reconciled.stateCertainty, STATE_CERTAINTY.CONFLICT);
  assert.deepEqual(reconciled.contextIds, ['job:260701', 'job:260702']);

  const internallyConflictedDom = parseDomSnapshot({
    remainingTimeHtml: '<a href="/project.php?id=260701">260701 - Design</a>',
    debugHtml: '<a href="/project.php?id=260702">260702 - Fabrication</a>'
  }, { observedAtMs: 7_002 });
  assert.equal(
    reconcileEvidence([server, internallyConflictedDom]).kind,
    EVIDENCE_KINDS.STATE_CONFLICT
  );
});

test('UT-B2-BRIDGE-008 fresh positive evidence beats passive negative and stale disagreement', () => {
  const staleServer = parseServerSnapshot(`
    <span id="clockin-remaining-time"><a href="/project.php?id=260701">260701 - Design</a></span>
  `, { observedAtMs: 8_000 });
  const freshDom = parseDomSnapshot({
    remainingTimeHtml: '<a href="/project.php?id=260702">260702 - Fabrication</a>'
  }, { observedAtMs: 20_000 });
  const emptyServer = parseServerSnapshot(
    '<span id="clockin-remaining-time"></span>',
    { observedAtMs: 20_001 }
  );
  const reconciled = reconcileEvidence([staleServer, freshDom, emptyServer]);

  assert.equal(reconciled.kind, EVIDENCE_KINDS.CONTEXT);
  assert.equal(reconciled.context.contextId, 'job:260702');
});

test('UT-B2-BRIDGE-009 parser outputs and nested Contexts are immutable typed values', () => {
  const parsed = parseServerSnapshot(`
    <span id="clockin-remaining-time"><a href="/project.php?id=260702">260702 - Fabrication</a></span>
  `, { observedAtMs: 9_000 });

  assert.equal(Object.isFrozen(parsed), true);
  assert.equal(Object.isFrozen(parsed.context), true);
  assert.throws(() => { parsed.context.contextId = 'job:evil'; }, TypeError);
  assert.equal(parsed.context.contextId, 'job:260702');
});
