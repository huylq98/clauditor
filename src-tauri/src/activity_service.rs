use std::collections::{HashMap, HashSet};
use std::sync::Arc;

use parking_lot::Mutex;
use serde::Deserialize;
use tauri::{AppHandle, Emitter};

use crate::types::{ActivityDelta, ActivityDeltaEvent, ActivitySnapshot, SessionId};

#[derive(Default)]
struct Bucket {
    created: HashSet<String>,
    modified: HashSet<String>,
    deleted: HashSet<String>,
    tools: HashMap<String, u32>,
}

#[derive(Clone)]
pub struct ActivityService {
    inner: Arc<Mutex<HashMap<SessionId, Bucket>>>,
    app: AppHandle,
}

#[derive(Debug, Clone, Deserialize)]
pub struct HookActivity {
    pub sid: SessionId,
    pub tool: String,
    pub phase: String, // "pre" | "post"
    pub path: String,
}

impl ActivityService {
    pub fn new(app: AppHandle) -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            app,
        }
    }

    pub fn register(&self, sid: SessionId) {
        self.inner.lock().entry(sid).or_default();
    }

    pub fn unregister(&self, sid: SessionId) {
        self.inner.lock().remove(&sid);
    }

    pub fn snapshot(&self, sid: SessionId) -> ActivitySnapshot {
        let map = self.inner.lock();
        match map.get(&sid) {
            Some(b) => ActivitySnapshot {
                created: b.created.iter().cloned().collect(),
                modified: b.modified.iter().cloned().collect(),
                deleted: b.deleted.iter().cloned().collect(),
                tools: b.tools.clone(),
            },
            None => ActivitySnapshot::default(),
        }
    }

    pub fn handle_tool(&self, ev: HookActivity) {
        let HookActivity {
            sid,
            tool,
            phase,
            path,
        } = ev;
        // Only "post" phase modifies the persistent sets.
        if phase != "post" {
            return;
        }
        let (was_create, tool_clone) = {
            let mut map = self.inner.lock();
            let bucket = map.entry(sid).or_default();
            let entry = bucket.tools.entry(tool.clone()).or_insert(0);
            *entry += 1;
            let was_create = tool == "Write";
            if was_create {
                bucket.created.insert(path.clone());
                bucket.modified.remove(&path);
            } else if matches!(tool.as_str(), "Edit" | "MultiEdit" | "NotebookEdit") {
                if !bucket.created.contains(&path) {
                    bucket.modified.insert(path.clone());
                }
            }
            (was_create, tool)
        };

        let delta = ActivityDelta {
            created: if was_create { Some(vec![path.clone()]) } else { None },
            modified: if !was_create { Some(vec![path.clone()]) } else { None },
            deleted: None,
            tools: Some({
                let mut m = HashMap::new();
                m.insert(tool_clone, 1);
                m
            }),
        };
        let _ = self.app.emit("activity:delta", ActivityDeltaEvent { sid, delta });
    }

    pub fn mark_created(&self, sid: SessionId, path: &str) {
        {
            let mut map = self.inner.lock();
            let bucket = map.entry(sid).or_default();
            bucket.created.insert(path.to_string());
            bucket.modified.remove(path);
        }
        let _ = self.app.emit(
            "activity:delta",
            ActivityDeltaEvent {
                sid,
                delta: ActivityDelta {
                    created: Some(vec![path.to_string()]),
                    ..Default::default()
                },
            },
        );
    }

    pub fn mark_deleted(&self, sid: SessionId, path: &str) {
        {
            let mut map = self.inner.lock();
            let bucket = map.entry(sid).or_default();
            bucket.modified.remove(path);
            bucket.created.remove(path);
            bucket.deleted.insert(path.to_string());
        }
        let _ = self.app.emit(
            "activity:delta",
            ActivityDeltaEvent {
                sid,
                delta: ActivityDelta {
                    deleted: Some(vec![path.to_string()]),
                    ..Default::default()
                },
            },
        );
    }
}
