import { ItemView, WorkspaceLeaf } from 'obsidian';
import { CalendarViewType } from './types';
import { getWeekOfDate, getRolling7Days, getTodayDate } from './dateUtils/dateUtilsIndex';
import { MonthViewRenderer } from './views/MonthView';
import { WeekViewRenderer } from './views/WeekView';
import { TaskViewRenderer } from './views/TaskView';
import { Toolbar } from './toolbar/toolbar';
import { Logger } from './utils/logger';

export const GC_VIEW_ID = 'gantt-calendar-view';

/** 周视图模式：标准周（周一~周日） 或 滚动7日（从今天起7天） */
export type WeekMode = 'standard' | 'rolling7';

export class GCMainView extends ItemView {
	private currentDate: Date = new Date();
	private viewType: CalendarViewType = 'month';
	private weekMode: WeekMode = 'standard';
	private resizeObserver: ResizeObserver | null = null;
	private plugin: any;
	private cacheUpdateListener: (() => void) | null = null;

	// 子视图渲染器
	private monthRenderer: MonthViewRenderer;
	private weekRenderer: WeekViewRenderer;
	private taskRenderer: TaskViewRenderer;

	// 工具栏控制器
	private toolbar: Toolbar;

	constructor(leaf: WorkspaceLeaf, plugin: any) {
		super(leaf);
		this.plugin = plugin;
		// 使用设置中的默认视图和周模式
		this.viewType = plugin.settings.defaultView || 'week';
		if (this.viewType === 'week') {
			this.weekMode = plugin.settings.defaultWeekMode || 'standard';
		}
		// 存储 calendarView 引用到 plugin,供子渲染器访问
		this.plugin.calendarView = this;

		// 初始化子视图渲染器
		this.monthRenderer = new MonthViewRenderer(this.app, plugin);
		this.weekRenderer = new WeekViewRenderer(this.app, plugin);
		this.taskRenderer = new TaskViewRenderer(this.app, plugin);

		// 初始化工具栏控制器
		this.toolbar = new Toolbar();
	}

	getViewType(): string {
		return GC_VIEW_ID;
	}

	getDisplayText(): string {
		return 'Gantt Calendar';
	}

	getIcon(): string {
		return 'calendar-days';
	}

	async onOpen(): Promise<void> {
		// 设置日历视图渲染器引用（用于排序和筛选功能）
		this.toolbar.setCalendarRenderers(
			this.weekRenderer,
			this.monthRenderer,
		);
		this.render();
		this.setupResizeObserver();

		// 订阅缓存更新事件
		this.cacheUpdateListener = (filePath?: string) => {
			if (this.containerEl.isConnected) {
				this.incrementalRefresh(filePath);
			}
		};
		this.plugin?.taskCache?.onUpdate(this.cacheUpdateListener);
	}

	/**
	 * 增量刷新：根据当前视图类型调用对应的增量刷新方法
	 */
	private incrementalRefresh(filePath?: string): void {
		switch (this.viewType) {
			case 'month':
				this.monthRenderer.refreshTasks();
				break;
			case 'week':
				this.weekRenderer.refreshTasks();
				break;
			case 'task':
				this.taskRenderer.refreshTasks();
				break;
		}
	}

	public refreshSettings(): void {
		// 重新渲染内容
		this.render();
	}

