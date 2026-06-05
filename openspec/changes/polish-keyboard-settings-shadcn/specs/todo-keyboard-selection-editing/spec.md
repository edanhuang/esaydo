## ADDED Requirements

### Requirement: Todo 选中态
系统 SHALL 为当前可见 Todo 列表维护一个选中态，并在鼠标点击或键盘切换时更新选中 Todo。

#### Scenario: 鼠标点击选中 Todo
- **WHEN** 用户点击一个可见 Todo 项
- **THEN** 系统将该 Todo 设置为当前选中 Todo
- **THEN** 系统以可见样式标识该 Todo 的选中态

#### Scenario: 列表刷新后保留选中 Todo
- **WHEN** Todo 列表刷新且当前选中 Todo 仍然可见
- **THEN** 系统保留该 Todo 的选中态

#### Scenario: 当前选中 Todo 不再可见
- **WHEN** Todo 列表刷新且当前选中 Todo 不再可见
- **THEN** 系统选择第一个可见 Todo
- **THEN** 如果没有可见 Todo，系统清空选中态

### Requirement: 键盘切换选中 Todo
系统 SHALL 在 EasyDo 窗口激活且未处于 Settings 或编辑态时，通过 `Cmd+ArrowUp/Down` 在可见 Todo 中切换选中态。

#### Scenario: 选择下一个 Todo
- **WHEN** 用户按下 `Cmd+ArrowDown` 且存在下一个可见 Todo
- **THEN** 系统选中下一个可见 Todo

#### Scenario: 选择上一个 Todo
- **WHEN** 用户按下 `Cmd+ArrowUp` 且存在上一个可见 Todo
- **THEN** 系统选中上一个可见 Todo

#### Scenario: 到达列表边界
- **WHEN** 用户已经选中第一个 Todo 并按下 `Cmd+ArrowUp`
- **THEN** 系统保持第一个 Todo 选中

#### Scenario: 到达列表末尾
- **WHEN** 用户已经选中最后一个 Todo 并按下 `Cmd+ArrowDown`
- **THEN** 系统保持最后一个 Todo 选中

### Requirement: 选中 Todo 内联编辑
系统 SHALL 在选中 Todo 上通过 `Space` 进入内联编辑，并在编辑态内保存或取消内容变更。

#### Scenario: Space 进入编辑
- **WHEN** 用户选中一个 Todo 且未处于编辑态时按下 `Space`
- **THEN** 系统在该 Todo 项内显示内容输入控件
- **THEN** 系统聚焦输入控件并填入当前 Todo 内容

#### Scenario: Enter 保存编辑
- **WHEN** 用户在 Todo 内联编辑态输入非空内容并按下 `Enter`
- **THEN** 系统保存 Todo 内容
- **THEN** 系统退出编辑态并保持该 Todo 选中

#### Scenario: Esc 取消编辑
- **WHEN** 用户在 Todo 内联编辑态按下 `Esc`
- **THEN** 系统丢弃未保存内容
- **THEN** 系统退出编辑态并保持该 Todo 选中

#### Scenario: 空内容不保存
- **WHEN** 用户在 Todo 内联编辑态将内容清空并按下 `Enter`
- **THEN** 系统阻止保存
- **THEN** 系统保持编辑态

### Requirement: 完成和回溯完成态快捷键
系统 SHALL 在未处于编辑态时通过 `Cmd+Enter` 切换选中 Todo 的完成状态。

#### Scenario: 完成 active Todo
- **WHEN** 用户选中 active Todo 并按下 `Cmd+Enter`
- **THEN** 系统将该 Todo 标记为 done
- **THEN** 系统记录对应 Todo 事件日志

#### Scenario: 回溯 done Todo
- **WHEN** 用户选中 done Todo 并按下 `Cmd+Enter`
- **THEN** 系统将该 Todo 回溯为 active
- **THEN** 系统记录对应 Todo 事件日志

#### Scenario: 编辑态不切换完成状态
- **WHEN** 用户正在编辑 Todo 内容并按下 `Cmd+Enter`
- **THEN** 系统不完成或回溯该 Todo

### Requirement: 不打开 detail 弹层
系统 MUST 在本阶段通过列表内联编辑处理 Todo 内容，不通过快捷键打开 detail 弹层。

#### Scenario: Space 不打开 detail
- **WHEN** 用户选中 Todo 并按下 `Space`
- **THEN** 系统进入列表内联编辑
- **THEN** 系统不打开 detail 弹层
