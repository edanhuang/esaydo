## MODIFIED Requirements

### Requirement: Grouped board display
系统 SHALL 根据当前 View 包含的 Group 展示未归档 Todo；`所有` View SHALL 展示全部 Group，普通空 View SHALL 不展示任何 Group。

#### Scenario: New todo appears in its group
- **WHEN** Todo 创建到当前 View 包含的 Group
- **THEN** Todo 显示在该 Group 的 Board 栏中

#### Scenario: Todo outside current View remains hidden
- **WHEN** Todo 创建到当前 View 未包含的 Group
- **THEN** Todo 成功保存，但不显示在当前 Board

#### Scenario: Archived todo is hidden
- **WHEN** Todo 状态为 `archived`
- **THEN** Todo 不显示在 Board

#### Scenario: Empty regular View displays no groups
- **WHEN** 普通 View 不包含任何 Group
- **THEN** Board 不展示任何 Group，并显示空 View 状态

### Requirement: Input group switching
系统 SHALL 允许用户通过点击 Group 栏、点击该栏 Todo 或按 `Tab` 在全部 Group 中选择当前输入 Group，且选择范围不受当前 View 限制。

#### Scenario: Clicking a group selects input group
- **WHEN** 用户点击某个 Group 栏
- **THEN** 该 Group 成为当前输入 Group

#### Scenario: Clicking a todo selects its group
- **WHEN** 用户点击某个 Group 栏中的 Todo
- **THEN** 该栏对应的 Group 成为当前输入 Group

#### Scenario: Tab advances current input group
- **WHEN** 用户在 Todo 输入框按下 `Tab`
- **THEN** 当前输入 Group 按全部 Group 的排序切换到下一个

#### Scenario: Input group wraps
- **WHEN** 用户在最后一个 Group 为当前输入 Group 时按下 `Tab`
- **THEN** 当前输入 Group 切换到第一个 Group

### Requirement: Detail-only todo capture
系统 SHALL 从单个必填 `detail` 输入创建 Todo，并始终将 Todo 分配到当前输入 Group；创建行为 MUST 与当前 View 解耦。

#### Scenario: Create todo from current input group
- **WHEN** 用户输入非空 Todo 内容并按 Enter
- **THEN** 系统创建 active Todo、绑定当前输入 Group并清空输入框

#### Scenario: Create todo outside current View
- **WHEN** 当前输入 Group 不属于当前 View且用户提交 Todo
- **THEN** 系统仍创建 Todo 并绑定该 Group，但当前 Board 不展示该 Todo

#### Scenario: Ignore empty todo input
- **WHEN** 用户以空白内容提交 Todo
- **THEN** 系统不创建 Todo且保持应用状态不变

### Requirement: Board view switching
系统 SHALL 允许用户通过顶部 View 切换器或 `Shift+Tab` 切换当前 Board View，并保持当前输入 Group 不变。

#### Scenario: Shift Tab advances board view
- **WHEN** 用户按下 `Shift+Tab`
- **THEN** 当前 View 按排序切换到下一个，最后一个切换后回到第一个

#### Scenario: All board view shows every group
- **WHEN** 当前 View 为 `所有`
- **THEN** Board 展示全部 Group

#### Scenario: View switch preserves input group
- **WHEN** 用户切换当前 View
- **THEN** 当前输入 Group 保持不变，即使该 Group 不属于新 View
