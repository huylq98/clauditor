# Changelog

All notable changes to Clauditor are documented here.
Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/) · Versioning: [SemVer](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

_No changes yet._

## [0.2.1] — 2026-04-18

A no-user-facing-change release — full repo hardening, developer-resource polish, CI/CD productionization. All `v0.2.0` runtime behavior is unchanged.

### Added
- Dependabot config covering npm, cargo, and GitHub Actions with grouped updates and auto-merge for patch/minor bumps.
- Issue + pull-request templates (`bug.yml`, `feature.yml`, `pull_request_template.md`).
- `SECURITY.md` with a private-report workflow and threat model.
- `CONTRIBUTING.md` covering setup, branching, commits, tests.
- `CODE_OF_CONDUCT.md` (Contributor Covenant 2.1).
- `CODEOWNERS`, `.nvmrc`, `.editorconfig` for editor / toolchain consistency.
- `CLAUDE.md` + `AGENTS.md` — tool-neutral AI-agent guides with behavioral guidelines and repo conventions.
- `docs/ARCHITECTURE.md` — two-process architecture deep-dive.
- `docs/adr/` — Architecture Decision Records (Tauri-over-Electron, pnpm, ci-gate aggregator).
- `docs/perf-budgets.md` — latency budgets cross-referenced to RAIL / Web Vitals / desktop conventions.
- OSSF Scorecard workflow (weekly supply-chain health report).
- `actionlint` job that validates workflow YAML on every PR.
- Release artifacts now carry sigstore build-provenance attestations (verify with `gh attestation verify`).
- Additional release target: `aarch64-unknown-linux-gnu` (Linux ARM64).

### Changed
- **Migrated from `npm` to `pnpm@10`.** Install time ~20 s → ~1 s on warm CI cache. `package.json` pins `packageManager` + `engines`.
- **All workflows migrated to Node.js 24 runtime** via `FORCE_JAVASCRIPT_ACTIONS_TO_NODE24` (ahead of GitHub's June-2026 forced flip).
- CI uses per-job path filters — doc-only PRs skip the Rust matrix and land in ~4 s.
- Frontend + perf jobs cache Playwright browsers across runs (~30 s saved per hit).
- Release workflow has a dedicated per-tag concurrency group + pre-flight TypeScript type-check before the Rust matrix.
- Release has a `workflow_dispatch` input for re-releasing an existing tag without force-push.
- `tauri-action` pinned from floating `@v0` to `@v0.5` (bumped to `@v0.6` via Dependabot in #18).
- All workflows have explicit `timeout-minutes` budgets.
- Branch protection now gates on a single aggregating `ci-gate` check — matrix names are no longer coupled to protection contexts.
- GitHub Actions major-version bumps: `actions/checkout@v4 → v6`, `actions/setup-node@v4 → v6`, `actions/cache@v4 → v5`, `actions/upload-artifact@v4 → v7`, `dorny/paths-filter@v3 → v4`, `dependabot/fetch-metadata@v2 → v3`.

### Fixed
- OSSF Scorecard signature verification failing on every run because of a workflow-level `env:` block. Scorecard rejects workflows with global env vars or `defaults:` — that restriction is now documented inline in `scorecard.yml`.
- `anthropics/claude-code-action@v1` false-positive "workflow validation failed" on CI-only PRs that modify workflow files. `claude-code-review.yml` now `paths-ignore` workflow + doc changes.

### Removed
- Local scratch directories (`docs/superpowers/`, `.superpowers/`, `docs/logo-proposals/`) — implemented work now captured as code, ADRs, or CHANGELOG entries.

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
