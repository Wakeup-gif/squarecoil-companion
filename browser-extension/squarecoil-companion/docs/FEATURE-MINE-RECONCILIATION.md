# SquareCoil Companion Feature Mine + Reconciliation Plan

**Status:** Framework reconciliation complete  
**Branch:** `proto/squirel-coil-plugin`  
**Production baseline:** `main` at `9378da24f393b40066816133e7fa0f48063115f0` (`v0.7.1 Chrome Interaction Recovery`)  
**Prototype checkpoint entering this plan:** accepted B2.2 core + prototype workspace UI + dedicated UI interaction gate  
**Primary structural authority:** `docs/REBUILD-MASTER-PLAN.md`  
**Purpose of this document:** reconcile the full mined feature ancestry with the rebuild architecture, prevent legacy feature loss, prevent scope creep from unrelated tools, and produce a clean structural handoff for the next Logic pass.

---

# 1. Direct Answer

The rebuild architecture is still valid after mining the older Timer, Companion, and Full UI histories.

The mine did **not** uncover a missing second core application. It uncovered three things:

1. several established Timer UX details that should be explicitly preserved as parity requirements;
2. a much richer historical SquareCoil visual lineage that should be retained as optional presentation capability rather than forced into the core release;
3. many sibling US Sign tools that must remain outside Companion ownership even though they lived beside the same theme/timer code in the repository.

The smallest coherent product remains:

```text
SquareCoil Companion Core
├── authoritative local timing + ledger
├── SquareCoil read/verification bridge
├── recent-job workspace
├── time/history/data safety
├── settings + core presentation
└── browser shell / recovery / packaging
```

Optional presentation packs may sit on top of that core without gaining Timer State, lifecycle, or business-data ownership.

---

# 2. Requirements, Assumptions, and Recommendations

## 2.1 Requirements already established

- SquareCoil remains authoritative for the company clock.
- One Companion timing authority exists across tabs in one data scope.
- One authoritative writer owns Timer State / Time Ledger mutation.
- One renderer/router owns Companion UI.
- Historical Companion time is not silently pruned.
- Production General is a first-class Context and is never fabricated as Job 0.
- Selected Context is inspection/navigation and is distinct from the operational Context.
- Companion Local Pause / Resume never secretly mutates SquareCoil native clock state.
- Existing usable v0.7.x history must survive migration.
- Chrome and Edge share one source and one behavior model.
- Core presentation failure must not break Timer health.
- The prototype branch is isolated from production `main` until explicit promotion.

## 2.2 Assumptions used for this reconciliation

- Historical features that were repeatedly present in the Timer lineage are treated as parity candidates unless they conflict with the safer rebuild model.
- Historical visual experiments are not automatically promoted to first-release requirements merely because code existed.
- Sibling Tampermonkey tools are not Companion features unless their actual function is directly part of Timer/Companion ownership.
- The current prototype UI is exploration/validation material, not automatic proof that canonical B3 implementation is complete.

## 2.3 Recommended product decision

Keep the first rebuilt release deliberately small:

```text
CORE RELEASE
Timer + Workspace + Time Views + Data Safety + Core Themes

POST-CORE OPTIONAL PRESENTATION
Cinematic Wallpaper + page-specific visual profiles
```

This preserves the best historical work without letting visual experimentation destabilize the timing application again.

---

# 3. Core Pattern

The mined history shows a recurring pattern:

```text
Useful feature
    ↓
added as a patch
    ↓
another patch adjusts it
    ↓
multiple layers share DOM/state ownership
    ↓
interaction/recovery becomes fragile
```

The rebuild keeps the useful feature and removes the ownership collision.

Canonical pattern:

```text
LEGACY FEATURE INTENT
        ↓
CLASSIFY
        ↓
PLACE IN ONE OWNER
        ↓
DEFINE READ/COMMAND BOUNDARY
        ↓
LOGIC CONTRACT
        ↓
STAGED IMPLEMENTATION
```

No historical feature gets permission to recreate the old patch stack.

---

# 4. Source Lineage Mined

The feature reconciliation used actual historical code and maintained extension documents from these families.

## 4.1 Timer lineage

Reviewed examples include:

