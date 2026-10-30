//! 启动 Claude Code / Codex 的参数、提示词，以及解析它们的 JSON 事件流。
//! 只做纯计算，真正起进程的在 bot_runner。

use std::collections::HashSet;
use std::fs;
use std::io::{BufRead, BufReader};
use std::path::{Path, PathBuf};
use std::process::{Command, Stdio};
use std::sync::OnceLock;
use std::time::{Duration, Instant};

use rusqlite::{params, Connection, OpenFlags, OptionalExtension};
use serde::{Deserialize, Serialize};
use serde_json::Value;

use super::bot_service::{PreparedRun, RunKind, RunUsage};

/// 一次运行要执行的命令
#[derive(Debug, Clone, PartialEq)]
pub struct AgentCommand {
    pub program: String,
    pub args: Vec<String>,
    pub cwd: String,
    /// 通过标准输入传入，避免提示词以 - 开头时被当成参数
    pub stdin: String,
}

/// 从事件流里提取的、EasyDo 关心的东西
#[derive(Debug, Clone, PartialEq)]
pub enum AgentEvent {
    SessionId(String),
    FinalText(String),
    Usage(UsageSnapshot),
    Failed(String),
    /// 一次工具调用执行成功（Claude 的 tool_result 没有标错）；被拒绝或出错的不算
    ToolSucceeded,
}

#[derive(Debug, Clone, Default, PartialEq, Serialize, Deserialize)]
#[serde(rename_all = "camelCase")]
pub struct UsageSnapshot {
    pub input_tokens: i64,
    pub cached_input_tokens: i64,
    pub output_tokens: i64,
    pub cost_usd: Option<f64>,
}

pub fn session_title(todo_detail: &str) -> String {
    let headline = todo_detail
        .lines()
        .map(str::trim)
        .find(|line| !line.is_empty())
        .unwrap_or("Todo");
    let chars: Vec<char> = headline.chars().collect();
    let headline = if chars.len() > 40 {
        format!("{}…", chars[..40].iter().collect::<String>())
    } else {
        headline.to_string()
    };
    format!("EasyDo · {headline}")
}

/// 新会话的标题：派发时取 Todo 主句，小石头固定一个
pub fn run_title(run: &PreparedRun) -> String {
    match run.kind {
        RunKind::Todo => session_title(&run.todo_detail),
        RunKind::Steward => format!("EasyDo · {}", run.bot.name),
    }
}

/// 小石头每次运行附带的说明：此刻的看板摘要、能做什么、拿不准时怎么办
pub fn steward_brief(run: &PreparedRun) -> String {
    format!(
        "你是 EasyDo 的「{name}」，替用户维护 EasyDo 里已有的 Todo：查询、修改内容、标记优先级、完成、归档、移动分组、放进收件箱。\n\
         你只能执行 easydo 命令行（不熟悉时先跑 `easydo help` 或 `easydo <命令> --help`），不能读写文件，也不能执行其他命令。\n\n\
         本轮开始时的看板（每行：id 前 8 位｜分组｜最后更新｜标记与内容首句）：\n{board}\n\n\
         规则：\n\
         - 先在上面的看板里对上用户说的 Todo；需要完整内容、或要找更早完成和归档的，用 `easydo list --json`（可加 `--status all`）查。\n\
         - 写操作用完整 id 或唯一的 id 前缀。能唯一对上就直接执行；对上多条或拿不准时，把候选列出来问用户，不要动手。\n\
         - 不删除 Todo。新增或修改 Todo 内容时严格按下面的「Todo 内容写法」：第一行是 20 字以内的标题，只说这是什么事；\
           第二行可选，一句话说卡在哪或下一步；排查过程不写进任何一行，已完成的子项只留关键节点，写成短语。\n\
         - 用户说「改成……」「现在……」这类新进度时，是改写这条 Todo 的当前状态，不是往后追加：改写状态行，\
           被新进度取代的旧待办删掉或勾掉；拿不准旧待办还要不要时，先列出来问用户，不要原样留着。各行之间不写重复的内容。\n\
         - 多行内容用 ANSI-C 引号传给 --detail，确保真的换行，例如 `easydo update <id> --detail $'标题\\n状态\\n- [ ] 子项一'`。\n\
         - 多轮对话里看板以这一轮的摘要和查询结果为准，之前轮次的摘要可能已经过时。\n\n\
         回复（显示在一个小对话气泡里，要短）：\n\
         - 第一句直接说结果，用 Todo 的标题指代它；不主动报 id，只有需要用户区分是哪一条时才带上。不加粗，不用表情。\n\
         - 动了 Todo 时一行一条：「标题：做了什么」。不复述过程。\n\
         - 闲聊、误触、看不懂的输入，简短回一句就行，不要写「本轮没有改动任何 Todo」这类套话。\n\n\
         {rules}",
        name = run.bot.name,
        board = run.todo_detail,
        rules = super::skills::todo_writing_rules(),
    )
}

