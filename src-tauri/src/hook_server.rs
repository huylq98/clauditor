use std::net::SocketAddr;
use std::sync::Arc;

use anyhow::Result;
use axum::{
    extract::{Path, State},
    http::{HeaderMap, StatusCode},
    response::IntoResponse,
    routing::{get, post},
    Json, Router,
};
use serde_json::{json, Value};

use crate::activity_service::{ActivityService, HookActivity};
use crate::pty_manager::PtyManager;
use crate::state_engine::{Hook, StateEngine};

pub const PORT: u16 = 27182;

#[derive(Clone)]
struct HookState {
    token: Arc<String>,
    pty: PtyManager,
    engine: StateEngine,
    activity: ActivityService,
}

pub async fn start(
    token: String,
    pty: PtyManager,
    engine: StateEngine,
    activity: ActivityService,
) -> Result<tokio::task::JoinHandle<()>> {
    let state = HookState {
        token: Arc::new(token),
        pty,
        engine,
        activity,
    };

    let app = Router::new()
        .route("/health", get(|| async { "ok" }))
        .route("/hook/:event", post(handle))
        .with_state(state);

    let addr: SocketAddr = ([127, 0, 0, 1], PORT).into();
    let listener = tokio::net::TcpListener::bind(addr).await?;
    let handle = tokio::spawn(async move {
        if let Err(e) = axum::serve(listener, app).await {
            tracing::error!("hook server error: {e}");
        }
    });
    Ok(handle)
}

async fn handle(
    State(state): State<HookState>,
    Path(event): Path<String>,
    headers: HeaderMap,
    body: Option<Json<Value>>,
) -> impl IntoResponse {
    let token_ok = headers
        .get("X-Clauditor-Token")
        .and_then(|v| v.to_str().ok())
        .map(|t| t == state.token.as_str())
        .unwrap_or(false);
    if !token_ok {
        return (StatusCode::FORBIDDEN, Json(json!({"error": "forbidden"})));
    }

    let payload = body.map(|Json(v)| v).unwrap_or(Value::Null);
    let ppid = payload
        .get("clauditor_ppid")
        .and_then(|v| v.as_u64())
        .map(|v| v as u32)
        .unwrap_or(0);

    let sid = if ppid > 0 {
        state.pty.find_by_pid(ppid)
    } else {
        None
    };

    if let Some(sid) = sid {
        let hook = match event.as_str() {
            "user-prompt-submit" => Some(Hook::UserPromptSubmit),
            "pre-tool-use" => Some(Hook::PreToolUse),
            "post-tool-use" => Some(Hook::PostToolUse),
            "stop" => Some(Hook::Stop),
            "notification" => Some(Hook::Notification),
            _ => None,
        };
        if let Some(h) = hook {
            state.engine.handle_hook(sid, h);
        }

        // Activity tracking for tool hooks
        if matches!(event.as_str(), "pre-tool-use" | "post-tool-use") {
            if let (Some(tool), Some(input)) = (
                payload.get("tool_name").and_then(|v| v.as_str()),
                payload.get("tool_input"),
            ) {
                let path = input
                    .get("file_path")
                    .or_else(|| input.get("notebook_path"))
                    .and_then(|v| v.as_str());
                if let Some(path) = path {
                    // Normalize to path relative to session cwd if possible.
                    let _rel_opt = (); // silence the unused warning from original JS shape
                    state.activity.handle_tool(HookActivity {
                        sid,
                        tool: tool.to_string(),
                        phase: if event == "pre-tool-use" { "pre".into() } else { "post".into() },
                        path: path.to_string(),
                    });
                }
            }
        }
    }

    (
        StatusCode::OK,
        Json(json!({"ok": true, "sid": sid.map(|s| s.to_string())})),
    )
}
