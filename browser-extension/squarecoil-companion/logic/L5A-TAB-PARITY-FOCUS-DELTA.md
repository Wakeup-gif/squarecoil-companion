# SquareCoil Companion Rebuild
## Logic Delta L5A: Live Tab Time, Threshold Accent, and Native Focus Intent

**Status:** Settled — ready for implementation under existing B2/B3 stage gates  
**Logic delta:** L5A  
**Depends on:** settled L0-L8, especially L2, L4, L5, L7, L8  
**Framework source:** `docs/FEATURE-MINE-RECONCILIATION.md`  
**Delta handoff:** `docs/LOGIC-DELTA-HANDOFF.md`  
**Purpose:** restore required legacy tab UX parity without creating a second timing model, and remove ambiguity around which real SquareCoil Context transitions may change Companion selection/expansion.

---

# 1. Scope

This delta resolves only the post-mine gaps:

- live elapsed summary in visible Context tabs;
- threshold accent in those tabs;
- relationship between threshold and operational status;
- native incoming-Context focus/select/expand intent;
- focus behavior across direct switch, leave, re-entry, boot, recovery, and same-Context verification;
- failure/stale behavior for these presentation interactions;
- acceptance criteria for the delta.

This delta does **not**:

- change Timer State definitions;
- change Time Ledger ownership or calculations;
- change SquareCoil Bridge evidence semantics;
- add another clock/ticker authority;
- change archive/backup/delete behavior;
- activate optional Cinematic Background or Design Dashboard presentation profiles;
- define CSS, DOM structure, animation, or package layout.

> L2/L4 still define what time exists. L5A defines what compact tabs display and when real native Context changes may request UI focus.

**Settled**

---

# 2. Contradiction Check

The historical timer displayed a continuously changing elapsed value in each visible job tab. The rebuild now has richer time semantics: Today, Job/Context Total, Current Session, provisional contribution, and Safety Hold.

Two plausible tab values existed:

```text
A. Job/Context Total
B. Context Today
```

Using Job Total would conflict with the existing L4 threshold contract because threshold level is explicitly based on **Context Today**, not lifetime Total. A tab could otherwise show a lifetime number while its color communicates an unrelated daily number.

Therefore:

```text
Canonical compact tab time = Context Today
Canonical compact tab threshold = threshold(Context Today)
```

This is also consistent with L5's established hierarchy where Today is the primary user-facing time measure.

No earlier core state/ledger rule is changed.

**Settled resolution**

---

# 3. Canonical Tab Read Contract

Every visible Context tab reads from the same canonical L5 read-model snapshot used by Main, Recent, Overview, and Context Detail.

A tab read supports at least:

```text
contextId
contextType
label / projectId
sourceStateRevision
sourcePreferenceRevision
queryAtMs

todayMs
isProvisional
isSafetyHeld
thresholdLevel
operationalStatus
isSelected
visibilityDisposition
```

The renderer may derive compact text from these values, but may not independently derive authoritative elapsed time from raw storage or a private tab clock.

**Settled**

---

# 4. Tab Time Quantity

The compact elapsed value shown in a visible tab is:

```text
Context Today at queryAtMs
```

It includes only time L2/L4 already consider part of Today.

## 4.1 ACTIVE

Tab Today includes:

```text
finalized attributed Today
+
valid current ACTIVE contribution through queryAtMs
```

## 4.2 ACTIVE provisional

During the L4 verification-grace period:

- the current provisional contribution may be included;
- `isProvisional = true` when the tab Today value contains that contribution;
- later evidence may reduce the displayed value.

A downward provisional correction is not historical deletion.

## 4.3 Safety Hold

When ACTIVE has a shared Safety Hold:

- Today is capped at the same `holdAtMs` used by every other live view;
- `isSafetyHeld = true`;
- the tab stops increasing beyond the hold.

## 4.4 PENDING

Pending safe-anchor time is **not** included.

Tab Today contains finalized/previously committed Today only.

## 4.5 LOCAL_PAUSED

Tab Today remains stable while locally paused.

## 4.6 Inactive Context

Tab Today is the authoritative attributed Today value and does not run independently.

**Settled**

---

# 5. Workday Boundary Behavior

Because the compact value is Today:

- it uses L2's persisted Workday Time Zone;
- crossing the Workday day boundary changes the tab to the new day's value;
- an ACTIVE cross-midnight session contributes only its new-day portion after the boundary;
- threshold level is recalculated from the new day's Today;
- no Timer State transition is implied merely because the displayed Today value rolls over.

