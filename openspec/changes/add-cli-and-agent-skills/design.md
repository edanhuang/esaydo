## Context

EasyDo 当前是单个 Tauri Rust package：`commands.rs` 同时承担 Tauri 适配、业务校验、事务、SQL 查询和模型组装；数据库路径通过 `AppHandle` 获取。该结构能满足桌面 MVP，但无法让独立 CLI 在不启动桌面程序的情况下可靠复用规则。

macOS App 当前通过 DMG/App Bundle 分发。把 CLI 放入 App Bundle 只能保证文件随 App 存在，不能让 shell 自动找到 `easydo`。此外，桌面端与 CLI 会成为访问同一 SQLite 文件的不同进程，需要统一连接参数和事务边界。

Skill 是随 EasyDo 版本分发的静态目录资源。首个内置 Skill 名为 `easydo`，目标是让 Agents、Codex 和 Claude 通过 CLI 安全操作 Todo，而不是直接理解或修改数据库结构。

## Goals / Non-Goals

**Goals:**

- 提供安装 App 后可启用的 `easydo` 终端命令。
- 让桌面端和 CLI 共享 Todo 领域逻辑、migration 和数据库连接配置。
- 提供稳定、可组合、适合人和 Agent 使用的 CLI 契约。
- 对非法输入和业务失败提供短而明确的错误。
- 将内置 Skill 安全安装到支持的用户级 Agent 目录。
- 支持桌面端和 CLI 并发访问本地 SQLite。

**Non-Goals:**

- 本变更不实现云同步、远程 API、常驻 daemon 或 MCP Server。
- 不开放任意 SQL、数据库导入导出或数据库结构管理命令。
- 不新增 Group、Tag、View 的 CLI 管理命令。
- Todo update 第一阶段只修改 detail，不调整 Group、Tag 或排序。
- 不在本变更中实现 Windows/Linux CLI 安装流程或 Mac App Store 分发。
- 不自动修改用户的 shell 配置文件。

## Decisions

### 1. 保持单 Cargo package，新增可复用核心模块和第二个 binary

暂不立即迁移为 monorepo。将现有 Rust 代码整理为：

```text
src-tauri/src/
  core/
    db.rs
    error.rs
    models.rs
    selectors.rs
    todo_service.rs
    workspace_service.rs
  commands.rs
  lib.rs
  main.rs
  bin/easydo-cli.rs
```

现有桌面 binary 保持不变，新增 Cargo binary `easydo-cli`。最终终端入口名 `easydo` 是指向 App Bundle 内 `easydo-cli` 的链接，因此不会与桌面 binary target 冲突。

选择该方案是因为当前代码量较小，先形成清晰模块边界即可获得复用收益。现在拆成多个 crate 会增加 Tauri 构建、路径和发布配置成本；当 MCP 或跨平台 CLI 接入后，再把 `core` 提升为独立 crate。

### 2. Tauri command 只做适配

核心服务接收 `Connection`、输入 DTO 和选择器，不依赖 `tauri::State`。Tauri command 负责锁定连接、转换参数和将领域错误转换为字符串；CLI 负责打开连接、解析参数、格式化输出和映射退出码。

所有创建、修改和状态迁移继续使用事务，并由核心服务统一写入 `todo_events`。这样 UI 与 CLI 不会出现两套 SQL 或不同状态规则。

### 3. 使用 clap 定义命令树

CLI 使用 Rust `clap` derive API 定义顶层和子命令：

```text
easydo help
easydo list [filters] [--json]
easydo add <detail> --group <name-or-id>...
easydo update <todo-selector> --detail <detail>
easydo done <todo-selector>
easydo archive <todo-selector>
easydo skills list [--json]
easydo skills install <all|skill-name> --agent <agents|codex|claude|all>
```

选择 clap 是因为它能统一生成 help、参数缺失提示和 shell 友好的退出行为。业务错误使用自定义 `EasyDoError { code, message }`，CLI 默认只输出 message，不暴露 SQL、panic 或 backtrace。

退出码约定：

- `0`：成功。
- `2`：命令格式或参数解析错误。
- `3`：Todo、Group、View 或 Skill 不存在/不唯一。
- `4`：业务状态不允许。
- `5`：数据库、文件系统或安装失败。

### 4. 名称与 Todo ID 使用受控解析

Group 和 View 先按完整 ID 匹配，再按完整名称匹配，不做模糊名称搜索。Todo 选择器接受完整 UUID 或唯一 ID 前缀；零匹配和多匹配都必须报错，写操作绝不选择“第一个结果”。

### 5. 使用统一 TodoFilter 表达查询

核心层定义 `TodoFilter`，包含 View、Group、状态集合、时间字段和半开时间区间。不同类型过滤条件使用 AND；一个 View 内多个 Group 使用 OR。

日期参数按本地时区解析。纯日期 `to` 转为次日零点，并使用 `< end_exclusive` 查询，避免毫秒精度和夏令时边界错误。默认 `activity` 时间复用 Daily 语义：

- active 使用 `created_at`
- done 使用 `completed_at`
- archived 使用 `archived_at`

默认状态为 active 和 done，只有 `--status archived|all` 才返回归档 Todo。

### 6. 状态迁移改为幂等

