import type { GanttCalendarSettings } from './types';

/**
 * Gantt Calendar Plugin 默认设置
 */
export const DEFAULT_SETTINGS: GanttCalendarSettings = {
	startOnMonday: true,
	semesterStartDates: [],
	defaultView: 'week',
	defaultWeekMode: 'rolling7',
	enableDebugMode: false,

	// ========== 任务视图显示模式 ==========
	taskViewDisplayMode: 'compact',
	taskViewCompactFields: {
		showTags: false,
		showDetail: false,
		showCreatedDate: false,
		showStartDate: false,
		showDueDate: true,
		showCompletionDate: false,
		showFileLocation: false,
	},
	taskViewFullFields: {
		showTags: true,
		showDetail: true,
		showCreatedDate: true,
		showStartDate: false,
		showDueDate: true,
		showCompletionDate: false,
		showFileLocation: false,
	},

	// ========== 持久化筛选和排序状态默认值 ==========

	// TaskView
	taskViewSortField: 'dueDate',
	taskViewSortOrder: 'asc',
	taskViewSecondarySortField: 'priority',
	taskViewSecondarySortOrder: 'desc',
	taskViewSelectedStatuses: ['todo'],
	taskViewSelectedTags: [],
	taskViewTagOperator: 'OR',
	taskViewTimeFieldFilter: 'dueDate',
	taskViewDateRangeMode: 'week',

	// WeekView
	weekViewSortField: 'priority',
	weekViewSortOrder: 'desc',
	weekViewSecondarySortField: 'dueDate',
	weekViewSecondarySortOrder: 'asc',
	weekViewSelectedStatuses: ['todo'],
	weekViewSelectedTags: [],
	weekViewTagOperator: 'OR',

	// MonthView（月视图中同一天的任务日期相同，应以优先级为主排序）
	monthViewSortField: 'priority',
	monthViewSortOrder: 'desc',
	monthViewSecondarySortField: 'dueDate',
	monthViewSecondarySortOrder: 'asc',
	monthViewSelectedStatuses: ['todo'],
	monthViewSelectedTags: [],
	monthViewTagOperator: 'OR',

	// 快捷预设
	viewPresets: [
		{
			id: 'due-3-days',
			name: '三天内截止',
			icon: 'clock',
			isDefault: true,
			filters: {
				statuses: ['todo'],
				sortField: 'dueDate',
				sortOrder: 'asc',
				dateRangeMode: 'week',
			},
		},
		{
			id: 'all-this-week',
			name: '本周全部',
			icon: 'calendar',
			isDefault: false,
			filters: {
				statuses: [],
				dateRangeMode: 'week',
			},
		},
		{
			id: 'completed',
			name: '已完成',
			icon: 'check-circle',
			isDefault: false,
			filters: {
				statuses: ['done'],
				sortField: 'completionDate',
				sortOrder: 'desc',
			},
		},
	],
};
