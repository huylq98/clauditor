use serde::{Deserialize, Serialize};
use uuid::Uuid;

pub type SessionId = Uuid;

#[derive(Debug, Clone, Copy, Default, PartialEq, Eq, Hash, Serialize, Deserialize)]
#[serde(rename_all = "snake_case")]
pub enum SessionState {
    Starting,
    #[default]
    Running,
    Idle,
    AwaitingUser,
    AwaitingPermission,
    Working,
    Exited,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct SessionDesc {
    pub id: SessionId,
    pub name: String,
    pub cwd: String,
    pub created_at: i64,
    pub pid: Option<u32>,
    pub state: SessionState,
}

#[derive(Debug, Clone, Deserialize)]
pub struct CreateSessionArgs {
    pub cwd: Option<String>,
    pub name: Option<String>,
    pub cols: u16,
    pub rows: u16,
}

#[derive(Debug, Clone, Serialize)]
pub struct KillSummary {
    pub killed: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct RestartSummary {
    pub restarted: u32,
}

#[derive(Debug, Clone, Serialize)]
pub struct ForgetSummary {
    pub forgotten: u32,
}

#[derive(Debug, Clone, Serialize, Deserialize)]
#[serde(rename_all = "lowercase")]
pub enum EntryKind {
    Dir,
    File,
}

#[derive(Debug, Clone, Serialize)]
pub struct TreeEntry {
    pub path: String,
    pub kind: EntryKind,
    pub size: Option<u64>,
    pub mtime: Option<i64>,
}

#[derive(Debug, Clone, Serialize)]
pub struct FilePreview {
    pub path: String,
    pub content: String,
    pub truncated: bool,
    pub binary: bool,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ActivitySnapshot {
    pub created: Vec<String>,
    pub modified: Vec<String>,
    pub deleted: Vec<String>,
    pub tools: std::collections::HashMap<String, u32>,
}

#[derive(Debug, Clone, Default, Serialize)]
pub struct ActivityDelta {
    #[serde(skip_serializing_if = "Option::is_none")]
    pub created: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub modified: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub deleted: Option<Vec<String>>,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub tools: Option<std::collections::HashMap<String, u32>>,
}

#[derive(Debug, Clone, Copy, Serialize)]
#[serde(rename_all = "camelCase")]
pub enum TreeEventType {
    Add,
    Change,
    Unlink,
    #[serde(rename = "addDir")]
    AddDir,
    #[serde(rename = "unlinkDir")]
    UnlinkDir,
}

#[derive(Debug, Clone, Serialize)]
pub struct TreeEvent {
    pub sid: SessionId,
    #[serde(rename = "type")]
    pub event_type: TreeEventType,
    pub path: String,
    #[serde(skip_serializing_if = "Option::is_none")]
    pub kind: Option<EntryKind>,
}

/* Event payloads emitted to the frontend. */
#[derive(Debug, Clone, Serialize)]
pub struct SessionDataEvent {
    pub id: SessionId,
    pub chunk: String,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionStateEvent {
    pub id: SessionId,
    pub state: SessionState,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionExitEvent {
    pub id: SessionId,
    pub code: Option<i32>,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionFocusEvent {
    pub id: SessionId,
}

#[derive(Debug, Clone, Serialize)]
pub struct SessionForgottenEvent {
    pub id: SessionId,
}

#[derive(Debug, Clone, Serialize)]
pub struct ActivityDeltaEvent {
    pub sid: SessionId,
    pub delta: ActivityDelta,
}
