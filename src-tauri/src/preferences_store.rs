use std::path::PathBuf;

use anyhow::{Context, Result};
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};
use std::collections::BTreeMap;
use std::sync::Arc;

const VERSION: u32 = 1;
const FILE_NAME: &str = "preferences.json";
const BAK_NAME: &str = "preferences.json.bak";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Appearance {
    pub theme: String, // "dark" | "light" | "system"
    pub ui_scale: u32, // percent, 80..=140 step 5
}

impl Default for Appearance {
    fn default() -> Self {
        Self {
            theme: "dark".into(),
            ui_scale: 100,
        }
    }
}

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Default)]
#[serde(rename_all = "camelCase")]
pub struct Preferences {
    pub version: u32,
    pub appearance: Appearance,
    pub shortcuts: BTreeMap<String, Option<String>>,
}

impl Preferences {
    pub fn defaults() -> Self {
        Self {
            version: VERSION,
            appearance: Appearance::default(),
            shortcuts: BTreeMap::new(),
        }
    }
}

struct Inner {
    file: PathBuf,
    tmp: PathBuf,
    bak: PathBuf,
    current: Preferences,
}

#[derive(Clone)]
pub struct PreferencesStore {
    inner: Arc<Mutex<Inner>>,
}

impl PreferencesStore {
    pub fn new(user_data_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&user_data_dir).ok();
        let file = user_data_dir.join(FILE_NAME);
        let tmp = user_data_dir.join(format!("{FILE_NAME}.tmp"));
        let bak = user_data_dir.join(BAK_NAME);
        let current = match Self::load_from(&file) {
            Ok(p) => p,
            Err(e) => {
                tracing::warn!("preferences load failed, resetting: {e}");
                if file.exists() {
                    let _ = std::fs::rename(&file, &bak);
                }
                Preferences::defaults()
            }
        };
        Self {
            inner: Arc::new(Mutex::new(Inner {
                file,
                tmp,
                bak,
                current,
            })),
        }
    }

    fn load_from(path: &PathBuf) -> Result<Preferences> {
        if !path.exists() {
            return Ok(Preferences::defaults());
        }
        let text = std::fs::read_to_string(path).context("read preferences.json")?;
        let parsed: Preferences = serde_json::from_str(&text).context("parse preferences.json")?;
        anyhow::ensure!(
            parsed.version == VERSION,
            "unsupported preferences version: {}",
            parsed.version
        );
        Ok(parsed)
    }

    pub fn get(&self) -> Preferences {
        self.inner.lock().current.clone()
    }

    pub fn set(&self, next: Preferences) -> Result<()> {
        let mut inner = self.inner.lock();
        let mut normalized = next;
        normalized.version = VERSION;
        // Clamp scale to [80, 140] in 5% increments.
        let scale = normalized.appearance.ui_scale.clamp(80, 140);
        normalized.appearance.ui_scale = (scale / 5) * 5;
        let body = serde_json::to_string_pretty(&normalized)?;
        std::fs::write(&inner.tmp, body)?;
        std::fs::rename(&inner.tmp, &inner.file).inspect_err(|_| {
            let _ = std::fs::remove_file(&inner.tmp);
        })?;
        inner.current = normalized;
        Ok(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use tempfile::TempDir;

    #[test]
    fn returns_defaults_when_file_missing() {
        let dir = TempDir::new().unwrap();
        let store = PreferencesStore::new(dir.path().to_path_buf());
        let prefs = store.get();
        assert_eq!(prefs, Preferences::defaults());
    }

    #[test]
    fn round_trips_through_disk() {
        let dir = TempDir::new().unwrap();
        let store = PreferencesStore::new(dir.path().to_path_buf());
        let mut next = Preferences::defaults();
        next.appearance.theme = "light".into();
        next.appearance.ui_scale = 125;
        next.shortcuts
            .insert("new-session".into(), Some("Ctrl+Shift+T".into()));
        store.set(next.clone()).unwrap();

        let reopened = PreferencesStore::new(dir.path().to_path_buf());
        assert_eq!(reopened.get(), next);
    }

    #[test]
    fn corrupt_file_is_renamed_to_bak_and_defaults_load() {
        let dir = TempDir::new().unwrap();
        std::fs::write(dir.path().join(FILE_NAME), b"{ not valid json").unwrap();
        let store = PreferencesStore::new(dir.path().to_path_buf());
        assert_eq!(store.get(), Preferences::defaults());
        assert!(dir.path().join(BAK_NAME).exists());
    }

    #[test]
    fn version_mismatch_is_renamed_to_bak_and_defaults_load() {
        let dir = TempDir::new().unwrap();
        let body = serde_json::json!({ "version": 99, "appearance": { "theme": "dark", "uiScale": 100 }, "shortcuts": {} });
        std::fs::write(dir.path().join(FILE_NAME), body.to_string()).unwrap();
        let store = PreferencesStore::new(dir.path().to_path_buf());
        assert_eq!(store.get(), Preferences::defaults());
        assert!(dir.path().join(BAK_NAME).exists());
    }

    #[test]
    fn set_clamps_ui_scale() {
        let dir = TempDir::new().unwrap();
        let store = PreferencesStore::new(dir.path().to_path_buf());
        let mut p = Preferences::defaults();
        p.appearance.ui_scale = 999;
        store.set(p).unwrap();
        assert_eq!(store.get().appearance.ui_scale, 140);

        let mut p = Preferences::defaults();
        p.appearance.ui_scale = 10;
        store.set(p).unwrap();
        assert_eq!(store.get().appearance.ui_scale, 80);
    }
}
