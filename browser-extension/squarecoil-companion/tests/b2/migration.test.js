'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const { createEmptyDocument } = require('../../src/data/model');
const {
  LEGACY_SOURCE_KEYS,
  V07_MIGRATION_MARKER_ID,
  migrateV07
} = require('../../src/data/migration');

const HOUR_MS = 60 * 60 * 1000;
const BASE_MS = Date.parse('2026-01-12T10:00:00.000Z');
const MIGRATION_NOW_MS = Date.parse('2026-08-26T04:00:00.000Z');

function emptyDocument() {
  return createEmptyDocument({ nowMs: BASE_MS, workdayZone: 'UTC' });
}

function session(id, startAt, endAt, overrides = {}) {
  return {
    id,
    cycleId: 'cycle-legacy-1',
    startAt,
    endAt,
    durationMs: endAt - startAt,
    reason: 'legacy-stop',
    ...overrides
  };
}

function context(overrides = {}) {
  return {
    key: 'job:123456',
    type: 'job',
    projectId: '123456',
    label: '123456 - Example',
    shortLabel: '123456',
    accumulatedMs: 0,
    sessions: [],
    cycleId: 'cycle-legacy-1',
    createdAt: BASE_MS - HOUR_MS,
    lastTouchedAt: BASE_MS + HOUR_MS,
    ...overrides
  };
}

function sources(current, archive = null, activity = null) {
  const result = {
    [LEGACY_SOURCE_KEYS.CURRENT]: current
  };
  if (archive !== null) result[LEGACY_SOURCE_KEYS.ARCHIVE] = archive;
  if (activity !== null) result[LEGACY_SOURCE_KEYS.ACTIVITY] = activity;
  return result;
}

function migrate(legacySources, document = emptyDocument(), nowMs = MIGRATION_NOW_MS) {
  return migrateV07(document, legacySources, { nowMs });
}

function timerIsIdle(document) {
  return document.timer.active === null &&
    document.timer.pending === null &&
    document.timer.localPause === null;
}

test('UT-B2-MIG-01 clean v0.7 complete Sessions become attributed Ledger truth', () => {
  const first = session('legacy-session-1', BASE_MS, BASE_MS + HOUR_MS);
  const second = session('legacy-session-2', BASE_MS + HOUR_MS, BASE_MS + (2 * HOUR_MS));
  const result = migrate(sources({
    schema: 3,
    contexts: {
      'job:123456': context({ accumulatedMs: 2 * HOUR_MS, sessions: [first, second] })
    }
  }));

  assert.equal(result.migrated, true);
  assert.equal(result.document.ledger.length, 2);
  assert.equal(result.document.ledger.reduce((sum, row) => sum + row.durationMs, 0), 2 * HOUR_MS);
  assert.equal(result.document.contexts['job:123456'].legacyUnattributedMs, 0);
  assert.equal(timerIsIdle(result.document), true);
});

test('UT-B2-MIG-02 accumulated greater than Sessions preserves only the difference as unattributed', () => {
  const result = migrate(sources({
    contexts: {
      'job:123456': context({
        accumulatedMs: 3 * HOUR_MS,
        sessions: [session('legacy-session-1', BASE_MS, BASE_MS + HOUR_MS)]
      })
    }
  }));

  assert.equal(result.document.ledger[0].durationMs, HOUR_MS);
  assert.equal(result.document.contexts['job:123456'].legacyUnattributedMs, 2 * HOUR_MS);
  assert.equal('startAtMs' in result.document.contexts['job:123456'].legacyBalanceLineage, false);
});

test('UT-B2-MIG-03 valid Sessions greater than accumulated retain no negative balance', () => {
  const result = migrate(sources({
    contexts: {
      'job:123456': context({
        accumulatedMs: HOUR_MS,
        sessions: [
          session('legacy-session-1', BASE_MS, BASE_MS + HOUR_MS),
          session('legacy-session-2', BASE_MS + HOUR_MS, BASE_MS + (2 * HOUR_MS))
        ]
      })
    }
  }));

  assert.equal(result.document.ledger.reduce((sum, row) => sum + row.durationMs, 0), 2 * HOUR_MS);
  assert.equal(result.document.contexts['job:123456'].legacyUnattributedMs, 0);
  assert.ok(result.diagnostics.some(row => row.code === 'LEGACY_SESSIONS_EXCEED_ACCUMULATED'));
});

test('UT-B2-MIG-04 duplicate legacy Sessions dedupe by stable ID and material interval', () => {
  const duplicate = session('legacy-session-1', BASE_MS, BASE_MS + HOUR_MS);
  const sameIntervalDifferentId = session('legacy-session-copy', BASE_MS, BASE_MS + HOUR_MS, {
    reason: 'metadata-does-not-create-time'
  });
  const result = migrate(sources({
    contexts: {
      'job:123456': context({
        accumulatedMs: HOUR_MS,
        sessions: [duplicate, { ...duplicate }, sameIntervalDifferentId]
      })
    }
  }));

  assert.equal(result.document.ledger.length, 1);
  assert.equal(result.document.ledger[0].durationMs, HOUR_MS);
});

