# Review sweep — index

Generated on 2026-04-18 from the `chore/review-sweep` branch.

## Reports

1. [01-rust-simplify.md](01-rust-simplify.md) — 30 simplifications across `src-tauri/src/*.rs` (2,075 LOC)
2. [02-frontend-simplify.md](02-frontend-simplify.md) — 74 observations on `src/**/*.{ts,tsx}` (~2,800 LOC); codebase is already clean, mostly dead-code + dedup
3. [03-security.md](03-security.md) — 20 findings (3 Critical, 6 High, 7 Medium, 4 Low)
4. [04-performance.md](04-performance.md) — 22 items vs. VS Code baseline; top 5 quick wins estimated to save 50–100ms
5. [05-ui-ux.md](05-ui-ux.md) — 29 P0/P1/P2/nit findings against WCAG 2.2 AA + Nielsen
6. [06-pipeline.md](06-pipeline.md) — which reviews got scripted into CI and which stay human-review
7. [07-cargo-audit.md](07-cargo-audit.md) — dependency advisory sweep

## Fixes landed in this branch

### Security (critical / high)

- Constant-time token compare in `hook_server.rs` (CWE-208) — added `subtle` crate dep
- `OsRng` instead of `thread_rng` for the hook-server token (CWE-338)
- Removed `std::env::set_var("CLAUDITOR_TOKEN")` so it no longer leaks to grandchildren (CWE-526) — token continues to flow via per-PTY `cmd.env`
- Hook script mode `0o755 → 0o700` so it's no longer world-readable (CWE-276)
- Quoted `endpoint` in the shell/PowerShell hook command template (CWE-94, defense-in-depth)
- Path traversal hardening in `file_watcher::read_file`: reject `..` / NUL / `/` prefix pre-join, then canonicalize and verify the resolved path is under the canonical root (CWE-22)
- Switched `file_read` from "read then truncate in memory" to `File::take(MAX)` (CWE-400)

### Supply chain / CI

- Top-level `permissions: contents: read` on every workflow; per-job escalation only where needed (fixes 4 Scorecard Token-Permissions findings)
- SHA-pinned all 25 GitHub-owned action references across `ci.yml`, `release.yml`, `scorecard.yml`, `pages.yml`, `claude.yml`, `claude-code-review.yml` (fixes 26 Scorecard Pinned-Dependencies findings)
- New `cargo-audit` job in `ci.yml`, wired into `ci-gate` — fails on any *new* advisory in a direct dep; explicitly ignores the 20 transitive-through-tauri advisories documented in doc 07

### Simplify

- Deleted dead `formatRelativeTime` helper
- Removed unused `buttonVariants` named export
- Deleted unused `density` UI-store slice (state + setter)
- Extracted duplicated `isMac` and `modKey` to `src/lib/utils.ts`; updated three call sites

## Not landed (deliberately) — see reports for prioritization

- Rust simplify items 1–30 (range from trivial to `medium` refactor effort)
- Frontend simplify items beyond dead-code / dedup
- Security findings 10–20 (nothing critical blocking; see report 03)
- Perf items (require careful benchmarking; see report 04 for the recommended sequence)
- UI/UX findings (need product + design input on intentional tradeoffs)

## Verification

Run inside the worktree:

```bash
# Rust
export PATH="$HOME/.cargo/bin:$PATH"
cd src-tauri
cargo fmt --all -- --check   # pass
cargo clippy --all-targets -- -D warnings   # pass (0 warnings)
cargo test --all             # pass (0 tests in-tree; Rust backend has none yet)
cargo audit                   # 20 transitive advisories, all in the CI ignore list

# Frontend
pnpm install --frozen-lockfile
pnpm exec tsc -b             # pass
pnpm run test:smoke          # pass (3/3)
```

## Scorecard delta

Before: 35 open code-scanning alerts (26 Pinned-Deps + 4 Token-Perms + 1 Vulnerabilities rollup + 4 governance signals).

After landing this branch:
- **Pinned-Deps:** 0 (all 26 mechanical pins applied)
- **Token-Perms:** 0 (all 4 workflows have least-privilege top-level)
- **Vulnerabilities:** unchanged (all 20 are transitive-through-tauri; see doc 07)
- **Maintained / Fuzzing / Code-Review / CII-Best-Practices:** unchanged (these are repo-maturity signals Scorecard lowers over time; they aren't actionable in a single PR)
