# CLAUDE.md

本文件为 Claude Code (claude.ai/code) 在此代码库中工作时提供指导。

## 构建命令

```bash
npm install              # 安装依赖
npm run dev             # 开发构建，支持热重载
npm run build           # 生产构建（运行 tsc + esbuild）
```

**重要**：构建完成后，需将 `main.js`、`manifest.json` 和 `styles.css` 复制到 `<Vault>/.obsidian/plugins/obsidian-gantt-calendar/`，然后重新加载 Obsidian 进行测试。

## 项目概述

本项目 fork 自 [sustcsugar/obsidian-gantt-calendar](https://github.com/sustcsugar/obsidian-gantt-calendar)，在原项目基础上借鉴了日历视图框架和 UI 设计，但进行了以下关键性修改：

1. **彻底重构任务数据系统**：抛弃原有的 Markdown 解析方式（Tasks/Dataview 格式），改为专用 JSON 文件存储（`data/tasks.json`），提供独立的 CRUD 接口和数据层抽象
2. **大幅改造视图系统**：重写周视图（甘特图风格 bar 布局）、月视图（简化显示逻辑）、任务视图（新增简洁/完整双模式），以及全新的工具栏、排序、筛选系统
3. **实现 GitHub 数据同步**：新增 GitHub Sync Service，支持通过 GitHub Actions 定时推送任务日报和提醒到 Issue，实现跨设备数据备份

当前版本：**2.0.0**

## 架构

### 入口点
- `main.ts` - 插件生命周期（onload/onunload），注册视图、命令和事件监听器
- `GCMainView.ts` - 主视图容器，管理所有子视图

### 数据层
- `src/data-layer/JsonDataSource.ts` - 主数据源，任务存储在 `.obsidian/plugins/obsidian-gantt-calendar/data/tasks.json`
- `src/TaskStore.ts` - TaskStore 门面，提供统一的 CRUD 接口，集成 GitHub 同步
- `src/data-layer/EventBus.ts` - 事件总线，用于组件间通信
- `src/data-layer/TaskRepository.ts` - 仓储模式，管理任务缓存和查询

### 视图系统
插件使用基类模式构建视图：
- `BaseViewRenderer` - 所有视图的共享方法（任务渲染、工具提示、链接解析）
- 各视图继承此基类：`MonthView`、`WeekView`、`TaskView`

视图类型定义：`CalendarViewType = 'month' | 'week' | 'task'`

#### 周视图（甘特图风格）
周视图采用甘特图布局，每个任务显示为一行横向 bar：
- Header：7 列日期头（周几 + 日期数字），高亮今天，不显示农历
- Body：每个待办占独立一行，提醒类任务通过贪心装箱合并到共享行
- Bar 颜色按类型区分：蓝色=待办、橙色虚线=提醒、绿色=已完成；同类型内通过透明度区分优先级（高=深、普通=中、低=浅）
- 交互：hover 显示 tooltip、点击打开编辑弹窗、支持状态/标签筛选、待办任务显示可点击复选框
- 标题格式：`第X周 (M.D-M.D)`，支持通过 `semesterStartDates` 学期起始日列表实现自定义周数（自动选择最近的过去日期）
- 动态 7 日模式：长按标题进入「今天起7天」模式（无翻页箭头），单击标题切回标准周；可通过 `defaultWeekMode: 'rolling7'` 设为默认启动模式

#### 月视图
- 待办仅在截止日期（dueDate）当天显示
- 无截止日的待办在开始日期（startDate）当天显示
- 提醒仅在 dueDate 当天显示
- 已完成任务仅在完成日当天显示
- 日格子内任务超出时可滚动查看（隐藏滚动条，通过鼠标滚轮/触控板滚动）
- 「今天」格子仅使用浅红色背景高亮，不添加边框色（避免与网格线产生视觉冲突）

#### 任务视图
- 仅显示截止时间（不显示创建、开始等其他日期）
- 不显示任务类型标签（待办/提醒）

### 工具栏系统
`src/toolbar/` 中的三区域对称布局：
- **左侧** `toolbar-left.ts`：视图切换按钮组 [周 | 月 | 任务]
- **中间** `toolbar-center.ts`：导航箭头 + 标题（◀ 第5周 (2.3-2.9) ▶），单击标题回到今天，长按标题切换 rolling7 模式，任务视图和 rolling7 模式时隐藏箭头
- **右侧** `toolbar-right.ts`：功能按钮组 [筛选 | 预设 | 新建]，与左侧视图切换按钮组视觉对称
  - **筛选**：弹出视图菜单面板（`components/view-menu.ts`），包含状态筛选、标签筛选、排序、日期范围
  - **预设**：快捷预设按钮（`components/preset-button.ts`），单击应用默认预设，长按打开预设选择
  - **新建**：打开创建任务弹窗
- **响应式** `toolbar-responsive.ts`：紧凑模式下隐藏按钮文字标签

### 任务管理
- `src/tasks/taskSearch.ts` - 按日期/状态过滤任务
- `src/tasks/taskUpdater.ts` - 更新任务属性
- `src/tasks/taskSorter.ts` - 任务排序逻辑
- `src/tasks/taskStatus.ts` - 任务状态定义（7 种默认状态，固定不可自定义）
- `src/data-layer/` - 负责任务缓存的管理

### 服务
- `src/services/GitHubSyncService.ts` - GitHub 数据同步服务
- `src/services/githubTemplates.ts` - GitHub Action 工作流模板

## 代码统一管理规范
DOM类名统一使用 ./src/utils/bem.ts 进行管理, 新建类名需在此文件中进行定义并引用
修改DOM结构或者样式之前,请先检查是否有相关的旧类未移除,移除未使用的旧类.
正则表达式统一使用 ./src/utils/RegularExpression.ts 进行管理.
优先级相关逻辑（图标、标签、CSS类名、排序权重）统一使用 ./src/utils/priorityUtils.ts 管理，三级：high/normal/low.
全局任务悬浮窗统一复用 ./src/utils/tooltipManager.ts
任务条目更新统一复用 updateTaskProperties函数进行.

## Git 提交规范

**重要规则**：
- ❌ **禁止自动提交**：完成代码修改后，不要自动执行 `git commit` 或 `git push`
- ✅ **等待用户指示**：仅当用户明确要求提交时，才执行 Git 提交操作
- ✅ **可以运行构建**：修改代码后可以运行 `npm run build` 进行验证
- ✅ **可以查看状态**：可以使用 `git status`、`git diff` 等命令查看修改状态

## Windows 特殊文件名注意事项

**避免创建保留设备名文件**：

在 Windows 环境下，以下名称是系统保留的设备名，不应作为文件名使用：
- `NUL` - 空设备
- `CON` - 控制台
- `PRN` - 打印机
- `AUX` - 辅助设备
- `COM1-9` - 串口
- `LPT1-9` - 并口

**问题原因**：
在 Git Bash 环境下，使用 `2>nul` 或类似的输出重定向语法时，可能会意外创建名为 `nul` 的文件，而不是重定向到空设备。

**避免方式**：
```bash
# ❌ 错误：可能在 Windows Git Bash 中创建 nul 文件
dir "path" 2>nul | findstr "pattern"

# ✅ 正确：使用 /dev/null（Git Bash 兼容）
dir "path" 2>/dev/null | findstr "pattern"

# ✅ 正确：直接使用 Bash 原生命令
find "path" -name "*pattern*"

# ✅ 正确：使用 Glob 工具代替 bash 命令
```

**如果意外创建了此类文件**：
```bash
# 使用 Git Bash 的 rm 命令删除
rm -f nul
```
