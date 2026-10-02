# Chrome Web Store listing and submission draft

Updated October 1, 2026 for the v0.7.1 integration candidate. This is draft copy for the Chrome Web Store Developer Dashboard. The listing has **not** been submitted. Verify the public support/privacy URLs and replace the draft screenshots after the installed extension is checked on the real site.

## Store listing

- **Name:** US Sign SquareCoil Companion
- **Short description:** A local SquareCoil companion for work time, job context, dashboards, settings, and appearance on the US Sign & Mill site.
- **Category:** Productivity
- **Language:** English (United States)
- **Homepage:** `https://github.com/Wakeup-gif/squarecoil-companion`
- **Support, current public draft:** `https://github.com/Wakeup-gif/squarecoil-companion/blob/codex/squarecoil-prototype-integration/browser-extension/squarecoil-companion/docs/SUPPORT.md`
- **Privacy policy, current public draft:** `https://github.com/Wakeup-gif/squarecoil-companion/blob/codex/squarecoil-prototype-integration/browser-extension/squarecoil-companion/docs/PRIVACY-POLICY.md`
- **Before submission:** replace both draft URLs with stable, public pages containing the approved current copy, then open each URL while signed out to verify access.
- **Visibility:** Pending the owner's choice of unlisted, private, or public. The extension works only with the US Sign & Mill SquareCoil tenant, so unlisted is the recommended default.

### Detailed description

SquareCoil Companion adds a focused work-time workspace to the US Sign & Mill SquareCoil site. See your current work context, local time views and history, and use optional appearance and dashboard tools alongside the existing SquareCoil page.

Features include a local timer and time ledger, Today/Week/Context/History views, workspace tabs, a full Companion backup in JSON, importable finalized History CSV, and a spreadsheet-only Time Report CSV. The toolbar popup offers theme choices, a separate Bing photo switch for Glass themes, and a switch to hide the on-page Companion panel without stopping local tracking. The analytics dashboard and Design Dashboard Enhancements are separate optional features that start off. The SquareCoil website remains the authority for company clock actions; Companion observes the site's clock state and does not issue clock-in, clock-out, or pause commands to SquareCoil. Companion time is a local productivity record, not official payroll time.

This extension is for people who already have access to `ussignandmill.squarecoil.net`. It does not create a SquareCoil account or work on unrelated websites. Its timer/ledger, preferences, job context, and optional wallpaper cache are stored locally in Chrome. A bounded log of timestamped technical event codes is also stored locally and can be downloaded from the toolbar popup without signing in. Older events are removed when Companion next runs or you download the log; Chrome cannot prune them while closed. The log may note that a native clock event was observed, but contains no job, customer, URL, credential, work-duration, or payroll details. When a Glass theme and its Bing photo switch are both on, it may fetch public images from Bing without sending SquareCoil records or credentials. Glass uses a built-in background when photos are off or unavailable. Support and diagnostic details are emailed only if you choose to send them. See the privacy policy for full details.

### Graphics

- **Store icon:** `icons/icon-128.png` (128×128 PNG, transparent padding)
- **Small promotional tile:** `store-assets/small-promo-440x280.png` (440×280 PNG)
- **Draft screenshot 1:** `store-assets/workspace-1280x800.png` (extension on sealed fictional SquareCoil simulator)
- **Draft screenshot 2:** `store-assets/settings-1280x800.png` (same simulator)

The current screenshots use fictional job names and numbers, visibly show a local simulator banner, and contain no live customer data. They do not show the current toolbar popup or separate Bing photo switch. Before submission, capture reviewed, redacted screenshots of the exact installed candidate that show its current appearance and core controls without exposing customer or account details. `store-assets/` is excluded from the extension ZIP.

## Privacy dashboard

- **Single purpose:** Add a local work-time Companion workspace, optional dashboard presentation, and appearance controls to the US Sign & Mill SquareCoil website.
- **Remote code:** No. All executable JavaScript and CSS is bundled in the extension. Bing provides only optional image data.
- **Advertising:** None.
- **User data categories handled:** Website content and work activity, including job/context identifiers and titles visible on the SquareCoil site; locally stored Companion timer/ledger history and settings; locally stored coarse technical event codes and timestamps; and support message content only when the user chooses to send it.
- **Data use:** Provide the requested Companion functions. No sale, advertising use, or sharing of Companion records with third parties. Same-site SquareCoil requests use the user's existing SquareCoil session; Bing image requests are made only while a Glass theme and its photo switch are on, and omit SquareCoil credentials and Companion records.
- **Privacy policy URL:** Use the verified, public URL for the approved current copy. Review the dashboard's exact current data-category labels before selecting them; do not answer “no user data” just because records stay local.

### Permission justifications

- **`storage`:** Keep timer/ledger entries, workspace settings, and optional wallpaper cache in the browser so views survive page reloads.
- **`scripting`:** Start and retire one trusted Companion runtime on supported SquareCoil pages and prevent duplicate UI after navigation or disable.
- **`webRequest`:** Passively observe completed SquareCoil native clock requests to reconcile the local display with the site's clock. The extension does not block, redirect, or modify those requests.
- **`https://ussignandmill.squarecoil.net/*`:** Read the current site clock/job context, make a same-origin read-only state request, and render Companion only on this tenant.
- **`https://www.bing.com/*`:** Fetch public wallpaper metadata and an image only when a Glass theme and its separate Bing photo switch are on. The host access is declared in the manifest, while the user controls whether image requests occur. No SquareCoil data or credentials are sent in those requests.

## Review notes and remaining dashboard steps

The submitted ZIP must be the exact clean, validated package from the final submission commit. Do not upload the development directory, prototypes, lab files, or the store artwork directory. Confirm the final release metadata and delivery channel before publication; an unpacked developer-mode installation does not receive Chrome Web Store updates.

Reviewer access to the US Sign & Mill SquareCoil tenant is needed for a live end-to-end review. Do not invent or publish login credentials. Arrange a dedicated test account with the owner through the dashboard's private reviewer instructions if requested; the fictional local simulator is only for screenshots and automated testing.

Before submission: complete developer registration and two-step verification, create/select the store item, upload the validated ZIP and final images, verify public support/privacy URLs, paste the listing and privacy answers, choose visibility, provide reviewer access if requested, and inspect Google's preview. This document is a draft until those dashboard fields are saved and reviewed.
