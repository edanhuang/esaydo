---
name: easydo
description: 使用 EasyDo CLI 查询、新增、修改、完成、归档或迁移本地 Todo，并规定 Todo 内容写法；工作结果同步由后台 hook 自动完成，会话内不主动同步。
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
easydo mark <todo-id-or-unique-prefix> --priority high --json
easydo mark <todo-id-or-unique-prefix> --priority normal --json
easydo done <todo-id-or-unique-prefix> --json
easydo archive <todo-id-or-unique-prefix> --json
easydo inbox add "暂存内容" --json
easydo move <todo-id-or-unique-prefix> --group 工作 --json
```

写操作必须使用查询结果中的完整 ID 或可确认唯一的 ID 前缀。用户目标不明确或 CLI 返回 `Todo ID 前缀不唯一` 时，先查询并向用户澄清，不得猜测。

## Todo 内容写法

看板只回答两个问题：做到哪了，下一步做什么，不回答后面全部要做什么。细节留在对话、提交记录或文档里。

- 主句：一句话，写清楚项目或需求号、是什么事；必要时补一句当前卡在哪。
- 子项只写当下：正在做或下一步马上要做的事，以及对话里明确提到、但还没做的事（待确认、先记着、暂缓的都算）。
- 不推演后续流程：比如复审、写测试用例、提测、上线，除非用户明确要求列全要做的事。
- 关键节点：能定义主 Todo 进度的阶段，完成后保留并打勾 `- [x]`。
- 非关键节点：完成后删除，不保留 `- [x]`。
- 写法：子项用 `- [ ]` / `- [x]`，写成短语，不限条数。不写 commit、requestId、数据 ID、类名和方法名、日志时间点、测试数量、排查过程。
- 空格：中文与数字、中文与英文之间不加空格（写「需求216635」「第3轮codingplan」，不写「需求 216635」「第 3 轮 codingplan」）；用户手写内容里原有的空格照旧保留。
- 更新方式：改写主句和子项列表，不追加段落、日期标题或评审记录。
- 手写内容：只调整 Agent 自己写入的内容，用户手写的内容原样保留。

反例（工作日志式，信息过细且推演了后续流程）：

```text
需求 212089 明访任务现场检查操作优化1：接口框架已提交并推送 909b20f73，JDK8 编译及 4 个契约测试通过；后续完成 modifyContext 填充、已有组修改后的结果重算与限制校验……

2026-10-19 代码 Review（仅分析，11 个新增测试通过，BUILD SUCCESS）
- [x] 确认保存请求主要字段与报告图片定位主路径未见明确遗漏
- [ ] 提测前修复：修改/恢复与确认未共用同一把锁，存在并发写入窗口
- [ ] 用 testcase-by-setup 出测试用例
- [ ] 上线时打开 Apollo 开关
```

正例：

```text
需求216635门店现场质检操作优化V1（他人AI开发，我负责review）
- [x] 3个功能点问题梳理、决策记录
- [x] 第3轮codingplan，功能点③改回正确口径
- [ ] 第4轮待修：页面编译不过、已完成对象不能再加一组
- [ ] 确认再拍时点返回是否也算「确认并完成」
```

## 错误

CLI 返回非零退出码时，向用户转述 stderr 中简短明确的原因，不得声称操作成功。需要了解命令格式时执行：

```bash
easydo help
easydo <command> --help
```

## 工作结果同步

工作结果同步由 EasyDo 安装的 Claude Code hook 在会话之外自动完成：会话空闲后，后台判断这段对话是新工作还是某条 Todo 的推进，并按「Todo 内容写法」维护 Todo。

会话内不要主动同步工作结果，避免重复写入。只有用户明确要求记录或修改 Todo 时，才按上面的显式操作执行。
