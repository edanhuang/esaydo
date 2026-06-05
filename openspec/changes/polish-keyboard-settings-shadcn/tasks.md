## 1. shadcn/ui 基础接入

- [x] 1.1 初始化 shadcn/ui 配置，补齐所需依赖并保留现有 Vite、React、Tailwind 构建链路
- [x] 1.2 新增 `src/lib/utils.ts` 并提供 `cn` className 合并工具
- [x] 1.3 添加本阶段需要的 shadcn/ui 基础组件：Dialog、Button、Input、Label
- [x] 1.4 将 Settings 相关新增控件优先使用 shadcn/ui 组件实现

## 2. 快捷键设置持久化

- [x] 2.1 新增 SQLite 迁移，创建 `app_settings` key-value 设置表
- [x] 2.2 定义快捷键配置模型、默认值和 `shortcuts.v1` 设置 key
- [x] 2.3 新增 Tauri 命令读取快捷键设置，缺省时返回默认配置
- [x] 2.4 新增 Tauri 命令保存快捷键设置，并通过 upsert 写入 SQLite
- [x] 2.5 为快捷键设置读取、保存、缺省值补充 Rust 测试

## 3. Settings 弹窗

- [x] 3.1 新增 Settings Dialog 组件，展示快捷键动作、当前绑定、保存、取消、重置默认
- [x] 3.2 实现快捷键录入捕获模式，捕获期间不触发原快捷键动作
- [x] 3.3 实现重复快捷键和非法快捷键校验，校验失败时阻止保存并提示用户
- [x] 3.4 在应用状态中接入 Settings 打开关闭逻辑，并支持默认 `Cmd+,` 打开
- [x] 3.5 确认 Settings 只包含快捷键配置，不出现分组、标签或 BoardView 管理入口

## 4. 窗口内快捷键管理

- [x] 4.1 实现前端窗口内快捷键匹配工具，支持 `Meta`、方向键、空格、回车等组合
- [x] 4.2 将快捷键监听限制在 EasyDo WebView 获得焦点时执行，不注册 Tauri/macOS 全局快捷键
- [x] 4.3 在 Settings 打开、快捷键捕获、Todo 编辑态时暂停普通 Todo 快捷键动作
- [x] 4.4 保存快捷键配置后更新当前窗口内快捷键映射

## 5. Todo 选中、编辑与完成流转

- [x] 5.1 为可见 Todo 列表维护选中态，鼠标点击 Todo 时更新选中项并展示选中样式
- [x] 5.2 实现 `Cmd+ArrowUp/Down` 在可见 Todo 中切换选中态，首尾边界保持当前选中项
- [x] 5.3 列表刷新后保留仍可见的选中 Todo，不可见时选择第一个可见 Todo 或清空选中态
- [x] 5.4 实现选中 Todo 按 `Space` 进入内联编辑，编辑态聚焦输入并填入当前内容
- [x] 5.5 实现编辑态 `Enter` 保存非空内容、`Esc` 取消、空内容阻止保存
- [x] 5.6 新增或复用 Todo 内容更新命令，保证内联编辑结果持久化
- [x] 5.7 实现非编辑态 `Cmd+Enter` 完成 active Todo 或回溯 done Todo，并继续记录事件日志
- [x] 5.8 确认本阶段不会通过快捷键打开 detail 弹层

## 6. 验证

- [x] 6.1 补充前端测试覆盖 Settings 打开、快捷键冲突校验、快捷键捕获状态隔离
- [x] 6.2 补充前端测试覆盖鼠标选中、`Cmd+ArrowUp/Down` 切换、`Space` 编辑、`Cmd+Enter` 完成/回溯
- [x] 6.3 运行前端测试、Rust 测试、Tauri 检查和生产构建
- [x] 6.4 启动应用做手工验证：Settings 弹窗、窗口内快捷键、Todo 内联编辑和完成/回溯流程