/// 每次运行都附带的说明：Todo 最新内容、回写规则、最终回复的要求
pub fn brief(run: &PreparedRun) -> String {
    format!(
        "你是 EasyDo 里的 Bot「{name}」，正在处理用户派发给你的一条 Todo。\n\
         Todo id：{id}\n\
         Todo 当前内容：\n{detail}\n\n\
         规则：\n\
         - 工作目录是 {cwd}，在这里完成任务。\n\
         - 确实需要更新这条 Todo 时（例如勾掉已完成的子项、补充进度），按 easydo Skill 的写法用 `easydo update {id} --detail \"…\"` 修改；不需要就不要动它。\n\
         - 不要完成或归档这条 Todo，那由用户决定。\n\
         - 你的最后一段回复会作为这次任务的结果交给用户：简洁说明做了什么、结果如何；需要用户决定的事单独列出来，讲清楚选项。",
        name = run.bot.name,
        id = run.todo_id,
        detail = run.todo_detail,
        cwd = run.cwd,
    )
}

fn user_request(run: &PreparedRun) -> String {
    if !run.instruction.is_empty() {
        run.instruction.clone()
    } else if run.resume_session_id.is_some() {
        "继续处理这条 Todo。".to_string()
    } else {
        "请处理这条 Todo。".to_string()
    }
}

pub fn build_command(run: &PreparedRun, program: &str, last_message_file: &Path) -> AgentCommand {
    if run.kind == RunKind::Steward {
        return steward_command(run, program);
    }
    let model = run.bot.model.trim();
    match run.bot.provider.as_str() {
        "codex" => {
            // Codex 没有附加系统提示的参数：说明拼在提示词里。新会话的标题取第一条提示词，所以第一行放标题
            let mut stdin = String::new();
            if run.resume_session_id.is_none() {
                stdin.push_str(&session_title(&run.todo_detail));
                stdin.push_str("\n\n");
            }
            stdin.push_str(&brief(run));
            stdin.push_str("\n\n用户的要求：\n");
            stdin.push_str(&user_request(run));

            let mut args = vec!["exec".to_string()];
            if run.resume_session_id.is_some() {
                args.push("resume".to_string());
            }
            args.extend(
                ["--json", "--dangerously-bypass-approvals-and-sandbox", "--skip-git-repo-check"]
                    .map(String::from),
            );
            if run.resume_session_id.is_none() {
                args.extend(["-C".to_string(), run.cwd.clone()]);
            }
            if !model.is_empty() {
                args.extend(["-m".to_string(), model.to_string()]);
            }
            args.extend(["-o".to_string(), last_message_file.display().to_string()]);
            if let Some(session_id) = &run.resume_session_id {
                args.push(session_id.clone());
            }
            args.push("-".to_string());
            AgentCommand { program: program.to_string(), args, cwd: run.cwd.clone(), stdin }
        }
        _ => {
            let mut args: Vec<String> = [
                "-p",
                "--output-format",
                "stream-json",
                "--verbose",
                "--permission-mode",
                "bypassPermissions",
            ]
            .map(String::from)
            .to_vec();
            if !model.is_empty() {
                args.extend(["--model".to_string(), model.to_string()]);
            }
            match &run.resume_session_id {
                Some(session_id) => args.extend(["--resume".to_string(), session_id.clone()]),
                None => args.extend(["-n".to_string(), session_title(&run.todo_detail)]),
            }
            args.extend(["--append-system-prompt".to_string(), brief(run)]);
            AgentCommand { program: program.to_string(), args, cwd: run.cwd.clone(), stdin: user_request(run) }
        }
    }
}

