use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension};
use tauri::State;

use crate::db::{new_id, now_iso};
use crate::models::{
    AppearanceSettings, BoardViewWithGroups, Group, ShortcutBinding, ShortcutSettings, Tag, Todo,
    TodoGroupSortOrder, TodoWithRelations,
};
use crate::AppState;

type CommandResult<T> = Result<T, String>;

const SHORTCUT_SETTINGS_KEY: &str = "shortcuts.v1";
const APPEARANCE_SETTINGS_KEY: &str = "appearance.v1";

#[tauri::command]
pub fn create_todo(
    state: State<'_, AppState>,
    detail: String,
    group_ids: Vec<String>,
    tag_ids: Vec<String>,
) -> CommandResult<TodoWithRelations> {
    let trimmed = detail.trim();
    if trimmed.is_empty() {
        return Err("Todo detail cannot be empty".to_string());
    }
    if group_ids.is_empty() {
        return Err("Todo must be assigned to at least one group".to_string());
    }

    let mut conn = lock_conn(&state)?;
    let tx = conn.transaction().map_err(to_string)?;
    tx.execute_batch("PRAGMA foreign_keys = ON;").map_err(to_string)?;

    let id = new_id();
    let now = now_iso();
    tx.execute(
        r#"
        INSERT INTO todos (id, detail, status, created_at, updated_at)
        VALUES (?1, ?2, 'active', ?3, ?3)
        "#,
        params![id, trimmed, now],
    )
    .map_err(to_string)?;

    for group_id in &group_ids {
        let sort_order = tx
            .query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM todo_groups WHERE group_id = ?1",
                params![group_id],
                |row| row.get::<_, i64>(0),
            )
            .map_err(to_string)?;
        tx.execute(
            "INSERT INTO todo_groups (todo_id, group_id, sort_order) VALUES (?1, ?2, ?3)",
            params![id, group_id, sort_order],
        )
        .map_err(to_string)?;
    }

    for tag_id in &tag_ids {
        tx.execute(
            "INSERT INTO todo_tags (todo_id, tag_id) VALUES (?1, ?2)",
            params![id, tag_id],
        )
        .map_err(to_string)?;
    }

    tx.execute(
        r#"
        INSERT INTO todo_events (id, todo_id, event_type, content, created_at)
        VALUES (?1, ?2, 'created', ?3, ?4)
        "#,
        params![new_id(), id, trimmed, now],
    )
    .map_err(to_string)?;

    tx.commit().map_err(to_string)?;
    get_todo_with_relations(&conn, &id).map_err(to_string)
}

#[tauri::command]
pub fn list_todos(
    state: State<'_, AppState>,
    board_view_id: Option<String>,
) -> CommandResult<Vec<TodoWithRelations>> {
    let conn = lock_conn(&state)?;
    let filter_group_ids = match board_view_id {
        Some(id) => list_board_view_group_ids(&conn, &id).map_err(to_string)?,
        None => Vec::new(),
    };

    let todo_ids = if filter_group_ids.is_empty() {
        let mut stmt = conn
            .prepare(
                r#"
                SELECT id
                FROM todos
                WHERE status != 'archived'
                ORDER BY (
                  SELECT MIN(todo_groups.sort_order)
                  FROM todo_groups
                  WHERE todo_groups.todo_id = todos.id
                ) ASC, created_at ASC
                "#,
            )
            .map_err(to_string)?;
        let rows = stmt
            .query_map([], |row| row.get::<_, String>(0))
            .map_err(to_string)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_string)?;
        rows
    } else {
        let placeholders = repeat_vars(filter_group_ids.len());
        let sql = format!(
            r#"
            SELECT todos.id
            FROM todos
            INNER JOIN todo_groups ON todo_groups.todo_id = todos.id
            WHERE todos.status != 'archived'
              AND todo_groups.group_id IN ({})
            GROUP BY todos.id
            ORDER BY MIN(todo_groups.sort_order) ASC, todos.created_at ASC
            "#,
            placeholders
        );
        let mut stmt = conn.prepare(&sql).map_err(to_string)?;
        let rows = stmt
            .query_map(rusqlite::params_from_iter(filter_group_ids.iter()), |row| {
                row.get::<_, String>(0)
            })
            .map_err(to_string)?
            .collect::<Result<Vec<_>, _>>()
            .map_err(to_string)?;
        rows
    };

    todo_ids
        .iter()
        .map(|id| get_todo_with_relations(&conn, id).map_err(to_string))
        .collect()
}

