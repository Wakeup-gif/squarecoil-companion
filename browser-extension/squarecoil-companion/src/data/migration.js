'use strict';

const {
  deepClone,
  isRecord,
  isNonNegativeInteger,
  validateDocument
} = require('./model');
const {
  splitInterval,
  dedupeSegments,
  intervalFingerprint
} = require('./ledger');
const {
  createRecoveryCheckpoint,
  validateRecoveryCheckpoint,
  recoverVerifiedSegments,
  checkpointToRecoveryEvidence
} = require('./checkpoint');
const {
  LEGACY_SOURCE_KEYS,
  V07_MIGRATION_MARKER_ID,
  V07_MIGRATION_VERSION,
  V07_MIGRATION_SOURCE_SCHEMA
} = require('./migration-schema');

function migrationError(code, details = {}) {
  const error = new Error(code);
  error.code = code;
  error.details = deepClone(details);
  return error;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value)
    .filter(key => value[key] !== undefined)
    .sort()
    .map(key => JSON.stringify(key) + ':' + stableStringify(value[key]))
    .join(',') + '}';
}

function checksum(value) {
  const text = stableStringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    hash ^= text.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return 'fnv1a32:' + hash.toString(16).padStart(8, '0') + ':' + text.length;
}

function shortHash(value) {
  return checksum(value).split(':')[1];
}

