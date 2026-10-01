# SquareCoil Companion Lab

This is a sealed, manual test website for the real unpacked Companion extension.

## Safety boundary

- It creates a fresh temporary browser profile and copies only the exact extension package files into a temporary package directory.
- The address bar uses the audited SquareCoil origin so the production extension is exercised without a divergent development manifest.
- Every SquareCoil request is fulfilled in memory. Unexpected web traffic is blocked before DNS.
- No normal Chrome profile, login, cookie, customer record, or real SquareCoil clock action is available to the lab.
- Manual sessions allow only the fixed public Bing wallpaper routes under the required install host. Automated smoke sessions simulate an offline Bing response and block all other nonfixture requests before DNS.
- Closing the lab browser removes only the verified temporary profile and package directories it created.

## Start

From this extension directory:

```text
npm run lab:chrome
```

or:

```text
npm run lab:edge
```

## Suggested manual journey

1. Clock into fictional job `910001`.
2. Wait a few seconds, then switch to `910002`.
3. Open Companion and inspect the job tabs, Today totals, Recent Jobs, Time Overview, and History.
4. Leave the current job, then clock into `910003` to preserve the no-context gap.
5. Fully clock out and confirm the final session appears once.
6. Try appearance and website themes. Selecting Dark Glass or Light Glass enables its background directly using the required install host. There is no runtime Allow/Deny prompt or separate in-app setup toggle.

The guided tour performs those fake actions automatically, with short pauses, only after the button is clicked.

## Maintainer smoke check

```text
npm run lab:smoke
npm run lab:smoke:edge
```

These use fresh headless installed Chrome and Edge profiles, record eight fictional clock actions across three numbered jobs and Production General through the real observation pipeline, exercise the real local Resume choice on two known-Context revisits, verify one Companion root and the exact six finalized logical History sessions, then remove their temporary profile and package copy. They are development checks, not release acceptance.

The smoke check also verifies that four browser-like Context tabs sit above and before the Companion shell in a fixed `1280 × 720` viewport, overflow horizontally, respond to horizontal wheel/trackpad input, reveal keyboard-selected tabs, and reorder through a real drag without changing Context membership or selection. It drags an inactive fictional job onto the lab page, verifies the full-page archive veil and its message do not overlap the Companion shell, then cancels before release and confirms the job remains open. The same cancellation and prompt checks run at a narrow viewport, where the veil must rise above the Companion. Finally, trusted Settings clicks exercise matched Dark + Glass and Light + Glass Companion/website themes under a sealed Bing network outage, verify the singular fallback background host and truthful status text, reject opposite-theme surfaces and washed-out strong or muted text, and restore Light + Solid with Native / Off.

## Visual evidence

To keep deterministic screenshots in a directory you choose outside temporary storage and outside this Git repository:

```text
npm run lab:evidence -- --evidence-dir "C:\path\to\empty-evidence-folder"
npm run lab:evidence:edge -- --evidence-dir "C:\path\to\separate-empty-edge-evidence-folder"
```

Each command creates the existing workspace, theme, and dashboard captures plus `16-design-page-quiet-glass.png` and `visual-evidence.json`. The new Design-page check navigates with Dark Glass active and verifies borderless project surfaces, no nested backdrop blur, and a static background layer in computed browser styles. Use separate empty directories because the deterministic filenames intentionally refuse overwrite. The manifest binds browser version, package candidate fingerprint, source SHA/dirty state, screenshot digests, and the explicit non-acceptance lab scope. The screenshots contain only fictional lab data and built-in gradients—not generated wallpaper art; no real SquareCoil page or account is opened.

## Prototype integration checks

The flow under test is: a fresh sealed fixture records fictional sessions → selecting a historical tab preserves the operational job → Companion Settings enables the separate analytics dashboard → graph, appearance, reload, navigation and disable remain scoped and reversible.

The dashboard fixture includes the audited native shortcut row and native page-content controls on both the supported `show=2` and unsupported `show=1` query. This prevents a missing native mount anchor from hiding a route-gating defect. The smoke asserts native markup, links and disabled states are unchanged; one shadow root survives reload without duplication, disappears on a same-document route change, and returns only on the supported route. Dashboard Light/Dark/Website controls are independent of Companion appearance. Chart period/line/History controls and keyboard tooltips are exercised with canonical recorded sample sessions.

The acceptance comparison excludes the independent read-only heartbeat timestamp, but preserves stable active session identity/start/context, pending/local-pause state and every finalized Ledger segment. Network and console ledgers, page identity, nonblank rendering, framework-overlay absence, responsive bounds, and screenshots are retained with the manifest. `11-dashboard-sidebar-row.png` and `12-dashboard-narrow-row.png` additionally capture an actual canonical job row and its action at both widths; pointer reach and action bounds are checked without invoking a lifecycle change. The Browser plugin is not available in this environment, so this repository Playwright harness drives installed branded Chromium in disposable profiles.

### Frozen candidate and offline background checks

```text
node dev/local-lab/run.js --browser chrome --smoke --use-existing-build --evidence-dir <outside-repository-directory>
```

`--use-existing-build` avoids rebuilding frozen candidate bytes and rejects a stale source fingerprint. Omit it to rebuild normally. All appearance and skin selections are real browser clicks; the required Bing host is already present after the extension loads. The smoke wraps the real permissions API only to count requests and requires **zero runtime permission requests** after every skin choice and Native restoration. It does not fabricate a grant/deny decision. Exact Bing requests receive a sealed network outage, so Glass screenshots truthfully show the built-in gradient rather than a photograph.
