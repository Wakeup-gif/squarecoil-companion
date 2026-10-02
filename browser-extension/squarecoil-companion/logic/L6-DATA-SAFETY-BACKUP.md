# SquareCoil Companion Rebuild
## Logic Stage L6: Archive, Housekeeping, Backup, Restore, and CSV

**Status:** Settled - ready for L7  
**Logic stage:** L6  
**Depends on:** L0 invariants, L1 lifecycle, L2 state/time/migration, L3 SquareCoil Bridge, L4 core timer behavior, L5 time views/workspace  
**Framework authority:** `docs/REBUILD-MASTER-PLAN.md`  
**Purpose:** Define all data-moving, cleanup, import/export, archive, restore, and destructive behavior so ordinary workspace actions cannot silently destroy authoritative Companion time and external files cannot create unsafe live or contradictory history.

---

# 1. Scope and Ownership

L6 owns:

- Archive one / Archive eligible in bulk;
- Archive browser and restore from Archive;
- Clear Recent;
- Delete Job Data;
- Delete Archived Job Data;
- Delete All Archived Data;
- Wipe All Time History;
- Activity Log retention and target-data redaction rules;
- Full Backup JSON;
- backup consistency/integrity metadata;
- Restore Merge and Restore Replace;
- restore conflict and overlap analysis;
- non-live Recovery Evidence restore;
- safe post-restore behavior;
- History CSV export/import;
- v0.7 CSV compatibility;
- malformed/duplicate/conflicting CSV behavior;
- Time Report CSV;
- data-mutation locking;
- large-file safety;
- spreadsheet formula-injection safety.

L6 does not redefine Timer State/time calculations, restore live SquareCoil state from a file, choose a storage engine, or own final dialog styling.

> Workspace cleanup, archive organization, disaster recovery, portable history, reporting, and deletion are separate operations.

**Settled**

---

# 2. Data Safety Classes

```text
WORKSPACE_ONLY
HISTORY_PRESERVING_MOVE
EXTERNAL_DATA_MERGE
DESTRUCTIVE_DATA_MUTATION
```

Examples:

```text
Hide / Clear Recent        WORKSPACE_ONLY
Archive / Restore Archive  HISTORY_PRESERVING_MOVE
Restore Merge / CSV Import EXTERNAL_DATA_MERGE
Delete / Wipe / Replace    DESTRUCTIVE_DATA_MUTATION
```

A conflict-resolution choice that replaces an existing historical record with incoming data is also a destructive correction even when it occurs inside a Merge flow.

**Settled**

---

# 3. Data Mutation Lock

Any operation that changes authoritative historical data runs through one Data Mutation Lock coordinated with the L2 fenced state writer.

While held:

- no second restore/import/delete/wipe commit runs concurrently;
- reads may use the last committed revision;
- the staged plan records the state/data revision it analyzed;
- before commit, relevant target protection, overlap, identity, and revision assumptions are revalidated;
- commit is one logical transaction.

An unrelated heartbeat/revision change does not automatically invalidate a plan. A change invalidates staging only when it changes a fact the plan depends on.

If revalidation fails:

```text
operation = STALE
commit = rejected
```

No feature writes around the lock through alternate storage.

**Settled**

---

# 4. Operational-State Compatibility

## 4.1 May run while another Context is ACTIVE

When the active session is untouched and all conflict checks pass:

- Archive/Clear unrelated inactive Contexts;
- Delete unrelated inactive Context data after confirmation;
- Restore Merge;
- History CSV Import;
- read-only exports.

External historical merges while ACTIVE have an additional rule:

> No incoming attributed interval may overlap the current unfinalized ACTIVE interval, current Safety-Hold interval, or unresolved recovery interval.

If overlap is possible, the import/restore is blocked or staged as a conflict until the active period is finalized/resolved.

## 4.2 Requires global timer quiescence

The first rebuilt release requires:

```text
Timer State = IDLE
no Safety Hold
no unresolved recovery mutation
```

for:

- Restore Replace;
- Wipe All Time History;
- Delete All Archived Data if any staged target becomes protected.

The Data Mutation Lock also prevents a new authoritative timer transition from committing through a destructive replacement window.

## 4.3 Files never restore live Timer State

Backup/CSV content cannot directly set:

```text
ACTIVE
PENDING
LOCAL_PAUSED
Safety Hold
accrual owner lease
Bridge/lifecycle state
```

Fresh SquareCoil observation after the operation drives L3/L4 live behavior.

**Settled**

---

# 5. Archive Meaning

Archive is history-preserving workspace state.

Archive preserves:

- Context identity;
- every Time Ledger Segment;
- `legacyUnattributedMs`;
- daily attribution;
- Job/Context Total;
- restorable history.

Archive removes normal Recent/visible membership and records archive metadata. It never changes SquareCoil.