/// 小石头只接 Claude，并且只放行 easydo 命令：内置工具只开 Bash，没预先放行的一律拒绝，不加载 MCP
fn steward_command(run: &PreparedRun, program: &str) -> AgentCommand {
    let mut args: Vec<String> = [
        "-p",
        "--output-format",
        "stream-json",
        "--verbose",
        "--tools",
        "Bash",
        "--permission-mode",
        "dontAsk",
        "--allowedTools",
        "Bash(easydo *)",
        "--strict-mcp-config",
    ]
    .map(String::from)
    .to_vec();
    let model = run.bot.model.trim();
    if !model.is_empty() {
        args.extend(["--model".to_string(), model.to_string()]);
    }
    match &run.resume_session_id {
        Some(session_id) => args.extend(["--resume".to_string(), session_id.clone()]),
        None => args.extend(["-n".to_string(), run_title(run)]),
    }
    args.extend(["--append-system-prompt".to_string(), steward_brief(run)]);
    AgentCommand { program: program.to_string(), args, cwd: run.cwd.clone(), stdin: run.instruction.clone() }
}

pub fn parse_event(provider: &str, line: &str) -> Vec<AgentEvent> {
    let Ok(value) = serde_json::from_str::<Value>(line.trim()) else {
        return Vec::new();
    };
    let kind = value.get("type").and_then(Value::as_str).unwrap_or("");
    let mut events = Vec::new();
    if provider == "codex" {
        match kind {
            "thread.started" => {
                if let Some(id) = value.get("thread_id").and_then(Value::as_str) {
                    events.push(AgentEvent::SessionId(id.to_string()));
                }
            }
            "item.completed" => {
                let item = &value["item"];
                // item.type = error 只是警告（例如配置里有不认识的设置），不代表失败
                if item.get("type").and_then(Value::as_str) == Some("agent_message") {
                    if let Some(text) = item.get("text").and_then(Value::as_str) {
                        events.push(AgentEvent::FinalText(text.to_string()));
                    }
                }
            }
            "turn.completed" => {
                let usage = &value["usage"];
                events.push(AgentEvent::Usage(UsageSnapshot {
                    input_tokens: int(usage, "input_tokens"),
                    cached_input_tokens: int(usage, "cached_input_tokens"),
                    output_tokens: int(usage, "output_tokens"),
                    cost_usd: None,
                }));
            }
            "turn.failed" | "error" => {
                let message = value
                    .pointer("/error/message")
                    .or_else(|| value.get("message"))
                    .and_then(Value::as_str)
                    .unwrap_or("Codex 运行失败");
                events.push(AgentEvent::Failed(message.to_string()));
            }
            _ => {}
        }
        return events;
    }

    if let Some(id) = value.get("session_id").and_then(Value::as_str) {
        if kind == "system" || kind == "result" {
            events.push(AgentEvent::SessionId(id.to_string()));
        }
    }
    if kind == "user" {
        let results = value.pointer("/message/content").and_then(Value::as_array).into_iter().flatten();
        for block in results {
            let is_result = block.get("type").and_then(Value::as_str) == Some("tool_result");
            if is_result && !block.get("is_error").and_then(Value::as_bool).unwrap_or(false) {
                events.push(AgentEvent::ToolSucceeded);
            }
        }
    }
    if kind == "result" {
        let usage = &value["usage"];
        let cached = int(usage, "cache_read_input_tokens");
        events.push(AgentEvent::Usage(UsageSnapshot {
            input_tokens: int(usage, "input_tokens") + int(usage, "cache_creation_input_tokens") + cached,
            cached_input_tokens: cached,
            output_tokens: int(usage, "output_tokens"),
            cost_usd: value.get("total_cost_usd").and_then(Value::as_f64),
        }));
        let text = value.get("result").and_then(Value::as_str).unwrap_or("").to_string();
        if value.get("is_error").and_then(Value::as_bool).unwrap_or(false) {
            events.push(AgentEvent::Failed(if text.is_empty() { "Claude 运行失败".to_string() } else { text }));
        } else {
            events.push(AgentEvent::FinalText(text));
        }
    }
    events
}

