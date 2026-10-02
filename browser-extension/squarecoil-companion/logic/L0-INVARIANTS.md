# SquareCoil Companion Rebuild
## Logic Stage L0: Vocabulary, Invariants, and Compatibility Baseline

**Status:** Settled  
**Logic stage:** L0  
**Framework authority:** `docs/REBUILD-MASTER-PLAN.md`  
**Planning branch:** `planning/squarecoil-companion-rebuild`  
**Production baseline:** v0.7.1 on `main`  
**Purpose:** Lock canonical meanings and non-negotiable behavior before lifecycle, state, time, Bridge, UI, or implementation details.

---

# 1. Scope

L0 defines product vocabulary and invariants. It does not prescribe source files, persistence technology, UI styling, or implementation mechanics.

Every later stage must preserve L0 unless a direct contradiction is deliberately reopened and documented.

---

# 2. Canonical Vocabulary

## 2.1 SquareCoil Authoritative Clock

SquareCoil is authoritative for actual company clock/context state.

The Companion may observe and interpret SquareCoil. It must not invent or silently mutate company clock state.

A Companion Local Pause does not modify SquareCoil.

## 2.2 Companion

The Companion is the extension's local timer/history/workspace system.

Companion-recorded hours are useful local history, not official payroll/company time.

User-facing wording should favor concepts such as:

- Recorded Today;
- Job Total / Context Total;
- Companion time.

## 2.3 Context

A Context is one logical work target tracked by the Companion.

A Context is either:

- **Job Context**: recognized SquareCoil project/job, normally stable by project ID;
- **General Context**: recognized non-numbered SquareCoil work context, including `Production (General)`.

## 2.4 Selected Context

The Context currently being viewed in Companion UI.

Selection alone:

- does not clock into SquareCoil;
- does not start Companion accrual;
- does not pause another Context;
- does not change the company clock.

## 2.5 Observed Context

The Context currently supported by SquareCoil observation/verification.

Observed does not necessarily mean accruing. It may be Pending or Local Paused.

## 2.6 Active Companion Context

The single Context currently accruing Companion time.

There may be at most one Active Companion Context in one Companion data scope/browser profile.

This rule applies across tabs/windows in that scope. It does not imply cross-device synchronization.

## 2.7 Pending / Resume Context

A positively observed remembered Context waiting for a user decision about how to continue tracking.

Typical actions:

- Resume;
- Start Fresh.

Pending accrues no time until a valid later transition commits.

Pending is not Local Pause.

## 2.8 Start Fresh

Starts a new tracking **cycle** for the valid current observed Context.

Start Fresh preserves:

- prior Ledger history;
- prior Job/Context Total;
- legacy-unattributed balance.

It is not a history reset.

## 2.9 Local Pause

Stops Companion accrual for the active Context while leaving SquareCoil unchanged.

Resume from Local Pause requires current SquareCoil compatibility.

Generic presentation text such as `Paused` must not collapse Pending, Local Pause, clocked out, and inactive history into one logic state.

## 2.10 Current Session

The in-progress accrual interval for the Active Context.

It contributes to live Today/Total but must not be double-counted as completed history.

## 2.11 Historical Session / Ledger Segment

A finalized Companion-recorded interval retaining enough evidence for:

- Context identity;
- start/end;
- duration;
- date attribution;
- reason/provenance;
- certainty where useful.

## 2.12 Time Ledger

The canonical local authority for completed Companion-recorded time.

Together with one valid current-running contribution, it drives:

- Today;
- daily/weekly totals;
- Job/Context Total;
- Time Overview;
- History;
- archive totals;
- backups;
- reporting.

Features must not invent competing elapsed totals.

## 2.13 Today

Time attributed to a Context inside the current logical Workday date plus the valid current contribution belonging to that date.

Detailed Workday/timezone rules are owned by L2.

## 2.14 Job Total / Context Total

All retained authoritative Companion time for a Context plus one valid current-running contribution when applicable.

A numbered job uses `Job Total`; a General Context uses `Context Total`.

These are not official payroll totals.

## 2.15 Recent

Workspace membership answering: which Contexts should be convenient now?

Recent is not the historical database.

Removing a Context from Recent does not delete its Ledger time.

## 2.16 Archived

A history-preserving workspace state.

Archive preserves:

- Context identity;
- Ledger history;
- daily history;
- Job/Context Total;
- restorable records.

Archive is not Delete.

## 2.17 Clear Recent

Workspace cleanup that removes eligible inactive Contexts from Recent.

It must preserve authoritative time.

Final destination is settled by L6 as `INACTIVE_NON_RECENT`, not automatic Archive.

## 2.18 Delete Job Data

An explicitly destructive operation that removes the applicable Companion-owned Context data/time under L6 rules.

It must remain distinct from Hide, Clear Recent, and Archive.

## 2.19 Wipe All Time History

System-level destructive removal of Companion-recorded authoritative time.

It must never occur as a side effect of ordinary housekeeping.

## 2.20 Activity Log

Non-authoritative application/event history.

Activity may have bounded retention. Activity pruning never changes Today, Total, History, or Ledger truth.

## 2.21 Full Backup

Versioned machine-oriented disaster-recovery data.

It must restore durable history/workspace/preferences where supported while excluding volatile live claims.

A restored file cannot directly assert Active/Pending/company-clock state.

## 2.22 History CSV

Portable compatible timer-history round-trip format.

It is not the primary full-fidelity disaster backup and cannot restore live runtime state.

## 2.23 Time Report CSV

Human-readable reporting export.

It is not a runtime/history restore format.

## 2.24 Runtime State

