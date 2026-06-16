use std::collections::HashSet;
use std::path::{Path, PathBuf};

use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

use crate::core::cli_install::{bundled_cli_path, inspect_cli_install, install_cli, CLI_LINK_PATH};
use crate::core::db::now_iso;
use crate::core::models::{
    AppearanceSettings, BoardViewWithGroups, CliInstallStatus, Group, LayoutSettings,
    ShortcutBinding, ShortcutSettings, TodoWithRelations,
};
use crate::core::skills::{
    custom_location_statuses, default_location_statuses, install_skill_to_custom_root,
    install_skill_to_default_target, AgentTarget, SkillCatalog, SkillDefinition,
    SkillInstallLocationStatus,
};
use crate::core::{todo_service, workspace_service};
use crate::AppState;

type CommandResult<T> = Result<T, String>;

const SHORTCUT_SETTINGS_KEY: &str = "shortcuts.v1";
const APPEARANCE_SETTINGS_KEY: &str = "appearance.v1";
const LAYOUT_SETTINGS_KEY: &str = "layout.v1";
const SELECTED_BOARD_VIEW_KEY: &str = "selected_board_view.v1";

#[tauri::command]
pub fn create_todo(
    state: State<'_, AppState>,
    detail: String,
    group_ids: Vec<String>,
    tag_ids: Vec<String>,
) -> CommandResult<TodoWithRelations> {
    let mut conn = lock_conn(&state)?;
    todo_service::create_todo(
        &mut conn,
        todo_service::CreateTodoInput {
            detail,
            group_ids,
            tag_ids,
        },
    )
    .map_err(to_string)
}

#[tauri::command]
pub fn create_inbox_todo(
    state: State<'_, AppState>,
    detail: String,
) -> CommandResult<TodoWithRelations> {
    let mut conn = lock_conn(&state)?;
    todo_service::create_inbox_todo(&mut conn, &detail).map_err(to_string)
}

#[tauri::command]
pub fn list_todos(
    state: State<'_, AppState>,
    board_view_id: Option<String>,
) -> CommandResult<Vec<TodoWithRelations>> {
    let conn = lock_conn(&state)?;
    todo_service::list_board_todos(&conn, board_view_id.as_deref()).map_err(to_string)
}

#[tauri::command]
pub fn list_daily_todos(state: State<'_, AppState>) -> CommandResult<Vec<TodoWithRelations>> {
    let conn = lock_conn(&state)?;
    todo_service::list_daily_todos(&conn).map_err(to_string)
}

#[tauri::command]
pub fn update_todo_detail(
    state: State<'_, AppState>,
    id: String,
    detail: String,
) -> CommandResult<TodoWithRelations> {
    let mut conn = lock_conn(&state)?;
    todo_service::update_todo_detail(&mut conn, &id, &detail).map_err(to_string)
}

#[tauri::command]
pub fn set_todo_priority(
    state: State<'_, AppState>,
    id: String,
    priority: String,
) -> CommandResult<TodoWithRelations> {
    let mut conn = lock_conn(&state)?;
    let priority = todo_service::parse_todo_priority(&priority).map_err(to_string)?;
    todo_service::set_todo_priority(&mut conn, &id, priority).map_err(to_string)
}

#[tauri::command]
pub fn reorder_todos_in_group(
    state: State<'_, AppState>,
    group_id: String,
    todo_ids: Vec<String>,
) -> CommandResult<()> {
    let mut conn = lock_conn(&state)?;
    workspace_service::reorder_todos_in_group(&mut conn, &group_id, &todo_ids).map_err(to_string)
}

#[tauri::command]
pub fn move_todo_from_inbox(
    state: State<'_, AppState>,
    id: String,
    target_group_id: String,
) -> CommandResult<TodoWithRelations> {
    let mut conn = lock_conn(&state)?;
    todo_service::move_todo_from_inbox(&mut conn, &id, &target_group_id).map_err(to_string)
}

#[tauri::command]
pub fn count_inbox_todos(state: State<'_, AppState>) -> CommandResult<i64> {
    let conn = lock_conn(&state)?;
    todo_service::count_inbox_todos(&conn).map_err(to_string)
}

