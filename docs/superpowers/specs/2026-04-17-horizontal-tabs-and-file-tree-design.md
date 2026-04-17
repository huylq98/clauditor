# Horizontal session tabs + per-session file tree

**Date:** 2026-04-17
**Status:** Design

## Problem

The current Clauditor shell has a single left sidebar listing sessions and a main pane holding the xterm terminal. When a Claude session runs a task, the user can read the terminal stream but has no passive view of which files the agent is touching — they have to scrape the terminal or open an external file explorer. The sidebar also can't serve two roles at once (session picker *and* file explorer).

The goals of this redesign:

1. Move session selection to **horizontal tabs** so the sidebar is free for per-session content.
2. Use the sidebar to show the **active session's folder tree** with **activity overlays** marking files Claude has modified (session-scoped) and is currently touching (live).
3. Add a **file search** above the tree so navigating a large repo isn't just vertical scrolling.

Out of scope for this spec: inline diffs, file viewer, git-dirty awareness beyond Claude's own edits, multi-root workspaces.

## Layout

```
┌─────────────────────────────────────────────────────────┐
│  ◆ Clauditor / session manager        2 running · idle  │   #rail
├─────────────────────────────────────────────────────────┤
│  ● auth-api   ● frontend   ○ docs    +                  │   #tabbar (new)
├──────────────┬──────────────────────────────────────────┤
│ ⌕ filter…    │  working dir: ~/projects/auth-api        │   #topbar
│              │  ● running                       [Kill]  │
│ Files        │                                          │
│ ▾ src/       │  (xterm terminal)                        │   #terminal-container
│   ● routes.js│                                          │
│   + auth.js  │                                          │
│   index.js   │                                          │
│ ▸ tests/     ├──────────────────────────────────────────┤
│              │                                          │
│ Activity     │  status bar                              │   #statusbar
│   …recent…   │                                          │
└──────────────┴──────────────────────────────────────────┘
    #sidebar                #main
```

- `#rail` keeps brand + aggregate state counts. Unchanged.
- `#tabbar` is new — horizontal strip under the rail, holds the session tabs and a trailing `+ new` button.
- `#sidebar` switches from "session list" to "per-session file explorer": search input, tree, and collapsible activity panel.
- `#main` (topbar + terminal + statusbar) keeps its current structure and IPC contract.

## Components

### Tab bar (`#tabbar`)

Each tab:

- State dot (reuses existing `.status-dot` styles — `running | awaiting_user | awaiting_permission | idle | exited`).
- Session name (editable via double-click, same flow as the current sidebar rename).
- Hover-revealed `×` close button: same behavior as `Ctrl+W` — confirms before killing a running session, removes an exited one immediately.
- Right-click context menu: Rename, Reveal cwd in OS, Kill / Restart, Close.

Bar-level:

- Active tab: orange underline + slightly lighter background.
- Overflow: horizontal scroll with a subtle fade-mask at the right edge. Mouse wheel is translated to horizontal scroll over the bar.
- `+` new-session button pinned after the last tab. Replaces the current sidebar `+ new` button.

Keyboard:

- `Ctrl+Tab` / `Ctrl+Shift+Tab` — cycle forward / backward.
- `Ctrl+1` through `Ctrl+9` — jump to tab by index.
- `Ctrl+W` — close active tab (confirm prompt if still running).

### Sidebar (`#sidebar`)

Three vertically stacked regions:

**1. Search (top, fixed height).** One input, `placeholder="filter files…"`. Fuzzy match on relative path. Behavior:

- Typing filters the tree in place: non-matching paths hidden, ancestors of matches auto-expanded.
- `↑ / ↓` move selection through visible matches; `Enter` reveals the selected file in the OS explorer.
- `Esc` clears the query and restores the tree.

**2. File tree (middle, flexes).** Root = the active session's `cwd`. Lazy-loaded on expand.

- Ignore list (hidden from tree and from search):
  - Hard-coded: `.git`, `node_modules`, `dist`, `build`, `.next`, `.cache`, `out`.
  - Plus top-level entries from `.gitignore` at `cwd` root if present (best-effort — parse line-by-line, skip comments and negations for v1).
- Icons: `▾` / `▸` for expandable folders, `·` for files.
- Activity overlays (the "what is Claude touching" signal):
  - **`●` (orange)** — file was modified in this session. Persists for the session's lifetime.
  - **`+` (green)** — file was created in this session. Persists for the session's lifetime (promoted to `●` if also later modified).
  - **Live pulse / bold name** — a pre-tool-use hook fired for this file and the matching post-tool-use has not arrived. Cleared on post-tool-use or after a 3s timeout.
- Interactions:
  - Single click — select (highlight in tree).
  - Double click — reveal in OS explorer (`shell.showItemInFolder`).
  - Right click — context menu: Reveal, Copy path, Copy relative path.

**3. Activity panel (bottom, collapsible, fixed ~25% height when open).**

- Last 20 file operations for the active session, newest on top.
- Row: `HH:MM:SS · kind · relative/path`. Kinds: `read | edit | write | delete`.
- Click a row: if the file still exists, scroll the tree to it and highlight. Deletions are informational only.
- Deletions live only in this panel — the tree follows disk truth, so a deleted file disappears from the tree but the operation stays logged here.

## Data flow