- `SquareCoil-Job-Timer-v1.0.0.user.js`
- `SquareCoil-Job-Timer-v1.0.1.user.js`
- `SquareCoil-Job-Timer-v1.0.2.user.js`
- `SquareCoil-Job-Timer-v1.0.3.user.js`
- `SquareCoil-Job-Timer-v1.0.4.user.js`
- `SquareCoil-Job-Timer-v1.0.5.user.js`
- `SquareCoil-Job-Timer-v1.0.6.user.js`
- `SquareCoil-Job-Timer-v1.0.7.user.js`
- `SquareCoil-Job-Timer-v1.0.8.user.js`
- `SquareCoil-Job-Timer-v1.0.9.user.js`
- `SquareCoil-Job-Timer-v1.1.0.user.js`
- `SquareCoil-Job-Timer-v1.1.1.user.js`
- `SquareCoil-Job-Timer-v1.1.2.user.js`
- `SquareCoil-Job-Timer-v1.1.3.user.js`

## 4.2 Extension lineage

Reviewed maintained Companion checkpoints spanning the v0.1-v0.7 family, including restore branches before major presentation/workspace changes and the v0.7 maintainer handoff.

## 4.3 Full UI / theme lineage

Reviewed actual Full UI code including:

- early canonical solid dark/glass treatment around v1.2.0;
- wallpaper/macOS-inspired glass around v2.1.5;
- cinematic fresh Bing wallpaper system in v2.2.7;
- Design Dashboard-specific visual refresh in v2.2.9.

## 4.4 Current rebuild material

Current framework/logic documents and accepted B1/B2.1/B2.2 evidence remain the authority for the safer architecture.

---

# 5. Feature Disposition Classes

Every mined feature belongs to one of four structural classes.

## A. CORE PARITY

Established user-facing behavior that the rebuilt product should retain unless downstream Logic finds a safety contradiction.

## B. CORE REBUILD / IMPROVEMENT

A required product capability whose old implementation is not safe to copy directly. Preserve intent, rebuild ownership.

## C. OPTIONAL POST-CORE PRESENTATION

Real historical functionality that is valuable but not necessary for the first safe Companion release.

## D. EXCLUDED SIBLING TOOL

A separate US Sign workflow tool. It may inform visual consistency, but Companion does not absorb its business function.

---

# 6. Canonical Feature Ledger

## 6.1 Timer and tab workspace

| Feature | Disposition | Structural owner | Notes |
|---|---|---|---|
| One operational timing Context | CORE PARITY | Timer State / Timer service | Never concurrent job clocks |
| Production General | CORE PARITY | Context model | First-class General Context |
| Remembered Context -> Pending | CORE PARITY | Timer service | Resume / Start Fresh behavior remains logic-owned |
| Companion Local Pause / Resume | CORE PARITY | Timer service | Native SquareCoil clock untouched |
| Recent job tabs | CORE PARITY | Workspace + UI | Navigation/inspection only |
| Five visible numbered job tabs | CORE PARITY | Workspace presentation | Soft capacity; protected truth wins |
| Persistent tab order | CORE PARITY | Workspace metadata | No timing side effect |
| Drag reorder | CORE PARITY | UI -> workspace command | Exact interaction guard belongs to Logic/UI implementation |
| Single-click focus | CORE PARITY | UI selection | No timing side effect |
| Double-click expand/focus | CORE PARITY | UI presentation | No timing side effect |
| Auto-focus incoming real SquareCoil Context | CORE PARITY | Bridge intent -> UI | Must not treat mere selection as operational change |
| Hide/show inactive tabs | CORE PARITY | Workspace metadata | History retained |
| Live elapsed value in visible job tabs | CORE PARITY DELTA | L5 read model + UI | Explicitly mined from v1.0.2 lineage; add to canonical view contract |
| Threshold color/accent per tab | CORE PARITY DELTA | L5 presentation from canonical threshold read | Threshold cannot impersonate operational status |
| Collapse/expand state | CORE PARITY | UI transient state | Same-Context verification must not reopen manually collapsed UI |
| Selected vs operational distinction | CORE REBUILD | Canonical read model + UI | Safer than legacy conflation |
| Current/actual operational strip | CORE REBUILD | L5 UI | Keeps actual running/awaiting/paused truth visible while inspecting history |

