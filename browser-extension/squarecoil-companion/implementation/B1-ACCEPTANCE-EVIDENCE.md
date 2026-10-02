# B1 Acceptance Evidence

**Stage result:** `SETTLED`

**Browser acceptance:** `COMPLETE / PASS`

**Tested implementation commit:** `f2d1769ddbe2b6966411fee3764a09b904dfe6ff`

**Scope:** B1 Shell / Lifecycle only

This record closes the controlled B1 repair against one clean implementation
commit and one exact package. It does not approve B2 behavior, production
promotion, a browser-store release, or any rebuilt package bytes.

## Gate results

| Gate | Evidence status | Executed result | Result |
|---|---|---|---|
| `GATE-B1-A1` static/package | `COMPLETE` | `PASS` | Exact eight-file package validated; JavaScript syntax, manifest, identity, source cleanliness, allowlist, and Chrome/Edge byte parity passed. |
| `GATE-B1-A2` unit | `COMPLETE` | `PASS` | 77 passed; 0 failed, skipped, cancelled, or todo. |
| `GATE-B1-A3` integration | `COMPLETE` | `PASS` | 38 passed; 0 failed, skipped, cancelled, or todo. Generated runtime bundles were exercised. |
| `GATE-B1-A4-CH` Chrome | `COMPLETE` | `PASS` | 15 of 15 packaged lifecycle cases passed. |
| `GATE-B1-A4-ED` Edge parity | `COMPLETE` | `PASS` | 15 of 15 packaged lifecycle cases passed. |

Static validation also confirmed 11 A2 mappings, 16 A3 IDs, and 17 A4 IDs,
with no skipped, todo, or focused required fixtures.

## Exact browser-tested package

The Chrome and Edge runs loaded the same package directory. The harness proved
that directory's exact inventory matched the canonical ZIP, and the separately
validated browser-specific ZIP copies were byte-for-byte copies of that
archive.

| Field | Verified value |
|---|---|
| Package version | `0.7.1` |
| Build ID / stage | `rebuild-b1-shell-lifecycle` / `B1` |
| Source commit | `f2d1769ddbe2b6966411fee3764a09b904dfe6ff` |
| Source dirty | `false` |
| Candidate fingerprint | `6cc14e28a1c9930be94af9782af9b23b5a246ccfd19bf69de8d1a0b12a824e3e` |
| Canonical archive | `SquareCoil-Companion-v0.7.1-B1.zip` |
| Archive SHA-256 | `ade889c43b78d73a14421ecda5715624774bbf44a6e09855680c1b09c6a34f1e` |
| Extracted inventory digest | `826ddbe08a5f59aeed6272789163b7dd9099378840de3740b62b21d0b58a2ae7` |
| Package file count | 8 exact allowlisted files |
| Package mutation during A4 | None; archive and extracted inventory hashes were unchanged after both browsers |

The candidate fingerprint appeared exactly once in each runtime ownership
bundle: `dist/background.js`, `dist/companion-app.js`, and
`dist/content-controller.js`.

The exact inventory was:

```text
manifest.json
dist/background.js
dist/build-info.json
dist/companion-app.js
dist/content-controller.js
dist/popup.js
popup/popup.html
popup/popup.css
```

## Branded browser evidence

The A4 harness used synthetic in-memory SquareCoil fixture pages. It did not
contact SquareCoil or use customer data.

The acceptance run executed from `2026-08-26T17:01:41.039Z` through
`2026-08-26T17:01:48.155Z` on Windows x64 `10.0.26200`, Node `v24.14.0`, and
Playwright `1.62.1`. The evidence JSON SHA-256 was
`7c1b09c28e1c91da3ceb55615c5bc75dad8406a1dfec0335cdfb0e855d2a4d71`.

| Browser | Product version | Executable SHA-256 | Cases | Errors |
|---|---|---|---|---|
| Google Chrome | `151.0.7922.174` | `b6d40f55e48e61760335d18f46abcec929e1a11b8330e7f2b501037584af4aa4` | 15/15 PASS | 0 unexpected network requests; 0 console errors; 0 page errors |
| Microsoft Edge | `151.0.4129.107` | `1c43c32ab3d8442171fafa7614015dd5b6977e60f8fa22e63f0c30f0b1e6ccf8` | 15/15 PASS | 0 unexpected network requests; 0 console errors; 0 page errors |

