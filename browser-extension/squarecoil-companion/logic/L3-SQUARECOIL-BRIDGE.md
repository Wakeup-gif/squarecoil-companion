# SquareCoil Companion Rebuild
## Logic Stage L3: SquareCoil Bridge and Native Clock Interpretation

**Status:** Settled — ready for L4  
**Logic stage:** L3  
**Depends on:** L0 invariants, L1 lifecycle, L2 state/time/migration  
**Framework authority:** `docs/REBUILD-MASTER-PLAN.md`  
**Purpose:** Define how SquareCoil native clock evidence becomes normalized Companion observations without letting the Bridge own Timer State, write the Time Ledger, or invent company-clock truth.

---

# 1. Scope and Ownership

L3 owns:

- native clock evidence sources;
- read-only server verification;
- native clock-action observation;
- DOM clock observation;
- Job/General Context parsing;
- evidence precedence, freshness, and certainty;
- Transition Candidates;
- exact/native-confirmed vs detected boundaries;
- same-project department/label changes;
- full clock-out vs leaving a project Context;
- negative/no-context confirmation;
- contradictory/unknown observations;
- event deduplication/coalescing;
- Bridge health/fallback modes;
- initial/focus/visibility/heartbeat verification;
- Bridge teardown.

L3 does **not**:

- clock the user in or out of SquareCoil;
- own Shared Timer State;
- write Time Ledger records;
- decide Resume / Start Fresh / Local Pause transitions;
- own cross-tab accrual coordination;
- render Companion UI.

> The Bridge answers: **What does current SquareCoil evidence support right now?**  
> It does not answer: **What should the Companion timer do about it?**

---

# 2. Read-Only Contract

The Bridge must not initiate SquareCoil clock mutations.

Known relevant native actions:

```text
action 2 = full company clock-out
action 3 = clock into / change project or department
action 4 = leave current project context
action 7 = read-only current header/context verification
```

The Bridge may call known read-only verification such as action 7. Native state-changing actions remain SquareCoil/user-owned.

**Settled**

---

# 3. Native Evidence Classes

The Bridge recognizes four evidence classes:

```text
A. Native mutation-completion evidence
B. Read-only server snapshot evidence
C. Native clock DOM evidence
D. Passive user-action hint evidence
```

## 3.1 Native mutation completion

A successfully observed relevant native mutation completion creates a **Transition Candidate**.

It does not itself create Timer State or fabricate the resulting Context.

## 3.2 Read-only server snapshot

A fresh, successful, parseable action-7 response is the preferred normal current-context evidence.

It may provide:

- project link;
- project ID;
- Context label;
- no-context result;
- malformed/unknown result.

## 3.3 Native DOM evidence

Audited clock-specific DOM includes:

```text
#clockin
#clockout
#clockin-debug
#clockin-remaining-time
.timeclock-container
```

DOM may identify Context or negative-state candidates and trigger verification, but is not assumed synchronous with the server.

## 3.4 Passive click hints

Clicks on native `.clock-actions` controls are **hints only**.

A click may schedule DOM/server verification but cannot establish:

- successful clock-in;
- successful clock-out;
- exact transition time;
- resulting Context.

The Bridge must not call `preventDefault` or `stopPropagation` on native clock controls.

**Settled**

---

# 4. Known Native Action Classification

| Action | Known role | Bridge treatment |
|---|---|---|
| 1 | open clock-in flow/modal | hint only |
| 2 | full clock-out | mutation-completion candidate |
| 3 | clock into/change project/department | mutation-completion candidate |
| 4 | leave project context | mutation-completion candidate |
| 5 | department-name lookup | metadata only |
| 7 | current header/context refresh | read-only verification |
| 8 | clock modal refresh | no clock-state event |
| 9 | project-specific clock modal | no clock-state event |
| 12 | project clock-in validation | no clock-state event |
| 13 | closed-job modal | no clock-state event |
| 14 | pending confirmation modal | no clock-state event |
| 17 | unrelated Product-of-the-Week flow | ignored |
| 19 | remaining-time/popup behavior | not clock-context authority |