Archive is not Delete.

**Settled**

---

# 6. Archive One

Allowed only for an unprotected Context.

Transaction:

1. validate target and workspace revision;
2. recheck L4 protection;
3. remove Recent/visible membership;
4. set Archived membership and `archivedAtMs`;
5. preserve all time/history;
6. resolve selection fallback through L5;
7. commit once.

If protection changes before commit, reject as stale.

**Settled**

---

# 7. Archive Eligible in Bulk

`Archive All` means all currently eligible inactive Recent Contexts.

Protected Contexts are skipped by design.

The eligible target set commits atomically as one workspace transaction. A storage/commit failure does not leave half the eligible set archived.

Result summary may include:

```text
archivedCount
skippedProtectedCount
skippedAlreadyArchivedCount
```

A skipped protected Context is not a failure.

**Settled**

---

# 8. Archive Browser and Restore

Archive rows may expose Context label/job number, Total, last recorded activity, archivedAt, legacy-balance indicator, Restore, Delete Data, and Open Job when valid.

Default order:

```text
newest archivedAt
then stable Context identity
```

Restoring Archive means:

```text
Archived -> Recent
```

It preserves all time, does not Resume/Start Fresh, and follows L5 soft visible-tab capacity rules.

If SquareCoil makes an archived Context current, current/protected accessibility wins and archive membership is reconciled away rather than hiding operational work.

**Settled**

---

# 9. Clear Recent Final Semantics

`Clear Recent` removes eligible inactive Contexts from Recent membership and visible tabs.

Destination:

```text
INACTIVE_NON_RECENT
```

It does not Archive and does not delete history.

Context/time remains available through History, By Context, and search.

Protected Contexts are skipped.

Bulk Clear stages the eligible set and commits it atomically. If Selected Context is cleared, L5 chooses fallback selection.

**Settled**

---

# 10. Delete Job Data Exact Scope

`Delete Job Data` permanently removes one inactive Context's Companion-owned data.

Delete removes when present:

- Time Ledger Segments for that Context;
- legacy-unattributed balance;
- Context Index identity, labels, aliases;
- Recent/visible/hidden/archive membership;
- context-specific tab/order metadata;
- context-specific migration/import/restore provenance;
- target-specific Activity Log fields/entries that would otherwise retain deleted Context identity, time, session detail, or labels.

Activity handling:

- target-specific Activity records are removed or irreversibly redacted;
- a new minimal generic audit event may say a destructive Context deletion occurred;
- that generic event must not retain the deleted job number/name, historical hours, session times, or hidden copy of deleted records.

Delete does not modify SquareCoil official data, unrelated Contexts, unrelated preferences, or unrelated Activity entries.

**Settled**

---

# 11. Delete Preconditions

Delete Job Data is unavailable for a protected Context.

Before commit:

- target is still inactive/unprotected;
- expected identity/revision is rechecked;
- user explicitly confirms the named target and permanent removal of Companion history/time.

If target becomes current/protected before commit, reject.

If SquareCoil observes the deleted job later, it is recreated as a zero-history Context and follows L4 normal new-Context behavior.

**Settled**

---

# 12. Delete Archived Job and Delete All Archived Data

Deleting one archived Context uses the same Delete Job Data contract.

`Delete All Archived Data`:

- stages the complete archived target set;
- requires every staged target to remain eligible/unprotected;
- is all-or-nothing for authoritative deletion;
- permanently deletes archived Ledger/balances/Context metadata and target-specific Activity/provenance;
- does not touch non-archived Contexts;
- requires explicit bulk confirmation and the pre-destructive backup opportunity.

If any target becomes protected, the operation stops/re-stages rather than silently skipping it.

**Settled**

---

# 13. Wipe All Time History

Wipe removes:

- all Time Ledger Segments;
- all `legacyUnattributedMs`;
- time-specific import/migration provenance and aggregate caches;
- finalized History derived from time records.

Wipe preserves:

- application/theme preferences;
- Context/workspace metadata and Recent/Archive organization;
- non-authoritative Activity Log unless the user separately clears it;
- official SquareCoil records.

Activity Log is never used to reconstruct wiped time.

Wipe requires Section 4.2 quiescence and explicit confirmation.

After commit:

1. no pre-wipe safe anchor may be reused to create new Companion time;
2. Bridge performs fresh SquareCoil verification;
3. if a current Context exists, L4 evaluates it as zero-history from a fresh post-wipe evidence anchor;
4. if the user wants Companion to stay stopped, they must disable Companion rather than relying on Wipe as a pause control.

**Settled**

---

# 14. Activity Log Retention

Activity Log is non-authoritative and may be bounded by count/age.

- Activity pruning never changes Today/Week/Total/History.
- `Clear Activity Log` never deletes authoritative time.
- Activity failure does not become Ledger failure.
- target-specific Activity must still obey Delete Job Data redaction/removal.

