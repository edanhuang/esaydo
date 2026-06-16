use rusqlite::{params, Connection, OptionalExtension};

use super::error::{EasyDoError, Result};
use super::models::{BoardViewWithGroups, Group};
use super::workspace_service::{get_board_view, get_group};

pub fn resolve_group(conn: &Connection, selector: &str) -> Result<Group> {
    if selector.trim().is_empty() {
        return Err(EasyDoError::invalid("Group 不能为空"));
    }
    if let Some(id) = conn
        .query_row(
            "SELECT id FROM groups WHERE id = ?1",
            params![selector],
            |row| row.get::<_, String>(0),
        )
        .optional()?
    {
        return get_group(conn, &id);
    }
    let id = conn
        .query_row(
            "SELECT id FROM groups WHERE name = ?1",
            params![selector],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| EasyDoError::not_found(format!("未找到 Group: {selector}")))?;
    get_group(conn, &id)
}

pub fn resolve_view(conn: &Connection, selector: &str) -> Result<BoardViewWithGroups> {
    if selector.trim().is_empty() {
        return Err(EasyDoError::invalid("View 不能为空"));
    }
    if let Some(id) = conn
        .query_row(
            "SELECT id FROM board_views WHERE id = ?1",
            params![selector],
            |row| row.get::<_, String>(0),
        )
        .optional()?
    {
        return get_board_view(conn, &id);
    }
    let id = conn
        .query_row(
            "SELECT id FROM board_views WHERE name = ?1",
            params![selector],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| EasyDoError::not_found(format!("未找到 View: {selector}")))?;
    get_board_view(conn, &id)
}

pub fn resolve_todo_id(conn: &Connection, selector: &str) -> Result<String> {
    let selector = selector.trim();
    if selector.is_empty() {
        return Err(EasyDoError::invalid("Todo ID 不能为空"));
    }
    if let Some(id) = conn
        .query_row(
            "SELECT id FROM todos WHERE id = ?1 AND deleted_at IS NULL",
            params![selector],
            |row| row.get::<_, String>(0),
        )
        .optional()?
    {
        return Ok(id);
    }

    let mut stmt = conn.prepare(
        "SELECT id FROM todos WHERE id LIKE ?1 AND deleted_at IS NULL ORDER BY id LIMIT 2",
    )?;
    let matches = stmt
        .query_map(params![format!("{selector}%")], |row| {
            row.get::<_, String>(0)
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    match matches.as_slice() {
        [] => Err(EasyDoError::not_found("未找到 Todo")),
        [id] => Ok(id.clone()),
        _ => Err(EasyDoError::ambiguous("Todo ID 前缀不唯一")),
    }
}

#[cfg(test)]
mod tests {
    use rusqlite::params;

    use super::*;
    use crate::core::db::{now_iso, test_database};

    #[test]
    fn todo_prefix_must_be_unique() {
        let conn = test_database();
        let now = now_iso();
        for id in ["abc-1", "abc-2"] {
            conn.execute(
                "INSERT INTO todos (id, detail, status, created_at, updated_at) VALUES (?1, ?2, 'active', ?3, ?3)",
                params![id, id, now],
            )
            .expect("insert todo");
        }

        assert_eq!(
            resolve_todo_id(&conn, "abc")
                .expect_err("prefix should be ambiguous")
                .message,
            "Todo ID 前缀不唯一"
        );
        assert_eq!(
            resolve_todo_id(&conn, "abc-1").expect("resolve exact"),
            "abc-1"
        );
    }
}
