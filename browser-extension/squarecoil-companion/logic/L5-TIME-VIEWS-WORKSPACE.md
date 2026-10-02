# SquareCoil Companion Rebuild
## Logic Stage L5: Time Views, Recent Jobs, History, and Job Navigation

**Status:** Settled - ready for L6  
**Logic stage:** L5  
**Depends on:** L0 invariants, L1 lifecycle, L2 state/time/migration, L3 SquareCoil Bridge, L4 core timer behavior  
**Framework authority:** `docs/REBUILD-MASTER-PLAN.md`  
**Purpose:** Define how users inspect, distinguish, navigate, and organize Companion-recorded work without creating a second time model or allowing presentation actions to mutate timing.

---

# 1. Scope and Ownership

L5 owns behavior for:

- main timer information hierarchy;
- Selected vs operational Context presentation;
- operational and native-clock status presentation;
- provisional and Safety-Hold presentation;
- state-appropriate actions and action targeting;
- tab selection, collapse, expand, visible capacity, overflow, hide, and order;
- Recent membership and row behavior;
- Time Overview;
- Today / This Week / By Day / By Context views;
- Context detail;
- Workday Time Zone disclosure;
- legacy-unattributed-time disclosure;
- History reconstruction/order/fields;
- History vs Activity Log separation;
- Open Job and local search-assisted navigation;
- invalid/missing job navigation behavior;
- large-history incremental retrieval behavior;
- read-model snapshot consistency across asynchronous views.

L5 does **not**:

- recalculate time independently of L2/L4;
- change Timer State from selection/navigation alone;
- define archive/delete mutation semantics beyond settled protection/intent distinctions;
- define Full Backup/CSV behavior;
- define final theme/styling details.

> L2/L4 own what time exists. L5 owns how that truth is exposed and navigated.

**Settled**

---

# 2. Canonical Read-Model Contract

Every L5 view reads through one canonical query/read-model layer backed by L2 state, Ledger, Context Index, and L4 operational state.

No view independently recomputes:

```text
Today
Today Total
This Week
Job Total / Context Total
Current Session
current running contribution
Safety Hold cap
legacyUnattributedMs
```

A read snapshot supports at least:

```text
stateRevision
queryAtMs
workdayZone
workdayZoneDisposition
selectedContextId
operationalContextId
operationalStatus
nativeClockDisposition
provisional/hold disposition
```

Formatting may differ by view. Source values and semantics may not.

**Settled**

---

# 3. Snapshot Revision Consistency

One rendered logical view must not combine incompatible asynchronous revisions.

Rules:

- each asynchronous result carries the revision/snapshot identity it was derived from;
- an older result arriving after a newer accepted revision cannot overwrite the newer view;
- related values presented together should come from one compatible snapshot or clearly identified revalidation state;
- transient refresh failure preserves last successful values instead of replacing them with zero;
- if a new authoritative revision invalidates a provisional value, every affected live view reconciles from the new canonical snapshot.

Example that is forbidden:

```text
Main Timer: Job A Today from revision 51
Recent row A: Job A Today from stale revision 49
```

for an already-known newer revision where the mismatch is caused only by late async rendering.

**Settled**

---

# 4. Selected Truth vs Operational Truth

The UI preserves two distinct facts:

```text
Selected Context
Operational Context = ACTIVE | PENDING | LOCAL_PAUSED | none
```

Example:

```text
ACTIVE = Job A
SELECTED = Job B
```

The user may inspect B's Today, Total, and History while A continues accruing.

B must never appear Running merely because it is selected.

**Settled**

---

# 5. Current Context Strip

The earlier conceptual name `Current Tracking Strip` is replaced by **Current Context Strip** because PENDING and LOCAL_PAUSED are operational Contexts but are not actively tracking time.

Whenever a non-IDLE operational Context exists, the read model exposes a compact Current Context Strip independent of selection.

It supports:

```text
operationalContextId
label
semantic status
Today
provisional/hold flag
```

Behavior:

- Selected = Operational may integrate this truth into the main header instead of duplicating it;
- Selected != Operational requires persistent indication of the real operational Context;
- the strip status must say Running, Awaiting Choice, Locally Paused, Verification Hold, etc. rather than generically saying Tracking;
- `Focus Current` changes selection only;
- strip actions, if any, must visibly target the operational Context and obey the same command rules as main actions.

