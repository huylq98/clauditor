use tauri::{AppHandle, Emitter, State};
use tauri_plugin_dialog::DialogExt;

use crate::app_state::AppState;
use crate::types::{
    ActivitySnapshot, CreateSessionArgs, FilePreview, ForgetSummary, KillSummary, RestartSummary,
    SessionDesc, SessionForgottenEvent, SessionId, SessionState, TreeEntry,
};

#[tauri::command]
pub async fn sessions_list(state: State<'_, AppState>) -> Result<Vec<SessionDesc>, String> {
    let engine = state.engine.clone();
    Ok(state
        .pty
        .list()
        .into_iter()
        .map(|(id, name, cwd, created_at, pid)| SessionDesc {
            id,
            name,
            cwd,
            created_at,
            pid,
            state: engine.get(id).unwrap_or(SessionState::Exited),
        })
        .collect())
}

#[tauri::command]
pub async fn sessions_create(
    app: AppHandle,
    state: State<'_, AppState>,
    args: CreateSessionArgs,
) -> Result<Option<SessionDesc>, String> {
    let mut args = args;
    if args.cwd.is_none() {
        // Open native directory picker
        let (tx, rx) = tokio::sync::oneshot::channel();
        app.dialog()
            .file()
            .set_title("Choose working directory for Claude session")
            .pick_folder(move |path| {
                let _ = tx.send(path);
            });
        match rx.await {
            Ok(Some(p)) => {
                args.cwd = Some(p.to_string());
            }
            _ => return Ok(None),
        }
    }

    let cwd = args.cwd.clone();
    let desc = tauri::async_runtime::spawn_blocking({
        let pty = state.pty.clone();
        move || pty.spawn(args)
    })
    .await
    .map_err(|e| e.to_string())?
    .map_err(|e| e.to_string())?;

    state.engine.register(desc.id);
    state.activity.register(desc.id);
    if let Some(cwd) = cwd {
        if let Err(e) = state.watcher.create(desc.id, &cwd) {
            tracing::error!("watcher create failed: {e}");
        }
    }
    let _ = app.emit("session:created", &desc);
    state.store.mark_dirty();
    Ok(Some(desc))
}

#[tauri::command]
pub async fn sessions_kill(state: State<'_, AppState>, id: SessionId) -> Result<bool, String> {
    state.pty.kill(id);
    Ok(true)
}

#[tauri::command]
pub async fn sessions_restart(
    state: State<'_, AppState>,
    id: SessionId,
    cols: u16,
    rows: u16,
) -> Result<Option<SessionDesc>, String> {
    let desc = tauri::async_runtime::spawn_blocking({
        let pty = state.pty.clone();
        move || pty.restart(id, cols, rows)
    })
    .await
    .map_err(|e| e.to_string())?
    .ok();
    if let Some(d) = desc.clone() {
        state.engine.register(d.id);
    }
    Ok(desc)
}

#[tauri::command]
pub async fn sessions_forget(
    app: AppHandle,
    state: State<'_, AppState>,
    id: SessionId,
) -> Result<bool, String> {
    state.pty.forget(id);
    state.watcher.destroy(id);
    state.activity.unregister(id);
    state.engine.unregister(id);
    let _ = app.emit("session:forgotten", SessionForgottenEvent { id });
    state.store.mark_dirty();
    Ok(true)
}

#[tauri::command]
pub async fn sessions_rename(
    app: AppHandle,
    state: State<'_, AppState>,
    id: SessionId,
    name: String,
) -> Result<SessionDesc, String> {
    let mut desc = state
        .pty
        .rename(id, &name)
        .ok_or_else(|| "no such session".to_string())?;
    desc.state = state.engine.get(id).unwrap_or(SessionState::Exited);
    let _ = app.emit("session:renamed", &desc);
    state.store.mark_dirty();
    Ok(desc)
}

#[tauri::command]
pub async fn sessions_write(
    state: State<'_, AppState>,
    id: SessionId,
    data: String,
) -> Result<(), String> {
    state.pty.write(id, &data);
    state.engine.note_activity(id);
    Ok(())
}

#[tauri::command]
pub async fn sessions_resize(
    state: State<'_, AppState>,
    id: SessionId,
    cols: u16,
    rows: u16,
) -> Result<(), String> {
    state.pty.resize(id, cols, rows);
    Ok(())
}

#[tauri::command]
pub async fn sessions_buffer(state: State<'_, AppState>, id: SessionId) -> Result<String, String> {
    Ok(state.pty.get_buffer(id))
}

#[tauri::command]
pub async fn sessions_kill_all(state: State<'_, AppState>) -> Result<KillSummary, String> {
    Ok(KillSummary {
        killed: state.pty.kill_all(),
    })
}

#[tauri::command]
pub async fn sessions_restart_all_exited(
    state: State<'_, AppState>,
    cols: u16,
    rows: u16,
) -> Result<RestartSummary, String> {
    let ids: Vec<SessionId> = state
        .pty
        .list_ids()
        .into_iter()
        .filter(|id| state.engine.get(*id) == Some(SessionState::Exited))
        .collect();
    let mut restarted = 0u32;
    for id in ids {
        let pty = state.pty.clone();
        if let Ok(Ok(_desc)) =
            tauri::async_runtime::spawn_blocking(move || pty.restart(id, cols, rows)).await
        {
            state.engine.register(id);
            restarted += 1;
        }
    }
    Ok(RestartSummary { restarted })
}

#[tauri::command]
pub async fn sessions_forget_all_exited(
    app: AppHandle,
    state: State<'_, AppState>,
) -> Result<ForgetSummary, String> {
    let ids: Vec<SessionId> = state
        .pty
        .list_ids()
        .into_iter()
        .filter(|id| state.engine.get(*id) == Some(SessionState::Exited))
        .collect();
    let mut forgotten = 0u32;
    for id in ids {
        state.pty.forget(id);
        state.watcher.destroy(id);
        state.activity.unregister(id);
        state.engine.unregister(id);
        let _ = app.emit("session:forgotten", SessionForgottenEvent { id });
        forgotten += 1;
    }
    state.store.mark_dirty();
    Ok(ForgetSummary { forgotten })
}

#[tauri::command]
pub async fn tree_list(
    state: State<'_, AppState>,
    sid: SessionId,
    rel: String,
) -> Result<Vec<TreeEntry>, String> {
    Ok(state.watcher.list(sid, &rel))
}

#[tauri::command]
pub async fn file_read(
    state: State<'_, AppState>,
    sid: SessionId,
    rel: String,
) -> Result<Option<FilePreview>, String> {
    Ok(state.watcher.read_file(sid, &rel))
}

#[tauri::command]
pub async fn activity_snapshot(
    state: State<'_, AppState>,
    sid: SessionId,
) -> Result<ActivitySnapshot, String> {
    Ok(state.activity.snapshot(sid))
}

#[tauri::command]
pub async fn dialog_pick_directory(app: AppHandle) -> Result<Option<String>, String> {
    let (tx, rx) = tokio::sync::oneshot::channel();
    app.dialog()
        .file()
        .set_title("Choose directory")
        .pick_folder(move |p| {
            let _ = tx.send(p);
        });
    let path = rx.await.map_err(|e| e.to_string())?;
    Ok(path.map(|p| p.to_string()))
}
