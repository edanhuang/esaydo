use std::path::Path;

use assert_cmd::Command;
use predicates::prelude::*;
use rusqlite::{params, Connection};
use serde_json::Value;
use tempfile::TempDir;

fn cli() -> Command {
    Command::cargo_bin("easydo-cli").expect("easydo-cli binary")
}

fn database() -> (TempDir, std::path::PathBuf) {
    let root = tempfile::tempdir().expect("temp dir");
    let path = root.path().join("easydo.sqlite");
    (root, path)
}

fn run_json(path: &Path, args: &[&str]) -> Value {
    let output = cli()
        .arg("--database")
        .arg(path)
        .args(args)
        .assert()
        .success()
        .get_output()
        .stdout
        .clone();
    serde_json::from_slice(&output).expect("valid JSON output")
}

#[test]
fn help_version_and_parse_errors_are_concise() {
    cli()
        .arg("help")
        .assert()
        .success()
        .stdout(predicate::str::contains("查询 Todo"))
        .stdout(predicate::str::contains("收件箱"))
        .stdout(predicate::str::contains("迁移"))
        .stdout(predicate::str::contains("管理 EasyDo Agent Skills"));
    cli()
        .args(["list", "--help"])
        .assert()
        .success()
        .stdout(predicate::str::contains("--time-field"));
    cli()
        .arg("--version")
        .assert()
        .success()
        .stdout(predicate::str::contains(env!("CARGO_PKG_VERSION")));
    cli()
        .arg("unknown")
        .assert()
        .code(2)
        .stderr("未知命令。运行 easydo help 查看用法。\n");
    cli()
        .arg("add")
        .assert()
        .code(2)
        .stderr("缺少必填参数。运行 easydo help 查看用法。\n");
}

#[test]
fn inbox_todo_is_hidden_by_default_and_can_move_to_regular_group() {
    let (_root, path) = database();
    let created = run_json(&path, &["inbox", "add", "待归类工作", "--json"]);
    let id = created["id"].as_str().expect("inbox todo id");
    assert_eq!(created["groups"][0]["systemKey"], "inbox");
    assert!(created["expiresAt"].as_str().is_some());

    let default_list = run_json(&path, &["list", "--json"]);
    assert!(default_list.as_array().expect("default list").is_empty());
    let inbox_list = run_json(&path, &["list", "--view", "收件箱", "--json"]);
    assert_eq!(inbox_list.as_array().expect("inbox list").len(), 1);

    let moved = run_json(
        &path,
        &["move", &id[..8], "--group", "工作", "--json"],
    );
    assert_eq!(moved["groups"][0]["name"], "工作");
    assert!(moved["expiresAt"].is_null());
    let work_list = run_json(&path, &["list", "--group", "工作", "--json"]);
    assert_eq!(work_list.as_array().expect("work list").len(), 1);
    let empty_inbox = run_json(&path, &["list", "--view", "收件箱", "--json"]);
    assert!(empty_inbox.as_array().expect("empty inbox").is_empty());
}

#[test]
fn inbox_move_rejects_non_inbox_and_system_target() {
    let (_root, path) = database();
    let regular = run_json(&path, &["add", "普通任务", "--group", "工作", "--json"]);
    let regular_id = regular["id"].as_str().expect("regular id");
    cli()
        .arg("--database")
        .arg(&path)
        .args(["move", &regular_id[..8], "--group", "学习"])
        .assert()
        .code(4)
        .stderr("Todo 不在收件箱\n");

    let inbox = run_json(&path, &["inbox", "add", "暂存任务", "--json"]);
    let inbox_id = inbox["id"].as_str().expect("inbox id");
    cli()
        .arg("--database")
        .arg(&path)
        .args(["move", &inbox_id[..8], "--group", "收件箱"])
        .assert()
        .code(2)
        .stderr("目标必须是普通 Group\n");
}