During a short reconciliation where SquareCoil positively identifies a Context but Timer State has not settled yet, the strip may show `SYNCING` for that identified Context. It must not claim Running until L4 state supports it.

**Settled**

---

# 6. Main Time Hierarchy

For a selected Job Context:

```text
Primary   = Recorded Today / Today
Secondary = Job Total
Tertiary  = Current Session only when this selected Context is ACTIVE
```

For a General Context:

```text
Primary   = Recorded Today / Today
Secondary = Context Total
Tertiary  = Current Session only when ACTIVE
```

Rules:

- Today is the primary useful measure;
- Total remains visible but secondary;
- Current Session must not compete visually with Today;
- Pending anchor time is not counted before Resume/Start Fresh commits;
- Local Pause does not keep increasing;
- Safety-Held values stop at the shared hold boundary.

**Settled**

---

# 7. Semantic Presentation Statuses

These are presentation statuses, not Timer States:

```text
RUNNING
RUNNING_PROVISIONAL
VERIFICATION_HOLD
AWAITING_CHOICE
LOCALLY_PAUSED
NOT_RUNNING
SYNCING
```

## 7.1 Status mapping

- `RUNNING`: selected Context is ACTIVE with normal verification and no hold.
- `RUNNING_PROVISIONAL`: ACTIVE during L4 short verification grace with provisional contribution.
- `VERIFICATION_HOLD`: ACTIVE with shared Safety Hold.
- `AWAITING_CHOICE`: PENDING.
- `LOCALLY_PAUSED`: LOCAL_PAUSED.
- `NOT_RUNNING`: selected historical/inactive Context.
- `SYNCING`: transient reconciliation before a safer semantic status is known.

## 7.2 Status precedence

For one selected Context, use this precedence where multiple presentation modifiers could appear:

```text
VERIFICATION_HOLD
RUNNING_PROVISIONAL
RUNNING
AWAITING_CHOICE
LOCALLY_PAUSED
SYNCING
NOT_RUNNING
```

The precedence does not change Timer State. It only prevents conflicting labels such as simultaneously displaying Running and Verification Hold.

`SYNCING` must not erase a known durable Pending or Local-Paused truth merely because a view is refreshing.

**Settled mapping; final words may be refined in L7**

---

# 8. Native Clock Disposition Is Separate

Native SquareCoil disposition and Context presentation status are different dimensions.

Possible global native disposition includes:

```text
SquareCoil clocked out
No trackable project/context
SquareCoil state unknown
```

A historical selected Job B remains `NOT_RUNNING` even when the global disposition says SquareCoil clocked out.

`NO_TRACKABLE_CONTEXT` remains distinct from full company clock-out.

**Settled**

---

# 9. Provisional Time Propagation

Any value containing L4 provisional running contribution exposes:

```text
isProvisional = true
```

This applies as relevant to:

- selected Context Today;
- selected Context Total;
- Today Total;
- This Week;
- active Today-by-Context row;
- current-session display;
- Context Detail live totals.

Rules:

- only values containing provisional contribution are marked provisional;
- unrelated historical Context totals remain normal;
- later conservative correction may reduce provisional display values;
- all affected views reconcile consistently;
- finalized Ledger history is not described as deleted.

**Settled**

---

# 10. Safety Hold Presentation

When ACTIVE has a shared Safety Hold:

- all live views stop increasing beyond `holdAtMs`;
- status is `VERIFICATION_HOLD`;
- the UI makes the verification problem visible enough to explain the stopped timer;
- the Context remains operational and protected;
- wording must not imply Companion paused the native SquareCoil clock.

**Settled**

---

# 11. Pending Anchor Presentation

A Pending Context may show its current valid safe anchor so Resume/Start Fresh behavior is understandable.

Conceptual information:

```text
Awaiting choice
Can begin from 10:14 AM if resumed now
```

Rules:

- Pending anchor is informational and not yet added to Today/Total;
- if L4 breaks continuity and refreshes the anchor, L5 replaces the old anchor immediately;
- a stale old anchor must not remain visible after authoritative revision changes.

