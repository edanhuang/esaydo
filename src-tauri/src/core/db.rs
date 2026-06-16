use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

use chrono::{SecondsFormat, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use uuid::Uuid;

use super::error::{EasyDoError, Result};

pub const APP_IDENTIFIER: &str = "com.edanhuang.easydo";
pub const DATABASE_FILE: &str = "easydo.sqlite";
const BUSY_TIMEOUT: Duration = Duration::from_secs(5);

pub fn open_database(path: &Path) -> Result<Connection> {
    if let Some(parent) = database_parent(path) {
        fs::create_dir_all(parent)?;
    }
    let conn = Connection::open(path)?;
    initialize_connection(&conn)?;
    migrate(&conn)?;
    seed_defaults(&conn)?;
    Ok(conn)
}

fn database_parent(path: &Path) -> Option<&Path> {
    path.parent()
        .filter(|parent| !parent.as_os_str().is_empty())
}

pub fn default_database_path() -> Result<PathBuf> {
    let data_dir = dirs::data_dir().ok_or_else(|| EasyDoError::system("无法确定应用数据目录"))?;
    Ok(data_dir.join(APP_IDENTIFIER).join(DATABASE_FILE))
}

pub fn initialize_connection(conn: &Connection) -> Result<()> {
    conn.pragma_update(None, "foreign_keys", "ON")?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.busy_timeout(BUSY_TIMEOUT)?;
    Ok(())
}

pub fn now_iso() -> String {
    Utc::now().to_rfc3339_opts(SecondsFormat::Millis, true)
}

pub fn new_id() -> String {
    Uuid::new_v4().to_string()
}

pub fn migrate(conn: &Connection) -> Result<()> {
    conn.execute_batch(
        r#"
        CREATE TABLE IF NOT EXISTS todos (
          id TEXT PRIMARY KEY,
          detail TEXT NOT NULL,
          status TEXT NOT NULL DEFAULT 'active',
          priority TEXT NOT NULL DEFAULT 'normal',
          extra_text TEXT,
          created_at TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          completed_at TEXT,
          archived_at TEXT,
          expires_at TEXT,
          deleted_at TEXT,
          delete_reason TEXT
        );

        CREATE TABLE IF NOT EXISTS groups (
          id TEXT PRIMARY KEY,
          name TEXT NOT NULL UNIQUE,
          sort_order INTEGER NOT NULL DEFAULT 0,
          system_key TEXT,
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
          system_key TEXT,
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
        CREATE INDEX IF NOT EXISTS idx_todos_created_at ON todos(created_at);
        CREATE INDEX IF NOT EXISTS idx_todos_updated_at ON todos(updated_at);
        CREATE INDEX IF NOT EXISTS idx_todos_completed_at ON todos(completed_at);
        CREATE INDEX IF NOT EXISTS idx_todos_archived_at ON todos(archived_at);
        CREATE INDEX IF NOT EXISTS idx_todo_groups_group_id ON todo_groups(group_id);
        CREATE INDEX IF NOT EXISTS idx_board_view_groups_group_id ON board_view_groups(group_id);
        "#,
    )?;
    ensure_column(conn, "todos", "expires_at", "TEXT")?;
    ensure_column(conn, "todos", "deleted_at", "TEXT")?;
    ensure_column(conn, "todos", "delete_reason", "TEXT")?;
    ensure_column(conn, "todos", "priority", "TEXT NOT NULL DEFAULT 'normal'")?;
    ensure_column(conn, "groups", "system_key", "TEXT")?;
    ensure_column(conn, "board_views", "system_key", "TEXT")?;
    ensure_todo_group_sort_order(conn)?;
    conn.execute_batch(
        r#"
        CREATE UNIQUE INDEX IF NOT EXISTS idx_groups_system_key
        ON groups(system_key) WHERE system_key IS NOT NULL;
        CREATE UNIQUE INDEX IF NOT EXISTS idx_board_views_system_key
        ON board_views(system_key) WHERE system_key IS NOT NULL;
        CREATE INDEX IF NOT EXISTS idx_todos_expires_at
        ON todos(expires_at);
        CREATE INDEX IF NOT EXISTS idx_todos_deleted_at
        ON todos(deleted_at);
        CREATE INDEX IF NOT EXISTS idx_todos_priority
        ON todos(priority);
        "#,
    )?;
    Ok(())
}

fn ensure_column(conn: &Connection, table: &str, column: &str, definition: &str) -> Result<()> {
    let mut stmt = conn.prepare(&format!("PRAGMA table_info({table})"))?;
    let columns = stmt
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    if !columns.iter().any(|name| name == column) {
        conn.execute_batch(&format!(
            "ALTER TABLE {table} ADD COLUMN {column} {definition};"
        ))?;
    }
    Ok(())
}

fn ensure_todo_group_sort_order(conn: &Connection) -> Result<()> {
    let has_sort_order = conn
        .prepare("PRAGMA table_info(todo_groups)")?
        .query_map([], |row| row.get::<_, String>(1))?
        .collect::<std::result::Result<Vec<_>, _>>()?
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
    )?;
    Ok(())
}

fn seed_defaults(conn: &Connection) -> Result<()> {
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
    seed_system_objects(conn)?;
    Ok(())
}

fn seed_system_objects(conn: &Connection) -> Result<()> {
    let now = now_iso();
    conn.execute(
        "UPDATE board_views SET system_key = 'all', updated_at = ?1 WHERE name = '所有' AND system_key IS NULL",
        params![now],
    )?;

    let inbox_group_id = match system_object_id(conn, "groups", "inbox")? {
        Some(id) => id,
        None => {
            let id = new_id();
            let name = available_system_name(conn, "groups", "收件箱")?;
            let sort_order = conn.query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM groups",
                [],
                |row| row.get::<_, i64>(0),
            )?;
            conn.execute(
                r#"
                INSERT INTO groups (id, name, sort_order, system_key, created_at, updated_at)
                VALUES (?1, ?2, ?3, 'inbox', ?4, ?4)
                "#,
                params![id, name, sort_order, now],
            )?;
            id
        }
    };

    let inbox_view_id = match system_object_id(conn, "board_views", "inbox")? {
        Some(id) => id,
        None => {
            let id = new_id();
            let name = available_system_name(conn, "board_views", "收件箱")?;
            let sort_order = conn.query_row(
                "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM board_views",
                [],
                |row| row.get::<_, i64>(0),
            )?;
            conn.execute(
                r#"
                INSERT INTO board_views (id, name, sort_order, system_key, created_at, updated_at)
                VALUES (?1, ?2, ?3, 'inbox', ?4, ?4)
                "#,
                params![id, name, sort_order, now],
            )?;
            id
        }
    };

    conn.execute(
        "DELETE FROM board_view_groups WHERE group_id = ?1 AND board_view_id != ?2",
        params![inbox_group_id, inbox_view_id],
    )?;
    conn.execute(
        "DELETE FROM board_view_groups WHERE board_view_id = ?1 AND group_id != ?2",
        params![inbox_view_id, inbox_group_id],
    )?;
    conn.execute(
        r#"
        INSERT INTO board_view_groups (board_view_id, group_id)
        VALUES (?1, ?2)
        ON CONFLICT(board_view_id, group_id) DO NOTHING
        "#,
        params![inbox_view_id, inbox_group_id],
    )?;
    Ok(())
}

