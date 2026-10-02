# SquareCoil Companion Rebuild
## Logic Stage L2: Timer State, Time Ledger, Coordination, and Migration

**Status:** Settled  
**Logic stage:** L2  
**Depends on:** `logic/L0-INVARIANTS.md`, `logic/L1-LIFECYCLE.md`  
**Framework authority:** `docs/REBUILD-MASTER-PLAN.md`  
**Purpose:** Define the authoritative shared state, Time Ledger, time calculations, cross-tab ownership, Recovery Checkpoint, and v0.7 migration semantics that every later feature must use.

---

# 1. Scope

L2 owns:

- Shared Timer State;
- Runtime View State separation;
- Time Ledger;
- Job/Context Index;
- one-writer cross-tab coordination;
- authoritative transactions/revisions;
- Workday Time Zone/day/week rules;
- Today/This Week/Context Total calculations;
- current running contribution;
- precision;
- duplicate identity;
- Recovery Checkpoint schema/semantics;
- v0.7 state/archive/activity migration;
- legacy-unattributed time;
- migration idempotency/failure safety.

L2 does not own raw SquareCoil evidence interpretation, final Pause/Resume transitions, view layout, archive/delete/backup UX, or final presentation styling.

---

# 2. Data Authority Layers

The rebuild separates:

```text
Shared Timer State
  operational timing truth

Time Ledger
  completed authoritative Companion time

Job / Context Index
  identity + workspace metadata

Runtime View State
  per-document UI state
```

No feature may use one layer as a substitute for another.

---

# 3. Shared Timer State

Shared Timer State contains cross-tab operational state and is durable enough for safe reload/reconciliation.

Logical fields include:

```text
schemaVersion
revision
updatedAtMs
coordinationEpoch
active
pending
localPause
lastReason
```

## 3.1 Active

An Active record supports:

```text
contextId
sessionId
cycleId
startedAtMs
lastVerifiedAtMs
source
certainty
accrualOwnerToken
safetyHold when L4 applies one
```

Rules:

- at most one Active record;
- `startedAtMs` is absolute;
- `lastVerifiedAtMs` advances only from L3-eligible fresh evidence;
- Active is not completed Ledger history;
- no separately persisted accumulated-running counter becomes a second time authority.

## 3.2 Pending

Pending supports at least Context identity, detection/source/reason, and later L4 continuity-anchor metadata.

Pending accrues no time.

Totals are queried from Ledger, not copied into Pending.

## 3.3 Local Pause

Local Pause durably records the applicable Context, pause boundary, reason, and cycle continuity needed by L4.

It does not imply SquareCoil is paused.

## 3.4 Mutual exclusivity

Committed state is exactly one of:

```text
active != null, pending = null, localPause = null
active = null, pending != null, localPause = null
active = null, pending = null, localPause != null
all three null
```

A transition between them is one authoritative transaction. Contradictory committed state is invalid.

---

# 4. Runtime View State

Per-document UI-only state may include:

```text
selectedContextId
settingsRoute
temporary dialog/focus state
```

Selection is primarily per runtime/tab.

Selecting B in one tab cannot change shared Active state or force another tab to select B.

A durable convenience such as `lastSelectedContextId` may initialize a new UI but is not Timer State.

Shared workspace preferences such as tab order/visibility/thresholds remain timing-neutral.

---

# 5. Job / Context Index

The Index owns stable identity and non-time metadata.

Logical Context record supports:

```text
contextId
kind = job | general
projectId when valid
currentLabel
shortLabel/aliases when useful
createdAtMs
lastSeenAtMs
workspaceMembership
hidden/tab-order metadata
archivedAtMs when applicable
legacyUnattributedMs lineage reference where applicable
```

## Job identity

Recognized positive SquareCoil project ID is the stable Job identity.

Label/name/department changes do not create a new Job Context.

## General identity

General identity comes from the audited L3 parser contract. `Production (General)` remains stable.

## Archive does not own time

Archive/Recent/hidden are workspace metadata. Archived Contexts query the same Time Ledger as Recent Contexts.

---

# 6. Time Ledger

The Time Ledger is the canonical durable authority for completed Companion-recorded time.

Normal timing is append-oriented. Explicit L6 destructive/correction transactions may delete/invalidate/replace historical data only with the settled data-safety contract.

