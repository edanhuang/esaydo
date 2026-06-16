## ADDED Requirements

### Requirement: CLI 帮助信息
系统 SHALL 通过 `easydo help`、`easydo --help` 和各级子命令的 `--help` 输出对应命令、参数及简短使用示例。

#### Scenario: 查看顶层帮助
- **WHEN** 用户执行 `easydo help`
- **THEN** 系统列出 Todo、Skill 和帮助相关命令及其用途

#### Scenario: 查看子命令帮助
- **WHEN** 用户执行 `easydo list --help`
- **THEN** 系统只展示 `list` 支持的筛选条件、输出选项和示例

### Requirement: Todo 列表查询
系统 SHALL 支持通过 `easydo list` 查询 Todo，并支持按 View、Group、状态和时间范围组合筛选。

#### Scenario: 查询默认 Todo 列表
- **WHEN** 用户执行 `easydo list` 且不提供筛选条件
- **THEN** 系统返回全部未归档 Todo，并包含可用于后续命令的 ID、状态、内容和 Group

#### Scenario: 根据 View 查询
- **WHEN** 用户执行 `easydo list --view 工作`
- **THEN** 系统返回属于该 View 所包含任一 Group 的未归档 Todo

#### Scenario: 查询普通空 View
- **WHEN** 用户查询一个不包含任何 Group 的普通 View
- **THEN** 系统返回空列表而不是全部 Todo

#### Scenario: 根据 Group 查询
- **WHEN** 用户执行 `easydo list --group 工作`
- **THEN** 系统只返回属于该 Group 的 Todo

#### Scenario: 组合筛选
- **WHEN** 用户同时提供 View、Group、状态或时间范围条件
- **THEN** 系统使用 AND 语义组合不同类型的筛选条件

#### Scenario: 包含归档 Todo
- **WHEN** 用户执行 `easydo list --status all`
- **THEN** 系统返回 active、done 和 archived 状态的 Todo

### Requirement: 时间范围查询
系统 SHALL 支持通过 `--from`、`--to` 和 `--time-field` 查询指定时间范围内的 Todo。

#### Scenario: 使用默认活动时间
- **WHEN** 用户提供日期范围但未提供 `--time-field`
- **THEN** 系统对 active Todo 使用 `created_at`、对 done Todo 使用 `completed_at`、对 archived Todo 使用 `archived_at`

#### Scenario: 指定时间字段
- **WHEN** 用户使用 `--time-field created|updated|completed|archived|activity`
- **THEN** 系统使用指定语义对应的时间字段筛选 Todo

#### Scenario: 使用纯日期边界
- **WHEN** 用户输入 `--from 2026-06-01 --to 2026-06-07`
- **THEN** 系统按本地时区查询从 2026-06-01 00:00:00 起至 2026-06-08 00:00:00 前的数据

#### Scenario: 时间范围倒置
- **WHEN** `--from` 晚于 `--to`
- **THEN** 系统拒绝执行并返回 `开始日期不能晚于结束日期`

### Requirement: Todo 创建
系统 SHALL 支持通过 `easydo add <detail> --group <group>` 创建至少属于一个 Group 的 Todo。

#### Scenario: 创建单 Group Todo
- **WHEN** 用户提供非空 detail 和一个存在的 Group
- **THEN** 系统创建 active Todo、建立 Group 关系、记录 created 事件并返回新 Todo

#### Scenario: 创建多 Group Todo
- **WHEN** 用户重复提供多个 `--group`
- **THEN** 系统将新 Todo 同时关联到所有指定 Group

#### Scenario: 缺少 Group
- **WHEN** 用户执行 add 但未提供 Group
- **THEN** 系统拒绝执行并返回 `至少需要指定一个 Group`

### Requirement: Todo 修改
系统 SHALL 支持通过 `easydo update <todo-selector> --detail <detail>` 修改 Todo 内容并记录 updated 事件。

