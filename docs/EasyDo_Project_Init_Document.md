# EasyDo 项目初始化说明文档

## 1. 项目名称

**EasyDo**

## 2. 项目定位

EasyDo 是一个面向个人开发者 / 知识工作者的本地优先 Todo + Worklog 工具。

它不是传统 Todo App，也不是 Notion / Trello / Jira 的替代品。EasyDo 的核心目标是：

> 用极低维护成本记录 Todo，并通过 Todo 的完成动作自动沉淀每周工作记录。

用户每天只需要维护 Todo，看板负责承接当前要做的事情；当 Todo 被完成后，系统自动记录完成时间，并在「本周完成内容」视图中聚合，方便用户每周五填写工时、写周报、做复盘。

## 3. 用户痛点

当前用户可以用 Notion 记录每天做了什么，也可以用 Notion 看板维护剩余 Todo，但这两者是割裂的：

- 如果只维护 Todo 看板，周五录工时时无法精确回忆每天做了哪些工作。
- 如果同时维护 Todo 看板和每日工作记录，会产生重复维护成本。
- Todo 和每日记录可能不对齐，导致周报 / 工时内容不准确。
- 普通 Todo App 只关注“待办是否完成”，但不关心“完成后如何沉淀为工作记录”。
- 用户希望工作流足够跟手，不想每次新增 Todo 都填写标题、描述、项目、优先级等复杂字段。

因此 EasyDo 要解决的问题是：

> Todo 本身就是工作记录的源头。完成 Todo 的动作，应该自然形成 Worklog。

## 4. 产品核心原则

### 4.1 Detail-only Todo

Todo 默认只有一个必填输入内容：

```text
detail
```

不要设计 title / description 两段式输入。

原因：

- 用户认为输入标题、描述会增加维护成本。
- 高频 Todo 捕获应该像聊天框输入一句话一样轻。
- Todo 的核心内容就是 detail。
- 附加说明可以放在二级编辑区，不应影响默认录入流程。

### 4.2 键盘优先

EasyDo 的核心体验是 keyboard-first。

用户应该可以在不频繁使用鼠标的情况下完成主要操作：

- 切换当前输入分组
- 新增 Todo
- 移动选中 Todo
- 完成 Todo
- 切换当前看板视图
- 打开 Todo 详情
- 复制本周 Worklog

### 4.3 本地优先

EasyDo 第一阶段是本地优先 App：

- 数据默认存在本地 SQLite。
- 不依赖远程服务。
- 可以离线使用。
- 后续可以扩展同步，但 MVP 不做云同步。
- 未来 CLI / AI / MCP 都应基于本地数据能力扩展。

### 4.4 Todo 到 Worklog 的自动沉淀

一个 Todo 完成后，不只是状态变更，还应该成为一条可被周报 / 工时 / 年度总结使用的历史记录。

MVP 阶段可以通过 `completed_at` 聚合本周完成内容；长期建议保留事件表 `todo_events`，记录 Todo 生命周期，方便未来 AI 分析。

## 5. 核心功能范围

### 5.1 MVP 必做功能

第一版只做最关键闭环：

```text
输入 detail
→ 进入指定分组
→ 在看板中展示
→ 快捷键完成
→ 自动进入本周完成列表
→ 一键复制本周工时内容
```

MVP 功能清单：

- Todo 创建
- Todo 状态流转
  - active：未完成
  - done：已完成
  - archived：已归档
- Todo 分组
- Todo 标签
- Todo 附加长文本
- 默认按分组展示 Todo 看板
- 当前输入分组切换
- 自定义看板视图
- 本周完成内容视图
- 一键复制本周完成内容
- 本地 SQLite 持久化

### 5.2 暂不做功能

以下能力不要进入第一版：

- 云同步
- 图片附件
- 文件附件
- 多人协作
- 截止日期
- 提醒
- 日历同步
- 甘特图
- 复杂优先级
- 子任务
- 复杂项目管理
- 内置 AI 模型
- 账号系统

