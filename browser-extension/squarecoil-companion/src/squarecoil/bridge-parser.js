'use strict';

const EVIDENCE_KINDS = Object.freeze({
  CONTEXT: 'CONTEXT',
  NEGATIVE_CANDIDATE: 'NEGATIVE_CANDIDATE',
  STATE_UNKNOWN: 'STATE_UNKNOWN',
  STATE_CONFLICT: 'STATE_CONFLICT'
});

const NEGATIVE_KINDS = Object.freeze({
  NO_CONTEXT: 'NO_CONTEXT',
  CLOCKED_OUT: 'CLOCKED_OUT',
  NO_TRACKABLE_CONTEXT: 'NO_TRACKABLE_CONTEXT'
});

const STATE_CERTAINTY = Object.freeze({
  VERIFIED_SERVER: 'VERIFIED_SERVER',
  NATIVE_CONFIRMED_POSTSTATE: 'NATIVE_CONFIRMED_POSTSTATE',
  OBSERVED_DOM: 'OBSERVED_DOM',
  FALLBACK: 'FALLBACK',
  UNKNOWN: 'UNKNOWN',
  CONFLICT: 'CONFLICT'
});

const EVIDENCE_SOURCES = Object.freeze({
  SERVER_ACTION_7: 'SERVER_ACTION_7',
  CLOCK_DOM: 'CLOCK_DOM',
  RECONCILED: 'RECONCILED'
});

const AUDITED_GENERAL_CONTEXTS = Object.freeze([
  Object.freeze({
    contextId: 'general:production-general',
    generalKey: 'production-general',
    canonicalLabel: 'Production (General)',
    shortLabel: 'General',
    aliases: Object.freeze(['production (general)'])
  })
]);

const DEFAULT_EVIDENCE_FRESHNESS_MS = 5_000;
const HEADER_FRAGMENT_TAGS = new Set(['a', 'span', 'strong', 'b', 'em', 'i', 'small', 'font', 'br']);
const SERVER_DOCUMENT_TAGS = new Set(['html', 'head', 'body', 'title', 'script', 'style', 'form', 'input', 'select', 'button', 'iframe']);
const GENERAL_CONTROL_LABELS = new Set([
  'clock in', 'clock out', 'change / clock out', 'change/clock out', 'change',
  'close', 'cancel', 'submit', 'save', 'time remaining', 'clocked out',
  'not clocked in', 'unknown', 'none', 'no context', 'no current job',
  'select department', 'select project'
]);

function deepClone(value) {
  if (Array.isArray(value)) return value.map(deepClone);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value).map(([key, child]) => [key, deepClone(child)]));
}

function deepFreeze(value) {
  if (!value || typeof value !== 'object' || Object.isFrozen(value)) return value;
  for (const child of Object.values(value)) deepFreeze(child);
  return Object.freeze(value);
}

function frozenClone(value) {
  return deepFreeze(deepClone(value));
}

function assertObservedAtMs(value) {
  if (!Number.isSafeInteger(value) || value < 0) {
    throw new Error('observedAtMs must be a non-negative safe integer');
  }
  return value;
}

function decodeHtml(value) {
  return String(value || '')
    .replace(/&#(\d+);/g, (match, code) => {
      const point = Number(code);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : match;
    })
    .replace(/&#x([0-9a-f]+);/gi, (match, code) => {
      const point = Number.parseInt(code, 16);
      return Number.isInteger(point) && point >= 0 && point <= 0x10ffff
        ? String.fromCodePoint(point)
        : match;
    })
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'");
}

function normalizeText(value) {
  return decodeHtml(String(value || '').replace(/<[^>]*>/g, ' '))
    .replace(/\s+/g, ' ')
    .trim();
}

function normalizedLabelKey(value) {
  return normalizeText(value).toLocaleLowerCase('en-US');
}