There is no equivalent silent age/count retention cap for authoritative Time Ledger history.

**Settled**

---

# 15. No Silent Authoritative Compaction

The first rebuilt release does not delete detailed Ledger history merely to save space.

A future optimization may only replace storage representation if exact user-visible totals/history semantics remain recoverable and the change is explicit/migrated safely.

Storage pressure must surface as a storage problem, not silent pruning.

**Settled**

---

# 16. Full Backup Purpose

Full Backup JSON is the primary versioned disaster-recovery representation of durable Companion data.

It is not a live runtime snapshot and is distinct from History CSV and Time Report CSV.

**Settled**

---

# 17. Full Backup Envelope

Logical envelope:

```text
format = squarecoil-companion-backup
schemaVersion
backupId
exportedAtMs
appVersion
sourcePlatform/browser metadata when useful
dataScopeMetadata when available
snapshotRevision
recordCounts
workdayZone
workdayZoneDisposition
contexts
ledgerSegments
legacyBalances
workspace
preferences
migrationMetadata
optionalActivityLog
recoveryEvidence when applicable
optionalPayloadDigest
```

`recordCounts` must match the parsed payload during validation.

An optional payload digest may detect accidental corruption/truncation. It is an integrity signal only, not proof that an edited file is trusted/authentic.

**Settled**

---

# 18. Required Backup Data

Include when present:

- Context identity/kind/project ID/labels;
- Ledger Segments with stable Segment/session/cycle IDs;
- timestamps, durations, localDate, historical workday zone;
- startCause/endReason/source/certainty/provenance;
- legacy balances with lineage;
- Archive/Recent/visible/hidden/tab ordering;
- restorable thresholds/appearance/preferences;
- current persisted Workday Time Zone preference;
- migration metadata needed to interpret history.

Activity Log is optional because it is not authoritative time.

**Settled**

---

# 19. Backup Excludes Live Claims

Backup must not assert as restorable live state:

```text
ACTIVE
PENDING
LOCAL_PAUSED
Safety Hold
accrual/fencing lease
lifecycle/Bridge/root/listener state
open Settings/modal state
```

A file cannot by itself claim the user is currently clocked into a Context.

**Settled**

---

# 20. Recovery Evidence in Full Backup

`recoveryEvidence` is present only when applicable, but when a valid durable Recovery Checkpoint contains evidence-backed unfinalized time, Full Backup must include a sanitized non-live Recovery Evidence record rather than silently discard that recoverable interval.

Allowed evidence includes:

```text
contextId
sessionId
cycleId
startedAtMs
lastVerifiedAtMs
checkpointedAtMs
source/provenance
```

It is explicitly marked:

```text
NON_LIVE_RECOVERY_EVIDENCE
```

Restore reconciliation rule:

1. validate `startedAtMs <= lastVerifiedAtMs` and normal timestamp bounds;
2. dedupe against existing/finalized Segment/session identity;
3. run global temporal-overlap analysis;
4. when safe, convert only `[startedAtMs, lastVerifiedAtMs]` into finalized historical recovery Segment(s), day-split through normal L2 rules;
5. use recovery provenance/end reason such as `recovery-finalize`;
6. never create ACTIVE/PENDING/LOCAL_PAUSED from the evidence;
7. never restore any interval after `lastVerifiedAtMs`.

If the same Session later finalized in the dataset, dedupe wins and Recovery Evidence adds nothing.

If evidence conflicts/overlaps materially, it is a restore conflict, not automatic added time.

**Settled**

---

# 21. Consistent Backup Snapshot

Backup may be exported while active but uses one committed snapshot revision.

If state changes while serialization occurs, use the stable snapshot or restart. Never mix records from incompatible revisions.

The file's `recordCounts` are generated from that same snapshot.

**Settled**

---

# 22. Backup Validation

Treat every uploaded file as untrusted.

Validate at minimum:

- format identifier and supported schema;
- record counts against parsed payload;
- optional digest when present;
- top-level/record types;
- Context identity shapes;
- IDs;
- timestamp/duration consistency;
- localDate/workday-zone fields;
- duplicate IDs/fingerprints;
- temporal overlaps;
- workspace membership values;
- bounded structural depth/string/file size;
- no executable content evaluation.

Canonical current-schema timestamps must be absolute/offset-aware or otherwise unambiguous under the schema. Zone-less ambiguous timestamps are invalid unless an explicitly audited legacy adapter defines their meaning.

For current canonical rows, materially inconsistent start/end/duration values are validation conflicts. Legacy adapters may apply the settled L2 legacy precedence rules.

Safety limits may reject a file. They may not truncate it and report success.

**Settled**

---

# 23. Schema Compatibility

```text
current supported schema       validate/stage
older explicitly supported     migrate in staging, then validate
unsupported newer major        reject
```

