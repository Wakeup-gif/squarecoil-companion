# SquareCoil Companion Execution Gate Matrix

**Status:** confirmed Companion prototype and separate analytics dashboard integration in progress; exact packaged Chrome/Edge acceptance pending
**Execution authority:** `docs/EXECUTION-ENFORCEMENT-PLAN.md`

Current authorization, impact declaration, and `PI-*` requirement gates: [Prototype integration](PROTOTYPE-INTEGRATION-2026-09-14.md). This is the confirmed prototype integration. Historical UI/theme/lab/Figma stabilization batches below remain source-bound evidence, not acceptance of this new candidate.

## Active handoff UI port — September 30

```text
Intent: adapt the exact GitHub September 9 frosted dock, Context tabs, Home and integrated Settings into the existing single Companion renderer.
Behavior: preserve canonical Timer/Bridge/authority data flow; add Home and direct Open Job affordances, retain selected versus operational truth, stabilize shell/focus across clock ticks, and keep archive/preferences on trusted commands.
Files: workspace renderer and scoped dock style, B3/B5 UI tests, sealed lab, integration/evidence documentation.
Impact tags: SHARED_UI_ROOT, WORKSPACE_SETTINGS, PRESENTATION, PACKAGE_ARTIFACT, DOCS_ONLY.
Targeted gates: B3 workspace/UI, B4 archive UI, B5 Settings/theme UI, prototype UI tests, renderer/lifecycle checks.
Composed journeys: selected versus running tabs, compact/expanded and Home/Settings routing, known Job opening, responsive/reduced-motion, protected archive and keyboard alternative, Chrome/Edge sealed lab.
Full candidate gate required: yes; exact installed acceptance follows targeted checks.
Exclusions: no UI-owned Timer/Ledger/Bridge/clock authority, no sample state, no bundled demo wallpaper, no live SquareCoil mutation or main promotion.
```

This file maps the cross-stage requirements most relevant to the current stabilization work. `OPEN` means the requirement must be verified against the new exact candidate even if an older artifact previously passed related checks.

## Active B6 UI stabilization — nested Settings, website-only logo repair, and calm Companion surfaces

```text
Intent: make the existing B6 Companion and site themes calm, navigable, and recoverable without adding product stages or changing timing/data authority
Behavior changed or restored: replace the Settings tile wall with compact accessible disclosure categories; keep Companion text-only with no logo; use the repository-established same-origin `images/US-Sign&-Mill-Logo - sized for SC site.png` path only for the SquareCoil website header; remove heavy internal Companion outlines while retaining keyboard focus indicators; reconcile Refined Light paint/contrast; keep one visible working sidebar restore control clear of website brand artwork in every collapsed custom-theme state
Files expected: workspace UI, popup, theme service, authoritative theme generator/ports, package inventory, focused B5 tests, sealed-lab/browser evidence
Impact tags: WORKSPACE_SETTINGS, PRESENTATION, PACKAGE_ARTIFACT, DOCS_ONLY
Contracts touched: L7 Settings/Themes, B5-D theme/UI, L8 exact installed acceptance
Targeted gates: settings disclosure semantics/interactions, text-only Companion chrome, website-logo apply/restore and package inventory, low-outline surface checks, Refined Light computed-style checks, collapsed-sidebar geometry/click acceptance, theme-port freshness, sealed-lab smoke, check:b5e-integration, check:b6-candidate
Composed journeys: clocked-out Settings -> expand one category -> open subroute -> back; Companion popup/workspace render without logo artwork; Original -> Refined Light/Glass website-logo replacement -> Original restoration; expanded sidebar -> collapsed -> visible reopen control -> expanded; short viewport and keyboard navigation
Full candidate gate required at completion: yes
Explicit exclusions: no real account/login or clock action; no Timer/Ledger/Bridge/native-clock authority change; no generated or substituted logo/background artwork; no B7/store publication/main-branch promotion
```

## Historical B6 profile retirement — superseded by September 30 user direction

```text
Intent: remove the redundant optional Design Dashboard profile while retaining the settled website themes and all Companion time/history tools
Behavior changed or restored: remove the Settings category, preference field, exact-route CSS/summary module, and owned dashboard artifacts; ignore legacy stored dashboard-profile values so they cannot reactivate a removed feature
Files expected: Preferences schema/storage, content presentation wiring, workspace Settings, optional registry, B5 tests/browser harness, current feature documentation
Impact tags: WORKSPACE_SETTINGS, PRESENTATION, PACKAGE_ARTIFACT, DOCS_ONLY
Contracts touched: L7 Settings/Themes, B5-B optional presentation, L8 exact installed acceptance
Targeted gates: preferences compatibility/revision tests, Settings no-dashboard regression, no-dashboard-route resource assertion, B5 integration, package validation
Composed journeys: zero-history Settings has no Dashboard category; legacy preference snapshot settles without dashboard ownership; `/dashboard.php?show=2` has no Companion dashboard layer while website themes continue normally
Full candidate gate required at completion: yes
Explicit exclusions: no Timer/Ledger/Bridge/native-clock authority change; no real account/login or clock action; no new dashboard replacement or B7/store/main promotion
```