**Settled**

---

# 12. Main Action Targeting

Actions are always scoped to an explicit Context and current authoritative revision.

If Selected != Operational:

- actions in the main selected panel target Selected Context only;
- the panel must not expose `Local Pause` as though it targeted an inactive selected Context;
- any operational action exposed from the Current Context Strip must identify that operational target.

Selection itself never performs a timer command.

**Settled**

---

# 13. Main Actions by State

## ACTIVE selected

```text
Local Pause
Open Job (Job Context only)
```

## ACTIVE + Safety Hold selected

Local Pause may remain available subject to L4 hold/boundary rules. Open Job remains available.

## PENDING selected

```text
Resume
Start Fresh
Open Job (Job Context only)
```

## LOCAL_PAUSED selected

```text
Local Resume
Open Job (Job Context only)
```

## Inactive selected

May expose:

```text
Open Job
Hide from Tabs
Archive
Delete Job Data
```

subject to L4 protection and L6 mutation contracts.

General Contexts have no fabricated Open Job action.

**Settled availability; L6 owns mutation/confirmation details**

---

# 14. Collapse, Expand, and Selection

- single click on a Context tab selects it only;
- double click may select + expand;
- manual collapse is runtime UI state;
- same-Context heartbeat does not reopen a manually collapsed timer;
- metadata-only update does not reopen it;
- real native Context identity change may request incoming focus/expand;
- collapse/expand never changes Timer State.

**Settled**

---

# 15. Initial Selection

Initial selection priority:

```text
1. operational Context when current-focus intent exists
2. valid lastSelectedContextId still available to view
3. most recently seen visible Recent Context
4. none / empty main state
```

A manual selection remains until the user changes it or a later real native Context transition legitimately requests incoming focus.

A workspace visibility change from another tab must not silently reinterpret selection as a timer action.

**Settled**

---

# 16. Recent Is Workspace Membership

Recent is not History and not a retention cap.

A Context normally enters/returns to Recent when:

- SquareCoil positively observes it as current; or
- the user explicitly chooses Show in Recent / restore-to-workspace.

Merely viewing History, Context Detail, or opening a project URL does not automatically add it to Recent.

Historical Ledger data remains regardless of Recent membership.

**Settled**

---

# 17. Native Last Seen vs Recorded Activity

Two timestamps must not be conflated:

```text
lastSeenAtMs
lastRecordedActivityAtMs
```

- `lastSeenAtMs` means SquareCoil positively observed the Context as current.
- `lastRecordedActivityAtMs` derives from authoritative Companion time/session activity.

UI selection updates neither timestamp.

Recent/overflow ordering may use native last-seen workspace metadata. By-Context time ordering uses authoritative recorded activity.

**Settled**

---

# 18. Visible Tab Capacity

Initial policy:

```text
maxVisibleJobTabs = 5
```

This counts numbered Job Context tabs only.

It is a **soft presentation capacity**, not a membership/history invariant.

General Contexts such as Production General do not consume a numbered-job slot.

If safety/UX rules cannot satisfy the limit without hiding a protected or currently inspected Context, the UI may temporarily exceed five rather than violate those rules.

**Settled default policy**

---

# 19. Automatic Overflow

When a new current numbered Job must become visible and capacity is full:

1. protected/current Contexts stay visible;
2. avoid displacing the current Selected Context when another eligible inactive tab exists;
3. among remaining eligible inactive unprotected tabs, choose least-recently-seen, with durable tab order as deterministic tie-break;
4. move that Context to Recent overflow;
5. retain Recent membership and all history.

If no safe candidate exists without hiding protected/Selected operational UX, temporarily exceed capacity.

A hidden/overflow Context that becomes current is automatically shown before/with current-focus intent.

**Settled**

---

# 20. Manual Hide

Hide affects tab visibility only.

Allowed only for unprotected Contexts.

Hide:

- preserves history/Total;
- does not alter SquareCoil or Timer State;
- may preserve Recent membership;
- persists until shown again or current-state visibility overrides it.

If another tab applies a durable Hide to a Context currently Selected in this tab:

- the visible tab chrome may disappear;
- the current detail view may remain selected for inspection until the user selects another Context;
- timing never changes from this workspace synchronization.

