# SquareCoil Companion Logic Delta Handoff

**Status:** Ready for targeted Logic reconciliation  
**Branch:** `proto/squirel-coil-plugin`  
**Framework source:** `docs/FEATURE-MINE-RECONCILIATION.md`  
**Existing logic authority:** `logic/L0-INVARIANTS.md` through `logic/L8-ACCEPTANCE-HANDOFF.md`  
**Purpose:** reconcile newly mined legacy feature parity with the existing settled logic package without restarting or casually rewriting already-settled core behavior.

---

# 1. Direct Handoff

Do **not** restart Logic at L0.

The new feature mine did not invalidate the core state/lifecycle/bridge/data architecture.

The required Logic work is a bounded delta review concentrated in:

```text
L5  Time Views / Workspace
L8  Acceptance / Handoff
```

L7 is reopened only if an optional historical visual pack is activated for a target release.

---

# 2. Existing Logic Presumed Stable

Unless the delta review discovers a genuine contradiction, preserve:

- L0 vocabulary/invariants;
- L1 lifecycle and recovery;
- L2 state/ledger/migration model;
- L3 read-only SquareCoil Bridge model;
- L4 core Timer behavior;
- L6 data safety/backup semantics.

Do not use the feature mine as a reason to rewrite these layers for aesthetic or historical-parity reasons.

---

# 3. Required Delta A - Visible Tab Time Parity

Historical Timer v1.0.2 explicitly displayed a live elapsed value in each visible Job tab.

The framework now classifies this as required core parity.

Logic must reconcile this with the canonical L5 read model.

## Logic must define

- which canonical time quantity is shown in a Job tab;
- how active current contribution is represented without creating a second clock calculation;
- how inactive tab values remain stable;
- how provisional / Safety Hold contribution is represented when the displayed value includes it;
- how cross-tab snapshots keep tab values consistent with Main/Recent/Overview;
- how update cadence avoids stale/conflicting values while remaining presentation-only.

## Logic must preserve

- tab selection has no timing side effect;
- tab display never owns Timer State;
- one canonical read model remains the source of truth;
- large historical storage is not reparsed independently by every tab.

## Output recommendation

Amend L5 with a small versioned section or companion delta file rather than rewriting unrelated L5 behavior.

---

# 4. Required Delta B - Threshold Accent in Tabs

Historical Timer UI used per-job time thresholds directly in visible tab presentation.

Existing L5 already separates threshold level from operational status. The delta must make tab usage explicit.

## Logic must define

- tab threshold source from canonical Today/threshold read state;
- coexistence of threshold accent with Running/Pending/Local Pause/Verification Hold meaning;
- behavior when thresholds are changed in Settings;
- behavior when the tab's displayed time is provisional or held;
- fallback when semantic/accessibility presentation cannot rely on color alone.

## Logic must preserve

```text
threshold level != operational status
```

A red threshold tab is not automatically Running, overdue, failed, or dangerous.

---

# 5. Required Delta C - Current-Focus Intent Coverage

Existing L5 already permits real native Context changes to request incoming focus/expand.

The prototype currently demonstrates direct non-null A -> B focus behavior, while null clock-out -> later B remains an implementation/contract edge.

Logic should verify the existing contract covers all structurally valid transition shapes without turning selection into Timer authority.

## Review transition families

```text
A -> B
A -> none
none -> B
A -> none -> B
same A -> metadata/verification A
```

The output should make clear which transitions may create **UI focus intent** and which are merely Timer/Bridge reconciliation.

Do not couple focus to every verification heartbeat.

---

# 6. Required Delta D - L8 Acceptance Coverage

L8 should gain explicit acceptance families for the newly surfaced required parity.

At minimum, acceptance architecture should cover:

- visible tab identity + authoritative elapsed summary;
- active tab value and Main view agreeing from one revision/read model;
- inactive tab values not running independently;
- threshold accent derived from canonical threshold state;
- threshold meaning remaining separate from operational status;
- reorder/select/hide actions not mutating timing;
- real Context changes generating valid focus intent;
- heartbeat/metadata updates not stealing focus or expanding a manually collapsed timer;
- cross-tab view consistency;
- real installed-browser interaction acceptance for tab controls.

Exact pass/fail runtime conditions remain L8 ownership.

---

# 7. Optional Delta - Cinematic Background

Only perform this Logic work if the optional visual pack is activated for a target release.

Framework placement:

```text
Preferences / Page Context
        ↓
Theme Service
        ↓
Optional Cinematic Background Profile
```

It is not part of Timer State, SquareCoil Bridge, or required core theme semantics.

Logic would need to define:

- effective/fallback state;
- background-source failure behavior;
- cache/refresh behavior;
- reduced-motion behavior;
- interaction with accessibility/high-contrast/reduced-transparency modes;
- teardown/reapplication ownership;
- whether offline/no-network state reuses cache or falls back to none.

The core release must remain valid without this delta.

---

# 8. Optional Delta - Design Dashboard Presentation Profile

Only perform this Logic work if the page-specific visual profile is activated for a target release.

Historical source was scoped to:

```text
/dashboard.php?show=2
```

Framework boundary:

- presentation only;
- no Design Request business-state ownership;
- no replacement of SquareCoil actions;
- no Timer State ownership;
- failure falls back to base website theme/native presentation.

Logic should define page eligibility/reapplication/failure behavior only. Final CSS/layout remains implementation/design work.

---

# 9. Logic Delta Exit Gate

Use one of these outcomes after review:

- **Logic delta settled - canonical B2/B3 work may continue**
- **Logic delta settled - optional presentation deferred**
- **Logic delta requires amendment to an earlier owning stage**
- **Logic delta blocked by a newly discovered structural contradiction**

A delta is not settled merely because prototype UI appears to work.

---

# 10. Structural Boundary Reminder

Framework owns:

- that live tab time is a required parity concept;
- that threshold accent belongs to presentation;
- that current-focus intent belongs between Bridge/Timer truth and UI selection;
- that cinematic/dashboard systems are optional presentation profiles;
- that these profiles cannot own Timer health.

Logic owns:

- exact conditions;
- transitions;
- fallback behavior;
- failure/recovery behavior;
- behavior-level acceptance criteria.

Implementation owns:

- DOM strategy;
- event wiring;
- refresh mechanics;
- CSS;
- animation implementation;
- packaging code.

---

# 11. Readiness

**Ready for targeted Logic reconciliation.**

No core structural question remains that would force Logic to invent scope, ownership, or module boundaries.