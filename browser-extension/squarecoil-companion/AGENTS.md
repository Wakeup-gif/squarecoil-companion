# SquareCoil Companion — Codex Working Instructions

**Current work: v0.7.3 migration startup repair (October 2, 2026).** Active branch: `fix/clock-detection-custom-dark-logo`. Follow `implementation/CLOUD-CODEX-MIGRATION-HANDOFF-2026-10-02.md`. The test candidate preserves retained source bytes and saved hours, ignores only orphan manual-pause metadata, and keeps strict atomic authority validation plus the existing clock-parser/custom dark-logo fixes. Historical acceptance below certifies only its named bytes. No main merge, stable release, Store submission, or live native clock writes are authorized.

**Historical checkpoint: combined worktree review candidate (October 1, 2026).** The active branch is `codex/squarecoil-combined-2026-10-01`, combining Main Development `608ddab4206810788570632518809d22bd345de1` and UI Edits `9f79a2094da6f2baa04120933ef635126ae2c05b` at common base `99879446352364035904af640845ba6c5a43a570`. Preserve both feature sets and original worktrees. This integration is authorized for testing, committing, pushing and a review PR; merge to main, Store submission and live SquareCoil writes remain separate actions. The confirmed prototype integration checkpoint remains at `docs/PROTOTYPE-INTEGRATION-2026-09-14.md`. Previous implementation evidence below is historical. Combined exact-package evidence is recorded in `implementation/COMBINED-WORKTREE-EVIDENCE.md` when completed.

This file scopes only `browser-extension/squarecoil-companion/`.

## Current task

The combined review candidate is accepted at exact package source `8426b242e26cc418228f66268b6e69040737b532`; Chrome and Edge each passed 31 clean and 2 upgrade cases on one unchanged ZIP. Tooling-only correction `5efed69` and later documentation preserve the same runtime fingerprint. Current proof and PR #5 are in `implementation/COMBINED-WORKTREE-EVIDENCE.md`. Preserve both originals and do not treat this as main merge or Store publication.

B2-C, B3, B4, B5-A, B5-B, B5-C, B5-D, and B6 are accepted on `codex/squarecoil-b2c-migration`. The prior Glass/theme and recovery stabilization remains accepted at exact implementation source `aabdebc87224211b8897a7e1ded7b94ddacdd19a`; its historical evidence remains SHA-bound in `implementation/B6-GLASS-STABILIZATION-EVIDENCE.md`.

The **UI/theme/lab/Figma stabilization** batch is accepted at exact implementation source `4a9368bf4edde8cb10a7a53fcf16512e86b1b623`: a sealed fictional test website, coherent integrated Dark/Light Glass rendering, protruding horizontally scrollable and reorderable Context tabs, fail-closed drag-to-page Archive/Undo behavior, and a code-aligned Figma handoff. The optional live Bing permission grant and comparison against an actual target Figma file remain supplemental/manual gates.

Do not merge or promote to `main`, publish a release/store build, or add a new live SquareCoil mutation without separate exact approval.

Before any implementation or stabilization batch, read `docs/EXECUTION-ENFORCEMENT-PLAN.md` and refresh the affected rows in `docs/EXECUTION-GATE-MATRIX.md`. Declare the change-impact tags and targeted gates before editing. Use targeted gates while debugging; run the aggregate and exact installed-browser candidate gates only after the impacted clusters are green. A normal in-scope test, harness, documentation, or packaging failure is diagnostic work rather than a new authorization boundary. Stop only for the explicit contradiction, safety, destructive-action, unrelated-work, or external-choice conditions in the execution plan.

Before B3 changes, read:

1. `logic/L2-STATE-TIME-MIGRATION.md`
2. `logic/L4-TIMER-BEHAVIOR.md`
3. `logic/L5-TIME-VIEWS-WORKSPACE.md`
4. `logic/L5A-TAB-PARITY-FOCUS-DELTA.md`
5. `logic/L8-ACCEPTANCE-HANDOFF.md`
6. `logic/B3-WORKSPACE-READINESS-AUDIT.md`
7. accepted B1/B2 evidence and the actual source/tests