test('UT-B2-MIG-05 current and archive merge to one Recent Context without additive baselines', () => {
  const first = session('legacy-session-1', BASE_MS, BASE_MS + HOUR_MS);
  const second = session('legacy-session-2', BASE_MS + HOUR_MS, BASE_MS + (2 * HOUR_MS));
  const result = migrate(sources(
    {
      contexts: {
        'job:123456': context({ accumulatedMs: HOUR_MS, sessions: [first] })
      }
    },
    {
      schema: 1,
      contexts: {
        'job:123456': context({
          accumulatedMs: 3 * HOUR_MS,
          sessions: [{ ...first }, second],
          archivedAt: BASE_MS + (4 * HOUR_MS)
        })
      }
    }
  ));

  assert.deepEqual(Object.keys(result.document.contexts), ['job:123456']);
  assert.equal(result.document.contexts['job:123456'].workspaceMembership, 'RECENT');
  assert.equal(result.document.contexts['job:123456'].archivedAtMs, undefined);
  assert.equal(result.document.ledger.reduce((sum, row) => sum + row.durationMs, 0), 2 * HOUR_MS);
  assert.equal(result.document.contexts['job:123456'].legacyUnattributedMs, HOUR_MS);
});

test('UT-B2-MIG-06 legacy Active becomes non-live evidence and finalizes only verified time', () => {
  const result = migrate(sources({
    version: '1.1.2',
    origin: 'legacy-origin-1',
    updatedAt: BASE_MS + (3 * HOUR_MS),
    contexts: {
      'job:123456': context()
    },
    active: {
      key: 'job:123456',
      sessionId: 'legacy-active-session',
      cycleId: 'cycle-legacy-1',
      startedAt: BASE_MS,
      lastVerifiedAt: BASE_MS + HOUR_MS
    }
  }));

  assert.equal(timerIsIdle(result.document), true);
  assert.equal(result.document.checkpoint.contextId, 'job:123456');
  assert.equal(result.recoveryEvidence.live, false);
  assert.equal(result.recoveryEvidence.unknownGap.startAtMs, BASE_MS + HOUR_MS);
  assert.equal(result.document.ledger.reduce((sum, row) => sum + row.durationMs, 0), HOUR_MS);
  assert.equal(result.document.ledger.at(-1).endAtMs, BASE_MS + HOUR_MS);
});

test('UT-B2-MIG-07 legacy Pending preserves metadata but never restores a live prompt', () => {
  const result = migrate(sources({
    contexts: {
      'job:123456': context({ accumulatedMs: HOUR_MS })
    },
    pending: {
      key: 'job:123456',
      detectedAt: BASE_MS,
      source: 'legacy-observation'
    }
  }));

  assert.ok(result.document.contexts['job:123456']);
  assert.equal(timerIsIdle(result.document), true);
  assert.ok(result.diagnostics.some(row => row.code === 'LEGACY_PENDING_NOT_RESTORED'));
});

test('UT-B2-MIG-08 legacy Local Pause is a non-live candidate and never becomes Active', () => {
  const result = migrate(sources({
    contexts: {
      'job:123456': context()
    },
    pending: {
      key: 'job:123456',
      detectedAt: BASE_MS + HOUR_MS,
      source: 'manual-pause'
    },
    meta: {
      manualPausedKey: 'job:123456'
    }
  }));

  assert.equal(timerIsIdle(result.document), true);
  assert.deepEqual(result.document.migration.recoveryCandidates.localPause, {
    kind: 'LEGACY_LOCAL_PAUSE',
    live: false,
    contextId: 'job:123456',
    cycleId: 'cycle-legacy-1',
    pausedAtMs: BASE_MS + HOUR_MS,
    reason: 'manual-pause',
    source: 'v07-migration'
  });
});

test('UT-B2-MIG-09 duration-only row becomes unattributed balance without fabricated dates', () => {
  const result = migrate(sources({
    contexts: {
      'job:123456': context({
        accumulatedMs: HOUR_MS,
        sessions: [{ id: 'duration-only', durationMs: HOUR_MS }]
      })
    }
  }));

  assert.equal(result.document.ledger.length, 0);
  assert.equal(result.document.contexts['job:123456'].legacyUnattributedMs, HOUR_MS);
  assert.equal(JSON.stringify(result.document.contexts['job:123456']).includes('startAtMs'), false);
});

