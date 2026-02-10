import { App } from 'obsidian';
import { BaseViewRenderer } from './BaseViewRenderer';
import { isToday, isThisWeek, isThisMonth } from '../dateUtils/dateUtilsIndex';
import type { GCTask, SortState, StatusFilterState, TagFilterState } from '../types';
import { registerTaskContextMenu, showCreateTaskMenu } from '../contextMenu/contextMenuIndex';
import { sortTasks } from '../tasks/taskSorter';
import { DEFAULT_SORT_STATE } from '../types';
import { ViewClasses, TaskCardClasses, withModifiers } from '../utils/bem';
import { TaskCardComponent } from '../components/TaskCard';
import { getTaskViewConfig } from '../components/TaskCard/presets/TaskView.config';
import { Logger } from '../utils/logger';

/**
 * 任务视图渲染器
 */
export class TaskViewRenderer extends BaseViewRenderer {
	// 子任务展开状态
	private expandedTasks: Set<string> = new Set();

	// 时间字段筛选
	private timeFieldFilter: 'createdDate' | 'startDate' | 'dueDate' | 'completionDate' | 'cancelledDate' = 'dueDate';

	// 时间值筛选
	private timeValueFilter: Date | null = null;

	// 日期范围模式：全部/当天/当周/当月/自定义日期
	private dateRangeMode: 'all' | 'day' | 'week' | 'month' | 'custom' = 'week';

	// 任务类型筛选：全部/待办/提醒/已归档
	private taskTypeFilter: 'all' | 'todo' | 'reminder' | 'archived' = 'all';

	// 排序状态
	private sortState: SortState = DEFAULT_SORT_STATE;

	// 任务列表容器缓存
	private taskListContainer: HTMLElement | null = null;

	// 设置前缀
	private readonly SETTINGS_PREFIX = 'taskView';

	constructor(app: App, plugin: any) {
		super(app, plugin);
		// 从设置加载初始状态
		this.initializeFilterStates(this.SETTINGS_PREFIX);
		this.initializeSortState();
		this.initializeTaskViewSpecificStates();
	}

	/**
	 * 初始化排序状态
	 */
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

	/**
	 * 初始化 TaskView 特有状态
	 */
	private initializeTaskViewSpecificStates(): void {
		const settings = this.plugin?.settings;
		if (!settings) return;

		if (settings.taskViewTimeFieldFilter) {
			this.timeFieldFilter = settings.taskViewTimeFieldFilter;
		}
		if (settings.taskViewDateRangeMode) {
			this.dateRangeMode = settings.taskViewDateRangeMode;
		}
	}

	/**
	 * 保存排序状态
	 */
	private async saveSortState(): Promise<void> {
		if (!this.plugin?.settings) return;
		this.plugin.settings[`${this.SETTINGS_PREFIX}SortField`] = this.sortState.field;
		this.plugin.settings[`${this.SETTINGS_PREFIX}SortOrder`] = this.sortState.order;
		await this.plugin.saveSettings();
	}

	/**
	 * 保存时间字段筛选
	 */
	private async saveTimeFieldFilter(): Promise<void> {
		if (!this.plugin?.settings) return;
		this.plugin.settings.taskViewTimeFieldFilter = this.timeFieldFilter;
		await this.plugin.saveSettings();
	}

	/**
	 * 保存日期范围模式
	 */
	private async saveDateRangeMode(): Promise<void> {
		if (!this.plugin?.settings) return;
		this.plugin.settings.taskViewDateRangeMode = this.dateRangeMode;
		await this.plugin.saveSettings();
	}

	// ===== Getter/Setter 方法 =====

	public getTimeFilterField(): 'createdDate' | 'startDate' | 'dueDate' | 'completionDate' | 'cancelledDate' {
		return this.timeFieldFilter;
	}

	public setTimeFilterField(value: any): void {
		this.timeFieldFilter = value;
		this.saveTimeFieldFilter().catch(err => {
			Logger.error('TaskView', 'Failed to save time field filter', err);
		});
	}

	public getSpecificDate(): Date | null {
		return this.timeValueFilter;
	}

	public setSpecificDate(date: Date | null): void {
		this.timeValueFilter = date;
	}

	public getDateRangeMode(): 'all' | 'day' | 'week' | 'month' | 'custom' {
		return this.dateRangeMode;
	}

