# SquareCoil Companion Rebuild
## Logic Stage L4: Core Timer Behavior

**Status:** Settled — ready for L5  
**Logic stage:** L4  
**Depends on:** L0 invariants, L1 lifecycle, L2 state/time/migration, L3 SquareCoil Bridge  
**Framework authority:** `docs/REBUILD-MASTER-PLAN.md`  
**Purpose:** Define how normalized SquareCoil observations and explicit Companion actions change authoritative Timer State and Time Ledger behavior without allowing UI, Bridge, or secondary tabs to become alternate state writers.

---

# 1. Scope and Ownership

L4 owns:

- new Context start behavior;
- remembered Context Pending behavior;
- Pending verification continuity;
- Resume and Start Fresh;
- Local Pause and Local Resume;
- native Context switching, leave, and clock-out;
- same-Context verification;
- unknown/conflict safety behavior;
- strong unconfirmed clock-out behavior;
- shared Accrual Safety Hold behavior;
- conservative transition boundaries;
- controlled reload/disable behavior;
- interrupted-session recovery;
- selected vs active isolation;
- native Context focus/expand intent;
- timer threshold semantics;
- destructive-action protection;
- cross-tab command timestamp validation;
- session start/end provenance.

L4 does **not** interpret raw SquareCoil DOM/AJAX evidence, own persistence technology, define Time Overview presentation, or define L6 archive/backup/delete workflows.

> L3 says what SquareCoil evidence means. L4 says what the Companion timer does with it.

---

# 2. Authoritative Mutation Rule

Every timer transition goes through the single fenced state service defined by L2.

A timer transaction may atomically affect:

- Shared Timer State;
- Time Ledger Segments;
- Job/Context Index metadata;
- Recovery Checkpoint;
- revision/commit/fencing metadata.

No UI handler, Bridge handler, workspace feature, or observer tab directly edits timer JSON or appends time.

**Settled**

---

# 3. Canonical Operational Timer States

Committed Timer State is exactly one of:

```text
IDLE
ACTIVE(contextId)
PENDING(contextId)
LOCAL_PAUSED(contextId)
```

Mapping:

```text
IDLE         active=null, pending=null, localPause=null
ACTIVE       active!=null, pending=null, localPause=null
PENDING      active=null, pending!=null, localPause=null
LOCAL_PAUSED active=null, pending=null, localPause!=null
```

`Selected Context` remains UI/view state only.

An **Accrual Safety Hold** is not a fifth timer state. It is authoritative shared metadata attached to `ACTIVE` that caps its current running contribution.

**Settled**

---

# 4. SquareCoil Context vs Timer State

Valid combinations include:

```text
SquareCoil A + ACTIVE A
SquareCoil A + PENDING A
SquareCoil A + LOCAL_PAUSED A
SquareCoil A + IDLE briefly during reconciliation
SquareCoil no Context + IDLE
```

A committed `ACTIVE B` while fresh SquareCoil evidence positively supports A is invalid and must reconcile before further accrual.

**Settled**

---

# 5. Remembered Context Test

A Context is remembered when authoritative prior Companion time is greater than zero:

```text
remembered = attributed Ledger duration > 0
          or legacyUnattributedMs > 0
```

A Job Index record alone does not make a Context remembered.

**Settled**

---

# 6. Safe Start Anchor

For a new session caused by SquareCoil observation, choose the newest trustworthy start point in this order:

```text
1. compatible NATIVE_CONFIRMED boundaryAtMs
2. compatible DETECTED boundaryAtMs
3. fresh observedAtMs
```

A start anchor may never predate what evidence supports. A click timestamp alone is never a valid SquareCoil start anchor.

**Settled**

---

# 7. New Zero-History Context

If SquareCoil positively supports Context B, B has zero prior authoritative time, and no valid state must be preserved:

1. ensure B exists in the Context Index;
2. create new `cycleId` and `sessionId`;
3. set `ACTIVE(B)`;
4. set `startedAtMs = safeStartAnchor`;
5. initialize verification metadata only from L3-eligible evidence;
6. update Recovery Checkpoint;
7. commit once.

A true zero-history Context auto-starts. No Resume prompt is shown.

**Settled**

---

# 8. Remembered Context Detection

If SquareCoil positively supports remembered Context B and no valid Local Pause recovery applies:

- do not auto-start;
- enter `PENDING(B)`;
- capture a safe start anchor;
- begin Pending continuity tracking;
- offer Resume / Start Fresh when verification permits;
- accrue no Companion time while Pending.

**Settled**

---

# 9. Pending Record and Verification Continuity

Pending must support at least:

```text
contextId
safeStartAnchorMs
lastContinuityVerifiedAtMs
continuityState = VALID | BROKEN | UNKNOWN
detectedAtMs
source
boundaryCertainty
createdAtMs
```

The original Pending anchor remains usable only while current SquareCoil evidence supports continuous presence of the same Context.

## 9.1 Continuity remains valid

Fresh eligible same-Context verification updates `lastContinuityVerifiedAtMs`. If verification gaps remain within the timer verification-grace policy and no contrary transition evidence exists, the original Pending anchor remains valid.

## 9.2 Continuity becomes broken

If the same Context cannot be positively verified for longer than the grace policy, or Bridge evidence indicates an unresolved transition/conflict:

- mark Pending continuity `BROKEN` or `UNKNOWN`;
- do not retroactively cover the unverified gap;
- when the same Context is later freshly verified, replace the pending safe start anchor with that new safe evidence anchor;
- remain Pending until the user chooses Resume / Start Fresh.

A long-unverified Pending interval is never silently backfilled merely because the Context later looks the same.

**Settled**

---

# 10. Resume from Pending

Resume is valid only when:

1. state is `PENDING(A)`;
2. fresh SquareCoil evidence positively supports A;
3. Bridge is sufficiently healthy;
4. writer/fencing ownership is valid;
5. the Pending anchor represents the current verified continuity period.

If valid:

- create new `sessionId`;
- continue the existing logical `cycleId` when meaningful, otherwise create one;
- start at the current valid Pending safe anchor;
- clear Pending;
- set `ACTIVE(A)`;
- preserve all prior historical time.

If Pending continuity was broken, Resume starts from the refreshed safe anchor, not from the original old detection time.

**Settled**

---

# 11. Start Fresh from Pending

Start Fresh uses the same verification/continuity requirements as Resume.

If valid:

- preserve all prior Ledger history and `legacyUnattributedMs`;
- preserve Job/Context Total;
- create a **new `cycleId`** and new `sessionId`;
- start at the current valid Pending safe anchor;
- clear Pending;
- set ACTIVE for the same Context.

```text
Resume      = continue prior logical cycle when meaningful
Start Fresh = begin a new logical cycle
```

Start Fresh never resets historical Job Total.

**Settled**

---

# 12. Stale Pending Action

If Resume/Start Fresh arrives after SquareCoil or authoritative state moved away from Pending A:

- reject it as stale;
- create no session;
- add no time;
- return normalized rejection so UI refreshes.

**Settled**

---

# 13. Local Pause

Local Pause is valid only for current `ACTIVE(A)` and a current valid writer command targeting that session.

It never calls a SquareCoil clock API.

Transaction:

1. validate the command timestamp under Section 35;
2. choose the validated Local Pause boundary;
3. if an earlier Safety Hold exists, do not finalize beyond the hold;
4. finalize current session through the valid boundary;
5. append day-split Ledger Segments;
6. clear ACTIVE;
7. create `LOCAL_PAUSED(A)` preserving `cycleId`;
8. update checkpoint;
9. commit once.

**Settled**

---

# 14. Local Pause Verification

While `LOCAL_PAUSED(A)` and SquareCoil continues to support A:

