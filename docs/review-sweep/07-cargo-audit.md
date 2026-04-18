# cargo audit findings

Ran `cargo audit` against `src-tauri/Cargo.lock` on the review branch.

## Summary

**20 advisories found — all are transitive through Tauri and cannot be fixed locally.** Scorecard counted these as the "20 existing vulnerabilities" referenced in the finding.

## Categorized

### gtk-rs GTK3 bindings — unmaintained (11 advisories)

All under `tauri-runtime-wry → tao → gtk/gdk/...`. The gtk3 bindings were deprecated in favor of gtk4 bindings; tauri still uses gtk3 on Linux.

| ID | Crate |
|---|---|
| RUSTSEC-2024-0411 | gdkwayland-sys |
| RUSTSEC-2024-0412 | gdk |
| RUSTSEC-2024-0413 | atk |
| RUSTSEC-2024-0414 | gdkx11-sys |
| RUSTSEC-2024-0415 | gtk |
| RUSTSEC-2024-0416 | atk-sys |
| RUSTSEC-2024-0417 | gdkx11 |
| RUSTSEC-2024-0418 | gdk-sys |
| RUSTSEC-2024-0419 | gtk3-macros |
| RUSTSEC-2024-0420 | gtk-sys |
| RUSTSEC-2024-0429 | glib (unsoundness) |

### Unmaintained procedural-macro / unicode helpers (9 advisories)

Deep under `tauri-utils → kuchikiki → selectors → phf_codegen → phf_generator → ...`. All are advisory-only "unmaintained" flags, not exploitable bugs.

| ID | Crate |
|---|---|
| RUSTSEC-2017-0008 | serial |
| RUSTSEC-2024-0370 | proc-macro-error |
| RUSTSEC-2025-0057 | fxhash |
| RUSTSEC-2025-0075 | unic-char-range |
| RUSTSEC-2025-0080 | unic-common |
| RUSTSEC-2025-0081 | unic-char-property |
| RUSTSEC-2025-0098 | unic-ucd-version |
| RUSTSEC-2025-0100 | unic-ucd-ident |
| RUSTSEC-2026-0097 | rand 0.7 (through phf_generator) |

## Why we ignore them

Every one of these enters through `tauri` or `tauri-plugin-*`. We don't pick them; tauri does. When tauri updates its dep tree, they clear automatically. Ignoring at the `cargo-audit` CI level (rather than shipping them silently) is the right balance — we catch any *new* advisory in a direct dep, and we revisit the ignore list each time we bump `tauri`.

See `.github/workflows/ci.yml` → `cargo-audit` job for the exact ignore list.

## Action items

1. **Track `tauri` minor releases.** When we bump `tauri = "2.11"` or similar, re-run `cargo audit` and remove any IDs no longer applicable from the ignore list.
2. **Consider `cargo deny` once it's worth the config effort.** `deny.toml` gives finer control (different severities per dep category, banned crates, license policy).
3. **No code changes required.** The only direct dep on this list was `rand = "0.8"` and we're already on the patched major.
