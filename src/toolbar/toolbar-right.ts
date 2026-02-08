/**
 * @fileoverview 统一的工具栏右侧区域
 *
 * 精简为 3 个按钮：[筛选] | [预设] | [新建]
 * 与左侧视图切换按钮组对称的样式。
 */

import { setIcon } from 'obsidian';
import type { CalendarViewType } from '../types';
import type { WeekViewRenderer } from '../views/WeekView';
import type { MonthViewRenderer } from '../views/MonthView';
import type { TaskViewRenderer } from '../views/TaskView';
import { renderViewMenuButton, type ViewMenuOptions } from './components/view-menu';
import { renderPresetButton, type PresetButtonOptions } from './components/preset-button';
import { ToolbarClasses } from '../utils/bem';
import { CreateTaskModal } from '../modals/CreateTaskModal';
import type { ViewPreset } from '../settings/types';

export interface ToolbarRightConfig {
	viewType: CalendarViewType;
	plugin: any;
	taskRenderer?: TaskViewRenderer;
	onFilterChange: () => void;
	onRender: () => void;
}

/**
 * 右侧按钮配置
 */
interface RightButtonConfig {
	id: string;
	label: string;
	icon: string;
	ariaLabel: string;
}

const RIGHT_BUTTONS: RightButtonConfig[] = [
	{ id: 'view-menu', label: '筛选', icon: 'sliders-horizontal', ariaLabel: '视图菜单' },
	{ id: 'preset', label: '预设', icon: 'zap', ariaLabel: '快捷预设' },
	{ id: 'create', label: '新建', icon: 'plus', ariaLabel: '创建任务' },
];

/**
 * 统一的工具栏右侧
 */
export class ToolbarRight {
	private weekRenderer?: WeekViewRenderer;
	private monthRenderer?: MonthViewRenderer;
	private cleanups: Array<{ cleanup: () => void }> = [];

	setRenderers(
		weekRenderer: WeekViewRenderer,
		monthRenderer: MonthViewRenderer,
	): void {
		this.weekRenderer = weekRenderer;
		this.monthRenderer = monthRenderer;
	}

	render(container: HTMLElement, config: ToolbarRightConfig): void {
		container.empty();
		this.cleanups.forEach(c => c.cleanup());
		this.cleanups = [];

		const { viewType, plugin, taskRenderer, onFilterChange, onRender } = config;

		const getRenderer = () => {
			if (viewType === 'week') return this.weekRenderer;
			if (viewType === 'month') return this.monthRenderer;
			if (viewType === 'task') return taskRenderer;
			return undefined;
		};

		const renderer = getRenderer();
		if (!renderer || !plugin) return;

		// 使用与左侧相同的按钮组容器样式
		const buttonGroup = container.createDiv(ToolbarClasses.components.viewSelectorGroup.group);

		// 筛选和预设仅在任务视图下可用
		const isTaskView = viewType === 'task';

		// 渲染 3 个按钮
		RIGHT_BUTTONS.forEach((btnConfig) => {
			const btn = buttonGroup.createEl('button', {
				attr: { 'aria-label': btnConfig.ariaLabel },
			});
			btn.addClass(ToolbarClasses.components.viewSelectorGroup.btn);

			// 筛选和预设按钮在非任务视图下禁用
			const isDisabled = !isTaskView && (btnConfig.id === 'view-menu' || btnConfig.id === 'preset');
			if (isDisabled) {
				btn.addClass(ToolbarClasses.components.viewSelectorGroup.disabled);
				btn.setAttribute('disabled', 'true');
			}

			// 按钮内容（图标+文字）
			const content = btn.createDiv('view-selector-btn-content');
			const iconEl = content.createSpan();
			iconEl.addClass(ToolbarClasses.components.viewSelectorGroup.icon);
			setIcon(iconEl, btnConfig.icon);
			const labelEl = content.createSpan();
			labelEl.addClass(ToolbarClasses.components.viewSelectorGroup.label);
			labelEl.setText(btnConfig.label);

			// 禁用状态下不绑定交互
			if (isDisabled) return;

			// 绑定交互
			switch (btnConfig.id) {
				case 'view-menu':
					this.bindViewMenu(btn, viewType, plugin, renderer, taskRenderer, onFilterChange, onRender);
					break;
				case 'preset':
					this.bindPreset(btn, plugin, renderer, taskRenderer, viewType, onFilterChange, onRender);
					break;
				case 'create':
					this.bindCreateTask(btn, plugin);
					break;
			}
		});
	}