- no Companion time accrues;
- same-Context verification never auto-resumes;
- metadata may update;
- Local Pause survives ordinary page reload/restart reconciliation when still compatible.

**Settled**

---

# 15. Local Resume

Local Resume requires:

- `LOCAL_PAUSED(A)`;
- fresh positive SquareCoil support for A;
- healthy-enough Bridge verification;
- valid fenced writer ownership.

If valid:

- create new `sessionId`;
- preserve prior `cycleId`;
- start at validated Local Resume user-action time;
- clear Local Pause;
- set ACTIVE A;
- never backfill the locally paused interval.

If SquareCoil no longer supports A, reject Resume.

**Settled**

---

# 16. Direct Native Context Switch A → B

On one L3 `CONTEXT_CHANGED A → B` transition:

If ACTIVE A:

1. finalize A using Section 25 boundary policy;
2. clear ACTIVE A;
3. evaluate B:
   - zero history → auto-start B;
   - remembered → PENDING B;
4. use B's own safe incoming anchor;
5. commit compatible switch changes atomically.

If PENDING A, clear Pending A and evaluate B. If LOCAL_PAUSED A, clear Local Pause A and evaluate B without adding A time.

**Settled**

---

# 17. Distinct Leave then Enter

If L3 preserves separate native boundaries:

```text
10:00:00 CONTEXT_LEFT A
10:00:20 CONTEXT_DETECTED B
```

then:

- finalize A at 10:00:00;
- enter IDLE;
- attribute the 20-second gap to neither A nor B;
- evaluate B at B's own 10:00:20 anchor.

Distinct native transitions never collapse into one seamless Companion interval.

**Settled**

---

# 18. Context Left

On confirmed `CONTEXT_LEFT`:

- ACTIVE A → finalize A at valid boundary, then IDLE;
- PENDING A → clear Pending, then IDLE;
- LOCAL_PAUSED A → clear Local Pause, then IDLE.

Historical end reason is `native-context-left`, distinct from company clock-out.

**Settled**

---

# 19. Full Clock-Out

On confirmed `CLOCKED_OUT`:

- ACTIVE A → finalize once using valid boundary;
- PENDING/LOCAL_PAUSED → clear non-running state;
- enter IDLE.

End reason is `native-clock-out`. Historical time is never deleted.

**Settled**

---

# 20. Same-Context Verification

On eligible `CONTEXT_VERIFIED(A)`:

- ACTIVE A: same session continues; eligible evidence may advance `lastVerifiedAtMs`;
- PENDING A: remain Pending and update Pending continuity metadata;
- LOCAL_PAUSED A: remain Local Paused;
- IDLE + positive A: reconcile A as new/remembered/valid Local Pause recovery.

Same-context verification creates no timer boundary.

**Settled**

---

# 21. Metadata Update

`CONTEXT_METADATA_UPDATED` for the same Context:

- updates Context Index metadata;
- preserves timer state, sessionId, cycleId, and totals;
- creates no timer boundary.

**Settled**

---

# 22. Shared Accrual Safety Hold

A Safety Hold affects authoritative elapsed calculations and therefore **must be shared state**, not per-tab UI state.

Logical ACTIVE modifier:

```text
active.safetyHold = {
  holdAtMs,
  reason,
  transitionCandidateId?,
  createdAtMs,
  revision
}
```

Only the authoritative writer may set/clear it through a normal state transaction.

While held:

- all tabs cap the virtual running contribution at `holdAtMs`;
- no tab may independently continue counting past the hold;
- the active session is not necessarily finalized yet;
- later resolution atomically clears/finalizes the hold.

**Settled**

---

# 23. Strong Unconfirmed Native Clock-Out

When L3 reports successful action-2 completion but post-state verification is temporarily unavailable:

- set shared Safety Hold at the action-2 boundary;
- retain ACTIVE only as unresolved operational state;
- stop displayed/authoritative running contribution beyond the hold;
- aggressively re-verify.