fn int(value: &Value, key: &str) -> i64 {
    value.get(key).and_then(Value::as_i64).unwrap_or(0)
}

/// Codex 续会话时报的是整个会话的累计用量，本次用量要减去上次记下的累计值
pub fn usage_for_run(provider: &str, snapshot: &UsageSnapshot, previous_totals: Option<&str>) -> (RunUsage, Option<String>) {
    if provider != "codex" {
        return (
            RunUsage {
                input_tokens: snapshot.input_tokens,
                cached_input_tokens: snapshot.cached_input_tokens,
                output_tokens: snapshot.output_tokens,
                cost_usd: snapshot.cost_usd,
            },
            None,
        );
    }
    let previous = previous_totals
        .and_then(|text| serde_json::from_str::<UsageSnapshot>(text).ok())
        .filter(|previous| previous.input_tokens <= snapshot.input_tokens)
        .unwrap_or_default();
    (
        RunUsage {
            input_tokens: snapshot.input_tokens - previous.input_tokens,
            cached_input_tokens: (snapshot.cached_input_tokens - previous.cached_input_tokens).max(0),
            output_tokens: (snapshot.output_tokens - previous.output_tokens).max(0),
            cost_usd: None,
        },
        serde_json::to_string(snapshot).ok(),
    )
}

/// 读回会话在 AI 平台里的标题：用户在 Claude / Codex 里改过名时以那边为准
pub fn read_session_title(provider: &str, cwd: &str, session_id: &str) -> Option<String> {
    let home = dirs::home_dir()?;
    let title = if provider == "codex" {
        read_codex_title(&home, session_id)
    } else {
        read_claude_title(&home, cwd, session_id)
    }?;
    let line = title.lines().map(str::trim).find(|line| !line.is_empty())?.to_string();
    let chars: Vec<char> = line.chars().collect();
    Some(if chars.len() > 80 { chars[..80].iter().collect() } else { line })
}

/// Claude Code 把会话存在 ~/.claude/projects/<目录名里非字母数字换成 ->/<会话ID>.jsonl
pub fn claude_project_dir_name(cwd: &str) -> String {
    cwd.chars().map(|ch| if ch.is_ascii_alphanumeric() { ch } else { '-' }).collect()
}

fn read_claude_title(home: &Path, cwd: &str, session_id: &str) -> Option<String> {
    // Claude 按真实路径存会话，目录是符号链接（例如 /var → /private/var）时先解析
    let real_cwd = fs::canonicalize(cwd).map(|path| path.display().to_string()).unwrap_or_else(|_| cwd.to_string());
    let path = home
        .join(".claude/projects")
        .join(claude_project_dir_name(&real_cwd))
        .join(format!("{session_id}.jsonl"));
    let file = fs::File::open(path).ok()?;
    let mut title = None;
    for line in BufReader::new(file).lines().map_while(std::result::Result::ok) {
        if !line.contains("\"custom-title\"") {
            continue;
        }
        if let Ok(value) = serde_json::from_str::<Value>(&line) {
            if let Some(text) = value.get("customTitle").and_then(Value::as_str) {
                title = Some(text.to_string());
            }
        }
    }
    title
}

