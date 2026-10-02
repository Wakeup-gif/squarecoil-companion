# v0.7.7 prototype tracking repair — test only

Branch: `fix/clock-detection-custom-dark-logo`. Previous delivered package/evidence commit: `d972fc5b5d1a26bc5acf06ccf21a93416ab4fb78` (v0.7.6). This report describes synthetic reproductions and targeted repairs. Actual user-profile startup, migration and live time tracking have not been accepted.

## Exact prototype inspected

The supplied v1.1.4 wrapper only changes the minimize/reopen CSS. Its pinned dependencies were downloaded and inspected rather than treating that wrapper as the timer implementation:

| Source | Exact Git source | SHA-256 |
|---|---|---|
| `Wakeup-gif/test_repo/tampermonkey/SquareCoil-Job-Timer-v1.1.2.user.js` | `6b8c3b7d8a0c9f40ae35a0e8fdd8e881e2925a22` | `2f1ee6b2a498e790c7352b50a4c75bd201541c65779ddecbf4425475f9c23a42` |
| `Wakeup-gif/test_repo/tampermonkey/SquareCoil-Job-Timer-v1.1.3.user.js` | `5740c14d47f9fc7aae9fee541c915ddbf97c60e6` | `6eefa09570fbbac77eb245b2a9f16d94917a9fd0e53fdc553f7a187afa562768` |

The first file is byte-identical to preserved `page/timer-runtime.js`; it contains tracking. v1.1.3 and the supplied v1.1.4 wrapper are CSS refinements. No immutable v1.1.4 wrapper commit was supplied, so none is inferred.

The prototype immediately loads its own localStorage state, calls `syncDom('initial-dom')`, and reads action 7 after 800 ms. It owns its local timer directly. The extension must first establish current exclusive OWNER authority and successfully import saved history atomically; only then can it attach the read-only Bridge and send validated observations to the authoritative Timer. An extension coordination OWNER is not proof of SquareCoil login. Both implementations use the same tenant action-7 endpoint, POST, same-origin cookies, form encoding and X-Requested-With header. No alternate credentials or permission changes were introduced.

Prototype `makeContext` uses the full-label ASCII slug (40-character limit), so project-zero Meeting is `general:meeting`. The old parser's invented `-general` suffix split that history from resumed tracking. The prototype also preserves raw padded numeric IDs; extension migration, href parsing and label parsing must instead agree on the already-established canonical positive numeric ID. The prototype's broader arbitrary-label inference is not restored: the extension retains audited clock scope and safe General eligibility.

## Demonstrated divergences and narrow changes

- **General validator:** the historical Timer rejected every General except Production although the Bridge accepted Design (General). Real Bridge → authority/router/client → Timer tests reproduce the rejection. The Timer now reuses the parser's supported project-zero rule and requires the exact derived identity, General key and project-zero metadata. Empty/control labels, forged keys, conflicting projects and invalid IDs still reject atomically.
- **Padded rediscovery:** label-only `001234 - Job` previously emitted `job:001234`, unlike canonical href `job:1234`. Label normalization now uses the same digit-only positive string rule. Real composition rediscovers the same imported padded job, uses remembered Pending/Resume, and verifies padded-link/label/DOM agreement. All-zero IDs remain invalid and conflicting labels do not become guessed aliases.
- **General history:** a fixture invokes the actual preserved prototype `makeContext` for bare Meeting, imports its saved hour and verifies rediscovery selects that same Context as Pending. Resume adds fresh finalized time to that history instead of opening a new `general:meeting-general` Context. The old full-label slug is retained; bare Design and Design (General) remain distinct producer identities.
- **Rejected queue head:** the old queue retries a rejected head before fetching action 7, preventing later valid evidence. Composed tests inject the exact historical General rejection or padded wire identity at their validation boundary and reproduce the obstruction. Only an explicit authority negative acknowledgment carrying `timer-observation-general-identity-invalid` or `timer-observation-job-identity-invalid` retires that one positive event. Its never-committed Context cannot remain the next observation's prior Context. Counters, native candidates and other pending transitions are preserved. Genuine persistence/transport/fencing failures remain queued with their original positive timestamps; `retryable:false` alone never permits dropping them. An existing Active job survives rejection and finalizes only through its last verified time across a long gap. A two-event native leave/enter batch preserves the already committed leave and never reuses the rejected enter boundary.
- **Login recovery:** real composition verifies HTTP 401 and a full login document with plausible clock content cannot create Active/Pending or accrue time. Current extension OWNER and completed migration remain distinct from native login. A later valid clock fragment starts exactly one fresh session and finalizes only its two new seconds. No credentials or authentication heuristics change.
- **Delayed callback safety:** teardown during an authoritative read, after a committed import with held reply, and across queued settlement cannot dispatch new work or revive a disposed core/Bridge. An already committed import survives and a fresh core imports it zero additional times. Disconnected clients cannot attach an OWNER Bridge. Actual ownership loss retains a genuine unchanged-source migration failure; changed source bytes clear that stale failure and a later OWNER retry imports once.
- **Migration safety:** contradictory numeric aliases now reject regardless of padding. A finalized session ID only deduplicates verified Active recovery when that finalized interval covers the same start and every verified millisecond. Conflicting, partial or undated evidence remains an atomic failure instead of moving or losing saved time.

