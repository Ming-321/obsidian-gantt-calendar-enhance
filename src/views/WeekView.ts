import { Notice, App } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import { getWeekOfDate, getRolling7Days } from '../dateUtils/dateUtilsIndex';
import type { WeekMode } from '../GCMainView';
import type { GCTask, SortState, StatusFilterState, TagFilterState, CalendarDay } from '../types';
import { sortTasks } from '../tasks/taskSorter';
import { Logger } from '../utils/logger';
import { TooltipManager } from '../utils/tooltipManager';
import { WeekViewClasses, TaskCardClasses } from '../utils/bem';
import { openEditTaskModal } from '../modals/EditTaskModal';
import { showCreateTaskMenu, registerTaskContextMenu } from '../contextMenu/contextMenuIndex';
import { cycleTaskStatus } from '../tasks/taskUpdater';
import { StatusIcon } from '../components/StatusIcon';

/**
 * 周视图渲染器 — 甘特图风格
 *
 * 布局：
 * - Header row: 7 列日期头（周一~周日）
 * - Body: 每个任务一行，用横向 bar 表示持续时间
 */
/** 甘特图 bar 渲染选项 */
interface GanttBarOptions {
	showToggle?: boolean;
	isExpanded?: boolean;
	progress?: string;
	onToggle?: () => void;
}

export class WeekViewRenderer extends BaseViewRenderer {
	private sortState: SortState = { field: 'priority', order: 'desc' };
	private readonly SETTINGS_PREFIX = 'weekView';

	// 子任务展开状态
	private expandedTasks: Set<string> = new Set();
	private defaultExpandInitialized = false;

	// 缓存当前周数据，用于 refreshTasks
	private currentWeekStart: Date | null = null;
	private currentWeekEnd: Date | null = null;
	private currentWeekDays: CalendarDay[] = [];

	constructor(app: App, plugin: any) {
		super(app, plugin);
		this.initializeFilterStates(this.SETTINGS_PREFIX);
		this.initializeSortState();
	}

	private initializeSortState(): void {
		const settings = this.plugin?.settings;
		if (!settings) return;
		const savedField = settings[`${this.SETTINGS_PREFIX}SortField`];
		const savedOrder = settings[`${this.SETTINGS_PREFIX}SortOrder`];
		if (savedField && savedOrder) {
			this.sortState = { field: savedField, order: savedOrder };
		}
		const secField = settings[`${this.SETTINGS_PREFIX}SecondarySortField`];
		const secOrder = settings[`${this.SETTINGS_PREFIX}SecondarySortOrder`];
		if (secField && secOrder) {
			this.sortState.secondary = { field: secField, order: secOrder };
		}
	}

	private async saveSortState(): Promise<void> {
		if (!this.plugin?.settings) return;
		this.plugin.settings[`${this.SETTINGS_PREFIX}SortField`] = this.sortState.field;
		this.plugin.settings[`${this.SETTINGS_PREFIX}SortOrder`] = this.sortState.order;
		await this.plugin.saveSettings();
	}

	public getSortState(): SortState { return this.sortState; }

	public setSortState(state: SortState): void {
		this.sortState = state;
		this.saveSortState().catch(err => Logger.error('WeekView', 'Failed to save sort state', err));
	}

	public setStatusFilterState(state: StatusFilterState): void {
		super.setStatusFilterState(state);
		this.saveStatusFilterState(this.SETTINGS_PREFIX).catch(err =>
			Logger.error('WeekView', 'Failed to save status filter', err));
	}

	public setTagFilterState(state: TagFilterState): void {
		super.setTagFilterState(state);
		this.saveTagFilterState(this.SETTINGS_PREFIX).catch(err =>
			Logger.error('WeekView', 'Failed to save tag filter', err));
	}

	// ==================== 主渲染 ====================

	render(container: HTMLElement, currentDate: Date, weekMode: WeekMode = 'standard'): void {
		const weekData = weekMode === 'rolling7'
			? getRolling7Days(currentDate)
			: getWeekOfDate(currentDate, currentDate.getFullYear(), !!(this.plugin?.settings?.startOnMonday));

		// 缓存周数据
		this.currentWeekDays = weekData.days;
		this.currentWeekStart = new Date(weekData.startDate);
		this.currentWeekStart.setHours(0, 0, 0, 0);
		this.currentWeekEnd = new Date(weekData.endDate);
		this.currentWeekEnd.setHours(23, 59, 59, 999);

		container.empty();

		const weekContainer = container.createDiv('gc-view gc-view--week');
		const weekGrid = weekContainer.createDiv(WeekViewClasses.elements.grid);

		// Header row: 7 date columns
		this.renderHeader(weekGrid, weekData.days);

		// Gantt body: task rows
		this.renderGanttBody(weekGrid);
	}

