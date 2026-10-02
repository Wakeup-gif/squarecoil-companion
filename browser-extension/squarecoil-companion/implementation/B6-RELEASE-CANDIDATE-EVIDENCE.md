# B6 Full Acceptance / Candidate Packaging Evidence

Status: **accepted — candidate ready, not promoted**
Branch: `codex/squarecoil-b2c-migration`
Owning contract: `logic/L8-ACCEPTANCE-HANDOFF.md`

The earlier `a6b4eb55ef4ea411c92430ef11440e5ab6d00729` run was superseded when the separately authorized B5-C theme delta reached the branch. This final evidence replaces that rehearsal and binds B6 to the exact post-B5-C source below.

## Requirements-to-evidence matrix

| Requirement | Primary implementation | Automated evidence | Installed-browser evidence |
|---|---|---|---|
| One exact clean source produces one allowlisted package and immutable ZIP | `scripts/build.js`, `scripts/candidate-identity.js`, `scripts/validate-package.js`, B1 A4 harness | `npm run check:b6-candidate`; clean source identity, embedded fingerprint, allowlist, ZIP root, and byte-stability checks | `B6-CANDIDATE-001` in Chrome and Edge |
| Every accepted B1-B5-C behavior remains green | aggregate tests, validator, and installed-browser harness | 482 aggregate unit/integration tests plus 13 prototype tests | `PROFILE-CLEAN`: 27/27 in each browser, including all `B5C-THEME-*` fixtures |
| Fresh installation has no inherited authority/runtime state | B1 lifecycle boot and B6 profile harness | stable B1-B5-C regression inventory | `B6-PROFILE-001`; `PROFILE-CLEAN` in Chrome and Edge |
| v0.7 upgrade is fenced, idempotent, and preserves retained evidence and settings | migration, Preferences adoption, settlement, upgrade harness | migration/Preferences/READY fixtures in the aggregate gate | `B6-PROFILE-002`; `PROFILE-UPGRADE-V07`: 2/2 in each browser |
| READY requires lifecycle health, current OWNER authority, complete migration, aligned trusted core, and usable Bridge evidence | lifecycle, authority kernel, migration, trusted core, Bridge, popup health | inherited B2 settlement/tenure/race fixtures plus B6 validation | clean and upgrade cases prove fail-closed degradation, genuine READY, revalidation degradation, and valid resettlement |
| Chrome and Edge exercise the same bytes without native mutation | shared MV3 package and installed-browser harness | exact fingerprint and inventory checks | same ZIP SHA-256 before/after; zero native mutation attempts |
| Candidate preparation does not promote or publish | workflow/package labels and handoff boundary | `release.json` is not advanced | no `main` merge, store submission, release publication, rollout, or live SquareCoil mutation |

## Automated gate

`npm run check:b6-candidate` and the equivalent B5-C aggregate gate passed from exact clean source `aeac7fe52a2e723106340bc6d283d2eb49521573`:

- 482 aggregate unit/integration tests: 90 B1 unit, 168 B2 unit, 29 B3 unit, 28 B4 unit, 77 B5 unit, 38 B1 integration, 42 B2 integration, 2 B3 integration, 4 B4 integration, and 4 B5 integration;
- the separate 13-test prototype-compatibility suite;
- JavaScript parse, manifest, package allowlist, candidate identity, static validation, and earlier-stage regression checks;
- 222 B2, 31 B3, 32 B4, 81 B5, 4 B5-C A4, and 3 B6 A4 stable fixture IDs.

`node --check tests/b1-browser/run.js` and `git diff --check` also passed.

## Exact candidate identity

- source commit: `aeac7fe52a2e723106340bc6d283d2eb49521573`;
- package version: `0.7.1`;
- build ID/stage: `rebuild-b6-release-candidate` / `B6`;
- `sourceDirty: false` and `acceptanceEligible: true`;
- candidate fingerprint: `9c77b1afacc36d4118d6d5162f330189ceeda0d0a5bdf4ccc0183775d00eab94`;
- tested archive bytes: `212589`;
- tested archive SHA-256 before/after: `429668d61b2e7f249bc325653fac48bb15694173e7c206cbbff31cc6061df425`;
- package/extracted ZIP inventory digest: `455b839f96b77402676433d36c6e79c4496702a7168a38618602195a1bfa63fd`;
- A4 full-matrix evidence SHA-256: `1e33c95c813f50cc94a1daa105526f4ed235dcff1fee55548e8cb45c2b541e49`;
- exact package inventory: 8/8 allowlisted files;
- archive and extracted package remained unchanged across every Chrome and Edge profile.