## 23.1 Later confirmed clock-out

Finalize at the correlated action-2 boundary and enter IDLE.

## 23.2 Evidence specifically disproves the same action-2 transition

Continuity may be restored **only** when fresh evidence is specifically correlated to that same transition episode and demonstrates that the suspected action-2 state did not take effect.

Then:

- clear Safety Hold;
- keep original session continuity;
- include the temporarily held interval.

## 23.3 Same Context merely appears later

A later observation of the same Context by itself does **not** prove uninterrupted continuity. The user could have clocked out and later clocked back into the same job.

If the action-2 episode was not specifically disproved:

1. finalize the prior session at the action-2 hold boundary;
2. leave any unverified gap unattributed;
3. evaluate the newly observed same Context as a new current observation;
4. because it is remembered, normal Pending behavior applies unless another explicit rule applies.

This prevents a real clock-out/re-entry from being erased just because the job identity matches.

**Settled**

---

# 24. UNKNOWN / CONFLICT and Provisional Time

Default `verificationGraceMs` is approximately 90 seconds; exact value is configurable policy.

## 24.1 Within grace

If ACTIVE A becomes UNKNOWN/CONFLICT without strong transition evidence:

- retain ACTIVE provisionally;
- do not advance `lastVerifiedAtMs`;
- current displayed contribution may continue **provisionally**;
- trigger re-verification.

## 24.2 Same Context returns within grace

If A is positively verified before grace expires:

- session remains continuous;
- provisional interval becomes normal evidence-backed continuity under this grace rule.

## 24.3 Grace expires

If positive verification does not return:

- set shared Safety Hold at latest trustworthy `lastVerifiedAtMs`;
- stop further running contribution;
- do not fabricate clock-out or another Context.

## 24.4 Reconciliation may reduce displayed provisional time

Because provisional time is not yet finalized history, later reconciliation may cap it to an earlier evidence-backed boundary. The displayed Today/current total may therefore legitimately decrease.

This is **not historical deletion**. It is replacement of provisional elapsed display with authoritative evidence-backed time.

L5 must visually distinguish provisional/degraded time so this correction does not look like unexplained data loss.

## 24.5 Same Context returns after long unknown gap

- finalize prior evidence-backed session through hold/lastVerified boundary if needed;
- leave unknown gap unattributed;
- start/evaluate a new current period from fresh anchor;
- preserve cycleId unless Start Fresh creates a new cycle;
- never backfill the unknown gap automatically.

**Settled**

---

# 25. Event Boundary Policy

When an ACTIVE session must end:

## Native-confirmed

Use compatible `NATIVE_CONFIRMED boundaryAtMs`, clamped no earlier than session start.

## Detected within verification grace

If:

```text
boundaryAtMs - lastVerifiedAtMs <= verificationGraceMs
```

use detected boundary.

## Detected after long unverified gap

Use `lastVerifiedAtMs`; leave remaining gap unattributed.

## Existing Safety Hold

Finalization cannot extend past an unresolved earlier compatible Safety Hold.

**Settled**

---

# 26. Controlled Page Reload / Runtime Teardown While ACTIVE

Runtime teardown or page reload is **not itself a SquareCoil timer boundary**.

On controlled document teardown while ACTIVE:

- do not finalize to unload/teardown time merely because the document is closing;
- checkpoint session/context/cycle/start/lastVerified and controlled-continuation metadata;
- stop the old runtime from writing after teardown;
- require fresh SquareCoil verification on the new document.

## 26.1 Short controlled reload, same Context

If fresh boot positively verifies the same Context within the verification-grace continuity window, no contrary transition evidence exists, and checkpoint ownership is valid:

- the current logical session may continue across the controlled reload;
- no duplicate Ledger segment is created merely for reload;
- the short reload interval may remain part of the same verified-grace continuity period.

