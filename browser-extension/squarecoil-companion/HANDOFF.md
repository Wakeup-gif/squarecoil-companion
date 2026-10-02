# SquareCoil Companion Maintainer Handoff

**Read this file before modifying the extension.**

**October 2, 2026 source update:** v0.7.2 is a review/test build correcting initial clock detection and restoring the user-approved custom dark logo as `assets/us-sign-dark-logo.png`. Dark modes use this packaged asset; light modes retain their existing native-logo handling. See [repair evidence](implementation/CLOCK-LOGO-REPAIR-2026-10-02.md), `CURRENT.md`, `AGENTS.md`, and `docs/EXECUTION-ENFORCEMENT-PLAN.md` for current rebuilt-source boundaries. The legacy architecture/release details below are historical, including the old runtime Imgur-fetch workflow.

Current stable release: **v0.7.0 Dual Browser + Glass**  
Repository: `Wakeup-gif/test_repo`  
Primary development branch: `main`  
Canonical extension source: `browser-extension/squarecoil-companion/`  
Target site: `https://ussignandmill.squarecoil.net/*`

This is an existing maintained customization system for Cristian's internal US Sign & Mill SquareCoil workflow. Do not treat it as a new greenfield extension and do not casually replace working timer logic.

## 1. Current release and browser strategy

v0.7.0 is one Manifest V3 implementation for both Microsoft Edge and Google Chrome.

There are not two divergent codebases. GitHub Actions packages the same source twice so testing and future store publication can be tracked independently:

- Edge artifact: `SquareCoil-Companion-v0.7.0-EDGE.zip`
- Chrome artifact: `SquareCoil-Companion-v0.7.0-CHROME.zip`
- Edge release ref: `release/squarecoil-companion-edge`
- Chrome release ref: `release/squarecoil-companion-chrome`
- Generic stable ref: `release/squarecoil-companion`

Do not fork browser behavior unless a real API incompatibility is proven.

## 2. Current package defaults

First-install defaults are intentionally conservative:

- Timer appearance: `light`
- Timer panel finish: `solid`
- Website theme: `original`
- Timer enabled: `true`

Glass/Blur is opt-in. Updating the extension must not silently make an existing user's timer translucent.

## 3. Ownership by module

### `manifest.json`

Owns MV3 permissions, host permissions, popup entrypoint, website theme CSS registration, and the isolated content controller.

### `background.js`

Owns extension-privileged behavior:

- probes whether a SquareCoil timer runtime/root already exists
- injects MAIN-world timer modules in order
- retrieves `release.json`
- exposes browser update status
- fetches and caches the dark-theme custom logo from Imgur

MAIN-world injection order is intentional:

1. `page/timer-runtime.js` only when no runtime/root exists
2. `page/timer-controls.js`
3. `page/timer-workspace.js`
4. `page/timer-surface.js`

Do not inject a second timer runtime when an existing Tampermonkey timer is already present.

### `content/theme-controller.js`

Runs as the normal isolated extension content script and owns persisted preferences:

- `themePreference`: light / dark / auto
- `timerSurface`: solid / glass
- `squareCoilTheme`: original / light / dark
- `timerEnabled`

It reflects those preferences into `document.documentElement.dataset` so MAIN-world UI modules and CSS can react without requiring extension APIs in the page world.

It also owns the dark-logo application boundary.

### `page/timer-runtime.js`

This is the behavior-critical timer engine. Treat it as stable unless a proven clock/state bug requires modification.

The timer state key is:

`ussign-squarecoil-job-timer-v1`

Important invariant: there is only one real active SquareCoil clock context. Timer tabs are recent visual workspaces, not simultaneous clocks.

### `page/timer-controls.js`

Owns the established timer settings/navigation UI and Light/Dark/Auto selection. Its internal module version predates the package version and is not the release source of truth. v0.7.0's additive `timer-surface.js` patches the visible settings version to the package version rather than rewriting this stable file merely for metadata.

### `page/timer-workspace.js`

v0.6 additive Job Workspace behavior. Owns:

- Companion Pause / Resume
- direct job links
- recent job individual delete/archive
- Archive All / Clear Recent
- archive restore/delete
- CSV export
- CSV import/restore for continued tracking
- full recorded timer-history wipe
- activity logging for workspace actions

Archive storage key:

`ussign-squarecoil-job-timer-archive-v1`

Activity storage key:

`ussign-squarecoil-job-timer-activity-v1`

CSV schema identifier:

`squarecoil-job-timer-csv-v1`

### `page/timer-surface.js`

v0.7 additive presentation layer. Owns only:

- Solid / Glass timer-finish control in the expanded timer Settings Home
- persisted finish request event bridge
- frosted timer shell/tab CSS
- visible package-version correction in Settings Home

It does not own timer state or SquareCoil clock behavior.

### `styles/site-theme.css`

v0.6 base website paint for Refined Light and Sleek Dark. Original deliberately matches no website-theme selectors.

### `styles/site-theme-v070.css`

