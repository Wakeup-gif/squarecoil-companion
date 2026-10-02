# SquareCoil Companion Rebuild
## B2-C Builder Handoff

> **Historical implementation baseline:** this handoff described the next B2-C work before the migration, native-observation, and final READY settlement slices were implemented. Preserve its contracts, but use the 2026-08-27 completion addendum in `logic/B2C-COMPLETION-READINESS.md` and current `AGENTS.md` for live status. Do not interpret the “next slice” wording below as current authorization.

**Status:** Ready for downstream implementation  
**Branch:** `proto/squirel-coil-plugin`  
**Logic baseline:** `20dba0b7edad9373417f84f0b7277968a93d4f30`  
**Scope:** first engineering slice only — production v0.7 migration invocation and marker-aware preflight

---

# 1. Goal

Implement the first unresolved B2-C engineering slice without changing settled product behavior.

The required production flow is:

```text
fenced authority established
        ↓
read rebuilt authoritative document
        ↓
marker-aware legacy preflight
        ↓
NOT_REQUIRED / COMPLETE_MATCH
        └──────────────→ fresh Bridge initialization

REQUIRED
        ↓
current OWNER captures one legacy snapshot
        ↓
OWNER submits one authoritative MIGRATE_V07 command
        ↓
refresh authoritative document
        ↓
recheck CURRENT / ARCHIVE source stability
        ↓
COMPLETE_MATCH
        ↓
fresh Bridge initialization

UNAVAILABLE / FAILED / SOURCE_CHANGED_AFTER_COMPLETION
        ↓
remain fail-closed; no Bridge-driven accrual
```

Do not redesign this flow.

---

# 2. Settled Behavior Authority

Read before coding:

1. `logic/B2C-COMPLETION-READINESS.md`
2. `logic/B2C-IMPLEMENTATION-ENTRY-AUDIT.md`
3. `logic/L2-STATE-TIME-MIGRATION.md`
4. `logic/L1-LIFECYCLE.md`
5. `logic/L8-ACCEPTANCE-TEST-MATRIX.md`

Where implementation mechanics are not specified, preserve the existing one-writer/fencing architecture and choose the smallest compatible implementation.

Do not reopen settled behavior unless code exposes a genuine contradiction.

---

# 3. Primary Source Files

Start with these actual implementation files:

```text
src/content/trusted-transition-core.js
src/data/legacy-preflight.js
src/data/migration-command.js
src/data/migration.js
src/data/command-dispatcher.js
src/extension/authority-router.js
src/extension/authority-kernel.js
src/data/store.js
```

Expected existing facts:

- `migration-command.js` already defines `MIGRATE_V07` and source capture helpers.
- `command-dispatcher.js` already classifies migration as `DIRECT_OWNER`.
- `legacy-preflight.js` is currently presence-only and therefore insufficient.
- `trusted-transition-core.js` currently blocks on legacy presence and does not invoke migration.
- `migration.js` currently stores aggregate source checksum evidence only.

---

# 4. Required Migration Dispositions

Production preflight must distinguish:

```text
NOT_REQUIRED
REQUIRED
IN_PROGRESS
COMPLETE_MATCH
SOURCE_CHANGED_AFTER_COMPLETION
UNAVAILABLE
FAILED
```

These are boot/data-safety dispositions, not Timer States.

Minimum behavior:

### NOT_REQUIRED
No legacy source exists. Continue boot.

### REQUIRED
Legacy source exists and no compatible completed marker matches it. Only OWNER may migrate.

### COMPLETE_MATCH
Completed marker matches retained authority-sensitive legacy source. Do not migrate again; retained legacy keys do not block boot.

### SOURCE_CHANGED_AFTER_COMPLETION
Completed marker exists but CURRENT or ARCHIVE no longer matches. Do not re-import or sum values. Preserve rebuilt authority and withhold new accrual.

### UNAVAILABLE / FAILED
Do not start Bridge-driven timing. Preserve legacy source and prior committed rebuilt data.

---

