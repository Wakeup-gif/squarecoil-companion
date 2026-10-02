# B2.2 Trusted Transition Core Acceptance Evidence

**Slice result:** `COMPLETE / PASS`

**Full B2 status:** `NOT_SETTLED`

**Browser acceptance:** `COMPLETE / PASS`

**Browser-tested implementation commit:** `1a8c2fa7a1e8a2f7e69c632f9c9894fd16c4fc9a`

**Scope:** B2.2 read-only SquareCoil Bridge to fenced Timer/Ledger transition core

This record closes only the authorized B2.2 slice against one clean source
commit and one exact immutable package. It does not approve legacy migration
invocation, a MAIN-world native mutation-completion hook, positive lifecycle
`READY`, later B2 behavior, production, merge, deployment, or release work.

## Gate results

| Gate | Evidence status | Executed result | Result |
|---|---|---|---|
| B2.2 A1 static/package | `COMPLETE` | `PASS` | Exact eight-file package validated; source cleanliness, generated JavaScript, manifest policy, build identity, candidate embedding, and allowlist passed. |
| B2.2 A2 unit | `COMPLETE` | `PASS` | 77 B1 plus 128 B2 unit tests passed; 0 failed, skipped, cancelled, or todo. |
| B2.2 A3 integration | `COMPLETE` | `PASS` | 38 B1 plus 28 B2 integration tests passed; 0 failed, skipped, cancelled, or todo. |
| B2.2 A4 Chrome | `COMPLETE` | `PASS` | 19 of 19 exact-package cases passed, including all five `B2-TRANSITION` fixtures. |
| B2.2 A4 Edge parity | `COMPLETE` | `PASS` | 19 of 19 exact-package cases passed, including all five `B2-TRANSITION` fixtures. |

The combined non-browser automated result was 271 of 271 tests. Static
validation confirmed 156 stable B2 IDs, 11 B1 A2 mappings, 16 B1 A3 IDs, 17
B1 A4 IDs, two B2.1 A4 IDs, and five B2.2 A4 IDs, with no skipped, todo, or
focused required fixtures.

## Implemented boundary

- the isolated-world Bridge reads only the audited clock DOM and exact
  `POST /ajax_time_clock.php` body `action=7`;
- the Bridge parser and state engine emit ordered semantic observations without
  owning Timer or Ledger state;
- one fenced worker command dispatcher binds requester and writer identity and
  routes Timer mutations through the B2.1 authoritative transaction;
- the Timer service owns Active, Pending, Local Pause, job-switch, disable,
  controlled teardown, and interruption-recovery transitions;
- public read models redact fencing credentials while preserving enough proof
  for validated totals;
- OWNER performs Bridge verification, OBSERVER remains passive and consumes the
  same authoritative revision;
- legacy storage presence blocks Bridge and Timer writes without returning the
  stored values or invoking migration.

The packaged isolated content bundle contains no migration executor, MAIN-world
AJAX completion hook, native SquareCoil action 2/3/4 request, or legacy storage
write. The MAIN bundle contains no authority, Bridge, or Timer writer.

## Exact browser-tested package

Chrome and Edge loaded the same extracted package. The harness independently
inventoried that directory and the ZIP, proved their bytes matched before
execution, and proved neither changed during execution.

