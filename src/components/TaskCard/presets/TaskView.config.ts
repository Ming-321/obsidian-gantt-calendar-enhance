import type { TaskCardConfig } from '../TaskCardConfig';

/**
 * 任务视图预设配置
 * 显示最完整的任务信息，包含所有时间属性
 */
export const TaskViewConfig: TaskCardConfig = {
	// 基础配置
	viewModifier: 'task',

	// 元素显示控制
	showCheckbox: true,
	showDescription: true,
	showTags: true,
	showPriority: true,
	showFileLocation: false,
	showWarning: true,
	showGlobalFilter: true,

	// 时间属性配置 — 仅显示截止时间
	showTimes: true,
	timeFields: {
		showCreated: false,
		showStart: false,
		showScheduled: false,
		showDue: true,
		showCancelled: false,
		showCompletion: false,
		showOverdueIndicator: true,
	},

	// 交互功能
	enableTooltip: false,
	enableDrag: false,
	clickable: true,

	// 样式配置
	compact: false,
};
