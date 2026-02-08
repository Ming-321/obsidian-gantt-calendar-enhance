import { Notice, App } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import { getWeekOfDate } from '../dateUtils/dateUtilsIndex';
import type { GCTask, SortState, StatusFilterState, TagFilterState, CalendarDay } from '../types';
import { sortTasks } from '../tasks/taskSorter';
import { Logger } from '../utils/logger';
import { TooltipManager } from '../utils/tooltipManager';
import { WeekViewClasses } from '../utils/bem';
import { openEditTaskModal } from '../modals/EditTaskModal';

/**
 * 周视图渲染器 — 甘特图风格
 *
 * 布局：
 * - Header row: 7 列日期头（周一~周日）
 * - Body: 每个任务一行，用横向 bar 表示持续时间
 */
export class WeekViewRenderer extends BaseViewRenderer {
	private sortState: SortState = { field: 'priority', order: 'desc' };
	private readonly SETTINGS_PREFIX = 'weekView';

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

	render(container: HTMLElement, currentDate: Date): void {
		const weekData = getWeekOfDate(currentDate, currentDate.getFullYear(), !!(this.plugin?.settings?.startOnMonday));

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
		days.forEach((day) => {
			const dayHeader = headerRow.createDiv(WeekViewClasses.elements.headerCell);
			const dayNames = ['周日', '周一', '周二', '周三', '周四', '周五', '周六'];
			dayHeader.createEl('div', { text: dayNames[day.weekday], cls: WeekViewClasses.elements.dayName });
			dayHeader.createEl('div', { text: day.day.toString(), cls: WeekViewClasses.elements.dayNumber });
			if (day.lunarText) {
				dayHeader.createEl('div', { text: day.lunarText, cls: WeekViewClasses.elements.lunarText });
			}
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

		// 分离提醒和待办
		const reminders = sorted.filter(t => t.type === 'reminder');
		const todos = sorted.filter(t => t.type !== 'reminder');

		// 渲染待办：每个一行
		todos.forEach(task => {
			this.renderGanttRow(ganttBody, [task]);
		});

		// 渲染提醒：贪心装箱，将不重叠的提醒放在同一行
		const reminderRows = this.packRemindersIntoRows(reminders);
		reminderRows.forEach(rowTasks => {
			this.renderGanttRow(ganttBody, rowTasks);
		});
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
	private renderGanttBar(row: HTMLElement, task: GCTask): void {
		// 计算 bar 的位置和宽度（基于 7 列百分比）
		const { leftPercent, widthPercent } = this.calculateBarPosition(task);

		const bar = row.createDiv(WeekViewClasses.elements.ganttBar);
		bar.style.left = `${leftPercent}%`;
		bar.style.width = `${widthPercent}%`;

		// 优先级颜色修饰
		if (task.type === 'reminder') {
			bar.addClass(WeekViewClasses.modifiers.ganttBarReminder);
		} else if (task.completed) {
			bar.addClass(WeekViewClasses.modifiers.ganttBarCompleted);
		} else {
			switch (task.priority) {
				case 'high':
					bar.addClass(WeekViewClasses.modifiers.ganttBarHigh);
					break;
				case 'low':
					bar.addClass(WeekViewClasses.modifiers.ganttBarLow);
					break;
				default:
					bar.addClass(WeekViewClasses.modifiers.ganttBarNormal);
			}
		}

		// Bar 内容：图标 + 标题
		if (task.type === 'reminder') {
			bar.createSpan({ text: '🔔', cls: WeekViewClasses.elements.ganttBarIcon });
		}
		bar.createSpan({ text: task.description || '无标题', cls: WeekViewClasses.elements.ganttBarLabel });

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
	 * @returns leftPercent (0~100), widthPercent (>0)
	 */
	private calculateBarPosition(task: GCTask): { leftPercent: number; widthPercent: number } {
		if (!this.currentWeekStart) return { leftPercent: 0, widthPercent: 14.2857 };

		const weekStartTime = this.currentWeekStart.getTime();
		const dayMs = 24 * 60 * 60 * 1000;
		const colWidth = 100 / 7; // ~14.2857%

		if (task.type === 'reminder') {
			// 提醒：单天标记
			if (!task.dueDate) return { leftPercent: 0, widthPercent: colWidth };
			const due = new Date(task.dueDate);
			due.setHours(0, 0, 0, 0);
			const dayIndex = Math.round((due.getTime() - weekStartTime) / dayMs);
			const clampedIndex = Math.max(0, Math.min(6, dayIndex));
			return { leftPercent: clampedIndex * colWidth, widthPercent: colWidth };
		}

		// 待办
		if (task.completed && task.completionDate) {
			const comp = new Date(task.completionDate);
			comp.setHours(0, 0, 0, 0);
			const dayIndex = Math.round((comp.getTime() - weekStartTime) / dayMs);
			const clampedIndex = Math.max(0, Math.min(6, dayIndex));
			return { leftPercent: clampedIndex * colWidth, widthPercent: colWidth };
		}

		const start = task.startDate ? new Date(task.startDate) : (task.createdDate ? new Date(task.createdDate) : null);
		const due = task.dueDate ? new Date(task.dueDate) : null;

		if (start) start.setHours(0, 0, 0, 0);
		if (due) due.setHours(0, 0, 0, 0);

		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const taskStartTime = start ? start.getTime() : weekStartTime;
		const taskEndTime = due ? Math.max(due.getTime(), today.getTime()) : today.getTime();

		// Clamp to week boundaries
		const barStartTime = Math.max(taskStartTime, weekStartTime);
		const weekEndTime = weekStartTime + 6 * dayMs;
		const barEndTime = Math.min(taskEndTime, weekEndTime);

		const startIndex = (barStartTime - weekStartTime) / dayMs;
		const endIndex = (barEndTime - weekStartTime) / dayMs;

		const leftPercent = Math.max(0, startIndex) * colWidth;
		const span = Math.max(1, endIndex - startIndex + 1); // at least 1 day
		const widthPercent = Math.min(span * colWidth, 100 - leftPercent);

		return { leftPercent, widthPercent };
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

		// 分离提醒和待办
		const reminders = sorted.filter(t => t.type === 'reminder');
		const todos = sorted.filter(t => t.type !== 'reminder');

		// 渲染待办
		todos.forEach(task => this.renderGanttRow(ganttBody, [task]));

		// 渲染提醒（合并行）
		const reminderRows = this.packRemindersIntoRows(reminders);
		reminderRows.forEach(rowTasks => this.renderGanttRow(ganttBody, rowTasks));
	}
}
