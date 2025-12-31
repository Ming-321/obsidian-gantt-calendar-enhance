# 甘特图功能增强实现报告

> **状态**: 已完成
> **完成日期**: 2025-12-30
> **版本**: v1.1.7

---

## 一、需求概述

本次开发为甘特图视图添加三个核心交互功能，提升用户体验和操作效率：

### 1.1 功能需求

| 序号 | 功能 | 描述 |
|-----|------|------|
| 1 | 任务列表复选框 | 甘特图左侧任务列表中添加复选框，可勾选任务完成状态 |
| 2 | 任务列表点击跳转 | 点击任务列表项可跳转到任务所在文件的具体行 |
| 3 | 任务条拖动功能 | 支持三种拖动模式：整体拖动、左侧拖动（开始时间）、右侧拖动（结束时间） |

### 1.2 设计目标

- 复用现有的 `updateTaskProperties` 方法实现单侧日期更新
- 使用自动刷新机制，任务更新后视图自动同步
- 保持与其他视图统一的任务弹窗样式

---

## 二、技术方案设计

### 2.1 架构图

```
┌─────────────────────────────────────────────────────────────────┐
│                         GanttView                               │
│  ┌────────────────────────────────────────────────────────────┐ │
│  │                FrappeGanttWrapper                          │ │
│  │  ┌──────────────────────────────────────────────────────┐  │ │
│  │  │              SvgGanttRenderer                         │  │ │
│  │  │                                                      │  │ │
│  │  │  ┌────────────┐  ┌────────────┐  ┌──────────────┐   │  │ │
│  │  │  │ 任务列表   │  │   时间轴   │  │   任务条     │   │  │ │
│  │  │  │            │  │            │  │              │   │  │ │
│  │  │  │ [复选框]   │  │  Header    │  │ [□━━━□]     │   │  │ │
│  │  │  │ 任务描述   │  │  Grid      │  │  左柄  右柄  │   │  │ │
│  │  │  │ (可点击)   │  │            │  │              │   │  │ │
│  │  │  └────────────┘  └────────────┘  └──────────────┘   │  │ │
│  │  │                                                      │  │ │
│  │  │  拖动状态管理: taskDragState                         │  │ │
│  │  │  - dragType: move / resize-left / resize-right       │  │ │
│  │  │  - 拖动事件: mousedown → mousemove → mouseup         │  │ │
│  │  └──────────────────────────────────────────────────────┘  │ │
│  └────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────┘
```

### 2.2 数据流设计

#### 复选框更新流程
```
用户勾选复选框
    ↓
onProgressChange 回调
    ↓
TaskUpdateHandler.handleProgressChange()
    ↓
updateTaskProperties() (复用)
    ↓
写文件 + taskCache.updateFileCache()
    ↓
notifyListeners → 自动刷新视图
```

#### 拖动更新流程
```
用户拖动任务条
    ↓
startDragging() → handleDragMove → handleDragEnd
    ↓
根据 dragType 调用对应方法:
    - move: onDateChange(task, newStart, newEnd)
    - resize-left: handleStartDateChange(task, newStart)
    - resize-right: handleEndDateChange(task, newEnd)
    ↓
updateTaskProperties() (复用)
    ↓
写文件 + taskCache.updateFileCache()
    ↓
notifyListeners → 自动刷新视图
```

---

## 三、实现细节

### 3.1 任务列表复选框

#### 实现位置
`src/gantt/wrappers/svgGanttRenderer.ts::renderTaskList()`

#### 核心代码
```typescript
// 创建复选框
private createTaskCheckbox(
    frappeTask: FrappeTask,
    originalTask: GanttTask | null,
    isCompleted: boolean
): HTMLInputElement {
    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = isCompleted;
    checkbox.className = 'gc-gantt-view__task-checkbox';

    checkbox.addEventListener('change', (e) => {
        e.stopPropagation();
        const newProgress = checkbox.checked ? 100 : 0;
        if (this.onProgressChange) {
            this.onProgressChange(frappeTask, newProgress);
        }
    });

    return checkbox;
}
```

