use std::fs;

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use tauri::{AppHandle, Manager};
use uuid::Uuid;

pub fn init_database(app: &AppHandle) -> Result<Connection, String> {
    let app_data_dir = app.path().app_data_dir().map_err(|error| error.to_string())?;
    fs::create_dir_all(&app_data_dir).map_err(|error| error.to_string())?;
    let db_path = app_data_dir.join("easydo.sqlite");

    let conn = Connection::open(db_path).map_err(|error| error.to_string())?;
    conn.execute_batch("PRAGMA foreign_keys = ON;")
        .map_err(|error| error.to_string())?;
    migrate(&conn).map_err(|error| error.to_string())?;
    seed_defaults(&conn).map_err(|error| error.to_string())?;
    Ok(conn)
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

fn migrate(conn: &Connection) -> rusqlite::Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS todos (
          id TEXT PRIMARY KEY,
          detail TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          extra_text TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT,
          archived_at TEXT
        );

        CREATE TABLE IF NOT EXISTS groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS tags (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS todo_groups (
          todo_id TEXT NOT NULL,
          group_id TEXT NOT NULL,
          sort_order INTEGER NOT NULL DEFAULT 0,
          PRIMARY KEY (todo_id, group_id),
          FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
          FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS todo_tags (
          todo_id TEXT NOT NULL,
          tag_id TEXT NOT NULL,
          PRIMARY KEY (todo_id, tag_id),
          FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
          FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS board_views (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS board_view_groups (
          board_view_id TEXT NOT NULL,
          group_id TEXT NOT NULL,
          PRIMARY KEY (board_view_id, group_id),
          FOREIGN KEY (board_view_id) REFERENCES board_views(id) ON DELETE CASCADE,
          FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS todo_events (
          id TEXT PRIMARY KEY,
          todo_id TEXT NOT NULL,
          event_type TEXT NOT NULL,
          content TEXT,
          created_at TEXT NOT NULL,
          FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS app_settings (
          key TEXT PRIMARY KEY,
          value TEXT NOT NULL,
          updated_at TEXT NOT NULL
        );

        CREATE INDEX IF NOT EXISTS idx_todos_status ON todos(status);
        CREATE INDEX IF NOT EXISTS idx_todos_completed_at ON todos(completed_at);
        CREATE INDEX IF NOT EXISTS idx_todo_groups_group_id ON todo_groups(group_id);
        CREATE INDEX IF NOT EXISTS idx_board_view_groups_group_id ON board_view_groups(group_id);
        "#,
    )?;

    ensure_todo_group_sort_order(conn)
}

fn ensure_todo_group_sort_order(conn: &Connection) -> rusqlite::Result<()> {
    let has_sort_order = conn
        .prepare("PRAGMA table_info(todo_groups)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<Result<Vec<_>, _>>()?
        .iter()
        .any(|name| name == "sort_order");

    if !has_sort_order {
        conn.execute_batch(
            r#"
            ALTER TABLE todo_groups ADD COLUMN sort_order INTEGER NOT NULL DEFAULT 0;

            UPDATE todo_groups
            SET sort_order = (
              SELECT COUNT(*)
              FROM todo_groups AS sibling_groups
              INNER JOIN todos AS sibling_todos ON sibling_todos.id = sibling_groups.todo_id
              INNER JOIN todos AS current_todo ON current_todo.id = todo_groups.todo_id
              WHERE sibling_groups.group_id = todo_groups.group_id
                AND (
                  sibling_todos.created_at < current_todo.created_at
                  OR (
                    sibling_todos.created_at = current_todo.created_at
                    AND sibling_groups.todo_id <= todo_groups.todo_id
                  )
                )
            ) - 1;
            "#,
        )?;
    }

    conn.execute_batch(
        r#"
        CREATE INDEX IF NOT EXISTS idx_todo_groups_group_sort_order
        ON todo_groups(group_id, sort_order);
        "#,
    )
}

fn seed_defaults(conn: &Connection) -> rusqlite::Result<()> {
    let defaults = ["工作", "学习", "健身", "生活", "个人项目"];
    let now = now_iso();

    for (index, name) in defaults.iter().enumerate() {
        conn.execute(
            r#"
            INSERT INTO groups (id, name, sort_order, created_at, updated_at)
            VALUES (?1, ?2, ?3, ?4, ?4)
            ON CONFLICT(name) DO NOTHING
            "#,
            params![new_id(), name, index as i64, now],
        )?;
    }

    seed_board_view(conn, "所有", 0, &[])?;
    seed_board_view(conn, "工作", 1, &["工作"])?;
    seed_board_view(conn, "个人", 2, &["学习", "健身", "生活", "个人项目"])?;

    Ok(())
}

fn seed_board_view(conn: &Connection, name: &str, sort_order: i64, group_names: &[&str]) -> rusqlite::Result<()> {
    let existing_id: Option<String> = conn
        .query_row(
            "SELECT id FROM board_views WHERE name = ?1",
            params![name],
            |row| row.get(0),
        )
        .optional()?;

    let board_view_id = match existing_id {
        Some(id) => id,
        None => {
            let id = new_id();
            let now = now_iso();
            conn.execute(
                r#"
                INSERT INTO board_views (id, name, sort_order, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?4)
                "#,
                params![id, name, sort_order, now],
            )?;
            id
        }
    };

    for group_name in group_names {
        if let Some(group_id) = conn
            .query_row(
                "SELECT id FROM groups WHERE name = ?1",
                params![group_name],
                |row| row.get::<_, String>(0),
            )
            .optional()?
        {
            conn.execute(
                r#"
                INSERT INTO board_view_groups (board_view_id, group_id)
                VALUES (?1, ?2)
                ON CONFLICT(board_view_id, group_id) DO NOTHING
                "#,
                params![board_view_id, group_id],
            )?;
        }
    }

    Ok(())
}
