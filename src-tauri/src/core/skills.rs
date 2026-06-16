use std::fs;
use std::path::{Path, PathBuf};

use serde::{Deserialize, Serialize};

use super::db::new_id;
use super::error::{EasyDoError, Result};

const EMBEDDED_MANIFEST: &str = include_str!("../../../skills/manifest.json");
const EMBEDDED_EASYDO_SKILL: &str = include_str!("../../../skills/easydo/SKILL.md");
const MARKER_FILE: &str = ".easydo-skill.json";

#[derive(Debug, Clone, Serialize, Deserialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillDefinition {
    pub name: String,
    pub version: String,
    pub description: String,
    pub path: String,
}

#[derive(Debug, Clone)]
pub struct SkillCatalog {
    pub skills: Vec<SkillDefinition>,
    root: Option<PathBuf>,
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum AgentTarget {
    Agents,
    Codex,
    Claude,
}

impl AgentTarget {
    pub fn name(self) -> &'static str {
        match self {
            Self::Agents => "agents",
            Self::Codex => "codex",
            Self::Claude => "claude",
        }
    }

    pub fn skill_root(self, home: &Path) -> PathBuf {
        match self {
            Self::Agents => home.join(".agents/skills"),
            Self::Codex => home.join(".codex/skills"),
            Self::Claude => home.join(".claude/skills"),
        }
    }
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct SkillManifest {
    skills: Vec<SkillDefinition>,
}

#[derive(Debug, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
struct ManagedSkillMarker {
    managed_by: String,
    name: String,
    version: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillInstallResult {
    pub skill: String,
    pub agent: String,
    pub status: String,
    pub message: String,
}

#[derive(Debug, Clone, Serialize, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct SkillInstallLocationStatus {
    pub skill: String,
    pub target: String,
    pub path: String,
    pub state: String,
    pub message: String,
}

impl SkillCatalog {
    pub fn embedded() -> Result<Self> {
        Self::from_manifest(EMBEDDED_MANIFEST, None)
    }

    pub fn load(root: &Path) -> Result<Self> {
        let manifest_path = root.join("manifest.json");
        let manifest = fs::read_to_string(&manifest_path).map_err(|error| {
            EasyDoError::system(format!(
                "无法读取 Skill manifest {}: {error}",
                manifest_path.display()
            ))
        })?;
        Self::from_manifest(&manifest, Some(root.to_path_buf()))
    }

    pub fn selected(&self, selection: &str) -> Result<Vec<SkillDefinition>> {
        if selection == "all" {
            return Ok(self.skills.clone());
        }
        self.skills
            .iter()
            .find(|skill| skill.name == selection)
            .cloned()
            .map(|skill| vec![skill])
            .ok_or_else(|| EasyDoError::not_found(format!("未找到 Skill: {selection}")))
    }

    fn from_manifest(manifest: &str, root: Option<PathBuf>) -> Result<Self> {
        let manifest: SkillManifest = serde_json::from_str(manifest)
            .map_err(|error| EasyDoError::system(format!("Skill manifest 格式错误: {error}")))?;
        if manifest.skills.is_empty() {
            return Err(EasyDoError::system("Skill manifest 不能为空"));
        }
        for skill in &manifest.skills {
            if skill.name.trim().is_empty()
                || skill.version.trim().is_empty()
                || skill.path.trim().is_empty()
            {
                return Err(EasyDoError::system(
                    "Skill manifest 缺少 name、version 或 path",
                ));
            }
        }
        Ok(Self {
            skills: manifest.skills,
            root,
        })
    }