	/**
	 * 渲染头部日期行
	 */
	private renderHeader(weekGrid: HTMLElement, days: CalendarDay[]): void {
		const headerRow = weekGrid.createDiv(WeekViewClasses.elements.headerRow);
		const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
		days.forEach((day) => {
			const dayHeader = headerRow.createDiv(WeekViewClasses.elements.headerCell);
			dayHeader.createEl('div', { text: dayNames[day.weekday], cls: WeekViewClasses.elements.dayName });
			dayHeader.createEl('div', { text: day.day.toString(), cls: WeekViewClasses.elements.dayNumber });
			// 周视图不显示农历信息，保持简洁
			if (day.isToday) {
				dayHeader.addClass(WeekViewClasses.modifiers.today);
			}
		});
	}

	/**
	 * 渲染甘特图主体（任务行）
	 * 
	 * 提醒类任务会被合并到共享行中（贪心装箱），
	 * 待办类任务每个占独立一行。
	 */
	private renderGanttBody(weekGrid: HTMLElement): void {
		const ganttBody = weekGrid.createDiv(WeekViewClasses.elements.ganttBody);

		// 空白处右键创建任务菜单
		ganttBody.addEventListener('contextmenu', (e: MouseEvent) => {
			// 点击已有任务 bar 时不触发
			if ((e.target as HTMLElement).closest(`.${WeekViewClasses.elements.ganttBar}`)) return;

			// 通过鼠标位置计算日期列
			const rect = ganttBody.getBoundingClientRect();
			const relativeX = e.clientX - rect.left;
			const dayIndex = Math.min(6, Math.max(0, Math.floor(relativeX / (rect.width / 7))));
			const targetDay = this.currentWeekDays[dayIndex];
			if (!targetDay) return;

			showCreateTaskMenu(e, this.app, this.plugin, targetDay.date, () => {
				this.refreshTasks();
			});
		});

		// 添加网格线（7列竖线）
		this.renderGridLines(ganttBody);

		// 收集本周所有相关任务
		const tasks = this.collectWeekTasks();

		if (tasks.length === 0) {
			const emptyEl = ganttBody.createDiv(WeekViewClasses.elements.empty);
			emptyEl.setText('本周暂无任务');
			return;
		}

		// 排序
		const sorted = sortTasks(tasks, this.sortState);

		// 分离提醒和待办，仅取根任务（子任务通过展开显示）
		const reminders = sorted.filter(t => t.type === 'reminder' && !t.parentId);
		const rootTodos = sorted.filter(t => t.type !== 'reminder' && !t.parentId);

		// 初始化默认展开（一级子任务）
		this.initDefaultExpanded(rootTodos);

		// 渲染待办：有子任务的用 group row，无子任务的用普通 row
		rootTodos.forEach(task => {
			const children = this.plugin.taskCache.getChildTasks(task.id);
			if (children.length > 0) {
				this.renderGanttGroupRow(ganttBody, task);
			} else {
				this.renderGanttRow(ganttBody, [task]);
			}
		});

		// 渲染提醒：贪心装箱，将不重叠的提醒放在同一行
		const reminderRows = this.packRemindersIntoRows(reminders);
		reminderRows.forEach(rowTasks => {
			this.renderGanttRow(ganttBody, rowTasks);
		});
	}

	/**
	 * 初始化默认展开状态：首次加载时展开有子任务的根 todo
	 */
	private initDefaultExpanded(rootTodos: GCTask[]): void {
		if (this.defaultExpandInitialized) return;
		this.defaultExpandInitialized = true;
		rootTodos.forEach(task => {
			if (task.childIds?.length) {
				this.expandedTasks.add(task.id);
			}
		});
	}

	/**
	 * 切换任务展开/折叠
	 */
	private toggleExpand(taskId: string): void {
		if (this.expandedTasks.has(taskId)) {
			this.expandedTasks.delete(taskId);
		} else {
			this.expandedTasks.add(taskId);
		}
		this.refreshTasks();
	}

