import { ItemView, WorkspaceLeaf, setIcon, Notice } from 'obsidian';
import { CalendarViewType } from './types';
import { getWeekOfDate, formatDate, formatMonth } from './utils';
import { solarToLunar, getShortLunarText } from './lunar';
import { YearViewRenderer } from './views/YearView';
import { MonthViewRenderer } from './views/MonthView';
import { WeekViewRenderer } from './views/WeekView';
import { DayViewRenderer } from './views/DayView';
import { TaskViewRenderer } from './views/TaskView';

export const CALENDAR_VIEW_ID = 'gantt-calendar-view';

export class CalendarView extends ItemView {
	private currentDate: Date = new Date();
	private viewType: CalendarViewType = 'year';
	private lastCalendarViewType: CalendarViewType = 'month';
	private resizeObserver: ResizeObserver | null = null;
	private plugin: any;
	private cacheUpdateListener: (() => void) | null = null;

	// 子视图渲染器
	private yearRenderer: YearViewRenderer;
	private monthRenderer: MonthViewRenderer;
	private weekRenderer: WeekViewRenderer;
	private dayRenderer: DayViewRenderer;
	private taskRenderer: TaskViewRenderer;

	constructor(leaf: WorkspaceLeaf, plugin: any) {
		super(leaf);
		this.plugin = plugin;
		// 存储 calendarView 引用到 plugin,供子渲染器访问
		this.plugin.calendarView = this;

		// 初始化子视图渲染器
		this.yearRenderer = new YearViewRenderer(this.app, plugin);
		this.monthRenderer = new MonthViewRenderer(this.app, plugin);
		this.weekRenderer = new WeekViewRenderer(this.app, plugin);
		this.dayRenderer = new DayViewRenderer(this.app, plugin);
		this.taskRenderer = new TaskViewRenderer(this.app, plugin);
	}

	getViewType(): string {
		return CALENDAR_VIEW_ID;
	}

	getDisplayText(): string {
		return 'Gantt Calendar';
	}

	getIcon(): string {
		return 'calendar-days';
	}