#### 复选框样式
```css
.gc-gantt-view__task-checkbox {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    cursor: pointer;
    margin: 0;
    accent-color: var(--interactive-accent);
}
```

### 3.2 任务列表点击跳转

#### 实现位置
`src/gantt/wrappers/svgGanttRenderer.ts::handleTaskListItemClick()`

#### 核心代码
```typescript
private handleTaskListItemClick(task: GanttTask | null): void {
    if (!task || !this.app) return;
    const { openFileInExistingLeaf } = require('../../utils/fileOpener');
    openFileInExistingLeaf(this.app, task.filePath, task.lineNumber);
}
```

#### 文本容器事件绑定
```typescript
const textContainer = document.createElement('div');
textContainer.className = 'gantt-task-list-item__text';
textContainer.style.cursor = 'pointer';
textContainer.addEventListener('click', (e) => {
    // 阻止链接点击触发跳转
    if ((e.target as HTMLElement).tagName !== 'A') {
        this.handleTaskListItemClick(originalTask);
    }
});
```

### 3.3 任务条拖动功能

#### 3.3.1 拖动状态管理

```typescript
private taskDragState = {
    isDragging: false,
    dragType: 'none' as 'none' | 'move' | 'resize-left' | 'resize-right',
    task: null as FrappeTask | null,
    originalTask: null as GanttTask | null,
    startX: 0,
    originalStart: null as Date | null,
    originalEnd: null as Date | null,
    taskMinDate: null as Date | null,
    hasMoved: false,  // 区分点击和拖动
    barElement: null as SVGRectElement | null,
    leftHandleElement: null as SVGRectElement | null,
    rightHandleElement: null as SVGRectElement | null,
    leftVisualElement: null as SVGRectElement | null,
    rightVisualElement: null as SVGRectElement | null,
};
```

#### 3.3.2 拖动手柄实现

```typescript
// 左侧手柄 - 修改开始时间
const leftHandle = document.createElementNS(ns, 'rect');
leftHandle.setAttribute('width', String(HANDLE_HIT_AREA));
(leftHandle as any).style.cursor = 'w-resize';
leftHandle.classList.add('gc-gantt-view__handle-left');

// 左侧视觉提示 (白色小方块)
const leftVisual = document.createElementNS(ns, 'rect');
leftVisual.setAttribute('x', String(x + 2));
leftVisual.setAttribute('y', String(y + 8));
leftVisual.setAttribute('width', '4');
leftVisual.setAttribute('height', '8');
leftVisual.setAttribute('fill', 'white');
leftVisual.setAttribute('opacity', '0.5');

// 右侧手柄 - 修改结束时间 (类似)
```

#### 3.3.3 拖动事件处理

**开始拖动**
```typescript
private startDragging(
    task: FrappeTask,
    originalTask: GanttTask | null,
    dragType: 'move' | 'resize-left' | 'resize-right',
    startX: number,
    minDate: Date,
    bar: SVGRectElement,
    leftHandle: SVGRectElement | null,
    rightHandle: SVGRectElement | null
): void {
    this.taskDragState = {
        isDragging: true,
        dragType,
        task,
        originalTask,
        startX,
        originalStart: new Date(task.start),
        originalEnd: new Date(task.end),
        taskMinDate: minDate,
        hasMoved: false,
        barElement: bar,
        leftHandleElement: leftHandle,
        rightHandleElement: rightHandle,
        leftVisualElement: null,
        rightVisualElement: null,
    };

    // 设置全局光标
    const cursorMap = {
        'move': 'grabbing',
        'resize-left': 'w-resize',
        'resize-right': 'e-resize',
    };
    document.body.style.cursor = cursorMap[dragType];
    document.body.style.userSelect = 'none';

    // 设置全局事件监听
    document.addEventListener('mousemove', this.handleDragMove);
    document.addEventListener('mouseup', this.handleDragEnd);
}
```