function hasOwn(value, key) {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function sourceEntry(sources, key, alias) {
  if (hasOwn(sources, key)) return { present: true, value: sources[key] };
  if (hasOwn(sources, alias)) return { present: true, value: sources[alias] };
  return { present: false, value: null };
}

function parseSource(entry, key, allowArray = false) {
  if (!entry.present) return { present: false, value: null };
  let value = entry.value;
  if (typeof value === 'string') {
    try {
      value = JSON.parse(value);
    } catch (_) {
      throw migrationError('legacy-source-json-invalid', { sourceKey: key });
    }
  }
  if (value === null) return { present: true, value: null };
  if (!isRecord(value) && !(allowArray && Array.isArray(value))) {
    throw migrationError('legacy-source-shape-invalid', { sourceKey: key });
  }
  return { present: true, value: deepClone(value) };
}

function normalizeLegacySources(sources) {
  if (!isRecord(sources)) throw migrationError('legacy-sources-invalid');
  const current = parseSource(
    sourceEntry(sources, LEGACY_SOURCE_KEYS.CURRENT, 'current'),
    LEGACY_SOURCE_KEYS.CURRENT
  );
  const archive = parseSource(
    sourceEntry(sources, LEGACY_SOURCE_KEYS.ARCHIVE, 'archive'),
    LEGACY_SOURCE_KEYS.ARCHIVE
  );
  const activityEntry = sourceEntry(sources, LEGACY_SOURCE_KEYS.ACTIVITY, 'activity');
  let activity;
  try {
    activity = parseSource(activityEntry, LEGACY_SOURCE_KEYS.ACTIVITY, true);
  } catch (error) {
    activity = {
      present: activityEntry.present,
      value: null,
      markerValue: {
        ignoredUnreadableActivity: true,
        rawChecksum: checksum({ raw: activityEntry.value })
      },
      ignoredDiagnostic: {
        code: 'LEGACY_ACTIVITY_IGNORED',
        reason: error.code || 'legacy-activity-unreadable'
      }
    };
  }
  return { current, archive, activity };
}

function createV07SourceMarker(normalizedSources, completedAtMs) {
  const payload = {
    [LEGACY_SOURCE_KEYS.CURRENT]: normalizedSources.current.present
      ? normalizedSources.current.value
      : undefined,
    [LEGACY_SOURCE_KEYS.ARCHIVE]: normalizedSources.archive.present
      ? normalizedSources.archive.value
      : undefined,
    [LEGACY_SOURCE_KEYS.ACTIVITY]: normalizedSources.activity.present
      ? hasOwn(normalizedSources.activity, 'markerValue')
        ? normalizedSources.activity.markerValue
        : normalizedSources.activity.value
      : undefined
  };
  const presentKeys = Object.keys(payload).filter(key => payload[key] !== undefined);
  return {
    markerId: V07_MIGRATION_MARKER_ID,
    migrationVersion: V07_MIGRATION_VERSION,
    sourceSchema: V07_MIGRATION_SOURCE_SCHEMA,
    sourceIdentity: presentKeys.sort().join('+'),
    sourceChecksum: checksum(payload),
    authoritySourceChecksums: {
      [LEGACY_SOURCE_KEYS.CURRENT]: checksum(normalizedSources.current.present
        ? { present: true, value: normalizedSources.current.value }
        : { present: false }),
      [LEGACY_SOURCE_KEYS.ARCHIVE]: checksum(normalizedSources.archive.present
        ? { present: true, value: normalizedSources.archive.value }
        : { present: false })
    },
    activitySourceChecksum: checksum(normalizedSources.activity.present
      ? { present: true, value: hasOwn(normalizedSources.activity, 'markerValue')
        ? normalizedSources.activity.markerValue
        : normalizedSources.activity.value }
      : { present: false }),
    completionState: 'COMPLETE',
    completedAtMs
  };
}

function legacyInteger(value) {
  if (value === null || value === undefined || value === '') return null;
  const number = typeof value === 'number' ? value : Number(value);
  return Number.isSafeInteger(number) && number >= 0 ? number : null;
}

function legacyText(value) {
  return typeof value === 'string' && value.trim() ? value.trim() : null;
}

function firstInteger(record, names) {
  for (const name of names) {
    if (!hasOwn(record, name)) continue;
    const value = legacyInteger(record[name]);
    if (value !== null) return value;
  }
  return null;
}

function firstText(record, names) {
  for (const name of names) {
    const value = legacyText(record[name]);
    if (value) return value;
  }
  return null;
}

function normalizedGeneralId(legacyKey, raw) {
  const label = String(raw.label || raw.currentLabel || '').trim();
  const key = String(raw.contextId || raw.key || legacyKey || '').trim().toLowerCase();
  if (
    key === 'general:production-general' ||
    /^production\s*\(general\)$/i.test(label)
  ) {
    return 'general:production-general';
  }
  if (/^general:[a-z0-9][a-z0-9:_-]*$/i.test(key)) return key;
  return null;
}

function normalizeContextIdentity(legacyKey, raw) {
  const explicitKind = String(raw.kind || raw.type || '').trim().toLowerCase();
  const rawProjectId = String(raw.projectId ?? '').trim();
  const key = String(raw.contextId || raw.key || legacyKey || '').trim();
  const keyJob = key.match(/^job:([1-9]\d*)$/i);
  const isGeneral = explicitKind === 'general' || rawProjectId === '0' || /^general:/i.test(key);

  if (isGeneral) {
    const contextId = normalizedGeneralId(legacyKey, raw);
    if (!contextId) return null;
    return { contextId, kind: 'general', projectId: null };
  }

  const projectId = /^[1-9]\d*$/.test(rawProjectId)
    ? rawProjectId
    : keyJob && keyJob[1];
  if (!projectId) return null;
  return { contextId: 'job:' + projectId, kind: 'job', projectId };
}

function contextsObject(source, sourceKey) {
  if (!source) return {};
  if (source.contexts === undefined || source.contexts === null) return {};
  if (!isRecord(source.contexts)) {
    throw migrationError('legacy-contexts-shape-invalid', { sourceKey });
  }
  return source.contexts;
}

function appendDiagnostic(diagnostics, code, details = {}) {
  const row = { code };
  for (const [key, value] of Object.entries(details)) {
    if (value !== null && value !== undefined) row[key] = value;
  }
  diagnostics.push(row);
}

function collectContextGroups(normalizedSources, diagnostics) {
  const groups = new Map();
  const keyToContextId = new Map();

  function bindLegacyKey(value, contextId, sourceKey) {
    const key = legacyText(value);
    if (!key) return;
    const previousMapping = keyToContextId.get(key);
    if (previousMapping && previousMapping !== contextId) {
      throw migrationError('legacy-context-key-conflict', {
        sourceKey,
        legacyKey: key,
        firstContextId: previousMapping,
        conflictingContextId: contextId
      });
    }
    keyToContextId.set(key, contextId);
  }

  function addSource(sourceName, sourceKey, source, membership) {
    const contexts = contextsObject(source, sourceKey);
    for (const legacyKey of Object.keys(contexts).sort()) {
      const raw = contexts[legacyKey];
      if (!isRecord(raw)) {
        throw migrationError('legacy-context-invalid', { sourceKey, legacyKey });
      }
      const identity = normalizeContextIdentity(legacyKey, raw);
      if (!identity) {
        throw migrationError('legacy-context-identity-invalid', { sourceKey, legacyKey });
      }
      if (raw.sessions !== undefined && raw.sessions !== null && !Array.isArray(raw.sessions)) {
        throw migrationError('legacy-sessions-shape-invalid', {
          sourceKey,
          contextId: identity.contextId
        });
      }

      bindLegacyKey(legacyKey, identity.contextId, sourceKey);
      bindLegacyKey(raw.key, identity.contextId, sourceKey);
      bindLegacyKey(raw.contextId, identity.contextId, sourceKey);

      if (!groups.has(identity.contextId)) {
        groups.set(identity.contextId, {
          ...identity,
          records: [],
          hasCurrent: false,
          hasArchive: false,
          importedSegments: [],
          trustedSessionEvidence: new Map()
        });
      }
      const group = groups.get(identity.contextId);
      if (group.kind !== identity.kind || group.projectId !== identity.projectId) {
        throw migrationError('legacy-context-identity-conflict', {
          contextId: identity.contextId
        });
      }
      const accumulatedMs = legacyInteger(raw.accumulatedMs);
      if (raw.accumulatedMs !== undefined && accumulatedMs === null) {
        appendDiagnostic(diagnostics, 'LEGACY_ACCUMULATED_INVALID', {
          contextId: identity.contextId,
          source: sourceName
        });
      }
      group.records.push({
        sourceName,
        sourceKey,
        legacyKey,
        membership,
        raw,
        accumulatedMs: accumulatedMs || 0
      });
      if (membership === 'RECENT') group.hasCurrent = true;
      if (membership === 'ARCHIVED') group.hasArchive = true;
    }
  }

  addSource(
    'current',
    LEGACY_SOURCE_KEYS.CURRENT,
    normalizedSources.current.value,
    'RECENT'
  );
  addSource(
    'archive',
    LEGACY_SOURCE_KEYS.ARCHIVE,
    normalizedSources.archive.value,
    'ARCHIVED'
  );
  return { groups, keyToContextId };
}

function normalizeSessionEvidence(raw, group, record, index, diagnostics) {
  if (!isRecord(raw)) {
    throw migrationError('legacy-session-invalid', {
      contextId: group.contextId,
      source: record.sourceName,
      index
    });
  }
  const trustedId = firstText(raw, ['id', 'sessionId']);
  const startAtMs = firstInteger(raw, ['startAtMs', 'startAt']);
  const endAtMs = firstInteger(raw, ['endAtMs', 'endAt']);
  const storedDurationMs = firstInteger(raw, ['durationMs', 'duration']);
  const cycleId = firstText(raw, ['cycleId']) || firstText(record.raw, ['cycleId']);
  const base = {
    trustedId,
    startAtMs,
    endAtMs,
    storedDurationMs,
    cycleId,
    reason: firstText(raw, ['endReason', 'reason']),
    source: firstText(raw, ['source']),
    certainty: firstText(raw, ['certainty', 'confidence']),
    createdAtMs: firstInteger(raw, ['createdAtMs', 'createdAt']),
    raw
  };

  if (startAtMs !== null && endAtMs !== null) {
    if (endAtMs < startAtMs) {
      appendDiagnostic(diagnostics, 'LEGACY_SESSION_REVERSED', {
        contextId: group.contextId,
        legacySessionId: trustedId
      });
      return null;
    }
    const durationMs = endAtMs - startAtMs;
    if (storedDurationMs !== null && storedDurationMs !== durationMs) {
      appendDiagnostic(diagnostics, 'LEGACY_SESSION_DURATION_MISMATCH', {
        contextId: group.contextId,
        legacySessionId: trustedId,
        storedDurationMs,
        timestampDurationMs: durationMs
      });
    }
    if (durationMs === 0) return null;
    return { ...base, kind: 'ATTRIBUTED', durationMs };
  }

  if (storedDurationMs !== null && storedDurationMs > 0) {
    appendDiagnostic(diagnostics, 'LEGACY_SESSION_UNDATED_DURATION', {
      contextId: group.contextId,
      legacySessionId: trustedId,
      durationMs: storedDurationMs
    });
    return { ...base, kind: 'UNDATED', durationMs: storedDurationMs };
  }

  if (storedDurationMs === 0) return null;
  throw migrationError('legacy-session-unreadable', {
    contextId: group.contextId,
    source: record.sourceName,
    index,
    legacySessionId: trustedId
  });
}

function evidenceMaterial(evidence) {
  return [
    evidence.kind,
    evidence.startAtMs === null ? '' : evidence.startAtMs,
    evidence.endAtMs === null ? '' : evidence.endAtMs,
    evidence.durationMs
  ].join('|');
}

function evidenceCompatible(left, right) {
  if (left.durationMs !== right.durationMs) return false;
  if (left.kind === 'ATTRIBUTED' && right.kind === 'ATTRIBUTED') {
    return left.startAtMs === right.startAtMs && left.endAtMs === right.endAtMs;
  }
  const attributed = left.kind === 'ATTRIBUTED' ? left : right.kind === 'ATTRIBUTED' ? right : null;
  const undated = attributed === left ? right : left;
  if (attributed) {
    if (undated.startAtMs !== null && undated.startAtMs !== attributed.startAtMs) return false;
    if (undated.endAtMs !== null && undated.endAtMs !== attributed.endAtMs) return false;
    return true;
  }
  return left.startAtMs === right.startAtMs && left.endAtMs === right.endAtMs;
}

function dedupeSessionEvidence(evidenceRows, contextId) {
  const trusted = new Map();
  const fallback = new Map();
  for (const evidence of evidenceRows) {
    if (!evidence) continue;
    if (evidence.trustedId) {
      const prior = trusted.get(evidence.trustedId);
      if (!prior) {
        trusted.set(evidence.trustedId, evidence);
        continue;
      }
      if (!evidenceCompatible(prior, evidence)) {
        throw migrationError('legacy-session-id-conflict', {
          contextId,
          legacySessionId: evidence.trustedId
        });
      }
      if (prior.kind === 'UNDATED' && evidence.kind === 'ATTRIBUTED') {
        trusted.set(evidence.trustedId, evidence);
      }
      continue;
    }
    const key = evidenceMaterial(evidence);
    if (!fallback.has(key)) fallback.set(key, evidence);
  }
  const material = new Map();
  const rows = [];
  for (const evidence of [...trusted.values(), ...fallback.values()]) {
    if (evidence.kind === 'UNDATED' && evidence.trustedId) {
      rows.push(evidence);
      continue;
    }
    const key = evidenceMaterial(evidence);
    if (!material.has(key)) {
      material.set(key, evidence);
      rows.push(evidence);
    }
  }
  return {
    rows,
    trusted
  };
}

function legacySessionId(contextId, evidence) {
  if (evidence.trustedId) return 'legacy:' + contextId + ':' + evidence.trustedId;
  return 'legacy:' + contextId + ':session:' + shortHash(evidenceMaterial(evidence));
}

function legacyCycleId(contextId, evidence, fallbackCycleId) {
  return evidence.cycleId || fallbackCycleId || 'legacy:' + contextId + ':cycle';
}

function buildAttributedSegments(group, evidenceRows, workdayZone, marker, nowMs, diagnostics) {
  const segments = [];
  const defaultCycleId = group.records
    .map(record => firstText(record.raw, ['cycleId']))
    .find(Boolean) || 'legacy:' + group.contextId + ':cycle';

  for (const evidence of evidenceRows.filter(row => row.kind === 'ATTRIBUTED')) {
    const sessionId = legacySessionId(group.contextId, evidence);
    const cycleId = legacyCycleId(group.contextId, evidence, defaultCycleId);
    const pieces = splitInterval({
      sessionId,
      cycleId,
      contextId: group.contextId,
      startAtMs: evidence.startAtMs,
      endAtMs: evidence.endAtMs,
      workdayZone,
      startCause: 'v07-migration',
      endReason: evidence.reason || 'legacy-session',
      source: 'v07-migration',
      certainty: evidence.certainty || 'LEGACY_VERIFIED',
      createdAtMs: evidence.createdAtMs === null ? nowMs : evidence.createdAtMs,
      provenance: {
        kind: 'v07-session',
        migrationMarkerId: marker.markerId,
        legacySessionId: evidence.trustedId
      }
    }, {
      makeId: (_sessionId, index) => 'legacy-segment:' + shortHash([
        group.contextId,
        sessionId,
        evidence.startAtMs,
        evidence.endAtMs,
        index
      ].join('|'))
    });
    segments.push(...pieces);
  }
  return mergeMigratedSegments([], segments, diagnostics);
}

function mergeContextMetadata(candidate, group, legacyUnattributedMs, marker, nowMs) {
  const existing = candidate.contexts[group.contextId];
  if (existing && (existing.kind !== group.kind || (group.kind === 'job' && String(existing.projectId) !== group.projectId))) {
    throw migrationError('rebuilt-context-identity-conflict', { contextId: group.contextId });
  }

  const currentRecords = group.records.filter(record => record.membership === 'RECENT');
  const ordered = [...currentRecords, ...group.records.filter(record => record.membership !== 'RECENT')];
  const labels = ordered
    .map(record => firstText(record.raw, ['currentLabel', 'label']))
    .filter(Boolean);
  const shortLabels = ordered
    .map(record => firstText(record.raw, ['shortLabel']))
    .filter(Boolean);
  const createdTimes = group.records
    .map(record => firstInteger(record.raw, ['createdAtMs', 'createdAt']))
    .filter(value => value !== null);
  const seenTimes = group.records
    .map(record => firstInteger(record.raw, ['lastSeenAtMs', 'lastTouchedAt', 'updatedAt']))
    .filter(value => value !== null);
  const archivedTimes = group.records
    .filter(record => record.membership === 'ARCHIVED')
    .map(record => firstInteger(record.raw, ['archivedAtMs', 'archivedAt']))
    .filter(value => value !== null);
  const workspaceMembership = group.hasCurrent
    ? 'RECENT'
    : existing && existing.workspaceMembership
      ? existing.workspaceMembership
      : 'ARCHIVED';

  const merged = {
    ...(existing || {}),
    contextId: group.contextId,
    kind: group.kind,
    currentLabel: (existing && existing.currentLabel) || labels[0] || group.contextId,
    shortLabel: (existing && existing.shortLabel) || shortLabels[0] || labels[0] || group.contextId,
    aliases: [...new Set([...(existing && existing.aliases || []), ...labels])],
    createdAtMs: existing && isNonNegativeInteger(existing.createdAtMs)
      ? existing.createdAtMs
      : createdTimes.length
        ? Math.min(...createdTimes)
        : nowMs,
    lastSeenAtMs: Math.max(
      existing && isNonNegativeInteger(existing.lastSeenAtMs) ? existing.lastSeenAtMs : 0,
      seenTimes.length ? Math.max(...seenTimes) : 0
    ),
    workspaceMembership,
    legacyUnattributedMs: Math.max(
      existing && isNonNegativeInteger(existing.legacyUnattributedMs)
        ? existing.legacyUnattributedMs
        : 0,
      legacyUnattributedMs
    )
  };
  if (group.kind === 'job') merged.projectId = group.projectId;
  else delete merged.projectId;

  if (workspaceMembership === 'ARCHIVED') {
    merged.archivedAtMs = existing && isNonNegativeInteger(existing.archivedAtMs)
      ? existing.archivedAtMs
      : archivedTimes.length
        ? Math.max(...archivedTimes)
        : nowMs;
  } else {
    delete merged.archivedAtMs;
  }

  if (legacyUnattributedMs > 0) {
    merged.legacyBalanceLineage = {
      migrationMarkerId: marker.markerId,
      sourceChecksum: marker.sourceChecksum,
      importedLegacyUnattributedMs: legacyUnattributedMs
    };
  }
  candidate.contexts[group.contextId] = merged;
}

function migrateContextGroups(candidate, groups, workdayZone, marker, nowMs, diagnostics) {
  const imported = [];
  for (const contextId of [...groups.keys()].sort()) {
    const group = groups.get(contextId);
    const rawEvidence = [];
    for (const record of group.records) {
      const sessions = Array.isArray(record.raw.sessions) ? record.raw.sessions : [];
      for (let index = 0; index < sessions.length; index += 1) {
        rawEvidence.push(normalizeSessionEvidence(
          sessions[index],
          group,
          record,
          index,
          diagnostics
        ));
      }
    }
    const dedupedEvidence = dedupeSessionEvidence(rawEvidence, contextId);
    const evidence = dedupedEvidence.rows;
    group.trustedSessionEvidence = dedupedEvidence.trusted;
    const attributedSegments = buildAttributedSegments(
      group,
      evidence,
      workdayZone,
      marker,
      nowMs,
      diagnostics
    );
    const attributedMs = attributedSegments.reduce((sum, row) => sum + row.durationMs, 0);
    const undatedMs = evidence
      .filter(row => row.kind === 'UNDATED')
      .reduce((sum, row) => sum + row.durationMs, 0);
    const accumulatedBaselineMs = group.records.reduce(
      (maximum, record) => Math.max(maximum, record.accumulatedMs),
      0
    );
    const trustworthyBaselineMs = Math.max(
      accumulatedBaselineMs,
      attributedMs + undatedMs
    );
    const legacyUnattributedMs = Math.max(0, trustworthyBaselineMs - attributedMs);
    if (attributedMs > accumulatedBaselineMs && accumulatedBaselineMs > 0) {
      appendDiagnostic(diagnostics, 'LEGACY_SESSIONS_EXCEED_ACCUMULATED', {
        contextId,
        accumulatedBaselineMs,
        attributedMs
      });
    }

    mergeContextMetadata(candidate, group, legacyUnattributedMs, marker, nowMs);
    group.importedSegments = attributedSegments;
    imported.push(...attributedSegments);
  }
  return imported;
}

function mergeMigratedSegments(existingSegments, incomingSegments, diagnostics) {
  const result = dedupeSegments(existingSegments);
  const byId = new Map(result.map(segment => [segment.segmentId, segment]));
  const material = new Map(result.map(segment => [intervalFingerprint(segment), segment]));

  for (const segment of incomingSegments) {
    const sameId = byId.get(segment.segmentId);
    if (sameId) {
      if (intervalFingerprint(sameId) !== intervalFingerprint(segment)) {
        throw migrationError('legacy-segment-id-conflict', { segmentId: segment.segmentId });
      }
      continue;
    }
    const sameInterval = material.get(intervalFingerprint(segment));
    if (sameInterval) {
      appendDiagnostic(diagnostics, 'LEGACY_DUPLICATE_INTERVAL_SKIPPED', {
        retainedSegmentId: sameInterval.segmentId,
        ignoredSegmentId: segment.segmentId,
        contextId: segment.contextId
      });
      continue;
    }
    byId.set(segment.segmentId, segment);
    material.set(intervalFingerprint(segment), segment);
    result.push(segment);
  }
  return dedupeSegments(result);
}

function contextIdForLegacyReference(reference, groups, keyToContextId) {
  const key = legacyText(reference);
  if (!key) return null;
  if (keyToContextId.has(key)) return keyToContextId.get(key);
  if (groups.has(key)) return key;
  return null;
}

function ensureRecoveryCandidates(candidate) {
  if (!isRecord(candidate.migration.recoveryCandidates)) {
    candidate.migration.recoveryCandidates = {};
  }
  return candidate.migration.recoveryCandidates;
}

function migrateLegacyActive(candidate, current, groups, keyToContextId, marker, nowMs, diagnostics) {
  if (!current || current.active === null || current.active === undefined) return null;
  if (!isRecord(current.active)) throw migrationError('legacy-active-invalid');
  const active = current.active;
  const contextId = contextIdForLegacyReference(
    firstText(active, ['contextId', 'key']),
    groups,
    keyToContextId
  );
  if (!contextId || !candidate.contexts[contextId]) {
    throw migrationError('legacy-active-context-missing');
  }

  const startedAtMs = firstInteger(active, ['startedAtMs', 'startedAt']);
  const lastVerifiedAtMs = firstInteger(active, ['lastVerifiedAtMs', 'lastVerifiedAt']);
  const sessionIdRaw = firstText(active, ['sessionId', 'id']);
  const cycleIdRaw = firstText(active, ['cycleId']);
  if (
    startedAtMs === null ||
    lastVerifiedAtMs === null ||
    lastVerifiedAtMs < startedAtMs
  ) {
    const candidateEvidence = {
      kind: 'LEGACY_ACTIVE_UNVERIFIED',
      live: false,
      contextId,
      sessionId: sessionIdRaw,
      cycleId: cycleIdRaw,
      startedAtMs,
      lastVerifiedAtMs
    };
    ensureRecoveryCandidates(candidate).active = candidateEvidence;
    appendDiagnostic(diagnostics, 'LEGACY_ACTIVE_NOT_RECOVERABLE', { contextId });
    return candidateEvidence;
  }

  const sessionId = sessionIdRaw || 'legacy-active:' + shortHash([
    contextId,
    startedAtMs,
    lastVerifiedAtMs
  ].join('|'));
  const cycleId = cycleIdRaw || 'legacy:' + contextId + ':cycle';
  const updatedAtMs = firstInteger(current, ['updatedAtMs', 'updatedAt']);
  const checkpointedAtMs = Math.max(nowMs, updatedAtMs || 0, lastVerifiedAtMs);
  const checkpoint = createRecoveryCheckpoint({
    runtimeInstanceId: firstText(current, ['origin', 'runtimeInstanceId']) || 'legacy-v07-runtime',
    contextId,
    sessionId: 'legacy:' + contextId + ':' + sessionId,
    cycleId,
    startedAtMs,
    lastVerifiedAtMs,
    ownershipEvidence: {
      disposition: 'UNAVAILABLE_LEGACY'
    },
    checkpointedAtMs,
    terminationDisposition: 'UNCLEAN_LEGACY_MIGRATION',
    buildVersion: firstText(current, ['version']) || 'v0.7-legacy',
    source: 'v07-migration'
  });

  if (!candidate.checkpoint) candidate.checkpoint = checkpoint;
  else ensureRecoveryCandidates(candidate).active = checkpoint;

  const group = groups.get(contextId);
  const completedWithSameId = sessionIdRaw && group.trustedSessionEvidence.get(sessionIdRaw);
  let recoverySegments = [];
  if (completedWithSameId) {
    appendDiagnostic(diagnostics, 'LEGACY_ACTIVE_SESSION_ALREADY_FINALIZED', {
      contextId,
      legacySessionId: sessionIdRaw
    });
  } else {
    recoverySegments = recoverVerifiedSegments(checkpoint, {
      workdayZone: candidate.workdayZone,
      createdAtMs: nowMs,
      makeId: (_ignored, index) => 'legacy-recovery-segment:' + shortHash([
        contextId,
        checkpoint.sessionId,
        startedAtMs,
        lastVerifiedAtMs,
        index
      ].join('|'))
    });
  }
  appendDiagnostic(diagnostics, 'LEGACY_ACTIVE_RECOVERY_EVIDENCE', {
    contextId,
    recoveredVerifiedMs: recoverySegments.reduce((sum, row) => sum + row.durationMs, 0)
  });
  return { checkpoint, recoverySegments };
}

function noteLegacyPending(candidate, current, groups, keyToContextId, diagnostics) {
  if (!current || current.pending === null || current.pending === undefined) return;
  if (!isRecord(current.pending)) throw migrationError('legacy-pending-invalid');
  const contextId = contextIdForLegacyReference(
    firstText(current.pending, ['contextId', 'key']),
    groups,
    keyToContextId
  );
  if (!contextId) throw migrationError('legacy-pending-context-missing');
  appendDiagnostic(diagnostics, 'LEGACY_PENDING_NOT_RESTORED', { contextId });
  // Deliberately do not populate candidate.timer.pending. Fresh L3/L4 evidence owns that state.
}

function migrateLegacyLocalPause(candidate, current, groups, keyToContextId, diagnostics) {
  if (!current) return null;
  let localPause = isRecord(current.localPause) ? current.localPause : null;
  if (!localPause && isRecord(current.meta) && legacyText(current.meta.manualPausedKey)) {
    const pending = isRecord(current.pending) && current.pending.key === current.meta.manualPausedKey
      ? current.pending
      : {};
    const legacyContextId = contextIdForLegacyReference(
      current.meta.manualPausedKey,
      groups,
      keyToContextId
    );
    const group = legacyContextId && groups.get(legacyContextId);
    const contextRecord = group && group.records[0] && group.records[0].raw;
    localPause = {
      key: current.meta.manualPausedKey,
      cycleId: contextRecord && contextRecord.cycleId,
      pausedAt: pending.detectedAt || (contextRecord && contextRecord.lastTouchedAt),
      reason: 'manual-pause'
    };
  }
  if (!localPause) return null;

  const contextId = contextIdForLegacyReference(
    firstText(localPause, ['contextId', 'key']),
    groups,
    keyToContextId
  );
  if (!contextId) throw migrationError('legacy-local-pause-context-missing');
  const pausedAtMs = firstInteger(localPause, ['pausedAtMs', 'pausedAt']);
  const cycleId = firstText(localPause, ['cycleId']);
  if (pausedAtMs === null || !cycleId) {
    appendDiagnostic(diagnostics, 'LEGACY_LOCAL_PAUSE_NOT_RECOVERABLE', { contextId });
    return null;
  }
  const candidateEvidence = {
    kind: 'LEGACY_LOCAL_PAUSE',
    live: false,
    contextId,
    cycleId,
    pausedAtMs,
    reason: firstText(localPause, ['reason']) || 'legacy-local-pause',
    source: 'v07-migration'
  };
  ensureRecoveryCandidates(candidate).localPause = candidateEvidence;
  appendDiagnostic(diagnostics, 'LEGACY_LOCAL_PAUSE_CANDIDATE', { contextId });
  return candidateEvidence;
}

function ensureMigrationShape(candidate) {
  if (!isRecord(candidate.migration)) {
    candidate.migration = {
      schemaVersion: 1,
      completedSources: {},
      diagnostics: []
    };
  }
  if (!isNonNegativeInteger(candidate.migration.schemaVersion)) {
    candidate.migration.schemaVersion = 1;
  }
  if (!isRecord(candidate.migration.completedSources)) candidate.migration.completedSources = {};
  if (!Array.isArray(candidate.migration.diagnostics)) candidate.migration.diagnostics = [];
}

function migrateV07(document, legacySources, options = {}) {
  validateDocument(document);
  const normalizedSources = normalizeLegacySources(legacySources);
  const anySource = normalizedSources.current.present ||
    normalizedSources.archive.present ||
    normalizedSources.activity.present;
  const nowMs = options.nowMs === undefined ? Date.now() : options.nowMs;
  if (!isNonNegativeInteger(nowMs)) throw migrationError('migration-time-invalid');
  const marker = createV07SourceMarker(normalizedSources, nowMs);
  const original = deepClone(document);
  ensureMigrationShape(original);

  if (!anySource) {
    return {
      migrated: false,
      reason: 'no-legacy-source',
      marker: null,
      document: original,
      diagnostics: [],
      recoveryEvidence: null
    };
  }

  const completedMarker = original.migration.completedSources[V07_MIGRATION_MARKER_ID];
  if (completedMarker && completedMarker.completionState === 'COMPLETE') {
    const diagnostics = completedMarker.sourceChecksum !== marker.sourceChecksum
      ? [{ code: 'LEGACY_SOURCE_CHANGED_AFTER_COMPLETION' }]
      : [];
    return {
      migrated: false,
      reason: 'already-complete',
      marker: deepClone(completedMarker),
      document: original,
      diagnostics,
      recoveryEvidence: original.checkpoint
        ? checkpointToRecoveryEvidence(original.checkpoint)
        : null
    };
  }

  const candidate = deepClone(original);
  const diagnostics = [];
  if (normalizedSources.activity.ignoredDiagnostic) {
    appendDiagnostic(
      diagnostics,
      normalizedSources.activity.ignoredDiagnostic.code,
      { reason: normalizedSources.activity.ignoredDiagnostic.reason }
    );
  }
  const { groups, keyToContextId } = collectContextGroups(normalizedSources, diagnostics);
  const importedSegments = migrateContextGroups(
    candidate,
    groups,
    candidate.workdayZone,
    marker,
    nowMs,
    diagnostics
  );
  candidate.ledger = mergeMigratedSegments(candidate.ledger, importedSegments, diagnostics);

  const activeResult = migrateLegacyActive(
    candidate,
    normalizedSources.current.value,
    groups,
    keyToContextId,
    marker,
    nowMs,
    diagnostics
  );
  if (activeResult && activeResult.recoverySegments) {
    candidate.ledger = mergeMigratedSegments(
      candidate.ledger,
      activeResult.recoverySegments,
      diagnostics
    );
  }
  noteLegacyPending(
    candidate,
    normalizedSources.current.value,
    groups,
    keyToContextId,
    diagnostics
  );
  migrateLegacyLocalPause(
    candidate,
    normalizedSources.current.value,
    groups,
    keyToContextId,
    diagnostics
  );

  candidate.ledger.sort((left, right) =>
    left.startAtMs - right.startAtMs || left.segmentId.localeCompare(right.segmentId)
  );
  if (candidate.checkpoint) validateRecoveryCheckpoint(candidate.checkpoint);
  candidate.migration.completedSources[V07_MIGRATION_MARKER_ID] = deepClone(marker);
  candidate.migration.diagnostics.push(...diagnostics.map(row => ({
    ...row,
    migrationMarkerId: marker.markerId
  })));
  validateDocument(candidate);

  return {
    migrated: true,
    reason: 'migration-planned',
    marker: deepClone(marker),
    document: candidate,
    diagnostics: deepClone(diagnostics),
    recoveryEvidence: candidate.checkpoint
      ? checkpointToRecoveryEvidence(candidate.checkpoint)
      : null
  };
}

module.exports = {
  LEGACY_SOURCE_KEYS,
  V07_MIGRATION_MARKER_ID,
  V07_MIGRATION_VERSION,
  stableStringify,
  checksum,
  createV07SourceMarker,
  normalizeLegacySources,
  migrateV07
};
