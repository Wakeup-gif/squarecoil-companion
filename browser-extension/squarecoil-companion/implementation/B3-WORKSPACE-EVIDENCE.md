# B3 Canonical Time Views / Workspace Evidence

Status: **accepted**
Branch: `codex/squarecoil-b2c-migration`
Owning contracts: L2, L4, L5, L5A, L8, and `logic/B3-WORKSPACE-READINESS-AUDIT.md`

## Requirements-to-source/tests matrix

| Requirement | Primary source | Stable automated evidence | Installed-browser evidence |
|---|---|---|---|
| One revision feeds tabs and all time views | `src/timer/read-model.js`, `src/content/trusted-transition-core.js` | `UT-B3-READ-001` through `UT-B3-READ-010`, `IT-B3-WORKSPACE-001/002` | `B3-WORKSPACE-001/002` |
| Tab Today, exact thresholds, General/capacity, selected/current protection | `src/workspace/model.js`, `src/ui/workspace-ui.js` | `UT-B3-WORKSPACE-001` through `006`, `UT-B3-UI-001` | `B3-WORKSPACE-001` |
| Navigation/reorder/hide/show are presentation-only | `src/ui/workspace-ui.js` | `UT-B3-UI-007/013`, `IT-B3-WORKSPACE-001` | `B3-WORKSPACE-003/004`; authoritative revision and Ledger count unchanged |
| Ordered native focus with boot, stale, dirty-route, and same-Context protection | `src/timer/service.js`, `src/timer/read-model.js`, `src/workspace/model.js`, `src/ui/workspace-ui.js` | `UT-B3-READ-007/010`, `UT-B3-UI-002/003/004/009/010/011/012`, `IT-B3-WORKSPACE-002` | `B3-WORKSPACE-003` |
| Pending/provisional/hold/native/time-basis/legacy disclosure | `src/timer/read-model.js`, `src/ui/workspace-ui.js` | `UT-B3-READ-001/002/005/006/008/009`, `UT-B3-UI-008` | `B3-WORKSPACE-001/002` |
| Finalized logical History and incremental retrieval | `src/timer/read-model.js`, `src/ui/workspace-ui.js` | `UT-B3-READ-003/004/005`, `UT-B3-UI-006/008` | `B3-WORKSPACE-002` |
| Last-good snapshot and interaction continuity | `src/ui/workspace-ui.js`, `src/ui/entry.js` | `UT-B3-UI-005`; inherited prototype UI gate | full Chrome/Edge interaction suite |
| B2 lifecycle, authority, Bridge, migration, and READY remain unchanged | existing B1/B2 source | all B1/B2 unit/integration fixtures | all inherited B1/B2 A4 cases |

## Automated gate

`npm run check:b3-workspace` covers the generated package plus all B1, B2, and B3 unit/integration fixtures and static validation. The candidate has 31 stable B3 fixtures: 29 unit and 2 integration.

`npm run test:proto-ui` remains a mandatory compatibility gate.

## Browser development proof

The final dirty-development rehearsal passed independently in installed branded Chrome 151 and Edge 151 against the same unchanged package and ZIP bytes:

- build ID `rebuild-b3-canonical-workspace`, stage `B3`;
- ZIP SHA-256 `acd74ddf925b4e7c0db7deaaa7abd5e5cd7b5278fa1a3043c891d4e856dc6179`;
- all B1/B2/B3 browser cases passed;
- no unexpected network requests, console/page errors, or native SquareCoil mutation attempts;
- result is explicitly `NON_ACCEPTANCE` because `sourceDirty` was true.

## Exact candidate result

- source commit: `e3b369e691df317462bf6ef53cd981f682cca1d2`;
- `sourceDirty: false`;
- candidate fingerprint: `d556a98b96b9c688b8def0f1d983c10618d59bbeb1a1728052b5b503eab54bec`;
- ZIP SHA-256 before/after: `47b7a607affc2c4df7455b4bd0f4d41395e8c3142cbdad409ab833535a801f10`;
- extracted/ZIP inventory digest: `7ff06af728263a0007fbc850dea31573bd6f8afe8c3a16127f542df37ee4cb6b`;
- installed Chrome `151.0.7922.174`: PASS;
- installed Edge `151.0.4129.107`: PASS;
- all required B1/B2/B3 A4 fixture IDs observed;
- package and ZIP unchanged across both browsers;
- unexpected network requests: none;
- console/page errors: none;
- native SquareCoil mutation attempts: none;
- remote branch matched the source commit;
- GitHub Actions run `33149161832`: success.

The aggregate automated gate passed 368 tests: 90 B1 unit, 167 B2 unit, 29 B3 unit, 38 B1 integration, 42 B2 integration, and 2 B3 integration. The separate 13-test inherited prototype compatibility gate also passed.

## Proof boundary

The A4 harness uses synthetic in-memory SquareCoil fixture HTML and intercepted action-7 reads. It proves packaged extension behavior and no native mutation attempts for those cases. It does not perform a live business mutation or claim store/release readiness.
