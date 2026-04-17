use std::collections::HashMap;
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
    buffer: Vec<u8>,
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
        self.buffer.extend_from_slice(chunk);
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

#[derive(Clone)]
pub struct PtyManager {
    sessions: Arc<Mutex<HashMap<SessionId, Session>>>,
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
                app,
                tx,
                token,
            },
            rx,
        )
    }

    pub fn list(&self) -> Vec<(SessionId, String, String, i64, Option<u32>)> {
        self.sessions
            .lock()
            .values()
            .map(|s| (s.id, s.name.clone(), s.cwd.clone(), s.created_at, s.pid))
            .collect()
    }

    pub fn describe(&self, id: SessionId, state: SessionState) -> Option<SessionDesc> {
        self.sessions.lock().get(&id).map(|s| s.describe(state))
    }

    pub fn pid_of(&self, id: SessionId) -> Option<u32> {
        self.sessions.lock().get(&id).and_then(|s| s.pid)
    }

    pub fn find_by_pid(&self, pid: u32) -> Option<SessionId> {
        self.sessions
            .lock()
            .values()
            .find(|s| s.pid == Some(pid))
            .map(|s| s.id)
    }

    pub fn get_buffer(&self, id: SessionId) -> String {
        match self.sessions.lock().get(&id) {
            Some(s) => String::from_utf8_lossy(&s.buffer).into_owned(),
            None => String::new(),
        }
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
            s.pid = None;
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
            buffer: buffer.as_bytes().to_vec(),
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
                    String::from_utf8_lossy(&s.buffer).into_owned(),
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
            let s = sessions.get(&id).ok_or_else(|| anyhow!("no such session"))?;
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
            buffer: Vec::new(),
        };
        self.sessions.lock().insert(id, session);

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
            let code = child.wait().ok().and_then(|s| s.exit_code().try_into().ok());
            {
                let mut sessions = sessions.lock();
                if let Some(s) = sessions.get_mut(&id) {
                    s.master.take();
                    s.writer.take();
                    s.pid = None;
                }
            }
            let _ = app.emit("session:exit", SessionExitEvent { id, code });
            let _ = tx.send(PtyEvent::Exit(id, code));
        });

        Ok(desc)
    }

    pub fn kill_all(&self) -> u32 {
        let ids: Vec<SessionId> = self.sessions.lock().keys().copied().collect();
        let mut n = 0u32;
        for id in ids {
            if self.is_running(id) {
                self.kill(id);
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
