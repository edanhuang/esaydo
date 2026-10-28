"""EasyDo 工作同步 worker。

由 hook.sh 在后台唤起（daemon 模式），同一时间只有一个 daemon 在运行：
1. 读取 inbox 中 hook 登记的事件，按会话合并状态；
2. 会话空闲 IDLE 秒、且距该会话上次调用模型满 MIN_INTERVAL 秒后（收到 SessionEnd 则立即），
   只读取 transcript 中尚未处理的部分；
3. 没有实质工具调用的片段直接跳过，不调用模型；
4. 否则调用一次 headless Claude（不开放任何工具），由它输出 JSON 操作计划；
   worker 校验计划后用参数数组调用 easydo CLI 执行，不经过 shell，多行内容原样传入。

调试用法：
    python3 -I worker.py once <transcript.jsonl> [--cwd DIR] [--dry-run]
"""

import fcntl
import json
import os
import shutil
import subprocess
import sys
import time
from datetime import datetime
from pathlib import Path

HERE = Path(__file__).resolve().parent
STATE_DIR = Path(
    os.environ.get("EASYDO_SYNC_STATE_DIR")
    or Path.home() / "Library/Application Support/com.edanhuang.easydo/agent-sync"
)
LOG_PATH = Path(os.environ.get("EASYDO_SYNC_LOG") or Path.home() / "Library/Logs/EasyDo/agent-sync.log")
IDLE_SECONDS = int(os.environ.get("EASYDO_SYNC_IDLE_SECONDS", "180"))
MIN_INTERVAL_SECONDS = int(os.environ.get("EASYDO_SYNC_MIN_INTERVAL_SECONDS", "1800"))
MODEL = os.environ.get("EASYDO_SYNC_MODEL", "claude-sonnet-5-5")
CLAUDE_TIMEOUT_SECONDS = 300
POLL_SECONDS = 15

USER_MESSAGE_LIMIT = 800
ASSISTANT_MESSAGE_LIMIT = 1200
DIGEST_LIMIT = 20000

# 这些工具调用不代表实质工作：任务列表、收尾卡片、加载工具或 Skill 等
IGNORED_TOOL_PREFIXES = ("mcp__ccd_",)
IGNORED_TOOLS = {"ToolSearch", "TodoWrite", "Skill"}
SKIPPED_USER_PREFIXES = (
    "<system-reminder",
    "<task-notification",
    "<command-",
    "<local-command",
    "<side-sessions-event",
    "<ci-monitor-event",
    "This session is being continued from a previous conversation",
)


def log(message):
    LOG_PATH.parent.mkdir(parents=True, exist_ok=True)
    stamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    with LOG_PATH.open("a", encoding="utf-8") as handle:
        handle.write(f"{stamp} {message}\n")


def load_config():
    config = {}
    path = HERE / "config.json"
    if path.exists():
        try:
            config = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            config = {}
    if os.environ.get("EASYDO_SYNC_CLAUDE"):
        config["claude"] = os.environ["EASYDO_SYNC_CLAUDE"]
    if os.environ.get("EASYDO_SYNC_EASYDO"):
        config["easydo"] = os.environ["EASYDO_SYNC_EASYDO"]
    config.setdefault("claude", shutil.which("claude") or "claude")
    config.setdefault("easydo", shutil.which("easydo") or "/usr/local/bin/easydo")
    return config


# ---------- 状态 ----------


def load_state():
    path = STATE_DIR / "state.json"
    if not path.exists():
        return {"sessions": {}}
    try:
        return json.loads(path.read_text(encoding="utf-8"))
    except (OSError, ValueError):
        return {"sessions": {}}


def save_state(state):
    path = STATE_DIR / "state.json"
    tmp = path.with_suffix(".tmp")
    tmp.write_text(json.dumps(state, ensure_ascii=False, indent=2), encoding="utf-8")
    tmp.replace(path)


def ingest_inbox(state):
    inbox = STATE_DIR / "inbox"
    if not inbox.exists():
        return
    for path in sorted(inbox.glob("*.json")):
        try:
            payload = json.loads(path.read_text(encoding="utf-8"))
        except (OSError, ValueError):
            payload = None
        path.unlink(missing_ok=True)
        if not isinstance(payload, dict):
            continue
        session_id = payload.get("session_id")
        transcript = payload.get("transcript_path")
        if not session_id or not transcript:
            continue
        session = state["sessions"].setdefault(session_id, {"offset": 0})
        session["transcript"] = transcript
        session["cwd"] = payload.get("cwd") or session.get("cwd")
        session["last_event_at"] = time.time()
        session["dirty"] = True
        if payload.get("hook_event_name") == "SessionEnd":
            session["ended"] = True