Legacy-unattributed time is never inserted into tab Today.

**Settled**

---

# 6. Tab Refresh Semantics

The tab is live presentation, not a writer.

Rules:

1. One logical UI refresh uses one compatible read-model snapshot.
2. Values presented together as current must share compatible `sourceStateRevision` and `queryAtMs`.
3. ACTIVE/provisional values may be refreshed by presentation-time queries without committing Timer State on every visual tick.
4. A tab must not use its own `Date.now() - startedAt` arithmetic against raw state when the canonical read model already owns the current contribution calculation.
5. Inactive/Pending/Local-Paused values remain stable unless authoritative data, Workday date, or relevant preferences change.
6. Exact rendering/timer mechanics are implementation details, but a healthy visibly running Companion must not leave the active tab perceptibly frozen while Main is visibly advancing from the same read model.
7. Repeated visual refresh must not create durable state writes merely to animate elapsed text.

**Settled behavior; exact cadence is implementation policy**

---

# 7. Tab Formatting Boundary

Logic requires the tab to communicate:

```text
identity + Today value
```

Exact compact formatting (`HH:MM:SS`, `2h 14m`, responsive abbreviation, typography) is implementation/design work.

The semantic/accessibility name must make clear that the value represents **Today** rather than Job Total or Current Session.

**Settled**

---

# 8. Threshold Level Calculation

Threshold source is the same unrounded canonical `todayMs` used by the tab.

Let:

```text
yellowMs = YellowMinutes * 60_000
orangeMs = OrangeMinutes * 60_000
redMs    = RedMinutes * 60_000
```

Evaluate from highest severity downward:

```text
if todayMs >= redMs    -> RED
else if todayMs >= orangeMs -> ORANGE
else if todayMs >= yellowMs -> YELLOW
else -> NONE
```

This resolves equality when configured limits are equal.

Do not round displayed hours/minutes before threshold comparison.

**Settled**

---

# 9. Threshold vs Operational Status

Threshold level and operational status are independent dimensions.

Examples:

```text
Inactive B + 4h Today
-> NOT_RUNNING + RED threshold

ACTIVE A + 20m Today
-> RUNNING + NONE threshold

PENDING A + 2h committed Today
-> AWAITING_CHOICE + ORANGE threshold

ACTIVE A + Safety Hold at 4h+
-> VERIFICATION_HOLD + RED threshold
```

Threshold accent must never imply:

- Running;
- error/failure;
- overdue work;
- SquareCoil clock state;
- destructive danger.

Operational semantic state has priority whenever visual channels compete.

**Settled**

---

# 10. Provisional / Held Threshold Behavior

## Provisional

Threshold level uses the currently exposed canonical Today, including valid provisional contribution.

Therefore a provisional value may temporarily cross a threshold and later move back below it after conservative reconciliation.

When threshold depends on provisional contribution:

- the tab remains marked provisional through a separate semantic channel;
- the threshold level itself is not treated as finalized historical evidence.

## Safety Hold

Threshold is calculated from the held/capped Today value and remains stable until authoritative resolution changes that value.

**Settled**

---

# 11. Threshold Preference Changes

When Timer Limits change through L7:

- the next canonical presentation snapshot uses the newly committed preference revision;
- threshold levels may change immediately even though Today is unchanged;
- no time is created, removed, split, finalized, paused, or resumed;
- a stale Timer Limits draft cannot silently change tab thresholds until the preference commit succeeds.

**Settled**

---

# 12. Threshold Accessibility

Threshold may use color/accent visually, but color cannot be its only available meaning.

The rendered tab must expose the threshold level through a non-color semantic path, such as:

- accessible name/description;
- status text on focus/expanded detail;
- equivalent non-color marker.

The exact visual mechanism is implementation work.

Operational status and threshold descriptions must remain distinguishable.

**Settled**

---

# 13. Native Focus Intent Is UI-Only

A native focus intent is a presentation event, never Timer State.

Conceptual payload:

```text
focusIntentId
transitionId
contextId
sourceStateRevision
createdAtMs
cause
ensureVisible = true
select = true
expand = true
```

It may be produced only after the incoming Context is represented by a compatible authoritative Context/Timer read revision.

The UI must not create a Context merely because a focus intent names one.

Applying focus intent may change:

- visible-tab membership/overflow presentation under L5 rules;
- per-tab Selected Context;
- Companion route/view;
- collapsed/expanded presentation.

It may not:

