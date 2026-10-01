# Chrome auto-update delivery

SquareCoil Companion's supported Windows Chrome update path is:

```text
approved change -> release/squarecoil-companion version bump -> exact candidate gate
-> validated extension ZIP -> existing Chrome Web Store item -> store review
-> Chrome updates store-installed copies
```

The release workflow is `.github/workflows/squarecoil-extension-publish-chrome.yml`. It is prepared in the integration branch; it does **not** publish anything from this branch. The current `release.json` still describes a development-mode v0.7.1 package, and no Web Store item is configured in this repository. Promotion to the release branch and any store submission remain separate release decisions.

## Why this route

Chrome treats **Load unpacked** as a development installation. An unpacked folder, a GitHub ZIP, a GitHub Release, or a GitHub-hosted `update_url` cannot make that installation silently update itself on ordinary Windows Chrome. Store-installed extensions receive browser-managed updates after a new approved version is published. Chrome checks periodically and applies an update when the extension is idle. This also means that Git push, Web Store submission, review approval, and arrival in a user's browser are distinct events.

The browser extension does not fetch and execute code from GitHub. No new extension host permission or in-extension updater code is needed for the store path. The older root `background.js` and `popup/popup.js` updater prototype is not part of the current `dist/` package.

## One-time store setup

1. Create a Chrome Web Store developer account, enable two-step verification, and create the initial SquareCoil Companion item in the Developer Dashboard. Complete the store listing and privacy disclosures. Choose the intended visibility there. The first item/listing must be established before the workflow can update it.
2. Enable the Chrome Web Store API v2 in a Google Cloud project and create OAuth credentials plus a refresh token with the `chromewebstore` scope, following [Google's API setup guide](https://developer.chrome.com/docs/webstore/using-api).
3. In the GitHub repository, set Actions **variables** `CWS_EXTENSION_ID` and `CWS_PUBLISHER_ID`. Set Actions **secrets** `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, and `CWS_REFRESH_TOKEN`. Never commit these credentials or put them in the extension package. Protect the `release/squarecoil-companion` branch so only reviewed changes can trigger publication.
4. Install the store item in Chrome. The existing development-mode copy does not become store-managed merely because the same source code is published; remove or disable that copy only after confirming the store copy works and any needed Companion backup/restore is complete.

For each later release, advance `manifest.json`, `package.json`, and `release.json` to the same strictly newer version; update both artifact names in `release.json`. Push the reviewed commit to `release/squarecoil-companion`. The workflow rejects an unchanged or inconsistent version, runs `check:b6-candidate`, creates a ZIP from the canonical 11-file allowlist, validates the ZIP and embedded source SHA, checks that the branch tip is still current, and then uses the pinned [wdzeng/chrome-extension](https://github.com/wdzeng/chrome-extension) API v2 action to upload and submit the existing store item. Store review still applies. A successful workflow submission is not proof that the item has been approved or installed in Chrome.

The separate [cssnr/webstore-publish-action](https://github.com/cssnr/webstore-publish-action) is another API v2 implementation reviewed during this design. This repository uses one pinned action and keeps its own package/version checks upstream of that action.

Microsoft Edge has its own add-on update channel and is **not** updated by this Chrome workflow. The shared ZIP remains available for Edge candidate testing; Edge store delivery would be a separate release integration.

## Verification boundary

Run `node --test tests/b6-store-release.test.js` to check numeric version ordering and metadata agreement. The workflow's package step validates the extracted ZIP against the exact Git commit. A live publish/update can only be verified after the Web Store item and credentials exist, the update passes review, and a store-installed browser receives it.

Sources: [Chrome distribution rules](https://developer.chrome.com/docs/extensions/how-to/distribute), [Chrome update lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle), [Chrome Web Store API guide](https://developer.chrome.com/docs/webstore/using-api).