## Active Bing delivery repair — canonical OHR identity, retained cache, and visible Glass image

```text
Intent: repair the Bing wallpaper policy and delivery path without widening its origin, permission, privacy, redirect, image-format, or presentation authority
Behavior changed or restored: validate only an exact public OHR image ID from HTTPS www.bing.com/th metadata, discard provider parameters, construct the fixed image request internally, retain the last safe cached image after failures, report exact presentation/failure states, and keep the painted image visible beneath both integrated Glass themes
Files expected: wallpaper provider, cinematic presentation, generated theme ports, workspace UI, privacy-safe diagnostics, focused B5 tests, installed-browser harness/docs, exact-package evidence
Impact tags: PRESENTATION, SUPPORT_PRIVACY, PACKAGE_ARTIFACT, DOCS_ONLY
Contracts touched: L7 Settings/Themes, B5-B optional presentation, L8 exact installed acceptance
Targeted gates: provider URL/cache/failure tests, cinematic DOM/CSS tests, UI/diagnostics wording tests, theme-port freshness, sealed-lab smoke, check:b5e-integration, check:b6-candidate
Composed journeys: permission absent -> gradient; trusted popup grant -> live Bing image; Dark Glass -> Light Glass visible-photo transition; network/response failure -> safe retained cache; no cache -> accurate gradient; accessibility override
Full candidate gate required at completion: yes
Explicit exclusions: no real account/login or clock action; no Timer/Ledger/Bridge/native-clock authority change; no arbitrary provider origin/path/redirect/parameter/image format; no generated, packaged, or substituted background artwork; no store publication or main-branch promotion
```

## Active stabilization batch — safe test lab, coherent Glass themes, and Chrome-style job tabs

```text
Intent: provide a sealed fictional SquareCoil lab, repair mixed Glass surfaces and the current Bing URL policy, and move job tabs above the Companion frame with safe reorder/archive gestures
Behavior changed or restored: fake actions 2/3/4/7 exercise the real observation pipeline without a real account; Dark/Light Glass remain one integrated background-and-surface choice; tabs protrude, scroll, reorder, and archive only inactive Recent Contexts through fenced Data authority
Files expected: local lab, wallpaper provider, generated theme ports, workspace UI/model, data protection read model, Figma handoff, targeted/unit/browser tests, package evidence
Impact tags: SHARED_UI_ROOT, AUTHORITY_FENCING, TIMER_LEDGER, WORKSPACE_SETTINGS, PRESENTATION, PACKAGE_ARTIFACT, DOCS_ONLY
Contracts touched: L2/L5/L5A workspace membership and focus, L6 archive/recovery protection, L7 Settings/Themes, B5-B optional presentation, B5-D theme/UI, L8 installed acceptance
Targeted gates: theme-port freshness, B3 workspace, B4 data/UI, B5 theme/settings/Figma, sealed-lab smoke/visual checks, check:b5e-integration, check:b6-candidate
Composed journeys: fictional job A -> B -> no Context -> C -> clock out; zero-history Settings; Dark/Light Glass fallback and Bing policy; tab reorder; eligible drag-to-page Archive + Undo; protected/canceled drag; short viewport
Full candidate gate required at completion: yes
Explicit exclusions: no real account/login or clock action; no Timer/Ledger/Bridge/native-clock authority change; no generated or packaged wallpaper artwork; no store publication or main-branch promotion
```

