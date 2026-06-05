## ADDED Requirements

### Requirement: Settings 弹窗入口
系统 SHALL 提供 Settings 弹窗，并在 EasyDo 当前窗口激活时通过默认快捷键 `Cmd+,` 打开。

#### Scenario: 当前窗口激活时打开 Settings
- **WHEN** 用户在 EasyDo 窗口获得焦点时按下 `Cmd+,`
- **THEN** 系统打开 Settings 弹窗

#### Scenario: 非全局快捷键
- **WHEN** EasyDo 窗口未激活
- **THEN** 系统 MUST NOT 通过 macOS 全局快捷键注册处理 `Cmd+,`

### Requirement: Settings 仅管理快捷键
系统 SHALL 在本阶段的 Settings 弹窗中只展示快捷键配置能力，不展示分组、标签或 BoardView 管理。

#### Scenario: 打开 Settings 查看内容
- **WHEN** 用户打开 Settings 弹窗
- **THEN** 系统展示快捷键动作、当前绑定、保存、取消和重置默认入口
- **THEN** 系统不展示分组管理、标签管理或 BoardView 管理入口

### Requirement: 快捷键配置持久化
系统 SHALL 使用 SQLite 保存快捷键配置，并在应用重启后加载已保存配置。

#### Scenario: 保存快捷键配置
- **WHEN** 用户在 Settings 弹窗中修改快捷键并点击保存
- **THEN** 系统将配置写入 SQLite 的应用设置存储
- **THEN** 新配置在当前窗口内生效

#### Scenario: 重启后加载快捷键配置
- **WHEN** 应用重启且 SQLite 中存在已保存的快捷键配置
- **THEN** 系统加载已保存配置而不是默认配置

#### Scenario: 首次启动使用默认配置
- **WHEN** 应用启动且 SQLite 中没有快捷键配置
- **THEN** 系统使用默认快捷键配置

### Requirement: 快捷键配置校验
系统 MUST 在保存快捷键配置前校验重复绑定和非法按键组合。

#### Scenario: 重复快捷键阻止保存
- **WHEN** 用户将两个动作设置为相同快捷键并点击保存
- **THEN** 系统阻止保存
- **THEN** 系统在 Settings 弹窗中展示冲突提示

#### Scenario: 非法快捷键阻止保存
- **WHEN** 用户录入空值、单独修饰键或不可识别按键组合并点击保存
- **THEN** 系统阻止保存
- **THEN** 系统保持 Settings 弹窗打开

### Requirement: Settings 弹窗状态隔离
系统 MUST 在 Settings 弹窗打开或快捷键捕获期间避免触发 Todo 列表快捷键动作。

#### Scenario: Settings 打开时不切换 Todo
- **WHEN** Settings 弹窗处于打开状态
- **THEN** 用户按下 Todo 相关快捷键不会切换、编辑、完成或回溯 Todo

#### Scenario: 捕获快捷键时不触发原动作
- **WHEN** 用户正在为某个动作录入新的快捷键
- **THEN** 系统只记录该按键组合
- **THEN** 系统不执行该按键组合原本绑定的动作
