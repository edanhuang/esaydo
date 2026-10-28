//! 启动 Claude Code / Codex 并跟踪到结束，把结果写回数据库并通知前端。
//!
//! Bot 进程不依附于 EasyDo：输出写进文件，EasyDo 一边写一边读。EasyDo 退出后 Bot 照常跑完；
//! 下次启动时按记下的 pid 判断——还在跑就接着读，已经结束就读完文件同步结果，没有结束事件才算中断。

use std::collections::HashMap;
use std::fs::{self, File};
use std::io::{Read, Write};
use std::os::unix::process::CommandExt;
use std::path::{Path, PathBuf};
use std::process::{Child, Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};
use tauri_plugin_notification::NotificationExt;

use crate::core::bot_agent::{self, AgentEvent, UsageSnapshot};
use crate::core::bot_service::{self, FinishedRun, PreparedRun, RecoverableRun, RunUsage};
use crate::AppState;

pub const RUNS_CHANGED_EVENT: &str = "bot-runs-changed";
const STDERR_TAIL_CHARS: usize = 1200;
const POLL_INTERVAL: Duration = Duration::from_millis(200);

/// 正在运行的进程：pid 也是它的进程组号，停止时整组结束，连同它起的命令一起
#[derive(Clone)]
pub struct RunHandle {
    pid: u32,
    stopping: Arc<AtomicBool>,
}

#[derive(Default)]
pub struct RunRegistry {
    runs: Mutex<HashMap<String, RunHandle>>,
}

impl RunRegistry {
    fn insert(&self, run_id: &str, handle: RunHandle) {
        if let Ok(mut runs) = self.runs.lock() {
            runs.insert(run_id.to_string(), handle);
        }
    }

    fn remove(&self, run_id: &str) {
        if let Ok(mut runs) = self.runs.lock() {
            runs.remove(run_id);
        }
    }

    /// 找不到进程（例如进程刚好已经退出）时返回 false
    pub fn stop(&self, run_id: &str) -> bool {
        let handle = self.runs.lock().ok().and_then(|runs| runs.get(run_id).cloned());
        match handle {
            Some(handle) => {
                handle.stopping.store(true, Ordering::SeqCst);
                kill_group(handle.pid);
                true
            }
            None => false,
        }
    }
}

fn kill_group(pid: u32) {
    let _ = Command::new("kill").args(["-TERM", &format!("-{pid}")]).status();
    // 给它 3 秒收尾，还没退就强制结束
    thread::spawn(move || {
        thread::sleep(Duration::from_secs(3));
        let _ = Command::new("kill").args(["-KILL", &format!("-{pid}")]).status();
    });
}

pub fn notify_changed(app: &AppHandle) {
    let _ = app.emit(RUNS_CHANGED_EVENT, ());
}

/// 一次运行落在磁盘上的文件：事件流、错误输出、Codex 的最终回复
struct RunFiles {
    output: PathBuf,
    stderr: PathBuf,
    last_message: PathBuf,
}

impl RunFiles {
    fn new(runs_dir: &Path, run_id: &str) -> Self {
        Self::from_output(runs_dir.join(format!("{run_id}.jsonl")))
    }

    fn from_output(output: PathBuf) -> Self {
        Self {
            stderr: output.with_extension("stderr"),
            last_message: output.with_extension("last.txt"),
            output,
        }
    }

    fn remove(&self) {
        for path in [&self.output, &self.stderr, &self.last_message] {
            let _ = fs::remove_file(path);
        }
    }
}

/// 进程启动时间：和 pid 一起判断「还是不是当初那个进程」，防止 pid 被别的程序复用
fn process_started(pid: u32) -> Option<String> {
    let output = Command::new("ps").args(["-o", "lstart=", "-p", &pid.to_string()]).output().ok()?;
    let text = String::from_utf8_lossy(&output.stdout).trim().to_string();
    (!text.is_empty()).then_some(text)
}

fn same_process_alive(pid: u32, started: Option<&str>) -> bool {
    match (process_started(pid), started) {
        (Some(now), Some(recorded)) => now == recorded,
        (Some(_), None) => true,
        (None, _) => false,
    }
}

pub fn start(app: AppHandle, run: PreparedRun) {
    thread::spawn(move || {
        let finished = execute(&app, &run);
        save_finished(&app, &finished);
    });
}

