# B5-D Theme and Zero-History UI Evidence

Status: **accepted — presentation-only delta**  
Branch: `codex/squarecoil-b2c-migration`  
Exact implementation source: `4686ab0c92ce7e4b91a92bc64b479a2bd0ea01c0`  
Owning delta: `logic/B5C-PROBE-THEME-DELTA.md`

## Accepted behavior

- A fresh zero-history Companion Home exposes Recent Jobs, Time Overview, History, and Settings without requiring a SquareCoil clock-in.
- Sleek Dark owns route-bounded adapters for DataTables, Select2, QTip, Magnific Popup, FancyBox, Dropzone, CKEditor chrome, and the audited Gantt routes.
- Same-origin CKEditor documents receive one removable owned dark layer; inaccessible documents fail closed without a false themed marker.
- The remaining audited v2.3.3 path families are classified by exact pathname. Near-miss paths remain `GENERIC` and receive no B5-D vendor or editor adapter.
- Narrow viewport, reduced-motion, forced-colors, and print behavior preserve readable presentation and exact native fallback.
- Original, forced colors, disable, and teardown remove outer and editor-document ownership without rewriting the durable preference.
- The delta adds no permission, network source, Timer/Ledger/Bridge authority, or native SquareCoil mutation.

## Automated gate

`npm run check:b5d-theme`, `node --check tests/b1-browser/run.js`, and `git diff --check` passed.

- 487 aggregate unit/integration tests passed: 90 B1 unit, 168 B2 unit, 29 B3 unit, 28 B4 unit, 82 B5 unit, 38 B1 integration, 42 B2 integration, 2 B3 integration, 4 B4 integration, and 4 B5 integration.
- The separate 13-test prototype-compatibility suite passed.
- Static validation recorded 86 unique B5 fixture IDs and all five B5-D A4 IDs with no skipped, todo, or focused fixtures.

## Exact package identity

- package version: `0.7.1`;
- build ID/stage: `rebuild-b6-release-candidate` / `B6`;
- source dirty: `false`;
- candidate fingerprint: `7fcab152db2f3fbafaa4dbfeed9665fd292ff6cc38b80b0611633babea62326b`;
- archive: `SquareCoil-Companion-v0.7.1-B5D-READY.zip`;
- archive bytes: `215150`;
- archive SHA-256 before/after: `64becc0ff8d4e2d09e7cd3b772063731f1ccc0db62be970cbc72bbce6f82e55c`;
- extracted/archive inventory digest: `751a628be8f7583f653c192667554ae1c8d11de46b556f07f6f376afbcd6bcfa`;
- A4 evidence SHA-256: `aaea3b29783346c8609165b44df99b80d920604fd9858916380107562b39d045`;
- exact package inventory: 8/8 allowlisted files;
- archive and extracted package remained unchanged across both browsers and both profiles.

## Installed Chrome and Edge result

The acceptance-eligible A4 run started `2026-08-28T17:13:19.978Z` and finished `2026-08-28T17:19:48.931Z` with Playwright `1.62.1`.

| Browser | Installed identity | Clean profile | v0.7 upgrade profile |
|---|---|---:|---:|
| Google Chrome | `Chrome/151.0.7922.174` | PASS 29/29 | PASS 2/2 |
| Microsoft Edge | `Edg/151.0.4129.107` | PASS 29/29 | PASS 2/2 |

Both clean profiles observed `B5D-UI-001`, `B5D-VENDOR-001`, `B5D-OVERLAY-001`, `B5D-EDITOR-001`, and `B5D-LAYOUT-001`. Across all four profiles there were zero failures, unsupported cases, unexpected network requests, console/page errors, cleanup warnings, or native SquareCoil mutation attempts.

## Proof boundary

Installed acceptance uses synthetic in-memory SquareCoil pages and intercepted read-only action-7 responses. It proves the exact packaged presentation/UI behavior and preserved inherited gates for the tested fixtures. It does not claim a live production reskin, new SquareCoil business action, store publication, rollout, or merge to `main`.