### Timer parity correction

The existing rebuild plan already covers most historical tab behavior. The newly mined gap is primarily **explicit tab content parity**:

```text
visible job tab
├── identity
├── live authoritative elapsed summary
├── threshold accent
├── selected state
└── protected/operational meaning where applicable
```

The tab remains a read/navigation surface. It never becomes its own clock.

---

## 6.2 Time, history, and verification

| Feature | Disposition | Structural owner | Notes |
|---|---|---|---|
| Cross-tab shared timing truth | CORE REBUILD | fenced writer + canonical stores | Replaces loose localStorage race behavior |
| History/session view | CORE PARITY | Time Ledger + History view | Finalized time only |
| Today / Job Total | CORE REBUILD | Time Ledger read model | Primary modern UX improvement |
| Time Overview | CORE REBUILD | Time views | Today, week, by day, by Context |
| Lazy/incremental history rendering | CORE PARITY INTENT | Query/read layer + UI | Paging must not become retention |
| Safer idle verification | CORE REBUILD | SquareCoil Bridge + Timer behavior | Legacy verification ideas retained, behavior re-specified safely |
| Unknown time not fabricated | CORE PARITY | Bridge/Timer invariants | Non-negotiable |
| Midnight/timezone-safe attribution | CORE REBUILD | Ledger | Already logic-owned |
| Safety Hold / provisional truth | CORE REBUILD | Timer/read model | Safer than optimistic legacy accumulation |

---

## 6.3 Recent, archive, housekeeping, and files

| Feature | Disposition | Structural owner | Notes |
|---|---|---|---|
| Recent Jobs view | CORE PARITY / REBUILD | Workspace + read model | Recent is workspace membership, not history |
| Archive one/all | CORE PARITY / REBUILD | Archive/Job Index | Time preserved |
| Restore archived job | CORE PARITY / REBUILD | Archive/Job Index | Cannot create fake live state |
| Delete inactive job data | CORE PARITY / REBUILD | Data mutation service | Explicit destructive path only |
| Clear Recent | CORE REBUILD | Workspace | Non-destructive to authoritative time |
| Wipe recorded history | CORE PARITY / REBUILD | Data mutation service | Explicit confirmation, behavior owned by L6 |
| Activity logging | CORE PARITY / REBUILD | Activity store | Never used to calculate hours |
| Legacy History CSV export/import | CORE PARITY / REBUILD | File services | Safe staged validation/merge |
| Full JSON backup | CORE REBUILD | Backup/restore | Disaster recovery format |
| Human Time Report CSV | CORE REBUILD | Reporting | Separate from round-trip History CSV |

---

## 6.4 Browser shell and recovery

| Feature | Disposition | Structural owner | Notes |
|---|---|---|---|
| Shared Chrome/Edge source | CORE PARITY / REBUILD | Chromium platform layer | No browser fork without proven need |
| Popup version/status | CORE PARITY | Extension shell | Package version is canonical |
| Update availability/check support | CORE PARITY | Background/popup | Release behavior remains extension-owned |
| Duplicate-runtime suppression | CORE REBUILD | Lifecycle/boot | Root existence alone is not health |
| Stale-root recovery | CORE REBUILD | Lifecycle/boot | v0.7.1 lesson retained |
| Extension reload recovery | CORE REBUILD | Lifecycle | Must not invent elapsed time |
| Browser-specific acceptance | CORE REBUILD | Release gates | Chrome and Edge both receive browser gates |

---

# 7. Presentation Feature Ledger

## 7.1 Core Timer presentation

Required first-release axes remain:

```text
Timer Appearance
Light | Dark | Auto

Panel Finish
Solid | Glass
```

These affect Companion presentation only.

## 7.2 Core SquareCoil website presentation

Required first-release website choices remain:

```text
Original
Refined Light
Sleek Dark
```

This is the stable, comprehensible core.

The historical theme mine validates the design DNA behind these choices:

- dark neutral/graphite hierarchy;
- glass surfaces used deliberately rather than everywhere;
- readable forms/tables/panels/modals;
- semantic status colors preserved;
- strong focus/readability repairs;
- custom dark-logo handling;
- restrained macOS-like polish where useful.

## 7.3 Historical Cinematic Wallpaper

