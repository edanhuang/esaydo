use std::collections::HashSet;

use chrono::{DateTime, FixedOffset, Local, SecondsFormat, TimeZone, Utc};
use rusqlite::{params, Connection, OptionalExtension};

use super::db::{new_id, now_iso};
use super::error::{EasyDoError, Result};
use super::models::{Group, Tag, Todo, TodoGroupSortOrder, TodoWithRelations};
use super::workspace_service::{get_board_view, get_group, get_system_group};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TodoStatus {
    Active,
    Done,
    Archived,
}

impl TodoStatus {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Active => "active",
            Self::Done => "done",
            Self::Archived => "archived",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq, Hash)]
pub enum TodoPriority {
    Normal,
    High,
}

impl TodoPriority {
    pub fn as_str(self) -> &'static str {
        match self {
            Self::Normal => "normal",
            Self::High => "high",
        }
    }
}

#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum TimeField {
    Activity,
    Created,
    Updated,
    Completed,
    Archived,
}

#[derive(Debug, Clone, PartialEq, Eq)]
pub struct TimeRange {
    pub start: Option<String>,
    pub end_exclusive: Option<String>,
}

#[derive(Debug, Clone)]
pub struct TodoFilter {
    pub board_view_id: Option<String>,
    pub group_id: Option<String>,
    pub statuses: HashSet<TodoStatus>,
    pub time_field: TimeField,
    pub time_range: Option<TimeRange>,
}

impl Default for TodoFilter {
    fn default() -> Self {
        Self {
            board_view_id: None,
            group_id: None,
            statuses: HashSet::from([TodoStatus::Active, TodoStatus::Done]),
            time_field: TimeField::Activity,
            time_range: None,
        }
    }
}

#[derive(Debug, Clone)]
pub struct CreateTodoInput {
    pub detail: String,
    pub group_ids: Vec<String>,
    pub tag_ids: Vec<String>,
}

pub fn create_todo(conn: &mut Connection, input: CreateTodoInput) -> Result<TodoWithRelations> {
    let detail = input.detail.trim();
    if detail.is_empty() {
        return Err(EasyDoError::invalid("Todo 内容不能为空"));
    }
    if input.group_ids.is_empty() {
        return Err(EasyDoError::invalid("至少需要指定一个 Group"));
    }
    let group_ids = input
        .group_ids
        .into_iter()
        .collect::<HashSet<_>>()
        .into_iter()
        .collect::<Vec<_>>();
    for group_id in &group_ids {
        let group = get_group(conn, group_id)?;
        if group.system_key.is_some() {
            return Err(EasyDoError::invalid(
                "收件箱不能通过普通 add 创建或与普通 Group 混用",
            ));
        }
    }

    create_todo_record(conn, detail, &group_ids, &input.tag_ids, None, "created")
}

pub fn create_inbox_todo(conn: &mut Connection, detail: &str) -> Result<TodoWithRelations> {
    create_inbox_todo_at(conn, detail, Local::now())
}

fn create_inbox_todo_at(
    conn: &mut Connection,
    detail: &str,
    created: DateTime<Local>,
) -> Result<TodoWithRelations> {
    let detail = detail.trim();
    if detail.is_empty() {
        return Err(EasyDoError::invalid("Todo 内容不能为空"));
    }
    let inbox = get_system_group(conn, "inbox")?;
    let expires_at = inbox_expiry_for(created)?;
    create_todo_record(
        conn,
        detail,
        &[inbox.id],
        &[],
        Some(expires_at),
        "created_in_inbox",
    )
}