	async onClose(): Promise<void> {
		// Unsubscribe from cache updates
		if (this.cacheUpdateListener) {
			this.plugin?.taskCache?.offUpdate(this.cacheUpdateListener);
			this.cacheUpdateListener = null;
		}

		// Cleanup renderers
		this.monthRenderer.runDomCleanups();
		this.weekRenderer.runDomCleanups();
		this.taskRenderer.runDomCleanups();

		// Cleanup resize observer
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
		}
	}

	private setupResizeObserver(): void {
		const content = this.containerEl.children[1];
		if (!content) return;

		try {
			this.resizeObserver = new ResizeObserver(() => {
				// 预留给需要响应容器大小变化的视图
			});

			this.resizeObserver.observe(content);
		} catch (e) {
			// ResizeObserver not supported, fail silently
		}
	}

	private render(): void {
		const startTime = performance.now();
		Logger.debug('GCMainView', `render() called, viewType: ${this.viewType}`);

		// 清理上一次渲染的资源
		this.monthRenderer.runDomCleanups();
		this.weekRenderer.runDomCleanups();
		this.taskRenderer.runDomCleanups();

		const container = this.containerEl.children[1];
		container.empty();

		// Create toolbar
		const toolbarContainer = container.createDiv('calendar-toolbar');
		// rolling7 模式下隐藏导航箭头
		const showNav = this.viewType !== 'task' && this.weekMode !== 'rolling7';

		this.toolbar.render(toolbarContainer, {
			currentViewType: this.viewType,
			currentDate: this.currentDate,
			titleText: this.getViewTitle(),
			showViewNavButtonText: true,
			showNav,
			taskRenderer: this.taskRenderer,
			plugin: this.plugin,
			onViewSwitch: (type) => this.switchView(type),
			onPrevious: () => this.previousPeriod(),
			onToday: () => this.handleTitleClick(),
			onNext: () => this.nextPeriod(),
			onLongPress: () => this.handleTitleLongPress(),
			onFilterChange: () => {
				if (this.viewType === 'task') {
					this.taskRenderer.refreshTaskList();
				} else {
					this.render();
				}
			},
			onRender: () => this.render(),
		});

		// Create calendar content
		const content = container.createDiv('calendar-content');
		this.renderCalendarContent(content);

		const elapsed = performance.now() - startTime;
		Logger.debug('GCMainView', `render() completed in ${elapsed.toFixed(2)}ms`);
	}

	private renderCalendarContent(content: HTMLElement): void {
		switch (this.viewType) {
			case 'month':
				this.monthRenderer.render(content, this.currentDate);
				break;
			case 'week': {
				const dateForWeek = this.weekMode === 'rolling7' ? getTodayDate() : this.currentDate;
				this.weekRenderer.render(content, dateForWeek, this.weekMode);
				break;
			}
			case 'task':
				this.taskRenderer.render(content, this.currentDate);
				break;
		}
	}

	// ===== 公共方法供子渲染器调用 =====

	public selectDate(date: Date): void {
		this.currentDate = new Date(date);
		// 选择日期时切换到周视图
		if (this.viewType !== 'week') {
			this.viewType = 'week';
		}
		this.render();
	}

	public switchView(type: CalendarViewType): void {
		if (type !== 'week') {
			this.weekMode = 'standard';
		}
		this.viewType = type;
		this.render();
	}

	// ===== 导航方法 =====

	private previousPeriod(): void {
		const date = new Date(this.currentDate);
		switch (this.viewType) {
			case 'month':
				date.setMonth(date.getMonth() - 1);
				break;
			case 'week':
				date.setDate(date.getDate() - 7);
				break;
			case 'task':
				return;
		}
		this.currentDate = date;
		this.render();
	}

	private nextPeriod(): void {
		const date = new Date(this.currentDate);
		switch (this.viewType) {
			case 'month':
				date.setMonth(date.getMonth() + 1);
				break;
			case 'week':
				date.setDate(date.getDate() + 7);
				break;
			case 'task':
				return;
		}
		this.currentDate = date;
		this.render();
	}

	private goToToday(): void {
		if (this.viewType === 'task') return;
		this.weekMode = 'standard';
		this.currentDate = getTodayDate();
		this.render();
	}

	/**
	 * 标题单击处理：
	 * - 任务视图 → 切换简洁/完整显示模式
	 * - rolling7 模式 → 切回标准周模式
	 * - 标准模式 → 回到今天
	 */
	private handleTitleClick(): void {
		if (this.viewType === 'task') {
			this.toggleTaskViewDisplayMode();
			return;
		}
		if (this.weekMode === 'rolling7') {
			this.weekMode = 'standard';
			this.currentDate = getTodayDate();
			this.render();
		} else {
			this.goToToday();
		}
	}

	/**
	 * 切换任务视图显示模式（简洁 ↔ 完整）
	 */
	private async toggleTaskViewDisplayMode(): Promise<void> {
		if (!this.plugin?.settings) return;
		const current = this.plugin.settings.taskViewDisplayMode || 'compact';
		this.plugin.settings.taskViewDisplayMode = current === 'compact' ? 'full' : 'compact';
		await this.plugin.saveSettings();
		this.render();
	}

	/**
	 * 标题长按处理：仅在周视图标准模式下，切换到 rolling7 模式
	 */
	private handleTitleLongPress(): void {
		if (this.viewType !== 'week') return;
		if (this.weekMode === 'standard') {
			this.weekMode = 'rolling7';
			this.currentDate = getTodayDate();
			this.render();
		}
	}

	private getViewTitle(): string {
		switch (this.viewType) {
			case 'month': {
				const m = this.currentDate.getMonth() + 1;
				return `${m}月`;
			}
			case 'week': {
				if (this.weekMode === 'rolling7') {
					const rolling = getRolling7Days(getTodayDate());
					const s = rolling.startDate;
					const e = rolling.endDate;
					const startStr = `${s.getMonth() + 1}.${s.getDate()}`;
					const endStr = `${e.getMonth() + 1}.${e.getDate()}`;
					return `今天起7天 (${startStr}-${endStr})`;
				}
				const week = getWeekOfDate(this.currentDate, undefined, !!(this.plugin?.settings?.startOnMonday));
				const weekNum = this.getCustomWeekNumber(week);
				const s = week.startDate;
				const e = week.endDate;
				const startStr = `${s.getMonth() + 1}.${s.getDate()}`;
				const endStr = `${e.getMonth() + 1}.${e.getDate()}`;
				return `第${weekNum}周 (${startStr}-${endStr})`;
			}
			case 'task': {
				const mode = this.plugin?.settings?.taskViewDisplayMode || 'compact';
				const modeLabel = mode === 'compact' ? '简洁' : '完整';
				return `任务 · ${modeLabel}`;
			}
		}
	}

	/**
	 * 根据学期起始日列表计算自定义周数
	 * 从 semesterStartDates 中找到最近的、不晚于当前周起始日的日期作为基准
	 * 列表为空时回退到自然年周数
	 */
	private getCustomWeekNumber(week: { weekNumber: number; startDate: Date }): number {
		const dates = this.plugin?.settings?.semesterStartDates;
		if (!dates || dates.length === 0) {
			return week.weekNumber;
		}

		const weekStart = new Date(week.startDate);
		weekStart.setHours(0, 0, 0, 0);
		const weekStartTime = weekStart.getTime();

		// 找最近的、不晚于当前周起始日的学期起始日
		let activeSemesterStr: string | null = null;
		const sorted = [...dates].sort(); // 升序排列
		for (const d of sorted) {
			const parsed = this.parseDateString(d);
			if (parsed && parsed.getTime() <= weekStartTime) {
				activeSemesterStr = d;
			}
		}

		if (!activeSemesterStr) {
			return week.weekNumber;
		}

		const semStart = this.parseDateString(activeSemesterStr)!;

		// 对齐到该周的起始日（周一或周日）
		const startOnMonday = !!(this.plugin?.settings?.startOnMonday);
		const dayOfWeek = semStart.getDay();
		if (startOnMonday) {
			const offset = dayOfWeek === 0 ? -6 : 1 - dayOfWeek;
			semStart.setDate(semStart.getDate() + offset);
		} else {
			semStart.setDate(semStart.getDate() - dayOfWeek);
		}
		semStart.setHours(0, 0, 0, 0);

		const diffMs = weekStartTime - semStart.getTime();
		const diffWeeks = Math.floor(diffMs / (7 * 24 * 60 * 60 * 1000)) + 1;

		return diffWeeks > 0 ? diffWeeks : week.weekNumber;
	}

	/**
	 * 解析 YYYY-MM-DD 格式的日期字符串
	 */
	private parseDateString(dateStr: string): Date | null {
		const parts = dateStr.split('-');
		if (parts.length !== 3) return null;
		const d = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
		return isNaN(d.getTime()) ? null : d;
	}
}