Actual historical v2.2.7 functionality included:

- fresh Bing UHD background retrieval;
- fallback wallpaper;
- cached background state;
- dedicated fixed wallpaper host/layers;
- cinematic pan/zoom treatment;
- crossfade-style transitions;
- reduced-motion handling;
- live-backdrop glass presentation.

**Disposition: OPTIONAL POST-CORE PRESENTATION.**

Recommended architecture:

```text
Website Theme
Original | Refined Light | Sleek Dark

Optional Background Mode
None | Cinematic Wallpaper
```

Important boundary:

- background mode never owns Timer State, SquareCoil Bridge, or lifecycle health;
- network/background failure falls back to no custom background;
- first install remains `None`;
- Sleek Dark remains usable without wallpaper;
- reduced-motion/accessibility precedence remains above animation preference.

The exact refresh cadence, cache policy, source policy, and failure behavior belong to downstream Logic if this optional feature is activated for a release.

## 7.4 Historical Design Dashboard refresh

Actual v2.2.9 code contained a presentation refresh scoped specifically to:

```text
/dashboard.php?show=2
```

It styled the Design Dashboard's KPI widgets, design lists, panel surfaces, controls, and related modal presentation.

**Disposition: OPTIONAL POST-CORE PRESENTATION PROFILE.**

Recommended architecture:

```text
Website Theme Service
        ↓
Page Presentation Profiles
├── Base SquareCoil surfaces
└── Design Dashboard profile (optional)
```

The profile must remain paint/layout presentation. It must not absorb Design Request business logic.

## 7.5 Historical typography

Space Grotesk / Manrope and macOS/SF-style typography appeared in historical visual work.

**Disposition: design-system input, not a separate product setting.**

Typography may be selected as part of the final visual system, but exposing a font picker is unnecessary unless later requested.

---

# 8. Explicitly Excluded Sibling Systems

The repository contains other valuable US Sign tools. They are not Companion feature parity.

Examples include:

- Design Job Tools;
- Project Scope Workspace;
- Description / File Path tools;
- Scope of Work File Tools;
- Menu Cleanup;
- Sticky Project Rail;
- UI Runtime Fixes serving broader site customization;
- Adobe Acrobat color tooling;
- other job/scope automation utilities.

**Structural decision:** do not merge these business workflows into Companion.

They may share visual tokens or future integration points, but they retain separate ownership unless the user explicitly starts a new consolidation project.

This protects Companion from becoming an all-purpose monolith.

---

# 9. Updated Product Architecture

The existing Master Plan remains valid with one refinement: presentation now has an explicit optional-profile layer.

```text
Browser Extension Shell
│
├── Chromium platform adapter
├── background / update / packaged assets
└── popup
        │
        ▼
Companion Core
│
├── Lifecycle Coordinator
├── Fenced Authoritative Writer
├── Canonical Read Model
├── Preferences
└── UI Renderer / Router
        │
        ├─────────────────────────────┐
        ▼                             ▼
SquareCoil Integration           Domain Features
├── read-only Bridge             ├── Timer
├── context parser               ├── Recent / Workspace
├── native verification          ├── Time Overview
└── normalized evidence          ├── History
                                 ├── Archive / Housekeeping
                                 ├── Backup / Restore / CSV
                                 ├── Activity
                                 ├── Navigation
                                 └── Support / Developer Support
        │
        ▼
Presentation System
├── Timer Appearance
├── Timer Finish
├── Website Theme
└── Optional Presentation Profiles
    ├── Cinematic Background
    └── Design Dashboard profile
```

Presentation profiles consume preference/page/context information only. They do not gain timing authority.

---

# 10. Updated UI Architecture

## 10.1 Primary timer shell

The primary shell should stay low-noise:

```text
[ Job tabs: max ~5 numbered jobs ]

Selected Context
Status
TODAY
Job / Context Total
Current Session (secondary, only when meaningful)

State-appropriate actions
```

### Tab parity requirement

Visible numbered Job tabs should structurally support:

```text
Job identity
live authoritative elapsed summary
threshold accent
selected indicator
close/hide affordance when safe
```

Exact density and refresh behavior belong to Logic/UI implementation.

## 10.2 Actual operational truth

If selected Context differs from operational Context, always preserve an independent operational indicator.

