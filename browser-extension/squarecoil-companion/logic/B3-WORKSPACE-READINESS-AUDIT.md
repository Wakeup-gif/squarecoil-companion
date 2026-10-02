# SquareCoil Companion Rebuild
## B3 Workspace Behavior-Readiness Audit

**Status:** Accepted — exact candidate passed automated, Chrome, Edge, and CI gates
**Scope:** compare the active prototype Workspace/read model against settled L5 + L5A behavior  
**Active branch:** `proto/squirel-coil-plugin`  
**Depends on:** L2, L4, L5, L5A, L8, and B2-C completion logic  
**Purpose:** determine whether B3 still needs behavior invention, and distinguish missing implementation from missing Logic.

---

# 1. Direct Assessment

The B3 Workspace behavior contract is sufficiently explicit for downstream implementation.

The current prototype is useful proof of direction, but it does **not** yet satisfy the complete L5/L5A contract. The remaining gaps are implementation/acceptance gaps, not unresolved product behavior.

Therefore:

```text
B3 behavior specification      = READY
current prototype parity       = PARTIAL
canonical B3 acceptance        = NOT READY
new Logic required             = NO
```

B3 implementation should preserve the accepted B2 authority boundary and consume the canonical Timer read model rather than reintroducing legacy UI-owned time/state.

**Settled**

---

# 2. Actual Sources Reviewed

This assessment is grounded in the current branch implementation, not filenames or historical assumptions:

```text
src/ui/workspace-ui.js
src/timer/read-model.js
tests/b2/workspace-ui.test.js
logic/L5-TIME-VIEWS-WORKSPACE.md
logic/L5A-TAB-PARITY-FOCUS-DELTA.md
```

The prototype currently implements a real nested workspace, selected-vs-operational inspection, core Timer actions, basic tabs, Recent, basic Overview, basic History, Light/Dark, Solid/Glass, and direct Job opening.

**Settled observation**

---

# 3. Behavior Already Aligned

The prototype already demonstrates these important settled behaviors.

## 3.1 Selection does not own timing

Selecting an inactive Context changes inspection only. It does not mutate Timer State or falsely expose operational Pause against the inactive selection.

**Aligned**

## 3.2 Selected vs operational truth

When Selected differs from operational Context, the main view identifies the real operational Context separately.

**Aligned, presentation still incomplete**

## 3.3 Main metric hierarchy

The prototype presents:

```text
Today
Job/Context Total
Current Session when selected Context is actively running
```

This matches the L5 hierarchy.

**Aligned**

## 3.4 State-appropriate core Timer actions

Operational state gates Local Pause, Resume, Start Fresh, and Local Resume. Timer actions route through the bounded trusted Timer API rather than writing local UI state as Timer truth.

**Aligned**

## 3.5 Trusted interaction boundary

Synthetic Timer clicks are rejected. Open Job is also restricted to trusted interaction and validated positive project IDs.

**Aligned**

## 3.6 Basic Hide / Show separation

Hide/Show changes tab presentation and does not issue Timer commands. Hidden Contexts remain available in Recent.

**Aligned at basic single-runtime level**

## 3.7 Same-Context refresh does not automatically reopen

The current selection sync only reacts to a direct non-null operational identity change, so ordinary same-Context refresh does not by itself force expansion or route changes.

**Aligned with the same-Context non-steal rule**

## 3.8 Read values come from the canonical read model

The UI receives Today, Total, current session, statuses, Today Total, Week Total, Today-by-Context, and History from `src/timer/read-model.js`. It does not independently write a second durable time model.

**Aligned foundation**

---

# 4. Tab Parity Gap

L5A requires visible tabs to communicate:

```text
identity
+
Context Today
+
operational status
+
threshold level
+
provisional / Safety-Hold meaning where applicable
```

Current prototype tabs expose only:

```text
short label
status-colored dot
optional Hide control
```

They do **not** yet expose live Today time or threshold semantics.

Required behavior is already settled:

- tab time = canonical Context Today;
- threshold is computed from that same unrounded Today value;
- threshold and operational state are independent dimensions;
- provisional/held semantics remain separately available;
- threshold cannot be color-only for accessibility.

**Implementation gap — no new Logic required**

---

# 5. Canonical Tab Read-Model Gap

Current `contextRows` already provide useful fields such as:

```text
contextId
kind
projectId
label
shortLabel
lastSeenAtMs
lastRecordedActivityAtMs
lastActivityAtMs
todayMs
totalMs
status
isOperational
```