#[tauri::command]
pub fn complete_todo(state: State<'_, AppState>, id: String) -> CommandResult<TodoWithRelations> {
    let mut conn = lock_conn(&state)?;
    todo_service::complete_todo(&mut conn, &id).map_err(to_string)
}

#[tauri::command]
pub fn reopen_todo(state: State<'_, AppState>, id: String) -> CommandResult<TodoWithRelations> {
    let mut conn = lock_conn(&state)?;
    todo_service::reopen_todo(&mut conn, &id).map_err(to_string)
}

#[tauri::command]
pub fn archive_todo(state: State<'_, AppState>, id: String) -> CommandResult<TodoWithRelations> {
    let mut conn = lock_conn(&state)?;
    todo_service::archive_todo(&mut conn, &id).map_err(to_string)
}

#[tauri::command]
pub fn delete_todo(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    let conn = lock_conn(&state)?;
    todo_service::delete_todo(&conn, &id).map_err(to_string)
}

#[tauri::command]
pub fn list_groups(state: State<'_, AppState>) -> CommandResult<Vec<Group>> {
    let conn = lock_conn(&state)?;
    workspace_service::list_groups(&conn).map_err(to_string)
}

#[tauri::command]
pub fn create_group(state: State<'_, AppState>, name: String) -> CommandResult<Group> {
    let conn = lock_conn(&state)?;
    workspace_service::create_group(&conn, &name).map_err(to_string)
}

#[tauri::command]
pub fn list_board_views(state: State<'_, AppState>) -> CommandResult<Vec<BoardViewWithGroups>> {
    let conn = lock_conn(&state)?;
    workspace_service::list_board_views(&conn).map_err(to_string)
}

#[tauri::command]
pub fn get_selected_board_view_id(state: State<'_, AppState>) -> CommandResult<Option<String>> {
    let conn = lock_conn(&state)?;
    get_selected_board_view_id_from_conn(&conn)
}

#[tauri::command]
pub fn save_selected_board_view_id(
    state: State<'_, AppState>,
    board_view_id: String,
) -> CommandResult<String> {
    let conn = lock_conn(&state)?;
    save_selected_board_view_id_to_conn(&conn, &board_view_id)
}

#[tauri::command]
pub fn set_board_view_group_membership(
    state: State<'_, AppState>,
    board_view_id: String,
    group_id: String,
    included: bool,
) -> CommandResult<BoardViewWithGroups> {
    let mut conn = lock_conn(&state)?;
    workspace_service::set_board_view_group_membership(
        &mut conn,
        &board_view_id,
        &group_id,
        included,
    )
    .map_err(to_string)
}

#[tauri::command]
pub fn list_weekly_done(
    state: State<'_, AppState>,
    start_date: String,
    end_date: String,
) -> CommandResult<Vec<TodoWithRelations>> {
    let conn = lock_conn(&state)?;
    todo_service::list_weekly_done(&conn, &start_date, &end_date).map_err(to_string)
}

#[tauri::command]
pub fn get_cli_install_status() -> CommandResult<CliInstallStatus> {
    let source = bundled_cli_path().map_err(to_string)?;
    Ok(inspect_cli_install(&source, Path::new(CLI_LINK_PATH)))
}

#[tauri::command]
pub fn install_cli_tool() -> CommandResult<CliInstallStatus> {
    let source = bundled_cli_path().map_err(to_string)?;
    install_cli(&source, Path::new(CLI_LINK_PATH)).map_err(to_string)
}

#[tauri::command]
pub fn list_available_skills() -> CommandResult<Vec<SkillDefinition>> {
    Ok(SkillCatalog::embedded().map_err(to_string)?.skills)
}

#[tauri::command]
pub fn get_skill_install_statuses(
    skill_name: String,
    custom_roots: Vec<String>,
) -> CommandResult<Vec<SkillInstallLocationStatus>> {
    let catalog = SkillCatalog::embedded().map_err(to_string)?;
    let home = dirs::home_dir().ok_or_else(|| "无法确定用户目录".to_string())?;
    let mut statuses =
        default_location_statuses(&catalog, &skill_name, &home).map_err(to_string)?;
    let custom_roots = custom_roots
        .into_iter()
        .filter(|path| !path.trim().is_empty())
        .map(PathBuf::from)
        .collect::<Vec<_>>();
    statuses
        .extend(custom_location_statuses(&catalog, &skill_name, &custom_roots).map_err(to_string)?);
    Ok(statuses)
}

