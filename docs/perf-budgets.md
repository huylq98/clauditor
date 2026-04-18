# Performance budgets

Budgets baked into `tests/perf.spec.ts`. Runs on every PR (informational, doesn't gate merge — CI runner CPU varies too much).

## Budget table

| Metric | Good | Acceptable | Source |
|---|---|---|---|
| Initial hydration (first paint) | ≤ 150 ms | ≤ 500 ms | RAIL *Load* |
| Palette open (⌘K) | ≤ 100 ms | ≤ 200 ms | Web Vitals INP |
| Sidebar toggle (⌘B) | ≤ 100 ms | ≤ 200 ms | Web Vitals INP |
| Session create (⌘T → tab appears) | ≤ 150 ms | ≤ 400 ms | RAIL *Response* |
| Tab switch | ≤ 50 ms | ≤ 120 ms | VS Code / Warp convention |
| Keystroke → paint | ≤ 16 ms | ≤ 33 ms | 1–2 frames at 60 Hz (Warp / Alacritty) |

## Why these thresholds

### Nielsen's 3 limits
- **< 100 ms** — feels instantaneous; no visible feedback needed.
- **< 1 s** — user's flow of thought is uninterrupted.
- **> 10 s** — attention is lost; background task territory.

### Google RAIL (Response / Animation / Idle / Load)
- **Response** ≤ 100 ms — button click / interaction acknowledgement.
- **Animation** — 60 fps, which means a 16 ms frame budget.
- **Idle** ≤ 50 ms — chunks of deferred work that keep the main thread responsive.
- **Load** ≤ 1 s for core content.

### Web Vitals INP (Interaction to Next Paint)
- Good ≤ 200 ms, needs-work ≤ 500 ms, poor > 500 ms.
- Measured per interaction, rolled up as a 75th-percentile stat.

### Desktop app conventions
- **VS Code** — tab switch target is ≤ 50 ms.
- **Warp / Alacritty / kitty** — keystroke-to-paint under one frame (16 ms at 60 Hz).

## Prod-build baseline

From a `perf:prod` run after the pnpm migration (production Vite build, median of 5):

| Metric | Measured | Grade |
|---|---|---|
| Initial hydration | 51 ms | ✅ good |
| Palette open | 74 ms | ✅ good |
| Sidebar toggle | 37 ms | ✅ good |
| Session create | 217 ms | 🟡 acceptable (mock backend; real PTY will add ~50–200 ms) |
| Tab switch | 84 ms | 🟡 acceptable |

**Tab switch is the weakest metric.** 84 ms is sub-perceptual (< 100 ms) but above the 50 ms aspirational target. Main cost: rendering every tab + every `TerminalHost` when `activeId` changes. Mitigations in place:
- `Tab` component is `React.memo` with stable callbacks.
- `TerminalHost` is `React.memo` with a custom comparator keyed on `(sessionId, active)`.

Further gains would require virtualizing the tab list or shifting terminal rendering out of React's reconciler entirely.

## Running the suite locally

```bash
pnpm perf          # against Vite dev server
pnpm perf:prod     # against production build (more realistic)
```

Reports land in `tests/artifacts/perf/` as JSON + a Markdown summary.

## When a budget is wrong

If a measurement is consistently red on a machine that feels fine to a human, the budget is wrong, not the app. Update `BUDGETS` in `tests/perf.spec.ts` with a note explaining the reason in the same PR.
