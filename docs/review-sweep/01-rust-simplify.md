# Rust simplify findings (backend)

Source: agent review of `src-tauri/src/*.rs` (2,075 LOC, 13 files). Findings ranked by ROI.

## High-ROI

1. **commands.rs:10–16** — Trivial `ok()` / `fail()` wrappers; inline `Ok(v)` and `e.to_string()` at call sites. *trivial*
2. **commands.rs:264–271** — `#[allow(dead_code)]` on `focus_event()` (never called) and `_dep_probe()` (keeps `tauri::Manager` import alive). Delete first; add explanatory comment on second. *trivial*
3. **activity_service.rs:101–104** — One-entry `HashMap` allocation in `ActivityDelta`; build via `[(k, 1)].into_iter().collect()` or wrap in a helper. *trivial*
4. **pty_manager.rs:336–346** — `kill_all()` collects IDs then re-locks per-iteration to call `is_running()`. Single pass with `.values().filter(...)`. *small*
5. **file_watcher.rs:156–167** — Sort comparator uses nested if/else for booleans; use `cmp` chaining. *trivial*
6. **state_engine.rs:112–137** — `note_activity()` returns unnamed `(bool, bool)` tuple; promote to a named struct (`Transition { to_running, should_arm_idle }`). *small*
7. **session_store.rs:108–127** — `mark_dirty()` re-implements debounce with a scheduled-flag; switch to a single `tokio::sync::Notify` or `Mutex`-guarded write coalescer. *small*
8. **lib.rs:56–108** — Clone explosion in setup (handle/pty/engine/watcher/activity/store/token each cloned multiple times). Centralize in `AppState`, clone once per context. *small*
9. **pty_manager.rs:78–84** — `list()` returns a 5-tuple `(SessionId, String, String, i64, Option<u32>)`; promote to `SessionSnapshot` struct. *small*
10. **hook_server.rs:72–76** — 4-step optional chain for `clauditor_ppid`; collapse using `as_u64().try_into().ok()`. *trivial*
11. **activity_service.rs:72–86** — Closure clones `tool` twice in the same lock scope. *trivial*
12. **settings_installer.rs:95–100** — Defensive `.ok().and_then().unwrap_or_default()` chain for read+parse — extract to `fn load_settings(&Path) -> Value`. *small*

## Medium-ROI

13. **pty_manager.rs:349–371** — `resolve_claude()` repeats the PATH search for three Windows extensions and one Unix name; single candidates array or the `which` crate. *small*
14. **file_watcher.rs:207–223** — `build_ignores()` is a toy `.gitignore` parser (no globs, no negations). Use the `ignore` crate or document the limitation. *medium*
15. **session_store.rs:81–106** — Tuple unpacking `(records, file, tmp)` after releasing the guard obscures intent; helper struct or comment. *trivial*
16. **hook_server.rs:28–54** — `start()` returns `JoinHandle` that `lib.rs` discards; drop the return type. *trivial*
17. **state_engine.rs:188–207** — `arm_idle()` double-locks around a simple timer; `tokio::sync::Notify`. *medium*
18. **file_watcher.rs:43–102** — Watcher closure captures 4 cloned values; extract a named function + `Arc`. *small*
19. **pty_manager.rs:133–141** — `rename()` returns a `SessionDesc` with a hardcoded `SessionState::Running`; return new name only. *small*
20. **activity_service.rs:48–59** — `snapshot()` clones entire Bucket three times; return refs or hold guard. *small*

## Lower-ROI

21. **types.rs:80** — Consider `type ToolMetrics = HashMap<String, u32>` alias. *trivial*
22. **settings_installer.rs:33–65** — Embedded PS1 + SH scripts as raw strings; move to separate files, `include_str!`. *medium*
23. **hook_server.rs:62–66** — Token validation chain → `is_some_and(|t| t == expected)`. *trivial*  **Also flagged by security review: use `subtle::ConstantTimeEq`.**
24. **session_store.rs:62–79** — `load()` `NotFound` vs other errors; consolidate match arms. *trivial*
25. **file_watcher.rs:171–200** — Manual `..` path-traversal check; could use `path_clean`. *small*
26. **tray.rs:23–51** — String-ID match for menu events; extract enum. *small*

## Notes

- Scale of the backend is small enough that a single afternoon can land items 1–12.
- Items 13, 14, 17, 22 touch dependencies (`which`, `ignore`, external files) — consider separate PRs.