#[test]
fn cli_purges_expired_inbox_before_returning_clean_json() {
    let (_root, path) = database();
    let created = run_json(&path, &["inbox", "add", "过期待办", "--json"]);
    let id = created["id"].as_str().expect("id");
    let conn = Connection::open(&path).expect("open database");
    conn.execute(
        "UPDATE todos SET expires_at = '2000-01-01T03:00:00.000+08:00' WHERE id = ?1",
        params![id],
    )
    .expect("expire todo");
    drop(conn);

    let listed = run_json(&path, &["list", "--view", "收件箱", "--json"]);
    assert!(listed.as_array().expect("list").is_empty());
    let conn = Connection::open(&path).expect("open database after purge");
    let row: (Option<String>, Option<String>, i64) = conn
        .query_row(
            r#"
            SELECT deleted_at, delete_reason,
                   (SELECT COUNT(*) FROM todo_events
                    WHERE todo_id = todos.id AND event_type = 'auto_deleted')
            FROM todos WHERE id = ?1
            "#,
            params![id],
            |row| Ok((row.get(0)?, row.get(1)?, row.get(2)?)),
        )
        .expect("purged todo");
    assert!(row.0.is_some());
    assert_eq!(row.1.as_deref(), Some("inbox_expired"));
    assert_eq!(row.2, 1);
}

#[test]
fn todo_crud_and_json_output_share_one_database() {
    let (_root, path) = database();
    let created = run_json(
        &path,
        &["add", "第一行\n第二行", "--group", "工作", "--json"],
    );
    let id = created["id"].as_str().expect("todo id");
    assert_eq!(created["status"], "active");

    let listed = run_json(&path, &["list", "--group", "工作", "--json"]);
    assert_eq!(listed.as_array().expect("todo array").len(), 1);

    let updated = run_json(
        &path,
        &["update", &id[..8], "--detail", "更新内容", "--json"],
    );
    assert_eq!(updated["detail"], "更新内容");

    let completed = run_json(&path, &["done", &id[..8], "--json"]);
    let completed_at = completed["completedAt"].clone();
    let repeated = run_json(&path, &["done", &id[..8], "--json"]);
    assert_eq!(repeated["completedAt"], completed_at);

    let archived = run_json(&path, &["archive", &id[..8], "--json"]);
    let archived_at = archived["archivedAt"].clone();
    let repeated = run_json(&path, &["archive", &id[..8], "--json"]);
    assert_eq!(repeated["archivedAt"], archived_at);

    let default_list = run_json(&path, &["list", "--json"]);
    assert!(default_list.as_array().expect("default list").is_empty());
    let all_list = run_json(&path, &["list", "--status", "all", "--json"]);
    assert_eq!(all_list.as_array().expect("all list").len(), 1);

    let conn = Connection::open(path).expect("open database");
    let completed_events: i64 = conn
        .query_row(
            "SELECT COUNT(*) FROM todo_events WHERE todo_id = ?1 AND event_type = 'completed'",
            params![id],
            |row| row.get(0),
        )
        .expect("count events");
    assert_eq!(completed_events, 1);
}

#[test]
fn view_group_status_and_time_filters_compose() {
    let (_root, path) = database();
    let work = run_json(&path, &["add", "工作任务", "--group", "工作", "--json"]);
    run_json(&path, &["add", "学习任务", "--group", "学习", "--json"]);
    let work_id = work["id"].as_str().expect("work id");

    let conn = Connection::open(&path).expect("open database");
    conn.execute(
        "UPDATE todos SET created_at = '2026-06-05T02:00:00.000Z', updated_at = '2026-06-05T02:00:00.000Z' WHERE id = ?1",
        params![work_id],
    )
    .expect("set created date");
    drop(conn);

    let work_view = run_json(&path, &["list", "--view", "工作", "--json"]);
    assert_eq!(work_view.as_array().expect("view results").len(), 1);
    let personal_work = run_json(
        &path,
        &["list", "--view", "个人", "--group", "工作", "--json"],
    );
    assert!(personal_work
        .as_array()
        .expect("combined results")
        .is_empty());
    let dated = run_json(
        &path,
        &[
            "list",
            "--from",
            "2026-06-05",
            "--to",
            "2026-06-05",
            "--time-field",
            "created",
            "--json",
        ],
    );
    assert_eq!(dated.as_array().expect("date results").len(), 1);
}