def seconds_until_due(session, now):
    if session.get("ended"):
        return 0
    idle_left = IDLE_SECONDS - (now - session.get("last_event_at", 0))
    # 只有真正调用过模型才计入最小间隔，被预过滤跳过的片段不占用间隔
    interval_left = MIN_INTERVAL_SECONDS - (now - session.get("last_synced_at", 0))
    return max(idle_left, interval_left, 0)


def due_sessions(state, now):
    for session_id, session in state["sessions"].items():
        if session.get("dirty") and seconds_until_due(session, now) <= 0:
            yield session_id, session


def next_wait(state, now):
    waits = [
        seconds_until_due(session, now)
        for session in state["sessions"].values()
        if session.get("dirty")
    ]
    if not waits:
        return None
    return max(1, min(POLL_SECONDS, min(waits)))


def prune_state(state, now):
    # 已结束或一周未活动的会话不再保留，避免状态文件无限增长
    for session_id in list(state["sessions"]):
        session = state["sessions"][session_id]
        if session.get("dirty"):
            continue
        if session.get("ended") or now - session.get("last_event_at", 0) > 7 * 86400:
            del state["sessions"][session_id]


# ---------- transcript ----------


def read_new_entries(transcript, offset):
    entries = []
    title = None
    with open(transcript, encoding="utf-8") as handle:
        lines = handle.readlines()
    if offset > len(lines):
        offset = 0
    for line in lines[offset:]:
        try:
            entry = json.loads(line)
        except ValueError:
            continue
        kind = entry.get("type")
        if kind in ("custom-title", "ai-title", "summary"):
            title = entry.get("customTitle") or entry.get("aiTitle") or entry.get("title") or entry.get("summary") or title
            continue
        if entry.get("isSidechain") or kind not in ("user", "assistant"):
            continue
        entries.append(entry)
    return entries, len(lines), title


def message_blocks(entry):
    message = entry.get("message")
    if not isinstance(message, dict):
        return []
    content = message.get("content")
    if isinstance(content, str):
        return [{"type": "text", "text": content}]
    return [block for block in content or [] if isinstance(block, dict)]


def is_meaningful_tool(block):
    name = block.get("name") or ""
    if name in IGNORED_TOOLS or name.startswith(IGNORED_TOOL_PREFIXES):
        return False
    if name == "Bash":
        command = (block.get("input") or {}).get("command", "").strip()
        return not command.startswith("easydo")
    return True


def describe_tool(block):
    name = block.get("name") or ""
    tool_input = block.get("input") or {}
    if name == "Bash":
        command = (tool_input.get("command") or "").strip()
        first_line = command.splitlines()[0] if command else ""
        return f"Bash: {first_line[:100]}"
    target = tool_input.get("file_path") or tool_input.get("path") or tool_input.get("pattern") or ""
    return f"{name} {target}".strip()


def build_digest(entries):
    parts = []
    has_work = False
    for entry in entries:
        role = entry.get("type")
        tools = []
        for block in message_blocks(entry):
            kind = block.get("type")
            if kind == "text":
                text = (block.get("text") or "").strip()
                if not text:
                    continue
                if role == "user":
                    if text.startswith(SKIPPED_USER_PREFIXES):
                        continue
                    parts.append(f"【用户】{text[:USER_MESSAGE_LIMIT]}")
                else:
                    parts.append(f"【助手】{text[:ASSISTANT_MESSAGE_LIMIT]}")
            elif kind == "tool_use" and is_meaningful_tool(block):
                has_work = True
                tools.append(describe_tool(block))
        if tools:
            shown = "；".join(tools[:5])
            more = f" 等 {len(tools)} 个" if len(tools) > 5 else ""
            parts.append(f"【工具】{shown}{more}")
    digest = "\n\n".join(parts)
    if len(digest) > DIGEST_LIMIT:
        digest = "（前文已省略）\n\n" + digest[-DIGEST_LIMIT:]
    return digest, has_work


# ---------- EasyDo 与模型 ----------


def subprocess_env(config):
    env = dict(os.environ)
    env["EASYDO_SYNC_WORKER"] = "1"
    extra = [str(Path(config["claude"]).parent), str(Path(config["easydo"]).parent), "/usr/local/bin"]
    env["PATH"] = os.pathsep.join(extra + [env.get("PATH", "/usr/bin:/bin")])
    return env