This avoids remote workspace changes forcibly changing another tab's inspection target.

**Settled**

---

# 21. Tab Order

Visible tabs are reorderable.

- order is durable workspace metadata;
- reorder changes no time or status;
- cross-tab order synchronizes without forcing another tab's Selected Context;
- a returning hidden/overflow Context keeps prior relative order when practical, otherwise uses deterministic placement.

**Settled**

---

# 22. Recent Jobs View

Recent rows support:

```text
Context label/identity
Today
Job/Context Total
last seen
last recorded activity
semantic status
visible / hidden / overflow state
```

Operational status always derives from L4, never row selection.

**Settled**

---

# 23. View vs Show

```text
View
Show in Tabs
```

- View selects Context for inspection.
- Show in Tabs changes visible workspace state when allowed.

Neither starts/resumes timing.

Showing an already visible Context is a no-op.

**Settled**

---

# 24. Clear Recent / Archive / Delete Distinction

L5 communicates three different intents:

```text
Clear Recent = non-destructive workspace cleanup
Archive      = move Context to archive workspace state, time preserved
Delete Data  = explicitly destructive operation
```

Protected Contexts cannot participate in ordinary Clear Recent/Archive/Delete controls.

L6 defines exact mutation destination, confirmation, and deletion scope.

**Settled presentation distinction**

---

# 25. Time Overview Structure

Required destinations:

```text
Today Total
This Week
Today by Job/Context
By Day
By Job/Context
Context Detail
```

All values come from L2/L4 read queries.

**Settled**

---

# 26. Workday Time Basis Disclosure

`Today`, `By Day`, and `This Week` use L2's persisted Workday Time Zone, not whichever clock the UI happens to run under.

L5 must expose the time basis when it could otherwise surprise the user.

At minimum disclose when:

- Workday Time Zone is the explicit UTC fallback;
- current device/browser zone differs from persisted Workday Time Zone;
- diagnostics indicate fallback/uncertain zone disposition.

Conceptual information:

```text
Time basis: America/New_York
```

or:

```text
Time basis: UTC fallback
```

The UI must not silently relabel historical dates using the current device zone.

**Settled**

---

# 27. Today Total

Today Total:

- includes Job and General Contexts;
- includes valid ACTIVE current contribution;
- is provisional only when included contribution is provisional;
- excludes legacy-unattributed balance;
- is not computed by summing rounded displayed rows.

**Settled**

---

# 28. Today by Job / Context

Canonical data concept is `Today by Job/Context`, even if compact UI later uses shorter wording.

Default ordering:

```text
1. highest Today duration
2. most recent authoritative activity
3. stable Context identity
```

Rows expose:

```text
Context label
Today
semantic status when operational
provisional/hold indicator when applicable
```

Zero-duration Contexts are normally omitted unless operational status makes the row useful.

**Settled**

---

# 29. This Week

Uses L2's week policy.

- includes attributed Ledger time in current reporting week;
- includes valid current contribution;
- propagates provisional status when that contribution is provisional;
- excludes legacy-unattributed balance;
- L5 does not hardcode week boundaries separately.

**Settled**

---

# 30. By Day

Default ordering:

```text
newest localDate first
```

Each row may expose:

```text
localDate
Daily Total
contributing Context count
optional top-Context summary
```

Selecting date reveals that day's Context allocation from canonical Ledger attribution.

Legacy-unattributed balance receives no fake day.

**Settled**

---

# 31. By Job / Context

Lists Contexts with authoritative Companion time.

Default ordering:

```text
most recent authoritative recorded activity first
```

`most recent authoritative recorded activity` means the latest finalized Ledger session/end activity, or current valid operational contribution when that Context is currently active. A mere UI selection or native last-seen event without recorded time does not move a Context upward in this time-centric view.

Rows support:

```text
Context label/job number
Job Total / Context Total
Today when useful
last recorded activity
legacy-unattributed indicator
```

**Settled default ordering**

---

# 32. Context Detail

Summary:

```text
Recorded Today
This Week for this Context
Job Total / Context Total
semantic operational status if applicable
```

Detail:

```text
daily attributed totals
finalized logical sessions
legacy-unattributed balance
current-session area when ACTIVE
Open Job for valid Job Context
workspace actions when applicable
```

