# B1-B6 installed-browser acceptance harness

This harness loads one exact unpacked package into installed, branded Google Chrome and Microsoft Edge. For each browser it runs a fresh `PROFILE-CLEAN` and a separate `PROFILE-UPGRADE-V07` against the same immutable package and ZIP. It retains every accepted B1 through B6 gate and adds the current presentation/UI integration. It serves only synthetic fixture HTML in memory. No request reaches SquareCoil or customer data.

## Required package

The `--package` directory must contain exactly the eleven allowlisted candidate files:

- `manifest.json`
- `dist/background.js`
- `dist/build-info.json`
- `dist/companion-app.js`
- `dist/presentation-bootstrap.js`
- `dist/content-controller.js`
- `dist/popup.js`
- `dist/themes/dark-glass.css`
- `dist/themes/light-glass.css`
- `popup/popup.html`
- `popup/popup.css`

`--archive` must name the ZIP from which the directory was extracted. The harness reads each ZIP entry and requires its eleven file hashes and byte counts to match the extracted inventory exactly. It records the ZIP filename, SHA-256, optional single root prefix, and shared inventory digest, then verifies both the ZIP and directory are unchanged after both browsers. Stored and deflated ZIP entries are supported; encrypted, multi-disk, and ZIP64 archives fail closed.

`dist/build-info.json` must contain:

- `buildId: "rebuild-b6-release-candidate"`;
- `stage: "B6"`;
- a lowercase 64-character `candidateFingerprint` embedded exactly in `dist/background.js`, `dist/companion-app.js`, `dist/presentation-bootstrap.js`, and `dist/content-controller.js`;
- a lowercase 40-character `sourceSha` exactly matching `--expected-source-sha`;
- boolean `sourceDirty`, which must be `false` for acceptance.

## Run

From `browser-extension/squarecoil-companion`:

```powershell
$env:NODE_PATH = "$env:USERPROFILE\.cache\codex-runtimes\codex-primary-runtime\dependencies\node\node_modules"
node tests/b1-browser/run.js `
  --package C:\absolute\path\to\exact-package `
  --archive C:\absolute\path\to\exact-package.zip `
  --expected-source-sha 0123456789abcdef0123456789abcdef01234567 `
  --browser all `
  --evidence C:\absolute\path\to\a4-evidence.json
```

The harness also locates the bundled Codex Playwright runtime automatically when it is installed in its standard location. Use `SC_PLAYWRIGHT_MODULE` to point to another Playwright module without changing repository files.

Use `--headed` only when visible browser windows are useful. Browser executables default to the standard Windows Chrome and Edge locations and can be overridden with `--chrome-executable` and `--edge-executable`.

The default headless run leaves optional permission absent and requires the integrated Glass fallback to remain readable without a Bing request; it does not open a browser prompt that headless automation cannot answer. Prove the explicit granted path separately with `--interactive-permission-only --browser all`. That supplemental gate opens one short isolated window per selected installed browser, opens the real toolbar action popup, clicks **Allow access**, and waits for a human to choose **Allow** in the browser-owned prompt. It never pre-grants or fabricates the decision. The provider then contacts only the fixed Bing metadata route and the internally constructed canonical `/th?id=<validated OHR ID>&w=3840&h=2160&rs=1&c=4` route. The gate requires a real decoded photograph with varied pixels to be the computed active layer behind both Dark Glass and Light Glass, captures both pages, then simulates a network outage and proves the older safe cache remains visible with accurate UI status. It cannot reach the real SquareCoil site. The normal clean/upgrade Chrome and Edge matrix remains headless and must pass independently.

The supplemental live-Bing command is:

```powershell
node tests/b1-browser/run.js `
  --package C:\absolute\path\to\exact-package `
  --archive C:\absolute\path\to\exact-package.zip `
  --expected-source-sha 0123456789abcdef0123456789abcdef01234567 `
  --browser all `
  --interactive-permission-only `
  --evidence C:\absolute\path\to\live-bing-evidence.json
