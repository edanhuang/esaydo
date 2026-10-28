use std::collections::HashSet;

use rusqlite::{params, Connection, OptionalExtension};

use super::db::now_iso;
use super::error::{EasyDoError, Result};
use super::models::CanvasPosition;
use super::workspace_service::get_board_view;

const LAYOUT_MODE_KEY_PREFIX: &str = "board_layout_mode.v1:";
const MIN_CARD_WIDTH: f64 = 120.0;
const MIN_CARD_HEIGHT: f64 = 24.0;

/// 画布上的位置按视图分别保存；只记录位置，不刷新 Todo 的 updated_at，避免进入 Daily。
pub fn list_canvas_positions(
    conn: &Connection,
    board_view_id: &str,
) -> Result<Vec<CanvasPosition>> {
    get_board_view(conn, board_view_id)?;
    let mut stmt = conn.prepare(
        r#"
        SELECT todo_canvas_positions.todo_id, todo_canvas_positions.x, todo_canvas_positions.y,
               todo_canvas_positions.width, todo_canvas_positions.height
        FROM todo_canvas_positions
        INNER JOIN todos ON todos.id = todo_canvas_positions.todo_id
        WHERE todo_canvas_positions.board_view_id = ?1 AND todos.deleted_at IS NULL
        "#,
    )?;
    let positions = stmt
        .query_map(params![board_view_id], |row| {
            Ok(CanvasPosition {
                todo_id: row.get(0)?,
                x: row.get(1)?,
                y: row.get(2)?,
                width: row.get(3)?,
                height: row.get(4)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(positions)
}

pub fn save_canvas_positions(
    conn: &mut Connection,
    board_view_id: &str,
    positions: &[CanvasPosition],
) -> Result<()> {
    get_board_view(conn, board_view_id)?;
    let mut seen = HashSet::new();
    for position in positions {
        if !seen.insert(position.todo_id.as_str()) {
            return Err(EasyDoError::invalid("画布位置包含重复 Todo"));
        }
        // 画布没有边界，坐标可以是负数，只要求是有效数字
        if !position.x.is_finite() || !position.y.is_finite() {
            return Err(EasyDoError::invalid("画布位置必须是有效数字"));
        }
        let width_invalid = position
            .width
            .is_some_and(|width| !width.is_finite() || width < MIN_CARD_WIDTH);
        let height_invalid = position
            .height
            .is_some_and(|height| !height.is_finite() || height < MIN_CARD_HEIGHT);
        if width_invalid || height_invalid {
            return Err(EasyDoError::invalid("画布卡片尺寸过小"));
        }
    }

    let tx = conn.transaction()?;
    for position in positions {
        let exists = tx
            .query_row(
                "SELECT 1 FROM todos WHERE id = ?1 AND deleted_at IS NULL",
                params![position.todo_id],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if !exists {
            return Err(EasyDoError::not_found(format!(
                "未找到 Todo {}",
                position.todo_id
            )));
        }
        tx.execute(
            r#"
            INSERT INTO todo_canvas_positions (board_view_id, todo_id, x, y, width, height, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
            ON CONFLICT(board_view_id, todo_id) DO UPDATE
            SET x = excluded.x, y = excluded.y, width = excluded.width,
                height = excluded.height, updated_at = excluded.updated_at
            "#,
            params![
                board_view_id,
                position.todo_id,
                position.x,
                position.y,
                position.width,
                position.height,
                now_iso()
            ],
        )?;
    }
    tx.commit()?;
    Ok(())
}

pub fn get_board_layout_mode(conn: &Connection, board_view_id: &str) -> Result<String> {
    get_board_view(conn, board_view_id)?;
    let value = conn
        .query_row(
            "SELECT value FROM app_settings WHERE key = ?1",
            params![layout_mode_key(board_view_id)],
            |row| row.get::<_, String>(0),
        )
        .optional()?;
    Ok(match value.as_deref() {
        Some("canvas") => "canvas".to_string(),
        _ => "list".to_string(),
    })
}

pub fn save_board_layout_mode(
    conn: &Connection,
    board_view_id: &str,
    mode: &str,
) -> Result<String> {
    get_board_view(conn, board_view_id)?;
    if mode != "list" && mode != "canvas" {
        return Err(EasyDoError::invalid(format!("无效看板布局: {mode}")));
    }
    conn.execute(
        r#"
        INSERT INTO app_settings (key, value, updated_at)
        VALUES (?1, ?2, ?3)
        ON CONFLICT(key) DO UPDATE
        SET value = excluded.value, updated_at = excluded.updated_at
        "#,
        params![layout_mode_key(board_view_id), mode, now_iso()],
    )?;
    Ok(mode.to_string())
}

fn layout_mode_key(board_view_id: &str) -> String {
    format!("{LAYOUT_MODE_KEY_PREFIX}{board_view_id}")
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::db::test_database;
    use crate::core::todo_service::{create_todo, CreateTodoInput};
    use crate::core::workspace_service::{list_board_views, list_groups};

    fn work_setup(conn: &mut Connection) -> (String, String, String) {
        let work_group = list_groups(conn)
            .expect("list groups")
            .into_iter()
            .find(|group| group.name == "工作")
            .expect("work group");
        let views = list_board_views(conn).expect("list views");
        let all_view = views
            .iter()
            .find(|view| view.system_key.as_deref() == Some("all"))
            .expect("all view")
            .id
            .clone();
        let work_view = views
            .iter()
            .find(|view| view.name == "工作")
            .expect("work view")
            .id
            .clone();
        let todo = create_todo(
            conn,
            CreateTodoInput {
                detail: "画布测试".to_string(),
                group_ids: vec![work_group.id],
                tag_ids: Vec::new(),
            },
        )
        .expect("create todo");
        (all_view, work_view, todo.id)
    }

    #[test]
    fn positions_are_saved_per_view_without_touching_updated_at() {
        let mut conn = test_database();
        let (all_view, work_view, todo_id) = work_setup(&mut conn);
        let before: String = conn
            .query_row(
                "SELECT updated_at FROM todos WHERE id = ?1",
                params![todo_id],
                |row| row.get(0),
            )
            .expect("updated_at");

        save_canvas_positions(
            &mut conn,
            &work_view,
            &[CanvasPosition {
                todo_id: todo_id.clone(),
                x: 24.0,
                y: 48.0,
                width: None,
                height: None,
            }],
        )
        .expect("save work position");
        save_canvas_positions(
            &mut conn,
            &work_view,
            &[CanvasPosition {
                todo_id: todo_id.clone(),
                x: 300.0,
                y: 120.0,
                width: Some(320.0),
                height: Some(96.0),
            }],
        )
        .expect("move work position");

        assert_eq!(
            list_canvas_positions(&conn, &work_view).expect("list work"),
            vec![CanvasPosition {
                todo_id: todo_id.clone(),
                x: 300.0,
                y: 120.0,
                width: Some(320.0),
                height: Some(96.0),
            }]
        );
        assert!(list_canvas_positions(&conn, &all_view)
            .expect("list all")
            .is_empty());
        let after: String = conn
            .query_row(
                "SELECT updated_at FROM todos WHERE id = ?1",
                params![todo_id],
                |row| row.get(0),
            )
            .expect("updated_at");
        assert_eq!(before, after);
    }

    #[test]
    fn negative_positions_are_saved() {
        let mut conn = test_database();
        let (_, work_view, todo_id) = work_setup(&mut conn);
        save_canvas_positions(
            &mut conn,
            &work_view,
            &[CanvasPosition {
                todo_id: todo_id.clone(),
                x: -120.0,
                y: -48.0,
                width: None,
                height: None,
            }],
        )
        .expect("save negative position");

        let positions = list_canvas_positions(&conn, &work_view).expect("list positions");
        assert_eq!(positions.len(), 1);
        assert_eq!((positions[0].x, positions[0].y), (-120.0, -48.0));
    }

    #[test]
    fn invalid_positions_are_rejected() {
        let mut conn = test_database();
        let (_, work_view, todo_id) = work_setup(&mut conn);
        assert_eq!(
            save_canvas_positions(
                &mut conn,
                &work_view,
                &[CanvasPosition {
                    todo_id: todo_id.clone(),
                    x: f64::NAN,
                    y: 0.0,
                    width: None,
                    height: None,
                }],
            )
            .expect_err("nan")
            .message,
            "画布位置必须是有效数字"
        );
        assert_eq!(
            save_canvas_positions(
                &mut conn,
                &work_view,
                &[CanvasPosition {
                    todo_id: todo_id.clone(),
                    x: 0.0,
                    y: 0.0,
                    width: Some(60.0),
                    height: None,
                }],
            )
            .expect_err("too narrow")
            .message,
            "画布卡片尺寸过小"
        );
        assert!(save_canvas_positions(
            &mut conn,
            &work_view,
            &[CanvasPosition {
                todo_id: "missing".to_string(),
                x: 0.0,
                y: 0.0,
                width: None,
                height: None,
            }],
        )
        .is_err());
    }

    #[test]
    fn layout_mode_defaults_to_list_and_is_saved_per_view() {
        let mut conn = test_database();
        let (all_view, work_view, _) = work_setup(&mut conn);
        assert_eq!(
            get_board_layout_mode(&conn, &work_view).expect("default"),
            "list"
        );
        save_board_layout_mode(&conn, &work_view, "canvas").expect("save canvas");
        assert_eq!(
            get_board_layout_mode(&conn, &work_view).expect("work"),
            "canvas"
        );
        assert_eq!(
            get_board_layout_mode(&conn, &all_view).expect("all"),
            "list"
        );
        assert!(save_board_layout_mode(&conn, &work_view, "grid").is_err());
    }
}