Unknown optional fields may be ignored only where schema semantics permit. Unknown required meaning is never guessed.

Failure leaves current data unchanged.

**Settled**

---

# 24. Restore Pipeline

```text
File
-> Parser
-> Schema Validator
-> Migration Adapter
-> Internal Invariant Validator
-> Recovery Evidence Normalizer
-> Dedupe Analyzer
-> Temporal-Overlap Analyzer
-> Conflict Analyzer
-> Staged Restore Plan
-> User Mode/Conflict Decision
-> Data Mutation Lock
-> Protection/Revision Recheck
-> Atomic Commit
-> Cache/Read-Model Requery
-> Fresh SquareCoil Verification
```

No uploaded object/row is written directly into authoritative storage.

**Settled**

---

# 25. Restore Modes

```text
MERGE
REPLACE
```

MERGE is default because it preserves unrelated current data.

REPLACE is destructive, requires Section 4.2 quiescence, stronger confirmation, and a pre-destructive Full Backup opportunity.

**Settled**

---

# 26. Restore Merge Semantics

MERGE:

- merges by stable Context identity;
- dedupes stable Segment/session identity and deterministic interval fingerprints;
- adds new compatible historical records;
- never changes Shared Timer State from file data;
- current workspace membership/order wins for Contexts already present unless explicit workspace import is selected;
- new Contexts may inherit backup workspace membership;
- current preferences win by default;
- imported historical Segments retain their historical `localDate`/workdayZone.

Workspace import protection:

- imported workspace state cannot archive/hide/remove a currently protected Context;
- L4/L5 current/protected accessibility wins;
- incompatible workspace wishes are skipped/reconciled and reported, not applied over current work.

**Settled**

---

# 27. Workday Time Zone Restore Policy

Historical Segment date/zone attribution is immutable during restore.

For the **current future-attribution preference**:

## MERGE

Current Workday Time Zone wins by default.

If the user explicitly imports the backup preference, the valid incoming zone becomes the future-attribution preference only. Historical `localDate` values are not rewritten.

## REPLACE

A valid backup Workday Time Zone becomes the default future-attribution preference because Replace is disaster recovery, unless the user explicitly chooses Keep Current Zone.

If the selected zone is invalid/unavailable, use L2 fallback/diagnostic rules. Never reinterpret historical Segment dates to match the new current preference.

**Settled**

---

# 28. Restore Replace Semantics

REPLACE atomically replaces the current durable restorable core dataset with the validated backup:

- Ledger/history;
- Context Index/restorable metadata;
- legacy balances;
- workspace organization;
- selected compatible preferences under the restore policy.

It preserves installation/browser permissions and volatile runtime/platform identity.

Activity Log policy:

- current Activity Log is preserved by default because it is non-authoritative and not required for core disaster recovery;
- if backup contains Activity Log and the user explicitly chooses Restore Activity, it may replace/merge according to the bounded Activity policy;
- Activity restore never changes time totals.

After commit there is no file-derived live Timer State. Fresh SquareCoil verification drives L4.

**Settled**

---

# 29. Historical Segment Dedupe

## Same stable Segment ID + same material fields

Duplicate, add nothing.

## Same stable ID + conflicting time fields

Conflict, never sum or silently choose.

## Different IDs + same deterministic interval fingerprint

Likely duplicate under L2 identity rules. Do not double-count solely because IDs differ.

## Overlapping but materially different intervals

Run the global overlap rules in Section 30.

**Settled**

---

# 30. Global Temporal-Overlap Invariant

The Companion data scope permits at most one accruing Context at an instant. Imported/restored dated history must not silently violate that invariant.

For positive-duration attributed intervals in the same dataset:

- exact duplicates are deduped;
- adjacent intervals are allowed;
- midnight-split pieces of one Session are expected to be adjacent, not overlapping;
- overlapping intervals from different Contexts are a conflict;
- materially overlapping different Sessions of the same Context are a conflict unless they are proven duplicate representations of the same source interval;
- an incoming interval overlapping the current unfinalized ACTIVE/Safety-Hold/recovery interval is a conflict and cannot commit while that live interval is unresolved.

Legacy-unattributed balance has no date interval and is not overlap-tested.

Conflict code:

```text
TEMPORAL_OVERLAP_CONFLICT
```

The application never trims/splits overlapping imported records just to force them to fit or maximize hours.

**Settled**

---

# 31. Context Identity Merge

For the same stable Context ID:

- label/name differences do not fork identity;
- blank/weak metadata does not erase richer useful metadata;
- workspace status follows restore policy, not label freshness.

Hard identity conflict:

If one stable `contextId` maps to incompatible immutable identity facts, for example:

```text
job:260100 -> projectId 260100
incoming job:260100 -> projectId 260999
```

or Job vs General identity is incompatible, normal Merge cannot resolve it by choosing a label.

