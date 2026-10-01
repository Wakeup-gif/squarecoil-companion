# SquareCoil Companion Privacy Policy

Last updated: October 1, 2026

SquareCoil Companion is a Chrome extension for the US Sign & Mill SquareCoil website at `https://ussignandmill.squarecoil.net/`. Its single purpose is to show a local work-time companion, workspace views, optional dashboard presentation, and appearance settings while you use that site. It is intended for people who already have access to that SquareCoil workspace.

## Information the extension handles

The extension reads the current SquareCoil page and the site's existing clock and job context. It observes completed native clock requests and makes a same-site, read-only request to reconcile the company clock. It stores Companion timer and ledger entries, job/context labels, settings, and optional image cache in Chrome's local extension storage on your device. This can include work activity, job identifiers and titles, and account-related context visible on the SquareCoil site. SquareCoil itself remains the authority for the company clock.

The extension does not send that Companion storage to the developer's server. Exports create files locally when you request them. The Full Backup JSON contains stored Companion jobs, time history, settings, and activity data, but does not restore a live clock state. Finalized History CSV can be imported into Companion; Time Report CSV is for spreadsheets and cannot be imported. These files contain Companion-recorded data, not SquareCoil's official clock or payroll records. Handle exported files as you would other work records.

The extension also keeps a small diagnostic event log in local extension storage so you can review problems that occurred between visits. Entries contain a timestamp and fixed technical event categories and codes. A code may show that a native clock event was observed at that time. Entries do not contain job or customer details, page URLs, credentials, work durations, or payroll records. The log holds at most 200 events and 64 KiB. When Companion next runs or you download the log, it removes entries older than 30 days; Chrome cannot prune them while closed. You can download the log as a JSON file from the toolbar popup's Technical details section, including when you are not signed in to SquareCoil. Downloading saves the file on your device; it does not send the log to us.

When you use a Glass theme with the separate Bing photo background switch on, the extension may request public wallpaper metadata and an image from `www.bing.com`. These requests do not include SquareCoil page text, job data, Companion records, or SquareCoil credentials. Bing will receive ordinary network information associated with the request, such as an IP address. With the photo switch off, or if an image is unavailable, Glass uses a built-in gradient. The Bing host permission is declared at installation even when you leave photos off.

If you choose Support or Feedback, the extension opens an email draft addressed to `cristian@ussignandmill.com`. Only information you decide to include, plus any diagnostics you explicitly choose to attach, is sent when **you send the email**. The extension does not automatically transmit diagnostics, diagnostic-log downloads, or analytics. Avoid including private customer or job details unless needed for support.

## Use, sharing, and retention

The information above is used only to provide the Companion features you request and to answer a support message you send. Companion does not sell user data, use it for advertising, or transfer it to data brokers. It does not load or execute program code from a remote server. The extension does not share local Companion records with Bing.

Companion records remain in Chrome's local extension storage until you delete them using the extension's available controls, clear its browser data, or uninstall it. Exported files remain wherever you save them until you delete them. Support emails are retained in the recipient's email system as needed to respond; you can request deletion by contacting the address below. SquareCoil's own records are governed by the SquareCoil site's policies and are not deleted by removing Companion.

## Your choices

In the toolbar popup, you can hide the on-page Companion panel without stopping local tracking, or turn Companion activity off to stop its local tracking and presentation. Optional analytics and Design Dashboard Enhancements are off by default. You can turn the Bing photo background switch off while keeping a Glass theme, or select a non-Glass theme, to avoid Bing image requests. You can export or restore Companion data through its settings. You can uninstall the extension or clear its local storage in Chrome to remove local Companion records. Clearing storage can permanently remove Companion history, so export a backup first if needed.

The extension is scoped to the US Sign & Mill SquareCoil site and `www.bing.com` for optional wallpaper images. It does not inspect the pages you browse on other websites. The permissions and data-handling explanations in the Chrome Web Store listing are part of this disclosure.

## Contact

Questions or deletion requests: `cristian@ussignandmill.com`.

Changes to this policy will be published at this page before or with a changed extension release.
