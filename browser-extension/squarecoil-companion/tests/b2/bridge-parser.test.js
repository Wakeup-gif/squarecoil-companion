'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  EVIDENCE_KINDS,
  NEGATIVE_KINDS,
  STATE_CERTAINTY,
  AUDITED_GENERAL_CONTEXTS,
  parseClockContext,
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
  assert.equal(wrongId.reason, 'UNSAFE_CLOCK_HEADER_FRAGMENT');
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

test('UT-B2-BRIDGE-005 explicit General project and six-digit clock labels form scoped Contexts', () => {
  const generalProject = parseServerSnapshot(`
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

  assert.equal(generalProject.kind, EVIDENCE_KINDS.CONTEXT);
  assert.equal(generalProject.context.contextId, 'general:warehouse-general');
  assert.equal(generic.kind, EVIDENCE_KINDS.STATE_UNKNOWN);
  assert.equal(fallback.kind, EVIDENCE_KINDS.CONTEXT);
  assert.equal(fallback.context.contextId, 'job:260703');
  assert.equal(fallback.provenance, 'CLOCK_LABEL_SIX_DIGIT_FALLBACK');
});

test('UT-B2-BRIDGE-100 exact action-7 inline header fragments recognize jobs and General work without a wrapper', () => {
  const job = parseServerSnapshot('<i class="fa fa-clock-o"></i> <a href="/project.php?id=260893"><strong>260893 - FP - Bloom on Third</strong></a>', { observedAtMs: 10_000 });
  const general = parseServerSnapshot('Production (General)', { observedAtMs: 10_001 });
  const named = parseServerSnapshot('<span><b>Design (General)</b></span>', { observedAtMs: 10_002 });
  assert.equal(job.kind, EVIDENCE_KINDS.CONTEXT);
  assert.equal(job.context.contextId, 'job:260893');
  assert.equal(job.stateCertainty, STATE_CERTAINTY.VERIFIED_SERVER);
  assert.equal(general.context.contextId, 'general:production-general');
  assert.equal(named.context.contextId, 'general:design-general');
  assert.equal(named.provenance, 'CLOCK_GENERAL_DEPARTMENT_LABEL');
});

test('UT-B2-BRIDGE-101 fragment fallback rejects documents, unrelated containers and malformed or spoofed clock scopes', () => {
  for (const html of [
    '<!doctype html><html><body><a href="/project.php?id=260893">260893 - Outside</a></body></html>',
    '<div class="project-list"><a href="/project.php?id=260893">260893 - Outside</a></div>',
    '<nav><a href="/project.php?id=260893">260893 - Outside</a></nav>',
    '<span id="another-scope"><a href="/project.php?id=260893">260893 - Outside</a></span>',
    '<span data-id="clockin-remaining-time"><a href="/project.php?id=260893">260893 - Outside</a></span>',
    '<span id="clockin-remaining-time" id="other"><a href="/project.php?id=260893">260893</a></span>',
    '<span id="clockin-remaining-time">Production (General)</span><span id="clockin-remaining-time">Design (General)</span>',
    '<span><a href="/project.php?id=260893">260893</span></a>',
    '<a href="/project.php?id=260893">260893',
    '<a href="/project.php?id=260893" onclick="clockIn()">260893</a>',
    '<script>260893</script>',
    '<form><a href="/project.php?id=260893">260893</a></form>'
  ]) {
    const parsed = parseServerSnapshot(html, { observedAtMs: 11_000 });
    assert.equal(parsed.kind, EVIDENCE_KINDS.STATE_UNKNOWN, html);
    assert.equal(parsed.context, undefined, html);
  }
});

test('UT-B2-BRIDGE-102 explicit clock wrapper remains authoritative and conflicting fragment project identities fail closed', () => {
  const scoped = parseServerSnapshot('<a href="/project.php?id=999999">999999 - Outside</a><header><span id="clockin-remaining-time"><a href="/project.php?id=260893">260893 - Current</a></span></header>', { observedAtMs: 12_000 });
  assert.equal(scoped.context.contextId, 'job:260893');
  const conflict = parseServerSnapshot('<a href="/project.php?id=260893">260893 - One</a> <a href="/project.php?id=260621">260621 - Two</a>', { observedAtMs: 12_001 });
  assert.equal(conflict.kind, EVIDENCE_KINDS.STATE_CONFLICT);
  assert.equal(conflict.reason, 'MULTIPLE_CLOCK_PROJECT_IDENTITIES');
  const generalConflict = parseServerSnapshot('<a href="/project.php?id=0">Design (General)</a><a href="/project.php?id=0">Meeting</a>', { observedAtMs: 12_002 });
  assert.equal(generalConflict.kind, EVIDENCE_KINDS.STATE_CONFLICT);
  assert.equal(generalConflict.reason, 'MULTIPLE_CLOCK_GENERAL_IDENTITIES');
});

test('UT-B2-BRIDGE-103 only native project links support fragment or wrapped General identity', () => {
  for (const href of [
    'https://other.example/project.php?id=260893',
    '//other.example/project.php?id=260893',
    'https://squarecoil.invalid/project.php?id=260893',
    '/projects.php?id=260893',
    '/project.php?id=260893&id=260621',
    '/project.php?id=invalid',
    'javascript:clockIn(260893)'
  ]) {
    for (const wrap of [value => value, value => `<span id="clockin-remaining-time">${value}</span>`]) {
      const parsed = parseServerSnapshot(wrap(`<a href="${href}">260893 - Current</a>`), { observedAtMs: 13_000 });
      assert.equal(parsed.kind, EVIDENCE_KINDS.STATE_UNKNOWN, href);
      assert.equal(parsed.reason, 'UNSUPPORTED_CLOCK_LINK', href);
    }
  }
  const native = parseServerSnapshot('<a href="https://ussignandmill.squarecoil.net/project.php?id=260893">260893 - Current</a>', { observedAtMs: 13_001 });
  assert.equal(native.context.contextId, 'job:260893');
});

test('UT-B2-BRIDGE-104 project-zero department labels yield stable General contexts and ignore surrounding countdown text', () => {
  const server = parseServerSnapshot('<a href="/project.php?id=0">Design (General)</a>', { observedAtMs: 14_000 });
  const dom = parseDomSnapshot({ remainingTime: { html: '<a href="/project.php?id=0">DESIGN (General)</a><small>00:00:10</small>', text: 'DESIGN (General) 00:00:10' }, clockOutVisible: true }, { observedAtMs: 14_001 });
  for (const parsed of [server, dom]) {
    assert.equal(parsed.kind, EVIDENCE_KINDS.CONTEXT);
    assert.equal(parsed.context.kind, 'general');
    assert.equal(parsed.context.contextId, 'general:design-general');
    assert.equal(parsed.context.generalKey, 'design-general');
    assert.equal('projectId' in parsed.context, false);
  }
  assert.equal(reconcileEvidence([server, dom]).kind, EVIDENCE_KINDS.CONTEXT);
  const meeting = parseServerSnapshot('<a href="/project.php?id=0">Meeting</a>', { observedAtMs: 14_002 });
  const training = parseClockContext({ href: '/project.php?id=0', label: 'Training' });
  assert.equal(meeting.context.contextId, 'general:meeting');
  assert.equal(training.context.contextId, 'general:training');
  const unsupportedText = parseDomSnapshot({ debugText: 'Meeting' }, { observedAtMs: 14_003 });
  assert.equal(unsupportedText.kind, EVIDENCE_KINDS.STATE_UNKNOWN);
});

test('UT-B2-BRIDGE-105 controls, empty labels and numbered jobs never manufacture a project-zero General context', () => {
  for (const label of ['', 'Clock In', 'Clock Out', 'Change / Clock Out', 'Close', 'Time Remaining', 'Clock In (General)', 'Design (General) Meeting (General)', '260893 - Current', '|||', '00:00:10']) {
    const parsed = parseServerSnapshot(`<a href="/project.php?id=0">${label}</a>`, { observedAtMs: 15_000 });
    assert.notEqual(parsed.kind, EVIDENCE_KINDS.CONTEXT, label);
    assert.equal(parsed.context, undefined, label);
  }
  const conflict = parseClockContext({ href: '/project.php?id=260893', label: 'Design (General)' });
  assert.equal(conflict.conflict, true);
  assert.equal(conflict.context, null);
});

test('UT-B2-BRIDGE-108 unwrapped error text or numbers cannot verify a Job without a native project link', () => {
  for (const html of [
    'Could not load project 260893. Please log in.',
    'Error: 260893 access denied',
    '260893',
    '<span>260893 - Current</span>'
  ]) {
    const parsed = parseServerSnapshot(html, { observedAtMs: 16_000 });
    assert.equal(parsed.kind, EVIDENCE_KINDS.STATE_UNKNOWN, html);
    assert.equal(parsed.context, undefined, html);
  }
  const scoped = parseServerSnapshot('<span id="clockin-remaining-time">260893 - Current</span>', { observedAtMs: 16_001 });
  assert.equal(scoped.context.contextId, 'job:260893');
  assert.equal(scoped.provenance, 'CLOCK_LABEL_SIX_DIGIT_FALLBACK');
});

test('UT-B2-BRIDGE-109 project-zero identities retain the exact prototype label slug without guessed aliases', () => {
  for (const department of ['Design', 'Production']) {
    const server = parseServerSnapshot(`${department} (General)`, { observedAtMs: 17_000 });
    const dom = parseDomSnapshot({ remainingTimeHtml: `<a href="/project.php?id=0">${department}</a>` }, { observedAtMs: 17_001 });
    assert.equal(server.context.contextId, `general:${department.toLowerCase()}-general`);
    assert.equal(dom.context.contextId, `general:${department.toLowerCase()}`);
    assert.equal(reconcileEvidence([server, dom]).kind, EVIDENCE_KINDS.STATE_CONFLICT);
    const equivalentLinks = parseServerSnapshot(`<a href="/project.php?id=0">${department}</a><a href="/project.php?id=0">${department} (General)</a>`, { observedAtMs: 17_002 });
    assert.equal(equivalentLinks.kind, EVIDENCE_KINDS.STATE_CONFLICT);
    assert.equal(equivalentLinks.reason, 'MULTIPLE_CLOCK_GENERAL_IDENTITIES');
  }
});

test('UT-B2-BRIDGE-110 padded clock labels and project links canonicalize the same positive numeric Job', () => {
  const server = parseServerSnapshot('<a href="/project.php?id=00001234">001234 - Job</a>', { observedAtMs: 18_000 });
  const dom = parseDomSnapshot({ debugText: '001234 - Job' }, { observedAtMs: 18_001 });
  const wrapped = parseServerSnapshot('<span id="clockin-remaining-time">001234 - Job</span>', { observedAtMs: 18_002 });
  for (const parsed of [server, dom, wrapped]) {
    assert.equal(parsed.kind, EVIDENCE_KINDS.CONTEXT);
    assert.equal(parsed.context.contextId, 'job:1234');
    assert.equal(parsed.context.projectId, '1234');
  }
  assert.equal(reconcileEvidence([server, dom, wrapped]).context.contextId, 'job:1234');
  const duplicateLinks = parseServerSnapshot('<a href="/project.php?id=001234">001234 - Job</a><a href="/project.php?id=00001234">001234 - Job</a>', { observedAtMs: 18_003 });
  assert.equal(duplicateLinks.context.contextId, 'job:1234');
  const conflictingLinks = parseServerSnapshot('<a href="/project.php?id=001234">001234 - One</a><a href="/project.php?id=001235">001235 - Two</a>', { observedAtMs: 18_004 });
  assert.equal(conflictingLinks.kind, EVIDENCE_KINDS.STATE_CONFLICT);
  assert.equal(conflictingLinks.reason, 'MULTIPLE_CLOCK_PROJECT_IDENTITIES');
  const conflictingLabels = parseDomSnapshot({ debugText: '001234 - One / 001235 - Two' }, { observedAtMs: 18_005 });
  assert.equal(conflictingLabels.kind, EVIDENCE_KINDS.STATE_UNKNOWN);
  assert.equal(conflictingLabels.context, undefined);
});

test('UT-B2-BRIDGE-111 all-zero clock labels never create a Job or a General context', () => {
  for (const html of ['000000 - Job', '<span id="clockin-remaining-time">000000 - Job</span>', '<a href="/project.php?id=0">000000 - Job</a>']) {
    const parsed = parseServerSnapshot(html, { observedAtMs: 19_000 });
    assert.equal(parsed.kind, EVIDENCE_KINDS.STATE_UNKNOWN, html);
    assert.equal(parsed.context, undefined, html);
  }
  const dom = parseDomSnapshot({ debugText: '000000 - Job' }, { observedAtMs: 19_001 });
  assert.equal(dom.kind, EVIDENCE_KINDS.STATE_UNKNOWN);
  assert.equal(dom.context, undefined);
});

test('UT-B2-BRIDGE-112 eligible General labels use the original ASCII slug and forty-character limit', () => {
  for (const [label, key] of [
    ['Meeting', 'meeting'],
    ['Design (General)', 'design-general'],
    ['Training / Safety', 'training-safety'],
    ['Révision (General)', 'r-vision-general'],
    ['Long Department Name For Manufacturing Operations (General)', 'long-department-name-for-manufacturing-o']
  ]) {
    const parsed = parseClockContext({ href: '/project.php?id=0', label });
    assert.equal(parsed.context.contextId, `general:${key}`, label);
    assert.equal(parsed.context.generalKey, key, label);
  }
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
