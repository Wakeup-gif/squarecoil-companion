# B4 Data Safety / Backup / CSV Evidence

Status: **accepted**
Branch: `codex/squarecoil-b2c-migration`
Owning contracts: L2, L6, L8, and `logic/B4-DATA-READINESS-AUDIT.md`

## Requirements-to-source/tests matrix

| Requirement | Primary source | Stable automated evidence | Installed-browser evidence |
|---|---|---|---|
| One fenced Data Mutation Lock with staged revalidation and atomic persistence | `src/data/data-safety.js`, `src/data/data-safety-command.js`, authority dispatcher/store | `UT-B4-DATA-007`, `IT-B4-DATA-001` through `004` | `B4-DATA-002/003` |
| Archive, Restore, Clear Recent, exact-context Delete, Delete All, and Wipe remain distinct and protect live/recovery state | `src/data/data-safety.js`, `src/ui/workspace-ui.js` | `UT-B4-DATA-001` through `008`, `UT-B4-UI-002` through `004` | `B4-DATA-002/004` |
| Full Backup is count-consistent, revision-bound, schema-validated, and contains no live authority | `src/data/data-safety.js` | `UT-B4-BACKUP-001` through `009` | `B4-DATA-001/003/004` |
| Merge/Replace dedupe, overlap, hard identity, recovery-evidence, lineage, conflict, and quiescence rules | `src/data/data-safety.js`, trusted core | `UT-B4-BACKUP-004` through `009`, `IT-B4-DATA-002/004` | `B4-DATA-003/004` |
| History CSV is importable; Time Report CSV is reporting-only; v0.7 adapter never fabricates dates | `src/data/data-safety.js` | `UT-B4-CSV-001` through `007` | `B4-DATA-001/003` |
| File inputs are bounded and formula-safe; malformed data never partially mutates | `src/data/data-safety.js` | `UT-B4-BACKUP-002`, `UT-B4-CSV-002/003/005/007`, `IT-B4-DATA-003` | `B4-DATA-003` |
| B4 UI uses trusted clicks, exact confirmations, conflict review, and pre-backup opportunity | `src/ui/workspace-ui.js` | `UT-B4-UI-001` through `004` | `B4-DATA-001/002/004` |
| B1-B3 lifecycle, authority, Bridge, migration, READY, and workspace gates remain unchanged | existing B1-B3 source | all inherited unit/integration fixtures | all inherited B1-B3 A4 cases |

## Automated gate

`npm run check:b4-data` passes the generated package, static validation, and 400 tests: 90 B1 unit, 167 B2 unit, 29 B3 unit, 28 B4 unit, 38 B1 integration, 42 B2 integration, 2 B3 integration, and 4 B4 integration.

`npm run test:proto-ui` separately passes all 13 inherited prototype-compatibility tests. B4 owns 32 stable unit/integration fixture IDs and four installed-browser A4 fixture IDs.

## Exact candidate result

- source commit: `e5b6bb6014aee087b85fcd97901b3944e45a77ec`;
- build ID/stage: `rebuild-b4-data-safety` / `B4`;
- `sourceDirty: false`;
- candidate fingerprint: `925cca07210881cdebd5740762a7176d3c6e1b9bc957a08d6da9ea52a92037a2`;
- ZIP SHA-256 before/after: `4ed5b8dd8125ed6d45e1e18a45a05c714929f9378ff80345c282d9dc3c40d630`;
- extracted/ZIP inventory digest: `fe4408610c2f322306e5319fb4319a067c1a5788708776f3ac3b8f120ad28a62`;
- installed Chrome `151.0.7922.174`: PASS, 23/23 cases;
- installed Edge `151.0.4129.107`: PASS, 23/23 cases;
- every required B1-B4 A4 fixture ID observed;
- package and ZIP unchanged across both browsers;
- unexpected network requests: none;
- console/page errors: none;
- native SquareCoil mutation attempts: none;
- remote branch matched the source commit before evidence recording;
- GitHub Actions run `33152262870`: success.

## Proof boundary

The A4 harness uses synthetic in-memory SquareCoil fixture HTML and intercepted read-only action-7 responses. It proves packaged extension behavior and absence of native mutation attempts for those cases. It does not publish a release, mutate live SquareCoil business data, or authorize B6 promotion.
