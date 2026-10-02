# SquareCoil Companion Rebuild
## B4 Data Safety Behavior-Readiness Audit

**Status:** Settled — implementation-ready at the behavior layer  
**Scope:** legacy archive/CSV/workspace behavior versus settled L6  
**Active branch:** `proto/squirel-coil-plugin`  
**Depends on:** L2-L6, L8, B2-C completion logic  
**Purpose:** verify that downstream B4 implementation does not need to invent archive, restore, backup, import/export, or destructive-data behavior.

---

# 1. Direct Assessment

The legacy Chrome workspace contained real archive, restore, Clear Recent, delete, wipe, Activity Log, and CSV import/export functions. The settled L6 contract already captures those product intents and deliberately replaces the unsafe legacy data semantics where necessary.

Result:

```text
B4 behavior specification = READY
legacy parity intent       = ACCOUNTED FOR
current prototype B4       = NOT IMPLEMENTED / intentionally locked
new Logic required         = NO
```

No mined legacy data feature requires a new behavior contract before B4 implementation.

**Settled**

---

# 2. Actual Sources Reviewed

This audit is grounded in:

```text
page/timer-workspace.js
logic/L6-DATA-SAFETY-BACKUP.md
src/data/migration.js
src/data/migration-command.js
src/timer/read-model.js
src/ui/workspace-ui.js
```

The legacy workspace directly mutated v0.7 localStorage state/archive records. L6 must therefore be treated as the behavior authority, while the old code remains feature/UX evidence only.

**Settled**

---

# 3. Legacy Feature Parity Map

| Legacy capability | L6 disposition | Result |
|---|---|---|
| Archive one inactive Job | History-preserving Archive | Accounted for |
| Archive all eligible inactive Jobs | Atomic Archive Eligible in Bulk | Accounted for |
| Archive browser | Archive Browser | Accounted for |
| Restore archived Job | Archived -> Recent, time preserved | Accounted for |
| Delete archived Job | Delete Archived Job Data | Accounted for |
| Clear Recent | Rebuilt as workspace-only cleanup | Accounted for, legacy semantics intentionally superseded |
| Delete Recent Job | Rebuilt as explicit Delete Job Data | Accounted for, stronger safety |
| Wipe recorded timer history | Wipe All Time History | Accounted for, exact scope clarified |
| Activity Log | Bounded non-authoritative Activity Log | Accounted for |
| CSV export | History CSV + Time Report CSV | Accounted for and separated by purpose |
| CSV import | Staged validated History CSV Import | Accounted for, safer pipeline |
| Legacy archive/history reconciliation | Restore/import dedupe + conflict analysis | Accounted for |
| Legacy v0.7 CSV | Explicit compatibility adapter | Accounted for |

**Settled**

---

# 4. Important Legacy Semantics That Must NOT Survive

The old implementation contained several behaviors that are intentionally not parity requirements.

## 4.1 Legacy Clear Recent was destructive

The old workspace removed inactive Context records from the current state and warned that timer history would be removed unless archived/exported first.

Canonical L6 instead settles:

```text
Clear Recent = WORKSPACE_ONLY
```

It removes eligible inactive Contexts from Recent/tabs while preserving Ledger time, Total, and historical discoverability.

**L6 wins**

## 4.2 Legacy archive duplicated time-bearing Context objects

The old archive copied Context records, accumulated totals, and session arrays into a separate archive store, then removed them from the active state.

Canonical L6 instead treats Archive as workspace metadata over the common authoritative Ledger.

```text
Archive != second time store
```

No separate archive copy may become another time authority.

**L6 wins**

## 4.3 Legacy restore used max-total/session merging

The old restore path could merge archived/current state through rules such as taking the maximum accumulated total and merging session arrays.

Canonical L6 requires stable identity dedupe, interval overlap/conflict analysis, staged planning, revalidation, and one authoritative transaction.