	/**
	 * 渲染父任务+子任务的分组行（单 bar 展开/收起）
	 *
	 * 核心设计：父任务和子任务在同一个 bar 内显示。
	 * - 折叠：bar 正常高度，仅显示父任务信息
	 * - 展开：bar 增高，内部列出子任务/孙任务
	 */
	private renderGanttGroupRow(ganttBody: HTMLElement, parentTask: GCTask): void {
		const isExpanded = this.expandedTasks.has(parentTask.id);
		const children = this.plugin.taskCache.getChildTasks(parentTask.id);
		const completedCount = children.filter((c: GCTask) => c.completed).length;
		const tooltipManager = TooltipManager.getInstance(this.plugin);

		// 创建行容器（高度自适应）
		const row = ganttBody.createDiv(WeekViewClasses.elements.ganttRow);
		row.addClass(WeekViewClasses.modifiers.ganttRowGroup);

		// 计算 bar 位置（按父任务日期定位）
		const { leftPercent, widthPercent, overflowLeft, overflowRight } = this.calculateBarPosition(parentTask);

		// 创建单个分组 bar（使用 marginLeft 定位，保持文档流以撑开行高）
		const bar = row.createDiv(WeekViewClasses.elements.ganttBar);
		bar.style.marginLeft = `${leftPercent}%`;
		bar.style.width = `${widthPercent}%`;
		bar.addClass(WeekViewClasses.modifiers.ganttBarGroup);
		if (overflowLeft) bar.addClass(WeekViewClasses.modifiers.ganttBarOverflowLeft);
		if (overflowRight) bar.addClass(WeekViewClasses.modifiers.ganttBarOverflowRight);

		// 应用颜色修饰（基于优先级，不再按类型区分）
		if (parentTask.completed || parentTask.status === 'done') {
			bar.addClass(WeekViewClasses.modifiers.ganttBarCompleted);
		} else if (parentTask.cancelled || parentTask.status === 'canceled') {
			bar.addClass(WeekViewClasses.modifiers.ganttBarCompleted); // 复用灰色
		} else {
			switch (parentTask.priority) {
				case 'high': bar.addClass(WeekViewClasses.modifiers.ganttBarPriorityHigh); break;
				case 'low': bar.addClass(WeekViewClasses.modifiers.ganttBarPriorityLow); break;
				default: bar.addClass(WeekViewClasses.modifiers.ganttBarPriorityNormal); break;
			}
		}
		// 提醒类型标记（斜体标题，不再用虚线边框）
		if (parentTask.type === 'reminder') {
			bar.addClass(WeekViewClasses.modifiers.ganttBarReminder);
		}

		// 展开时：父 bar 变淡，子任务彩色 mini-bar 突出显示
		if (isExpanded) {
			bar.addClass(WeekViewClasses.modifiers.ganttBarExpanded);
		}

		// ---- Header（父任务信息行） ----
		const header = bar.createDiv(WeekViewClasses.elements.ganttBarHeader);

		// v4: 去掉折叠三角，通过下划线标题表示有子条目

		// StatusIcon（替代 checkbox）
		const parentIcon = new StatusIcon({
			status: (parentTask.status || 'todo') as any,
			priority: parentTask.priority || 'normal',
			isReminder: parentTask.type === 'reminder',
			size: 'compact',
			disabled: false,
		});
		parentIcon.render(header);
		parentIcon.onClick(async () => {
			tooltipManager.hide();
			await cycleTaskStatus(this.app, parentTask);
			this.refreshTasks();
		});

		// 父任务标题（v4: 有子条目时直接给label加下划线修饰类）
		const parentLabel = header.createSpan({ text: parentTask.description || '无标题', cls: WeekViewClasses.elements.ganttBarLabel });
		if (children.length > 0) {
			parentLabel.addClass('gc-week-view__gantt-bar-label--has-children');
		}

		// 进度
		if (children.length > 0) {
			header.createSpan({
				text: `[${completedCount}/${children.length}]`,
				cls: WeekViewClasses.elements.ganttBarProgress,
			});
		}

		// Header 交互：tooltip + 左键展开/折叠 + 右键编辑
		header.addEventListener('mouseenter', () => tooltipManager.show(parentTask, header));
		header.addEventListener('mouseleave', () => tooltipManager.hide());
		// v4: 左键单击 → 展开/折叠（有子条目时）
		header.addEventListener('click', (e: MouseEvent) => {
			if ((e.target as HTMLElement).closest('.gc-status-icon')) return;
			e.stopPropagation();
			tooltipManager.hide();
			if (children.length > 0) {
				this.toggleExpand(parentTask.id);
			}
		});
		// v4: 右键 → 编辑菜单
		registerTaskContextMenu(bar, parentTask, this.app, this.plugin, '', () => this.refreshTasks());

		// ---- Children（展开时显示所有子任务，按日期定位为彩色 mini-bar） ----
		if (isExpanded && children.length > 0) {
			const childrenContainer = bar.createDiv(WeekViewClasses.elements.ganttBarChildren);

			children.forEach((child: GCTask) => {
				this.renderGroupChildItem(childrenContainer, child, parentTask, tooltipManager);
			});
		}
	}

