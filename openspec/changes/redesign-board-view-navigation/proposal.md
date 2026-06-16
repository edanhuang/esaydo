## Why

当前 Board View 与输入 Group 都集中在左侧栏，页面标题还同时展示 View 与输入目标，造成信息重复且切换路径分散。需要把 View 提升为 Board 顶部的轻量筛选导航，并让 Todo 输入目标只由 Group 决定，使 View 专注于筛选、Group 专注于归类。

## What Changes

- 移除左侧栏的 Board Views 列表，在 Board 顶部新增可展开的横向 View 切换器。
- View 切换器常态只展示当前 View；鼠标进入后展示全部 View，未选中项降低透明度，并支持点击、横向拖拽和 `Shift+Tab` 从左到右循环切换。
- 移除 Board 顶部“View / 输入到 Group”组合标题。
- Todo 创建始终绑定当前输入 Group，与当前 View 是否包含该 Group 无关。
- 点击 Group 栏或其中任意 Todo 时，将该 Group 设为当前输入 Group；`Tab` 继续在全部 Group 中循环切换。
- 左侧栏继续展示全部 Group，仅高亮当前 View 包含的 Group；悬停时显示 `+` 或 `-`，用于修改普通 View 的 Group 成员关系。
- `所有` View 固定代表全部 Group，不允许通过 `+/-` 修改。
- 新增持久化普通 View 与 Group 关联的 Tauri 命令，并明确普通 View 零 Group 时显示空 Board，不再被解释为全部 Group。

## Capabilities

### New Capabilities
- `board-view-navigation`: Board 顶部 View 导航、动画展开收起、点击/拖拽/键盘切换及循环行为。
- `board-view-group-membership`: 普通 View 的 Group 成员展示、增删交互、持久化和保留 View 约束。

### Modified Capabilities
- `local-todo-board`: 调整 View 筛选语义、Todo 输入 Group 选择方式，以及 Todo 创建与当前 View 的解耦规则。

## Impact

- 前端涉及 `BoardPage`、`AppSidebar`、`TodoInput`、`GroupSection` 及新增顶部 View 切换组件。
- API 层新增更新 Board View Group 成员关系的方法。
- Tauri/Rust 层新增关系更新命令，并调整 `list_todos` 对“所有 View”和普通空 View 的区分。
- 测试需要覆盖 View 展开/切换、循环快捷键、输入 Group 跟随、跨 View 创建、侧栏成员增删与保留 View 禁改。
