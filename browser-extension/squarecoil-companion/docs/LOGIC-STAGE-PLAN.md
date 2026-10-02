# SquareCoil Companion Logic Stage Plan

Status: **Ready to begin staged logic**  
Companion framework source: `docs/REBUILD-MASTER-PLAN.md`  
Purpose: hand the rebuild to Logic Systems Architect in small, reviewable stages so detailed behavior is not specified all at once and implementation does not start with unresolved state/failure rules.

---

## Operating Rule

Logic work should be staged, reviewed, and frozen before the corresponding implementation stage begins.

Do not ask Logic to specify the entire application in one pass.

Each stage should:

1. use the Master Plan as structural authority;
2. define behavior only inside that stage's scope;
3. list assumptions and unresolved questions;
4. identify contradictions with earlier stages;
5. end with an explicit readiness status;
6. avoid coding implementation details unless needed to clarify a contract;
7. produce a small reviewable file that becomes the authority for that behavior area.

Recommended statuses:

- Ready for next logic stage
- Ready for implementation of this stage
- Ready for limited implementation only
- Logic incomplete
- Logic blocked upstream

---

# Stage L0: Vocabulary, Invariants, and Compatibility Baseline

## Goal

Make sure every later stage uses the same definitions and preserves the intended v0.7.x behavior rather than accidentally preserving bugs.

## Define

- Job vs General context.
- SquareCoil authoritative clock.
- Companion active timer.
- Pending/Resume state.
- Recent vs Archived vs Deleted.
- Session vs accumulated/job total.
- Today vs current session vs Job Total.
- Historical time vs Activity Log.
- Full Backup vs History CSV vs Time Report CSV.
- Runtime state vs restorable history.

## Confirm invariants

- one actual Companion active context;
- tab selection does not clock into SquareCoil;
- SquareCoil company clock is never silently modified by Companion Pause;
- saved historical time cannot be silently pruned;
- restored data cannot claim a live SquareCoil state;
- one UI owner / one state writer;
- Chrome/Edge share one behavior model.

## Output

`logic/L0-INVARIANTS.md`

## Exit condition

Terminology and non-negotiable behavior are unambiguous enough that later stages will not redefine them.

---

# Stage L1: Application Lifecycle and Browser Boot

## Goal

Define what it means for the Companion to be healthy and recoverable.

## Specify

- UNINITIALIZED / BOOTING / READY / DEGRADED / RECOVERING / FAILED transitions;
- what must be true before READY is reported;
- duplicate-runtime prevention;
- stale-root handling;
- extension reload behavior;
- page navigation behavior;
- teardown requirements;
- retry limits and when recovery stops;
- user-visible degraded/failure feedback;
- interaction between isolated extension controller and MAIN-world application where required;
- Chrome/Edge parity expectations.

## Do not specify yet

- detailed timer state transitions;
- archive/CSV behavior;
- final UI styling.

## Output

`logic/L1-LIFECYCLE.md`

## Exit condition

A builder can implement boot, health, teardown, and recovery without inventing lifecycle rules.

---

# Stage L2: Timer State, Time Ledger, and Migration

## Goal

Define the authoritative data model before feature logic depends on it.

## Specify

### Timer State

- active context;
- pending context;
- selected context;
- current session;
- hidden/tab order working state.

### Time Ledger

- canonical session/segment fields;
- source/certainty semantics;
- completed vs running contribution;
- duplicate identity rules;
- historical retention;
- derived daily/job totals.

### Job Index

- job/context identity;
- labels/project IDs;
- Recent/Archive membership;
- last-used metadata.

### Time calculations

- local/timezone authority;
- day boundary;
- session crossing midnight;
- Today calculation;
- Job Total calculation;
- week calculation;
- stored precision vs display rounding.

### Migration

- current v0.7.x state import;
- current archive data import;
- current session caps/legacy gaps;
- duplicate legacy sessions;
- migration idempotency;
- migration failure behavior.

## Output

`logic/L2-STATE-TIME-MIGRATION.md`

## Exit condition

State/ledger queries and migrations can be implemented without individual features inventing their own totals.

---

# Stage L3: SquareCoil Bridge and Native Clock Interpretation

## Goal

Define how native SquareCoil observations become normalized Companion events.

## Specify

- known context detection sources;
- project/general parsing;
- native clock-out recognition;
- context switch recognition;
- action/header verification priority;
- stale/contradictory observations;
- exact vs detected certainty;
- same-project department changes;
- idle confirmation;
- unknown native state;
- when an observation may change Timer State;
- event ordering/deduplication.

## Output

`logic/L3-SQUARECOIL-BRIDGE.md`

## Exit condition

The Bridge can be implemented independently and tested against normalized events.

---

# Stage L4: Core Timer Behavior

## Goal

Define the user-facing timing transitions using L2 state and L3 SquareCoil events.

## Specify

- new job starts;
- remembered job detection;
- Resume vs Start Fresh;
- switching jobs;
- full clock-out;
- local Pause;
- local Resume;
- selected vs active context;
- hidden/visible active context;
- collapse/expand interaction with native context changes;
- thresholds/status states;
- exact conditions for destructive controls to be unavailable.

## Output

`logic/L4-TIMER-BEHAVIOR.md`

## Exit condition

The main timer can be implemented without Workspace code mutating timer JSON directly.

---

# Stage L5: Time Views, Recent Jobs, History, and Job Navigation

## Goal

Define how users see and navigate their work without changing the underlying time model.

## Specify

### Main view

- Today display;
- Job Total display;
- current status;
- optional current-session presentation;
- links/actions available by state.

### Time Overview