	/**
	 * 渲染分组 bar 内的子任务项（彩色 mini-bar，按日期水平定位）
	 *
	 * 核心设计：一级子任务的展开/折叠逻辑与父任务完全一致。
	 * - 有孙任务 + 折叠：普通彩色 mini-bar（带三角 + 进度）
	 * - 有孙任务 + 展开：变为淡色容器，孙任务以 mini-bar 在其内部显示
	 * - 无孙任务：普通彩色 mini-bar
	 */
	private renderGroupChildItem(
		container: HTMLElement,
		child: GCTask,
		rootParent: GCTask,
		tooltipManager: TooltipManager,
	): void {
		const grandChildren = this.plugin.taskCache.getChildTasks(child.id);
		const gcCompleted = grandChildren.filter((gc: GCTask) => gc.completed).length;
		const isChildExpanded = this.expandedTasks.has(child.id);
		const hasGrandChildren = grandChildren.length > 0;

		const childItem = container.createDiv(WeekViewClasses.elements.ganttBarChildItem);

		// 按日期定位（相对于父 bar）
		const { leftPercent, widthPercent, overflowLeft, overflowRight } = this.calculateChildBarPosition(rootParent, child);
		childItem.style.marginLeft = `${leftPercent}%`;
		childItem.style.width = `${widthPercent}%`;
		if (overflowLeft) childItem.addClass(WeekViewClasses.modifiers.ganttChildOverflowLeft);
		if (overflowRight) childItem.addClass(WeekViewClasses.modifiers.ganttChildOverflowRight);

		// 应用颜色修饰
		this.applyItemColorModifiers(childItem, child, 'child');

		// ---- 展开态 + 有孙任务：分为 header + children 容器 ----
		if (hasGrandChildren && isChildExpanded) {
			childItem.addClass(WeekViewClasses.modifiers.ganttChildGroup);
			childItem.addClass(WeekViewClasses.modifiers.ganttChildExpanded);

			// Header 行（子任务信息）
			const childHeader = childItem.createDiv(WeekViewClasses.elements.ganttBarHeader);

			// StatusIcon
			this.renderBarStatusIcon(childHeader, child, tooltipManager);

			// 标题（v4: 有孙任务时直接给label加下划线修饰类）
			const childLabel = childHeader.createSpan({ text: child.description || '无标题', cls: WeekViewClasses.elements.ganttBarLabel });
			childLabel.addClass('gc-week-view__gantt-bar-label--has-children');

			// 进度
			childHeader.createSpan({
				text: `[${gcCompleted}/${grandChildren.length}]`,
				cls: WeekViewClasses.elements.ganttBarProgress,
			});

			// Header 交互：tooltip + 左键展开/折叠 + 右键编辑
			childHeader.addEventListener('mouseenter', () => tooltipManager.show(child, childHeader));
			childHeader.addEventListener('mouseleave', () => tooltipManager.hide());
			childHeader.addEventListener('click', (e: MouseEvent) => {
				if ((e.target as HTMLElement).closest('.gc-status-icon')) return;
				e.stopPropagation();
				tooltipManager.hide();
				this.toggleExpand(child.id);
			});

			// 孙任务容器（内部定位相对于 child 的日期范围）
			const gcContainer = childItem.createDiv(WeekViewClasses.elements.ganttBarChildren);
			grandChildren.forEach((gc: GCTask) => {
				this.renderGroupGrandchildItem(gcContainer, gc, child, tooltipManager);
			});

		} else {
			// ---- 折叠态 / 无孙任务：普通 mini-bar ----
			// v4: 去掉折叠三角

			// StatusIcon
			this.renderBarStatusIcon(childItem, child, tooltipManager);

			// 标题（v4: 有孙任务时直接给label加下划线修饰类）
			const childLabel = childItem.createSpan({ text: child.description || '无标题', cls: WeekViewClasses.elements.ganttBarLabel });
			if (hasGrandChildren) {
				childLabel.addClass('gc-week-view__gantt-bar-label--has-children');
			}

			// 进度
			if (hasGrandChildren) {
				childItem.createSpan({
					text: `[${gcCompleted}/${grandChildren.length}]`,
					cls: WeekViewClasses.elements.ganttBarProgress,
				});
			}

			// 交互：tooltip + 左键展开/折叠（有孙任务时）
			childItem.addEventListener('mouseenter', () => tooltipManager.show(child, childItem));
			childItem.addEventListener('mouseleave', () => tooltipManager.hide());
			childItem.addEventListener('click', (e: MouseEvent) => {
				if ((e.target as HTMLElement).closest('.gc-status-icon')) return;
				e.stopPropagation();
				tooltipManager.hide();
				if (hasGrandChildren) {
					this.toggleExpand(child.id);
				}
			});
		}

		// v4: 右键 → 编辑菜单（所有子任务统一）
		registerTaskContextMenu(childItem, child, this.app, this.plugin, '', () => this.refreshTasks());
	}

	/**
	 * 渲染 bar 内的 StatusIcon（替代复选框）
	 */
	private renderBarStatusIcon(
		container: HTMLElement,
		task: GCTask,
		tooltipManager: TooltipManager,
	): void {
		const icon = new StatusIcon({
			status: (task.status || 'todo') as any,
			priority: task.priority || 'normal',
			isReminder: task.type === 'reminder',
			size: 'compact',
			disabled: false,
		});
		icon.render(container);
		icon.onClick(async () => {
			tooltipManager.hide();
			await cycleTaskStatus(this.app, task);
			this.refreshTasks();
		});
	}