/// App 启动时：接回还在后台跑的 Bot，或者把已经跑完的结果同步进来
pub fn recover(app: AppHandle) {
    let runs = {
        let state = app.state::<AppState>();
        let conn = state.conn.lock();
        conn.ok().and_then(|conn| bot_service::list_recoverable_runs(&conn).ok()).unwrap_or_default()
    };
    for recoverable in runs {
        let app = app.clone();
        thread::spawn(move || {
            let finished = reattach(&app, &recoverable);
            save_finished(&app, &finished);
        });
    }
}

fn save_finished(app: &AppHandle, finished: &FinishedRun) {
    let state = app.state::<AppState>();
    let notice = match state.conn.lock() {
        Ok(mut conn) => {
            let _ = bot_service::finish_run(&mut conn, finished);
            bot_service::run_notice(&conn, finished).ok().flatten()
        }
        Err(_) => None,
    };
    notify_changed(app);
    if let Some(notice) = notice {
        send_notice(app, &notice);
    }
}

/// 用户正看着 EasyDo 时不弹系统通知，信封和未读数已经够了；在别的 App 里或窗口藏起来时才发
fn send_notice(app: &AppHandle, notice: &bot_service::RunNotice) {
    let focused = app.webview_windows().values().any(|window| window.is_focused().unwrap_or(false));
    if focused {
        return;
    }
    let _ = app.notification().builder().title(&notice.title).body(&notice.body).show();
}

fn closed(run: &PreparedRun, status: &str, error: Option<String>) -> FinishedRun {
    FinishedRun {
        run_id: run.run_id.clone(),
        session_ref: run.session_ref.clone(),
        status: status.to_string(),
        usage: RunUsage::default(),
        error,
        final_text: None,
        session_id: None,
        title: None,
        usage_totals: None,
    }
}

fn program_name(provider: &str) -> &'static str {
    if provider == "codex" {
        "codex"
    } else {
        "claude"
    }
}

fn execute(app: &AppHandle, run: &PreparedRun) -> FinishedRun {
    let state = app.state::<AppState>();
    let files = RunFiles::new(&state.runs_dir, &run.run_id);
    let mut child = match spawn_agent(run, bot_agent::login_path(), &files) {
        Ok(child) => child,
        Err(error) => return closed(run, "failed", Some(error)),
    };
    let pid = child.id();
    if let Ok(conn) = state.conn.lock() {
        let started = process_started(pid);
        let _ = bot_service::record_process(&conn, &run.run_id, pid, started.as_deref(), &files.output.display().to_string());
    }
    let stopping = Arc::new(AtomicBool::new(false));
    state.runs.insert(&run.run_id, RunHandle { pid, stopping: stopping.clone() });
    notify_changed(app);

    let (outcome, exit) = follow_output(
        &run.bot.provider,
        &files.output,
        || match child.try_wait() {
            Ok(Some(status)) => Liveness::Exited(Some(status.success())),
            Ok(None) => Liveness::Running,
            Err(_) => Liveness::Exited(None),
        },
        |session_id| record_session_id(app, run, session_id),
    );
    state.runs.remove(&run.run_id);
    let finished = conclude(run, &files, outcome, exit, stopping.load(Ordering::SeqCst));
    files.remove();
    finished
}

fn reattach(app: &AppHandle, recoverable: &RecoverableRun) -> FinishedRun {
    let run = &recoverable.run;
    let Some(output) = recoverable.output_path.as_deref() else {
        // 进程还没起来 EasyDo 就退出了
        return closed(run, "interrupted", None);
    };
    let files = RunFiles::from_output(PathBuf::from(output));
    let started = recoverable.process_started.as_deref();
    let alive_pid = recoverable.pid.filter(|pid| same_process_alive(*pid, started));
    let state = app.state::<AppState>();
    let stopping = Arc::new(AtomicBool::new(false));
    if let Some(pid) = alive_pid {
        state.runs.insert(&run.run_id, RunHandle { pid, stopping: stopping.clone() });
        notify_changed(app);
    }

    // 不是 EasyDo 自己的子进程，拿不到退出码，成败只看事件流
    let (outcome, exit) = follow_output(
        &run.bot.provider,
        &files.output,
        || match alive_pid {
            Some(pid) if same_process_alive(pid, started) => Liveness::Running,
            _ => Liveness::Exited(None),
        },
        |session_id| record_session_id(app, run, session_id),
    );
    state.runs.remove(&run.run_id);
    let finished = conclude(run, &files, outcome, exit, stopping.load(Ordering::SeqCst));
    files.remove();
    finished
}

