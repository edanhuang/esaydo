//! 小石头：侧栏里的桌宠背后的内置 Bot。它不绑定 Todo，用 easydo 命令行替用户维护已有的 Todo。
//!
//! 小石头是 bots 表里 kind = 'steward' 的一行，会话、运行、消息都沿用 Bot 派发的表和运行流程；
//! 会话的 todo_id 为空。同一时间只有一段当前会话（最新建的那段），「新对话」时另起一段。

use std::fs;
use std::path::Path;

use chrono::{DateTime, Duration, Local, Utc};
use rusqlite::{params, Connection, OptionalExtension};
use serde::Serialize;

use super::bot_service::{self, Bot, BotMessage, PreparedRun, RunKind};
use super::db::{new_id, now_iso};
use super::error::{EasyDoError, Result};

const STEWARD_NAME: &str = "小石头";
const STEWARD_COLOR: &str = "amber";
const STEWARD_PROVIDER: &str = "claude";
/// 看板摘要里每条 Todo 只放首句，过长截断
const HEADLINE_CHARS: usize = 60;
/// 已完成、已归档的 Todo 只带最近这段时间内的，方便用户说「把刚归档的那条恢复」
const RECENT_HOURS: i64 = 24;

#[derive(Debug, Clone, Default, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct StewardState {
    pub running: bool,
    /// 正在处理的这一句从什么时候开始，没在运行时为空
    pub started_at: Option<String>,
    pub unread_count: i64,
    pub has_messages: bool,
    /// 上一句处理完的结果：happy = 成功执行了 easydo 命令；confused = 什么都没执行成功，或者运行失败。
    /// 手动停止、中断、还没跑过时为空
    pub last_outcome: Option<String>,
}

/// 第一次用到时建出小石头；工作目录由 EasyDo 管，不让用户选
pub fn ensure_steward(conn: &Connection, directory: &Path) -> Result<Bot> {
    fs::create_dir_all(directory)?;
    let directory = directory.display().to_string();
    match bot_service::find_steward(conn)? {
        Some(bot) if bot.directory == directory && bot.name == STEWARD_NAME => Ok(bot),
        // 目录变了，或者改过名字（之前叫「管家」），跟着更新
        Some(bot) => {
            conn.execute(
                "UPDATE bots SET name = ?1, directory = ?2, updated_at = ?3 WHERE id = ?4",
                params![STEWARD_NAME, directory, now_iso(), bot.id],
            )?;
            bot_service::get_any_bot(conn, &bot.id)
        }
        None => {
            let id = new_id();
            conn.execute(
                r#"
                INSERT INTO bots (id, name, color, provider, model, directory, kind, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, '', ?5, 'steward', ?6, ?6)
                "#,
                params![id, STEWARD_NAME, STEWARD_COLOR, STEWARD_PROVIDER, directory, now_iso()],
            )?;
            bot_service::get_any_bot(conn, &id)
        }
    }
}

struct CurrentSession {
    id: String,
    cwd: String,
    session_id: Option<String>,
    usage_totals: Option<String>,
}

fn current_session(conn: &Connection, bot_id: &str) -> Result<Option<CurrentSession>> {
    Ok(conn
        .query_row(
            r#"
            SELECT id, cwd, session_id, usage_totals FROM bot_sessions
            WHERE bot_id = ?1 AND todo_id IS NULL
            ORDER BY created_at DESC, rowid DESC LIMIT 1
            "#,
            params![bot_id],
            |row| {
                Ok(CurrentSession {
                    id: row.get(0)?,
                    cwd: row.get(1)?,
                    session_id: row.get(2)?,
                    usage_totals: row.get(3)?,
                })
            },
        )
        .optional()?)
}

fn insert_session(conn: &Connection, bot: &Bot, now: &str) -> Result<CurrentSession> {
    let id = new_id();
    conn.execute(
        r#"
        INSERT INTO bot_sessions (id, bot_id, todo_id, provider, cwd, created_at, updated_at)
        VALUES (?1, ?2, NULL, ?3, ?4, ?5, ?5)
        "#,
        params![id, bot.id, bot.provider, bot.directory, now],
    )?;
    Ok(CurrentSession { id, cwd: bot.directory.clone(), session_id: None, usage_totals: None })
}

