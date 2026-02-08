import type { CalendarViewType } from '../types';
import type { TaskViewRenderer } from '../views/TaskView';
import type { WeekViewRenderer } from '../views/WeekView';
import type { MonthViewRenderer } from '../views/MonthView';
import { ToolbarLeft } from './toolbar-left';
import { ToolbarCenter } from './toolbar-center';
import { ToolbarRightCalendar } from './toolbar-right-calendar';
import { ToolbarRightTask } from './toolbar-right-task';
import { ToolbarResponsiveManager } from './toolbar-responsive';
import { ToolbarClasses } from '../utils/bem';

/**
 * 工具栏主控制器
 * 负责整体布局和协调左中右三个区域
 */
export class Toolbar {
	private leftSection: ToolbarLeft;
	private centerSection: ToolbarCenter;
	private rightCalendarSection: ToolbarRightCalendar;
	private rightTaskSection: ToolbarRightTask;
	private responsiveManager: ToolbarResponsiveManager;

	constructor() {
		this.leftSection = new ToolbarLeft();
		this.centerSection = new ToolbarCenter();
		this.rightCalendarSection = new ToolbarRightCalendar();
		this.rightTaskSection = new ToolbarRightTask();
		this.responsiveManager = new ToolbarResponsiveManager();
	}

	/**
	 * 设置日历视图渲染器引用（用于排序和筛选功能）
	 */
	setCalendarRenderers(
		weekRenderer: WeekViewRenderer,
		monthRenderer: MonthViewRenderer,
	): void {
		this.rightCalendarSection.setRenderers(weekRenderer, monthRenderer);
	}

	/**
	 * 渲染整个工具栏
	 */
	render(container: HTMLElement, config: ToolbarConfig): void {
		container.empty();
		container.addClass(ToolbarClasses.block);

		const leftContainer = container.createDiv(ToolbarClasses.elements.left);
		const centerContainer = container.createDiv(ToolbarClasses.elements.center);
		const rightContainer = container.createDiv(ToolbarClasses.elements.right);

		this.leftSection.render(
			leftContainer,
			config.currentViewType,
			config.onViewSwitch,
			config.showViewNavButtonText ?? true
		);

		this.centerSection.render(
			centerContainer,
			config.titleText
		);

		if (config.currentViewType === 'task') {
			this.rightTaskSection.render(
				rightContainer,
				config.globalFilterText || '',
				config.taskRenderer,
				config.onFilterChange,
				config.onRefresh,
				config.plugin
			);
		} else {
			this.rightCalendarSection.render(
				rightContainer,
				config.currentViewType,
				config.onPrevious,
				config.onToday,
				config.onNext,
				config.onRefresh,
				config.onRender,
				config.plugin
			);
		}

		this.responsiveManager.observe(container, centerContainer, rightContainer);
	}

	destroy(): void {
		this.responsiveManager.disconnect();
	}
}

/**
 * 工具栏配置接口
 */
export interface ToolbarConfig {
	currentViewType: CalendarViewType;
	currentDate: Date;
	titleText: string;
	showViewNavButtonText?: boolean;

	globalFilterText?: string;
	taskRenderer: TaskViewRenderer;
	weekRenderer?: WeekViewRenderer;

	plugin?: any;

	onViewSwitch: (type: CalendarViewType) => void;
	onPrevious: () => void;
	onToday: () => void;
	onNext: () => void;
	onFilterChange: () => void;
	onRender: () => void;
	onRefresh: () => Promise<void>;
}