#[tauri::command]
pub fn list_daily_todos(state: State<'_, AppState>) -> CommandResult<Vec<TodoWithRelations>> {
    let conn = lock_conn(&state)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id
            FROM todos
            ORDER BY
              CASE
                WHEN status = 'archived' AND archived_at IS NOT NULL THEN archived_at
                WHEN status = 'done' AND completed_at IS NOT NULL THEN completed_at
                ELSE created_at
              END ASC,
              created_at ASC
            "#,
        )
        .map_err(to_string)?;

    let ids = stmt
        .query_map([], |row| row.get::<_, String>(0))
        .map_err(to_string)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_string)?;

    ids.iter()
        .map(|id| get_todo_with_relations(&conn, id).map_err(to_string))
        .collect()
}

#[tauri::command]
pub fn update_todo_detail(
    state: State<'_, AppState>,
    id: String,
    detail: String,
) -> CommandResult<TodoWithRelations> {
    let trimmed = detail.trim();
    if trimmed.is_empty() {
        return Err("Todo detail cannot be empty".to_string());
    }

    let mut conn = lock_conn(&state)?;
    let tx = conn.transaction().map_err(to_string)?;
    let now = now_iso();
    get_todo(&tx, &id).map_err(to_string)?;

    tx.execute(
        r#"
        UPDATE todos
        SET detail = ?1, updated_at = ?2
        WHERE id = ?3
        "#,
        params![trimmed, now, id],
    )
    .map_err(to_string)?;

    tx.execute(
        r#"
        INSERT INTO todo_events (id, todo_id, event_type, content, created_at)
        VALUES (?1, ?2, 'updated', ?3, ?4)
        "#,
        params![new_id(), id, trimmed, now],
    )
    .map_err(to_string)?;

    tx.commit().map_err(to_string)?;
    get_todo_with_relations(&conn, &id).map_err(to_string)
}

#[tauri::command]
pub fn reorder_todos_in_group(
    state: State<'_, AppState>,
    group_id: String,
    todo_ids: Vec<String>,
) -> CommandResult<()> {
    if todo_ids.is_empty() {
        return Ok(());
    }

    let mut seen = HashSet::new();
    if todo_ids.iter().any(|id| id.trim().is_empty() || !seen.insert(id)) {
        return Err("Todo order contains duplicate or empty ids".to_string());
    }

    let mut conn = lock_conn(&state)?;
    let tx = conn.transaction().map_err(to_string)?;
    get_group(&tx, &group_id).map_err(to_string)?;

    for todo_id in &todo_ids {
        let exists = tx
            .query_row(
                "SELECT 1 FROM todo_groups WHERE group_id = ?1 AND todo_id = ?2",
                params![group_id, todo_id],
                |_| Ok(()),
            )
            .optional()
            .map_err(to_string)?
            .is_some();
        if !exists {
            return Err(format!("Todo {todo_id} is not in group {group_id}"));
        }
    }

    let now = now_iso();
    for (index, todo_id) in todo_ids.iter().enumerate() {
        tx.execute(
            r#"
            UPDATE todo_groups
            SET sort_order = ?1
            WHERE group_id = ?2 AND todo_id = ?3
            "#,
            params![index as i64, group_id, todo_id],
        )
        .map_err(to_string)?;
        tx.execute(
            "UPDATE todos SET updated_at = ?1 WHERE id = ?2",
            params![now, todo_id],
        )
        .map_err(to_string)?;
    }

    tx.commit().map_err(to_string)
}

#[tauri::command]
pub fn complete_todo(state: State<'_, AppState>, id: String) -> CommandResult<TodoWithRelations> {
    transition_todo(&state, &id, "done", "completed")
}

#[tauri::command]
pub fn reopen_todo(state: State<'_, AppState>, id: String) -> CommandResult<TodoWithRelations> {
    transition_todo(&state, &id, "active", "reopened")
}

#[tauri::command]
pub fn archive_todo(state: State<'_, AppState>, id: String) -> CommandResult<TodoWithRelations> {
    transition_todo(&state, &id, "archived", "archived")
}

