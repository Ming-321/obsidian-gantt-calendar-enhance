# 视图精简与周视图甘特图化 - 变更报告

> 日期：2026-02-07
> 状态：已完成

## 概述

本次变更对插件的视图系统进行了精简和重构，主要包含以下改动：

1. **移除日视图** — 删除 `DayView` 及所有相关引用
2. **周视图甘特图化** — 重写周视图为甘特图风格（横向时间条）
3. **月视图过滤逻辑调整** — 待办仅在截止日当天显示
4. **任务视图精简** — 仅显示截止时间，移除任务类型标签

---

## 一、移除日视图

### 删除的文件
- `src/views/DayView.ts` — 日视图渲染器
- `src/settings/builders/DayViewSettingsBuilder.ts` — 日视图设置构建器
- `src/components/TaskCard/presets/DayView.config.ts` — 日视图任务卡片配置

### 修改的文件

| 文件 | 修改内容 |
|------|---------|
| `src/types.ts` | `CalendarViewType` 移除 `'day'`，改为 `'month' \| 'week' \| 'task'` |
| `src/GCMainView.ts` | 移除 `dayRenderer` 及所有 DayView 引用 |
| `src/toolbar/toolbar-left.ts` | 从 `VIEW_BUTTONS` 移除 day 按钮 |
| `src/toolbar/toolbar.ts` | 移除 `DayViewRenderer` 类型导入和参数 |
| `src/toolbar/toolbar-right-calendar.ts` | 移除 `DayViewRenderer` 引用和 day 条件分支 |
| `src/settings/types.ts` | 移除 `dayViewSortField`、`dayViewSortOrder` 等字段 |
| `src/settings/constants.ts` | 移除 DayView 默认设置 |
| `src/settings/SettingTab.ts` | 移除 `DayViewSettingsBuilder` 导入和使用 |
| `src/settings/builders/index.ts` | 移除 DayView 导出 |
| `src/settings/index.ts` | 移除 DayView 导出 |
| `src/components/TaskCard/index.ts` | 移除 `DayViewConfig` 导出 |
| `styles.css` | 移除 `.gc-day-view` 相关样式（布局、子组件、状态样式） |

### 行为变更
- `selectDate()` 现在切换到周视图（原来切换到日视图）
- 默认视图选项从 `day | week | month | task` 缩减为 `week | month | task`
- 设置面板中不再显示日视图相关配置

---

## 二、周视图甘特图化

### 布局结构

```
Header Row:  [周一 2] [周二 3] [周三 4] [周四 5] [周五 6] [周六 7] [周日 8]
─────────────────────────────────────────────────────────────────────
Task Row 1:  ██████████████████ 完成报告 ██████████████████
Task Row 2:              ████████ 回复邮件 ████████
Reminder:    🔔 提醒1 ████    🔔 提醒3 ████
```

### 核心实现

**新增/重写方法（`src/views/WeekView.ts`）：**

| 方法 | 说明 |
|------|------|
| `render()` | 重写，渲染甘特图风格布局 |
| `renderHeader()` | 渲染 7 列日期头 |
| `renderGanttBody()` | 渲染甘特图主体，分离待办和提醒 |
| `renderGridLines()` | 渲染背景竖线网格 |
| `collectWeekTasks()` | 收集所有与本周有交集的任务（替代原来按天过滤） |
| `renderGanttRow()` | 渲染一行（可含多个 bar） |
| `renderGanttBar()` | 渲染单个任务 bar（位置、颜色、交互） |
| `calculateBarPosition()` | 计算 bar 的 left/width 百分比定位 |
| `packRemindersIntoRows()` | 贪心装箱算法：将不重叠的提醒合并到共享行 |

**BEM 类名新增（`src/utils/bem.ts`）：**

