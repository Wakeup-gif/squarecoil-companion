# SquareCoil Companion Theme Source-Parity Ledger

Status: active stabilization ledger for `codex/squarecoil-b2c-migration`

## Authoritative inputs

| Layer | Pinned source | Blob |
|---|---|---|
| Dark Glass adapter | `10af15634a10026c536f5dc570ec781af700c908:tampermonkey/US-Sign-Full-UI-Theme-v2.3.4.user.js` | `fc451babe1b24a7308238ac6033150ba94fcffef` |
| Light Glass adapter | `10af15634a10026c536f5dc570ec781af700c908:tampermonkey/US-Sign-Full-UI-Light-Glass-Theme-v1.0.0.user.js` | `78d3e08ef7a204ed365c4d6672c41c6c8c19ad9c` |
| Static dark foundation | `0e6e6ef36534b33383358b4223ae1ae9054848aa:tampermonkey/US-Sign-Full-UI-Theme-v2.2.6-static-base.js` | `87e34504842efc47e52cc1f37264ed0c3f07be3b` |
| Cinematic/live-glass delta | `b0a89382eabdbcb873b3f8d20bcacb05ada7b63c:tampermonkey/US-Sign-Full-UI-Theme-v2.2.7.user.js` | `39c0e10acbbef441b16318db875e9375e97b053c` |
| Recursive v2.2.6 dependency | `a340786458402732f0f78d48face95c940adabf3:tampermonkey/US-Sign-Full-UI-Theme-v2.2.6.user.js` | `df1a0c57ee82519cfed6ac872a584d59f99e8c7d` |

The static foundation differs from the recursive v2.2.6 dependency only by metadata and by disabling the older wallpaper/parallax initializers. The extension ports the static presentation and uses one Companion-owned wallpaper engine.

## Facility mapping

| Authoritative facility | Extension equivalent | Parity/ownership rule |
|---|---|---|
| Theme tokens, Manrope operational type, Space Grotesk/Fraunces identity type | generated bundled theme CSS plus `theme-service.js` | Preserve accepted token values, hierarchy, and fallbacks; no generic replacement palette. |
| `us-sign-v230`, `us-sign-v240`, skin and route markers | `presentation-bootstrap.js` and theme service root/route markers | Install at `document_start`; update atomically; remove exactly for Native / Off. |
| `GM_addStyle` static foundation and dark/light adapters | one removable Companion-owned style layer | Generated from the pinned blobs with provenance and deterministic hashes. |
| v2.2.7 Bing multi-market pool, cache, crossfade, pan/zoom | existing permission-gated wallpaper provider plus cinematic service | Fixed public Bing requests only, one host/two layers, reduced-motion support, cache/fallback, no user/page/job data. |
| Root canvas, light/dark image overlay and live frost | cinematic host plus authoritative dark/light CSS | Wallpaper paints above the browser canvas and below all SquareCoil controls; eligible wrappers are transparent. |
| Header, navbar, left shell, project rail, topbar | authoritative selector rules | Preserve native geometry and actions while matching tint, blur, contrast, borders, and shadows. |
| Panels, cards, wells, tables, trays, design modules | authoritative selector registry | One blur layer per outer surface; nested content stays readable and avoids stacked blur. |
| Inputs, selects, buttons, dropdowns, badges, alerts, semantic states | authoritative rules and bounded presentation markers | Preserve values, disabled/read-only state, handlers, URLs, and semantic color distinctions. |
| Dashboard, project, calendar, reports, leads, gantt and vendor adapters | exact route classification plus authoritative route CSS | Exact supported paths only; near misses remain generic/native. |
| CKEditor chrome and same-origin iframe document styling | theme service bounded iframe scan and owned editor-document style | No false marker on inaccessible frames; remove owned document styles on Native/teardown. |
| Responsive, reduced-motion, forced-color, reduced-transparency and print rules | authoritative media rules plus effective presentation fallbacks | Accessibility wins without rewriting the durable preference. |
| Userscript storage/menu commands | fenced Companion Preferences and Settings routes | Dark Glass and Light Glass are integrated choices; no separate background preference. |
| Userscript enable/disable and native restoration | `ORIGINAL` reconciliation and presentation teardown | Remove markers, style/editor layers, wallpaper hosts, timers/listeners, and cache; retain required installation host access and never alter SquareCoil business state. |
| Document-start execution | fail-open pre-paint bootstrap | Read persisted visual preference without waiting for authority/Bridge/Timer; bounded guard release; later authoritative reconciliation does not remove/re-add an unchanged theme. |

## Intentional compatibility deviations

- Remote Google font imports are removed. The authoritative font stacks remain and resolve to installed/system fallbacks; no remote stylesheet or executable dependency is packaged.
- The pinned shared cinematic layer has a broader high-specificity production-surface registry than the terminal Dark v2.3.4 and Light v1 adapters. The generated ports reassert the terminal theme surface registries at the same theme-scoped boundary: Dark receives one coherent cool-glass outer surface; Light receives one coherent pale-glass outer surface and transparent nested panes. The deltas change no geometry, visibility, values, handlers, links, or business state.
- The current Bing image response may include the fixed public tuple `w=3840&h=2160&rs=1&c=4`. The provider accepts either no sizing tuple or that exact complete tuple, canonicalizes parameter order, and rejects partial, duplicate, unknown, non-public, or off-origin values.
- The pinned userscripts do not own the Companion workspace or its cinematic host. The generated extension ports add one print-only rule that excludes those Companion-owned surfaces from native SquareCoil print output; screen rendering and native page content are unchanged.
- The userscript route helper accepts suffix matches. The extension uses exact pathname classification so an unlisted nested lookalike cannot inherit a route-specific vendor or editor adapter.
- Bing access to exactly `https://www.bing.com/*` is a required installation/update capability. Selecting either Glass theme starts the provider with no runtime permission request or extra setup action. Browser restrictions retain safe cache/gradient fallback. Restore Native stops retrieval and clears cache without revoking required host access. See `PROTOTYPE-BING-SETUP-2026-09-14.md` for the superseding September 14 contract, Chrome installation/update implications, and validation limits.

## Explicit exclusions

- No userscript business-action code or native SquareCoil mutation is imported.
- No legacy userscript wallpaper engine, GM storage, GM request API, or menu command executes in the extension.
- No generated or packaged wallpaper artwork is used; unavailable Bing access receives a CSS gradient fallback.
- No Timer, Ledger, Bridge, migration, lifecycle settlement, or native clock ownership changes are permitted by this port.
