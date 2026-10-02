# Extension-Native Migration Inventory

**Audit date:** 2026-08-28
**Repository / branch:** `Wakeup-gif/test_repo` / `codex/squarecoil-b2c-migration`
**Boundary:** presentation and optional read-only Companion features only. Timer, Ledger, observation, settlement, migration, and SquareCoil business actions are frozen.

## Evidence rule

Userscripts, audit documents, and the theme branch are evidence. They are not runtime dependencies. No GM API, userscript menu, remote `@require`, remote font, page-owned storage, base64 userscript logo, or userscript mutation loop is shipped. Every accepted feature is reimplemented as a bounded MV3 module with explicit ownership and teardown.

## Theme evidence reconciliation

| Evidence | Useful facts | Native result | Decision |
|---|---|---|---|
| `codex/squarecoil-theme-v2.3.3` commit `0e6e6ef` | Broad route and component vocabulary; top-right dropdown, Leads filters, Install Calendar | Previously accepted bounded B5-C/B5-D adapters remain | Evidence only; no branch merge or userscript import |
| commit `ec11183` Dark Glass v2.3.4 | Transparent navy shell, SC lockup, safe top-right hover, single-row project actions, nested-blur avoidance, semantic states | Existing `SLEEK_DARK` durable identity now presents as **Dark Glass v2.3.4** | Implemented |
| commit `041ffda` Light Glass v1.0.0 | Pale translucent surfaces, dark text, light editor and modal treatment | New durable `LIGHT_GLASS` preference and one owned theme layer | Implemented |
| commit `041ffda` Refined Light v1.0.1 | Higher-clarity, mostly solid light alternative | Existing `REFINED_LIGHT` is retained and expanded | Implemented as a distinct choice |
| Native SquareCoil | Untouched site presentation and behavior | `ORIGINAL`, shown to users as **Native / Off** | Implemented and default |

## Feature-family disposition

| Feature family | Capability and risk | Extension-native disposition | User-facing result |
|---|---|---|---|
| Full UI Theme | Broad CSS plus userscript runtime/menu/storage | Selector and token evidence only | Four real theme choices; no userscript dependency |
| Cinematic wallpaper | Optional public image feed, cache, timers, image layers | Existing generation-fenced service retained; eligible for Dark Glass and Light Glass; one host/layer | Optional Wallpaper On/Off |
| Companion timer workspace | Local read model and approved local actions | Existing extension-native implementation refined visually; core API unchanged | Available before clock-in; current work appears when present |
| Companion time overview/history | Local Companion records | Existing extension-native read models retained | Today, week, day, job and completed-session views |
| Local backup/restore/CSV | Existing explicit local data tools | Retained; copy clarified | Privacy and permissions / Local data and backups |
| Support and diagnostics | Privacy-safe snapshot plus explicit email/copy | Retained; raw implementation data moved behind Technical details | Advanced diagnostics and support |
| Menu Cleanup / Sticky Project Rail | Reorder/hide native navigation | Deferred; no accepted navigation/visibility contract | Not exposed |
| Description File Path Tools | Clipboard/open/navigation and observers | Deferred; target, route and teardown proof incomplete | Not exposed |
| Scope of Work File Tools | Clipboard/open/anchor navigation | Deferred; extraction and destination contracts incomplete | Not exposed |
| Design Job Tools | Form values, submit/click behavior, observers | Rejected for this scope; write-capable business behavior | Not exposed |
| Project Scope Workspace | Large layout/DOM ownership | Deferred; semantic, form, route and dynamic-content audit incomplete | Not exposed |
| UI Runtime Fixes | Mixed repairs, storage and remote image access | Only already-audited local glyph/readability CSS is retained; Imgur/runtime dependency rejected | No separate toggle |
| All-in-One | Monolithic mixed presentation and write behavior | Rejected; violates independent ownership and gating | Not exposed |
| Adobe/ChatGPT themes | Other products and origins | Out of scope | Not exposed |
| Legacy Job Timer | Duplicate clock/storage/writer behavior | Superseded and forbidden alongside the rebuild | Not exposed |
| Watched-job changes | Requested read-only awareness but no proven source adapter | Blocked pending an extraction contract and route evidence | Visible as “Not available yet”; no fake toggle |
| SquareCoil notifications | No proven notification source or permission/lifecycle contract | Blocked | Visible as “Not available yet”; no fake toggle |
| File/folder indicators | No proven bounded source or staleness semantics | Blocked | Not claimed or synthesized |

## Ownership and teardown

- Site themes own exactly `#squarecoil-companion-site-theme`, root theme/route attributes, and bounded same-origin CKEditor document styles.
- Cinematic owns one presentation host, one style layer, and one bounded extension cache entry. Exact Bing origin access is a required installation/update capability; skins never request or revoke it at runtime.
- The former Design Dashboard profile was removed as redundant with the settled website themes; it owns no route, style layer, summary host, or preference.
- The popup requests a bounded read-only summary directly from the extension content controller. It cannot invoke a timer, data, native clock, or business action.
- Native / Off, disabled optional preferences, accessibility fallback, route departure, and teardown remove the relevant owned resources without touching SquareCoil values or handlers.

## Migration conclusion

The safe, useful presentation and read-only features are now extension-native. Write-capable, unproven, or cross-product families remain deferred or rejected. This inventory is authoritative for the current visual/optional-feature continuation and does not authorize new SquareCoil mutations.
