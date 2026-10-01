# Chrome Web Store listing and submission draft

Prepared September 30, 2026 for the v0.7.1 integration candidate. These values are ready to paste into the Chrome Web Store Developer Dashboard. The listing has **not** been submitted.

## Store listing

- **Name:** US Sign SquareCoil Companion
- **Short description:** A local SquareCoil companion for work time, job context, dashboards, settings, and appearance on the US Sign & Mill site.
- **Category:** Productivity
- **Language:** English (United States)
- **Homepage:** `https://github.com/Wakeup-gif/squarecoil-companion`
- **Support:** `https://github.com/Wakeup-gif/squarecoil-companion/blob/codex/squarecoil-prototype-integration/browser-extension/squarecoil-companion/docs/SUPPORT.md`
- **Privacy policy:** `https://github.com/Wakeup-gif/squarecoil-companion/blob/codex/squarecoil-prototype-integration/browser-extension/squarecoil-companion/docs/PRIVACY-POLICY.md`
- **Visibility:** Pending the owner's choice of unlisted, private, or public. The extension works only with the US Sign & Mill SquareCoil tenant, so unlisted is the recommended default.

### Detailed description

SquareCoil Companion adds a focused work-time workspace to the US Sign & Mill SquareCoil site. See your current work context, local time views and history, and use optional appearance and dashboard tools alongside the existing SquareCoil page.

Features include a timer and local time ledger, Today/Week/Context/History views, workspace tabs, backup and CSV export, Light/Dark/Auto and Glass appearance choices, and two separate optional dashboard features. Both the analytics dashboard and Design Dashboard Enhancements start off. The SquareCoil website remains the authority for company clock actions; Companion observes the site's clock state and does not issue clock-in, clock-out, or pause commands to SquareCoil.

This extension is for people who already have access to `ussignandmill.squarecoil.net`. It does not create a SquareCoil account or work on unrelated websites. Its timer/ledger, preferences, job context, and optional wallpaper cache are stored locally in Chrome. A Glass appearance may fetch public images from Bing without sending SquareCoil records or credentials. Support and diagnostic details are emailed only if you choose to send them. See the privacy policy for full details.

### Graphics

- **Store icon:** `icons/icon-128.png` (128×128 PNG, transparent padding)
- **Small promotional tile:** `store-assets/small-promo-440x280.png` (440×280 PNG)
- **Screenshot 1:** `store-assets/workspace-1280x800.png` (real extension on sealed fictional SquareCoil simulator)
- **Screenshot 2:** `store-assets/settings-1280x800.png` (same simulator)

The screenshots use fictional job names and numbers. No live customer data is included. `store-assets/` is excluded from the extension ZIP.

## Privacy dashboard

- **Single purpose:** Add a local work-time Companion workspace, optional dashboard presentation, and appearance controls to the US Sign & Mill SquareCoil website.
- **Remote code:** No. All executable JavaScript and CSS is bundled in the extension. Bing provides only optional image data.
- **Advertising:** None.
- **User data categories handled:** Website content and work activity, including job/context identifiers and titles visible on the SquareCoil site; locally stored Companion timer/ledger history and settings; and support message content only when the user chooses to send it.
- **Data use:** Provide the requested Companion functions. No sale, advertising use, or sharing of Companion records with third parties. Same-site SquareCoil requests use the user's existing SquareCoil session; optional public Bing image requests omit SquareCoil credentials and Companion records.
- **Privacy policy URL:** Above. Review the dashboard's exact current data-category labels before selecting them; do not answer “no user data” just because records stay local.

### Permission justifications

- **`storage`:** Keep timer/ledger entries, workspace settings, and optional wallpaper cache in the browser so views survive page reloads.
- **`scripting`:** Start and retire one trusted Companion runtime on supported SquareCoil pages and prevent duplicate UI after navigation or disable.
- **`webRequest`:** Passively observe completed SquareCoil native clock requests to reconcile the local display with the site's clock. The extension does not block, redirect, or modify those requests.
- **`https://ussignandmill.squarecoil.net/*`:** Read the current site clock/job context, make a same-origin read-only state request, and render Companion only on this tenant.
- **`https://www.bing.com/*`:** Fetch a public wallpaper image when a Glass appearance is selected. No SquareCoil data or credentials are sent in those requests.

## Review notes and remaining dashboard steps

The submitted ZIP must be the exact clean, validated 15-file package from this branch. Do not upload the development directory, prototypes, lab files, or the store artwork directory. The current `release.json` still marks v0.7.1 as development mode and must be reviewed before any publication.

Reviewer access to the US Sign & Mill SquareCoil tenant is needed for a live end-to-end review. Do not invent or publish login credentials. Arrange a dedicated test account with the owner through the dashboard's private reviewer instructions if requested; the fictional local simulator is only for screenshots and automated testing.

Before submission: complete developer registration and two-step verification, create/select the store item, upload the validated ZIP and images, paste the listing and privacy answers, choose visibility, provide reviewer access if requested, and inspect Google's preview. This document is a draft until those dashboard fields are saved and reviewed.