fn create_todo_record(
    conn: &mut Connection,
    detail: &str,
    group_ids: &[String],
    tag_ids: &[String],
    expires_at: Option<String>,
    event_type: &str,
) -> Result<TodoWithRelations> {
    let tx = conn.transaction()?;
    let id = new_id();
    let now = now_iso();
    tx.execute(
        r#"
        INSERT INTO todos (id, detail, status, created_at, updated_at, expires_at)
        VALUES (?1, ?2, 'active', ?3, ?3, ?4)
        "#,
        params![id, detail, now, expires_at],
    )?;

    for group_id in group_ids {
        let sort_order = tx.query_row(
            "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM todo_groups WHERE group_id = ?1",
            params![group_id],
            |row| row.get::<_, i64>(0),
        )?;
        tx.execute(
            "INSERT INTO todo_groups (todo_id, group_id, sort_order) VALUES (?1, ?2, ?3)",
            params![id, group_id, sort_order],
        )?;
    }
    for tag_id in tag_ids {
        tx.execute(
            "INSERT INTO todo_tags (todo_id, tag_id) VALUES (?1, ?2)",
            params![id, tag_id],
        )?;
    }
    insert_event(&tx, &id, event_type, detail, &now)?;
    tx.commit()?;
    get_todo_with_relations(conn, &id)
}

pub fn inbox_expiry_for(created: DateTime<Local>) -> Result<String> {
    let next_date = created
        .date_naive()
        .succ_opt()
        .ok_or_else(|| EasyDoError::invalid("收件箱到期日期超出支持范围"))?;
    let naive = next_date
        .and_hms_opt(3, 0, 0)
        .ok_or_else(|| EasyDoError::invalid("收件箱到期时间无效"))?;
    let expires = Local
        .from_local_datetime(&naive)
        .earliest()
        .ok_or_else(|| EasyDoError::invalid("本地时区无法表示收件箱到期时间"))?;
    Ok(expires.to_rfc3339_opts(SecondsFormat::Millis, true))
}

pub fn list_todos(conn: &Connection, filter: &TodoFilter) -> Result<Vec<TodoWithRelations>> {
    let explicit_group = filter
        .group_id
        .as_deref()
        .map(|id| get_group(conn, id))
        .transpose()?;
    let mut include_inbox = explicit_group
        .as_ref()
        .is_some_and(|group| group.system_key.as_deref() == Some("inbox"));
    let view_group_ids = match filter.board_view_id.as_deref() {
        None => None,
        Some(id) => {
            let view = get_board_view(conn, id)?;
            if view.system_key.as_deref() == Some("all") {
                None
            } else {
                include_inbox |= view.system_key.as_deref() == Some("inbox");
                Some(
                    view.groups
                        .into_iter()
                        .map(|group| group.id)
                        .collect::<HashSet<_>>(),
                )
            }
        }
    };
    if matches!(view_group_ids, Some(ref ids) if ids.is_empty()) {
        return Ok(Vec::new());
    }

    let mut stmt = conn.prepare(
        r#"
        SELECT id
        FROM todos
        WHERE deleted_at IS NULL
        ORDER BY (
          SELECT MIN(todo_groups.sort_order)
          FROM todo_groups
          WHERE todo_groups.todo_id = todos.id
        ) ASC, created_at ASC
        "#,
    )?;
    let ids = stmt
        .query_map([], |row| row.get::<_, String>(0))?
        .collect::<std::result::Result<Vec<_>, _>>()?;

    let mut todos = Vec::new();
    for id in ids {
        let todo = get_todo_with_relations(conn, &id)?;
        if !include_inbox
            && todo
                .groups
                .iter()
                .any(|group| group.system_key.as_deref() == Some("inbox"))
        {
            continue;
        }
        let status = parse_stored_status(&todo.status)?;
        if !filter.statuses.contains(&status) {
            continue;
        }
        if let Some(group_id) = filter.group_id.as_deref() {
            if !todo.groups.iter().any(|group| group.id == group_id) {
                continue;
            }
        }
        if let Some(view_group_ids) = &view_group_ids {
            if !todo
                .groups
                .iter()
                .any(|group| view_group_ids.contains(&group.id))
            {
                continue;
            }
        }
        if let Some(range) = &filter.time_range {
            let Some(value) = time_value(&todo, filter.time_field) else {
                continue;
            };
            if !time_in_range(value, range)? {
                continue;
            }
        }
        todos.push(todo);
    }
    Ok(todos)
}

