# SquareCoil Companion Rebuild
## B2-C Implementation Entry Audit

> **Historical entry snapshot:** this audit records the state before the bounded B2-C implementation began. The migration, native-observation, and final READY settlement slices are now implemented on the active B2-C branch; current boundaries and required checks live in `AGENTS.md` and the completion addendum in `logic/B2C-COMPLETION-READINESS.md`.

**Status:** Implementation blocker identified; behavior already settled  
**Active branch:** `proto/squirel-coil-plugin`  
**Role boundary:** Logic Systems Architect  
**Purpose:** identify the first concrete downstream implementation gap without reopening settled B2-C behavior.

---

# 1. Direct Result

The first implementation slice is **production migration invocation + marker-aware preflight**.

Current source already contains:

- v0.7 migration normalization and atomic document transformation;
- a `MIGRATE_V07` migration command handler;
- DIRECT_OWNER command access for migration;
- fenced authority / one-writer infrastructure.

But the production boot path does not yet use those pieces to complete migration.

**Implementation may begin without new Logic.**

---

# 2. Current Implementation Evidence

## 2.1 Presence-only preflight still blocks retained legacy keys

`src/data/legacy-preflight.js` currently resolves:

```text
present legacy key(s)
-> blocked = true
-> reason = legacy-migration-required
```

It does not read the authoritative migration marker or distinguish:

```text
REQUIRED
COMPLETE_MATCH
SOURCE_CHANGED_AFTER_COMPLETION
```

Therefore a successful migration whose legacy keys are intentionally retained would still be blocked on the next boot.

## 2.2 Trusted core never invokes migration

`src/content/trusted-transition-core.js` currently:

```text
refresh authoritative document
-> inspectLegacyPresence(localStorage)
-> if blocked, return
-> otherwise initialize Bridge
```

It does not:

- capture a legacy source snapshot;
- evaluate marker/source match;
- submit `MIGRATE_V07`;
- recheck source stability after commit.

## 2.3 Migration command exists but has no production boot caller

`src/data/migration-command.js` already provides:

```text
captureV07LegacySources(...)
createMigrationCommandHandler(...)
MIGRATE_V07
```

`src/data/command-dispatcher.js` correctly marks migration `DIRECT_OWNER`.

That preserves the intended security boundary, but the current normal boot path has no OWNER-side production invocation route.

## 2.4 Existing marker evidence is not sufficient for Activity-only change discrimination

`src/data/migration.js` currently records a migration marker with one aggregate `sourceChecksum` over CURRENT + ARCHIVE + ACTIVITY.

B2-C requires post-migration preflight to distinguish:

```text
CURRENT/ARCHIVE change -> authority-sensitive conflict
ACTIVITY-only change   -> diagnostic; does not block timing by itself
```

Implementation therefore needs equivalent per-source/equivalence evidence sufficient to make that distinction. Exact checksum representation remains an implementation choice.

---

# 3. First Implementation Slice

Downstream implementation should complete this behavior in this order:

```text
A. marker-aware migration disposition evaluator
        ↓
B. OWNER-only legacy snapshot capture
        ↓
C. one authoritative MIGRATE_V07 invocation when REQUIRED
        ↓
D. atomic result refresh
        ↓
E. post-commit CURRENT/ARCHIVE source recheck
        ↓
F. COMPLETE_MATCH -> initialize fresh Bridge
   conflict/failure -> remain fail-closed
```

No Bridge-driven Timer transition begins before required migration resolves.

---

# 4. Required Outcomes

### No legacy source

```text
NOT_REQUIRED
-> continue boot
```

### Legacy source, no compatible completed marker

```text
REQUIRED
-> current OWNER captures one snapshot
-> submits one migration
```

### Matching completed marker + retained keys

```text
COMPLETE_MATCH
-> do not migrate again
-> do not block
-> continue boot
```

### CURRENT/ARCHIVE changed after completion

```text
SOURCE_CHANGED_AFTER_COMPLETION
-> do not auto-reimport
-> preserve rebuilt authority
-> withhold new accrual
```

### ACTIVITY only changed

```text
completed CURRENT/ARCHIVE still match
-> diagnostic permitted
-> do not block solely for Activity
```

### Failure/unreadable source

```text
FAILED / UNAVAILABLE
-> no partial migration
-> no Bridge accrual
-> legacy source untouched
```

---

# 5. Acceptance Gate for This Slice

The first implementation slice is not complete until these settled B2-C cases pass:

```text
MIG-C01 automatic OWNER migration
MIG-C02 observer does not migrate
MIG-C03 retained legacy keys do not block forever
MIG-C04 production-path idempotency
MIG-C05 atomic failure / no partial switch
MIG-C06 authority-sensitive source changed after migration
MIG-C07 Activity-only post-migration change does not block timing
READY-C03 migration dispositions prevent false READY
```

Existing L2/L8 migration and one-writer tests remain required.

---

# 6. Next Slice After Migration

After the migration slice passes, the next B2-C implementation target is native action 2/3/4 completion observation.

Current `src/squarecoil/bridge-service.js` explicitly reports `FULL_NO_NATIVE_COMPLETION_HOOK`, performs action-7 verification, and attaches passive DOM/click/focus/visibility listeners. It does not yet implement successful action 2/3/4 completion capture or OBSERVER-to-OWNER evidence/verification forwarding.

That is the second implementation slice, not a new Logic problem.

---

# 7. Continuity State

### Settled

- first downstream implementation target is migration invocation/preflight;
- current presence-only preflight is insufficient;
- migration command/domain machinery already exists;
- migration must remain OWNER-only and fenced;
- retained keys are compatible with normal operation after a matching completed marker;
- Activity-only changes must remain distinguishable from authority-sensitive changes;
- native completion observation follows migration as the next B2-C implementation slice.

### Provisional

- concrete internal invocation mechanism for DIRECT_OWNER migration;
- concrete source-check/checksum storage representation;
- concrete test fixture/mechanics.

These are implementation choices, not missing behavior.

### Open

None at the behavior layer.

### Blocked

Full B2 remains blocked on downstream implementation and acceptance evidence.

---

# 8. Readiness Judgment

**B2-C migration slice is implementation-ready.**

A builder should start by replacing presence-only boot blocking with the settled marker-aware migration flow. No core behavior needs to be invented.
