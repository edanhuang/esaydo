## Context

Board 是现有列表页，当前由 `BoardPage` 同时维护当前 View、当前输入 Group 和 Todo 数据。左侧栏同时展示 Board Views 与 Input Group，顶部标题重复展示两种状态；后端通过 `board_view_groups` 保存 View 与 Group 的多对多关系，但只有读取接口，没有更新接口。

现有 `list_todos(board_view_id)` 以“View 的 Group 列表为空”代表不过滤。这只适用于系统保留的 `所有` View，无法表达普通 View 删除全部 Group 后应显示空 Board 的状态。

本变更沿用现有 React、Tailwind、shadcn/ui、Tauri 和 SQLite 技术栈，不引入新依赖。页面类型为现有列表页改造；仓库中不存在 `templates/scene-list.md`、`templates/common-page.md` 和 `.cursor/rules/001-ai-friendly-standard.mdc`，实现时以现有 `BoardPage`、`DailyPage`、shadcn 组件规范和项目测试风格为准。

## Goals / Non-Goals

**Goals:**

- 将 View 切换集中到 Board 顶部，并提供低视觉压力的折叠、展开和滑动反馈。
- 保持 View 只负责筛选 Group，Todo 创建只负责归属当前输入 Group。
- 允许普通 View 在左侧栏直接添加或移除 Group，并持久化关系。
- 明确区分系统 `所有` View 与普通空 View 的筛选语义。
- 保留 `Tab` 切换输入 Group、`Shift+Tab` 切换 View 的键盘工作流。

**Non-Goals:**

- 不新增、删除、重命名或排序 View。
- 不新增、删除、重命名或排序 Group。
- 不允许修改 `所有` View 的 Group 成员。
- 不改变 Todo 多 Group 数据模型、Daily 页面或 Settings 快捷键配置。

## Decisions

### 1. 使用独立的顶部 View 切换组件

新增 `BoardViewSwitcher`，由 `BoardPage` 传入 View 列表、当前索引和切换回调。组件内部只维护展开状态、动画方向和指针拖拽状态，不直接请求数据。

- 常态仅渲染当前 View 名称，减少持续视觉信息。
- 鼠标进入容器后展开完整横向列表；当前项保持完整透明度，其他项降低透明度。
- 点击 View 或 `Shift+Tab` 时设置切换方向并触发横向位移动画。
- 鼠标仍位于容器内时保持展开；鼠标离开后收起为当前项。
- 指针横向拖拽时移动列表，释放后选择最接近容器中心的 View；首尾不在拖拽时循环，`Shift+Tab` 明确循环。

选择独立组件而非继续堆叠在 `BoardPage`，是为了隔离 pointer 事件、动画状态和可访问性属性，避免 Board 主状态逻辑继续膨胀。

### 2. View 切换统一走一个状态入口

`BoardPage` 提供按索引切换的方法，点击、拖拽和 `Shift+Tab` 最终都调用同一入口。入口负责：

- 更新当前 View 索引。
- 重新加载该 View 可见的 Todo。
- 清除当前 Todo 选择和拖拽状态。
- 保留当前输入 Group，不因 View 变化而重置。

### 3. Todo 输入 Group 与 View 完全解耦

`submitTodo` 始终调用 `createTodo(detail, [currentGroup.id])`，创建成功后重新读取当前 View 的 Todo。这样：

- 若输入 Group 属于当前 View，新 Todo 立即出现。
- 若输入 Group 不属于当前 View，新 Todo 已成功保存，但当前 Board 不显示它。

点击 Group 栏标题区域或该 Group 中任意 Todo 时，先更新 `currentGroupIndex`，再执行 Todo 选择。`Tab` 始终按全部 Group 的排序循环，不限制在当前 View。

### 4. 左侧栏展示全部 Group，以 View 成员关系决定高亮和操作

移除左侧 Board Views 区域。Input Group 区域继续列出全部 Group：

- 当前普通 View 包含的 Group 使用浅色高亮。
- 未包含的 Group 保持普通状态。
- 当前输入 Group 不额外高亮。
- 行悬停或键盘聚焦时，右侧显示 `+` 或 `-`。
- `+/-` 点击只修改 View 成员，不改变当前输入 Group。
- `所有` View 下所有 Group 视为包含，但不展示 `+/-`，也不允许修改。

### 5. 新增原子化 View-Group 更新命令

新增 Tauri 命令 `set_board_view_group_membership(board_view_id, group_id, included)`：

- 校验 View 和 Group 存在。
- 拒绝修改名称为 `所有` 的系统保留 View。
- `included=true` 时使用幂等插入。
- `included=false` 时删除关系。
- 更新 View 的 `updated_at`。
- 返回更新后的 `BoardViewWithGroups`，前端可直接替换本地 View。

采用单 Group 原子更新，而不是每次提交完整 Group ID 数组，可减少并发覆盖和前端组装错误。

### 6. 后端显式识别 `所有` View

`list_todos` 不再用 Group 数量推断“全部”：

- 未传 `board_view_id` 时返回全部未归档 Todo。
- 传入名称为 `所有` 的 View 时返回全部未归档 Todo。
- 普通 View 有 Group 时按 Group 过滤。
- 普通 View 无 Group 时返回空数组。

前端 `groupsForView` 同样按 `所有` View 显示全部 Group，普通空 View 显示零个 Group。

## Risks / Trade-offs

- [风险] View 切换动画与异步加载完成顺序不一致，可能短暂显示旧数据。  
  → 切换入口立即更新索引并显示已有布局动画，Todo 数据只接受最近一次请求对应的 View，必要时使用请求序号丢弃过期响应。

- [风险] 横向拖拽与点击产生冲突。  
  → 设置最小拖拽阈值；超过阈值后抑制 click，释放时按最近 View 决定目标。

- [风险] 普通 View 删除最后一个 Group 后页面为空，用户可能误以为加载失败。  
  → Board 主区域显示明确的空 View 提示，左侧仍可通过 `+` 恢复 Group。

- [风险] `所有` 依赖名称识别，用户未来若支持重命名会不稳定。  
  → 当前版本不支持 View 重命名；后续若引入管理能力，应增加持久化的系统 View 类型字段。

- [取舍] 点击 Todo 会改变输入 Group，可能让输入目标随浏览行为变化。  
  → 这是本次确认的交互规则，输入框左侧始终显示当前 Group 名称作为反馈。

## Migration Plan

1. 不变更表结构，仅新增命令并修改查询语义。
2. 现有 `board_view_groups` 数据直接复用。
3. 先完成后端命令和查询测试，再接入前端交互。
4. 如需回滚，可移除新命令并恢复旧前端；数据库关系数据仍兼容旧版本。

## Open Questions

无。需求口径已确认。
