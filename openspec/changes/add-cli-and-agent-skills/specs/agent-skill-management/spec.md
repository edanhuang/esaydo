## ADDED Requirements

### Requirement: 列出内置 Skill
系统 SHALL 通过 `easydo skills list` 列出当前 EasyDo 版本内置的全部 Skill。

#### Scenario: 列出 EasyDo 交互 Skill
- **WHEN** 用户执行 `easydo skills list`
- **THEN** 系统至少列出名为 `easydo` 的 Skill、简短用途和版本

#### Scenario: 查看机器可读列表
- **WHEN** 用户执行 `easydo skills list --json`
- **THEN** 系统输出包含 name、description 和 version 的 JSON 数组

### Requirement: 选择安装的 Skill
系统 SHALL 通过 `easydo skills install <all|skill-name>` 选择一个或全部内置 Skill。

#### Scenario: 安装指定 Skill
- **WHEN** 用户执行 `easydo skills install easydo --agent codex`
- **THEN** 系统仅安装名为 `easydo` 的 Skill

#### Scenario: 安装全部 Skill
- **WHEN** 用户执行 `easydo skills install all --agent codex`
- **THEN** 系统安装当前版本内置的全部 Skill

#### Scenario: Skill 不存在
- **WHEN** 用户指定不存在的 Skill 名称
- **THEN** 系统拒绝执行并返回 `未找到 Skill: <name>`

### Requirement: 选择目标 Agent
Skill 安装命令 MUST 要求通过 `--agent <agents|codex|claude|all>` 明确目标，并安装到对应用户级 Skill 目录。

#### Scenario: 安装到通用 Agents
- **WHEN** 用户提供 `--agent agents`
- **THEN** 系统将 Skill 安装到 `~/.agents/skills`

#### Scenario: 安装到 Codex
- **WHEN** 用户提供 `--agent codex`
- **THEN** 系统将 Skill 安装到 `~/.codex/skills`

#### Scenario: 安装到 Claude
- **WHEN** 用户提供 `--agent claude`
- **THEN** 系统将 Skill 安装到 `~/.claude/skills`

#### Scenario: 安装到全部目标
- **WHEN** 用户提供 `--agent all`
- **THEN** 系统分别安装到 agents、codex 和 claude 的用户级 Skill 目录

#### Scenario: 未指定目标
- **WHEN** 用户执行 skills install 但未提供 `--agent`
- **THEN** 系统拒绝执行并返回 `需要指定 --agent`

### Requirement: 安全且幂等的 Skill 安装
Skill 安装 SHALL 创建缺失目录，并 MUST 避免静默覆盖不受 EasyDo 管理的现有 Skill。

#### Scenario: 目标目录不存在
- **WHEN** 目标 Agent 的 Skill 根目录不存在
- **THEN** 系统创建所需目录并完成安装

#### Scenario: 重复安装相同版本
- **WHEN** 目标 Skill 已由 EasyDo 安装且内容版本相同
- **THEN** 系统保持现有文件并报告已安装

#### Scenario: 更新 EasyDo 管理的 Skill
- **WHEN** 目标 Skill 已由 EasyDo 安装但内置版本更新
- **THEN** 系统原子替换该 Skill 并报告版本变化

#### Scenario: 与用户 Skill 冲突
- **WHEN** 同名目录存在但不含 EasyDo 管理标识
- **THEN** 系统拒绝覆盖并返回冲突目录

#### Scenario: 多目标部分失败
- **WHEN** `--agent all` 中部分目标安装失败
- **THEN** 系统逐项报告成功与失败目标，并使用非零退出码

### Requirement: EasyDo 交互 Skill
内置 `easydo` Skill SHALL 指导 Agent 仅通过 CLI 查询和变更 EasyDo Todo，并提供常用命令及错误处理规则。

#### Scenario: Agent 查询 Todo
- **WHEN** Agent 使用 EasyDo Skill 响应查询 Todo 的请求
- **THEN** Skill 指导 Agent 优先调用 `easydo list --json` 并根据用户条件添加 View、Group、状态或时间范围参数

#### Scenario: Agent 变更 Todo
- **WHEN** Agent 使用 EasyDo Skill 新增、修改、完成或归档 Todo
- **THEN** Skill 指导 Agent调用对应 CLI 命令而不是直接修改 SQLite

#### Scenario: Agent 处理不明确目标
- **WHEN** Todo ID 前缀不唯一或用户未明确要操作的 Todo
- **THEN** Skill 指导 Agent先查询并澄清，不得猜测目标

#### Scenario: Agent 展示失败原因
- **WHEN** CLI 返回非零退出码
- **THEN** Skill 指导 Agent向用户转述简短明确的 stderr 原因，并且不声称操作成功