## 26.2 Reload continuity cannot be proven

If the verification gap exceeds grace, Context differs, or evidence conflicts:

- preserve/finalize only time through last trustworthy verification;
- do not bridge the gap;
- evaluate fresh current Context normally.

**Settled**

---

# 27. Disable Companion While Timing

Disabling Companion stops **Companion accrual only** and never changes SquareCoil's company clock.

If ACTIVE A:

- validate disable command timestamp;
- if ACTIVE is healthy and has no earlier Safety Hold, finalize through the validated disable timestamp;
- if a Safety Hold/long unverified condition exists, do not finalize beyond the latest evidence-backed hold boundary;
- clear active operational state as part of controlled disable teardown;
- record `endReason = companion-disabled`.

If PENDING/LOCAL_PAUSED, clear or persist only the durable non-live disposition needed by teardown; no new time is created.

On re-enable, current SquareCoil Context is freshly verified. A Context with historical time follows remembered/Pending behavior; re-enable never silently resumes old accrual.

**Settled**

---

# 28. Unexpected Recovery Checkpoint Reconciliation

An unexpected crash/interruption is distinct from controlled reload continuity.

For prior ACTIVE A, preserve/finalize only evidence-backed prior time through prior `lastVerifiedAtMs`.

- current SquareCoil A: do not backfill crash gap; conservative first-release default is remembered A → Pending for the new current period;
- current SquareCoil B: preserve prior A evidence-backed time and evaluate B normally;
- no current Context: preserve prior A evidence-backed time and enter IDLE.

Checkpoint evidence never directly recreates live Active state.

**Settled**

---

# 29. Local Pause Recovery

Reliable Local Pause A + fresh SquareCoil A:

- restore `LOCAL_PAUSED(A)`;
- do not enter Pending;
- do not auto-start;
- Local Resume remains explicit.

If SquareCoil no longer supports A, clear the marker and evaluate actual current state.

**Settled**

---

# 30. Selected Context Behavior

If `ACTIVE=A` and `SELECTED=B`:

- A keeps accruing;
- B may show its own Today/Total/history;
- selecting B does not pause A or start B;
- B must not visually impersonate Running A.

**Settled**

---

# 31. Native Context Focus / Expand Intent

A real confirmed native Context identity change may request UI focus/select/expand for the incoming Context.

Same-Context heartbeat and metadata updates must not reopen a manually collapsed timer.

UI intent never causes timing by itself.

**Settled**

---

# 32. Threshold Semantics

Thresholds apply to **Context Today**, including valid current contribution, not lifetime Job Total.

Default policy:

```text
Yellow 60m
Orange 120m
Red 240m
```

Validation:

```text
1 <= Yellow <= Orange <= Red
```

Thresholds are presentation/status only and never alter Timer State.

**Settled**

---

# 33. Protected Context Rule

A Context is protected from ordinary workspace/destructive removal when any is true:

- ACTIVE;
- PENDING;
- LOCAL_PAUSED;
- current positively observed SquareCoil Context;
- tied to unresolved native transition/recovery evidence;
- ACTIVE with Safety Hold.

Protected Contexts cannot be removed by ordinary Archive, Clear Recent, Hide that makes state inaccessible, or ordinary Delete controls.

L6 may define separately confirmed destructive operations.

**Settled**

---

# 34. Cross-Tab Command Rule

Pause, Resume, Start Fresh, disable, and other authoritative commands from any tab route through the single L2 writer.

Commands carry at minimum:

```text
commandId
contextId
expectedRevision
expectedSessionId when applicable
originatedAtMs
originRuntimeId
```

Observer tabs never perform fallback timer writes.

Retries are idempotent by `commandId`.

**Settled**

---

# 35. User-Action Timestamp Validation

User action time may be used for local Companion boundaries only when the authoritative writer proves it belongs to the current expected state.

Rules:

- expected revision/context/session must still match;
- action time cannot predate current session start or another newer authoritative boundary;
- an implausibly future timestamp is clamped to owner receive time within a small clock-skew tolerance or rejected;
- a stale command with intervening authoritative state change is rejected rather than retroactively altering history;
- a valid delayed observer command may retain its originating action timestamp when all expected-state checks still pass.

Exact clock-skew tolerance is configurable implementation policy.

This applies to Local Pause, Local Resume, Companion Disable, and other local user-timestamp boundaries.

**Settled**

---

# 36. Bridge Unavailable Behavior

## IDLE
Remain IDLE. Do not invent Context.

## PENDING A
Retain Pending temporarily, but mark continuity unknown/broken according to Section 9. Disable Resume/Start Fresh until A is freshly verified.

## LOCAL_PAUSED A
Retain Local Pause; no accrual; disable Local Resume until A is verified.

## ACTIVE A
Apply UNKNOWN grace then shared Safety Hold at latest trustworthy verification. Never auto-backfill the unavailable gap.

**Settled**

---

# 37. Persistence Failure During ACTIVE

If authoritative persistence cannot safely commit:

- do not report the transition as durably successful;
- do not create an alternate UI/storage write path;
- expose explicit persistence degradation through L1/L2;
- do not accumulate unbounded uncommitted authoritative history;
- use state-service recovery/safety behavior only.

**Settled**

---

# 38. Session Provenance: Start Cause vs End Reason

Start and end provenance are separate dimensions.

Canonical `startCause` includes:

```text
new-context
resume
start-fresh
local-resume
native-switch-in
controlled-reload-continuation
recovery-new-period
```

Canonical `endReason` includes:

```text
native-context-switch
native-context-left
native-clock-out
local-pause
companion-disabled
conservative-end
persistence-safety
```

A session is not labeled `resume` as its end reason, and a clock-out is not used as a start cause.

Time Ledger/session provenance should preserve both dimensions when available. L2's generic historical `reason` field should map to end reason for finalized segments unless the final schema explicitly stores both fields directly.

Provenance metadata never creates separate time identity.

**Settled**

---

# 39. Core Timer Invariants

- **TIMER-01:** At most one Context accrues.
- **TIMER-02:** Selection alone never changes timing.
- **TIMER-03:** Zero-history positive Context auto-starts from safe evidence.
- **TIMER-04:** Remembered Context enters Pending unless valid Local Pause recovery applies.
- **TIMER-05:** Pending accrues no time before valid user choice.
- **TIMER-06:** Pending retroactive start never crosses a broken/unverified continuity gap.
- **TIMER-07:** Start Fresh preserves historical totals.
- **TIMER-08:** Local Pause never mutates SquareCoil.
- **TIMER-09:** Local Resume never backfills paused time.
- **TIMER-10:** Same-project metadata changes create no boundary.
- **TIMER-11:** Distinct native transitions remain distinct in history.
- **TIMER-12:** Unknown/conflict never fabricates clock-out or Context.
- **TIMER-13:** Prolonged uncertainty is capped, not accrued indefinitely.
- **TIMER-14:** Provisional display may be corrected downward without deleting finalized history.
- **TIMER-15:** Shared Safety Hold is one authoritative cross-tab modifier.
- **TIMER-16:** Same Context appearing later does not by itself disprove a successful action-2 transition.
- **TIMER-17:** Controlled runtime teardown is not itself a work boundary.
- **TIMER-18:** Companion disable stops local tracking without clocking out SquareCoil.
- **TIMER-19:** Protected Contexts survive ordinary housekeeping.
- **TIMER-20:** Cross-tab commands use one fenced writer and validated timestamps.
- **TIMER-21:** Start cause and end reason remain semantically separate.
- **TIMER-22:** Thresholds use Today and never alter state.

**All Settled**

---

# 40. Transition Matrix