No retained source bytes are written, removed or normalized in storage. Existing saved ledger prefixes and totals remain intact in every successful composed journey. Native clock transport remains observational action 7 only. Existing clock parsing and custom US Sign dark-logo regressions remain required; no logo redesign was needed.

## Checks completed

Node v22.22.0. Targeted parser/migration/Bridge/core/General cluster passed 107 cases before the final two adjacent regressions; the final General/login file passed 8/8 and rejected-event recovery passed 5/5. Independent read-only review found no remaining concrete defect and reran 39 cases successfully.

`npm run check:b6-candidate` passed **763 automated executions**, zero failures, cancellations, skips or todos. This includes all B1–B5 unit/integration suites, 16 prototype executions, authoritative theme-port freshness, build and B6 validation. `git diff --check` passed. Detailed current-run log: `/workspace/artifacts/squarecoil-v0.7.7/check-b6-candidate.log`; counts: `automated-summary.json`. Intentional pre-repair red runs captured General, padded/Meeting, migration identity, teardown and poisoned-head failures; they are reproduction evidence, not remaining failures.

## Reproduction and evidence boundaries

New stable composed proofs: `IT-B2-GENERAL-001/002/003/004/005/006/007`, `IT-B2-LOGIN-001`, `IT-B2-BRIDGE-REJECT-001/002/003/004/005`, `IT-B2-MIG-DISPOSE-001/002/003`, `IT-B2-MIG-SYNC-004`, and `IT-B2-MIG-IDENTITY-001`. Migration/parser unit proofs also cover invalid-input rejection and the original producer's exact slug.

These use the real kernel, router, client, trusted core, Bridge and Timer with fictional storage, page and transport. Historical rejection injection and read-only historical parser substitution reproduce the prior validator/label behavior; they do not execute or inspect the user's browser. Fixture source-byte equality and saved-hour assertions prove preservation for those fixture shapes, not acceptance of every possible live retained record.

Branded Chrome/Edge are unavailable. Supplemental Chromium unpacked loading was rejected by administrator policy in the previous candidate attempt; that unchanged policy is respected. Installed clean/upgrade acceptance, the user's actual migration, active-job detection and wall-clock accrual remain unverified. No main merge, deployment, stable release, credential change, permission change or policy bypass occurred.

## Exact test package

Clean implementation source: `52d5f6b68ddb956fa167a450f067b09710baa9f0`.
Version: `0.7.7`; version name: `0.7.7 Prototype Tracking Repair TEST`; channel: `test`.
Candidate fingerprint: `9a7575d2a3d0d854567230cc6a71382dd4590579889d90eb634d9beadf006b5f`.
Canonical inventory: **16 files**; embedded `sourceDirty: false`.
Chrome and Edge ZIP SHA-256: `d6ffa02f498f91b7d61b75e6729c1ec4e624066e214a53479bbea75c2263d5e9`; each **397,860 bytes**.

The clean-source package and both independently extracted ZIPs pass exact-source/package validation. Every extracted file matches its canonical packaged byte content and ZIP integrity checks pass. Test artifacts: `packages/test-builds/v0.7.7/SquareCoil-Companion-v0.7.7-TEST-CHROME.zip` and `SquareCoil-Companion-v0.7.7-TEST-EDGE.zip`. Detailed validation JSON and roundtrip proof: `/workspace/artifacts/squarecoil-v0.7.7/`.

The following artifact/evidence commit records these package bytes without changing packaged inputs. Its GitHub download paths will be checked against this ZIP hash before reporting a verified link. The implementation source SHA above remains the SHA embedded in the package.

## Next live check

Use the new TEST package in the existing extension folder, Reload the same extension, and refresh SquareCoil. Preserve its extension identity and data; do not uninstall or clear storage. Confirm current clock Context, verify that a previously remembered Context offers Resume, then inspect finalized History. If Limited remains, provide Copy diagnostics with Core authority, Migration, Migration error and Bridge so the next repair follows the actual remaining cause.
