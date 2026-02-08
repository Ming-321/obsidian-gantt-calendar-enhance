import type { GanttCalendarSettings } from './types';
import { DEFAULT_TASK_STATUSES } from '../tasks/taskStatus';

/**
 * Gantt Calendar Plugin 默认设置
 */
export const DEFAULT_SETTINGS: GanttCalendarSettings = {
	mySetting: 'default',
	startOnMonday: true,
	semesterStartDates: [], // 为空使用自然年周数
	solarFestivalColor: '#e74c3c',  // 阳历节日 - 红色
	lunarFestivalColor: '#e8a041',  // 农历节日 - 橙色
	solarTermColor: '#52c41a',      // 节气 - 绿色
	enabledTaskFormats: ['tasks'], // 启用的任务格式
	dateFilterField: 'dueDate', // 默认使用截止日期作为筛选字段
	dailyNotePath: 'DailyNotes', // 默认 daily note 文件夹路径
	dailyNoteNameFormat: 'yyyy-MM-dd', // 默认文件名格式
	monthViewTaskLimit: 3, // 默认每天显示5个任务
	taskNotePath: 'Tasks', // 默认任务笔记文件夹路径
	taskStatuses: DEFAULT_TASK_STATUSES, // 默认任务状态配置
	taskSortField: 'dueDate', // 默认排序字段：截止日期
	taskSortOrder: 'asc', // 默认排序顺序：升序
	defaultView: 'month', // 默认视图：月视图
	newTaskHeading: undefined, // 默认添加到文件末尾
	enableTemplaterForDailyNote: false, // 默认不使用 Templater
	templaterTemplatePath: '', // 默认模板路径
	defaultTaskPriority: 'normal', // 默认正常优先级
	enableDebugMode: false, // 默认关闭开发者模式
	showViewNavButtonText: true, // 默认显示视图导航按钮文本

	// ========== 任务视图显示模式 ==========
	taskViewDisplayMode: 'compact', // 默认简洁模式
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
	taskViewSelectedStatuses: ['todo'],
	taskViewSelectedTags: [],
	taskViewTagOperator: 'OR',
	taskViewTimeFieldFilter: 'dueDate',
	taskViewDateRangeMode: 'week',

	// WeekView
	weekViewSortField: 'priority',
	weekViewSortOrder: 'desc',
	weekViewSelectedStatuses: ['todo'],
	weekViewSelectedTags: [],
	weekViewTagOperator: 'OR',
	// WeekView 卡片显示控制
	weekViewShowCheckbox: true,
	weekViewShowTags: true,
	weekViewShowPriority: true,

	// MonthView
	monthViewSelectedStatuses: ['todo'],
	monthViewSelectedTags: [],
	monthViewTagOperator: 'OR',
	// MonthView 卡片显示控制
	monthViewShowCheckbox: true,
	monthViewShowTags: true,
	monthViewShowPriority: false,  // 月视图空间有限，默认不显示优先级

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

/**
 * 热力图色卡配置
 */
export const HEATMAP_PALETTES = {
	blue: {
		key: 'blue' as const,
		label: '蓝色',
		colors: [
			'rgba(56, 132, 255, 0.12)',
			'rgba(56, 132, 255, 0.22)',
			'rgba(56, 132, 255, 0.32)',
			'rgba(56, 132, 255, 0.44)',
			'rgba(56, 132, 255, 0.58)'
		]
	},
	green: {
		key: 'green' as const,
		label: '绿色',
		colors: [
			'rgba(82, 196, 26, 0.12)',
			'rgba(82, 196, 26, 0.22)',
			'rgba(82, 196, 26, 0.32)',
			'rgba(82, 196, 26, 0.44)',
			'rgba(82, 196, 26, 0.58)'
		]
	},
	red: {
		key: 'red' as const,
		label: '红色',
		colors: [
			'rgba(231, 76, 60, 0.12)',
			'rgba(231, 76, 60, 0.22)',
			'rgba(231, 76, 60, 0.32)',
			'rgba(231, 76, 60, 0.44)',
			'rgba(231, 76, 60, 0.58)'
		]
	},
	purple: {
		key: 'purple' as const,
		label: '紫色',
		colors: [
			'rgba(142, 68, 173, 0.12)',
			'rgba(142, 68, 173, 0.22)',
			'rgba(142, 68, 173, 0.32)',
			'rgba(142, 68, 173, 0.44)',
			'rgba(142, 68, 173, 0.58)'
		]
	},
	orange: {
		key: 'orange' as const,
		label: '橙色',
		colors: [
			'rgba(245, 124, 0, 0.12)',
			'rgba(245, 124, 0, 0.22)',
			'rgba(245, 124, 0, 0.32)',
			'rgba(245, 124, 0, 0.44)',
			'rgba(245, 124, 0, 0.58)'
		]
	},
	cyan: {
		key: 'cyan' as const,
		label: '青色',
		colors: [
			'rgba(0, 188, 212, 0.12)',
			'rgba(0, 188, 212, 0.22)',
			'rgba(0, 188, 212, 0.32)',
			'rgba(0, 188, 212, 0.44)',
			'rgba(0, 188, 212, 0.58)'
		]
	},
	pink: {
		key: 'pink' as const,
		label: '粉色',
		colors: [
			'rgba(233, 30, 99, 0.12)',
			'rgba(233, 30, 99, 0.22)',
			'rgba(233, 30, 99, 0.32)',
			'rgba(233, 30, 99, 0.44)',
			'rgba(233, 30, 99, 0.58)'
		]
	},
	yellow: {
		key: 'yellow' as const,
		label: '黄色',
		colors: [
			'rgba(255, 193, 7, 0.12)',
			'rgba(255, 193, 7, 0.22)',
			'rgba(255, 193, 7, 0.32)',
			'rgba(255, 193, 7, 0.44)',
			'rgba(255, 193, 7, 0.58)'
		]
	}
};

/**
 * 预设节日颜色
 */
export const PRESET_FESTIVAL_COLORS = [
	'#e74c3c', '#e8a041', '#52c41a', '#2196F3', '#9C27B0', '#FF5722', '#00BCD4'
];
