# Companion UI and Theme Integration

**Status:** exact clean candidate passed aggregate and installed Chrome/Edge acceptance; optional live Bing permission grant remains a manual supplemental check
**Date:** 2026-08-28
**Core boundary:** frozen; no Timer/Ledger writer, observation, settlement, migration, native clock, or SquareCoil business-action change.

## Visual baseline

The implementation preserves the useful traits of the original Companion rather than copying its old structure:

- compact browser-tool density;
- small uppercase section labels;
- restrained 8–15 px radii and thin borders;
- low-contrast layered surfaces with one outer glass blur;
- clear typography, explicit focus rings, and semantic status colors;
- the `SC` mark plus `SquareCoil` identity.

Reference captures:

- original v0.7.0 popup: `C:/Users/iamva/AppData/Local/Temp/squarecoil-ui-baselines-2026-08-28/original-v071-popup.png`;
- accepted direction: `implementation/ui-concepts/B5E-UI-DIRECTION.png`;
- user-provided working and zero-history captures listed in the task handoff.

The generated concept was directional only. Production deliberately removes its stale “B6 release candidate” and authority-document copy.

## Copy mapping

| Internal/old primary copy | User-facing copy | Raw location |
|---|---|---|
| raw lifecycle/classification/reason/runtime | Ready, Working, Limited, Setup required, Offline, Needs attention | Technical details only |
| B6 release candidate | Companion workspace | removed from normal UI |
| authority status text | Ready / Working / Needs attention | Advanced diagnostics retains a privacy-safe snapshot |
| Actually running / observed | Working now | no raw duplicate |
| trusted read/data/preferences service | Companion data / data tool / settings | diagnostic snapshot only |
| preference/effective codes | named theme and plain availability sentence | raw values only in diagnostics |
| revision footer | timezone/time basis plus Technical details | raw revision not shown |
| session/cycle/ledger identifiers | date, time and duration | invisible test provenance only; not rendered as primary text |

## Settings information architecture

Settings is available when there is no current job and is grouped as:

1. Appearance
2. Time tracking
3. Jobs and watching
4. Notifications
5. Dashboard
6. Privacy and permissions
7. Advanced diagnostics

Unproven watched-job and notification features are labeled “Not available yet” without an enabled-looking control.

## Performance and lifecycle plan

- One base theme style layer; repeated apply deduplicates it.
- One wallpaper engine/host; generation fencing rejects late results.
- One dashboard style layer and one bounded read-only summary host on the exact eligible route.
- No route-general MutationObserver styling loop.
- Four bounded same-origin CKEditor scans; inaccessible documents fail closed.
- No nested backdrop blur and no parallax duplication.
- Reduced-motion and forced-color modes remove or suspend nonessential presentation.
- Native / Off and feature disable remove all owned presentation resources.

## Acceptance target

- focused unit coverage for Light Glass, Dark Glass source facts, popup friendly-state fail-closed mapping, zero-history Settings, Advanced diagnostics, and dashboard summary ownership;
- full aggregate repository gate and prototype-compatibility gate;
- synthetic responsive, keyboard, focus, console, print, forced-color, exact-route, teardown, and duplicate-layer checks;
- installed branded Chrome and Edge clean and upgrade profiles;
- no native clock/business mutation requests during acceptance.

## Development acceptance evidence

The final dirty-development package completed the installed-browser matrix before commit. It is deliberately classified `NON_ACCEPTANCE_DIRTY_DEVELOPMENT`; the clean-source package is the release decision record.

| Browser/profile | Result | Cases | Console/page errors | Native mutation attempts |
|---|---:|---:|---:|---:|
| Chrome 151 clean | PASS | 29 / 29 | 0 / 0 | 0 |
| Chrome 151 v0.7 upgrade | PASS | 2 / 2 | 0 / 0 | 0 |
| Edge 151 clean | PASS | 29 / 29 | 0 / 0 | 0 |
| Edge 151 v0.7 upgrade | PASS | 2 / 2 | 0 / 0 | 0 |

The 360 px viewport check measured the workspace at 336 px, from x=16 through x=352, with `scrollWidth === clientWidth === 336`. Keyboard traversal reached the Copy diagnostics control with a visible solid 3 px focus outline. The package archive remained byte-identical during the run and its extracted inventory matched the validated inventory.

Durable pre-commit evidence is stored outside the repository at `C:/Users/iamva/Documents/SquareCoil Companion Acceptance/B5E-precommit-20260828`. It includes both browser screenshots, the JSON run record, package validation record, and the three visual baselines. Final clean-source evidence and the install package are recorded in `implementation/B6-GLASS-STABILIZATION-EVIDENCE.md`; their embedded source SHA identifies the exact committed candidate.

## Fidelity ledger

| Baseline issue | Accepted implementation | Proof boundary |
|---|---|---|
| Empty state exposed almost no product surface | Home exposes Recent jobs, Time overview, History and Settings before clock-in | clean-profile zero-history fixture and Settings-home capture |
| Settings and future feature areas were hidden | Settings always lists Appearance, Time tracking, Jobs and watching, Notifications, Dashboard, Privacy and permissions, and Advanced diagnostics | absent capabilities are visibly `Not available yet`, never enabled-looking |
| Popup led with release-stage and authority terminology | Popup leads with Ready/Working/Needs attention and current work; raw state stays under Technical details | exact fail-closed settlement response is still required for Ready |
| Only one dark presentation direction was evident | Native / Off, Dark Glass 2.3.4, Light Glass 1.0.0 and Refined Light 1.0.1 are selectable | one owned theme layer; Native / Off removes it |
| Dashboard styling had no bounded Companion summary | Exact `/dashboard.php?show=2` eligibility may add one read-only status summary | different dashboard modes allocate no style or summary host |
| Dense diagnostics dominated normal use | Advanced diagnostics is a separate friendly route with collapsed technical details and explicit copy | diagnostics are privacy-safe and do not expose job names, custom data, page content or account tokens |
