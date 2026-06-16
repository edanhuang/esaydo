use std::fs;
use std::path::{Path, PathBuf};
use std::process::Command;

use super::error::{EasyDoError, Result};
use super::models::CliInstallStatus;

pub const CLI_LINK_PATH: &str = "/usr/local/bin/easydo";

pub fn bundled_cli_path() -> Result<PathBuf> {
    let current = std::env::current_exe()?;
    let parent = current
        .parent()
        .ok_or_else(|| EasyDoError::system("无法确定 EasyDo 可执行文件目录"))?;
    let mut candidates = vec![
        parent.join("easydo-cli"),
        parent
            .parent()
            .map(|contents| contents.join("Resources/easydo-cli"))
            .unwrap_or_default(),
    ];
    if let Some(target) = option_env!("TAURI_ENV_TARGET_TRIPLE") {
        candidates.push(
            PathBuf::from(env!("CARGO_MANIFEST_DIR"))
                .join("binaries")
                .join(format!("easydo-cli-{target}")),
        );
    }
    candidates
        .into_iter()
        .find(|path| path.is_file())
        .ok_or_else(|| EasyDoError::system("未找到 App 内置命令行工具"))
}

pub fn inspect_cli_install(source: &Path, link: &Path) -> CliInstallStatus {
    let source_path = Some(source.display().to_string());
    match fs::symlink_metadata(link) {
        Err(error) if error.kind() == std::io::ErrorKind::NotFound => CliInstallStatus {
            state: "notInstalled".to_string(),
            source_path,
            link_path: link.display().to_string(),
            message: "命令行工具尚未安装".to_string(),
        },
        Err(error) => CliInstallStatus {
            state: "error".to_string(),
            source_path,
            link_path: link.display().to_string(),
            message: format!("无法检查命令行工具: {error}"),
        },
        Ok(metadata) if !metadata.file_type().is_symlink() => CliInstallStatus {
            state: "conflict".to_string(),
            source_path,
            link_path: link.display().to_string(),
            message: format!("目标路径已被其他文件占用: {}", link.display()),
        },
        Ok(_) => match fs::read_link(link) {
            Ok(target) if target == source => CliInstallStatus {
                state: "installed".to_string(),
                source_path,
                link_path: link.display().to_string(),
                message: "命令行工具已安装".to_string(),
            },
            Ok(target) if is_easydo_link(&target) => CliInstallStatus {
                state: "stale".to_string(),
                source_path,
                link_path: link.display().to_string(),
                message: "命令行工具链接需要更新".to_string(),
            },
            Ok(_) => CliInstallStatus {
                state: "conflict".to_string(),
                source_path,
                link_path: link.display().to_string(),
                message: format!("目标路径已被其他链接占用: {}", link.display()),
            },
            Err(error) => CliInstallStatus {
                state: "error".to_string(),
                source_path,
                link_path: link.display().to_string(),
                message: format!("无法读取命令行工具链接: {error}"),
            },
        },
    }
}

pub fn install_cli(source: &Path, link: &Path) -> Result<CliInstallStatus> {
    if !source.is_file() {
        return Err(EasyDoError::system("未找到 App 内置命令行工具"));
    }
    let status = inspect_cli_install(source, link);
    match status.state.as_str() {
        "installed" => return Ok(status),
        "conflict" | "error" => return Err(EasyDoError::invalid_state(status.message)),
        _ => {}
    }

    if let Some(parent) = link.parent() {
        if fs::create_dir_all(parent).is_ok() && try_install_link(source, link).is_ok() {
            return verify_cli_install(source, link);
        }
    }

    #[cfg(target_os = "macos")]
    {
        authorize_install(source, link)?;
        verify_cli_install(source, link)
    }

    #[cfg(not(target_os = "macos"))]
    Err(EasyDoError::system("当前平台不支持从 App 安装命令行工具"))
}