- start/resume/pause time;
- call SquareCoil clock actions;
- change Pending/Local Pause/ACTIVE state;
- add history.

**Settled**

---

# 14. Transition Families and Focus Rules

## 14.1 Confirmed direct identity change A -> B

When a real normalized native transition changes the positive trackable Context identity from A to B:

```text
A -> B
```

and the authoritative transition has committed/evaluated B:

- emit one incoming focus intent for B;
- ensure B is visible before/with selection;
- select B in each eligible live Companion UI;
- route to the main timer surface when safe;
- expand the Companion when safe;
- never change timing because of the focus action itself.

This applies whether B becomes ACTIVE, PENDING, or a valid recovered LOCAL_PAUSED Context.

**Settled**

## 14.2 Confirmed Context leaves A -> none

```text
A -> none
```

No incoming Context exists, therefore:

- emit no incoming Context focus intent;
- preserve the user's current Selected Context when still viewable;
- preserve collapse/route state unless another owning rule changes it;
- operational/current-context presentation updates to the appropriate idle/native disposition.

Do not select an arbitrary historical Context.

**Settled**

## 14.3 Real re-entry none -> B

When the current runtime has already established a real no-Context state from native leave/clock-out/transition evidence and then positively observes entry into B:

```text
none -> B
```

- emit one incoming focus intent for B after B is represented by the authoritative read revision;
- ensure visible, select, route Main when safe, and expand when safe.

This is a real incoming work-context event, not a same-Context heartbeat.

**Settled**

## 14.4 Leave then later enter A -> none -> B

Treat the boundaries separately.

- A -> none creates no focus target;
- later none -> B creates B focus intent;
- no UI behavior collapses the native gap into a seamless timer interval.

**Settled**

## 14.5 Same A -> A verification / metadata

Same-Context heartbeat, action-7 verification, label/department metadata change, and equivalent same-identity evidence:

- emit no incoming focus intent;
- do not steal selection;
- do not route away from the user's current nested view;
- do not expand a manually collapsed Companion.

**Settled**

---

# 15. Boot and Recovery Are Not Native Entry Events

Initial boot/reload/recovery discovery of an already-current Context must not automatically masquerade as a new native Context entry.

On initial baseline/recovery:

- use L5 initial-selection rules;
- operational Context may become selected when those rules choose it;
- do **not** force expansion solely because the existing Context was rediscovered;
- do not discard current recoverable per-tab inspection intent solely because the runtime restarted;
- controlled reload of the same Context must not recreate a one-time native focus event.

If a genuine native identity transition occurs during recovery and is retained as a newer normalized transition with unique identity, that newer transition may produce a focus intent after recovery reaches a safe compatible revision.

**Settled**

---

# 16. Hidden / Overflow Incoming Context

If incoming B is hidden or overflowed:

1. apply L5 protected/current visibility rules;
2. make B visible before/with selection;
3. choose an eligible overflow candidate if needed;
4. never hide protected operational truth to satisfy the five-job soft cap;
5. temporarily exceed capacity if no safe candidate exists.

Showing B for incoming focus does not itself create time.

**Settled**

---

# 17. Nested Views and Settings During Native Focus

A real native Context change should normally bring the user back to the main timer because the actual work Context changed.

## Safe route

If the current Companion route has no protected uncommitted draft/operation:

- apply the incoming Context focus intent;
- route to Main;
- select incoming Context;
- expand.

This includes ordinary read-only nested views such as Recent, Overview, History, and Context Detail.

## Dirty/protected route

If applying the focus intent would silently discard:

- a materially modified Settings draft;
- an uncommitted L6 conflict/review plan;
- an authoritative L6 commit that is already in progress;

then:

- do not discard or claim cancellation;
- retain the route required by L6/L7 safety;
- store at most the newest eligible deferred focus intent for that UI;
- update operational/current-context indication when the route can safely show it;
- after the protected route reaches a safe exit/terminal state, apply the deferred intent only if it is still current and not superseded by later user selection.

**Settled**

---

# 18. User Action Wins Over Older Deferred Focus

Each UI tracks local selection interaction ordering sufficiently to reject stale automatic focus.

If the user deliberately changes selection **after** an incoming focus intent was created but before that intent is applied:

- the newer user selection wins;
- the older focus intent is discarded for that UI.

A user selection made before the real native transition does not block the newer native focus intent.

This rule prevents delayed events from yanking the UI back after the user already reacted.

**Settled**

---

# 19. Multiple / Stale Focus Intents

Focus intents are idempotent and ordered.

Rules:

- duplicate `focusIntentId` / transition identity is a no-op after first application;
- when B intent is pending and newer real Context C arrives, C supersedes B;
- apply an intent only while the current authoritative operational/native Context still supports its target;
- a late observer/replay event for old B must not steal focus from current C;
- late-joining/recovered tabs do not replay stale historical focus intents merely because B was once current.

Focus intent is transient interaction intent, not durable timer history.

**Settled**

---

# 20. Cross-Tab Focus Behavior

Per-tab selection is normally independent.

A **new real native Context identity change** is the explicit exception allowed to request incoming focus in each live Companion UI.

Each UI independently validates:

- intent freshness;
- current authoritative target;
- local newer user-selection ordering;
- dirty/protected route rules.

Failure or deferral in one tab does not change Timer State and does not prevent another eligible tab from applying the same current focus intent.

**Settled**

---

# 21. Failure Matrix

| Condition | Expected behavior | Recovery / fallback |
|---|---|---|
| Tab read refresh temporarily fails | retain last successful value; do not flash false zero | mark stale/revalidating where appropriate; retry through normal read path |
| Active contribution provisional | show canonical provisional Today | reconcile from later authoritative snapshot; may decrease |
| Safety Hold active | cap tab Today at hold boundary | resume/reconcile only through L4 authoritative resolution |
| Threshold preferences temporarily unavailable but last committed snapshot exists | keep last committed threshold interpretation | update when valid preference revision returns |
| No safe threshold interpretation available | keep time/status readable; suppress/neutralize threshold accent rather than guess | restore when valid thresholds are available |
| Focus intent target not present in compatible read revision | do not fabricate/select missing Context | wait for compatible current revision or discard if superseded |
| Duplicate focus intent | no-op | none |
| Stale B intent after C became current | ignore B | current C remains authoritative |
| Focus intent while dirty Settings/L6 review | defer newest eligible intent | apply after safe exit if still current |
| Focus intent during L6 committing mutation | do not claim cancel/close | preserve terminal operation access; apply later if still current |
| Theme/tab styling fails | time/status remains semantically available | presentation fallback only |
| Workday midnight occurs | Today/threshold roll to new day | no Timer State boundary implied |

**Settled**

---

# 22. L5A Invariants

- **TAB-01:** Visible tab elapsed value means Context Today.
- **TAB-02:** Tab Today comes from the canonical read model, never an independent timer calculation.
- **TAB-03:** ACTIVE current contribution uses the same query boundary as compatible live views.
- **TAB-04:** Pending anchor is never included before valid Resume/Start Fresh.
- **TAB-05:** Local Pause and inactive tabs do not independently advance.
- **TAB-06:** Shared Safety Hold caps every affected tab at the same authoritative boundary.
- **TAB-07:** Provisional tab values may correct downward without altering finalized history.
- **TAB-08:** Threshold is computed from unrounded Context Today using highest matching configured level.
- **TAB-09:** Threshold level and operational status are independent.
- **TAB-10:** Threshold preference changes alter presentation only.
- **TAB-11:** Threshold meaning has a non-color semantic path.
- **FOCUS-01:** Real confirmed A -> B identity change produces one B focus intent after compatible authoritative evaluation.
- **FOCUS-02:** Confirmed A -> none produces no arbitrary focus target.
- **FOCUS-03:** Real none -> B entry produces B focus intent; boot baseline does not impersonate this transition.
- **FOCUS-04:** Same-Context verification/metadata never steals focus or expands manual collapse.
- **FOCUS-05:** Focus intent changes presentation only, never timing.
- **FOCUS-06:** Current hidden/overflow Context becomes visible under the existing soft-cap safety rules.
- **FOCUS-07:** Dirty drafts/in-progress mutations block destructive route loss and may defer focus.
- **FOCUS-08:** Newer explicit user selection beats an older unapplied focus intent.
- **FOCUS-09:** Newer real Context focus intent supersedes older pending intent.
- **FOCUS-10:** Stale/replayed focus intent cannot override current authoritative Context.

**All Settled**

---

# 23. Acceptance Criteria Set

## TAB-A01 Active tab uses Today

**Scenario:** ACTIVE A has 2h finalized historical Today plus 10m valid current contribution; Job Total is 18h.  
**Expected:** A tab represents 2h10m Today, not 18h Job Total.  
**Pass:** tab source value equals canonical Context Today snapshot.  
**Fail:** tab shows/derives lifetime Total as its canonical compact elapsed value.

## TAB-A02 Main/tab snapshot agreement

