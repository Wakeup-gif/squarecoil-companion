# Cloud Codex Task — SquareCoil B2-C Migration Slice

> **Historical completed task record.** This file preserves the original first-slice authorization and must not be treated as the current implementation boundary. The active branch now contains the later authorized native-observation and final B2 READY settlement work. Use `AGENTS.md`, `REBUILD-START-HERE.md`, and `logic/B2C-COMPLETION-READINESS.md` for current instructions, and do not begin B3, B4, or B5 without separate explicit authorization.

## Objective
Implement only the first unresolved B2-C engineering slice: production v0.7 migration invocation and marker-aware preflight.

Start by reading `AGENTS.md`, then `docs/B2C-BUILDER-HANDOFF.md`.

## Required behavior
Wire the existing migration machinery into production boot so that:

```text
fenced authority
-> marker-aware preflight
-> OWNER-only MIGRATE_V07 when REQUIRED
-> refresh authoritative state
-> recheck CURRENT/ARCHIVE source stability
-> COMPLETE_MATCH
-> fresh Bridge verification
```

Keep timing fail-closed for REQUIRED / IN_PROGRESS / FAILED / UNAVAILABLE / SOURCE_CHANGED_AFTER_COMPLETION.

Retained legacy keys must not permanently block a matching completed migration.

CURRENT/ARCHIVE changes after completion must block automatic re-import. ACTIVITY-only changes must remain nonblocking when authority-sensitive sources still match.

## Constraints
- Do not change product behavior outside settled B2-C migration rules.
- Do not implement native action 2/3/4 completion observation in this task.
- Do not modify `main` or create another branch.
- Do not edit `dist/` directly.
- Preserve one-writer fencing and existing accepted B2.2 behavior.
- Do not delete or rewrite legacy localStorage keys.

## Tests
Add targeted tests for MIG-C01 through MIG-C07 and READY-C03 using the existing B2 test organization.

Before finishing run:

```bash
npm run test:b2:unit
npm run test:b2:integration
npm run test:proto-ui
npm run check:b2-transition
git status --short
```

Commit the completed implementation and report:
1. files changed;
2. behavior implemented;
3. test results;
4. any remaining blocker or contradiction.