fn system_object_id(conn: &Connection, table: &str, system_key: &str) -> Result<Option<String>> {
    Ok(conn
        .query_row(
            &format!("SELECT id FROM {table} WHERE system_key = ?1"),
            params![system_key],
            |row| row.get(0),
        )
        .optional()?)
}

fn available_system_name(conn: &Connection, table: &str, preferred: &str) -> Result<String> {
    for candidate in [
        preferred.to_string(),
        format!("{preferred}（系统）"),
        format!("{preferred}（EasyDo）"),
    ] {
        let exists = conn
            .query_row(
                &format!("SELECT 1 FROM {table} WHERE name = ?1"),
                params![candidate],
                |_| Ok(()),
            )
            .optional()?
            .is_some();
        if !exists {
            return Ok(candidate);
        }
    }
    Ok(format!("{preferred}-{}", new_id()))
}

fn seed_board_view(
    conn: &Connection,
    name: &str,
    sort_order: i64,
    group_names: &[&str],
) -> Result<()> {
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
        let group_id = conn
            .query_row(
                "SELECT id FROM groups WHERE name = ?1",
                params![group_name],
                |row| row.get::<_, String>(0),
            )
            .optional()?;
        if let Some(group_id) = group_id {
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

#[cfg(test)]
pub fn test_database() -> Connection {
    let conn = Connection::open_in_memory().expect("open in-memory database");
    initialize_connection(&conn).expect("configure in-memory database");
    migrate(&conn).expect("migrate in-memory database");
    seed_defaults(&conn).expect("seed in-memory database");
    conn
}

#[cfg(test)]
mod tests {
    use std::thread;

    use super::*;

    #[test]
    fn connection_enables_foreign_keys_and_busy_timeout() {
        let conn = test_database();
        let foreign_keys: i64 = conn
            .pragma_query_value(None, "foreign_keys", |row| row.get(0))
            .expect("read foreign_keys");
        let timeout: i64 = conn
            .pragma_query_value(None, "busy_timeout", |row| row.get(0))
            .expect("read busy_timeout");

        assert_eq!(foreign_keys, 1);
        assert_eq!(timeout, BUSY_TIMEOUT.as_millis() as i64);
    }

    #[test]
    fn seed_is_idempotent() {
        let conn = test_database();
        seed_defaults(&conn).expect("seed defaults again");
        let group_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM groups", [], |row| row.get(0))
            .expect("count groups");
        let view_count: i64 = conn
            .query_row("SELECT COUNT(*) FROM board_views", [], |row| row.get(0))
            .expect("count views");

        assert_eq!(group_count, 6);
        assert_eq!(view_count, 4);
        let inbox_groups: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM groups WHERE system_key = 'inbox'",
                [],
                |row| row.get(0),
            )
            .expect("count inbox groups");
        let inbox_views: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM board_views WHERE system_key = 'inbox'",
                [],
                |row| row.get(0),
            )
            .expect("count inbox views");
        assert_eq!(inbox_groups, 1);
        assert_eq!(inbox_views, 1);
    }

    #[test]
    fn old_schema_is_upgraded_without_overwriting_same_named_user_objects() {
        let conn = Connection::open_in_memory().expect("open old database");
        initialize_connection(&conn).expect("configure old database");
        conn.execute_batch(
            r#"
            CREATE TABLE todos (
              id TEXT PRIMARY KEY, detail TEXT NOT NULL, status TEXT NOT NULL,
              extra_text TEXT, created_at TEXT NOT NULL, updated_at TEXT NOT NULL,
              completed_at TEXT, archived_at TEXT
            );
            CREATE TABLE groups (
              id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            CREATE TABLE board_views (
              id TEXT PRIMARY KEY, name TEXT NOT NULL UNIQUE, sort_order INTEGER NOT NULL,
              created_at TEXT NOT NULL, updated_at TEXT NOT NULL
            );
            INSERT INTO groups VALUES ('user-inbox', '收件箱', 0, 'now', 'now');
            INSERT INTO board_views VALUES ('all-view', '所有', 0, 'now', 'now');
            "#,
        )
        .expect("create old schema");

        migrate(&conn).expect("migrate old schema");
        seed_defaults(&conn).expect("seed upgraded schema");

        let user_key: Option<String> = conn
            .query_row(
                "SELECT system_key FROM groups WHERE id = 'user-inbox'",
                [],
                |row| row.get(0),
            )
            .expect("read user group");
        let system_name: String = conn
            .query_row(
                "SELECT name FROM groups WHERE system_key = 'inbox'",
                [],
                |row| row.get(0),
            )
            .expect("read system inbox");
        let all_key: String = conn
            .query_row(
                "SELECT system_key FROM board_views WHERE id = 'all-view'",
                [],
                |row| row.get(0),
            )
            .expect("read all system key");

        assert_eq!(user_key, None);
        assert_ne!(system_name, "收件箱");
        assert_eq!(all_key, "all");
    }

    #[test]
    fn relative_database_path_does_not_require_a_parent_directory() {
        assert!(database_parent(Path::new("relative.sqlite")).is_none());
    }

    #[test]
    fn concurrent_connections_wait_for_short_write_transaction() {
        let root = tempfile::tempdir().expect("temp directory");
        let path = root.path().join("concurrent.sqlite");
        let mut first = open_database(&path).expect("open first connection");
        let second_path = path.clone();
        let tx = first.transaction().expect("start transaction");
        tx.execute(
            "INSERT INTO app_settings (key, value, updated_at) VALUES ('first', '1', ?1)",
            params![now_iso()],
        )
        .expect("write first setting");

        let handle = thread::spawn(move || {
            let second = open_database(&second_path).expect("open second connection");
            second.execute(
                "INSERT INTO app_settings (key, value, updated_at) VALUES ('second', '2', ?1)",
                params![now_iso()],
            )
        });
        thread::sleep(Duration::from_millis(100));
        tx.commit().expect("commit first transaction");
        assert_eq!(
            handle.join().expect("join writer").expect("second write"),
            1
        );
    }
}