/// 发一句话给小石头：落库用户消息和一条运行中的运行记录，带上此刻的看板摘要
pub fn prepare_steward_run(conn: &mut Connection, directory: &Path, instruction: &str) -> Result<PreparedRun> {
    let instruction = instruction.trim().to_string();
    if instruction.is_empty() {
        return Err(EasyDoError::invalid("说点什么再发送"));
    }
    let bot = ensure_steward(conn, directory)?;
    let board = board_snapshot(conn, Utc::now())?;

    let tx = conn.transaction()?;
    let now = now_iso();
    let session = match current_session(&tx, &bot.id)? {
        Some(session) if bot_service::session_running(&tx, &session.id)? => {
            return Err(EasyDoError::invalid_state("小石头还在处理上一句"));
        }
        // 工作目录变了（例如换了数据目录），原会话接不上，另起一段
        Some(session) if session.cwd == bot.directory => session,
        _ => insert_session(&tx, &bot, &now)?,
    };
    let run_id = new_id();
    tx.execute(
        "INSERT INTO bot_runs (id, session_ref, status, started_at) VALUES (?1, ?2, 'running', ?3)",
        params![run_id, session.id, now],
    )?;
    bot_service::insert_message(&tx, &session.id, Some(&run_id), "user", &instruction, &now, true)?;
    tx.execute("UPDATE bot_sessions SET updated_at = ?1 WHERE id = ?2", params![now, session.id])?;
    tx.commit()?;

    Ok(PreparedRun {
        kind: RunKind::Steward,
        run_id,
        session_ref: session.id,
        todo_id: String::new(),
        todo_detail: board,
        bot,
        cwd: session.cwd,
        resume_session_id: session.session_id,
        usage_totals: session.usage_totals,
        instruction,
    })
}

