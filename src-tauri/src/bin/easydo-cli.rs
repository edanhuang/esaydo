use std::collections::HashSet;
use std::env;
use std::path::PathBuf;
use std::process::ExitCode;

use chrono::{Local, NaiveDate, SecondsFormat, TimeZone};
use clap::error::ErrorKind as ClapErrorKind;
use clap::{Args, CommandFactory, Parser, Subcommand};
use easydo_lib::core::db::{default_database_path, open_database};
use easydo_lib::core::error::{EasyDoError, ErrorKind, Result};
use easydo_lib::core::models::TodoWithRelations;
use easydo_lib::core::selectors::{resolve_group, resolve_todo_id, resolve_view};
use easydo_lib::core::skills::{install_skills, AgentTarget, SkillCatalog, SkillInstallResult};
use easydo_lib::core::todo_service::{
    self, CreateTodoInput, TimeField, TimeRange, TodoFilter, TodoStatus,
};

#[derive(Debug, Parser)]
#[command(
    name = "easydo",
    version,
    about = "EasyDo 本地 Todo 命令行工具",
    disable_help_subcommand = true
)]
struct Cli {
    #[arg(long, global = true, value_name = "PATH")]
    database: Option<PathBuf>,

    #[command(subcommand)]
    command: Commands,
}

#[derive(Debug, Subcommand)]
enum Commands {
    /// 列出命令和使用方法
    Help,
    /// 查询 Todo
    List(ListArgs),
    /// 新增 Todo
    Add(AddArgs),
    /// 管理暂存 Todo 的收件箱
    Inbox {
        #[command(subcommand)]
        command: InboxCommands,
    },
    /// 将收件箱 Todo 迁移到普通 Group
    Move(MoveArgs),
    /// 修改 Todo 内容
    Update(UpdateArgs),
    /// 完成 Todo
    Done(TodoActionArgs),
    /// 归档 Todo
    Archive(TodoActionArgs),
    /// 管理 EasyDo Agent Skills
    Skills {
        #[command(subcommand)]
        command: SkillCommands,
    },
}

#[derive(Debug, Subcommand)]
enum InboxCommands {
    /// 新增一条次日 03:00 后自动清理的暂存 Todo
    Add(InboxAddArgs),
}

#[derive(Debug, Args)]
#[command(after_help = "示例:\n  easydo inbox add \"待归类工作\" --json")]
struct InboxAddArgs {
    detail: String,
    #[arg(long)]
    json: bool,
}

#[derive(Debug, Args)]
#[command(after_help = "示例:\n  easydo move <todo-id> --group 工作 --json")]
struct MoveArgs {
    selector: String,
    #[arg(long)]
    group: String,
    #[arg(long)]
    json: bool,
}

#[derive(Debug, Args)]
struct ListArgs {
    #[arg(long)]
    view: Option<String>,
    #[arg(long)]
    group: Option<String>,
    #[arg(long, default_value = "default")]
    status: String,
    #[arg(long)]
    from: Option<String>,
    #[arg(long)]
    to: Option<String>,
    #[arg(long, default_value = "activity")]
    time_field: String,
    #[arg(long)]
    json: bool,
}

#[derive(Debug, Args)]
struct AddArgs {
    detail: String,
    #[arg(long = "group")]
    groups: Vec<String>,
    #[arg(long)]
    json: bool,
}

#[derive(Debug, Args)]
struct UpdateArgs {
    selector: String,
    #[arg(long)]
    detail: String,
    #[arg(long)]
    json: bool,
}

#[derive(Debug, Args)]
struct TodoActionArgs {
    selector: String,
    #[arg(long)]
    json: bool,
}

#[derive(Debug, Subcommand)]
enum SkillCommands {
    /// 列出内置 Skill
    List {
        #[arg(long)]
        json: bool,
    },
    /// 安装一个或全部 Skill
    Install {
        selection: String,
        #[arg(long)]
        agent: Option<String>,
        #[arg(long)]
        json: bool,
    },
}

fn main() -> ExitCode {
    let cli = match Cli::try_parse() {
        Ok(cli) => cli,
        Err(error) => return handle_parse_error(error),
    };
    match run(cli) {
        Ok(()) => ExitCode::SUCCESS,
        Err(error) => {
            eprintln!("{}", error.message);
            ExitCode::from(exit_code(error.kind))
        }
    }
}