| 类名 | 用途 |
|------|------|
| `gc-week-view__gantt-body` | 甘特图主体容器 |
| `gc-week-view__gantt-row` | 任务行 |
| `gc-week-view__gantt-bar` | 任务条 |
| `gc-week-view__gantt-bar-label` | 条内标题文字 |
| `gc-week-view__gantt-bar-icon` | 条内图标 |
| `gc-week-view__gantt-grid-lines` | 背景网格线容器 |
| `gc-week-view__gantt-grid-line` | 单条网格线 |
| `gc-week-view__gantt-bar--high` | 高优先级修饰 |
| `gc-week-view__gantt-bar--normal` | 普通优先级修饰 |
| `gc-week-view__gantt-bar--low` | 低优先级修饰 |
| `gc-week-view__gantt-bar--reminder` | 提醒类型修饰 |
| `gc-week-view__gantt-bar--completed` | 已完成修饰 |
| `gc-week-view__gantt-grid-line--today` | 今天列高亮 |

**CSS 样式新增（`styles.css`）：**
- `.gc-week-view__gantt-body` — 弹性布局，可滚动
- `.gc-week-view__gantt-grid-lines` — 7 列网格线（absolute 定位）
- `.gc-week-view__gantt-row` — 34px 高，相对定位
- `.gc-week-view__gantt-bar` — absolute 定位，百分比 left/width
- 5 种优先级/类型颜色：高=红、普通=蓝、低=灰、提醒=橙色虚线、完成=绿

### 提醒合并逻辑

使用贪心装箱算法（`packRemindersIntoRows`），将不在同一天的提醒放到同一行：
- 计算每个提醒的天索引（0-6）
- 遍历提醒，尝试放入已有行（若天索引不冲突）
- 冲突时新建行

### 交互功能
- **Tooltip**：hover 显示 `TooltipManager` 悬浮提示
- **点击编辑**：调用 `openEditTaskModal()` 打开编辑弹窗
- **筛选**：保留状态筛选和标签筛选功能
- **排序**：保留排序功能（默认按优先级降序）

---

## 三、月视图过滤逻辑调整

### 修改位置
`src/views/BaseViewRenderer.ts` 的 `filterTasksForDate()` 方法

### 变更前
待办从 `startDate` 到 `dueDate`（含过期延续到今天）范围内每天都显示。

### 变更后
- **待办**：仅在 `dueDate` 当天显示
- **无截止日的待办**：在 `startDate` 当天显示
- **提醒**：仅在 `dueDate` 当天显示（未变）
- **已完成任务**：仅在完成日当天显示（未变）

### 影响范围
- 仅影响月视图（`MonthView`）
- 周视图有独立的 `collectWeekTasks()` 方法，不受影响
- 任务视图有独立过滤逻辑，不受影响

---

## 四、任务视图精简

### 修改位置
`src/components/TaskCard/presets/TaskView.config.ts`

### 变更内容
1. **时间属性**：仅保留截止时间显示
   - `showCreated: false`（原 `true`）
   - `showStart: false`（原 `true`）
   - `showScheduled: false`（原 `true`）
   - `showDue: true`（保持）
   - `showCancelled: false`（原 `true`）
   - `showCompletion: false`（原 `true`）

2. **任务类型标签**：不再显示
   - `showFileLocation: false`（原 `true`，此字段实际渲染的是"待办"/"提醒"文字）

---

## 五、文档更新

| 文件 | 修改内容 |
|------|---------|
| `CLAUDE.md` | 更新视图系统描述，移除 DayView/YearView/GanttView 引用 |
| `AGENTS.md` | 同步 CLAUDE.md 的视图系统描述变更 |

---

## 六、代码审查修复

### Bug 修复

1. **`calculateBarPosition()` 中 `weekEndTime` 计算错误**
   - 原来使用 `weekStartTime + 6 * dayMs`（第 6 天的 00:00），导致周日任务 bar 宽度被截断
   - 修复为使用 `this.currentWeekEnd.getTime()`（周日 23:59:59.999）

2. **`calculateBarPosition()` 边界值越界**
   - 当 `barEndTime < barStartTime`（如未来 startDate + 无 dueDate）时，改为显示单天标记
   - `leftPercent` 限制在 `0 ~ (100 - colWidth)` 范围
   - `widthPercent` 保证最小为 `colWidth`（1 天宽度）

