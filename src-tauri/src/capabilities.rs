use anyhow::{Context, Result};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;

#[derive(Serialize, Clone, Debug, PartialEq, Eq, Hash)]
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
            if p.chars().count() > 240 {
                p.chars().take(240).collect()
            } else {
                p.to_string()
            }
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

// (false, _) < (true, _): "unknown" always ranks below any real version string.
fn version_rank(v: &str) -> impl Ord + '_ {
    (v != "unknown", v)
}

fn dedup_by_greatest_version(items: &mut Vec<Capability>) {
    use std::collections::HashMap;
    let mut best: HashMap<(CapabilityKind, String, String, String), (String, usize)> =
        HashMap::new();
    let mut to_remove: Vec<usize> = Vec::new();
    for (idx, cap) in items.iter().enumerate() {
        if let Source::Plugin {
            marketplace,
            plugin,
            version,
        } = &cap.source
        {
            let key = (
                cap.kind.clone(),
                marketplace.clone(),
                plugin.clone(),
                cap.name.clone(),
            );
            match best.get(&key) {
                None => {
                    best.insert(key, (version.clone(), idx));
                }
                Some((existing_ver, existing_idx)) => {
                    if version_rank(version) > version_rank(existing_ver) {
                        to_remove.push(*existing_idx);
                        best.insert(key, (version.clone(), idx));
                    } else {
                        to_remove.push(idx);
                    }
                }
            }
        }
    }
    to_remove.sort_unstable();
    to_remove.dedup();
    for idx in to_remove.into_iter().rev() {
        items.swap_remove(idx);
    }
}

pub fn list_capabilities(claude_dir: &std::path::Path) -> CapabilitiesSnapshot {
    let mut items = Vec::new();
    let mut parse_warnings = Vec::new();
    scan_plugin_skills(claude_dir, &mut items, &mut parse_warnings);
    dedup_by_greatest_version(&mut items);
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

    #[test]
    fn dedups_multi_version_skills_to_greatest() {
        let snap = list_capabilities(&fixture("skill_multi_version"));
        let skills: Vec<_> = snap
            .items
            .iter()
            .filter(|c| c.kind == CapabilityKind::Skill)
            .collect();
        assert_eq!(skills.len(), 1, "expected exactly one skill after dedup");
        assert_eq!(skills[0].description, "version 2.0.0");
    }

    #[test]
    fn first_paragraph_truncates_on_char_boundary_for_non_ascii() {
        // 250 cherry-blossom emoji (each = 4 UTF-8 bytes); without char-boundary
        // truncation this would panic.
        let body = "🌸".repeat(250);
        let result = first_paragraph(&body);
        assert!(result.is_some());
        let s = result.unwrap();
        // Either chars-take-240 (240 emoji = 960 bytes) or byte-boundary safe truncation
        // is acceptable. Just assert no panic and a non-empty result.
        assert!(!s.is_empty());
    }

    #[test]
    fn skips_skill_with_bad_yaml_and_warns() {
        let snap = list_capabilities(&fixture("skill_bad_yaml"));
        assert!(snap.items.is_empty());
        assert_eq!(snap.parse_warnings.len(), 1);
        assert!(snap.parse_warnings[0].contains("broken"));
    }

    #[test]
    fn skips_skill_with_no_frontmatter_and_warns() {
        let snap = list_capabilities(&fixture("skill_no_frontmatter"));
        assert!(snap.items.is_empty());
        assert_eq!(snap.parse_warnings.len(), 1);
        assert!(snap.parse_warnings[0].contains("missing frontmatter"));
    }

    #[test]
    fn falls_back_to_first_body_paragraph_for_when_to_use() {
        let snap = list_capabilities(&fixture("skill_body_when_to_use"));
        let skill = &snap.items[0];
        assert_eq!(
            skill.when_to_use.as_deref(),
            Some("Use this when you want to test body-paragraph fallback.")
        );
    }
}
