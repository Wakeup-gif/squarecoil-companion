# B5-C Probe-Backed Theme Evidence

Status: **accepted**
Branch: `codex/squarecoil-b2c-migration`
Owning contract: `logic/B5C-PROBE-THEME-DELTA.md`

## Requirements-to-source/tests matrix

| Requirement | Primary source | Stable automated evidence | Installed-browser evidence |
|---|---|---|---|
| Exact route classification with `GENERIC` fallback | `classifyWebsiteRoute()` in `src/presentation/theme-service.js` | `UT-B5-THEME-010/013` | `B5C-THEME-001/002/003` |
| Both persistent top-right dropdowns receive one Sleek Dark adapter | `SLEEK_DARK_CSS` dropdown rules | theme service idempotence fixtures | `B5C-THEME-001` computed-style proof in Chrome and Edge |
| Exact `/leads.php` AdminDesign filter controls are repaired without broader route styling | route marker plus Leads CSS | `UT-B5-THEME-010/011` | `B5C-THEME-002` computed input/select proof |
| Exact `/calendar.php` FullCalendar surfaces and progress strip are repaired while native event border colors remain semantic | route marker plus FullCalendar CSS | `UT-B5-THEME-010/012/013` | `B5C-THEME-003` computed day/event/progress and native-border proof |
| Original, forced colors, and teardown remove theme and route ownership | theme service removal/fallback paths | `UT-B5-THEME-004/006/011` | `B5C-THEME-004` restores native computed presentation on every route |
| No new permission, network request, observer, timer, business action, or authority role | CSS-only theme service and unchanged manifest | package/manifest validation and inherited authority gates | zero unexpected network and native mutation attempts; Timer/Ledger unchanged |

## Accepted result

- exact source: `aeac7fe52a2e723106340bc6d283d2eb49521573`;
- 482 aggregate tests and 13 prototype tests passed;
- 81 stable B5 unit/integration fixture IDs and all four `B5C-THEME-*` installed-browser IDs passed;
- installed Chrome `151.0.7922.174`: clean profile PASS 27/27;
- installed Edge `151.0.4129.107`: clean profile PASS 27/27;
- exact package fingerprint: `9c77b1afacc36d4118d6d5162f330189ceeda0d0a5bdf4ccc0183775d00eab94`;
- exact ZIP SHA-256: `429668d61b2e7f249bc325653fac48bb15694173e7c206cbbff31cc6061df425`;
- package/ZIP unchanged in both browsers;
- zero failures, unsupported cases, unexpected requests, console/page errors, cleanup warnings, or native mutation attempts;
- GitHub Actions run `33185826761`: success.

## Boundary

B5-C is limited to persistent dropdowns, exact Leads filters, and exact Install Calendar presentation. CKEditor iframe work, remaining vendor widgets, broader route parity, and B5-D are not included or implied. The fixtures are synthetic and read-only; no live SquareCoil business data was changed.