    fn write_skill_source(&self, skill: &SkillDefinition, destination: &Path) -> Result<()> {
        if let Some(root) = &self.root {
            copy_directory(&root.join(&skill.path), destination)?;
            return Ok(());
        }
        fs::create_dir_all(destination)?;
        match skill.name.as_str() {
            "easydo" => fs::write(destination.join("SKILL.md"), EMBEDDED_EASYDO_SKILL)?,
            _ => {
                return Err(EasyDoError::system(format!(
                    "内置 Skill 缺少资源: {}",
                    skill.name
                )))
            }
        }
        Ok(())
    }
}

pub fn install_skills(
    catalog: &SkillCatalog,
    selection: &str,
    targets: &[AgentTarget],
    home: &Path,
) -> Result<Vec<SkillInstallResult>> {
    let skills = catalog.selected(selection)?;
    let mut results = Vec::new();
    for target in targets {
        for skill in &skills {
            results.push(install_one(catalog, skill, *target, home));
        }
    }
    Ok(results)
}

pub fn default_location_statuses(
    catalog: &SkillCatalog,
    selection: &str,
    home: &Path,
) -> Result<Vec<SkillInstallLocationStatus>> {
    let skills = catalog.selected(selection)?;
    let mut statuses = Vec::new();
    for target in [AgentTarget::Agents, AgentTarget::Codex, AgentTarget::Claude] {
        let root = target.skill_root(home);
        for skill in &skills {
            statuses.push(inspect_skill_location(
                skill,
                target.name().to_string(),
                &root,
            ));
        }
    }
    Ok(statuses)
}

pub fn custom_location_statuses(
    catalog: &SkillCatalog,
    selection: &str,
    roots: &[PathBuf],
) -> Result<Vec<SkillInstallLocationStatus>> {
    let skills = catalog.selected(selection)?;
    let mut statuses = Vec::new();
    for root in roots {
        for skill in &skills {
            statuses.push(inspect_skill_location(skill, "custom".to_string(), root));
        }
    }
    Ok(statuses)
}

pub fn install_skill_to_default_target(
    catalog: &SkillCatalog,
    selection: &str,
    target: AgentTarget,
    home: &Path,
) -> Result<SkillInstallLocationStatus> {
    let skill = single_skill(catalog, selection)?;
    let root = target.skill_root(home);
    install_skill_to_root(catalog, &skill, target.name().to_string(), &root)
}

pub fn install_skill_to_custom_root(
    catalog: &SkillCatalog,
    selection: &str,
    root: &Path,
) -> Result<SkillInstallLocationStatus> {
    let skill = single_skill(catalog, selection)?;
    install_skill_to_root(catalog, &skill, "custom".to_string(), root)
}

fn single_skill(catalog: &SkillCatalog, selection: &str) -> Result<SkillDefinition> {
    let skills = catalog.selected(selection)?;
    if skills.len() != 1 {
        return Err(EasyDoError::invalid("请选择一个 Skill"));
    }
    Ok(skills[0].clone())
}

fn install_skill_to_root(
    catalog: &SkillCatalog,
    skill: &SkillDefinition,
    target: String,
    root: &Path,
) -> Result<SkillInstallLocationStatus> {
    install_one_inner_at_root(catalog, skill, root)?;
    Ok(inspect_skill_location(skill, target, root))
}

fn install_one(
    catalog: &SkillCatalog,
    skill: &SkillDefinition,
    target: AgentTarget,
    home: &Path,
) -> SkillInstallResult {
    match install_one_inner(catalog, skill, target, home) {
        Ok((status, message)) => SkillInstallResult {
            skill: skill.name.clone(),
            agent: target.name().to_string(),
            status,
            message,
        },
        Err(error) => SkillInstallResult {
            skill: skill.name.clone(),
            agent: target.name().to_string(),
            status: "failed".to_string(),
            message: error.message,
        },
    }
}

fn install_one_inner(
    catalog: &SkillCatalog,
    skill: &SkillDefinition,
    target: AgentTarget,
    home: &Path,
) -> Result<(String, String)> {
    install_one_inner_at_root(catalog, skill, &target.skill_root(home))
}

fn install_one_inner_at_root(
    catalog: &SkillCatalog,
    skill: &SkillDefinition,
    root: &Path,
) -> Result<(String, String)> {
    fs::create_dir_all(root)?;
    let destination = root.join(&skill.name);
    if destination.exists() {
        let marker = read_marker(&destination)?;
        let Some(marker) = marker else {
            return Err(EasyDoError::invalid_state(format!(
                "Skill 目录冲突: {}",
                destination.display()
            )));
        };
        if marker.name != skill.name || marker.managed_by != "easydo" {
            return Err(EasyDoError::invalid_state(format!(
                "Skill 目录冲突: {}",
                destination.display()
            )));
        }
        if marker.version == skill.version {
            return Ok(("unchanged".to_string(), format!("{} 已安装", skill.name)));
        }
    }

    let temp = root.join(format!(".{}.easydo-tmp-{}", skill.name, new_id()));
    catalog.write_skill_source(skill, &temp)?;
    write_marker(&temp, skill)?;

    if destination.exists() {
        let backup = root.join(format!(".{}.easydo-backup-{}", skill.name, new_id()));
        fs::rename(&destination, &backup)?;
        if let Err(error) = fs::rename(&temp, &destination) {
            let _ = fs::rename(&backup, &destination);
            let _ = fs::remove_dir_all(&temp);
            return Err(error.into());
        }
        fs::remove_dir_all(backup)?;
        Ok((
            "updated".to_string(),
            format!("{} 已更新到 {}", skill.name, skill.version),
        ))
    } else {
        fs::rename(&temp, &destination)?;
        Ok((
            "installed".to_string(),
            format!("{} 已安装到 {}", skill.name, root.display()),
        ))
    }
}

fn inspect_skill_location(
    skill: &SkillDefinition,
    target: String,
    root: &Path,
) -> SkillInstallLocationStatus {
    let destination = root.join(&skill.name);
    let path = destination.display().to_string();
    if !destination.exists() {
        return SkillInstallLocationStatus {
            skill: skill.name.clone(),
            target,
            path,
            state: "notInstalled".to_string(),
            message: "未安装".to_string(),
        };
    }
    match read_marker(&destination) {
        Ok(Some(marker))
            if marker.managed_by == "easydo"
                && marker.name == skill.name
                && marker.version == skill.version =>
        {
            SkillInstallLocationStatus {
                skill: skill.name.clone(),
                target,
                path,
                state: "installed".to_string(),
                message: format!("已安装 {}", marker.version),
            }
        }
        Ok(Some(marker)) if marker.managed_by == "easydo" && marker.name == skill.name => {
            SkillInstallLocationStatus {
                skill: skill.name.clone(),
                target,
                path,
                state: "outdated".to_string(),
                message: format!("已安装 {}，可更新到 {}", marker.version, skill.version),
            }
        }
        Ok(_) => SkillInstallLocationStatus {
            skill: skill.name.clone(),
            target,
            path,
            state: "conflict".to_string(),
            message: "路径已存在但不是 EasyDo 管理的 Skill".to_string(),
        },
        Err(error) => SkillInstallLocationStatus {
            skill: skill.name.clone(),
            target,
            path,
            state: "error".to_string(),
            message: error.message,
        },
    }
}

fn read_marker(destination: &Path) -> Result<Option<ManagedSkillMarker>> {
    let marker_path = destination.join(MARKER_FILE);
    if !marker_path.exists() {
        return Ok(None);
    }
    let content = fs::read_to_string(marker_path)?;
    Ok(Some(serde_json::from_str(&content).map_err(|_| {
        EasyDoError::invalid_state(format!(
            "EasyDo Skill 管理标识无效: {}",
            destination.display()
        ))
    })?))
}

fn write_marker(destination: &Path, skill: &SkillDefinition) -> Result<()> {
    let marker = ManagedSkillMarker {
        managed_by: "easydo".to_string(),
        name: skill.name.clone(),
        version: skill.version.clone(),
    };
    fs::write(
        destination.join(MARKER_FILE),
        serde_json::to_vec_pretty(&marker)?,
    )?;
    Ok(())
}

fn copy_directory(source: &Path, destination: &Path) -> Result<()> {
    if !source.is_dir() {
        return Err(EasyDoError::system(format!(
            "Skill 资源目录不存在: {}",
            source.display()
        )));
    }
    fs::create_dir_all(destination)?;
    for entry in fs::read_dir(source)? {
        let entry = entry?;
        let file_type = entry.file_type()?;
        let target = destination.join(entry.file_name());
        if file_type.is_dir() {
            copy_directory(&entry.path(), &target)?;
        } else if file_type.is_file() {
            fs::copy(entry.path(), target)?;
        }
    }
    Ok(())
}

#[cfg(test)]
mod tests {
    use tempfile::tempdir;