	/**
	 * 渲染分组 bar 内的孙任务项（彩色 mini-bar，按日期水平定位）
	 */
	private renderGroupGrandchildItem(
		container: HTMLElement,
		gc: GCTask,
		rootParent: GCTask,
		tooltipManager: TooltipManager,
	): void {
		const gcItem = container.createDiv(WeekViewClasses.elements.ganttBarGrandchildItem);

		// 按日期定位
		const { leftPercent, widthPercent, overflowLeft, overflowRight } = this.calculateChildBarPosition(rootParent, gc);
		gcItem.style.marginLeft = `${leftPercent}%`;
		gcItem.style.width = `${widthPercent}%`;
		if (overflowLeft) gcItem.addClass(WeekViewClasses.modifiers.ganttGrandchildOverflowLeft);
		if (overflowRight) gcItem.addClass(WeekViewClasses.modifiers.ganttGrandchildOverflowRight);

		// 应用颜色修饰
		this.applyItemColorModifiers(gcItem, gc, 'grandchild');

		// 孙任务 StatusIcon
		this.renderBarStatusIcon(gcItem, gc, tooltipManager);

		// 孙任务标题
		gcItem.createSpan({ text: gc.description || '无标题', cls: WeekViewClasses.elements.ganttBarLabel });

		// 孙任务交互：tooltip + 右键编辑（v4: 左键不再打开编辑）
		gcItem.addEventListener('mouseenter', () => tooltipManager.show(gc, gcItem));
		gcItem.addEventListener('mouseleave', () => tooltipManager.hide());
		// v4: 右键 → 编辑菜单
		registerTaskContextMenu(gcItem, gc, this.app, this.plugin, '', () => this.refreshTasks());
	}

	/**
	 * 为子/孙任务项应用颜色修饰类
	 */
	private applyItemColorModifiers(el: HTMLElement, task: GCTask, level: 'child' | 'grandchild'): void {
		const m = WeekViewClasses.modifiers;
		if (task.completed) {
			el.addClass(level === 'child' ? m.ganttChildCompleted : m.ganttGrandchildCompleted);
			return;
		}
		// v4: 仅添加优先级类（不再添加 --todo 类型类，颜色统一由优先级决定）
		switch (task.priority) {
			case 'high':
				el.addClass(level === 'child' ? m.ganttChildPriorityHigh : m.ganttGrandchildPriorityHigh);
				break;
			case 'low':
				el.addClass(level === 'child' ? m.ganttChildPriorityLow : m.ganttGrandchildPriorityLow);
				break;
			default:
				el.addClass(level === 'child' ? m.ganttChildPriorityNormal : m.ganttGrandchildPriorityNormal);
				break;
		}
	}

	/**
	 * 获取任务在当前周内的有效日期范围（用于子 bar 相对定位）
	 */
	private getBarDateRange(task: GCTask): { startTime: number; endTime: number } {
		if (!this.currentWeekStart || !this.currentWeekEnd) {
			return { startTime: 0, endTime: 0 };
		}
		const weekStartTime = this.currentWeekStart.getTime();
		const weekEndTime = this.currentWeekEnd.getTime();
		const dayMs = 24 * 60 * 60 * 1000;

		// 已完成任务：单天标记
		if (task.completed && task.completionDate) {
			const comp = new Date(task.completionDate);
			comp.setHours(0, 0, 0, 0);
			return { startTime: comp.getTime(), endTime: comp.getTime() + dayMs };
		}

		const start = task.startDate ? new Date(task.startDate) : (task.createdDate ? new Date(task.createdDate) : null);
		const due = task.dueDate ? new Date(task.dueDate) : null;
		if (start) start.setHours(0, 0, 0, 0);
		if (due) due.setHours(0, 0, 0, 0);

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const taskStart = start ? start.getTime() : weekStartTime;
		const taskEnd = due ? Math.max(due.getTime(), today.getTime()) : today.getTime();

		// Clamp to week boundaries
		const barStart = Math.max(taskStart, weekStartTime);
		const barEnd = Math.min(taskEnd + dayMs, weekEndTime);

		return { startTime: barStart, endTime: Math.max(barEnd, barStart + dayMs) };
	}

	/**
	 * 计算子任务在父 bar 内的相对位置（百分比）
	 */
	private calculateChildBarPosition(parentTask: GCTask, childTask: GCTask): { leftPercent: number; widthPercent: number; overflowLeft: boolean; overflowRight: boolean } {
		const parentRange = this.getBarDateRange(parentTask);
		const parentSpan = parentRange.endTime - parentRange.startTime;
		if (parentSpan <= 0) return { leftPercent: 0, widthPercent: 100, overflowLeft: false, overflowRight: false };

		const dayMs = 24 * 60 * 60 * 1000;

		// 获取子任务日期范围
		const childStart = childTask.startDate
			? new Date(childTask.startDate)
			: (childTask.createdDate ? new Date(childTask.createdDate) : new Date());
		childStart.setHours(0, 0, 0, 0);

		const childDue = childTask.dueDate ? new Date(childTask.dueDate) : null;
		if (childDue) childDue.setHours(0, 0, 0, 0);

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const rawChildStart = childStart.getTime();
		const rawChildEnd = childDue
			? Math.max(childDue.getTime(), today.getTime()) + dayMs
			: today.getTime() + dayMs;

		// 注意：已完成子任务不缩短 bar，保持原始时间线（startDate → dueDate）
		// 完成状态已通过颜色和删除线区分

		// 检测子 bar 是否溢出父 bar 可见范围
		const overflowLeft = rawChildStart < parentRange.startTime;
		const overflowRight = rawChildEnd > parentRange.endTime;

		// Clamp 子任务日期到父 bar 可见范围，避免超出父 bar 的部分撑大宽度
		const childStartTime = Math.max(rawChildStart, parentRange.startTime);
		const childEndTime = Math.min(rawChildEnd, parentRange.endTime);

		// 计算相对父 bar 的百分比位置
		let left = ((childStartTime - parentRange.startTime) / parentSpan) * 100;
		let width = ((childEndTime - childStartTime) / parentSpan) * 100;

		// Clamp 百分比到合法范围
		left = Math.max(0, Math.min(95, left));
		width = Math.max(8, Math.min(100 - left, width)); // 最小 8% 保证可见

		return { leftPercent: left, widthPercent: width, overflowLeft, overflowRight };
	}