	/**
	 * 绑定视图菜单按钮交互
	 */
	private bindViewMenu(
		btn: HTMLElement,
		viewType: CalendarViewType,
		plugin: any,
		renderer: any,
		taskRenderer: TaskViewRenderer | undefined,
		onFilterChange: () => void,
		onRender: () => void,
	): void {
		const options: ViewMenuOptions = {
			viewType,
			plugin,
			getStatusFilterState: () => renderer.getStatusFilterState(),
			onStatusFilterChange: (state) => {
				renderer.setStatusFilterState(state);
				viewType === 'task' ? onFilterChange() : onRender();
			},
			getAvailableStatuses: () => plugin?.settings?.taskStatuses || [],
			getSortState: () => renderer.getSortState(),
			onSortChange: (state) => {
				renderer.setSortState(state);
				viewType === 'task' ? onFilterChange() : onRender();
			},
			getTagFilterState: () => renderer.getTagFilterState(),
			onTagFilterChange: (state) => {
				renderer.setTagFilterState(state);
				viewType === 'task' ? onFilterChange() : onRender();
			},
			getAllTasks: () => plugin.taskCache?.getAllTasks() || [],
		};

		if (viewType === 'task' && taskRenderer) {
			options.getDateRangeMode = () => taskRenderer.getDateRangeMode();
			options.onDateRangeChange = (mode: string) => {
				taskRenderer.setDateRangeMode(mode as any);
				onFilterChange();
			};
			options.getTimeFieldFilter = () => taskRenderer.getTimeFilterField();
			options.onTimeFieldChange = (field: string) => {
				taskRenderer.setTimeFilterField(field as any);
				onFilterChange();
			};
		}

		this.cleanups.push(renderViewMenuButton(btn, options));
	}

	/**
	 * 绑定预设按钮交互
	 */
	private bindPreset(
		btn: HTMLElement,
		plugin: any,
		renderer: any,
		taskRenderer: TaskViewRenderer | undefined,
		viewType: CalendarViewType,
		onFilterChange: () => void,
		onRender: () => void,
	): void {
		const options: PresetButtonOptions = {
			getPresets: () => plugin?.settings?.viewPresets || [],
			onApplyPreset: (preset: ViewPreset) => {
				this.applyPreset(preset, renderer, taskRenderer, viewType, onFilterChange, onRender);
			},
		};
		this.cleanups.push(renderPresetButton(btn, options));
	}

	/**
	 * 绑定创建任务按钮
	 */
	private bindCreateTask(btn: HTMLElement, plugin: any): void {
		btn.addEventListener('click', () => {
			const modal = new CreateTaskModal({
				app: plugin.app,
				plugin: plugin,
				targetDate: new Date(),
				onSuccess: async () => {
					plugin.refreshCalendarViews();
				}
			});
			modal.open();
		});
	}

	/**
	 * 应用预设
	 */
	private applyPreset(
		preset: ViewPreset,
		renderer: any,
		taskRenderer: TaskViewRenderer | undefined,
		viewType: CalendarViewType,
		onFilterChange: () => void,
		onRender: () => void,
	): void {
		const { filters } = preset;

		if (filters.statuses !== undefined) {
			renderer.setStatusFilterState({ selectedStatuses: filters.statuses });
		}
		if (filters.tags !== undefined || filters.tagOperator !== undefined) {
			const currentTag = renderer.getTagFilterState();
			renderer.setTagFilterState({
				selectedTags: filters.tags ?? currentTag.selectedTags,
				operator: filters.tagOperator ?? currentTag.operator,
			});
		}
		if (filters.sortField !== undefined || filters.sortOrder !== undefined) {
			const currentSort = renderer.getSortState();
			renderer.setSortState({
				field: filters.sortField ?? currentSort.field,
				order: filters.sortOrder ?? currentSort.order,
			});
		}
		if (viewType === 'task' && taskRenderer) {
			if (filters.dateRangeMode) {
				taskRenderer.setDateRangeMode(filters.dateRangeMode as any);
			}
			if (filters.timeFieldFilter) {
				taskRenderer.setTimeFilterField(filters.timeFieldFilter as any);
			}
		}

		viewType === 'task' ? onFilterChange() : onRender();
	}

	cleanup(): void {
		this.cleanups.forEach(c => c.cleanup());
		this.cleanups = [];
	}
}