v0.7 additive audit overlay. It exists so the stable v0.6 base can remain easy to compare/restore. It owns:

- dark inherited white/bright border normalization
- neutral dark default/secondary controls
- focus-visible treatment replacing thick native white halos
- common AdminDesign/Bootstrap surface cleanup
- dark logo border/background/shadow cleanup

It must preserve semantic colored states such as blue primary, green success, amber warning, red danger, and colored panel top accents.

## 4. SquareCoil timer behavior contract

SquareCoil is authoritative. The Companion never invents company clock state.

Settled behavior:

- Only one real active SquareCoil clock context exists.
- Timer tabs are recent visual workspace, not concurrent clocks.
- Selecting/viewing a timer never clocks into that job.
- Selecting a tab is separate from the actual active SquareCoil context.
- A real SquareCoil context switch pauses the prior timer and starts/resumes the incoming context according to runtime rules.
- Full SquareCoil clock-out pauses the active Companion timer.
- Department changes inside the same project should not reset the main project timer.
- A missed start time that was never observed cannot be reconstructed. Never invent elapsed time.
- Up to five real job tabs are visible; old inactive tabs may be hidden while history is retained.
- Active/pending tabs cannot be hidden or destructively removed.
- Hidden active jobs must reappear.
- Tabs are reorderable and order persists.
- Same-context verification should not repeatedly expand a timer the user manually collapsed.

## 5. Manual Pause / Resume contract

Manual Pause affects the Companion timer only.

It must never secretly call SquareCoil clock-out or mutate the company time clock.

Manual Resume is allowed only when the runtime still reports that SquareCoil is clocked into the same context. If SquareCoil moved to another job or clocked out, the Companion must block manual resume and tell the user to return/clock into the job first.

Do not reinterpret the Pause button as a SquareCoil time-card action without an explicit future product decision and a fully mined native department/action contract.

## 6. Native SquareCoil time-clock facts already mined

Known native AJAX behavior from earlier runtime analysis:

- clock-in modal uses action 1 / action 8
- clock into project/department: POST `ajax_time_clock.php` with action 3 plus project, department, notes
- clock out of project: action 4
- full clock out: action 2
- header refresh: action 7
- remaining-time popup: action 19

`#clockin-remaining-time.data("time")` represents labor remaining, not elapsed job time.

A previous blocker to direct Companion clock-in was missing a reliable stored department id/code mapping. Do not invent that mapping.

## 7. Job Workspace destructive behavior

Recent-job deletion is only allowed for inactive/unprotected job contexts.

Archiving removes an inactive job from Recent Jobs while preserving accumulated time and sessions in the archive store.

Archive All applies only to inactive jobs.

Clear Recent removes inactive recent jobs but does not delete archived jobs.

Wipe History intentionally clears recorded accumulated time/sessions and activity history while retaining job entries. It requires explicit confirmation.

Before altering any destructive rule, inspect `timer-workspace.js` and preserve active/pending protection.

## 8. CSV backup and restore

CSV export is intended as a portable user backup of recent plus archived job history and hours.

CSV import restores records as paused/recent job state so tracking can continue. Import must not silently create a running timer or claim SquareCoil is clocked into an imported job.

When merging a restored/archive job with an existing context, session IDs are deduplicated. Avoid simplistic time addition that could double-count overlapping history.

## 9. Timer visual model

Timer appearance and timer finish are separate axes:

Appearance:

- Light
- Dark
- Auto

Finish:

- Solid
- Glass / Blur

Solid remains the default.

Glass implementation rule: use one expensive backdrop blur on the visible outer shell and, where useful, the floating tabs. Nested `.jt-main`, `.jt-settings`, `.jt-resume`, and `.jt-empty` surfaces use translucent paint but explicitly avoid their own Gaussian backdrop blur. This prevents blur stacking, excess GPU work, and a muddy opaque result.

Do not convert every internal wrapper into a blurred card.

## 10. Website theme model

Website theme choices are:

- Original: no Companion website paint
- Refined Light: cleaned-up native SquareCoil light experience
- Sleek Dark: neutral graphite night mode

The base theme was built from actual SquareCoil surface audits, including:

- `header.navbar`
- `#sidebar_left`
- `#content_wrapper`
- `#content`
- `#pmlt`
- `#project_menu`
- `.tray`
- `.panel`, `.panel-heading`, `.panel-body`
- `.well`
- `.alert`
- `.form-control`
- `.btn`
- Project Status milestone `ul.nav.tabs-left` plus `.tab-content`

Important correction already settled: `#pmlt` is a separate light project-navigation tray in native SquareCoil. Refined Light must not accidentally turn it into a dark sidebar.

## 11. Sleek Dark white-outline audit

The user reported bright/white outlines around dark-theme elements.

v0.7.0 addresses this with `site-theme-v070.css` loaded after the base stylesheet.

The overlay normalizes common native borders and shadows for panels, wells, modal/dropdown/popover surfaces, tab blocks, list groups, input addons, thumbnails, widgets, and related AdminDesign elements.

