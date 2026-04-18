# Frontend simplify findings (React / TS)

Source: agent review of `src/**/*.{ts,tsx}` (~2,800 LOC). Overall codebase is clean; most flagged items are minor. Agent explicitly verified the three CLAUDE.md invariants (TerminalHost lifetime, capture-phase shortcuts, Zustand derivation pattern) and found no violations.

## Top ROI (apply first)

1. **src/lib/utils.ts:8–14** — `formatRelativeTime()` is never imported. Delete.
2. **src/components/ui/button.tsx:52** — `buttonVariants` is exported but never imported outside. Drop the export (keep internal).
3. **Dedup `isMac` detection** — duplicated in `ShortcutsDialog.tsx:6`, `EmptyState.tsx:9`, `TitleBar.tsx:5–6`. Extract to `src/lib/utils.ts`.
4. **src/store/ui.ts:8** — `density: 'compact' | 'comfortable'` is never read or written. Delete slice + setter.
5. **src/components/TitleBar.tsx:36–37** — reserved center div ("could show active workspace") is dead. Delete.
6. **src/lib/bindings.ts** — `KillSummary` / `RestartSummary` / `ForgetSummary` are three types that each wrap a single count field. Collapse to inline shape or a single generic.
7. **src/lib/bindings.ts:54–59** — `FilePreview` type exists but `readFile()` is never called from the frontend. Delete if not planned; otherwise add a comment noting it's reserved.
8. **src/store/tree.ts:10–15** — `emptyActivity()` factory is called 3 times. Replace with a module-level `const EMPTY_ACTIVITY` to avoid re-allocating the object.
9. **src/lib/terminal.ts:58–64** — `dispose()` wraps `xterm.dispose()` in a silent try/catch. `dispose()` doesn't throw; delete the guard.

## Small cleanups

10. **src/store/sessions.ts:40** — `remove()` defensive `if (!state.byId[id]) return state` — drop, trust callers.
11. **src/store/sessions.ts:52** — Same pattern in `setState()`; one-line comment if keeping.
12. **src/store/tree.ts:95** — Same pattern in `drop()`.
13. **src/components/Sidebar.tsx:100–127** — `SidebarSection` + `EmptySectionHint` are each used twice. Inline them.
14. **src/components/Sidebar.tsx:130–146** — ResizeHandle mutates `document.body.style` directly; move to a `resizing` class.
15. **src/components/TerminalHost.tsx:165–226** — Magic numbers `w-52`, `right-3`, `top-3` for the search overlay. Extract named constants (trivial).
16. **src/components/FileTree.tsx:68** — Rename `parentRef` → `containerRef`.
17. **src/components/CommandPalette.tsx:184–188** — Rename `shortenPath` → `displayPathTail`.
18. **src/components/CommandPalette.tsx:52–56** — `run()` wrapper appears 6 times. Keep if it clarifies intent; otherwise inline `close(); void fn()`.

## Medium effort (consider but not urgent)

19. **src/components/TerminalHost.tsx:56–109** — Two large setup effects; extract to `useTerminalSetup()` hook.
20. **src/components/TabBar.tsx:94–107** — `Tab` component takes 11 props. Split into container + presentational.
21. **src/App.tsx** — No `ErrorBoundary`; one component crash tears down the whole app. Worth adding a single boundary around main content.
22. **src/store/tree.ts:44–57** — `applyTreeEvent` does `splice` + `sort` on each add/remove. For directories > ~1k entries this is O(n log n) per event. Consider a `Map`-based index with lazy sort at render.

## Non-issues verified (confirm compliance)

- Keyboard shortcuts everywhere use capture phase (TerminalHost, CommandPalette, ShortcutsDialog, useKeyboardShortcuts). ✓
- `TerminalHost` memo + per-session mount-for-lifetime pattern is correct. ✓
- All Zustand derivation functions (`deriveSessionList`, `deriveStateCounts`, `deriveActiveSession`) are called through `useMemo` in consumers. ✓

## Dead code quick list

- `formatRelativeTime`, `buttonVariants` (export), `density` slice, `FilePreview` type, reserved TitleBar center div, speculative `dense?` prop on `SidebarSection`.
