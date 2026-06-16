## 1. 数据模型与系统对象

- [x] 1.1 为 groups 和 board_views 增加可空唯一 system_key，并为 todos 增加 expires_at、deleted_at、delete_reason 字段和查询索引
- [x] 1.2 实现幂等迁移，回填系统“所有” View 标识并创建收件箱 Group、隐藏 View及关系
- [x] 1.3 处理既有同名普通 Group或 View 冲突，保证系统对象通过 system_key 唯一定位
- [x] 1.4 扩展 Rust 和 TypeScript 模型，暴露系统标识、过期时间和逻辑删除字段
- [x] 1.5 增加数据库迁移测试，覆盖全新数据库、旧库升级和重复初始化

## 2. 收件箱 Core 服务

- [x] 2.1 实现本地时区次日 03:00 到期时间计算并覆盖白天、临近午夜和时区边界测试
- [x] 2.2 实现 create_inbox_todo，确保 Todo 只属于收件箱并记录 created_in_inbox 事件
- [x] 2.3 限制普通 create_todo 不得混合系统收件箱和普通 Group
- [x] 2.4 实现 move_todo_from_inbox 单事务迁移、到期时间清空和 moved_from_inbox 事件
- [x] 2.5 增加收件箱创建与迁移测试，覆盖无效 Todo、非收件箱 Todo、系统目标 Group和幂等失败回滚

## 3. 到期扫描与查询隔离

- [x] 3.1 实现 purge_expired_inbox_todos 幂等扫描和 auto_deleted 事件记录
- [x] 3.2 修改 Todo 基础查询，使 Board、Daily、Weekly 和 CLI 默认排除 deleted_at 非空记录
- [x] 3.3 修改系统“所有” View 语义，使其只包含普通 Group并排除收件箱
- [x] 3.4 增加扫描测试，覆盖未到期、已到期、已迁出、重复扫描和逻辑删除查询隔离
- [x] 3.5 保留现有显式物理删除行为，并验证其与收件箱逻辑删除互不冲突

## 4. Tauri 命令与运行期扫描

- [x] 4.1 新增收件箱创建、Todo 迁移和收件箱未删除数量 Tauri 命令
- [x] 4.2 在 App 打开数据库后、首次页面加载前执行一次到期扫描
- [x] 4.3 启动每 15 分钟使用独立数据库连接的后台扫描，并复用 WAL 与 busy timeout 配置
- [x] 4.4 验证后台扫描与前端写操作并发时保持短事务和简短错误反馈

## 5. CLI 收件箱能力

- [x] 5.1 增加 `easydo inbox add <detail> [--json]` 命令及帮助示例
- [x] 5.2 增加 `easydo move <todo-selector> --group <group-selector> [--json]` 命令
- [x] 5.3 在所有需要数据库的 CLI 命令执行前补扫到期收件箱 Todo且不污染 stdout
- [x] 5.4 调整默认 list、`--status all`、收件箱 View和收件箱 Group查询语义
- [x] 5.5 增加 CLI 集成测试，覆盖成功路径、选择器歧义、无效目标、JSON 输出和简短错误

## 6. Board 收件箱 View

- [x] 6.1 从普通 Group和普通 View集合中分离系统收件箱，确保底部输入 Group不包含收件箱
- [x] 6.2 在侧边栏实现收件箱条件入口、待整理数量和当前收件箱空页面定位状态
- [x] 6.3 实现收件箱隐藏 View，只展示收件箱 Group并排除顶部普通切换列表和普通 Shift+Tab 循环
- [x] 6.4 添加收件箱横幅，非空和空页面均展示暂存、拖拽归类及次日 03:00 后删除说明
- [x] 6.5 收件箱最后一条 Todo 移除后保留当前空页面，不自动跳转 View

## 7. 跨容器拖拽与空 View 导航

- [x] 7.1 将收件箱迁移拖拽上下文提升到 Board 层，同时保留普通 View 的同组排序行为
- [x] 7.2 将侧边栏普通 Group实现为可访问的真实投放目标并展示拖入、悬停和失败恢复状态
- [x] 7.3 成功投放后调用原子迁移命令并刷新 Todo、收件箱数量和当前 Group状态
- [x] 7.4 为 BoardViewSwitcher 增加 forceExpanded，在当前 View 无可见 Todo 时持续展示全部普通 View
- [x] 7.5 当前 View 恢复 Todo 后恢复现有悬停或聚焦展开逻辑
- [x] 7.6 增加前端测试，覆盖入口显隐、隐藏 View、横幅、跨 Group迁移、空 View 展开和错误恢复

## 8. EasyDo Skill 0.2.0

- [x] 8.1 将 skills/manifest.json 中 easydo 版本更新为 0.2.0
- [x] 8.2 更新 EasyDo Skill，保留显式 CLI 操作说明并加入实质工作结果触发与递归排除规则
- [x] 8.3 定义主 Agent传给独立 Agent的 summary、workspace、outcome、verification、explicit_group 契约
- [x] 8.4 定义独立 Agent 的已有 Todo 匹配、保守完成、普通 Group路由、收件箱回退和 noop 规则
- [x] 8.5 限制每次事件最多变更一个 Todo，并定义成功、noop、失败的结构化回执
- [x] 8.6 明确宿主不支持独立 Agent时跳过自动同步，不回退到主 Agent直接写入
- [x] 8.7 更新 Skill 安装状态和升级测试，验证 0.1.0 显示 outdated、0.2.0 原子升级及用户目录冲突保护

## 9. 集成验证与文档

- [x] 9.1 运行 Rust 单元测试和 CLI 集成测试，确认现有 Todo、View、归档和 Skill 安装行为无回归
- [x] 9.2 运行前端测试和生产构建，确认 Board、Daily、Weekly、设置页和收件箱交互通过
- [x] 9.3 使用独立测试数据库验证 App 启动补扫、15 分钟扫描和 CLI 补扫不会重复创建事件
- [x] 9.4 使用 Playwright 或应用浏览器验证桌面尺寸下拖拽目标、横幅、空 View 展开和深浅色可见性
- [x] 9.5 更新 README 和 CLI 帮助文档，说明收件箱暂存、次日 03:00 后清理及 App关闭期间的补扫语义
- [x] 9.6 运行 `openspec status` 和变更校验，确认全部规范与任务可进入 apply 阶段