### 残留代码清理

- `src/utils/bem.ts`：移除 `DayViewClasses`、`YearViewClasses` 导出及 `BLOCKS.DAY_VIEW`、`BLOCKS.YEAR_VIEW` 常量
- `src/utils/bem.ts`：移除 `ViewClasses.modifiers` 中的 `day`、`year`、`gantt`
- `src/utils/bem.ts`：移除 `TaskCardClasses.modifiers` 中的 `dayView`、`ganttView`
- `src/utils/bem.ts`：移除 `GanttClasses.modifiers.dayView`
- `styles.css`：移除约 71 个 `gc-year-view` / `gc-view--year` 相关 CSS 规则块
- `src/views/BaseViewRenderer.ts`：修正注释中 `'dayView'` → `'weekView'`
- `src/toolbar/toolbar-left.ts`：修正注释中 `6视图选择器` → `视图选择器`
- `src/types.ts`：修正注释中 `日视图` 引用
- `src/GCMainView.ts`：移除 `（原来是日视图）` 注释

---

## 七、工具栏精简重构

> 日期：2026-02-07（续）

### 变更概述

将工具栏从分散的多按钮布局重构为简洁对称的三区域布局。

### 新布局

```
[周 | 月 | 任务]     ◀ 第5周 (2.3-2.9) ▶     [筛选 | 预设 | 新建]
   左侧                    中间                      右侧
```

### 新增文件

| 文件 | 说明 |
|------|------|
| `src/toolbar/toolbar-right.ts` | 统一的右侧工具栏（替代旧的 calendar/task 两个文件） |
| `src/toolbar/components/view-menu.ts` | 视图菜单弹窗：状态筛选、标签筛选、排序、日期范围 |
| `src/toolbar/components/preset-button.ts` | 快捷预设按钮：单击应用默认 / 长按选择预设 |

### 删除文件