function parseAttributes(source) {
  const attributes = Object.create(null);
  let cursor = 0;
  while (cursor < source.length) {
    while (/\s/.test(source[cursor] || '')) cursor += 1;
    if (cursor >= source.length) break;
    if (source[cursor] === '/') {
      cursor += 1;
      while (/\s/.test(source[cursor] || '')) cursor += 1;
      if (cursor !== source.length) return null;
      break;
    }

    const nameStart = cursor;
    while (cursor < source.length && !/[\s=/>]/.test(source[cursor])) cursor += 1;
    if (cursor === nameStart) return null;
    const name = source.slice(nameStart, cursor).toLocaleLowerCase('en-US');
    if (Object.prototype.hasOwnProperty.call(attributes, name)) return null;
    while (/\s/.test(source[cursor] || '')) cursor += 1;

    let value = '';
    if (source[cursor] === '=') {
      cursor += 1;
      while (/\s/.test(source[cursor] || '')) cursor += 1;
      if (cursor >= source.length) return null;
      const quote = source[cursor];
      if (quote === '"' || quote === "'") {
        cursor += 1;
        const valueStart = cursor;
        while (cursor < source.length && source[cursor] !== quote) cursor += 1;
        if (cursor >= source.length) return null;
        value = source.slice(valueStart, cursor);
        cursor += 1;
      } else {
        const valueStart = cursor;
        while (cursor < source.length && !/[\s>]/.test(source[cursor])) cursor += 1;
        if (cursor === valueStart) return null;
        value = source.slice(valueStart, cursor);
      }
    }
    attributes[name] = decodeHtml(value);
  }
  return attributes;
}

function scanTagEnd(html, start) {
  let quote = null;
  for (let cursor = start + 1; cursor < html.length; cursor += 1) {
    const character = html[cursor];
    if (quote) {
      if (character === quote) quote = null;
    } else if (character === '"' || character === "'") {
      quote = character;
    } else if (character === '>') {
      return cursor;
    }
  }
  return -1;
}

function tokenizeHtml(html) {
  const source = String(html || '');
  const tokens = [];
  let cursor = 0;
  while (cursor < source.length) {
    const start = source.indexOf('<', cursor);
    if (start < 0) break;
    if (source.startsWith('<!--', start)) {
      const end = source.indexOf('-->', start + 4);
      if (end < 0) return { malformed: true, tokens: [] };
      cursor = end + 3;
      continue;
    }
    const end = scanTagEnd(source, start);
    if (end < 0) return { malformed: true, tokens: [] };
    const raw = source.slice(start, end + 1);
    if (/^<\s*[!?]/.test(raw)) {
      cursor = end + 1;
      continue;
    }

    const closing = raw.match(/^<\s*\/\s*([a-z][\w:-]*)\s*>$/i);
    if (closing) {
      tokens.push({ kind: 'close', name: closing[1].toLocaleLowerCase('en-US'), start, end: end + 1 });
      cursor = end + 1;
      continue;
    }

    const opening = raw.match(/^<\s*([a-z][\w:-]*)([\s\S]*?)>$/i);
    if (!opening) return { malformed: true, tokens: [] };
    const attributeSource = opening[2].replace(/\/\s*$/, '');
    const attributes = parseAttributes(attributeSource);
    if (!attributes) return { malformed: true, tokens: [] };
    tokens.push({
      kind: 'open',
      name: opening[1].toLocaleLowerCase('en-US'),
      attributes,
      selfClosing: /\/\s*>$/.test(raw),
      start,
      end: end + 1
    });
    cursor = end + 1;
  }
  return { malformed: false, tokens };
}

function closingTokenIndex(tokens, openIndex) {
  const open = tokens[openIndex];
  if (!open || open.kind !== 'open') return -1;
  if (open.selfClosing) return openIndex;
  let depth = 1;
  for (let index = openIndex + 1; index < tokens.length; index += 1) {
    const token = tokens[index];
    if (token.name !== open.name) continue;
    if (token.kind === 'open' && !token.selfClosing) depth += 1;
    if (token.kind === 'close') depth -= 1;
    if (depth === 0) return index;
  }
  return -1;
}

function findExactElementById(html, id) {
  const scanned = tokenizeHtml(html);
  if (scanned.malformed) return { malformed: true, reason: 'MALFORMED_HTML' };
  const matches = scanned.tokens
    .map((token, index) => ({ token, index }))
    .filter(({ token }) => token.kind === 'open' && token.attributes.id === id);
  if (matches.length !== 1) {
    return {
      malformed: matches.length > 1,
      reason: matches.length > 1 ? 'DUPLICATE_AUDITED_CLOCK_ELEMENT' : 'AUDITED_CLOCK_ELEMENT_MISSING'
    };
  }
  const match = matches[0];
  const closeIndex = closingTokenIndex(scanned.tokens, match.index);
  if (closeIndex < 0) return { malformed: true, reason: 'UNCLOSED_AUDITED_CLOCK_ELEMENT' };
  const close = scanned.tokens[closeIndex];
  return {
    malformed: false,
    openTag: match.token,
    innerHtml: match.token.selfClosing ? '' : String(html).slice(match.token.end, close.start)
  };
}

