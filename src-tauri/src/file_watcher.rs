use std::collections::{HashMap, HashSet};
use std::path::{Path, PathBuf};
use std::sync::Arc;

use anyhow::Result;
use notify::{EventKind, RecursiveMode, Watcher};
use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};

use crate::types::{EntryKind, SessionId, TreeEntry, TreeEvent, TreeEventType};

const DEFAULT_IGNORES: &[&str] = &[
    ".git",
    "node_modules",
    "dist",
    "build",
    ".next",
    ".cache",
    "out",
    "target",
];

struct WatchedRoot {
    root: PathBuf,
    ignores: HashSet<String>,
    _watcher: notify::RecommendedWatcher,
}

#[derive(Clone)]
pub struct FileWatcher {
    watchers: Arc<Mutex<HashMap<SessionId, WatchedRoot>>>,
    app: AppHandle,
}

impl FileWatcher {
    pub fn new(app: AppHandle) -> Self {
        Self {
            watchers: Arc::new(Mutex::new(HashMap::new())),
            app,
        }
    }

    pub fn create(&self, sid: SessionId, root: impl AsRef<Path>) -> Result<()> {
        let root = root.as_ref().to_path_buf();
        let ignores = build_ignores(&root);

        let app = self.app.clone();
        let ignores_clone = ignores.clone();
        let root_clone = root.clone();

        let mut watcher =
            notify::recommended_watcher(move |res: notify::Result<notify::Event>| {
                let Ok(event) = res else { return };
                let event_type = match event.kind {
                    EventKind::Create(notify::event::CreateKind::Folder) => {
                        Some(TreeEventType::AddDir)
                    }
                    EventKind::Create(_) => Some(TreeEventType::Add),
                    EventKind::Modify(_) => Some(TreeEventType::Change),
                    EventKind::Remove(notify::event::RemoveKind::Folder) => {
                        Some(TreeEventType::UnlinkDir)
                    }
                    EventKind::Remove(_) => Some(TreeEventType::Unlink),
                    _ => None,
                };
                let Some(event_type) = event_type else { return };

                for abs in event.paths {
                    if should_ignore(&abs, &root_clone, &ignores_clone) {
                        continue;
                    }
                    let rel = match abs.strip_prefix(&root_clone) {
                        Ok(r) => r.to_string_lossy().replace('\\', "/"),
                        Err(_) => continue,
                    };
                    if rel.is_empty() {
                        continue;
                    }
                    let _ = app.emit(
                        "tree:event",
                        TreeEvent {
                            sid,
                            event_type,
                            path: rel,
                            kind: None,
                        },
                    );
                }
            })?;

        watcher.watch(&root, RecursiveMode::Recursive)?;

        self.watchers.lock().insert(
            sid,
            WatchedRoot {
                root,
                ignores,
                _watcher: watcher,
            },
        );
        Ok(())
    }

    pub fn destroy(&self, sid: SessionId) {
        self.watchers.lock().remove(&sid);
    }

    pub fn list(&self, sid: SessionId, rel: &str) -> Vec<TreeEntry> {
        let guard = self.watchers.lock();
        let Some(entry) = guard.get(&sid) else {
            return Vec::new();
        };
        let base = if rel.is_empty() || rel == "." {
            entry.root.clone()
        } else {
            entry.root.join(rel)
        };

        let Ok(dir) = std::fs::read_dir(&base) else {
            return Vec::new();
        };

        let mut out = Vec::new();
        for d in dir.flatten() {
            let path = d.path();
            if should_ignore(&path, &entry.root, &entry.ignores) {
                continue;
            }
            let rel = match path.strip_prefix(&entry.root) {
                Ok(r) => r.to_string_lossy().replace('\\', "/"),
                Err(_) => continue,
            };
            let md = d.metadata().ok();
            let is_dir = md.as_ref().map(|m| m.is_dir()).unwrap_or(false);
            let size = if is_dir {
                None
            } else {
                md.as_ref().map(|m| m.len())
            };
            let mtime = md
                .as_ref()
                .and_then(|m| m.modified().ok())
                .and_then(|t| t.duration_since(std::time::UNIX_EPOCH).ok())
                .map(|d| d.as_millis() as i64);
            out.push(TreeEntry {
                path: rel,
                kind: if is_dir {
                    EntryKind::Dir
                } else {
                    EntryKind::File
                },
                size,
                mtime,
            });
        }
        out.sort_by(|a, b| {
            let ad = matches!(a.kind, EntryKind::Dir);
            let bd = matches!(b.kind, EntryKind::Dir);
            if ad != bd {
                return if ad {
                    std::cmp::Ordering::Less
                } else {
                    std::cmp::Ordering::Greater
                };
            }
            a.path.cmp(&b.path)
        });
        out
    }

    pub fn read_file(&self, sid: SessionId, rel: &str) -> Option<crate::types::FilePreview> {
        let guard = self.watchers.lock();
        let entry = guard.get(&sid)?;
        let abs = entry.root.join(rel);
        let rel_check = abs.strip_prefix(&entry.root).ok()?;
        if rel_check
            .components()
            .any(|c| matches!(c, std::path::Component::ParentDir))
        {
            return None;
        }
        let meta = std::fs::metadata(&abs).ok()?;
        if !meta.is_file() {
            return None;
        }
        const MAX: u64 = 512 * 1024;
        let mut content = std::fs::read(&abs).ok()?;
        let truncated = meta.len() > MAX;
        if truncated {
            content.truncate(MAX as usize);
        }
        let text = String::from_utf8_lossy(&content).into_owned();
        let binary = content.contains(&0);
        Some(crate::types::FilePreview {
            path: rel.to_string(),
            content: text,
            truncated,
            binary,
        })
    }

    pub fn root_of(&self, sid: SessionId) -> Option<PathBuf> {
        self.watchers.lock().get(&sid).map(|w| w.root.clone())
    }
}

fn build_ignores(root: &Path) -> HashSet<String> {
    let mut set: HashSet<String> = DEFAULT_IGNORES.iter().map(|s| s.to_string()).collect();
    let gi = root.join(".gitignore");
    if let Ok(text) = std::fs::read_to_string(gi) {
        for raw in text.lines() {
            let line = raw.trim();
            if line.is_empty() || line.starts_with('#') || line.starts_with('!') {
                continue;
            }
            let normalized = line.trim_matches('/');
            if !normalized.is_empty() && !normalized.contains('/') && !normalized.contains('*') {
                set.insert(normalized.to_string());
            }
        }
    }
    set
}

fn should_ignore(abs: &Path, root: &Path, ignores: &HashSet<String>) -> bool {
    if abs == root {
        return false;
    }
    let rel = match abs.strip_prefix(root) {
        Ok(r) => r,
        Err(_) => return false,
    };
    for comp in rel.components() {
        if let std::path::Component::Normal(seg) = comp {
            if let Some(s) = seg.to_str() {
                if ignores.contains(s) {
                    return true;
                }
            }
        }
    }
    false
}
