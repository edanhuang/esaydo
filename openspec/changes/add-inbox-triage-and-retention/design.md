## Context

当前 EasyDo 使用 SQLite 保存 Todo、Group、View 和事件。Todo 支持 active、done、archived 三种业务状态，但没有逻辑删除字段；`所有` View 通过名称特殊判断为展示全部 Group。前端拖拽只支持同一 Group 内排序，侧边栏不是拖放目标。内置 EasyDo Skill 0.1.0 只在用户明确要求时调用 CLI，不具备工作结束后的自动同步策略。

本变更跨越数据库迁移、Rust Core、Tauri 生命周期、CLI、React Board 和内置 Skill。收件箱既要提高 Agent 记录覆盖率，又必须与用户正式 Group、归档和周报数据保持隔离。

## Goals / Non-Goals

**Goals:**

- 为无法可靠归类但确认值得记录的工作提供系统收件箱。
- 让用户通过明确的跨 Group 拖拽将暂存 Todo 转为永久 Todo。
- 在本地时区次日 03:00 后可靠地逻辑删除未整理 Todo。
- 保证收件箱和逻辑删除 Todo 不泄露到普通 Board、Daily、Weekly 与默认 CLI 查询。
- 将 EasyDo Skill 升级到 0.2.0，由独立 Agent 保守地同步实际工作结果。
- 在空 View 中持续提供普通 View 切换入口，不强制用户离开当前空页面。

**Non-Goals:**

- 不安装 macOS LaunchAgent，也不保证 App 和 CLI 均未运行时准点执行扫描。
- 不提供逻辑删除 Todo 的恢复、回收站或物理清理界面。
- 不允许用户删除、重命名或把系统收件箱加入普通 View。
- 不在本变更中实现通用 Group 间任意拖拽；仅支持从收件箱迁移到普通 Group。
- 不让模型在低置信度下自动完成、归档或迁移已有 Todo。

## Decisions

### 1. 使用稳定系统标识，而不是名称识别

为 `groups` 和 `board_views` 增加可空且唯一的 `system_key`。系统记录使用 `all` 和 `inbox`，普通记录保持 NULL。

数据库迁移幂等地创建一个 `system_key=inbox` 的 Group 和 View，并建立二者关系；现有“所有” View 回填 `system_key=all`。服务层通过 system_key 判断系统语义，显示名称仍可本地化。

选择系统标识而不是名称，是为了避免重名、未来改名和用户数据导致保留对象失效。

### 2. 将逻辑删除建模为独立可见性维度

`todos` 增加：

- `expires_at TEXT NULL`：收件箱 Todo 的清理时间。
- `deleted_at TEXT NULL`：逻辑删除时间。
- `delete_reason TEXT NULL`：首版使用 `inbox_expired`。

逻辑删除不新增 Todo status，也不复用 archived。所有正常查询必须先满足 `deleted_at IS NULL`，再应用状态、View、Group 和时间条件。保留现有物理删除接口用于“编辑为空”等明确用户删除行为。

这样可以保持归档、周报和 CLI `--status` 的既有语义。

### 3. 通过专用入口创建收件箱 Todo

Rust Core 增加 `create_inbox_todo`，由 CLI 和 Tauri 复用。该入口：

1. 校验非空内容。
2. 只绑定系统收件箱 Group。
3. 使用本地时区计算创建日次日 03:00 的 `expires_at`。
4. 创建 active Todo 并记录 `created_in_inbox` 事件。

普通 `create_todo` 拒绝把系统收件箱与其他 Group 混合使用。手工输入 Group 列表不包含收件箱。

专用入口比让调用者传收件箱名称更稳定，也能集中保证过期字段完整。

### 4. 收件箱迁移使用单事务替换 Group 关系

新增 `move_todo_from_inbox(todo_id, target_group_id)`：

- Todo 必须未逻辑删除且当前属于收件箱。
- 目标必须是非系统普通 Group。
- 事务内插入目标 Group 关系、删除全部收件箱关系、清空 `expires_at`、更新 `updated_at` 并记录 `moved_from_inbox` 事件。
- Todo 的 active/done 状态保持不变。

不采用“额外添加目标 Group”的方案，因为 Todo 继续属于收件箱会使显示和清理条件产生歧义。

### 5. 收件箱采用隐藏 View 与条件侧栏入口

后端始终保留收件箱 View，但普通 View 列表提供 `hidden/system_key` 信息供前端过滤：

- 顶部普通 View 切换器和 `Shift+Tab` 循环排除收件箱。
- 收件箱未逻辑删除 Todo 数量大于零时，侧边栏显示收件箱入口。
- 用户当前处于收件箱 View 时，即使数量归零也保留页面和标题，但侧边栏空入口可以继续显示为当前定位。
- 收件箱 View 只展示收件箱 Group和说明横幅。
- 当前收件箱 View 按 `Shift+Tab` 时进入第一个普通 View，默认优先“所有”。

选择保留 View 实体而不是前端虚拟页面，是为了复用 View 查询、选中状态持久化和 CLI selector。

### 6. 将拖拽上下文提升到 Board 层

现有 GroupSection 内部 DndContext 继续负责同组排序；收件箱 View 使用 Board 级 DndContext，使 Todo 卡片可投放到侧边栏普通 Group 行。

