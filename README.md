# EasyDo

A local-first Todo app for macOS that keeps today's work on a board, turns finished work into a daily record for timesheets and weekly reports, and can hand a Todo to a local AI agent (Claude Code or Codex) to work on.

Everything is stored in a SQLite database on your Mac. There is no account and no cloud sync. The interface is in Simplified Chinese.

## Features

- **Board.** Todos live in Groups (for example 工作, 学习). A View shows one or more Groups together, and each View can be laid out as a list or as a free-form canvas.
- **Canvas.** Drag cards anywhere, resize them, pan past the edges, and pinch to zoom on the trackpad. Stretched cards show as many subtasks as fit; hover to see the rest.
- **Rich Todos.** Lines written as `- [ ]` become checkable subtasks. Mark a Todo as high priority, suspend it into a collapsed section without losing its place, complete it, or archive it.
- **Daily.** A week at a glance: what you added, changed, or finished on each day, ready for filling in timesheets or writing a weekly report.
- **Bots.** Create Bots that run Claude Code or Codex in a working directory of your choice, then right-click a Todo and choose 派发给 Bot. See [Bots](#bots).
- **Inbox.** Agents can drop results that do not belong to a clear Group into a temporary Inbox; items you do not keep expire the next morning.
- **Command line and Agent Skill.** The `easydo` CLI and the bundled `easydo` Skill let Claude Code and Codex read and update your Todos. See [docs/cli.md](docs/cli.md).
- **Agent Work Sync.** An optional Claude Code hook updates Todos in the background after a coding session. See [docs/agent-sync.md](docs/agent-sync.md).
- **Light and dark themes**, and configurable keyboard shortcuts.

## Install

There are no prebuilt releases yet. Build and install from source on an Apple Silicon Mac:

```bash
npm install
bash scripts/build-install-arm.sh
```

On an Intel Mac use `scripts/build-install-intel.sh`. Both scripts quit a running EasyDo, then install `EasyDo.app` into `/Applications`. See [Development](#development) for the toolchain.

After the first launch:

- To use the CLI or the Agent Skill, open Settings (`⌘,`) and click **Install CLI** under Command Line.
- The first time a Bot replies while EasyDo is in the background, macOS asks whether EasyDo may send notifications.

## Keyboard

| Key | Action |
| --- | --- |
| `Enter` | Save the Todo in the input box (`Shift+Enter` for a new line) |
| `Tab` | Switch the Group the input box adds to (in the input box) |
| `Shift+Tab` | Switch the Board View |
| `Option+Tab` | Switch the current View between list and canvas |
| `⌘↑` / `⌘↓` | Select the previous / next Todo |
| `Space` | Edit the selected Todo |
| `⌘Enter` | Complete or reopen the selected Todo |
| `⌘,` | Open Settings |

The last four can be changed in Settings.

## Bots

A Bot is a saved setup for a local agent: a name and color, the agent (Claude Code or Codex), a model, and a working directory. Both CLIs must be installed and signed in on your Mac.

- **Dispatch.** Right-click a Todo and choose 派发给 Bot. The Todo text and your optional note become the prompt. While the Bot runs, the Todo shows the Bot's avatar and cannot be completed or archived. Up to three Bots can run at once.
- **One conversation per Todo and Bot.** Dispatching the same Todo to the same Bot again resumes the same agent session.
- **Messages.** The Bot's final reply appears in the Messages drawer, rendered as Markdown, with an unread badge on the Todo. Reply there to continue the conversation, or open the session in Terminal, Ghostty, or iTerm2 (choose in Settings).
- **Background runs.** Quitting EasyDo does not stop running Bots. On the next launch EasyDo picks up their results. When a Bot replies or fails while EasyDo is not in front, you get a macOS notification.

> [!WARNING]
> Bots run without permission prompts (`--permission-mode bypassPermissions` for Claude Code, `--dangerously-bypass-approvals-and-sandbox` for Codex), so they can read, change, and run anything the agent decides to in the working directory. Only point a Bot at a directory you are comfortable letting it change.

The design is described in [docs/EasyDo_Bot_Dispatch_Design.md](docs/EasyDo_Bot_Dispatch_Design.md).

## Data

The app and the CLI share one database:

```text
~/Library/Application Support/com.edanhuang.easydo/easydo.sqlite
```

Quit EasyDo before copying this folder to back it up or move it to another Mac. Bot run output and terminal scripts are kept in the same folder; logs are in `~/Library/Logs/EasyDo/`.

## Development

Requirements:

- macOS
- Node.js 22 and npm
- Rust and Cargo (required by Tauri; the Tauri CLI comes from the `@tauri-apps/cli` dev dependency)

```bash
npm install
npm run tauri:dev   # desktop app; builds the easydo-cli sidecar first
npm run dev         # frontend only, in a browser
```

Checks:

```bash
npm test                              # frontend tests (Vitest)
npm run check                         # TypeScript
cd src-tauri && cargo test --all-targets   # Rust and CLI tests
```

The Rust build script creates a non-distributable sidecar placeholder when needed for local checks. `prepare-cli.sh` always replaces it with the real CLI before an App build.

Builds:

```bash
npm run tauri:build                   # current architecture
bash scripts/build-dmg.sh             # Intel and Apple Silicon DMGs, verified
bash scripts/build-install-arm.sh     # build and install to /Applications
bash scripts/build-install-intel.sh
```

A cross-architecture run still builds and verifies the App and DMG, but skips installing when the built architecture cannot run on the current Mac.

To try the app against a throwaway database, launch it with `EASYDO_DB_PATH=/tmp/easydo-test.sqlite`.

## Project layout

- `src/`: React frontend (Vite, Tailwind CSS 4, shadcn/ui)
- `src-tauri/`: Tauri app, Rust core, and the `easydo` CLI
- `skills/easydo/`: the Agent Skill installed by `easydo skills install`
- `scripts/`: build, install, and Agent Work Sync scripts
- `docs/`: CLI reference, design documents, and UI style guides
- `openspec/changes/`: change proposals and specs