pub fn list_board_todos(
    conn: &Connection,
    board_view_id: Option<&str>,
) -> Result<Vec<TodoWithRelations>> {
    let filter = TodoFilter {
        board_view_id: board_view_id.map(str::to_string),
        ..TodoFilter::default()
    };
    list_todos(conn, &filter)
}

pub fn list_daily_todos(conn: &Connection) -> Result<Vec<TodoWithRelations>> {
    let filter = TodoFilter {
        statuses: HashSet::from([TodoStatus::Active, TodoStatus::Done, TodoStatus::Archived]),
        ..TodoFilter::default()
    };
    let mut todos = list_todos(conn, &filter)?;
    todos.sort_by(|left, right| {
        activity_time(left)
            .cmp(activity_time(right))
            .then(left.created_at.cmp(&right.created_at))
    });
    Ok(todos)
}

pub fn list_weekly_done(
    conn: &Connection,
    start: &str,
    end_inclusive: &str,
) -> Result<Vec<TodoWithRelations>> {
    let filter = TodoFilter {
        statuses: HashSet::from([TodoStatus::Done]),
        time_field: TimeField::Completed,
        time_range: Some(TimeRange {
            start: Some(start.to_string()),
            end_exclusive: None,
        }),
        ..TodoFilter::default()
    };
    let mut todos = list_todos(conn, &filter)?;
    todos.retain(|todo| {
        todo.completed_at
            .as_deref()
            .is_some_and(|completed| completed <= end_inclusive)
    });
    todos.sort_by(|left, right| left.completed_at.cmp(&right.completed_at));
    Ok(todos)
}

pub fn update_todo_detail(
    conn: &mut Connection,
    id: &str,
    detail: &str,
) -> Result<TodoWithRelations> {
    let detail = detail.trim();
    if detail.is_empty() {
        return Err(EasyDoError::invalid("Todo 内容不能为空"));
    }
    get_todo(conn, id)?;
    let tx = conn.transaction()?;
    let now = now_iso();
    tx.execute(
        "UPDATE todos SET detail = ?1, updated_at = ?2 WHERE id = ?3",
        params![detail, now, id],
    )?;
    insert_event(&tx, id, "updated", detail, &now)?;
    tx.commit()?;
    get_todo_with_relations(conn, id)
}

pub fn set_todo_priority(
    conn: &mut Connection,
    id: &str,
    priority: TodoPriority,
) -> Result<TodoWithRelations> {
    let todo = get_todo(conn, id)?;
    if todo.status == "archived" {
        return Err(EasyDoError::invalid_state("已归档 Todo 不能修改优先级"));
    }
    if todo.priority == priority.as_str() {
        return get_todo_with_relations(conn, id);
    }

    let tx = conn.transaction()?;
    let now = now_iso();
    tx.execute(
        "UPDATE todos SET priority = ?1, updated_at = ?2 WHERE id = ?3",
        params![priority.as_str(), now, id],
    )?;
    insert_event(&tx, id, "priority_updated", priority.as_str(), &now)?;
    tx.commit()?;
    get_todo_with_relations(conn, id)
}

pub fn complete_todo(conn: &mut Connection, id: &str) -> Result<TodoWithRelations> {
    let todo = get_todo(conn, id)?;
    match todo.status.as_str() {
        "done" => return get_todo_with_relations(conn, id),
        "archived" => return Err(EasyDoError::invalid_state("已归档 Todo 不能直接完成")),
        "active" => {}
        _ => return Err(EasyDoError::invalid_state("Todo 状态无效")),
    }
    let tx = conn.transaction()?;
    let now = now_iso();
    tx.execute(
        r#"
        UPDATE todos
        SET status = 'done', completed_at = ?1, archived_at = NULL, updated_at = ?1
        WHERE id = ?2
        "#,
        params![now, id],
    )?;
    insert_event(&tx, id, "completed", &todo.detail, &now)?;
    tx.commit()?;
    get_todo_with_relations(conn, id)
}