	public setDateRangeMode(mode: 'all' | 'day' | 'week' | 'month' | 'custom'): void {
		this.dateRangeMode = mode;
		this.saveDateRangeMode().catch(err => {
			Logger.error('TaskView', 'Failed to save date range mode', err);
		});
	}

	public getTaskTypeFilter(): 'all' | 'todo' | 'reminder' | 'archived' {
		return this.taskTypeFilter;
	}

	public setTaskTypeFilter(filter: 'all' | 'todo' | 'reminder' | 'archived'): void {
		this.taskTypeFilter = filter;
		this.refreshTaskList();
	}

	public getSortState(): SortState {
		return this.sortState;
	}

	public setSortState(state: SortState): void {
		this.sortState = state;
		this.saveSortState().catch(err => {
			Logger.error('TaskView', 'Failed to save sort state', err);
		});
	}

	/**
	 * 重写状态筛选 setter 以支持持久化
	 */
	public setStatusFilterState(state: StatusFilterState): void {
		super.setStatusFilterState(state);
		this.saveStatusFilterState(this.SETTINGS_PREFIX).catch(err => {
			Logger.error('TaskView', 'Failed to save status filter', err);
		});
	}

	/**
	 * 重写标签筛选 setter 以支持持久化
	 */
	public setTagFilterState(state: TagFilterState): void {
		super.setTagFilterState(state);
		this.saveTagFilterState(this.SETTINGS_PREFIX).catch(err => {
			Logger.error('TaskView', 'Failed to save tag filter', err);
		});
	}

	render(container: HTMLElement, currentDate: Date): void {
		// 创建任务视图容器
		const taskRoot = container.createDiv(withModifiers(ViewClasses.block, ViewClasses.modifiers.task));

		// 空白处右键创建任务菜单
		taskRoot.addEventListener('contextmenu', (e: MouseEvent) => {
			// 点击已有任务卡片时不触发（任务卡片有自己的右键菜单）
			if ((e.target as HTMLElement).closest(`.${TaskCardClasses.block}`)) return;

			showCreateTaskMenu(e, this.app, this.plugin, new Date(), () => {
				this.refreshTaskList();
			});
		});

		this.taskListContainer = taskRoot;
		this.loadTaskList(taskRoot);
	}

	/**
	 * 增量刷新：只重新加载任务内容，不重建DOM
	 */
	public refreshTasks(): void {
		this.refreshTaskList();
	}

	/**
	 * 只刷新任务列表，不重新创建整个视图
	 * 用于筛选条件变化时更新显示
	 */
	public refreshTaskList(): void {
		if (this.taskListContainer) {
			this.loadTaskList(this.taskListContainer);
		}
	}

	/**
	 * 加载任务列表
	 */
	private async loadTaskList(listContainer: HTMLElement): Promise<void> {
		listContainer.empty();
		listContainer.createEl('div', { text: '加载中...', cls: 'gantt-task-empty' });

		try {
			let tasks: GCTask[] = this.plugin.taskCache.getAllTasks();

			// 按任务类型筛选
			if (this.taskTypeFilter === 'archived') {
				// 仅显示已归档任务
				tasks = tasks.filter(t => t.archived);
			} else {
				// 默认排除已归档任务
				tasks = tasks.filter(t => !t.archived);
				if (this.taskTypeFilter === 'todo') {
					tasks = tasks.filter(t => t.type === 'todo');
				} else if (this.taskTypeFilter === 'reminder') {
					tasks = tasks.filter(t => t.type === 'reminder');
				}
			}

			// 应用状态筛选（使用基类方法）
			tasks = this.applyStatusFilter(tasks);

			// 日期范围筛选
			const mode = this.getDateRangeMode();
			if (mode !== 'all') {
				const ref = this.timeValueFilter ?? new Date();
				const startOfDay = (d: Date) => { const x = new Date(d); x.setHours(0,0,0,0); return x; };
				const endOfDay = (d: Date) => { const x = new Date(d); x.setHours(23,59,59,999); return x; };
				const startOfWeek = (d: Date) => { const x = startOfDay(d); const day = x.getDay(); const diff = (day + 6) % 7; x.setDate(x.getDate() - diff); return x; };
				const endOfWeek = (d: Date) => { const s = startOfWeek(d); const e = new Date(s); e.setDate(s.getDate() + 6); e.setHours(23,59,59,999); return e; };
				const startOfMonth = (d: Date) => { const x = startOfDay(d); x.setDate(1); return x; };
				const endOfMonth = (d: Date) => { const x = startOfDay(d); x.setMonth(x.getMonth()+1, 0); x.setHours(23,59,59,999); return x; };

				let rangeStart: Date;
				let rangeEnd: Date;
				if (mode === 'day' || mode === 'custom') {
					rangeStart = startOfDay(ref);
					rangeEnd = endOfDay(ref);
				} else if (mode === 'week') {
					rangeStart = startOfWeek(ref);
					rangeEnd = endOfWeek(ref);
				} else { // month
					rangeStart = startOfMonth(ref);
					rangeEnd = endOfMonth(ref);
				}

				tasks = tasks.filter(task => {
					const dateValue = (task as any)[this.timeFieldFilter];
					if (!dateValue) return false;
					const taskDate = new Date(dateValue);
					if (isNaN(taskDate.getTime())) return false;
					return taskDate >= rangeStart && taskDate <= rangeEnd;
				});
			}

			// 应用标签筛选
			tasks = this.applyTagFilter(tasks);

			// 仅保留根任务用于顶层渲染（子任务通过树形递归展示）
			const rootTasks = tasks.filter(t => !t.parentId);

			// 应用排序
			const sortedRootTasks = sortTasks(rootTasks, this.sortState);

			listContainer.empty();

			if (sortedRootTasks.length === 0) {
				listContainer.createEl('div', { text: '未找到符合条件的任务', cls: 'gantt-task-empty' });
				return;
			}

			// 默认展开所有有子任务的根任务（首次）
			this.initDefaultExpanded(sortedRootTasks);

			sortedRootTasks.forEach(task => this.renderTaskTree(task, listContainer, 0));
		} catch (error) {
			Logger.error('TaskView', 'Error rendering task view', error);
			listContainer.empty();
			listContainer.createEl('div', { text: '加载任务时出错', cls: 'gantt-task-empty' });
		}
	}

