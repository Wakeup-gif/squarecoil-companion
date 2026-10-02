# B5-A Settings / Support / Themes Evidence

Status: **accepted**
Branch: `codex/squarecoil-b2c-migration`
Owning contracts: L7, L8, and `logic/B5-SETTINGS-PRESENTATION-READINESS-AUDIT.md`

## Requirements-to-source/tests matrix

| Requirement | Primary source | Stable automated evidence | Installed-browser evidence |
|---|---|---|---|
| One fenced, revisioned Preferences service with safe defaults and v0.7 migration | `src/preferences/preferences*.js`, authority dispatcher/store | `UT-B5-PREF-001` through `009`, `IT-B5-PREF-001` through `003` | `B5-SETTINGS-001/002` |
| Cross-tab commits converge; stale multi-field drafts fail closed | trusted core, Preferences service, Settings UI | `UT-B5-PREF-003/004`, `UT-B5-UI-004`, `IT-B5-PREF-001/002` | `B5-SETTINGS-002/003` |
| Timer limits use exact canonical Today values and never own timing | `src/timer/read-model.js`, Settings UI | `UT-B5-PREF-005/008`, `UT-B5-UI-003` | `B5-SETTINGS-003/005` |
| Settings routes, Back/Close/focus, dirty drafts, and recovery are bounded | `src/ui/workspace-ui.js` | `UT-B5-UI-001` through `008` | `B5-SETTINGS-001/003/005` |
| Light/Dark/Auto and Solid/Glass retain preference/effective-state separation | `src/presentation/theme-service.js`, Settings UI | `UT-B5-THEME-002` through `004`, `007/009` | `B5-SETTINGS-001/002` |
| Original/Refined Light/Sleek Dark own one removable layer and preserve native/logo fallback | `src/presentation/theme-service.js` | `UT-B5-THEME-001`, `004` through `006`, `008` | `B5-SETTINGS-002/004` |
| Support/Feedback is validated, privacy-whitelisted, frozen, and explicitly user-delivered | `src/support/support-service.js`, Settings UI | `UT-B5-SUPPORT-001` through `010`, `UT-B5-UI-005/006` | `B5-SETTINGS-004/005` |
| Developer Support fabricates no destination or payment authority | `src/ui/workspace-ui.js` | `UT-B5-UI-007` | `B5-SETTINGS-005` |
| Presentation failure remains feature-local; B1-B4 authority/READY/data gates stay fail closed | content controller, final B2 settlement, inherited source | `UT-B5-THEME-003` through `008`, all inherited fixtures | all inherited B1-B4 A4 cases |

## Automated gate

`npm test` passes 437 tests: 90 B1 unit, 168 B2 unit, 29 B3 unit, 28 B4 unit, 33 B5-A unit, 38 B1 integration, 42 B2 integration, 2 B3 integration, 4 B4 integration, and 3 B5-A integration.

`npm run test:proto-ui` separately passes all 13 inherited prototype-compatibility tests. Static validation passes with 222 B2, 31 B3, 32 B4, and 36 B5-A stable unit/integration fixture IDs plus five B5-A installed-browser A4 fixture IDs.

## Exact candidate result

- source commit: `117b81604c66d57a3cbf356d6d974bef4a887242`;
- build ID/stage: `rebuild-b5a-settings-presentation` / `B5-A`;
- `sourceDirty: false`;
- candidate fingerprint: `1ad0862eb156089c7f93cb27d8aadb82b00c657dc61b21a47d40332fe886bd71`;
- ZIP SHA-256 before/after: `981b985df9f5f67f44f22a8f69afadde9d62c153b1ec04181b9be72bf62a22f7`;
- extracted/ZIP inventory digest: `a330093116e5472c78c001a2d86a327cac379c58439dc82693728c85381c75a4`;
- exact package inventory: 8/8 allowlisted files;
- installed Chrome `151.0.7922.174`: PASS, 24/24 cases;
- installed Edge `151.0.4129.107`: PASS, 24/24 cases;
- every required B1-B5-A A4 fixture ID observed;
- package and ZIP unchanged across both browsers;
- unexpected network requests: none;
- console/page errors: none;
- native SquareCoil mutation attempts: none;
- source commit was pushed before exact candidate acceptance;
- GitHub Actions run `33158338455`: success.

## Acceptance hardening found during A4

Installed-browser worker-restart evidence exposed a small renderer/worker clock-order race. Final B2 settlement now accepts at most 1,000 ms of positive cross-process clock skew while still rejecting materially future evidence and preserving the exact lease-expiry gate (`UT-B2-READY-025`).

The A4 harness also foregrounds the page before trusted UI interaction so Edge background-tab animation-frame throttling cannot align with the one-second display refresh and repeatedly detach a control under test. No product behavior or trust requirement is bypassed.

## Proof boundary

The A4 harness uses synthetic in-memory SquareCoil fixture HTML and intercepted read-only action-7 responses. It proves packaged extension behavior and absence of native mutation attempts for those cases. It does not publish a release, mutate live SquareCoil business data, activate B5-B optional presentation, or authorize production promotion.