这些功能不是永远不做，而是不进入 MVP，避免破坏 EasyDo 的轻量和跟手感。

## 6. 核心交互设计

### 6.1 默认看板模式

默认看板按分组展示 Todo。

示例：

```text
工作
- 梳理检查合并处罚灰度方案
- 设计质检单成本公式
- 修复检查结果映射问题

学习
- 看 RAG 混合检索资料
- 阅读 TencentDB Agent Memory

健身
- 晚上爬坡 30 分钟
- 今天练胸
```

默认展示：

- active Todo
- done Todo 可以显示为灰色 / 划线 / 带勾状态
- archived Todo 默认不展示

### 6.2 Todo 详情气泡

双击 Todo 或使用快捷键打开 Todo 详情 Popover。

Popover 中展示和编辑：

- detail
- groups
- tags
- extra_text

其中 `extra_text` 是附加长文本，第一版只做文本，不做图片和富文本。

Popover 不应变成复杂弹窗，要保持轻量。

### 6.3 Tab 切换当前输入分组

`Tab` 用于切换当前输入分组。

示例：

```text
当前输入分组：[工作] 学习 健身 生活
按一次 Tab：工作 [学习] 健身 生活
再按一次 Tab：工作 学习 [健身] 生活
```

当用户输入 Todo 并按 Enter 时，新 Todo 会被加入当前输入分组。

### 6.4 Enter 新增 Todo

底部或顶部应有一个极简输入框。

用户输入：

```text
整理检查合并处罚灰度方案
```

按 Enter 后创建 Todo：

```text
detail = "整理检查合并处罚灰度方案"
groups = 当前输入分组
status = active
```

输入框清空，等待下一条输入。

### 6.5 Command + Enter 完成 Todo

用户选中一个 Todo 后，按：

```text
Command + Enter
```

Todo 状态变为：

```text
status = done
completed_at = now
```

同时写入事件：

```text
event_type = completed
created_at = now
content = todo.detail
```

### 6.6 Shift + Tab 切换展示看板视图

`Shift + Tab` 用于切换当前展示的 Board View。

Board View 是一组分组过滤器，不只是单个分组。

示例：

```text
所有 = 展示所有分组
工作 = 只展示工作分组
个人 = 展示 学习 + 健身 + 生活
GETON = 展示 GETON + 大模型学习 + 产品想法
```

这样用户在工作时可以只看工作相关内容，下班后可以切换到个人相关内容。

## 7. 数据模型设计

### 7.1 Todo

```ts
type TodoStatus = "active" | "done" | "archived";

interface Todo {
  id: string;
  detail: string;
  status: TodoStatus;
  extraText?: string | null;

  createdAt: string;
  updatedAt: string;
  completedAt?: string | null;
  archivedAt?: string | null;
}
```

### 7.2 Group

