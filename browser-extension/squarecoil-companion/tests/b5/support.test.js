'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const {
  SUPPORT_EMAIL,
  validateDraft,
  coarsePageType,
  createDiagnosticSnapshot,
  composeSupportMessage
} = require('../../src/support/support-service');

test('UT-B5-SUPPORT-001 Ticket and Feedback validation preserves normalized drafts while blocking missing required fields', () => {
  const ticket = validateDraft('ticket', { category: 'Bug', subject: '  ', description: 'still here' });
  assert.equal(ticket.ok, false);
  assert.equal(ticket.draft.description, 'still here');
  const feedback = validateDraft('feedback', { category: 'UI / UX', subject: '', description: 'Keep this wording.' });
  assert.equal(feedback.ok, true);
  assert.equal(feedback.draft.description, 'Keep this wording.');
});

test('UT-B5-SUPPORT-002 coarse page classification never includes job IDs paths or query strings', () => {
  assert.equal(coarsePageType('https://ussignandmill.squarecoil.net/project.php?id=260701&customer=Private'), 'project-page');
  assert.equal(coarsePageType('https://ussignandmill.squarecoil.net/admin/private/260701'), 'general-page');
  assert.equal(coarsePageType('https://example.com/project.php?id=260701'), 'unknown');
});

test('UT-B5-SUPPORT-003 diagnostics use only the frozen whitelist and omit private SquareCoil context', () => {
  const diagnostics = createDiagnosticSnapshot({
    packageName: 'SquareCoil Companion', packageVersion: '0.7.1',
    buildId: 'rebuild-b6-release-candidate', buildStage: 'B6', candidateFingerprint: 'a'.repeat(64),
    userAgent: 'Mozilla/5.0 Chrome/151.0.7922.174 Safari/537.36',
    url: 'https://ussignandmill.squarecoil.net/project.php?id=260701&customer=VeryPrivate',
    lifecycle: 'trusted-core-owner-active', bridgeCapability: 'FULL', bridgeStatus: 'active', coreReadiness: 'ready',
    runtimeInstanceId: 'runtime-safe-001', workerInstanceId: 'worker-safe-001', coordinationEpoch: 7,
    settlementStatus: 'ready', migrationDisposition: 'COMPLETE_MATCH', migrationReason: 'none',
    bridgeGeneration: 3, bridgeReason: 'native-observation-current', lastTechnicalError: 'private customer failure',
    preferences: { timerAppearance: 'AUTO', panelFinish: 'GLASS', websiteTheme: 'SLEEK_DARK', cinematicBackground: 'CINEMATIC' },
    presentation: { timerAppearanceEffective: 'DARK', panelFinishEffective: 'GLASS', websiteThemeEffective: 'SLEEK_DARK',
      optional: { cinematic: { state: 'SHOWING', source: 'REMOTE', reason: 'remote-image-ready',
        statusCode: 'BING_IMAGE_ACTIVE', failureCode: null, fallbackStatus: 'NONE', ownedHostCount: 1, ownedStyleCount: 1 } } },
    rootCount: 1, capturedAtMs: Date.parse('2026-08-28T15:00:00Z'),
    customerName: 'VeryPrivate', contextId: 'job:260701', history: ['private']
  });
  assert.match(diagnostics.text, /Browser: Chrome 151\.0\.7922\.174/);
  assert.match(diagnostics.text, /Page type: project-page/);
  assert.match(diagnostics.text, /Build: rebuild-b6-release-candidate \/ B6/);
  assert.match(diagnostics.text, /Runtime: runtime-safe-001/);
  assert.match(diagnostics.text, /Worker generation: worker-safe-001/);
  assert.match(diagnostics.text, /Coordination generation: 7/);
  assert.match(diagnostics.text, /Settlement: ready/);
  assert.match(diagnostics.text, /Migration: COMPLETE_MATCH \/ none/);
  assert.match(diagnostics.text, /Bridge generation: 3/);
  assert.match(diagnostics.text, /Last internal error: none/);
  assert.match(diagnostics.text, /Cinematic: CINEMATIC \/ SHOWING \/ REMOTE/);
  assert.match(diagnostics.text, /Cinematic status: BING_IMAGE_ACTIVE/);
  assert.match(diagnostics.text, /Cinematic failure: none/);
  assert.match(diagnostics.text, /Cinematic fallback: NONE/);
  assert.match(diagnostics.text, /Cinematic reason: remote-image-ready/);
  assert.match(diagnostics.text, /Cinematic layers: 1 host \/ 1 style/);
  assert.doesNotMatch(diagnostics.text, /260701|VeryPrivate|customer|history|project\.php/);
});

