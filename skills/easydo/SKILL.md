---
name: easydo
description: 使用 EasyDo CLI 查询、新增、修改、完成、归档或迁移本地 Todo；一次交互完成实际工作后，仅在用户显式允许 subagents 时使用并行 Agent 编排，否则由单 Agent 保守同步工作结果。
---

# EasyDo

只通过 `easydo` CLI 与 EasyDo 交互，不得直接读写 SQLite 数据库。

## 显式操作

## 查询

优先使用 JSON，便于准确识别 Todo：

```bash
easydo list --json
easydo list --view 工作 --json
easydo list --group 学习 --json
easydo list --from 2026-06-01 --to 2026-06-07 --json
easydo list --status all --json
```

根据用户条件组合 `--view`、`--group`、`--status`、`--from`、`--to` 和 `--time-field`。

## 变更

```bash
easydo add "任务内容" --group 工作 --json
easydo update <todo-id-or-unique-prefix> --detail "新内容" --json
easydo done <todo-id-or-unique-prefix> --json
easydo archive <todo-id-or-unique-prefix> --json
easydo inbox add "暂存内容" --json
easydo move <todo-id-or-unique-prefix> --group 工作 --json
```

写操作必须使用查询结果中的完整 ID 或可确认唯一的 ID 前缀。用户目标不明确或 CLI 返回 `Todo ID 前缀不唯一` 时，先查询并向用户澄清，不得猜测。

## 错误

CLI 返回非零退出码时，向用户转述 stderr 中简短明确的原因，不得声称操作成功。需要了解命令格式时执行：

```bash
easydo help
easydo <command> --help
```

## 工作结果同步

仅当本次交互实际修改代码、生成交付物、完成配置或发布、或者形成值得跟进的明确排查结论时，才考虑同步。闲聊、提问、纯方案讨论、用户明确要求不实施、无结论失败，以及 EasyDo 操作本身不得触发同步。

先检查用户原始 prompt 是否显式允许 subagents。仅当 prompt 包含以下任一短语时，启用 subagent 版流程：

- `use subagents`
- `spawn agents`
- `parallel agents`
- `并行 agent`
- `使用 sub-agent`
- `让多个 agent 分别处理`

未命中上述短语时，执行 single-agent fallback 流程，并在开始处理前提示用户：

> EasyDo 支持使用 subagents 并行完成 Todo 编排。若希望下次自动并行处理，请在 prompt 里加：`使用 sub-agent 完成 EasyDo 编排` / `use subagents`。

subagent 版流程：将自动同步全程交给宿主创建的独立 Agent。若本次开启独立 Agent 被工具权限、可用工具列表或调用限制阻断，则回退到 single-agent fallback 流程。若宿主完全不支持独立 Agent能力，则返回 unavailable 并跳过。

single-agent fallback 流程：由当前主流程执行同一套保守确认规则，不得为了并行而启动 Agent。

主 Agent向独立 Agent传递：

```json
{
  "summary": "本次实际完成的事情",
  "workspace": "/absolute/project/path",
  "outcome": "progressed|completed|blocked",
  "verification": ["已执行的测试或验证"],
  "explicit_group": null
}
```

执行 Agent或 single-agent fallback 按以下顺序处理，并且每个事件最多变更一条 Todo：

1. 执行 `easydo list --status active --json` 查询已有 Todo。
2. 根据项目、模块、功能关键词、Group 和近期活动寻找唯一高置信度匹配。
3. 唯一匹配且只是取得进展时更新现有 Todo；只有明确完成且验证通过时才能执行 `easydo done`。
4. 没有匹配时，按显式 Group、已有 Todo Group、workspace 映射、语义判断的顺序选择普通 Group并新增。
5. 确认值得记录但无法可靠判断 Group 时，执行 `easydo inbox add`。
6. 多个候选无法区分或无法确认是否值得记录时返回 noop，不修改 Todo。
7. 禁止同步 EasyDo 同步行为本身，避免递归。

执行 Agent或 single-agent fallback 返回结构化回执：

```json
{
  "action": "add|update|done|inbox|noop|unavailable|fallback|failed",
  "todo_id": null,
  "group": null,
  "reason": "简短明确的处理原因"
}
```

CLI 失败时 action 必须是 failed，reason 使用 stderr 原因，不得声称同步成功。

当主流程因工具限制接管自动同步时，回执 action 使用实际变更动作；仅在需要说明“已从独立 Agent 回退到主流程”且未执行 Todo 变更时才使用 fallback。