```ts
interface Group {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

### 7.3 Tag

```ts
interface Tag {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

### 7.4 TodoGroup

一个 Todo 可以属于多个分组。

```ts
interface TodoGroup {
  todoId: string;
  groupId: string;
}
```

### 7.5 TodoTag

一个 Todo 可以有多个标签。

```ts
interface TodoTag {
  todoId: string;
  tagId: string;
}
```

### 7.6 BoardView

自定义看板视图，本质是一组 group 过滤器。

```ts
interface BoardView {
  id: string;
  name: string;
  sortOrder: number;
  createdAt: string;
  updatedAt: string;
}
```

### 7.7 BoardViewGroup

```ts
interface BoardViewGroup {
  boardViewId: string;
  groupId: string;
}
```

### 7.8 TodoEvent

建议从第一版就保留事件表，方便未来做 AI 分析、年度总结、操作历史、撤销等能力。

```ts
type TodoEventType =
  | "created"
  | "updated"
  | "completed"
  | "reopened"
  | "archived"
  | "tag_added"
  | "tag_removed"
  | "group_added"
  | "group_removed";

interface TodoEvent {
  id: string;
  todoId: string;
  eventType: TodoEventType;
  content?: string | null;
  createdAt: string;
}
```

## 8. SQLite 表结构建议

```sql
CREATE TABLE todos (
  id TEXT PRIMARY KEY,
  detail TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'active',
  extra_text TEXT,

  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  completed_at TEXT,
  archived_at TEXT
);

CREATE TABLE groups (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE tags (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE todo_groups (
  todo_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  PRIMARY KEY (todo_id, group_id),
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE TABLE todo_tags (
  todo_id TEXT NOT NULL,
  tag_id TEXT NOT NULL,
  PRIMARY KEY (todo_id, tag_id),
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE,
  FOREIGN KEY (tag_id) REFERENCES tags(id) ON DELETE CASCADE
);

CREATE TABLE board_views (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL UNIQUE,
  sort_order INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);

CREATE TABLE board_view_groups (
  board_view_id TEXT NOT NULL,
  group_id TEXT NOT NULL,
  PRIMARY KEY (board_view_id, group_id),
  FOREIGN KEY (board_view_id) REFERENCES board_views(id) ON DELETE CASCADE,
  FOREIGN KEY (group_id) REFERENCES groups(id) ON DELETE CASCADE
);

CREATE TABLE todo_events (
  id TEXT PRIMARY KEY,
  todo_id TEXT NOT NULL,
  event_type TEXT NOT NULL,
  content TEXT,
  created_at TEXT NOT NULL,
  FOREIGN KEY (todo_id) REFERENCES todos(id) ON DELETE CASCADE
);
```

## 9. 推荐技术栈

### 9.1 总体技术栈

```text
Tauri
React
TypeScript
Vite
shadcn/ui
Tailwind CSS
Radix UI
SQLite
Rust commands
Zustand
```

### 9.2 为什么选择 Tauri

EasyDo 是轻量桌面工具，不希望像 Electron 一样打包完整 Chromium 导致体积和内存占用较大。

Tauri 的优势：

- 使用系统 WebView，不内置完整 Chromium。
- 安装包通常明显小于 Electron。
- 运行态内存通常低于 Electron。
- 支持使用 React / TypeScript / Vite / Tailwind / shadcn。
- 适合做轻量本地工具。
- 可以通过 Rust command 访问系统能力和 SQLite。
- 未来可以扩展跨平台能力。

Tauri 的代价：

- 需要写少量 Rust。
- 桌面生态不如 Electron 成熟。
- 某些系统能力需要通过 Tauri 插件或 Rust 自己封装。

对 EasyDo 来说，Tauri 是合理折中：

```text
比 SwiftUI 更方便复用 Web 生态和跨平台能力。
比 Electron 更轻，更适合轻量 Todo 工具。
```

### 9.3 为什么选择 React + TypeScript + Vite

React + TypeScript + Vite 适合快速构建复杂交互界面。

EasyDo 的 UI 包含：

- 分组看板
- 键盘选中状态
- Popover 编辑
- Tag Badge
- Board View 切换
- Weekly Worklog 聚合
- 快捷命令输入

React 生态成熟，shadcn/ui 也天然适配 React + Vite。

TypeScript 可以保证 Todo / Group / Tag / BoardView 等领域模型的类型安全。

Vite 构建快，适合桌面端前端工程。

### 9.4 为什么选择 shadcn/ui + Tailwind CSS

EasyDo 需要极简、轻奢、低干扰的 UI 风格。

shadcn/ui 适合原因：

- 不是传统黑盒组件库，而是复制组件源码到项目中，方便定制。
- 基于 Radix UI，交互可访问性较好。
- 与 Tailwind 配合自然。
- 很适合做极简、留白、细边框、低饱和风格。
- Command、Popover、Badge、Textarea、Dialog、ScrollArea 等组件非常符合 EasyDo 的交互形态。

不建议第一版使用 Ant Design / Element Plus 这类后台系统组件库，因为它们会让产品气质变重，不符合 EasyDo 的个人效率工具定位。

### 9.5 为什么选择 SQLite

EasyDo 是本地优先工具。

SQLite 适合原因：

- 本地单文件数据库。
- 无需部署服务端。
- 支持结构化查询。
- 适合 Todo、Tag、Group、Event、Weekly Report 等数据。
- CLI 可以直接或间接访问同一个数据库。
- AI / MCP 后续可以通过命令或本地服务查询数据。
- 备份迁移简单。

不建议第一版使用 MySQL / PostgreSQL，因为这会引入服务端部署和连接成本。

不建议使用纯 JSON 文件，因为后续需要复杂查询：

- 按分组筛选
- 按标签筛选
- 按周聚合
- 按完成时间聚合
- 年度总结
- 历史事件分析

这些更适合 SQLite。

## 10. 推荐项目架构

建议使用 monorepo。

```text
easydo/
  apps/
    desktop/              # Tauri + React 桌面端
    cli/                  # 后续 CLI，可第二阶段实现

  crates/
    easydo-core/          # Rust 领域逻辑
    easydo-db/            # Rust SQLite 访问与 migration
    easydo-mcp/           # 后续 MCP Server，可第三阶段实现

  packages/
    ui/                   # 可选：前端通用 UI 组件
    shared/               # 可选：TS 类型、工具函数

  docs/
    product.md
    architecture.md
    database.md

  README.md
```

MVP 也可以先简单一点：

```text
easydo/
  src-tauri/              # Tauri Rust 代码
  src/                    # React 前端代码
  docs/
  README.md
```

但建议初始化时就保持清晰边界：

```text
React 前端只负责 UI 和交互。
Rust commands 负责本地能力和数据库写入。
SQLite 是唯一事实数据源。
```

## 11. 前后端分工

### 11.1 React / TypeScript 负责

- 页面布局
- 分组看板渲染
- TodoCard 组件
- TagBadge 组件
- Popover 详情编辑
- Keyboard shortcuts
- 当前选中 Todo 状态
- 当前输入分组状态
- 当前 Board View 状态
- 调用 Tauri command
- 展示 Weekly Worklog
- 复制 Worklog 到剪贴板

### 11.2 Rust / Tauri 负责

- SQLite 初始化
- Migration
- Todo CRUD
- Group CRUD
- Tag CRUD
- BoardView CRUD
- Todo 状态流转
- TodoEvent 记录
- 查询本周完成内容
- 系统路径管理
- 后续 CLI 复用逻辑
- 后续 MCP / AI 接入

## 12. Tauri Command 设计

MVP 阶段至少需要以下 commands：

```rust
create_todo(detail, group_ids, tag_ids) -> Todo
update_todo(id, detail, group_ids, tag_ids, extra_text) -> Todo
complete_todo(id) -> Todo
reopen_todo(id) -> Todo
archive_todo(id) -> Todo
list_todos(board_view_id?) -> Vec<TodoWithRelations>
list_weekly_done(start_date, end_date, group_id?) -> Vec<TodoWithRelations>

create_group(name) -> Group
list_groups() -> Vec<Group>
update_group(id, name, sort_order) -> Group
delete_group(id) -> ()

create_tag(name) -> Tag
list_tags() -> Vec<Tag>
update_tag(id, name, sort_order) -> Tag
delete_tag(id) -> ()

create_board_view(name, group_ids) -> BoardView
list_board_views() -> Vec<BoardViewWithGroups>
update_board_view(id, name, group_ids, sort_order) -> BoardView
delete_board_view(id) -> ()
```

## 13. 前端页面结构

### 13.1 Board 页面

路径：

```text
/
```

职责：

- 默认主页面。
- 按当前 Board View 中的分组展示 Todo。
- 支持 active / done Todo 展示。
- archived 默认隐藏。
- 支持键盘选择 Todo。
- 支持 Enter 新增 Todo。
- 支持 Command + Enter 完成 Todo。
- 支持 Tab 切换当前输入分组。
- 支持 Shift + Tab 切换当前展示 Board View。

核心组件：

```text
BoardPage
BoardHeader
BoardViewSwitcher
GroupSection
TodoCard
TodoInput
TodoDetailPopover
```

### 13.2 Weekly 页面

路径：

```text
/weekly
```

职责：

- 展示本周完成内容。
- 按日期聚合。
- 可按分组 / 标签过滤。
- 支持一键复制为 Markdown 或纯文本。
- 主要用于周五录工时。

示例输出：

```text
06-01：
- 完成检查合并处罚灰度方案梳理
- 修复检查项映射问题

06-02：
- 设计质检单成本计算公式
- 梳理 AI 介入后人工成本下降关系
```

核心组件：

```text
WeeklyPage
WeeklyDayGroup
WeeklyTodoItem
CopyWorklogButton
```

### 13.3 Settings 页面

路径：

```text
/settings
```

职责：

- 管理分组。
- 管理标签。
- 管理自定义 Board View。

核心组件：

```text
SettingsPage
GroupManager
TagManager
BoardViewManager
```

## 14. 快捷键设计

MVP 快捷键：

```text
Tab                    切换当前输入分组
Shift + Tab            切换当前 Board View
Enter                  在输入框中新增 Todo
Command + Enter        完成当前选中 Todo
Arrow Up / Down        移动选中 Todo
Command + K            打开命令面板，可后续做
Command + B            切换 Board 页面
Command + W            切换 Weekly 页面
Esc                    关闭 Popover / 取消选中
```

注意：

- 输入框 focus 时，Tab 默认行为会被拦截，用于切换输入分组。
- Textarea 中需要避免快捷键冲突。
- 需要清楚区分“当前输入分组”和“当前选中 Todo”。

## 15. UI 风格要求

EasyDo 的 UI 风格关键词：

```text
极简
轻奢
干净
低饱和
键盘友好
高留白
细边框
弱阴影
柔和圆角
```

建议：

- 使用 shadcn/ui 默认风格为基础。
- 背景使用柔和灰白或暗色主题。
- TodoCard 使用轻边框和圆角。
- 标签使用低饱和 Badge。
- 当前选中 Todo 要有清晰 focus ring。
- 不要使用大面积强色块。
- 不要做成后台管理系统风格。
- 不要让设置项污染主界面。

## 16. Worklog 生成逻辑

MVP 先不接 AI，只做确定性生成。

输入：

```text
completed_at 在本周范围内的 done Todo
```

聚合方式：

```text
按日期分组
按完成时间排序
展示 detail
可选展示 tags
```

复制格式建议支持两种。

### 16.1 Markdown 格式

```markdown
## 本周完成内容

### 06-01
- 完成检查合并处罚灰度方案梳理
- 修复检查项映射问题

### 06-02
- 设计质检单成本计算公式
- 梳理 AI 介入后人工成本下降关系
```

### 16.2 纯文本格式

```text
06-01：
完成检查合并处罚灰度方案梳理
修复检查项映射问题

06-02：
设计质检单成本计算公式
梳理 AI 介入后人工成本下降关系
```

## 17. 未来 CLI 设计

CLI 不进入第一版也可以，但架构要预留。

未来命令示例：

```bash
easydo add "整理检查合并处罚灰度方案" --group 工作 --tag 检查合并
easydo list --group 工作
easydo done <todo_id>
easydo archive <todo_id>
easydo week
easydo week --group 工作 --format markdown
easydo tags
easydo groups
```

CLI 的意义：

- 让用户可以从终端快速添加 Todo。
- 让 AI 可以通过 CLI 安全地操作 EasyDo。
- 避免 AI 直接读写 SQLite。
- 为 MCP Server 做准备。

## 18. 未来 AI / MCP 接入设计

未来可以实现 MCP Server，暴露工具：

```text
todo.create
todo.complete
todo.archive
todo.search
todo.listWeeklyDone
todo.generateWeeklyReport
todo.generateYearlySummaryData
```

AI 不应该直接操作 SQLite，而应该通过受控工具调用：

```text
AI / Agent
→ MCP Tool / CLI
→ EasyDo Core
→ SQLite
```

这样可以避免数据被随意改坏。

未来 AI 能力：

- 根据自然语言创建 Todo。
- 根据上下文补全标签。
- 根据本周完成内容生成周报。
- 根据年度 TodoEvent 生成年度总结。
- 分析哪些分组 / 标签占用了最多时间。
- 分析哪些 Todo 经常被创建但没有完成。
- 发现长期拖延的主题。

## 19. 初始化任务建议

请 Coding Agent 优先完成以下初始化任务。

### 19.1 创建项目

使用 Tauri + React + TypeScript + Vite 初始化项目。

要求：

- 项目名：easydo
- 前端框架：React
- 语言：TypeScript
- 包管理器可使用 pnpm
- 接入 Tailwind CSS
- 接入 shadcn/ui

### 19.2 初始化基础 UI

创建以下页面和组件骨架：

```text
src/pages/BoardPage.tsx
src/pages/WeeklyPage.tsx
src/pages/SettingsPage.tsx

src/components/board/GroupSection.tsx
src/components/board/TodoCard.tsx
src/components/board/TodoInput.tsx
src/components/board/TodoDetailPopover.tsx

src/components/weekly/WeeklyDayGroup.tsx
src/components/weekly/CopyWorklogButton.tsx

src/components/settings/GroupManager.tsx
src/components/settings/TagManager.tsx
src/components/settings/BoardViewManager.tsx
```

### 19.3 初始化数据库

在 Rust / Tauri 侧初始化 SQLite。

要求：

- App 启动时确保数据库存在。
- 数据库文件放在应用数据目录。
- 初始化 migration。
- 创建 todos / groups / tags / todo_groups / todo_tags / board_views / board_view_groups / todo_events 表。

### 19.4 初始化 Tauri Commands

先实现最小 commands：

```text
create_todo
list_todos
complete_todo
archive_todo
list_groups
create_group
list_weekly_done
```

### 19.5 初始化默认数据

首次启动时创建默认分组：

```text
工作
学习
健身
生活
个人项目
```

首次启动时创建默认 Board View：

```text
所有
工作
个人
```

其中：

```text
所有 = 全部分组
工作 = 工作
个人 = 学习 + 健身 + 生活 + 个人项目
```

### 19.6 实现 MVP 交互

优先实现：

- 输入框 Enter 创建 Todo
- Tab 切换当前输入分组
- Shift + Tab 切换当前 Board View
- Arrow Up / Down 移动选中 Todo
- Command + Enter 完成 Todo
- Weekly 页面展示本周完成 Todo
- 复制 Weekly 内容

## 20. 非目标说明

Coding Agent 不要在初始化阶段做这些事情：

- 不要做登录注册。
- 不要做云同步。
- 不要做服务端。
- 不要做复杂项目管理。
- 不要引入重型状态管理。
- 不要引入 Ant Design。
- 不要把 Todo 设计成 title + description。
- 不要默认要求用户填写截止日期。
- 不要实现图片上传。
- 不要实现 AI 总结。
- 不要实现 MCP。
- 不要把 UI 做成企业后台系统。

## 21. 第一阶段验收标准

MVP 验收标准：

1. 用户可以在主界面输入一条 detail-only Todo。
2. 用户可以通过 Tab 切换当前输入分组。
3. 用户按 Enter 后，Todo 出现在当前分组下。
4. 用户可以用方向键选中 Todo。
5. 用户可以按 Command + Enter 完成 Todo。
6. 完成后的 Todo 有 completed_at。
7. Weekly 页面可以看到本周完成的 Todo。
8. Weekly 页面按日期聚合完成内容。
9. 用户可以一键复制本周完成内容。
10. 数据重启 App 后仍然存在。
11. archived Todo 默认不在看板展示。
12. Todo 可以通过 Popover 编辑分组、标签和附加长文本。

## 22. 一句话总结

EasyDo 的第一版不是为了做一个功能很多的 Todo App，而是为了打通一个高频闭环：

> 快速记录 Todo，顺手完成 Todo，自动沉淀 Worklog。

只要这个闭环足够顺滑，EasyDo 就已经解决了最核心的用户痛点。
