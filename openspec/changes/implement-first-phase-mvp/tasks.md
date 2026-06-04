## 1. Project Foundation

- [x] 1.1 Initialize the Tauri + React + TypeScript + Vite app structure in the repository.
- [x] 1.2 Add Tailwind CSS and shadcn/ui-compatible styling foundations.
- [x] 1.3 Add base frontend folders for pages, board components, weekly components, shared types, and Tauri API adapters.
- [x] 1.4 Add base Rust modules for commands, database initialization, models, migrations, and seed data.
- [x] 1.5 Confirm the app can start in development mode with an empty shell page.

## 2. Local SQLite Persistence

- [x] 2.1 Add Rust SQLite and serialization dependencies required by Tauri commands.
- [x] 2.2 Implement database path resolution in the application data directory.
- [x] 2.3 Implement database initialization on app startup.
- [x] 2.4 Implement MVP migrations for todos, groups, tags, todo_groups, todo_tags, board_views, board_view_groups, and todo_events.
- [x] 2.5 Enable SQLite foreign keys and cascade cleanup for relation tables.
- [x] 2.6 Implement idempotent default group seed data for 工作, 学习, 健身, 生活, and 个人项目.
- [x] 2.7 Implement idempotent default board view seed data for 所有, 工作, and 个人.
- [x] 2.8 Represent the 所有 board view as no group filter and persist filtered board views through board_view_groups.

## 3. Tauri Commands

- [x] 3.1 Define shared Rust models for Todo, Group, BoardView, TodoEvent, and relation-enriched response types.
- [x] 3.2 Implement create_todo to persist detail-only active todos, group relations, and a created event.
- [x] 3.3 Implement list_todos with optional board view filtering and hidden archived todos by default.
- [x] 3.4 Implement complete_todo to set done status, completed_at, updated_at, and a completed event.
- [x] 3.5 Implement archive_todo to set archived status, archived_at, updated_at, and an archived event.
- [x] 3.6 Implement list_groups sorted by sort_order.
- [x] 3.7 Implement create_group for minimal future group setup support.
- [x] 3.8 Implement list_board_views sorted by sort_order with group relations.
- [x] 3.9 Implement list_weekly_done with explicit start and end date parameters.
- [x] 3.10 Register all MVP commands with the Tauri builder.

## 4. Frontend Board Experience

- [x] 4.1 Define TypeScript models matching the Tauri response contracts.
- [x] 4.2 Implement typed frontend invoke wrappers for groups, board views, todos, completion, archiving, and weekly done queries.
- [x] 4.3 Build the main board layout with visible group sections and todo cards.
- [x] 4.4 Implement the detail-only TodoInput and Enter-to-create behavior.
- [x] 4.5 Prevent empty or whitespace-only todo creation.
- [x] 4.6 Implement current input group state and Tab group switching with wraparound.
- [x] 4.7 Implement current board view state and Shift + Tab board view switching with wraparound.
- [x] 4.8 Implement visible todo ordering and Arrow Up / Arrow Down selection.
- [x] 4.9 Implement Command + Enter completion for the selected active todo.
- [x] 4.10 Render done todos with a visually distinct completed state.
- [x] 4.11 Ensure archived todos do not render on the default board.
- [x] 4.12 Refresh board data after create, complete, archive, or board view changes.

## 5. Weekly Worklog Experience

- [x] 5.1 Add a Weekly page or view reachable from the app shell.
- [x] 5.2 Compute current week boundaries in local time with Monday as the start of week.
- [x] 5.3 Query weekly completed todos with list_weekly_done.
- [x] 5.4 Group weekly completed todos by local completion date.
- [x] 5.5 Sort completed todos within each date group by completion time.
- [x] 5.6 Render the weekly worklog with date headings and todo detail rows.
- [x] 5.7 Generate Markdown output with a weekly heading, date headings, and bullet items.
- [x] 5.8 Implement copy-to-clipboard for weekly Markdown output.
- [x] 5.9 Return a valid empty-week Markdown message when no completed todos exist.

## 6. Verification

- [x] 6.1 Verify the app starts and seeds default groups and board views on first launch.
- [x] 6.2 Verify creating a todo through Enter persists it and displays it in the current group.
- [x] 6.3 Verify Tab switches input groups and wraps from the last group to the first.
- [x] 6.4 Verify Shift + Tab switches board views and that 所有 displays every group.
- [x] 6.5 Verify Arrow Up / Arrow Down moves the selected todo.
- [x] 6.6 Verify Command + Enter completes the selected todo and sets completed_at.
- [x] 6.7 Verify completed todos appear on the Weekly page grouped by date.
- [x] 6.8 Verify copied weekly Markdown contains the expected date headings and todo bullets.
- [x] 6.9 Verify archived todos are hidden from the board.
- [x] 6.10 Verify todos persist after quitting and restarting the app.
- [x] 6.11 Run frontend type checks and Rust checks.
- [x] 6.12 Run OpenSpec validation for implement-first-phase-mvp.