def active_todos(config):
    result = subprocess.run(
        [config["easydo"], "list", "--status", "active", "--json"],
        capture_output=True,
        text=True,
        timeout=60,
        env=subprocess_env(config),
    )
    if result.returncode != 0:
        raise RuntimeError(f"easydo list 失败: {result.stderr.strip()}")
    todos = json.loads(result.stdout or "[]")
    # 收件箱里的 Todo 不在普通查询里，也要带上，否则会把同一件事反复放进收件箱
    inbox = subprocess.run(
        [config["easydo"], "list", "--view", "收件箱", "--json"],
        capture_output=True,
        text=True,
        timeout=60,
        env=subprocess_env(config),
    )
    if inbox.returncode == 0:
        known = {todo["id"] for todo in todos}
        todos += [todo for todo in json.loads(inbox.stdout or "[]") if todo["id"] not in known]
    compact = [
        {
            "id": todo["id"],
            "detail": todo["detail"],
            "groups": [group["name"] for group in todo.get("groups", [])],
            "priority": todo.get("priority"),
            "suspended": todo.get("suspendedAt") is not None,
            "inbox": any(group.get("systemKey") == "inbox" for group in todo.get("groups", [])),
            "updatedAt": todo.get("updatedAt"),
        }
        for todo in todos
    ]
    groups = sorted({name for todo in compact if not todo["inbox"] for name in todo["groups"]})
    return compact, groups


def all_groups(config, fallback):
    """全部普通 Group（包括还没有 Todo 的）；CLI 不支持时退回从 Todo 反推的列表。"""
    result = subprocess.run(
        [config["easydo"], "groups", "--json"],
        capture_output=True,
        text=True,
        timeout=60,
        env=subprocess_env(config),
    )
    if result.returncode != 0:
        log(f"easydo groups 失败，改用 Todo 里的 Group: {result.stderr.strip()[:200]}")
        return fallback
    try:
        groups = json.loads(result.stdout or "[]")
    except ValueError:
        return fallback
    names = [group["name"] for group in groups if not group.get("systemKey")]
    return names or fallback


def writing_rules(config):
    candidates = [config.get("skill_path"), "~/.claude/skills/easydo/SKILL.md", "~/.agents/skills/easydo/SKILL.md"]
    for candidate in candidates:
        if not candidate:
            continue
        path = Path(candidate).expanduser()
        if not path.exists():
            continue
        text = path.read_text(encoding="utf-8")
        start = text.find("## Todo 内容写法")
        if start < 0:
            continue
        end = text.find("\n## ", start + 1)
        section = text[start:end if end > 0 else None]
        return section.split("\n", 1)[1].strip()
    return "主句一句话写清楚是什么事和当前卡点；子项只写当下要做的事；不写 commit、ID、类名和排查过程。"


def build_prompt(config, cwd, title, digest):
    todos, todo_groups = active_todos(config)
    groups = all_groups(config, todo_groups)
    return render_prompt(config, cwd, title, digest, todos, groups), todos, groups


def render_prompt(config, cwd, title, digest, todos, groups):
    template = (HERE / "prompt.md").read_text(encoding="utf-8")
    replacements = {
        "{{WRITING_RULES}}": writing_rules(config),
        "{{CWD}}": cwd or "未知",
        "{{TITLE}}": title or "无",
        "{{TODOS}}": json.dumps(todos, ensure_ascii=False, indent=1),
        "{{GROUPS}}": "、".join(groups) or "无",
        "{{DIGEST}}": digest,
    }
    for key, value in replacements.items():
        template = template.replace(key, value)
    return template


def run_claude(config, prompt):
    command = [
        config["claude"],
        "-p",
        "--model", MODEL,
        "--tools", "",
        "--setting-sources", "project",
        "--strict-mcp-config",
        "--no-session-persistence",
    ]
    result = subprocess.run(
        command,
        input=prompt,
        capture_output=True,
        text=True,
        timeout=CLAUDE_TIMEOUT_SECONDS,
        cwd=str(STATE_DIR),
        env=subprocess_env(config),
    )
    if result.returncode != 0:
        raise RuntimeError(f"claude 退出码 {result.returncode}: {result.stderr.strip()[:300]}")
    lines = [line.strip() for line in result.stdout.strip().splitlines() if line.strip()]
    for line in reversed(lines):
        if line.startswith("{"):
            return json.loads(line)
    raise RuntimeError(f"模型没有输出 JSON 计划: {result.stdout.strip()[:200]}")


def run_easydo(config, args):
    result = subprocess.run(
        [config["easydo"], *args, "--json"],
        capture_output=True,
        text=True,
        timeout=60,
        env=subprocess_env(config),
    )
    if result.returncode != 0:
        raise RuntimeError(f"easydo {args[0]} 失败: {result.stderr.strip()[:200]}")
    return json.loads(result.stdout or "{}")