侧边栏普通 Group 在拖拽时展示投放状态，释放后调用原子迁移命令。成功后刷新收件箱数量和当前 View；失败则恢复界面并展示简短错误。投放区域必须有真实命令行为，不能只提供视觉反馈。

### 7. 空 View 强制展开普通 View 切换器

BoardPage 根据当前 View 的可见 Todo 数量向 BoardViewSwitcher 传入 `forceExpanded`：

- 数量为零时持续展开全部普通 View。
- 数量大于零时恢复现有悬停或聚焦展开。
- 收件箱为空时横幅和空状态继续保留，用户不会被自动切走。

以 Todo 数量而不是 Group 数量判断，是为了覆盖“有 Group 但没有 Todo”的常见空页面。

### 8. 扫描采用幂等 Core 服务和多入口触发

新增 `purge_expired_inbox_todos(now)`：

- 只选择 `deleted_at IS NULL`、仍属于收件箱且 `expires_at <= now` 的 Todo。
- 单事务设置 `deleted_at`、`delete_reason=inbox_expired`、`updated_at`，并记录 `auto_deleted` 事件。
- 已迁出收件箱、已逻辑删除或未到期记录不受影响。

触发方式：

- App 打开数据库后立即执行一次。
- App 运行期间由后台线程每 15 分钟使用独立数据库连接扫描。
- CLI 打开数据库后、执行用户命令前补扫一次。

不引入操作系统常驻任务。App 完全关闭时允许延迟，下一次 App 或 CLI 启动立即补偿。

### 9. Skill 0.2.0 使用独立工作同步 Agent

内置 `easydo` Skill 保留显式查询和变更能力，并增加工作结果同步协议。主 Agent 在一次实质性工作形成结果后，把摘要、workspace、outcome、验证结果和显式 Group 传给独立 Agent；独立 Agent 只通过 EasyDo CLI 工作。

独立 Agent 按以下顺序处理：

1. 排除闲聊、纯讨论、EasyDo 查询本身、失败且无可记录结论的操作。
2. 查询未完成 Todo，并按项目、模块、功能关键词、Group 和近期活动寻找唯一高置信度匹配。
3. 匹配到已有 Todo 时更新或在满足“唯一匹配、明确完成、验证通过”时完成。
4. 无匹配且 Group 可可靠判断时创建普通 Todo。
5. 确认值得记录但 Group 无法判断时创建收件箱 Todo。
6. 无法确认是否值得记录时返回 noop，不修改数据。

每次工作事件最多变更一个 Todo，禁止因 EasyDo 同步再次触发同步。若宿主不支持独立 Agent，自动同步 SHALL 跳过并返回不可用结果，不回退到主 Agent 内直接写入。

### 10. CLI 提供面向 Agent 的稳定命令

新增：

- `easydo inbox add <detail> [--json]`
- `easydo move <todo-selector> --group <group-selector> [--json]`

`move` 首版仅允许收件箱 Todo 移到普通 Group。默认 `list` 和 `--status all` 仍排除逻辑删除记录；`--group 收件箱` 和 `--view 收件箱` 可显式查询未删除的收件箱 Todo。

命令保持唯一选择器、JSON 输出和简短错误约束。

## Risks / Trade-offs

- [风险] App 关闭期间无法在 03:00 准点清理。  
  → App 和 CLI 启动时立即补扫，文案描述为“03:00 后自动删除”而不是保证精确分钟。

- [风险] 本地时区或夏令时变化影响到期时间。  
  → 创建时计算并持久化带时区偏移的 RFC3339 `expires_at`，后续只比较绝对时间。

- [风险] 收件箱名称与用户既有 Group 冲突。  
  → 迁移按 `system_key` 查找；若旧数据已有同名普通 Group，保留用户 Group并为系统 Group生成不冲突的显示名，同时仍使用稳定标识。

- [风险] App 扫描线程与 CLI 并发写 SQLite。  
  → 延续 WAL 和 busy timeout，扫描使用短事务且保持幂等。

- [风险] 跨组件拖拽与现有同组排序冲突。  
  → 仅在收件箱 View 启用 Board 级迁移拖拽，普通 View 继续使用原排序上下文。

- [风险] Skill 自动同步产生重复 Todo。  
  → 先查询匹配、限制每次一个变更、低置信度写收件箱或 noop，并禁止递归触发。

- [取舍] 逻辑删除数据继续占用本地数据库。  
  → 首版不做物理清理，保留后续审计和恢复空间；未来可单独增加保留期和压缩任务。

## Migration Plan

1. 增加可幂等执行的数据库列、索引和系统记录迁移。
2. 回填现有“所有” View 的 `system_key=all`，创建收件箱 Group、View 和关系。
3. 先实现并测试 Core 查询、创建、迁移和扫描服务。
4. 接入 Tauri 命令、App 周期扫描和 CLI 补扫。
5. 接入 Board 收件箱 View、空 View 展开和侧边栏拖放。
6. 更新 Skill manifest 到 0.2.0，并验证旧版安装可被识别为 outdated 后原子升级。

回滚应用版本时，新列和系统记录可保留，旧版本会忽略新增列；但旧版本按“所有 Group”语义可能展示收件箱，因此正式回滚前应先迁出或逻辑删除收件箱 Todo。

## Open Questions

无。扫描周期以每 15 分钟为准；App/CLI 均未运行时采用下次启动补扫，不增加系统常驻服务。
