# SquareCoil Companion Rebuild
## B2-C Completion Logic and Implementation-Readiness Assessment

**Status:** Settled — behavior ready for bounded B2 completion implementation  
**Scope:** remaining B2 authority gaps after accepted B2.2  
**Depends on:** settled L0-L4, L8, and accepted B2.1/B2.2 evidence  
**Active branch:** `proto/squirel-coil-plugin`  
**Purpose:** determine whether the remaining B2 blockers require new behavior logic or only implementation/acceptance work, and close the small invocation/cross-tab capability ambiguities that would otherwise force a builder to guess.

---

# 1. Direct Assessment

The remaining B2 blockers are:

```text
1. production invocation of the already-defined v0.7 migration
2. passive observation of successful native actions 2 / 3 / 4
3. positive lifecycle READY evidence for the completed B2 runtime
4. full B2 acceptance/settlement
```

The underlying domain behavior for migration, native transition interpretation, Timer consequences, one-writer authority, and lifecycle READY already exists in L1-L4.

However, two invocation-level behavior edges were still implicit enough that implementation could reasonably guess differently:

- legacy keys remain present after successful migration, so simple `legacy key exists -> block` cannot be the permanent preflight rule;
- a native mutation can occur in an OBSERVER tab, so action-completion evidence and event-driven verification cannot exist only in the OWNER document.

This file settles those edges.

After this file, no additional behavior specification is required before a bounded B2 completion implementation can begin.

**Settled**

---

# 2. Existing Authority Preserved

This delta does not replace or reopen:

- L1 lifecycle states / READY contract;
- L2 Timer State, Ledger, migration normalization, dedupe, recovery evidence, or transaction rules;
- L3 evidence precedence, candidate correlation, negative confirmation, or semantic event rules;
- L4 Timer transitions, Safety Hold, boundary policy, or recovery;
- L8 acceptance layers and release-blocking safety priorities.

Where this file is silent, those owning contracts remain authoritative.

**Settled**

---

# 3. B2 Completion Map

| Remaining gap | Owning logic | Delta required here | Readiness result |
|---|---|---|---|
| Legacy migration invocation | L2 | boot/preflight disposition + OWNER-only invocation + retained-key completion behavior | Ready |
| Native action 2/3/4 completion observation | L3/L4 | cross-tab evidence forwarding + missing-hook fallback capability | Ready |
| Positive READY | L1 | clarify relation to migration and Bridge capability | Ready |
| Full B2 settlement | L8 | no new behavior; requires implementation evidence against existing + delta cases | Ready for acceptance after implementation |

**Settled**

---

# 4. Legacy Migration Disposition

Legacy source **presence** and migration **requirement** are not the same thing.

Because L2 deliberately retains the original v0.7 keys after a successful migration, preflight must resolve a migration disposition instead of permanently blocking on key presence.

Canonical migration dispositions:

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

**Settled**

---

# 5. Migration Preflight Decision

Preflight evaluates:

```text
legacy source presence
+
authoritative migration marker
+
source identity/check evidence
```

## 5.1 No legacy source

```text
legacy keys absent
-> NOT_REQUIRED
```

Normal B2 initialization may continue.

## 5.2 Legacy source exists, no completed compatible marker

```text
legacy keys present
+
no completed compatible v0.7 marker
-> REQUIRED
```

Normal Timer/Bridge authority remains blocked until migration resolves.

## 5.3 Legacy source exists and completed marker matches

```text
legacy keys present
+
completed marker
+
matching authoritative source identity/check
-> COMPLETE_MATCH
```

The retained legacy keys are expected forensic evidence and **must not block normal runtime operation**.

Do not rerun migration solely because those retained keys still exist.

## 5.4 Completed marker exists but authority-sensitive legacy source changed

```text
completed marker
+
legacy current/archive source no longer matches completed source evidence
-> SOURCE_CHANGED_AFTER_COMPLETION
```

Do not silently rerun or merge the changed source into rebuilt authority.

This condition suggests a stale/legacy writer may still be operating or that the migration source changed after the accepted snapshot.

Authoritative Companion timing remains fail-closed until the conflict is resolved.

## 5.5 Legacy source cannot be read safely

```text
source read unavailable / ambiguous
-> UNAVAILABLE
```

Do not guess absence. Remain fail-closed.

**Settled**

---

# 6. Authority-Sensitive vs Non-Authoritative Legacy Changes

The v0.7 sources have different safety importance.

```text
CURRENT  -> authority/time-sensitive
ARCHIVE  -> authority/time-sensitive
ACTIVITY -> non-authoritative application history
```

After migration completion:

