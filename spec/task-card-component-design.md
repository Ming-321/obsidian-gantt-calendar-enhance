# 任务卡片组件统一设计方案

## 1. 概述

### 1.1 背景

当前项目中，各视图（TaskView、DayView、WeekView、MonthView、GanttView）各自独立实现任务卡片渲染，存在大量重复代码。虽然 `BaseCalendarRenderer` 提供了部分共享方法，但整体上缺乏统一的组件抽象。

### 1.2 目标

- **代码复用**：统一任务卡片渲染逻辑，消除重复代码
- **一致性**：确保所有视图中的任务卡片行为和样式一致
- **可配置性**：通过配置控制显示元素，适应不同视图需求
- **可维护性**：集中管理任务卡片逻辑，便于后续修改和扩展
- **类型安全**：充分利用 TypeScript 类型系统

---

## 2. 当前状态分析

### 2.1 各视图任务卡片元素对比

| 元素 | TaskView | DayView | WeekView | MonthView | GanttView |
|------|----------|---------|----------|-----------|-----------|
| 复选框 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 任务描述 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 标签 | ✓ | ✓ | ✓ | ✓ | ✓ |
| 优先级 | ✓ | ✓ | ✓ | - | ✓ |
| 时间属性 | ✓ | - | - | - | - |
| 文件位置 | ✓ | - | - | - | - |
| 警告图标 | ✓ | ✓ | ✓ | ✓ | - |
| 悬浮提示 | - | - | ✓ | ✓ | - |
| 拖拽功能 | - | - | ✓ | - | - |

### 2.2 问题总结

1. **代码重复**：每个视图都有独立的 `renderXxxTaskItem` 方法
2. **配置分散**：显示逻辑硬编码在各视图方法中
3. **扩展困难**：添加新元素需要修改多个视图
4. **不一致风险**：修改样式时可能遗漏某个视图

---

## 3. 设计方案

### 3.1 组件架构

```
┌─────────────────────────────────────────────────────────────┐
│                     TaskCardComponent                       │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Config (配置接口)                        │   │
│  │  - showCheckbox: boolean                            │   │
│  │  - showDescription: boolean                         │   │
│  │  - showTags: boolean                                │   │
│  │  - showPriority: boolean                            │   │
│  │  - showTimes: boolean                               │   │
│  │  - showFileLocation: boolean                        │   │
│  │  - showWarning: boolean                             │   │
│  │  - enableTooltip: boolean                           │   │
│  │  - enableDrag: boolean                              │   │
│  │  - viewModifier: ViewModifier                       │   │
│  └─────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────┐   │
│  │              Props (数据接口)                        │   │
│  │  - task: GanttTask                                  │   │
│  │  - onToggleComplete: (task) => void                 │   │
│  │  - onClick: (task) => void                          │   │
│  │  - onDrop?: (task, targetDate) => void              │   │
│  └─────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 文件结构

```
src/components/
├── TaskCard/
│   ├── TaskCard.ts                 # 主组件
│   ├── TaskCardConfig.ts           # 配置类型定义
│   ├── TaskCardProps.ts            # Props 类型定义
│   ├── TaskCardRenderer.ts         # 渲染器（子元素渲染）
│   ├── presets/
│   │   ├── TaskView.config.ts      # 任务视图预设
│   │   ├── DayView.config.ts       # 日视图预设
│   │   ├── WeekView.config.ts      # 周视图预设（含拖拽）
│   │   ├── MonthView.config.ts     # 月视图预设
│   │   └── GanttView.config.ts     # 甘特图预设
│   └── index.ts                    # 导出
```

---

## 4. 接口定义

### 4.1 配置接口 (TaskCardConfig.ts)

```typescript
/**
 * 视图修饰符类型
 */
export type ViewModifier = 'task' | 'day' | 'week' | 'month' | 'gantt';

/**
 * 时间字段显示配置
 */
export interface TimeFieldConfig {
    showCreated?: boolean;
    showStart?: boolean;
    showScheduled?: boolean;
    showDue?: boolean;
    showCancelled?: boolean;
    showCompletion?: boolean;
    showOverdueIndicator?: boolean;
}

/**
 * 任务卡片组件配置
 */
export interface TaskCardConfig {
    /** 基础配置 */
    viewModifier: ViewModifier;           // 视图类型（用于 CSS 类名）

    /** 元素显示控制 */
    showCheckbox: boolean;                 // 显示复选框
    showDescription: boolean;              // 显示任务描述
    showTags: boolean;                     // 显示标签
    showPriority: boolean;                 // 显示优先级
    showFileLocation: boolean;             // 显示文件位置
    showWarning: boolean;                  // 显示警告图标

    /** 时间属性配置 */
    showTimes: boolean;                    // 是否显示时间区域
    timeFields?: TimeFieldConfig;          // 时间字段详细配置