test('UT-B5-SUPPORT-008 diagnostics distinguish retained cache, failure class, and the actual fallback layer', () => {
  const diagnostics = createDiagnosticSnapshot({
    packageVersion: '0.7.1', buildId: 'rebuild-b6-release-candidate', buildStage: 'B6',
    candidateFingerprint: 'b'.repeat(64), userAgent: 'Chrome/151.0.0.0',
    url: 'https://ussignandmill.squarecoil.net/dashboard.php',
    preferences: { cinematicBackground: 'CINEMATIC' },
    presentation: { optional: { cinematic: {
      state: 'DEGRADED_CACHE', source: 'CACHE_RETAINED', reason: 'network-unavailable',
      statusCode: 'OLDER_CACHED_BING_IMAGE_RETAINED', failureCode: 'NETWORK_UNAVAILABLE',
      fallbackStatus: 'NONE', ownedHostCount: 1, ownedStyleCount: 1
    } } }, capturedAtMs: Date.parse('2026-08-30T12:00:00Z')
  });
  assert.match(diagnostics.text, /Cinematic status: OLDER_CACHED_BING_IMAGE_RETAINED/);
  assert.match(diagnostics.text, /Cinematic failure: NETWORK_UNAVAILABLE/);
  assert.match(diagnostics.text, /Cinematic fallback: NONE/);
  assert.doesNotMatch(diagnostics.text, /260701|VeryPrivate|customer-name|cookie-value|account-token/i);
});

test('UT-B5-SUPPORT-004 email composition uses the exact visible frozen diagnostics and safely encoded mailto fields', () => {
  const diagnostics = Object.freeze({ capturedAtMs: 1, text: 'Frozen diagnostics\nCaptured: fixed' });
  const result = composeSupportMessage('ticket', {
    category: 'Bug', subject: 'Clock view & tabs', description: 'Line one\nLine two', includeDiagnostics: true
  }, diagnostics, { packageVersion: '0.7.1' });
  assert.equal(result.ok, true);
  assert.equal(result.recipient, SUPPORT_EMAIL);
  assert.match(result.mailto, /^mailto:cristian@ussignandmill\.com\?/);
  assert.match(decodeURIComponent(result.mailto), /Clock view & tabs/);
  assert.equal(result.diagnosticsText, diagnostics.text);
  assert.equal(result.body.endsWith(diagnostics.text), true);
});

test('UT-B5-SUPPORT-005 diagnostics remain opt-in and are not silently added to a plain Support message', () => {
  const result = composeSupportMessage('feedback', {
    category: 'Suggestion', subject: '', description: 'A small idea', includeDiagnostics: false
  }, { text: 'must-not-appear' }, { packageVersion: '0.7.1' });
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.body, /must-not-appear|Diagnostics:/);
});

test('UT-B5-SUPPORT-006 header control characters are neutralized instead of becoming executable mail headers', () => {
  const result = composeSupportMessage('ticket', {
    category: 'Bug', subject: 'Hello\r\nBcc: attacker@example.com', description: 'Body', includeDiagnostics: false
  }, null, { packageVersion: '0.7.1' });
  assert.equal(result.ok, true);
  assert.doesNotMatch(result.subject, /\r|\n/);
  assert.match(result.subject, /Bcc: attacker@example\.com/);
});

test('UT-B5-SUPPORT-007 oversized mailto content stays intact for Copy Message and never silently truncates', () => {
  const description = 'x'.repeat(7_900);
  const result = composeSupportMessage('feedback', {
    category: 'General Feedback', subject: 'Large', description, includeDiagnostics: false
  }, null, { packageVersion: '0.7.1' });
  assert.equal(result.ok, true);
  assert.equal(result.tooLarge, true);
  assert.equal(result.mailto, null);
  assert.match(result.copyText, new RegExp(`x{${description.length}}`));
});