Unknown actions are ignored until explicitly audited.

---

# 5. Transition Candidate

A Transition Candidate is temporary Bridge evidence for one native mutation episode.

Logical fields:

```text
candidateId
nativeAction
completedAtMs
requestProjectId when safely parseable
requestDepartment when safely parseable
priorConfirmedContextId
sourceRuntimeId
verificationStatus
```

A candidate exists to:

- trigger fast verification;
- preserve a useful native-completion boundary;
- correlate DOM/server evidence caused by one action.

A candidate is consumed or expires when:

- compatible resulting state is confirmed and the boundary is attached once;
- a newer relevant native mutation supersedes it;
- fresh contradictory evidence proves it cannot describe the transition;
- its bounded correlation window expires;
- Bridge teardown occurs.

Expired, consumed, contradicted, or superseded candidates cannot donate timestamps to unrelated later Context changes.

The exact correlation-window duration is configurable implementation policy.

**Settled**

---

# 6. Certainty Vocabulary

Current-state certainty and boundary certainty are separate dimensions.

## 6.1 `stateCertainty`

```text
VERIFIED_SERVER
NATIVE_CONFIRMED_POSTSTATE
OBSERVED_DOM
FALLBACK
UNKNOWN
CONFLICT
```

- `VERIFIED_SERVER`: fresh parseable server evidence positively supports current state.
- `NATIVE_CONFIRMED_POSTSTATE`: successful relevant native mutation completion plus compatible fresh post-state evidence.
- `OBSERVED_DOM`: fresh audited clock DOM positively supports current state without fresh server confirmation.
- `FALLBACK`: usable state exists only through a reduced Bridge capability mode.
- `UNKNOWN`: evidence is insufficient.
- `CONFLICT`: fresh evidence materially disagrees.

## 6.2 `boundaryCertainty`

```text
NATIVE_CONFIRMED
DETECTED
NONE
```

- `NATIVE_CONFIRMED`: successful native mutation completion correlated with compatible resulting state.
- `DETECTED`: transition discovered through observation without a correlated successful native completion.
- `NONE`: no transition boundary is asserted.

A user click timestamp is never an exact/native-confirmed boundary.

**Settled**

---

# 7. Normalized Observations

The Bridge produces one of:

```text
CONTEXT
CLOCKED_OUT
NO_TRACKABLE_CONTEXT
STATE_UNKNOWN
STATE_CONFLICT
```

These are observations, not Companion timer states.

## 7.1 `CONTEXT`

Payload supports:

```text
context
observedAtMs
source
stateCertainty
boundaryAtMs when applicable
boundaryCertainty
verificationId
```

## 7.2 `CLOCKED_OUT`

Evidence supports full company clock-out.

## 7.3 `NO_TRACKABLE_CONTEXT`

Evidence supports that a previous Job/General Context is no longer present, without claiming full company clock-out.

## 7.4 `STATE_UNKNOWN`

Bridge is operational but current evidence is insufficient.

## 7.5 `STATE_CONFLICT`

Fresh evidence materially disagrees and cannot yet be safely resolved.

**Settled**

---

# 8. Semantic Bridge Events

Conceptual events:

```text
CONTEXT_DETECTED
CONTEXT_CHANGED
CONTEXT_VERIFIED
CONTEXT_METADATA_UPDATED
CONTEXT_LEFT
CLOCKED_OUT
STATE_UNKNOWN
STATE_CONFLICT
BRIDGE_HEALTH_CHANGED
```

## 8.1 Verification and `lastVerifiedAtMs`

`CONTEXT_VERIFIED` is eligible to advance L2 `lastVerifiedAtMs` only when fresh positive evidence supports the same Context.

Eligible:

- `VERIFIED_SERVER`;
- `NATIVE_CONFIRMED_POSTSTATE`;
- strong audited `OBSERVED_DOM`;
- `FALLBACK` when the fallback source positively identifies the same Context and Bridge capability is otherwise healthy.

Not eligible:

- last-known Context without fresh evidence;
- `UNKNOWN`;
- `CONFLICT`;
- passive clicks;
- stale evidence;
- unconfirmed negative candidates.

The state service remains the only writer of `lastVerifiedAtMs`.

Verification alone creates no timer boundary.

**Settled**

---

# 9. Context Parsing

## 9.1 Job Context

Preferred identity comes from a valid clock-specific SquareCoil project ID, for example:

```text
project.php?id=260702
→ job:260702
```

When no link/request ID is available, an audited clock-specific label may provide an unambiguous six-digit fallback job ID.

Arbitrary page text/project links must never become current clock Context evidence.

Same `projectId` + changed label/department = same Job Context.

## 9.2 Production General

`Production (General)` is a first-class stable General Context.

`project.php?id=0` is not `job:0`.

Conceptual identity:

```text
general:production-general
```

## 9.3 Other General Contexts

Unknown non-job labels do **not** automatically become durable General Contexts.

A General Context is recognized only when:

- it comes from an audited clock-context source; and
- it matches an explicitly supported/normalized General-context rule in the Bridge parser contract.

Unaudited phrases remain unclassified until intentionally added.

Generic UI phrases such as `Clock In`, `Change / Clock Out`, `Close`, or `Time Remaining` are not Context identities.

## 9.4 `data-time` rule

Empty-looking `#clockin-remaining-time[data-time]` values such as `||` or `||||` do not prove clock-out/no Context.

Production General may be valid while those values appear empty.

**Settled**

---

# 10. DOM Snapshot Parsing

Parse in this order:

1. positive Job/General Context from `#clockin-remaining-time`;
2. compatible `#clockin-debug` fallback;
3. if valid Context exists → `CONTEXT`;
4. otherwise inspect stable native clock-control visibility;
5. visible `#clockin` with `#clockout` not visible → strong `CLOCKED_OUT` candidate;
6. visible `#clockout` with no trackable Context → `NO_TRACKABLE_CONTEXT` candidate;
7. otherwise → `STATE_UNKNOWN`.

Negative candidates still require the confirmation rules below.

---

# 11. Server Snapshot Parsing

A successful action-7 response is parsed as clock/header HTML.

- positive parseable Context → `CONTEXT`, `VERIFIED_SERVER`;
- empty/no Context → negative candidate, not automatic clock-out;
- malformed result → `STATE_UNKNOWN`, never clock-out.

---

# 12. Evidence Freshness and Server Request Generations

Every evidence item carries capture/completion time.

Every action-7 request also belongs to the Bridge generation and transition episode that initiated it.

Logical request metadata:

```text
bridgeGeneration
requestId
requestStartedAtMs
candidateId when correlated
stateSequenceAtStart
```

Rules:

- late DOM callbacks from older state are stale;
- responses from older Bridge generations are stale;
- a request begun before a newer confirmed native mutation cannot overwrite that newer transition merely because it returns later;
- superseded responses may be retained for diagnostics but cannot become current truth;
- ambiguous correlation triggers fresh verification instead of reusing late data.

A syntactically valid response can still be stale.

**Settled**

---

# 13. Evidence Precedence

For positive current Context identity:

```text
1. fresh action-7/server positive Context
2. native mutation candidate + matching fresh post-state
3. fresh audited clock-DOM positive Context
4. older previously confirmed Context as last-known evidence only
```

A single empty server response does not erase a fresh positive DOM Context. Negative evidence uses separate confirmation rules.

---

# 14. Native Action 3: Project / Department Change

Successful action 3 creates a Context-mutation candidate.

Bridge then verifies resulting SquareCoil state.

## 14.1 New project identity

Prior Job A + verified Job B:

```text
emit CONTEXT_CHANGED
boundaryAtMs = correlated action-3 completion
boundaryCertainty = NATIVE_CONFIRMED
```

## 14.2 Same project, department/label change

If verified project identity remains the same:

- no `CONTEXT_CHANGED`;
- no timer/session boundary;
- emit `CONTEXT_VERIFIED` and/or metadata update;
- preserve Job Total/session continuity.