It also replaces thick native focus halos with a restrained blue `:focus-visible` outline so keyboard focus remains accessible rather than simply deleting focus indication.

Do not solve future outline reports with an indiscriminate `* { border: 0 }`. That would destroy useful structure and semantic states.

## 12. Logo behavior

Current known custom logo URL:

`https://i.imgur.com/7I1u2iF.png`

This is the same custom logo source already used by the canonical Tampermonkey `US-Sign-UI-Runtime-Fixes.user.js`.

v0.7.0 behavior is deliberately asymmetric:

- Sleek Dark: use the cached custom logo.
- Refined Light: keep the native SquareCoil logo.
- Original: keep the native SquareCoil logo.

The user has not supplied the updated light-theme logo yet. Do not recolor, invert, synthesize, or assume the dark logo is the correct light logo. Wait for the user's explicit light-logo asset/change request.

The content controller saves the native `src`/`srcset` before applying the dark logo and restores them when leaving Sleek Dark.

The service worker fetches/caches the logo because extension-privileged fetch is more reliable than depending on page CORS/CSP behavior.

## 13. Theme design intent

Sleek Dark should be graphite/neutral charcoal, not navy-heavy.

Use semantic color only where it communicates meaning:

- red: destructive, overdue, danger
- amber: warning, due soon, Change / Clock Out style actions
- blue: primary/informational
- green: complete/success/Clock In
- purple: hold/paused when explicitly needed
- gray: neutral utilities

Avoid turning every border, card, or link into a bright blue accent.

Refined Light should feel like an improved SquareCoil, not a completely unrelated redesign.

## 14. Release and CI contract

Workflow:

`.github/workflows/squarecoil-extension-validate.yml`

Every extension release must pass:

1. JavaScript parse checks via `node --check`.
2. `manifest.json` and `release.json` JSON validation.
3. manifest/release version match.
4. existence checks for manifest-referenced files and required timer modules.
5. Edge ZIP build and package-root verification.
6. Chrome ZIP build and package-root verification.
7. upload of both artifacts.

Do not call a release ready while this workflow is red.

## 15. Version/source-of-truth rules

Package version source of truth:

- `manifest.json.version`
- `release.json.latestVersion`

These must match.

Some additive MAIN-world modules carry their own internal module versions for teardown/debugging. Do not rewrite a stable behavior file solely to make every internal constant equal the package version.

## 16. Current continuity state

### Settled

- one shared Edge/Chrome MV3 source
- v0.7.0 package target
- Light is the timer first-install appearance default
- Solid is the timer first-install finish default
- Glass / Blur is opt-in
- SquareCoil remains authoritative for real clock state
- Manual Pause/Resume is Companion-only
- current Job Workspace archive/CSV behaviors
- Sleek Dark gets the custom logo
- Refined Light and Original keep native logo for now
- dark outline cleanup is an additive overlay, not a destructive rewrite of the base theme

### Provisional / needs browser observation

- the v0.7.0 dark-outline selector set is based on audited SquareCoil project/milestone surfaces and known Bootstrap/AdminDesign components. If a new page exposes a bright outline from a different component, target that component rather than broadening to destructive global rules.
- live Dashboard Design Requests selectors have not been audited with the same precision as the project/milestone pages.

### Open

- updated light-theme custom logo asset is still pending from the user.
- Edge Add-ons listing URL is not yet published.
- Chrome Web Store listing URL is not yet published.

## 17. Migration / duplicate-runtime troubleshooting

Old individually installed Tampermonkey timer versions can still execute if the user has them enabled separately. The repo cannot remotely disable those installations.

If symptoms include duplicate timer roots, repeated clicks, duplicated recent jobs, or conflicting state changes, first check the browser's Tampermonkey dashboard and ensure only the intended canonical timer/extension path is active.

v0.7.0's extension boot probe avoids injecting a second timer engine when it detects the existing timer global/root, but it cannot prevent another separately enabled userscript from independently running its own code.

## 18. Safe continuation method for a new chat

When taking over this project:

1. Read this `HANDOFF.md` fully.
2. Fetch the current `manifest.json`, `release.json`, `background.js`, `content/theme-controller.js`, and the specific timer/theme module you intend to change.
3. Confirm `main` and the current release branches before writing.
4. Decide whether the issue is timer behavior, workspace behavior, timer presentation, website paint, or extension packaging. Change the smallest owning layer.
5. Preserve the timer state keys and behavior invariants unless the user explicitly approves a migration.
6. Create a restore branch before a risky behavior/theme change.
7. Update package version only for a real release.
8. Keep `manifest.json.version` and `release.json.latestVersion` synchronized.
9. Run the GitHub validation workflow and require green status.
10. Publish/download both Edge and Chrome artifacts for a dual-browser release.
11. Update this handoff whenever a settled behavior or active blocker changes.

The key quality test is simple: downstream work should not need to guess whether a behavior belongs to SquareCoil, the timer engine, the Job Workspace, the visual surface layer, or website theme paint.
