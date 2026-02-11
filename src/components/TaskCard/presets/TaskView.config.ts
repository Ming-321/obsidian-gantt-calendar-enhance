import type { TaskCardConfig } from '../TaskCardConfig';

/**
 * 任务视图统一配置
 * 移除原有的 compact/full 双模式，统一为单一配置。
 * StatusIcon 替代 checkbox，色带替代优先级背景色，倒计时替代时间字段。
 */
export function getTaskViewConfig(): TaskCardConfig {
	return {
		// 基础配置
		viewModifier: 'task',

		// 元素显示控制
		showCheckbox: false,          // StatusIcon 替代
		showDescription: true,
		showTags: true,               // 始终显示标签
		showPriority: false,
		showFileLocation: false,
		showWarning: false,
		showDetail: false,            // 详情移到 tooltip
		priorityAsBackground: false,  // 色带替代

		// 时间属性配置
		showTimes: false,             // 倒计时替代

		// 交互功能
		enableTooltip: false,
		enableDrag: false,
		clickable: true,

		// 样式配置
		compact: false,
	};
}

/**
 * @deprecated 使用 getTaskViewConfig() 替代
 */
export const TaskViewConfig: TaskCardConfig = getTaskViewConfig();