test('UT-B2-MIG-10 timestamps win over conflicting duration without adding extra time', () => {
  const result = migrate(sources({
    contexts: {
      'job:123456': context({
        accumulatedMs: HOUR_MS,
        sessions: [session('duration-mismatch', BASE_MS, BASE_MS + HOUR_MS, {
          durationMs: 4 * HOUR_MS
        })]
      })
    }
  }));

  assert.equal(result.document.ledger[0].durationMs, HOUR_MS);
  assert.equal(result.document.contexts['job:123456'].legacyUnattributedMs, 0);
  assert.ok(result.diagnostics.some(row => row.code === 'LEGACY_SESSION_DURATION_MISMATCH'));
});

test('UT-B2-MIG-11 cross-midnight Session is split by the Ledger service', () => {
  const startAt = Date.parse('2026-02-03T23:30:00.000Z');
  const endAt = Date.parse('2026-02-04T00:30:00.000Z');
  const result = migrate(sources({
    contexts: {
      'job:123456': context({
        accumulatedMs: HOUR_MS,
        sessions: [session('midnight-session', startAt, endAt)]
      })
    }
  }));

  assert.equal(result.document.ledger.length, 2);
  assert.deepEqual(result.document.ledger.map(row => row.localDate), ['2026-02-03', '2026-02-04']);
  assert.equal(new Set(result.document.ledger.map(row => row.sessionId)).size, 1);
  assert.equal(result.document.ledger.reduce((sum, row) => sum + row.durationMs, 0), HOUR_MS);
});

test('UT-B2-MIG-12 malformed authoritative source cannot mark or partially mutate migration', () => {
  const original = emptyDocument();
  const before = structuredClone(original);

  assert.throws(
    () => migrate({ [LEGACY_SOURCE_KEYS.CURRENT]: '{not-json' }, original),
    /legacy-source-json-invalid/
  );
  assert.deepEqual(original, before);

  assert.throws(
    () => migrate(sources({
      contexts: {
        'job:123456': context({
          accumulatedMs: HOUR_MS,
          sessions: [session('valid-before-error', BASE_MS, BASE_MS + HOUR_MS), 42]
        })
      }
    }), original),
    /legacy-session-invalid/
  );
  assert.deepEqual(original, before);
  assert.equal(original.migration.completedSources[V07_MIGRATION_MARKER_ID], undefined);
});

test('UT-B2-MIG-13 successful rerun is a no-op with one idempotent source marker', () => {
  const legacySources = sources({
    contexts: {
      'job:123456': context({
        accumulatedMs: 2 * HOUR_MS,
        sessions: [session('legacy-session-1', BASE_MS, BASE_MS + HOUR_MS)]
      })
    }
  });
  const sourceBefore = structuredClone(legacySources);
  const first = migrate(legacySources);
  const second = migrateV07(first.document, legacySources, {
    nowMs: MIGRATION_NOW_MS + HOUR_MS
  });

  assert.equal(first.migrated, true);
  assert.equal(second.migrated, false);
  assert.equal(second.reason, 'already-complete');
  assert.deepEqual(second.document, first.document);
  assert.equal(second.document.ledger.length, first.document.ledger.length);
  assert.equal(Object.keys(second.document.migration.completedSources).length, 1);
  assert.deepEqual(legacySources, sourceBefore);
});

test('UT-B2-MIG-14 same trusted Session ID with conflicting material time blocks migration', () => {
  const original = emptyDocument();
  const legacySources = sources({
    contexts: {
      'job:123456': context({
        sessions: [
          session('conflict-id', BASE_MS, BASE_MS + HOUR_MS),
          session('conflict-id', BASE_MS, BASE_MS + (2 * HOUR_MS))
        ]
      })
    }
  });

  assert.throws(() => migrate(legacySources, original), /legacy-session-id-conflict/);
  assert.equal(original.ledger.length, 0);
  assert.equal(original.migration.completedSources[V07_MIGRATION_MARKER_ID], undefined);
});

test('UT-B2-MIG-15 distinct General Context keys do not collapse projectId 0 records', () => {
  const result = migrate(sources({
    contexts: {
      'general:production-general': {
        key: 'general:production-general',
        type: 'general',
        projectId: '0',
        label: 'Production (General)',
        accumulatedMs: HOUR_MS,
        sessions: []
      },
      'general:training': {
        key: 'general:training',
        type: 'general',
        projectId: '0',
        label: 'Training',
        accumulatedMs: HOUR_MS,
        sessions: []
      }
    }
  }));

  assert.deepEqual(
    Object.keys(result.document.contexts).sort(),
    ['general:production-general', 'general:training']
  );
});

