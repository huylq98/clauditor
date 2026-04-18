use std::path::{Path, PathBuf};

use anyhow::Result;
use serde_json::{json, Value};

const SENTINEL: &str = "_clauditor";

pub const EVENTS: &[(&str, &str)] = &[
    ("UserPromptSubmit", "user-prompt-submit"),
    ("PreToolUse", "pre-tool-use"),
    ("PostToolUse", "post-tool-use"),
    ("Stop", "stop"),
    ("Notification", "notification"),
];

fn claude_dir_in(home: &Path) -> PathBuf {
    home.join(".claude")
}
fn settings_path_in(home: &Path) -> PathBuf {
    claude_dir_in(home).join("settings.json")
}
fn hook_script_path_in(home: &Path) -> PathBuf {
    let name = if cfg!(windows) {
        "clauditor-hook.ps1"
    } else {
        "clauditor-hook.sh"
    };
    claude_dir_in(home).join(name)
}

fn default_home() -> PathBuf {
    dirs::home_dir().unwrap_or_else(|| PathBuf::from("."))
}

fn claude_dir() -> PathBuf {
    claude_dir_in(&default_home())
}
fn settings_path() -> PathBuf {
    settings_path_in(&default_home())
}
fn hook_script_path() -> PathBuf {
    hook_script_path_in(&default_home())
}