For full L5A tab behavior, the canonical presentation read needs enough output to expose or safely derive the settled tab contract, including:

```text
source state revision / compatible snapshot identity
Today
provisional contribution disposition
Safety Hold disposition
threshold level under committed preferences
visibility/overflow disposition where that layer owns it
```

The renderer must not create a private tab clock or threshold interpretation that can diverge from Main/Overview.

**Implementation/read-model gap — semantics already settled**

---

# 6. Visible Capacity and General-Context Gap

The prototype uses one hard `MAX_VISIBLE_JOB_TABS = 5` slice across eligible rows.

L5 instead settles:

```text
maxVisibleJobTabs = 5 numbered Job Contexts
```

General Contexts do not consume a numbered-job slot.

The limit is also soft: if protected/selected truth cannot safely fit, the UI may temporarily exceed five rather than hide required operational/inspection truth.

The current derivation always returns at most five rows and therefore does not yet express this settled exception.

**Implementation gap — no new Logic required**

---

# 7. Overflow Selection Policy Gap

Current prototype ordering primarily uses:

```text
operational/selected protection
then lastActivityAtMs
then label
```

L5 distinguishes:

```text
lastSeenAtMs            = native workspace recency
lastRecordedActivityAtMs = authoritative recorded work activity
durable tab order        = user workspace preference
```

Automatic overflow should use the settled protected/current rules and native last-seen/workspace ordering, with durable order as deterministic support.

A general `lastActivityAtMs` merger is not sufficient as the final canonical overflow rule because it conflates two intentionally separate concepts.

**Implementation gap — behavior already settled**

---

# 8. Durable Reorder Gap

L5 requires visible tabs to be reorderable with durable workspace order.

The current prototype has no drag/reorder interaction and no durable tab-order preference.

Reorder must remain timing-neutral and cross-tab workspace synchronization must not force another runtime's Selected Context.

**Implementation gap — no new Logic required**

---

# 9. Double-Click Gap

L5 allows:

```text
single click -> select only
double click -> select + expand
```

Current prototype implements single-click selection but no double-click behavior.

**Implementation gap**

---

# 10. Native Focus-Intent Gap

Current `syncSelection()` detects only:

```text
previous operational != null
+
new operational != null
+
identity changed
```

and then immediately:

```text
select incoming
route Main
expand
```

This covers the simple direct A -> B prototype case.

L5A additionally settles:

```text
A -> none          -> no incoming focus target
none -> B          -> focus B
A -> none -> B     -> focus only on later B entry
A -> A verify      -> never steal focus
boot/recovery A    -> initial-selection rules, not fake native entry
hidden B -> current -> show B before/with focus
newer C intent     -> supersedes older B
newer user selection -> defeats older deferred automatic focus
```

The prototype does not yet represent a real ordered focus-intent object/identity or those full transition families.

**Implementation gap — L5A already owns the behavior**

---

# 11. Dirty / Protected Route Gap

The prototype unconditionally exits a nested route and expands on its recognized direct operational A -> B change.

L5A requires a distinction:

```text
read-only nested view
-> safe to route Main

material Settings draft / L6 review / in-progress authoritative mutation
-> do not destroy protected work
-> retain newest eligible deferred focus intent
```

The current prototype Settings page has no material draft, so the existing behavior is acceptable for that prototype surface, but it is not sufficient for the canonical Settings/Data implementation.

**Future B3/B4/B5 integration gap — behavior settled**

---

# 12. Initial Selection Continuity Gap

L5 initial selection priority includes:

```text
1. operational Context when current-focus intent exists
2. valid lastSelectedContextId
3. most recently seen visible Recent Context
4. empty
```

The prototype initializes to operational Context or first row but does not persist/use a durable `lastSelectedContextId` convenience value.

This is UI continuity only and never timing authority.

**Implementation gap**

---

# 13. Current Context Presentation Gap

The prototype correctly shows an `Actually running / observed` strip when Selected differs from operational Context.

For complete L5 behavior, the operational presentation also needs to preserve the settled semantic distinctions:

```text
RUNNING
RUNNING_PROVISIONAL
VERIFICATION_HOLD
AWAITING_CHOICE
LOCALLY_PAUSED
SYNCING
```

and keep native SquareCoil disposition separately understandable when relevant.

The current strip gives the operational label but not the complete operational Today/status/provisional/hold information defined by L5.

**Implementation/presentation gap — semantics settled**

---

