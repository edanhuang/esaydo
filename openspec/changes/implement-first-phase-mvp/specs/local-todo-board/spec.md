## ADDED Requirements

### Requirement: Detail-only todo capture
The system SHALL allow users to create a todo from a single required `detail` text input without requiring a title, description, due date, priority, or project field.

#### Scenario: Create todo from current input group
- **WHEN** the user enters non-empty detail text and presses Enter
- **THEN** the system creates an active todo assigned to the current input group and clears the input

#### Scenario: Ignore empty todo input
- **WHEN** the user presses Enter with an empty or whitespace-only todo input
- **THEN** the system does not create a todo and keeps the app state unchanged

### Requirement: Grouped board display
The system SHALL display active and done todos grouped by their assigned groups on the main board, while archived todos MUST be hidden by default.

#### Scenario: New todo appears in its group
- **WHEN** a todo is created for a group visible in the current board view
- **THEN** the todo appears under that group's board section

#### Scenario: Archived todo is hidden
- **WHEN** a todo has status `archived`
- **THEN** the todo does not appear on the default board

### Requirement: Input group switching
The system SHALL allow users to switch the current input group with Tab across the available groups.

#### Scenario: Tab advances current input group
- **WHEN** the user presses Tab from the todo input
- **THEN** the current input group advances to the next group in sort order

#### Scenario: Input group wraps
- **WHEN** the user presses Tab while the last group is current
- **THEN** the current input group becomes the first group in sort order

### Requirement: Board view switching
The system SHALL allow users to switch the current board view with Shift + Tab across the available board views.

#### Scenario: Shift Tab advances board view
- **WHEN** the user presses Shift + Tab
- **THEN** the current board view advances to the next board view in sort order

#### Scenario: All board view shows every group
- **WHEN** the current board view has no group filter
- **THEN** the board displays todos from all groups

### Requirement: Keyboard todo selection
The system SHALL allow users to move the selected todo with Arrow Up and Arrow Down.

#### Scenario: Arrow Down selects next todo
- **WHEN** a todo is selected and the user presses Arrow Down
- **THEN** the next visible todo becomes selected

#### Scenario: Arrow Up selects previous todo
- **WHEN** a todo is selected and the user presses Arrow Up
- **THEN** the previous visible todo becomes selected

### Requirement: Todo completion
The system SHALL allow users to complete the selected active todo with Command + Enter.

#### Scenario: Complete selected todo
- **WHEN** an active todo is selected and the user presses Command + Enter
- **THEN** the todo status becomes `done` and `completed_at` is set to the current time

#### Scenario: Completed todo records event
- **WHEN** a todo is completed
- **THEN** the system records a `completed` todo event with the todo detail as event content

### Requirement: Todo archiving
The system SHALL support archiving todos by changing their status to `archived` and setting `archived_at`.

#### Scenario: Archive todo
- **WHEN** the system archives a todo
- **THEN** the todo status becomes `archived` and `archived_at` is set to the current time

#### Scenario: Archived todo records event
- **WHEN** a todo is archived
- **THEN** the system records an `archived` todo event
