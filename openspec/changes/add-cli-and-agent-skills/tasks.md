## 1. 共享核心层

- [x] 1.1 新建 `core` 模块结构，将领域模型、错误类型、数据库访问和 Todo 服务与 Tauri 适配层分离
- [x] 1.2 将数据库路径之外的 migration、seed 和连接配置整理为可由桌面端与 CLI 调用的 `open_database`
- [x] 1.3 为所有连接启用 foreign keys、WAL 和 busy timeout，并补充连接配置测试
- [x] 1.4 实现统一的 Group、View 和 Todo 选择器解析，覆盖完整 ID、完整名称和唯一 Todo ID 前缀
- [x] 1.5 定义 `TodoFilter`、状态集合、时间字段和半开时间区间数据结构
- [x] 1.6 将 Todo 关系读取、View/Group 筛选和时间筛选迁移到共享查询服务
- [x] 1.7 将 create、update detail、complete 和 archive 迁移到共享事务服务并统一事件记录
- [x] 1.8 实现 complete/archive 幂等行为和 archived Todo 非法完成校验
- [x] 1.9 将现有 Tauri commands 改为共享服务适配器并保持前端 invoke 契约兼容
- [x] 1.10 使用共享 migration 重构 Rust 测试数据库，移除测试中的重复建表 SQL

## 2. CLI 命令基础

- [x] 2.1 在 Cargo 配置中增加 `easydo-cli` binary target、clap 和平台目录依赖
- [x] 2.2 定义顶层命令树、全局 `--database`、`--version`、`help` 和各级 `--help`
- [x] 2.3 实现领域错误到 stderr、稳定退出码和无 backtrace 默认输出的映射
- [x] 2.4 实现文本输出与 camelCase JSON 输出公共格式器
- [x] 2.5 实现默认数据库路径、`EASYDO_DB_PATH` 和 `--database` 的优先级
- [x] 2.6 为顶层帮助、子命令帮助、未知命令、缺失参数和版本输出增加 CLI 集成测试

## 3. Todo 查询命令

- [x] 3.1 实现 `easydo list` 默认查询和受控多行 detail 文本展示
- [x] 3.2 实现 `--view` 和 `--group` 筛选及普通空 View 语义
- [x] 3.3 实现 `--status active|done|archived|all` 筛选
- [x] 3.4 实现 `--from`、`--to` 和 `--time-field created|updated|completed|archived|activity`
- [x] 3.5 实现本地日期解析、次日排他结束边界和倒置范围错误
- [x] 3.6 实现 list 的 `--json`、空结果文本和空数组输出
- [x] 3.7 为单项及组合筛选、日期边界、无效 Group/View/状态/时间字段增加集成测试

## 4. Todo 写命令

- [x] 4.1 实现 `easydo add <detail> --group <group>...` 和新增 Todo 输出
- [x] 4.2 实现 `easydo update <selector> --detail <detail>`
- [x] 4.3 实现 `easydo done <selector>` 及重复完成幂等行为
- [x] 4.4 实现 `easydo archive <selector>` 及重复归档幂等行为
- [x] 4.5 为不存在和不唯一的 Todo 前缀、空内容、缺少 Group 及非法状态迁移增加明确错误测试
- [x] 4.6 验证 CLI 与 Tauri 写操作生成相同关系、时间字段和 todo_events

## 5. 内置 EasyDo Skill

- [x] 5.1 新增 Skill manifest 格式、解析器及内置资源目录
- [x] 5.2 编写 `easydo` Skill 的 `SKILL.md`，覆盖触发条件、查询、写操作、JSON 和错误处理
- [x] 5.3 在 Skill 中明确禁止直接读写 SQLite，并要求不唯一目标先查询或澄清
- [x] 5.4 实现 `easydo skills list` 文本和 JSON 输出
- [x] 5.5 为 manifest 缺失、格式错误和内置 EasyDo Skill 内容增加测试

## 6. Skill 安装

- [x] 6.1 实现 agents、codex、claude 三个目标目录适配器及 `--agent all`
- [x] 6.2 实现 `skills install <skill-name>` 和 `skills install all`
- [x] 6.3 实现临时目录复制、`.easydo-skill.json` 管理标识和原子安装
- [x] 6.4 实现同版本幂等、EasyDo 管理版本升级和非管理同名目录拒绝覆盖
- [x] 6.5 实现多目标逐项结果汇总和部分失败非零退出码
- [x] 6.6 为目录自动创建、重复安装、版本升级、冲突目录、未知 Skill 和缺少 `--agent` 增加测试

## 7. App 内 CLI 安装

- [x] 7.1 新增后端命令以定位 App Bundle 内 CLI 并检查 `/usr/local/bin/easydo` 状态
- [x] 7.2 实现受控 macOS 授权安装流程，只创建或更新 EasyDo 管理的符号链接
- [x] 7.3 对普通文件、第三方链接、失效旧链接和移动后的 App 路径实现明确处理
- [x] 7.4 在设置页增加命令行工具状态、安装和重新安装入口
- [x] 7.5 为状态检测、安装成功、授权失败和路径冲突增加 Rust 与前端测试

## 8. macOS 打包与发布

- [x] 8.1 更新构建脚本，为目标架构编译并按 target triple 准备 `easydo-cli`
- [x] 8.2 将 CLI binary、Skill manifest 和 Skill 文件加入 Tauri App Bundle
- [x] 8.3 确保 App 签名覆盖 CLI，并验证 Bundle 内 CLI 的执行权限
- [x] 8.4 分别构建并检查 Apple Silicon 和 Intel App/DMG 产物
- [x] 8.5 对安装产物执行 `easydo --version`、`easydo help`、Todo CRUD 和 Skill 安装冒烟测试

## 9. 回归与文档

- [x] 9.1 增加桌面端运行期间执行 CLI 读写的 SQLite 并发测试
- [x] 9.2 运行 Rust、前端、CLI 集成测试和现有 Board/Daily 回归测试
- [x] 9.3 更新 README，记录 CLI 安装、命令示例、Skill 安装、数据库覆盖和故障处理
- [x] 9.4 验证所有 CLI 失败场景只输出简短明确原因且使用约定退出码
- [x] 9.5 运行 `openspec validate add-cli-and-agent-skills --strict` 并完成发布前人工验收
