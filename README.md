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

- **Every session in one window.** Open as many Claude Code sessions as you need, each pinned to its own working directory, all tabbed in a single Electron app.
- **Live state at a glance.** Each tab shows whether Claude is *running*, *waiting for permission*, *waiting for your reply*, *idle*, or *exited* — driven by Claude Code's own lifecycle hooks, not screen-scraping.
- **It tells you when something needs you.** Desktop notifications + taskbar flashing when a backgrounded session needs permission or input. Click the notification, you land on the right tab.
- **See what Claude is touching.** A per-session file tree lights up files as Claude reads, writes, edits, or deletes them, with a rolling activity log.
- **Click any file for a quick preview.** Read-only overlay, no context switch to your editor.
- **System tray.** Close the window, Clauditor keeps running; the tray menu lists every live session with its state.

## Why it's different

Not a web UI. Not a wrapper that re-implements Claude Code. Clauditor **spawns the real `claude` CLI in a real PTY** — everything you can do in a plain terminal works here, with the same keystrokes, the same colors, the same tools. Clauditor just adds the coordination layer on top: tabs, state tracking, file intelligence, notifications.

## Install

### Pre-built binaries

Grab the latest installer from the [**Releases page**](https://github.com/huylq98/clauditor/releases/latest):

| Platform | Artifact |
|----------|----------|
| Windows  | `.exe` (NSIS installer) |
| macOS    | `.dmg` |
| Linux    | `.AppImage` |

### From source

```bash
git clone https://github.com/huylq98/clauditor.git
cd clauditor
npm install
npm start
```

**Requirements:** Node.js 20+ and the [`claude` CLI](https://docs.claude.com/en/docs/claude-code/setup) on your `PATH`.

## Keyboard shortcuts

| Shortcut          | Action                    |
|-------------------|---------------------------|
| `Ctrl+T`          | New session               |
| `Ctrl+W`          | Close active session      |
| `Ctrl+1` … `Ctrl+9` | Jump to session 1–9     |
| `Ctrl+Tab`        | Cycle forward             |
| `Ctrl+Shift+Tab`  | Cycle backward            |
| Double-click tab  | Rename session            |
| Right-click tab   | Rename session            |

## How it works

<details>
<summary>Click for the architecture tour</summary>

### The hook trick

When Clauditor launches, it installs a small block of hooks into your Claude Code settings (`~/.claude/settings.json`) that POST to a local HTTP server on `127.0.0.1:27182`. Each session is spawned with a per-launch token and a session ID in its environment, so the server can attribute every hook to the right tab. Clauditor removes the hooks on quit.

### Layout

```
src/
├── main/                     Electron main process
│   ├── index.js              app lifecycle, IPC, wiring
│   ├── pty-manager.js        spawns + manages claude PTYs
│   ├── state-engine.js       per-session state machine
│   ├── hook-server.js        receives Claude Code hooks
│   ├── notifier.js           toasts + taskbar flash
│   ├── file-watcher.js       chokidar-backed tree + file reads
│   ├── file-activity-service.js    aggregates Read/Write/Edit activity
│   ├── settings-installer.js installs/removes Claude Code hooks
│   └── tray.js               system tray
├── preload/preload.js        contextBridge API
└── renderer/
    ├── renderer.js           orchestration
    ├── components/
    │   ├── tabbar.js         tabs, shortcuts, rename
    │   ├── sidebar.js        search + tree + activity + preview
    │   └── tree.js           pure tree-flattening logic
    ├── styles.css
    └── index.html
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

- [ ] Persist session layout + names across restarts
- [ ] Search across all session transcripts
- [ ] Bulk actions (kill all, restart all)
- [ ] Per-session themes / accent colors
- [ ] Plugin API for custom side panels
- [ ] Resumable sessions backed by Claude Code's session history

Have a request? [**Open an issue**](https://github.com/huylq98/clauditor/issues/new).

## Development

```bash
npm start              # launch in dev mode
npm test               # full suite (unit + PTY + e2e)
npm run test:unit      # unit tests only
npm run dist           # build installers into dist/
```

PRs welcome. For anything non-trivial, open an issue first so we can align on direction before you spend time on code.

## Built with

[Electron](https://www.electronjs.org/) · [xterm.js](https://xtermjs.org/) · [@lydell/node-pty](https://github.com/lydell/node-pty) · [chokidar](https://github.com/paulmillr/chokidar) · [Playwright](https://playwright.dev/)

## License

[MIT](./LICENSE) — do whatever you want, attribution appreciated.

---

<div align="center">

**If Clauditor saves you time, [leave a star](https://github.com/huylq98/clauditor) — it genuinely helps.**

</div>