```

Choose **Allow** once in each browser-owned prompt. The test rejects inherited permission, a direct extension-page grant, noncanonical Bing parameters, credential/referrer headers, synthetic one-pixel assets, hidden image layers, or status-only success.

The default `--profile all` is mandatory for acceptance. `--profile clean` and `--profile upgrade` are diagnostic subsets and are always labeled `NON_ACCEPTANCE`, even with clean package bytes.

`--allow-dirty-development` permits a temporary dirty build for harness development. Such a run is always labeled `NON_ACCEPTANCE`; it cannot produce an acceptance pass.

## Exit and evidence rules

- Exit `0`, status `PASS`: both exact branded browsers passed and the package was clean and unchanged.
- Exit `0`, status `NON_ACCEPTANCE`: checks passed against explicitly allowed dirty development bytes.
- Exit `1`, status `FAIL`: a browser assertion, package check, or byte-integrity check failed.
- Exit `2`, status `UNSUPPORTED`: a required browser/control capability could not be exercised. This is not a pass.

The JSON evidence records browser/CDP identity, profile class, executable hash, extension ID/path/version, exact build/package/candidate identity, candidate embedding counts for all four page/worker runtime bundles, commanded and packaged source SHA, ZIP filename/hash, exact ZIP/extracted inventory binding, synthetic-network ledger, test results, lifecycle/root snapshots, and isolated-world authority snapshots. Evidence output must be outside the tested package and cannot overwrite the ZIP. A browser launch or extension load never counts as a gate pass by itself.

Every message the harness sends directly from the content-script execution world carries the exact packaged `buildId`, `packageVersion`, and `candidateFingerprint` plus the live document token. Popup messages originate from an extension page and remain extension-origin messages; the harness does not mislabel them as content-origin traffic.

## Covered gates

- disabled boot performs observation only;
- concurrent/repeated boot produces one injection, runtime, and root; root inventory is the deduplicated union of the canonical timer selector and every rebuild-owned marker, so a noncanonical rebuild node cannot be hidden;
- the isolated MAIN shell retains `DEGRADED / coordination-not-implemented-b1`; only the worker-owned, generation-bound settlement response may promote effective health to `READY`;
- the isolated content world refreshes authority against the current worker generation and exposes only narrowed settlement evidence independently of MAIN-world lifecycle health;
- exact refresh and post-probe confirmation acknowledgments each bind a unique request, worker generation, Runtime ID, and Document Token;
- OWNER and OBSERVER effective health both reach `READY` only after migration, trusted-core, Bridge-role, listener, and observation prerequisites agree;
- the packaged popup reports final B2 `READY` and retains fail-closed guidance for incomplete or blocked prerequisites;
- two live tabs connect to one worker authority as exactly one `OWNER` and one `OBSERVER_CONNECTED`, observe the same authoritative revision, and require an explicit successful observer-disconnect acknowledgement before the observer tab closes;
- clearly owned noncanonical rebuild-marker orphan recovery and ambiguous noncanonical rebuild-marker retention;
- dead interaction and removed root recover without reinjection;
- iframe and unsupported documents allocate nothing;
- legacy runtime exclusion;
- malformed and unreadable runtime-global exclusion;
- build, package-version, and candidate-fingerprint mismatch reload boundaries;
- an immediate health request after service-worker restart refreshes authority against the new worker before reporting `READY`, reuses the live page runtime, preserves `OWNER`, revision, and coordination epoch, and leaves the persisted authoritative document canonically equivalent by SHA-256;
- real BFCache restoration produces `pageshow.persisted === true` and reuses the runtime;
- clean disable/re-enable creates a fresh Runtime ID;
- the exact read-only `action=7` transport starts one authoritative Timer while the isolated MAIN shell remains intentionally degraded and effective health settles `READY`;
- OWNER and OBSERVER tabs share one redacted read model, with only OWNER performing Bridge verification;
- a synthetic Job A to Job B change closes one ledger segment and commits one authoritative revision;
- disable finalizes non-idle Timer state exactly once and issues no native SquareCoil mutation;
- detected malformed legacy storage blocks Bridge, Timer writes, and final READY without exposing stored values;
- a delayed stale content response cannot overwrite newer disabled state;
- a safely injected cleanup failure remains sticky until explicit cleanup-only retry succeeds.
- compact B3 tabs expose Today, threshold meaning, and operational status from one trusted revision;
- Overview and finalized History navigation do not mutate Timer/Ledger state;
- real A -> B focus reaches OWNER and OBSERVER, while a same-Context heartbeat preserves manual selection/collapse;
- B3 hidden/show and drag-order preferences synchronize across tabs without native or Timer mutations.
- B4 Full Backup JSON, History CSV, and reporting-only Time Report CSV come from one trusted revision and exports contain no live authority state;
- malformed restore inputs and active-state Replace fail closed without mutation;
- Archive and Restore preserve Context totals while passing through the fenced authoritative writer;
- an exact backup merge dedupes existing history and cannot double-count ledger time.
- Settings Home remains available with zero history and exposes Appearance, Time tracking, Jobs and watching, Notifications, Dashboard, Privacy and permissions, and Advanced diagnostics;
- Native/Off, Dark Glass, Light Glass, and Refined Light are mutually exclusive, report their real effective presentation, and own at most one removable style layer;
- Light Glass and Refined Light apply bounded same-origin CKEditor document treatment; Dark Glass retains the accepted vendor, overlay, calendar, and responsive adapters;
- one revisioned Preferences service synchronizes owner/observer tabs and rejects a stale Timer Limits form before allowing one coherent replacement batch;
- Support diagnostics are opt-in and frozen, expose only coarse allowlisted state, and delivery remains an explicit user action;
- dirty Settings drafts require confirmation, missing Developer Support configuration stays unavailable, and no settings action mutates Timer/Ledger or native SquareCoil state.
- Bing cinematic presentation is active only with Dark Glass or Light Glass and makes no Bing request without exact optional host permission granted from the toolbar popup;
- provider metadata may contribute only one strictly validated public `OHR.*_UHD.jpg` identity; every other provider query parameter is discarded and the image route is constructed internally;
- each Glass theme owns one bounded background host/style, settles safely to cache/gradient fallback/remote presentation, and Restore Native removes its resources;
- a real Bing photograph must be the computed, visible, viewport-covering layer behind both installed Glass themes; an older safe cached image remains visible after network failure and UI/diagnostics report source, failure, and gradient fallback separately;
- the Design Dashboard profile applies only to exact `/dashboard.php?show=2`, preserves native KPI text, row order/targets, selects, disabled controls, and warnings, adds one non-interactive read-only Companion summary, and does not leak to another dashboard mode;
- optional presentation changes no Timer/Ledger/native-clock authority and attempts no native SquareCoil mutation.
- a fresh clean profile contains no inherited authority document or runtime before the B6 candidate begins its inherited gates;
- a separate valid v0.7 upgrade profile migrates two dated sessions plus the undated accumulated remainder exactly once, retains the legacy source byte-for-byte, imports compatible preferences with optional presentation still off, never revives legacy live state, and reaches READY only after the full settled B2 gate;
- revalidation preserves the completed migration identity and cannot duplicate or rewrite imported Ledger evidence.

Each browser result carries the canonical stable IDs it proves: `B1-LC-001` through `B1-LC-010` and `B1-LC-012` through `B1-LC-018`. `B1-LC-011` is intentionally an A2/A3-only persistence-concurrency fixture. The B2.1 cases carry `B2-KERNEL-001` (multi-tab OWNER/OBSERVER) and `B2-KERNEL-002` (worker-restart reconnection). The B2.2 cases carry `B2-TRANSITION-001` through `B2-TRANSITION-005` for action 7 start, owner/observer synchronization, atomic job switch, exactly-once disable, and legacy fail-closed behavior. Final settlement cases carry `B2-READY-001` through `B2-READY-003` for OWNER plus popup READY, non-writing OBSERVER READY, and migration-blocked degradation.

The B3 cases carry `B3-WORKSPACE-001` through `B3-WORKSPACE-004`. The B4 cases carry `B4-DATA-001` through `B4-DATA-004`. The B5-A cases carry `B5-SETTINGS-001` through `B5-SETTINGS-005`. B5-B carries `B5B-CINE-001`, `B5B-CINE-002`, `B5B-DASH-001`, `B5B-DASH-002`, and `B5B-SAFETY-001`. B5-C carries `B5C-THEME-001` through `B5C-THEME-004`. B5-D carries `B5D-UI-001`, `B5D-VENDOR-001`, `B5D-OVERLAY-001`, `B5D-EDITOR-001`, and `B5D-LAYOUT-001`; these prove zero-history navigation, route-bounded vendor/overlay theming, same-origin editor-document theming, responsive/print behavior, forced-color fallback, and exact restoration. B6 carries `B6-CANDIDATE-001`, `B6-PROFILE-001`, and `B6-PROFILE-002`; all three must be observed per browser across the clean and upgrade suites. Passing the harness proves the installed-browser A4 portion of B5-D and B6 while preserving every earlier gate. READY-C04 verification-fallback behavior remains covered by mandatory unit/integration fixtures because the installed candidate has `chrome.webRequest`; A4 does not alter the candidate to manufacture an unavailable hook. Final B5-D acceptance requires this A4 pass together with the repository's unit, integration, prototype-compatibility, package, and CI gates.
