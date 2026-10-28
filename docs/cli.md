# EasyDo command line

The `easydo` CLI reads and writes the same local database as the desktop app. Agents (Claude Code, Codex) use it through the `easydo` Skill instead of touching SQLite directly.

## Install

The macOS App contains the CLI. After moving `EasyDo.app` to Applications:

1. Open EasyDo Settings (`⌘,`).
2. Find **Command Line**.
3. Click **Install CLI** and approve the macOS authorization prompt if requested.

This creates `/usr/local/bin/easydo` as a symbolic link to the CLI inside the App Bundle. Moving or renaming the App can invalidate the link; use **Reinstall CLI** from Settings to repair it. EasyDo does not overwrite a regular file or third-party link already using that path.

## Commands

Show all commands:

```bash
easydo help
easydo list --help
```

Query todos:

```bash
easydo list
easydo list --view 工作
easydo list --group 学习 --status active
easydo list --from 2026-06-01 --to 2026-06-07
easydo list --status all --json
easydo groups
easydo groups --json
```

`easydo groups` lists every Group, including ones that have no Todo yet. The text output shows regular Groups only; `--json` also includes system Groups such as the Inbox, marked by `systemKey`.

Create and update todos:

```bash
easydo add "整理检查合并方案" --group 工作
easydo update <todo-id-or-unique-prefix> --detail "更新后的内容"
easydo mark <todo-id-or-unique-prefix> --priority high
easydo mark <todo-id-or-unique-prefix> --priority normal
easydo mark <todo-id-or-unique-prefix> --suspend
easydo mark <todo-id-or-unique-prefix> --resume
easydo done <todo-id-or-unique-prefix>
easydo archive <todo-id-or-unique-prefix>
```

Todo selectors accept a full UUID or a unique ID prefix. Ambiguous prefixes are rejected.

## Inbox

Agent work that is worth recording but cannot be assigned to a reliable Group can be placed in the system Inbox:

```bash
easydo inbox add "待归类的工作结果" --json
easydo list --view 收件箱 --json
easydo move <todo-id-or-unique-prefix> --group 工作 --json
```

The Inbox is hidden from normal Views and the manual input Group selector. When it contains Todo items, the sidebar displays an Inbox entry. Drag an Inbox Todo onto a regular sidebar Group to keep it permanently.

Inbox Todo items expire at 03:00 local time on the day after creation. EasyDo performs a logical-delete scan:

- once when the App starts;
- every 15 minutes while the App remains open;
- before each CLI command that opens the database.

If the App and CLI are both closed at 03:00, cleanup runs the next time either one opens the database. Logically deleted Inbox items are excluded from Board, Daily, Weekly, and CLI queries, including `--status all`.

## Agent Skills

EasyDo includes the `easydo` Skill 0.5.1. It instructs Agents to use the CLI instead of editing SQLite directly and keeps Todo text to "where things stand and what is next" rather than a work log or a full future plan. Work-result synchronization is not done inside the conversation; it is handled by [Agent Work Sync](agent-sync.md).

```bash
easydo skills list
easydo skills install easydo --agent codex
easydo skills install all --agent all
```

Supported targets:

- `agents`: `~/.agents/skills`
- `codex`: `~/.codex/skills`
- `claude`: `~/.claude/skills`
- `all`: all three directories

EasyDo only upgrades Skill directories containing its management marker. Existing user-managed directories are never overwritten.

## Database overrides

The desktop app and CLI normally share:

```text
~/Library/Application Support/com.edanhuang.easydo/easydo.sqlite
```

For tests or diagnostics, override the database for one command:

```bash
easydo --database /tmp/easydo-test.sqlite list
EASYDO_DB_PATH=/tmp/easydo-test.sqlite easydo list
```

`--database` takes precedence over `EASYDO_DB_PATH`.

`EASYDO_DB_PATH` also applies to a locally launched desktop process, which allows UI verification against an isolated database without changing the normal App data.

## Exit codes

CLI errors are written to stderr with stable exit codes:

- `2`: invalid command or input
- `3`: missing or ambiguous entity
- `4`: invalid Todo state transition
- `5`: database, filesystem, or installation failure