**Scenario:** ACTIVE A is selected.  
**Expected:** tab Today and Main Today derive from compatible revision/queryAtMs.  
**Pass:** no independent elapsed divergence beyond ordinary formatting/render scheduling.  
**Fail:** tab maintains a separate clock that materially diverges from Main.

## TAB-A03 Inactive tab does not run

**Scenario:** ACTIVE A, inactive B with 45m Today.  
**Expected:** B stays 45m until authoritative B/day data changes.  
**Fail:** B increments merely because a visual ticker exists.

## TAB-A04 Pending anchor excluded

**Scenario:** PENDING A detected 30s ago, committed Today=1h.  
**Expected:** tab Today remains 1h before user choice.  
**Fail:** Pending detection interval appears as accrued Today.

## TAB-A05 Local Pause stable

**Scenario:** LOCAL_PAUSED A at Today=1h20m.  
**Expected:** tab remains stable.  
**Fail:** tab continues counting.

## TAB-A06 Provisional propagation

**Scenario:** ACTIVE A enters verification grace.  
**Expected:** tab may continue from canonical provisional Today and is semantically provisional.  
**Pass:** later conservative correction can reduce the value/threshold without altering finalized history.  
**Fail:** provisional value is presented as irreversible finalized truth.

## TAB-A07 Safety Hold consistency

**Scenario:** A is held at `holdAtMs`.  
**Expected:** tab/Main/aggregate live contribution all cap at same boundary.  
**Fail:** tab continues after Main/authoritative hold.

## TAB-A08 Midnight rollover

**Scenario:** ACTIVE A crosses persisted Workday midnight.  
**Expected:** tab Today becomes new-day contribution and threshold recalculates; Timer State need not change.  
**Fail:** tab carries prior-day Today as if same day or creates a UI-driven timer boundary.

## THR-A01 Boundary equality

**Scenario:** Yellow=60, Orange=120, Red=240.  
**Expected:** exactly 60m -> YELLOW, 120m -> ORANGE, 240m -> RED.  
**Fail:** rounded display or low-to-high evaluation produces an inconsistent level.

## THR-A02 Equal configured limits

**Scenario:** Yellow=Orange=Red=60 and Today=60m.  
**Expected:** RED because highest matching threshold wins.  
**Fail:** result depends on render order or first matching low level.

## THR-A03 Threshold is not operational status

**Scenario:** inactive B has 4h Today.  
**Expected:** B remains NOT_RUNNING while threshold=RED.  
**Fail:** red threshold causes B to appear Running, failed, or as a SquareCoil error.

## THR-A04 Preference revision

**Scenario:** Today unchanged; limits change through successful Settings commit.  
**Expected:** threshold recalculates from new committed limits without Timer/Ledger mutation.  
**Fail:** limit edit creates timer history or an unsaved draft changes authoritative presentation.

## THR-A05 Accessibility

**Scenario:** user cannot distinguish tab accent color.  
**Expected:** threshold level remains available through a non-color semantic path and remains separate from operational status.  
**Fail:** color is the only way to determine threshold meaning.

## FOC-A01 Direct A -> B

**Scenario:** real confirmed native Context switch A -> B commits B as ACTIVE or PENDING.  
**Expected:** one current B focus intent; B visible, selected, Main route/expanded when safe.  
**Fail:** no focus occurs, a stale A remains selected without intentional blocking, or selection action changes timing.

## FOC-A02 A -> none

**Scenario:** real leave/clock-out removes A.  
**Expected:** no arbitrary incoming focus; current selected historical Context remains viewable when valid.  
**Fail:** UI picks another recent Context merely because operational state became none.

## FOC-A03 none -> B real entry

**Scenario:** runtime already observed real no-Context state, then B becomes current.  
**Expected:** one B focus intent after compatible authoritative evaluation.  
**Fail:** B remains hidden/overflowed or UI confuses entry with a timer command.

## FOC-A04 A -> none -> B

**Scenario:** separate leave and later entry.  
**Expected:** no focus target at leave; B focus at later entry; native timing gap remains separate.  
**Fail:** UI/timer treats it as seamless A -> B continuity solely for focus convenience.

## FOC-A05 Same A verification

**Scenario:** A heartbeat/action-7/metadata update while user inspects B or widget is collapsed.  
**Expected:** no selection steal and no forced expand.  
**Fail:** same identity refresh repeatedly reopens/focuses A.

## FOC-A06 Boot baseline

