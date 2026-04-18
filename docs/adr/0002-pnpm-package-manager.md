# 0002 — pnpm as package manager

**Status:** Accepted
**Date:** 2026-04-18

## Context

The project started on `npm`. With the post-rewrite dep graph (~330 packages including Radix, xterm, Tauri, Playwright), `npm install` took ~20 s cold and `node_modules` weighed ~350 MB.

The Vite / SvelteKit / TanStack / Radix ecosystems had broadly converged on `pnpm` by 2024. Contributors who already use `pnpm` elsewhere expected it here.

## Decision

Migrate from `npm` to **`pnpm@10`**.

- Lockfile: `pnpm-lock.yaml` (generated via `pnpm import` from the existing `package-lock.json` to preserve exact versions).
- `package.json` declares `packageManager: "pnpm@10.33.0"` + `engines: { node: ">=24", pnpm: ">=10" }`.
- CI: `pnpm/action-setup@v4` + `pnpm install --frozen-lockfile`.
- Dependabot: `package-ecosystem: "npm"` handles `pnpm-lock.yaml` natively (GitHub added support in 2024).

## Consequences

### What got better

| Axis | Before (npm) | After (pnpm) |
|---|---|---|
| Install, warm cache | ~20 s | ~1 s (measured in CI, frontend job) |
| `node_modules` on disk | ~350 MB per project | ~1 MB repo-local + shared content-addressable store |
| Phantom-dep tolerance | accepts | refuses by default |
| CI cache hit behaviour | per-project | cross-project (global store) |

- Install speed is the most visible win. Frontend CI job dropped measurable time per run.
- Strict dep resolution catches imports of transitive packages before they become load-bearing.

### What got harder

- **Contributors must install `pnpm`.** Documented in `README.md` + `CONTRIBUTING.md`. `corepack enable` is the one-liner if Node 24 is already present.
- **Windows symlink quirks** — historically painful; in pnpm 10 they're rare, but worth knowing about for unusual folder layouts.

### Rejected alternatives

- **Yarn 4.** Good ecosystem, but pnpm's disk + strict-resolution story is cleaner and the community momentum is stronger.
- **npm 11.** Faster than it was, but still doesn't solve the duplication problem on multi-project machines.
- **Bun.** Impressive speed, but bundles its own runtime that replaces Node — more ambitious than we need.
