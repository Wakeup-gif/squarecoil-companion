# SquareCoil Companion Rebuild: Start Here

**Current work: combined worktree review candidate (October 1, 2026).** The active branch is `codex/squarecoil-combined-2026-10-01`, combining Main Development `608ddab4206810788570632518809d22bd345de1` and UI Edits `9f79a2094da6f2baa04120933ef635126ae2c05b` at common base `99879446352364035904af640845ba6c5a43a570`. Preserve both feature sets and original worktrees. This integration is authorized for testing, committing, pushing and a review PR; merge to main, Store submission and live SquareCoil writes remain separate actions. The confirmed prototype integration checkpoint remains at `docs/PROTOTYPE-INTEGRATION-2026-09-14.md`. Previous implementation evidence below is historical. Combined exact-package evidence is recorded in `implementation/COMBINED-WORKTREE-EVIDENCE.md` when completed.

This is the recovery checkpoint for the active SquareCoil Companion prototype/rebuild.

If chat context is lost or implementation direction becomes unclear, start here before changing code.

---

## Current checkpoint

**Active branch:** `codex/squarecoil-combined-2026-10-01`

**Repository main baseline:** `30bacd6f4262623ff9fff363e6d2ea516d02c2d1`; stable extension lineage is `9378da24f393b40066816133e7fa0f48063115f0` (`v0.7.1 Chrome Interaction Recovery`). Main's documentation and legacy workflow changes are included in the review branch.

**Production main changed by prototype work:** No

**Framework status:** Reconciled after full legacy feature mine

**Logic status:** L0-L8 settled + post-mine L5A tab/focus delta settled

**Historical accepted implementation status:** B1 through B6, B5-D, the prior Glass/theme recovery batch, and the bounded UI/theme/lab/Figma stabilization are accepted; the latest exact implementation source is `4a9368bf4edde8cb10a7a53fcf16512e86b1b623`

**Workspace UI:** canonical B3 Main/Recent/Overview/By Day/By Context/Context Detail/History implementation present

**Latest accepted implementation/UI-gate checkpoint before documentation/logic reconciliation:** `ba06297e689fa7a68574ea0c0fe6d12ee59e53bf`

**Logic delta authority:** `logic/L5A-TAB-PARITY-FOCUS-DELTA.md`

**Next canonical build action:** finish the confirmed prototype integration and its exact candidate gates; prior accepted batches remain source-bound evidence. Production publication/promotion is not authorized.

The user explicitly authorized sequential B3 through B6 work on this existing branch. That authorization does not promote the branch to production, authorize a release/store upload, or authorize new live SquareCoil mutations.

---

## Read in this order

1. `REBUILD-START-HERE.md`
   - Current branch truth, recovery checkpoint, and next action.

2. `docs/REBUILD-MASTER-PLAN.md`
   - Original structural architecture and ownership authority.

   Then read `docs/EXECUTION-ENFORCEMENT-PLAN.md` and `docs/EXECUTION-GATE-MATRIX.md`.
   - They define change-impact selection, stabilization/candidate lanes, stop/continue rules, failure/recovery pairing, and live requirement-to-evidence status.

3. `docs/FEATURE-MINE-RECONCILIATION.md`
   - Current feature ledger after mining Timer v1.x, Companion v0.x, and historical Full UI/theme lineage.
   - Classifies features as core parity, core rebuild, optional presentation, or excluded sibling systems.

4. `docs/LOGIC-DELTA-HANDOFF.md`
   - Scope that produced the targeted post-mine Logic reconciliation.

5. `logic/L0-INVARIANTS.md`
6. `logic/L1-LIFECYCLE.md`
7. `logic/L2-STATE-TIME-MIGRATION.md`
8. `logic/L3-SQUARECOIL-BRIDGE.md`
9. `logic/L4-TIMER-BEHAVIOR.md`
10. `logic/L5-TIME-VIEWS-WORKSPACE.md`
11. `logic/L5A-TAB-PARITY-FOCUS-DELTA.md`
    - Canonical live-tab Today value, threshold behavior, real native focus-intent transitions, stale/dirty-route rules, and acceptance additions.
