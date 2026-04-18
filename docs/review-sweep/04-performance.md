# Performance review vs VS Code baseline

Source: agent review of Rust + frontend + build config. Target: cold-start < 1.5s, tab switch < 50ms, paint < 16ms, idle mem < 200MB/window.

## Critical

1. **PTY buffer drain-and-extend** — `src-tauri/src/pty_manager.rs:41–47`. High-output sessions cause reallocations → 50–150ms jitter spikes.
   **Fix:** ring buffer, fixed 1MB cap.

2. **Synchronous `listTree` IPC blocks tab switches** — `src/components/FileTree.tsx:21–32`. No AbortController; rapid switching queues unbounded requests.
   **Fix:** AbortController + stale-while-revalidate.

3. **All `TerminalHost` instances permanently mounted** — `src/App.tsx:165–168`. ~5–10MB per xterm. No cap on session count.
   **Tradeoff:** CLAUDE.md explicitly requires lifetime mount to preserve scrollback. VS Code-style solution would be buffer rehydration on re-mount.
   **Suggested approach:** keep the invariant; add a session count soft-cap with warning at ~15; explore xterm `serialize/import` for cold-storage of backgrounded terminals.

4. **`StateDot` re-renders per activity event** — `src/components/TabBar.tsx:159`. Any session state change renders the full tab list if selectors aren't fully stable.
   **Fix:** verify `StateDot` is `React.memo`; confirm `Tab` props don't include a fresh object.

## High-ROI (apply first)

5. **`applyTreeEvent` spreads entire `bySession`** — `src/store/tree.ts:36–39`. Unrelated subscribers re-render on every file event. 30–60ms cross-session stalls.
   **Fix:** per-session subscriptions via `subscribeWithSelector`, or surgically mutate the bucket.

6. **Activity Panel top-5 recomputed every render** — `src/components/ActivityPanel.tsx:36–38`.
   **Fix:** `useMemo(() => entries.sort().slice(0, 5), [activity.tools])`.

7. **O(n) PID lookup on every hook** — `src-tauri/src/hook_server.rs:56–95`.
   **Fix:** parallel `PID → SID` hashmap; invalidate on session kill.

8. **No debounce on file-watcher events** — `src-tauri/src/file_watcher.rs:43–102`. Large writes flood IPC with 50+ events.
   **Fix:** 100–200ms coalescing window in the notify callback.

## Medium

9. **`probeDims()` creates+destroys an xterm per new session** — `src/lib/terminal.ts:79–101`.
   **Fix:** measure once, cache; re-measure only on window resize.

10. **`SearchAddon` always loaded** — `src/lib/terminal.ts`. ~50–100KB bundle + keystroke hook.
    **Fix:** lazy-import on first `Ctrl+F`.

11. **Framer Motion on dialog fade** — `src/components/CommandPalette.tsx:66–70`.
    **Fix:** swap to plain CSS transition for 2-state fades; keep Framer Motion for reordering only.

12. **Per-session idle timers** — `src-tauri/src/state_engine.rs:188–207`. N tokio tasks for N sessions; fine at 10, wasteful at 100.
    **Fix:** single central timer scans the map each minute.

## Long-term (VS-Code-level)

13. **No shared WebGL renderer across terminals** — each xterm grabs its own context. Browser WebGL context ceiling is typically 16; >16 sessions degrade hard.
    **Fix (major):** offscreen canvas + terminal multiplex.

14. **No cancellation + background indexing for file tree** — large monorepos block mount. No partial-result streaming.
    **Fix:** stream results, honor AbortSignal end-to-end (frontend + Tauri command).

15. **Tab-switch uses layout-affecting CSS** — `src/components/TabBar.tsx:124–157`.
    **Fix:** `transform` / `opacity`-only transitions; pre-compute tab positions.

16. **Activity deltas not batched** — `src-tauri/src/activity_service.rs:61–110`. 10 tool calls = 10 events + 10 re-renders.
    **Fix:** 100–200ms interval flusher in the service.

17. **Session store serializes all buffers on every save** — `src-tauri/src/session_store.rs:81–106`. 500ms debounce is good; payload size is not.
    **Fix:** dirty-set tracking; only serialize changed sessions; optional: swap JSON for bincode on the buffer payload only.

## Build / Bundle

18. **No `vite.config.ts` manualChunks** — single bundle, ~500–800KB critical path.
    **Fix:** split xterm, framer-motion, radix-ui, and lazy-load palette + file tree.

19. **`tsconfig.app.json:8` `skipLibCheck: true`** — hides dep-type regressions.
    **Fix:** remove, or run `tsc -b --noEmit` in a separate CI step with it off.

20. **Addon audit** — confirm every `@xterm/addon-*` is actually used.

## Recommended 5-item quick wins

1. Ring-buffer PTY backing store (#1)
2. AbortController on `listTree` IPC (#2)
3. `useMemo` Activity top-5 (#6)
4. 150ms debounce on file-watcher events (#8)
5. Vite manualChunks for xterm + framer-motion (#18)

Agent estimates these alone net **50–100ms perceived latency reduction** across main flows.

## Measurement plan

Before applying any fix, capture baseline via `pnpm perf:prod` and save to `tests/artifacts/perf/baseline-*.json`. After each fix, re-run and diff. Promote regressions (> budget) to blocking in `tests/perf.spec.ts` once the baselines stabilize.
