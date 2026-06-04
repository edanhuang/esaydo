## Why

EasyDo currently has a clear product vision but no executable desktop application. The first phase should turn the core loop into a working MVP: quickly capture detail-only todos, complete them from the keyboard, and automatically produce a weekly worklog from completed items.

## What Changes

- Add a Tauri + React + TypeScript desktop app foundation.
- Add local SQLite persistence for todos, groups, board views, and todo events.
- Add a keyboard-first board page for creating, selecting, completing, and archiving todos by group.
- Add default groups and default board views on first launch.
- Add a weekly page that aggregates completed todos by completion date.
- Add one-click copy for weekly worklog output.
- Keep tags, full settings management, AI, sync, accounts, reminders, attachments, and CLI/MCP outside the P0 implementation unless needed as schema placeholders.

## Capabilities

### New Capabilities
- `local-todo-board`: Detail-only todo capture, grouped board display, keyboard selection, status transitions, and default board view filtering.
- `weekly-worklog`: Weekly aggregation of completed todos and copyable worklog output.
- `local-persistence`: Local SQLite initialization, migrations, default seed data, and Tauri commands for the MVP data flow.

### Modified Capabilities

None.

## Impact

- Adds frontend app code under `src/` and desktop backend code under `src-tauri/`.
- Adds SQLite schema and migration logic for todos, groups, board views, relations, and todo events.
- Adds Tauri commands for create/list/complete/archive todo, list/create group, list board views, and list weekly done todos.
- Adds package and build configuration for Vite, React, TypeScript, Tailwind CSS, shadcn/ui-compatible styling, and Tauri.