**Settled**

---

# 15. Native Action 4: Leave Project Context

Successful action 4 means SquareCoil accepted leaving the current project Context.

It does not automatically mean full company clock-out.

Post-state:

- different valid Context already present → normal Context transition;
- confirmed no trackable Context → `CONTEXT_LEFT`;
- full clock-out only when clock-out evidence exists.

The action-4 completion may provide the leave boundary.

## 15.1 Distinct native mutations remain distinct boundaries

Evidence coalescing may merge duplicate signals describing the **same** native transition, but must not merge separate successful native mutations that represent different real intervals.

Example:

```text
10:00:00 action 4 leaves Job A
10:00:20 action 3 enters Job B
```

If both transitions are confirmed:

- 10:00:00 is the leave-A boundary;
- 10:00:20 is the enter-B boundary;
- the 20-second no-trackable-context interval remains real;
- the Bridge must not collapse them into one direct A → B boundary.

**Settled**

---

# 16. Native Action 2: Full Clock-Out

Successful action 2 creates a full-clock-out candidate.

Handling:

- successful action 2 + compatible fresh post-state → confirmed `CLOCKED_OUT`, `NATIVE_CONFIRMED` boundary;
- successful action 2 + fresh contradictory post-state → `STATE_CONFLICT` + bounded re-verification;
- successful action 2 + temporarily unavailable post-state → retain **strong unconfirmed clock-out transition evidence** and request re-verification.

Temporary verification failure does not erase evidence that SquareCoil accepted action 2, but the Bridge does not label current state confirmed `CLOCKED_OUT` until confirmation criteria are met.

L4 may use strong unconfirmed transition evidence conservatively for accrual safety.

A click without successful native completion remains only a hint.

**Settled**

---

# 17. Negative State Confirmation

Negative evidence requires more confirmation than positive Context evidence.

## 17.1 Correlated native mutation

For successful action 2/action 4 candidates, one compatible post-state may confirm the native transition. Conflicting evidence triggers re-verification.

## 17.2 Passive negative detection

Without correlated native mutation, `CLOCKED_OUT` / `NO_TRACKABLE_CONTEXT` requires either:

- two consistent read-only server/DOM observations separated by a short interval; or
- one strong stable DOM result plus one compatible independent observation.

The exact delay is configurable; the two-step confirmation rule is behavioral.

---

# 18. `CLOCKED_OUT` vs `NO_TRACKABLE_CONTEXT`

```text
CLOCKED_OUT != NO_TRACKABLE_CONTEXT
```

Leaving a project Context must not be represented as a company clock-out unless evidence supports full clock-out.

---

# 19. Conflict and Unknown State

## 19.1 Conflict

When fresh evidence supports incompatible states:

1. do not fabricate a transition;
2. emit/hold `STATE_CONFLICT`;
3. retain prior Context only as **last confirmed**;
4. schedule bounded re-verification;
5. emit the resolved semantic event only after evidence converges.

## 19.2 Unknown

`STATE_UNKNOWN` must not:

- create a Context;
- emit clock-out;
- advance `lastVerifiedAtMs`;
- start a session;
- silently finalize a session.

---

# 20. Bridge Capability Modes

```text
FULL
DOM_FALLBACK
SERVER_FALLBACK
UNAVAILABLE
```

- `FULL`: action observation + server + DOM usable.
- `DOM_FALLBACK`: server unavailable, audited DOM usable.
- `SERVER_FALLBACK`: DOM unavailable, server verification usable.
- `UNAVAILABLE`: neither trusted path is usable; report health failure to L1.

A healthy Bridge may truthfully report `STATE_UNKNOWN` without being unavailable.

---

# 21. Native Observation Hooks

The Bridge may use:

- jQuery/native AJAX completion observation when available;
- passive capture click hints;
- a page-level MutationObserver restricted to native clock elements;
- initial action-7 verification;
- focus/visibility verification;
- periodic heartbeat;
- explicit diagnostic/manual sync.

These are evidence mechanisms, not Timer State owners.