    /** 交互功能 */
    enableTooltip: boolean;                // 启用悬浮提示
    enableDrag: boolean;                   // 启用拖拽
    clickable: boolean;                    // 整个卡片可点击

    /** 样式配置 */
    compact?: boolean;                     // 紧凑模式（月视图小卡片）
    maxLines?: number;                     // 描述最大行数

    /** 内容过滤 */
    showGlobalFilter?: boolean;            // 显示全局过滤词
}

/**
 * 任务卡片组件 Props
 */
export interface TaskCardProps {
    /** 任务数据 */
    task: GanttTask;

    /** 配置 */
    config: TaskCardConfig;

    /** 容器 */
    container: HTMLElement;

    /** 事件回调 */
    onToggleComplete?: (task: GanttTask, newStatus: boolean) => void;
    onClick?: (task: GanttTask) => void;
    onDrop?: (task: GanttTask, targetDate?: Date) => void;

    /** 上下文 */
    app: App;
    plugin: GanttCalendarPlugin;
}
```

### 4.2 预设配置示例

```typescript
// presets/TaskView.config.ts
export const TaskViewConfig: TaskCardConfig = {
    viewModifier: 'task',
    showCheckbox: true,
    showDescription: true,
    showTags: true,
    showPriority: true,
    showFileLocation: true,
    showWarning: true,
    showTimes: true,
    timeFields: {
        showCreated: true,
        showStart: true,
        showScheduled: true,
        showDue: true,
        showCancelled: true,
        showCompletion: true,
        showOverdueIndicator: true,
    },
    enableTooltip: false,
    enableDrag: false,
    clickable: true,
};

// presets/MonthView.config.ts
export const MonthViewConfig: TaskCardConfig = {
    viewModifier: 'month',
    showCheckbox: true,
    showDescription: true,
    showTags: true,
    showPriority: false,    // 月视图空间有限，不显示优先级
    showFileLocation: false,
    showWarning: false,     // 月视图不显示警告
    showTimes: false,
    enableTooltip: true,
    enableDrag: false,
    clickable: true,
    compact: true,
    maxLines: 1,
};

// presets/WeekView.config.ts
export const WeekViewConfig: TaskCardConfig = {
    viewModifier: 'week',
    showCheckbox: true,
    showDescription: true,
    showTags: true,
    showPriority: true,
    showFileLocation: false,
    showWarning: true,
    showTimes: false,
    enableTooltip: true,
    enableDrag: true,       // 周视图支持拖拽
    clickable: true,
};
```

---

## 5. 组件实现

### 5.1 主组件结构 (TaskCard.ts)

```typescript
/**
 * 任务卡片统一组件
 */
export class TaskCardComponent {
    private config: TaskCardConfig;
    private props: TaskCardProps;
    private renderer: TaskCardRenderer;

    constructor(props: TaskCardProps) {
        this.props = props;
        this.config = props.config;
        this.renderer = new TaskCardRenderer(props.app, props.plugin);
    }

    /**
     * 渲染任务卡片
     */
    render(): HTMLElement {
        const { task, container } = this.props;

        // 创建卡片元素
        const card = this.createCardElement();

        // 应用状态修饰符
        this.applyStateModifiers(card, task);

        // 渲染子元素
        if (this.config.showCheckbox) {
            this.renderer.renderCheckbox(card, task);
        }

        if (this.config.showDescription) {
            this.renderer.renderDescription(card, task);
        }

        if (this.config.showTags) {
            this.renderer.renderTags(card, task);
        }

        if (this.config.showPriority && task.priority) {
            this.renderer.renderPriority(card, task);
        }

        if (this.config.showTimes) {
            this.renderer.renderTimeFields(card, task, this.config.timeFields);
        }

        if (this.config.showFileLocation) {
            this.renderer.renderFileLocation(card, task);
        }

        if (this.config.showWarning && task.warning) {
            this.renderer.renderWarning(card, task);
        }

        // 应用交互
        this.attachInteractions(card, task);

        container.appendChild(card);
        return card;
    }

    private createCardElement(): HTMLElement {
        const { config } = this;
        const card = document.createElement('div');
        card.className = TaskCardClasses.block;
        card.addClass(TaskCardClasses.modifiers[`${config.viewModifier}View`]);

        if (config.compact) {
            card.addClass('gc-task-card--compact');
        }

        return card;
    }

    private applyStateModifiers(card: HTMLElement, task: GanttTask): void {
        const statusClass = task.completed
            ? TaskCardClasses.modifiers.completed
            : TaskCardClasses.modifiers.pending;
        card.addClass(statusClass);

        // 应用自定义状态颜色
        const colors = this.renderer.getStatusColors(task);
        if (colors) {
            card.style.setProperty('--task-bg-color', colors.bg);
            card.style.setProperty('--task-text-color', colors.text);
        }
    }