12. `logic/L6-DATA-SAFETY-BACKUP.md`
13. `logic/L7-SETTINGS-SUPPORT-THEMES.md`
14. `logic/L8-ACCEPTANCE-HANDOFF.md`

15. `implementation/B1-ACCEPTANCE-EVIDENCE.md`
16. `implementation/B2-KERNEL-EVIDENCE.md`
17. `implementation/B2-TRUSTED-TRANSITION-EVIDENCE.md`
    - Accepted implementation checkpoints. Read actual implementation source before changing code.

18. `HANDOFF.md` and `CHROME-INTERACTION-DIAGNOSIS.md`
    - Historical v0.7.x source evidence. Do not treat the old multi-patch architecture as the rebuild pattern.

---

## Core structure now settled

- One lifecycle owner.
- One fenced authoritative Timer/Time writer.
- One canonical read model.
- One Companion renderer/router.
- SquareCoil Bridge is read-only and normalizes native truth.
- SquareCoil remains authoritative for company clock state.
- Companion never silently clocks users in/out.
- One operational Companion Context exists across tabs in one data scope.
- Timer tabs are workspace/navigation, not concurrent clocks.
- Selection has no timing side effect.
- Selected Context may differ from operational Context and the UI must preserve both truths.
- Production General is a first-class Context and is never Job 0.
- Same-project department/label changes do not reset job-level timing merely because metadata changed.
- Unknown/missed time is never fabricated.
- New zero-history Contexts may use safe evidence anchors under L4 rules.
- Remembered Contexts use Pending -> Resume / Start Fresh.
- Local Pause is Companion-only.
- Prolonged verification uncertainty uses conservative Safety Hold behavior.
- Time Ledger is authoritative local historical-time truth.
- Today is primary in the main timer; Job/Context Total is secondary.
- Workday zone/midnight/DST/week/precision rules remain owned by L2.
- One-writer/fencing prevents cross-tab duplicate accrual.
- Recent is workspace membership, not historical retention.
- Clear Recent preserves authoritative time.
- Archive preserves authoritative time.
- Delete/Wipe are explicit destructive operations only.
- Full Backup JSON, History CSV, and Time Report CSV have different purposes.
- Restore/import cannot fabricate live Timer State.
- Timer Appearance remains Light/Dark/Auto.
- Panel Finish remains Solid/Glass.
- Core Website Theme remains Original/Refined Light/Sleek Dark.
- Historical Cinematic Wallpaper remains an optional post-core presentation capability.
- Historical Design Dashboard refresh remains an optional page presentation profile, not Design Request business logic.
- Sibling Design/Scope/File/Menu tools remain outside Companion scope.
- Chrome/Edge use one shared behavior/source architecture with separate browser acceptance.
- Static/package success never substitutes for installed-browser acceptance.

---

## L5A post-mine logic now settled

The legacy parity delta is no longer open.

Canonical decisions:

- visible Context tab time = **Context Today**, not lifetime Job Total;
- tab Today comes from the canonical read model and never owns a separate clock;
- ACTIVE tabs include valid current contribution;
- PENDING anchors do not count before Resume/Start Fresh;
- LOCAL_PAUSED/inactive tabs remain stable;
- Safety Hold caps tab/Main/aggregate live contribution at the same boundary;
- provisional tab values may reconcile downward without deleting finalized history;
- threshold level uses unrounded Context Today and highest matching configured threshold;
- threshold accent and operational status are separate semantics;
- threshold meaning must not depend on color alone;
- real confirmed A -> B and real none -> B entry may focus/select/show/expand incoming B after authoritative evaluation;
- A -> none creates no arbitrary focus target;
- boot/recovery discovery of an existing Context does not impersonate a new native entry;
- same-Context verification/metadata does not steal focus or reopen manual collapse;
- dirty Settings/L6 routes may defer the newest focus intent instead of discarding work;
- newer explicit user selection beats an older unapplied focus intent;
- newer real Context focus supersedes older deferred intent.

