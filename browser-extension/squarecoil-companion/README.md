# US Sign SquareCoil Companion

Current stable package: **v0.7.1 Chrome Interaction Recovery**. See [CURRENT.md](CURRENT.md) for the recovery details.

The Companion is one Manifest V3 codebase packaged and validated for both Microsoft Edge and Google Chrome. It augments the internal US Sign & Mill SquareCoil site with the Job Timer workspace and optional website themes while keeping SquareCoil authoritative for the real company clock.

## What the current extension contains

- Job Timer Light, Dark, and Auto appearance modes.
- Job Timer **Solid** or **Glass / Blur** panel finish. Solid remains the default so an update does not silently change the user's existing visual density.
- Job Workspace Pause/Resume controls. Pause affects the Companion timer only and never clocks the employee out of SquareCoil.
- Direct job links, recent-job delete/archive controls, Archive All, Clear Recent, CSV export/import restore, and full timer-history wipe.
- Website themes: Original, Refined Light, and Sleek Dark.
- Sleek Dark audit overlay that removes inherited bright/white borders and native focus halos from common SquareCoil/AdminDesign components while preserving semantic status colors.
- Sleek Dark custom US Sign logo, sourced from the same known logo used by the existing Tampermonkey UI Runtime Fixes and cached by the extension service worker.
- Original and Refined Light keep the native SquareCoil logo. A separate light-theme custom logo has not been supplied yet.
- Stable release metadata and GitHub Actions validation for both browser packages.

## Install for testing

### Microsoft Edge

1. Extract `SquareCoil-Companion-v0.7.1-EDGE.zip`.
2. Open `edge://extensions`.
3. Enable Developer mode.
4. Choose **Load unpacked**.
5. Select the extracted folder containing `manifest.json`.

### Google Chrome

1. Extract `SquareCoil-Companion-v0.7.1-CHROME.zip`.
2. Open `chrome://extensions`.
3. Enable Developer mode.
4. Choose **Load unpacked**.
5. Select the extracted folder containing `manifest.json`.

The Edge and Chrome packages intentionally contain the same extension source. Separate artifacts make installation and release tracking explicit without maintaining divergent code.

## Architecture

- `manifest.json`: MV3 package contract.
- `background.js`: timer bootstrapping, release metadata/update checks, cached dark-logo fetch.
- `content/theme-controller.js`: persisted timer appearance, timer finish, website theme, and dark-logo application/restoration.
- `page/timer-runtime.js`: stable SquareCoil clock observation and timer state engine.
- `page/timer-controls.js`: settings/navigation control layer.
- `page/timer-workspace.js`: v0.6 Job Workspace behavior for pause/resume, links, archives, CSV, restore, and destructive history controls.
- `page/timer-surface.js`: v0.7 additive Solid/Glass UI layer and package-version display patch.
- `styles/site-theme.css`: v0.6 audited Refined Light / Sleek Dark base website paint.
- `styles/site-theme-v070.css`: v0.7 dark-outline/focus/logo audit overlay.
- `popup/`: extension popup controls for appearance, finish, and release status.
- `release.json`: current stable release metadata.
- `HANDOFF.md`: implementation context and continuation contract for a new chat or maintainer.

## Critical behavior boundary

SquareCoil remains authoritative for clock-in, project/department switching, and clock-out. The Companion observes the current SquareCoil context. Manual Companion Pause/Resume changes only the local timer state. Resume is allowed only when SquareCoil still reports the same job.

## Update model

Developer-mode installs must be reloaded after replacing files. Future Edge Add-ons and Chrome Web Store publication can use the same MV3 source, but store URLs are intentionally `null` until actual listings exist. `release.json` is informational metadata and remote JavaScript is never executed.

## Legacy prototype scripts

The files in `tampermonkey/` are historical prototypes, not a supported parallel runtime. Disable old timer userscripts when testing the extension so their listeners and UI cannot conflict. Rebuild selected prototype features as Manifest V3 extension code after recording their behavior; see [the repository audit](../../docs/REPOSITORY-AUDIT.md).

For full project continuity, read **HANDOFF.md before changing behavior**.
