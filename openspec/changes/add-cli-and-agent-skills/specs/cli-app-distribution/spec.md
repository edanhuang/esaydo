## ADDED Requirements

### Requirement: CLI 随 App 分发
macOS EasyDo App SHALL 包含与当前 App 版本和 CPU 架构一致的 `easydo-cli` 可执行文件。

#### Scenario: Apple Silicon 安装包
- **WHEN** 系统构建 Apple Silicon 版本 EasyDo App
- **THEN** App Bundle 包含可在 aarch64 macOS 执行的 CLI

#### Scenario: Intel 安装包
- **WHEN** 系统构建 Intel 版本 EasyDo App
- **THEN** App Bundle 包含可在 x86_64 macOS 执行的 CLI

#### Scenario: App 和 CLI 版本一致
- **WHEN** 用户执行 `easydo --version`
- **THEN** CLI 输出与已安装 EasyDo App 相同的版本号

### Requirement: 从 App 安装命令行工具
EasyDo App SHALL 提供安装和检查命令行工具的入口，使用户无需单独下载 CLI。

#### Scenario: 首次安装 CLI
- **WHEN** 用户在 App 中选择安装命令行工具并授权所需系统操作
- **THEN** 系统创建名为 `easydo` 的终端入口并验证 `easydo --version` 可执行

#### Scenario: CLI 已正确安装
- **WHEN** App 检查到终端入口已指向当前 App 内的 CLI
- **THEN** App 显示 CLI 已安装且不重复修改链接

#### Scenario: 更新旧 EasyDo CLI 链接
- **WHEN** 目标入口是 EasyDo 创建但已失效或指向旧 App 路径的链接
- **THEN** 系统将其更新为当前 App 内的 CLI

#### Scenario: 目标路径被其他文件占用
- **WHEN** 计划创建的终端入口已存在且不是 EasyDo 管理的链接
- **THEN** 系统拒绝覆盖并明确提示冲突路径

#### Scenario: 安装需要授权
- **WHEN** 终端入口目录需要管理员权限
- **THEN** App 通过 macOS 授权流程请求权限，而不是静默失败

### Requirement: 共享数据库定位
桌面端和 CLI SHALL 默认访问同一个 EasyDo SQLite 数据库，并允许测试或诊断时显式覆盖数据库路径。

#### Scenario: 使用默认数据库
- **WHEN** 用户在已安装 App 的同一账号下执行 CLI
- **THEN** CLI 打开 App 数据目录中的 `easydo.sqlite`

#### Scenario: 覆盖数据库路径
- **WHEN** 用户提供受支持的数据库路径参数或环境变量
- **THEN** CLI 仅在本次执行中使用该数据库路径

#### Scenario: 数据库尚未创建
- **WHEN** 用户在首次打开桌面 App 前执行 CLI
- **THEN** CLI 创建数据库、执行共享 migration 并写入默认 Group 和 View

### Requirement: SQLite 多进程访问
所有 EasyDo 数据库连接 MUST 使用一致的外键、WAL 和忙等待配置，以支持桌面端与 CLI 并发访问。

#### Scenario: 桌面端运行时执行查询
- **WHEN** 桌面端持有数据库连接且用户执行只读 CLI 查询
- **THEN** CLI 在合理等待范围内完成查询而不损坏数据库

#### Scenario: 同时发生写入
- **WHEN** 桌面端和 CLI 在接近时间执行写操作
- **THEN** SQLite 串行提交事务，或 CLI 在等待超时后返回简短的数据库繁忙原因

#### Scenario: 外键约束一致
- **WHEN** CLI 执行涉及 Todo 关系的写入
- **THEN** 其外键约束行为与桌面端一致

### Requirement: 共享业务行为
桌面端 Tauri command 与 CLI SHALL 调用同一套 Todo 业务服务，而不是分别维护 SQL 和状态规则。

#### Scenario: 从任一入口创建 Todo
- **WHEN** Todo 从桌面端或 CLI 创建
- **THEN** 两个入口执行相同校验、事务、排序初始化和事件记录

#### Scenario: 从任一入口执行状态迁移
- **WHEN** Todo 从桌面端或 CLI 完成或归档
- **THEN** 两个入口遵守相同的幂等性和非法状态迁移规则