	/**
	 * 判断任务是否在当前周范围内
	 */
	private isTaskInCurrentWeek(task: GCTask): boolean {
		if (!this.currentWeekStart || !this.currentWeekEnd) return true;
		const weekStartTime = this.currentWeekStart.getTime();
		const weekEndTime = this.currentWeekEnd.getTime();

		if (task.type === 'reminder') {
			if (!task.dueDate) return false;
			const due = new Date(task.dueDate);
			due.setHours(0, 0, 0, 0);
			return due.getTime() >= weekStartTime && due.getTime() <= weekEndTime;
		}

		// 待办
		if (task.completed && task.completionDate) {
			const comp = new Date(task.completionDate);
			comp.setHours(0, 0, 0, 0);
			return comp.getTime() >= weekStartTime && comp.getTime() <= weekEndTime;
		}

		const start = task.startDate ? new Date(task.startDate) : (task.createdDate ? new Date(task.createdDate) : null);
		const due = task.dueDate ? new Date(task.dueDate) : null;
		if (!start && !due) return false;

		if (start) start.setHours(0, 0, 0, 0);
		if (due) due.setHours(0, 0, 0, 0);

		const today = new Date();
		today.setHours(0, 0, 0, 0);
		const taskStart = start ? start.getTime() : -Infinity;
		const taskEnd = due ? Math.max(due.getTime(), today.getTime()) : Infinity;

		return taskStart <= weekEndTime && taskEnd >= weekStartTime;
	}

	/**
	 * 贪心装箱：将不重叠的提醒合并到共享行
	 * 每个提醒占 1 天宽度，同一天的提醒不能放在同一行
	 */
	private packRemindersIntoRows(reminders: GCTask[]): GCTask[][] {
		if (reminders.length === 0) return [];
		if (!this.currentWeekStart) return [reminders];

		const weekStartTime = this.currentWeekStart.getTime();
		const dayMs = 24 * 60 * 60 * 1000;

		// 计算每个提醒占的天索引
		const reminderDayIndices = reminders.map(task => {
			if (!task.dueDate) return 0;
			const due = new Date(task.dueDate);
			due.setHours(0, 0, 0, 0);
			return Math.max(0, Math.min(6, Math.round((due.getTime() - weekStartTime) / dayMs)));
		});

		// 贪心装箱
		const rows: GCTask[][] = [];
		const rowOccupied: Set<number>[] = []; // 每行已占用的天索引

		for (let i = 0; i < reminders.length; i++) {
			const dayIdx = reminderDayIndices[i];
			let placed = false;

			// 尝试放入已有行
			for (let r = 0; r < rows.length; r++) {
				if (!rowOccupied[r].has(dayIdx)) {
					rows[r].push(reminders[i]);
					rowOccupied[r].add(dayIdx);
					placed = true;
					break;
				}
			}

			// 没有合适行，新建一行
			if (!placed) {
				rows.push([reminders[i]]);
				rowOccupied.push(new Set([dayIdx]));
			}
		}

		return rows;
	}

	/**
	 * 渲染背景网格线
	 */
	private renderGridLines(ganttBody: HTMLElement): void {
		const gridLines = ganttBody.createDiv(WeekViewClasses.elements.ganttGridLines);
		for (let i = 0; i < 7; i++) {
			const line = gridLines.createDiv(WeekViewClasses.elements.ganttGridLine);
			if (this.currentWeekDays[i]?.isToday) {
				line.addClass(WeekViewClasses.modifiers.ganttGridLineToday);
			}
		}
	}