Daily sum may be lower than Total when legacy-unattributed time exists. Explain the difference rather than fabricating allocation.

**Settled**

---

# 33. Legacy Unattributed Time Disclosure

When `legacyUnattributedMs > 0`, disclose it wherever otherwise-hidden undated balance would make totals appear inconsistent.

Conceptual presentation:

```text
Job Total                    18h
Dated Companion history      12h
Older time without date detail 6h
```

Do not assign it to Today/Week/By Day or invent sessions.

Final wording may be refined, but the distinction remains.

**Settled**

---

# 34. Empty States

Empty conditions are distinct:

```text
No Companion time recorded today
No dated Companion history yet
No recent jobs in the workspace
No matching job found
No dated history available; undated legacy balance exists
```

Legacy-unattributed balance prevents falsely showing `0h total` or `no history` when total time actually exists.

**Settled semantics**

---

# 35. Loading / Stale / Error States

Views distinguish:

```text
loading
loaded-empty
loaded-data
stale/revalidating
error
```

- known values do not flash to zero on transient refresh failure;
- stale data remains visibly stale/revalidating;
- older async results cannot overwrite newer accepted revision;
- persistence/read failure follows L1/L8 failure behavior;
- optional navigation/search failure does not affect timer health.

**Settled**

---

# 36. Large-History Retrieval

Large history remains fully accessible.

- load incrementally;
- pagination/cursor/virtualization is implementation detail;
- totals come from canonical aggregate queries, not rendered page rows;
- absence from current page does not mean absence from history;
- page/chunk size can never become a retention cap.

**Settled**

---

# 37. History Contains Finalized Work

History represents finalized Companion-recorded sessions.

An in-progress ACTIVE session:

- contributes to live Today/Total;
- may appear in a clearly separate current-session area;
- is not inserted into finalized History as if complete.

After finalization it becomes History.

**Settled**

---

# 38. Logical Session Reconstruction

Midnight-split Ledger Segments may reconstruct into one logical History session only when grouping is safe.

Required grouping evidence:

- same stable `sessionId`;
- same Context identity;
- compatible cycle/provenance;
- segments are non-overlapping and form one plausible logical interval.

Do not group merely because timestamps are adjacent.

Example:

```text
Session 23:55 -> 00:25 = 30m
History: one logical 30m session
By Day: Day 1 = 5m, Day 2 = 25m
```

If legacy/corrupt records cannot be safely reconstructed, preserve separate evidence rather than invent grouping.

**Settled**

---

# 39. History Ordering

Default logical-session ordering:

```text
newest effective end time
then newest start time
then stable session identity
```

Ordering never mutates timestamps or Ledger identity.

**Settled**

---

# 40. History Row Data

Compact row supports:

```text
Context/job
local date or date range
start
end
duration
```

Expanded detail may expose:

```text
startCause
endReason
source/certainty when useful
migration/import provenance when useful
daily allocation for cross-midnight sessions
```

Normal rows need not expose internal diagnostics. Conservative/recovery/imported rows must expose enough provenance to explain unusual boundaries.

Start Cause and End Reason remain separate per L4.

**Settled**

---

# 41. History vs Activity Log

```text
History      = when Companion time was recorded
Activity Log = what application events occurred
```

Theme changes, tab reorders, support actions, etc. do not become History rows.

Activity Log is never used to calculate time totals.

**Settled**

---

# 42. Open Job

Available only for a Job Context with a valid positive SquareCoil project ID.

Canonical target:

```text
/project.php?id=${projectId}
```

Open Job:

- is navigation only;
- does not clock into the job;
- does not Resume/Start Fresh;
- does not add time;
- may open same/new tab according to UI/user browser behavior.

If same-tab navigation reloads the Companion, L4 controlled reload rules govern continuity. Navigation itself is not a work boundary.

**Settled**

---

# 43. General Context Navigation

Production General and other General Contexts receive no fabricated project URL.

Never create `/project.php?id=0` as Open Job for Production General.

**Settled**

---

# 44. Search-Assisted Job Lookup

Initial local sources:

```text
1. Job/Context Index exact project ID
2. known local labels/names/aliases when available
3. exact syntactically valid six-digit direct-navigation candidate
```

