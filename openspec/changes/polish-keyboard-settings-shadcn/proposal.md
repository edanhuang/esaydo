## Why

第一版 MVP 已经跑通 Todo 到 Worklog 的核心闭环，但当前交互仍然偏鼠标驱动，缺少稳定的选中态、快捷键编辑流程和设置入口。继续扩展分组、标签、详情等能力之前，需要先把窗口内快捷键体系和基础 UI 组件体系搭好，避免后续页面越多替换成本越高。

## What Changes

- 接入 shadcn/ui 基础结构和常用组件，让后续新增弹窗、按钮、输入框等控件有统一实现。
- 新增 Settings 弹窗，通过 `Cmd+,` 在 EasyDo 当前窗口激活时打开。
- Settings 暂时只管理快捷键配置，不包含分组、标签、BoardView 管理。
- 快捷键只在 EasyDo 窗口内生效，不注册 macOS 全局快捷键。
- 使用 SQLite 保存快捷键配置，避免桌面端配置散落在浏览器本地存储中。
- 完善 Todo 选中态：鼠标点击选中，`Cmd+ArrowUp/Down` 切换选中任务。
- 在选中 Todo 上支持 `Space` 进入内容编辑，`Cmd+Enter` 在未编辑时完成或回溯完成态。
- 暂不实现 detail 弹层，优先把列表内选中、编辑、完成切换流程做好。

## Capabilities

### New Capabilities

- `app-settings-shortcuts`: Settings 弹窗、窗口内快捷键配置、快捷键持久化。
- `todo-keyboard-selection-editing`: Todo 选中态、键盘切换、内联编辑、完成/回溯完成态。
- `shadcn-ui-foundation`: shadcn/ui 初始化、基础组件接入、统一 UI 工具函数。

### Modified Capabilities

None.

## Impact

- 前端会新增 shadcn/ui 组件目录和 `cn` 工具函数，并替换本次涉及的按钮、输入、弹窗控件。
- Todo 看板页面会增加窗口内快捷键监听、选中态管理和内联编辑状态。
- Tauri/Rust 后端会增加快捷键配置的 SQLite 持久化表和读取/保存命令。
- 需要补充前端交互测试和 Rust 侧设置持久化测试，验证默认快捷键、保存后重启加载、Todo 完成/回溯完成态等关键路径。