#[tauri::command]
pub fn install_skill_to_target(
    skill_name: String,
    target: String,
    custom_root: Option<String>,
) -> CommandResult<SkillInstallLocationStatus> {
    let catalog = SkillCatalog::embedded().map_err(to_string)?;
    if target == "custom" {
        let custom_root = custom_root.ok_or_else(|| "需要选择自定义安装目录".to_string())?;
        return install_skill_to_custom_root(&catalog, &skill_name, Path::new(&custom_root))
            .map_err(to_string);
    }
    let target = parse_agent_target(&target)?;
    let home = dirs::home_dir().ok_or_else(|| "无法确定用户目录".to_string())?;
    install_skill_to_default_target(&catalog, &skill_name, target, &home).map_err(to_string)
}

#[tauri::command]
pub fn choose_skill_install_directory() -> CommandResult<Option<String>> {
    Ok(rfd::FileDialog::new()
        .set_title("Choose Skill Install Folder")
        .pick_folder()
        .map(|path| path.display().to_string()))
}

#[tauri::command]
pub fn get_shortcut_settings(state: State<'_, AppState>) -> CommandResult<ShortcutSettings> {
    let conn = lock_conn(&state)?;
    get_shortcut_settings_from_conn(&conn)
}

#[tauri::command]
pub fn save_shortcut_settings(
    state: State<'_, AppState>,
    settings: ShortcutSettings,
) -> CommandResult<ShortcutSettings> {
    let conn = lock_conn(&state)?;
    save_shortcut_settings_to_conn(&conn, settings)
}

#[tauri::command]
pub fn get_appearance_settings(state: State<'_, AppState>) -> CommandResult<AppearanceSettings> {
    let conn = lock_conn(&state)?;
    get_appearance_settings_from_conn(&conn)
}

#[tauri::command]
pub fn save_appearance_settings(
    state: State<'_, AppState>,
    settings: AppearanceSettings,
) -> CommandResult<AppearanceSettings> {
    let conn = lock_conn(&state)?;
    save_appearance_settings_to_conn(&conn, settings)
}

#[tauri::command]
pub fn get_layout_settings(state: State<'_, AppState>) -> CommandResult<LayoutSettings> {
    let conn = lock_conn(&state)?;
    get_layout_settings_from_conn(&conn)
}

#[tauri::command]
pub fn save_layout_settings(
    state: State<'_, AppState>,
    settings: LayoutSettings,
) -> CommandResult<LayoutSettings> {
    let conn = lock_conn(&state)?;
    save_layout_settings_to_conn(&conn, settings)
}

fn default_shortcut_settings() -> ShortcutSettings {
    ShortcutSettings {
        version: 1,
        open_settings: shortcut(",", true, false, false, false),
        select_previous_todo: shortcut("ArrowUp", true, false, false, false),
        select_next_todo: shortcut("ArrowDown", true, false, false, false),
        edit_selected_todo: shortcut("Space", false, false, false, false),
        toggle_selected_todo_done: shortcut("Enter", true, false, false, false),
    }
}

fn parse_agent_target(value: &str) -> CommandResult<AgentTarget> {
    match value {
        "agents" => Ok(AgentTarget::Agents),
        "codex" => Ok(AgentTarget::Codex),
        "claude" => Ok(AgentTarget::Claude),
        _ => Err(format!("无效 Skill 安装目标: {value}")),
    }
}

fn shortcut(
    key: &str,
    meta_key: bool,
    shift_key: bool,
    alt_key: bool,
    ctrl_key: bool,
) -> ShortcutBinding {
    ShortcutBinding {
        key: key.to_string(),
        meta_key,
        shift_key,
        alt_key,
        ctrl_key,
    }
}

