## Why

EasyDo 当前只能通过桌面界面操作，本地 SQLite 能力尚未形成可供终端和 AI Agent 安全复用的入口。增加随 App 分发的 CLI 和可安装的 EasyDo Skill，可以让用户、脚本及 Agent 使用同一套受校验的业务能力管理 Todo，同时避免直接读写数据库。

## What Changes

- 新增 `easydo` CLI，支持查看帮助、查询 Todo、按 View/Group/时间范围筛选，以及新增、修改、完成和归档 Todo。
- CLI 对不合法命令、参数、选择器和状态操作返回简短、明确、可执行的错误原因，并使用稳定退出码。
- 抽取桌面端与 CLI 共用的 Rust 数据库和 Todo 业务能力，统一校验、事务、事件记录和状态流转。
- 将 CLI 二进制随 macOS App 打包，并提供将 `easydo` 命令安装到用户终端 `PATH` 的入口。
- 新增 `easydo skills list` 和 `easydo skills install <all|skill-name> --agent <agents|codex|claude|all>`。
- 随 App 提供一个 EasyDo 交互 Skill，使支持 Skill 的 Agent 能通过 `easydo` CLI 查询和管理 Todo。
- 为 SQLite 多进程访问启用统一连接配置，支持桌面端和 CLI 同时访问同一数据库。

## Capabilities

### New Capabilities

- `todo-cli`: 定义 CLI 的帮助、Todo 查询与变更命令、参数校验、输出格式和错误反馈。
- `cli-app-distribution`: 定义 CLI 随桌面 App 分发、安装到终端 PATH、数据库定位及多进程访问行为。
- `agent-skill-management`: 定义内置 Skill 列表、目标 Agent 选择、Skill 安装和 EasyDo 交互 Skill。

### Modified Capabilities

无。

## Impact

- Rust 后端将从当前 Tauri command 集中实现调整为可由 Tauri 与 CLI 共同调用的核心模块。
- `src-tauri/Cargo.toml` 将增加 CLI 参数解析和平台目录处理依赖，并新增 CLI binary target。
- `tauri.conf.json`、macOS 打包脚本和设置界面将增加 CLI/Skill 资源打包及 CLI 安装能力。
- SQLite 连接初始化、状态迁移和测试数据库创建方式需要统一。
- 发布流程需要同时构建、签名和校验桌面程序及对应架构的 CLI 二进制。