	async onOpen(): Promise<void> {
		// 等待任务缓存准备完成
		if (this.plugin?.taskCache?.whenReady) {
			await this.plugin.taskCache.whenReady();
		}
		this.render();
		this.setupResizeObserver();

		// 订阅缓存更新事件
		this.cacheUpdateListener = () => {
			if (this.containerEl.isConnected) {
				this.render();
			}
		};
		this.plugin?.taskCache?.onUpdate(this.cacheUpdateListener);
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
		this.yearRenderer.runDomCleanups();
		this.monthRenderer.runDomCleanups();
		this.weekRenderer.runDomCleanups();
		this.dayRenderer.runDomCleanups();
		this.taskRenderer.runDomCleanups();

		// Cleanup resize observer
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
		}
	}

	private setupResizeObserver(): void {
		// 监听容器大小变化，重新计算年视图农历显示
		const content = this.containerEl.children[1];
		if (!content) return;

		try {
			this.resizeObserver = new ResizeObserver(() => {
				if (this.viewType === 'year') {
					this.yearRenderer.updateAllMonthCards();
				}
			});

			this.resizeObserver.observe(content);
		} catch (e) {
			// ResizeObserver not supported, fail silently
		}
	}

	private render(): void {
		// 清理上一次渲染的资源
		this.yearRenderer.runDomCleanups();
		this.monthRenderer.runDomCleanups();
		this.weekRenderer.runDomCleanups();
		this.dayRenderer.runDomCleanups();
		this.taskRenderer.runDomCleanups();

		const container = this.containerEl.children[1];
		container.empty();

		// Create toolbar
		const toolbar = container.createDiv('calendar-toolbar');
		this.createToolbar(toolbar);

		// Create calendar content
		const content = container.createDiv('calendar-content');
		this.renderCalendarContent(content);

		// 年视图应用农历字号
		if (this.viewType === 'year') {
			this.yearRenderer.applyLunarFontSize(content);
		}
	}

	private createToolbar(toolbar: HTMLElement): void {
		const isTaskView = this.viewType === 'task';

		// Left region: 视图选择（Tasks / Calendar）
		const left = toolbar.createDiv('calendar-toolbar-left');
		const toggleGroup = left.createDiv('calendar-toggle-group');
		const taskToggle = toggleGroup.createEl('button', { text: 'Tasks' });
		taskToggle.addClass('calendar-toggle-btn');
		if (isTaskView) taskToggle.addClass('active');
		taskToggle.onclick = () => this.switchView('task');

		const calendarToggle = toggleGroup.createEl('button', { text: 'Calendar' });
		calendarToggle.addClass('calendar-toggle-btn');
		if (!isTaskView) calendarToggle.addClass('active');
		calendarToggle.onclick = () => {
			const target = this.lastCalendarViewType || 'month';
			this.switchView(target);
		};

		// Center region: 显示区（日期范围或标题，日视图附加农历/节日）
		const center = toolbar.createDiv('calendar-toolbar-center');
		const dateDisplay = center.createEl('span');
		dateDisplay.addClass('calendar-date-display');
		if (this.viewType === 'day') {
			const lunar = solarToLunar(this.currentDate);
			const lunarText = getShortLunarText(this.currentDate);
			let displayText = this.getDateRangeText();
			if (lunarText) displayText += ` • ${lunarText}`;
			if (lunar.festival) displayText += ` • ${lunar.festival}`;
			dateDisplay.setText(displayText);
		} else {
			dateDisplay.setText(this.getDateRangeText());
		}

		// Right region: 功能区（随视图变化）
		const right = toolbar.createDiv('calendar-toolbar-right');
		if (isTaskView) {
			// Global Filter 状态
			const gfText = right.createEl('span', { cls: 'gantt-filter-label' });
			gfText.setText(`Global Filter: ${this.plugin?.settings?.globalTaskFilter || '（未设置）'}`);

			// 状态筛选标签和按钮
			const statusFilterGroup = right.createDiv('gantt-filter-group');
			const statusLabel = statusFilterGroup.createEl('span', { text: '状态筛选', cls: 'gantt-filter-group-label' });
			
			const filterButtons = statusFilterGroup.createDiv('gantt-task-filter-buttons');
			const btnAll = filterButtons.createEl('button', { text: '全部', cls: 'gantt-filter-btn' });
			const btnUncompleted = filterButtons.createEl('button', { text: '未完成', cls: 'gantt-filter-btn' });
			const btnCompleted = filterButtons.createEl('button', { text: '已完成', cls: 'gantt-filter-btn' });

			const updateActive = () => {
				const filter = this.taskRenderer.getTaskFilter();
				btnAll.toggleClass('active', filter === 'all');
				btnUncompleted.toggleClass('active', filter === 'uncompleted');
				btnCompleted.toggleClass('active', filter === 'completed');
			};
			updateActive();

			btnAll.addEventListener('click', () => {
				this.taskRenderer.setTaskFilter('all');
				updateActive();
				this.render();
			});
			btnUncompleted.addEventListener('click', () => {
				this.taskRenderer.setTaskFilter('uncompleted');
				updateActive();
				this.render();
			});
			btnCompleted.addEventListener('click', () => {
				this.taskRenderer.setTaskFilter('completed');
				updateActive();
				this.render();
			});

			// 分割线
			const divider = right.createDiv('gantt-filter-divider');

			// 日期筛选标签和按钮
			const dateFilterGroup = right.createDiv('gantt-filter-group');
			const dateLabel = dateFilterGroup.createEl('span', { text: '日期筛选', cls: 'gantt-filter-group-label' });
			
			const dateFilterButtons = dateFilterGroup.createDiv('gantt-task-filter-buttons');
			const btnDateAll = dateFilterButtons.createEl('button', { text: '全部', cls: 'gantt-filter-btn' });
			const btnDateToday = dateFilterButtons.createEl('button', { text: '今日', cls: 'gantt-filter-btn' });
			const btnDateWeek = dateFilterButtons.createEl('button', { text: '本周', cls: 'gantt-filter-btn' });
			const btnDateMonth = dateFilterButtons.createEl('button', { text: '本月', cls: 'gantt-filter-btn' });

			const updateDateActive = () => {
				const filter = this.taskRenderer.getDateFilter();
				btnDateAll.toggleClass('active', filter === 'all');
				btnDateToday.toggleClass('active', filter === 'today');
				btnDateWeek.toggleClass('active', filter === 'week');
				btnDateMonth.toggleClass('active', filter === 'month');
			};
			updateDateActive();

			btnDateAll.addEventListener('click', () => {
				this.taskRenderer.setDateFilter('all');
				updateDateActive();
				this.render();
			});
			btnDateToday.addEventListener('click', () => {
				this.taskRenderer.setDateFilter('today');
				updateDateActive();
				this.render();
			});
			btnDateWeek.addEventListener('click', () => {
				this.taskRenderer.setDateFilter('week');
				updateDateActive();
				this.render();
			});
			btnDateMonth.addEventListener('click', () => {
				this.taskRenderer.setDateFilter('month');
				updateDateActive();
				this.render();
			});

			const refreshBtn = right.createEl('button', { cls: 'calendar-view-btn icon-btn', attr: { title: '刷新任务' } });
			setIcon(refreshBtn, 'rotate-ccw');
			refreshBtn.addEventListener('click', async () => {
				// 重新扫描库并更新缓存
				await this.plugin.taskCache.initialize(
					this.plugin.settings.globalTaskFilter,
					this.plugin.settings.enabledTaskFormats
				);
				this.render();
			});
			right.appendChild(refreshBtn);
		} else {
			// 日历视图功能区：上一期/今天/下一期 + 子视图选择
			const navButtons = right.createDiv('calendar-nav-buttons');
			const prevBtn = navButtons.createEl('button', { text: '◀ 上一个' });
			prevBtn.addClass('calendar-nav-btn');
			prevBtn.onclick = () => this.previousPeriod();

			const nextBtn = navButtons.createEl('button', { text: '下一个 ▶' });
			nextBtn.addClass('calendar-nav-btn');
			nextBtn.onclick = () => this.nextPeriod();

			const todayBtn = navButtons.createEl('button', { text: '今天' });
			todayBtn.addClass('calendar-nav-btn');
			todayBtn.onclick = () => this.goToToday();

			const viewContainer = right.createDiv('calendar-view-selector');
			const viewTypes: { [key: string]: string } = {
				'day': '日',
				'week': '周',
				'month': '月',
				'year': '年',
			};

			['day', 'week', 'month', 'year'].forEach((type) => {
				const btn = viewContainer.createEl('button', { text: viewTypes[type] });
				btn.addClass('calendar-view-btn');
				if (type === this.viewType) btn.addClass('active');
				btn.onclick = () => this.switchView(type as CalendarViewType);
			});

			// 刷新按钮（图标模式 + 悬浮提示）
			const refreshBtn = right.createEl('button', { cls: 'calendar-view-btn icon-btn', attr: { title: '刷新任务' } });
			setIcon(refreshBtn, 'rotate-ccw');
			refreshBtn.addEventListener('click', async () => {
				// 重新扫描库并更新缓存
				await this.plugin.taskCache.initialize(
					this.plugin.settings.globalTaskFilter,
					this.plugin.settings.enabledTaskFormats
				);
				this.render();
			});
		}
	}

	private renderCalendarContent(content: HTMLElement): void {
		switch (this.viewType) {
			case 'year':
				this.yearRenderer.render(content, this.currentDate);
				break;
			case 'month':
				this.monthRenderer.render(content, this.currentDate);
				break;
			case 'week':
				this.weekRenderer.render(content, this.currentDate);
				break;
			case 'day':
				this.dayRenderer.render(content, this.currentDate);
				break;
			case 'task':
				this.taskRenderer.render(content, this.currentDate);
				break;
		}
	}

	// ===== 公共方法供子渲染器调用 =====

	public selectDate(date: Date): void {
		this.currentDate = new Date(date);
		if (this.viewType !== 'day') {
			this.viewType = 'day';
		}
		this.render();
	}

	public switchView(type: CalendarViewType): void {
		if (type !== 'task') {
			this.lastCalendarViewType = type;
		}
		this.viewType = type;
		this.render();
	}

	// ===== 导航方法 =====

	private previousPeriod(): void {
		const date = new Date(this.currentDate);
		switch (this.viewType) {
			case 'year':
				date.setFullYear(date.getFullYear() - 1);
				break;
			case 'month':
				date.setMonth(date.getMonth() - 1);
				break;
			case 'week':
				date.setDate(date.getDate() - 7);
				break;
			case 'day':
				date.setDate(date.getDate() - 1);
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
			case 'year':
				date.setFullYear(date.getFullYear() + 1);
				break;
			case 'month':
				date.setMonth(date.getMonth() + 1);
				break;
			case 'week':
				date.setDate(date.getDate() + 7);
				break;
			case 'day':
				date.setDate(date.getDate() + 1);
				break;
			case 'task':
				return;
		}
		this.currentDate = date;
		this.render();
	}

	private goToToday(): void {
		if (this.viewType === 'task') return;
		this.currentDate = new Date();
		this.render();
	}

	private getDateRangeText(): string {
		switch (this.viewType) {
			case 'year':
				return this.currentDate.getFullYear().toString();
			case 'month':
				return formatMonth(
					this.currentDate.getFullYear(),
					this.currentDate.getMonth() + 1
				);
			case 'week': {
				const week = getWeekOfDate(this.currentDate, undefined, !!(this.plugin?.settings?.startOnMonday));
				const start = formatDate(week.startDate);
				const end = formatDate(week.endDate);
				return `Week ${week.weekNumber} (${start} - ${end})`;
			}
			case 'day':
				return formatDate(this.currentDate, 'YYYY-MM-DD ddd');
			case 'task':
				return '任务视图';
		}
	}
}
