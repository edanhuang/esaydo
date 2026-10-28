//! 在后台线程里启动 Claude Code / Codex，读事件流，结束后把结果写回数据库并通知前端。

use std::collections::HashMap;
use std::fs;
use std::io::{BufRead, BufReader, Read, Write};
use std::os::unix::process::CommandExt;
use std::process::{Command, Stdio};
use std::sync::atomic::{AtomicBool, Ordering};
use std::sync::{Arc, Mutex};
use std::thread;
use std::time::Duration;

use tauri::{AppHandle, Emitter, Manager};

use crate::core::bot_agent::{self, AgentEvent, UsageSnapshot};
use crate::core::bot_service::{self, FinishedRun, PreparedRun, RunUsage};
use crate::AppState;

pub const RUNS_CHANGED_EVENT: &str = "bot-runs-changed";
const STDERR_TAIL_CHARS: usize = 1200;

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

    pub fn stop_all(&self) {
        let handles: Vec<RunHandle> = self
            .runs
            .lock()
            .map(|runs| runs.values().cloned().collect())
            .unwrap_or_default();
        for handle in handles {
            handle.stopping.store(true, Ordering::SeqCst);
            kill_group(handle.pid);
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

pub fn start(app: AppHandle, run: PreparedRun) {
    thread::spawn(move || {
        let finished = execute(&app, &run);
        let state = app.state::<AppState>();
        if let Ok(mut conn) = state.conn.lock() {
            let _ = bot_service::finish_run(&mut conn, &finished);
        }
        notify_changed(&app);
    });
}

fn failed(run: &PreparedRun, error: String) -> FinishedRun {
    FinishedRun {
        run_id: run.run_id.clone(),
        session_ref: run.session_ref.clone(),
        status: "failed".to_string(),
        usage: RunUsage::default(),
        error: Some(error),
        final_text: None,
        session_id: None,
        title: None,
        usage_totals: None,
    }
}

fn execute(app: &AppHandle, run: &PreparedRun) -> FinishedRun {
    let state = app.state::<AppState>();
    let finished = run_process(
        run,
        bot_agent::login_path(),
        |handle| {
            state.runs.insert(&run.run_id, handle);
            notify_changed(app);
        },
        |session_id| {
            if let Ok(conn) = state.conn.lock() {
                let _ = bot_service::record_session_id(&conn, &run.session_ref, session_id);
            }
        },
    );
    state.runs.remove(&run.run_id);
    finished
}

/// 起进程、读事件流直到结束。不依赖 Tauri，方便单独验证
fn run_process(
    run: &PreparedRun,
    path: &str,
    on_started: impl FnOnce(RunHandle),
    mut on_session_id: impl FnMut(&str),
) -> FinishedRun {
    let provider = run.bot.provider.as_str();
    let program_name = if provider == "codex" { "codex" } else { "claude" };
    let Some(program) = bot_agent::find_program(program_name, path) else {
        return failed(run, format!("找不到 {program_name} 命令，请确认已经安装并能在终端里运行"));
    };
    let last_message_file = std::env::temp_dir().join(format!("easydo-bot-{}.txt", run.run_id));
    let command = bot_agent::build_command(run, &program.display().to_string(), &last_message_file);

    let mut child = match Command::new(&command.program)
        .args(&command.args)
        .current_dir(&command.cwd)
        .env("PATH", path)
        // 跳过 EasyDo 自己的后台同步 hook，免得把 Bot 的会话再同步成 Todo
        .env("EASYDO_SYNC_WORKER", "1")
        .stdin(Stdio::piped())
        .stdout(Stdio::piped())
        .stderr(Stdio::piped())
        .process_group(0)
        .spawn()
    {
        Ok(child) => child,
        Err(error) => return failed(run, format!("启动 {program_name} 失败：{error}")),
    };

    let stopping = Arc::new(AtomicBool::new(false));
    on_started(RunHandle { pid: child.id(), stopping: stopping.clone() });

    if let Some(mut stdin) = child.stdin.take() {
        let _ = stdin.write_all(command.stdin.as_bytes());
    }

    let stderr_tail = Arc::new(Mutex::new(String::new()));
    let stderr_reader = child.stderr.take().map(|mut stderr| {
        let tail = stderr_tail.clone();
        thread::spawn(move || {
            let mut buffer = String::new();
            let _ = stderr.read_to_string(&mut buffer);
            if let Ok(mut tail) = tail.lock() {
                let chars: Vec<char> = buffer.trim().chars().collect();
                *tail = chars[chars.len().saturating_sub(STDERR_TAIL_CHARS)..].iter().collect();
            }
        })
    });

    let mut session_id = run.resume_session_id.clone();
    let mut final_text: Option<String> = None;
    let mut usage: Option<UsageSnapshot> = None;
    let mut failure: Option<String> = None;
    if let Some(stdout) = child.stdout.take() {
        for line in BufReader::new(stdout).lines().map_while(std::result::Result::ok) {
            for event in bot_agent::parse_event(provider, &line) {
                match event {
                    AgentEvent::SessionId(id) => {
                        if session_id.as_deref() != Some(id.as_str()) {
                            on_session_id(&id);
                            session_id = Some(id);
                        }
                    }
                    AgentEvent::FinalText(text) => final_text = Some(text),
                    AgentEvent::Usage(snapshot) => usage = Some(snapshot),
                    AgentEvent::Failed(message) => failure = Some(message),
                }
            }
        }
    }
    let exit = child.wait();
    if let Some(reader) = stderr_reader {
        let _ = reader.join();
    }

    if let Ok(text) = fs::read_to_string(&last_message_file) {
        if !text.trim().is_empty() {
            final_text = Some(text);
        }
    }
    let _ = fs::remove_file(&last_message_file);

    let (run_usage, usage_totals) = match &usage {
        Some(snapshot) => bot_agent::usage_for_run(provider, snapshot, run.usage_totals.as_deref()),
        None => (RunUsage::default(), None),
    };
    let title = session_id.as_deref().and_then(|id| bot_agent::read_session_title(provider, &run.cwd, id)).or_else(|| {
        run.resume_session_id
            .is_none()
            .then(|| bot_agent::session_title(&run.todo_detail))
    });

    let succeeded = matches!(&exit, Ok(status) if status.success());
    let (status, error) = if stopping.load(Ordering::SeqCst) {
        ("stopped", None)
    } else if failure.is_some() || !succeeded {
        let stderr = stderr_tail.lock().map(|tail| tail.clone()).unwrap_or_default();
        let error = failure
            .or_else(|| (!stderr.is_empty()).then_some(stderr))
            .unwrap_or_else(|| match &exit {
                Ok(status) => format!("{program_name} 退出码 {}", status.code().unwrap_or(-1)),
                Err(error) => error.to_string(),
            });
        ("failed", Some(error))
    } else {
        ("completed", None)
    };

    FinishedRun {
        run_id: run.run_id.clone(),
        session_ref: run.session_ref.clone(),
        status: status.to_string(),
        usage: run_usage,
        error,
        final_text,
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

    /// 真实调用本机 Claude / Codex 跑一轮新会话再续一轮，默认不跑：
    /// EASYDO_REAL_AGENT=claude cargo test --lib real_agent -- --ignored --nocapture
    #[test]
    #[ignore]
    fn real_agent_round_trip() {
        let provider = std::env::var("EASYDO_REAL_AGENT").unwrap_or_else(|_| "claude".to_string());
        let model = if provider == "claude" { "haiku" } else { "" };
        let dir = tempfile::tempdir().expect("tempdir");
        let cwd = dir.path().display().to_string();
        let path = bot_agent::login_path();
        eprintln!("PATH = {path}");

        let first = prepared(&provider, model, &cwd, None, "只回复两个字：收到");
        let mut started = false;
        let mut sessions = Vec::new();
        let finished = run_process(&first, path, |_| started = true, |id| sessions.push(id.to_string()));
        eprintln!("{finished:?}");
        assert!(started);
        assert_eq!(finished.status, "completed", "{:?}", finished.error);
        assert!(finished.final_text.as_deref().unwrap_or("").contains("收到"));
        let session_id = finished.session_id.clone().expect("session id");
        assert_eq!(sessions, vec![session_id.clone()]);
        assert!(finished.usage.input_tokens > 0);

        let second = prepared(&provider, model, &cwd, Some(session_id.clone()), "再回复两个字：好的");
        let resumed = run_process(&second, path, |_| (), |_| ());
        eprintln!("{resumed:?}");
        assert_eq!(resumed.status, "completed", "{:?}", resumed.error);
        assert_eq!(resumed.session_id.as_deref(), Some(session_id.as_str()));
        assert!(resumed.final_text.as_deref().unwrap_or("").contains("好的"));
    }
}
