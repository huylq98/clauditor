# Architecture

High-level reference for how Clauditor is put together. For a file-by-file map, see `CLAUDE.md` / `AGENTS.md`. For the user-facing overview, see `README.md`.

## One diagram

```
┌─────────────────────────────────────────────────────────────────┐
│  Tauri process                                                  │
│                                                                 │
│  ┌─────────────────────────┐   ┌─────────────────────────────┐  │
│  │  React + TS (webview)   │◄─►│  Rust (native, tokio)       │  │
│  │                         │   │                             │  │
│  │  xterm · Zustand · cmdk │   │  PtyManager    StateEngine  │  │
│  │  Radix · Tailwind       │   │  HookServer    FileWatcher  │  │
│  │                         │   │  ActivityService            │  │
│  │                         │   │  SessionStore  Tray         │  │
│  └─────────────┬───────────┘   └──────────────┬──────────────┘  │
│                │  invoke()      emit()        │                 │
│                │  listen()                    │                 │
│                └──────────────────────────────┘                 │
│                                                                 │
└───────────────────────────────┬─────────────────────────────────┘
                                │
                ┌───────────────┼────────────────────┐
                │               │                    │
                ▼               ▼                    ▼
          claude CLI       ~/.claude/            File system
          (one PTY         settings.json         (per-session
          per session)     + hook script         recursive watch)
                           (localhost:27182
                            POSTs on each
                            tool invocation)
```

The **frontend owns presentation only** — tab bar, terminals, sidebar, command palette. It keeps no state the backend can't recompute. The **backend owns all the interesting state** — running PTYs, session FSM, hook bookkeeping, file watchers, persistence.

## Two processes, one worldview

### Tauri main (Rust)

Single-threaded async tokio runtime plus a few blocking threads for PTY reads. All services share state via `Arc<Mutex<...>>` and communicate through Tauri's event bus.

| Service | Owns |
|---|---|
| `PtyManager` | Active PTYs, a ring buffer of recent output per session, spawn/kill/resize lifecycles |
| `StateEngine` | FSM per session: `Starting → Running ↔ Idle ↔ AwaitingUser ↔ AwaitingPermission ↔ Working → Exited`. Timers for idle-detection and post-stop grace. |
| `HookServer` | axum listener on `127.0.0.1:27182`. Receives POSTs from Claude Code, attributes them to sessions by parent-PID, feeds StateEngine + ActivityService. |
| `FileWatcher` | notify-based recursive watcher per session. Emits `tree:event` to the UI. |
| `ActivityService` | Aggregates tool invocations (`Read`, `Write`, `Edit`, `MultiEdit`, `NotebookEdit`) into per-session snapshots. |
| `SessionStore` | Debounced `serde_json` persistence (500 ms), atomic `tmp → rename`, load + quarantine-on-corrupt. |
| `Tray` | System tray menu (show, new session, quit) + taskbar flash on attention. |
| `SettingsInstaller` | Writes `~/.claude/settings.json` hook entries on launch, removes on quit. |

### React webview (TypeScript)

Mounted once, lives for the app's lifetime.

| Slice | Keeps |
|---|---|
| `store/sessions.ts` | `order: SessionId[]`, `byId: Record<SessionId, SessionEntry>`, `activeId` |
| `store/tree.ts` | Per-session file tree + activity snapshot |
| `store/ui.ts` | Sidebar width, density, command-palette open state |
| `store/recentCwds.ts` | Last 10 opened workspaces (persisted via `zustand/middleware`) |

All derivations (`deriveSessionList`, `deriveStateCounts`, `deriveActiveSession`) are plain functions called from `useMemo` — never used as Zustand selectors directly, to avoid fresh-object snapshot bugs with `useSyncExternalStore`.

## The IPC contract

Frontend and backend talk through a *typed* interface. One wrapper (`src/lib/ipc.ts`) routes everything:

```ts
// Frontend → Rust
api.createSession({ cwd, cols, rows })
api.killSession(id)
api.renameSession(id, name)
api.writeSession(id, data)
...

// Rust → Frontend (events)
on.sessionCreated(cb)
on.sessionData(cb)    // streaming PTY output
on.sessionState(cb)   // FSM transitions
on.treeEvent(cb)
on.activityDelta(cb)
...
```

Types live in `src/lib/bindings.ts` (TypeScript) and mirror Rust structs in `src-tauri/src/types.rs`. When running in a plain browser (no `__TAURI_INTERNALS__`), the whole surface is shimmed by `src/lib/mock.ts` — enabling fast UI iteration without spinning up the full Tauri shell.

## Session state machine

Each session is exactly one of:

```
Starting  — spawning, not yet ready
Running   — claude is actively producing output
Working   — claude is mid-tool-invocation (derived from pre-tool-use hook)
Idle      — no activity for 5 minutes
AwaitingUser       — stopped, possibly awaiting input (entered 1.5s after stop hook, if no follow-up)
AwaitingPermission — notification hook fired, user interaction required
Exited    — process terminated (voluntary or not)
```

Transitions are driven by:
- **Hooks from Claude Code**: `user-prompt-submit`, `pre-tool-use`, `post-tool-use`, `stop`, `notification`
- **Timers**: idle watchdog (5 min), post-stop grace (1.5 s)
- **User actions**: write → bumps out of Idle; kill → Exited

## Hook protocol

Claude Code's settings schema lets us register `command` hooks per event. On launch Clauditor writes entries to `~/.claude/settings.json`:

```json
"hooks": {
  "PreToolUse": [{
    "_clauditor": true,
    "hooks": [{ "type": "command",
                "command": "powershell -File \"~/.claude/clauditor-hook.ps1\" pre-tool-use" }]
  }],
  ...
}
```

The hook script POSTs to `http://127.0.0.1:27182/hook/<event>` with:
- The full Claude Code event payload
- An added `clauditor_ppid` field (parent process ID of the hook process)
- A bearer token via `X-Clauditor-Token` header

**Session attribution uses PPID, not env vars.** Env vars leak to descendant processes — if a Claude Code session spawned another Claude Code, env-based attribution would misroute. The hook's parent PID at the OS level is always the `claude` binary for that exact session.

On quit, Clauditor removes its entries (identified by the `_clauditor: true` sentinel) from `settings.json`.

## Persistence

`~/AppData/Local/dev.clauditor.app/session-store.json` (Windows, analogous on mac/linux). Written with 500 ms debounce from any of `create`, `exit`, `rename`, `forget`. Atomic write via `tmp → rename`. On startup, parsed and re-inflated as *stubbed* sessions (no PTY) until the user restarts them explicitly.

If the file is malformed: moved aside to `session-store.json.corrupt` and we start fresh.

## Release + distribution

| Layer | Mechanism |
|---|---|
| CI | GitHub Actions matrix (Win x64, macOS arm64 + x64, Linux x64 + arm64) |
| Build | `tauri build --target <triple>` per matrix entry |
| Bundling | Tauri ships per-platform installers: `.msi` / `.exe` (NSIS) / `.dmg` / `.AppImage` / `.deb` / `.rpm` |
| Attestation | `actions/attest-build-provenance@v1` — every bundle gets a sigstore signature |
| Release page | Drafted automatically on tag push, 9 installers attached |
| Download site | `site/index.html` on GitHub Pages — queries GH API for latest release, auto-selects best installer for the visitor's OS |

Verify any installer with:
```bash
gh attestation verify <installer> --repo huylq98/clauditor
```

## See also

- `docs/adr/` — Architecture Decision Records explaining *why* key choices were made.
- `docs/perf-budgets.md` — latency budgets baked into the CI perf suite.
- `CONTRIBUTING.md` — setup, commit conventions, test matrix.
- `SECURITY.md` — threat model, vulnerability reporting.
- `CLAUDE.md` / `AGENTS.md` — AI-agent guide (directory map, invariants).