- label matching may be fuzzy;
- project identity remains exact;
- typing/searching does not add Recent membership;
- search does not create time;
- opening a job does not start tracking;
- no unaudited SquareCoil server-search endpoint is invented.

**Settled initial contract**

---

# 45. Exact Six-Digit Direct Navigation

For exact syntactically valid six-digit input absent from local Index, UI may offer:

```text
Open job 260702
```

This does not:

- create a durable Context from typed text;
- add Recent membership;
- create time.

SquareCoil navigation/page truth determines what exists after opening.

**Settled**

---

# 46. Invalid / Missing Job ID

If a Context lacks a valid positive project ID:

- no Open Job link;
- no guessed URL from arbitrary label numbers;
- history remains viewable;
- navigation failure changes no timer/history state.

Invalid free-form search returns a non-destructive no-match/invalid-input state.

**Settled**

---

# 47. Navigation vs Recent Membership

```text
View historical A       -> no automatic Recent membership
Open Job A              -> no automatic Recent membership
SquareCoil observes A   -> A enters/returns Recent
Show in Recent A        -> explicit workspace membership
```

Browsing history must not clutter the active workspace.

**Settled**

---

# 48. Threshold vs Operational Status

L4 threshold level derives from Context Today and is distinct from Running/Pending/etc.

An inactive Context with 4h Today may have Red threshold accent but remains `NOT_RUNNING`.

Running is not itself a threshold color.

**Settled**

---

# 49. Cross-Tab View Consistency

- authoritative values/status synchronize by shared revisions;
- each tab keeps independent selection;
- durable reorder/visibility may synchronize;
- remote visibility change does not forcibly turn selection into another Context or timer command;
- real native Context change may emit incoming-focus intent to each UI;
- no tab maintains a separate running total.

**Settled**

---

# 50. L5 Behavior Invariants

- **VIEW-01:** All time views use one canonical read/query model.
- **VIEW-02:** Selected and Operational Context remain visibly distinguishable.
- **VIEW-03:** The Current Context Strip never calls Pending/Local-Paused generically Running/Tracking.
- **VIEW-04:** Only actual ACTIVE Context may present Current Session.
- **VIEW-05:** Provisional contribution is marked only on values that include it and may reconcile downward.
- **VIEW-06:** Shared Safety Hold caps every live view at one boundary.
- **VIEW-07:** Pending anchor is informational until a valid choice commits.
- **VIEW-08:** Main/strip actions always identify the Context they target.
- **VIEW-09:** Recent is workspace membership, not historical retention.
- **VIEW-10:** Visible-tab capacity is soft and may never hide protected operational truth.
- **VIEW-11:** Automatic overflow avoids the user's currently Selected Context when another candidate exists.
- **VIEW-12:** Clear Recent, Archive, and Delete remain distinct intents.
- **VIEW-13:** Time Overview includes Job and General Contexts consistently.
- **VIEW-14:** Today/Week/By-Day obey persisted Workday Time Zone and disclose surprising/fallback basis.
- **VIEW-15:** Legacy unattributed time is disclosed and never assigned fake dates.
- **VIEW-16:** Finalized History is separate from current running state.
- **VIEW-17:** Midnight segments reconstruct only with safe stable-session evidence.
- **VIEW-18:** History and Activity Log remain separate.
- **VIEW-19:** Open Job/navigation never changes timing by itself.
- **VIEW-20:** General Contexts receive no fabricated project URL.
- **VIEW-21:** Search/view/navigation does not silently add Recent membership.
- **VIEW-22:** Threshold status cannot impersonate Running status.
- **VIEW-23:** Large-history paging cannot become a retention cap.
- **VIEW-24:** Older async view results cannot overwrite newer accepted authoritative revisions.
- **VIEW-25:** Native `lastSeen` and authoritative `lastRecordedActivity` remain different metadata.

**All Settled**

---

# 51. Acceptance Scenarios

## V1 Active equals Selected
ACTIVE A + SELECTED A -> A shows Running; Today primary, Total secondary, Current Session tertiary.

## V2 Selected differs from Active
ACTIVE A + SELECTED B -> B shows its own values as Not Running; Current Context Strip identifies Running A.