#### Scenario: 修改 Todo 内容
- **WHEN** 用户提供可唯一定位的 Todo 和非空 detail
- **THEN** 系统更新 detail 与 updated_at、记录 updated 事件并返回更新后的 Todo

#### Scenario: 修改为空内容
- **WHEN** 用户提供空白 detail
- **THEN** 系统拒绝执行并返回 `Todo 内容不能为空`

### Requirement: Todo 完成
系统 SHALL 支持通过 `easydo done <todo-selector>` 将 active Todo 标记为 done。

#### Scenario: 完成 active Todo
- **WHEN** 用户对 active Todo 执行 done
- **THEN** 系统设置 completed_at、更新状态、记录 completed 事件并返回更新后的 Todo

#### Scenario: 重复完成 Todo
- **WHEN** 用户对已处于 done 状态的 Todo执行 done
- **THEN** 系统保持原 completed_at 和事件不变，并返回当前 Todo

#### Scenario: 完成 archived Todo
- **WHEN** 用户对 archived Todo 执行 done
- **THEN** 系统拒绝执行并返回 `已归档 Todo 不能直接完成`

### Requirement: Todo 归档
系统 SHALL 支持通过 `easydo archive <todo-selector>` 归档 active 或 done Todo。

#### Scenario: 归档 Todo
- **WHEN** 用户对 active 或 done Todo 执行 archive
- **THEN** 系统设置 archived_at、将状态改为 archived、记录 archived 事件并返回更新后的 Todo

#### Scenario: 重复归档 Todo
- **WHEN** 用户对已归档 Todo 执行 archive
- **THEN** 系统保持原 archived_at 和事件不变，并返回当前 Todo

### Requirement: Todo 选择器
Todo 变更命令 SHALL 接受完整 UUID 或可唯一匹配的 ID 前缀，并 MUST 拒绝模糊匹配。

#### Scenario: 使用唯一 ID 前缀
- **WHEN** 用户提供的 ID 前缀只匹配一个 Todo
- **THEN** 系统对该 Todo 执行命令

#### Scenario: ID 前缀不唯一
- **WHEN** 用户提供的 ID 前缀匹配多个 Todo
- **THEN** 系统拒绝执行并返回 `Todo ID 前缀不唯一`

#### Scenario: Todo 不存在
- **WHEN** 用户提供的选择器未匹配任何 Todo
- **THEN** 系统拒绝执行并返回 `未找到 Todo`

### Requirement: CLI 输出格式
系统 SHALL 默认输出适合终端阅读的紧凑文本，并支持通过 `--json` 输出稳定的机器可读 JSON。

#### Scenario: 默认列表输出
- **WHEN** 用户执行 list 且未指定 JSON
- **THEN** 系统输出列宽受控的列表，并确保多行 detail 不破坏记录边界

#### Scenario: JSON 输出
- **WHEN** 用户对支持的命令提供 `--json`
- **THEN** 系统只在 stdout 输出合法 JSON，并使用 camelCase 字段名

#### Scenario: 空查询结果
- **WHEN** 查询没有匹配项
- **THEN** 文本模式输出 `没有匹配的 Todo`，JSON 模式输出空数组

### Requirement: 简短明确的错误反馈
CLI MUST 对命令格式、参数值、业务状态和运行失败返回简短且明确的原因。

#### Scenario: 未知命令
- **WHEN** 用户执行不存在的子命令
- **THEN** 系统在 stderr 返回一行未知命令原因和帮助提示，并使用非零退出码

#### Scenario: 参数缺失
- **WHEN** 用户遗漏必填参数
- **THEN** 系统指出缺少的参数而不输出堆栈信息

#### Scenario: 参数值无效
- **WHEN** 用户输入不存在的状态、时间字段、Group 或 View
- **THEN** 系统指出具体无效值及对应对象类型

#### Scenario: 数据库运行失败
- **WHEN** CLI 无法打开或写入数据库
- **THEN** 系统返回简短数据库错误原因，将诊断信息写入 stderr，并且不输出 Rust panic 或 backtrace