The Bridge must not monkey-patch SquareCoil behavior to mutate native clock logic.

---

# 22. Verification Coalescing and Heartbeat

Verification requests are single-flight/coalesced.

Default visible-page heartbeat is approximately 60 seconds and configurable.

To reduce duplicate traffic:

- L2 coordination OWNER normally performs periodic server heartbeat verification;
- observers still watch their local clock DOM/native events;
- observer event-driven verification is allowed when user/native activity occurs in that tab.

Heartbeat timing is never elapsed-time authority.

---

# 23. Event Ordering and Deduplication

Each Bridge generation maintains monotonic observation ordering, conceptually:

```text
bridgeSeq
observationId
observedAtMs
transitionCandidateId
source
```

Many signals may describe one transition:

```text
click
AJAX completion
DOM mutation
action-7 verification
focus
```

Duplicate evidence for one transition is coalesced into one semantic transition.

**But distinct successful native mutations are never coalesced into one boundary.**

Late stale evidence cannot overwrite newer confirmed state.

---

# 24. Bridge Teardown Contract

Bridge teardown is lifecycle-owned and idempotent.

It releases or invalidates all Bridge-owned resources, including:

- jQuery/AJAX subscriptions;
- passive/capture click listeners;
- native clock MutationObserver;
- heartbeat intervals/timeouts;
- focus/visibility listeners;
- debounce/coalescing timers;
- in-flight verification generation ownership;
- Transition Candidates;
- Bridge-local subscriptions.

After teardown:

- old callbacks cannot emit current Bridge events;
- late action-7 responses from the old generation are stale;
- reinitialization leaves exactly one current Bridge listener/observer/timer set.

If safety-critical Bridge resources cannot be proven released, L1 requires reload rather than stacking a replacement Bridge.

**Settled**

---

# 25. Observation → Timer State Boundary

The Bridge never directly writes L2 Shared Timer State or Time Ledger.

Conceptually:

```text
Bridge event
   ↓
stateService.acceptSquareCoilObservation(event)
   ↓
L4 transition rules
   ↓
authoritative L2 transaction
```

This preserves one state writer.

---

# 26. Bridge Invariants

- **BRIDGE-01:** Bridge is observational and never clocks users in/out.
- **BRIDGE-02:** User click is never authoritative state.
- **BRIDGE-03:** Successful mutation completion is a Transition Candidate, not automatically the resulting Context.
- **BRIDGE-04:** Fresh positive server Context outranks stale DOM evidence.
- **BRIDGE-05:** Negative/no-context evidence requires confirmation unless correlated with native mutation.
- **BRIDGE-06:** `CLOCKED_OUT` and `NO_TRACKABLE_CONTEXT` are distinct.
- **BRIDGE-07:** Same project ID + new label/department is the same Job Context.
- **BRIDGE-08:** Empty `data-time` cannot prove no Context.
- **BRIDGE-09:** Failed/malformed server verification cannot become clock-out.
- **BRIDGE-10:** Unknown/conflict does not advance verification time.
- **BRIDGE-11:** Stale evidence cannot overwrite newer confirmed state.
- **BRIDGE-12:** Duplicate signals for one transition produce one semantic transition.
- **BRIDGE-13:** Bridge output cannot directly append/finalize Ledger data.
- **BRIDGE-14:** Arbitrary page text/project links cannot become Context evidence.
- **BRIDGE-15:** Production General is one stable General Context and never `job:0`.
- **BRIDGE-16:** Deduplication must never merge distinct successful native mutations representing separate real intervals.
- **BRIDGE-17:** Expired/superseded/consumed candidates cannot donate boundary timestamps to unrelated transitions.
- **BRIDGE-18:** Teardown invalidates prior-generation callbacks, requests, candidates, and subscriptions.

**All Settled**

---

# 27. Acceptance Scenarios

