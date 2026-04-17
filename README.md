# Clauditor

A desktop manager for running multiple [Claude Code](https://docs.claude.com/en/docs/claude-code/overview) sessions side by side. Clauditor wraps the official `claude` CLI in a PTY, gives each session its own tab, and surfaces what's happening across them — file edits, permission prompts, idle state — without you having to babysit each terminal.

## Status

Early development. Usable day-to-day; expect rough edges and breaking changes.

## Features

- **Tabbed sessions** — open multiple Claude Code sessions in one window, each in its own cwd.
- **Per-session state** — `running`, `awaiting_user`, `awaiting_permission`, `idle`, `exited`, tracked from Claude Code hooks.
- **Desktop notifications + taskbar flash** — know when a session needs your attention even if you're in another app.
- **File tree sidebar** — per-session live view of the working directory, with modification / creation badges driven by Claude Code tool events.
- **Activity log** — rolling feed of file reads/writes/edits/deletes.
- **Click-to-preview files** — open any file from the tree in a read-only overlay.
- **System tray** — quick access to active sessions; minimize-to-tray instead of quitting.
- **Keyboard shortcuts** — `Ctrl+T` new session, `Ctrl+W` close, `Ctrl+1..9` switch tabs, `Ctrl+Tab` cycle.
- **Rename sessions** — double-click or right-click a tab.

## Requirements

- Node.js 20+
- The `claude` CLI on your `PATH` ([install instructions](https://docs.claude.com/en/docs/claude-code/setup))
- Windows 10/11, macOS 12+, or Linux

## Install and run (from source)

```bash
git clone https://github.com/huylq98/clauditor.git
cd clauditor
npm install
npm start
```

## Build a distributable

```bash
npm run dist
```

Outputs go to `dist/`. Targets are defined in `package.json > build`: NSIS installer on Windows, DMG on macOS, AppImage on Linux.

## Tests

```bash
npm test              # full suite (Playwright-driven: unit + pty + e2e)
npm run test:unit     # pure unit tests
npm run test:pty      # PTY manager tests
npm run test:e2e      # end-to-end via launched Electron window
```

## Architecture

```
src/
  main/            Electron main process
    index.js             app lifecycle, IPC handlers, wiring
    pty-manager.js       spawns + manages claude PTYs
    state-engine.js      per-session state machine
    hook-server.js       HTTP server that Claude Code hooks post to
    notifier.js          desktop notifications + attention signals
    file-watcher.js      chokidar-backed tree + file reads
    file-activity-service.js   aggregates Read/Write/Edit activity
    settings-installer.js      installs Claude Code hooks into user settings
    tray.js              system tray menu
  preload/
    preload.js           contextBridge API surface
  renderer/
    renderer.js          orchestration glue
    components/
      tabbar.js            tabs, keyboard nav, rename
      sidebar.js           search + file tree + activity panel + preview
      tree.js              pure tree-flattening logic
    styles.css
    index.html
assets/
  tray-icon.png
```

### How state tracking works

Clauditor installs a small block of hooks into the user's Claude Code settings (`~/.claude/settings.json`) pointing at a local HTTP server on `127.0.0.1:27182` with a per-launch token. Each Claude Code process Clauditor spawns sets `CLAUDITOR_SESSION_ID` and `CLAUDITOR_TOKEN` in its environment, and the hooks forward lifecycle events (`user-prompt-submit`, `pre-tool-use`, `post-tool-use`, `stop`, `notification`) to the hook server. The state engine maps those hooks to per-session states. When the app exits, the installer removes the hooks.

## Contributing

Issues and pull requests are welcome. For non-trivial changes, please open an issue first to discuss direction.

## License

[MIT](./LICENSE)
