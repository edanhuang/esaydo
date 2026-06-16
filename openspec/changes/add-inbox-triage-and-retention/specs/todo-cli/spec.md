## MODIFIED Requirements

### Requirement: CLI 帮助信息
系统 SHALL 通过 `easydo help`、`easydo --help` 和各级子命令的 `--help` 输出对应命令、参数及简短使用示例，包括收件箱创建和 Todo 迁移命令。

#### Scenario: 查看顶层帮助
- **WHEN** 用户执行 `easydo help`
- **THEN** 系统列出 Todo、收件箱、迁移、Skill 和帮助相关命令及其用途

#### Scenario: 查看子命令帮助
- **WHEN** 用户执行 `easydo inbox add --help` 或 `easydo move --help`
- **THEN** 系统展示对应命令的必填参数、输出选项和示例

### Requirement: Todo 列表查询
系统 SHALL 支持通过 `easydo list` 查询未逻辑删除 Todo，并支持按 View、Group、状态和时间范围组合筛选。

#### Scenario: 查询默认 Todo 列表
- **WHEN** 用户执行 `easydo list` 且不提供筛选条件
- **THEN** 系统返回全部普通 Group 中未归档且未逻辑删除的 Todo，并排除收件箱

#### Scenario: 根据普通 View 查询
- **WHEN** 用户执行 `easydo list --view 工作`
- **THEN** 系统返回属于该 View 所包含任一普通 Group 的未归档且未逻辑删除 Todo

#### Scenario: 查询收件箱 View
- **WHEN** 用户执行 `easydo list --view 收件箱`
- **THEN** 系统只返回未逻辑删除的收件箱 Todo

#### Scenario: 查询普通空 View
- **WHEN** 用户查询一个不包含任何 Group 的普通 View
- **THEN** 系统返回空列表而不是全部 Todo

#### Scenario: 根据 Group 查询
- **WHEN** 用户执行 `easydo list --group 工作`
- **THEN** 系统只返回属于该 Group且未逻辑删除的 Todo

#### Scenario: 组合筛选
- **WHEN** 用户同时提供 View、Group、状态或时间范围条件
- **THEN** 系统使用 AND 语义组合不同类型的筛选条件

#### Scenario: 包含归档 Todo
- **WHEN** 用户执行 `easydo list --status all`
- **THEN** 系统返回普通 Group 中 active、done 和 archived 状态的 Todo，但排除收件箱和逻辑删除 Todo

### Requirement: Todo 创建
系统 SHALL 支持通过 `easydo add <detail> --group <group>` 创建普通 Todo，并通过 `easydo inbox add <detail>` 创建仅属于收件箱的暂存 Todo。

#### Scenario: 创建单 Group Todo
- **WHEN** 用户提供非空 detail 和一个存在的普通 Group
- **THEN** 系统创建 active Todo、建立 Group 关系、记录 created 事件并返回新 Todo

#### Scenario: 创建多 Group Todo
- **WHEN** 用户重复提供多个普通 `--group`
- **THEN** 系统将新 Todo 同时关联到所有指定普通 Group

#### Scenario: 普通创建缺少 Group
- **WHEN** 用户执行 add 但未提供 Group
- **THEN** 系统拒绝执行并返回 `至少需要指定一个 Group`

#### Scenario: 创建收件箱 Todo
- **WHEN** 用户执行 `easydo inbox add "任务内容" --json`
- **THEN** 系统创建只属于收件箱的 active Todo、设置次日 03:00 到期时间并返回 JSON

#### Scenario: 混合收件箱与普通 Group
- **WHEN** 用户尝试通过普通 add 同时指定收件箱和普通 Group
- **THEN** 系统拒绝执行并返回收件箱不能与普通 Group 混用的简短原因

## ADDED Requirements

### Requirement: Todo 收件箱迁移
系统 SHALL 支持通过 `easydo move <todo-selector> --group <group-selector>` 把收件箱 Todo 原子迁移到一个普通 Group。

#### Scenario: 迁移收件箱 Todo
- **WHEN** 用户提供唯一收件箱 Todo 和存在的普通 Group
- **THEN** 系统移除收件箱关系、添加目标 Group、清空到期时间、记录迁移事件并返回更新后的 Todo

#### Scenario: 迁移非收件箱 Todo
- **WHEN** 用户对不属于收件箱的 Todo 执行 move
- **THEN** 系统拒绝执行并返回 `Todo 不在收件箱`

#### Scenario: 迁移到系统 Group
- **WHEN** 用户把收件箱 Todo 迁移到收件箱或其他系统 Group
- **THEN** 系统拒绝执行并返回 `目标必须是普通 Group`

### Requirement: CLI 命令前补扫
需要打开数据库的 CLI 命令 SHALL 在处理用户请求前执行一次到期收件箱扫描。

#### Scenario: 查询前清理到期 Todo
- **WHEN** 用户执行 list且数据库存在到期收件箱 Todo
- **THEN** 系统先逻辑删除到期 Todo，再返回查询结果

#### Scenario: 扫描不产生额外 stdout
- **WHEN** CLI 补扫成功且用户要求 JSON 输出
- **THEN** stdout 只包含用户命令的合法 JSON 结果