fn try_install_link(source: &Path, link: &Path) -> std::io::Result<()> {
    if fs::symlink_metadata(link).is_ok() {
        fs::remove_file(link)?;
    }
    #[cfg(unix)]
    std::os::unix::fs::symlink(source, link)?;
    Ok(())
}

fn verify_cli_install(source: &Path, link: &Path) -> Result<CliInstallStatus> {
    let status = inspect_cli_install(source, link);
    if status.state != "installed" {
        return Err(EasyDoError::system(status.message));
    }
    let output = Command::new(link).arg("--version").output()?;
    if !output.status.success() {
        return Err(EasyDoError::system("命令行工具已链接，但版本检查失败"));
    }
    Ok(status)
}

fn is_easydo_link(target: &Path) -> bool {
    target.file_name().is_some_and(|name| name == "easydo-cli")
        && target
            .components()
            .any(|component| component.as_os_str() == "EasyDo.app")
}

#[cfg(target_os = "macos")]
fn authorize_install(source: &Path, link: &Path) -> Result<()> {
    let source = apple_script_string(&source.display().to_string());
    let link = apple_script_string(&link.display().to_string());
    let script = format!(
        r#"do shell script ("/bin/mkdir -p " & quoted form of "/usr/local/bin" & " && /bin/rm -f " & quoted form of "{link}" & " && /bin/ln -s " & quoted form of "{source}" & " " & quoted form of "{link}") with administrator privileges"#
    );
    let output = Command::new("/usr/bin/osascript")
        .args(["-e", &script])
        .output()?;
    if !output.status.success() {
        let reason = String::from_utf8_lossy(&output.stderr).trim().to_string();
        return Err(EasyDoError::system(if reason.is_empty() {
            "命令行工具安装授权失败".to_string()
        } else {
            format!("命令行工具安装失败: {reason}")
        }));
    }
    Ok(())
}

#[cfg(target_os = "macos")]
fn apple_script_string(value: &str) -> String {
    value.replace('\\', "\\\\").replace('"', "\\\"")
}

#[cfg(test)]
mod tests {
    use std::os::unix::fs::PermissionsExt;

    use tempfile::tempdir;

    use super::*;

    #[test]
    fn inspect_distinguishes_installed_stale_and_conflict() {
        let root = tempdir().expect("temp dir");
        let source = root.path().join("EasyDo.app/Contents/MacOS/easydo-cli");
        fs::create_dir_all(source.parent().expect("source parent")).expect("create source parent");
        fs::write(&source, "binary").expect("write source");
        let link = root.path().join("bin/easydo");
        fs::create_dir_all(link.parent().expect("link parent")).expect("create link parent");

        assert_eq!(inspect_cli_install(&source, &link).state, "notInstalled");
        #[cfg(unix)]
        std::os::unix::fs::symlink(&source, &link).expect("create link");
        assert_eq!(inspect_cli_install(&source, &link).state, "installed");

        fs::remove_file(&link).expect("remove link");
        fs::write(&link, "other").expect("write conflict");
        assert_eq!(inspect_cli_install(&source, &link).state, "conflict");
    }

    #[test]
    fn install_creates_and_verifies_link_without_authorization_when_writable() {
        let root = tempdir().expect("temp dir");
        let source = root.path().join("EasyDo.app/Contents/MacOS/easydo-cli");
        fs::create_dir_all(source.parent().expect("source parent")).expect("create source parent");
        fs::write(&source, "#!/bin/sh\necho 'easydo 0.1.0'\n").expect("write CLI");
        let mut permissions = fs::metadata(&source).expect("metadata").permissions();
        permissions.set_mode(0o755);
        fs::set_permissions(&source, permissions).expect("make executable");
        let link = root.path().join("bin/easydo");

        let status = install_cli(&source, &link).expect("install CLI");

        assert_eq!(status.state, "installed");
        assert_eq!(fs::read_link(link).expect("read link"), source);
    }
}