Temporary operational information needed to run the Companion now, such as lifecycle state, current session, open routes, health, transient observers.

Runtime State is not automatically historical/restorable truth.

## 2.25 Recovery Checkpoint

Durable interruption evidence used to recover safely after crash/reload/page loss.

A checkpoint may identify prior Context/session and last safe verification, but it is **not a live clock claim**.

Recovery must freshly verify SquareCoil and may not invent uncertain elapsed time.

## 2.26 Restorable Historical State

Durable data that can survive restart, upgrade, backup/restore, or migration without becoming unverified live state.

---

# 3. Non-Negotiable Invariants

## INV-01 SquareCoil authority

The Companion cannot claim company-clocked state without current SquareCoil evidence.

## INV-02 One accruing Context

Zero or one Active Companion Context may accrue at any instant.

## INV-03 Selection is timing-neutral

Browsing/selecting/opening a saved Context creates no time by itself.

## INV-04 No fabricated missed time

If the true start is unknown, use a supported observation/detection boundary. Never silently backfill an invented earlier start.

## INV-05 One canonical time path

Main Timer, Recent, Archives, Overview, History, Backup, and reporting query the same Ledger/time semantics.

## INV-06 No silent authoritative pruning

Authoritative time cannot disappear because an array/list reaches a count/age cap.

Legacy v0.7 session/archive caps are not rebuild retention rules.

## INV-07 Ordinary housekeeping preserves time

Hide, Clear Recent, and Archive do not silently destroy recorded hours.

## INV-08 Archive preserves time

Archive changes workspace organization, not historical elapsed truth.

## INV-09 Restore cannot fabricate live state

Backup/CSV restore may restore history but not Active/Pending/company-clock truth solely from file contents.

## INV-10 Local Pause is local

Local Pause never clocks out of SquareCoil.

## INV-11 Resume requires current SquareCoil compatibility

A paused/historical Context cannot resume merely because it is selected.

## INV-12 Same job remains same job

A label/department change inside the same stable project ID does not create a new Job Context or reset Total.

## INV-13 Current contribution counted once

The live contribution may appear in Today/Total but cannot simultaneously exist as completed history for the same interval.

## INV-14 Precision is separate from display rounding

Formatting/export rounding never mutates source Ledger precision.

## INV-15 Migration is non-destructive and idempotent

Repeated migration evaluation cannot duplicate hours/Contexts, and unsafe legacy data is surfaced rather than guessed.

## INV-16 Legacy totals cannot fabricate dated history

A trusted old accumulated balance may be preserved when detailed sessions were previously lost, but missing dates/timestamps are never invented to explain it.

L2 represents this as `legacyUnattributedMs`.

## INV-17 Cross-tab behavior cannot duplicate accrual

Multiple SquareCoil tabs share one logical accrual model and cannot double-record the same interval.

L2 settles single-writer/fencing mechanics.

## INV-18 Selected must not impersonate Active

The user may inspect B while A runs, but B must never appear to be the accruing Context.

## INV-19 Presentation failure cannot become timer failure

Website Theme, Timer Appearance, Glass/Solid, logo, Support, and Developer Support do not own timer health.

## INV-20 Browser parity is behavioral

Chrome and Edge share the same time/state/history rules. Platform adapters may normalize mechanics only.

## INV-21 Companion time is informational local history

UI must not imply Companion totals replace official SquareCoil/payroll records.

## INV-22 Backup/report purposes stay distinct

Full Backup JSON, History CSV, and Time Report CSV have separate purposes and must not be forced into one unsafe format.

---

# 4. Compatibility Baseline

## 4.1 Must preserve

- SquareCoil authority;
- one logical Companion active timing Context;
- Job + Production General support;
- no invented start time on discovered work;
- full clock-out stops accrual;
- remembered Context Resume / Start Fresh;
- tab selection has no clock side effects;
- active/pending/paused protection from ordinary housekeeping;
- Recent tabs and persistent order;
- ordinary same-Context verification does not reopen manual collapse;
- configurable timer thresholds;
- Local Pause leaves SquareCoil unchanged;
- Resume constrained by current SquareCoil;
- Recent / History / Activity / Archive concepts;
- compatible CSV history;
- Open Job for recognized project IDs;
- Timer Light/Dark/Auto, first-install Light;
- Panel Solid/Glass, first-install Solid;
- Website Original/Refined Light/Sleek Dark, first-install Original;
- custom dark logo only until approved light asset exists;
- safe migration of existing saved data.

## 4.2 Must not preserve as requirements

- multiple scripts patching Settings;
- multiple Timer State writers;
- root existence as health proof;
- one-shot boot;
- missing teardown ownership;
- silent session/archive caps;
- internal module version drift;
- package parsing treated as interaction acceptance;
- normal UI construction through MutationObserver patch races;
- file restore writing volatile live claims;
- Chrome/Edge behavior forks without proven platform need.

---

# 5. Later-Stage Resolutions Referenced by L0

The questions intentionally deferred at L0 are settled downstream:

- lifecycle/READY/recovery: L1;
- Workday Zone, day/week boundaries, Ledger, cross-tab ownership, migration: L2;
- SquareCoil evidence/Context normalization: L3;
- Pause/Resume/Pending/Start Fresh/unknown-state behavior: L4;
- Selected-vs-Operational presentation and time views: L5;
- Clear Recent destination, Archive/Delete/Backup/CSV: L6;
- final secondary Settings/support/theme behavior: L7;
- acceptance/release/handoff: L8.

---

# 6. L0 Readiness Judgment

**Status: Settled**

No implementation may redefine these terms or invariants locally. Any discovered contradiction must be escalated through the L8 contradiction rule rather than worked around silently.
