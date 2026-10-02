# Tampermonkey Feature Inventory and B5-B Disposition

**Audit date:** 2026-08-28
**Repository:** `Wakeup-gif/test_repo`
**Gate:** B5-B Optional Presentation
**Rule:** userscripts are historical evidence, never production dependencies or implicit authorization.

## Audit method and boundary

The inventory reviewed every file in `tampermonkey/`, its userscript metadata, route declarations, grants/connect hosts, storage/network use, DOM observers, navigation/click behavior, form/value writes, and relevant Git lineage. The separate 2026-08-28 site audit and reskin lab were used only to reconcile route/vendor findings and known visual defects. No userscript was executed against live SquareCoil and no source was pasted wholesale into the extension.

The production extension remains the only runtime. B5-B activates one independently declared presentation feature:

- `squarecoil.optional.cinematic-background` v1.0.0;

It is off by default, presentation-only, subordinate to the Glass-theme and accessibility policy, and unable to call Timer, Ledger, Bridge mutation, native clock, or SquareCoil business actions. The former Design Dashboard profile was retired as redundant with the settled themes.

## Canonical evidence families

| Historical family | Canonical reviewed source and SHA-256 | Observed capabilities / risk | B5-B decision |
|---|---|---|---|
| Full UI Theme base | `US-Sign-Full-UI-Theme-v2.2.6.user.js` — `cac31a821cef1769394a45e0093ee10fc01f18df0cf82fec6cca7bdc584e8458` | Large dark-glass CSS/DOM presentation baseline; 6,000+ lines and broad route reach | Evidence only. B5-A owns the bounded Original / Refined Light / Sleek Dark base themes. No import. |
| Cinematic wallpaper | `US-Sign-Full-UI-Theme-v2.2.7.user.js` — `645076a63fa82c000835252b6d9e5aa0b633d8bed889ada77fd35bd98808a41f` | Bing metadata/image network, page `localStorage` cache, dual layers, refresh/rotation timers, visibility and motion lifecycle; also contains the over-broad `#pmlt` font override that caused missing glyphs | Behavior evidence only. Reimplemented as an extension-owned, generation-fenced service with required exact Bing installation access and no runtime permission request, strict public `OHR.*_UHD.jpg` extraction, discarded provider parameters, an internally constructed canonical `/th` request, bounded extension cache with failure retention, validated raster bytes and decoded dimensions, built-in gradient fallback, accessibility suspension, exact teardown, and no page storage. The September 14 setup flow and its proof limits are recorded in `PROTOTYPE-BING-SETUP-2026-09-14.md`. |
| Design Dashboard refresh | `US-Sign-Full-UI-Theme.user.js` v2.2.9 — `cd3ebc6fd1ad9f7eed127ce1b80e6702a6f8ece41300930dc1baa7d3c4f804fe` | Exact `/dashboard.php?show=2` CSS profile; no business-action ownership | Rejected for the current extension as redundant with the settled website themes; no profile, summary, route ownership, or preference remains. |
| Menu Cleanup | `US-Sign-Menu-Cleanup.user.js` — `749b5518061b0f0ee95dc32c282acc02e597f46917ffa60de26e71c801cb0a62` | Menu presentation, DOM reorder/hide behavior; no network | Deferred. Requires a separate navigation/visibility contract; not B5-B. |
| Description File Path Tools | `US-Sign-Description-File-Path-Tools.user.js` — `7f4dec857acfc111f37ce807102b249af5bd0666d7b1d40519c046f33350272c` | Clipboard, open/navigation, observer and click paths | Deferred optional navigation utility. Requires bounded route/target/teardown proof; not presentation-only B5-B. |
| Design Job Tools | `US-Sign-Design-Job-Tools.user.js` — `f7fdd41354b56637114b384cba51b604f6fbd630149ffb442eca8caccb074496` | Clipboard/open plus form values, `requestSubmit`, clicks, and MutationObservers | Excluded from B5-B. Business mutation needs separate exact action contracts and authorization. |
| Project Scope Workspace | `US-Sign-Project-Scope-Workspace.user.js` — `47ed9aa208e37aec28de819862eba248e54f3aa02eee8240d002d7c1ca822775` | Large project-route CSS/DOM workspace with substantial layout ownership | Deferred. Needs route, form, semantic, dynamic-content, and teardown audit. |
| Scope of Work File Tools | `US-Sign-Scope-of-Work-File-Tools.user.js` — `cc20b47d429fecfa7a6c14a47b0db74cc1009e7bc753bd2d9965ac829c5c3747` | Clipboard/open/anchor-click navigation utilities | Deferred optional navigation utility; not B5-B. |
| UI Runtime Fixes | `US-Sign-UI-Runtime-Fixes.user.js` — `b25da21993ac4b92366f1c8f003919e3a3e31ccaac65019f68194b9e4276f007` | Historical presentation repairs, userscript storage, and remote image access to `i.imgur.com` | Not ported. Required glyph/readability repairs are owned locally; no Imgur permission or runtime dependency is accepted. |
| All-in-One | `US-Sign-All-in-One.user.js` — `2c59c401a534323963aa598078f780cccea11aeeb0704d43c6daf5430c931050` | Monolithic aggregation of unrelated UI and tool behavior | Excluded. Its responsibilities must remain separated into independently gated features. |
| Adobe Acrobat integration | `Adobe-Acrobat-US-Sign-Colors.user.js` — `60b40510b1b8a9f791c17656d66e6f1a6c59f1d3f93b0f6769894b5adb9caf39` | External hosts plus click and form-value mutation | Separate integration, outside SquareCoil B5-B and outside this rebuild authorization. |
| Legacy Job Timer | `SquareCoil-Job-Timer.user.js` — `200d24166a56ae8f29f3cf5488d9834bd3012c867eec08bb61fccb7e90a4c9c6` | Current tiny loader plus earlier native clock/storage behavior; duplicate/superseded variants | Migration evidence only. Never run alongside the rebuild; lifecycle exclusion remains mandatory. |
| Sticky Project Rail | `US-Sign-Sticky-Project-Rail.user.js` — `d9e710418e067bd8d929fec2c059afc7ad87ce0572ff7e1dc7f2c9479b6b6804` | Stub/installer lineage superseded by Menu Cleanup | Superseded; excluded. |