fn handle_parse_error(error: clap::Error) -> ExitCode {
    match error.kind() {
        ClapErrorKind::DisplayHelp | ClapErrorKind::DisplayVersion => {
            print!("{error}");
            ExitCode::SUCCESS
        }
        ClapErrorKind::InvalidSubcommand => {
            eprintln!("未知命令。运行 easydo help 查看用法。");
            ExitCode::from(2)
        }
        ClapErrorKind::MissingRequiredArgument => {
            eprintln!("缺少必填参数。运行 easydo help 查看用法。");
            ExitCode::from(2)
        }
        ClapErrorKind::UnknownArgument => {
            eprintln!("未知参数。运行 easydo help 查看用法。");
            ExitCode::from(2)
        }
        _ => {
            let reason = error
                .to_string()
                .lines()
                .next()
                .unwrap_or("命令参数无效")
                .trim_start_matches("error: ")
                .to_string();
            eprintln!("{reason}。运行 easydo help 查看用法。");
            ExitCode::from(2)
        }
    }
}

fn run(cli: Cli) -> Result<()> {
    match cli.command {
        Commands::Help => {
            Cli::command()
                .print_help()
                .map_err(|error| EasyDoError::system(error.to_string()))?;
            println!();
            Ok(())
        }
        Commands::Skills { command } => run_skills(command),
        command => {
            let path = resolve_database_path(cli.database)?;
            let mut conn = open_database(&path)?;
            todo_service::purge_expired_inbox_todos_now(&mut conn)?;
            match command {
                Commands::List(args) => run_list(&conn, args),
                Commands::Add(args) => {
                    if args.groups.is_empty() {
                        return Err(EasyDoError::invalid("至少需要指定一个 Group"));
                    }
                    let mut group_ids = Vec::new();
                    for selector in args.groups {
                        let group = resolve_group(&conn, &selector)?;
                        if !group_ids.contains(&group.id) {
                            group_ids.push(group.id);
                        }
                    }
                    let todo = todo_service::create_todo(
                        &mut conn,
                        CreateTodoInput {
                            detail: args.detail,
                            group_ids,
                            tag_ids: Vec::new(),
                        },
                    )?;
                    print_todo(&todo, args.json)
                }
                Commands::Inbox { command } => match command {
                    InboxCommands::Add(args) => {
                        let todo = todo_service::create_inbox_todo(&mut conn, &args.detail)?;
                        print_todo(&todo, args.json)
                    }
                },
                Commands::Move(args) => {
                    let id = resolve_todo_id(&conn, &args.selector)?;
                    let group = resolve_group(&conn, &args.group)?;
                    let todo =
                        todo_service::move_todo_from_inbox(&mut conn, &id, &group.id)?;
                    print_todo(&todo, args.json)
                }
                Commands::Update(args) => {
                    let id = resolve_todo_id(&conn, &args.selector)?;
                    let todo = todo_service::update_todo_detail(&mut conn, &id, &args.detail)?;
                    print_todo(&todo, args.json)
                }
                Commands::Done(args) => {
                    let id = resolve_todo_id(&conn, &args.selector)?;
                    let todo = todo_service::complete_todo(&mut conn, &id)?;
                    print_todo(&todo, args.json)
                }
                Commands::Archive(args) => {
                    let id = resolve_todo_id(&conn, &args.selector)?;
                    let todo = todo_service::archive_todo(&mut conn, &id)?;
                    print_todo(&todo, args.json)
                }
                Commands::Help | Commands::Skills { .. } => unreachable!(),
            }
        }
    }
}

fn run_list(conn: &rusqlite::Connection, args: ListArgs) -> Result<()> {
    let statuses = parse_statuses(&args.status)?;
    let time_field = parse_time_field(&args.time_field)?;
    let time_range = parse_time_range(args.from.as_deref(), args.to.as_deref())?;
    let board_view_id = args
        .view
        .as_deref()
        .map(|selector| resolve_view(conn, selector).map(|view| view.id))
        .transpose()?;
    let group_id = args
        .group
        .as_deref()
        .map(|selector| resolve_group(conn, selector).map(|group| group.id))
        .transpose()?;
    let filter = TodoFilter {
        board_view_id,
        group_id,
        statuses,
        time_field,
        time_range,
    };
    let todos = todo_service::list_todos(conn, &filter)?;
    if args.json {
        println!("{}", serde_json::to_string_pretty(&todos)?);
    } else {
        print_todo_list(&todos);
    }
    Ok(())
}

