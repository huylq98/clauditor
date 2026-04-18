# UI / UX review

Source: agent review against Nielsen's heuristics, WCAG 2.2 AA, macOS/Windows HIG, and native terminal affordances.

## P0 — must-fix before next user-facing release

1. **Tab close button under WCAG target size** — `src/components/TabBar.tsx:174–187` is 20×20. Min 24×24. *Fix:* `h-6 w-6` + padding.
2. **Status bar button targets < 24×24** — `src/components/StatusBar.tsx:31`, `52–60` use `size="sm"` (h-7). *Fix:* `md` (h-8) or an explicit `min-height`.
3. **Dialog overlay click-outside undiscoverable** — AlertDialog / CommandPalette / ShortcutsDialog overlays have no `aria-label` or focusable affordance. *Fix:* add `aria-label="Close dialog"` and make sure Escape is announced.
4. **`Ctrl+1–9` session jumps are unpredictable** — `useKeyboardShortcuts.ts:40–49` maps by position, but positions aren't shown. *Fix:* badge "1" … "9" on the first 9 tabs.
5. **Confirm button's focus ring invisible on mouse click** — `alert-dialog.tsx:75–87` relies on `:focus-visible` which Chrome suppresses after click. For destructive actions, always show the outline. *Fix:* add `:focus` style alongside `:focus-visible`.

## P1

6. **Terminal search overlay close button unreachable by Tab** — `TerminalHost.tsx:167–225`. *Fix:* ensure tab order is input → prev → next → close.
7. **Sidebar resize handle is 8px with no keyboard fallback** — `Sidebar.tsx:158–172`. *Fix:* add `Ctrl+Shift+←/→` to adjust width.
8. **State badge conveys meaning by color alone** — `ui/state-badge.tsx:14–35`. Color-blind users can't distinguish running/idle/working. *Fix:* pattern or iconography, not just hue.
9. **Command palette group headings aren't semantic** — `CommandPalette.tsx:96–140`. *Fix:* `role="heading" aria-level="3"` on group headers.
10. **Edit-tab rename collides with close** — blurring while editing commits; closing while editing discards. *Fix:* on close-while-editing, commit current value and show a toast.
11. **Command palette help text is `sr-only`** — `CommandPalette.tsx:79–90`. Sighted users don't see `↑↓ Enter Esc`. *Fix:* surface one visible hint under the input.
12. **Empty-state CTA lacks hover/focus contrast** — `EmptyState.tsx:38–46`. *Fix:* `hover:opacity-90` and explicit focus ring.

## P2

13. **Search input placeholder contrast ~2.8:1** — `TerminalHost.tsx:193–197`. *Fix:* use `--color-fg-muted`.
14. **File-tree search focus border at 50% opacity** — `FileTree.tsx:59–64`. *Fix:* full opacity + `focus:ring`.
15. **Activity tool bars lack accessible labels** — `ActivityPanel.tsx:60–73`. *Fix:* `aria-label="${name}: ${count} calls"`.
16. **Tooltip-only shortcut discovery** — `ui/icon-button.tsx:38–49`. *Consider:* persistent 3–5 common shortcuts as badges.
17. **Focus returns to body after rename commit** — `TabBar.tsx:213–220`. *Fix:* refocus the tab element.
18. **Collapsed-sidebar expand button lacks tooltip** while expanded version has one — `Sidebar.tsx:20–27`. *Fix:* mirror the tooltip.
19. **macOS / Windows chrome difference undocumented** — `TitleBar.tsx:40–64`. *Fix:* README note + a discreet affordance.
20. **Kill-session has no undo** (Forget does). *Fix:* 3s undo toast via `api.restartSession`.
21. **Custom session names truncate without a tooltip** — `TabBar.tsx:149–157`. *Fix:* `title={s.name || s.cwd}`.
22. **Disabled buttons only use opacity-50** — `ui/button.tsx:7`. *Fix:* add `disabled:text-[var(--color-fg-subtle)]`.

## Nits

23. "No results" palette copy too faint. Use `--color-fg-muted`.
24. Tooltip positioning not constrained; may overflow at window edges.
25. Activity panel empty state has no copy ("Waiting for Claude…").
26. Terminal scrollbar opacity 0.06 is invisible on many monitors; bump to 0.12.
27. `ShortcutsDialog` title `text-base` is small for a dialog header.
28. Palette item path `text-[10.5px]` is hard to read; 11–11.5px minimum.
29. Overflowing tab bar lacks a gradient/overflow indicator.

## Scriptable subset

Most of P0/P1 here can be enforced by tests rather than just review notes:

- **Touch target size** — Playwright `toHaveBoundingBox({ height: >= 24, width: >= 24 })` on every interactive element in the smoke suite.
- **Contrast** — `axe-core` via `@axe-core/playwright` inside `test:ui-review`; fail on AA violations.
- **`aria-label` presence** on `button`, `a`, `[role="button"]` — same axe run.
- **Tab order** — Playwright keyboard walk through dialogs, asserting expected focus sequence.

See doc 06 for concrete CI additions.
