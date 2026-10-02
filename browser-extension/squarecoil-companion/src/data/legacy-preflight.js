'use strict';

const { LEGACY_SOURCE_KEYS, V07_MIGRATION_MARKER_ID } = require('./migration-schema');

const LEGACY_KEYS = Object.freeze(Object.values(LEGACY_SOURCE_KEYS));
const MIGRATION_DISPOSITIONS = Object.freeze({
  NOT_REQUIRED: 'NOT_REQUIRED', REQUIRED: 'REQUIRED', IN_PROGRESS: 'IN_PROGRESS',
  COMPLETE_MATCH: 'COMPLETE_MATCH', SOURCE_CHANGED_AFTER_COMPLETION: 'SOURCE_CHANGED_AFTER_COMPLETION',
  UNAVAILABLE: 'UNAVAILABLE', FAILED: 'FAILED'
});

function result(disposition, presentKeys = [], details = {}) {
  const blocked = ![MIGRATION_DISPOSITIONS.NOT_REQUIRED, MIGRATION_DISPOSITIONS.COMPLETE_MATCH]
    .includes(disposition);
  const reasons = {
    NOT_REQUIRED: 'legacy-source-absent', REQUIRED: 'legacy-migration-required',
    IN_PROGRESS: 'legacy-migration-in-progress', COMPLETE_MATCH: 'legacy-migration-complete-match',
    SOURCE_CHANGED_AFTER_COMPLETION: 'legacy-source-changed-after-completion',
    UNAVAILABLE: 'legacy-preflight-unavailable', FAILED: 'legacy-preflight-failed'
  };
  return Object.freeze({ checked: !['UNAVAILABLE', 'FAILED'].includes(disposition), blocked,
    reason: reasons[disposition], disposition, presentKeys: Object.freeze([...presentKeys]), ...details });
}

function capture(storage) {
  if (!storage || typeof storage.getItem !== 'function') throw new Error('legacy-preflight-storage-reader-required');
  const sources = {};
  for (const key of LEGACY_KEYS) {
    const value = storage.getItem(key);
    if (value !== null && value !== undefined) sources[key] = String(value);
  }
  return sources;
}

function stableStringify(value) {
  if (value === null || typeof value !== 'object') return JSON.stringify(value);
  if (Array.isArray(value)) return '[' + value.map(stableStringify).join(',') + ']';
  return '{' + Object.keys(value).sort().map(key => JSON.stringify(key) + ':' + stableStringify(value[key])).join(',') + '}';
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

function parsed(sources, key, activity = false) {
  if (!Object.hasOwn(sources, key)) return { present: false, value: null };
  try {
    const value = JSON.parse(sources[key]);
    if (value !== null && (typeof value !== 'object' || (!activity && Array.isArray(value)))) throw new Error();
    return { present: true, value };
  } catch (_) {
    if (!activity) throw new Error('legacy-source-invalid');
    return { present: true, value: { ignoredUnreadableActivity: true,
      rawChecksum: checksum({ raw: sources[key] }) } };
  }
}

function candidateEvidence(sources) {
  const current = parsed(sources, LEGACY_SOURCE_KEYS.CURRENT);
  const archive = parsed(sources, LEGACY_SOURCE_KEYS.ARCHIVE);
  const activity = parsed(sources, LEGACY_SOURCE_KEYS.ACTIVITY, true);
  return {
    authoritySourceChecksums: {
      [LEGACY_SOURCE_KEYS.CURRENT]: checksum(current.present ? { present: true, value: current.value } : { present: false }),
      [LEGACY_SOURCE_KEYS.ARCHIVE]: checksum(archive.present ? { present: true, value: archive.value } : { present: false })
    },
    activitySourceChecksum: checksum(activity.present ? { present: true, value: activity.value } : { present: false }),
    sourceChecksum: checksum(Object.fromEntries([
      [LEGACY_SOURCE_KEYS.CURRENT, current], [LEGACY_SOURCE_KEYS.ARCHIVE, archive],
      [LEGACY_SOURCE_KEYS.ACTIVITY, activity]
    ].filter(([, entry]) => entry.present).map(([key, entry]) => [key, entry.value])))
  };
}

function inspectLegacyMigration(storage, document) {
  let sources;
  try { sources = capture(storage); } catch (_) { return result(MIGRATION_DISPOSITIONS.UNAVAILABLE); }
  const presentKeys = Object.keys(sources);
  if (!presentKeys.length) return result(MIGRATION_DISPOSITIONS.NOT_REQUIRED);
  const marker = document?.migration?.completedSources?.[V07_MIGRATION_MARKER_ID];
  if (!marker) {
    // Validate the captured authority-sensitive source before reporting it as
    // migration-ready. This keeps malformed retained bytes terminal and
    // inspectable without repeatedly dispatching a migration command on every
    // health settlement. A later explicit settlement still re-reads storage,
    // so corrected bytes can advance to REQUIRED and migrate normally.
    try { candidateEvidence(sources); }
    catch (_) { return result(MIGRATION_DISPOSITIONS.FAILED, presentKeys); }
    return result(MIGRATION_DISPOSITIONS.REQUIRED, presentKeys, { sources: Object.freeze(sources) });
  }
  if (marker.completionState !== 'COMPLETE') return result(MIGRATION_DISPOSITIONS.IN_PROGRESS, presentKeys);
  try {
    const candidate = candidateEvidence(sources);
    let authorityMatches;
    if (marker.authoritySourceChecksums) {
      authorityMatches = [LEGACY_SOURCE_KEYS.CURRENT, LEGACY_SOURCE_KEYS.ARCHIVE]
        .every(key => marker.authoritySourceChecksums[key] === candidate.authoritySourceChecksums[key]);
    } else authorityMatches = marker.sourceChecksum === candidate.sourceChecksum;
    if (!authorityMatches) return result(MIGRATION_DISPOSITIONS.SOURCE_CHANGED_AFTER_COMPLETION, presentKeys);
    return result(MIGRATION_DISPOSITIONS.COMPLETE_MATCH, presentKeys, {
      activityChanged: Boolean(marker.activitySourceChecksum &&
        marker.activitySourceChecksum !== candidate.activitySourceChecksum)
    });
  } catch (_) { return result(MIGRATION_DISPOSITIONS.FAILED, presentKeys); }
}

function inspectLegacyPresence(storage) {
  const inspected = inspectLegacyMigration(storage, null);
  return Object.freeze({ checked: inspected.checked, blocked: inspected.blocked,
    reason: inspected.reason, presentKeys: inspected.presentKeys });
}

module.exports = { LEGACY_KEYS, MIGRATION_DISPOSITIONS, inspectLegacyPresence, inspectLegacyMigration };
