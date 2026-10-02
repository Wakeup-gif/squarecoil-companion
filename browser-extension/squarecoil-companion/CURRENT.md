# SquareCoil Companion Current State

## Current blocker and Cloud Codex continuation

The user tested v0.7.2 and reported FAILED legacy migration before Bridge startup. Their clock is still not tracked. The review branch includes a source-only privacy-safe diagnostic correction, while an authentic stale manual-pause migration incompatibility is reproduced and awaiting implementation. Continue from [Cloud Codex migration handoff](implementation/CLOUD-CODEX-MIGRATION-HANDOFF-2026-10-02.md). Do not treat the prior automated parser/logo checks as proof that the user's migration or tracking works.

## October 2, 2026 repair candidate

The current source includes a **v0.7.2 test build** for initial native clock detection and the approved custom US Sign & Mill dark logo. It recognizes safe action-7 header fragments and general departments, exposes failed initial reads, and packages the original transparent dark artwork. See [repair evidence](implementation/CLOCK-LOGO-REPAIR-2026-10-02.md) for automated validation and remaining installed-browser acceptance. This does not promote a stable release or certify earlier candidate evidence for these bytes.

The legacy release notes below describe the earlier implementation. Current rebuilt source lives in `src/`; current authority and acceptance rules are in `AGENTS.md`, `docs/EXECUTION-ENFORCEMENT-PLAN.md`, and `logic/`.

Current stable release: **v0.7.1 Chrome Interaction Recovery**

Primary source: `browser-extension/squarecoil-companion/`

Read these files before making changes:

1. `HANDOFF.md` for the full architecture, behavior invariants, storage keys, timer clock contract, CSV/archive behavior, Glass performance rule, website-theme model, dark-logo rule, and release workflow.
2. `CHROME-INTERACTION-DIAGNOSIS.md` for the v0.7.0 visible-but-dead timer failure and its recovery invariant.

## v0.7.1 correction

A visible `#ussign-job-timer` DOM root is not proof that the MAIN-world timer runtime is alive. `background.js` now treats `window.__squareCoilJobTimerUiVersion` as authoritative. If a dead root exists without that runtime global, the extension tears down presentation layers, removes the stale root/runtime style, injects `page/timer-runtime.js`, then probes again before injecting controls/workspace/surface layers.

The Glass presentation layer is also back to the stability contract: no whole-timer subtree MutationObserver. It observes direct root replacement only and uses explicit click/theme hooks for settings patch timing.

## Release refs

- `release/squarecoil-companion`
- `release/squarecoil-companion-edge`
- `release/squarecoil-companion-chrome`

All three should point to the same package-only extension tree for the current stable release.

## Current first-install defaults

- Timer appearance: Light
- Timer finish: Solid
- Website theme: Original
- Timer enabled: true

## Logo rule

The cached custom US Sign logo is applied only in Sleek Dark. Original and Refined Light restore/retain the native SquareCoil logo until a separate light-theme asset is explicitly supplied.