#[tauri::command]
pub fn delete_todo(state: State<'_, AppState>, id: String) -> CommandResult<()> {
    let conn = lock_conn(&state)?;
    let affected = conn
        .execute("DELETE FROM todos WHERE id = ?1", params![id])
        .map_err(to_string)?;

    if affected == 0 {
        return Err("Todo not found".to_string());
    }

    Ok(())
}

#[tauri::command]
pub fn list_groups(state: State<'_, AppState>) -> CommandResult<Vec<Group>> {
    let conn = lock_conn(&state)?;
    query_groups(&conn, "SELECT id, name, sort_order, created_at, updated_at FROM groups ORDER BY sort_order ASC")
        .map_err(to_string)
}

#[tauri::command]
pub fn create_group(state: State<'_, AppState>, name: String) -> CommandResult<Group> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err("Group name cannot be empty".to_string());
    }

    let conn = lock_conn(&state)?;
    let now = now_iso();
    let id = new_id();
    let sort_order = conn
        .query_row("SELECT COALESCE(MAX(sort_order), -1) + 1 FROM groups", [], |row| {
            row.get::<_, i64>(0)
        })
        .map_err(to_string)?;

    conn.execute(
        r#"
        INSERT INTO groups (id, name, sort_order, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?4)
        "#,
        params![id, trimmed, sort_order, now],
    )
    .map_err(to_string)?;

    get_group(&conn, &id).map_err(to_string)
}

#[tauri::command]
pub fn list_board_views(state: State<'_, AppState>) -> CommandResult<Vec<BoardViewWithGroups>> {
    let conn = lock_conn(&state)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id, name, sort_order, created_at, updated_at
            FROM board_views
            ORDER BY sort_order ASC
            "#,
        )
        .map_err(to_string)?;

    let rows: Vec<(String, String, i64, String, String)> = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, String>(4)?,
            ))
        })
        .map_err(to_string)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_string)?;

    rows.into_iter()
        .map(|(id, name, sort_order, created_at, updated_at)| {
            let groups = list_groups_for_board_view(&conn, &id).map_err(to_string)?;

            Ok(BoardViewWithGroups {
                id,
                name,
                sort_order,
                created_at,
                updated_at,
                groups,
            })
        })
        .collect()
}

