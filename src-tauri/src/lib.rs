// Desktop app: tolerate scaffolding methods/variants kept for near-term wiring.
// Clippy's other checks still fail hard under -D warnings.
#![allow(dead_code)]

mod activity_service;
mod app_state;
mod cleanup;
mod commands;
mod file_watcher;
mod hook_server;
mod pty_manager;
mod session_store;
mod settings_installer;
mod state_engine;
mod tray;
mod types;

pub use cleanup::run as run_cleanup;

use std::path::PathBuf;

use rand::rngs::OsRng;
use rand::RngCore;
use tauri::Manager;

use crate::activity_service::ActivityService;
use crate::app_state::AppState;
use crate::file_watcher::FileWatcher;
use crate::pty_manager::{PtyEvent, PtyManager};
use crate::session_store::SessionStore;
use crate::state_engine::StateEngine;

fn generate_token() -> String {
    let mut bytes = [0u8; 24];
    OsRng.fill_bytes(&mut bytes);
    hex::encode(bytes)
}

fn user_data_dir(app: &tauri::AppHandle) -> PathBuf {
    app.path()
        .app_data_dir()
        .unwrap_or_else(|_| std::env::temp_dir().join("clauditor"))
}

#[cfg_attr(mobile, tauri::mobile_entry_point)]
pub fn run() {
    tracing_subscriber::fmt()
        .with_env_filter(
            tracing_subscriber::EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| "clauditor_lib=info,tauri=warn,warn".into()),
        )
        .init();

    tauri::Builder::default()
        .plugin(tauri_plugin_opener::init())
        .plugin(tauri_plugin_dialog::init())
        .plugin(tauri_plugin_notification::init())
        .plugin(tauri_plugin_store::Builder::new().build())
        .plugin(tauri_plugin_process::init())
        .plugin(tauri_plugin_updater::Builder::new().build())
        .setup(|app| {
            let handle = app.handle().clone();
            let token = generate_token();
            // Do NOT set CLAUDITOR_TOKEN on the parent process — it would leak
            // to every descendant of Clauditor (not just the claude CLI we spawn).
            // The token is passed per-PTY via cmd.env in pty_manager.

            let (pty, mut pty_rx) = PtyManager::new(handle.clone(), token.clone());
            let engine = StateEngine::new(handle.clone());
            let watcher = FileWatcher::new(handle.clone());
            let activity = ActivityService::new(handle.clone());
            let store = SessionStore::new(user_data_dir(&handle));

            // Wire the snapshot closure (records all sessions at flush time).
            {
                let pty_clone = pty.clone();
                store.set_snapshot(Box::new(move || pty_clone.snapshot_records()));
            }

            // Load persisted sessions as stubs (no proc).
            if let Ok(records) = store.load() {
                for rec in records {
                    let desc = crate::types::SessionDesc {
                        id: rec.id,
                        name: rec.name.clone(),
                        cwd: rec.cwd.clone(),
                        created_at: rec.created_at,
                        pid: None,
                        state: crate::types::SessionState::Exited,
                    };
                    pty.register_stub(&desc, &rec.buffer);
                    engine.register(rec.id);
                    engine.mark_exited(rec.id);
                    activity.register(rec.id);
                    if let Err(e) = watcher.create(rec.id, &rec.cwd) {
                        tracing::warn!("restore watcher failed for {}: {e}", rec.cwd);
                    }
                }
            }

            let state = AppState {
                pty: pty.clone(),
                engine: engine.clone(),
                watcher: watcher.clone(),
                activity: activity.clone(),
                store: store.clone(),
                token: token.clone(),
            };
            app.manage(state);

            // Start hook server.
            {
                let token = token.clone();
                let pty = pty.clone();
                let engine = engine.clone();
                let activity = activity.clone();
                tauri::async_runtime::spawn(async move {
                    if let Err(e) = hook_server::start(token, pty, engine, activity).await {
                        tracing::error!("hook server start failed: {e}");
                    }
                });
            }

            // Install ~/.claude/settings.json hooks.
            if let Err(e) = settings_installer::install() {
                tracing::warn!("settings installer failed: {e}");
            }

            // Drain PTY events — mark store dirty + drive engine exit transitions.
            let store_clone = store.clone();
            let engine_clone = engine.clone();
            tauri::async_runtime::spawn(async move {
                while let Some(ev) = pty_rx.recv().await {
                    match ev {
                        PtyEvent::Spawn(_) => store_clone.mark_dirty(),
                        PtyEvent::Exit(id, _) => {
                            engine_clone.mark_exited(id);
                            store_clone.mark_dirty();
                        }
                        PtyEvent::Data(_, _) => {}
                    }
                }
            });

            // System tray.
            if let Err(e) = tray::create(&handle) {
                tracing::warn!("tray create failed: {e}");
            }

            Ok(())
        })
        .on_window_event(|window, event| {
            if let tauri::WindowEvent::CloseRequested { api, .. } = event {
                // Hide instead of quit — keep running in tray.
                let _ = window.hide();
                api.prevent_close();
            }
        })
        .invoke_handler(tauri::generate_handler![
            commands::sessions_list,
            commands::sessions_create,
            commands::sessions_kill,
            commands::sessions_restart,
            commands::sessions_forget,
            commands::sessions_rename,
            commands::sessions_write,
            commands::sessions_resize,
            commands::sessions_buffer,
            commands::sessions_kill_all,
            commands::sessions_restart_all_exited,
            commands::sessions_forget_all_exited,
            commands::tree_list,
            commands::file_read,
            commands::activity_snapshot,
            commands::dialog_pick_directory,
        ])
        .run(tauri::generate_context!())
        .expect("error while running tauri application");
}