#[test]
fn business_errors_have_stable_exit_codes_and_reasons() {
    let (_root, path) = database();
    cli()
        .arg("--database")
        .arg(&path)
        .args(["add", "无分组"])
        .assert()
        .code(2)
        .stderr("至少需要指定一个 Group\n");
    cli()
        .arg("--database")
        .arg(&path)
        .args(["list", "--status", "invalid"])
        .assert()
        .code(2)
        .stderr(predicate::str::contains("无效状态: invalid"));
    cli()
        .arg("--database")
        .arg(&path)
        .args(["list", "--view", "不存在"])
        .assert()
        .code(3)
        .stderr("未找到 View: 不存在\n");
    cli()
        .arg("--database")
        .arg(&path)
        .args(["list", "--from", "2026-06-08", "--to", "2026-06-07"])
        .assert()
        .code(2)
        .stderr("开始日期不能晚于结束日期\n");

    let conn = Connection::open(&path).expect("open database");
    let work_group: String = conn
        .query_row("SELECT id FROM groups WHERE name = '工作'", [], |row| {
            row.get(0)
        })
        .expect("work group");
    for (index, id) in ["same-1", "same-2"].into_iter().enumerate() {
        conn.execute(
            "INSERT INTO todos (id, detail, status, created_at, updated_at) VALUES (?1, ?2, 'active', '2026-06-01T00:00:00.000Z', '2026-06-01T00:00:00.000Z')",
            params![id, id],
        )
        .expect("insert ambiguous todo");
        conn.execute(
            "INSERT INTO todo_groups (todo_id, group_id, sort_order) VALUES (?1, ?2, ?3)",
            params![id, work_group, index as i64],
        )
        .expect("insert todo group");
    }
    drop(conn);
    cli()
        .arg("--database")
        .arg(&path)
        .args(["done", "same"])
        .assert()
        .code(3)
        .stderr("Todo ID 前缀不唯一\n");
}

#[test]
fn archived_todo_cannot_be_completed() {
    let (_root, path) = database();
    let created = run_json(&path, &["add", "归档任务", "--group", "工作", "--json"]);
    let id = created["id"].as_str().expect("id");
    run_json(&path, &["archive", &id[..8], "--json"]);

    cli()
        .arg("--database")
        .arg(&path)
        .args(["done", &id[..8]])
        .assert()
        .code(4)
        .stderr("已归档 Todo 不能直接完成\n");
}

#[test]
fn skills_list_and_install_are_isolated_and_idempotent() {
    let home = tempfile::tempdir().expect("home");
    cli()
        .args(["skills", "list", "--json"])
        .assert()
        .success()
        .stdout(predicate::str::contains("\"name\": \"easydo\""))
        .stdout(predicate::str::contains("\"version\": \"0.3.0\""));
    cli()
        .env("EASYDO_HOME", home.path())
        .args(["skills", "install", "easydo", "--agent", "all", "--json"])
        .assert()
        .success()
        .stdout(predicate::str::contains("\"status\": \"installed\""));
    for root in [".agents", ".codex", ".claude"] {
        assert!(home
            .path()
            .join(root)
            .join("skills/easydo/SKILL.md")
            .is_file());
    }
    cli()
        .env("EASYDO_HOME", home.path())
        .args(["skills", "install", "all", "--agent", "codex"])
        .assert()
        .success()
        .stdout(predicate::str::contains("已安装"));
    cli()
        .env("EASYDO_HOME", home.path())
        .args(["skills", "install", "missing", "--agent", "codex"])
        .assert()
        .code(3)
        .stderr("未找到 Skill: missing\n");
    cli()
        .args(["skills", "install", "easydo"])
        .assert()
        .code(2)
        .stderr("需要指定 --agent\n");

    let conflict = home.path().join(".codex/skills/easydo");
    std::fs::remove_dir_all(&conflict).expect("remove managed skill");
    std::fs::create_dir_all(&conflict).expect("create conflict");
    std::fs::write(conflict.join("SKILL.md"), "user skill").expect("write conflict");
    cli()
        .env("EASYDO_HOME", home.path())
        .args(["skills", "install", "easydo", "--agent", "codex"])
        .assert()
        .code(5)
        .stderr(predicate::str::contains("codex: Skill 目录冲突"));
}
