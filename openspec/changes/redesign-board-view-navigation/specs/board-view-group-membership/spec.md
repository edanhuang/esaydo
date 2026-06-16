## ADDED Requirements

### Requirement: 侧栏展示 View 的 Group 成员状态
系统 SHALL 在 Board 左侧栏列出全部 Group，并根据当前 View 是否包含 Group 展示成员状态。

#### Scenario: 当前 View 包含 Group
- **WHEN** 普通 View 包含某个 Group
- **THEN** 侧栏 SHALL 高亮该 Group，且不因其是否为当前输入 Group改变高亮

#### Scenario: 当前 View 不包含 Group
- **WHEN** 普通 View 不包含某个 Group
- **THEN** 侧栏 SHALL 以普通状态展示该 Group

#### Scenario: 所有 View 显示全部 Group
- **WHEN** 当前 View 为系统保留的 `所有`
- **THEN** 侧栏 SHALL 将全部 Group 作为该 View 的可见成员展示

### Requirement: 普通 View 可以增删 Group
系统 SHALL 允许用户通过 Group 行右侧的 `+` 或 `-` 修改普通 View 的 Group 成员关系。

#### Scenario: 添加未包含的 Group
- **WHEN** 用户悬停或键盘聚焦普通 View 未包含的 Group
- **THEN** 系统展示 `+`，点击后持久化关系并在当前 Board 展示该 Group

#### Scenario: 移除已包含的 Group
- **WHEN** 用户悬停或键盘聚焦普通 View 已包含的 Group
- **THEN** 系统展示 `-`，点击后删除关系并从当前 Board 隐藏该 Group

#### Scenario: 普通 View 移除最后一个 Group
- **WHEN** 用户从普通 View 移除最后一个 Group
- **THEN** 当前 Board SHALL 显示为空，而不是显示全部 Group

### Requirement: 所有 View 禁止修改
系统 MUST 将 `所有` View 作为固定显示全部 Group 的保留 View，禁止修改其 Group 成员。

#### Scenario: 所有 View 不展示成员操作
- **WHEN** 当前 View 为 `所有`
- **THEN** Group 行右侧不展示 `+` 或 `-`

#### Scenario: 后端拒绝修改所有 View
- **WHEN** 客户端请求修改 `所有` View 的 Group 成员
- **THEN** 后端拒绝该请求且不改变持久化关系
