import type { TaskCardConfig } from '../TaskCardConfig';

/**
 * 周视图预设配置
 * 支持拖拽功能，有悬浮提示
 */
export const WeekViewConfig: TaskCardConfig = {
	// 基础配置
	viewModifier: 'week',

	// 元素显示控制
	showCheckbox: true,
	showDescription: true,
	showTags: true,
	showPriority: true,
	showFileLocation: false,
	showWarning: true,
	showGlobalFilter: false,   // 周视图不显示全局过滤词

	// 时间属性配置
	showTimes: false,

	// 交互功能
	enableTooltip: true,
	enableDrag: true,          // 周视图支持拖拽
	clickable: true,

	// 样式配置
	compact: false,
};