A Ledger Segment belongs to one Context and one local work date.

Required logical fields:

```text
segmentId
sessionId
cycleId
contextId
startAtMs
endAtMs
durationMs
localDate
workdayZone
startCause when available
endReason / reason
source
certainty
createdAtMs
migration/import provenance when applicable
```

## Segment validity

For attributed time:

```text
endAtMs >= startAtMs
durationMs = endAtMs - startAtMs
contextId valid
localDate valid
workdayZone valid
```

Zero-duration rows do not add time and are stored only when provenance/audit semantics require them.

## Cached totals

Caches/indexes may exist for performance but are rebuildable.

If cache and authoritative sources disagree:

```text
Ledger + legacyUnattributedMs + one valid current contribution
wins
```

---

# 7. Workday Time Zone

One persisted **Workday Time Zone** controls calendar attribution.

First initialization:

```text
workdayZone = browser/system IANA time zone
```

Store an IANA zone, not only a numeric offset.

## Fallback

If no valid runtime IANA zone exists:

1. use previously persisted valid Workday Zone if available;
2. never invent a geographic zone from offset alone;
3. explicit `UTC` fallback is allowed only with diagnostic/fallback disposition;
4. later establishing a valid zone does not silently rewrite prior historical `localDate` values.

## Stability

The persisted zone does not silently change because of restart, DST offset changes, or temporary device-zone changes.

A future explicit preference may change future attribution only; historical `localDate` remains as recorded.

---

# 8. Day / Midnight / DST

A workday is local midnight to the next local midnight in the Workday Time Zone.

A completed interval crossing local midnight is split at every local midnight boundary.

All split pieces:

- share `sessionId` and `cycleId`;
- have distinct `segmentId`;
- preserve exact elapsed duration.

DST days may contain 23 or 25 real elapsed hours. The Ledger uses real elapsed milliseconds, not a forced 24-hour assumption.

---

# 9. Week Policy

Initial reporting policy:

```text
week starts Monday 00:00
week ends next Monday 00:00
```

in the Workday Time Zone.

This is a default query/reporting policy, not an immutable historical-data rule. A future setting may change week-query interpretation without rewriting Ledger segments.

---

# 10. Precision

Authoritative timestamps/durations use integer milliseconds.

Rules:

- decimal-hour rounding is never stored as Ledger truth;
- formatting/export may round without mutating source precision;
- repeated export/display cycles cannot progressively alter time.

---

# 11. Current Running Contribution

Active time remains virtual until finalization.

Conceptually:

```text
running = max(0, effectiveQueryEnd - active.startedAtMs)
```

where L4 may cap `effectiveQueryEnd` at Safety Hold/verification boundaries.

For Today/Week queries, the live interval is virtually split across calendar boundaries.

When finalized, Ledger segments replace the virtual contribution. Both cannot be counted simultaneously.

---

# 12. Canonical Time Queries

All views/features use one query service, conceptually:

```text
getContextToday(contextId, now)
getTodayTotal(now)
getContextTotal(contextId, now)
getWeekTotal(now)
getContextByDay(contextId, range)
getDayByContext(localDate)
getContextHistory(contextId)
```

## Context Today

```text
sum attributed segments for contextId/current localDate
+ valid current contribution for that Context/current localDate
```

Legacy-unattributed time is excluded.

## Context Total

```text
sum all attributed Ledger duration for contextId
+ legacyUnattributedMs
+ valid current contribution
```

## Today Total

All Contexts' attributed current-date time + valid current contribution. Legacy-unattributed is excluded.

## This Week

Attributed time in current reporting week + valid current contribution. Legacy-unattributed is excluded.

---

# 13. Legacy Unattributed Time

v0.7 may contain a trusted accumulated total greater than surviving dated sessions because old session arrays were capped/pruned.

Represent the trusted undated difference as:

```text
legacyUnattributedMs >= 0
```

Rules:

- contributes to Context Total;
- does not contribute to Today, Week, or By Day;
- never becomes a fabricated dated Session;
- reporting/view logic must disclose it when needed to explain totals.

---

# 14. Session vs Cycle

A **Session** is one continuous active accrual interval.

A **Cycle** groups Sessions according to Resume / Start Fresh semantics.

Rules:

- one Session may generate multiple midnight-split Segments;
- Session identity stays stable across those Segments;
- Start Fresh creates a new Cycle but preserves prior Cycles/Total;
- Cycle metadata is not another time authority.

---

# 15. Duplicate Historical Identity

Preferred identity:

- trusted stable `segmentId` / `sessionId`.

Fallback interval fingerprint:

```text
contextId
startAtMs
endAtMs
durationMs
```

Reason/source/certainty are metadata, not primary time identity. Two copies of the same interval must not become two blocks of time because metadata differs.

Same trusted ID with conflicting material time fields is a conflict. Do not sum or silently pick the larger value.

L6 owns restore/import conflict UX and global overlap validation.

---

# 16. Authoritative Mutation Transaction

Any operation changing authoritative state/time across layers commits as one logical transaction.

Examples:

- finalize session;
- A -> B switch;
- clock out;
- migration;
- L6 import/delete/restore.

A transaction may append Ledger Segments and update Shared Timer State, Index, revision/coordination metadata, and Recovery Checkpoint together.

Persistence must be strong enough that a crash cannot leave a completed Ledger write paired with an incompatible stale Active record without a detectable recovery path.

If the chosen storage cannot satisfy this contract, it is not implementation-ready.

---

# 17. Revision / Commit Identity

Every successful authoritative mutation yields:

```text
monotonic revision
unique commitId
updatedAtMs
current fencing/ownership token
```

These support synchronization, stale-write rejection, idempotent commands, and diagnostics.

Revision metadata is not elapsed time.

---

# 18. Cross-Tab Coordination

All live SquareCoil tabs in one data scope share one Timer State/Time Ledger.

Use a **single-writer accrual ownership model**:

```text
one OWNER/coordinator = authoritative writer
other runtimes = OBSERVER clients
```

Observers may display synchronized state and submit commands but may not independently append authoritative time.

## Positive READY disposition

Each runtime must receive:

```text
OWNER
or
OBSERVER_CONNECTED
```

for L1 READY. Absence of a detected conflict is not enough.

---

# 19. Ownership Lease / Fencing

Logical coordination metadata includes:

```text
ownerRuntimeId
coordinationEpoch
fencingToken
leaseExpiry
lastHeartbeat
```

Every authoritative writer mutation carries the current fencing token.

Ownership change produces a newer fencing/epoch disposition. Writes from stale owner tokens are rejected.

The owner renews its lease. Observers do not assume ownership simply because a heartbeat is momentarily absent; takeover occurs only through the coordination layer after safe expiry/release.

Exact heartbeat/lease duration is implementation policy.

## Ownership transfer is not a timer boundary

OWNER/OBSERVER change alone cannot:

- end/start/reset a Session;
- reset `startedAtMs` or `cycleId`;
- add/subtract time;
- change Today/Total.

A new owner reconciles existing Shared Timer State/checkpoint and current SquareCoil evidence before writes continue.

---

# 20. Commands from Observer Tabs

Authoritative user actions from any tab route through the single writer or a safe ownership transfer.

An observer cannot perform a fallback local write because routing is slow.

L4 adds expected revision/session/context and command timestamp semantics.

If one-writer safety cannot be proven:

- authoritative accrual writes stop;
- history remains readable;
- lifecycle becomes DEGRADED/FAILED as appropriate;
- no tab guesses ownership.

---

# 21. Recovery Checkpoint

Checkpoint supports at least:

```text
schemaVersion
runtimeInstanceId
contextId when applicable
sessionId
cycleId
startedAtMs
lastVerifiedAtMs
owner/fencing evidence
checkpointedAtMs
terminationDisposition
buildVersion
```

It is interruption evidence, not live Timer State.

Clean teardown records a clean termination disposition.

If prior termination was unclean:

- do not restore Active from checkpoint;
- freshly observe SquareCoil;
- only evidence-backed historical time is recoverable;
- unknown gaps are not invented.

## Verified recovery portion

If valid:

```text
startedAtMs <= lastVerifiedAtMs
```

then the interval through `lastVerifiedAtMs` may be treated as evidence-backed recoverable time subject to dedupe.

The interval after `lastVerifiedAtMs` is unknown by default.

L3/L4 decide whether a new current period may start after fresh verification.

---

# 22. v0.7 Migration Sources