## V3 Pending strip semantics
PENDING A while B selected -> strip identifies A as Awaiting Choice, not generically Running/Tracking.

## V4 Focus current
From V2, Focus Current selects A only; timing unchanged.

## V5 Pending selected
PENDING A -> valid safe anchor shown; Resume/Start Fresh available; Pending interval not yet added.

## V6 Pending anchor refresh
L4 breaks continuity and replaces anchor -> old anchor disappears; new authoritative anchor is shown.

## V7 Local Pause
LOCAL_PAUSED A -> stable Today/Total, Locally Paused status; no native clock-out implication.

## V8 Provisional running
ACTIVE A enters short verification grace -> affected live values are marked provisional.

## V9 Provisional correction
Later conservative reconciliation reduces contribution -> every affected live view updates; finalized History rows remain.

## V10 Unrelated value not provisional
A is provisional-active while historical B is selected -> B's historical Total is not marked provisional merely because A is.

## V11 Safety Hold
ACTIVE A + hold -> all live A/aggregate views stop at same hold; Verification Hold visible.

## V12 Status precedence
ACTIVE A with Safety Hold during degraded verification -> UI shows Verification Hold, not simultaneous Running + Syncing labels.

## V13 Historical selection while native clocked out
Selected historical B -> B Not Running; global native disposition may say SquareCoil clocked out.

## V14 Five visible jobs + incoming F
New current F is shown. Eligible inactive unprotected overflow candidate moves out; no history/Recent membership deleted.

## V15 Selected tab protected from automatic overflow when alternatives exist
Five tabs visible, B selected, other eligible inactive tabs exist, F arrives -> overflow chooses another eligible tab before B.

## V16 No safe overflow candidate
Capacity cannot be met without hiding protected/selected operational UX -> temporarily exceed five rather than violate safety/inspection rules.

## V17 General Context with five numbered jobs
Production General may remain visible without consuming numbered-job slot.

## V18 Hidden job becomes current
Hidden B becomes current -> shown before/with incoming focus intent.

## V19 Remote hide while selected elsewhere
Tab 1 hides inactive B while Tab 2 is inspecting B -> Tab 2 may lose B tab chrome but may keep B detail selected; timing unchanged.

## V20 Reorder tabs
Reorder changes durable workspace order only.

## V21 Single click tab
Selects only; no timing mutation.

## V22 Double click tab
Select + expand only; no timing mutation.

## V23 Same-context heartbeat collapsed
Manual collapse remains collapsed.

## V24 Native switch collapsed
May request incoming focus/expand; timing remains L4-owned.

## V25 Action targeting while viewing inactive B
ACTIVE A + SELECTED B -> B panel does not expose Local Pause as if B were active. Any Pause control for A must explicitly target A.

## V26 Today Total includes General
A=2h + Production General=1h today -> Today Total 3h.

## V27 Today ordering
A=2h, B=1h, General=30m -> A, B, General absent tie overrides.

## V28 Week excludes legacy balance
5h dated this week + 20h legacy-unattributed -> This Week 5h; Total includes 25h plus other valid history/current time.

## V29 Workday zone differs from device
Persisted zone America/New_York, device temporarily another zone -> Today/By-Day still follow persisted zone and UI discloses time basis when needed.

## V30 UTC fallback
No valid IANA zone at first run and L2 uses UTC fallback -> time views disclose UTC fallback rather than silently implying local dates.

## V31 By Day
Newest date first; date drilldown uses canonical allocation.

## V32 By-Context ordering ignores mere selection
User selects old Job B without recording time -> selection alone does not move B to top of most-recent-recorded-activity ordering.

## V33 Cross-midnight session
23:55->00:25 with same stable session -> History may show one 30m session; By Day allocates 5m/25m.

## V34 Unsafe session reconstruction
Adjacent legacy rows without trusted same-session identity -> remain separate rather than invent one session.

## V35 Legacy unattributed detail
12h dated + 6h undated legacy -> Total 18h and 6h disclosed separately.

## V36 Empty Today with older history
Today says no time recorded today, not no history exists.

## V37 No dated history but legacy balance
Do not show 0h/no-history; disclose undated balance.