This keeps the safest rebuild improvement and prevents historical-tab inspection from visually hiding the real running/awaiting/paused Context.

## 10.3 Nested destinations

Recommended one-router hierarchy:

```text
MAIN
│
├── Recent Jobs
├── Time Overview
│   ├── Today
│   ├── By Day
│   └── By Job / Context
├── History
├── Activity Log
└── Settings
    ├── Timer Appearance
    ├── Panel Finish
    ├── Website Theme
    ├── Timer Limits
    ├── Archives & Backup
    ├── Support
    └── About / Developer Support
```

Optional post-core presentation settings may later appear under Website Theme/Appearance without changing domain navigation.

---

# 11. Current Prototype Position

The prototype branch is intentionally ahead of the older recovery docs.

Current known branch shape entering this reconciliation:

```text
Accepted B1 lifecycle
        ↓
Accepted B2.1 fenced kernel
        ↓
Accepted B2.2 trusted transition core
        ↓
Prototype nested workspace UI
        ↓
Prototype UI interaction gate
```

The prototype demonstrates useful B3-facing interaction, but it does not mean canonical B2 or B3 are fully complete.

Known structural/implementation caveats remain:

- full B2 is not yet canonically settled;
- legacy migration invocation remains incomplete;
- native action 2/3/4 completion observation remains incomplete;
- final READY/full B2 settlement remains incomplete;
- prototype UI still uses frequent full `innerHTML` rerendering;
- search focus is guarded, but scroll preservation is not solved;
- direct A -> B operational change auto-focus exists, while null clock-out -> later B still needs a deliberate contract/implementation path;
- new prototype UI has functional interaction gates but still lacks full real installed-browser A4 acceptance.

These are implementation/readiness facts, not reasons to reopen settled core architecture.

**2026-08-27 B2-C completion addendum:** the B2 caveats above describe the checkpoint that entered this reconciliation. The active `codex/squarecoil-b2c-migration` branch has since implemented and accepted migration invocation, passive native action 2/3/4 observation, current-OWNER routing, verification fallback, and the final READY settlement gate.

**2026-08-28 B3 acceptance addendum:** the canonical workspace implements the L5/L5A tab, focus, selected/current, Recent, Overview, daily/context detail, and finalized History contract. Exact candidate `e3b369e691df317462bf6ef53cd981f682cca1d2` passed clean-package, installed Chrome/Edge, and CI acceptance. Optional presentation and destructive data features remain outside B3.

**2026-08-28 B4 acceptance addendum:** the fenced data-safety layer implements archive/restore, explicit deletion/wipe, exact Full Backup, History CSV, reporting-only Time Report CSV, conflict-aware merge/replace, and quiescence/protected-state gates. Exact candidate `e5b6bb6014aee087b85fcd97901b3944e45a77ec` passed clean-package, installed Chrome/Edge, and CI acceptance without restoring live Timer state.

**2026-08-28 B5-A acceptance addendum:** one revisioned Preferences service now drives Settings, Timer Limits, Light/Dark/Auto, Solid/Glass, Original/Refined Light/Sleek Dark, Support/Feedback, privacy-safe diagnostics, and fail-closed Developer Support. Exact candidate `117b81604c66d57a3cbf356d6d974bef4a887242` passed 437 aggregate tests, 13 prototype tests, 24/24 installed cases in both Chrome and Edge, exact package identity, and CI with no native mutation attempt. B5-B optional presentation remains off and separately gated.

**2026-08-28 B5-B acceptance addendum:** the two explicitly activated optional packs are now implemented without importing userscript runtime code. Cinematic is off by default, exact-permission/privacy bounded, readiness/cache/fallback/generation fenced, and removable. The CSS-only Dashboard profile is exact-route gated and preserves native business state. Exact candidate `fff15682dd605c52264176a2a8282d897c6cb98b` passed 477 aggregate tests, 13 prototype tests, 25/25 installed cases in Chrome and Edge, exact package identity, and CI with no native mutation attempt. Every other inventoried userscript feature remains deferred, excluded, superseded, or evidence-only.