No implementation may use `max(total)` as a substitute for historical reconciliation.

**L6 wins**

## 4.4 Legacy authoritative history had fixed retention caps

The old workspace capped archived records and legacy session arrays for practicality.

Canonical L6 explicitly forbids silent authoritative Ledger pruning/compaction merely to satisfy a count limit.

Activity may be bounded; authoritative time may not silently disappear.

**L6 wins**

## 4.5 Legacy CSV wrote directly into old state semantics

Canonical CSV Import is not a direct object-copy path. It is:

```text
parse
-> validate schema
-> adapt supported legacy format
-> invariant validation
-> dedupe
-> temporal-overlap analysis
-> conflict analysis
-> staged plan
-> mutation lock
-> protection/revision recheck
-> atomic commit
```

**L6 wins**

---

# 5. Archive Behavior Is Complete

L6 explicitly defines:

- Archive one;
- Archive eligible in bulk;
- protected-target behavior;
- archive metadata;
- archive browser ordering;
- Restore to Recent;
- preservation of Ledger and legacy-unattributed balance;
- interaction with L5 soft tab capacity;
- current SquareCoil Context overriding stale archive workspace state.

No core Archive behavior remains ambiguous.

**Implementation-ready**

---

# 6. Clear Recent vs Archive vs Delete Is Complete

The rebuild now has three non-interchangeable intents:

```text
Clear Recent -> workspace cleanup, history preserved
Archive      -> history-preserving workspace move
Delete Data  -> permanent Companion-owned data removal
```

This resolves the largest semantic problem in the legacy workspace.

No downstream implementation may label a destructive operation as Clear Recent.

**Implementation-ready**

---

# 7. Delete / Wipe Scope Is Complete

L6 defines exact destructive scope for:

- Delete Job Data;
- Delete Archived Job Data;
- Delete All Archived Data;
- Wipe All Time History.

It also defines:

- protected target rechecks;
- quiescence requirements where necessary;
- Activity redaction/removal behavior;
- preservation of unrelated preferences/Context organization where appropriate;
- fresh SquareCoil verification after destructive history reset.

No core deletion behavior remains to be guessed.

**Implementation-ready**

---

# 8. Full Backup / Restore Is Complete

Full Backup JSON is intentionally new relative to the old CSV-centric system.

L6 settles:

```text
versioned backup envelope
stable snapshot revision
record counts
contexts
Ledger
legacy balances
workspace
preferences
migration metadata
optional Activity
non-live Recovery Evidence
integrity metadata
```

Restore explicitly excludes live Timer/Bridge/lease state and supports:

```text
MERGE
REPLACE
```

with conflict/overlap analysis and atomic commit.

No file can assert that the user is currently ACTIVE/PENDING/LOCAL_PAUSED.

**Implementation-ready**

---

# 9. Recovery Evidence Is Complete

L6 and L2 together define how verified interruption evidence may survive backup/restore without fabricating live state.

Only the evidence-backed interval through `lastVerifiedAtMs` may become finalized historical recovery time after validation/dedupe/overlap analysis.

Unknown time after that boundary is never invented.

**Implementation-ready**

---

# 10. CSV Product Split Is Complete

The rebuild has two distinct CSV purposes:

```text
History CSV
  portable detailed historical data
  supports validated import

Time Report CSV
  human/reporting export
  not a restore authority
```

This prevents a report from accidentally becoming an import format merely because both are CSV.

Legacy v0.7 CSV remains supported only through an explicit compatibility adapter using L2 legacy precedence.

**Implementation-ready**

---

# 11. External-Data Safety Is Complete

L6 already defines behavior for:

- malformed files;
- unsupported schema;
- duplicate segment/session identities;
- same-ID material conflicts;
- temporal overlaps;
- overlap with current ACTIVE/recovery intervals;
- large-file structural limits;
- stale staged plans;
- spreadsheet formula injection;
- atomic failure with no partial success.

