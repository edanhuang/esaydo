## Context

EasyDo is currently a product vision document and an empty Git repository. The MVP needs to establish a working local-first desktop application that proves the core loop: detail-only todo capture, grouped board display, keyboard completion, and weekly worklog generation.

The implementation will use Tauri for the desktop shell and local system access, React + TypeScript + Vite for the UI, and SQLite as the single source of truth. The first implementation should optimize for a narrow P0 path rather than complete settings, tags, AI, sync, CLI, or MCP support.

## Goals / Non-Goals

**Goals:**

- Create a runnable desktop application foundation.
- Persist todos, groups, board views, and lifecycle events in local SQLite.
- Seed default groups and board views on first launch.
- Support keyboard-first creation, selection, completion, and archiving of detail-only todos.
- Generate a weekly worklog from completed todos and support copying it.
- Keep the data model extensible enough for tags, CLI, AI, and MCP later.

**Non-Goals:**

- No cloud sync, account system, collaboration, reminders, attachments, AI generation, CLI, or MCP server.
- No full settings management in P0 beyond required seed data and minimal group creation command.
- No title/description split for todos.
- No heavy project-management concepts such as due dates, priorities, subtasks, calendars, or Gantt views.

## Decisions

### Use the simple Tauri project layout for MVP

The MVP will use `src-tauri/` for Rust/Tauri code and `src/` for React code instead of a full monorepo with crates and packages.

Rationale: the first phase needs to prove the product loop. A monorepo can be introduced later if CLI/MCP reuse creates real pressure. The Rust code should still be organized internally into focused modules such as `db`, `models`, `commands`, and `seed`.

Alternatives considered:

- Full monorepo from day one: clearer future boundaries, but more setup overhead before the product loop exists.
- Electron: simpler desktop ecosystem, but larger runtime footprint than desired for a lightweight local tool.

### Make SQLite the only durable data source

React state will be treated as a UI cache. Tauri commands will read and write SQLite, and pages will refresh from commands after mutations.

Rationale: this keeps persistence rules centralized and prevents the frontend from becoming a second source of truth. It also creates a clean path for future CLI/MCP access through the same local data contracts.

Alternatives considered:

- Browser local storage: faster to prototype, but weak for structured weekly queries and future event analysis.
- JSON files: simple, but awkward for group filters, date aggregation, and future history queries.

### Seed default workspace data during database initialization

On first launch, the app will create default groups `工作`, `学习`, `健身`, `生活`, and `个人项目`, plus default board views `所有`, `工作`, and `个人`.

Rationale: the keyboard workflow depends on having input groups immediately available. Seeding also lets the app show useful structure without a settings page.

`所有` will be represented as a board view with no associated groups, meaning no group filter. Other board views will store their group memberships in `board_view_groups`.

### Store timestamps as ISO-8601 strings

The backend will store `created_at`, `updated_at`, `completed_at`, and `archived_at` as ISO-8601 text values. Weekly boundaries will be computed using the user's local timezone, with Monday as the start of week.

Rationale: SQLite text timestamps are easy to inspect and sort when consistently formatted. Monday-start weeks match the worklog use case.

### Implement tags as schema placeholders, not P0 UI behavior

The SQLite schema may include `tags` and `todo_tags`, but P0 implementation does not need full tag management or tag editing UI.

Rationale: the vision calls for tags, but the first useful product loop does not depend on them. Keeping the tables avoids early migration churn while keeping UI scope tight.

## Risks / Trade-offs

- P0 schema includes future-facing tables → Keep commands and UI scoped to the MVP path, and avoid building unused management screens prematurely.
- Keyboard shortcuts may conflict with text input behavior → Centralize shortcut handling and explicitly bypass global shortcuts while multiline editors or popovers are focused.
- Tauri/Rust SQLite setup may slow early UI iteration → Implement a small command set first and use typed frontend adapters around `invoke`.
- Force-fitting all future architecture into the first app may slow delivery → Keep file organization clean but avoid splitting crates/packages until reuse is needed.
- Weekly aggregation can be wrong around timezone boundaries → Compute week start/end in local time and pass explicit date boundaries to backend queries.

## Migration Plan

1. Initialize the Tauri + React + TypeScript project in this repository.
2. Add SQLite dependency, database initialization, migrations, and seed data.
3. Add the minimum Tauri command surface required by the MVP.
4. Build the board page around real command data.
5. Build the weekly page and copy action.
6. Verify persistence by restarting the app and reloading todos from SQLite.

Rollback is straightforward during MVP development: remove the generated app files or reset to the previous Git commit. No production migration is required because no existing app data exists yet.

## Open Questions

- Whether P0 should include a visible archive action, or only the backend command and hidden archived todos.
- Whether copied weekly output should default to Markdown or plain text. The implementation can support Markdown first and add a format toggle if cheap.