fn get_shortcut_settings_from_conn(conn: &Connection) -> CommandResult<ShortcutSettings> {
    let value = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![SHORTCUT_SETTINGS_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(to_string)?;
    let Some(value) = value else {
        return Ok(default_shortcut_settings());
    };
    let settings = serde_json::from_str::<ShortcutSettings>(&value)
        .unwrap_or_else(|_| default_shortcut_settings());
    if validate_shortcut_settings(&settings).is_ok() {
        Ok(settings)
    } else {
        Ok(default_shortcut_settings())
    }
}

fn save_shortcut_settings_to_conn(
    conn: &Connection,
    settings: ShortcutSettings,
) -> CommandResult<ShortcutSettings> {
    validate_shortcut_settings(&settings)?;
    let value = serde_json::to_string(&settings).map_err(to_string)?;
    conn.execute(
        r#"
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE
        SET value = excluded.value, updated_at = excluded.updated_at
        "#,
        params![SHORTCUT_SETTINGS_KEY, value, now_iso()],
    )
    .map_err(to_string)?;
    Ok(settings)
}

fn default_appearance_settings() -> AppearanceSettings {
    AppearanceSettings {
        version: 1,
        mode: "system".to_string(),
    }
}

fn get_appearance_settings_from_conn(conn: &Connection) -> CommandResult<AppearanceSettings> {
    let value = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![APPEARANCE_SETTINGS_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(to_string)?;
    let Some(value) = value else {
        return Ok(default_appearance_settings());
    };
    let settings = serde_json::from_str::<AppearanceSettings>(&value)
        .unwrap_or_else(|_| default_appearance_settings());
    if validate_appearance_settings(&settings).is_ok() {
        Ok(settings)
    } else {
        Ok(default_appearance_settings())
    }
}

fn save_appearance_settings_to_conn(
    conn: &Connection,
    settings: AppearanceSettings,
) -> CommandResult<AppearanceSettings> {
    validate_appearance_settings(&settings)?;
    let value = serde_json::to_string(&settings).map_err(to_string)?;
    conn.execute(
        r#"
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE
        SET value = excluded.value, updated_at = excluded.updated_at
        "#,
        params![APPEARANCE_SETTINGS_KEY, value, now_iso()],
    )
    .map_err(to_string)?;
    Ok(settings)
}

fn default_layout_settings() -> LayoutSettings {
    LayoutSettings {
        version: 1,
        sidebar_collapsed: false,
    }
}

fn get_layout_settings_from_conn(conn: &Connection) -> CommandResult<LayoutSettings> {
    let value = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![LAYOUT_SETTINGS_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(to_string)?;
    let Some(value) = value else {
        return Ok(default_layout_settings());
    };
    let settings = serde_json::from_str::<LayoutSettings>(&value)
        .unwrap_or_else(|_| default_layout_settings());
    if validate_layout_settings(&settings).is_ok() {
        Ok(settings)
    } else {
        Ok(default_layout_settings())
    }
}

fn save_layout_settings_to_conn(
    conn: &Connection,
    settings: LayoutSettings,
) -> CommandResult<LayoutSettings> {
    validate_layout_settings(&settings)?;
    let value = serde_json::to_string(&settings).map_err(to_string)?;
    conn.execute(
        r#"
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE
        SET value = excluded.value, updated_at = excluded.updated_at
        "#,
        params![LAYOUT_SETTINGS_KEY, value, now_iso()],
    )
    .map_err(to_string)?;
    Ok(settings)
}

fn get_selected_board_view_id_from_conn(conn: &Connection) -> CommandResult<Option<String>> {
    let value = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![SELECTED_BOARD_VIEW_KEY],
            |row| row.get::<_, String>(0),
        )
        .optional()
        .map_err(to_string)?;
    Ok(value.filter(|id| !id.trim().is_empty()))
}

fn save_selected_board_view_id_to_conn(
    conn: &Connection,
    board_view_id: &str,
) -> CommandResult<String> {
    workspace_service::get_board_view(conn, board_view_id).map_err(to_string)?;
    conn.execute(
        r#"
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE
        SET value = excluded.value, updated_at = excluded.updated_at
        "#,
        params![SELECTED_BOARD_VIEW_KEY, board_view_id, now_iso()],
    )
    .map_err(to_string)?;
    Ok(board_view_id.to_string())
}

fn validate_appearance_settings(settings: &AppearanceSettings) -> CommandResult<()> {
    if settings.version != 1 {
        return Err("Unsupported appearance settings version".to_string());
    }
    if !matches!(settings.mode.as_str(), "system" | "light" | "dark") {
        return Err("Unsupported appearance mode".to_string());
    }
    Ok(())
}

fn validate_layout_settings(settings: &LayoutSettings) -> CommandResult<()> {
    if settings.version != 1 {
        return Err("Unsupported layout settings version".to_string());
    }
    Ok(())
}

fn validate_shortcut_settings(settings: &ShortcutSettings) -> CommandResult<()> {
    if settings.version != 1 {
        return Err("Unsupported shortcut settings version".to_string());
    }
    let bindings = [
        ("openSettings", &settings.open_settings),
        ("selectPreviousTodo", &settings.select_previous_todo),
        ("selectNextTodo", &settings.select_next_todo),
        ("editSelectedTodo", &settings.edit_selected_todo),
        (
            "toggleSelectedTodoDone",
            &settings.toggle_selected_todo_done,
        ),
    ];
    let mut signatures = HashSet::new();
    for (action, binding) in bindings {
        validate_shortcut_binding(action, binding)?;
        if !signatures.insert(shortcut_signature(binding)) {
            return Err(format!("Duplicate shortcut binding for {action}"));
        }
    }
    Ok(())
}

fn validate_shortcut_binding(action: &str, binding: &ShortcutBinding) -> CommandResult<()> {
    let key = binding.key.trim();
    if key.is_empty() || key != binding.key {
        return Err(format!("Invalid shortcut key for {action}"));
    }
    if matches!(key, "Meta" | "Shift" | "Alt" | "Control" | "Ctrl") {
        return Err(format!("Invalid shortcut key for {action}"));
    }
    if !matches!(
        key,
        "ArrowUp"
            | "ArrowDown"
            | "ArrowLeft"
            | "ArrowRight"
            | "Enter"
            | "Space"
            | "Escape"
            | "Tab"
            | ","
            | "."
            | "/"
            | ";"
            | "'"
            | "["
            | "]"
            | "-"
            | "="
            | "`"
    ) && key.chars().count() != 1
    {
        return Err(format!("Unsupported shortcut key for {action}"));
    }
    Ok(())
}

fn shortcut_signature(binding: &ShortcutBinding) -> String {
    format!(
        "{}:{}:{}:{}:{}",
        binding.meta_key,
        binding.shift_key,
        binding.alt_key,
        binding.ctrl_key,
        binding.key.to_lowercase()
    )
}

fn lock_conn<'a>(
    state: &'a State<'_, AppState>,
) -> Result<std::sync::MutexGuard<'a, Connection>, String> {
    state
        .conn
        .lock()
        .map_err(|_| "Database connection lock is poisoned".to_string())
}

