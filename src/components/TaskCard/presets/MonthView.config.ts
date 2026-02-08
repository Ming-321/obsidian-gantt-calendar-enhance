import type { TaskCardConfig } from '../TaskCardConfig';

/**
 * 月视图预设配置
 * 最简化版本，空间有限
 */
export const MonthViewConfig: TaskCardConfig = {
	// 基础配置
	viewModifier: 'month',

	// 元素显示控制
	showCheckbox: true,
	showDescription: true,
	showTags: true,
	showPriority: false,        // 优先级通过背景色展示
	showFileLocation: false,
	showWarning: false,         // 月视图不显示警告
	showGlobalFilter: false,
	priorityAsBackground: true, // 使用类型色+优先级透明度

	// 时间属性配置
	showTimes: false,

	// 交互功能
	enableTooltip: true,
	enableDrag: true,
	clickable: true,

	// 样式配置
	compact: true,              // 紧凑模式
	maxLines: 1,                // 限制为单行显示
};