	/**
	 * 收集本周需要显示的所有任务
	 */
	private collectWeekTasks(): GCTask[] {
		if (!this.currentWeekStart || !this.currentWeekEnd) return [];

		let tasks: GCTask[] = this.plugin.taskCache.getAllTasks();
		tasks = this.applyStatusFilter(tasks);
		tasks = this.applyTagFilter(tasks);

		const weekStartTime = this.currentWeekStart.getTime();
		const weekEndTime = this.currentWeekEnd.getTime();

		return tasks.filter(task => {
			if (task.archived) return false;

			if (task.type === 'reminder') {
				if (!task.dueDate) return false;
				const due = new Date(task.dueDate);
				due.setHours(0, 0, 0, 0);
				const dueTime = due.getTime();
				return dueTime >= weekStartTime && dueTime <= weekEndTime;
			} else {
				// 待办
				if (task.completed && task.completionDate) {
					const comp = new Date(task.completionDate);
					comp.setHours(0, 0, 0, 0);
					const compTime = comp.getTime();
					return compTime >= weekStartTime && compTime <= weekEndTime;
				}

				const start = task.startDate ? new Date(task.startDate) : (task.createdDate ? new Date(task.createdDate) : null);
				const due = task.dueDate ? new Date(task.dueDate) : null;
				if (!start && !due) return false;

				if (start) start.setHours(0, 0, 0, 0);
				if (due) due.setHours(0, 0, 0, 0);

				const taskStart = start ? start.getTime() : -Infinity;
				const today = new Date();
				today.setHours(0, 0, 0, 0);
				const taskEnd = due ? Math.max(due.getTime(), today.getTime()) : Infinity;

				// 任务与本周有交集
				return taskStart <= weekEndTime && taskEnd >= weekStartTime;
			}
		});
	}

	/**
	 * 渲染甘特图行（可包含多个 bar，用于提醒合并行）
	 */
	private renderGanttRow(ganttBody: HTMLElement, tasks: GCTask[]): void {
		const row = ganttBody.createDiv(WeekViewClasses.elements.ganttRow);

		tasks.forEach(task => {
			this.renderGanttBar(row, task);
		});
	}

	/**
	 * 渲染单个任务 bar
	 */
	private renderGanttBar(row: HTMLElement, task: GCTask, options?: GanttBarOptions): void {
		// 计算 bar 的位置和宽度（基于 7 列百分比）
		const { leftPercent, widthPercent, overflowLeft, overflowRight } = this.calculateBarPosition(task);

		const bar = row.createDiv(WeekViewClasses.elements.ganttBar);
		bar.style.left = `${leftPercent}%`;
		if (overflowLeft) bar.addClass(WeekViewClasses.modifiers.ganttBarOverflowLeft);
		if (overflowRight) bar.addClass(WeekViewClasses.modifiers.ganttBarOverflowRight);
		bar.style.width = `${widthPercent}%`;

		// 颜色修饰（基于优先级）
		if (task.completed || task.status === 'done') {
			bar.addClass(WeekViewClasses.modifiers.ganttBarCompleted);
		} else if (task.cancelled || task.status === 'canceled') {
			bar.addClass(WeekViewClasses.modifiers.ganttBarCompleted);
		} else {
			switch (task.priority) {
				case 'high': bar.addClass(WeekViewClasses.modifiers.ganttBarPriorityHigh); break;
				case 'low': bar.addClass(WeekViewClasses.modifiers.ganttBarPriorityLow); break;
				default: bar.addClass(WeekViewClasses.modifiers.ganttBarPriorityNormal); break;
			}
		}
		// 提醒类型标记
		if (task.type === 'reminder') {
			bar.addClass(WeekViewClasses.modifiers.ganttBarReminder);
		}

		// 展开/折叠三角（如果有子任务）
		if (options?.showToggle) {
			const toggle = bar.createSpan({
				text: options.isExpanded ? '▼' : '▶',
				cls: WeekViewClasses.elements.ganttBarToggle,
			});
			toggle.addEventListener('click', (e) => {
				e.stopPropagation();
				options.onToggle?.();
			});
		}

		// Bar 内容：StatusIcon + 标题
		{
			const barIcon = new StatusIcon({
				status: (task.status || 'todo') as any,
				priority: task.priority || 'normal',
				isReminder: task.type === 'reminder',
				size: 'compact',
				disabled: false,
			});
			barIcon.render(bar);
			barIcon.onClick(async () => {
				const tooltipManager = TooltipManager.getInstance(this.plugin);
				tooltipManager.hide();
				await cycleTaskStatus(this.app, task);
				this.refreshTasks();
			});
		}
		bar.createSpan({ text: task.description || '无标题', cls: WeekViewClasses.elements.ganttBarLabel });

		// 进度文本
		if (options?.progress) {
			bar.createSpan({ text: options.progress, cls: WeekViewClasses.elements.ganttBarProgress });
		}

		// Tooltip
		const tooltipManager = TooltipManager.getInstance(this.plugin);
		bar.addEventListener('mouseenter', () => {
			tooltipManager.show(task, bar);
		});
		bar.addEventListener('mouseleave', () => {
			tooltipManager.hide();
		});

		// 点击事件 — 打开任务编辑
		bar.addEventListener('click', () => {
			tooltipManager.hide();
			openEditTaskModal(this.app, this.plugin, task, () => {
				this.refreshTasks();
			});
		});
	}