See `logic/L5A-TAB-PARITY-FOCUS-DELTA.md` for the full interaction, failure, and A2/A3/A4 acceptance contract.

---

## Canonical B3 workspace

The B3 implementation provides:

- Chrome-like visible job tabs with a five-numbered-job cap;
- selected-vs-operational separation;
- main Today / Job Total / status presentation;
- Current/Actually Running indication when selection differs from operational truth;
- Recent Jobs;
- Time Overview;
- History;
- Settings;
- Light/Dark;
- Solid/Glass;
- search/open exact Job #;
- hide/show tab behavior;
- trusted-user interaction gating for Timer commands/navigation;
- dedicated prototype UI tests.

Current boundary notes:

- periodic refresh preserves the last trusted snapshot, scroll position, focused search input, and active presentation interactions;
- native A -> B and none -> B focus uses a durable revision-bound transition identity, while boot and same-Context verification do not steal focus;
- destructive data tools remain intentionally locked pending B4;
- exact B3 candidate `e3b369e691df317462bf6ef53cd981f682cca1d2` passed installed Chrome/Edge and CI.

---

## Canonical B2 closure

The active branch closes the previously known B2 implementation gaps:

- fenced OWNER-only legacy migration invocation with retained-source conflict handling;
- passive native action 2/3/4 completion observation and current-OWNER forwarding without Companion native mutation;
- exact current-worker refresh plus post-probe confirmation acknowledgments;
- final effective READY only when shell R1-R8, positive authority R9, settled migration, aligned trusted core, and usable Bridge evidence all agree;
- fail-closed degradation for stale authority, ownership mismatch, blocked/incomplete migration, or unavailable Bridge.

Settlement remains acceptance-gated: all required automated checks, clean exact-package Chrome/Edge runs, and CI must pass for the candidate. The prototype UI and settled L5A Logic do not widen this B2 boundary.

---

## Next action

B5-D and B6 remain complete, and the authorized UI/theme/lab/Figma stabilization batch is active on the existing branch. Preserve the historical SHA-bound B5-C/B5-D/B6 and Glass-recovery evidence, produce a new exact candidate without rewriting that history, run the required sealed-lab and installed Chrome/Edge gates, commit the evidence, and push this branch. No merge to `main`, production promotion, release/store publication, rollout, B7 work, or live mutation is authorized without a separate exact instruction.

---

## Staged path from here

```text
R1  Targeted Logic delta — SETTLED
        ↓
B2-C  Canonical B2 implemented + acceptance-gated
        ↓
B3  Canonical Time Views / Workspace using L5 + L5A
        ↓
B4  Data Safety / Backup / CSV
        ↓
B5-A  Core Settings / Themes / Support
        ↓
B5-B  Optional Presentation Packs
        ↓
B6  Chrome + Edge Acceptance / Candidate
```

Optional presentation must never block a core build that does not include it.

---

## Do not do these things

- Do not merge/promote the prototype branch to `main` without explicit promotion approval.
- Do not restart the old v0.7.x multi-script patch architecture.
- Do not let features independently mutate Timer State or Ledger data.
- Do not use root DOM existence as runtime health.
- Do not inject a second authority when ownership is ambiguous.
- Do not invent SquareCoil state or elapsed time.
- Do not silently prune authoritative history.
- Do not make Clear Recent destructive.
- Do not restore Active/Pending/Local Pause from file contents.
- Do not guess or silently sum overlapping imported intervals.
- Do not fork Chrome/Edge behavior semantics.
- Do not let visual packs own Timer health.
- Do not absorb sibling Design/Scope/File/Menu business tools into Companion without a separate scope decision.
- Do not call a prototype interaction gate a substitute for real installed-browser acceptance.
- Do not let implementation silently work around a contradiction in owning Logic. Amend the contract and add a regression.

---

## Logic readiness

**Accepted through B6; the bounded UI/theme/lab/Figma stabilization batch is authorized, but no later product gate is authorized.**

There are no open framework or Logic blockers in the accepted candidate. Promotion and publication remain separate decisions.
