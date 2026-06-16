use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension};

use super::db::{new_id, now_iso};
use super::error::{EasyDoError, Result};
use super::models::{BoardViewWithGroups, Group};

pub fn list_groups(conn: &Connection) -> Result<Vec<Group>> {
    query_groups(
        conn,
        "SELECT id, name, sort_order, system_key, created_at, updated_at FROM groups ORDER BY sort_order ASC",
    )
}

pub fn create_group(conn: &Connection, name: &str) -> Result<Group> {
    let trimmed = name.trim();
    if trimmed.is_empty() {
        return Err(EasyDoError::invalid("Group 名称不能为空"));
    }
    let now = now_iso();
    let id = new_id();
    let sort_order = conn.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM groups",
        [],
        |row| row.get::<_, i64>(0),
    )?;
    conn.execute(
        r#"
        INSERT INTO groups (id, name, sort_order, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?4)
        "#,
        params![id, trimmed, sort_order, now],
    )?;
    get_group(conn, &id)
}

pub fn get_group(conn: &Connection, id: &str) -> Result<Group> {
    conn.query_row(
        "SELECT id, name, sort_order, system_key, created_at, updated_at FROM groups WHERE id = ?1",
        params![id],
        map_group,
    )
    .optional()?
    .ok_or_else(|| EasyDoError::not_found("未找到 Group"))
}

pub fn list_board_views(conn: &Connection) -> Result<Vec<BoardViewWithGroups>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT id, name, sort_order, system_key, created_at, updated_at
        FROM board_views
        ORDER BY sort_order ASC
        "#,
    )?;
    let rows = stmt
        .query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, i64>(2)?,
                row.get::<_, Option<String>>(3)?,
                row.get::<_, String>(4)?,
                row.get::<_, String>(5)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    rows.into_iter()
        .map(|(id, name, sort_order, system_key, created_at, updated_at)| {
            Ok(BoardViewWithGroups {
                groups: list_groups_for_board_view(conn, &id)?,
                id,
                name,
                sort_order,
                system_key,
                created_at,
                updated_at,
            })
        })
        .collect()
}

pub fn get_board_view(conn: &Connection, id: &str) -> Result<BoardViewWithGroups> {
    let row = conn
        .query_row(
            r#"
            SELECT id, name, sort_order, system_key, created_at, updated_at
            FROM board_views
            WHERE id = ?1
            "#,
            params![id],
            |row| {
                Ok((
                    row.get::<_, String>(0)?,
                    row.get::<_, String>(1)?,
                    row.get::<_, i64>(2)?,
                    row.get::<_, Option<String>>(3)?,
                    row.get::<_, String>(4)?,
                    row.get::<_, String>(5)?,
                ))
            },
        )
        .optional()?
        .ok_or_else(|| EasyDoError::not_found("未找到 View"))?;
    Ok(BoardViewWithGroups {
        groups: list_groups_for_board_view(conn, &row.0)?,
        id: row.0,
        name: row.1,
        sort_order: row.2,
        system_key: row.3,
        created_at: row.4,
        updated_at: row.5,
    })
}

pub fn set_board_view_group_membership(
    conn: &mut Connection,
    board_view_id: &str,
    group_id: &str,
    included: bool,
) -> Result<BoardViewWithGroups> {
    let board_view = get_board_view(conn, board_view_id)?;
    if board_view.system_key.is_some() {
        return Err(EasyDoError::invalid_state("系统 View 不能修改 Group"));
    }
    let group = get_group(conn, group_id)?;
    if group.system_key.is_some() {
        return Err(EasyDoError::invalid_state(
            "系统 Group 不能加入普通 View",
        ));
    }

    let tx = conn.transaction()?;
    if included {
        tx.execute(
            r#"
            INSERT INTO board_view_groups (board_view_id, group_id)
            VALUES (?1, ?2)
            ON CONFLICT(board_view_id, group_id) DO NOTHING
            "#,
            params![board_view_id, group_id],
        )?;
    } else {
        tx.execute(
            "DELETE FROM board_view_groups WHERE board_view_id = ?1 AND group_id = ?2",
            params![board_view_id, group_id],
        )?;
    }
    tx.execute(
        "UPDATE board_views SET updated_at = ?1 WHERE id = ?2",
        params![now_iso(), board_view_id],
    )?;
    tx.commit()?;
    get_board_view(conn, board_view_id)
}