fn run_skills(command: SkillCommands) -> Result<()> {
    let catalog = SkillCatalog::embedded()?;
    match command {
        SkillCommands::List { json } => {
            if json {
                println!("{}", serde_json::to_string_pretty(&catalog.skills)?);
            } else {
                for skill in catalog.skills {
                    println!("{} {} - {}", skill.name, skill.version, skill.description);
                }
            }
            Ok(())
        }
        SkillCommands::Install {
            selection,
            agent,
            json,
        } => {
            let agent = agent.ok_or_else(|| EasyDoError::invalid("需要指定 --agent"))?;
            let targets = parse_agent_targets(&agent)?;
            let home = env::var_os("EASYDO_HOME")
                .map(PathBuf::from)
                .or_else(dirs::home_dir)
                .ok_or_else(|| EasyDoError::system("无法确定用户目录"))?;
            let results = install_skills(&catalog, &selection, &targets, &home)?;
            print_skill_results(&results, json)?;
            let failures = results
                .iter()
                .filter(|result| result.status == "failed")
                .map(|result| format!("{}: {}", result.agent, result.message))
                .collect::<Vec<_>>();
            if !failures.is_empty() {
                return Err(EasyDoError::system(failures.join("; ")));
            }
            Ok(())
        }
    }
}

fn resolve_database_path(cli_path: Option<PathBuf>) -> Result<PathBuf> {
    if let Some(path) = cli_path {
        return Ok(path);
    }
    if let Some(path) = env::var_os("EASYDO_DB_PATH") {
        return Ok(PathBuf::from(path));
    }
    default_database_path()
}

fn parse_statuses(value: &str) -> Result<HashSet<TodoStatus>> {
    match value {
        "default" => Ok(HashSet::from([TodoStatus::Active, TodoStatus::Done])),
        "active" => Ok(HashSet::from([TodoStatus::Active])),
        "done" => Ok(HashSet::from([TodoStatus::Done])),
        "archived" => Ok(HashSet::from([TodoStatus::Archived])),
        "all" => Ok(HashSet::from([
            TodoStatus::Active,
            TodoStatus::Done,
            TodoStatus::Archived,
        ])),
        _ => Err(EasyDoError::invalid(format!(
            "无效状态: {value}，可选 active|done|archived|all"
        ))),
    }
}

fn parse_time_field(value: &str) -> Result<TimeField> {
    match value {
        "activity" => Ok(TimeField::Activity),
        "created" => Ok(TimeField::Created),
        "updated" => Ok(TimeField::Updated),
        "completed" => Ok(TimeField::Completed),
        "archived" => Ok(TimeField::Archived),
        _ => Err(EasyDoError::invalid(format!(
            "无效时间字段: {value}，可选 activity|created|updated|completed|archived"
        ))),
    }
}

fn parse_time_range(from: Option<&str>, to: Option<&str>) -> Result<Option<TimeRange>> {
    if from.is_none() && to.is_none() {
        return Ok(None);
    }
    let start = from.map(parse_start_date).transpose()?;
    let end_exclusive = to.map(parse_end_date).transpose()?;
    if let (Some(start), Some(end)) = (&start, &end_exclusive) {
        let start_value = chrono::DateTime::parse_from_rfc3339(start)
            .map_err(|_| EasyDoError::invalid("开始日期格式无效"))?;
        let end_value = chrono::DateTime::parse_from_rfc3339(end)
            .map_err(|_| EasyDoError::invalid("结束日期格式无效"))?;
        if start_value >= end_value {
            return Err(EasyDoError::invalid("开始日期不能晚于结束日期"));
        }
    }
    Ok(Some(TimeRange {
        start,
        end_exclusive,
    }))
}

fn parse_start_date(value: &str) -> Result<String> {
    local_midnight(parse_date(value)?)
}

fn parse_end_date(value: &str) -> Result<String> {
    let date = parse_date(value)?
        .succ_opt()
        .ok_or_else(|| EasyDoError::invalid("结束日期超出支持范围"))?;
    local_midnight(date)
}

fn parse_date(value: &str) -> Result<NaiveDate> {
    NaiveDate::parse_from_str(value, "%Y-%m-%d")
        .map_err(|_| EasyDoError::invalid(format!("日期格式无效: {value}，应为 YYYY-MM-DD")))
}