fn read_codex_title(home: &Path, session_id: &str) -> Option<String> {
    let index = home.join(".codex/session_index.jsonl");
    if let Ok(content) = fs::read_to_string(index) {
        let named = content
            .lines()
            .filter(|line| line.contains(session_id))
            .filter_map(|line| serde_json::from_str::<Value>(line).ok())
            .filter(|value| value.get("id").and_then(Value::as_str) == Some(session_id))
            .filter_map(|value| value.get("thread_name").and_then(Value::as_str).map(str::to_string))
            .last();
        if named.is_some() {
            return named;
        }
    }
    // Codex 的内部库：只读打开，表结构变了就当拿不到
    let conn = Connection::open_with_flags(home.join(".codex/state_5.sqlite"), OpenFlags::SQLITE_OPEN_READ_ONLY).ok()?;
    conn.query_row(
        "SELECT COALESCE(NULLIF(name, ''), title) FROM threads WHERE id = ?1",
        params![session_id],
        |row| row.get::<_, Option<String>>(0),
    )
    .optional()
    .ok()
    .flatten()
    .flatten()
}

/// 从 Finder 启动的 App 拿不到终端里的 PATH（nvm 装的 claude / codex 都在那里），读一次登录 shell 的 PATH
pub fn login_path() -> &'static str {
    static PATH: OnceLock<String> = OnceLock::new();
    PATH.get_or_init(|| {
        let mut dirs: Vec<String> = Vec::new();
        if let Some(path) = shell_path() {
            dirs.extend(path.split(':').map(str::to_string));
        }
        if let Ok(path) = std::env::var("PATH") {
            dirs.extend(path.split(':').map(str::to_string));
        }
        if let Some(home) = dirs::home_dir() {
            for extra in [".local/bin", ".claude/local", ".npm-global/bin", ".bun/bin"] {
                dirs.push(home.join(extra).display().to_string());
            }
        }
        dirs.extend(["/opt/homebrew/bin", "/usr/local/bin", "/usr/bin", "/bin"].map(String::from));
        let mut seen = HashSet::new();
        dirs.retain(|dir| !dir.is_empty() && seen.insert(dir.clone()));
        dirs.join(":")
    })
}

fn shell_path() -> Option<String> {
    const MARKER: &str = "__EASYDO_PATH__";
    let shell = std::env::var("SHELL").unwrap_or_else(|_| "/bin/zsh".to_string());
    let mut child = Command::new(shell)
        .args(["-ilc", &format!("printf '{MARKER}%s' \"$PATH\"")])
        .stdin(Stdio::null())
        .stdout(Stdio::piped())
        .stderr(Stdio::null())
        .spawn()
        .ok()?;
    // shell 配置里有交互提示时可能卡住，最多等 5 秒
    let deadline = Instant::now() + Duration::from_secs(5);
    loop {
        match child.try_wait() {
            Ok(Some(_)) => break,
            Ok(None) if Instant::now() < deadline => std::thread::sleep(Duration::from_millis(50)),
            _ => {
                let _ = child.kill();
                return None;
            }
        }
    }
    let mut output = String::new();
    std::io::Read::read_to_string(&mut child.stdout.take()?, &mut output).ok()?;
    output.rsplit(MARKER).next().map(|path| path.trim().to_string())
}

/// 单引号包起来给 shell 用，内容里的单引号转义掉
fn shell_quote(value: &str) -> String {
    format!("'{}'", value.replace('\'', "'\\''"))
}

/// 宿主 Claude Code 会话塞给子进程的环境变量（zsh 的 unset -m 模式）。
/// EasyDo 如果是从某个 Claude Code 会话里启动的，会继承这些变量；再传给 Bot 或终端里的 claude，
/// 它会以为自己是别的会话的子进程——例如 CLAUDE_CODE_CHILD_SESSION 会让它不保存对话记录
const HOST_SESSION_MARKERS: [&str; 6] = [
    "CLAUDECODE",
    "CLAUDE_CODE_*",
    "CLAUDE_AGENT_SDK_*",
    "CLAUDE_PID",
    "CLAUDE_EFFORT",
    "CLAUDE_PREVIEW_CLASSIFIER_FLOOR",
];

