use std::path::PathBuf;

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

fn claude_dir() -> PathBuf {
    dirs::home_dir()
        .unwrap_or_else(|| PathBuf::from("."))
        .join(".claude")
}
fn settings_path() -> PathBuf {
    claude_dir().join("settings.json")
}
fn hook_script_path() -> PathBuf {
    let name = if cfg!(windows) {
        "clauditor-hook.ps1"
    } else {
        "clauditor-hook.sh"
    };
    claude_dir().join(name)
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
    let path = hook_script_path();
    let content = if cfg!(windows) { PS1 } else { SH };
    std::fs::write(&path, content)?;
    #[cfg(unix)]
    {
        use std::os::unix::fs::PermissionsExt;
        let mut perms = std::fs::metadata(&path)?.permissions();
        perms.set_mode(0o755);
        std::fs::set_permissions(&path, perms).ok();
    }
    Ok(path)
}

fn build_command(endpoint: &str) -> String {
    let script = hook_script_path();
    let script = script.display();
    if cfg!(windows) {
        format!(
            "powershell -NoProfile -ExecutionPolicy Bypass -File \"{script}\" {endpoint}"
        )
    } else {
        format!("sh \"{script}\" {endpoint}")
    }
}

pub fn install() -> Result<PathBuf> {
    write_hook_script()?;
    let p = settings_path();
    std::fs::create_dir_all(p.parent().unwrap())?;
    let mut settings: Value = if p.exists() {
        std::fs::read_to_string(&p)
            .ok()
            .and_then(|s| serde_json::from_str(&s).ok())
            .unwrap_or(json!({}))
    } else {
        json!({})
    };

    let hooks = settings
        .as_object_mut()
        .unwrap()
        .entry("hooks".to_string())
        .or_insert_with(|| json!({}));
    let hooks = hooks.as_object_mut().unwrap();

    for (event, endpoint) in EVENTS {
        let existing = hooks.entry(event.to_string()).or_insert_with(|| json!([]));
        let arr = existing.as_array_mut().unwrap();
        arr.retain(|g| !g.get(SENTINEL).and_then(|v| v.as_bool()).unwrap_or(false));
        arr.push(json!({
            SENTINEL: true,
            "hooks": [{"type": "command", "command": build_command(endpoint)}]
        }));
    }

    std::fs::write(&p, serde_json::to_string_pretty(&settings)?)?;
    Ok(p)
}

pub fn uninstall() {
    let p = settings_path();
    if !p.exists() {
        return;
    }
    let Ok(text) = std::fs::read_to_string(&p) else {
        return;
    };
    let Ok(mut settings) = serde_json::from_str::<Value>(&text) else {
        return;
    };
    let Some(obj) = settings.as_object_mut() else { return };
    let Some(hooks_val) = obj.get_mut("hooks") else { return };
    let Some(hooks) = hooks_val.as_object_mut() else { return };
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
    if let Ok(out) = serde_json::to_string_pretty(&settings) {
        let _ = std::fs::write(&p, out);
    }
    let _ = std::fs::remove_file(hook_script_path());
}