function projectIdFromHref(href) {
  const raw = decodeHtml(href).trim();
  if (!raw) return null;
  let url;
  try {
    url = new URL(raw, 'https://squarecoil.invalid/');
  } catch (_error) {
    return null;
  }
  const relative = !/^[a-z][a-z\d+.-]*:|^\/\//i.test(raw);
  if (url.username || url.password || (url.origin !== 'https://ussignandmill.squarecoil.net' &&
      !(relative && url.origin === 'https://squarecoil.invalid'))) return null;
  if (url.pathname.toLocaleLowerCase('en-US') !== '/project.php') return null;
  const ids = url.searchParams.getAll('id');
  if (ids.length !== 1 || !/^\d+$/.test(ids[0])) return null;
  const normalized = ids[0].replace(/^0+(?=\d)/, '');
  return normalized || '0';
}

function labelJobIds(label) {
  return [...normalizeText(label).matchAll(/(?:^|#|\b)(\d{6})(?=\b|\s*[-/])/g)]
    .map(match => match[1].replace(/^0+(?=\d)/, ''));
}

function fallbackJobIdFromLabel(label) {
  const matches = labelJobIds(label);
  return new Set(matches).size === 1 && matches[0] !== '0' ? matches[0] : null;
}

function auditedGeneralRule(label) {
  const key = normalizedLabelKey(label);
  return AUDITED_GENERAL_CONTEXTS.find(rule => rule.aliases.includes(key)) || null;
}

function departmentGeneralRule(label, explicitGeneralProject) {
  const normalized = normalizeText(label);
  const key = normalizedLabelKey(normalized);
  if (!normalized || normalized.length > 100 || GENERAL_CONTROL_LABELS.has(key) ||
      !/\p{L}/u.test(normalized) || labelJobIds(normalized).length ||
      !/^[\p{L}\p{N}\p{M} &/'()._-]+$/u.test(normalized)) return null;
  const namedGeneral = normalized.match(/^(.+?)\s*\(general\)$/i);
  if (!explicitGeneralProject && !namedGeneral) return null;
  const departmentLabel = normalizeText(namedGeneral ? namedGeneral[1] : normalized.replace(/\s+general$/i, ''));
  if (!departmentLabel || /\(general\)/i.test(departmentLabel) ||
      GENERAL_CONTROL_LABELS.has(normalizedLabelKey(departmentLabel))) return null;
  // Retain the original producer's full-label slug. Inventing a suffix or a
  // department alias would split imported history from the resumed Context.
  const generalKey = normalized.toLowerCase().replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '').slice(0, 40) || 'general';
  return { contextId: `general:${generalKey}`, generalKey, canonicalLabel: normalized, shortLabel: 'General' };
}

function makeGeneralContext(rule, label, department) {
  return frozenClone({
    contextId: rule.contextId,
    kind: 'general',
    generalKey: rule.generalKey,
    label: normalizeText(label) || rule.canonicalLabel,
    shortLabel: rule.shortLabel,
    department: normalizeText(department) || null
  });
}

function makeJobContext(projectId, label, department) {
  return frozenClone({
    contextId: `job:${projectId}`,
    kind: 'job',
    projectId,
    label: normalizeText(label) || `Job ${projectId}`,
    shortLabel: projectId,
    department: normalizeText(department) || null
  });
}

function parseClockContext(parts = {}) {
  const label = normalizeText(parts.label);
  const department = normalizeText(parts.department);
  const projectId = projectIdFromHref(parts.href);
  const knownGeneralRule = auditedGeneralRule(label);
  const generalRule = knownGeneralRule || departmentGeneralRule(label, projectId === '0');

  if (generalRule) {
    if (projectId && projectId !== '0') {
      return frozenClone({ context: null, reason: 'GENERAL_PROJECT_ID_CONFLICT', conflict: true });
    }
    return frozenClone({
      context: makeGeneralContext(generalRule, label, department),
      reason: 'AUDITED_GENERAL_CONTEXT',
      provenance: knownGeneralRule ? 'AUDITED_GENERAL_ALLOWLIST'
        : projectId === '0' ? 'CLOCK_GENERAL_PROJECT_LINK' : 'CLOCK_GENERAL_DEPARTMENT_LABEL'
    });
  }
  if (projectId && projectId !== '0') {
    return frozenClone({
      context: makeJobContext(projectId, label, department),
      reason: 'PROJECT_LINK_CONTEXT',
      provenance: 'CLOCK_PROJECT_LINK'
    });
  }
  if (projectId === '0') {
    return frozenClone({ context: null, reason: label ? 'UNSUPPORTED_GENERAL_LABEL' : 'EMPTY_GENERAL_LABEL' });
  }
  const fallbackId = parts.allowSixDigitFallback === false ? null : fallbackJobIdFromLabel(label);
  if (fallbackId) {
    return frozenClone({
      context: makeJobContext(fallbackId, label, department),
      reason: 'AUDITED_CLOCK_LABEL_CONTEXT',
      provenance: 'CLOCK_LABEL_SIX_DIGIT_FALLBACK'
    });
  }
  return frozenClone({ context: null, reason: label ? 'UNSUPPORTED_CLOCK_LABEL' : 'NO_CONTEXT_TEXT' });
}

function evidence(value) {
  return frozenClone(value);
}

function unknown(source, observedAtMs, reason, fields = {}) {
  return evidence({
    kind: EVIDENCE_KINDS.STATE_UNKNOWN,
    polarity: 'UNKNOWN',
    source,
    observedAtMs,
    stateCertainty: STATE_CERTAINTY.UNKNOWN,
    reason,
    ...fields
  });
}

function conflict(source, observedAtMs, reason, fields = {}) {
  return evidence({
    kind: EVIDENCE_KINDS.STATE_CONFLICT,
    polarity: 'CONFLICT',
    source,
    observedAtMs,
    stateCertainty: STATE_CERTAINTY.CONFLICT,
    reason,
    ...fields
  });
}

function positive(source, observedAtMs, stateCertainty, parsed) {
  return evidence({
    kind: EVIDENCE_KINDS.CONTEXT,
    polarity: 'POSITIVE',
    source,
    observedAtMs,
    stateCertainty,
    context: parsed.context,
    provenance: parsed.provenance
  });
}

function negative(source, observedAtMs, negativeKind, reason) {
  return evidence({
    kind: EVIDENCE_KINDS.NEGATIVE_CANDIDATE,
    polarity: 'NEGATIVE',
    source,
    observedAtMs,
    stateCertainty: STATE_CERTAINTY.UNKNOWN,
    negativeKind,
    reason
  });
}

function projectAnchors(innerHtml) {
  const scanned = tokenizeHtml(innerHtml);
  if (scanned.malformed) return { malformed: true, anchors: [] };
  const anchors = [];
  for (let index = 0; index < scanned.tokens.length; index += 1) {
    const token = scanned.tokens[index];
    if (token.kind !== 'open' || token.name !== 'a') continue;
    if (token.selfClosing) return { malformed: true, anchors: [] };
    const closeIndex = closingTokenIndex(scanned.tokens, index);
    if (closeIndex < 0) return { malformed: true, anchors: [] };
    const close = scanned.tokens[closeIndex];
    const href = token.attributes.href;
    if (href !== undefined) {
      anchors.push({
        href,
        projectId: projectIdFromHref(href),
        label: normalizeText(String(innerHtml).slice(token.end, close.start))
      });
    }
  }
  return { malformed: false, anchors };
}

function parseScopedContext(parts = {}) {
  const html = String(parts.html || '');
  const explicitLabel = parts.text === undefined ? null : normalizeText(parts.text);
  const anchors = projectAnchors(html);
  if (anchors.malformed) return frozenClone({ context: null, malformed: true, reason: 'MALFORMED_CLOCK_SCOPE' });
  if (anchors.anchors.some(anchor => anchor.projectId === null)) {
    return frozenClone({ context: null, reason: 'UNSUPPORTED_CLOCK_LINK' });
  }
  const projectAnchorsOnly = anchors.anchors.filter(anchor => anchor.projectId !== null);
  const distinctProjectIds = new Set(projectAnchorsOnly.map(anchor => anchor.projectId));
  if (distinctProjectIds.size > 1) {
    return frozenClone({ context: null, conflict: true, reason: 'MULTIPLE_CLOCK_PROJECT_IDENTITIES' });
  }
  const generalContextIds = new Set(projectAnchorsOnly.filter(anchor => anchor.projectId === '0')
    .map(anchor => parseClockContext({ href: anchor.href, label: anchor.label }).context?.contextId)
    .filter(Boolean));
  if (generalContextIds.size > 1) {
    return frozenClone({ context: null, conflict: true, reason: 'MULTIPLE_CLOCK_GENERAL_IDENTITIES' });
  }
  const anchor = projectAnchorsOnly[0] || null;
  // A project-zero link identifies the native department label. Surrounding
  // countdown/debug text must not manufacture a second General identity.
  const label = anchor?.projectId === '0' && anchor.label
    ? anchor.label
    : explicitLabel || anchor?.label || normalizeText(html);
  const href = parts.href === undefined ? anchor?.href : parts.href;
  return parseClockContext({
    href,
    label,
    department: parts.department,
    allowSixDigitFallback: parts.allowSixDigitFallback
  });
}

function auditedHeaderFragment(html) {
  const scanned = tokenizeHtml(html);
  if (scanned.malformed) return { ok: false, reason: 'MALFORMED_CLOCK_HEADER_FRAGMENT' };
  const stack = [];
  for (const token of scanned.tokens) {
    if (!HEADER_FRAGMENT_TAGS.has(token.name)) return { ok: false, reason: 'UNSAFE_CLOCK_HEADER_FRAGMENT' };
    if (token.kind === 'close') {
      if (token.name === 'br' || stack.pop() !== token.name) {
        return { ok: false, reason: 'MALFORMED_CLOCK_HEADER_FRAGMENT' };
      }
      continue;
    }
    if (Object.keys(token.attributes).some(name => name === 'id' || name === 'data-id' || /^on/i.test(name))) {
      return { ok: false, reason: 'UNSAFE_CLOCK_HEADER_FRAGMENT' };
    }
    if (token.name === 'a' && (stack.includes('a') || !projectIdFromHref(token.attributes.href))) {
      return { ok: false, reason: 'UNSUPPORTED_CLOCK_LINK' };
    }
    if (token.selfClosing && token.name !== 'br') return { ok: false, reason: 'MALFORMED_CLOCK_HEADER_FRAGMENT' };
    if (token.name !== 'br') stack.push(token.name);
  }
  return stack.length ? { ok: false, reason: 'MALFORMED_CLOCK_HEADER_FRAGMENT' } : { ok: true };
}

function parseServerSnapshot(html, options = {}) {
  const observedAtMs = assertObservedAtMs(options.observedAtMs);
  const source = EVIDENCE_SOURCES.SERVER_ACTION_7;
  if (options.available === false || options.success === false) {
    return unknown(source, observedAtMs, 'SERVER_UNAVAILABLE');
  }
  if (typeof html !== 'string' || !html.trim()) {
    return unknown(source, observedAtMs, 'EMPTY_OR_MALFORMED_SERVER_SNAPSHOT');
  }
  const scanned = tokenizeHtml(html);
  if (scanned.tokens.some(token => SERVER_DOCUMENT_TAGS.has(token.name)) || /<!doctype\b/i.test(html)) {
    return unknown(source, observedAtMs, 'UNSAFE_SERVER_SNAPSHOT');
  }
  const element = findExactElementById(html, 'clockin-remaining-time');
  let clockHtml = element.innerHtml;
  let fragmentOnly = false;
  if (element.reason) {
    if (element.malformed || element.reason !== 'AUDITED_CLOCK_ELEMENT_MISSING') {
      return unknown(source, observedAtMs, element.reason);
    }
    // action 7 may return the header's inner HTML rather than its enclosing
    // span. Only a complete inline clock fragment from that audited endpoint
    // qualifies; arbitrary page/body/container searches remain prohibited.
    const fragment = auditedHeaderFragment(html);
    if (!fragment.ok) return unknown(source, observedAtMs, fragment.reason);
    clockHtml = html;
    fragmentOnly = true;
  }
  const parsed = parseScopedContext({
    html: clockHtml,
    department: options.department,
    // Unwrapped plain text may be an error response containing a job number.
    // Numeric label fallback requires the explicit audited clock scope.
    allowSixDigitFallback: !fragmentOnly
  });
  if (parsed.context) return positive(source, observedAtMs, STATE_CERTAINTY.VERIFIED_SERVER, parsed);
  if (parsed.conflict) return conflict(source, observedAtMs, parsed.reason);
  if (parsed.malformed) return unknown(source, observedAtMs, parsed.reason);
  if (normalizeText(clockHtml)) return unknown(source, observedAtMs, parsed.reason);
  return negative(source, observedAtMs, NEGATIVE_KINDS.NO_CONTEXT, 'SERVER_NO_CONTEXT_CANDIDATE');
}

function domScope(snapshot, name) {
  const objectValue = snapshot[name];
  if (objectValue !== undefined && (objectValue === null || typeof objectValue !== 'object')) {
    return { malformed: true };
  }
  const prefix = name === 'remainingTime' ? 'remainingTime' : 'debug';
  const value = objectValue || {};
  return {
    malformed: false,
    html: value.html ?? snapshot[`${prefix}Html`] ?? '',
    text: value.text ?? snapshot[`${prefix}Text`],
    href: value.href ?? snapshot[`${prefix}Href`],
    department: value.department ?? snapshot.department
  };
}

function parseDomSnapshot(snapshot, options = {}) {
  const observedAtMs = assertObservedAtMs(options.observedAtMs);
  const source = EVIDENCE_SOURCES.CLOCK_DOM;
  if (!snapshot || typeof snapshot !== 'object' || Array.isArray(snapshot) || options.available === false) {
    return unknown(source, observedAtMs, 'DOM_UNAVAILABLE');
  }
  const primaryParts = domScope(snapshot, 'remainingTime');
  const debugParts = domScope(snapshot, 'debug');
  if (primaryParts.malformed || debugParts.malformed) {
    return unknown(source, observedAtMs, 'MALFORMED_DOM_SNAPSHOT');
  }
  const primary = parseScopedContext({ ...primaryParts, allowSixDigitFallback: true });
  const debug = parseScopedContext({ ...debugParts, allowSixDigitFallback: true });
  if (primary.malformed || debug.malformed) return unknown(source, observedAtMs, 'MALFORMED_DOM_CLOCK_SCOPE');
  if (primary.conflict || debug.conflict) {
    return conflict(source, observedAtMs, primary.reason || debug.reason);
  }
  if (primary.context && debug.context && primary.context.contextId !== debug.context.contextId) {
    return conflict(source, observedAtMs, 'DOM_CLOCK_SOURCES_DISAGREE', {
      contextIds: [primary.context.contextId, debug.context.contextId]
    });
  }
  const parsed = primary.context ? primary : debug.context ? debug : null;
  if (parsed) return positive(source, observedAtMs, STATE_CERTAINTY.OBSERVED_DOM, parsed);

  const primaryText = normalizeText(primaryParts.text ?? primaryParts.html);
  const debugText = normalizeText(debugParts.text ?? debugParts.html);
  if (primaryText || debugText) {
    return unknown(source, observedAtMs, primaryText ? primary.reason : debug.reason);
  }

  // Empty-looking data-time values (including || and ||||) intentionally carry
  // no negative meaning. Only exact booleans from audited control visibility do.
  if (snapshot.clockInVisible === true && snapshot.clockOutVisible === false) {
    return negative(source, observedAtMs, NEGATIVE_KINDS.CLOCKED_OUT, 'CLOCKED_OUT_CONTROL_CANDIDATE');
  }
  if (snapshot.clockOutVisible === true) {
    return negative(
      source,
      observedAtMs,
      NEGATIVE_KINDS.NO_TRACKABLE_CONTEXT,
      'NO_TRACKABLE_CONTROL_CANDIDATE'
    );
  }
  return unknown(source, observedAtMs, 'DOM_STATE_INSUFFICIENT');
}

function assertEvidence(value) {
  if (!value || typeof value !== 'object' || !Object.values(EVIDENCE_KINDS).includes(value.kind)) {
    throw new Error('normalized Bridge evidence is required');
  }
  assertObservedAtMs(value.observedAtMs);
  return value;
}

function evidencePriority(value) {
  if (value.source === EVIDENCE_SOURCES.SERVER_ACTION_7) return 3;
  if (value.source === EVIDENCE_SOURCES.CLOCK_DOM) return 2;
  return 1;
}

function reconcileEvidence(items, options = {}) {
  if (!Array.isArray(items) || items.length === 0) {
    const observedAtMs = assertObservedAtMs(options.observedAtMs ?? 0);
    return unknown(EVIDENCE_SOURCES.RECONCILED, observedAtMs, 'NO_EVIDENCE');
  }
  const evidenceItems = items.map(assertEvidence);
  const newestAtMs = Math.max(...evidenceItems.map(item => item.observedAtMs));
  const freshnessWindowMs = options.freshnessWindowMs ?? DEFAULT_EVIDENCE_FRESHNESS_MS;
  if (!Number.isSafeInteger(freshnessWindowMs) || freshnessWindowMs < 0) {
    throw new Error('freshnessWindowMs must be a non-negative safe integer');
  }
  const fresh = evidenceItems.filter(item => newestAtMs - item.observedAtMs <= freshnessWindowMs);
  const positives = fresh.filter(item => item.kind === EVIDENCE_KINDS.CONTEXT);
  const directConflict = fresh.find(item => item.kind === EVIDENCE_KINDS.STATE_CONFLICT);
  if (directConflict) {
    return conflict(EVIDENCE_SOURCES.RECONCILED, newestAtMs, directConflict.reason, {
      supportingSources: [...new Set(fresh.map(item => item.source))].sort()
    });
  }
  const contextIds = [...new Set(positives.map(item => item.context.contextId))];
  if (contextIds.length > 1) {
    return conflict(EVIDENCE_SOURCES.RECONCILED, newestAtMs, 'FRESH_POSITIVE_CONTEXT_CONFLICT', {
      contextIds: contextIds.sort(),
      supportingSources: [...new Set(positives.map(item => item.source))].sort()
    });
  }
  if (positives.length) {
    const selected = [...positives].sort((left, right) =>
      evidencePriority(right) - evidencePriority(left) || right.observedAtMs - left.observedAtMs
    )[0];
    return evidence({
      ...deepClone(selected),
      supportingSources: [...new Set(positives.map(item => item.source))].sort()
    });
  }
  const negatives = fresh.filter(item => item.kind === EVIDENCE_KINDS.NEGATIVE_CANDIDATE);
  const negativeKinds = [...new Set(negatives.map(item => item.negativeKind))];
  if (negativeKinds.length === 2 && negativeKinds.includes(NEGATIVE_KINDS.NO_CONTEXT)) {
    const specificKind = negativeKinds.find(kind => kind !== NEGATIVE_KINDS.NO_CONTEXT);
    return frozenClone([...negatives].filter(item => item.negativeKind === specificKind)
      .sort((left, right) => evidencePriority(right) - evidencePriority(left) ||
        right.observedAtMs - left.observedAtMs)[0]);
  }
  if (negativeKinds.length > 1) {
    return conflict(EVIDENCE_SOURCES.RECONCILED, newestAtMs, 'FRESH_NEGATIVE_STATE_CONFLICT', {
      negativeKinds: negativeKinds.sort()
    });
  }
  if (negatives.length) {
    return frozenClone([...negatives].sort((left, right) =>
      evidencePriority(right) - evidencePriority(left) || right.observedAtMs - left.observedAtMs
    )[0]);
  }
  return frozenClone([...fresh].sort((left, right) => right.observedAtMs - left.observedAtMs)[0]);
}

module.exports = {
  EVIDENCE_KINDS,
  NEGATIVE_KINDS,
  STATE_CERTAINTY,
  EVIDENCE_SOURCES,
  AUDITED_GENERAL_CONTEXTS,
  DEFAULT_EVIDENCE_FRESHNESS_MS,
  normalizeText,
  projectIdFromHref,
  parseClockContext,
  parseServerSnapshot,
  parseDomSnapshot,
  reconcileEvidence
};