# 14. Pending Anchor Gap

L5 permits the Pending view to expose the current safe resume anchor as information while keeping it excluded from Today/Total until the authoritative Resume/Start Fresh command commits.

The read model exposes Pending anchor information, but the current main view does not present it.

**Implementation gap**

---

# 15. Provisional Propagation Gap

L5 requires values containing provisional running contribution to expose that disposition consistently across relevant surfaces:

```text
selected Today / Total
Today Total
This Week
active Today-by-Context row
Current Session
Context Detail
compact tab Today
```

Current read-model/UI status can identify `RUNNING_PROVISIONAL`, but individual metric rows do not yet expose full per-value provisional semantics across every relevant view.

**Implementation/read-model gap**

---

# 16. Safety-Hold Explanation Gap

The prototype maps Safety Hold to a `Verification hold` status and freezes canonical time through the existing read model.

L5 also requires the UI to explain the stopped live timer sufficiently that the user does not infer that Companion paused the native SquareCoil clock.

The current UI does not yet provide that richer explanation.

**Implementation/presentation gap**

---

# 17. Recent Jobs Completeness Gap

Current Recent rows show:

```text
label
Today
Total
status
View
Show tab when hidden
Open
```

L5's canonical Recent row additionally distinguishes:

```text
lastSeenAtMs
lastRecordedActivityAtMs
visible / hidden / overflow state
```

and preserves View vs Show as separate intents.

The current foundation is correct but incomplete.

**Implementation gap**

---

# 18. Time Overview Completeness Gap

The prototype currently implements:

```text
Today Total
This Week
Today by Context
```

L5 requires the complete destination set:

```text
Today Total
This Week
Today by Job/Context
By Day
By Job/Context
Context Detail
```

All remain canonical read-model/query views, not new time models.

**Implementation gap — no new Logic required**

---

# 19. Workday Time-Basis Disclosure Gap

The prototype footer displays the Workday Time Zone, which is a useful foundation.

L5 requires explicit time-basis disclosure when the persisted Workday Zone could surprise the user, including UTC fallback, device-zone mismatch, or uncertain/fallback disposition.

The current read model exposes `workdayZone` but not a complete user-facing zone disposition/mismatch contract on the prototype surface.

**Implementation/read-model gap**

---

# 20. History Completeness Gap

The prototype shows newest completed Ledger segments with Context, local date, start/end time, duration, and end reason.

Canonical L5 History additionally requires the settled reconstruction/large-history behavior, including preservation of Session/Cycle semantics where presented, deterministic ordering, disclosure of legacy-unattributed limitations where relevant, and incremental/bounded retrieval rather than assuming one fixed initial list is the complete history.

The current read model uses a bounded default 100 / maximum 500 result and the UI has no incremental retrieval interaction.

**Implementation gap**

---

# 21. History vs Activity Gap

L5 keeps Timer History and Activity Log conceptually separate.

The prototype exposes History but no Activity route.

Activity remains a separate product surface and must not be fabricated from Timer Ledger rows.

**Implementation gap; ownership remains as previously settled**

---

# 22. Search / Navigation Completeness Gap

The prototype safely supports exact positive Job-number navigation.

L5 also allows local search-assisted navigation over known Contexts without turning arbitrary page text into clock Context evidence.

The exact UI search shape is implementation/design policy, but any expanded search must preserve the settled distinction between:

```text
select/view known Context
show in workspace
open SquareCoil Job URL
```

None of those actions start timing by themselves.

**Implementation gap, not behavior ambiguity**

---

# 23. Refresh Continuity Gap

The prototype re-renders its entire inner surface approximately every 500 ms. Search focus has a separate guard in the UI entry layer, but retained scroll/state continuity is not generally solved.

More importantly at the behavior level, L5/L5A require temporary read failure to retain the last successful value rather than flash false zero or replace trustworthy values with a misleading empty state.

Current `coreSnapshot()` failure returns null and the workspace may render a connecting state instead of retaining the last successful canonical snapshot.

The exact retained-node/render strategy is implementation detail; the behavioral requirement to preserve last good truth is already settled.

**Implementation gap**

---

# 24. Cross-Tab Workspace Synchronization Gap

L5 requires durable workspace preferences such as tab visibility/order to synchronize without converting remote workspace changes into Timer actions or forcibly changing another tab's inspection target.

The prototype persists hidden-tab state but its workspace module does not itself establish the complete cross-tab order/visibility synchronization behavior required by canonical B3.