pub fn steward_state(conn: &Connection) -> Result<StewardState> {
    let Some(bot) = bot_service::find_steward(conn)? else {
        return Ok(StewardState::default());
    };
    let Some(session) = current_session(conn, &bot.id)? else {
        return Ok(StewardState::default());
    };
    let (unread_count, messages): (i64, i64) = conn.query_row(
        r#"
        SELECT COALESCE(SUM(read_at IS NULL AND role != 'user'), 0), COUNT(*)
        FROM bot_messages WHERE session_ref = ?1
        "#,
        params![session.id],
        |row| Ok((row.get(0)?, row.get(1)?)),
    )?;
    let started_at: Option<String> = conn
        .query_row(
            "SELECT started_at FROM bot_runs WHERE session_ref = ?1 AND status = 'running' ORDER BY started_at DESC LIMIT 1",
            params![session.id],
            |row| row.get(0),
        )
        .optional()?;
    let last: Option<(String, Option<bool>)> = conn
        .query_row(
            r#"
            SELECT status, acted FROM bot_runs
            WHERE session_ref = ?1 AND status != 'running'
            ORDER BY started_at DESC, rowid DESC LIMIT 1
            "#,
            params![session.id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?;
    let last_outcome = match last {
        Some((status, acted)) if status == "completed" && acted == Some(true) => Some("happy".to_string()),
        Some((status, _)) if status == "completed" || status == "failed" => Some("confused".to_string()),
        _ => None,
    };
    Ok(StewardState {
        running: started_at.is_some(),
        started_at,
        last_outcome,
        unread_count,
        has_messages: messages > 0,
    })
}

pub fn steward_messages(conn: &Connection) -> Result<Vec<BotMessage>> {
    let Some(bot) = bot_service::find_steward(conn)? else {
        return Ok(Vec::new());
    };
    let Some(session) = current_session(conn, &bot.id)? else {
        return Ok(Vec::new());
    };
    let mut stmt = conn.prepare(
        r#"
        SELECT id, run_id, role, content, created_at, read_at
        FROM bot_messages WHERE session_ref = ?1
        ORDER BY created_at, rowid
        "#,
    )?;
    let rows = stmt
        .query_map(params![session.id], |row| {
            Ok(BotMessage {
                id: row.get(0)?,
                run_id: row.get(1)?,
                role: row.get(2)?,
                content: row.get(3)?,
                created_at: row.get(4)?,
                read_at: row.get(5)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn mark_steward_read(conn: &Connection) -> Result<()> {
    let Some(bot) = bot_service::find_steward(conn)? else {
        return Ok(());
    };
    conn.execute(
        r#"
        UPDATE bot_messages SET read_at = ?1
        WHERE read_at IS NULL AND session_ref IN (SELECT id FROM bot_sessions WHERE bot_id = ?2)
        "#,
        params![now_iso(), bot.id],
    )?;
    Ok(())
}

/// 另起一段对话；旧会话和消息留在库里，不再显示
pub fn new_steward_conversation(conn: &Connection, directory: &Path) -> Result<()> {
    let bot = ensure_steward(conn, directory)?;
    if let Some(session) = current_session(conn, &bot.id)? {
        if bot_service::session_running(conn, &session.id)? {
            return Err(EasyDoError::invalid_state("小石头还在处理，先停止再开新对话"));
        }
        let has_messages: bool = conn.query_row(
            "SELECT EXISTS (SELECT 1 FROM bot_messages WHERE session_ref = ?1)",
            params![session.id],
            |row| row.get(0),
        )?;
        if !has_messages {
            return Ok(());
        }
    }
    mark_steward_read(conn)?;
    insert_session(conn, &bot, &now_iso())?;
    Ok(())
}

/// 小石头正在运行的那次：(运行 id, 会话 id)
pub fn steward_active_run(conn: &Connection) -> Result<Option<(String, String)>> {
    Ok(conn
        .query_row(
            r#"
            SELECT r.id, r.session_ref FROM bot_runs r
            JOIN bot_sessions s ON s.id = r.session_ref
            JOIN bots b ON b.id = s.bot_id
            WHERE b.kind = 'steward' AND r.status = 'running'
            ORDER BY r.started_at DESC LIMIT 1
            "#,
            [],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?)
}

/// 每次运行前给小石头的看板摘要：进行中的全部 Todo，加上最近完成、归档的
pub fn board_snapshot(conn: &Connection, now: DateTime<Utc>) -> Result<String> {
    let since = (now - Duration::hours(RECENT_HOURS)).to_rfc3339_opts(chrono::SecondsFormat::Millis, true);
    let mut stmt = conn.prepare(
        r#"
        SELECT t.id, t.detail, t.status, t.priority, t.suspended_at, t.created_at, t.updated_at,
               (SELECT group_concat(g.name, '、') FROM todo_groups tg JOIN groups g ON g.id = tg.group_id
                WHERE tg.todo_id = t.id)
        FROM todos t
        WHERE t.deleted_at IS NULL AND (t.status = 'active' OR t.updated_at >= ?1)
        ORDER BY t.updated_at DESC
        "#,
    )?;
    let rows = stmt
        .query_map(params![since], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
                row.get::<_, String>(3)?,
                row.get::<_, Option<String>>(4)?,
                row.get::<_, String>(5)?,
                row.get::<_, String>(6)?,
                row.get::<_, Option<String>>(7)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    let mut active = Vec::new();
    let mut closed = Vec::new();
    for (id, detail, status, priority, suspended_at, created_at, updated_at, groups) in rows {
        let mut marks = Vec::new();
        if priority == "high" {
            marks.push("高优");
        }
        if suspended_at.is_some() {
            marks.push("挂起");
        }
        if created_at >= since {
            marks.push("24小时内新建");
        }
        let marks = if marks.is_empty() { String::new() } else { format!("[{}] ", marks.join("、")) };
        let line = format!(
            "- {}｜{}｜更新于{}｜{}{}",
            &id[..id.len().min(8)],
            groups.unwrap_or_else(|| "无分组".to_string()),
            local_time(&updated_at),
            marks,
            headline(&detail),
        );
        match status.as_str() {
            "active" => active.push(line),
            "done" => closed.push(format!("{line}（已完成）")),
            _ => closed.push(format!("{line}（已归档）")),
        }
    }

    let mut text = format!("进行中（{} 条）：\n", active.len());
    text.push_str(&if active.is_empty() { "（无）".to_string() } else { active.join("\n") });
    if !closed.is_empty() {
        text.push_str(&format!("\n\n最近{RECENT_HOURS}小时完成或归档的：\n"));
        text.push_str(&closed.join("\n"));
    }
    Ok(text)
}

fn headline(detail: &str) -> String {
    let line = detail.lines().map(str::trim).find(|line| !line.is_empty()).unwrap_or("");
    let chars: Vec<char> = line.chars().collect();
    if chars.len() > HEADLINE_CHARS {
        format!("{}…", chars[..HEADLINE_CHARS].iter().collect::<String>())
    } else {
        line.to_string()
    }
}

fn local_time(iso: &str) -> String {
    DateTime::parse_from_rfc3339(iso)
        .map(|time| time.with_timezone(&Local).format("%m-%d %H:%M").to_string())
        .unwrap_or_else(|_| iso.to_string())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::bot_service::{finish_run, list_active_runs, list_bots, run_notice, FinishedRun, RunUsage};
    use crate::core::db::test_database;
    use crate::core::todo_service::{archive_todo, create_todo, set_todo_priority, CreateTodoInput, TodoPriority};
    use crate::core::workspace_service::list_groups;

    fn todo(conn: &mut Connection, detail: &str) -> String {
        let group = list_groups(conn).expect("groups").into_iter().next().expect("group");
        create_todo(conn, CreateTodoInput { detail: detail.to_string(), group_ids: vec![group.id], tag_ids: Vec::new() })
            .expect("create todo")
            .id
    }

    fn finish(conn: &mut Connection, run: &PreparedRun, text: &str, acted: bool) {
        finish_run(
            conn,
            &FinishedRun {
                run_id: run.run_id.clone(),
                session_ref: run.session_ref.clone(),
                status: "completed".to_string(),
                usage: RunUsage::default(),
                error: None,
                final_text: Some(text.to_string()),
                session_id: Some("steward-sess".to_string()),
                title: None,
                usage_totals: None,
                acted,
            },
        )
        .expect("finish");
    }

    #[test]
    fn steward_is_hidden_from_the_bot_list_and_keeps_one_running_conversation() {
        let mut conn = test_database();
        let dir = tempfile::tempdir().expect("tempdir");
        let steward_dir = dir.path().join("steward");

        // 旧版本建出的叫「管家」，再用到时改成新名字
        let old = ensure_steward(&conn, &steward_dir).expect("steward");
        conn.execute("UPDATE bots SET name = '管家' WHERE id = ?1", params![old.id]).expect("old name");
        let first = prepare_steward_run(&mut conn, &steward_dir, "把两条归档").expect("first");
        assert_eq!(first.bot.name, STEWARD_NAME);
        assert_eq!(first.bot.id, old.id);
        assert_eq!(first.kind, RunKind::Steward);
        assert!(steward_dir.is_dir());
        assert!(list_bots(&conn).expect("bots").is_empty());
        // 小石头不算在派发的运行里，退出确认和看板标记都不受影响
        assert!(list_active_runs(&conn).expect("active").is_empty());
        let state = steward_state(&conn).expect("state");
        assert!(state.running && state.started_at.is_some());
        assert_eq!(
            prepare_steward_run(&mut conn, &steward_dir, "再来").expect_err("busy").message,
            "小石头还在处理上一句"
        );

        finish(&mut conn, &first, "已归档 2 条", true);
        let state = steward_state(&conn).expect("state");
        assert_eq!(
            state,
            StewardState {
                running: false,
                started_at: None,
                unread_count: 1,
                has_messages: true,
                last_outcome: Some("happy".to_string()),
            }
        );
        let notice = run_notice(&conn, &FinishedRun {
            run_id: first.run_id.clone(),
            session_ref: first.session_ref.clone(),
            status: "completed".to_string(),
            usage: RunUsage::default(),
            error: None,
            final_text: Some("已归档 2 条".to_string()),
            session_id: None,
            title: None,
            usage_totals: None,
            acted: false,
        })
        .expect("notice")
        .expect("some");
        assert_eq!(notice.body, "已归档 2 条");

        let second = prepare_steward_run(&mut conn, &steward_dir, "谢谢").expect("second");
        assert_eq!(second.session_ref, first.session_ref);
        assert_eq!(second.resume_session_id.as_deref(), Some("steward-sess"));
        // 只是聊天，没执行任何命令：一脸疑问
        finish(&mut conn, &second, "不客气", false);
        assert_eq!(steward_state(&conn).expect("state").last_outcome.as_deref(), Some("confused"));

        mark_steward_read(&conn).expect("read");
        assert_eq!(steward_state(&conn).expect("state").unread_count, 0);
        let roles: Vec<String> = steward_messages(&conn).expect("messages").into_iter().map(|m| m.role).collect();
        assert_eq!(roles, ["user", "bot", "user", "bot"]);

        new_steward_conversation(&conn, &steward_dir).expect("new");
        assert!(steward_messages(&conn).expect("messages").is_empty());
        let third = prepare_steward_run(&mut conn, &steward_dir, "重新开始").expect("third");
        assert_ne!(third.session_ref, first.session_ref);
        assert_eq!(third.resume_session_id, None);
    }

    #[test]
    fn board_snapshot_lists_active_todos_and_recently_closed_ones() {
        let mut conn = test_database();
        let keep = todo(&mut conn, "门店质检重试job\n- [ ] 查生产");
        set_todo_priority(&mut conn, &keep, TodoPriority::High).expect("priority");
        let gone = todo(&mut conn, "暂停营业不生成质检单");
        archive_todo(&mut conn, &gone).expect("archive");

        let text = board_snapshot(&conn, Utc::now()).expect("snapshot");
        assert!(text.starts_with("进行中（1 条）：\n"));
        assert!(text.contains(&format!("- {}｜", &keep[..8])));
        assert!(text.contains("[高优、24小时内新建] 门店质检重试job"));
        assert!(!text.contains("查生产"));
        assert!(text.contains("暂停营业不生成质检单（已归档）"));

        let later = board_snapshot(&conn, Utc::now() + Duration::hours(RECENT_HOURS + 1)).expect("snapshot");
        assert!(!later.contains("暂停营业"));
    }
}