#[tauri::command]
pub fn list_weekly_done(
    state: State<'_, AppState>,
    start_date: String,
    end_date: String,
) -> CommandResult<Vec<TodoWithRelations>> {
    let conn = lock_conn(&state)?;
    let mut stmt = conn
        .prepare(
            r#"
            SELECT id
            FROM todos
            WHERE status = 'done'
              AND completed_at IS NOT NULL
              AND completed_at >= ?1
              AND completed_at <= ?2
            ORDER BY completed_at ASC
            "#,
        )
        .map_err(to_string)?;

    let ids = stmt
        .query_map(params![start_date, end_date], |row| row.get::<_, String>(0))
        .map_err(to_string)?
        .collect::<Result<Vec<_>, _>>()
        .map_err(to_string)?;

    ids.iter()
        .map(|id| get_todo_with_relations(&conn, id).map_err(to_string))
        .collect()
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

fn transition_todo(
    state: &State<'_, AppState>,
    id: &str,
    status: &str,
    event_type: &str,
) -> CommandResult<TodoWithRelations> {
    let mut conn = lock_conn(state)?;
    let tx = conn.transaction().map_err(to_string)?;
    let now = now_iso();
    let todo = get_todo(&tx, id).map_err(to_string)?;

    match status {
        "done" => {
            tx.execute(
                r#"
                UPDATE todos
                SET status = 'done', completed_at = ?1, archived_at = NULL, updated_at = ?1
                WHERE id = ?2
                "#,
                params![now, id],
            )
            .map_err(to_string)?;
        }
        "active" => {
            tx.execute(
                r#"
                UPDATE todos
                SET status = 'active', completed_at = NULL, archived_at = NULL, updated_at = ?1
                WHERE id = ?2
                "#,
                params![now, id],
            )
            .map_err(to_string)?;
        }
        "archived" => {
            tx.execute(
                r#"
                UPDATE todos
                SET status = 'archived', archived_at = ?1, updated_at = ?1
                WHERE id = ?2
                "#,
                params![now, id],
            )
            .map_err(to_string)?;
        }
        _ => return Err("Unsupported todo transition".to_string()),
    }

    tx.execute(
        r#"
        INSERT INTO todo_events (id, todo_id, event_type, content, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        "#,
        params![new_id(), id, event_type, todo.detail, now],
    )
    .map_err(to_string)?;

    tx.commit().map_err(to_string)?;
    get_todo_with_relations(&conn, id).map_err(to_string)
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
    let now = now_iso();
    let value = serde_json::to_string(&settings).map_err(to_string)?;
    conn.execute(
        r#"
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE
        SET value = excluded.value,
            updated_at = excluded.updated_at
        "#,
        params![SHORTCUT_SETTINGS_KEY, value, now],
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
    let now = now_iso();
    let value = serde_json::to_string(&settings).map_err(to_string)?;
    conn.execute(
        r#"
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE
        SET value = excluded.value,
            updated_at = excluded.updated_at
        "#,
        params![APPEARANCE_SETTINGS_KEY, value, now],
    )
    .map_err(to_string)?;
    Ok(settings)
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
        let signature = shortcut_signature(binding);
        if !signatures.insert(signature) {
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
    if !is_allowed_shortcut_key(key) {
        return Err(format!("Unsupported shortcut key for {action}"));
    }
    Ok(())
}

fn is_allowed_shortcut_key(key: &str) -> bool {
    matches!(
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
    ) || key.chars().count() == 1
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

fn get_todo_with_relations(conn: &Connection, id: &str) -> rusqlite::Result<TodoWithRelations> {
    let todo = get_todo(conn, id)?;
    Ok(TodoWithRelations {
        id: todo.id.clone(),
        detail: todo.detail,
        status: todo.status,
        extra_text: todo.extra_text,
        created_at: todo.created_at,
        updated_at: todo.updated_at,
        completed_at: todo.completed_at,
        archived_at: todo.archived_at,
        groups: list_groups_for_todo(conn, id)?,
        group_sort_orders: list_group_sort_orders_for_todo(conn, id)?,
        tags: list_tags_for_todo(conn, id)?,
    })
}

fn get_todo(conn: &Connection, id: &str) -> rusqlite::Result<Todo> {
    conn.query_row(
        r#"
        SELECT id, detail, status, extra_text, created_at, updated_at, completed_at, archived_at
        FROM todos
        WHERE id = ?1
        "#,
        params![id],
        |row| {
            Ok(Todo {
                id: row.get(0)?,
                detail: row.get(1)?,
                status: row.get(2)?,
                extra_text: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
                completed_at: row.get(6)?,
                archived_at: row.get(7)?,
            })
        },
    )
}

fn get_group(conn: &Connection, id: &str) -> rusqlite::Result<Group> {
    conn.query_row(
        "SELECT id, name, sort_order, created_at, updated_at FROM groups WHERE id = ?1",
        params![id],
        |row| {
            Ok(Group {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )
}

fn list_groups_for_todo(conn: &Connection, id: &str) -> rusqlite::Result<Vec<Group>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT groups.id, groups.name, groups.sort_order, groups.created_at, groups.updated_at
        FROM groups
        INNER JOIN todo_groups ON todo_groups.group_id = groups.id
        WHERE todo_groups.todo_id = ?1
        ORDER BY groups.sort_order ASC
        "#,
    )?;
    let rows = stmt
        .query_map(params![id], map_group)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn list_group_sort_orders_for_todo(
    conn: &Connection,
    id: &str,
) -> rusqlite::Result<Vec<TodoGroupSortOrder>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT group_id, sort_order
        FROM todo_groups
        WHERE todo_id = ?1
        ORDER BY sort_order ASC
        "#,
    )?;
    let rows = stmt
        .query_map(params![id], |row| {
            Ok(TodoGroupSortOrder {
                group_id: row.get(0)?,
                sort_order: row.get(1)?,
            })
        })?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn list_groups_for_board_view(conn: &Connection, id: &str) -> rusqlite::Result<Vec<Group>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT groups.id, groups.name, groups.sort_order, groups.created_at, groups.updated_at
        FROM groups
        INNER JOIN board_view_groups ON board_view_groups.group_id = groups.id
        WHERE board_view_groups.board_view_id = ?1
        ORDER BY groups.sort_order ASC
        "#,
    )?;
    let rows = stmt
        .query_map(params![id], map_group)?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn list_tags_for_todo(conn: &Connection, id: &str) -> rusqlite::Result<Vec<Tag>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT tags.id, tags.name, tags.sort_order, tags.created_at, tags.updated_at
        FROM tags
        INNER JOIN todo_tags ON todo_tags.tag_id = tags.id
        WHERE todo_tags.todo_id = ?1
        ORDER BY tags.sort_order ASC
        "#,
    )?;
    let rows = stmt
        .query_map(params![id], |row| {
        Ok(Tag {
            id: row.get(0)?,
            name: row.get(1)?,
            sort_order: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?
    .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn list_board_view_group_ids(conn: &Connection, id: &str) -> rusqlite::Result<Vec<String>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT group_id
        FROM board_view_groups
        WHERE board_view_id = ?1
        ORDER BY group_id ASC
        "#,
    )?;
    let rows = stmt
        .query_map(params![id], |row| row.get::<_, String>(0))?
        .collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn query_groups(conn: &Connection, sql: &str) -> rusqlite::Result<Vec<Group>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], map_group)?.collect::<Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn map_group(row: &rusqlite::Row<'_>) -> rusqlite::Result<Group> {
    Ok(Group {
        id: row.get(0)?,
        name: row.get(1)?,
        sort_order: row.get(2)?,
        created_at: row.get(3)?,
        updated_at: row.get(4)?,
    })
}

fn repeat_vars(count: usize) -> String {
    std::iter::repeat("?")
        .take(count)
        .collect::<Vec<_>>()
        .join(",")
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

    fn settings_conn() -> Connection {
        let conn = Connection::open_in_memory().expect("open in-memory sqlite");
        conn.execute_batch(
            r#"
            CREATE TABLE app_settings (
              key TEXT PRIMARY KEY,
              value TEXT NOT NULL,
              updated_at TEXT NOT NULL
            );
            "#,
        )
        .expect("create app_settings table");
        conn
    }

    #[test]
    fn shortcut_settings_default_when_missing() {
        let conn = settings_conn();

        let settings = get_shortcut_settings_from_conn(&conn).expect("load default settings");

        assert_eq!(settings, default_shortcut_settings());
    }

    #[test]
    fn shortcut_settings_are_saved_and_loaded() {
        let conn = settings_conn();
        let mut settings = default_shortcut_settings();
        settings.open_settings = shortcut(".", true, false, false, false);

        save_shortcut_settings_to_conn(&conn, settings.clone()).expect("save settings");
        let loaded = get_shortcut_settings_from_conn(&conn).expect("load settings");

        assert_eq!(loaded, settings);
    }

    #[test]
    fn shortcut_settings_reject_duplicate_bindings() {
        let conn = settings_conn();
        let mut settings = default_shortcut_settings();
        settings.select_next_todo = settings.select_previous_todo.clone();

        let result = save_shortcut_settings_to_conn(&conn, settings);

        assert!(result.is_err());
    }

    #[test]
    fn shortcut_settings_reject_modifier_only_keys() {
        let conn = settings_conn();
        let mut settings = default_shortcut_settings();
        settings.open_settings = shortcut("Meta", false, false, false, false);

        let result = save_shortcut_settings_to_conn(&conn, settings);

        assert!(result.is_err());
    }

    #[test]
    fn appearance_settings_default_when_missing() {
        let conn = settings_conn();

        let settings = get_appearance_settings_from_conn(&conn).expect("load default appearance");

        assert_eq!(settings, default_appearance_settings());
    }

    #[test]
    fn appearance_settings_are_saved_and_loaded() {
        let conn = settings_conn();
        let settings = AppearanceSettings {
            version: 1,
            mode: "light".to_string(),
        };

        save_appearance_settings_to_conn(&conn, settings.clone()).expect("save appearance");
        let loaded = get_appearance_settings_from_conn(&conn).expect("load appearance");

        assert_eq!(loaded, settings);
    }

    #[test]
    fn appearance_settings_reject_unknown_mode() {
        let conn = settings_conn();
        let settings = AppearanceSettings {
            version: 1,
            mode: "sepia".to_string(),
        };

        let result = save_appearance_settings_to_conn(&conn, settings);

        assert!(result.is_err());
    }
}