def execute_plan(config, plan, todos, groups):
    """校验并执行模型给出的计划，返回每一步的结果。"""
    known_ids = {todo["id"] for todo in todos}
    inbox_ids = {todo["id"] for todo in todos if todo.get("inbox")}
    results = []
    for action in plan.get("actions") or []:
        kind = action.get("type")
        todo_id = action.get("todo_id")
        group = action.get("group")
        detail = (action.get("detail") or "").strip()
        if kind in ("update", "move", "done") and todo_id not in known_ids:
            results.append(f"skip {kind}: 未知 Todo {todo_id}")
            continue
        if kind in ("add", "move") and group not in groups:
            results.append(f"skip {kind}: 未知 Group {group}")
            continue
        if kind in ("add", "inbox", "update") and not detail:
            results.append(f"skip {kind}: 内容为空")
            continue
        if kind == "add":
            created = run_easydo(config, ["add", detail, "--group", group])
            known_ids.add(created.get("id"))
            results.append(f"add {created.get('id', '')[:8]} → {group}")
        elif kind == "inbox":
            created = run_easydo(config, ["inbox", "add", detail])
            known_ids.add(created.get("id"))
            results.append(f"inbox {created.get('id', '')[:8]}")
        elif kind == "update":
            run_easydo(config, ["update", todo_id, "--detail", detail])
            results.append(f"update {todo_id[:8]}")
        elif kind == "move":
            if todo_id not in inbox_ids:
                results.append(f"skip move: {todo_id[:8]} 不在收件箱")
                continue
            run_easydo(config, ["move", todo_id, "--group", group])
            results.append(f"move {todo_id[:8]} → {group}")
        elif kind == "done":
            run_easydo(config, ["done", todo_id])
            results.append(f"done {todo_id[:8]}")
        else:
            results.append(f"skip: 不支持的操作 {kind}")
    return results


def sync_entries(config, label, cwd, title, entries, dry_run=False):
    """返回是否调用了模型。"""
    digest, has_work = build_digest(entries)
    if not has_work or not digest:
        log(f"{label} skip: 新增部分没有实质工具调用")
        return False
    prompt, todos, groups = build_prompt(config, cwd, title, digest)
    if dry_run:
        print(prompt)
        return False
    started = time.time()
    plan = run_claude(config, prompt)
    results = execute_plan(config, plan, todos, groups)
    log(f"{label} done in {time.time() - started:.0f}s: {'; '.join(results) or 'noop'} ({plan.get('reason', '')})")
    return True


def process_session(config, session_id, session):
    label = f"[{session_id[:8]}]"
    transcript = session.get("transcript")
    if not transcript or not Path(transcript).exists():
        log(f"{label} skip: transcript 不存在")
        return
    entries, line_count, title = read_new_entries(transcript, session.get("offset", 0))
    if title:
        session["title"] = title
    try:
        if sync_entries(config, label, session.get("cwd"), session.get("title"), entries):
            session["last_synced_at"] = time.time()
    except Exception as error:  # noqa: BLE001 后台进程只记录失败，不重试，避免反复消耗
        session["last_synced_at"] = time.time()
        log(f"{label} failed: {error}")
    session["offset"] = line_count


# ---------- 入口 ----------


def daemon():
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    config = load_config()
    lock_file = open(STATE_DIR / "daemon.lock", "w")
    try:
        fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
    except OSError:
        return  # 已有 daemon 在运行，它会处理 inbox
    while True:
        state = load_state()
        ingest_inbox(state)
        now = time.time()
        for session_id, session in list(due_sessions(state, now)):
            session["dirty"] = False
            save_state(state)
            process_session(config, session_id, session)
            save_state(state)
        prune_state(state, time.time())
        save_state(state)
        wait = next_wait(state, time.time())
        if wait is None:
            fcntl.flock(lock_file, fcntl.LOCK_UN)
            # 释放锁后再看一次 inbox，防止刚好有新事件登记却没有 daemon 处理
            if not any((STATE_DIR / "inbox").glob("*.json")):
                return
            try:
                fcntl.flock(lock_file, fcntl.LOCK_EX | fcntl.LOCK_NB)
            except OSError:
                return
            continue
        time.sleep(wait)


def once(args):
    transcript = args[0]
    cwd = args[args.index("--cwd") + 1] if "--cwd" in args else None
    dry_run = "--dry-run" in args
    STATE_DIR.mkdir(parents=True, exist_ok=True)
    entries, _, title = read_new_entries(transcript, 0)
    sync_entries(load_config(), "[once]", cwd, title, entries, dry_run=dry_run)


def main():
    if len(sys.argv) >= 2 and sys.argv[1] == "daemon":
        daemon()
    elif len(sys.argv) >= 3 and sys.argv[1] == "once":
        once(sys.argv[2:])
    else:
        print(__doc__)


if __name__ == "__main__":
    main()
