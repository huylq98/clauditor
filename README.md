<div align="center">

# Clauditor

### Run Claude Code sessions in parallel without losing your mind.

**One window. Many sessions. Zero tab chaos.**

[![License: MIT](https://img.shields.io/badge/License-MIT-ec8469.svg)](./LICENSE)
[![CI](https://github.com/huylq98/clauditor/actions/workflows/ci.yml/badge.svg)](https://github.com/huylq98/clauditor/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/huylq98/clauditor?color=ec8469)](https://github.com/huylq98/clauditor/releases)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-8ba668)](https://github.com/huylq98/clauditor/releases/latest)
[![Stars](https://img.shields.io/github/stars/huylq98/clauditor?style=social)](https://github.com/huylq98/clauditor/stargazers)

**[⬇ Download](https://huylq98.github.io/clauditor/)** · **[Releases](https://github.com/huylq98/clauditor/releases/latest)** · **[Report a bug](https://github.com/huylq98/clauditor/issues/new)**

<!-- Drop a screenshot or animated GIF into docs/screenshots/hero.png and uncomment -->
<!-- <img src="docs/screenshots/hero.png" alt="Clauditor hero" width="860" /> -->

</div>

---

## The problem

You started one Claude Code session. Then another, for a second repo. Then a third, because the first one was busy refactoring while the second was hunting a bug. Now you have five terminal windows, you can't remember which is which, one of them has been waiting on a permission prompt for ten minutes, and another finished twenty minutes ago and you never noticed.

**Clauditor fixes that.**

## What it gives you

- **Every session in one window.** Open as many Claude Code sessions as you need, each pinned to its own working directory, all tabbed in a single native app.
- **Live state at a glance.** Each tab shows whether Claude is *running*, *waiting for permission*, *waiting for your reply*, *idle*, or *exited* — driven by Claude Code's own lifecycle hooks, not screen-scraping. Attention states pulse so you notice them in peripheral vision.
- **It tells you when something needs you.** Desktop notifications + in-app toasts when a backgrounded session needs permission or input. Click the notification, you land on the right tab.
- **See what Claude is touching.** A per-session file tree lights up files as Claude reads, writes, edits, or deletes them, with a rolling activity log.
- **Command palette.** `Ctrl/⌘+K` jumps to sessions, kills / restarts / forgets, reopens recent workspaces, shows shortcuts.
- **Search terminal scrollback.** `Ctrl/⌘+F` in any terminal opens an inline find overlay with next/prev match.
- **Rename sessions.** Double-click any tab to give it a meaningful name. Drag to reorder.
- **Undo destructive actions.** Forgot a session by mistake? A toast lets you re-open it at the same cwd within 5 seconds.
- **Resizable sidebar + hover cwd tooltips** so your paths aren't lost to truncation.
- **System tray.** Close the window, Clauditor keeps running; the tray menu surfaces "new session" + "quit".

## Why it's different

Not a web UI. Not a wrapper that re-implements Claude Code. Clauditor **spawns the real `claude` CLI in a real PTY** — everything you can do in a plain terminal works here, with the same keystrokes, the same colors, the same tools. Clauditor just adds the coordination layer on top: tabs, state tracking, file intelligence, notifications.

## Install

### Pre-built binaries ⬇

**→ [Download page](https://huylq98.github.io/clauditor/) (auto-detects your OS)**

Or grab the latest artifact from the [**Releases page**](https://github.com/huylq98/clauditor/releases/latest):

| Platform | Artifact |
|----------|----------|
| Windows  | `.msi` / `.exe` (NSIS) |
| macOS    | `.dmg` (universal: x86_64 + aarch64) |
| Linux    | `.AppImage` / `.deb` / `.rpm` |

### From source

```bash
git clone https://github.com/huylq98/clauditor.git
cd clauditor
pnpm install
pnpm tauri dev
```

**Requirements:**
- Node.js 24+ (see `.nvmrc`)
- pnpm 10+ (`npm install -g pnpm`)
- Rust 1.80+ ([rustup.rs](https://rustup.rs/))
- On Windows: MSVC Build Tools (rustup prompts you)
- On Linux: `webkit2gtk-4.1`, `libayatana-appindicator3-dev`, `librsvg2-dev`
- The [`claude` CLI](https://docs.claude.com/en/docs/claude-code/setup) on your `PATH`

## Uninstalling

Clauditor's installers clean up their own hooks so you don't leave stale entries in `~/.claude/settings.json` pointing at a missing binary.

| Platform | Command / action | What gets removed |
|----------|------------------|-------------------|
| Windows (NSIS `.exe`) | Apps & Features → Clauditor → Uninstall | Binary + hooks. A dialog asks whether to also wipe `%APPDATA%\dev.clauditor.app` (session list, recent folders). Silent uninstalls default to preserve. |
| Windows (MSI) | Apps & Features → Clauditor → Uninstall | Binary + hooks. App data is preserved by default. To also wipe data, uninstall via an elevated prompt: `msiexec /x "Clauditor_<ver>_x64_en-US.msi" PURGE_DATA=1`. |
| Debian/Ubuntu (`.deb`) | `sudo apt remove clauditor` | Binary + hooks. App data preserved. |
|  | `sudo apt purge clauditor` | Binary + hooks + `~/.local/share/dev.clauditor.app`. |
| macOS | Drag `Clauditor.app` to Trash | Binary only. Hooks cleanup is tracked in a follow-up; until then, hand-edit `~/.claude/settings.json` and remove entries with `"_clauditor": true`. |

## Updates

Clauditor checks for a newer release on every launch. If one is available, a dismissable banner above the tab bar offers a one-click install; you can also trigger a check on demand from the system-tray menu ("Check for updates…").

- **Windows (NSIS `.exe`)** — updates install silently with a small progress bar. No UAC prompt per update.
- **Windows (MSI)** — updates require one UAC prompt per install (unavoidable on MSI).
- **macOS / Linux** — update downloads, verifies the minisign signature, installs in-place, then relaunches.

Every release is signed with a minisign keypair; the public key is baked into the app binary. Tampered updates are rejected by the signature check.

## Keyboard shortcuts

Press `Ctrl/⌘+/` inside the app to open the full cheat sheet.

| Shortcut                    | Action                                       |
|-----------------------------|----------------------------------------------|
| `Ctrl/⌘+T`                  | New session                                  |
| `Ctrl/⌘+K`                  | Command palette                              |
| `Ctrl/⌘+/`                  | Keyboard shortcuts cheat sheet               |
| `Ctrl/⌘+F`                  | Search terminal scrollback                   |
| `Ctrl/⌘+W`                  | Close / forget active session                |
| `Ctrl/⌘+B`                  | Toggle sidebar                               |
| `Ctrl/⌘+1` … `Ctrl/⌘+9`     | Jump to session 1–9                          |
| `Ctrl/⌘+Shift+]` / `[`      | Next / previous tab                          |
| Double-click tab            | Rename session                               |
| Drag tab                    | Reorder                                      |

## How it works

<details>
<summary>Click for the architecture tour</summary>

### The hook trick

When Clauditor launches, it installs a small block of hooks into your Claude Code settings (`~/.claude/settings.json`) that POST to a local HTTP server on `127.0.0.1:27182`. Each session is spawned with a per-launch token and a session ID in its environment, so the server can attribute every hook to the right tab. Clauditor removes the hooks on quit.

### Layout

```
src/                          React 19 frontend
├── main.tsx
├── App.tsx
├── components/               UI primitives + composed components
├── hooks/                    keyboard shortcuts
├── lib/
│   ├── ipc.ts                typed wrappers over invoke/listen
│   ├── bindings.ts           types mirroring Rust contracts
│   ├── terminal.ts           xterm setup (fit + search + webgl addons)
│   ├── utils.ts              cn() helper, formatters
│   └── mock.ts               in-memory backend for browser dev
├── store/                    zustand slices (sessions, tree, ui, recentCwds)
└── styles/                   Tailwind v4 @theme tokens + globals

src-tauri/                    Rust backend
├── Cargo.toml
├── tauri.conf.json
├── capabilities/default.json
└── src/
    ├── main.rs               entry
    ├── lib.rs                Tauri builder, plugin + command wiring
    ├── types.rs              shared serializable types
    ├── commands.rs           all #[tauri::command] exports
    ├── app_state.rs          AppState holding all services
    ├── pty_manager.rs        portable-pty spawn/read/write/resize
    ├── state_engine.rs       per-session FSM (7 states)
    ├── hook_server.rs        axum HTTP server on 127.0.0.1:27182
    ├── file_watcher.rs       notify-based per-session watcher
    ├── activity_service.rs   tool-call activity aggregation
    ├── session_store.rs      serde_json persistence, atomic writes
    ├── settings_installer.rs writes ~/.claude/settings.json hooks
    └── tray.rs               system tray
```

### Session states

```
running ──(stop)──────────────▶ awaiting_user
  ▲                                │
  │                            (user input)
  │                                ▼
idle ◀─(5 min)── (any) ────────▶ running
  │                                ▲
  ▲                            (post-tool-use)
  │                                │
  └── awaiting_permission ◀──(notification hook)
```

</details>

## Developer docs

- [**`docs/ARCHITECTURE.md`**](./docs/ARCHITECTURE.md) — deep-dive on the two-process worldview, IPC contract, session FSM, hook protocol, persistence.
- [**`docs/adr/`**](./docs/adr/) — Architecture Decision Records explaining the *why* behind Tauri-over-Electron, pnpm, the `ci-gate` pattern, etc.
- [**`docs/perf-budgets.md`**](./docs/perf-budgets.md) — latency budgets baked into the CI perf suite (RAIL, Web Vitals INP, desktop-app conventions).
- [**`CONTRIBUTING.md`**](./CONTRIBUTING.md) — setup, branching, commits, test matrix.
- [**`SECURITY.md`**](./SECURITY.md) — threat model + vulnerability reporting.
- [**`CLAUDE.md`**](./CLAUDE.md) / [**`AGENTS.md`**](./AGENTS.md) — guide for AI agents working on this repo.

## Roadmap

- [x] Persist session layout + names across restarts
- [x] Bulk actions (kill all, restart all)
- [x] Command palette (`Ctrl/⌘+K`)
- [x] Virtualized file tree
- [x] Rename + drag-reorder tabs
- [x] Recent workspaces reopener
- [x] Terminal scrollback search
- [x] Undo on forget
- [x] Full uninstall support across Windows (MSI + NSIS) and Debian (`.deb`)
- [x] Auto-updater via `tauri-plugin-updater` (signed releases) — silent on NSIS, one UAC prompt per MSI update
- [ ] Light mode (tokens are wired; needs a toggle)
- [ ] Per-session themes / accent colors
- [ ] Resumable sessions backed by Claude Code's session history

Have a request? [**Open an issue**](https://github.com/huylq98/clauditor/issues/new).

## Development

```bash
pnpm tauri dev         # launch in dev mode (vite + rust, HMR)
pnpm tauri build       # build signed installers into src-tauri/target/release/bundle/

pnpm test              # all Playwright specs (browser + mock backend)
pnpm test:smoke        # renders + basic flows
pnpm test:ui-review    # capture 10 reference screenshots to tests/artifacts/review/
pnpm perf              # latency suite against dev server
pnpm perf:prod         # latency suite against the production build
pnpm lint              # ESLint
```

PRs welcome. For anything non-trivial, open an issue first so we can align on direction before you spend time on code.

## Built with

[Tauri 2](https://tauri.app/) · [React 19](https://react.dev/) · [TypeScript](https://www.typescriptlang.org/) · [Vite](https://vite.dev/) · [Tailwind CSS v4](https://tailwindcss.com/) · [Zustand](https://zustand.docs.pmnd.rs/) · [xterm.js](https://xtermjs.org/) · [portable-pty](https://github.com/wez/wezterm/tree/main/pty) · [notify](https://github.com/notify-rs/notify) · [axum](https://github.com/tokio-rs/axum) · [Playwright](https://playwright.dev/)

## License

[MIT](./LICENSE) — do whatever you want, attribution appreciated.

---

<div align="center">

**If Clauditor saves you time, [leave a star](https://github.com/huylq98/clauditor) — it genuinely helps.**

</div>
