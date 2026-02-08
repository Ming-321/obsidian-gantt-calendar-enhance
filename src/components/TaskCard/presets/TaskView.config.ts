import type { TaskCardConfig } from '../TaskCardConfig';
import type { GanttCalendarSettings, TaskViewDisplayMode, TaskViewFieldConfig } from '../../../settings/types';

/**
 * 根据设置和当前显示模式动态生成任务视图卡片配置
 * @param settings 插件设置
 * @param mode 当前显示模式（compact/full），如不传则从 settings 读取
 */
export function getTaskViewConfig(settings?: GanttCalendarSettings, mode?: TaskViewDisplayMode): TaskCardConfig {
	const displayMode = mode ?? settings?.taskViewDisplayMode ?? 'compact';
	const fields: TaskViewFieldConfig = displayMode === 'full'
		? (settings?.taskViewFullFields ?? DEFAULT_FULL_FIELDS)
		: (settings?.taskViewCompactFields ?? DEFAULT_COMPACT_FIELDS);

	// 动态判断是否有任何时间字段需要显示
	const hasAnyTimeField = fields.showCreatedDate || fields.showStartDate
		|| fields.showDueDate || fields.showCompletionDate;

	return {
		// 基础配置
		viewModifier: 'task',

		// 元素显示控制
		showCheckbox: true,
		showDescription: true,
		showTags: fields.showTags,
		showPriority: false,          // 优先级通过背景色展示，不显示圆点
		showFileLocation: fields.showFileLocation,
		showWarning: true,
		showDetail: fields.showDetail,
		priorityAsBackground: true,   // 任务视图始终启用优先级背景色

		// 时间属性配置（仅在有启用的时间字段时才显示时间区域）
		showTimes: hasAnyTimeField,
		timeFields: hasAnyTimeField ? {
			showCreated: fields.showCreatedDate,
			showStart: fields.showStartDate,
			showScheduled: false,
			showDue: fields.showDueDate,
			showCancelled: false,
			showCompletion: fields.showCompletionDate,
			showOverdueIndicator: true,
		} : undefined,

		// 交互功能
		enableTooltip: false,
		enableDrag: false,
		clickable: true,

		// 样式配置
		compact: false,
	};
}

/** 简洁模式默认字段 */
const DEFAULT_COMPACT_FIELDS: TaskViewFieldConfig = {
	showTags: false,
	showDetail: false,
	showCreatedDate: false,
	showStartDate: false,
	showDueDate: true,
	showCompletionDate: false,
	showFileLocation: false,
};

/** 完整模式默认字段 */
const DEFAULT_FULL_FIELDS: TaskViewFieldConfig = {
	showTags: true,
	showDetail: true,
	showCreatedDate: true,
	showStartDate: false,
	showDueDate: true,
	showCompletionDate: false,
	showFileLocation: false,
};

/**
 * @deprecated 使用 getTaskViewConfig() 替代
 * 保留用于向后兼容，等同于 getTaskViewConfig() 无参调用
 */
export const TaskViewConfig: TaskCardConfig = getTaskViewConfig();
