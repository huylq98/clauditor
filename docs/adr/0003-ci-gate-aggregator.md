# 0003 — `ci-gate` as the single required check

**Status:** Accepted
**Date:** 2026-04-18

## Context

Initial branch protection on `main` required four named checks:

```json
"contexts": [
  "frontend",
  "backend (windows-latest)",
  "backend (macos-latest)",
  "backend (ubuntu-latest)"
]
```

This worked, but created two operational problems:

1. **Path filters broke it.** When `ci.yml` gained `dorny/paths-filter` to let doc-only PRs skip the 15-minute Rust matrix, the skipped jobs never reported a status — branch protection saw them as missing required checks, and the PR was un-mergeable until CI was re-run end-to-end manually.
2. **Matrix names are coupled to branch protection.** Renaming a matrix entry (e.g. adding a new OS) requires a simultaneous update to the branch-protection contexts. Easy to miss; painful when you do.

## Decision

Introduce a **single aggregating job `ci-gate`** that always runs (no path filter) and depends on every other CI job via `needs:`. Branch protection requires only `ci-gate`.

```yaml
ci-gate:
  needs: [actionlint, filter, frontend, backend]
  if: always()
  runs-on: ubuntu-latest
  timeout-minutes: 2
  steps:
    - name: Require required jobs to succeed or skip
      run: |
        # actionlint + filter MUST succeed.
        # frontend + backend may be skipped (path-filter excluded) but
        # must not have failed.
        ...
```

Branch protection config:

```json
"required_status_checks": { "strict": true, "contexts": ["ci-gate"] }
```

## Consequences

### What got better

- **Doc-only PRs merge in ~4 s.** `filter` + `actionlint` + `ci-gate` run; the rest skip via path filter; gate passes.
- **Matrix names are free to change.** Adding Linux ARM64 or splitting the frontend job doesn't touch branch protection.
- **One place to reason about "is CI green".** Contributors look at a single check.

### What got harder

- **Aggregator logic must be right.** If `ci-gate` falsely passes when an upstream failed, silent bugs ship. Mitigated by a simple, explicit bash script (not a third-party action) that's easy to audit.
- **One-time orchestration during the transition.** The old four contexts had to be swapped for `ci-gate` via `gh api` at the moment the aggregator first appeared on `main`; doing it too early would have blocked the very PR that introduced it.

### Rejected alternatives

- **Leave branch protection wide-open for doc PRs** and manually bypass when needed. Defeats the purpose of protection.
- **Admin-bypass as a regular workflow.** Trains the habit of ignoring gates; eventually a real bug sneaks through.
- **Use `actions/workflow-run` to chain checks.** Overkill — a `needs:` + bash assertion is 20 lines and does the job.
