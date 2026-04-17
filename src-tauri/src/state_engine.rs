use std::collections::HashMap;
use std::sync::Arc;
use std::time::Duration;

use parking_lot::Mutex;
use tauri::{AppHandle, Emitter};
use tokio::task::JoinHandle;

use crate::types::{SessionId, SessionState, SessionStateEvent};

const IDLE_TIMEOUT: Duration = Duration::from_secs(5 * 60);
const STOP_GRACE: Duration = Duration::from_millis(1500);

pub enum Hook {
    UserPromptSubmit,
    PreToolUse,
    PostToolUse,
    Stop,
    Notification,
}

struct Entry {
    state: SessionState,
    idle_task: Option<JoinHandle<()>>,
    stop_task: Option<JoinHandle<()>>,
}

impl Entry {
    fn new(state: SessionState) -> Self {
        Self {
            state,
            idle_task: None,
            stop_task: None,
        }
    }

    fn cancel_all(&mut self) {
        if let Some(h) = self.idle_task.take() {
            h.abort();
        }
        if let Some(h) = self.stop_task.take() {
            h.abort();
        }
    }

    fn cancel_stop(&mut self) {
        if let Some(h) = self.stop_task.take() {
            h.abort();
        }
    }
}

#[derive(Clone)]
pub struct StateEngine {
    inner: Arc<Mutex<HashMap<SessionId, Entry>>>,
    app: AppHandle,
}

impl StateEngine {
    pub fn new(app: AppHandle) -> Self {
        Self {
            inner: Arc::new(Mutex::new(HashMap::new())),
            app,
        }
    }

    pub fn register(&self, id: SessionId) {
        {
            let mut map = self.inner.lock();
            map.insert(id, Entry::new(SessionState::Running));
        }
        self.emit(id, SessionState::Running);
        self.arm_idle(id);
    }

    pub fn unregister(&self, id: SessionId) {
        let mut map = self.inner.lock();
        if let Some(mut entry) = map.remove(&id) {
            entry.cancel_all();
        }
    }

    pub fn get(&self, id: SessionId) -> Option<SessionState> {
        self.inner.lock().get(&id).map(|e| e.state)
    }

    pub fn all(&self) -> HashMap<SessionId, SessionState> {
        self.inner
            .lock()
            .iter()
            .map(|(k, v)| (*k, v.state))
            .collect()
    }

    pub fn mark_exited(&self, id: SessionId) {
        let should_emit = {
            let mut map = self.inner.lock();
            match map.get_mut(&id) {
                Some(e) if e.state != SessionState::Exited => {
                    e.cancel_all();
                    e.state = SessionState::Exited;
                    true
                }
                _ => false,
            }
        };
        if should_emit {
            self.emit(id, SessionState::Exited);
        }
    }

    pub fn note_activity(&self, id: SessionId) {
        let transition_to_running = {
            let mut map = self.inner.lock();
            match map.get_mut(&id) {
                Some(e) => {
                    let should = matches!(
                        e.state,
                        SessionState::Idle
                            | SessionState::AwaitingUser
                            | SessionState::AwaitingPermission
                    );
                    if should {
                        e.state = SessionState::Running;
                    }
                    (should, e.state != SessionState::Exited)
                }
                None => (false, false),
            }
        };
        if transition_to_running.0 {
            self.emit(id, SessionState::Running);
        }
        if transition_to_running.1 {
            self.arm_idle(id);
        }
    }

    pub fn handle_hook(&self, id: SessionId, hook: Hook) {
        match hook {
            Hook::UserPromptSubmit | Hook::PreToolUse | Hook::PostToolUse => {
                self.set(id, SessionState::Running);
                self.arm_idle(id);
            }
            Hook::Stop => {
                self.cancel_stop(id);
                let engine = self.clone();
                let handle = tokio::spawn(async move {
                    tokio::time::sleep(STOP_GRACE).await;
                    if engine.get(id) == Some(SessionState::Running) {
                        engine.set(id, SessionState::AwaitingUser);
                    }
                });
                {
                    let mut map = self.inner.lock();
                    if let Some(e) = map.get_mut(&id) {
                        if let Some(prev) = e.stop_task.take() {
                            prev.abort();
                        }
                        e.stop_task = Some(handle);
                    }
                }
                self.arm_idle(id);
            }
            Hook::Notification => {
                self.set(id, SessionState::AwaitingPermission);
                self.arm_idle(id);
            }
        }
    }

    fn set(&self, id: SessionId, next: SessionState) {
        let changed = {
            let mut map = self.inner.lock();
            match map.get_mut(&id) {
                Some(e) if e.state != next => {
                    e.state = next;
                    true
                }
                _ => false,
            }
        };
        if changed {
            self.emit(id, next);
        }
    }

    fn arm_idle(&self, id: SessionId) {
        let engine = self.clone();
        let handle = tokio::spawn(async move {
            tokio::time::sleep(IDLE_TIMEOUT).await;
            let cur = engine.get(id);
            if matches!(cur, Some(SessionState::Running) | Some(SessionState::AwaitingUser)) {
                engine.set(id, SessionState::Idle);
            }
        });
        let mut map = self.inner.lock();
        if let Some(e) = map.get_mut(&id) {
            if let Some(prev) = e.idle_task.take() {
                prev.abort();
            }
            e.idle_task = Some(handle);
        }
    }

    fn cancel_stop(&self, id: SessionId) {
        let mut map = self.inner.lock();
        if let Some(e) = map.get_mut(&id) {
            e.cancel_stop();
        }
    }

    fn emit(&self, id: SessionId, state: SessionState) {
        let _ = self
            .app
            .emit("session:state", SessionStateEvent { id, state });
    }
}