test('UT-B2-MIG-16 unreadable Activity cannot invalidate authoritative time migration', () => {
  const legacySources = sources({
    contexts: {
      'job:123456': context({
        accumulatedMs: HOUR_MS,
        sessions: [session('authoritative-time', BASE_MS, BASE_MS + HOUR_MS)]
      })
    }
  });
  legacySources[LEGACY_SOURCE_KEYS.ACTIVITY] = '{not-json';
  const before = structuredClone(legacySources);
  const result = migrate(legacySources);

  assert.equal(result.document.ledger.reduce((sum, row) => sum + row.durationMs, 0), HOUR_MS);
  assert.ok(result.diagnostics.some(row => row.code === 'LEGACY_ACTIVITY_IGNORED'));
  assert.deepEqual(legacySources, before);
});

test('UT-B2-MIG-17 a legacy Active interval already finalized is never counted twice', () => {
  const finalized = session('same-session', BASE_MS, BASE_MS + HOUR_MS);
  const result = migrate(sources({
    origin: 'legacy-runtime',
    contexts: {
      'job:123456': context({ accumulatedMs: HOUR_MS, sessions: [finalized] })
    },
    active: {
      key: 'job:123456',
      sessionId: 'same-session',
      cycleId: 'cycle-legacy-1',
      startedAt: BASE_MS,
      lastVerifiedAt: BASE_MS + HOUR_MS
    }
  }));

  assert.equal(result.document.ledger.length, 1);
  assert.equal(result.document.ledger[0].durationMs, HOUR_MS);
  assert.ok(result.diagnostics.some(row => row.code === 'LEGACY_ACTIVE_SESSION_ALREADY_FINALIZED'));
  assert.ok(result.diagnostics.some(row => (
    row.code === 'LEGACY_ACTIVE_RECOVERY_EVIDENCE' && row.recoveredVerifiedMs === 0
  )));
});

test('UT-B2-MIG-18 successful candidate construction leaves rebuilt and legacy inputs untouched', () => {
  const original = emptyDocument();
  const legacySources = sources({
    contexts: {
      'job:123456': context({
        accumulatedMs: HOUR_MS,
        sessions: [session('pure-candidate', BASE_MS, BASE_MS + HOUR_MS)]
      })
    }
  });
  const originalBefore = structuredClone(original);
  const legacyBefore = structuredClone(legacySources);

  const result = migrate(legacySources, original);

  assert.notEqual(result.document, original);
  assert.deepEqual(original, originalBefore);
  assert.deepEqual(legacySources, legacyBefore);
  assert.equal(original.migration.completedSources[V07_MIGRATION_MARKER_ID], undefined);
});

test('UT-B2-MIG-22 explicit invalid migration time fails without touching either input', () => {
  const original = emptyDocument();
  const legacySources = sources({ contexts: {} });
  const originalBefore = structuredClone(original);
  const legacyBefore = structuredClone(legacySources);
  assert.throws(
    () => migrateV07(original, legacySources, { nowMs: -1 }),
    /migration-time-invalid/
  );
  assert.deepEqual(original, originalBefore);
  assert.deepEqual(legacySources, legacyBefore);
});

test('UT-B2-MIG-23 distinct trusted duration-only Sessions preserve their full unattributed total', () => {
  const result = migrate(sources({
    contexts: {
      'job:123456': context({
        accumulatedMs: 0,
        sessions: [
          { id: 'duration-only-a', durationMs: HOUR_MS },
          { id: 'duration-only-b', durationMs: HOUR_MS }
        ]
      })
    }
  }));

  assert.equal(result.document.ledger.length, 0);
  assert.equal(result.document.contexts['job:123456'].legacyUnattributedMs, 2 * HOUR_MS);
});

test('UT-B2-MIG-24 malformed completion marker cannot suppress legacy migration', () => {
  const original = emptyDocument();
  original.migration.completedSources[V07_MIGRATION_MARKER_ID] = {
    completionState: 'COMPLETE'
  };
  const before = structuredClone(original);

  assert.throws(
    () => migrate(sources({ contexts: {} }), original),
    /migration-marker-fields-invalid/
  );
  assert.deepEqual(original, before);
});

test('UT-B2-MIG-25 ambiguous raw Context aliases fail instead of selecting the last job', () => {
  const original = emptyDocument();
  const before = structuredClone(original);
  const legacySources = sources({
    contexts: {
      first: context({ key: 'shared-alias', projectId: '111111' }),
      second: context({ key: 'shared-alias', projectId: '222222' })
    },
    active: {
      key: 'shared-alias',
      sessionId: 'legacy-active-alias',
      cycleId: 'legacy-active-cycle',
      startedAtMs: BASE_MS,
      lastVerifiedAtMs: BASE_MS + HOUR_MS
    }
  });

  assert.throws(
    () => migrate(legacySources, original),
    /legacy-context-key-conflict/
  );
  assert.deepEqual(original, before);
});
