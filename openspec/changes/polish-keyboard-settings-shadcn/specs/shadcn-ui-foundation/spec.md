## ADDED Requirements

### Requirement: shadcn/ui 基础结构
系统 SHALL 接入 shadcn/ui 基础结构，并保留当前 React、Vite、Tailwind 技术栈。

#### Scenario: 项目存在 shadcn 配置
- **WHEN** 开发者查看前端项目结构
- **THEN** 系统包含 shadcn/ui 所需配置和依赖
- **THEN** 系统保留现有 Vite、React 和 Tailwind 构建链路

#### Scenario: 项目存在 UI 组件目录
- **WHEN** 开发者查看 `src/components/ui`
- **THEN** 系统包含本阶段所需的 shadcn/ui 基础组件

#### Scenario: 项目存在工具函数
- **WHEN** 开发者查看 `src/lib/utils.ts`
- **THEN** 系统提供用于合并 className 的 `cn` 工具函数

### Requirement: 本阶段控件使用 shadcn/ui
系统 SHALL 使用 shadcn/ui 组件实现本阶段新增或明显触达的弹窗、按钮和输入控件。

#### Scenario: Settings 使用 Dialog
- **WHEN** 用户打开 Settings
- **THEN** 系统使用 shadcn/ui Dialog 组件承载弹窗结构

#### Scenario: Settings 表单使用基础组件
- **WHEN** 用户查看 Settings 中的快捷键配置表单
- **THEN** 系统使用 shadcn/ui Button、Input、Label 等基础组件呈现可交互控件

### Requirement: 保持现有 MVP 视觉和布局稳定
系统 MUST 在接入 shadcn/ui 时保持当前 Todo、Done、Worklog 的核心布局和操作路径可用。

#### Scenario: 页面布局仍可使用
- **WHEN** 用户打开主页面
- **THEN** 系统仍展示 Todo、Done、Worklog 的主要区域
- **THEN** 系统不因为 shadcn/ui 接入改变 MVP 的核心导航和数据流

#### Scenario: 现有 Todo 操作仍可用
- **WHEN** 用户执行新增 Todo、完成 Todo、回溯 Todo 或查看 Worklog
- **THEN** 系统保持这些 MVP 核心操作可用

### Requirement: 不引入大范围视觉重做
系统 MUST 将 shadcn/ui 接入限制在基础设施和本阶段相关控件，不进行无关页面重构。

#### Scenario: 未触达功能不重构
- **WHEN** 本阶段实现完成
- **THEN** 系统不包含与 Settings、快捷键、Todo 选中编辑无关的大范围视觉重构
