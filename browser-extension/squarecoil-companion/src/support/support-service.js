'use strict';

const SUPPORT_EMAIL = 'cristian@ussignandmill.com';
const TICKET_TYPES = Object.freeze(['Bug', 'Feature Request', 'Question', 'Other']);
const FEEDBACK_CATEGORIES = Object.freeze(['Suggestion', 'UI / UX', 'Feature Idea', 'General Feedback']);
const MAX_SUBJECT_LENGTH = 160;
const MAX_DESCRIPTION_LENGTH = 12_000;
const MAX_MAILTO_LENGTH = 8_000;

function cleanHeader(value) {
  return String(value ?? '').replace(/[\u0000-\u001f\u007f]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanBody(value) {
  return String(value ?? '').replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/g, '');
}

function validateDraft(kind, draft = {}) {
  const normalizedKind = kind === 'feedback' ? 'feedback' : 'ticket';
  const category = cleanHeader(draft.category);
  const subject = cleanHeader(draft.subject);
  const description = cleanBody(draft.description).trim();
  const allowed = normalizedKind === 'ticket' ? TICKET_TYPES : FEEDBACK_CATEGORIES;
  const errors = [];
  if (!allowed.includes(category)) errors.push(normalizedKind === 'ticket' ? 'Choose a supported ticket type.' : 'Choose a supported feedback category.');
  if (normalizedKind === 'ticket' && !subject) errors.push('Subject is required.');
  if (!description) errors.push('Description is required.');
  if (subject.length > MAX_SUBJECT_LENGTH) errors.push(`Subject must be ${MAX_SUBJECT_LENGTH} characters or fewer.`);
  if (description.length > MAX_DESCRIPTION_LENGTH) errors.push(`Description must be ${MAX_DESCRIPTION_LENGTH} characters or fewer.`);
  return Object.freeze({
    ok: errors.length === 0,
    errors: Object.freeze(errors),
    draft: Object.freeze({ category, subject, description, includeDiagnostics: draft.includeDiagnostics === true })
  });
}

function browserIdentity(userAgent) {
  const source = String(userAgent || '');
  const match = source.match(/Edg\/(\d+(?:\.\d+)*)/) || source.match(/Chrome\/(\d+(?:\.\d+)*)/) ||
    source.match(/Firefox\/(\d+(?:\.\d+)*)/) || source.match(/Version\/(\d+(?:\.\d+)*).*Safari\//);
  if (!match) return { family: 'Unknown', version: 'unknown' };
  const family = source.includes('Edg/') ? 'Edge' : source.includes('Chrome/') ? 'Chrome' :
    source.includes('Firefox/') ? 'Firefox' : 'Safari';
  return { family, version: match[1] };
}

function coarsePageType(url) {
  try {
    const parsed = new URL(String(url));
    if (parsed.hostname !== 'ussignandmill.squarecoil.net') return 'unknown';
    return /(?:^|\/)project\.php$/i.test(parsed.pathname) ? 'project-page' : 'general-page';
  } catch (_) { return 'unknown'; }
}

function safeToken(value, fallback = 'unknown') {
  const token = String(value ?? '').trim();
  return /^[A-Za-z0-9_.:/+ -]{1,120}$/.test(token) ? token : fallback;
}

function safeTechnicalReason(value, fallback = 'none') {
  const token = String(value ?? '').trim();
  return /^[A-Za-z0-9_.:/+-]{1,120}$/.test(token) ? token : fallback;
}

function createDiagnosticSnapshot(input = {}) {
  const browser = browserIdentity(input.userAgent);
  const presentation = input.presentation || {};
  const cinematic = presentation.optional?.cinematic || {};
  const preferences = input.preferences || {};
  const rootCount = Number.isSafeInteger(input.rootCount) && input.rootCount >= 0 && input.rootCount <= 99 ? input.rootCount : 0;
  const capturedAtMs = Number.isSafeInteger(input.capturedAtMs) ? input.capturedAtMs : Date.now();
  const timestamp = new Date(capturedAtMs).toISOString();
  const lines = [
    'SquareCoil Companion diagnostics (privacy-safe preview)',
    `Package: ${safeToken(input.packageName, 'SquareCoil Companion')} ${safeToken(input.packageVersion)}`,
    `Build: ${safeTechnicalReason(input.buildId, 'unknown')} / ${safeTechnicalReason(input.buildStage, 'unknown')}`,
    `Candidate: ${safeTechnicalReason(input.candidateFingerprint, 'unknown')}`,
    `Browser: ${browser.family} ${browser.version}`,
    `Page type: ${coarsePageType(input.url)}`,
    `Lifecycle: ${safeToken(input.lifecycle)}`,
    `Runtime: ${safeTechnicalReason(input.runtimeInstanceId, 'unknown')}`,
    `Worker generation: ${safeTechnicalReason(input.workerInstanceId, 'unknown')}`,
    `Coordination generation: ${Number.isSafeInteger(input.coordinationEpoch) ? input.coordinationEpoch : 'unknown'}`,
    `Settlement: ${safeTechnicalReason(input.settlementStatus, 'not-ready')}`,
    `Migration: ${safeTechnicalReason(input.migrationDisposition, 'unavailable')} / ${safeTechnicalReason(input.migrationReason, 'none')}`,
    `Bridge: ${safeToken(input.bridgeCapability)} / ${safeToken(input.bridgeStatus)}`,
    `Bridge generation: ${Number.isSafeInteger(input.bridgeGeneration) ? input.bridgeGeneration : 'unknown'}`,
    `Bridge reason: ${safeTechnicalReason(input.bridgeReason, 'none')}`,
    `Last internal error: ${safeTechnicalReason(input.lastTechnicalError, 'none')}`,
    `Core readiness: ${safeToken(input.coreReadiness)}`,
    `Timer appearance: ${safeToken(preferences.timerAppearance)} / ${safeToken(presentation.timerAppearanceEffective)}`,
    `Panel finish: ${safeToken(preferences.panelFinish)} / ${safeToken(presentation.panelFinishEffective)}`,
    `Website theme: ${safeToken(preferences.websiteTheme)} / ${safeToken(presentation.websiteThemeEffective)}`,
    `Cinematic: ${safeToken(preferences.cinematicBackground, 'NONE')} / ${safeToken(cinematic.state, 'DISABLED')} / ${safeToken(cinematic.source, 'none')}`,
    `Cinematic status: ${safeTechnicalReason(cinematic.statusCode, 'unknown')}`,
    `Cinematic failure: ${safeTechnicalReason(cinematic.failureCode, 'none')}`,
    `Cinematic fallback: ${safeTechnicalReason(cinematic.fallbackStatus, 'NONE')}`,
    `Cinematic reason: ${safeTechnicalReason(cinematic.reason, 'none')}`,
    `Cinematic layers: ${Number.isSafeInteger(cinematic.ownedHostCount) ? cinematic.ownedHostCount : 0} host / ${Number.isSafeInteger(cinematic.ownedStyleCount) ? cinematic.ownedStyleCount : 0} style`,
    `Runtime roots: ${rootCount}`,
    `Captured: ${timestamp}`
  ];
  return Object.freeze({ capturedAtMs, text: lines.join('\n') });
}

function composeSupportMessage(kind, draft, diagnostics, options = {}) {
  const validated = validateDraft(kind, draft);
  if (!validated.ok) return Object.freeze({ ok: false, errors: validated.errors, draft: validated.draft });
  const normalizedKind = kind === 'feedback' ? 'feedback' : 'ticket';
  const item = validated.draft;
  const subject = normalizedKind === 'ticket'
    ? `[SquareCoil Companion][${item.category}] ${item.subject}`
    : `[SquareCoil Companion Feedback][${item.category}]${item.subject ? ` ${item.subject}` : ''}`;
  const fields = normalizedKind === 'ticket'
    ? [`Type: ${item.category}`, `Subject: ${item.subject}`]
    : [`Category: ${item.category}`, ...(item.subject ? [`Subject: ${item.subject}`] : [])];
  const bodyParts = [
    `SquareCoil Companion ${safeToken(options.packageVersion)} ${normalizedKind === 'ticket' ? 'support ticket' : 'feedback'}`,
    '',
    ...fields,
    '',
    'Description:',
    item.description
  ];
  if (item.includeDiagnostics && diagnostics?.text) bodyParts.push('', 'Diagnostics:', diagnostics.text);
  const body = bodyParts.join('\n');
  const mailto = `mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent(subject)}&body=${encodeURIComponent(body)}`;
  const tooLarge = mailto.length > MAX_MAILTO_LENGTH;
  return Object.freeze({
    ok: true,
    recipient: SUPPORT_EMAIL,
    subject,
    body,
    copyText: `To: ${SUPPORT_EMAIL}\nSubject: ${subject}\n\n${body}`,
    mailto: tooLarge ? null : mailto,
    tooLarge,
    diagnosticsText: item.includeDiagnostics ? diagnostics?.text || '' : ''
  });
}

module.exports = {
  SUPPORT_EMAIL,
  TICKET_TYPES,
  FEEDBACK_CATEGORIES,
  MAX_SUBJECT_LENGTH,
  MAX_DESCRIPTION_LENGTH,
  MAX_MAILTO_LENGTH,
  cleanHeader,
  cleanBody,
  validateDraft,
  browserIdentity,
  coarsePageType,
  createDiagnosticSnapshot,
  composeSupportMessage
};