`done` 对 done Todo 返回当前记录，不更新时间和事件；`archive` 对 archived Todo同理。archived 不能直接 done，避免 CLI 意外恢复历史数据。桌面端通过共享服务同时获得该行为。

该调整会改变当前重复调用 command 时重写时间和重复事件的行为，但符合 CLI 重试和 Agent 自动化场景。

### 7. 统一数据库打开与初始化

数据库模块暴露 `open_database(path)`：

- 启用 `foreign_keys = ON`
- 使用 `journal_mode = WAL`
- 设置固定 `busy_timeout`
- 执行共享 migration
- 幂等写入默认 Group 和 View

桌面端仍通过 Tauri app data 路径获得默认位置；CLI 在 macOS 使用 `~/Library/Application Support/com.edanhuang.easydo/easydo.sqlite`。测试可通过 `--database` 或 `EASYDO_DB_PATH` 使用临时数据库，命令行参数优先于环境变量。

### 8. CLI 作为 Tauri external binary 随 App 打包

构建脚本先为目标架构编译 `easydo-cli`，再按 Tauri external binary 所需的 target triple 命名并放入打包目录。Tauri 将其包含在 App Bundle 和签名范围内。

设置页增加“命令行工具”区域，展示未安装、已安装、链接失效和路径冲突状态。安装操作通过受控 macOS 授权脚本，在 `/usr/local/bin/easydo` 创建指向当前 App Bundle CLI 的符号链接。只允许替换由 EasyDo 创建的符号链接，不覆盖普通文件或第三方链接。

DMG 拖拽安装本身不执行脚本，因此用户需要在 App 内点击一次安装。未来若必须做到安装包落地后零操作可用，应另行提供签名、公证的 PKG。

### 9. Skill 作为版本化 App 资源

仓库新增：

```text
skills/
  manifest.json
  easydo/
    SKILL.md
```

manifest 记录 name、version、description 和相对路径。`skills list` 只读取内置 manifest，不扫描用户目录。CLI 构建时将这些文件打入 App Bundle；开发模式允许从仓库资源目录读取。

### 10. 使用目标适配器安装 Skill

目标目录固定为：

- agents：`~/.agents/skills`
- codex：`~/.codex/skills`
- claude：`~/.claude/skills`

安装器先复制到同目录临时目录、写入 `.easydo-skill.json` 管理标识，再使用 rename 原子替换。只有含有效 EasyDo 管理标识的同名目录可自动升级；其他同名目录视为用户资产并拒绝覆盖。

`--agent all` 逐个执行目标安装并汇总结果，不因一个目标失败而跳过其余目标，但只要存在失败就返回非零退出码。

### 11. EasyDo Skill 以 CLI 为唯一交互边界

`easydo/SKILL.md` 描述触发条件、命令选择、JSON 查询、写操作确认边界和错误处理。Skill 禁止 Agent 直接访问 SQLite，并要求遇到不唯一选择器时先查询或向用户澄清。

Skill 不复制数据库规则，只引用 CLI 公共契约，从而随 CLI 行为保持一致。

## Risks / Trade-offs

- [风险] `/usr/local/bin` 需要管理员授权 → 在 App 中明确展示授权原因，并在授权前检查冲突，避免请求权限后才失败。
- [风险] 用户移动或重命名 EasyDo.app 后符号链接失效 → 设置页启动时检查链接，允许重新安装到当前路径。
- [风险] 桌面端长事务导致 CLI 等待 → 保持事务短小、启用 WAL 和 busy timeout，超时后返回数据库繁忙原因。
- [风险] App 更新后内置 Skill 与已安装 Skill 版本不一致 → `skills install` 根据管理标识和版本执行幂等升级。
- [风险] Agent 产品后续改变 Skill 目录规范 → 将路径和安装行为封装在目标适配器中，并通过集成测试固定当前约定。
- [风险] Tauri external binary 的架构命名和签名遗漏导致发布包不可执行 → 构建任务对两种 macOS 架构执行 bundle 内容、签名和 `--version` 冒烟测试。
- [取舍] 第一阶段不提供 Group/View 管理 CLI → 保持 Todo 主流程小而稳定，后续通过独立能力扩展。

## Migration Plan

1. 抽取共享数据库与 Todo 服务，并保持现有 Tauri command API 不变。
2. 将桌面端 command 切换到共享服务，补充状态幂等和 migration 测试。
3. 新增 CLI binary、查询和写命令，并使用临时数据库完成集成测试。
4. 新增 Skill manifest、EasyDo Skill 和多目标安装器。
5. 将 CLI 与 Skill 资源加入 macOS App Bundle，增加设置页安装入口。
6. 更新构建脚本，产出并验证 Apple Silicon 和 Intel 安装包。
7. 发布前在已有用户数据库上验证迁移、桌面/CLI 并发和旧 App 回滚读取。

回滚时可移除终端符号链接并安装旧版 App。数据库 schema 不新增破坏性字段；WAL 文件由 SQLite 管理，旧版仍可打开主数据库。已安装 Skill 是普通用户文件，不影响旧 App 运行，可由用户保留或删除。

## Open Questions

无。命令语义、Skill 目标目录和 DMG 下需要用户在 App 内执行一次 CLI 安装的边界已在本设计中明确。
