# B2.1 Implementation: Fenced Authoritative Kernel

**Branch:** `rebuild/squarecoil-companion-b2-fenced-kernel`

**Status:** `IMPLEMENTED / BROWSER ACCEPTANCE COMPLETE / PASS`

**Browser-tested implementation:** `afba339c401b77aa74e6be5bde90add8ac9e8098`

**Baseline:** settled B1 at `c59b88fad941003507954e9cba66214c360ea368`

**Depends on:** settled L0-L4 contracts, the L8 acceptance rules, and settled B1 Shell / Lifecycle

**Does not settle:** full B2, the SquareCoil Bridge, Timer transition behavior, UI actions, migration invocation, positive lifecycle `READY`, production promotion, or release.

## Authorized slice

`START B2` authorized the reviewed B2.1 foundation only. This slice establishes
the durable model, Ledger, Workday Zone, migration candidate, checkpoint,
coordination, fencing, persistence, read-model, and worker transport foundations
that later B2 behavior must use. It does not infer B2.2 product behavior.

## Runtime ownership boundary

The service worker owns one authoritative kernel over one combined Chrome local
storage envelope. Every mutation runs under one named cross-context Web Lock,
samples time inside the exclusive transaction, validates the complete candidate,
and commits document, revision, coordination, fence, and receipt metadata
atomically.

One authority router exists per worker generation. Public responses omit fencing
credentials and owner identity. The authority client exists only in Chrome's
isolated content world. The MAIN-world application has no command, session,
heartbeat, disconnect, `postMessage`, or worker-authority transport surface. It
receives only the deliberately non-positive stage marker:

```text
KERNEL_CONNECTED_B2_1
DEGRADED / coordination-not-implemented-b1
```

The isolated client owns connect, subscribe, read, heartbeat, worker-restart
reconnect, and exact teardown. The default 5-second heartbeat has a strict
margin below the 15-second authority lease. A failed disconnect retains the
client for cleanup retry; a worker restart may reconnect only to release that
same runtime. Disable is sequenced authority-first and MAIN-second; an
unconfirmed authority release remains sticky `teardown-incomplete`, blocks a
fresh boot, and is eligible only for explicit cleanup retry.

## Implemented foundations

- strict Shared Timer State and authoritative document validation;
- exact Time Ledger duration, midnight split, DST, deduplication, and query semantics;
- mutually exclusive Active, Pending, and Local Pause state;
- Active-versus-finalized-Ledger double-count rejection;
- persisted/configured/runtime/explicit-UTC-fallback Workday Zone selection;
- one-writer OWNER and connected OBSERVER coordination with lease, epoch, and fencing tokens;
- stale-writer rejection and idempotent reconnect/replay receipts;
- one combined Chrome storage envelope with read-back validation;
- deterministic Recovery Checkpoint construction and bounded verified recovery evidence;
- pure v0.7 migration candidate construction, strict completion markers, conflict-safe context aliases, and atomic fenced migration command;
- immutable revisioned timer read models;
- real worker startup installation that fails closed without Web Locks or storage;
- isolated client/router protocol with no MAIN-world authority relay;
- B2.1 build/package identity and static fixture validation.

## Intentional limits

The production path does not yet invoke migration, parse or observe SquareCoil,
execute Timer transitions, accrue time, submit UI commands, or render the B2 read
model. `MIGRATE_V07` exists only as an internal fenced command handler for later
trusted B2 wiring. No MAIN-world code may invoke it.

The existing B1 shell remains truthful and non-READY until the remaining Bridge,
Timer service, observation, migration-trigger, and presentation contracts are
implemented and accepted. Passing B2.1 tests cannot settle full B2.

## Acceptance boundary

A1-A3 require the full B1 regression suite plus every B2.1 model, migration,
coordination, persistence, router, transport, and restart fixture. B2.1 A4 adds
two installed-browser fixtures:

- `B2-KERNEL-001`: two real tabs obtain one OWNER and one OBSERVER_CONNECTED on the same worker and document revision without false `READY`;
- `B2-KERNEL-002`: service-worker restart changes worker identity, reconnects autonomously on the scheduled isolated heartbeat, preserves the page Runtime Instance ID, OWNER disposition, revision, coordination epoch, and the canonical persisted-document SHA-256.

The A4 harness used one exact clean package in branded Chrome and branded Edge,
synthetic pages only, and immutable archive/package inventories. Both browsers
passed all 16 cases, including both B2.1 kernel fixtures. The exact package,
browser, hash, and proof-boundary record is
[`B2-KERNEL-EVIDENCE.md`](B2-KERNEL-EVIDENCE.md).

## Protected boundaries

- production `main` is untouched;
- planning is untouched;
- settled B1 is untouched;
- the quarantined earlier B2 draft is not incorporated or modified;
- manifest permissions are unchanged;
- no merge, release, deployment, or production promotion is authorized.

After B2.1 evidence is recorded, full B2 remains `NOT_SETTLED`. The next work
must be a separately reviewed B2 slice, beginning with the trusted Bridge and
Timer-service boundary rather than UI or release work.
