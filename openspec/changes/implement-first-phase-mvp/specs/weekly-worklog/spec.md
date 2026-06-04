## ADDED Requirements

### Requirement: Weekly completed todo aggregation
The system SHALL display completed todos whose `completed_at` falls within the selected week.

#### Scenario: Completed todo appears in weekly view
- **WHEN** a todo has status `done` and `completed_at` is within the current week
- **THEN** the weekly page displays the todo

#### Scenario: Active todo is excluded
- **WHEN** a todo has status `active`
- **THEN** the weekly page does not display the todo

#### Scenario: Completed todo outside selected week is excluded
- **WHEN** a todo has status `done` and `completed_at` is outside the selected week
- **THEN** the weekly page does not display the todo for the selected week

### Requirement: Date-grouped worklog display
The system SHALL group weekly completed todos by completion date and sort them by completion time.

#### Scenario: Group completed todos by date
- **WHEN** multiple completed todos exist on different dates within the week
- **THEN** the weekly page displays separate date groups for those completion dates

#### Scenario: Sort todos within a date group
- **WHEN** multiple completed todos exist on the same date
- **THEN** the weekly page displays them in ascending completion time order

### Requirement: Copyable Markdown worklog
The system SHALL allow users to copy the weekly completed todo list as Markdown.

#### Scenario: Copy weekly Markdown
- **WHEN** the user clicks the copy worklog action
- **THEN** the clipboard receives Markdown containing a heading, date headings, and todo detail bullet items

#### Scenario: Copy empty week
- **WHEN** the user copies a week with no completed todos
- **THEN** the clipboard receives a valid empty weekly worklog message

### Requirement: Local workweek boundaries
The system SHALL use the user's local timezone and Monday as the start of week when querying the current weekly worklog.

#### Scenario: Current week starts Monday
- **WHEN** the weekly page loads without an explicit date range
- **THEN** the system queries completed todos from local Monday 00:00:00 through the end of local Sunday