# 5. Source Identity Requirement

The completed migration evidence must let preflight distinguish:

```text
CURRENT changed  -> blocking conflict
ARCHIVE changed  -> blocking conflict
ACTIVITY changed -> diagnostic only when CURRENT + ARCHIVE still match
```

The current aggregate checksum is not sufficient by itself for this distinction.

Implementation may use per-source checksums or equivalent deterministic evidence.

Do not make checksum format a new product contract.

---

# 6. OWNER / OBSERVER Rules

Migration mutation is OWNER-only.

```text
OWNER
- may capture the supported legacy snapshot
- may submit MIGRATE_V07
- must refresh authoritative state after commit
- must re-evaluate source stability before Bridge start

OBSERVER
- may inspect/adopt migration disposition
- never submits migration
- never creates fallback local authority
- waits for authoritative result / ownership change
```

If ownership changes before commit, normal fencing/revision rules must reject stale authority.

---

# 7. Bridge Ordering

Required ordering:

```text
migration resolved first
then Bridge initialization
then fresh SquareCoil verification
then normal L4 reconciliation
```

Never backfill the migration/boot interval merely because SquareCoil is currently on a Context.

Do not start Bridge-driven Timer transitions while disposition is:

```text
REQUIRED
IN_PROGRESS
SOURCE_CHANGED_AFTER_COMPLETION
UNAVAILABLE
FAILED
```

---

# 8. Non-Negotiable Safety Rules

Do not:

- delete or rewrite v0.7 localStorage keys;
- auto-rerun migration merely because retained keys still exist;
- merge changed legacy values into rebuilt totals after completion;
- create live Active/Pending/Local Pause solely from imported data;
- allow OBSERVER to write authority;
- add a second persistence writer;
- move migration authority into UI/page code;
- weaken fencing/revision checks;
- let migration failure partially replace the authoritative document;
- claim READY while migration is unresolved or conflicted.

---

# 9. Acceptance Gate

This slice is complete only when these settled cases pass:

```text
MIG-C01 automatic OWNER migration
MIG-C02 observer does not migrate
MIG-C03 retained legacy keys do not block forever
MIG-C04 production-path migration idempotency
MIG-C05 migration failure is atomic/fail-closed
MIG-C06 CURRENT/ARCHIVE source change after completion blocks re-entry
MIG-C07 Activity-only post-migration change does not block timing
READY-C03 unresolved migration prevents false READY
```

Also run the existing B1/B2 unit and integration suites. Do not mark the slice accepted if existing accepted B2.2 behavior regresses.

---

# 10. Done Condition

The implementation slice is done when downstream can demonstrate:

```text
retained v0.7 keys + matching marker
-> normal boot succeeds

first supported upgrade
-> exactly one fenced authoritative migration
-> no duplicate imported time
-> fresh post-migration SquareCoil verification

changed CURRENT/ARCHIVE after completion
-> fail-closed conflict
-> no silent second import

Activity-only change
-> nonblocking diagnostic

OBSERVER present during migration
-> no competing migration write
```

Do not proceed to native action 2/3/4 completion-hook implementation until this gate is green.

---

# 11. Next Engineering Slice

After this migration slice is accepted, continue to:

**Native action 2/3/4 completion observation + OBSERVER → OWNER forwarding.**

Relevant starting file:

`src/squarecoil/bridge-service.js`

The current bridge intentionally reports `FULL_NO_NATIVE_COMPLETION_HOOK`; that is the next known B2-C implementation gap.

---

# 12. Escalation Back to Logic

Escalate only if implementation reveals a genuine behavior contradiction, for example:

- marker/source evidence cannot satisfy retained-key safety without violating L2;
- one-writer ownership makes the settled OWNER/OBSERVER flow impossible;
- a real SquareCoil native-action behavior contradicts the current Bridge assumptions;
- READY conditions conflict with a required safe fallback.

Do not escalate ordinary coding choices such as helper placement, checksum algorithm, debounce constants, test fixture structure, or transport mechanics.