The browser run used the working filename `SquareCoil-Companion-v0.7.1-B5C-EXACT.zip`. A canonical local B6 filename may be retained only as a byte-identical copy with the SHA-256 above; the name does not substitute for the recorded bytes.

## Exact package inventory

| File | Bytes | SHA-256 |
|---|---:|---|
| `dist/background.js` | 376326 | `45a6d5d76c226f86e62be0c94237fa4ef942c6a18f421dbdfcfdd785650e93bd` |
| `dist/build-info.json` | 271 | `d6cc399befda0f356934aa1d9c3fbdeb6e34b20162e774ad2b2dfce2530cb82d` |
| `dist/companion-app.js` | 56735 | `23608d6a3006a424792702c8b412433b7e8a79b69288cf633112a1e7bed23e31` |
| `dist/content-controller.js` | 557088 | `0eb846cd3b94a932fa1645f54f4cb94504fef2c3c8ca8edeaa58fb6db6e93fc8` |
| `dist/popup.js` | 7223 | `33f4dac6568da5541f7ae679b5846c92b7b027c2ce37984c05beb9e168587a29` |
| `manifest.json` | 907 | `4c7590c54554187fff34b64475e6a93aea3a49643de2248ecef8d3013b64271e` |
| `popup/popup.css` | 1951 | `9b7faf1815c853bf53df35df49790d0f496701bc3d8a3df77aabf4f2f5731000` |
| `popup/popup.html` | 1629 | `2c460ad11eb1ae16fae556b543f5af5b6afeb6e1217e19f069a20212d4c8c52c` |

## Installed Chrome and Edge result

The acceptance-eligible A4 run started `2026-08-28T15:41:55.256Z` and finished `2026-08-28T15:48:18.579Z` on Windows x64 with Node `v24.14.0` and Playwright `1.62.1`.

| Browser | Installed identity | Executable SHA-256 | Clean profile | v0.7 upgrade profile |
|---|---|---|---:|---:|
| Google Chrome | `Chrome/151.0.7922.174` | `b6d40f55e48e61760335d18f46abcec929e1a11b8330e7f2b501037584af4aa4` | PASS 27/27 | PASS 2/2 |
| Microsoft Edge | `Edg/151.0.4129.107` | `1c43c32ab3d8442171fafa7614015dd5b6977e60f8fa22e63f0c30f0b1e6ccf8` | PASS 27/27 | PASS 2/2 |

Both browsers observed `B6-CANDIDATE-001`, `B6-PROFILE-001`, `B6-PROFILE-002`, and all four `B5C-THEME-*` fixtures. Across both profiles and browsers there were zero failures, unsupported cases, unexpected network requests, console/page errors, cleanup warnings, or native SquareCoil mutation attempts.

The upgrade cases preserved the retained v0.7 source, imported the synthetic ledger exactly once, adopted bounded nested legacy settings, and kept optional presentation off. READY remained fail closed until current OWNER authority, complete migration, trusted-core alignment, and full Bridge observation agreed. Revalidation degraded fail closed and a new valid settlement restored READY.

## CI evidence

GitHub Actions run [`33185826761`](https://github.com/Wakeup-gif/test_repo/actions/runs/33185826761) completed successfully for exact source `aeac7fe52a2e723106340bc6d283d2eb49521573`.

It produced these time-limited workflow artifacts:

- `squarecoil-companion-b6-release-candidate-chrome` — artifact `9691633371`;
- `squarecoil-companion-b6-release-candidate-edge` — artifact `9691633758`;
- `squarecoil-companion-b6-release-candidate-package-evidence` — artifact `9691634112`.

## Proof and authorization boundary

Installed-browser acceptance uses synthetic in-memory SquareCoil pages and intercepted read-only action-7 responses. It proves the exact packaged behavior, lifecycle/settlement gates, migration compatibility, B5-C theme adapters, and absence of native mutation attempts for the tested fixtures. It does not claim a live SquareCoil business action, production traffic, or store environment was exercised.

The real Chrome/Edge optional-host permission prompt for Bing was not accepted by automation. Its API grant/denial/acknowledgment behavior remains covered at the unit boundary; installed-browser acceptance proves default no-access, zero Bing requests, safe fallback, and teardown paths.

B6 candidate acceptance does **not** authorize or perform a merge to `main`, production promotion, release/store publication, rollout, B5-D, or any new live SquareCoil mutation. Those remain separate explicit decisions.