- Today total;
- This Week;
- Today by Job;
- By Day;
- By Job;
- job detail by date;
- empty states;
- large-history pagination/virtualization expectations at behavior level if needed.

### Recent Jobs

- View/Show;
- recent membership;
- Clear Recent;
- Archive;
- Delete distinctions;
- job status display.

### History

- session/history ordering;
- what data a user sees;
- relationship to Activity Log.

### Job Navigation

- Open Job;
- search-assisted lookup;
- invalid/missing job ID behavior.

## Output

`logic/L5-TIME-VIEWS-WORKSPACE.md`

## Exit condition

The UI router and feature services can expose consistent time values and navigation without inventing calculations.

---

# Stage L6: Archive, Housekeeping, Backup, Restore, and CSV

## Goal

Harden data safety before implementation of upload/import/delete features.

## Specify

### Archive/housekeeping

- archive one/all;
- Clear Recent;
- Delete Job Data;
- delete archived job;
- Wipe History;
- Activity retention;
- authoritative-time retention;
- future compaction rules if needed.

### Full Backup

- schema fields;
- exported metadata;
- included preferences;
- excluded volatile state;
- validation;
- compatibility/migration;
- corruption handling.

### Restore

- merge vs replace behavior;
- duplicate/conflict handling;
- sessions with same IDs;
- job identity conflicts;
- safe post-restore state;
- partial import failure behavior.

### History CSV

- compatible columns;
- round-trip semantics;
- malformed rows;
- duplicate rows;
- imported job state.

### Time Report CSV

- daily rows;
- Job Total column;
- date/time formatting;
- detailed vs summary mode if supported.

## Output

`logic/L6-DATA-SAFETY-BACKUP.md`

## Exit condition

A builder can implement file upload/download and housekeeping without risking silent historical-time destruction.

---

# Stage L7: Settings, Themes, Support, and Developer Support

## Goal

Define low-friction user interaction for secondary features after core timing/data behavior is stable.

## Specify

### Settings router

- navigation behavior;
- Back behavior;
- view persistence or reset behavior;
- disabled/unavailable states;
- keyboard/focus expectations;
- clear, concise empty/error states.

### Timer appearance

- Light/Dark/Auto;
- Solid/Glass;
- stored preference behavior;
- Auto response to system change.

### Website themes

- Original/Refined Light/Sleek Dark;
- dark logo switch/restore;
- presentation failure must not break timer behavior.

### Support

- ticket validation;
- feedback validation;
- email composition;
- Copy Diagnostics;
- diagnostic whitelist;
- failure when no mail handler is available;
- future transport boundary.

### Developer Support

- external-link behavior;
- Cash App QR/tag display;
- copy behavior;
- optional/free wording;
- no nag/tracking rules.

## Output

`logic/L7-SETTINGS-SUPPORT-THEMES.md`

## Exit condition

Secondary UX behavior is explicit without polluting core timer logic.

---

# Stage L8: Failure Behavior, Acceptance Criteria, and Implementation Handoff

## Goal

Tie the logic stages together and make implementation/build work safe and testable.

## Specify

- cross-module failure priorities;
- user-visible errors;
- safe degradation when SquareCoil bridge is unavailable;
- state persistence failure;
- migration/backup failure;
- theme failure isolation;
- support transport failure;
- acceptance criteria for every major feature;
- Chrome browser smoke requirements;
- Edge parity requirements;
- migration fixtures;
- backup fixtures;
- regression scenarios;
- exact implementation stage dependencies.

## Output

`logic/L8-ACCEPTANCE-HANDOFF.md`

## Exit condition

Framework + Logic are ready for staged implementation.

---

# Implementation Gate After Logic

Do not begin full implementation merely because L1 is complete.

All implementation stages also use `docs/EXECUTION-ENFORCEMENT-PLAN.md`. A later-stage change that touches an earlier ownership, lifecycle, storage, UI, or packaging boundary automatically reopens the affected regression evidence without granting permission to redesign the settled behavior.

Recommended implementation gating:

### Build Stage B1 can start after L0-L1

Scaffold, build tooling, lifecycle skeleton, browser boot tests.

### Build Stage B2 can start after L2-L4

State, migration, SquareCoil bridge, core timer.

### Build Stage B3 can start after L5

Time Overview, Recent, History, Job Navigation.

### Build Stage B4 can start after L6

Archive, housekeeping, backup, restore, CSV/reporting.

### Build Stage B5 can start after L7

Themes, Support, Developer Support.

### Chrome candidate can start after L8

Full smoke/acceptance, package, first Chrome upload candidate.

Edge parity follows using the same shared source and parity tests.

---

# Noise-Control Rules

To prevent the project from becoming too noisy:

1. One logic stage per review cycle.
2. Do not mix visual polish with state-machine specification.
3. Do not rewrite settled earlier stages unless a contradiction is found.
4. Put new unresolved questions under an explicit `Open Questions` heading instead of silently answering them.
5. Keep implementation ideas labeled as recommendations, not requirements, unless required by the architecture.
6. Freeze a logic stage once accepted and reference it by file.
7. Update `REBUILD-START-HERE.md` after each accepted stage.
8. Do not advance the Chrome package until the relevant acceptance gates are green.
9. Use targeted gates to debug one impact cluster; use the aggregate/full browser gate once to certify the completed candidate.
10. Treat a normal in-scope test failure as diagnostic work, not a new authorization boundary.
11. Pair recoverable fail-closed scenarios with an explicit repaired-cause recovery test.

---

# Logic Handoff Readiness

**Framework ready for logic**

Start with **L0**, not coding.

The Master Plan has settled the structure. These stages deliberately leave behavior detail to Logic Systems Architect while preventing it from having to invent core architecture.
