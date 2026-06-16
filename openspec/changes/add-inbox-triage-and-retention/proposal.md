## Why

EasyDo Agent 在完成实际工作后，需要能够记录对应 Todo；但当 Group 无法可靠判断时，当前系统只能放弃记录或错误归类。新增受控的收件箱暂存、人工分拣和自动清理机制，可以提高工作记录覆盖率，同时避免未整理 Todo 长期污染正式 Group。

## What Changes

- 新增系统保留的“收件箱” Group 与隐藏 View，默认不出现在普通 View 和录入 Group 中，仅在收件箱非空或用户正停留在收件箱 View 时提供入口。
- 收件箱 View 只展示收件箱 Todo，并始终显示暂存、拖拽归类和自动清理规则横幅。
- 支持把收件箱 Todo 拖到侧边栏普通 Group；系统以原子操作移除收件箱关系、加入目标 Group、取消过期时间并永久保留 Todo。
- 为收件箱 Todo 记录明确的到期时间；到达创建日次日 03:00 后，由 App 启动扫描、运行期间每 15 分钟扫描及 CLI 启动补扫执行逻辑删除。
- 所有普通 Board、Daily、Weekly 和 CLI 默认查询排除逻辑删除 Todo；系统保留“所有” View 也不包含收件箱。
- 当前 View 没有可见 Todo 时，顶部持续展开全部普通 View，方便用户直接切换；收件箱清空后继续停留在收件箱空页面。
- 将内置 EasyDo Skill 升级为 `0.2.0`，新增工作结果同步策略：由独立 Agent 判断新增、更新、完成或不处理；确认已做事项但无法判断 Group 时写入收件箱。
- 扩展 CLI，使独立 Agent 能够创建收件箱 Todo、迁移 Todo 到普通 Group，并获得简短明确的校验错误。

## Capabilities

### New Capabilities

- `inbox-triage`: 定义系统收件箱、隐藏 View、横幅提示、侧边栏入口及拖拽归类行为。
- `inbox-retention`: 定义收件箱 Todo 到期时间、逻辑删除和补偿扫描行为。
- `agent-work-sync`: 定义 EasyDo Skill 0.2.0 的独立 Agent 工作结果同步、匹配和保守完成策略。

### Modified Capabilities

- `local-todo-board`: 调整“所有” View、空 View 顶部展开、收件箱可见性和逻辑删除 Todo 的 Board 展示规则。
- `todo-cli`: 增加收件箱创建与 Group 迁移能力，并让查询和命令启动遵循收件箱清理及逻辑删除规则。
- `agent-skill-management`: 内置 Skill 版本更新为 `0.2.0`，安装状态检测和覆盖安装按新版本工作。

## Impact

- SQLite：`groups`、`board_views` 增加稳定的系统类型标识；`todos` 增加收件箱到期和逻辑删除字段及索引。
- Rust Core：Todo 查询、收件箱创建、Group 原子迁移、过期扫描和事件记录。
- Tauri：新增迁移与收件箱状态命令，并在应用生命周期中启动扫描。
- React：Board View 状态、空 View 展开、收件箱横幅、侧边栏条件入口及跨容器拖拽。
- CLI：新增收件箱和迁移命令，启动时执行到期补扫。
- Skill 包：更新 manifest、Skill 内容、安装状态测试和 Agent 工作同步约束。