| Field | Verified value |
|---|---|
| Package version | `0.7.1` |
| Build ID / stage | `rebuild-b2-trusted-transition-core` / `B2.2` |
| Source commit | `1a8c2fa7a1e8a2f7e69c632f9c9894fd16c4fc9a` |
| Source dirty | `false` |
| Candidate fingerprint | `099be61581c53781f734e93ecd4fa34365444d01b67c85f6ed461e04234e32f1` |
| Canonical archive | `SquareCoil-Companion-v0.7.1-B2.2-TRUSTED-TRANSITION.zip` |
| Archive SHA-256 | `fe9e69c0dce986174e2e507e3062c37fb4f9891fe54ee094e9fb13e6998706c2` |
| Archive size | 99,258 bytes |
| Extracted inventory digest | `7d00f8544093151efb545ae9a697d66609f1dd044398061a715f139d6eebbcea` |
| Package file count | 8 exact allowlisted files |
| Package validation evidence SHA-256 | `771dd90661c15553e6f74506a3ac6f5b3d787e229fdb0f4dbe84644684c42a81` |
| A4 browser evidence SHA-256 | `d02c80ca52a3ac603e8ed444f25b3e3d5bb4ba9efd671af7be33ed42f88aa60f` |
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

The acceptance run executed from `2026-08-27T01:43:28.135Z` through
`2026-08-27T01:43:46.435Z` on Windows x64 `10.0.26200`, Node `v24.14.0`, and
Playwright `1.62.1`. It used synthetic in-memory SquareCoil fixtures and did
not contact SquareCoil or load customer data.

| Browser | Product version | Executable SHA-256 | Cases | Evidence health |
|---|---|---|---|---|
| Google Chrome | `151.0.7922.174` | `b6d40f55e48e61760335d18f46abcec929e1a11b8330e7f2b501037584af4aa4` | 19/19 PASS | 5 exact action 7 requests; 0 native mutation attempts; 0 unexpected network requests; 0 console/page errors |
| Microsoft Edge | `151.0.4129.107` | `1c43c32ab3d8442171fafa7614015dd5b6977e60f8fa22e63f0c30f0b1e6ccf8` | 19/19 PASS | 4 exact action 7 requests; 0 native mutation attempts; 0 unexpected network requests; 0 console/page errors |

The five B2.2 fixtures prove exact action 7 transport and authoritative Timer
derivation, passive OBSERVER behavior, one-revision Job A to Job B switching
with one closed Ledger segment, exactly-once disable finalization, and legacy
fail-closed behavior. Both browsers also retained the B1 lifecycle suite and
B2.1 worker authority/restart gates without falsely reporting `READY`.

## Repair audit

Dirty development runs exposed three test-harness assumptions: synthetic
ownership probes could leave remembered Timer history, B2.2 post-restart writes
could race the older stable-revision assertion, and an observer snapshot could
be sampled before its Bridge was initialized. The final harness isolates the
canonical behavioral sequence, waits for authority/persistence convergence,
and requires initialized OWNER and OBSERVER Bridges. Those development runs
were explicitly non-acceptance evidence; the clean commit-based package then
passed both branded browsers.

## Git and protected boundaries

Immediately before the implementation commit and push:

- production `main` remained `9378da24f393b40066816133e7fa0f48063115f0`;
- planning remained `42057ae7894a0f0051212a60cf764688a566b7d8`;
- settled B1 remained `c59b88fad941003507954e9cba66214c360ea368`;
- accepted B2.1 remained `5f6a724f3965369f35d77c9735686baebaf970ba`;
- the new B2.2 branch did not yet exist remotely;
- the quarantined earlier B2 draft remained separate and untouched.

The implementation commit was pushed only to
`rebuild/squarecoil-companion-b2-trusted-transition-core` and read back as
`1a8c2fa7a1e8a2f7e69c632f9c9894fd16c4fc9a`. The commit containing this record
is documentation-only evidence, so its SHA cannot be embedded in itself.

## Proof limits and next gate

B2.2 remains a partial B2 slice. The production path does not invoke legacy
migration and does not install the intentionally excluded native action 2/3/4
completion hook. Lifecycle therefore truthfully remains:

```text
DEGRADED / coordination-not-implemented-b1
```

Full B2 remains `NOT_SETTLED`. Production `main`, planning, settled B1,
accepted B2.1, manifest permissions, quarantined drafts, release state, and
deployment state were not changed. The next action must be a read-only review
of the remaining B2 scope before any additional implementation authorization.
