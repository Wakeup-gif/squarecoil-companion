# SquareCoil Companion UI / Frontend Handoff for Codex

## Purpose

This handoff carries the current **frontend/UI prototype only** into Codex. It is not a production extension package and must not be treated as the system of record for Timer State, Ledger, SquareCoil clock state, migration, or lifecycle authority.

The prototype is intended to accelerate the canonical UI implementation by showing the desired interaction model and by mapping controls to the existing rebuild architecture.

## Git target

- Repository: `Wakeup-gif/test_repo`
- Source branch reviewed: `codex/implement-squarecoil-native-completion-observation`
- Reviewed source head: `4e4e867c246af69745a29600fef5446a9bc010be`
- UI handoff branch: `prototype/squarecoil-companion-ui-handoff`
- Extension root: `browser-extension/squarecoil-companion/`
- Prototype path on handoff branch: `browser-extension/squarecoil-companion/prototypes/branch-wired-ui.html`

Before implementing anything, re-fetch the live branch heads. Do not assume the reviewed SHA is still current.

## What the prototype already demonstrates

1. Frosted/docked Companion shell with compact and expanded states.
2. Persistent Context tab rail with selected vs operational distinction.
3. Job tabs as **workspace/inspection contexts**, not independent clocks.
4. Selected Context can differ from the actually running/observed Context.
5. Canonical-looking operational status states:
   - `RUNNING`
   - `RUNNING_PROVISIONAL`
   - `VERIFICATION_HOLD`
   - `AWAITING_CHOICE`
   - `LOCALLY_PAUSED`
   - `NOT_RUNNING`
6. Timer commands represented in the UI using the existing command vocabulary:
   - `TIMER_LOCAL_PAUSE`
   - `TIMER_LOCAL_RESUME`
   - `TIMER_RESUME`
   - `TIMER_START_FRESH`
7. Home workspace destinations:
   - Current Timer
   - Time Overview
   - Recent Jobs
   - History
   - Settings
   - Find Job / Context
8. Time Overview scaffolding for Today, This Week, By Day, and By Job/Context.
9. Recent Jobs visibility/retire concepts.
10. History surface for completed Companion sessions.
11. Settings structure for Appearance, Time Tracking, Jobs and Watching, Notifications, Privacy/Data, Help/Diagnostics.
12. Appearance controls mapped to the real product axes:
   - Companion Appearance: Light / Dark / Auto
   - Panel Finish: Solid / Glass
   - SquareCoil Theme: Original / Refined Light / Sleek Dark
13. Timer threshold controls based on the settled default limits:
   - Yellow 60 minutes
   - Orange 120 minutes
   - Red 240 minutes
14. Drag-to-retire interaction prototype:
   - lifted tab morphs into a rounded rectangle
   - center retirement field appears
   - drop produces a bubble/pop removal
   - retired Context enters History
   - conceptual re-track when the user later clocks into that SquareCoil job
15. Responsive/mobile behavior and reduced-motion awareness.

## Canonical implementation boundaries

Do not port the standalone mockup's local sample state as production truth.

### Timer/read truth

The frontend should consume the canonical read model from:

- `src/timer/read-model.js`

Use its Context rows, Today/Total, History, current Context, selected Context, running session, Pending/Local Pause data, available actions, Workday Zone, and revision information.

Do not add a second UI-owned clock or durable time model.

### Timer commands

Use the command constants in:

- `src/timer/commands.js`

UI actions must route through the trusted authority/Timer interface rather than directly mutating durable timer state.

### Authority boundary

The extension architecture has one fenced authoritative writer. The UI may inspect and request commands, but it must not bypass the authority client/router/kernel layers.

Relevant code:

- `src/extension/authority-client.js`
- `src/extension/authority-kernel.js`
- `src/extension/authority-router.js`
- `src/extension/authority-protocol.js`

### SquareCoil Bridge

SquareCoil remains authoritative for company clock state. The Companion Bridge is observational/verification-oriented and must not fabricate elapsed time.

Relevant code:

- `src/squarecoil/bridge-service.js`
- `src/squarecoil/bridge-engine.js`
- `src/squarecoil/bridge-parser.js`

The bridge currently verifies audited SquareCoil state and observes native completion signals. Preserve that boundary.

### Lifecycle

Do not couple presentation cleanup with a second runtime/lifecycle owner. Preserve the existing feature registry and teardown requirements.

Relevant code:

- `src/core/lifecycle.js`
- `src/core/feature-registry.js`
- `src/core/runtime-probe.js`

## Workspace behavior to preserve

The canonical behavior authority is L5 + L5A and the B3 readiness audit.

Critical rules:

- selecting a tab changes inspection, not Timer authority;
- show the actual operational Context separately whenever Selected differs;
- single-click selects;
- double-click may select + expand;
- operational/selected truth must never be hidden merely to obey a hard tab cap;
- the nominal cap is five **numbered Job Contexts**;
- General Context does not consume a numbered-job slot;
- tabs need identity + Context Today + operational status + threshold + provisional/hold semantics;
- threshold is derived from canonical Today time, not a private tab clock;
- tab reorder/visibility is workspace preference only and must not trigger timer commands;
- hidden incoming operational Context must reappear;
- same-context verification must not steal focus or reopen a manually collapsed surface;
- native focus-intent ordering must ultimately replace simplistic A->B heuristics;
- read failures should retain the last trustworthy snapshot instead of flashing false zeros.