fn record_session_id(app: &AppHandle, run: &PreparedRun, session_id: &str) {
    let state = app.state::<AppState>();
    if let Ok(conn) = state.conn.lock() {
        let _ = bot_service::record_session_id(&conn, &run.session_ref, session_id);
    };
}

/// 起进程：输出直接写文件，不经过 EasyDo，EasyDo 退出也不影响它
fn spawn_agent(run: &PreparedRun, path: &str, files: &RunFiles) -> Result<Child, String> {
    let program_name = program_name(&run.bot.provider);
    let Some(program) = bot_agent::find_program(program_name, path) else {
        return Err(format!("找不到 {program_name} 命令，请确认已经安装并能在终端里运行"));
    };
    if let Some(dir) = files.output.parent() {
        fs::create_dir_all(dir).map_err(|error| format!("创建运行目录失败：{error}"))?;
    }
    let stdout = File::create(&files.output).map_err(|error| format!("创建输出文件失败：{error}"))?;
    let stderr = File::create(&files.stderr).map_err(|error| format!("创建输出文件失败：{error}"))?;
    let command = bot_agent::build_command(run, &program.display().to_string(), &files.last_message);

    let mut process = Command::new(&command.program);
    // EasyDo 若是从某个 Claude Code 会话里启动的，别把那个会话的标记传给 Bot
    for name in bot_agent::host_session_markers() {
        process.env_remove(name);
    }
    let mut child = process
        .args(&command.args)
        .current_dir(&command.cwd)
        .env("PATH", path)
        // 跳过 EasyDo 自己的后台同步 hook，免得把 Bot 的会话再同步成 Todo
        .env("EASYDO_SYNC_WORKER", "1")
        .stdin(Stdio::piped())
        .stdout(stdout)
        .stderr(stderr)
        .process_group(0)
        .spawn()
        .map_err(|error| format!("启动 {program_name} 失败：{error}"))?;
    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(command.stdin.as_bytes());
    }
    Ok(child)
}

#[derive(Debug, Clone, Copy, PartialEq)]
enum Liveness {
    Running,
    /// 进程已经结束；是自己的子进程时带上是否成功
    Exited(Option<bool>),
}

#[derive(Debug, Default, Clone, PartialEq)]
struct Outcome {
    session_id: Option<String>,
    final_text: Option<String>,
    usage: Option<UsageSnapshot>,
    failure: Option<String>,
}

impl Outcome {
    /// 看到了结束事件（Claude 的结果事件、Codex 的回合结束或失败）
    fn ended(&self) -> bool {
        self.usage.is_some() || self.failure.is_some()
    }
}

/// 跟着输出文件读事件，直到进程结束、文件读完
fn follow_output(
    provider: &str,
    output: &Path,
    mut liveness: impl FnMut() -> Liveness,
    mut on_session_id: impl FnMut(&str),
) -> (Outcome, Option<bool>) {
    let mut outcome = Outcome::default();
    let mut file: Option<File> = None;
    let mut pending: Vec<u8> = Vec::new();
    let mut chunk = [0u8; 16 * 1024];

    let mut handle_line = |line: &[u8], outcome: &mut Outcome| {
        let text = String::from_utf8_lossy(line);
        for event in bot_agent::parse_event(provider, &text) {
            match event {
                AgentEvent::SessionId(id) => {
                    if outcome.session_id.as_deref() != Some(id.as_str()) {
                        on_session_id(&id);
                        outcome.session_id = Some(id);
                    }
                }
                AgentEvent::FinalText(text) => outcome.final_text = Some(text),
                AgentEvent::Usage(snapshot) => outcome.usage = Some(snapshot),
                AgentEvent::Failed(message) => outcome.failure = Some(message),
            }
        }
    };

    loop {
        // 先判断进程状态再读：读到文件末尾且进程早已结束，才算真正读完
        let state = liveness();
        if file.is_none() {
            file = File::open(output).ok();
        }
        let mut read_any = false;
        if let Some(file) = file.as_mut() {
            while let Ok(count) = file.read(&mut chunk) {
                if count == 0 {
                    break;
                }
                read_any = true;
                pending.extend_from_slice(&chunk[..count]);
                while let Some(newline) = pending.iter().position(|byte| *byte == b'\n') {
                    let line: Vec<u8> = pending.drain(..=newline).collect();
                    handle_line(&line, &mut outcome);
                }
            }
        }
        if let Liveness::Exited(success) = state {
            if !read_any {
                if !pending.is_empty() {
                    let line = std::mem::take(&mut pending);
                    handle_line(&line, &mut outcome);
                }
                return (outcome, success);
            }
            continue;
        }
        if !read_any {
            thread::sleep(POLL_INTERVAL);
        }
    }
}

