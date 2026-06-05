## Context

EasyDo 当前是 Tauri + React + TypeScript 的 macOS 桌面应用，第一版 MVP 已经提供 Todo、Done、Worklog 的基础流转和 SQLite 持久化。当前看板页面已有部分键盘操作，但还没有 Settings 入口、可配置快捷键、正式的 shadcn/ui 基础结构，也没有稳定的“当前选中 Todo”交互模型。

本次变更聚焦桌面窗口内体验：用户只有在 EasyDo 窗口激活时才触发快捷键，不做系统级全局快捷键。Settings 先以弹窗实现，只承载快捷键配置。分组、标签、详情弹层、命令面板等能力不进入本阶段。

## Goals / Non-Goals

**Goals:**

- 接入 shadcn/ui 基础组件体系，建立 `src/components/ui` 和 `src/lib/utils.ts` 等标准结构。
- 新增 Settings 弹窗，通过默认 `Cmd+,` 打开。
- 使用 SQLite 保存快捷键配置，保证桌面端重启后配置仍然可用。
- 在 Todo 列表中建立清晰的选中态，支持鼠标点击和 `Cmd+ArrowUp/Down` 切换。
- 支持选中 Todo 的内联编辑和完成/回溯完成态快捷键。
- 明确编辑态、弹窗态和普通列表态之间的快捷键优先级。

**Non-Goals:**

- 不实现 macOS 全局快捷键注册。
- 不新增 Settings 独立页面。
- 不实现分组、标签、BoardView 管理。
- 不实现 detail 弹层或额外详情编辑流程。
- 不全面重做当前页面视觉，只替换本次变更相关的基础控件。

## Decisions

1. 快捷键配置存储在 SQLite `app_settings` 表中。

   使用 `app_settings(key TEXT PRIMARY KEY, value TEXT NOT NULL, updated_at TEXT NOT NULL)` 保存应用配置，快捷键使用 `shortcuts.v1` 作为 key，value 为 JSON。默认配置在前端和后端共享为同一组语义动作：`openSettings`、`selectPreviousTodo`、`selectNextTodo`、`editSelectedTodo`、`toggleSelectedTodoDone`。

   选择 SQLite 而不是 `localStorage`，是因为 EasyDo 是桌面应用，Todo 数据已经在 SQLite 中，后续 CLI、MCP 或导入导出能力也更容易读取同一份配置。`localStorage` 可以更快落地，但配置会和主数据分离，也不利于迁移。

2. 快捷键只做窗口内监听。

   前端在应用根节点或看板页面注册 `keydown` 监听，只在 WebView 获得焦点时处理。实现时不使用 Tauri `globalShortcut`，也不注册系统菜单快捷键。Settings 打开、快捷键录入框聚焦、Todo 内联编辑时，需要按当前交互状态决定是否拦截按键。

   这样可以满足“只在激活当前窗口时执行”的要求，并避免用户在其他应用中按下相同组合键时被 EasyDo 抢占。

3. Settings 使用 shadcn `Dialog` 作为弹窗。

   Settings 由应用级状态控制打开关闭，默认通过 `Cmd+,` 打开，也可以在页面后续增加入口按钮。弹窗内容只展示快捷键动作列表、当前绑定、重置默认、保存/取消。快捷键录入使用捕获模式：用户点击某个动作后，下一次合法按键组合被记录为该动作的配置。

4. 快捷键冲突在保存前阻止。

   同一个快捷键不能绑定到多个动作。Settings 保存时校验重复组合；如果存在冲突，保留弹窗并提示冲突项。非法组合例如单独修饰键、空值、不可识别键不允许保存。

5. Todo 选中态以可见列表顺序为准。

   `Cmd+ArrowDown` 选中下一个可见 Todo，`Cmd+ArrowUp` 选中上一个可见 Todo。到达首尾时保持当前选中项，不循环跳转。鼠标点击任何 Todo 卡片时同步更新选中态。列表刷新后如果当前选中 Todo 仍可见则保留，否则选择第一个可见 Todo。

6. Todo 编辑态使用内联输入，不打开 detail。

   选中 Todo 且不在编辑态时，按 `Space` 进入内联编辑。编辑态内 `Enter` 保存非空内容，`Esc` 取消，普通 `Space` 作为文本输入。编辑态内不触发 `Cmd+Enter` 完成/回溯完成态，避免用户编辑内容时误改状态。

7. 完成/回溯完成态复用现有 Todo 状态流转。

   未编辑时按 `Cmd+Enter`，如果选中 Todo 是 active 则完成，如果是 done 则回溯为 active。这个行为复用现有完成和 reopen 逻辑，同时继续记录 Todo 事件日志。

## Risks / Trade-offs

- 快捷键配置 JSON 与前端动作常量不一致 → 后端读取时做 schema/version 校验，前端保存前也校验动作全集。
- shadcn 接入影响现有 Tailwind 配置 → 只增加必要依赖和组件，保留当前 Tailwind 主题变量与页面布局。
- Settings 弹窗中的快捷键捕获误触发页面快捷键 → 捕获模式期间暂停普通快捷键处理，并阻止事件冒泡。
- Todo 列表为空时快捷键无目标 → 无可见 Todo 时选中态为空，编辑和完成快捷键不执行。
- 编辑态和完成态快捷键冲突 → 编辑态优先处理文本保存/取消，完成/回溯完成态只在非编辑态触发。

## Migration Plan

- 新增 SQLite 迁移创建 `app_settings` 表，不改动现有 Todo、Done、Worklog 表。
- 首次启动读取不到 `shortcuts.v1` 时返回默认快捷键配置，不需要预置数据。
- 保存快捷键时以 upsert 更新 `app_settings`。
- 回滚时可以保留 `app_settings` 表；旧版本不读取该表，不影响现有 MVP 数据。

## Open Questions

- 后续是否需要提供菜单栏入口打开 Settings，本阶段先不要求。
- 后续是否允许用户禁用某个快捷键，本阶段先要求每个动作都有合法绑定。
