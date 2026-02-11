import type { TaskCardConfig } from '../TaskCardConfig';

/**
 * 月视图预设配置
 * 最简化版本：无标签、无 checkbox（使用 StatusIcon 组件替代）
 */
export const MonthViewConfig: TaskCardConfig = {
	// 基础配置
	viewModifier: 'month',

	// 元素显示控制
	showCheckbox: false,        // StatusIcon 组件替代
	showDescription: true,
	showTags: false,            // 月视图不显示标签（标签可在 tooltip 中查看）
	showPriority: false,
	showFileLocation: false,
	showWarning: false,
	showGlobalFilter: false,
	priorityAsBackground: false, // 色带替代

	// 时间属性配置
	showTimes: false,

	// 交互功能
	enableTooltip: true,
	enableDrag: true,
	clickable: true,

	// 样式配置
	compact: true,
	maxLines: 1,
};
