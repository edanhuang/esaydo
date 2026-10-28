//! 「在终端打开」用哪个终端 App：设置的存取，以及各终端打开脚本的方式。

use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::db::now_iso;
use super::error::{EasyDoError, Result};

const TERMINAL_SETTINGS_KEY: &str = "terminal.v1";

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq, Eq)]
#[serde(rename_all = "camelCase")]
pub struct TerminalSettings {
    pub version: u16,
    /// terminal / ghostty / iterm2
    pub app: String,
}

impl Default for TerminalSettings {
    fn default() -> Self {
        Self { version: 1, app: "terminal".to_string() }
    }
}

fn validate(settings: &TerminalSettings) -> Result<()> {
    if settings.version != 1 {
        return Err(EasyDoError::invalid("不支持的终端设置版本"));
    }
    if !matches!(settings.app.as_str(), "terminal" | "ghostty" | "iterm2") {
        return Err(EasyDoError::invalid("只支持终端、Ghostty 和 iTerm2"));
    }
    Ok(())
}

pub fn load(conn: &Connection) -> Result<TerminalSettings> {
    let value = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![TERMINAL_SETTINGS_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    // 没存过、存坏了或者值不认识，都回到默认的「终端」
    Ok(value
        .and_then(|value| serde_json::from_str::<TerminalSettings>(&value).ok())
        .filter(|settings| validate(settings).is_ok())
        .unwrap_or_default())
}

pub fn save(conn: &Connection, settings: TerminalSettings) -> Result<TerminalSettings> {
    validate(&settings)?;
    let value = serde_json::to_string(&settings).map_err(|error| EasyDoError::system(error.to_string()))?;
    conn.execute(
        r#"
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE
        SET value = excluded.value, updated_at = excluded.updated_at
        "#,
        params![TERMINAL_SETTINGS_KEY, value, now_iso()],
    )?;
    Ok(settings)
}

/// App 在 /Applications 下的名字，用来提示没装的情况
pub fn app_bundle(app: &str) -> &'static str {
    match app {
        "ghostty" => "Ghostty.app",
        "iterm2" => "iTerm.app",
        _ => "Terminal.app",
    }
}

pub fn app_label(app: &str) -> &'static str {
    match app {
        "ghostty" => "Ghostty",
        "iterm2" => "iTerm2",
        _ => "终端",
    }
}

/// 用 open 把可执行脚本交给终端 App 运行。
/// Ghostty 在 macOS 上不能直接打开脚本文件，要开一个新实例并用 -e 指定命令
pub fn open_args(app: &str, script: &Path) -> Vec<String> {
    let script = script.display().to_string();
    match app {
        "ghostty" => vec!["-na".into(), "Ghostty.app".into(), "--args".into(), "-e".into(), script],
        "iterm2" => vec!["-a".into(), "iTerm".into(), script],
        _ => vec!["-a".into(), "Terminal".into(), script],
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::db::test_database;

    #[test]
    fn defaults_to_terminal_and_round_trips() {
        let conn = test_database();
        assert_eq!(load(&conn).expect("load"), TerminalSettings::default());

        let ghostty = TerminalSettings { version: 1, app: "ghostty".to_string() };
        save(&conn, ghostty.clone()).expect("save");
        assert_eq!(load(&conn).expect("load"), ghostty);

        let bad = TerminalSettings { version: 1, app: "warp".to_string() };
        assert_eq!(save(&conn, bad).expect_err("bad").message, "只支持终端、Ghostty 和 iTerm2");
    }

    #[test]
    fn builds_open_arguments_for_each_terminal() {
        let script = Path::new("/tmp/s.command");
        assert_eq!(open_args("terminal", script), ["-a", "Terminal", "/tmp/s.command"]);
        assert_eq!(open_args("iterm2", script), ["-a", "iTerm", "/tmp/s.command"]);
        assert_eq!(open_args("ghostty", script), ["-na", "Ghostty.app", "--args", "-e", "/tmp/s.command"]);
    }
}
