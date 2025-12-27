import type { TaskCardConfig } from '../TaskCardConfig';

/**
 * 日视图预设配置
 * 简化版本，仅显示核心任务信息（复选框、描述、标签、优先级）
 */
export const DayViewConfig: TaskCardConfig = {
	// 基础配置
	viewModifier: 'day',

	// 元素显示控制
	showCheckbox: true,
	showDescription: true,
	showTags: true,
	showPriority: true,
	showFileLocation: false,    // 日视图不显示文件位置
	showWarning: true,
	showGlobalFilter: true,

	// 时间属性配置（日视图不显示时间）
	showTimes: false,

	// 交互功能
	enableTooltip: false,
	enableDrag: false,
	clickable: true,

	// 样式配置
	compact: false,
};