Before B4 changes, read all of B3's preserved contracts plus:

1. `logic/L6-DATA-SAFETY-BACKUP.md`
2. `logic/B4-DATA-READINESS-AUDIT.md`
3. the L2 persistence/migration rules referenced by that audit
4. the B4 acceptance requirements in `logic/L8-ACCEPTANCE-HANDOFF.md`

Before B5-A/B5-B changes, read `logic/L7-SETTINGS-SUPPORT-THEMES.md`, the applicable B5 readiness audit, the feature reconciliation/ledger, and every source/audit artifact explicitly required there.

Before B6 changes, read the complete `logic/L8-ACCEPTANCE-HANDOFF.md`, every accepted stage evidence document, the current feature ledger/reconciliation, and the actual build/package/browser harnesses.

Do not redesign settled behavior. If implementation exposes a true contradiction, stop and report it.

## Architecture constraints

- Exactly one authoritative Timer/Time Ledger writer.
- SquareCoil remains company-clock authority.
- The Bridge is observational/read-only.
- Migration and authoritative mutations are OWNER-only and fenced.
- OBSERVER runtimes never create fallback local authority.
- Exact acknowledgments and current-generation evidence remain mandatory.
- Retained v0.7 localStorage keys are read-only forensic evidence; do not delete or rewrite them.
- Imported data cannot fabricate live Active, Pending, or Local Pause state.
- Workspace selection, visibility, order, navigation, appearance, and optional presentation never own timing.
- Optional presentation failures must not degrade healthy Timer authority.
- Disabled optional features must remove their owned resources and leave native SquareCoil/core Companion behavior intact.
- Do not weaken revision, fencing, lifecycle, migration, or READY settlement checks.

## Source and generated output

Work from this directory for npm scripts. Node.js 22 is the CI baseline. The project has no external npm dependencies and no lockfile.

Do not edit `dist/` directly. `scripts/build.js` generates it from `src/`; `dist/` is intentionally untracked.

## Required regression checks

Run all of these after B3 code changes:

```bash
npm run test:b3:unit
npm run test:b3:integration
npm run test:proto-ui
npm run check:b3-workspace
```

All accepted B1/B2 checks in the aggregate gate must remain green. B3 fixtures use stable unique `UT-B3-*` or `IT-B3-*` IDs.

B3 exact-candidate evidence is recorded in `implementation/B3-WORKSPACE-EVIDENCE.md` and must remain green.

Before any later-stage commit, run that stage's explicit gate plus every earlier aggregate regression and the installed-browser acceptance required by its owning audit.

For B5-C, run `npm run check:b5c-theme` and installed Chrome/Edge acceptance for all four `B5C-THEME-*` fixtures before committing acceptance evidence.

For B5-D, run `npm run check:b5d-theme` and installed Chrome/Edge acceptance for all five `B5D-*` fixtures before committing acceptance evidence.

Also run:

```bash
git diff --check
git status --short
```

Do not finish with unrelated changes.

## Accepted B3 gate

- One canonical revision feeds Main, tabs, Recent, Overview, By Day, By Context, Context Detail, and finalized History.
- Tab time is Context Today; thresholds compare exact unrounded Today and are not the operational-status signal.
- General Contexts do not consume numbered-job capacity; selected/current truth is protected.
- Selection, reorder, hide/show, and navigation never mutate Timer/Ledger state or native SquareCoil.
- Real incoming Context transitions produce ordered focus intent; boot discovery, same-Context verification, stale intent, and older deferred intent do not steal focus.
- Current/native disposition remains distinct from selected historical inspection.
- Pending, provisional, Safety Hold, time-basis fallback, and undated legacy balances are disclosed without fabricated attribution.
- History is finalized-only, reconstructs logical sessions safely, and loads incrementally without pruning authoritative history.
- Cross-tab order/visibility converges, and active interactions are not broken by refresh.
- Installed Chrome and Edge pass the B3 A4 fixtures with no native mutation attempts.