| Current | Input | Result |
|---|---|---|
| IDLE | new zero-history B | ACTIVE B |
| IDLE | remembered B | PENDING B |
| IDLE | valid Local Pause recovery B | LOCAL_PAUSED B |
| ACTIVE A | verified A | ACTIVE A |
| ACTIVE A | metadata A | ACTIVE A |
| ACTIVE A | switch A→B | finalize A, evaluate B |
| ACTIVE A | Context left | finalize A, IDLE |
| ACTIVE A | clock-out | finalize A, IDLE |
| ACTIVE A | Local Pause | finalize A, LOCAL_PAUSED A |
| ACTIVE A | brief unknown | ACTIVE A provisional |
| ACTIVE A | prolonged unknown | ACTIVE A + shared Safety Hold |
| ACTIVE A | strong unconfirmed action 2 | ACTIVE A + shared Safety Hold |
| PENDING A | verified Resume | ACTIVE A |
| PENDING A | verified Start Fresh | ACTIVE A, new cycle |
| PENDING A | continuity broken | PENDING A with refreshed future anchor required |
| LOCAL_PAUSED A | verified Local Resume | ACTIVE A |
| any | stale user command | reject, no mutation |

**Settled**

---

# 41. Acceptance Scenarios

## C1 Brand-new job
Zero-history A is positively observed → ACTIVE A at safe anchor, no Resume prompt.

## C2 Remembered job
Remembered A is positively observed → PENDING A, no accrual.

## C3 Pending Resume with continuous verification
A enters Pending at 10:00 and remains positively verified; user resumes at 10:00:45 → session may start at 10:00 safe anchor.

## C4 Pending verification gap
A enters Pending at 10:00, Bridge loses trustworthy verification beyond grace, then A is freshly seen at 10:10 → Resume cannot backfill to 10:00; safe anchor resets to fresh verified period.

## C5 Start Fresh
12h prior A remains intact; new cycle begins at valid current Pending anchor.

## C6 Local Pause / Resume
Pause boundary ends session; SquareCoil unchanged. Resume starts new session at validated resume action time; pause gap excluded.

## C7 Direct switch A→new B
Native-confirmed switch at noon → A ends once at noon; B begins from B anchor.

## C8 Direct switch A→remembered B
A ends; B becomes Pending.

## C9 Distinct action-4/action-3 gap
A leaves at 10:00, B enters at 10:00:20 → 20 seconds unattributed.

## C10 Same-project department change
Same project ID → same session/cycle, no boundary.

## C11 Confirmed clock-out
ACTIVE A + confirmed action-2 boundary → finalize once, IDLE.

## C12 Brief unknown recovers
20-second UNKNOWN inside grace then A verifies → continuous session.

## C13 Long unknown
Past grace → shared Safety Hold at latest trustworthy verification; no further contribution.

## C14 Provisional correction
Timer displayed provisionally beyond last verification; later conservative reconciliation caps earlier → displayed time may decrease, finalized Ledger history is not deleted.

## C15 Same Context after long unknown
Old A ends at evidence-backed hold; unknown gap excluded; fresh A creates new current period.

## C16 Strong action 2 later confirmed
Hold at action-2 boundary; confirmation → finalize there and IDLE.

## C17 Strong action 2 specifically disproved
Fresh evidence correlated to same action-2 episode proves it did not take effect → clear hold and preserve original continuity.

## C18 Same Context appears later after action 2
No specific disproof, A appears later → old A ends at action-2 boundary; later A is treated as new remembered observation/Pending, not seamless continuation.

## C19 Shared Safety Hold cross-tab
Two tabs view ACTIVE A; owner sets Safety Hold → both cap at same `holdAtMs`; observer cannot keep counting independently.

## C20 Controlled reload same Context within grace
Reload itself creates no segment boundary; fresh same-A verification within grace may continue logical session without duplicate time.

## C21 Controlled reload after long gap
Gap exceeds grace → preserve only through prior lastVerified; do not bridge gap.

