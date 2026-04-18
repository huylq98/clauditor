use std::collections::{HashMap, VecDeque};
use std::io::{Read, Write};
use std::path::PathBuf;
use std::sync::Arc;

use anyhow::{anyhow, Result};
use parking_lot::Mutex;
use portable_pty::{native_pty_system, CommandBuilder, MasterPty, PtySize};
use tauri::{AppHandle, Emitter};
use tokio::sync::mpsc;

use crate::types::{
    CreateSessionArgs, SessionDataEvent, SessionDesc, SessionExitEvent, SessionId, SessionState,
};

const MAX_BUFFER: usize = 1024 * 1024;

struct Session {
    id: SessionId,
    name: String,
    cwd: String,
    created_at: i64,
    pid: Option<u32>,
    master: Option<Box<dyn MasterPty + Send>>,
    writer: Option<Box<dyn Write + Send>>,
    // Ring buffer for PTY output. `VecDeque` gives O(1) amortized push_back
    // and O(1) pop_front, so draining overflow doesn't pay the O(n) shift
    // that `Vec::drain(..)` does. `get_buffer` iterates to produce a
    // contiguous `String`; that's O(n) but only fires when the frontend
    // asks to rehydrate scrollback (tab switch / reload).
    buffer: VecDeque<u8>,
}

impl Session {
    fn describe(&self, state: SessionState) -> SessionDesc {
        SessionDesc {
            id: self.id,
            name: self.name.clone(),
            cwd: self.cwd.clone(),
            created_at: self.created_at,
            pid: self.pid,
            state,
        }
    }

    fn push_buffer(&mut self, chunk: &[u8]) {
        self.buffer.extend(chunk.iter().copied());
        if self.buffer.len() > MAX_BUFFER {
            let overflow = self.buffer.len() - MAX_BUFFER;
            self.buffer.drain(..overflow);
        }
    }
}

pub enum PtyEvent {
    Spawn(SessionDesc),
    Data(SessionId, String),
    Exit(SessionId, Option<i32>),
}

/// Internal projection of a `Session` — everything stable that a caller
/// might want without locking the session map. `SessionDesc` includes
/// the state enum from the state engine and is the public (serializable)
/// shape; this one is the pty-local view.
pub struct SessionSnapshot {
    pub id: SessionId,
    pub name: String,
    pub cwd: String,
    pub created_at: i64,
    pub pid: Option<u32>,
}

#[derive(Clone)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<SessionId, Session>>>,
    // Parallel index for O(1) `find_by_pid`. The hook server hits this
    // on every Claude Code tool call; a linear scan of sessions scales
    // poorly once users accumulate many backgrounded sessions. The
    // invariant is: for every Session with `pid: Some(n)`, this map
    // has `n -> sid`. Sessions without a live pid have no entry here.
    pid_index: Arc<Mutex<HashMap<u32, SessionId>>>,
    app: AppHandle,
    tx: mpsc::UnboundedSender<PtyEvent>,
    token: String,
}

impl PtyManager {
    pub fn new(app: AppHandle, token: String) -> (Self, mpsc::UnboundedReceiver<PtyEvent>) {
        let (tx, rx) = mpsc::unbounded_channel();
        (
            Self {
                sessions: Arc::new(Mutex::new(HashMap::new())),
                pid_index: Arc::new(Mutex::new(HashMap::new())),
                app,
                tx,
                token,
            },
            rx,
        )
    }

    pub fn list(&self) -> Vec<SessionSnapshot> {
        self.sessions
            .lock()
            .values()
            .map(|s| SessionSnapshot {
                id: s.id,
                name: s.name.clone(),
                cwd: s.cwd.clone(),
                created_at: s.created_at,
                pid: s.pid,
            })
            .collect()
    }

    pub fn describe(&self, id: SessionId, state: SessionState) -> Option<SessionDesc> {
        self.sessions.lock().get(&id).map(|s| s.describe(state))
    }

    pub fn pid_of(&self, id: SessionId) -> Option<u32> {
        self.sessions.lock().get(&id).and_then(|s| s.pid)
    }

    pub fn find_by_pid(&self, pid: u32) -> Option<SessionId> {
        self.pid_index.lock().get(&pid).copied()
    }

    pub fn get_buffer(&self, id: SessionId) -> String {
        let mut sessions = self.sessions.lock();
        let Some(s) = sessions.get_mut(&id) else {
            return String::new();
        };
        // `make_contiguous` folds the two internal slices of the VecDeque
        // into one so we can hand an `&[u8]` to `from_utf8_lossy`. It does
        // an in-place rotation, so subsequent reads are zero-cost until the
        // ring wraps again.
        let slice = s.buffer.make_contiguous();
        String::from_utf8_lossy(slice).into_owned()
    }

