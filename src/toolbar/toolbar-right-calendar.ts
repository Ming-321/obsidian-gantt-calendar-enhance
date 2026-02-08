import { renderNavButtons } from './components/nav-buttons';
import { renderRefreshButton } from './components/refresh-button';
import { renderSortButton } from './components/sort-button';
import { renderTagFilterButton } from './components/tag-filter';
import { renderCreateTaskButton } from './components/create-task-button';
import { renderStatusFilterButton } from './components/status-filter';
import type { CalendarViewType } from '../types';
import type { WeekViewRenderer } from '../views/WeekView';
import type { MonthViewRenderer } from '../views/MonthView';
import { ToolbarClasses } from '../utils/bem';

/**
 * 工具栏右侧区域 - 日历视图功能区
 *
 * 按钮布局顺序：
 * 周视图：[状态筛选] [排序] | [标签筛选] | [◀ 上一期] [今天] [下一期▶] | [刷新]
 * 月视图：         [状态筛选] [标签筛选] | [◀ 上一期] [今天] [下一期▶] | [刷新]
 */
export class ToolbarRightCalendar {
	private weekRenderer?: WeekViewRenderer;
	private monthRenderer?: MonthViewRenderer;

	/**
	 * 设置渲染器引用
	 */
	setRenderers(
		weekRenderer: WeekViewRenderer,
		monthRenderer: MonthViewRenderer,
	): void {
		this.weekRenderer = weekRenderer;
		this.monthRenderer = monthRenderer;
	}

	render(
		container: HTMLElement,
		currentViewType: CalendarViewType,
		onPrevious: () => void,
		onToday: () => void,
		onNext: () => void,
		onRefresh: () => Promise<void>,
		onRender: () => void = () => {},
		plugin?: any
	): void {
		container.empty();

		// 状态筛选按钮（周视图和月视图）
		if (currentViewType === 'week' || currentViewType === 'month') {
			const renderer = currentViewType === 'week' ? this.weekRenderer : this.monthRenderer;
			if (renderer) {
				renderStatusFilterButton(container, {
					getCurrentState: () => renderer.getStatusFilterState(),
					onStatusFilterChange: (state) => {
						renderer.setStatusFilterState(state);
						onRender();
					},
					getAvailableStatuses: () => {
						return plugin?.settings?.taskStatuses || [];
					}
				});
			}
		}

		// 排序按钮（周视图和月视图）
		if (currentViewType === 'week' || currentViewType === 'month') {
			const getRenderer = () => currentViewType === 'week' ? this.weekRenderer : this.monthRenderer;
			if (getRenderer()) {
				renderSortButton(container, {
					getCurrentState: () => getRenderer()?.getSortState() || { field: 'dueDate', order: 'asc' },
					onSortChange: (newState) => {
						getRenderer()?.setSortState(newState);
						onRender();
					}
				});
			}
		}

		// 标签筛选按钮
		if (plugin?.taskCache) {
			const getRenderer = () => {
				if (currentViewType === 'week') return this.weekRenderer;
				if (currentViewType === 'month') return this.monthRenderer;
				return undefined;
			};

			renderTagFilterButton(container, {
				getCurrentState: () => getRenderer()?.getTagFilterState() || { selectedTags: [], operator: 'OR' },
				onTagFilterChange: (newState) => {
					getRenderer()?.setTagFilterState(newState);
					onRender();
				},
				getAllTasks: () => plugin.taskCache.getAllTasks()
			});
		}

		// 导航按钮组
		renderNavButtons(container, {
			onPrevious,
			onToday,
			onNext,
			containerClass: ToolbarClasses.components.navButtons.group,
			buttonClass: ToolbarClasses.components.navButtons.btn
		});

		// 创建任务按钮
		if (plugin) {
			const createTaskWrapper = container.createDiv();
			createTaskWrapper.addClass(ToolbarClasses.priority.priority3);
			renderCreateTaskButton(createTaskWrapper, {
				plugin: plugin,
				buttonClass: ToolbarClasses.components.navButtons.btn
			});
		}

		// 刷新按钮
		renderRefreshButton(container, onRefresh, '刷新任务');
	}
}