pub fn reorder_todos_in_group(
    conn: &mut Connection,
    group_id: &str,
    todo_ids: &[String],
) -> Result<()> {
    if todo_ids.is_empty() {
        return Ok(());
    }
    let mut seen = HashSet::new();
    if todo_ids
        .iter()
        .any(|id| id.trim().is_empty() || !seen.insert(id))
    {
        return Err(EasyDoError::invalid("Todo 排序包含空 ID 或重复 ID"));
    }
    get_group(conn, group_id)?;

    let tx = conn.transaction()?;
    for todo_id in todo_ids {
        let exists = tx
            .query_row(
                "SELECT 1 FROM todo_groups WHERE group_id = ?1 AND todo_id = ?2",
                params![group_id, todo_id],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if !exists {
            return Err(EasyDoError::invalid(format!(
                "Todo {todo_id} 不属于 Group {group_id}"
            )));
        }
    }

    let now = now_iso();
    for (index, todo_id) in todo_ids.iter().enumerate() {
        tx.execute(
            "UPDATE todo_groups SET sort_order = ?1 WHERE group_id = ?2 AND todo_id = ?3",
            params![index as i64, group_id, todo_id],
        )?;
        tx.execute(
            "UPDATE todos SET updated_at = ?1 WHERE id = ?2",
            params![now, todo_id],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub fn list_groups_for_board_view(conn: &Connection, id: &str) -> Result<Vec<Group>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT groups.id, groups.name, groups.sort_order, groups.system_key,
               groups.created_at, groups.updated_at
        FROM groups
        INNER JOIN board_view_groups ON board_view_groups.group_id = groups.id
        WHERE board_view_groups.board_view_id = ?1
        ORDER BY groups.sort_order ASC
        "#,
    )?;
    let rows = stmt
        .query_map(params![id], map_group)?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn query_groups(conn: &Connection, sql: &str) -> Result<Vec<Group>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt
        .query_map([], map_group)?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn map_group(row: &rusqlite::Row<'_>) -> rusqlite::Result<Group> {
    Ok(Group {
        id: row.get(0)?,
        name: row.get(1)?,
        sort_order: row.get(2)?,
        system_key: row.get(3)?,
        created_at: row.get(4)?,
        updated_at: row.get(5)?,
    })
}

pub fn get_system_group(conn: &Connection, system_key: &str) -> Result<Group> {
    conn.query_row(
        r#"
        SELECT id, name, sort_order, system_key, created_at, updated_at
        FROM groups
        WHERE system_key = ?1
        "#,
        params![system_key],
        map_group,
    )
    .optional()?
    .ok_or_else(|| EasyDoError::not_found(format!("未找到系统 Group: {system_key}")))
}

pub fn get_system_board_view(
    conn: &Connection,
    system_key: &str,
) -> Result<BoardViewWithGroups> {
    let id = conn
        .query_row(
            "SELECT id FROM board_views WHERE system_key = ?1",
            params![system_key],
            |row| row.get::<_, String>(0),
        )
        .optional()?
        .ok_or_else(|| EasyDoError::not_found(format!("未找到系统 View: {system_key}")))?;
    get_board_view(conn, &id)
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::db::test_database;

    #[test]
    fn regular_view_can_become_empty() {
        let mut conn = test_database();
        let work_view = list_board_views(&conn)
            .expect("list views")
            .into_iter()
            .find(|view| view.name == "工作")
            .expect("work view");
        let work_group = list_groups(&conn)
            .expect("list groups")
            .into_iter()
            .find(|group| group.name == "工作")
            .expect("work group");

        let updated =
            set_board_view_group_membership(&mut conn, &work_view.id, &work_group.id, false)
                .expect("remove group");

        assert!(updated.groups.is_empty());
    }

    #[test]
    fn system_objects_cannot_join_regular_views() {
        let mut conn = test_database();
        let work_view = list_board_views(&conn)
            .expect("list views")
            .into_iter()
            .find(|view| view.name == "工作")
            .expect("work view");
        let inbox = get_system_group(&conn, "inbox").expect("inbox group");

        assert_eq!(
            set_board_view_group_membership(&mut conn, &work_view.id, &inbox.id, true)
                .expect_err("system group should fail")
                .message,
            "系统 Group 不能加入普通 View"
        );
    }
}
