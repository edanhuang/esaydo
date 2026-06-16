## MODIFIED Requirements

### Requirement: EasyDo 交互 Skill
内置 `easydo` Skill 0.2.0 SHALL 指导 Agent 仅通过 CLI 查询和变更 EasyDo Todo，并定义由独立 Agent 执行的工作结果同步、收件箱暂存和错误处理规则。

#### Scenario: Agent 查询 Todo
- **WHEN** Agent 使用 EasyDo Skill 响应查询 Todo 的请求
- **THEN** Skill 指导 Agent优先调用 `easydo list --json` 并根据用户条件添加 View、Group、状态或时间范围参数

#### Scenario: Agent 显式变更 Todo
- **WHEN** Agent 使用 EasyDo Skill 新增、修改、完成、归档或迁移 Todo
- **THEN** Skill 指导 Agent调用对应 CLI 命令而不是直接修改 SQLite

#### Scenario: Agent 同步实际工作结果
- **WHEN** 主交互产生符合触发规则的实质工作结果
- **THEN** Skill 指导主 Agent把结构化结果交给独立 Agent处理，不阻塞主任务逻辑

#### Scenario: 无法可靠判断 Group
- **WHEN** 独立 Agent确认工作值得记录但无法判断普通 Group
- **THEN** Skill 指导 Agent使用 `easydo inbox add` 暂存 Todo

#### Scenario: Agent 处理不明确目标
- **WHEN** Todo ID 前缀不唯一或多个 Todo 都可能匹配
- **THEN** Skill 指导 Agent不得猜测修改或完成目标

#### Scenario: Agent 展示失败原因
- **WHEN** CLI 返回非零退出码
- **THEN** Skill 指导 Agent向调用方返回简短明确的 stderr 原因，并且不声称操作成功

## ADDED Requirements

### Requirement: EasyDo Skill 0.2.0 发布
系统 SHALL 将内置 EasyDo Skill 的清单版本更新为 `0.2.0`，并通过现有安装状态机制识别和升级旧版本。

#### Scenario: 列出新版本
- **WHEN** 用户执行 `easydo skills list`
- **THEN** easydo Skill 的版本显示为 `0.2.0`

#### Scenario: 检测旧版安装
- **WHEN** 目标目录存在由 EasyDo 管理的 `0.1.0` Skill
- **THEN** 设置页和 CLI 将其识别为可更新或 outdated

#### Scenario: 升级旧版安装
- **WHEN** 用户重新安装 EasyDo 管理的旧版 Skill
- **THEN** 系统原子替换为 `0.2.0` 并更新管理标识

#### Scenario: 保留用户同名 Skill
- **WHEN** 同名目录不包含 EasyDo 管理标识
- **THEN** 系统继续拒绝覆盖该目录