**2026-08-28 B5-C acceptance addendum:** the light probe-backed theme delta is accepted at `aeac7fe52a2e723106340bc6d283d2eb49521573`. It is limited to CSS-only repairs for persistent top-right dropdowns, exact Leads filters, and exact Install Calendar surfaces. CKEditor iframe work and broad route/vendor parity remain a separately gated future B5-D milestone.

---

# 12. Build Path From the Current Checkpoint

The old generic sequence `B1 -> B2 -> B3...` is still useful, but this branch needs a current-state path rather than pretending B1 has not started.

## Phase R0 - Framework reconciliation

**Now complete with this document.**

Outputs:

- mined feature ledger;
- required vs optional vs excluded classification;
- updated presentation boundary;
- Logic delta scope;
- corrected branch recovery documentation.

## Phase R1 - Logic delta reconciliation

Do **not** restart all Logic from L0.

Required delta focus:

1. L5 tab presentation parity:
   - live elapsed value in visible Job tabs;
   - threshold accent supplied by canonical read model;
   - ensure parity does not create a second timing calculation.
2. L8 acceptance coverage for that tab parity and current-focus behavior.
3. L7/L8 only if optional Cinematic Background or Design Dashboard profile is activated for a target release.

Earlier logic remains authority unless a true contradiction is found.

## Phase B2-C - Complete canonical B2

Before calling the core finished, close the currently known canonical gaps:

- migration invocation path;
- safe observation of relevant native action 2/3/4 completion without Companion initiating native mutation;
- final READY/full B2 acceptance evidence;
- canonical B2 settlement.

The prototype UI must not be used to hide unfinished B2 authority work.

**Completion addendum:** this bounded phase is accepted on the active branch. The user subsequently authorized sequential continuation through B6.

## Phase B3 - Canonical Time Views / Workspace

Promote the useful prototype concepts into the canonical B3 architecture:

- single renderer/router ownership;
- selected vs operational truth;
- Recent Jobs;
- Time Overview;
- History;
- search/open job;
- visible-tab cap and hide/show;
- persistent reorder;
- live tab elapsed summary;
- threshold accent;
- collapse/expand;
- correct current-focus intent;
- retained focus/scroll behavior suitable for real use.

The prototype is source material, not an excuse to skip B3 acceptance.

## Phase B4 - Data Safety / Files

Implement only after L6 authority is satisfied:

- archive/restore;
- Clear Recent;
- Delete/Wipe;
- Full Backup JSON;
- Restore pipeline;
- History CSV;
- Time Report CSV;
- large-history access/retention guarantees.

**Completion addendum:** accepted at exact candidate `e5b6bb6014aee087b85fcd97901b3944e45a77ec`.

## Phase B5-A - Core presentation/settings/support

First-release presentation scope:

- Light/Dark/Auto Timer Appearance;
- Solid/Glass Timer Finish;
- Original/Refined Light/Sleek Dark Website Theme;
- semantic status treatment;
- dark logo fallback behavior;
- Settings routes;
- Support/Feedback;
- Developer Support if configured.

**Completion addendum:** accepted at exact candidate `117b81604c66d57a3cbf356d6d974bef4a887242`; missing Developer Support configuration remains visibly unavailable rather than fabricated.

## Phase B5-B - Optional presentation packs

Only after the core is stable:

- Cinematic Background;
- Design Dashboard presentation profile.

These may ship later than the core release without structural debt.

**Completion addendum:** the two activated packs are accepted at exact candidate `fff15682dd605c52264176a2a8282d897c6cb98b`. This does not promote any other mined feature or authorize publication.

## Phase B6 - Browser acceptance / candidate

- installed Chrome acceptance;
- installed Edge parity;
- migration/data fixtures;
- packaging identity;
- exact accepted bytes promoted;
- production promotion only by explicit decision.

---

# 13. Gate Architecture

## Gate G0 - Framework

Pass when scope, owners, feature disposition, and module boundaries are settled.

**Current result: PASS.**

## Gate G1 - Logic delta

Pass when the newly surfaced required parity features have behavior contracts without reopening unrelated settled logic.

## Gate G2 - Core B2 authority

Pass when canonical state/bridge/core-timer gaps are closed and accepted.

**Current result: PASS.**

## Gate G3 - Workspace/time views

Pass when B3 UI reads one canonical model, preserves selection/operational separation, and interaction behavior is accepted.

