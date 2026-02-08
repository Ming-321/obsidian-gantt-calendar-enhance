import type { CalendarViewType } from '../types';
import type { TaskViewRenderer } from '../views/TaskView';
import type { WeekViewRenderer } from '../views/WeekView';
import type { MonthViewRenderer } from '../views/MonthView';
import { ToolbarLeft } from './toolbar-left';
import { ToolbarCenter, type ToolbarCenterConfig } from './toolbar-center';
import { ToolbarRight } from './toolbar-right';
import { ToolbarResponsiveManager } from './toolbar-responsive';
import { ToolbarClasses } from '../utils/bem';

/**
 * 工具栏主控制器
 * 负责整体布局和协调左中右三个区域
 *
 * 布局：
 *   左侧 [周 | 月 | 任务]
 *   中间 [◀  第5周 (2.3-2.9)  ▶]
 *   右侧 [筛选 | 预设 | 新建]
 */
export class Toolbar {
	private leftSection: ToolbarLeft;
	private centerSection: ToolbarCenter;
	private rightSection: ToolbarRight;
	private responsiveManager: ToolbarResponsiveManager;

	constructor() {
		this.leftSection = new ToolbarLeft();
		this.centerSection = new ToolbarCenter();
		this.rightSection = new ToolbarRight();
		this.responsiveManager = new ToolbarResponsiveManager();
	}

	/**
	 * 设置日历视图渲染器引用（用于排序和筛选功能）
	 */
	setCalendarRenderers(
		weekRenderer: WeekViewRenderer,
		monthRenderer: MonthViewRenderer,
	): void {
		this.rightSection.setRenderers(weekRenderer, monthRenderer);
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

		// 左侧：视图切换按钮
		this.leftSection.render(
			leftContainer,
			config.currentViewType,
			config.onViewSwitch,
			config.showViewNavButtonText ?? true
		);

		// 中间：导航 + 标题
		const centerConfig: ToolbarCenterConfig = {
			titleText: config.titleText,
			showNav: config.showNav ?? (config.currentViewType !== 'task'),
			onPrevious: config.onPrevious,
			onToday: config.onToday,
			onNext: config.onNext,
			onLongPress: config.onLongPress,
		};
		this.centerSection.render(centerContainer, centerConfig);

		// 右侧：3 按钮（筛选 | 预设 | 新建）
		// 注意：weekRenderer/monthRenderer 通过 setCalendarRenderers() 预设，此处只需传 taskRenderer
		this.rightSection.render(rightContainer, {
			viewType: config.currentViewType,
			plugin: config.plugin,
			taskRenderer: config.taskRenderer,
			onFilterChange: config.onFilterChange,
			onRender: config.onRender,
		});

		this.responsiveManager.observe(container, centerContainer, rightContainer);
	}

	destroy(): void {
		this.responsiveManager.disconnect();
		this.rightSection.cleanup();
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
	/** 是否显示导航箭头（rolling7 模式和任务视图为 false） */
	showNav?: boolean;

	taskRenderer: TaskViewRenderer;
	plugin?: any;

	onViewSwitch: (type: CalendarViewType) => void;
	onPrevious: () => void;
	onToday: () => void;
	onNext: () => void;
	/** 标题长按回调（用于周视图切换 rolling7 模式） */
	onLongPress?: () => void;
	onFilterChange: () => void;
	onRender: () => void;
}