    pub fn write(&self, id: SessionId, data: &str) {
        let mut sessions = self.sessions.lock();
        if let Some(s) = sessions.get_mut(&id) {
            if let Some(w) = s.writer.as_mut() {
                let _ = w.write_all(data.as_bytes());
                let _ = w.flush();
            }
        }
    }

    pub fn resize(&self, id: SessionId, cols: u16, rows: u16) {
        let sessions = self.sessions.lock();
        if let Some(s) = sessions.get(&id) {
            if let Some(m) = s.master.as_ref() {
                let _ = m.resize(PtySize {
                    cols,
                    rows,
                    pixel_width: 0,
                    pixel_height: 0,
                });
            }
        }
    }

    pub fn rename(&self, id: SessionId, name: &str) -> Option<SessionDesc> {
        let mut sessions = self.sessions.lock();
        let s = sessions.get_mut(&id)?;
        let trimmed = name.trim();
        if !trimmed.is_empty() {
            s.name = trimmed.to_string();
        }
        Some(s.describe(SessionState::Running))
    }

    pub fn kill(&self, id: SessionId) {
        let mut sessions = self.sessions.lock();
        if let Some(s) = sessions.get_mut(&id) {
            // Dropping the master drops the child handle too.
            s.master.take();
            s.writer.take();
            if let Some(pid) = s.pid.take() {
                self.pid_index.lock().remove(&pid);
            }
        }
    }

    pub fn forget(&self, id: SessionId) {
        self.kill(id);
        self.sessions.lock().remove(&id);
    }

    pub fn list_ids(&self) -> Vec<SessionId> {
        self.sessions.lock().keys().copied().collect()
    }

    pub fn is_running(&self, id: SessionId) -> bool {
        self.sessions
            .lock()
            .get(&id)
            .map(|s| s.master.is_some())
            .unwrap_or(false)
    }

    pub fn register_stub(&self, desc: &SessionDesc, buffer: &str) {
        let s = Session {
            id: desc.id,
            name: desc.name.clone(),
            cwd: desc.cwd.clone(),
            created_at: desc.created_at,
            pid: None,
            master: None,
            writer: None,
            buffer: VecDeque::from_iter(buffer.bytes()),
        };
        self.sessions.lock().insert(desc.id, s);
    }

    pub fn snapshot_records(&self) -> Vec<(SessionDesc, String)> {
        let sessions = self.sessions.lock();
        sessions
            .values()
            .map(|s| {
                (
                    s.describe(SessionState::Running),
                    String::from_utf8_lossy(&Vec::from_iter(s.buffer.iter().copied())).into_owned(),
                )
            })
            .collect()
    }

    pub fn spawn(&self, args: CreateSessionArgs) -> Result<SessionDesc> {
        let cwd = args
            .cwd
            .ok_or_else(|| anyhow!("cwd is required to spawn"))?;
        let id: SessionId = uuid::Uuid::new_v4();
        let name = args
            .name
            .unwrap_or_else(|| format!("session-{}", &id.to_string()[..6]));
        self.spawn_inner(id, name, cwd, args.cols, args.rows)
    }

    pub fn restart(&self, id: SessionId, cols: u16, rows: u16) -> Result<SessionDesc> {
        let (name, cwd) = {
            let sessions = self.sessions.lock();
            let s = sessions
                .get(&id)
                .ok_or_else(|| anyhow!("no such session"))?;
            (s.name.clone(), s.cwd.clone())
        };
        // Remove the old entry so we can re-insert a fresh one under the same id.
        {
            let mut sessions = self.sessions.lock();
            sessions.remove(&id);
        }
        self.spawn_inner(id, name, cwd, cols, rows)
    }