    use super::*;

    #[test]
    fn embedded_catalog_contains_easydo_skill() {
        let catalog = SkillCatalog::embedded().expect("load embedded catalog");
        assert_eq!(catalog.skills[0].name, "easydo");
        assert_eq!(catalog.skills[0].version, "0.3.0");
        assert!(EMBEDDED_EASYDO_SKILL.contains("easydo list --json"));
        assert!(EMBEDDED_EASYDO_SKILL.contains("不得直接读写"));
        assert!(EMBEDDED_EASYDO_SKILL.contains("独立 Agent"));
        assert!(EMBEDDED_EASYDO_SKILL.contains("use subagents"));
        assert!(EMBEDDED_EASYDO_SKILL.contains("single-agent fallback"));
        assert!(EMBEDDED_EASYDO_SKILL.contains("easydo inbox add"));
    }

    #[test]
    fn malformed_manifest_is_rejected() {
        let root = tempdir().expect("temp dir");
        fs::write(root.path().join("manifest.json"), "{bad json").expect("write manifest");
        assert!(SkillCatalog::load(root.path()).is_err());
    }

    #[test]
    fn missing_manifest_is_rejected() {
        let root = tempdir().expect("temp dir");
        let error = SkillCatalog::load(root.path()).expect_err("missing manifest should fail");
        assert!(error.message.contains("无法读取 Skill manifest"));
    }