const PS1: &str = r#"param([string]$Endpoint)
if (-not $env:CLAUDITOR_TOKEN) { exit 0 }
try {
  $body = [Console]::In.ReadToEnd()
  if (-not $body) { $body = "{}" }
  try { $json = $body | ConvertFrom-Json } catch { $json = @{} }
  $ppid = 0
  try { $ppid = (Get-CimInstance Win32_Process -Filter "ProcessId=$PID" -ErrorAction Stop).ParentProcessId } catch {}
  $json | Add-Member -NotePropertyName clauditor_ppid -NotePropertyValue $ppid -Force
  $out = $json | ConvertTo-Json -Compress
  Invoke-RestMethod -Uri "http://127.0.0.1:27182/hook/$Endpoint" `
    -Method Post `
    -Headers @{ "X-Clauditor-Token" = $env:CLAUDITOR_TOKEN; "Content-Type" = "application/json" } `
    -Body $out -TimeoutSec 2 -ErrorAction Stop | Out-Null
} catch {}
exit 0
"#;

const SH: &str = r#"#!/bin/sh
[ -z "$CLAUDITOR_TOKEN" ] && exit 0
BODY=$(cat)
[ -z "$BODY" ] && BODY="{}"
case "$BODY" in
  '{}') PAYLOAD="{\"clauditor_ppid\":$PPID}" ;;
  *) PAYLOAD=$(printf '%s' "$BODY" | sed -e "s/}\\s*\$/,\"clauditor_ppid\":$PPID}/") ;;
esac
curl -s -m 2 -X POST \
  -H "Content-Type: application/json" \
  -H "X-Clauditor-Token: $CLAUDITOR_TOKEN" \
  -d "$PAYLOAD" \
  "http://127.0.0.1:27182/hook/$1" >/dev/null 2>&1
exit 0
"#;

fn write_hook_script() -> Result<PathBuf> {
    std::fs::create_dir_all(claude_dir())?;
    let final_path = hook_script_path();
    // Write to a sibling .tmp first, chmod it, then atomically rename.
    // A crash between write and chmod would otherwise leave a
    // mode-0o644 (umask-default) script containing the token.
    let tmp_path = final_path.with_extension(
        final_path
            .extension()
            .and_then(|e| e.to_str())
            .map(|e| format!("{e}.tmp"))
            .unwrap_or_else(|| "tmp".into()),
    );
    let content = if cfg!(windows) { PS1 } else { SH };
    std::fs::write(&tmp_path, content)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&tmp_path)?.permissions();
        perms.set_mode(0o700);
        std::fs::set_permissions(&tmp_path, perms)?;
    }
    std::fs::rename(&tmp_path, &final_path).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp_path);
    })?;
    Ok(final_path)
}

fn build_command(endpoint: &str) -> String {
    let script = hook_script_path();
    let script = script.display();
    // endpoint values are sourced from the hardcoded EVENTS table — but quote
    // them anyway so a future event name containing spaces or shell metachars
    // can never be interpreted as separate args or command substitution.
    if cfg!(windows) {
        format!("powershell -NoProfile -ExecutionPolicy Bypass -File \"{script}\" \"{endpoint}\"")
    } else {
        format!("sh \"{script}\" \"{endpoint}\"")
    }
}

pub fn install() -> Result<PathBuf> {
    write_hook_script()?;
    let p = settings_path();
    if let Some(parent) = p.parent() {
        std::fs::create_dir_all(parent)?;
    }
    let mut settings: Value = if p.exists() {
        std::fs::read_to_string(&p)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(json!({}))
    } else {
        json!({})
    };

    // If the existing file's top-level isn't an object or `hooks` isn't an
    // object, the user has hand-edited it into a shape we don't recognize.
    // Rather than overwriting their data or panicking, bail out and leave
    // their file untouched — the hook script is still on disk, the user
    // just won't get hooks wired up until they fix their settings.json.
    let Some(root) = settings.as_object_mut() else {
        anyhow::bail!("settings.json root is not an object — refusing to overwrite");
    };
    let hooks_val = root.entry("hooks".to_string()).or_insert_with(|| json!({}));
    let Some(hooks) = hooks_val.as_object_mut() else {
        anyhow::bail!("settings.json `hooks` is not an object — refusing to overwrite");
    };

    for (event, endpoint) in EVENTS {
        let existing = hooks.entry(event.to_string()).or_insert_with(|| json!([]));
        let Some(arr) = existing.as_array_mut() else {
            anyhow::bail!("settings.json hooks.{event} is not an array — refusing to overwrite");
        };
        arr.retain(|g| !g.get(SENTINEL).and_then(|v| v.as_bool()).unwrap_or(false));
        arr.push(json!({
            SENTINEL: true,
            "hooks": [{"type": "command", "command": build_command(endpoint)}]
        }));
    }

    // Atomic write via tmp+rename so a crash mid-write doesn't leave the
    // user with a truncated settings.json.
    let tmp = p.with_extension("json.tmp");
    std::fs::write(&tmp, serde_json::to_string_pretty(&settings)?)?;
    std::fs::rename(&tmp, &p).inspect_err(|_| {
        let _ = std::fs::remove_file(&tmp);
    })?;
    Ok(p)
}

pub fn remove_hooks() -> std::io::Result<()> {
    remove_hooks_in(&default_home())
}

pub(crate) fn remove_hooks_in(home: &Path) -> std::io::Result<()> {
    let p = settings_path_in(home);
    let script = hook_script_path_in(home);

    if !p.exists() {
        // Nothing to do; still try to remove an orphan script.
        if script.exists() {
            std::fs::remove_file(&script)?;
        }
        return Ok(());
    }

    let text = std::fs::read_to_string(&p)?;
    let mut settings: serde_json::Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(e) => return Err(std::io::Error::new(std::io::ErrorKind::InvalidData, e)),
    };
    let Some(obj) = settings.as_object_mut() else {
        return Ok(());
    };
    let Some(hooks_val) = obj.get_mut("hooks") else {
        // No hooks at all — still remove stale script.
        if script.exists() {
            std::fs::remove_file(&script)?;
        }
        return Ok(());
    };
    let Some(hooks) = hooks_val.as_object_mut() else {
        return Ok(());
    };
    for (event, _) in EVENTS {
        if let Some(arr_val) = hooks.get_mut(*event) {
            if let Some(arr) = arr_val.as_array_mut() {
                arr.retain(|g| !g.get(SENTINEL).and_then(|v| v.as_bool()).unwrap_or(false));
                if arr.is_empty() {
                    hooks.remove(*event);
                }
            }
        }
    }
    if hooks.is_empty() {
        obj.remove("hooks");
    }
    let out = serde_json::to_string_pretty(&settings)
        .map_err(|e| std::io::Error::new(std::io::ErrorKind::InvalidData, e))?;
    std::fs::write(&p, out)?;
    if script.exists() {
        std::fs::remove_file(&script)?;
    }
    Ok(())
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct HookEntry {
    pub event: String,
    pub status: String,
}

#[derive(Debug, Clone, serde::Serialize)]
#[serde(rename_all = "camelCase")]
pub struct InstalledHooks {
    pub settings_path: String,
    pub settings_present: bool,
    pub parse_error: Option<String>,
    pub entries: Vec<HookEntry>,
}

pub fn read_installed() -> InstalledHooks {
    read_installed_in(&default_home())
}

pub(crate) fn read_installed_in(home: &Path) -> InstalledHooks {
    let p = settings_path_in(home);
    let script = hook_script_path_in(home);
    let script_exists = script.exists();
    let settings_path = p.display().to_string();

    if !p.exists() {
        return InstalledHooks {
            settings_path,
            settings_present: false,
            parse_error: None,
            entries: EVENTS
                .iter()
                .map(|(event, _)| HookEntry {
                    event: (*event).into(),
                    status: "missing".into(),
                })
                .collect(),
        };
    }

    let text = match std::fs::read_to_string(&p) {
        Ok(t) => t,
        Err(e) => {
            return InstalledHooks {
                settings_path,
                settings_present: true,
                parse_error: Some(e.to_string()),
                entries: vec![],
            };
        }
    };
    let settings: Value = match serde_json::from_str(&text) {
        Ok(v) => v,
        Err(e) => {
            return InstalledHooks {
                settings_path,
                settings_present: true,
                parse_error: Some(e.to_string()),
                entries: vec![],
            };
        }
    };

    let hooks = settings.get("hooks").and_then(|v| v.as_object());
    let entries = EVENTS
        .iter()
        .map(|(event, _endpoint)| {
            let arr = hooks.and_then(|h| h.get(*event)).and_then(|v| v.as_array());
            let clauditor_entry = arr.and_then(|a| {
                a.iter()
                    .find(|g| g.get(SENTINEL).and_then(|v| v.as_bool()).unwrap_or(false))
            });
            let status = match clauditor_entry {
                None => "missing",
                Some(_) if !script_exists => "stale",
                Some(_) => "present",
            };
            HookEntry {
                event: (*event).into(),
                status: status.into(),
            }
        })
        .collect();

    InstalledHooks {
        settings_path,
        settings_present: true,
        parse_error: None,
        entries,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use serde_json::json;
    use tempfile::TempDir;

    fn seed(home: &Path, settings: serde_json::Value, with_script: bool) {
        let claude = claude_dir_in(home);
        std::fs::create_dir_all(&claude).unwrap();
        std::fs::write(
            settings_path_in(home),
            serde_json::to_string_pretty(&settings).unwrap(),
        )
        .unwrap();
        if with_script {
            std::fs::write(hook_script_path_in(home), b"# stub\n").unwrap();
        }
    }

    #[test]
    fn removes_only_sentinel_hooks_and_script() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path();
        seed(
            home,
            json!({
                "hooks": {
                    "PreToolUse": [
                        { "_clauditor": true,  "hooks": [] },
                        { "_clauditor": false, "hooks": [{ "type": "command", "command": "user-hook" }] }
                    ],
                    "Stop": [
                        { "_clauditor": true, "hooks": [] }
                    ]
                },
                "theme": "dark"
            }),
            true,
        );

        remove_hooks_in(home).unwrap();

        let txt = std::fs::read_to_string(settings_path_in(home)).unwrap();
        let v: serde_json::Value = serde_json::from_str(&txt).unwrap();

        // Stop hooks fully cleared -> key removed.
        assert!(v.get("hooks").unwrap().get("Stop").is_none());
        // PreToolUse preserves the non-sentinel entry.
        let remaining = v["hooks"]["PreToolUse"].as_array().unwrap();
        assert_eq!(remaining.len(), 1);
        assert_eq!(remaining[0]["_clauditor"], false);
        // Non-hook keys untouched.
        assert_eq!(v["theme"], "dark");
        // Script gone.
        assert!(!hook_script_path_in(home).exists());
    }

    #[test]
    fn no_settings_file_is_idempotent() {
        let tmp = TempDir::new().unwrap();
        // No .claude dir at all.
        remove_hooks_in(tmp.path()).unwrap();
    }

    #[test]
    fn removes_empty_hooks_block_entirely() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path();
        seed(
            home,
            json!({
                "hooks": {
                    "PreToolUse": [ { "_clauditor": true, "hooks": [] } ]
                }
            }),
            false,
        );

        remove_hooks_in(home).unwrap();

        let v: serde_json::Value =
            serde_json::from_str(&std::fs::read_to_string(settings_path_in(home)).unwrap())
                .unwrap();
        assert!(v.get("hooks").is_none());
    }

    #[test]
    fn read_installed_missing_file_reports_all_missing() {
        let tmp = TempDir::new().unwrap();
        let got = read_installed_in(tmp.path());
        assert!(!got.settings_present);
        assert_eq!(got.entries.len(), EVENTS.len());
        assert!(got.entries.iter().all(|e| e.status == "missing"));
    }

    #[test]
    fn read_installed_reports_present_when_sentinel_and_script_exist() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path();
        seed(
            home,
            json!({
                "hooks": {
                    "PreToolUse": [ { "_clauditor": true, "hooks": [] } ]
                }
            }),
            true,
        );
        let got = read_installed_in(home);
        let pre = got
            .entries
            .iter()
            .find(|e| e.event == "PreToolUse")
            .unwrap();
        assert_eq!(pre.status, "present");
        let stop = got.entries.iter().find(|e| e.event == "Stop").unwrap();
        assert_eq!(stop.status, "missing");
    }

    #[test]
    fn read_installed_reports_stale_when_script_is_gone() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path();
        seed(
            home,
            json!({
                "hooks": {
                    "PreToolUse": [ { "_clauditor": true, "hooks": [] } ]
                }
            }),
            false,
        );
        let got = read_installed_in(home);
        let pre = got
            .entries
            .iter()
            .find(|e| e.event == "PreToolUse")
            .unwrap();
        assert_eq!(pre.status, "stale");
    }

    #[test]
    fn read_installed_surfaces_parse_error() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path();
        std::fs::create_dir_all(claude_dir_in(home)).unwrap();
        std::fs::write(settings_path_in(home), b"{ not json").unwrap();
        let got = read_installed_in(home);
        assert!(got.parse_error.is_some());
        assert!(got.entries.is_empty());
    }
}
