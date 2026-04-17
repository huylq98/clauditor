---
name: Playwright + Electron testing harness
date: 2026-04-15
status: draft
---

# Playwright + Electron Testing Harness

## Goal

Add an automated test suite for Clauditor that an AI assistant (or CI) can run headlessly with a single command and parse the results from stdout. Cover three layers — unit, end-to-end UI, and PTY integration — using one runner and one report format.

## Replaces

An ad-hoc Windows-only PowerShell `PrintWindow` script (`.shot.ps1`) plus committed PNGs (`.shot-*.png`) was previously used to eyeball whether the Clauditor window had rendered and whether a Claude Code session was visibly present. That workflow was manual, platform-bound, and required a human to inspect the output. The Playwright harness must give equivalent or better assurance programmatically (see "Coverage parity with the prior screenshot workflow" below). The script and screenshots have been removed.

## Non-goals

- Visual regression / screenshot diffing.
- Testing against the real `claude` CLI on every run (covered by an opt-in smoke layer, see below).
- Cross-platform CI matrix setup (this spec scopes the local harness; CI wiring is a follow-up).

## Stack

- **`@playwright/test`** as the sole test runner. One config, one reporter, one `npm test` command.
- **`playwright`'s `_electron` API** for launching the real Electron app under test.
- No additional unit framework. Plain `test()` from `@playwright/test` works fine for pure-Node unit tests of `state-engine.js` and `hook-server.js`.

Rationale: minimizes tool count and produces a single machine-readable report. Vitest would be more idiomatic for unit tests but adds a second runner, config, and report format for marginal benefit at this scale.

## Layout

```
tests/
  unit/                       # plain Node, no Electron
    state-engine.test.js
    hook-server.test.js
  e2e/                        # Playwright + _electron
    launch.test.js            # smoke: app boots, window renders
    session-lifecycle.test.js # spawn/rename/kill via UI
    tray.test.js
  pty/                        # real PTY, fake CLI binary
    spawn-and-write.test.js
    buffer-and-resize.test.js
  fixtures/
    fake-claude.js            # deterministic stand-in for `claude`
    real-claude-output.txt    # captured ANSI replay (optional)
  helpers/
    launch-app.js             # wraps _electron.launch with test env
    # xterm buffer reader lives in renderer.js as window.__clauditorTest.getActiveTermBuffer
playwright.config.js
```

## Test layers

### Unit (`tests/unit/`)
- Imports modules directly from `src/main/` and tests them as plain Node.
- Targets: `state-engine.js` (event reducer logic), `hook-server.js` (HTTP routing, token check).
- Fast, no Electron, no PTY.

### E2E (`tests/e2e/`)
- Each test calls `helpers/launch-app.js` which invokes `_electron.launch({ args: ['.'], env: { CLAUDITOR_TEST: '1', CLAUDITOR_CLI_OVERRIDE: <path-to-fake-claude.js> } })`.
- Asserts via the renderer's DOM (`page.locator(...)`).
- Reads xterm output via `page.evaluate()` reaching into a test-only `window.__clauditorTest` hook (see "Test hooks" below).
- Tests the full IPC + main + renderer stack but with the fake CLI.

### PTY (`tests/pty/`)
- Imports `PTYManager` directly (no Electron), spawns the fake CLI, exercises `spawn`, `write`, `resize`, `kill`, `onData`, `onExit`.
- Verifies the contract `pty-manager.js` depends on without UI overhead.

## Fake CLI

`tests/fixtures/fake-claude.js` — a small Node script that:
- Prints a deterministic banner on start.
- Echoes whatever it receives on stdin, line by line, with a recognizable prefix.
- Responds to a few canned tokens (e.g., receiving `__exit__\n` causes a clean exit; `__crash__\n` exits non-zero) so tests can drive lifecycle paths.
- Optional: an `--ansi-replay <fixture>` mode that streams bytes from `real-claude-output.txt` to validate that the renderer handles real ANSI sequences. The fixture is captured once by hand from a real `claude` session and committed.

## Wiring `pty-manager.js` for test override

Add a single early-return inside `resolveClaude()`:

```js
if (process.env.CLAUDITOR_CLI_OVERRIDE) {
  return process.env.CLAUDITOR_CLI_OVERRIDE;
}
```

Effect: when the env var is set, the PTY spawns whatever path it points at instead of searching for `claude`. Production behavior is unchanged when the var is unset. The fake CLI ships with a shebang and is invoked directly on POSIX; on Windows the helper invokes `node <path>` via a wrapper `.cmd` to avoid shebang issues.

## Test hooks in the renderer

Add a guarded block in the renderer (active only when `process.env.CLAUDITOR_TEST === '1'`, surfaced to the renderer via preload) that exposes:

```js
window.__clauditorTest = {
  getActiveTermBuffer: () => /* serialize term.buffer.active to string */,
  getSessions: () => /* current session list from renderer state */,
};
```

This is the smallest surface needed for assertions and is gated behind the `CLAUDITOR_TEST` env var, which is never set in shipped builds.

## Coverage parity with the prior screenshot workflow

The retired `.shot.ps1` workflow was used to verify three things by eye. Each must be covered programmatically:

| Prior visual check | Replacement assertion | Test file |
|---|---|---|
| "Clauditor main window is up and rendered" | `_electron.launch()` succeeds, `firstWindow()` resolves, `document.readyState === 'complete'`, root layout container is visible. | `tests/e2e/launch.test.js` |
| "A Claude Code session pane is visible inside Clauditor" | After spawning a session via the UI, the session tab/pane element exists and the xterm canvas is mounted with non-zero dimensions. | `tests/e2e/session-lifecycle.test.js` |
| "The Claude Code TUI is actually drawing content (not blank/black)" | Read the xterm buffer via `window.__clauditorTest.getActiveTermBuffer()` after the fake CLI's banner has been written; assert the banner string is present. Optionally assert against the ANSI-replay fixture to confirm escape sequences render to expected text. | `tests/e2e/session-lifecycle.test.js` |

These three assertions together replace the human-in-the-loop screenshot inspection. No image diffing is required because the underlying questions ("did it launch", "is the session pane there", "is content being drawn") all reduce to DOM and buffer assertions.

## Headless behavior

Playwright launches the real Electron binary; on Windows there is no true headless Electron. The harness will:
- Set `show: false` on `BrowserWindow` when `CLAUDITOR_TEST=1` so windows do not flash on screen.
- Tray UI tests will spawn a real (hidden) window and assert tray menu structure via the main-process API rather than clicking the tray icon.

On Linux/CI, `xvfb-run` can be used; this is documented in the README addition but not required for the harness itself.

## Running

- `npm test` → runs all three layers, line reporter to stdout, `json` reporter to `test-results/results.json`.
- `npm run test:unit`, `npm run test:e2e`, `npm run test:pty` → individual layers.
- `npm run test:smoke-real` (opt-in, not part of `npm test`) → runs a minimal subset against the real `claude` binary. Skipped automatically if `claude` is not on PATH.

## Reporter / output format

- **`list`** reporter for human-readable stdout.
- **`json`** reporter to `test-results/results.json` so the assistant can read structured pass/fail.
- Failures include the assertion message and a snippet of relevant log output. No screenshots/videos by default to keep runs cheap; can be enabled per-test for debugging.

## Dependencies to add

- `@playwright/test` (devDep). No browser binaries needed (`PLAYWRIGHT_SKIP_BROWSER_DOWNLOAD=1`); only the `_electron` API is used.

## Open risks

- **xterm buffer serialization**: reading the active buffer requires walking `term.buffer.active.getLine(i).translateToString()`. Straightforward but verbose; helper isolates it.
- **Process leaks**: failed tests can leave PTY children alive. The PTY layer tests use `afterEach` to `killAll`; E2E uses Playwright fixtures with teardown.
- **Fidelity drift**: fake CLI may diverge from real `claude` over time. Mitigated by the optional ANSI-replay fixture and the opt-in smoke layer.

## Out of scope (follow-ups)

- CI workflow (GitHub Actions matrix).
- Coverage reporting.
- Performance/load tests for many concurrent sessions.
