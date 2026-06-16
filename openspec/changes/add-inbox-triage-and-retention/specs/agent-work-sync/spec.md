## ADDED Requirements

### Requirement: 实质工作结果触发
EasyDo Skill 0.2.0 SHALL 仅在交互产生明确且值得记录的工作结果后请求独立 Agent 同步 Todo。

#### Scenario: 完成实际工作
- **WHEN** 主 Agent 修改代码、生成交付物、完成发布配置或形成明确排查结论
- **THEN** 主 Agent向独立工作同步 Agent 提交本次结果摘要

#### Scenario: 纯讨论不触发
- **WHEN** 交互仅为闲聊、提问、方案讨论或用户明确要求不实施
- **THEN** 系统不创建或修改 Todo

#### Scenario: EasyDo 操作不递归触发
- **WHEN** 当前工作本身是查询或同步 EasyDo Todo
- **THEN** 系统不再次启动工作同步 Agent

### Requirement: 独立 Agent 执行同步
自动工作同步 SHALL 全程由独立 Agent 通过 EasyDo CLI 执行，并 MUST 不直接读写 SQLite。

#### Scenario: 提交结构化工作结果
- **WHEN** 主 Agent启动工作同步
- **THEN** 主 Agent提供 summary、workspace、outcome、verification 和 explicit_group 字段

#### Scenario: 独立 Agent 使用 CLI
- **WHEN** 工作同步 Agent 查询或变更 Todo
- **THEN** Agent仅调用 EasyDo CLI并遵循唯一选择器和非零退出码规则

#### Scenario: 宿主不支持独立 Agent
- **WHEN** 当前宿主无法启动独立 Agent
- **THEN** 系统跳过自动同步并返回不可用结果，不在主 Agent 内直接执行同步

### Requirement: 已有 Todo 保守匹配
工作同步 Agent SHALL 在新增 Todo 前查询已有 Todo，并仅在候选唯一且高置信度时更新或完成已有 Todo。

#### Scenario: 唯一匹配取得进展
- **WHEN** 项目、模块、功能关键词、Group 和近期活动唯一匹配一条未完成 Todo
- **THEN** Agent更新该 Todo而不新增重复 Todo

#### Scenario: 唯一匹配且验证完成
- **WHEN** 唯一匹配 Todo 对应工作已明确完成且验证通过
- **THEN** Agent完成该 Todo

#### Scenario: 多个候选无法区分
- **WHEN** 多条 Todo 均可能对应本次工作且无法唯一判断
- **THEN** Agent不得猜测完成或修改任何候选 Todo

### Requirement: 新工作 Group 路由
工作同步 Agent SHALL 按显式 Group、已有匹配 Todo、工作目录映射和语义判断的顺序确定新 Todo 的 Group。

#### Scenario: 用户明确 Group
- **WHEN** 工作结果包含用户明确指定的普通 Group
- **THEN** Agent将新 Todo 创建到该 Group

#### Scenario: 目录映射确定 Group
- **WHEN** 用户未指定 Group且 workspace 存在唯一确定的 Group 映射
- **THEN** Agent将新 Todo 创建到映射 Group

#### Scenario: 无法判断 Group
- **WHEN** Agent确认工作值得记录但无法可靠确定普通 Group
- **THEN** Agent通过收件箱命令创建暂存 Todo

#### Scenario: 无法判断是否值得记录
- **WHEN** Agent无法确认当前结果是否应形成 Todo
- **THEN** Agent返回 noop且不修改 EasyDo 数据

### Requirement: 单次同步边界
工作同步 Agent MUST 对每个工作结果最多变更一个 Todo，并返回结构化处理回执。

#### Scenario: 同步成功
- **WHEN** Agent完成新增、更新或完成操作
- **THEN** 回执包含 action、todo_id、group 和 reason

#### Scenario: 无需处理
- **WHEN** Agent决定 noop
- **THEN** 回执包含 action=noop 和简短原因

#### Scenario: CLI 操作失败
- **WHEN** CLI 返回非零退出码
- **THEN** 回执标记失败并包含 stderr 原因，且不得声称 Todo 已同步