1. Fresh action-7 numbered Job → one `CONTEXT_DETECTED`.
2. Production General → General Context, never `job:0`.
3. Empty `data-time` + Production General → Context remains valid.
4. Same Job department change → metadata/verification only, no timer boundary.
5. Job A → Job B via successful action 3 + verification → one native-confirmed Context change.
6. Native click canceled/fails → no transition solely from click.
7. Successful action 2 + compatible post-state → confirmed clock-out boundary.
8. Successful action 4 + confirmed no Context → `CONTEXT_LEFT`, not company clock-out.
9. One transition episode directly yields Job B → no fake intermediate company clock-out.
10. Passive DOM negative → two-step confirmation before final negative event.
11. One empty server response while DOM still shows Job A → no Context-left transition.
12. Fresh server A vs fresh DOM B → conflict, no guessed switch.
13. Conflict resolves to B → one resolved transition.
14. Malformed action-7 response → unknown, not clock-out.
15. Server unavailable + valid audited DOM → `DOM_FALLBACK`.
16. DOM unavailable + valid server → `SERVER_FALLBACK`.
17. Both unavailable → Bridge `UNAVAILABLE`, no guessed Context.
18. Focus after background → fresh verification, no blind re-verification of prior state.
19. Late stale response → cannot overwrite newer confirmed state.
20. Multiple same-state triggers → coalesced verification.
21. Generic clock UI phrase → no fabricated General Context.
22. Audited six-digit clock-label fallback → lower-provenance Job identity allowed.
23. Arbitrary body project link → not current Context evidence.
24. `CONTEXT_CHANGED` event itself writes no Ledger data.
25. Separate action 4 at T1 and action 3 at T2 → preserve both boundaries and real gap.
26. Expired candidate → cannot attach timestamp to later unrelated Context.
27. Older action-7 request returning after a newer transition → rejected as superseded.
28. Fresh audited DOM-only same-Context evidence → may advance `lastVerifiedAtMs`, no native boundary.
29. Successful action 2 + temporarily unavailable verification → retain strong unconfirmed clock-out evidence; do not prematurely confirm current state.
30. Unknown unaudited General label → no durable General Context automatically created.
31. Bridge teardown + reinit → exactly one current listener/observer/heartbeat set; old-generation callbacks cannot emit current events.

---

# 28. Continuity States After L3

## Settled

- Bridge is read-only with respect to native clock mutation;
- action 7 is preferred current server snapshot;
- actions 2/3/4 create Transition Candidates;
- clicks are hints only;
- canonical `stateCertainty` and `boundaryCertainty` vocabularies;
- Job / Production General parsing rules;
- unknown General labels do not become durable Contexts without parser-contract support;
- `data-time` emptiness is not Context authority;
- positive vs negative evidence rules;
- full clock-out vs no-trackable-context distinction;
- same-project department change continuity;
- Transition Candidate expiry/supersession/consumption;
- server request generation/supersession;
- stale evidence rejection;
- conflict/unknown handling;
- strong unconfirmed action-2 evidence handling;
- duplicate-signal coalescing without merging distinct native transitions;
- Bridge fallback modes;
- Bridge teardown and old-generation invalidation;
- no direct Timer State/Ledger mutation.

## Provisional

- exact debounce/negative-confirmation delays;
- exact Transition Candidate correlation-window duration;
- exact heartbeat tuning around ~60 seconds;
- exact DOM selectors if SquareCoil changes;
- exact implementation mechanism if jQuery/request mechanics change;
- metadata alias richness.

## Open for later stages

- how L3 events transition Active/Pending/Local Pause (L4);
- conservative accrual/session ending during prolonged unknown/conflict or strong unconfirmed clock-out evidence (L4);
- Resume / Start Fresh after recovered/changed Context (L4);
- user-facing unknown/degraded wording (L5/L7);
- automated Bridge fixtures (L8/build).

## Blocked

None.

---

# 29. L3 Readiness Judgment

**Status: Settled — ready for L4**

L3 now defines native evidence interpretation strongly enough that L4 should not need to invent Bridge semantics, certainty rules, action correlation, stale-response handling, General-context safety, or teardown behavior.

Next stage:

**L4: Core Timer Behavior**
