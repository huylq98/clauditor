# Architecture Decision Records

Records of the *why* behind Clauditor's non-obvious technical decisions. Each ADR is a short markdown file that captures:

- **Context** — the state of the world at the time of the decision.
- **Decision** — what was chosen.
- **Consequences** — the trade-offs accepted.

ADRs are immutable. If a decision is reversed, add a new ADR that supersedes the old one rather than editing the original. This way the history is readable.

## Index

- [0001 — Tauri over Electron](./0001-tauri-over-electron.md)
- [0002 — pnpm as package manager](./0002-pnpm-package-manager.md)
- [0003 — `ci-gate` aggregator for branch protection](./0003-ci-gate-aggregator.md)

## Format

Borrowed from [Michael Nygard's original ADR post](https://www.cognitect.com/blog/2011/11/15/documenting-architecture-decisions). File name: `NNNN-kebab-case-title.md` where `NNNN` is a zero-padded sequence starting at `0001`.

Template:

```markdown
# NNNN — Title

**Status:** Accepted / Superseded by #NNNN / Deprecated
**Date:** YYYY-MM-DD

## Context
What forces are at play? What's the problem?

## Decision
What did we choose, and what does it look like in practice?

## Consequences
What gets easier? What gets harder? What did we explicitly reject and why?
```
