# 0001 — Tauri over Electron

**Status:** Accepted
**Date:** 2026-04-17

## Context

Clauditor v0.1 shipped on Electron 33 + vanilla JS (~15 source files). It worked, but three costs kept showing up:

- **Binary + memory.** Electron ships with a full Chromium; the installer was ~80 MB, idle RAM ~150 MB, cold start ~1.2 s. For a tool that you leave open next to your editor all day, that's a lot of steady-state resource use.
- **IPC correctness.** Electron's main↔renderer channel is stringly-typed. A renamed field in `ipcMain.handle('foo', ...)` silently breaks the renderer; caught only by manual testing.
- **Polish ceiling.** Vanilla DOM + hand-rolled UI caps how fast new interactions can ship (command palette, virtualized tree, etc.). Every refinement means re-inventing a framework.

The app is a single-user tool on a single machine; there are no backend services, no user migrations to worry about.

## Decision

Full rewrite on **Tauri 2** with a **Rust backend** and a **React 19 + TypeScript** frontend.

Concrete stack:

| Layer | Choice |
|---|---|
| Shell | Tauri 2 (system webview + Rust main) |
| Backend | `tokio`, `portable-pty`, `notify`, `axum`, `serde_json`, `parking_lot` |
| Frontend | React 19, Vite 6, Tailwind v4, Zustand, xterm.js, Radix UI, `cmdk`, Framer Motion, Sonner |
| Tests | Playwright (browser + mock backend), `cargo test` |
| Packaging | Tauri's bundler: `.msi` / NSIS / `.dmg` / AppImage / deb / rpm |
| Attestation | `actions/attest-build-provenance@v1` (sigstore) |

The **Claude Code hook protocol is preserved byte-for-byte** so users on older Clauditor versions keep working with no migration.

## Consequences

### What got better

- **Binary ~80 MB → ~7 MB** per installer. Idle RAM ~150 → ~60 MB. Cold start ~1.2 s → ~0.3 s.
- **End-to-end type safety** through the IPC layer. `src/lib/bindings.ts` mirrors `src-tauri/src/types.rs`; a mismatch is a compile error, not a runtime surprise.
- **Attested releases.** sigstore signatures on every bundle mean users can verify provenance with `gh attestation verify`.
- **UI polish** — shadcn-style Radix primitives, Tailwind v4 tokens, xterm WebGL renderer all drop in cleanly.
- **Per-platform packaging** is built-in; no separate `electron-builder` config to maintain.

### What got harder

- **Build dependency on Rust toolchain** for contributors. `rustup` + MSVC (Windows) or gcc (Linux) required.
- **First-time Rust compile** on CI is ~6–10 min. After that, cache hits make it ~1 min.
- **Backend debugging surface is larger.** A PTY read loop running on a blocking thread, `axum` + `tokio` on the async runtime, `notify` watchers — each has its own failure mode.
- **`tauri-driver`** for real-app e2e is more involved than Playwright-against-webpage. Deferred; current e2e runs against Vite + a mock backend.

### Rejected alternatives

- **In-place Electron → TypeScript migration.** Leaves every runtime win on the table (binary size, memory, start time). Still requires the UI rebuild.
- **Tauri + Node.js sidecar** (keeping `node-pty` alive). Two runtimes to package, two debuggers, two security surfaces. Defeats the purpose.
- **Wails** (Go backend). Similar shape to Tauri with a smaller ecosystem; no compelling reason to pick it over Rust for this app.