fn to_string(error: impl ToString) -> String {
    error.to_string()
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::db::test_database;

    #[test]
    fn settings_round_trip_through_shared_database() {
        let conn = test_database();
        let mut shortcuts = default_shortcut_settings();
        shortcuts.open_settings = shortcut(".", true, false, false, false);
        assert_eq!(
            save_shortcut_settings_to_conn(&conn, shortcuts.clone()).expect("save shortcuts"),
            get_shortcut_settings_from_conn(&conn).expect("load shortcuts")
        );

        let appearance = AppearanceSettings {
            version: 1,
            mode: "light".to_string(),
        };
        assert_eq!(
            save_appearance_settings_to_conn(&conn, appearance.clone()).expect("save appearance"),
            get_appearance_settings_from_conn(&conn).expect("load appearance")
        );

        let layout = LayoutSettings {
            version: 1,
            sidebar_collapsed: true,
        };
        assert_eq!(
            save_layout_settings_to_conn(&conn, layout.clone()).expect("save layout"),
            get_layout_settings_from_conn(&conn).expect("load layout")
        );

        let work_view = workspace_service::list_board_views(&conn)
            .expect("list views")
            .into_iter()
            .find(|view| view.name == "工作")
            .expect("work view");
        assert_eq!(
            save_selected_board_view_id_to_conn(&conn, &work_view.id).expect("save view"),
            work_view.id
        );
        assert_eq!(
            get_selected_board_view_id_from_conn(&conn).expect("load view"),
            Some(work_view.id)
        );
    }

    #[test]
    fn shortcut_validation_rejects_duplicates() {
        let mut settings = default_shortcut_settings();
        settings.select_next_todo = settings.select_previous_todo.clone();
        assert!(validate_shortcut_settings(&settings).is_err());
    }
}