    private attachInteractions(card: HTMLElement, task: GanttTask): void {
        const { config, props } = this;

        // 点击事件
        if (config.clickable && props.onClick) {
            card.addEventListener('click', () => props.onClick!(task));
        }

        // 拖拽功能
        if (config.enableDrag) {
            this.attachDragBehavior(card, task);
        }

        // 悬浮提示
        if (config.enableTooltip) {
            this.renderer.createTooltip(card, task);
        }

        // 右键菜单
        this.renderer.attachContextMenu(card, task, props.onToggleComplete);
    }

    private attachDragBehavior(card: HTMLElement, task: GanttTask): void {
        card.draggable = true;
        card.setAttribute('data-task-id', `${task.filePath}:${task.lineNumber}`);

        card.addEventListener('dragstart', (e: DragEvent) => {
            if (e.dataTransfer) {
                e.dataTransfer.effectAllowed = 'move';
                e.dataTransfer.setData('taskId', `${task.filePath}:${task.lineNumber}`);
                card.style.opacity = '0.6';
            }
        });

        card.addEventListener('dragend', () => {
            card.style.opacity = '1';
        });
    }
}
```

### 5.2 渲染器 (TaskCardRenderer.ts)

```typescript
/**
 * 任务卡片渲染器
 * 负责各个子元素的渲染逻辑
 */
export class TaskCardRenderer extends BaseCalendarRenderer {

    /**
     * 渲染复选框
     */
    renderTooltip(card: HTMLElement, task: GanttTask): void {
        // 复用 BaseCalendarRenderer 中的方法
        this.createTaskTooltip(task, card, task.description);
    }

    /**
     * 渲染时间字段
     */
    renderTimeFields(card: HTMLElement, task: GanttTask, config?: TimeFieldConfig): void {
        if (!config) return;

        const container = card.createDiv(TaskCardClasses.elements.times);

        if (config.showCreated && task.createdDate) {
            this.renderTimeBadge(container, '创建', task.createdDate, TimeBadgeClasses.created);
        }
        if (config.showStart && task.startDate) {
            this.renderTimeBadge(container, '开始', task.startDate, TimeBadgeClasses.start);
        }
        if (config.showScheduled && task.scheduledDate) {
            this.renderTimeBadge(container, '计划', task.scheduledDate, TimeBadgeClasses.scheduled);
        }
        if (config.showDue && task.dueDate) {
            this.renderTimeBadge(container, '截止', task.dueDate, TimeBadgeClasses.due,
                               task.dueDate < new Date() && !task.completed);
        }
        if (config.showCancelled && task.cancelledDate) {
            this.renderTimeBadge(container, '取消', task.cancelledDate, TimeBadgeClasses.cancelled);
        }
        if (config.showCompletion && task.completionDate) {
            this.renderTimeBadge(container, '完成', task.completionDate, TimeBadgeClasses.completion);
        }
    }

    private renderTimeBadge(
        container: HTMLElement,
        label: string,
        date: Date,
        className: string,
        isOverdue = false
    ): void {
        const badge = container.createEl('span', {
            text: `${label}:${this.formatDateForDisplay(date)}`,
            cls: `${TaskCardClasses.elements.timeBadge} ${className}`
        });
        if (isOverdue) {
            badge.addClass(TimeBadgeClasses.overdue);
        }
        container.appendChild(badge);
    }

    /**
     * 附加右键菜单
     */
    attachContextMenu(card: HTMLElement, task: GanttTask, onToggleComplete?: Function): void {
        const enabledFormats = this.plugin.settings.enabledTaskFormats || ['tasks'];
        const taskNotePath = this.plugin.settings.taskNotePath || 'Tasks';
        const { registerTaskContextMenu } = require('../contextMenu/contextMenuIndex');

        registerTaskContextMenu(
            card,
            task,
            this.app,
            enabledFormats,
            taskNotePath,
            onToggleComplete || (() => {}),
            this.plugin?.settings?.globalTaskFilter || ''
        );
    }
}
```

---

## 6. 使用示例

### 6.1 在视图中使用

```typescript
// TaskView.ts - 使用完整配置
import { TaskCardComponent } from '../components/TaskCard';
import { TaskViewConfig } from '../components/TaskCard/presets/TaskView.config';

private renderTaskItem(task: GanttTask, listContainer: HTMLElement): void {
    const component = new TaskCardComponent({
        task,
        config: TaskViewConfig,
        container: listContainer,
        app: this.app,
        plugin: this.plugin,
        onClick: (task) => this.openTaskFile(task),
    });
    component.render();
}

// MonthView.ts - 使用简化配置
import { TaskCardComponent } from '../components/TaskCard';
import { MonthViewConfig } from '../components/TaskCard/presets/MonthView.config';

