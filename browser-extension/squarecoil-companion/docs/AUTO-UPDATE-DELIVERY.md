# Chrome auto-update delivery

SquareCoil Companion's supported Windows Chrome update path is:

```text
approved change -> release/squarecoil-companion version bump -> exact candidate gate
-> validated extension ZIP -> existing Chrome Web Store item -> store review
-> Chrome updates store-installed copies
```

The release workflow is `.github/workflows/squarecoil-extension-publish-chrome.yml`. It does **not** publish anything from an integration or QA branch. The current `release.json` still describes a development-mode v0.7.1 package, and no Web Store item ID or publisher credentials are configured in this repository. For this workflow, the Store item is the permanent listing and extension ID established by the owner's first ZIP upload in the Chrome Developer Dashboard; it is not an extra component to build into Companion. The first submission and later promotion to the release branch remain separate release decisions.

## Why this route

Chrome treats **Load unpacked** as a development installation. An unpacked folder, a GitHub ZIP, a GitHub Release, or a GitHub-hosted `update_url` cannot make that installation silently update itself on ordinary Windows Chrome. Store-installed extensions receive browser-managed updates after a new approved version is published. Chrome checks periodically and applies an update when the extension is idle. This also means that Git push, Web Store submission, review approval, and arrival in a user's browser are distinct events.

The browser extension does not fetch and execute code from GitHub. No new extension host permission or in-extension updater code is needed for the store path. The older root `background.js` and `popup/popup.js` updater prototype is not part of the current `dist/` package.

## One-time store setup

1. Finish the exact candidate gate, installed-browser checks, listing, privacy policy URL, screenshots, and real-site read-only visual acceptance. Use the **Chrome extension ZIP inside** the successful `SquareCoil Companion Rebuild Validate` workflow artifact for that same source commit; the downloaded GitHub artifact is an outer ZIP and must be unpacked first. Its package evidence records the source SHA and inner ZIP checksum. Do not repackage an older candidate after testing and call it the same release.
2. Create a Chrome Web Store developer account with two-step verification. In the [Developer Dashboard](https://chrome.google.com/webstore/devconsole), choose **Add new item** and upload the validated inner Chrome ZIP. This creates the item's permanent 32-character extension ID. Complete Store Listing, Privacy, Distribution, and reviewer Test Instructions where needed. Choose the intended visibility and make the **first** Submit for Review decision in the dashboard. Review and approval still apply to private and unlisted items. The owner may defer publication after approval in the dashboard.
3. After that item exists, record its canonical `https://chromewebstore.google.com/detail/.../<extension-id>` URL. Enable the Chrome Web Store API v2 in a Google Cloud project and create OAuth credentials plus a refresh token with the `chromewebstore` scope, following [Google's API setup guide](https://developer.chrome.com/docs/webstore/using-api). The token must be authorized by the Google developer account that owns the Store item.
4. Establish `release/squarecoil-companion` at the exact commit used for the first Store ZIP. Creating this baseline branch does not submit an update; the workflow only runs on later advancing pushes. In GitHub Actions, set **variables** `CWS_EXTENSION_ID` (the new item ID) and `CWS_PUBLISHER_ID` (from Publisher Settings). Set **secrets** `CWS_CLIENT_ID`, `CWS_CLIENT_SECRET`, and `CWS_REFRESH_TOKEN`. Never commit credentials or put them in the extension package. Protect the release branch so only reviewed changes can trigger publication. The workflow requires the configured item ID to match the Store URL in `release.json` before uploading.
5. Install the approved Store item in Chrome. The existing development-mode copy does not become store-managed merely because the same source code is published; remove or disable that copy only after confirming the Store copy works and any needed Companion backup/restore is complete.

For each later release, advance `manifest.json`, `package.json`, and `release.json` to the same strictly newer version. Keep `manifest.version_name` aligned if present. In `release.json`, update both artifact names, the release notes/date, set `distribution.recommended` to `chrome-web-store`, and set `distribution.chrome.storeUrl` to the URL of the configured item. Push the reviewed commit to `release/squarecoil-companion`. The workflow rejects an unchanged or inconsistent version, a force-replaced release branch, or a mismatched Store ID; runs `check:b6-candidate`; creates a ZIP from the canonical 15-file allowlist; validates the ZIP and embedded source SHA; checks that the branch tip is still current; and then uses the pinned [wdzeng/chrome-extension](https://github.com/wdzeng/chrome-extension) API v2 action to upload and submit the **existing** item. This pinned action's update flow requires an existing item ID; it does not perform this project's first Dashboard item setup. Store review still applies. A successful workflow submission is not proof that the item has been approved or installed in Chrome.

The separate [cssnr/webstore-publish-action](https://github.com/cssnr/webstore-publish-action) is another API v2 implementation reviewed during this design. This repository uses one pinned action and keeps its own package/version checks upstream of that action.

Microsoft Edge has its own add-on update channel and is **not** updated by this Chrome workflow. The shared ZIP remains available for Edge candidate testing; Edge store delivery would be a separate release integration.

## Verification boundary

Run `node --test tests/b6-store-release.test.js` to check numeric version ordering and metadata agreement. The workflow's package step validates the extracted ZIP against the exact Git commit. A live publish/update can only be verified after the Web Store item and credentials exist, the update passes review, and a store-installed browser receives it.

Sources: [First Chrome Web Store submission](https://developer.chrome.com/docs/webstore/publish), [Chrome distribution rules](https://developer.chrome.com/docs/extensions/how-to/distribute), [Chrome update lifecycle](https://developer.chrome.com/docs/extensions/develop/concepts/extensions-update-lifecycle), [Chrome Web Store API guide](https://developer.chrome.com/docs/webstore/using-api).
