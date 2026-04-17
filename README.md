<div align="center">

# Clauditor

### Run Claude Code sessions in parallel without losing your mind.

**One window. Many sessions. Zero tab chaos.**

[![License: MIT](https://img.shields.io/badge/License-MIT-ec8469.svg)](./LICENSE)
[![CI](https://github.com/huylq98/clauditor/actions/workflows/ci.yml/badge.svg)](https://github.com/huylq98/clauditor/actions/workflows/ci.yml)
[![Release](https://img.shields.io/github/v/release/huylq98/clauditor?color=ec8469)](https://github.com/huylq98/clauditor/releases)
[![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux-8ba668)](https://github.com/huylq98/clauditor/releases)
[![Stars](https://img.shields.io/github/stars/huylq98/clauditor?style=social)](https://github.com/huylq98/clauditor/stargazers)

<!-- Drop a screenshot or animated GIF into docs/screenshots/hero.png and uncomment -->
<!-- <img src="docs/screenshots/hero.png" alt="Clauditor hero" width="860" /> -->

</div>

---

## The problem

You started one Claude Code session. Then another, for a second repo. Then a third, because the first one was busy refactoring while the second was hunting a bug. Now you have five terminal windows, you can't remember which is which, one of them has been waiting on a permission prompt for ten minutes, and another finished twenty minutes ago and you never noticed.

**Clauditor fixes that.**

## What it gives you

- **Every session in one window.** Open as many Claude Code sessions as you need, each pinned to its own working directory, all tabbed in a single native app.
- **Live state at a glance.** Each tab shows whether Claude is *running*, *waiting for permission*, *waiting for your reply*, *idle*, or *exited* — driven by Claude Code's own lifecycle hooks, not screen-scraping.
- **It tells you when something needs you.** Desktop notifications + in-app toasts when a backgrounded session needs permission or input. Click the notification, you land on the right tab.
- **See what Claude is touching.** A per-session file tree lights up files as Claude reads, writes, edits, or deletes them, with a rolling activity log.
- **Command palette.** `Ctrl/Cmd+K` jumps to sessions, kills / restarts / forgets, switches workspaces — everything, one shortcut.
- **System tray.** Close the window, Clauditor keeps running; the tray menu surfaces the "new session" + "quit" actions.

## Why it's different

Not a web UI. Not a wrapper that re-implements Claude Code. Clauditor **spawns the real `claude` CLI in a real PTY** — everything you can do in a plain terminal works here, with the same keystrokes, the same colors, the same tools. Clauditor just adds the coordination layer on top: tabs, state tracking, file intelligence, notifications.

## Install

### Pre-built binaries

Grab the latest installer from the [**Releases page**](https://github.com/huylq98/clauditor/releases/latest):

| Platform | Artifact |
|----------|----------|
| Windows  | `.msi` / `.exe` (NSIS) |
| macOS    | `.dmg` (universal: x86_64 + aarch64) |
| Linux    | `.AppImage` / `.deb` / `.rpm` |

### From source

```bash
git clone https://github.com/huylq98/clauditor.git
cd clauditor
npm install
npm run tauri dev
```

**Requirements:**
- Node.js 20+
- Rust 1.80+ ([rustup.rs](https://rustup.rs/))
- On Windows: MSVC Build Tools (rustup prompts you)
- On Linux: `webkit2gtk-4.1`, `libayatana-appindicator3-dev`, `librsvg2-dev`
- The [`claude` CLI](https://docs.claude.com/en/docs/claude-code/setup) on your `PATH`

## Keyboard shortcuts

| Shortcut                    | Action                                       |
|-----------------------------|----------------------------------------------|
| `Ctrl/⌘+T`                  | New session                                  |
| `Ctrl/⌘+K`                  | Command palette                              |
| `Ctrl/⌘+W`                  | Close active session                         |
| `Ctrl/⌘+1` … `Ctrl/⌘+9`     | Jump to session 1–9                          |
| `Ctrl/⌘+Shift+]` / `[`      | Next / previous tab                          |
| `Ctrl/⌘+B`                  | Toggle sidebar                               |

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
├── hooks/
├── lib/
│   ├── ipc.ts                typed wrappers over invoke/listen
│   ├── bindings.ts           types mirroring Rust contracts
│   ├── terminal.ts           xterm setup
│   ├── utils.ts              cn() helper, formatters
│   └── mock.ts               in-memory backend for browser dev
├── store/                    zustand slices (sessions, tree, ui)
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

## Roadmap

- [x] Persist session layout + names across restarts
- [x] Bulk actions (kill all, restart all)
- [x] Command palette (`Ctrl/⌘+K`)
- [x] Virtualized file tree
- [ ] Light mode (tokens are wired; needs a toggle)
- [ ] Auto-updater via `tauri-plugin-updater` (signed releases)
- [ ] Search across all session transcripts
- [ ] Per-session themes / accent colors
- [ ] Resumable sessions backed by Claude Code's session history

Have a request? [**Open an issue**](https://github.com/huylq98/clauditor/issues/new).

## Development

```bash
npm run tauri dev      # launch in dev mode (vite + rust, HMR)
npm run tauri build    # build signed installers into src-tauri/target/release/bundle/
npm test               # playwright smoke tests (browser + mock backend)
npm run lint           # ESLint
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
