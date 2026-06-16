## MODIFIED Requirements

### Requirement: Grouped board display
系统 SHALL 根据当前 View 包含的普通 Group 展示未归档且未逻辑删除的 Todo；`所有` View SHALL 展示全部普通 Group但排除系统收件箱，普通空 View SHALL 不展示任何 Group。

#### Scenario: New todo appears in its group
- **WHEN** Todo 创建到当前 View 包含的普通 Group
- **THEN** Todo 显示在该 Group 的 Board 栏中

#### Scenario: Todo outside current View remains hidden
- **WHEN** Todo 创建到当前 View 未包含的 Group
- **THEN** Todo 成功保存，但不显示在当前 Board

#### Scenario: Archived todo is hidden
- **WHEN** Todo 状态为 `archived`
- **THEN** Todo 不显示在 Board

#### Scenario: Logically deleted todo is hidden
- **WHEN** Todo 的 deleted_at 非空
- **THEN** Todo 不显示在任何 Board View

#### Scenario: All View excludes inbox
- **WHEN** 当前 View 为系统保留的 `所有`
- **THEN** Board 展示全部普通 Group但不展示收件箱

#### Scenario: Empty regular View displays no groups
- **WHEN** 普通 View 不包含任何 Group
- **THEN** Board 不展示任何 Group，并显示空 View 状态

### Requirement: Input group switching
系统 SHALL 允许用户通过点击普通 Group 栏、点击该栏 Todo 或按 `Tab` 在全部普通 Group 中选择当前输入 Group，且 MUST 排除系统收件箱。

#### Scenario: Clicking a group selects input group
- **WHEN** 用户点击某个普通 Group 栏
- **THEN** 该 Group 成为当前输入 Group

#### Scenario: Clicking a todo selects its group
- **WHEN** 用户点击普通 Group 栏中的 Todo
- **THEN** 该栏对应的 Group 成为当前输入 Group

#### Scenario: Tab advances current input group
- **WHEN** 用户在 Todo 输入框按下 `Tab`
- **THEN** 当前输入 Group 按全部普通 Group 的排序切换到下一个

#### Scenario: Input group wraps
- **WHEN** 用户在最后一个普通 Group 为当前输入 Group 时按下 `Tab`
- **THEN** 当前输入 Group 切换到第一个普通 Group

### Requirement: Board view switching
系统 SHALL 允许用户通过顶部 View 切换器或 `Shift+Tab` 切换当前普通 Board View，并保持当前输入 Group 不变；当前 View 没有可见 Todo 时 SHALL 持续展开普通 View 列表。

#### Scenario: Shift Tab advances board view
- **WHEN** 用户在普通 View 按下 `Shift+Tab`
- **THEN** 当前普通 View 按排序切换到下一个，最后一个切换后回到第一个

#### Scenario: All board view shows every regular group
- **WHEN** 当前 View 为 `所有`
- **THEN** Board 展示全部普通 Group但排除收件箱

#### Scenario: View switch preserves input group
- **WHEN** 用户切换当前 View
- **THEN** 当前输入 Group 保持不变，即使该 Group 不属于新 View

#### Scenario: Empty View keeps switcher expanded
- **WHEN** 当前 View 没有任何可见 Todo
- **THEN** 顶部持续展开全部普通 View供用户直接点击切换

#### Scenario: Non-empty View restores compact switcher
- **WHEN** 当前 View 至少存在一条可见 Todo
- **THEN** 顶部 View 切换器恢复现有悬停或聚焦展开行为
