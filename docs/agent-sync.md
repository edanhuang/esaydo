# Agent Work Sync (Claude Code hook)

`scripts/agent-sync/` keeps EasyDo in step with Claude Code conversations without slowing them down. When a session did real work, the matching Todo is added, updated, moved out of the Inbox, or completed in the background.

## How it works

- `hook.sh` runs on `Stop` and `SessionEnd`. It only records the event and wakes the worker, then returns immediately.
- `worker.py` runs as a single background daemon. When a session has been idle for 3 minutes and at least 30 minutes have passed since that session's last model call (or immediately when the session ends), it reads only the not-yet-synced part of the transcript, skips it when no real tool calls happened, and otherwise makes one headless Claude call with no tools that returns a JSON plan (add, update, move from the Inbox, or complete). The worker validates the plan against the current Todos and `easydo groups`, then runs the [`easydo` CLI](cli.md) with argument arrays, so multi-line content needs no shell quoting.
- `prompt.md` holds the sync rules; the Todo writing rules are read from the installed `easydo` Skill.

## Install

Install or remove the hook (backs up `~/.claude/settings.json` first):

```bash
bash scripts/agent-sync/install.sh
bash scripts/agent-sync/install.sh --uninstall
```

The CLI must be installed first; see [Install](cli.md#install).

## Logs and tuning

Results are logged to `~/Library/Logs/EasyDo/agent-sync.log`.

Environment variables:

- `EASYDO_SYNC_IDLE_SECONDS` (default `180`): how long a session must be idle before syncing.
- `EASYDO_SYNC_MIN_INTERVAL_SECONDS` (default `1800`): minimum time since the session's last sync call.
- `EASYDO_SYNC_MODEL` (default `claude-sonnet-5-5`): the model used for the headless sync call.
- `EASYDO_SYNC_CLAUDE`, `EASYDO_SYNC_EASYDO`: paths to the `claude` and `easydo` executables when they are not on `PATH`.

Debug a transcript without changing any Todo:

```bash
python3 -I scripts/agent-sync/worker.py once <transcript.jsonl> --dry-run
```
