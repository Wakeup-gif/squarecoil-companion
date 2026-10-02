# B2.1 Fenced Authority Kernel Acceptance Evidence

**Slice result:** `COMPLETE / PASS`

**Full B2 status:** `NOT_SETTLED`

**Browser acceptance:** `COMPLETE / PASS`

**Browser-tested implementation commit:** `afba339c401b77aa74e6be5bde90add8ac9e8098`

**Scope:** B2.1 fenced authoritative kernel only

This record closes the authorized B2.1 foundation against one clean source
commit and one exact immutable package. It does not approve the remaining B2
Bridge, Timer, observation, migration-trigger, UI, production, merge, or
release work.

## Gate results

| Gate | Evidence status | Executed result | Result |
|---|---|---|---|
| B2.1 A1 static/package | `COMPLETE` | `PASS` | Exact eight-file package validated; generated JavaScript, manifest references, build identity, source cleanliness, candidate embedding, and allowlist passed. |
| B2.1 A2 unit | `COMPLETE` | `PASS` | 77 B1 plus 79 B2 unit tests passed; 0 failed, skipped, cancelled, or todo. |
| B2.1 A3 integration | `COMPLETE` | `PASS` | 38 B1 plus 24 B2 integration tests passed; 0 failed, skipped, cancelled, or todo. |
| B2.1 A4 Chrome | `COMPLETE` | `PASS` | 16 of 16 exact-package cases passed, including `B2-KERNEL-001` and `B2-KERNEL-002`. |
| B2.1 A4 Edge parity | `COMPLETE` | `PASS` | 16 of 16 exact-package cases passed, including `B2-KERNEL-001` and `B2-KERNEL-002`. |

The combined automated result was 218 of 218 tests. Static validation confirmed
103 B2.1 stable IDs, 11 B1 A2 mappings, 16 B1 A3 IDs, 17 B1 A4 IDs, and two
B2.1 A4 IDs, with no skipped, todo, or focused required fixtures.

## Exact browser-tested package

Chrome and Edge loaded the same extracted package. The harness independently
inventoried that directory and the ZIP, proved their file bytes matched before
execution, and proved neither changed during execution.

| Field | Verified value |
|---|---|
| Package version | `0.7.1` |
| Build ID / stage | `rebuild-b2-fenced-authoritative-kernel` / `B2.1` |
| Source commit | `afba339c401b77aa74e6be5bde90add8ac9e8098` |
| Source dirty | `false` |
| Candidate fingerprint | `3d01a6c449a192528dc4803ef3d26a738d39a356b7ebd4212531b001cab9d14b` |
| Canonical archive | `SquareCoil-Companion-v0.7.1-B2-KERNEL.zip` |
| Archive SHA-256 | `bf7ec0497c2e0b920781f1e40a6e02b1b64979eb629a146afdbe3249b6a4071a` |
| Archive size | 64,077 bytes |
| Extracted inventory digest | `5d8796a92dd981a4a2995f46181d596b57ce380d38f55b29cbf2bb5a9d192585` |
| Package file count | 8 exact allowlisted files |
| Package validation evidence SHA-256 | `e6c50e408c75c2ebb99a86ea5bf235b466f1f584721837593a32494ceab5619c` |
| A4 browser evidence SHA-256 | `28e7cd82b276360403bb695321191ebfccbcb3293974fa8b6cfd73d276a4afa5` |
| Package mutation during A4 | None; archive and extracted inventory hashes were unchanged |

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

The candidate fingerprint appeared exactly once in each runtime ownership
bundle: `dist/background.js`, `dist/companion-app.js`, and
`dist/content-controller.js`.

## Branded browser evidence

The acceptance run executed from `2026-08-26T20:14:08.044Z` through
`2026-08-26T20:14:25.998Z` on Windows x64 `10.0.26200`, Node `v24.14.0`, and
Playwright `1.62.1`. It used synthetic in-memory SquareCoil fixture pages and
did not contact SquareCoil or use customer data.

| Browser | Product version | Executable SHA-256 | Cases | Evidence health |
|---|---|---|---|---|
| Google Chrome | `151.0.7922.174` | `b6d40f55e48e61760335d18f46abcec929e1a11b8330e7f2b501037584af4aa4` | 16/16 PASS | 0 unexpected network requests; 0 console errors; 0 page errors; no cleanup warning |
| Microsoft Edge | `151.0.4129.107` | `1c43c32ab3d8442171fafa7614015dd5b6977e60f8fa22e63f0c30f0b1e6ccf8` | 16/16 PASS | 0 unexpected network requests; 0 console errors; 0 page errors; no cleanup warning |

`B2-KERNEL-001` proved that two installed-extension tabs shared one worker and
one authoritative document revision while receiving one `OWNER` and one
`OBSERVER_CONNECTED`. Observer teardown removed only the observer session, the
owner remained healthy, and the lifecycle never falsely reported `READY`.

`B2-KERNEL-002` observed the service-worker target disappear and reappear,
observed a new concrete packaged worker identity, and then observed autonomous
scheduled-heartbeat reconnection. The page Runtime Instance ID, `OWNER`
disposition, coordination epoch, authoritative revision, and canonical
persisted-document SHA-256 remained unchanged. Browser-internal target IDs were
retained as non-gating evidence because both branded browsers may reuse that
DevTools host across a verified worker stop and start.

## Repair audit

The first browser run exposed a real reconnect-health race: after the restarted
worker rejected the old session, the client temporarily cleared its session and
worker identity while still reporting healthy. The repair now publishes an
unhealthy `UNAVAILABLE` state before replacement `CONNECT`, and the deterministic
integration fixture holds that replacement response to prove the transition.

The next run proved the source repair but exposed an invalid harness assumption
that a browser-internal target ID must change. The final fixture instead gates
on observed target absence/reappearance and the packaged worker identity change.
Both superseded runs remain failed historical evidence and are not acceptance
artifacts.

## Git and protected boundaries

Immediately before this evidence-only update:

- production `main` remained `9378da24f393b40066816133e7fa0f48063115f0`;
- planning remained `42057ae7894a0f0051212a60cf764688a566b7d8`;
- settled B1 remained `c59b88fad941003507954e9cba66214c360ea368`;
- the new B2.1 remote branch did not yet exist;
- the quarantined earlier B2 draft remained separate and untouched.

The commit containing this record is documentation-only evidence, so its SHA
cannot be embedded in itself. Verify that the live B2.1 branch head descends
from the browser-tested implementation commit and changes only these evidence
documents after that commit. A GitHub workflow result is supporting A1-A3
evidence only and cannot replace the exact Windows Chrome/Edge package above.

## Proof limits and next gate

The production path still does not invoke legacy migration, observe SquareCoil,
execute Timer transitions, accrue time, submit B2 UI commands, or render the B2
read model. The runtime therefore truthfully remains:

```text
DEGRADED / coordination-not-implemented-b1
```

Full B2 remains `NOT_SETTLED`. Production `main`, planning, settled B1, manifest
permissions, the quarantined draft, release state, and deployment state were not
changed. The exact next authorization is `REVIEW B2.2` for a read-only review of
the trusted Bridge and Timer-service boundary.
