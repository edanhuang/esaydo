## 1. 后端 View-Group 关系能力

- [x] 1.1 在 Rust 命令层新增 `set_board_view_group_membership`，校验 View/Group、幂等增删关系、更新 `updated_at` 并返回更新后的 View
- [x] 1.2 在命令注册和 TypeScript API 层暴露 View-Group 成员更新接口
- [x] 1.3 调整 `list_todos`，显式区分未传 View、系统 `所有` View、普通有 Group View 和普通空 View
- [x] 1.4 添加后端测试，覆盖普通 View 添加/移除 Group、移除最后一个 Group及 `所有` View 禁改

## 2. 顶部 View 导航

- [x] 2.1 新增 `BoardViewSwitcher`，实现常态只显示当前 View、悬停展开全部 View及非选中项降透明度
- [x] 2.2 实现点击切换和基于方向的横向滑动动画，并保证鼠标停留时维持展开、离开时收起
- [x] 2.3 实现带阈值的横向指针拖拽，释放后切换到最接近的 View并避免拖拽后误触点击
- [x] 2.4 将 `Shift+Tab` 接入统一 View 切换入口，按从左到右顺序循环且最后一个回到第一个
- [x] 2.5 从左侧栏移除 Board Views 区域，并从 Board 顶部移除“View / 输入到 Group”组合标题

## 3. 输入 Group 与 View 解耦

- [x] 3.1 点击 Group 栏标题或空白区域时，将该 Group 设为当前输入 Group
- [x] 3.2 点击 Group 内任意 Todo 时，在选择 Todo 的同时将该栏 Group 设为当前输入 Group
- [x] 3.3 保持 `Tab` 在全部 Group 中循环，并在 View 切换后保留当前输入 Group
- [x] 3.4 修改 Todo 创建后的刷新逻辑，使创建始终绑定当前输入 Group且与当前 View 无关
- [x] 3.5 为普通空 View 添加明确空状态，同时确保输入框继续显示当前输入 Group名称

## 4. 侧栏 View 成员管理

- [x] 4.1 侧栏继续展示全部 Group，仅根据当前 View 成员关系设置高亮，不高亮当前输入 Group
- [x] 4.2 普通 View 的 Group 行在悬停或聚焦时展示 `+` 或 `-`，并阻止操作按钮触发输入 Group 切换
- [x] 4.3 点击 `+/-` 后调用持久化接口、更新当前 View、本地 Group 可见性和 Todo 数据，并处理失败回滚或错误提示
- [x] 4.4 `所有` View 下隐藏全部 `+/-` 操作，并将全部 Group 作为固定可见成员

## 5. 自动化测试与视觉验证

- [x] 5.1 更新 `BoardPage` 测试，覆盖顶部 View 点击/快捷键循环、跨 View 创建和输入 Group 跟随
- [x] 5.2 新增 View 切换器组件测试，覆盖折叠/展开、透明度、点击、拖拽阈值和滑动方向
- [x] 5.3 更新侧栏测试，覆盖全部 Group 展示、成员高亮、`+/-` 逻辑及 `所有` View 禁改
- [x] 5.4 运行 Rust 测试、前端测试、TypeScript 检查和生产构建
- [x] 5.5 使用本地 Board 数据完成浏览器视觉验证，确认顶部切换动画、侧栏状态和已有 Todo 扁平列表样式
