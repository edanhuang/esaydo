## ADDED Requirements

### Requirement: 收件箱 Todo 到期时间
系统 SHALL 在创建收件箱 Todo 时按用户本地时区设置为创建日次日 03:00 到期。

#### Scenario: 白天创建收件箱 Todo
- **WHEN** 用户在本地日期 2026-06-12 的任意时间创建收件箱 Todo
- **THEN** 系统将到期时间设置为本地时间 2026-06-13 03:00

#### Scenario: 临近午夜创建收件箱 Todo
- **WHEN** 用户在本地时间 2026-06-12 23:59 创建收件箱 Todo
- **THEN** 系统仍将到期时间设置为本地时间 2026-06-13 03:00

### Requirement: 到期逻辑删除
系统 SHALL 在扫描时逻辑删除已到期且仍属于收件箱的 Todo，并记录删除原因和事件。

#### Scenario: 扫描删除到期 Todo
- **WHEN** 收件箱 Todo 的到期时间不晚于扫描时间且仍属于收件箱
- **THEN** 系统设置 deleted_at、delete_reason 为 `inbox_expired`、更新 updated_at并记录 auto_deleted 事件

#### Scenario: 未到期 Todo 保留
- **WHEN** 收件箱 Todo 的到期时间晚于扫描时间
- **THEN** 系统不修改该 Todo

#### Scenario: 已迁出 Todo 保留
- **WHEN** Todo 已迁出收件箱，即使其历史到期时间早于扫描时间
- **THEN** 系统不逻辑删除该 Todo

#### Scenario: 重复扫描保持幂等
- **WHEN** 扫描再次遇到已逻辑删除 Todo
- **THEN** 系统不重复更新时间或创建 auto_deleted 事件

### Requirement: 多入口补偿扫描
系统 SHALL 在 App 启动时立即扫描、App 运行期间每 15 分钟扫描，并在 CLI 执行用户命令前补扫。

#### Scenario: App 启动扫描
- **WHEN** EasyDo App 打开数据库
- **THEN** 系统在展示数据前执行一次到期收件箱扫描

#### Scenario: App 运行期间扫描
- **WHEN** EasyDo App 持续运行
- **THEN** 系统每 15 分钟执行一次幂等扫描

#### Scenario: CLI 启动补扫
- **WHEN** 用户执行需要打开 EasyDo 数据库的 CLI 命令
- **THEN** 系统在处理该命令前执行一次到期收件箱扫描

#### Scenario: 关闭期间延迟补偿
- **WHEN** Todo 到期时 App 和 CLI 均未运行
- **THEN** 系统在下一次 App 或 CLI 打开数据库时逻辑删除该 Todo

### Requirement: 逻辑删除数据默认不可见
系统 MUST 从普通 Board、收件箱、Daily、Weekly 和 CLI 默认查询中排除 deleted_at 非空的 Todo。

#### Scenario: Board 不展示逻辑删除 Todo
- **WHEN** Todo 已被收件箱扫描逻辑删除
- **THEN** 该 Todo 不显示在任何 Board View

#### Scenario: 汇总不包含逻辑删除 Todo
- **WHEN** Daily 或 Weekly 查询工作记录
- **THEN** 结果不包含逻辑删除 Todo

#### Scenario: CLI 状态 all 仍排除逻辑删除
- **WHEN** 用户执行 `easydo list --status all`
- **THEN** 结果包含 active、done 和 archived，但不包含逻辑删除 Todo