## V38 Refresh failure
Prior successful values remain with stale/error indication; do not flash to zero.

## V39 Late old async response
Revision 52 view is accepted, then slow revision 51 response arrives -> revision 51 cannot overwrite it.

## V40 Large history
Only first chunk of 10,000 sessions rendered -> aggregate totals remain complete; paging is not retention.

## V41 Current session not finalized History
ACTIVE A contributes live totals but not a completed History row.

## V42 History provenance
Resume-created session later clocks out -> expanded detail may show startCause=resume and endReason=native-clock-out separately.

## V43 Activity separation
Theme change/tab reorder may appear in Activity Log, never time History.

## V44 Open valid job
Open 260702 -> `/project.php?id=260702`; navigation action itself changes no timing.

## V45 Same-tab Open Job during ACTIVE
Navigation causes page lifecycle change -> L4 controlled reload continuity rules apply; Open Job itself is not treated as work boundary.

## V46 Production General navigation
No `/project.php?id=0` action.

## V47 Search known job
Search known 260702 -> View/Open explicit; search itself changes neither Recent nor timing.

## V48 Search unknown exact six-digit
May offer direct Open; no durable Context/time until SquareCoil later proves it.

## V49 Invalid search
No guessed URL; non-destructive invalid/no-match state.

## V50 Historical View does not clutter Recent
Viewing archived/old A does not return A to Recent.

## V51 Threshold vs status
Inactive A with 4h Today may be Red but remains Not Running.

## V52 Protected Recent row
Pending/Active/LocalPaused/Held row has ordinary Clear/Archive/Delete unavailable.

## V53 Cross-tab independent selection
Tab 1 selects A, Tab 2 selects B; both share time/status truth while retaining independent selection.

## V54 Native last-seen vs recorded activity
SquareCoil briefly observes B with no recorded Companion time -> lastSeen may update, but lastRecordedActivity does not fabricate time activity.

---

# 52. Continuity States After L5

## Settled

- canonical revisioned read-model authority;
- same-view stale-result rejection;
- Today-first main hierarchy;
- Selected vs Operational truth separation;
- Current Context Strip naming and semantic status behavior;
- presentation-status precedence;
- provisional propagation and correction;
- Safety-Hold presentation;
- Pending anchor presentation;
- explicit action targeting;
- single-click select / double-click expand;
- Recent vs visible-tabs distinction;
- native last-seen vs recorded-activity distinction;
- five numbered-job soft capacity;
- selected/protected-safe overflow behavior;
- remote hide does not force another tab's selection change;
- Clear Recent / Archive / Delete intent distinction;
- Time Overview structure;
- persisted Workday Time Zone disclosure rules;
- Today/Week/By-Day/By-Context behavior;
- legacy-unattributed disclosure;
- deterministic empty/loading/stale/error behavior;
- large-history retrieval without retention caps;
- finalized History vs current session separation;
- safe logical-session reconstruction;
- History ordering/fields/provenance;
- History vs Activity Log separation;
- Open Job and local search-assisted navigation;
- navigation separated from time/Recent membership;
- threshold vs operational-status separation;
- cross-tab view consistency with independent selection.

## Provisional

- exact final user-facing labels/microcopy;
- exact visible-tab capacity preference exposure if later configurable;
- exact history page/chunk size;
- exact local fuzzy-search ranking algorithm;
- exact sort-control UI beyond settled defaults;
- exact Current Session density in compact mode;
- exact time-basis placement/iconography.

## Open for later stages

- Clear Recent final destination and mutation semantics (L6);
- archive/delete confirmations and deletion scope (L6);
- Archive browser/restore behavior (L6);
- History CSV and Time Report behavior (L6);
- final Settings routing/themes/focus/microcopy (L7);
- cross-module failure priorities and automated fixtures (L8/build).

## Blocked

None.

---

# 53. L5 Readiness Judgment

**Status: Settled - ready for L6**

L5 now defines Main Timer, Current Context truth, Recent/tabs, Time Overview, History, and Job Navigation strongly enough that UI implementation can remain a read/presentation layer instead of inventing time, state, workspace, or navigation semantics.

Next stage:

**L6: Archive, Housekeeping, Backup, Restore, and CSV**