Together, the two browser runs proved the applicable stable B1 lifecycle
requirements `B1-LC-001` through `B1-LC-010` and `B1-LC-012` through
`B1-LC-018`. Chrome covered `B1-LC-017`, Edge covered its parity-specific
`B1-LC-018`, and both covered the shared rows through `B1-LC-016`.
`B1-LC-011` is the persistence-concurrency case and is intentionally proved at
A2/A3 rather than A4.

The browser cases covered package identity, observation-only disabled boot,
strict orphan handling, legacy and malformed runtime exclusion, build/package/
candidate mismatch fencing, concurrent boot, truthful B1 degraded state,
dead-interaction and removed-root recovery, unsupported documents and iframes,
service-worker restart, real BFCache restoration, clean disable/re-enable,
stale-response fencing, and sticky failed cleanup followed by explicit
cleanup-only retry.

## Verified GitHub handoff

GitHub Actions run
[`32992114188`](https://github.com/Wakeup-gif/test_repo/actions/runs/32992114188)
completed with `success` on attempt 1 for the exact implementation commit
`f2d1769ddbe2b6966411fee3764a09b904dfe6ff`. Every `validate-b1` step passed,
including A1-A3, generated-JavaScript syntax, package validation, byte-identical
Chrome/Edge archive creation, and all three artifact uploads.

The successful job was
[`validate-b1`](https://github.com/Wakeup-gif/test_repo/actions/runs/32992114188/job/98251956664).
The uploaded artifact IDs were `9615007360` (Chrome), `9615008061` (Edge), and
`9615008734` (package evidence); all were present and unexpired when this record
was prepared.

The workflow generated a separate Linux package with candidate fingerprint
`de7c9ae1890cd4f3a33526caa94f2092191892276d0d19dda83fb5998be10bdd`,
inventory digest
`d8e69e17e0b3550e8095e3ad8ca86f565c0aaca7dcce459300de905533f41789`,
and Chrome/Edge archive SHA-256
`7e484e377d68e6f6d074da96c64f5a81d8dbaf53ab6c011d534ba6ac318a9adf`.
That workflow package passed A1 but was not used for A4. It must not be cited or
promoted as the browser-tested archive. CI success is supporting A1-A3 evidence,
not a substitute for the exact-byte Chrome and Edge results above.

## Git and quarantine boundary

Immediately before this evidence-only attestation:

- remote B1 implementation head was
  `f2d1769ddbe2b6966411fee3764a09b904dfe6ff`;
- production `main` remained
  `9378da24f393b40066816133e7fa0f48063115f0`;
- planning remained
  `42057ae7894a0f0051212a60cf764688a566b7d8`;
- the local B2 branch still pointed to the pre-repair B1 baseline
  `c0afb241d91141ed818d9395ac14257207ad59ed`;
- its 24 untracked B2 draft files remained quarantined and untouched.

The commit containing this record is documentation-only evidence. Its Git SHA
cannot be embedded in itself; verify the live B1 remote head and confirm its diff
from the tested implementation commit contains only the B1 implementation
evidence files before relying on the handoff.

The protected planning branch still describes B1 as ready for repair because it
is the immutable pre-repair contract checkpoint. For execution status, this
verified B1 acceptance record is newer; planning remains the behavior-contract
authority.

## Proof limits and next gate

This is a synthetic `PROFILE-CLEAN` B1 lifecycle acceptance result. It does not
prove authenticated production-site behavior, v0.7 upgrade/migration behavior,
Timer State, Time Ledger, SquareCoil Bridge semantics, writer coordination,
later workspace/data/settings stages, or release readiness. The real B1 runtime
correctly remains:

```text
DEGRADED / coordination-not-implemented-b1
```

B2 remains `BLOCKED / UNAPPROVED-DRAFT` until the user gives the exact next
authorization `REVIEW B2`. That authorization is read-only; implementation still
requires a separately reviewed slice and exact `START B2`.
