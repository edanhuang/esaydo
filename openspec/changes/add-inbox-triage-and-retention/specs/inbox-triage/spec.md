## ADDED Requirements

### Requirement: 系统收件箱
系统 SHALL 提供一个具有稳定系统标识的收件箱 Group 和只包含该 Group 的隐藏 View，且 MUST 将其与普通 Group 和普通 View 区分。

#### Scenario: 首次启动创建收件箱
- **WHEN** 数据库尚不存在系统收件箱
- **THEN** 系统幂等创建收件箱 Group、收件箱 View 及二者关系

#### Scenario: 普通 View 排除收件箱
- **WHEN** 用户查看任一普通 View 或系统“所有” View
- **THEN** 系统不展示收件箱 Group及其中 Todo

#### Scenario: 手工录入排除收件箱
- **WHEN** 用户展开底部 Todo 录入 Group 选择器
- **THEN** 系统只列出普通 Group，不提供收件箱作为手工录入目标

### Requirement: 收件箱条件入口
系统 SHALL 在收件箱存在未逻辑删除 Todo 时显示侧边栏入口，并在用户正停留于收件箱 View 时保持当前页面可定位。

#### Scenario: 非空收件箱显示入口
- **WHEN** 收件箱至少存在一条未逻辑删除 Todo
- **THEN** 侧边栏显示收件箱入口及待整理数量

#### Scenario: 空收件箱默认隐藏入口
- **WHEN** 收件箱为空且当前 View 不是收件箱
- **THEN** 侧边栏不显示收件箱入口

#### Scenario: 收件箱清空后保留页面
- **WHEN** 用户处于收件箱 View 且最后一条 Todo 被迁出或逻辑删除
- **THEN** 系统继续停留在收件箱空页面，不自动切换 View

### Requirement: 收件箱隐藏 View
系统 SHALL 允许用户从侧边栏进入只展示收件箱的隐藏 View，并 MUST 将该 View 排除在普通 View 切换列表和普通循环中。

#### Scenario: 点击收件箱入口
- **WHEN** 用户点击侧边栏收件箱入口
- **THEN** 系统进入收件箱 View并只展示收件箱 Group

#### Scenario: 普通 View 切换器隐藏收件箱
- **WHEN** 顶部 View 切换器展开
- **THEN** 系统只列出普通 View，不把收件箱作为普通切换项

#### Scenario: 从收件箱使用快捷键
- **WHEN** 用户在收件箱 View 按下 `Shift+Tab`
- **THEN** 系统切换到系统“所有” View或第一个可用普通 View

### Requirement: 收件箱提示横幅
收件箱 View SHALL 始终展示明确横幅，说明 Todo 仅被暂存、需要拖到普通 Group 才会永久保留，并会在次日 03:00 后自动删除。

#### Scenario: 非空收件箱展示横幅
- **WHEN** 收件箱包含 Todo
- **THEN** 横幅显示暂存、拖拽归类和自动删除规则

#### Scenario: 空收件箱展示横幅
- **WHEN** 用户停留在空收件箱 View
- **THEN** 横幅仍保持显示且页面展示空状态

### Requirement: 收件箱 Todo 拖拽归类
系统 SHALL 允许用户把收件箱 Todo 拖到侧边栏普通 Group，并 MUST 原子地将 Todo 从收件箱迁移到目标 Group。

#### Scenario: 成功拖到普通 Group
- **WHEN** 用户把收件箱 Todo 释放到普通 Group
- **THEN** 系统添加目标 Group 关系、移除收件箱关系、清空到期时间、记录迁移事件并永久保留 Todo

#### Scenario: Todo 迁出后立即消失
- **WHEN** 收件箱 Todo 成功迁移
- **THEN** Todo 立即从收件箱 View 消失且收件箱数量同步减少

#### Scenario: 拖到无效目标
- **WHEN** 用户把收件箱 Todo 释放到系统 Group或非 Group 区域
- **THEN** 系统不修改 Todo 关系并恢复原有显示

#### Scenario: 迁移失败
- **WHEN** 后端拒绝或无法完成收件箱迁移
- **THEN** 前端恢复 Todo 并展示简短明确的失败原因
