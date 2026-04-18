use std::path::{Path, PathBuf};

use crate::settings_installer;

pub fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("dev.clauditor.app")
}

/// Run the cleanup flow. Returns a process exit code (0 = success).
/// Always removes hooks; if `purge` is true also deletes the app data dir.
pub fn run(purge: bool) -> i32 {
    let home = dirs::home_dir().unwrap_or_else(|| PathBuf::from("."));
    let app_data = app_data_dir();
    run_inner(&home, &app_data, purge)
}

pub(crate) fn run_inner(home: &Path, app_data: &Path, purge: bool) -> i32 {
    let mut code = 0;
    if let Err(e) = settings_installer::remove_hooks_in(home) {
        eprintln!("clauditor cleanup: hook removal failed: {e}");
        code = 1;
    }
    if purge {
        if let Err(e) = purge_app_data_in(app_data) {
            eprintln!("clauditor cleanup: purge failed: {e}");
            code = 1;
        }
    }
    code
}

pub(crate) fn purge_app_data_in(dir: &Path) -> std::io::Result<()> {
    if dir.exists() {
        std::fs::remove_dir_all(dir)?;
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn purge_app_data_removes_existing_dir() {
        let tmp = TempDir::new().unwrap();
        let target = tmp.path().join("dev.clauditor.app");
        std::fs::create_dir_all(target.join("sub")).unwrap();
        std::fs::write(target.join("session_store.json"), b"{}").unwrap();
        std::fs::write(target.join("sub/x.log"), b"x").unwrap();

        purge_app_data_in(&target).unwrap();
        assert!(!target.exists());
    }

    #[test]
    fn purge_app_data_missing_dir_is_ok() {
        let tmp = TempDir::new().unwrap();
        let missing = tmp.path().join("does-not-exist");
        purge_app_data_in(&missing).unwrap();
    }

    use serde_json::json;

    fn seed_hooks(home: &std::path::Path) {
        let claude = home.join(".claude");
        std::fs::create_dir_all(&claude).unwrap();
        std::fs::write(
            claude.join("settings.json"),
            serde_json::to_string_pretty(&json!({
                "hooks": {
                    "Stop": [ { "_clauditor": true, "hooks": [] } ]
                }
            })).unwrap(),
        ).unwrap();
    }

    #[test]
    fn run_inner_removes_hooks_without_purge() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path();
        let app_data = home.join("app-data/dev.clauditor.app");
        std::fs::create_dir_all(&app_data).unwrap();
        seed_hooks(home);

        let code = run_inner(home, &app_data, false);
        assert_eq!(code, 0);

        // Hooks removed.
        let settings: serde_json::Value = serde_json::from_str(
            &std::fs::read_to_string(home.join(".claude/settings.json")).unwrap()
        ).unwrap();
        assert!(settings.get("hooks").is_none());
        // App data preserved.
        assert!(app_data.exists());
    }

    #[test]
    fn run_inner_with_purge_removes_app_data() {
        let tmp = TempDir::new().unwrap();
        let home = tmp.path();
        let app_data = home.join("app-data/dev.clauditor.app");
        std::fs::create_dir_all(&app_data).unwrap();
        std::fs::write(app_data.join("session_store.json"), b"{}").unwrap();
        seed_hooks(home);

        let code = run_inner(home, &app_data, true);
        assert_eq!(code, 0);

        assert!(!app_data.exists());
    }
}
