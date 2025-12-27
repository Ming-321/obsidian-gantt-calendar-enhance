import type { TaskCardConfig } from '../TaskCardConfig';

/**
 * 甘特图视图预设配置
 * 任务卡片只显示描述和标签
 */
export const GanttViewConfig: TaskCardConfig = {
	// 基础配置
	viewModifier: 'gantt',

	// 元素显示控制
	showCheckbox: true,
	showDescription: true,
	showTags: true,
	showPriority: true,
	showFileLocation: false,
	showWarning: false,
	showGlobalFilter: true,

	// 时间属性配置
	showTimes: false,

	// 交互功能
	enableTooltip: false,
	enableDrag: false,
	clickable: true,

	// 样式配置
	compact: false,
};