fn stderr_tail(path: &Path) -> String {
    let text = fs::read_to_string(path).unwrap_or_default();
    let chars: Vec<char> = text.trim().chars().collect();
    chars[chars.len().saturating_sub(STDERR_TAIL_CHARS)..].iter().collect()
}

/// 根据事件流和退出情况得出这次运行的结果
fn conclude(run: &PreparedRun, files: &RunFiles, mut outcome: Outcome, exit: Option<bool>, stopping: bool) -> FinishedRun {
    let provider = run.bot.provider.as_str();
    if let Ok(text) = fs::read_to_string(&files.last_message) {
        if !text.trim().is_empty() {
            outcome.final_text = Some(text);
        }
    }
    let (usage, usage_totals) = match &outcome.usage {
        Some(snapshot) => bot_agent::usage_for_run(provider, snapshot, run.usage_totals.as_deref()),
        None => (RunUsage::default(), None),
    };
    let session_id = outcome.session_id.clone().or_else(|| run.resume_session_id.clone());
    let title = session_id
        .as_deref()
        .and_then(|id| bot_agent::read_session_title(provider, &run.cwd, id))
        .or_else(|| run.resume_session_id.is_none().then(|| bot_agent::session_title(&run.todo_detail)));

    let (status, error) = if stopping {
        ("stopped", None)
    } else if let Some(failure) = outcome.failure.clone() {
        ("failed", Some(failure))
    } else if exit == Some(false) {
        let stderr = stderr_tail(&files.stderr);
        let error = if stderr.is_empty() { format!("{} 异常退出", program_name(provider)) } else { stderr };
        ("failed", Some(error))
    } else if outcome.ended() || exit == Some(true) {
        ("completed", None)
    } else {
        // 进程已经不在，输出里也没有结束事件：中途被结束了
        ("interrupted", None)
    };

    FinishedRun {
        run_id: run.run_id.clone(),
        session_ref: run.session_ref.clone(),
        status: status.to_string(),
        usage,
        error,
        final_text: outcome.final_text,
        session_id,
        title,
        usage_totals,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::core::bot_service::{Bot, BotUsage};

    fn prepared(provider: &str, model: &str, cwd: &str, resume: Option<String>, instruction: &str) -> PreparedRun {
        PreparedRun {
            run_id: format!("test-{provider}-{}", resume.is_some()),
            session_ref: "ref".to_string(),
            todo_id: "todo-test".to_string(),
            todo_detail: "EasyDo 连通性测试".to_string(),
            bot: Bot {
                id: "bot".to_string(),
                name: "测试 Bot".to_string(),
                color: "teal".to_string(),
                provider: provider.to_string(),
                model: model.to_string(),
                directory: cwd.to_string(),
                created_at: String::new(),
                updated_at: String::new(),
                usage: BotUsage { runs: 0, input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, cost_usd: 0.0 },
            },
            cwd: cwd.to_string(),
            resume_session_id: resume,
            usage_totals: None,
            instruction: instruction.to_string(),
        }
    }

    const CLAUDE_RESULT: &str = r#"{"type":"result","is_error":false,"result":"做完了","session_id":"s-1","usage":{"input_tokens":10,"output_tokens":5}}"#;

    #[test]
    fn follows_output_until_the_process_exits_including_a_trailing_partial_line() {
        let dir = tempfile::tempdir().expect("tempdir");
        let output = dir.path().join("run.jsonl");
        fs::write(&output, format!("{{\"type\":\"system\",\"session_id\":\"s-1\"}}\n{CLAUDE_RESULT}")).expect("write");

        let mut sessions = Vec::new();
        let (outcome, exit) = follow_output("claude", &output, || Liveness::Exited(Some(true)), |id| sessions.push(id.to_string()));
        assert_eq!(sessions, ["s-1"]);
        assert_eq!(outcome.final_text.as_deref(), Some("做完了"));
        assert!(outcome.ended());
        assert_eq!(exit, Some(true));
    }

    #[test]
    fn keeps_reading_while_the_process_is_still_writing() {
        let dir = tempfile::tempdir().expect("tempdir");
        let output = dir.path().join("run.jsonl");
        fs::write(&output, "{\"type\":\"system\",\"session_id\":\"s-1\"}\n").expect("write");

        let path = output.clone();
        let mut polls = 0;
        let (outcome, _) = follow_output(
            "claude",
            &output,
            move || {
                polls += 1;
                // 第二次询问时进程写完结果并退出
                if polls == 2 {
                    let mut file = fs::OpenOptions::new().append(true).open(&path).expect("open");
                    writeln!(file, "{CLAUDE_RESULT}").expect("append");
                }
                if polls >= 3 { Liveness::Exited(None) } else { Liveness::Running }
            },
            |_| (),
        );
        assert_eq!(outcome.final_text.as_deref(), Some("做完了"));
    }

    #[test]
    fn decides_the_status_from_events_when_the_exit_code_is_unknown() {
        let dir = tempfile::tempdir().expect("tempdir");
        let files = RunFiles::new(dir.path(), "run");
        let run = prepared("claude", "", "/work", Some("s-1".to_string()), "");

        let ended = Outcome { final_text: Some("好".to_string()), usage: Some(UsageSnapshot::default()), ..Outcome::default() };
        assert_eq!(conclude(&run, &files, ended, None, false).status, "completed");

        let cut_off = Outcome { session_id: Some("s-1".to_string()), ..Outcome::default() };
        let finished = conclude(&run, &files, cut_off, None, false);
        assert_eq!(finished.status, "interrupted");
        assert_eq!(finished.session_id.as_deref(), Some("s-1"));

        fs::write(&files.stderr, "rate limited").expect("stderr");
        assert_eq!(conclude(&run, &files, Outcome::default(), Some(false), false).error.as_deref(), Some("rate limited"));
        assert_eq!(conclude(&run, &files, Outcome::default(), Some(false), true).status, "stopped");
    }

    fn wait_until_exited(child: &mut Child) {
        while child.try_wait().ok().flatten().is_none() {
            thread::sleep(POLL_INTERVAL);
        }
    }

    /// 真实调用本机 Claude / Codex，默认不跑：
    /// EASYDO_REAL_AGENT=claude cargo test --lib real_agent -- --ignored --nocapture
    /// 第一轮跟着输出读到结束；第二轮模拟「EasyDo 不在」：只起进程不读，等它自己跑完，再从文件同步结果
    #[test]
    #[ignore]
    fn real_agent_round_trip() {
        let provider = std::env::var("EASYDO_REAL_AGENT").unwrap_or_else(|_| "claude".to_string());
        let model = if provider == "claude" { "haiku" } else { "" };
        let dir = tempfile::tempdir().expect("tempdir");
        let cwd = dir.path().display().to_string();
        let path = bot_agent::login_path();

        let first = prepared(&provider, model, &cwd, None, "只回复两个字：收到");
        let files = RunFiles::new(dir.path(), "first");
        let mut child = spawn_agent(&first, path, &files).expect("spawn");
        let (outcome, exit) = follow_output(
            &provider,
            &files.output,
            || match child.try_wait() {
                Ok(Some(status)) => Liveness::Exited(Some(status.success())),
                _ => Liveness::Running,
            },
            |_| (),
        );
        let finished = conclude(&first, &files, outcome, exit, false);
        eprintln!("{finished:?}");
        assert_eq!(finished.status, "completed", "{:?}", finished.error);
        assert!(finished.final_text.as_deref().unwrap_or("").contains("收到"));
        let session_id = finished.session_id.clone().expect("session id");

        let second = prepared(&provider, model, &cwd, Some(session_id.clone()), "再回复两个字：好的");
        let files = RunFiles::new(dir.path(), "second");
        let mut child = spawn_agent(&second, path, &files).expect("spawn");
        let pid = child.id();
        let started = process_started(pid);
        assert!(same_process_alive(pid, started.as_deref()));
        wait_until_exited(&mut child);
        assert!(!same_process_alive(pid, started.as_deref()));

        let recovered_pid = Some(pid).filter(|pid| same_process_alive(*pid, started.as_deref()));
        let (outcome, exit) = follow_output(&provider, &files.output, || match recovered_pid {
            Some(_) => Liveness::Running,
            None => Liveness::Exited(None),
        }, |_| ());
        let resumed = conclude(&second, &files, outcome, exit, false);
        eprintln!("{resumed:?}");
        assert_eq!(resumed.status, "completed", "{:?}", resumed.error);
        assert_eq!(resumed.session_id.as_deref(), Some(session_id.as_str()));
        assert!(resumed.final_text.as_deref().unwrap_or("").contains("好的"));
    }
}