private renderMonthTaskItem(task: GanttTask, container: HTMLElement): void {
    const component = new TaskCardComponent({
        task,
        config: MonthViewConfig,
        container,
        app: this.app,
        plugin: this.plugin,
        onClick: (task) => this.openTaskFile(task),
    });
    component.render();
}

// WeekView.ts - 使用带拖拽的配置
import { TaskCardComponent } from '../components/TaskCard';
import { WeekViewConfig } from '../components/TaskCard/presets/WeekView.config';

private renderWeekTaskItem(task: GanttTask, container: HTMLElement, dayDate?: Date): void {
    const component = new TaskCardComponent({
        task,
        config: WeekViewConfig,
        container,
        app: this.app,
        plugin: this.plugin,
        onClick: (task) => this.openTaskFile(task),
        onDrop: (task, targetDate) => this.handleDrop(task, targetDate),
    });

    // 为拖拽设置目标日期
    if (dayDate) {
        task.targetDate = dayDate;
    }

    component.render();
}
```

### 6.2 自定义配置

```typescript
// 创建自定义配置
const customConfig: TaskCardConfig = {
    ...TaskViewConfig,
    showPriority: false,        // 不显示优先级
    showTimes: false,            // 不显示时间
    compact: true,               // 紧凑模式
};

const component = new TaskCardComponent({
    task,
    config: customConfig,
    container,
    app: this.app,
    plugin: this.plugin,
    onClick: (task) => this.openTaskFile(task),
});
```

---

## 7. CSS 类名规范

### 7.1 现有 BEM 类名（保持不变）

```css
/* Block */
.gc-task-card

/* View Modifiers */
.gc-task-card--task      /* 任务视图 */
.gc-task-card--day       /* 日视图 */
.gc-task-card--week      /* 周视图 */
.gc-task-card--month     /* 月视图 */
.gc-task-card--gantt     /* 甘特图 */

/* State Modifiers */
.gc-task-card--completed
.gc-task-card--pending
.gc-task-card--compact   /* 新增：紧凑模式 */

/* Elements */
.gc-task-card__checkbox
.gc-task-card__text
.gc-task-card__tags
.gc-task-card__priority
.gc-task-card__times
.gc-task-card__time-badge
.gc-task-card__file
.gc-task-card__warning
```

### 7.2 紧凑模式样式

```css
/* 紧凑模式 - 用于月视图等空间有限的场景 */
.gc-task-card--compact {
    padding: 2px 4px;
    font-size: 11px;
    gap: 4px;
}

.gc-task-card--compact .gc-task-card__text {
    max-lines: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
}

.gc-task-card--compact .gc-task-card__tags {
    max-width: 60px;
}

.gc-task-card--compact .gc-tag {
    max-width: 30px;
    overflow: hidden;
    text-overflow: ellipsis;
}
```

---

## 8. 迁移计划

### 8.1 阶段一：基础组件（不影响现有功能）

1. 创建 `src/components/TaskCard/` 目录结构
2. 实现核心组件和渲染器
3. 编写单元测试
4. **不修改现有视图代码**

### 8.2 阶段二：逐步迁移

1. 迁移 **MonthView**（最简单，优先迁移）
2. 迁移 **WeekView**
3. 迁移 **DayView**
4. 迁移 **TaskView**
5. 迁移 **GanttView**

### 8.3 阶段三：清理

1. 删除各视图中的 `renderXxxTaskItem` 方法
2. 清理 `BaseCalendarRenderer` 中已被组件替代的方法
3. 更新文档

---

## 9. 优势与收益

### 9.1 代码复用

- 消除 ~300 行重复代码
- 统一渲染逻辑，修改一处即可影响所有视图

### 9.2 可维护性

- 组件职责清晰，易于理解
- 配置集中管理，修改显示行为无需深入视图代码

### 9.3 可扩展性

- 新增视图类型只需添加预设配置
- 新增显示元素只需扩展组件和配置接口

### 9.4 类型安全

- 完整的 TypeScript 类型定义
- 编译时检查配置有效性

---

## 10. 风险与缓解

| 风险 | 缓解措施 |
|------|----------|
| 破坏现有功能 | 分阶段迁移，每个阶段独立测试 |
| 性能影响 | 组件设计轻量，避免过度抽象 |
| 配置复杂度 | 提供预设配置，简化常用场景 |
| CSS 样式冲突 | 保持现有 BEM 类名，新增类名使用独特前缀 |

---

## 11. 后续优化

1. **虚拟滚动**：任务数量多时优化渲染性能
2. **动画过渡**：添加状态切换动画
3. **可访问性**：完善 ARIA 属性和键盘导航
4. **主题适配**：更好地适配 Obsidian 主题
5. **单元测试**：为组件编写完整的测试用例