Code:

```text
HARD_CONTEXT_IDENTITY_CONFLICT
```

The staged restore must be canceled/fixed or handled by a future explicit remapping tool. Do not silently rewrite stable identity.

**Settled**

---

# 32. Legacy Unattributed Balance Merge

Never blindly add `legacyUnattributedMs`.

- same identifiable lineage/origin -> dedupe; preserve the non-duplicated trusted baseline, normally max equivalent baseline rather than sum;
- same backup twice -> second restore adds zero balance;
- independent/ambiguous lineage with no provable additive meaning -> conflict;
- never fabricate dated sessions to resolve aggregate balance conflicts.

**Settled**

---

# 33. Conflict Resolution and Destructive Corrections

Conflict classes include:

```text
SEGMENT_ID_CONFLICT
SESSION_ID_CONFLICT
TEMPORAL_OVERLAP_CONFLICT
LEGACY_BALANCE_LINEAGE_CONFLICT
HARD_CONTEXT_IDENTITY_CONFLICT
UNSUPPORTED_SCHEMA_CONFLICT
```

Normal compatible Merge requires no guessed winner.

For a resolvable existing-vs-incoming record conflict:

```text
Keep Current
Use Incoming
Cancel
```

But `Use Incoming` is a **destructive correction**, not an ordinary additive merge. It:

- requires explicit confirmation that current historical data will be replaced for that conflict;
- cannot be applied to a protected/current unfinalized interval;
- re-runs overlap/invariant validation after replacement;
- must not be offered for hard identity conflicts where replacing a label cannot make the identity safe.

Bulk conflict policy may only apply to genuinely homogeneous conflict classes. Unresolved required conflicts block commit.

**Settled**

---

# 34. Partial Restore Failure

Restore is staged and authoritative commit is atomic.

```text
parse failure       no mutation
validation failure  no mutation
migration failure   no mutation
unresolved conflict no mutation
commit failure      failure/recovery state, not success
```

Never restore a prefix and silently drop the tail.

**Settled**

---

# 35. Safe Post-Restore State

After Merge/Replace:

- no file-derived Active/Pending/Local Pause/Safety Hold exists;
- caches/read models refresh from committed revision;
- fresh Bridge verification runs;
- L4 decides current operational state.

Recovery Evidence converted to finalized historical Segments in staging is history only and does not make the Context live.

**Settled**

---

# 36. Restore Activity / Provenance Summary

Successful restore/import may record a non-authoritative Activity event containing only safe operation metadata, for example:

```text
mode
schema/version
addedCount
duplicateCount
conflictResolvedCount
replacedCount
completedAtMs
```

Do not copy uploaded customer descriptions/full file contents into diagnostics/activity.

**Settled**

---

# 37. History CSV Purpose

History CSV is the portable compatible timer-history round-trip format.

It is not a live runtime backup, not the preferred full application disaster backup, and not the human summary Time Report format.

**Settled**

---

# 38. Canonical History CSV Records

Record types:

```text
SEGMENT
LEGACY_BALANCE
```

SEGMENT supports logically:

```text
schema_version
record_type
context_id
context_kind
project_id
context_label
segment_id
session_id
cycle_id
start_at_iso
end_at_iso
duration_ms
local_date
workday_zone
start_cause
end_reason
source
certainty
provenance
```

LEGACY_BALANCE supports Context identity, `legacy_unattributed_ms`, and lineage/provenance.

Canonical timestamps must be unambiguous/offset-aware. Canonical duration must agree with valid timestamps.

**Settled**

---

# 39. v0.7 History CSV Compatibility

Importer continues to recognize safely interpretable:

```text
squarecoil-job-timer-csv-v1
```

Legacy adapter:

- parses audited legacy fields;
- normalizes Context identity;
- applies L2 legacy timestamp/duration precedence;
- derives legacy-unattributed balance where old aggregate exceeds surviving dated history;
- never restores old live state;
- never invents dates.

Unsafe legacy rows are reported, not guessed.

**Settled**

---

# 40. History CSV Export Snapshot

Export uses one consistent committed snapshot.

It exports finalized authoritative Segments and legacy balances.

Current unfinalized Active contribution is not emitted as a finalized SEGMENT. Full Backup Recovery Evidence is the disaster-recovery path for evidence-backed in-progress time.

**Settled**

---

# 41. History CSV Import Pipeline

```text
File
-> CSV parser
-> schema/header identification
-> row validation
-> legacy adapter when applicable
-> Context normalization
-> dedupe
-> temporal-overlap analysis
-> conflict analysis
-> staged summary
-> Data Mutation Lock
-> recheck
-> atomic merge commit
```

Never write rows one-by-one directly to authoritative storage.

**Settled**

---

# 42. Malformed / Reviewed Partial CSV Import

Default behavior is all-valid-or-explicit-review.