fn local_midnight(date: NaiveDate) -> Result<String> {
    let naive = date
        .and_hms_opt(0, 0, 0)
        .ok_or_else(|| EasyDoError::invalid("日期时间无效"))?;
    let local = Local
        .from_local_datetime(&naive)
        .earliest()
        .ok_or_else(|| EasyDoError::invalid("本地时区无法表示该日期"))?;
    Ok(local.to_rfc3339_opts(SecondsFormat::Millis, true))
}

fn parse_agent_targets(value: &str) -> Result<Vec<AgentTarget>> {
    match value {
        "agents" => Ok(vec![AgentTarget::Agents]),
        "codex" => Ok(vec![AgentTarget::Codex]),
        "claude" => Ok(vec![AgentTarget::Claude]),
        "all" => Ok(vec![
            AgentTarget::Agents,
            AgentTarget::Codex,
            AgentTarget::Claude,
        ]),
        _ => Err(EasyDoError::invalid(format!(
            "无效 Agent: {value}，可选 agents|codex|claude|all"
        ))),
    }
}

fn print_todo(todo: &TodoWithRelations, json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(todo)?);
    } else {
        println!("{}", todo_line(todo));
    }
    Ok(())
}

fn print_todo_list(todos: &[TodoWithRelations]) {
    if todos.is_empty() {
        println!("没有匹配的 Todo");
        return;
    }
    println!("ID       STATUS    GROUPS               DETAIL");
    for todo in todos {
        println!("{}", todo_line(todo));
    }
}

fn todo_line(todo: &TodoWithRelations) -> String {
    let id = todo.id.chars().take(8).collect::<String>();
    let groups = todo
        .groups
        .iter()
        .map(|group| group.name.as_str())
        .collect::<Vec<_>>()
        .join(",");
    let detail = truncate(
        &todo
            .detail
            .lines()
            .map(str::trim)
            .filter(|line| !line.is_empty())
            .collect::<Vec<_>>()
            .join(" / "),
        100,
    );
    format!("{id:<8} {:<9} {groups:<20} {detail}", todo.status)
}

fn truncate(value: &str, max_chars: usize) -> String {
    if value.chars().count() <= max_chars {
        return value.to_string();
    }
    let mut output = value
        .chars()
        .take(max_chars.saturating_sub(3))
        .collect::<String>();
    output.push_str("...");
    output
}

fn print_skill_results(results: &[SkillInstallResult], json: bool) -> Result<()> {
    if json {
        println!("{}", serde_json::to_string_pretty(results)?);
    } else {
        for result in results {
            println!("{} {}: {}", result.agent, result.skill, result.message);
        }
    }
    Ok(())
}

fn exit_code(kind: ErrorKind) -> u8 {
    match kind {
        ErrorKind::InvalidInput => 2,
        ErrorKind::NotFound | ErrorKind::Ambiguous => 3,
        ErrorKind::InvalidState => 4,
        ErrorKind::System => 5,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn end_date_is_exclusive_next_midnight() {
        let range = parse_time_range(Some("2026-06-01"), Some("2026-06-07"))
            .expect("parse range")
            .expect("range");
        assert!(range
            .start
            .expect("start")
            .starts_with("2026-06-01T00:00:00"));
        assert!(range
            .end_exclusive
            .expect("end")
            .starts_with("2026-06-08T00:00:00"));
    }

    #[test]
    fn inverted_range_is_rejected() {
        assert_eq!(
            parse_time_range(Some("2026-06-08"), Some("2026-06-07"))
                .expect_err("inverted range should fail")
                .message,
            "开始日期不能晚于结束日期"
        );
    }

    #[test]
    fn multiline_detail_is_rendered_on_one_line() {
        let todo = TodoWithRelations {
            id: "12345678-rest".to_string(),
            detail: "第一行\n第二行".to_string(),
            status: "active".to_string(),
            extra_text: None,
            created_at: String::new(),
            updated_at: String::new(),
            completed_at: None,
            archived_at: None,
            expires_at: None,
            deleted_at: None,
            delete_reason: None,
            groups: Vec::new(),
            group_sort_orders: Vec::new(),
            tags: Vec::new(),
        };
        assert!(todo_line(&todo).contains("第一行 / 第二行"));
    }

    #[test]
    fn explicit_database_path_wins() {
        env::set_var("EASYDO_DB_PATH", "/tmp/from-env.sqlite");
        assert_eq!(
            resolve_database_path(Some(PathBuf::from("/tmp/from-cli.sqlite")))
                .expect("resolve path"),
            std::path::Path::new("/tmp/from-cli.sqlite")
        );
        env::remove_var("EASYDO_DB_PATH");
    }
}
