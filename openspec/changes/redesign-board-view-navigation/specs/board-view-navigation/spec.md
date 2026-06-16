## ADDED Requirements

### Requirement: 顶部 View 切换器
系统 SHALL 在 Board 页面顶部提供 View 切换器，并在非交互状态下只展示当前 View。

#### Scenario: 常态只展示当前 View
- **WHEN** 用户未将鼠标置于 View 切换器且没有进行切换动画
- **THEN** 系统只展示当前 View 的名称

#### Scenario: 悬停展示全部 View
- **WHEN** 用户将鼠标移动到 View 切换器区域
- **THEN** 系统横向展示全部 View，当前 View 保持完整透明度，其他 View 使用更低透明度

#### Scenario: 鼠标离开后收起
- **WHEN** 用户完成切换并将鼠标移出 View 切换器区域
- **THEN** 系统以动画收起非当前 View，只保留当前 View 名称

### Requirement: View 点击和拖拽切换
系统 SHALL 支持用户通过点击 View 名称或在展开区域横向拖拽来切换 View。

#### Scenario: 点击切换 View
- **WHEN** 用户点击一个非当前 View
- **THEN** 系统以横向滑动动画切换到该 View 并刷新 Board 筛选结果

#### Scenario: 拖拽切换 View
- **WHEN** 用户在展开的 View 切换器内横向拖拽并释放
- **THEN** 系统选择释放位置最接近的 View，并以滑动动画完成切换

#### Scenario: 拖拽未达到阈值
- **WHEN** 用户的横向移动未达到拖拽阈值
- **THEN** 系统不因该移动改变当前 View

### Requirement: View 键盘循环切换
系统 SHALL 使用 `Shift+Tab` 按排序从左到右切换 View。

#### Scenario: Shift Tab 切换到右侧 View
- **WHEN** 用户按下 `Shift+Tab` 且当前 View 不是最后一个
- **THEN** 系统以向右滑动动画切换到下一个 View

#### Scenario: Shift Tab 从最后一个回到第一个
- **WHEN** 用户在最后一个 View 按下 `Shift+Tab`
- **THEN** 系统以滑动动画切换到第一个 View