Staging reports:

```text
validRows
invalidRows
conflictRows
duplicateRows
```

Invalid rows are never silently skipped while reporting full success.

If reviewed partial import is implemented, the user must explicitly select/approve the exact excluded invalid/conflict rows. The resulting approved subset is then revalidated for overlap/invariants and committed atomically.

**Settled**

---

# 43. Duplicate CSV Import

Importing the same History CSV twice cannot double recorded time.

Dedupe uses stable IDs, deterministic interval fingerprint, and legacy-balance lineage.

A second import may validly report:

```text
0 added
N duplicates
```

**Settled**

---

# 44. Imported Workspace State

History CSV imports history only.

Imported Contexts may become known in Context Index for history access but do not automatically become Recent/visible/Active/Pending/Local Paused.

They may later enter workspace explicitly or when SquareCoil observes them.

**Settled**

---

# 45. Time Report CSV Purpose

Time Report CSV is human-readable reporting and is never accepted as a restore/import format.

Default mode is daily Context summary.

**Settled**

---

# 46. Time Report Summary

Default columns support conceptually:

```text
Date
Job Number
Job / Context Name
Context Type
Daily Recorded Hours
Overall Job / Context Hours as of export
Status / Provisional flag when applicable
As Of
```

Rules:

- Job Number blank for General Contexts;
- daily attribution comes from L2;
- legacy-unattributed time never creates fake daily rows;
- Overall Total may include legacy balance and valid current contribution;
- a current Context with positive current contribution receives a current-date row even if it has no finalized Segment yet;
- affected current/provisional snapshot values are marked provisional;
- export/as-of timestamp is included.

**Settled**

---

# 47. Optional Detailed Time Report

Detailed mode may expose logical-session rows with Context, start/end, duration, startCause, endReason, and useful provenance.

Cross-midnight logical sessions may be shown as one session with daily-allocation detail.

Detailed report remains reporting-only.

**Settled optional mode**

---

# 48. CSV Precision

CSV derives from integer-millisecond source precision.

Human decimal hours are formatting only. History CSV round trip uses canonical timestamps/`duration_ms`, not rounded display hours when canonical fields exist.

Repeated export/import must not progressively change time.

**Settled**

---

# 49. Spreadsheet Formula-Injection Safety

All user-controlled textual CSV cells are treated as untrusted, including labels, aliases, names, and free-form provenance text.

CSV export:

- uses RFC-compatible quoting/escaping;
- applies one documented spreadsheet-safe text escaping convention to formula-triggering leading characters such as `=`, `+`, `-`, and `@`;
- never intentionally emits user text as executable spreadsheet formula content.

History CSV import reverses only the exporter's own identifiable escape convention. It never evaluates arbitrary formulas/scripts.

Security escaping must not change Context identity or source stored label values.

**Settled**

---

# 50. File Size / Resource Safety

Parsers may enforce file size, nesting, row-count-per-operation, and field-length limits.

These are processing limits, never retention caps.

If a valid dataset exceeds one-operation capacity, reject clearly or use a supported streamed/chunked staging design. Never truncate and claim complete success.

**Settled**

---

# 51. Export Failure

Serialization/download-preparation failure leaves stored data unchanged.

No partial file is presented as a complete successful backup/report when completeness cannot be guaranteed.

Underlying persistence read failure is surfaced through lifecycle/data health; ordinary export failure alone does not stop timer health.

**Settled**

---

# 52. Destructive Confirmation Semantics

Confirmations must distinguish Companion data from SquareCoil official data.

## Delete Job Data

Identify target and state that its Companion-recorded history/time and target-specific Companion metadata will be permanently removed.

## Delete All Archived Data

State that all archived Companion Context data/time will be permanently removed.

## Wipe All Time History

State that all Companion-recorded time history will be removed while workspace Contexts may remain and SquareCoil official time is unaffected.

## Restore Replace

State that current restorable Companion data will be replaced by the selected validated backup.

## Use Incoming conflict correction

State that the specific existing Companion historical record will be replaced by incoming data.

**Settled**

---

# 53. Pre-Destructive Backup Opportunity

Before these global high-impact operations, offer a clear Full Backup opportunity:

- Restore Replace;
- Delete All Archived Data;
- Wipe All Time History.

This is not a hidden automatic-backup promise. If backup creation fails, the UI cannot claim the destructive action is protected by a backup.

For one-Context Delete Job Data, a Full Backup shortcut may also be offered but is not required to complete the confirmation contract.

**Settled**

---

# 54. L6 Invariants