## C22 Unexpected crash
Prior A checkpoint + fresh A after crash → preserve only old evidence-backed time; conservative new period is Pending.

## C23 Local Pause survives reload
Valid Local Pause A + fresh A → restore LOCAL_PAUSED A, no auto-start.

## C24 Companion disable while healthy ACTIVE
Disable at valid command time → finalize local tracking at disable boundary, SquareCoil untouched, end reason `companion-disabled`.

## C25 Companion disable while Safety Held
Disable cannot extend finalized time beyond earlier hold/evidence-backed boundary.

## C26 Re-enable while SquareCoil still on A
A has history → remembered A enters Pending; no silent auto-resume.

## C27 Observer Local Pause timestamp
Observer sends Pause with expected revision/session and valid originating timestamp → owner may use that timestamp. If state changed first, reject stale command.

## C28 Impossible/future command timestamp
Writer clamps within permitted skew or rejects; cannot create future or pre-session history.

## C29 Selected inactive B
ACTIVE A + user selects B → A runs; B does not start or impersonate running state.

## C30 Same-Context heartbeat while collapsed
No auto-expand.

## C31 Real native switch while collapsed
May request incoming focus/expand; timing still follows normal transition logic.

## C32 Threshold after many days
A lifetime 25h, Today 30m → threshold uses 30m, not lifetime total.

## C33 Protected Context housekeeping
Current/Active/Pending/LocalPaused/Held Context cannot be ordinarily archived/cleared/hidden destructively.

## C34 Hidden inactive B becomes current
B becomes visible and timing evaluates normally.

## C35 Stale Resume from observer tab
Owner already moved to B → stale Resume A rejected; no session created.

## C36 Persistence failure during switch
A→B cannot atomically commit → not presented as durable success; no alternate storage path.

## C37 Start/end provenance
Resume-created session that later clocks out records `startCause=resume`, `endReason=native-clock-out`; these are not conflated.

## C38 Pending no-history false positive avoided
A Job Index record with zero authoritative time is still treated as zero-history and may auto-start.

---

# 42. Continuity States After L4

## Settled

- IDLE/ACTIVE/PENDING/LOCAL_PAUSED behavior;
- zero-history auto-start;
- remembered Context Pending;
- Pending continuity proof and anchor reset after unverified gaps;
- Resume vs Start Fresh;
- Local Pause/Resume;
- direct and distinct native transitions;
- context-left vs full clock-out;
- shared authoritative Safety Hold;
- action-2 same-Context re-entry safety;
- provisional-time correction semantics;
- conservative unknown/conflict handling;
- controlled reload continuity vs unexpected crash recovery;
- Companion disable/re-enable timer behavior;
- selected vs active isolation;
- threshold semantics based on Today;
- protected Context rules;
- cross-tab command timestamp validation;
- separate startCause/endReason provenance.

## Provisional

- exact `verificationGraceMs` around 90-second default;
- exact command clock-skew tolerance;
- exact UI wording for provisional/Safety Hold states;
- exact cycle continuation choice when imported history lacks meaningful cycle metadata;
- exact persistence field shape for Safety Hold/provenance.

## Open for later stages

- main timer/Time Overview presentation (L5);
- visual provisional-time indicator (L5);
- history presentation of start/end provenance (L5);
- archive/delete/clear workflows (L6);
- final error/disabled-action UX (L5/L7);
- automated fixture implementation (L8/build).

## Blocked

None.

---

# 43. L4 Readiness Judgment

**Status: Settled — ready for L5**

L4 now defines timer starts, Pending continuity, local controls, native switches, uncertainty handling, shared Safety Holds, reload/disable behavior, recovery, cross-tab commands, and historical provenance strongly enough that L5 can present timer/time state without inventing behavior.

Next stage:

**L5: Time Views, Recent Jobs, History, and Job Navigation**