pub fn is_host_session_marker(name: &str) -> bool {
    HOST_SESSION_MARKERS.iter().any(|pattern| match pattern.strip_suffix('*') {
        Some(prefix) => name.starts_with(prefix),
        None => name == *pattern,
    })
}

/// 当前进程环境里的宿主会话标记，起子进程前逐个去掉
pub fn host_session_markers() -> Vec<String> {
    std::env::vars().map(|(name, _)| name).filter(|name| is_host_session_marker(name)).collect()
}

/// 在终端里接着 Bot 会话的脚本：进入工作目录，用 resume 打开同一个会话。
/// 先在不读配置的 zsh 里清掉宿主会话标记，再换成交互式登录 shell 执行——这样拿得到终端里的 PATH
/// （nvm 装的 claude / codex 在那里），用户自己在配置里设的变量也照常生效
pub fn resume_script(provider: &str, cwd: &str, session_id: &str) -> String {
    let resume = if provider == "codex" {
        format!("codex resume {}", shell_quote(session_id))
    } else {
        format!("claude --resume {}", shell_quote(session_id))
    };
    let markers = HOST_SESSION_MARKERS.map(shell_quote).join(" ");
    format!(
        "#!/bin/zsh -f\nunset -m {markers}\ncd {} || exit 1\nexec /bin/zsh -ilc {}\n",
        shell_quote(cwd),
        shell_quote(&resume)
    )
}