**拖动过程 (实时更新视觉)**
```typescript
private handleDragMove = (e: MouseEvent): void => {
    if (!this.taskDragState.isDragging) return;

    const deltaX = e.clientX - this.taskDragState.startX;
    const daysDelta = Math.round(deltaX / this.columnWidth);

    if (daysDelta === 0) return;

    this.taskDragState.hasMoved = true;

    const { dragType, originalStart, originalEnd, taskMinDate } = this.taskDragState;
    let newStart: Date;
    let newEnd: Date;

    switch (dragType) {
        case 'move':
            newStart = this.addDays(originalStart!, daysDelta);
            newEnd = this.addDays(originalEnd!, daysDelta);
            break;
        case 'resize-left':
            newStart = this.addDays(originalStart!, daysDelta);
            newEnd = originalEnd!;
            if (newStart >= newEnd) {
                newStart = new Date(newEnd);
                newStart.setDate(newStart.getDate() - 1);
            }
            break;
        case 'resize-right':
            newStart = originalStart!;
            newEnd = this.addDays(originalEnd!, daysDelta);
            if (newEnd <= newStart) {
                newEnd = new Date(newStart);
                newEnd.setDate(newEnd.getDate() + 1);
            }
            break;
        default:
            return;
    }

    this.updateTaskBarVisual(newStart, newEnd, taskMinDate!);
}
```

**拖动结束 (提交更新)**
```typescript
private handleDragEnd = async (e: MouseEvent): Promise<void> => {
    if (!this.taskDragState.isDragging) return;

    const { task, dragType, originalStart, originalEnd, startX, hasMoved } = this.taskDragState;

    // 重置状态
    this.taskDragState.isDragging = false;
    document.body.style.cursor = '';
    document.body.style.userSelect = '';

    document.removeEventListener('mousemove', this.handleDragMove);
    document.removeEventListener('mouseup', this.handleDragEnd);

    if (!hasMoved) {
        // 没有移动，视为点击
        if (task!) this.handleTaskClick(task!);
        return;
    }

    const daysDelta = Math.round((e.clientX - startX) / this.columnWidth);
    if (daysDelta === 0) {
        this.refresh(this.tasks);
        return;
    }

    // 计算新日期 (同 handleDragMove)
    // ...

    // 调用相应的更新方法
    try {
        if (dragType === 'move') {
            if (this.onDateChange && task!) {
                await this.onDateChange(task!, newStart, newEnd);
            }
        } else if (dragType === 'resize-left') {
            if (task!) await this.handleStartDateChange(task!, newStart);
        } else if (dragType === 'resize-right') {
            if (task!) await this.handleEndDateChange(task!, newEnd);
        }
    } catch (error) {
        console.error('[SvgGanttRenderer] Error updating task dates:', error);
    }
}
```

#### 3.3.4 单侧日期更新方法

```typescript
/**
 * 单独更新开始时间（左侧拖动）
 */
private async handleStartDateChange(task: FrappeTask, newStart: Date): Promise<void> {
    if (!this.plugin || !this.originalTasks?.length) return;

    const originalTask = this.findOriginalTask(task);
    if (!originalTask) return;

    const { updateTaskProperties } = require('../../tasks/taskUpdater');
    const updates: Record<string, Date> = {};
    updates[this.startField] = newStart;

    try {
        await updateTaskProperties(this.app, originalTask, updates, this.plugin.settings.enabledTaskFormats);
        await this.plugin.taskCache.updateFileCache(originalTask.filePath);
    } catch (error) {
        console.error('[SvgGanttRenderer] Error updating start date:', error);
    }
}

/**
 * 单独更新结束时间（右侧拖动）
 */
private async handleEndDateChange(task: FrappeTask, newEnd: Date): Promise<void> {
    if (!this.plugin || !this.originalTasks?.length) return;

    const originalTask = this.findOriginalTask(task);
    if (!originalTask) return;

    const { updateTaskProperties } = require('../../tasks/taskUpdater');
    const updates: Record<string, Date> = {};
    updates[this.endField] = newEnd;

    try {
        await updateTaskProperties(this.app, originalTask, updates, this.plugin.settings.enabledTaskFormats);
        await this.plugin.taskCache.updateFileCache(originalTask.filePath);
    } catch (error) {
        console.error('[SvgGanttRenderer] Error updating end date:', error);
    }
}
```

### 3.4 实时视觉更新

