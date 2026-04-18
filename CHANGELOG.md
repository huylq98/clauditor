# Changelog

All notable changes to Clauditor are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

### Added
- Dependabot config covering npm, cargo, and GitHub Actions with grouped updates and auto-merge for patch/minor bumps.
- Issue + pull-request templates (`bug.yml`, `feature.yml`, `pull_request_template.md`).
- `SECURITY.md` with a private-report workflow and threat model.
- `CONTRIBUTING.md` covering setup, branching, commits, tests.
- `.nvmrc`, `.editorconfig` for editor / toolchain consistency.
- OSSF Scorecard workflow (weekly supply-chain health report).
- `actionlint` job that validates workflow YAML on every PR.
- Release artifacts now carry sigstore build-provenance attestations.
- Additional release target: `aarch64-unknown-linux-gnu` (Linux ARM64).

### Changed
- CI uses per-job path filters — doc-only PRs skip the Rust matrix.
- Frontend + perf jobs cache Playwright browsers across runs.
- Release workflow has a dedicated concurrency group and a pre-flight TypeScript type-check before the Rust compile.
- `tauri-action` pinned from floating `@v0` to `@v0.5` for reproducibility.
- All workflows have explicit `timeout-minutes` budgets.
- Branch protection now gates on a single aggregating `ci-gate` check.

## [0.2.0] — 2026-04-18

### Added
- Complete Tauri 2 + Rust + React 19 rewrite (see PR #10).
- Keyboard shortcuts cheat sheet at `Ctrl/⌘+/`.
- Command palette at `Ctrl/⌘+K` with recent workspaces.
- Terminal scrollback search at `Ctrl/⌘+F`.
- Session rename via double-click tab; drag to reorder.
- Undo toast on session forget.
- Radix AlertDialog for kill confirmation.
- Resizable sidebar.
- Playwright perf suite with industry latency budgets.
- GitHub Pages download landing page with auto-OS-detect.
- `release.yml` matrix producing signed MSI / DMG (universal) / AppImage / deb / rpm.
- Full CI matrix: frontend build + e2e + perf on Linux, backend fmt/clippy/test on Win/macOS/Linux.
- Branch protection on `main` requiring all CI checks to pass.

### Changed
- Migrated from Electron 33 to Tauri 2 — binary ~80 MB → ~7 MB, idle RAM ~150 → ~60 MB, cold start ~1.2 s → ~0.3 s.
- Keyboard shortcuts moved to capture-phase listeners so xterm no longer swallows them.

### Removed
- Electron main / preload / renderer code paths.
- `@lydell/node-pty`, `chokidar`, `express` (replaced by `portable-pty`, `notify`, `axum`).

## [0.1.0] — 2026-04-17

Initial Electron-based release, tagged as `v0.1-electron-final` for rollback.

### Added
- Multi-session Claude Code manager with per-session PTY.
- Live state tracking via Claude Code hooks.
- File tree + activity log.
- System tray integration.
- Session persistence across restarts.
- Bulk actions.