## Remaining file families

- Versioned files in the Full UI Theme, Job Timer, Design Job Tools, Project Scope Workspace, Description File Path Tools, and UI Runtime Fixes families are retained as lineage snapshots. The canonical rows above determine B5-B ownership; older versions do not create additional features.
- `US-Sign-Optimized-Theme.user.js`, `US-Sign-Optimized-Design-Tools.user.js`, and `US-Sign-Optimized-Project-Tools.user.js` are derived/optimized experiments, not independent authority or acceptance evidence.
- `US-Sign-Install-Test-2.user.js` is installation-test material, not a product feature.
- `ChatGPT-US-Sign-*-Theme*.user.js` targets ChatGPT/external presentation rather than SquareCoil and is outside this extension's route and permission boundary.
- `US-Sign-Scope-File-Tools.user.js` is an older/sibling scope-file lineage and remains covered by the deferred Scope of Work File Tools disposition.

## Site-audit reconciliation

The audit corpus identifies 32 route families and third-party widget stacks including DataTables, Select2, FullCalendar, QTip, FancyBox, Magnific Popup, Dropzone, CKEditor, and Gantt. Those findings do not prove safe live behavior across all routes. B5-B therefore does not claim a broad site reskin or vendor-adapter acceptance.

The isolated v2.3.2 reskin preview was useful for identifying the missing-icon cause, contrast/density/overflow risks, and candidate vendor selectors. It is not live proof and is not a production dependency. B5-B uses only:

- exact icon-font repair selectors inside the exact Design Dashboard profile;
- explicit warning/error/focus contrast in that profile;
- bounded overflow and responsive rules on audited dashboard containers;
- no broad `#pmlt` descendant font replacement;
- no route-general vendor takeover.

## B5-C light probe addendum

The user separately authorized and the branch accepted a small extension-owned follow-up based on the read-only v2.3.3 probe at commit `0e6e6ef36534b33383358b4223ae1ae9054848aa`. B5-C ports only the persistent top-right dropdown, exact Leads filter, and exact Install Calendar CSS repairs into Sleek Dark. No userscript runtime is imported.

CKEditor iframe-document repair and every broader route/vendor adapter remain the deferred B5-D milestone documented in `logic/B5C-PROBE-THEME-DELTA.md`. B5-C does not change the inventory's no-broad-reskin conclusion.

## B5-B permission, storage, privacy, and recovery ledger

| Feature | Default | Permission | Storage | Privacy / retention | Activation and recovery |
|---|---|---|---|---|---|
| Cinematic Background | `NONE` | Required `https://www.bing.com/*` installation/update capability; no runtime request or revocation | Durable preference plus one bounded presentation cache entry, `squarecoilCompanionB5BWallpaperCacheV1`; maximum 4 MB source image, seven-day cache acceptance | Provider URL is constructed from fixed `format`, `idx`, `n`, `mkt`, `uhd`, width, and height values. No SquareCoil URL, job, timer, page content, identity, or user text is sent. | Included with Dark Glass and Light Glass. Native / Off stops retrieval and clears cache while preserving required host access. Forced colors/reduced transparency suspend without erasing preference. Reduced motion keeps the image static. Disable/theme change/teardown increments generation, removes owned resources, and rejects late results. Cache, embedded fallback, or native base theme remains safe on failure. |
| Design Dashboard Profile | `OFF` | None beyond the existing exact SquareCoil route | Durable preference only | No network or extracted data | Applies only at exact pathname `/dashboard.php` with one `show=2`. CSS-only selectors preserve native values/order/targets/disabled state. Missing audited surfaces yield `PARTIAL_SAFE`; route/theme/accessibility changes remove the one owned layer. |

## B5-E visual and extension-native reconciliation

The final visual/optional integration re-audited the Dark Glass v2.3.4, Light Glass v1.0.0, and Refined Light v1.0.1 evidence commits from `codex/squarecoil-theme-v2.3.3`. Only tokens, selector facts, layout facts, semantic-color behavior, and bounded editor timing were used. The production runtime remains MV3 extension code.

The authoritative current dispositions and route limits are now recorded in:

- `docs/EXTENSION-NATIVE-MIGRATION-INVENTORY.md`;
- `docs/ROUTE-CAPABILITY-MATRIX.md`.

Dark Glass retains the accepted `SLEEK_DARK` durable value for upgrade compatibility. Light Glass adds one durable `LIGHT_GLASS` value. Refined Light remains distinct. Native / Off remains the default and exact restoration path. The Design Dashboard optional profile now owns one additional read-only Companion summary host on the same exact audited route; it does not read or alter SquareCoil business fields.

Watched-job changes, notifications, and file/folder indicators remain blocked because no bounded read-only source and staleness contract is proven. Design Job Tools and other write-capable families remain excluded. This is an explicit fail-closed result, not an omitted implementation.

## Gate conclusion

B5-B activates only the two optional presentation packs above. Every other inventoried feature remains deferred, superseded, excluded, or evidence-only. None is silently promoted into B6.