No missing failure/recovery rule was found during this audit.

**Implementation-ready**

---

# 12. Mutation Concurrency Is Complete

All authoritative historical mutations run through one Data Mutation Lock coordinated with the fenced L2 writer.

This prevents independent Archive/Import/Delete/Restore features from becoming competing data authorities.

A staged plan must revalidate the facts it depends on before commit; stale plans are rejected rather than guessed forward.

**Implementation-ready**

---

# 13. Active-Timer Compatibility Is Complete

L6 distinguishes operations that may run while another Context is ACTIVE from operations requiring global quiescence.

Historical merges must not overlap the live unfinalized interval, Safety-Hold interval, or unresolved recovery evidence.

Replace/Wipe and equivalent global destructive operations require the settled quiescence conditions.

**Implementation-ready**

---

# 14. Current Prototype Status

The current Workspace Settings page deliberately states that Archive, Delete, CSV restore/export, and full-history wipe are locked until the mutation safety layer is connected.

That is the correct prototype behavior.

The absence of callable destructive controls is not a Logic gap; it is evidence that the prototype has not yet implemented B4.

**Current B4 implementation: not started / intentionally gated**

---

# 15. Acceptance Requirements

B4 implementation must prove the existing L6/L8 cases, including at minimum:

```text
Archive preserves all authoritative time
Bulk Archive commits atomically
Restore Archive never resumes timing
Clear Recent preserves history/Total
Protected delete/archive is rejected
Delete removes only exact target scope
Wipe requires safe quiescence and cannot become a pause mechanism
Backup uses one consistent revision
Files never restore live Timer State
Merge dedupes exact records
conflicting/overlapping records do not silently sum
Replace is destructive and strongly gated
Recovery Evidence never extends past lastVerifiedAtMs
legacy v0.7 CSV adapts without fabricated dates
report CSV cannot be imported as authority by accident
formula-like cells are export-safe
large/untrusted files fail without truncating into success
stale staged mutation plans cannot commit
mutation lock prevents concurrent authoritative data changes
```

No additional product decision is required to write those acceptance cases.

**Settled acceptance boundary**

---

# 16. Contradiction Check

No material contradiction was found between the mined legacy data-tool feature set and L6.

Where the old implementation differs, the difference is deliberate safety improvement rather than an unresolved product question.

The highest-risk differences are explicitly resolved:

```text
legacy destructive Clear Recent -> rebuilt non-destructive Clear Recent
legacy archive time copies       -> one common authoritative Ledger
legacy max-total restore          -> conflict-aware historical reconciliation
legacy bounded authoritative data -> no silent Ledger pruning
legacy direct CSV writes          -> staged validated mutation pipeline
```

**Settled**

---

# 17. Continuity State

### Settled

- all legacy archive/restore/delete/wipe/CSV product intents are represented;
- unsafe legacy semantics are explicitly superseded by L6;
- Full Backup / Merge / Replace / Recovery Evidence extend the product without contradicting legacy parity;
- B4 has complete behavior and failure/recovery contracts.

### Provisional

- exact file-size limits;
- exact digest/checksum algorithm;
- exact dialog layout/copy;
- exact storage-engine transaction mechanics;
- exact batching/progress UI for large files.

These are implementation/presentation policy, not behavior blockers.

### Open

None at the B4 behavior layer.

### Blocked

Canonical B4 acceptance is blocked on downstream implementation plus the staged B2/B3 dependencies, not missing Logic.

---

# 18. Logic Readiness Judgment

**B4 is implementation-ready at the behavior layer.**

No core Archive, Clear Recent, Delete, Wipe, Backup, Restore, CSV, conflict, or recovery behavior still has to be invented.

The next logic-owned checkpoint is B5 Settings/Themes/Support readiness only if a mined feature reveals a contradiction there. Otherwise Logic should not reopen settled L7 simply for completeness.