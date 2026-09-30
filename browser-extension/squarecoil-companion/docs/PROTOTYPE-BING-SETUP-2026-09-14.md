# Built-in Bing backgrounds — September 14, 2026

This is the current `PI-BING-001` contract for the isolated `codex/squarecoil-prototype-integration` worktree. The user's explicit September 14 change makes Bing a required installation/update capability and supersedes the earlier optional-origin, runtime-dialog, and grant-revocation plan.

## Installed capability and skin behavior

The manifest declares exactly `https://ussignandmill.squarecoil.net/*` and `https://www.bing.com/*` in `host_permissions`. It has no `optional_host_permissions`. Content scripts and web-accessible presentation resources remain limited to the SquareCoil tenant; the added Bing capability does not inject Companion into Bing.

Selecting Dark Glass or Light Glass starts the existing wallpaper provider as part of the skin. There is no second in-app consent control, runtime permission request, gesture handoff, or permission promise holding the UI busy. The superseded `bing-permission.js` helper and its request/denial tests were removed. Worker routing no longer accepts the old request/remove permission message types. The popup describes the included backgrounds and reports browser restrictions without offering another grant action.

Native / Off and Refined Light remove owned cinematic presentation, stop refresh timers, and invoke `clearCinematicBackground()`. Its authenticated `SC_COMPANION_B5B_CLEAR_WALLPAPER` message calls provider `clearWallpaper()`: active requests are aborted, the generation advances, and the wallpaper cache is cleared. Required host access remains installed. Concurrent clear calls share one operation. Late permission checks, metadata replies, and image replies cannot advance a canceled retrieval or repopulate its cleared cache.

## Network and browser restrictions

The provider still checks actual browser access before network retrieval, so user/browser policy restrictions fail closed. Restricted access is reported as `bing-origin-access-restricted` / `BING_ACCESS_RESTRICTED`. This is a browser restriction outcome, not an optional setup gate. Safe fresh/retained cache and the built-in CSS gradient remain available under the existing fallback rules.

Only fixed public Bing metadata parameters and a validated public OHR image identifier are used. The provider constructs the canonical image request itself, omits credentials/referrers, rejects redirects and unexpected origins, bounds metadata/image bytes and cache age, and accepts only the existing safe raster types and decoded dimensions. No SquareCoil page, job, time, identity, account, or user input enters the requests. No native SquareCoil action or Timer/Ledger authority is added.

## Installation and update implications

Chrome distinguishes declared host access from optional runtime access; host permissions support worker fetches, and changing their match patterns can produce browser permission warnings. This build moves the same exact Bing origin into the installation capability. [Chrome permission declarations](https://developer.chrome.com/docs/extensions/develop/concepts/declare-permissions).

Chrome may disable an updated extension when a new permission warning requires acceptance, then re-enable it after the user accepts. Therefore this change removes the in-app runtime prompt, not the browser's installation/update consent or ability to restrict access. An unpacked diagnostic profile cannot establish the behavior of a signed production update. [Chrome permission warning and update guidance](https://developer.chrome.com/docs/extensions/develop/concepts/permission-warnings).

## Validation checkpoint

The affected cluster passed **91/91** tests:

```text
node --test tests/b1/manifest-policy.test.js tests/b1/background-entry.test.js tests/b1/popup.test.js tests/b5/wallpaper-provider.test.js tests/b5/cinematic-background.test.js
```

The new manifest migration tests reject the old optional-Bing package shape, wildcard/extra required origins, optional-origin reintroduction, and Bing content/resource injection. They scan runtime source for permission request/removal paths. Package validation uses the same tested manifest policy and rejects packaged runtime calls that request or remove permissions.

Cleanup tests verify cache deletion without host revocation, concurrent clear sharing, cancellation after a pending access check, cancellation after delivered metadata, and prevention of stale cache writes. Existing source-policy, fixed-URL, byte/redirect/origin, cache, offline, reduced-motion, accessibility, and presentation tests remain green. `git diff --check` passed.

Aggregate, exact-package integrity, installed Chrome/Edge skin behavior, browser-restricted fallback, and old-profile migration results belong in the main integration evidence after those gates run. No production extension/profile was changed by this slice.

## Superseded diagnostic evidence

Earlier September 14 optional-origin experiments and native Allow/Deny gates do not describe this implementation and are no longer release blockers. Their external diagnostic files are retained as historical evidence only. All further runtime permission-dialog testing was stopped when the user changed the contract. Required installation/update acceptance and browser restrictions remain browser-owned.