- a changed CURRENT or ARCHIVE source is an authority conflict and produces `SOURCE_CHANGED_AFTER_COMPLETION`;
- an ACTIVITY-only change may be diagnosed without blocking Timer authority, provided the completed CURRENT/ARCHIVE source evidence still matches and no separate legacy-runtime conflict exists.

Therefore source-check evidence must be sufficient to distinguish authority-sensitive source changes rather than relying only on one aggregate checksum when that would make Activity-only changes indistinguishable.

The exact checksum algorithm/storage representation is implementation detail.

**Settled**

---

# 7. Migration Invocation Ownership

Only the current fenced **OWNER** may initiate the authoritative migration command.

```text
OWNER    -> may capture + submit migration
OBSERVER -> may detect/wait/display disposition, never commit migration
```

Rules:

1. Observer tabs do not race the owner with their own migration transactions.
2. No observer creates a fallback local rebuilt store.
3. If ownership changes before migration commits, the stale owner's authoritative command is rejected by normal fencing/revision rules.
4. A newly valid owner reevaluates migration disposition from authoritative state + legacy evidence before acting.
5. Migration ownership transfer itself creates no time.

**Settled**

---

# 8. Automatic First-Upgrade Migration

For the supported v0.7 source schema, migration is an automatic first-upgrade boot operation when disposition is `REQUIRED`.

A normal valid migration does not require the user to manually import their existing Companion history.

Sequence at behavior level:

```text
establish fenced authority
        ↓
read rebuilt authoritative document
        ↓
legacy preflight
        ↓
REQUIRED
        ↓
OWNER captures one legacy source snapshot
        ↓
OWNER submits one authoritative MIGRATE_V07 command
        ↓
atomic migration result
        ↓
refresh authoritative document + verify marker/source disposition
        ↓
COMPLETE_MATCH
        ↓
fresh SquareCoil Bridge initialization/verification
        ↓
normal L4 reconciliation
```

No Bridge-driven Timer transition starts before required migration is resolved.

**Settled**

---

# 9. Migration Source Snapshot Stability

Migration consumes one captured legacy snapshot rather than reading changing source piecemeal during the authoritative transaction.

Required safety behavior:

- capture all supported legacy sources as one logical snapshot;
- derive/check source identity from that snapshot;
- migration commits only the captured snapshot;
- after commit and before normal Timer authority is unblocked, reevaluate the authority-sensitive legacy source against the completed marker;
- if CURRENT/ARCHIVE changed during or immediately after migration, enter `SOURCE_CHANGED_AFTER_COMPLETION` instead of silently treating the new source as already migrated.

Do not rollback a valid committed migration merely because the external legacy source subsequently changed. Preserve the committed rebuilt data, block further authoritative timing, and require conflict resolution.

Exact stable-read/recheck mechanics are implementation policy.

**Settled**

---

# 10. Migration Success / No-Op / Failure

## 10.1 Successful migration

Success requires:

- atomic rebuilt authority commit succeeds;
- completed migration marker is present in the authoritative document;
- post-commit preflight resolves to `COMPLETE_MATCH` for CURRENT/ARCHIVE;
- no fake live Active/Pending/Local Pause is restored from file/source state;
- legacy source keys remain untouched/read-only.

Then normal Bridge initialization may proceed.

## 10.2 Already complete

If migration command/read logic reports `already-complete` and source evidence matches the completed marker:

- treat as `COMPLETE_MATCH`;
- do not duplicate imported time;
- continue normal boot.

## 10.3 Migration failure

On parse/validation/transaction failure:

```text
-> FAILED
```

Behavior:

- do not mark complete;
- do not partially switch authority;
- do not delete or rewrite legacy source;
- preserve previous committed rebuilt document;
- do not start Bridge-driven accrual;
- expose actionable migration failure/degraded status;
- retry may occur only through the same safe OWNER path.

**Settled**

---

# 11. Source Changed After Completion

`SOURCE_CHANGED_AFTER_COMPLETION` is not permission to automatically import again.

For first rebuilt release:

- preserve the already-committed rebuilt data;
- stop/withhold new authoritative accrual before it can coexist with a suspected legacy writer;
- do not delete the changed legacy source;
- do not sum new legacy values into rebuilt totals;
- surface a plain-language legacy-runtime/source conflict;
- require the old Companion/Tampermonkey timer path to be disabled/resolved, then reload/retry the normal preflight path.

A future explicit reconciliation feature would require its own data-safety contract; B2 does not invent one.

**Settled**

---

# 12. Migration and Current SquareCoil Context

Migration never treats the duration of migration itself as verified work.

After a required migration completes:

1. initialize/refresh the Bridge;
2. obtain fresh current SquareCoil evidence;
3. run normal L4 new/remembered/recovery rules;
4. do not backfill the boot/migration interval merely because SquareCoil is currently on the same Context.

Legacy Active/Local-Pause migration remains non-live recovery evidence under L2/L4 rules.

**Settled**

---

# 13. Native Completion Observation Scope

A supported top-level SquareCoil document may originate a native action 2/3/4 request regardless of whether that document currently holds accrual OWNER authority.

Therefore every eligible live runtime may **passively observe its own document's native mutation completion**.

Observation permission does not grant write authority.

```text
local native completion
        ↓
non-authoritative evidence
        ↓
authoritative Bridge/Writer path
        ↓
post-state verification
        ↓
L3 semantic event
        ↓
L4/L2 transaction
```

**Settled**

---

# 14. Native Completion Evidence Contract

A completion observation is eligible to create a Transition Candidate only when it describes:

```text
exact SquareCoil time-clock mutation endpoint
+
audited action in {2,3,4}
+
successful native completion signal
```

Candidate evidence supports at least:

```text
completion identity/key
nativeAction
completedAtMs
requestProjectId when safely parseable
requestDepartment when safely parseable
sourceRuntimeId
source bridge/runtime generation
```

Rules:

- click timestamp is never substituted for completion;
- request start is not completion boundary;
- unsupported/unknown actions are ignored;
- request/response is never modified to create evidence;
- native handler behavior is never prevented, replaced, retried, or initiated by the observation hook;
- candidate creation still does not prove resulting Context/state;
- post-state verification remains mandatory under L3.

**Settled**

---

# 15. OWNER Native Completion

When the local runtime is OWNER:

- accepted completion evidence enters the local Bridge candidate engine;
- candidate queues prompt fresh post-state verification;
- only resulting normalized semantic events reach the Timer service;
- duplicate completion evidence for the same native request coalesces by stable completion identity;
- separate successful native requests remain separate candidates/boundaries.

**Settled**

---

# 16. OBSERVER Native Completion

When the native action occurs in an OBSERVER document:

1. observer captures only the sanitized native completion evidence envelope;
2. observer forwards the evidence through the established authority channel;
3. observer performs **no** Timer/Ledger mutation;
4. authoritative OWNER validates freshness/runtime provenance;
5. OWNER records/correlates the candidate and performs prompt fresh post-state verification;
6. normal L3 -> L4 -> L2 flow decides the result.

If forwarding fails or ownership is changing:

- observer does not fall back to a local write;
- evidence may be retried/idempotently forwarded while still fresh;
- otherwise later current-state verification may detect the transition with `DETECTED` rather than `NATIVE_CONFIRMED` boundary certainty;
- no timestamp is fabricated to compensate for lost native completion evidence.

**Settled**

---

# 17. Observer Native Activity Hint

Even when no successful completion evidence is available, user/native clock activity in an OBSERVER tab must not wait only for the periodic OWNER heartbeat.

A passive observer click/native-activity hint may request **prompt authority-side verification**.

Rules:

- the hint carries no authoritative resulting state;
- it cannot establish a boundary;
- it does not call a native mutation;
- OWNER coalesces redundant verification requests;
- if the hint is stale/superseded, it may be ignored;
- exact debounce timing is implementation policy.

This preserves safe multi-tab responsiveness when native completion observation is temporarily unavailable.

**Settled**

---

# 18. Forwarded Completion Freshness

OWNER accepts forwarded completion evidence only when it is compatible with the current authority/runtime generation and is temporally plausible.

At behavior level validate:

- source runtime is a current connected Companion runtime;
- source generation has not been torn down/superseded;
- completion identity has not already been consumed/coalesced;
- `completedAtMs` is a valid timestamp within a bounded freshness/skew relationship to authority receipt/current transition ordering;
- newer confirmed native transition state has not already superseded it.

Invalid/stale forwarded evidence cannot donate a native-confirmed boundary.

Exact freshness/skew tolerance is implementation policy.

**Settled**

---

# 19. Bridge Capability When Native Hook Is Missing

L3's normal `FULL` capability means:

```text
native completion observation
+
server verification
+
audited DOM verification
```

A runtime can still safely verify current state when native completion observation is unavailable.

Add the reduced capability disposition:

```text
VERIFICATION_FALLBACK
```

Meaning:

- native completion observation is unavailable;
- at least one trusted current-state verification path remains usable;
- native-confirmed boundaries may be unavailable;
- transitions may still be detected and processed under existing `DETECTED` boundary rules.

Existing more specific source fallbacks remain meaningful:

```text
DOM_FALLBACK
SERVER_FALLBACK
UNAVAILABLE
```

Implementation may expose capability flags internally, but user/domain behavior must preserve the distinction between full native-completion capability and verification-only safe operation.

**Settled**

---

# 20. Missing Hook Does Not Automatically Mean Unsafe Timer

Native-completion loss alone does not require fabricating failure if trusted verification remains available.

In `VERIFICATION_FALLBACK`:

- Timer may operate using existing L3/L4 detected-boundary rules;
- passive/native activity should trigger prompt verification, including from OBSERVER tabs;
- the runtime exposes a non-destructive diagnostic/capability degradation;
- no event may be labeled `NATIVE_CONFIRMED` without valid completion evidence.

If no trusted current-state verification remains, use existing `UNAVAILABLE` / L4 grace + Safety Hold behavior.

**Settled**

---

# 21. Lifecycle READY Relationship

L1 READY remains exactly governed by its R1-R9 contract.

This delta clarifies:

## Migration

Lifecycle cannot report READY while migration disposition is:

```text
REQUIRED
IN_PROGRESS
SOURCE_CHANGED_AFTER_COMPLETION
UNAVAILABLE
FAILED
```

because core authority is not safe/available for normal operation.

`NOT_REQUIRED` and `COMPLETE_MATCH` are compatible with READY when all other R1-R9 conditions pass.

## Native completion capability

A temporarily unavailable native completion hook does **not by itself** prohibit READY when:

- Bridge still has a trusted verification capability;
- one-writer authority is healthy;
- current-state transitions can safely use existing detected-boundary rules;
- observer-originated activity can trigger prompt authority-side verification;
- all other R1-R9 requirements pass.

Such runtime is READY with reduced Bridge capability/diagnostic state, not falsely `FULL`.

`UNAVAILABLE` Bridge capability still follows L1/L4 degraded safety behavior.

**Settled**

---

# 22. Full B2 Completion vs Runtime Fallback

Two separate questions must not be conflated:

```text
Can the runtime safely operate when a capability temporarily fails?

Has the B2 implementation actually implemented and accepted the required native-completion feature?
```

For **full B2 settlement**, the native action 2/3/4 completion observation path must be implemented and pass its required acceptance cases.

At runtime after that feature exists, temporary hook failure may fall back safely according to Sections 19-21.

Therefore a fallback-capable READY runtime does not waive the implementation requirement for full B2 acceptance.

**Settled**

---

# 23. B2-C Acceptance Additions

Existing L8 tests remain required. Add/explicitly require these completion cases.

## MIG-C01 automatic OWNER migration

Legacy source + no completed marker -> OWNER invokes one migration before Bridge accrual; success produces completed marker and then fresh Bridge verification.

## MIG-C02 observer does not migrate

OWNER + OBSERVER with legacy source -> only OWNER submits authoritative migration; observer waits and adopts committed result.

## MIG-C03 retained legacy keys do not block forever

Completed matching marker + unchanged retained legacy keys -> preflight resolves `COMPLETE_MATCH`; normal boot can continue.

## MIG-C04 migration idempotency through production invocation

Successful migration -> restart/reboot -> no duplicated Contexts, Segments, legacy balances, or live state.

## MIG-C05 migration failure

Malformed/commit-failing migration -> no partial rebuilt mutation, no completion marker, legacy source unchanged, Bridge accrual remains blocked.

## MIG-C06 source changes during/after migration

Authority-sensitive legacy source differs from completed marker before normal Timer starts -> conflict disposition, no automatic second import, no new accrual.

## MIG-C07 Activity-only post-migration change

CURRENT/ARCHIVE still match; only non-authoritative Activity changes -> diagnostic allowed, normal Timer authority is not blocked solely by that Activity change.

## NAT-C01 OWNER action 3

Successful native action 3 in OWNER tab + verified new project -> one candidate, one `CONTEXT_CHANGED`, native-confirmed boundary.

## NAT-C02 same-project action 3

Successful action 3 + same project identity/new department -> verification/metadata only; no timer boundary.

## NAT-C03 action 4 then action 3

Separate successful action 4 and later action 3 -> separate candidates/boundaries; no collapsed gap.

## NAT-C04 action 2 confirmed

Successful action 2 + compatible post-state -> one confirmed `CLOCKED_OUT` boundary.

## NAT-C05 action 2 temporarily unverified

Successful action 2 + unavailable post-state -> strong unconfirmed evidence -> shared Safety Hold through L4; later resolution follows existing contract.

## NAT-C06 observer action forwarding

