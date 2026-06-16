# EasyDo

Local-first Todo + Weekly Worklog desktop MVP.

## Prerequisites

- macOS
- Node.js 22 recommended
  - Install with nvm, Volta, asdf, or your system package manager.
  - `node -v` should report `v22.x`.
- npm
- Rust and Cargo
  - Required by Tauri.
  - If not installed, install through Homebrew before running the Tauri app.
- Tauri CLI
  - Provided by the project dev dependency `@tauri-apps/cli`.

## Recommended Node Version

Use Node 22 before installing dependencies or running local commands:

```bash
nvm use 22
node -v
npm -v
cargo --version
```

## Install

```bash
npm install
```

## Local Development

Run the Vite frontend only:

```bash
npm run dev
```

Run the desktop app through Tauri:

```bash
npm run tauri:dev
```

`tauri:dev` first builds the matching `easydo-cli` sidecar used by the Settings dialog.

## Command Line

The macOS App contains the CLI. After moving `EasyDo.app` to Applications:

1. Open EasyDo Settings.
2. Find **Command Line**.
3. Click **Install CLI** and approve the macOS authorization prompt if requested.

This creates `/usr/local/bin/easydo` as a symbolic link to the CLI inside the App Bundle. Moving or renaming the App can invalidate the link; use **Reinstall CLI** from Settings to repair it. EasyDo does not overwrite a regular file or third-party link already using that path.

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
```

Create and update todos:

```bash
easydo add "整理检查合并方案" --group 工作
easydo update <todo-id-or-unique-prefix> --detail "更新后的内容"
easydo mark <todo-id-or-unique-prefix> --priority high
easydo mark <todo-id-or-unique-prefix> --priority normal
easydo done <todo-id-or-unique-prefix>
easydo archive <todo-id-or-unique-prefix>
```

Todo selectors accept a full UUID or a unique ID prefix. Ambiguous prefixes are rejected.

### Inbox

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

### Agent Skills

EasyDo includes the `easydo` Skill 0.3.0. It instructs Agents to use the CLI instead of editing SQLite directly and defines a conservative post-work synchronization protocol. The Skill uses subagents only when the prompt explicitly includes wording such as `use subagents` or `使用 sub-agent`; otherwise it uses the single-agent fallback flow:

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

Automatic work synchronization is skipped when the Agent host has no separate-Agent capability and the prompt explicitly requested subagents. If subagent startup is blocked by permissions or available-tool limits, or if the prompt did not explicitly request subagents, the main flow may perform the same conservative Todo confirmation instead.

### Database Overrides

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

CLI errors are written to stderr with stable exit codes:

- `2`: invalid command or input
- `3`: missing or ambiguous entity
- `4`: invalid Todo state transition
- `5`: database, filesystem, or installation failure

## Checks

Type-check the frontend:

```bash
npm run check
```

Build the frontend:

```bash
npm run build
```

Run Rust and CLI tests:

```bash
cd src-tauri
cargo test --all-targets
```

The Rust build script creates a non-distributable sidecar placeholder when needed for local checks. `prepare-cli.sh` always replaces it with the real CLI before an App build.

Build the current-architecture App:

```bash
npm run tauri:build
```

Build and verify both Intel and Apple Silicon DMGs:

```bash
bash scripts/build-dmg.sh
```

Build one architecture and install it to `/Applications/EasyDo.app`:

```bash
bash scripts/build-install-intel.sh
bash scripts/build-install-arm.sh
```

The install scripts quit a running EasyDo app before replacing it. A cross-architecture run still builds and verifies the App/DMG, but skips installing to `/Applications` when the built architecture cannot run on the current Mac.

## OpenSpec

The first-phase MVP change is tracked at:

```text
openspec/changes/implement-first-phase-mvp
```

Use `/opsx:apply` for the implementation phase.