First rebuilt release recognizes current legacy sources when present:

```text
ussign-squarecoil-job-timer-v1
ussign-squarecoil-job-timer-archive-v1
ussign-squarecoil-job-timer-activity-v1
```

Migration reads them as evidence. It does not keep legacy JSON as the new authoritative runtime model.

---

# 23. Legacy Session Validation Precedence

Migration uses deterministic rules.

## Valid start + end

If both timestamps are valid and `end >= start`:

```text
derivedDuration = end - start
```

Timestamp-derived duration is authoritative for dated history.

A materially conflicting stored duration is not added as extra time; record a reconciliation diagnostic.

## Missing duration with valid timestamps

Derive duration.

## Duration only

A trusted positive duration with no trustworthy date interval must not receive fabricated timestamps. Where safely reconcilable, represent it in legacy-unattributed balance.

## One timestamp only

Do not fabricate the missing boundary. Trusted duration may contribute to unattributed balance if reconciliation supports it.

## Reversed interval

`end < start` is invalid attributed history. Do not silently swap values unless a separately audited legacy adapter proves systematic reversal.

## Zero duration

Adds no elapsed time; retain only if provenance/audit requires it.

---

# 24. Migration Transaction and Idempotency

Pipeline:

```text
Detect legacy source
-> Parse/validate
-> Normalize Context identities
-> Normalize/dedupe Sessions
-> Derive legacy-unattributed balances
-> Create candidate Index/Ledger/non-live recovery evidence
-> Validate invariants
-> Atomic commit
-> Mark migration complete
```

On validation/commit failure:

- do not mark complete;
- do not partially switch authority;
- leave legacy source untouched;
- retry remains safe.

Migration marker supports version, source schema/identity/check data, completion state, and completion time sufficient to prevent double migration.

Successful migration rerun does not duplicate Contexts/Sessions/balances or reset rebuilt state.

---

# 25. Legacy Source Retention

Successful first-release migration does **not** automatically delete original v0.7 source keys.

After migration:

- rebuilt storage is authoritative;
- legacy keys are read-only migration/forensic evidence;
- they are not a promise of rollback compatibility after new rebuilt data is recorded;
- rebuilt runtime does not mirror normal writes into legacy format.

Later cleanup requires an explicit migration/housekeeping plan and recovery confidence.

---

# 26. Context Migration

## Recent/current-only

Create one new Context and preserve safely interpretable label/project/workspace metadata.

## Archive-only

Create Context with archived workspace membership; its time still enters the common Ledger.

## Same Context in current + archive

Create one stable identity, merge/dedupe history, and initially prefer Recent/current workspace membership so the job does not unexpectedly disappear.

Use the maximum trustworthy old accumulated baseline according to legacy-balance reconciliation, not an additive double count.

---

# 27. Legacy Session / Balance Migration

For each valid legacy Session:

1. normalize Context;
2. apply validation precedence;
3. derive/retain identity;
4. dedupe;
5. split at Workday midnight if needed;
6. append attributed migrated Segments with provenance.

For each legacy Context:

```text
legacyAccumulatedMs = max(0, valid accumulated)
importedAttributedMs = sum(valid deduped legacy Session durations)
legacyUnattributedMs = max(0, legacyAccumulatedMs - importedAttributedMs)
```

If valid Sessions exceed old accumulated baseline:

- retain valid Sessions;
- set legacy-unattributed to zero;
- record reconciliation diagnostic;
- do not delete valid time to force an old aggregate match.

Migrated baseline Total therefore preserves the greater trustworthy evidence without inventing dated detail.

---

# 28. Legacy Active / Pending / Local Pause

## Active

Legacy Active cannot become rebuilt Active solely because it was stored.

Convert usable fields into Recovery Checkpoint evidence. Finalize only evidence-backed time through valid `lastVerifiedAtMs`, subject to dedupe. Fresh SquareCoil observation is required for new accrual.

## Pending

May preserve Context/workspace metadata but does not automatically recreate a live Pending prompt. Current SquareCoil + L4 decide current Pending state.

## Local Pause

A reliable legacy Local Pause may become a non-live Local Pause recovery candidate. It never converts directly to Active; fresh SquareCoil compatibility is required by L4.

---

# 29. Activity / Label Migration