	/**
	 * 初始化默认展开状态：首次加载时展开根任务的一级子任务
	 */
	private initDefaultExpanded(rootTasks: GCTask[]): void {
		// 只在第一次（expandedTasks 为空时）初始化
		if (this.expandedTasks.size > 0) return;
		rootTasks.forEach(task => {
			if (task.childIds?.length) {
				this.expandedTasks.add(task.id);
			}
		});
	}

	/**
	 * 切换任务展开/折叠状态
	 */
	private toggleExpand(taskId: string): void {
		if (this.expandedTasks.has(taskId)) {
			this.expandedTasks.delete(taskId);
		} else {
			this.expandedTasks.add(taskId);
		}
		this.refreshTaskList();
	}

	/**
	 * 递归渲染任务树
	 */
	private renderTaskTree(task: GCTask, container: HTMLElement, depth: number): void {
		const hasChildren = (task.childIds?.length ?? 0) > 0;

		// 创建带缩进的包装容器
		const wrapper = container.createDiv({ cls: 'gc-task-tree-item' });
		wrapper.style.paddingLeft = `${depth * 20}px`;

		// 如果有子任务，显示展开/折叠按钮；否则显示占位
		if (hasChildren) {
			const toggle = wrapper.createSpan({ cls: 'gc-task-tree-toggle' });
			toggle.textContent = this.expandedTasks.has(task.id) ? '▼' : '▶';
			toggle.addEventListener('click', (e) => {
				e.stopPropagation();
				this.toggleExpand(task.id);
			});
		} else if (depth > 0) {
			// 子任务无子任务时添加占位以对齐
			wrapper.createSpan({ cls: 'gc-task-tree-spacer' });
		}

		// 渲染任务卡片
		this.renderTaskItem(task, wrapper);

		// 如果展开，递归渲染子任务
		if (hasChildren && this.expandedTasks.has(task.id)) {
			const children = this.plugin.taskCache.getChildTasks(task.id);
			const sortedChildren = sortTasks(children, this.sortState);
			sortedChildren.forEach(child => this.renderTaskTree(child, container, depth + 1));
		}
	}

	/**
	 * 渲染任务项（使用统一组件，根据当前显示模式动态生成配置）
	 */
	private renderTaskItem(task: GCTask, listContainer: HTMLElement): void {
		const config = getTaskViewConfig(this.plugin?.settings);
		new TaskCardComponent({
			task,
			config,
			container: listContainer,
			app: this.app,
			plugin: this.plugin,
			onClick: (task) => {
				// 刷新任务列表
				this.refreshTaskList();
			},
		}).render();
	}
}