    fn spawn_inner(
        &self,
        id: SessionId,
        name: String,
        cwd: String,
        cols: u16,
        rows: u16,
    ) -> Result<SessionDesc> {
        let shell = resolve_claude()?;
        let mut cmd = CommandBuilder::new(&shell);
        cmd.cwd(&cwd);
        cmd.env("CLAUDITOR_SESSION_ID", id.to_string());
        cmd.env("CLAUDITOR_TOKEN", &self.token);
        cmd.env("TERM", "xterm-256color");
        cmd.env("COLORTERM", "truecolor");
        cmd.env("TERM_PROGRAM", "clauditor");
        cmd.env("FORCE_COLOR", "3");

        let pair = native_pty_system().openpty(PtySize {
            cols,
            rows,
            pixel_width: 0,
            pixel_height: 0,
        })?;

        let child = pair
            .slave
            .spawn_command(cmd)
            .map_err(|e| anyhow!("failed to spawn claude: {}", e))?;
        let pid = child.process_id();

        // Keep the child alive for its lifetime. We track exit via a thread.
        let mut reader = pair
            .master
            .try_clone_reader()
            .map_err(|e| anyhow!("reader clone: {}", e))?;
        let writer = pair
            .master
            .take_writer()
            .map_err(|e| anyhow!("take_writer: {}", e))?;

        let created_at = chrono::Utc::now().timestamp_millis();

        let session = Session {
            id,
            name: name.clone(),
            cwd: cwd.clone(),
            created_at,
            pid,
            master: Some(pair.master),
            writer: Some(writer),
            // Pre-allocate MAX_BUFFER so sustained output doesn't trigger
            // the ring's geometric reallocation cycle.
            buffer: VecDeque::with_capacity(MAX_BUFFER),
        };
        self.sessions.lock().insert(id, session);
        if let Some(pid) = pid {
            self.pid_index.lock().insert(pid, id);
        }

        let desc = SessionDesc {
            id,
            name,
            cwd,
            created_at,
            pid,
            state: SessionState::Running,
        };
        let _ = self.tx.send(PtyEvent::Spawn(desc.clone()));

        // PTY read loop — blocking thread. Forwards chunks via channel + emit.
        let app = self.app.clone();
        let tx = self.tx.clone();
        let sessions = self.sessions.clone();
        let pid_index = self.pid_index.clone();
        std::thread::spawn(move || {
            let mut buf = [0u8; 8192];
            loop {
                match reader.read(&mut buf) {
                    Ok(0) => break,
                    Ok(n) => {
                        let chunk = String::from_utf8_lossy(&buf[..n]).into_owned();
                        if let Some(s) = sessions.lock().get_mut(&id) {
                            s.push_buffer(&buf[..n]);
                        }
                        let _ = app.emit(
                            "session:data",
                            SessionDataEvent {
                                id,
                                chunk: chunk.clone(),
                            },
                        );
                        let _ = tx.send(PtyEvent::Data(id, chunk));
                    }
                    Err(_) => break,
                }
            }
            // Wait for child exit so we can report the code.
            let mut child = child;
            let code = child
                .wait()
                .ok()
                .and_then(|s| s.exit_code().try_into().ok());
            {
                let mut sessions = sessions.lock();
                if let Some(s) = sessions.get_mut(&id) {
                    s.master.take();
                    s.writer.take();
                    if let Some(pid) = s.pid.take() {
                        pid_index.lock().remove(&pid);
                    }
                }
            }
            let _ = app.emit("session:exit", SessionExitEvent { id, code });
            let _ = tx.send(PtyEvent::Exit(id, code));
        });

        Ok(desc)
    }

    pub fn child_pids(&self) -> Vec<u32> {
        self.sessions
            .lock()
            .values()
            .filter_map(|s| s.pid)
            .collect()
    }

    pub fn kill_all(&self) -> u32 {
        // Take the lock once: collect live IDs and drop the master/writer
        // for each in the same critical section. Previous implementation
        // re-locked once per iteration via is_running() + kill().
        let mut sessions = self.sessions.lock();
        let mut pid_index = self.pid_index.lock();
        let mut n = 0u32;
        for s in sessions.values_mut() {
            if s.master.is_some() {
                s.master.take();
                s.writer.take();
                if let Some(pid) = s.pid.take() {
                    pid_index.remove(&pid);
                }
                n += 1;
            }
        }
        n
    }
}

fn resolve_claude() -> Result<PathBuf> {
    if let Ok(o) = std::env::var("CLAUDITOR_CLI_OVERRIDE") {
        return Ok(PathBuf::from(o));
    }
    let is_win = cfg!(windows);
    let candidates: Vec<&str> = if is_win {
        vec!["claude.exe", "claude.cmd", "claude.ps1", "claude"]
    } else {
        vec!["claude"]
    };
    let sep = if is_win { ';' } else { ':' };
    let path_env = std::env::var("PATH").unwrap_or_default();
    for dir in path_env.split(sep) {
        for c in &candidates {
            let full = PathBuf::from(dir).join(c);
            if full.is_file() {
                return Ok(full);
            }
        }
    }
    // Fallback — hope it's on PATH when portable-pty spawns.
    Ok(PathBuf::from(if is_win { "claude.exe" } else { "claude" }))
}