**Scenario:** extension reloads while SquareCoil is already on A and user had a valid collapsed/inspection disposition.  
**Expected:** baseline reconciliation follows initial-selection/recovery rules; no fake new-entry expand event.  
**Fail:** every reload is treated as a fresh native A entry.

## FOC-A07 Hidden incoming B

**Scenario:** B is hidden/overflowed and becomes real current Context.  
**Expected:** B is shown; safe overflow rules apply; protected truth is not hidden.  
**Fail:** B remains inaccessible because five-tab capacity is treated as hard.

## FOC-A08 Dirty Settings draft

**Scenario:** user edits a Ticket or Timer Limits draft, then real A -> B occurs.  
**Expected:** draft is not silently discarded; newest B focus intent is deferred while operational truth remains available.  
**Fail:** native focus destroys the draft without a loss decision.

## FOC-A09 Deferred intent superseded

**Scenario:** B focus is deferred, then real B -> C occurs.  
**Expected:** only newest eligible C intent remains.  
**Fail:** closing Settings later yanks UI to stale B.

## FOC-A10 Newer user selection wins

**Scenario:** B intent exists but before it applies the user deliberately selects D.  
**Expected:** D remains selected; old B intent is dropped for that UI.  
**Fail:** delayed B intent overrides newer user choice.

## FOC-A11 Cross-tab

**Scenario:** two live Companion tabs inspect different historical Contexts; real native A -> B occurs.  
**Expected:** each eligible UI may apply the same current B focus intent after its own stale/draft checks; Timer State changes only once through authoritative writer.  
**Fail:** observer UI writes timing or stale replay later steals focus.

## FOC-A12 A4 real interaction

**Scenario:** packaged extension in supported Chromium profile with synthetic/controlled SquareCoil transitions.  
**Expected:** tab controls remain clickable/reorderable/selectable; live tab Today updates; real switch focuses incoming; heartbeat does not steal focus.  
**Pass:** actual installed-browser behavior matches L5A.  
**Fail:** unit-only success masks dead/unresponsive tab interaction.

---

# 24. Acceptance Layer Additions

L8 acceptance is extended by this delta as follows.

## A2 Unit

Add deterministic tests for:

- canonical tab Today projection by Timer State;
- threshold high-to-low equality behavior;
- provisional and hold tab projection;
- midnight Today rollover projection;
- focus-intent transition classification;
- focus-intent stale/dedup ordering;
- local-user-selection precedence;
- dirty-route deferral decision.

## A3 Integration

Add flows:

```text
L4/L2 authoritative snapshot -> L5 read model -> tab Today + threshold
```

```text
real Bridge transition -> L4 committed incoming Context -> focus intent -> UI selection/visibility only
```

```text
preference threshold commit -> read model -> tab accent without Timer mutation
```

```text
dirty Settings route + real Context transition -> deferred focus -> safe later application
```

## A4 Browser

Add mandatory behavior checks for:

- visible live tab Today;
- threshold accent + non-color meaning;
- drag reorder/select/hide remain timing-neutral;
- real A -> B focus/expand;
- real none -> B re-entry focus;
- same-Context heartbeat does not steal focus or reopen collapse;
- dirty Settings draft is not silently discarded by native focus;
- installed tab interactions are actually responsive.

**Settled**

---

# 25. Implementation Readiness Assessment

## Decision

**Ready** for implementation of this logic delta under the existing staged gates.

## Active downstream target

Builder/Codex-supported implementation is compatible because the behavior, state boundary, stale rules, failure rules, and acceptance cases are explicit.

## Resolved logic areas

- canonical compact tab time quantity;
- active/pending/paused/inactive tab behavior;
- provisional and Safety Hold behavior;
- threshold calculation and equality;
- threshold/status coexistence;
- threshold accessibility requirement;
- direct switch/leave/re-entry/same-context focus rules;
- boot/recovery distinction;
- hidden/overflow behavior;
- dirty-route deferral;
- stale/duplicate/cross-tab focus behavior;
- A2/A3/A4 acceptance additions.

## Open logic blockers

None for L5A.

## Assumptions carried forward

- L2 Workday/Today calculations remain settled and authoritative.
- L4 transition/evidence rules remain settled and authoritative.
- L7 dirty-draft and Data Mutation Lock behavior remains settled.
- Optional Cinematic/Design Dashboard profiles remain deferred unless separately activated.

## Stage boundary

This delta does **not** waive the existing requirement to finish canonical B2 before treating B3 workspace implementation as canonical/complete.

**Logic delta settled.**
