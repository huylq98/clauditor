use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
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

#[derive(Deserialize)]
struct Frontmatter {
    #[serde(default)]
    name: Option<String>,
    #[serde(default)]
    description: Option<String>,
    #[serde(default)]
    when_to_use: Option<String>,
}

fn split_frontmatter(text: &str) -> Option<(&str, &str)> {
    let stripped = text.strip_prefix("---\n")?;
    let end = stripped.find("\n---\n")?;
    Some((&stripped[..end], &stripped[end + 5..]))
}

fn first_paragraph(body: &str) -> Option<String> {
    body.split("\n\n")
        .map(str::trim)
        .find(|p| !p.is_empty())
        .map(|p| {
            let mut s = p.to_string();
            if s.len() > 240 {
                s.truncate(240);
            }
            s
        })
}

fn parse_skill_md(path: &std::path::Path) -> Result<(String, String, Option<String>)> {
    let text = std::fs::read_to_string(path).context("read SKILL.md")?;
    let (fm_text, body) = split_frontmatter(&text).context("missing frontmatter")?;
    let fm: Frontmatter = serde_yaml_ng::from_str(fm_text).context("parse frontmatter yaml")?;
    let name = fm
        .name
        .or_else(|| {
            path.parent()
                .and_then(|p| p.file_name())
                .and_then(|s| s.to_str())
                .map(|s| s.to_string())
        })
        .context("missing name")?;
    let description = fm.description.unwrap_or_default();
    let when_to_use = fm.when_to_use.or_else(|| first_paragraph(body));
    Ok((name, description, when_to_use))
}

fn scan_plugin_skills(
    claude_dir: &std::path::Path,
    out: &mut Vec<Capability>,
    warnings: &mut Vec<String>,
) {
    let cache = claude_dir.join("plugins").join("cache");
    let Ok(marketplaces) = std::fs::read_dir(&cache) else {
        return;
    };
    for mp in marketplaces.flatten() {
        let mp_name = mp.file_name().to_string_lossy().to_string();
        let Ok(plugins) = std::fs::read_dir(mp.path()) else {
            continue;
        };
        for plugin in plugins.flatten() {
            let plugin_name = plugin.file_name().to_string_lossy().to_string();
            let Ok(versions) = std::fs::read_dir(plugin.path()) else {
                continue;
            };
            for version in versions.flatten() {
                let version_name = version.file_name().to_string_lossy().to_string();
                let skills_dir = version.path().join("skills");
                let Ok(skill_dirs) = std::fs::read_dir(&skills_dir) else {
                    continue;
                };
                for skill_dir in skill_dirs.flatten() {
                    let skill_md = skill_dir.path().join("SKILL.md");
                    if !skill_md.exists() {
                        continue;
                    }
                    match parse_skill_md(&skill_md) {
                        Ok((name, description, when_to_use)) => {
                            out.push(Capability {
                                id: format!(
                                    "skill:plugin:{}/{}/{}:{}",
                                    mp_name, plugin_name, version_name, name
                                ),
                                kind: CapabilityKind::Skill,
                                invocation: format!("/{}", name),
                                name,
                                description,
                                when_to_use,
                                source: Source::Plugin {
                                    marketplace: mp_name.clone(),
                                    plugin: plugin_name.clone(),
                                    version: version_name.clone(),
                                },
                            });
                        }
                        Err(e) => {
                            warnings.push(format!(
                                "skipped malformed SKILL.md at {}: {:#}",
                                skill_md.display(),
                                e
                            ));
                        }
                    }
                }
            }
        }
    }
}

pub fn list_capabilities(claude_dir: &std::path::Path) -> CapabilitiesSnapshot {
    let mut items = Vec::new();
    let mut parse_warnings = Vec::new();
    scan_plugin_skills(claude_dir, &mut items, &mut parse_warnings);
    CapabilitiesSnapshot {
        items,
        scanned_at: chrono::Utc::now().timestamp_millis(),
        parse_warnings,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::path::Path;

    fn fixture(name: &str) -> PathBuf {
        Path::new(env!("CARGO_MANIFEST_DIR"))
            .join("tests/fixtures/capabilities")
            .join(name)
    }

    #[test]
    fn parses_well_formed_skill() {
        let snap = list_capabilities(&fixture("skill_well_formed"));
        let skill = snap
            .items
            .iter()
            .find(|c| c.kind == CapabilityKind::Skill)
            .expect("skill not found");
        assert_eq!(skill.name, "demo-skill");
        assert_eq!(skill.description, "A demo skill for testing.");
        assert_eq!(
            skill.when_to_use.as_deref(),
            Some("Use this when running the test suite.")
        );
        assert_eq!(skill.invocation, "/demo-skill");
        assert!(matches!(
            &skill.source,
            Source::Plugin { marketplace, plugin, version }
                if marketplace == "marketplace1" && plugin == "plugin1" && version == "1.0.0"
        ));
        assert_eq!(
            skill.id,
            "skill:plugin:marketplace1/plugin1/1.0.0:demo-skill"
        );
        assert!(snap.parse_warnings.is_empty());
    }
}