**Current result: PASS.**

## Gate G4 - Data safety

Pass when destructive and file workflows are safe, staged, and migration/restore compatible.

**Current result: PASS.**

## Gate G5 - Core presentation

Pass when themes/settings cannot destabilize the core and installed-browser interaction remains good.

**Current result: PASS.**

## Gate G5-OPT - Optional visual packs

Independent opt-in gate for Cinematic Background / page profiles. Failure here must not block a core build that does not include the pack.

**Current result: PASS.**

## Gate G6 - Candidate/release

Pass only after required real-browser acceptance and artifact identity checks.

Detailed runtime acceptance conditions remain Logic ownership.

---

# 14. Risks and Tradeoffs

## 14.1 Historical-feature inflation

Risk: treating every old experiment as required parity recreates the overloaded product.

Control: feature disposition classes and post-core optional presentation boundary.

## 14.2 Prototype outrunning canonical stages

Risk: attractive UI work can create pressure to treat unfinished state/bridge work as complete.

Control: keep B2 settlement independent from prototype polish.

## 14.3 Multiple planning authorities

Risk: old planning-branch metadata can mislead future work.

Control: `REBUILD-START-HERE.md` becomes the current checkpoint and points to this reconciliation after the Master Plan.

## 14.4 Visual effects harming stability

Risk: network wallpaper, blur, animation, page-wide styling, or repeated DOM work can recreate performance/interaction bugs.

Control: presentation isolation, opt-in defaults, bounded effect ownership, separate optional gate.

## 14.5 Legacy logic contamination

Risk: old timer code contains useful behavior and unsafe ownership in the same file.

Control: mine feature intent, do not copy behavior implementation wholesale into the rebuild.

## 14.6 Separate-tool scope creep

Risk: Design/Scope/File/Menu tools are useful and visually adjacent, making them tempting to absorb.

Control: explicit sibling-system exclusion.

---

# 15. Structural Handoff to Logic Systems Architect

## What the handoff covers

A targeted reconciliation of newly mined feature ancestry against the already-settled L0-L8 logic package.

## Relevant layers and ownership boundaries

```text
L5 / Read Model + Workspace UI
→ required legacy tab-presentation parity

L7 / Presentation
→ optional visual-pack boundary only if activated

L8 / Acceptance
→ regression/acceptance coverage for the delta
```

## Major components

- canonical read model;
- visible Job tabs;
- threshold presentation;
- current-focus intent;
- Theme service;
- optional Presentation Profiles;
- acceptance/gate model.

## Structural flow shape

```text
Authoritative State / Ledger
        ↓
Canonical Read Model
        ↓
Tab + Main + Library Views

Preferences / Page Context
        ↓
Theme Service
        ↓
Core Theme
        ↓
Optional Presentation Profile
```

## Explicitly deferred to Logic

- exact tab elapsed source/refresh semantics;
- threshold rendering behavior when status and threshold coexist;
- current-focus transition conditions including null -> Context cases;
- optional wallpaper refresh/cache/failure behavior if activated;
- optional dashboard-profile failure/fallback behavior if activated;
- exact acceptance criteria and regression cases.

## Open structural questions

None that block core Logic.

Optional visual-pack inclusion in the first release is intentionally **not required** for core progress.

---

# 16. Readiness Gate

## Framework ready for logic

**Reason:** the feature mine no longer leaves downstream Logic to invent product scope, layer ownership, module placement, or the distinction between core parity, optional presentation, and unrelated sibling tools.

### Settled structural items

- core Companion scope;
- Timer/tab parity families;
- Time/Workspace/Data feature families;
- browser/lifecycle ownership;
- one writer / one renderer / one Bridge model;
- core presentation axes;
- optional Cinematic Background boundary;
- optional Design Dashboard presentation-profile boundary;
- sibling-tool exclusion;
- current implementation-stage position;
- staged path from B2 completion through release;
- Logic delta ownership.

### Provisional items

- final visual typography;
- whether optional visual packs ship in the first rebuilt release or later;
- final micro-layout;
- implementation technology choices already deferred by the Master Plan.

### Blockers

None upstream for a **targeted Logic reconciliation pass**.

### Recommended next step

Run the Logic delta handoff rather than restarting the complete logic architecture.