Activity is non-authoritative and may be preserved best-effort. Activity migration failure cannot invalidate safe authoritative time migration.

Same stable Context label changes update display metadata only. Historical Context identity and time remain unchanged.

---

# 30. Start Fresh Data Effect

At the data layer Start Fresh:

- leaves all prior Segments;
- leaves `legacyUnattributedMs`;
- leaves Job/Context Total;
- creates a new `cycleId` for later Sessions;
- rewrites no historical time merely because a new cycle begins.

---

# 31. Persistence Failure / Corruption

If an authoritative transaction cannot commit:

- do not report durable success;
- do not advance committed revision;
- do not silently commit only part;
- expose persistence degradation through L1;
- do not bypass state service through alternate timer JSON.

If persisted rebuilt data violates schema/invariants:

- do not silently discard hours unless correction is deterministic/lossless;
- isolate invalid data;
- retain source evidence when feasible;
- expose recovery/diagnostic state;
- do not overwrite last known valid data with guessed repair.

L6/L8 own user-facing recovery/import/export policy.

---

# 32. Data Invariants

- **DATA-01:** one stable Context identity represents one SquareCoil work identity.
- **DATA-02:** at most one Active record exists.
- **DATA-03:** completed authoritative time lives in Ledger, not accumulated counters.
- **DATA-04:** current Active contribution is virtual until finalized and counted once.
- **DATA-05:** every attributed Segment belongs to exactly one `localDate`.
- **DATA-06:** Total may include legacy-unattributed; Today/Week may not.
- **DATA-07:** cached aggregates are rebuildable/non-authoritative.
- **DATA-08:** Archive cannot own a duplicate time store.
- **DATA-09:** stale fencing token cannot commit authoritative mutations.
- **DATA-10:** migration cannot fabricate dated history to explain missing legacy detail.
- **DATA-11:** migration is idempotent.
- **DATA-12:** legacy Active is recovery evidence, not live authority.
- **DATA-13:** per-tab selection cannot alter Shared Timer State by selection alone.
- **DATA-14:** display/export rounding cannot mutate precision.
- **DATA-15:** failed authoritative transaction cannot be presented as successfully committed.
- **DATA-16:** committed Active/Pending/Local Pause are mutually exclusive.
- **DATA-17:** cross-tab ownership transfer alone cannot create/end/reset/duplicate elapsed time.

---

# 33. Required Acceptance Scenarios

Implementation must cover at least:

1. same-day new Session;
2. midnight split preserving one Session identity;
3. DST elapsed duration;
4. current running contribution included once;
5. finalization replaces virtual contribution without double count;
6. legacy total == detailed Sessions;
7. legacy total > Sessions -> unattributed balance, no fake dates;
8. Sessions > legacy total -> valid Sessions retained;
9. successful migration rerun is no-op/idempotent;
10. same Context in Recent + Archive -> one identity/no doubled time;
11. legacy Active -> recovery evidence, not live state;
12. legacy Pending -> no automatic live prompt;
13. Local Pause candidate survives safely without becoming Active;
14. label change -> same Context/Total;
15. per-tab Selected Context independence;
16. one writer + observer both READY, only writer commits;
17. stale writer wakes -> fenced out;
18. owner disappears -> one safe takeover;
19. coordination unavailable -> accrual writes stop;
20. transaction failure during switch -> no partial success claim;
21. Start Fresh preserves Total;
22. legacy timestamp-duration mismatch -> timestamps win for dated history;
23. duration-only legacy row -> no fabricated timestamp;
24. ownership transfer during Active -> same Session unless real timer boundary;
25. contradictory Shared Timer State rejected;
26. Week excludes legacy-unattributed balance;
27. missing system zone -> explicit UTC fallback disposition/no geographic guess.

---

# 34. Later-Stage Resolution References

L3 settles exact SquareCoil evidence/verification eligibility. L4 settles Pending/Resume/Pause/Safety Hold and conservative current-session behavior. L5-L6 settle disclosure, archive, backup, and import conflicts. L8 supplies full fixture/release gates.

---

# 35. L2 Readiness Judgment

**Status: Settled**

The shared state model, Ledger/time semantics, Workday rules, one-writer coordination, checkpoint/recovery evidence, and v0.7 migration are explicit enough that implementation must not invent alternate authoritative time behavior.
