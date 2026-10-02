# Large-history import responsiveness

Date: October 1, 2026. Branch: `codex/squarecoil-import-progress`.
Base: merged main `1cc27cc55dee3f62b1f04f30f462232c94fed7ef`.

The user reported lag after restoring old work history and requested loading/progress during large imports. The original combined candidate and both development worktrees are preserved; its accepted ZIP remains immutable. This batch is a developer test update, with no new main merge or Store submission.

## Implementation

- Reuse bounded IANA-zone/calendar helpers and pure timestamp-to-date conversions. Every record still passes date, duration, identity and full-document validation on each stage and commit.
- Use a candidate-local balanced interval index for global overlap queries. Preserve ledger order, dedupe identities, conflict identifiers, half-open interval boundaries and atomic revalidation. Inspect every matching interval for protected live/recovery state before allowing an incoming replacement.
- Build context/date/query summaries once per validated display snapshot instead of scanning the ledger several times for each Context. This is transient derived work, rebuilt at the correct timer or data-view timestamp; no document or validation cache is introduced.
- Paint Reading, Checking, Review and Saving phases before expensive work. Reading percentages appear only when FileReader reports measured bytes. Finish appears only after the writer acknowledges the saved data.
- Disable import/options/navigation while busy and guard repeated events. Cancelled review and failed reads/stages/saves permit retry; teardown releases pending readers/paint waits. Hidden tabs have a bounded paint-wait fallback. No save-cancel button implies that an already submitted write can be aborted.

## Evidence state

The aggregate `check:b6-candidate` passed 718 unit/integration cases, 16 prototype cases, theme-port freshness and static validation. Exact-package certification is pending the clean source build and installed Chrome/Edge matrix.

Focused regressions are green: B3 unit 51, B3 integration 2, B4 unit 76, B4 integration 4, prototype 16, plus earlier calendar/model/ledger/read-model/document/index and Settings checks. Five new summary cases compare complete read models against canonical naive queries across 21 randomized DST/Timer-state fixtures, same-revision mutated inputs, zero rows, deep immutability and the maximum valid timestamp in idle data tools. A visit-count test proves one stored-row traversal independent of Context count. Counts overlap and are not added together. Aggregate and exact-package certification are in progress. No previous package's acceptance is applied to these changed runtime bytes.

A fair local Node comparison using 31 fictional Contexts and 20,000 nonoverlapping sessions staged the prior literal overlap scan in 20,387 ms and the index in 1,327 ms (about 15.4 times faster). Both produced the identical SHA-256 of the complete plan and candidate: `484f2d2f3528f6c059be2b1007e6ddb18a965961627c7ac6b9b36b52ed019dd6`. The comparison retained the same calendar caches in one process; it is a measured development result, not a guaranteed browser duration.

Isolated Node display medians improved from 996 to 683 ms for 20,000 rows with 31 Contexts, and from 2,067 to 693 ms with 100 Contexts. Calendar validation and full cloning remain mandatory; the improvement removes repeated per-Context scans rather than caching a trusted document. External before/after profiles retain the raw measurements. Wall time varies and these medians are not browser latency guarantees.

Two pre-existing L6 safety defects were found during equivalence testing: an earlier finalized/same-ID match could mask a later live/recovery overlap, and a same-ID replacement could leave another historical overlap behind. `UT-B4-INTERVAL-006/007` prove that unsafe incoming replacement stays blocked; Keep Current still skips that incoming record without a write.

Private recovered-history measurements retain only counts and timings outside Git. Public regression fixtures contain fictional jobs/sessions; actual job labels and the original recovery archive are not copied into this repository.

The 32 MiB input and 50,000-record safety limits remain. Checking/saving show phases rather than invented percentages. Synchronous validation still runs within a phase; this change reduces its cost and paints status first. Actual company-clock acceptance remains manual.
