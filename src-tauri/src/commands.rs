use rusqlite::{params, Connection};
use tauri::State;

use crate::db::{new_id, now_iso};
use crate::models::{BoardViewWithGroups, Group, Tag, Todo, TodoWithRelations};
use crate::AppState;

type CommandResult<T> = Result<T, String>;

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
        tx.execute(
            "INSERT INTO todo_groups (todo_id, group_id) VALUES (?1, ?2)",
            params![id, group_id],
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
                ORDER BY created_at ASC
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
            SELECT DISTINCT todos.id
            FROM todos
            INNER JOIN todo_groups ON todo_groups.todo_id = todos.id
            WHERE todos.status != 'archived'
              AND todo_groups.group_id IN ({})
            ORDER BY todos.created_at ASC
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
