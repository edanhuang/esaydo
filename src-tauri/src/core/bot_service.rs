use std::path::Path;

use rusqlite::{params, Connection, OptionalExtension};
use serde::{Deserialize, Serialize};

use super::db::{new_id, now_iso};
use super::error::{EasyDoError, Result};

pub const PROVIDERS: [&str; 2] = ["claude", "codex"];
pub const BOT_COLORS: [&str; 8] = ["amber", "olive", "moss", "teal", "indigo", "plum", "rose", "graphite"];
/// 同时运行的 Bot 任务上限
pub const MAX_CONCURRENT_RUNS: i64 = 3;

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BotUsage {
    pub runs: i64,
    pub input_tokens: i64,
    pub cached_input_tokens: i64,
    pub output_tokens: i64,
    pub cost_usd: f64,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct Bot {
    pub id: String,
    pub name: String,
    pub color: String,
    pub provider: String,
    pub model: String,
    pub directory: String,
    pub created_at: String,
    pub updated_at: String,
    pub usage: BotUsage,
}

#[derive(Debug, Clone, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct BotInput {
    pub name: String,
    pub color: String,
    pub provider: String,
    pub model: String,
    pub directory: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct ActiveBotRun {
    pub run_id: String,
    pub todo_id: String,
    pub bot_id: String,
    pub started_at: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct TodoUnread {
    pub todo_id: String,
    pub count: i64,
    /// 最新一条未读来自哪个 Bot，点信封时跳到这段会话
    pub bot_id: String,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BotConversation {
    pub bot_id: String,
    pub todo_id: String,
    pub todo_detail: String,
    pub title: Option<String>,
    pub session_id: Option<String>,
    pub unread_count: i64,
    pub last_message_at: Option<String>,
    pub last_message_preview: Option<String>,
    pub running: bool,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct BotMessage {
    pub id: String,
    pub run_id: Option<String>,
    pub role: String,
    pub content: String,
    pub created_at: String,
    pub read_at: Option<String>,
}

#[derive(Debug, Clone, Serialize, PartialEq)]
#[serde(rename_all = "camelCase")]
pub struct DispatchPreview {
    pub session_title: Option<String>,
    /// Bot 改过 AI 或目录，原会话接不上，这次会新开
    pub session_will_reset: bool,
    pub running: bool,
}

/// 一次派发落库后，启动进程需要的全部信息
#[derive(Debug, Clone, PartialEq)]
pub struct PreparedRun {
    pub run_id: String,
    pub session_ref: String,
    pub todo_id: String,
    pub todo_detail: String,
    pub bot: Bot,
    pub cwd: String,
    pub resume_session_id: Option<String>,
    pub usage_totals: Option<String>,
    pub instruction: String,
}

#[derive(Debug, Clone, Default, PartialEq)]
pub struct RunUsage {
    pub input_tokens: i64,
    pub cached_input_tokens: i64,
    pub output_tokens: i64,
    pub cost_usd: Option<f64>,
}

#[derive(Debug, Clone, PartialEq)]
pub struct FinishedRun {
    pub run_id: String,
    pub session_ref: String,
    /// completed / failed / stopped
    pub status: String,
    pub usage: RunUsage,
    pub error: Option<String>,
    pub final_text: Option<String>,
    pub session_id: Option<String>,
    pub title: Option<String>,
    pub usage_totals: Option<String>,
}

pub fn list_bots(conn: &Connection) -> Result<Vec<Bot>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT b.id, b.name, b.color, b.provider, b.model, b.directory, b.created_at, b.updated_at,
               COUNT(r.id), COALESCE(SUM(r.input_tokens), 0), COALESCE(SUM(r.cached_input_tokens), 0),
               COALESCE(SUM(r.output_tokens), 0), COALESCE(SUM(r.cost_usd), 0)
        FROM bots b
        LEFT JOIN bot_sessions s ON s.bot_id = b.id
        LEFT JOIN bot_runs r ON r.session_ref = s.id AND r.status != 'running'
        GROUP BY b.id
        ORDER BY b.created_at
        "#,
    )?;
    let bots = stmt
        .query_map([], |row| {
            Ok(Bot {
                id: row.get(0)?,
                name: row.get(1)?,
                color: row.get(2)?,
                provider: row.get(3)?,
                model: row.get(4)?,
                directory: row.get(5)?,
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
                usage: BotUsage {
                    runs: row.get(8)?,
                    input_tokens: row.get(9)?,
                    cached_input_tokens: row.get(10)?,
                    output_tokens: row.get(11)?,
                    cost_usd: row.get(12)?,
                },
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(bots)
}

pub fn get_bot(conn: &Connection, id: &str) -> Result<Bot> {
    list_bots(conn)?
        .into_iter()
        .find(|bot| bot.id == id)
        .ok_or_else(|| EasyDoError::not_found("未找到 Bot"))
}

fn validate_bot_input(input: &BotInput) -> Result<BotInput> {
    let name = input.name.trim();
    if name.is_empty() {
        return Err(EasyDoError::invalid("Bot 名称不能为空"));
    }
    if !BOT_COLORS.contains(&input.color.as_str()) {
        return Err(EasyDoError::invalid("Bot 颜色无效"));
    }
    if !PROVIDERS.contains(&input.provider.as_str()) {
        return Err(EasyDoError::invalid("目前只支持 Claude Code 和 Codex"));
    }
    let directory = input.directory.trim();
    if directory.is_empty() || !Path::new(directory).is_dir() {
        return Err(EasyDoError::invalid("工作目录不存在"));
    }
    Ok(BotInput {
        name: name.to_string(),
        color: input.color.clone(),
        provider: input.provider.clone(),
        model: input.model.trim().to_string(),
        directory: directory.to_string(),
    })
}

pub fn create_bot(conn: &Connection, input: &BotInput) -> Result<Bot> {
    let input = validate_bot_input(input)?;
    let id = new_id();
    let now = now_iso();
    conn.execute(
        r#"
        INSERT INTO bots (id, name, color, provider, model, directory, created_at, updated_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?7)
        "#,
        params![id, input.name, input.color, input.provider, input.model, input.directory, now],
    )?;
    get_bot(conn, &id)
}

pub fn update_bot(conn: &Connection, id: &str, input: &BotInput) -> Result<Bot> {
    let current = get_bot(conn, id)?;
    let input = validate_bot_input(input)?;
    let changes_runtime = current.provider != input.provider || current.directory != input.directory;
    if changes_runtime && bot_has_running_run(conn, id)? {
        return Err(EasyDoError::invalid_state("Bot 运行中，不能修改 AI 和目录"));
    }
    conn.execute(
        r#"
        UPDATE bots
        SET name = ?1, color = ?2, provider = ?3, model = ?4, directory = ?5, updated_at = ?6
        WHERE id = ?7
        "#,
        params![input.name, input.color, input.provider, input.model, input.directory, now_iso(), id],
    )?;
    get_bot(conn, id)
}

/// 删除前确认用：这个 Bot 名下有多少条消息会一起删掉
pub fn count_bot_messages(conn: &Connection, id: &str) -> Result<i64> {
    Ok(conn.query_row(
        r#"
        SELECT COUNT(*) FROM bot_messages m
        JOIN bot_sessions s ON s.id = m.session_ref
        WHERE s.bot_id = ?1
        "#,
        params![id],
        |row| row.get(0),
    )?)
}

pub fn delete_bot(conn: &Connection, id: &str) -> Result<()> {
    get_bot(conn, id)?;
    if bot_has_running_run(conn, id)? {
        return Err(EasyDoError::invalid_state("Bot 运行中，先停止再删除"));
    }
    // 会话、运行记录、消息都随外键级联删除
    conn.execute("DELETE FROM bots WHERE id = ?1", params![id])?;
    Ok(())
}

fn bot_has_running_run(conn: &Connection, bot_id: &str) -> Result<bool> {
    Ok(conn.query_row(
        r#"
        SELECT EXISTS (
          SELECT 1 FROM bot_runs r JOIN bot_sessions s ON s.id = r.session_ref
          WHERE s.bot_id = ?1 AND r.status = 'running'
        )
        "#,
        params![bot_id],
        |row| row.get(0),
    )?)
}

pub fn todo_has_running_run(conn: &Connection, todo_id: &str) -> Result<bool> {
    Ok(conn.query_row(
        r#"
        SELECT EXISTS (
          SELECT 1 FROM bot_runs r JOIN bot_sessions s ON s.id = r.session_ref
          WHERE s.todo_id = ?1 AND r.status = 'running'
        )
        "#,
        params![todo_id],
        |row| row.get(0),
    )?)
}

/// Bot 执行中不允许完成或归档这条 Todo（包括 Bot 自己通过 CLI 操作）
pub fn ensure_no_running_run(conn: &Connection, todo_id: &str) -> Result<()> {
    if todo_has_running_run(conn, todo_id)? {
        return Err(EasyDoError::invalid_state("Bot 运行中，先停止"));
    }
    Ok(())
}

struct SessionRow {
    id: String,
    provider: String,
    cwd: String,
    session_id: Option<String>,
    title: Option<String>,
    usage_totals: Option<String>,
}

fn find_session(conn: &Connection, todo_id: &str, bot_id: &str) -> Result<Option<SessionRow>> {
    Ok(conn
        .query_row(
            r#"
            SELECT id, provider, cwd, session_id, title, usage_totals
            FROM bot_sessions WHERE todo_id = ?1 AND bot_id = ?2
            "#,
            params![todo_id, bot_id],
            |row| {
                Ok(SessionRow {
                    id: row.get(0)?,
                    provider: row.get(1)?,
                    cwd: row.get(2)?,
                    session_id: row.get(3)?,
                    title: row.get(4)?,
                    usage_totals: row.get(5)?,
                })
            },
        )
        .optional()?)
}

fn session_running(conn: &Connection, session_ref: &str) -> Result<bool> {
    Ok(conn.query_row(
        "SELECT EXISTS (SELECT 1 FROM bot_runs WHERE session_ref = ?1 AND status = 'running')",
        params![session_ref],
        |row| row.get(0),
    )?)
}

pub fn dispatch_preview(conn: &Connection, todo_id: &str, bot_id: &str) -> Result<DispatchPreview> {
    let bot = get_bot(conn, bot_id)?;
    let Some(session) = find_session(conn, todo_id, bot_id)? else {
        return Ok(DispatchPreview {
            session_title: None,
            session_will_reset: false,
            running: false,
        });
    };
    let will_reset =
        session.session_id.is_some() && (session.provider != bot.provider || session.cwd != bot.directory);
    Ok(DispatchPreview {
        session_title: if will_reset || session.session_id.is_none() { None } else { session.title },
        session_will_reset: will_reset,
        running: session_running(conn, &session.id)?,
    })
}

/// 派发落库：检查状态、准备会话、记下用户说明和一条运行中的运行记录
pub fn prepare_run(conn: &mut Connection, todo_id: &str, bot_id: &str, instruction: &str) -> Result<PreparedRun> {
    let bot = get_bot(conn, bot_id)?;
    let (todo_detail, todo_status): (String, String) = conn
        .query_row(
            "SELECT detail, status FROM todos WHERE id = ?1 AND deleted_at IS NULL",
            params![todo_id],
            |row| Ok((row.get(0)?, row.get(1)?)),
        )
        .optional()?
        .ok_or_else(|| EasyDoError::not_found("未找到 Todo"))?;
    if todo_status != "active" {
        return Err(EasyDoError::invalid_state("只有进行中的 Todo 可以派发"));
    }
    if !Path::new(&bot.directory).is_dir() {
        return Err(EasyDoError::invalid("Bot 的工作目录不存在"));
    }
    let running: i64 = conn.query_row("SELECT COUNT(*) FROM bot_runs WHERE status = 'running'", [], |row| row.get(0))?;
    if running >= MAX_CONCURRENT_RUNS {
        return Err(EasyDoError::invalid_state(format!(
            "已有 {running} 个 Bot 在运行，稍后再试"
        )));
    }

    let tx = conn.transaction()?;
    let now = now_iso();
    let existing = find_session(&tx, todo_id, bot_id)?;
    let session = match existing {
        Some(session) => {
            if session_running(&tx, &session.id)? {
                return Err(EasyDoError::invalid_state("这条 Todo 在这个 Bot 下还在运行"));
            }
            if session.provider != bot.provider || session.cwd != bot.directory {
                tx.execute(
                    r#"
                    UPDATE bot_sessions
                    SET provider = ?1, cwd = ?2, session_id = NULL, title = NULL, usage_totals = NULL, updated_at = ?3
                    WHERE id = ?4
                    "#,
                    params![bot.provider, bot.directory, now, session.id],
                )?;
                if session.session_id.is_some() {
                    insert_message(&tx, &session.id, None, "system", "Bot 换了 AI 或目录，已换成新会话，之前的上下文不会带过去。", &now, false)?;
                }
                SessionRow {
                    id: session.id,
                    provider: bot.provider.clone(),
                    cwd: bot.directory.clone(),
                    session_id: None,
                    title: None,
                    usage_totals: None,
                }
            } else {
                session
            }
        }
        None => {
            let id = new_id();
            tx.execute(
                r#"
                INSERT INTO bot_sessions (id, bot_id, todo_id, provider, cwd, created_at, updated_at)
                VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?6)
                "#,
                params![id, bot_id, todo_id, bot.provider, bot.directory, now],
            )?;
            SessionRow {
                id,
                provider: bot.provider.clone(),
                cwd: bot.directory.clone(),
                session_id: None,
                title: None,
                usage_totals: None,
            }
        }
    };

    let run_id = new_id();
    tx.execute(
        "INSERT INTO bot_runs (id, session_ref, status, started_at) VALUES (?1, ?2, 'running', ?3)",
        params![run_id, session.id, now],
    )?;
    let instruction = instruction.trim().to_string();
    if !instruction.is_empty() {
        insert_message(&tx, &session.id, Some(&run_id), "user", &instruction, &now, true)?;
    }
    tx.execute("UPDATE bot_sessions SET updated_at = ?1 WHERE id = ?2", params![now, session.id])?;
    tx.commit()?;

    Ok(PreparedRun {
        run_id,
        session_ref: session.id,
        todo_id: todo_id.to_string(),
        todo_detail,
        bot,
        cwd: session.cwd,
        resume_session_id: session.session_id,
        usage_totals: session.usage_totals,
        instruction,
    })
}

fn insert_message(
    conn: &Connection,
    session_ref: &str,
    run_id: Option<&str>,
    role: &str,
    content: &str,
    now: &str,
    read: bool,
) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO bot_messages (id, session_ref, run_id, role, content, created_at, read_at)
        VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7)
        "#,
        params![new_id(), session_ref, run_id, role, content, now, read.then_some(now)],
    )?;
    Ok(())
}

/// 运行中途一拿到会话 ID 就先存下，停止或中断后还能接着派发
pub fn record_session_id(conn: &Connection, session_ref: &str, session_id: &str) -> Result<()> {
    conn.execute(
        "UPDATE bot_sessions SET session_id = ?1, updated_at = ?2 WHERE id = ?3",
        params![session_id, now_iso(), session_ref],
    )?;
    Ok(())
}

pub fn finish_run(conn: &mut Connection, finished: &FinishedRun) -> Result<()> {
    let tx = conn.transaction()?;
    let now = now_iso();
    tx.execute(
        r#"
        UPDATE bot_runs
        SET status = ?1, finished_at = ?2, input_tokens = ?3, cached_input_tokens = ?4,
            output_tokens = ?5, cost_usd = ?6, error = ?7
        WHERE id = ?8
        "#,
        params![
            finished.status,
            now,
            finished.usage.input_tokens,
            finished.usage.cached_input_tokens,
            finished.usage.output_tokens,
            finished.usage.cost_usd,
            finished.error,
            finished.run_id
        ],
    )?;
    tx.execute(
        r#"
        UPDATE bot_sessions
        SET session_id = COALESCE(?1, session_id), title = COALESCE(?2, title),
            usage_totals = COALESCE(?3, usage_totals), updated_at = ?4
        WHERE id = ?5
        "#,
        params![finished.session_id, finished.title, finished.usage_totals, now, finished.session_ref],
    )?;
    match finished.status.as_str() {
        "completed" => {
            let text = finished
                .final_text
                .as_deref()
                .map(str::trim)
                .filter(|text| !text.is_empty());
            match text {
                Some(text) => insert_message(&tx, &finished.session_ref, Some(&finished.run_id), "bot", text, &now, false)?,
                None => insert_message(&tx, &finished.session_ref, Some(&finished.run_id), "system", "Bot 运行结束，但没有给出回复。", &now, false)?,
            }
        }
        "failed" => {
            let error = finished.error.as_deref().unwrap_or("未知错误");
            insert_message(&tx, &finished.session_ref, Some(&finished.run_id), "system", &format!("运行失败：{error}"), &now, false)?;
        }
        // 手动停止不产生消息
        _ => {}
    }
    tx.commit()?;
    Ok(())
}

/// App 启动时：上次退出时还在跑的任务标记为已中断
pub fn mark_interrupted_runs(conn: &mut Connection) -> Result<usize> {
    let tx = conn.transaction()?;
    let now = now_iso();
    let sessions = {
        let mut stmt = tx.prepare("SELECT id, session_ref FROM bot_runs WHERE status = 'running'")?;
        let rows = stmt
            .query_map([], |row| Ok((row.get::<_, String>(0)?, row.get::<_, String>(1)?)))?
            .collect::<std::result::Result<Vec<_>, _>>()?;
        rows
    };
    for (run_id, session_ref) in &sessions {
        tx.execute(
            "UPDATE bot_runs SET status = 'interrupted', finished_at = ?1 WHERE id = ?2",
            params![now, run_id],
        )?;
        insert_message(&tx, session_ref, Some(run_id), "system", "EasyDo 退出时任务被中断，可以接着派发继续。", &now, false)?;
    }
    tx.commit()?;
    Ok(sessions.len())
}

pub fn list_active_runs(conn: &Connection) -> Result<Vec<ActiveBotRun>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT r.id, s.todo_id, s.bot_id, r.started_at
        FROM bot_runs r JOIN bot_sessions s ON s.id = r.session_ref
        WHERE r.status = 'running'
        ORDER BY r.started_at
        "#,
    )?;
    let runs = stmt
        .query_map([], |row| {
            Ok(ActiveBotRun {
                run_id: row.get(0)?,
                todo_id: row.get(1)?,
                bot_id: row.get(2)?,
                started_at: row.get(3)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(runs)
}

/// 已归档或已删除的 Todo，它的消息跟着隐藏
const VISIBLE_TODO: &str = "t.deleted_at IS NULL AND t.status != 'archived'";

pub fn list_unread_by_todo(conn: &Connection) -> Result<Vec<TodoUnread>> {
    let sql = format!(
        r#"
        SELECT s.todo_id, COUNT(*),
               (SELECT s2.bot_id FROM bot_messages m2 JOIN bot_sessions s2 ON s2.id = m2.session_ref
                WHERE s2.todo_id = s.todo_id AND m2.read_at IS NULL AND m2.role != 'user'
                ORDER BY m2.created_at DESC, m2.rowid DESC LIMIT 1)
        FROM bot_messages m
        JOIN bot_sessions s ON s.id = m.session_ref
        JOIN todos t ON t.id = s.todo_id
        WHERE m.read_at IS NULL AND m.role != 'user' AND {VISIBLE_TODO}
        GROUP BY s.todo_id
        "#
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map([], |row| {
            Ok(TodoUnread {
                todo_id: row.get(0)?,
                count: row.get(1)?,
                bot_id: row.get(2)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

pub fn list_conversations(conn: &Connection) -> Result<Vec<BotConversation>> {
    let sql = format!(
        r#"
        SELECT s.bot_id, s.todo_id, t.detail, s.title, s.session_id,
               (SELECT COUNT(*) FROM bot_messages m WHERE m.session_ref = s.id AND m.read_at IS NULL AND m.role != 'user'),
               (SELECT m.created_at FROM bot_messages m WHERE m.session_ref = s.id ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1),
               (SELECT m.content FROM bot_messages m WHERE m.session_ref = s.id ORDER BY m.created_at DESC, m.rowid DESC LIMIT 1),
               EXISTS (SELECT 1 FROM bot_runs r WHERE r.session_ref = s.id AND r.status = 'running')
        FROM bot_sessions s
        JOIN todos t ON t.id = s.todo_id
        WHERE {VISIBLE_TODO}
        ORDER BY s.updated_at DESC
        "#
    );
    let mut stmt = conn.prepare(&sql)?;
    let rows = stmt
        .query_map([], |row| {
            let preview: Option<String> = row.get(7)?;
            Ok(BotConversation {
                bot_id: row.get(0)?,
                todo_id: row.get(1)?,
                todo_detail: row.get(2)?,
                title: row.get(3)?,
                session_id: row.get(4)?,
                unread_count: row.get(5)?,
                last_message_at: row.get(6)?,
                last_message_preview: preview.map(|text| preview_line(&text)),
                running: row.get(8)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn preview_line(text: &str) -> String {
    let line = text.lines().map(str::trim).find(|line| !line.is_empty()).unwrap_or("");
    let chars: Vec<char> = line.chars().collect();
    if chars.len() > 60 {
        format!("{}…", chars[..60].iter().collect::<String>())
    } else {
        line.to_string()
    }
}

pub fn list_messages(conn: &Connection, todo_id: &str, bot_id: &str) -> Result<Vec<BotMessage>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT m.id, m.run_id, m.role, m.content, m.created_at, m.read_at
        FROM bot_messages m JOIN bot_sessions s ON s.id = m.session_ref
        WHERE s.todo_id = ?1 AND s.bot_id = ?2
        ORDER BY m.created_at, m.rowid
        "#,
    )?;
    let rows = stmt
        .query_map(params![todo_id, bot_id], |row| {
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

pub fn mark_read(conn: &Connection, todo_id: &str, bot_id: &str) -> Result<()> {
    conn.execute(
        r#"
        UPDATE bot_messages SET read_at = ?1
        WHERE read_at IS NULL AND session_ref IN (SELECT id FROM bot_sessions WHERE todo_id = ?2 AND bot_id = ?3)
        "#,
        params![now_iso(), todo_id, bot_id],
    )?;
    Ok(())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::db::test_database;
    use crate::core::todo_service::{archive_todo, complete_todo, create_todo, CreateTodoInput};
    use crate::core::workspace_service::list_groups;

    fn setup(conn: &mut Connection) -> (String, Bot, tempfile::TempDir) {
        let group = list_groups(conn).expect("groups").into_iter().next().expect("group");
        let todo = create_todo(
            conn,
            CreateTodoInput {
                detail: "整理周报\n- [ ] 汇总工时".to_string(),
                group_ids: vec![group.id],
                tag_ids: Vec::new(),
            },
        )
        .expect("create todo");
        let dir = tempfile::tempdir().expect("tempdir");
        let bot = create_bot(conn, &bot_input(dir.path(), "claude")).expect("create bot");
        (todo.id, bot, dir)
    }

    fn bot_input(dir: &Path, provider: &str) -> BotInput {
        BotInput {
            name: " 周报助手 ".to_string(),
            color: "teal".to_string(),
            provider: provider.to_string(),
            model: "sonnet".to_string(),
            directory: dir.display().to_string(),
        }
    }

    fn finish(conn: &mut Connection, run: &PreparedRun, status: &str, text: Option<&str>) {
        finish_run(
            conn,
            &FinishedRun {
                run_id: run.run_id.clone(),
                session_ref: run.session_ref.clone(),
                status: status.to_string(),
                usage: RunUsage { input_tokens: 100, cached_input_tokens: 40, output_tokens: 10, cost_usd: Some(0.01) },
                error: (status == "failed").then(|| "退出码 1".to_string()),
                final_text: text.map(str::to_string),
                session_id: Some("sess-1".to_string()),
                title: Some("EasyDo · 整理周报".to_string()),
                usage_totals: None,
            },
        )
        .expect("finish run");
    }

    #[test]
    fn validates_and_trims_bot_input() {
        let conn = test_database();
        let dir = tempfile::tempdir().expect("tempdir");
        let bot = create_bot(&conn, &bot_input(dir.path(), "codex")).expect("create");
        assert_eq!(bot.name, "周报助手");
        assert_eq!(bot.usage.runs, 0);

        let mut bad = bot_input(dir.path(), "gemini");
        assert_eq!(create_bot(&conn, &bad).expect_err("provider").message, "目前只支持 Claude Code 和 Codex");
        bad.provider = "claude".to_string();
        bad.directory = "/definitely/not/here".to_string();
        assert_eq!(create_bot(&conn, &bad).expect_err("dir").message, "工作目录不存在");
    }

    #[test]
    fn reuses_one_session_per_todo_and_bot() {
        let mut conn = test_database();
        let (todo_id, bot, _dir) = setup(&mut conn);

        let first = prepare_run(&mut conn, &todo_id, &bot.id, "先看看").expect("first run");
        assert_eq!(first.resume_session_id, None);
        assert_eq!(
            prepare_run(&mut conn, &todo_id, &bot.id, "").expect_err("busy").message,
            "这条 Todo 在这个 Bot 下还在运行"
        );
        finish(&mut conn, &first, "completed", Some("汇总好了\n共 32 小时"));

        let second = prepare_run(&mut conn, &todo_id, &bot.id, "").expect("second run");
        assert_eq!(second.session_ref, first.session_ref);
        assert_eq!(second.resume_session_id.as_deref(), Some("sess-1"));
        finish(&mut conn, &second, "failed", None);

        let messages = list_messages(&conn, &todo_id, &bot.id).expect("messages");
        let roles: Vec<&str> = messages.iter().map(|message| message.role.as_str()).collect();
        assert_eq!(roles, ["user", "bot", "system"]);
        assert_eq!(messages[2].content, "运行失败：退出码 1");

        let bots = list_bots(&conn).expect("bots");
        assert_eq!(bots[0].usage.runs, 2);
        assert_eq!(bots[0].usage.input_tokens, 200);
    }

    #[test]
    fn resets_the_session_after_the_bot_changes_directory() {
        let mut conn = test_database();
        let (todo_id, bot, _dir) = setup(&mut conn);
        let run = prepare_run(&mut conn, &todo_id, &bot.id, "").expect("run");
        finish(&mut conn, &run, "completed", Some("好了"));

        let other = tempfile::tempdir().expect("tempdir");
        update_bot(&conn, &bot.id, &bot_input(other.path(), "claude")).expect("update");
        let preview = dispatch_preview(&conn, &todo_id, &bot.id).expect("preview");
        assert!(preview.session_will_reset);

        let next = prepare_run(&mut conn, &todo_id, &bot.id, "").expect("next");
        assert_eq!(next.resume_session_id, None);
        assert_eq!(next.cwd, other.path().display().to_string());
        let last = list_messages(&conn, &todo_id, &bot.id).expect("messages").pop().expect("message");
        assert_eq!(last.role, "system");
    }

    #[test]
    fn blocks_completing_and_archiving_while_running() {
        let mut conn = test_database();
        let (todo_id, bot, _dir) = setup(&mut conn);
        let run = prepare_run(&mut conn, &todo_id, &bot.id, "").expect("run");
        assert_eq!(complete_todo(&mut conn, &todo_id).expect_err("complete").message, "Bot 运行中，先停止");
        assert_eq!(archive_todo(&mut conn, &todo_id).expect_err("archive").message, "Bot 运行中，先停止");
        assert_eq!(delete_bot(&conn, &bot.id).expect_err("delete").message, "Bot 运行中，先停止再删除");

        finish(&mut conn, &run, "stopped", None);
        complete_todo(&mut conn, &todo_id).expect("complete after stop");
    }

    #[test]
    fn unread_counts_follow_the_todo_and_hide_after_archive() {
        let mut conn = test_database();
        let (todo_id, bot, _dir) = setup(&mut conn);
        let run = prepare_run(&mut conn, &todo_id, &bot.id, "开始").expect("run");
        finish(&mut conn, &run, "completed", Some("做完了"));

        let unread = list_unread_by_todo(&conn).expect("unread");
        assert_eq!(unread, vec![TodoUnread { todo_id: todo_id.clone(), count: 1, bot_id: bot.id.clone() }]);
        let conversations = list_conversations(&conn).expect("conversations");
        assert_eq!(conversations[0].last_message_preview.as_deref(), Some("做完了"));

        mark_read(&conn, &todo_id, &bot.id).expect("read");
        assert!(list_unread_by_todo(&conn).expect("unread").is_empty());

        let run = prepare_run(&mut conn, &todo_id, &bot.id, "").expect("run");
        finish(&mut conn, &run, "completed", Some("又做了一点"));
        archive_todo(&mut conn, &todo_id).expect("archive");
        assert!(list_unread_by_todo(&conn).expect("unread").is_empty());
        assert!(list_conversations(&conn).expect("conversations").is_empty());
    }

    #[test]
    fn interrupted_runs_are_closed_on_startup() {
        let mut conn = test_database();
        let (todo_id, bot, _dir) = setup(&mut conn);
        prepare_run(&mut conn, &todo_id, &bot.id, "").expect("run");
        assert_eq!(mark_interrupted_runs(&mut conn).expect("mark"), 1);
        assert!(list_active_runs(&conn).expect("active").is_empty());
        assert_eq!(list_unread_by_todo(&conn).expect("unread")[0].count, 1);
    }

    #[test]
    fn deleting_a_bot_removes_its_messages() {
        let mut conn = test_database();
        let (todo_id, bot, _dir) = setup(&mut conn);
        let run = prepare_run(&mut conn, &todo_id, &bot.id, "开始").expect("run");
        finish(&mut conn, &run, "completed", Some("好"));
        assert_eq!(count_bot_messages(&conn, &bot.id).expect("count"), 2);
        delete_bot(&conn, &bot.id).expect("delete");
        let left: i64 = conn.query_row("SELECT COUNT(*) FROM bot_messages", [], |row| row.get(0)).expect("count");
        assert_eq!(left, 0);
    }
}
