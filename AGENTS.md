# Clauditor — AI agent guide

> This file is a shared reference for any AI agent working on this repo.
> **`CLAUDE.md`** mirrors this content so agents that follow either convention pick it up.

## What this project is

Clauditor is a cross-platform desktop manager for running multiple **Claude Code** CLI sessions in parallel. It spawns the real `claude` binary inside a PTY per session, tracks live state via Claude Code's own lifecycle hooks, and presents everything in a tabbed native window.

## Tech stack

- **Shell**: Tauri 2 (Rust + system webview)
- **Backend (Rust, `src-tauri/`)**: `tokio`, `portable-pty`, `notify`, `axum`, `serde_json`, `parking_lot`
- **Frontend (TypeScript, `src/`)**: React 19, Vite 6, Tailwind v4, Zustand, xterm.js, Radix UI, `cmdk`, Framer Motion, Sonner
- **Tests**: Playwright (browser + mock backend), `cargo test`
- **CI**: GitHub Actions matrix on Windows / macOS / Linux (x64 + arm64)

Full dependency list: `package.json` + `src-tauri/Cargo.toml`.

---

## Behavioral guidelines

> Adapted from [forrestchang/andrej-karpathy-skills](https://github.com/forrestchang/andrej-karpathy-skills). These bias toward caution over speed. For trivial tasks, use judgment.

### 1. Think before coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them — don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity first

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask: "Would a senior engineer say this is overcomplicated?" If yes, simplify.

### 3. Surgical changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it — don't delete it.

When your changes create orphans:
- Remove imports / variables / functions that *your* changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: every changed line traces directly back to the user's request.

### 4. Goal-driven execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass."
- "Fix the bug" → "Write a test that reproduces it, then make it pass."
- "Refactor X" → "Ensure tests pass before and after."

For multi-step tasks, state a brief plan up front:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak ones ("make it work") require constant clarification.

### 5. Leave the tree cleaner than you found it — but only in your patch

- Every new file obeys `.editorconfig` (2-space indent, LF, UTF-8).
- Rust code passes `cargo fmt --all -- --check` and `cargo clippy --all-targets -- -D warnings`.
- TypeScript passes `npx tsc -b`.
- Before committing, run the relevant test suite (`pnpm test:smoke` at minimum for UI changes; `cargo test` for backend changes).

### 6. When you hit a wall

- Read the error literally. Don't paraphrase into a guess.
- Check `tests/artifacts/` for the latest screenshot + report.
- For CI failures, `gh run view <run-id> --log-failed` before hypothesizing.
- If you're about to suppress a warning or disable a test, stop and surface it first.

---

## Key directories

```
src/                      React frontend
  components/             UI primitives + composed components
  hooks/                  Keyboard shortcuts, etc.
  lib/                    ipc.ts, bindings.ts, terminal.ts, utils.ts, mock.ts
  store/                  Zustand slices (sessions, tree, ui, recentCwds)
  styles/                 Tailwind v4 @theme tokens + globals

src-tauri/                Rust backend
  src/
    main.rs / lib.rs      Entry + builder
    commands.rs           #[tauri::command] exports
    types.rs              Shared serializable types
    pty_manager.rs        portable-pty spawn/read/write/resize
    state_engine.rs       Per-session FSM (7 states)
    hook_server.rs        axum HTTP server on 127.0.0.1:27182
    file_watcher.rs       notify-based per-session recursive watcher
    activity_service.rs   Tool-call activity aggregation
    session_store.rs      serde_json persistence (atomic tmp→rename)
    settings_installer.rs ~/.claude/settings.json hook installer
    tray.rs               System tray
  tauri.conf.json         App config, bundle targets
  capabilities/*.json     Tauri 2 capabilities

tests/                    Playwright specs
site/                     GitHub Pages download landing page
.github/workflows/        CI, Release, Pages, OSSF Scorecard, Claude bots
```

## Commands

```bash
pnpm install              # first run or after deps change
pnpm tauri dev            # launch app in dev mode (HMR)
pnpm tauri build          # build signed installers
pnpm build                # frontend-only build
pnpm lint                 # ESLint

pnpm test                 # full Playwright suite
pnpm test:smoke           # core flows, ~5s
pnpm test:ui-review       # screenshot capture, ~55s
pnpm perf                 # latency suite against dev server
pnpm perf:prod            # latency suite against production build

cd src-tauri
cargo fmt --all -- --check
cargo clippy --all-targets -- -D warnings
cargo test --all
```

## Conventions

- **Commits**: `<type>(<scope>): <subject>` — types: `feat`, `fix`, `docs`, `ci`, `perf`, `refactor`, `test`, `deps`, `chore`.
- **Branches**: `feat/<slug>`, `fix/<slug>`, `ci/<slug>`, `docs/<slug>`.
- **PRs**: required check is the aggregating `ci-gate`. The `perf` job is informational. Dependabot patch/minor PRs auto-merge.
- **Writing code**: no comments unless the *why* is non-obvious. Prefer deleting dead code over annotating it.
- **Writing tests**: smoke/UI tests use the browser mock backend (`src/lib/mock.ts`). Real-PTY tests would need `tauri-driver` (not set up yet).

## Architectural invariants

- **Hook server** listens only on `127.0.0.1:27182` and gates on a per-launch bearer token in the `X-Clauditor-Token` header.
- **Session attribution** on hook callbacks uses the parent PID of the hook process, NOT env vars — env vars leak to descendant processes and would misattribute grandchildren.
- **`~/.claude/settings.json`** hook format is byte-compatible between Clauditor's Electron era and Tauri era. Changing the hook payload shape is a breaking change for users on older Clauditor versions.
- **Keyboard shortcuts** attach via `window.addEventListener('keydown', handler, true)` (capture phase). xterm otherwise swallows `⌘K` / `⌘T` / `⌘B` / `⌘F` etc. when the terminal is focused.
- **State derivations** in the UI — use primitive Zustand selectors (`s.order`, `s.byId`) + `useMemo`, never selectors that build fresh objects each call. Infinite-loop risk from React's `useSyncExternalStore`.
- **TerminalHost** stays mounted per session for its lifetime; visibility toggles via CSS. Never unmount-then-remount on tab switch — xterm scrollback would be destroyed.

## Where to look first

- **New feature**: start in `src/components/` or `src-tauri/src/commands.rs` depending on which layer owns it.
- **Bug in session lifecycle**: `src-tauri/src/state_engine.rs` (FSM), `src-tauri/src/pty_manager.rs` (spawn + read), `src/store/sessions.ts` (frontend state).
- **Bug in UI**: `src/components/` — start with the affected component, trace props back to `src/App.tsx`.
- **Perf regression**: run `pnpm perf:prod` locally, compare against the budgets in `tests/perf.spec.ts`.

## Reference docs

- `README.md` — user-facing intro and install.
- `CONTRIBUTING.md` — setup, branching, commits, test matrix.
- `CODE_OF_CONDUCT.md` — Contributor Covenant 2.1.
- `CHANGELOG.md` — release history.
- `SECURITY.md` — vulnerability reporting + threat model.
- Design specs: `docs/superpowers/specs/*.md` (gitignored by design; local-only).

---

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer rewrites due to overcomplication, and clarifying questions come before implementation rather than after mistakes.