- **DATA-SAFE-01:** Clear Recent is workspace-only and never deletes/archives time.
- **DATA-SAFE-02:** Clear Recent destination is inactive/non-recent.
- **DATA-SAFE-03:** Archive/Restore Archive preserve authoritative history.
- **DATA-SAFE-04:** Protected Contexts cannot be ordinarily archived/cleared/deleted.
- **DATA-SAFE-05:** Bulk workspace moves commit their eligible set atomically.
- **DATA-SAFE-06:** Delete Job Data removes target time, identity metadata, provenance, and target-specific Activity remnants.
- **DATA-SAFE-07:** Wipe History never changes SquareCoil and never reconstructs wiped time from Activity.
- **DATA-SAFE-08:** No silent authoritative age/count pruning.
- **DATA-SAFE-09:** Full Backup contains durable restorable data, never live Timer State.
- **DATA-SAFE-10:** Safe evidence-backed unfinalized time is included as non-live Recovery Evidence when applicable.
- **DATA-SAFE-11:** Recovery Evidence may restore only through `lastVerifiedAtMs` and only as finalized historical time.
- **DATA-SAFE-12:** Restore/import validates and stages before commit.
- **DATA-SAFE-13:** Same backup/CSV imported twice cannot double stable history/balances.
- **DATA-SAFE-14:** Global attributed history cannot silently contain overlapping concurrent Context time.
- **DATA-SAFE-15:** Incoming data cannot overlap an unresolved live Active/Hold/recovery interval.
- **DATA-SAFE-16:** Hard stable-identity conflicts are not repaired by label guessing.
- **DATA-SAFE-17:** Legacy balances are never blindly added.
- **DATA-SAFE-18:** `Use Incoming` on an existing conflict is an explicit destructive correction.
- **DATA-SAFE-19:** Replace requires idle/quiescent safety and never restores live state.
- **DATA-SAFE-20:** Historical localDate/workday-zone attribution is never rewritten by current timezone preference restore.
- **DATA-SAFE-21:** Malformed/partial files cannot masquerade as full success.
- **DATA-SAFE-22:** History CSV never creates live state or workspace clutter by itself.
- **DATA-SAFE-23:** Time Report CSV is reporting-only.
- **DATA-SAFE-24:** CSV security escaping protects spreadsheet users without changing stored Context identity.
- **DATA-SAFE-25:** Processing limits can reject but never silently truncate authoritative data.

**All Settled**

---

# 55. Acceptance Scenarios

## D1 Archive inactive Context
A with 12h -> Archive; 12h remains, Total unchanged.

## D2 Archive protected Context
ACTIVE/PENDING/LOCAL_PAUSED/current A -> Archive unavailable/rejected.

## D3 Archive All
A/B eligible, C protected -> A/B commit together; C skipped; no partial eligible commit on storage failure.

## D4 Restore archived Context
Archive A -> Recent; time unchanged; no Resume/start side effect.

## D5 Clear Recent
Inactive A/B -> inactive/non-recent, not archived; history remains.

## D6 Clear Recent protected
Protected A skipped; eligible set clears atomically.

## D7 Delete inactive Context
Confirmed Delete A removes A time/identity/provenance and target-specific Activity remnants; B unchanged.

## D8 Delete target becomes current
Protection recheck rejects deletion.

## D9 Delete then later observe same job
Job is recreated zero-history and follows L4 new-context behavior.

## D10 Delete All Archived
All staged targets eligible -> all deleted atomically; non-archived untouched.

## D11 Delete All gains protected target
Operation re-stages/rejects; does not silently skip.

## D12 Wipe while ACTIVE
Blocked until quiescent.

## D13 Wipe while IDLE
Ledger/balances removed; workspace/preferences remain; Activity cannot reconstruct time.

## D14 Wipe with SquareCoil still on A
After commit, fresh verification evaluates A from a new post-wipe anchor; no pre-wipe time is recreated.

## D15 Activity prune
Pruning Activity changes no time totals/history.

## D16 Large Ledger
No old v0.7-style silent history cap.

## D17 Backup idle
Contains durable dataset/counts and no live Timer State.

## D18 Backup active
Contains stable finalized snapshot plus required non-live Recovery Evidence when safe unfinalized checkpoint evidence exists.

## D19 Recovery Evidence restore
Valid evidence from start to lastVerified converts only that interval to finalized recovery history; no Active state and no post-verification gap restored.

## D20 Recovery Evidence duplicate
Same session already finalized -> evidence adds zero duplicate time.

## D21 Backup record-count mismatch
Validation rejects likely truncated/corrupt payload; current data unchanged.

## D22 Malformed/unsupported backup
Rejected safely; no mutation.

## D23 Merge new history
Compatible records added; live Timer State untouched.

## D24 Merge same backup twice
Second merge adds zero duplicate stable history/balance.

## D25 Same Segment ID conflict
No silent sum/overwrite; conflict required.

## D26 Cross-Context historical overlap
Incoming Job B overlaps existing Job A interval -> `TEMPORAL_OVERLAP_CONFLICT`, no automatic commit.

