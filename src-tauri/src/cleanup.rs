use std::path::{Path, PathBuf};

#[allow(unused_imports)]
use crate::settings_installer;

pub fn app_data_dir() -> PathBuf {
    dirs::data_dir()
        .unwrap_or_else(std::env::temp_dir)
        .join("dev.clauditor.app")
}

/// Run the cleanup flow. Returns a process exit code (0 = success).
/// Always removes hooks; if `purge` is true also deletes the app data dir.
pub fn run(purge: bool) -> i32 {
    // Wired up in Task 4. Stub for now so tests compile.
    let _ = purge;
    0
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
}