## Accepted B5-A gate

- One fenced Preferences service owns durable appearance and Timer Limit revisions; stale multi-field drafts fail closed.
- Timer Appearance, Panel Finish, and Website Theme preserve durable preference versus effective accessibility/capability fallback.
- Theme application owns at most one removable layer and never gains Timer, Ledger, Bridge, lifecycle, or native-clock authority.
- Settings routes and Support drafts remain transient and guarded; diagnostics are opt-in, frozen, and privacy-whitelisted.
- Missing Developer Support configuration stays unavailable without fabricated links, payment state, or QR content.
- Exact candidate `117b81604c66d57a3cbf356d6d974bef4a887242` passed aggregate, prototype, installed Chrome/Edge, package-integrity, and CI gates with no native mutation attempts.

## Accepted B5-B gate

- Cinematic and Design Dashboard are independently versioned optional presentation features, off by default, and subordinate to Sleek Dark plus accessibility/lifecycle gates.
- Bing access is an optional exact-origin permission; fixed public requests contain no SquareCoil, job, timer, page, identity, or user content.
- Cinematic uses validated/cache/fallback inputs, generation fencing, single-flight retrieval, reduced-motion handling, and exact owned-resource teardown.
- The Dashboard profile is CSS-only and exact-route-gated to `/dashboard.php?show=2`; native values, ordering, links, forms, disabled states, warnings, and business handlers remain native.
- Restore Native selects Original/NONE/OFF and removes optional presentation ownership, cache, and host access without Timer/Ledger/native-clock mutation.
- Exact candidate `fff15682dd605c52264176a2a8282d897c6cb98b` passed 477 aggregate tests, 13 prototype tests, package validation, 25/25 installed cases in Chrome and Edge, and CI run `33162812787`.

## Accepted B5-C gate

- Only the probe-backed persistent dropdown, exact `/leads.php`, and exact `/calendar.php` CSS adapters were added in B5-C; broader theme parity remained separately gated to B5-D.
- Original, forced colors, and teardown remove both theme and route ownership; native FullCalendar event border colors remain intact.
- Exact source `aeac7fe52a2e723106340bc6d283d2eb49521573` passed all four `B5C-THEME-*` fixtures in installed Chrome and Edge with no native mutation attempts.

## Accepted B5-D gate

- Fresh zero-history Home exposes Recent Jobs, Time Overview, History, and Settings without a SquareCoil clock-in.
- Vendor adapters remain presentation-only, exact-route-bounded, and removable; near-miss routes fail closed to `GENERIC`.
- CKEditor chrome and same-origin editor documents are readable in Sleek Dark, while inaccessible documents receive no false ownership marker.
- Narrow viewport, reduced motion, forced colors, print, Original, disable, and teardown retain accessible native fallback and exact cleanup.
- Exact implementation source `4686ab0c92ce7e4b91a92bc64b479a2bd0ea01c0` passed 487 aggregate tests, 13 prototype tests, package validation, and all five `B5D-*` fixtures in installed Chrome and Edge with no native mutation attempts.
- See `implementation/B5D-THEME-UI-EVIDENCE.md` for exact package hashes and proof boundaries.

## Accepted B6 gate

- Exact source `aeac7fe52a2e723106340bc6d283d2eb49521573` produced one 8-file package and immutable ZIP with embedded source/fingerprint identity.
- The 482-test aggregate gate, 13-test prototype suite, package validation, and CI run `33185826761` passed.
- The same bytes passed clean 27/27 and v0.7-upgrade 2/2 in installed Chrome 151 and Edge 151.
- See `implementation/B6-RELEASE-CANDIDATE-EVIDENCE.md` for exact hashes and proof boundaries.

## Stage boundary

B6 and B5-D historical acceptance remains source-bound. The current authorization covers combining the two completed branches, resolving overlap, testing the combined candidate, committing/pushing the review branch and creating a PR. Production promotion, Store submission, merge to `main`, rollout, a B7 stage and live SquareCoil mutation require separate authorization.