## D27 Same-Context different-session overlap
Material overlap -> conflict unless proven duplicate representation.

## D28 Import overlaps current ACTIVE interval
Blocked/conflicted until live interval resolves; importer cannot create concurrent historical time.

## D29 Hard Context identity mismatch
Same stable contextId maps to different immutable project ID -> hard conflict, no label-based repair.

## D30 Same legacy balance lineage twice
No double balance.

## D31 Ambiguous legacy lineages
Conflict, not automatic addition.

## D32 Use Incoming conflict
Explicit destructive correction confirmation required; replacement revalidates overlap/invariants.

## D33 Merge while unrelated ACTIVE
May commit compatible non-overlapping history if live state is untouched and revalidation passes.

## D34 Replace while ACTIVE
Blocked.

## D35 Replace while IDLE
Validated core dataset replaces atomically; no live state restored.

## D36 Replace timezone
Backup valid zone becomes future-attribution default unless user chooses Keep Current; historical dates unchanged.

## D37 Merge timezone
Current zone wins unless explicit preference import; historical dates unchanged.

## D38 Workspace restore tries to archive current Context
Protected current accessibility wins; incompatible imported workspace state is skipped/reported.

## D39 Legacy v0.7 CSV
Safely interpretable rows adapt using L2 legacy rules; missing detail becomes legacy balance, not fake dates.

## D40 Canonical CSV ambiguous timestamp
Zone-less ambiguous canonical timestamp is invalid; no guessed local interpretation.

## D41 Canonical CSV timestamp/duration mismatch
Validation conflict; legacy precedence is not silently applied to current canonical schema.

## D42 History CSV imported twice
Second import adds no duplicate time.

## D43 Malformed CSV row
Reported in staging; no silent partial success.

## D44 Reviewed partial CSV
User explicitly excludes identified bad rows; remaining subset is revalidated and atomically committed.

## D45 Imported Context workspace
History becomes accessible but no automatic Recent/tab/live state.

## D46 Time Report daily summary
Includes Job and General Context daily attribution; legacy balance creates no fake dated row.

## D47 Active current report row
Current contribution may create today's report row with As Of and provisional status where applicable.

## D48 History CSV active session
Unfinalized Active session is not exported as finalized SEGMENT.

## D49 Spreadsheet-dangerous label
`=SUM(...)` or similar user text exports spreadsheet-safe and is never executed by Companion.

## D50 Oversized file
Reject or supported streamed staging; never truncate and claim success.

## D51 Export failure
Stored data unchanged; incomplete artifact not called complete.

## D52 Pre-destructive backup opportunity
Before Replace/Wipe/Delete-All-Archived, user can create Full Backup; protection is claimed only if backup succeeds.

---

# 56. Continuity States After L6

## Settled

- Clear Recent -> inactive/non-recent;
- Archive and restore preserve time;
- protected-target revalidation;
- atomic eligible bulk workspace operations;
- exact single/bulk deletion scope including target Activity redaction;
- Wipe scope and post-wipe fresh anchor behavior;
- independent bounded Activity retention;
- no silent authoritative compaction;
- Full Backup envelope/count integrity/live exclusions;
- required-if-applicable non-live Recovery Evidence and exact historical reconciliation;
- staged untrusted-file pipeline;
- Merge vs Replace;
- Workday Time Zone restore policy;
- workspace import protection;
- Activity behavior under Replace;
- stable dedupe;
- global temporal-overlap validation including live interval overlap;
- hard Context identity conflict handling;
- legacy balance lineage rules;
- destructive `Use Incoming` corrections;
- atomic failure behavior;
- non-live post-restore state;
- canonical History CSV and v0.7 compatibility;
- reviewed-partial import semantics;
- Time Report current/provisional reporting;
- CSV precision/formula safety;
- file processing limits;
- destructive confirmation and backup opportunity.

## Provisional

- exact JSON property names;
- exact safety size/row/string limits;
- exact Activity retention age/count;
- exact conflict UI layout for large sets;
- exact spreadsheet-safe escape marker;
- optional backup payload-digest algorithm/canonicalization;
- exact report filename/column formatting;
- whether optional Activity Log is included in Full Backup by default.

## Open for later stages

- Settings navigation into Archives & Backup (L7);
- final destructive/dialog microcopy (L7);
- support diagnostics for import/restore failures (L7/L8);
- concrete storage transaction strategy (build);
- automated overlap/backup/CSV/corruption fixtures (L8/build).

## Blocked

None.

---

# 57. L6 Readiness Judgment

**Status: Settled - ready for L7**

L6 now defines workspace cleanup, archive, destructive operations, disaster backup, recovery evidence, restore conflict/overlap safety, History CSV, and Time Report strongly enough that implementation should not need to invent data-loss or import semantics.

Next stage:

**L7: Settings, Themes, Support, and Developer Support**