A remotely hidden Context that remains Selected may continue to be inspected even if its tab chrome disappears; a real incoming operational Context can override hidden state under L5A current-focus rules.

**Implementation gap — behavior settled**

---

# 25. Current Test Coverage vs Canonical B3

The dedicated prototype UI gate currently proves a valuable subset, including:

- duration formatting;
- validated Job navigation;
- selected/operational protection in the prototype five-row cap;
- nested routing + Back;
- inactive selection safety;
- theme/surface/collapse persistence;
- basic Hide/Show;
- trusted Timer actions;
- trusted Open Job;
- direct non-null operational A -> B focus;
- destructive prototype controls remain locked.

Canonical B3 still requires acceptance coverage for the settled behaviors absent from those tests, especially:

```text
live tab Today
threshold boundaries + accessibility semantics
General Context capacity exception
soft-cap protected overflow
persistent reorder
single vs double click
A -> none
none -> B
A -> none -> B
same-Context non-steal
boot/recovery non-entry
hidden incoming Context
stale/superseded focus intent
newer user-selection precedence
dirty-route deferral
provisional/hold propagation
Recent metadata/overflow semantics
By Day / By Context / Context Detail
zone-disclosure cases
incremental History
last-good-snapshot retention
cross-tab workspace synchronization
```

**Acceptance gap — no new Logic required**

---

# 26. Contradiction Check

No material contradiction was found between:

```text
L5
L5A
current B2 authority model
current prototype direction
```

The prototype is simply an incomplete subset of the settled contract.

One implementation detail must not be accidentally hardened into behavior:

```text
current prototype: all eligible rows share one hard five-row cap
settled L5: five numbered Job tabs is a soft capacity; General Contexts do not consume the numbered-job slot
```

The settled L5 rule wins.

Likewise:

```text
current prototype: direct non-null A -> B sync heuristic
settled L5A: ordered native focus-intent transition families
```

L5A wins for canonical B3.

**Settled**

---

# 27. Implementation Readiness

## Behavior layer

**READY**

A downstream builder does not need to invent core B3 behavior for:

- selected vs operational truth;
- tab content/time semantics;
- threshold meaning;
- visible capacity/overflow protection;
- reorder/hide/show semantics;
- focus-intent transition families;
- dirty-route deferral;
- main actions/statuses;
- Recent behavior;
- Time Overview destinations;
- time-basis disclosure;
- History behavior;
- navigation safety;
- refresh failure continuity.

## Current prototype

**NOT READY for canonical B3 acceptance**

The prototype should be treated as an interaction/visual foundation, not as proof that the complete B3 behavior contract has been implemented.

## Stage dependency

The planned staged path still requires B2-C implementation/acceptance before the B3-facing prototype is treated as canonical B3 completion.

That is a downstream stage dependency, not a missing B3 behavior rule.

---

# 28. Continuity State

### Settled

- L5 + L5A remain the B3 behavior authority;
- current prototype is partial, not contradictory;
- all major prototype-to-contract gaps identified above are implementation/acceptance gaps;
- no new B3 behavior artifact is required before implementation.

### Provisional

- exact compact tab typography/format;
- exact drag interaction implementation;
- exact retained-node/render technique;
- exact local search UI;
- exact stale/revalidating visual treatment.

These do not change core behavior and remain implementation/design choices.

### Open

None at the B3 behavior layer.

### Blocked

Canonical B3 acceptance is blocked by downstream implementation and the planned B2-C completion dependency, not by missing Logic.

---

# 29. Logic Readiness Judgment

**B3 is implementation-ready at the behavior layer.**

No core Workspace behavior still has to be guessed.

The implementation closes the gaps catalogued above using one canonical revisioned read model and workspace owner. Exact clean-package, installed Chrome/Edge, remote branch, and CI evidence passed at `e3b369e691df317462bf6ef53cd981f682cca1d2`. Logic should reopen only if later regression evidence exposes a genuine contradiction or a new product decision.

---

# 30. 2026-08-28 Implementation Addendum

The active branch now includes canonical Context Today tabs, exact threshold evaluation, soft five-job capacity, General Context handling, durable order/visibility, selected/current separation, revision-bound focus transitions, complete Overview/detail/finalized History views, stale-read retention, and cross-tab presentation synchronization. Stable coverage is mapped in `implementation/B3-WORKSPACE-EVIDENCE.md`.

This addendum does not authorize B4 behavior inside B3 and does not turn presentation state into Timer authority.
