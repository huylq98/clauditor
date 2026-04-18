use serde::Serialize;
use std::path::PathBuf;

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(rename_all = "lowercase")]
pub enum CapabilityKind {
    Skill,
    Subagent,
    McpServer,
    SlashCommand,
}

#[derive(Serialize, Clone, Debug, PartialEq, Eq)]
#[serde(tag = "type", rename_all = "camelCase")]
pub enum Source {
    Plugin {
        marketplace: String,
        plugin: String,
        version: String,
    },
    User {
        dir: PathBuf,
    },
    Settings {
        file: PathBuf,
    },
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct Capability {
    pub id: String,
    pub kind: CapabilityKind,
    pub name: String,
    pub description: String,
    pub when_to_use: Option<String>,
    pub source: Source,
    pub invocation: String,
}

#[derive(Serialize, Clone, Debug)]
#[serde(rename_all = "camelCase")]
pub struct CapabilitiesSnapshot {
    pub items: Vec<Capability>,
    pub scanned_at: i64,
    pub parse_warnings: Vec<String>,
}

/// Scan ~/.claude/ and return a snapshot of every locally-installed capability.
/// Defensive: per-file errors land in `parse_warnings`; the scan never aborts.
/// Stubbed in Task 1 — populated by later tasks.
pub fn list_capabilities(claude_dir: &std::path::Path) -> CapabilitiesSnapshot {
    let _ = claude_dir;
    CapabilitiesSnapshot {
        items: Vec::new(),
        scanned_at: chrono::Utc::now().timestamp_millis(),
        parse_warnings: Vec::new(),
    }
}