Relevant specifications/audits:

- `logic/L5-TIME-VIEWS-WORKSPACE.md`
- `logic/L5A-TAB-PARITY-FOCUS-DELTA.md`
- `logic/B3-WORKSPACE-READINESS-AUDIT.md`

## Settings / appearance behavior to preserve

Use the B5/L7 contracts rather than hard-coding prototype-only preferences.

Core axes:

- Appearance: Light / Dark / Auto
- Finish: Solid / Glass
- Website Theme: Original / Refined Light / Sleek Dark
- Timer Limits: integer minutes, `1 <= Yellow <= Orange <= Red`

Appearance must never alter Timer State or Ledger data. Accessibility-effective presentation may override the visible effect without rewriting the durable preference.

Relevant implementation/reference files:

- `content/theme-controller.js`
- `logic/L7-SETTINGS-SUPPORT-THEMES.md`
- `logic/B5-SETTINGS-PRESENTATION-READINESS-AUDIT.md`

## Drag-to-retire adaptation guidance

The standalone interaction is a **design proposal**, not permission to invent a destructive state mutation.

When integrating it:

1. Treat the drag as a workspace/archive request only after the owning B3/B4 mutation contract exposes a safe command.
2. Never retire the operational/pending protected Context silently.
3. Do not delete historical Ledger segments.
4. Keep tab visibility/workspace membership separate from Timer State.
5. The visual pop animation may happen only after the authoritative mutation succeeds, or use an explicit pending state and rollback on failure.
6. Re-tracking should happen from real SquareCoil Context observation/entry, not from a UI assumption.
7. Keep a non-drag accessible alternative in Recent Jobs.

Until the production command exists, preserve this as presentation-only prototype behavior.

## Recommended UI integration order

1. Keep the existing authority/Timer/Bridge/lifecycle layers untouched.
2. Refactor `src/ui/workspace-ui.js` around retained canonical snapshots rather than cloning the standalone demo state.
3. Introduce a small presentation state object only for ephemeral UI concerns such as selected route, collapsed state, drag gesture, menu state, and drafts.
4. Bind Main to the canonical Timer read model.
5. Upgrade tabs to L5A parity.
6. Complete Recent Jobs.
7. Complete Time Overview + Context Detail.
8. Complete bounded/incremental History.
9. Implement the canonical Settings router and preferences service wiring.
10. Add the retire/archive drag only when the canonical workspace/data mutation boundary exists.
11. Add tests before treating any mock interaction as canonical behavior.

## Prototype vs production wiring map

| Prototype concept | Production owner |
|---|---|
| Job/context values | `src/timer/read-model.js` |
| Pause locally | `TIMER_LOCAL_PAUSE` through trusted Timer action |
| Resume locally | `TIMER_LOCAL_RESUME` |
| Pending resume | `TIMER_RESUME` |
| Start fresh | `TIMER_START_FRESH` |
| Operational status | Timer read model |
| History rows | Ledger/read model |
| Today/Total | Ledger/read model query results |
| Verify/sync | SquareCoil Bridge / authority sync path |
| Appearance | Preferences/theme layer |
| Tab hide/show/order | Workspace preferences, timing-neutral |
| Retire/archive | Canonical workspace/data mutation layer when exposed |
| Re-track | Real incoming SquareCoil Context observation |

## Files in this handoff

- `squarecoil-companion-branch-wired-ui.html`  
  Full self-contained visual prototype, including the embedded demo background.

- `CODEX-UI-HANDOFF.md`  
  This implementation handoff.

The GitHub copy intentionally removes the large embedded demo wallpaper so the repo receives the functional frontend prototype without a ~900 KB base64 cosmetic asset. The downloadable HTML remains fully self-contained.

## Validation expectations for Codex

At minimum, verify:

- JavaScript parses cleanly;
- no duplicate root/listeners after remount/recovery;
- selected Context does not mutate operational Context;
- inactive selection does not expose operational Pause;
- canonical statuses render without changing underlying state;
- no false zero on transient read failure;
- tab visibility/reorder does not create Timer commands;
- protected operational Context remains visible;
- keyboard alternatives exist for drag-only operations;
- reduced motion does not break the workflow;
- Chrome and Edge source stay shared unless an actual API incompatibility is demonstrated.

## Do not do

- Do not merge the prototype directly into `main`.
- Do not treat prototype local arrays/timers as production storage.
- Do not create a second timer runtime.
- Do not infer native SquareCoil clock-in/clock-out state from visual tab state.
- Do not invent department mappings or invoke native SquareCoil clock mutation from the Companion UI.
- Do not delete Ledger history when hiding/archiving a workspace Context.
- Do not let visual success stand in for authoritative mutation success.