```
Claude Code process
   │
   ├── fs writes/reads ────────────────┐
   │                                   ▼
   │                          chokidar watcher (main)
   │                                   │
   │                                   ▼
   │                          session:tree events (IPC)
   │                                   │
   └── pre/post-tool-use hook          │
            │                          │
            ▼                          │
       hook-server.js                  │
       (parses tool_input.file_path)   │
            │                          │
            ▼                          │
       session:activity events (IPC)   │
            │                          │
            └──────────┬───────────────┘
                       ▼
                    renderer
                    (sessions Map holds
                     tree, activity log,
                     live-touching set)
```

### Main process

**`src/main/file-watcher.js` (new).** Exports a `FileWatcher` class. Per session:

```
create(sessionId, cwd) → starts chokidar.watch(cwd, { ignored, ignoreInitial: false, depth: 0 })
                         lazy-expands subtrees on IPC requests
                         emits 'entry' / 'unlink' / 'change' events tagged with sessionId
destroy(sessionId)    → stops watcher, releases resources
list(sessionId, path) → returns direntries for a given subtree
```

Ignored patterns: the hard-coded list + `.gitignore` top-level entries.

**`src/main/hook-server.js` (extend).** The existing handler only dispatches the hook name to `stateEngine`. Add a second side-effect: for `pre-tool-use` and `post-tool-use`, inspect `payload.tool_name` and `payload.tool_input`:

- If `tool_name ∈ {Read, Write, Edit, MultiEdit, NotebookEdit}` and `tool_input.file_path` is a string, emit a `session:activity` event: `{ sid, tool, phase: pre|post, path: absOrRel, ts: Date.now() }`.
- Listeners: the `FileActivityService` (new) that maintains per-session state (see below).

**`src/main/file-activity-service.js` (new).** Keeps per-session state:

- `Set<string>` of paths modified this session.
- `Set<string>` of paths created this session.
- `Map<path, timestamp>` of paths currently "touching" (pre-tool-use seen, post-tool-use pending).
- Ring buffer of the last 20 operations.

Exposes getters for hydration and emits deltas over IPC (`session:activity-delta`) so the renderer can update overlays and the activity panel.

**`src/main/index.js` (wire-up).** On session create: start a `FileWatcher` and register the session with `FileActivityService`. On session destroy: stop the watcher and drop the activity state.

**`src/preload/preload.js` (extend).** Add to the `clauditor` object (flat names, matching the existing `listSessions` / `createSession` / `onCreated` style):

- `listTree(sessionId, relPath)` → `Promise<Direntry[]>`.
- `onTreeEvent(cb)` → fires on fs change for any watched session (callback receives `(sessionId, event)`).
- `getActivitySnapshot(sessionId)` → current modified / created / touching sets + recent ring buffer.
- `onActivityDelta(cb)` → incremental updates (callback receives `(sessionId, delta)`).

### Renderer

`renderer.js` session entries gain fields:

```js
{
  ...,
  tree: {
    root: string,
    expanded: Set<string>,
    children: Map<string, Array<Direntry>>,
    filterQuery: string,
  },
  activity: {
    modified: Set<string>,
    created: Set<string>,
    touching: Map<string, timeoutId>,
    log: Array<{ ts, kind, path }>, // capped at 20
  },
}
```

UI modules split out of `renderer.js` (keeps the file from growing unbounded):

- `src/renderer/components/tabbar.js` — owns `#tabbar` rendering + keyboard shortcuts.
- `src/renderer/components/sidebar.js` — owns search, tree rendering, activity panel.
- `src/renderer/components/tree.js` — pure view logic (fuzzy match, flatten with ignore list, overlay classes).

`renderer.js` becomes the orchestrator (session map, IPC event fanout, terminal lifecycle) and imports these.

## Error handling

- Watcher errors (EMFILE, permission denied on a subtree) are logged and surfaced as a one-line inline notice in the sidebar: "couldn't watch /some/path — tree may be stale". The rest of the tree keeps working.
- Hook payloads missing `tool_input.file_path` are silently ignored — not every tool has a file path.
- Paths are normalized to absolute form before comparison; the renderer displays them relative to the session `cwd`.
- If `cwd` becomes invalid (deleted while session runs), the sidebar shows an empty state "cwd no longer exists" and stops the watcher.

## Testing strategy

**Unit (`tests/unit/`)**

- `tree.test.js` — fuzzy match, ignore-list application, event-to-state reducer.
- `gitignore.test.js` — top-level pattern parsing.
- `file-activity-service.test.js` — state transitions on pre/post-tool-use, TTL expiry for "touching" entries, ring-buffer eviction.

**Integration (`tests/pty/`)**

- `file-watcher.test.js` — spawn a session, write a file into its `cwd` via `fs.promises.writeFile`, assert the renderer receives an `add` event with the right path.

**E2E (`tests/e2e/`)**

- `tabs.spec.js` — create two sessions, verify tabs render, `Ctrl+1` / `Ctrl+2` switch active, sidebar tree updates to match.
- `activity-overlay.spec.js` — simulate a pre-tool-use hook via the test bridge, assert the targeted file shows the "touching" class; simulate post-tool-use, assert it gains the `modified` class and clears the "touching" class.
- `search.spec.js` — type into the search box, assert non-matching paths are hidden and matches are ancestor-expanded.

## Migration

- Delete the old `#sidebar` session list + footer markup.
- Delete `renderList()` / `renderAggregate()` from `renderer.js` and replace with calls into the new `tabbar.js` module.
- Keyboard shortcut `Ctrl+T` (new session) — if the current app registers one, it stays; otherwise add it as part of this work.
- No persisted state changes; sessions are ephemeral across restarts today.

## Rollout

Single release, no feature flag. This is a ground-up UI change and carrying two shells side-by-side is worse than a clean cut.
