//! Drop-in replacement for the real `claude` CLI used by the e2e suite.
//! Replays a JSON scenario: PTY stdout writes + HTTP hook posts on a timeline.
//!
//! Env:
//!   CLAUDITOR_FAKE_SCENARIO  Path to scenario JSON. If unset → idle behavior.
//!   CLAUDITOR_HOOK_TOKEN     Bearer token for hook POSTs.
//!   CLAUDITOR_TEST_PORT      Hook server port (default 27182).

use std::io::{self, Read, Write};
use std::thread;
use std::time::Duration;

use serde::Deserialize;

#[derive(Deserialize, Debug)]
#[serde(tag = "kind", rename_all = "snake_case")]
enum Action {
    Stdout { at_ms: u64, text: String },
    Hook { at_ms: u64, event: String, #[serde(default)] tool_name: Option<String> },
    Exit { at_ms: u64, code: i32 },
}

fn main() {
    let scenario_path = std::env::var("CLAUDITOR_FAKE_SCENARIO").ok();
    let token = std::env::var("CLAUDITOR_HOOK_TOKEN").unwrap_or_default();
    let port: u16 = std::env::var("CLAUDITOR_TEST_PORT")
        .ok()
        .and_then(|v| v.parse().ok())
        .unwrap_or(27182);

    let actions: Vec<Action> = match scenario_path {
        Some(p) => {
            let raw = std::fs::read_to_string(&p)
                .unwrap_or_else(|e| panic!("fake-claude: read scenario {}: {}", p, e));
            serde_json::from_str(&raw)
                .unwrap_or_else(|e| panic!("fake-claude: parse scenario: {}", e))
        }
        None => idle_default(),
    };

    // Drain stdin in background so the parent can write without blocking.
    thread::spawn(|| {
        let mut buf = [0u8; 1024];
        let mut stdin = io::stdin();
        loop {
            match stdin.read(&mut buf) {
                Ok(0) => return,
                Ok(_) => {}
                Err(_) => return,
            }
        }
    });

    let start = std::time::Instant::now();
    for action in actions {
        match action {
            Action::Stdout { at_ms, text } => {
                wait_until(start, at_ms);
                let mut out = io::stdout();
                let _ = out.write_all(text.as_bytes());
                let _ = out.flush();
            }
            Action::Hook { at_ms, event, tool_name } => {
                wait_until(start, at_ms);
                post_hook(port, &token, &event, tool_name.as_deref());
            }
            Action::Exit { at_ms, code } => {
                wait_until(start, at_ms);
                std::process::exit(code);
            }
        }
    }

    // Default: keep alive forever (idle PTY).
    loop { thread::sleep(Duration::from_secs(60)); }
}

fn wait_until(start: std::time::Instant, at_ms: u64) {
    let elapsed = start.elapsed().as_millis() as u64;
    if at_ms > elapsed {
        thread::sleep(Duration::from_millis(at_ms - elapsed));
    }
}

fn post_hook(port: u16, token: &str, event: &str, tool_name: Option<&str>) {
    let url = format!("http://127.0.0.1:{}/hook/{}", port, event);
    let mut payload = serde_json::json!({});
    if let Some(t) = tool_name {
        payload["tool_name"] = serde_json::json!(t);
    }
    let _ = ureq::post(&url)
        .set("X-Clauditor-Token", token)
        .send_string(&payload.to_string());
}

fn idle_default() -> Vec<Action> {
    vec![Action::Stdout {
        at_ms: 0,
        text: "Claude Code v2.1.113-fake\nReady.\n".to_string(),
    }]
}
