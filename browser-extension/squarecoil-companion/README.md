# US Sign SquareCoil Companion

Current rebuild state: **v0.7.1 B6 release candidate** on `codex/squarecoil-b2c-migration`.

This is one Manifest V3 codebase for installed Google Chrome and Microsoft Edge. B6 is a tested candidate gate, not a production promotion, store publication, or claim that `release.json` has been advanced. SquareCoil remains authoritative for the real company clock; the Companion observes native state and keeps its own Timer/Ledger data.

## Candidate behavior

- one lifecycle runtime and one owned workspace root per eligible document;
- fenced worker authority with one current OWNER and read-only connected observers;
- read-only `action=7` observation plus native action 2/3/4 completion evidence through `chrome.webRequest`;
- final READY only after lifecycle, current authority tenure, migration, trusted core, and Bridge prerequisites settle;
- canonical Timer, Ledger, Today/Week/Context/History views, archives, backup/restore, and CSV tools;
- revisioned Settings, Timer Limits, Light/Dark/Auto, Solid/Glass, and bounded website themes;
- privacy-safe Support/Feedback and fail-closed unavailable Developer Support;
- Dark Glass and Light Glass each include the rotating Bing background and translucent treatment as one presentation choice; optional exact-origin Bing access is granted only from the toolbar popup, while the exact Design Dashboard profile remains independently off by default.

The rebuild does not issue SquareCoil native clock mutations. Duplicate, stale-generation, retired-runtime, and superseded evidence fails closed.

## Validate

From this directory:

```powershell
npm run check:b6-candidate
```

The installed-browser A4 gate requires an exact clean package and ZIP. It runs two isolated profiles in each installed browser:

- `PROFILE-CLEAN` proves a fresh package has no inherited runtime or authority state and preserves every accepted B1-B5-B gate.
- `PROFILE-UPGRADE-V07` proves valid v0.7 data migrates exactly once, the legacy source remains unchanged, no legacy live state is revived, preferences are adopted safely, and READY remains settlement-gated.

See `tests/b1-browser/README.md` for the command and evidence schema. Chrome runs first, followed by Edge, against the same package bytes.

## Package contract

The B6 candidate package contains exactly:

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

`dist/build-info.json` binds the package to the source commit, clean/dirty state, build ID, stage, version, and candidate fingerprint. The fingerprint is embedded into all four page/worker runtime bundles.

Rotating Bing images use optional exact-origin access. Choose a Glass theme, then use **Allow rotating images** in the toolbar popup and accept the browser-owned prompt. If access is declined or unavailable, the same Glass theme remains active with its bundled readable gradient; no remote request is made. **Native / Off** removes the permission, cached wallpaper, and every Companion-owned presentation layer.

## Install the tested candidate

Extract the exact tested ZIP. In `chrome://extensions` or `edge://extensions`, enable Developer mode, choose **Load unpacked**, and select the extracted directory containing `manifest.json`. Do not substitute a working-tree build for an accepted package.

For future automatic updates on Windows Chrome, use a Chrome Web Store installation and the dedicated release workflow described in [Chrome auto-update delivery](docs/AUTO-UPDATE-DELIVERY.md). The current unpacked candidate does not update itself from GitHub.

## Safety boundary

All automated installed-browser acceptance uses synthetic in-memory SquareCoil fixtures and blocks unexpected network access. B6 does not authorize live SquareCoil mutations, main-branch integration, store publication, rollout, or production release.

For project constraints and continuation order, read `AGENTS.md`, `logic/L8-ACCEPTANCE-HANDOFF.md`, and `implementation/NEXT-CHAT-HANDOFF.md` before editing.
