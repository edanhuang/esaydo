## ADDED Requirements

### Requirement: SQLite database initialization
The system SHALL initialize a local SQLite database in the application data directory when the desktop app starts.

#### Scenario: First launch creates database
- **WHEN** the user starts the app and no EasyDo database exists
- **THEN** the system creates the database file and applies all MVP migrations

#### Scenario: Existing database is reused
- **WHEN** the user starts the app and an EasyDo database already exists
- **THEN** the system reuses the existing database without deleting user data

### Requirement: MVP schema migrations
The system SHALL create tables for todos, groups, tags, todo-group relations, todo-tag relations, board views, board-view group relations, and todo events.

#### Scenario: Apply base schema
- **WHEN** database initialization runs for an empty database
- **THEN** all MVP tables exist with primary keys and required foreign key relationships

#### Scenario: Foreign keys cascade relation cleanup
- **WHEN** a todo is deleted by a future maintenance path
- **THEN** related todo group and todo tag rows are removed by foreign key cascade rules

### Requirement: Default seed data
The system SHALL seed default groups and board views on first launch.

#### Scenario: Seed default groups
- **WHEN** the database is initialized without existing groups
- **THEN** the system creates groups named `工作`, `学习`, `健身`, `生活`, and `个人项目`

#### Scenario: Seed default board views
- **WHEN** the database is initialized without existing board views
- **THEN** the system creates board views named `所有`, `工作`, and `个人`

#### Scenario: Seed data is idempotent
- **WHEN** the app starts after seed data already exists
- **THEN** the system does not create duplicate groups or board views

### Requirement: Tauri command data access
The system SHALL expose Tauri commands for the MVP data flow and route durable mutations through SQLite.

#### Scenario: Create todo command persists data
- **WHEN** the frontend invokes `create_todo` with detail and group IDs
- **THEN** the backend persists the todo, creates group relations, records a `created` event, and returns the created todo

#### Scenario: List todos command returns relations
- **WHEN** the frontend invokes `list_todos` with an optional board view ID
- **THEN** the backend returns visible todos with their group and tag relations according to the board view filter

#### Scenario: Complete todo command persists status
- **WHEN** the frontend invokes `complete_todo` for an active todo
- **THEN** the backend stores status `done`, sets `completed_at`, records a `completed` event, and returns the updated todo

#### Scenario: List weekly done command returns completed items
- **WHEN** the frontend invokes `list_weekly_done` with a start and end date
- **THEN** the backend returns done todos whose `completed_at` falls within the requested range

### Requirement: Data survives app restart
The system SHALL preserve todo and group data across app restarts.

#### Scenario: Todo persists after restart
- **WHEN** the user creates a todo, exits the app, and starts the app again
- **THEN** the todo is loaded from SQLite and displayed in the appropriate group