    #[test]
    fn install_is_idempotent_and_rejects_user_directory() {
        let home = tempdir().expect("home");
        let catalog = SkillCatalog::embedded().expect("catalog");
        let first = install_skills(&catalog, "easydo", &[AgentTarget::Codex], home.path())
            .expect("install");
        assert_eq!(first[0].status, "installed");
        let second = install_skills(&catalog, "easydo", &[AgentTarget::Codex], home.path())
            .expect("install again");
        assert_eq!(second[0].status, "unchanged");

        let user_home = tempdir().expect("user home");
        let conflict = user_home.path().join(".claude/skills/easydo");
        fs::create_dir_all(&conflict).expect("create conflict");
        fs::write(conflict.join("SKILL.md"), "user content").expect("write conflict");
        let result = install_skills(&catalog, "easydo", &[AgentTarget::Claude], user_home.path())
            .expect("collect conflict result");
        assert_eq!(result[0].status, "failed");
        assert!(result[0].message.contains("Skill 目录冲突"));
    }

    #[test]
    fn managed_skill_is_upgraded() {
        let home = tempdir().expect("home");
        let embedded = SkillCatalog::embedded().expect("embedded catalog");
        let source = tempdir().expect("source");
        fs::create_dir_all(source.path().join("easydo")).expect("create source skill");
        fs::write(
            source.path().join("manifest.json"),
            r#"{"skills":[{"name":"easydo","version":"0.1.0","description":"old","path":"easydo"}]}"#,
        )
        .expect("write manifest");
        fs::write(source.path().join("easydo/SKILL.md"), "old skill").expect("write skill");
        let old = SkillCatalog::load(source.path()).expect("load old catalog");
        install_skills(&old, "easydo", &[AgentTarget::Codex], home.path())
            .expect("install old version");

        let before = default_location_statuses(&embedded, "easydo", home.path())
            .expect("inspect outdated");
        let codex = before
            .into_iter()
            .find(|status| status.target == "codex")
            .expect("codex status");
        assert_eq!(codex.state, "outdated");
        assert!(codex.message.contains("0.1.0"));
        assert!(codex.message.contains("0.3.0"));

        let result = install_skills(&embedded, "easydo", &[AgentTarget::Codex], home.path())
            .expect("upgrade");

        assert_eq!(result[0].status, "updated");
        let installed =
            fs::read_to_string(home.path().join(".codex/skills/easydo/SKILL.md"))
                .expect("read installed skill");
        assert!(installed.contains("独立 Agent"));
        assert!(installed.contains("use subagents"));
        assert!(installed.contains("single-agent fallback"));
    }

    #[test]
    fn custom_location_status_tracks_installation() {
        let catalog = SkillCatalog::embedded().expect("catalog");
        let root = tempdir().expect("custom root");

        let before = custom_location_statuses(&catalog, "easydo", &[root.path().to_path_buf()])
            .expect("status before install");
        assert_eq!(before[0].state, "notInstalled");

        let installed =
            install_skill_to_custom_root(&catalog, "easydo", root.path()).expect("install custom");
        assert_eq!(installed.state, "installed");

        let after = custom_location_statuses(&catalog, "easydo", &[root.path().to_path_buf()])
            .expect("status after install");
        assert_eq!(after[0].state, "installed");
        assert!(root.path().join("easydo/SKILL.md").is_file());
    }
}