pub fn reopen_todo(conn: &mut Connection, id: &str) -> Result<TodoWithRelations> {
    let todo = get_todo(conn, id)?;
    if todo.status == "active" {
        return get_todo_with_relations(conn, id);
    }
    let tx = conn.transaction()?;
    let now = now_iso();
    tx.execute(
        r#"
        UPDATE todos
        SET status = 'active', completed_at = NULL, archived_at = NULL, updated_at = ?1
        WHERE id = ?2
        "#,
        params![now, id],
    )?;
    insert_event(&tx, id, "reopened", &todo.detail, &now)?;
    tx.commit()?;
    get_todo_with_relations(conn, id)
}

pub fn archive_todo(conn: &mut Connection, id: &str) -> Result<TodoWithRelations> {
    let todo = get_todo(conn, id)?;
    if todo.status == "archived" {
        return get_todo_with_relations(conn, id);
    }
    let tx = conn.transaction()?;
    let now = now_iso();
    tx.execute(
        r#"
        UPDATE todos
        SET status = 'archived', archived_at = ?1, updated_at = ?1
        WHERE id = ?2
        "#,
        params![now, id],
    )?;
    insert_event(&tx, id, "archived", &todo.detail, &now)?;
    tx.commit()?;
    get_todo_with_relations(conn, id)
}

pub fn delete_todo(conn: &Connection, id: &str) -> Result<()> {
    let affected = conn.execute("DELETE FROM todos WHERE id = ?1", params![id])?;
    if affected == 0 {
        return Err(EasyDoError::not_found("未找到 Todo"));
    }
    Ok(())
}

pub fn move_todo_from_inbox(
    conn: &mut Connection,
    id: &str,
    target_group_id: &str,
) -> Result<TodoWithRelations> {
    let todo = get_todo(conn, id)?;
    let target = get_group(conn, target_group_id)?;
    if target.system_key.is_some() {
        return Err(EasyDoError::invalid("目标必须是普通 Group"));
    }
    let inbox = get_system_group(conn, "inbox")?;
    let belongs_to_inbox = conn
        .query_row(
            "SELECT 1 FROM todo_groups WHERE todo_id = ?1 AND group_id = ?2",
            params![id, inbox.id],
            |_| Ok(()),
        )
        .optional()?
        .is_some();
    if !belongs_to_inbox {
        return Err(EasyDoError::invalid_state("Todo 不在收件箱"));
    }

    let tx = conn.transaction()?;
    let sort_order = tx.query_row(
        "SELECT COALESCE(MAX(sort_order), -1) + 1 FROM todo_groups WHERE group_id = ?1",
        params![target.id],
        |row| row.get::<_, i64>(0),
    )?;
    tx.execute("DELETE FROM todo_groups WHERE todo_id = ?1", params![id])?;
    tx.execute(
        "INSERT INTO todo_groups (todo_id, group_id, sort_order) VALUES (?1, ?2, ?3)",
        params![id, target.id, sort_order],
    )?;
    let now = now_iso();
    tx.execute(
        "UPDATE todos SET expires_at = NULL, updated_at = ?1 WHERE id = ?2",
        params![now, id],
    )?;
    insert_event(
        &tx,
        id,
        "moved_from_inbox",
        &format!("{} -> {}", todo.detail, target.name),
        &now,
    )?;
    tx.commit()?;
    get_todo_with_relations(conn, id)
}

pub fn count_inbox_todos(conn: &Connection) -> Result<i64> {
    Ok(conn.query_row(
        r#"
        SELECT COUNT(*)
        FROM todos
        INNER JOIN todo_groups ON todo_groups.todo_id = todos.id
        INNER JOIN groups ON groups.id = todo_groups.group_id
        WHERE groups.system_key = 'inbox'
          AND todos.deleted_at IS NULL
          AND todos.status != 'archived'
        "#,
        [],
        |row| row.get(0),
    )?)
}

