use std::path::PathBuf;
use std::sync::Arc;
use std::time::Duration;

use anyhow::Result;
use parking_lot::Mutex;
use serde::{Deserialize, Serialize};

use crate::types::{SessionDesc, SessionId};

const VERSION: u32 = 1;
const FILE_NAME: &str = "sessions.json";

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Record {
    pub id: SessionId,
    pub name: String,
    pub cwd: String,
    pub created_at: i64,
    pub buffer: String,
}

#[derive(Serialize, Deserialize)]
struct File {
    version: u32,
    sessions: Vec<Record>,
}

pub type SnapshotFn = Box<dyn Fn() -> Vec<(SessionDesc, String)> + Send + Sync>;

struct Inner {
    file: PathBuf,
    tmp: PathBuf,
    snapshot: Option<SnapshotFn>,
    dirty_scheduled: bool,
}

#[derive(Clone)]
pub struct SessionStore {
    inner: Arc<Mutex<Inner>>,
}

impl SessionStore {
    pub fn new(user_data_dir: PathBuf) -> Self {
        std::fs::create_dir_all(&user_data_dir).ok();
        let file = user_data_dir.join(FILE_NAME);
        let tmp = user_data_dir.join(format!("{FILE_NAME}.tmp"));
        Self {
            inner: Arc::new(Mutex::new(Inner {
                file,
                tmp,
                snapshot: None,
                dirty_scheduled: false,
            })),
        }
    }

    pub fn set_snapshot(&self, f: SnapshotFn) {
        self.inner.lock().snapshot = Some(f);
    }

    pub fn load(&self) -> Result<Vec<Record>> {
        let path = self.inner.lock().file.clone();
        let raw = match std::fs::read_to_string(&path) {
            Ok(s) => s,
            Err(e) if e.kind() == std::io::ErrorKind::NotFound => return Ok(vec![]),
            Err(_) => {
                let _ = std::fs::rename(&path, path.with_extension("corrupt"));
                return Ok(vec![]);
            }
        };
        match serde_json::from_str::<File>(&raw) {
            Ok(f) if f.version == VERSION => Ok(f.sessions),
            _ => {
                let _ = std::fs::rename(&path, path.with_extension("corrupt"));
                Ok(vec![])
            }
        }
    }

    pub fn save_now(&self) -> Result<()> {
        let (records, file, tmp) = {
            let g = self.inner.lock();
            let records = match &g.snapshot {
                Some(f) => f()
                    .into_iter()
                    .map(|(d, b)| Record {
                        id: d.id,
                        name: d.name,
                        cwd: d.cwd,
                        created_at: d.created_at,
                        buffer: b,
                    })
                    .collect::<Vec<_>>(),
                None => vec![],
            };
            (records, g.file.clone(), g.tmp.clone())
        };
        let payload = serde_json::to_string(&File {
            version: VERSION,
            sessions: records,
        })?;
        std::fs::write(&tmp, payload)?;
        std::fs::rename(&tmp, &file)?;
        Ok(())
    }

    pub fn mark_dirty(&self) {
        {
            let mut g = self.inner.lock();
            if g.dirty_scheduled {
                return;
            }
            g.dirty_scheduled = true;
        }
        let this = self.clone();
        tokio::spawn(async move {
            tokio::time::sleep(Duration::from_millis(500)).await;
            {
                let mut g = this.inner.lock();
                g.dirty_scheduled = false;
            }
            if let Err(e) = this.save_now() {
                tracing::error!("session store save failed: {e}");
            }
        });
    }
}