pub fn find_program(name: &str, path: &str) -> Option<PathBuf> {
    path.split(':')
        .map(|dir| Path::new(dir).join(name))
        .find(|candidate| candidate.is_file())
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::bot_service::{Bot, BotUsage};

    fn run(provider: &str, resume: Option<&str>, instruction: &str) -> PreparedRun {
        PreparedRun {
            kind: RunKind::Todo,
            run_id: "run-1".to_string(),
            session_ref: "ref-1".to_string(),
            todo_id: "todo-1".to_string(),
            todo_detail: "整理周报\n- [ ] 汇总工时".to_string(),
            bot: Bot {
                id: "bot-1".to_string(),
                name: "周报助手".to_string(),
                color: "teal".to_string(),
                provider: provider.to_string(),
                model: "sonnet".to_string(),
                directory: "/work".to_string(),
                created_at: String::new(),
                updated_at: String::new(),
                usage: BotUsage { runs: 0, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, cost_usd: 0.0 },
            },
            cwd: "/work".to_string(),
            resume_session_id: resume.map(str::to_string),
            usage_totals: None,
            instruction: instruction.to_string(),
        }
    }

    #[test]
    fn builds_claude_commands_for_new_and_resumed_sessions() {
        let fresh = build_command(&run("claude", None, ""), "claude", Path::new("/tmp/out.txt"));
        assert_eq!(&fresh.args[..6], ["-p", "--output-format", "stream-json", "--verbose", "--permission-mode", "bypassPermissions"]);
        assert!(fresh.args.windows(2).any(|pair| pair == ["-n", "EasyDo · 整理周报"]));
        assert!(fresh.args.windows(2).any(|pair| pair == ["--model", "sonnet"]));
        assert_eq!(fresh.stdin, "请处理这条 Todo。");

        let resumed = build_command(&run("claude", Some("sess-1"), "- [ ] 再补一项"), "claude", Path::new("/tmp/out.txt"));
        assert!(resumed.args.windows(2).any(|pair| pair == ["--resume", "sess-1"]));
        assert!(!resumed.args.contains(&"-n".to_string()));
        assert_eq!(resumed.stdin, "- [ ] 再补一项");
    }

    #[test]
    fn steward_commands_only_allow_easydo_and_carry_the_board() {
        let mut steward = run("codex", None, "把两条归档");
        steward.kind = RunKind::Steward;
        steward.bot.name = "小石头".to_string();
        steward.bot.model = String::new();
        steward.todo_detail = "进行中（1 条）：\n- 1a2b3c4d｜工作｜更新于10-29 17:42｜门店质检".to_string();

        // 小石头固定走 Claude，不受 Bot 的 AI 设置影响
        let fresh = build_command(&steward, "claude", Path::new("/tmp/out.txt"));
        assert!(fresh.args.windows(2).any(|pair| pair == ["--tools", "Bash"]));
        assert!(fresh.args.windows(2).any(|pair| pair == ["--permission-mode", "dontAsk"]));
        assert!(fresh.args.windows(2).any(|pair| pair == ["--allowedTools", "Bash(easydo *)"]));
        assert!(!fresh.args.contains(&"bypassPermissions".to_string()));
        assert!(!fresh.args.contains(&"--model".to_string()));
        assert!(fresh.args.windows(2).any(|pair| pair == ["-n", "EasyDo · 小石头"]));
        let brief = fresh.args.last().expect("brief");
        assert!(brief.contains("1a2b3c4d｜工作"));
        // 写法规则直接带在提示词里：小石头加载不了 Skill
        assert!(brief.contains("## Todo 内容写法"));
        assert!(brief.contains("标题行（第一行）"));
        assert!(!brief.contains("## 错误"));
        // 不再要求把过程拆进子项，也不再要求没改动时说明原因（会变成每句都带的套话）
        assert!(!brief.contains("过程和细节拆成"));
        assert!(brief.contains("不是往后追加"));
        assert!(brief.contains("不要写「本轮没有改动任何 Todo」"));
        assert_eq!(fresh.stdin, "把两条归档");

        steward.resume_session_id = Some("sess-9".to_string());
        let resumed = build_command(&steward, "claude", Path::new("/tmp/out.txt"));
        assert!(resumed.args.windows(2).any(|pair| pair == ["--resume", "sess-9"]));
        assert!(!resumed.args.contains(&"-n".to_string()));
    }

    #[test]
    fn builds_codex_commands_with_title_first_and_resume_by_id() {
        let fresh = build_command(&run("codex", None, "先看看"), "codex", Path::new("/tmp/out.txt"));
        assert_eq!(fresh.args[0], "exec");
        assert!(fresh.args.windows(2).any(|pair| pair == ["-C", "/work"]));
        assert_eq!(fresh.args.last().map(String::as_str), Some("-"));
        assert!(fresh.stdin.starts_with("EasyDo · 整理周报\n\n你是 EasyDo 里的 Bot「周报助手」"));
        assert!(fresh.stdin.ends_with("用户的要求：\n先看看"));

        let resumed = build_command(&run("codex", Some("thread-1"), ""), "codex", Path::new("/tmp/out.txt"));
        assert_eq!(&resumed.args[..2], ["exec", "resume"]);
        assert!(!resumed.args.contains(&"-C".to_string()));
        assert_eq!(&resumed.args[resumed.args.len() - 2..], ["thread-1", "-"]);
        assert!(!resumed.stdin.starts_with("EasyDo ·"));
    }

    #[test]
    fn parses_codex_events_and_ignores_warning_items() {
        let lines = [
            r#"{"type":"thread.started","thread_id":"01a1"}"#,
            r#"{"type":"item.completed","item":{"id":"item_0","type":"error","message":"Codex is ignoring 1 unrecognized configuration setting."}}"#,
            r#"{"type":"item.completed","item":{"id":"item_2","type":"agent_message","text":"好"}}"#,
            r#"{"type":"turn.completed","usage":{"input_tokens":41381,"cached_input_tokens":33664,"output_tokens":10}}"#,
        ];
        let events: Vec<AgentEvent> = lines.iter().flat_map(|line| parse_event("codex", line)).collect();
        assert_eq!(
            events,
            vec![
                AgentEvent::SessionId("01a1".to_string()),
                AgentEvent::FinalText("好".to_string()),
                AgentEvent::Usage(UsageSnapshot { input_tokens: 41381, cached_input_tokens: 33664, output_tokens: 10, cost_usd: None }),
            ]
        );
    }

    #[test]
    fn parses_claude_result_events() {
        let init = r#"{"type":"system","subtype":"init","session_id":"s-1"}"#;
        let result = r#"{"type":"result","subtype":"success","is_error":false,"result":"做完了","session_id":"s-1","total_cost_usd":0.02,"usage":{"input_tokens":10,"cache_creation_input_tokens":20,"cache_read_input_tokens":300,"output_tokens":5}}"#;
        assert_eq!(parse_event("claude", init), vec![AgentEvent::SessionId("s-1".to_string())]);
        assert_eq!(
            parse_event("claude", result),
            vec![
                AgentEvent::SessionId("s-1".to_string()),
                AgentEvent::Usage(UsageSnapshot { input_tokens: 330, cached_input_tokens: 300, output_tokens: 5, cost_usd: Some(0.02) }),
                AgentEvent::FinalText("做完了".to_string()),
            ]
        );
        let failed = r#"{"type":"result","is_error":true,"result":"额度不足","usage":{}}"#;
        assert_eq!(parse_event("claude", failed).last(), Some(&AgentEvent::Failed("额度不足".to_string())));
    }

    #[test]
    fn counts_only_tool_results_that_succeeded() {
        let ran = r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t1","content":"已归档"}]}}"#;
        let denied = r#"{"type":"user","message":{"content":[{"type":"tool_result","tool_use_id":"t2","is_error":true,"content":"Permission denied"}]}}"#;
        let typed = r#"{"type":"user","message":{"content":"把两条归档"}}"#;
        assert_eq!(parse_event("claude", ran), vec![AgentEvent::ToolSucceeded]);
        assert!(parse_event("claude", denied).is_empty());
        assert!(parse_event("claude", typed).is_empty());
    }

    #[test]
    fn codex_usage_is_the_difference_from_the_last_cumulative_total() {
        let first = UsageSnapshot { input_tokens: 20682, cached_input_tokens: 13184, output_tokens: 5, cost_usd: None };
        let (usage, totals) = usage_for_run("codex", &first, None);
        assert_eq!(usage.input_tokens, 20682);

        let second = UsageSnapshot { input_tokens: 41381, cached_input_tokens: 33664, output_tokens: 10, cost_usd: None };
        let (usage, _) = usage_for_run("codex", &second, totals.as_deref());
        assert_eq!((usage.input_tokens, usage.cached_input_tokens, usage.output_tokens), (20699, 20480, 5));
    }

    #[test]
    fn claude_project_dir_replaces_non_alphanumerics() {
        assert_eq!(
            claude_project_dir_name("/Users/me/IdeaProjects/esaydo"),
            "-Users-me-IdeaProjects-esaydo"
        );
    }

    #[test]
    fn resume_scripts_clear_host_markers_then_resume_in_a_login_shell() {
        let script = resume_script("claude", "/work/my repo", "s-1");
        let lines: Vec<&str> = script.lines().collect();
        assert_eq!(lines[0], "#!/bin/zsh -f");
        assert!(lines[1].starts_with("unset -m 'CLAUDECODE' 'CLAUDE_CODE_*'"));
        assert_eq!(lines[2], "cd '/work/my repo' || exit 1");
        assert_eq!(lines[3], r"exec /bin/zsh -ilc 'claude --resume '\''s-1'\'''");

        let codex = resume_script("codex", "/it's/here", "t-1");
        assert!(codex.contains(r"cd '/it'\''s/here' || exit 1"));
        assert!(codex.contains("codex resume"));
    }

    #[test]
    fn recognises_host_session_markers_only() {
        for name in ["CLAUDECODE", "CLAUDE_CODE_CHILD_SESSION", "CLAUDE_CODE_ENTRYPOINT", "CLAUDE_AGENT_SDK_VERSION", "CLAUDE_PID"] {
            assert!(is_host_session_marker(name), "{name}");
        }
        for name in ["ANTHROPIC_BASE_URL", "CLAUDE_CONFIG_DIR", "PATH", "CODEX_HOME"] {
            assert!(!is_host_session_marker(name), "{name}");
        }
    }

    #[test]
    fn titles_use_the_first_non_empty_line() {
        assert_eq!(session_title("\n  修复登录问题  \n- [ ] 子项"), "EasyDo · 修复登录问题");
    }
}