pub fn purge_expired_inbox_todos(
    conn: &mut Connection,
    now: DateTime<FixedOffset>,
) -> Result<usize> {
    let candidates = {
        let mut stmt = conn.prepare(
            r#"
            SELECT todos.id, todos.detail, todos.expires_at
            FROM todos
            INNER JOIN todo_groups ON todo_groups.todo_id = todos.id
            INNER JOIN groups ON groups.id = todo_groups.group_id
            WHERE groups.system_key = 'inbox'
              AND todos.deleted_at IS NULL
              AND todos.expires_at IS NOT NULL
            "#,
        )?;
        let rows = stmt.query_map([], |row| {
            Ok((
                row.get::<_, String>(0)?,
                row.get::<_, String>(1)?,
                row.get::<_, String>(2)?,
            ))
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
        rows
    };

    let expired = candidates
        .into_iter()
        .filter_map(|(id, detail, expires_at)| {
            DateTime::<FixedOffset>::parse_from_rfc3339(&expires_at)
                .ok()
                .filter(|expires| expires <= &now)
                .map(|_| (id, detail))
        })
        .collect::<Vec<_>>();
    if expired.is_empty() {
        return Ok(0);
    }

    let deleted_at = now.to_rfc3339_opts(SecondsFormat::Millis, true);
    let tx = conn.transaction()?;
    let mut deleted = 0;
    for (id, detail) in expired {
        let affected = tx.execute(
            r#"
            UPDATE todos
            SET deleted_at = ?1, delete_reason = 'inbox_expired', updated_at = ?1
            WHERE id = ?2 AND deleted_at IS NULL
            "#,
            params![deleted_at, id],
        )?;
        if affected == 1 {
            insert_event(&tx, &id, "auto_deleted", &detail, &deleted_at)?;
            deleted += 1;
        }
    }
    tx.commit()?;
    Ok(deleted)
}

pub fn purge_expired_inbox_todos_now(conn: &mut Connection) -> Result<usize> {
    purge_expired_inbox_todos(conn, Utc::now().fixed_offset())
}

pub fn get_todo_with_relations(conn: &Connection, id: &str) -> Result<TodoWithRelations> {
    let todo = get_todo(conn, id)?;
    Ok(TodoWithRelations {
        id: todo.id.clone(),
        detail: todo.detail,
        status: todo.status,
        priority: todo.priority,
        extra_text: todo.extra_text,
        created_at: todo.created_at,
        updated_at: todo.updated_at,
        completed_at: todo.completed_at,
        archived_at: todo.archived_at,
        expires_at: todo.expires_at,
        deleted_at: todo.deleted_at,
        delete_reason: todo.delete_reason,
        groups: list_groups_for_todo(conn, id)?,
        group_sort_orders: list_group_sort_orders_for_todo(conn, id)?,
        tags: list_tags_for_todo(conn, id)?,
    })
}

fn get_todo(conn: &Connection, id: &str) -> Result<Todo> {
    conn.query_row(
        r#"
        SELECT id, detail, status, priority, extra_text, created_at, updated_at, completed_at, archived_at,
               expires_at, deleted_at, delete_reason
        FROM todos
        WHERE id = ?1 AND deleted_at IS NULL
        "#,
        params![id],
        |row| {
            Ok(Todo {
                id: row.get(0)?,
                detail: row.get(1)?,
                status: row.get(2)?,
                priority: row.get(3)?,
                extra_text: row.get(4)?,
                created_at: row.get(5)?,
                updated_at: row.get(6)?,
                completed_at: row.get(7)?,
                archived_at: row.get(8)?,
                expires_at: row.get(9)?,
                deleted_at: row.get(10)?,
                delete_reason: row.get(11)?,
            })
        },
    )
    .optional()?
    .ok_or_else(|| EasyDoError::not_found("未找到 Todo"))
}

fn list_groups_for_todo(conn: &Connection, id: &str) -> Result<Vec<Group>> {
    let mut stmt = conn.prepare(
        r#"
        SELECT groups.id, groups.name, groups.sort_order, groups.system_key,
               groups.created_at, groups.updated_at
        FROM groups
        INNER JOIN todo_groups ON todo_groups.group_id = groups.id
        WHERE todo_groups.todo_id = ?1
        ORDER BY groups.sort_order ASC
        "#,
    )?;
    let rows = stmt
        .query_map(params![id], |row| {
            Ok(Group {
                id: row.get(0)?,
                name: row.get(1)?,
                sort_order: row.get(2)?,
                system_key: row.get(3)?,
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn list_group_sort_orders_for_todo(conn: &Connection, id: &str) -> Result<Vec<TodoGroupSortOrder>> {
    let mut stmt = conn.prepare(
        "SELECT group_id, sort_order FROM todo_groups WHERE todo_id = ?1 ORDER BY sort_order ASC",
    )?;
    let rows = stmt
        .query_map(params![id], |row| {
            Ok(TodoGroupSortOrder {
                group_id: row.get(0)?,
                sort_order: row.get(1)?,
            })
        })?
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn list_tags_for_todo(conn: &Connection, id: &str) -> Result<Vec<Tag>> {
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
        .collect::<std::result::Result<Vec<_>, _>>()?;
    Ok(rows)
}

fn insert_event(
    conn: &Connection,
    todo_id: &str,
    event_type: &str,
    content: &str,
    created_at: &str,
) -> Result<()> {
    conn.execute(
        r#"
        INSERT INTO todo_events (id, todo_id, event_type, content, created_at)
        VALUES (?1, ?2, ?3, ?4, ?5)
        "#,
        params![new_id(), todo_id, event_type, content, created_at],
    )?;
    Ok(())
}

fn parse_stored_status(status: &str) -> Result<TodoStatus> {
    match status {
        "active" => Ok(TodoStatus::Active),
        "done" => Ok(TodoStatus::Done),
        "archived" => Ok(TodoStatus::Archived),
        _ => Err(EasyDoError::system(format!(
            "数据库中存在未知 Todo 状态: {status}"
        ))),
    }
}

pub fn parse_todo_priority(priority: &str) -> Result<TodoPriority> {
    match priority {
        "normal" => Ok(TodoPriority::Normal),
        "high" => Ok(TodoPriority::High),
        _ => Err(EasyDoError::invalid(format!(
            "无效 Todo 优先级: {priority}"
        ))),
    }
}

fn time_value(todo: &TodoWithRelations, field: TimeField) -> Option<&str> {
    match field {
        TimeField::Activity => Some(activity_time(todo)),
        TimeField::Created => Some(&todo.created_at),
        TimeField::Updated => Some(&todo.updated_at),
        TimeField::Completed => todo.completed_at.as_deref(),
        TimeField::Archived => todo.archived_at.as_deref(),
    }
}

fn activity_time(todo: &TodoWithRelations) -> &str {
    if todo.status == "archived" {
        todo.archived_at.as_deref().unwrap_or(&todo.created_at)
    } else if todo.status == "done" {
        todo.completed_at.as_deref().unwrap_or(&todo.created_at)
    } else {
        &todo.created_at
    }
}

fn time_in_range(value: &str, range: &TimeRange) -> Result<bool> {
    let value = DateTime::<FixedOffset>::parse_from_rfc3339(value)
        .map_err(|_| EasyDoError::system(format!("数据库时间格式无效: {value}")))?;
    if let Some(start) = range.start.as_deref() {
        let start = DateTime::<FixedOffset>::parse_from_rfc3339(start)
            .map_err(|_| EasyDoError::invalid(format!("开始时间格式无效: {start}")))?;
        if value < start {
            return Ok(false);
        }
    }
    if let Some(end) = range.end_exclusive.as_deref() {
        let end = DateTime::<FixedOffset>::parse_from_rfc3339(end)
            .map_err(|_| EasyDoError::invalid(format!("结束时间格式无效: {end}")))?;
        if value >= end {
            return Ok(false);
        }
    }
    Ok(true)
}

#[cfg(test)]
mod tests {
    use chrono::Duration;
    use rusqlite::params;

    use super::*;
    use crate::core::db::{open_database, test_database};
    use crate::core::workspace_service::list_groups;

    fn create_work_todo(conn: &mut Connection, detail: &str) -> TodoWithRelations {
        let work = list_groups(conn)
            .expect("list groups")
            .into_iter()
            .find(|group| group.name == "工作")
            .expect("work group");
        create_todo(
            conn,
            CreateTodoInput {
                detail: detail.to_string(),
                group_ids: vec![work.id],
                tag_ids: Vec::new(),
            },
        )
        .expect("create todo")
    }

    #[test]
    fn complete_and_archive_are_idempotent() {
        let mut conn = test_database();
        let todo = create_work_todo(&mut conn, "幂等测试");
        let completed = complete_todo(&mut conn, &todo.id).expect("complete todo");
        let repeated = complete_todo(&mut conn, &todo.id).expect("complete again");
        assert_eq!(completed.completed_at, repeated.completed_at);

        let archived = archive_todo(&mut conn, &todo.id).expect("archive todo");
        let repeated = archive_todo(&mut conn, &todo.id).expect("archive again");
        assert_eq!(archived.archived_at, repeated.archived_at);

        let events: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM todo_events WHERE todo_id = ?1 AND event_type IN ('completed', 'archived')",
                params![todo.id],
                |row| row.get(0),
            )
            .expect("count events");
        assert_eq!(events, 2);
    }

    #[test]
    fn archived_todo_cannot_be_completed() {
        let mut conn = test_database();
        let todo = create_work_todo(&mut conn, "归档测试");
        archive_todo(&mut conn, &todo.id).expect("archive todo");

        assert_eq!(
            complete_todo(&mut conn, &todo.id)
                .expect_err("archived todo should fail")
                .message,
            "已归档 Todo 不能直接完成"
        );
    }

    #[test]
    fn empty_regular_view_returns_no_todos() {
        let mut conn = test_database();
        create_work_todo(&mut conn, "工作任务");
        conn.execute(
            "INSERT INTO board_views (id, name, sort_order, created_at, updated_at) VALUES ('empty', '空白', 9, ?1, ?1)",
            params![now_iso()],
        )
        .expect("create empty view");
        let filter = TodoFilter {
            board_view_id: Some("empty".to_string()),
            ..TodoFilter::default()
        };

        assert!(list_todos(&conn, &filter).expect("list todos").is_empty());
    }

    #[test]
    fn inbox_expiry_is_next_local_day_at_three() {
        let created = Local
            .with_ymd_and_hms(2026, 6, 12, 23, 59, 0)
            .single()
            .expect("local date");
        let expires = inbox_expiry_for(created).expect("expiry");
        let expires = DateTime::<FixedOffset>::parse_from_rfc3339(&expires).expect("parse expiry");
        assert_eq!(expires.date_naive().to_string(), "2026-06-13");
        assert_eq!(expires.time().format("%H:%M").to_string(), "03:00");
    }

    #[test]
    fn inbox_todo_can_move_to_regular_group() {
        let mut conn = test_database();
        let inbox = create_inbox_todo(&mut conn, "待分拣").expect("create inbox todo");
        assert_eq!(inbox.groups[0].system_key.as_deref(), Some("inbox"));
        assert!(inbox.expires_at.is_some());
        let work = list_groups(&conn)
            .expect("groups")
            .into_iter()
            .find(|group| group.name == "工作")
            .expect("work group");

        let moved = move_todo_from_inbox(&mut conn, &inbox.id, &work.id).expect("move todo");
        assert_eq!(moved.groups, vec![work]);
        assert_eq!(moved.expires_at, None);
        assert_eq!(count_inbox_todos(&conn).expect("count inbox"), 0);
    }

    #[test]
    fn regular_create_rejects_system_group() {
        let mut conn = test_database();
        let inbox = get_system_group(&conn, "inbox").expect("inbox");
        let error = create_todo(
            &mut conn,
            CreateTodoInput {
                detail: "无效".to_string(),
                group_ids: vec![inbox.id],
                tag_ids: Vec::new(),
            },
        )
        .expect_err("system group should fail");
        assert!(error.message.contains("收件箱不能"));
    }

    #[test]
    fn expired_inbox_todo_is_logically_deleted_once_and_hidden() {
        let mut conn = test_database();
        let created = Local::now() - Duration::days(2);
        let todo = create_inbox_todo_at(&mut conn, "已过期", created).expect("create inbox");
        let now = Utc::now().fixed_offset();

        assert_eq!(
            purge_expired_inbox_todos(&mut conn, now).expect("purge"),
            1
        );
        assert_eq!(
            purge_expired_inbox_todos(&mut conn, now).expect("purge again"),
            0
        );
        assert!(get_todo_with_relations(&conn, &todo.id).is_err());
        let row: (Option<String>, Option<String>) = conn
            .query_row(
                "SELECT deleted_at, delete_reason FROM todos WHERE id = ?1",
                params![todo.id],
                |row| Ok((row.get(0)?, row.get(1)?)),
            )
            .expect("deleted row");
        assert!(row.0.is_some());
        assert_eq!(row.1.as_deref(), Some("inbox_expired"));
        let events: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM todo_events WHERE todo_id = ?1 AND event_type = 'auto_deleted'",
                params![todo.id],
                |row| row.get(0),
            )
            .expect("event count");
        assert_eq!(events, 1);
    }

    #[test]
    fn moved_and_not_yet_expired_todos_are_not_purged() {
        let mut conn = test_database();
        let future = create_inbox_todo_at(&mut conn, "未到期", Local::now()).expect("future");
        let moved = create_inbox_todo_at(&mut conn, "已迁出", Local::now() - Duration::days(2))
            .expect("moved");
        let work = list_groups(&conn)
            .expect("groups")
            .into_iter()
            .find(|group| group.name == "工作")
            .expect("work");
        move_todo_from_inbox(&mut conn, &moved.id, &work.id).expect("move");

        assert_eq!(
            purge_expired_inbox_todos(&mut conn, Utc::now().fixed_offset()).expect("purge"),
            0
        );
        assert!(get_todo_with_relations(&conn, &future.id).is_ok());
        assert!(get_todo_with_relations(&conn, &moved.id).is_ok());
    }

    #[test]
    fn explicit_physical_delete_still_removes_inbox_todo() {
        let mut conn = test_database();
        let todo = create_inbox_todo(&mut conn, "删除").expect("create");
        delete_todo(&conn, &todo.id).expect("delete");
        let count: i64 = conn
            .query_row(
                "SELECT COUNT(*) FROM todos WHERE id = ?1",
                params![todo.id],
                |row| row.get(0),
            )
            .expect("count");
        assert_eq!(count, 0);
    }

    #[test]
    fn independent_connection_scan_is_visible_and_idempotent() {
        let root = tempfile::tempdir().expect("temp dir");
        let path = root.path().join("scan.sqlite");
        let mut writer = open_database(&path).expect("writer");
        let todo = create_inbox_todo_at(&mut writer, "后台扫描", Local::now() - Duration::days(2))
            .expect("create inbox");

        let mut scanner = open_database(&path).expect("scanner");
        assert_eq!(
            purge_expired_inbox_todos(&mut scanner, Utc::now().fixed_offset()).expect("scan"),
            1
        );
        assert_eq!(
            purge_expired_inbox_todos(&mut writer, Utc::now().fixed_offset())
                .expect("repeat scan"),
            0
        );
        let events: i64 = writer
            .query_row(
                "SELECT COUNT(*) FROM todo_events WHERE todo_id = ?1 AND event_type = 'auto_deleted'",
                params![todo.id],
                |row| row.get(0),
            )
            .expect("event count");
        assert_eq!(events, 1);
    }
}