```typescript
private updateTaskBarVisual(newStart: Date, newEnd: Date, minDate: Date): void {
    if (!this.taskDragState.task) return;

    const { barElement, leftHandleElement, rightHandleElement, leftVisualElement, rightVisualElement } = this.taskDragState;

    // 计算新的位置和宽度
    const startOffset = Math.floor((newStart.getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000));
    const duration = Math.ceil((newEnd.getTime() - newStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
    const x = this.padding + startOffset * this.columnWidth;
    const barWidth = duration * this.columnWidth - 8;

    // 更新任务条
    barElement!.setAttribute('x', String(x));
    barElement!.setAttribute('width', String(Math.max(barWidth, 20)));

    // 更新手柄位置
    if (leftHandleElement) {
        leftHandleElement.setAttribute('x', String(x));
    }
    if (leftVisualElement) {
        leftVisualElement.setAttribute('x', String(x + 2));
    }

    const rightHandleX = x + Math.max(barWidth, 20) - 12;
    if (rightHandleElement) {
        rightHandleElement.setAttribute('x', String(rightHandleX));
    }
    if (rightVisualElement) {
        rightVisualElement.setAttribute('x', String(rightHandleX + 12 - 2 - 4));
    }
}
```

---

## 四、文件变更清单

### 4.1 修改的文件

| 文件 | 变更类型 | 说明 |
|------|---------|------|
| `src/gantt/wrappers/svgGanttRenderer.ts` | 修改 | 添加复选框、拖动手柄、拖动事件处理 |
| `src/gantt/wrappers/frappeGanttWrapper.ts` | 修改 | 传递 startField/endField 配置 |
| `src/views/GanttView.ts` | 修改 | 传递字段配置到 FrappeGanttWrapper |
| `styles.css` | 修改 | 添加复选框和手柄样式 |

### 4.2 新增方法汇总

| 方法名 | 所属类 | 功能 |
|--------|-------|------|
| `createTaskCheckbox()` | SvgGanttRenderer | 创建任务复选框 |
| `handleTaskListItemClick()` | SvgGanttRenderer | 处理任务列表点击跳转 |
| `setupTaskBarDragging()` | SvgGanttRenderer | 设置拖动事件监听 |
| `startDragging()` | SvgGanttRenderer | 开始拖动 |
| `handleDragMove` | SvgGanttRenderer | 拖动过程 (绑定方法) |
| `handleDragEnd` | SvgGanttRenderer | 拖动结束 (绑定方法) |
| `updateTaskBarVisual()` | SvgGanttRenderer | 实时更新任务条视觉 |
| `addDays()` | SvgGanttRenderer | 日期计算辅助方法 |
| `handleStartDateChange()` | SvgGanttRenderer | 单独更新开始时间 |
| `handleEndDateChange()` | SvgGanttRenderer | 单独更新结束时间 |

---

## 五、样式设计

### 5.1 任务列表样式

```css
/* 任务列表项容器 */
.gantt-task-list-item {
    display: flex;
    align-items: center;
    gap: 8px;
    height: 100%;
    font-size: 12px;
    color: var(--text-normal);
}

/* 任务文本 (可点击) */
.gantt-task-list-item__text {
    flex: 1;
    overflow: hidden;
    text-overflow: ellipsis;
    cursor: pointer;
}

.gantt-task-list-item__text:hover {
    color: var(--interactive-accent);
}

/* 任务复选框 */
.gc-gantt-view__task-checkbox {
    flex-shrink: 0;
    width: 16px;
    height: 16px;
    cursor: pointer;
    margin: 0;
    accent-color: var(--interactive-accent);
}
```

### 5.2 拖动手柄样式

```css
/* 拖动手柄基础样式 */
.gc-gantt-view__handle-left,
.gc-gantt-view__handle-right {
    opacity: 0.5;
    transition: opacity 0.15s ease;
}

/* 鼠标悬停时显示手柄 */
.gc-gantt-view__bar-group:hover .gc-gantt-view__handle-left,
.gc-gantt-view__bar-group:hover .gc-gantt-view__handle-right {
    opacity: 1;
}
```

---

## 六、技术难点与解决方案