Successful action 2/3/4 in OBSERVER document -> observer forwards evidence, does not write time; OWNER verifies and commits at most one resulting authoritative transition.

## NAT-C07 observer hint fallback

Native activity in OBSERVER with completion hook unavailable -> prompt authority-side verification occurs; observer does not wait only for periodic heartbeat and never writes locally.

## NAT-C08 stale/duplicate forwarded evidence

Duplicate completion coalesces; stale generation/superseded evidence cannot donate a boundary.

## NAT-C09 no native mutation by Companion

Acceptance proves hook/Bridge issues zero action 2/3/4 mutation requests itself.

## READY-C01 positive OWNER READY

No migration blocker + healthy core + OWNER disposition + Bridge initial observation completed -> lifecycle may reach READY.

## READY-C02 positive OBSERVER READY

No migration blocker + healthy core + OBSERVER_CONNECTED + Bridge listener/client initialized -> lifecycle may reach READY without becoming writer.

## READY-C03 migration blocks READY

REQUIRED/IN_PROGRESS/conflict/failed migration -> no false READY.

## READY-C04 verification fallback READY

Native completion hook unavailable but trusted verification + prompt observer activity forwarding + R1-R9 healthy -> READY may be true with reduced capability, never reported `FULL`.

**Settled acceptance requirements**

---

# 24. Implementation Readiness

## Ready

A downstream builder/Codex can now implement the remaining B2 completion slice without inventing core behavior for:

- when migration runs;
- which runtime owns migration;
- how retained legacy keys coexist with completed migration;
- what to do if legacy source changes after migration;
- when Bridge starts after migration;
- who observes native actions across multiple tabs;
- how observer evidence reaches one writer;
- what happens when action completion observation is unavailable;
- how reduced Bridge capability relates to READY;
- what acceptance proves B2 completion.

## Not yet accepted

This document does **not** claim full B2 implementation is complete.

Full B2 remains blocked on downstream implementation and evidence for the items above plus the existing L8/B2 contracts.

---

# 25. Continuity State

### Settled

- automatic first-upgrade migration behavior;
- marker-aware retained-key preflight;
- authority-sensitive source-change conflict behavior;
- OWNER-only migration mutation;
- observer migration waiting behavior;
- post-migration fresh SquareCoil reconciliation;
- all-tab passive native-completion observation;
- observer-to-owner evidence/verification forwarding;
- verification fallback capability;
- READY relationship;
- B2-C acceptance scenarios.

### Provisional

- exact checksum/source-fingerprint representation;
- exact native hook mechanism;
- exact forwarded-evidence transport envelope;
- exact freshness/skew/debounce timings;
- exact UI wording for migration/capability diagnostics.

These are implementation policy or presentation details and do not block behavior implementation.

### Open

None at the behavior layer for B2-C.

### Blocked

Full B2 acceptance remains blocked on implementation + required evidence, not missing Logic.

---

# 26. Logic Readiness Judgment

**Implementation-ready at the behavior layer for bounded B2-C completion.**

No remaining core behavior must be guessed.

The next unresolved work is downstream implementation/acceptance of B2-C. Logic should not invent implementation mechanics or package/release structure unless a builder discovers a genuine behavioral contradiction and escalates it back here.

---

# 27. Implementation Completion Addendum — 2026-08-27

Sections 24-26 record the pre-implementation readiness judgment. The active B2-C branch has since implemented the bounded completion work described by this document:

- marker-aware OWNER-only migration invocation;
- passive native action 2/3/4 observation through `chrome.webRequest`;
- exact current-OWNER evidence delivery and mandatory post-state verification;
- duplicate, stale-generation, retired-runtime, and superseded evidence rejection;
- final effective READY settlement.

The READY decision remains fail closed and requires all of the following at the same settlement point:

```text
R1-R8 shell prerequisites
+ exact request/runtime/document/current-worker refresh acknowledgment plus a fresh post-probe confirmation
+ fresh positive OWNER or OBSERVER_CONNECTED authority
+ trusted-core/Bridge role alignment
+ checked, unblocked NOT_REQUIRED or COMPLETE_MATCH migration
+ usable initialized Bridge with listeners
+ at least one completed OWNER initial observation in the current authority tenure
```

The isolated MAIN-world shell retains its non-positive B1 coordination sentinel because it does not own trusted authority state. Only the extension worker may combine the narrowed isolated-world evidence with shell health and publish effective READY. That boundary is intentional; changing the label alone is not settlement.

Final B2 acceptance requires the mandatory unit, integration, UI, full transition/package validation, installed Chrome, installed Edge, and CI gates to pass for the exact candidate. This addendum authorizes no B3, B4, B5, or production-promotion work.
