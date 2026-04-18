# Security audit findings

Source: agent review of Rust backend + Tauri config + frontend IPC surface. 20 findings total.

## Critical

1. **Non-constant-time token compare — CWE-208**
   `src-tauri/src/hook_server.rs:65` uses `t == state.token.as_str()`. Any local process can timing-attack the bearer token.
   **Fix:** add `subtle` crate; replace with `subtle::ConstantTimeEq::ct_eq`.

2. **Shell injection in hook script generation — CWE-94**
   `src-tauri/src/settings_installer.rs:82–88` embeds the `endpoint` identifier into shell/PowerShell command strings unquoted.
   **Fix:** whitelist-validate `endpoint` against the known set of event names and/or escape via `shell-escape` crate.

3. **Path traversal in `file_read` — CWE-22**
   `src-tauri/src/file_watcher.rs:174–180` checks for `..` *after* joining. Symlink or NUL-byte traversal can escape the session root.
   **Fix:** reject `rel` containing `..`, absolute prefix, or NUL *before* joining; canonicalize and verify the resolved path is still under the root.

## High

4. **`CLAUDITOR_TOKEN` leaks to child processes — CWE-526**
   `lib.rs:58` sets the env var globally; any tool Claude spawns inherits it.
   **Fix:** remove `std::env::set_var`; pass token only to the hook server handle.

5. **`/health` endpoint unauthenticated — CWE-640**
   Allows probing / enumerating the hook server.
   **Fix:** require `X-Clauditor-Token` on `/health` (or delete the endpoint).

6. **Hook script permissions too broad — CWE-276**
   `settings_installer.rs:76` uses `0o755`. Other local users can read the token from the script.
   **Fix:** `set_mode(0o700)`.

7. **TOCTOU on `~/.claude/settings.json` — CWE-367**
   Read → modify → write sequence has no lock. Two Clauditor instances (or any concurrent writer) can clobber each other.
   **Fix:** use `fs2::FileExt::lock_exclusive` around read/modify/rename.

8. **No Origin/Host header validation — CWE-352 (CSRF)**
   Any localhost-origin site can hit `http://127.0.0.1:27182/hook/...`.
   **Fix:** reject requests with `Origin`/`Referer` not matching loopback; require the Clauditor token as well (already there, but check Origin too).

9. **`CLAUDITOR_CLI_OVERRIDE` env var accepted without validation**
   `pty_manager.rs:350–351` lets an env var redirect the `claude` binary.
   **Fix:** either remove the override or require an absolute canonical path and verify it's not in a world-writable dir.

## Medium

10. **`unwrap()` on untrusted settings.json shape** — `settings_installer.rs:107, 110, 114`. Corrupt file panics app at launch.
    **Fix:** `as_object_mut()` → `if let Some(...)` with graceful recovery.

11. **Incomplete cleanup on installer failure** — `settings_installer.rs:68–80` leaves partial hook scripts on disk.
    **Fix:** write to a tmp path and rename into place only on success.

12. **PID reuse on hook attribution** — `hook_server.rs:72–82`. PIDs recycle; a new process might be mis-attributed to a dead session.
    **Fix:** pair PID with process creation time (procfs start-time on Linux, `GetProcessTimes` on Windows, `sysctl` on macOS).

13. **Silent UTF-8 corruption in PTY buffer** — `pty_manager.rs:104, 191`. `from_utf8_lossy` replaces bytes with U+FFFD silently.
    **Fix:** log at debug level when substitutions happen; consider retaining the last partial multi-byte sequence to avoid splitting across reads.

14. **Unbounded file read in `file_read`** — `file_watcher.rs:187–190` reads then truncates. Large files can OOM.
    **Fix:** use `take(MAX as u64)` on the `File` handle.

15. **No rate limiting on `/hook/:event`** — a buggy hook loop can flood the server and stall the UI.
    **Fix:** `tower_governor` per-endpoint token bucket (e.g. 100 req/s).

## Low / Info

16. **CSP disabled** — `src-tauri/tauri.conf.json:29` sets `"csp": null`.
    **Fix:** define a narrow CSP (`default-src 'self'; script-src 'self' 'wasm-unsafe-eval'; style-src 'self' 'unsafe-inline'`).

17. **Origin header on hook server (duplicate of #8, different severity context).**

18. **Settings installer errors only logged at warn level** — `lib.rs:117–118`. If install fails, hooks silently never fire.
    **Fix:** surface to UI (toast / status bar).

19. **`portable-pty = "0.8"`** — confirm latest; run `cargo audit`.

20. **`rand::thread_rng` for token** — works, but `OsRng` is more defensible for a secret.
    **Fix:** `use rand::rngs::OsRng; OsRng.fill_bytes(&mut bytes)`.

## Categorized fix priorities

- **Must-fix this sprint:** 1, 2, 3, 4, 5, 6, 7, 8, 9.
- **Next sprint:** 10, 11, 12, 14, 15, 16, 20.
- **Document and monitor:** 13, 18, 19.