| 文件 | 原因 |
|------|------|
| `src/toolbar/toolbar-right-calendar.ts` | 被统一的 `toolbar-right.ts` 替代 |
| `src/toolbar/toolbar-right-task.ts` | 被统一的 `toolbar-right.ts` 替代 |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/toolbar/toolbar.ts` | 使用新的 `ToolbarRight`，移除 `onRefresh`/`globalFilterText`/`weekRenderer` 等死字段 |
| `src/toolbar/toolbar-center.ts` | 导航箭头内嵌到标题中，点击标题回到今天，任务视图隐藏箭头 |
| `src/toolbar/toolbar-responsive.ts` | 简化为仅保留紧凑模式（隐藏按钮文字标签） |
| `src/toolbar/components/index.ts` | 清理旧组件导出，仅保留活跃组件 |
| `src/GCMainView.ts` | 移除 `onRefresh`/`globalFilterText`/`weekRenderer` 传递 |
| `src/settings/types.ts` | 新增 `ViewPreset` 接口和 `semesterStartDate` 设置 |
| `src/settings/constants.ts` | 新增默认预设和 `semesterStartDate` 默认值 |
| `src/utils/bem.ts` | 新增 `centerNav`、`viewMenu`、`presetBtn` BEM 类 |
| `styles.css` | 新增中间导航、视图菜单面板、预设下拉菜单样式 |

### 设置新增

| 设置项 | 类型 | 说明 |
|--------|------|------|
| `semesterStartDate` | `string` | 学期起始日（YYYY-MM-DD），为空使用自然年周数 |
| `viewPresets` | `ViewPreset[]` | 快捷预设列表 |

---

## 八、周视图增强

### 自定义周数

通过设置 `semesterStartDate`（学期起始日期），可将周数显示从自然年周数切换为相对于学期开始的周数。

实现位置：`src/GCMainView.ts` 的 `getCustomWeekNumber()` 方法。

### 标题格式优化

- 周视图标题：`第X周 (M.D-M.D)`（如「第5周 (2.3-2.9)」）
- 月视图标题：`X月`（如「2月」）

### 周视图表头精简

移除农历文字显示，仅保留周几和日期数字，更简洁。

---

## 九、代码审阅修复（第二轮）

### Bug 修复

1. **`toolbar.ts` 中 `monthRenderer: undefined`**
   - `ToolbarRightConfig` 中的 `weekRenderer`/`monthRenderer` 字段是死代码
   - 右侧工具栏通过 `setRenderers()` 预设 renderer，不需要配置传入
   - 修复：从 config 中移除这两个字段

2. **`ToolbarConfig.onRefresh` 已成死代码**
   - 刷新按钮已随工具栏简化移除，`onRefresh` 回调不再被使用
   - 修复：从 `ToolbarConfig` 和 `GCMainView` 中移除

### 死代码清理

- 删除旧文件：`toolbar-right-calendar.ts`、`toolbar-right-task.ts`
- 清理 `components/index.ts`：移除 13 个不再被引用的旧组件导出
- 更新 `styles.css`：移除旧的兼容注释
- 更新 `toolbar.ts`/`toolbar-center.ts` 中的过时注释

---

## 十、周视图动态 7 日模式

> 日期：2026-02-08

### 功能描述

在标准周视图（周一~周日）基础上，新增「从今天开始的 7 天」滚动模式。

### 交互方式

| 操作 | 标准周模式 | rolling7 模式 |
|------|-----------|--------------|
| 单击标题 | 回到今天所在的标准周 | 切回标准周模式 |
| 长按标题（500ms） | 进入 rolling7 模式 | 无效果 |
| 导航箭头 | 显示（前/后跳 7 天） | 隐藏（固定显示今天起 7 天） |
| 标题格式 | 第X周 (M.D-M.D) | 今天起7天 (M.D-M.D) |

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/dateUtils/week.ts` | 新增 `getRolling7Days()` 函数 |
| `src/GCMainView.ts` | 新增 `weekMode` 状态、`handleTitleClick()`、`handleTitleLongPress()` |
| `src/toolbar/toolbar-center.ts` | 标题长按检测（mousedown/mouseup/touch）、`onLongPress` 回调 |
| `src/toolbar/toolbar.ts` | `ToolbarConfig` 新增 `showNav`、`onLongPress` 字段 |
| `src/views/WeekView.ts` | `render()` 新增 `weekMode` 参数 |

---

## 十一、学期起始日列表

> 日期：2026-02-08

### 功能描述

将单一的 `semesterStartDate` 替换为 `semesterStartDates` 列表，支持多学期的周数计算。

### 数据模型

- 旧字段 `semesterStartDate: string` 标记为 `@deprecated`
- 新字段 `semesterStartDates: string[]`（YYYY-MM-DD 格式，自动排序）
- 插件加载时自动迁移旧字段到新列表

### 自动选择逻辑

从列表中找到最近的、不晚于当前周起始日的学期起始日作为基准计算相对周数。列表为空时回退到自然年周数。

### 设置面板

在「周视图设置」下新增「学期周数设置」区域：
- 日期输入框 + 添加按钮（验证 YYYY-MM-DD 格式，不能晚于今天）
- 已有日期倒序列表，每行带删除按钮
- 自动标注学期季节（7-12月=秋季，1-6月=春季）

### 修改文件

| 文件 | 修改内容 |
|------|---------|
| `src/settings/types.ts` | 新增 `semesterStartDates: string[]`，旧字段标记 deprecated |
| `src/settings/constants.ts` | 默认值设为空数组 |
| `src/managers/SettingsManager.ts` | 新增 `migrateSemesterStartDate()` 迁移逻辑 |
| `src/GCMainView.ts` | 重写 `getCustomWeekNumber()` 支持列表查找 |
| `src/settings/builders/WeekViewSettingsBuilder.ts` | 新增学期起始日管理 UI |

### 代码审阅修复

- `GCMainView.ts`：清理 5 个未使用的 import（`setIcon`、`Notice`、`formatDate`、`formatMonth`、`solarToLunar`、`getShortLunarText`）

---

## 构建验证

所有修改均通过 `tsc -noEmit -skipLibCheck` 和 `npm run build` 验证，无类型错误。