| ID | Requirement | Impact tag | Targeted proof | Composed/candidate proof | Current state |
|---|---|---|---|---|---|
| `OWN-001` | Exactly one renderer owns the contents and friendly status surface inside `#ussign-job-timer`; lifecycle fallback uses a distinct target. | `SHARED_UI_ROOT` | runtime UI fallback regression plus `UT-B5-UI-014` | popup/workspace status remains friendly through lifecycle transitions | `PASS` |
| `LIFE-001` | BFCache does not retire the live workspace; one runtime/root remains and Settings is interactive after restore. | `LIFECYCLE`, `SHARED_UI_ROOT` | `B1-LC-005/008` persisted pagehide/pageshow regression | installed Chromium BFCache -> Settings journey | `PASS` |
| `LIFE-002` | Worker restart reuses the page runtime and preserves an interactive workspace without duplicate listeners/resources. | `LIFECYCLE`, `SHARED_UI_ROOT` | `B1-LC-005/008`, `B1-LC-005/009/014` | installed worker restart -> Settings journey | `PASS` |
| `LIFE-003` | Workspace startup failure is observable, bounded, and recoverable/fallback-safe; no empty terminal catch hides it. | `LIFECYCLE`, `SHARED_UI_ROOT` | `UT-B5-UI-015`, `UT-B5-UI-016`, `UT-B5-UI-014` | visible safe fallback or successful bounded retry | `PASS` |
| `REC-001` | Recoverable `FAILED`/`UNAVAILABLE` legacy preflight is re-inspected after repair in the same core and remains fail closed until then. | `MIGRATION_STORAGE` | `UT-B2-MIG-029`, `UT-B2-MIG-030`, `UT-B2-MIG-031` | upgrade-profile recovery journey | `PASS` |
| `REC-002` | A preference fault after a committed migration cannot relabel or duplicate migration/Ledger evidence. | `MIGRATION_STORAGE` | `UT-B2-MIG-030`, `UT-B2-MIG-031` | exact-once upgrade evidence after retry | `PASS` |
| `UX-001` | Settings, Recent, Overview, and History remain available with zero history and no current clock-in. | `WORKSPACE_SETTINGS` | `UT-B5-UI-011`, `UT-B5-UI-012` | installed clean-profile zero-history Settings/theme/diagnostics journey | `PASS` |
| `UX-002` | Blocked core state keeps safe Settings and diagnostics available while Timer actions remain absent. | `WORKSPACE_SETTINGS`, `MIGRATION_STORAGE` | `UT-B5-UI-014` | malformed-upgrade profile interaction journey | `PASS` |
| `UX-003` | Settings Home is a compact disclosure navigator: category buttons expose nested destinations, only one group is expanded, and native keyboard/focus/back/close behavior remains usable without a clocked-in job. | `WORKSPACE_SETTINGS`, `PRESENTATION` | `UT-B5-UI-020`, `UT-B2-PROTOUI-004` | sealed-lab clocked-out mouse/keyboard/short-viewport journey plus installed Chrome/Edge clean profiles | `PASS` |
| `WORK-001` | Job tabs are sibling surfaces above the Companion frame, remain reachable by horizontal scroll and keyboard, and reorder presentation only. | `WORKSPACE_SETTINGS`, `PRESENTATION` | `UT-B3-WORKSPACE-007/008`, `UT-B3-UI-014/016/020`, sealed-lab overflow/scroll/keyboard-reveal/exact-reorder assertions | sealed-lab tab geometry/overflow/keyboard reveal plus installed reorder, short-viewport, and no-Timer-mutation journey | `PASS` |
| `DATA-001` | Drag-to-page Archive uses only closure-owned Context identity, shows a full-page eligible/blocked veil, refreshes protection at drop, and preserves History/Ledger; blur/Escape/external drags fail closed. | `AUTHORITY_FENCING`, `TIMER_LEDGER`, `WORKSPACE_SETTINGS` | `UT-B4-DATA-009/010/011`, `UT-B4-UI-005` through `017` | installed eligible Archive + Undo, current/protected, Escape-cancel, short-viewport, and Timer/Ledger invariant journey | `PASS` |
| `LAB-001` | The manual lab uses isolated temporary profiles and in-memory fictional SquareCoil routes; unexpected traffic and real SquareCoil access are blocked. | `AUTHORITY_FENCING`, `PACKAGE_ARTIFACT` | `npm run lab:smoke` + `npm run lab:smoke:edge` plus shared visual-contract assertions | headless Chrome/Edge sealed-lab smoke, deterministic retained visual capture, and installed Chrome/Edge exact-package acceptance | `PASS` |
| `FIGMA-001` | Figma handoff tokens, components, states, and screen list match the implemented shell/tab geometry and preserve the runtime Bing/no-generated-art boundary. | `PRESENTATION`, `DOCS_ONLY` | `UT-B5-FIGMA-001/002/003` | compare prepared frames with exact installed-browser captures | `MAPPED` |
| `BING-001` | Metadata is accepted only from exact HTTPS `www.bing.com/th`; one strictly validated public `OHR.*` ID is extracted and all provider parameters are discarded before Companion constructs its fixed canonical request. | `PRESENTATION`, `SUPPORT_PRIVACY` | `UT-B5-CINE-013/021/027/030/031/032/038` | installed Chrome/Edge request ledgers contain only the fixed metadata route and canonical image parameters after trusted permission | `PASS` |
| `BING-002` | Missing/denied permission, rejected response, network outage, fresh cache, retained older cache, gradient fallback, and accessibility override remain fail closed and are reported distinctly without leaking page or account data. | `PRESENTATION`, `SUPPORT_PRIVACY` | `UT-B5-CINE-015/017/018/026/028/029/033` through `041`, `UT-B5-UI-017/018/019` | installed permission-absent, trusted grant, live response, and retained-cache/network-failure journeys | `PASS` |
| `BING-003` | A decoded safe Bing image is painted through the authoritative cinematic custom property and remains visibly present behind readable Dark Glass and Light Glass surfaces despite generated `!important` theme rules. | `PRESENTATION` | `UT-B5-CINE-039/040`, `UT-B5-THEME-022`, theme-port freshness | installed Chrome/Edge live screenshots and rendered-layer evidence prove one decoded 3840x2160 photograph behind both Glass themes | `PASS` |
| `PRES-001` | Dark Glass and Light Glass each include their background and translucent surfaces as one user choice, painted above the browser root canvas and below SquareCoil controls. | `PRESENTATION` | `UT-B5-CINE-*`, `UT-B5-UI-009`, `UT-B5-THEME-022` | installed `B5B-CINE-*` fallback selection plus trusted-popup live Bing screenshots in Chrome and Edge | `PASS` |
| `PRES-002` | Original/accessibility/disable/teardown removes or suspends all owned presentation without affecting Timer/Bridge/native controls; print hides Companion-owned UI/background resources. | `PRESENTATION` | cleanup, accessibility, authority-isolation tests, and `UT-B5-THEME-025` | installed restoration/forced-color/print journeys | `PASS` |
| `PRES-003` | Companion popup/workspace contain no logo artwork. Every non-native site theme points only the SquareCoil website header at the repository-established same-origin PNG path, cannot obstruct the collapsed-sidebar restore control, and Original restores the page's prior logo attributes. | `PRESENTATION`, `PACKAGE_ARTIFACT` | `UT-B5-THEME-030/031`, popup/workspace static UI checks, `UT-B6-PKG-001` | sealed-lab Chrome/Edge visual and trusted reopen-click evidence plus installed package inventory | `MAPPED` |
| `PRES-005` | Companion uses quiet surface separation instead of heavy outlines while preserving visible keyboard focus and forced-colors boundaries. | `WORKSPACE_SETTINGS`, `PRESENTATION` | workspace/popup CSS regression assertions and Settings interaction tests | sealed-lab and installed Chrome/Edge screenshots across light and dark Companion appearance | `MAPPED` |
| `PRES-004` | Refined Light uses one coherent light palette with readable text, controls, panels, and native page content; its logo and navigation treatment do not depend on Glass/Bing presentation. | `PRESENTATION` | `UT-B5-THEME-032` | sealed-lab representative-route screenshots and Chrome/Edge smoke | `PASS` |
| `OBS-001` | Release-significant errors retain a stable privacy-safe phase/reason and user fallback; internal errors never overwrite primary friendly copy. Optional presentation state is reported separately from core readiness. | `LIFECYCLE`, `WORKSPACE_SETTINGS`, `SUPPORT_PRIVACY` | diagnostics whitelist plus workspace status/presentation-state tests | popup/workspace recovery and Advanced diagnostics journey | `OPEN` |
| `PKG-001` | Build, validator, ZIP, browser harness, CI, and evidence consume one canonical package inventory. | `PACKAGE_ARTIFACT` | `UT-B6-PKG-001` | extracted ZIP inventory equals validated package | `MAPPED` |
| `PKG-002` | The exact downloaded ZIP is unchanged before/after installed Chrome and Edge clean/upgrade acceptance. | `PACKAGE_ARTIFACT` | package validator and A4 before/after digest checks | full browser/profile matrix on identical bytes | `MAPPED` |
| `DOC-001` | Start Here, AGENTS, live gate matrix, version/build identity, and current evidence agree; historical evidence remains SHA-bound. | `DOCS_ONLY`, `PACKAGE_ARTIFACT` | `UT-B6-DOC-001` plus final exact-SHA evidence reconciliation | candidate evidence records the same source/artifact | `MAPPED` |

`FIGMA-001` remains `MAPPED` until a target Figma file exists for frame comparison. This batch used the sealed simulator only: no real SquareCoil login or clock action occurred. The optional Bing origin was granted solely through browser-owned permission cards opened by trusted toolbar-popup clicks in installed Chrome and Edge; both browsers visibly painted the decoded photograph behind Dark Glass and Light Glass. See `implementation/B6-UI-THEME-LAB-FIGMA-EVIDENCE.md`.

## Update Rule

For each active batch:

1. add any newly exposed critical requirement;
2. replace generic proof descriptions with exact stable test IDs;
3. mark `MAPPED` only after the owner and tests are identified;
4. mark `PASS` only after the exact candidate evidence exists;
5. never carry `PASS` forward automatically after affected source bytes change.