	/**
	 * 计算任务 bar 在 7 列中的位置
	 * @returns leftPercent, widthPercent, overflowLeft (开始在本周之前), overflowRight (结束在本周之后)
	 */
	private calculateBarPosition(task: GCTask): { leftPercent: number; widthPercent: number; overflowLeft: boolean; overflowRight: boolean } {
		if (!this.currentWeekStart) return { leftPercent: 0, widthPercent: 14.2857, overflowLeft: false, overflowRight: false };

		const weekStartTime = this.currentWeekStart.getTime();
		const dayMs = 24 * 60 * 60 * 1000;
		const colWidth = 100 / 7; // ~14.2857%

		if (task.type === 'reminder') {
			// 提醒：单天标记
			if (!task.dueDate) return { leftPercent: 0, widthPercent: colWidth, overflowLeft: false, overflowRight: false };
			const due = new Date(task.dueDate);
			due.setHours(0, 0, 0, 0);
			const dayIndex = Math.round((due.getTime() - weekStartTime) / dayMs);
			const clampedIndex = Math.max(0, Math.min(6, dayIndex));
			return { leftPercent: clampedIndex * colWidth, widthPercent: colWidth, overflowLeft: false, overflowRight: false };
		}

		// 待办
		if (task.completed && task.completionDate) {
			const comp = new Date(task.completionDate);
			comp.setHours(0, 0, 0, 0);
			const dayIndex = Math.round((comp.getTime() - weekStartTime) / dayMs);
			const clampedIndex = Math.max(0, Math.min(6, dayIndex));
			return { leftPercent: clampedIndex * colWidth, widthPercent: colWidth, overflowLeft: false, overflowRight: false };
		}

		const start = task.startDate ? new Date(task.startDate) : (task.createdDate ? new Date(task.createdDate) : null);
		const due = task.dueDate ? new Date(task.dueDate) : null;

		if (start) start.setHours(0, 0, 0, 0);
		if (due) due.setHours(0, 0, 0, 0);

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const taskStartTime = start ? start.getTime() : weekStartTime;
		const taskEndTime = due ? Math.max(due.getTime(), today.getTime()) : today.getTime();

		// Clamp to week boundaries（weekEndTime 为周最后一天的 23:59:59.999）
		const barStartTime = Math.max(taskStartTime, weekStartTime);
		const weekEndTime = this.currentWeekEnd ? this.currentWeekEnd.getTime() : weekStartTime + 6 * dayMs;
		const barEndTime = Math.min(taskEndTime, weekEndTime);

		// 检测溢出：任务实际范围超出当前周
		const overflowLeft = taskStartTime < weekStartTime;
		const overflowRight = taskEndTime > weekEndTime;

		// 安全检查：如果 barEnd < barStart（如任务 start 在未来且无 due），显示单天标记
		if (barEndTime < barStartTime) {
			const fallbackIndex = Math.max(0, Math.min(6, Math.round((barStartTime - weekStartTime) / dayMs)));
			return { leftPercent: fallbackIndex * colWidth, widthPercent: colWidth, overflowLeft: false, overflowRight: false };
		}

		const startIndex = (barStartTime - weekStartTime) / dayMs;
		const endIndex = (barEndTime - weekStartTime) / dayMs;

		const leftPercent = Math.min(Math.max(0, startIndex) * colWidth, 100 - colWidth);
		const span = Math.max(1, endIndex - startIndex + 1); // at least 1 day
		const widthPercent = Math.max(colWidth, Math.min(span * colWidth, 100 - leftPercent));

		return { leftPercent, widthPercent, overflowLeft, overflowRight };
	}

	// ==================== 增量刷新 ====================

	public refreshTasks(): void {
		const container = document.querySelector('.gc-view.gc-view--week') as HTMLElement;
		if (!container) return;

		const ganttBody = container.querySelector(`.${WeekViewClasses.elements.ganttBody}`) as HTMLElement;
		if (!ganttBody) return;

		// 清空并重新渲染 gantt body 内容
		ganttBody.empty();
		this.renderGridLines(ganttBody);

		const tasks = this.collectWeekTasks();
		if (tasks.length === 0) {
			const emptyEl = ganttBody.createDiv(WeekViewClasses.elements.empty);
			emptyEl.setText('本周暂无任务');
			return;
		}

		const sorted = sortTasks(tasks, this.sortState);

		// 分离提醒和待办，仅取根任务
		const reminders = sorted.filter(t => t.type === 'reminder' && !t.parentId);
		const rootTodos = sorted.filter(t => t.type !== 'reminder' && !t.parentId);

		// 渲染待办（与 renderGanttBody 逻辑一致）
		rootTodos.forEach(task => {
			const children = this.plugin.taskCache.getChildTasks(task.id);
			if (children.length > 0) {
				this.renderGanttGroupRow(ganttBody, task);
			} else {
				this.renderGanttRow(ganttBody, [task]);
			}
		});

		// 渲染提醒（合并行）
		const reminderRows = this.packRemindersIntoRows(reminders);
		reminderRows.forEach(rowTasks => this.renderGanttRow(ganttBody, rowTasks));
	}
}