### 6.1 SVG 元素类型断言

**问题**: `document.createElementNS()` 返回 `Element` 类型，无法直接赋值给 `SVGRectElement`

**解决方案**: 使用类型断言
```typescript
// 错误写法
progressElement = document.createElementNS(ns, 'rect');

// 正确写法
const elem = document.createElementNS(ns, 'rect') as SVGRectElement;
elem.setAttribute('x', String(x));
// ...
progressElement = elem;
```

### 6.2 变量声明顺序

**问题**: TypeScript 无法保证 switch 语句所有分支都赋值变量

**解决方案**: 添加 default 分支
```typescript
switch (dragType) {
    case 'move':
        newStart = ...;
        newEnd = ...;
        break;
    case 'resize-left':
        // ...
        break;
    case 'resize-right':
        // ...
        break;
    default:
        return;  // 添加 default 分支
}
```

### 6.3 区分点击和拖动

**问题**: 用户可能在任务条上按下鼠标但不想拖动

**解决方案**: 使用 `hasMoved` 标志
```typescript
private taskDragState = {
    hasMoved: false,  // 初始为 false
    // ...
};

// 在 handleDragMove 中设置为 true
if (daysDelta !== 0) {
    this.taskDragState.hasMoved = true;
}

// 在 handleDragEnd 中检查
if (!hasMoved) {
    this.handleTaskClick(task!);  // 视为点击
    return;
}
```

### 6.4 日期约束

**问题**: 拖动时可能导致开始时间晚于结束时间

**解决方案**: 添加边界检查
```typescript
// 左侧拖动: 确保开始时间不晚于结束时间
case 'resize-left':
    newStart = this.addDays(originalStart!, daysDelta);
    newEnd = originalEnd!;
    if (newStart >= newEnd) {
        newStart = new Date(newEnd);
        newStart.setDate(newStart.getDate() - 1);  // 最小间隔1天
    }
    break;

// 右侧拖动: 确保结束时间不早于开始时间
case 'resize-right':
    newStart = originalStart!;
    newEnd = this.addDays(originalEnd!, daysDelta);
    if (newEnd <= newStart) {
        newEnd = new Date(newStart);
        newEnd.setDate(newEnd.getDate() + 1);  // 最小间隔1天
    }
    break;
```

---

## 七、测试建议

### 7.1 功能测试

| 测试项 | 操作步骤 | 预期结果 |
|-------|---------|---------|
| 复选框勾选 | 点击任务列表复选框 | 任务进度更新为100%，完成日期更新 |
| 复选框取消 | 再次点击复选框 | 任务进度更新为0% |
| 点击跳转 | 点击任务列表文本 | 跳转到源文件对应行 |
| 整体拖动 | 拖动任务条中间 | 开始和结束时间同时变化 |
| 左侧拖动 | 拖动任务条左侧手柄 | 仅开始时间变化 |
| 右侧拖动 | 拖动任务条右侧手柄 | 仅结束时间变化 |
| 边界约束 | 拖动超过边界 | 日期自动修正，保持最小间隔 |

### 7.2 视觉测试

- 鼠标悬停任务条时，手柄可见性
- 不同拖动模式的光标样式
- 拖动过程中任务条实时更新
- 复选框与文本对齐

---

## 八、完成状态

### 已完成工作

- [x] 任务列表复选框实现
- [x] 任务列表点击跳转实现
- [x] 任务条拖动手柄渲染
- [x] 拖动状态管理
- [x] 拖动事件处理
- [x] 单侧日期更新方法
- [x] 实时视觉更新
- [x] 日期边界约束
- [x] TypeScript 类型错误修复
- [x] 样式添加
- [x] 构建验证通过

### 版本信息

- **插件版本**: v1.1.7
- **完成日期**: 2025-12-30
- **构建状态**: 通过

---

## 九、后续优化建议

1. **拖动吸附**: 支持拖动时吸附到网格线
2. **批量操作**: 支持多选任务批量拖动
3. **撤销/重做**: 记录拖动操作历史，支持撤销
4. **快捷键**: 添加键盘快捷键支持
5. **拖动预览**: 拖动时显示具体日期提示
