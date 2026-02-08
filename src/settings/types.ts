import type GanttCalendarPlugin from '../../main';
import type { SortField, SortOrder, TagFilterOperator } from '../types';

/**
 * 日期字段类型
 */
export type DateFieldType = 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate';

/**
 * 任务视图显示模式
 */
export type TaskViewDisplayMode = 'compact' | 'full';

/**
 * 任务视图字段显示配置
 */
export interface TaskViewFieldConfig {
	showTags: boolean;
	showDetail: boolean;
	showCreatedDate: boolean;
	showStartDate: boolean;
	showDueDate: boolean;
	showCompletionDate: boolean;
	showFileLocation: boolean;
}

/**
 * 快捷预设
 */
export interface ViewPreset {
	id: string;
	name: string;
	icon?: string;
	isDefault: boolean;
	filters: {
		statuses?: string[];
		tags?: string[];
		tagOperator?: 'OR' | 'AND';
		sortField?: SortField;
		sortOrder?: SortOrder;
		dateRangeMode?: string;
		timeFieldFilter?: string;
	};
}

/**
 * Gantt Calendar Plugin Settings Interface
 */
export interface GanttCalendarSettings {
	startOnMonday: boolean;
	/** 学期起始日期列表（YYYY-MM-DD 格式） */
	semesterStartDates: string[];
	defaultView: 'week' | 'month' | 'task';
	/** 默认周视图模式：标准周 或 今天起7天 */
	defaultWeekMode: 'standard' | 'rolling7';
	enableDebugMode: boolean;

	// ========== 任务视图显示模式 ==========
	taskViewDisplayMode: TaskViewDisplayMode;
	taskViewCompactFields: TaskViewFieldConfig;
	taskViewFullFields: TaskViewFieldConfig;

	// ========== 持久化筛选和排序状态 ==========

	// TaskView 状态
	taskViewSortField: SortField;
	taskViewSortOrder: SortOrder;
	taskViewSecondarySortField?: SortField;
	taskViewSecondarySortOrder?: SortOrder;
	taskViewSelectedStatuses: string[];
	taskViewSelectedTags: string[];
	taskViewTagOperator: TagFilterOperator;
	taskViewTimeFieldFilter: DateFieldType;
	taskViewDateRangeMode: 'all' | 'day' | 'week' | 'month' | 'custom';

	// WeekView 状态
	weekViewSortField: SortField;
	weekViewSortOrder: SortOrder;
	weekViewSecondarySortField?: SortField;
	weekViewSecondarySortOrder?: SortOrder;
	weekViewSelectedStatuses: string[];
	weekViewSelectedTags: string[];
	weekViewTagOperator: TagFilterOperator;

	// MonthView 状态
	monthViewSortField: SortField;
	monthViewSortOrder: SortOrder;
	monthViewSecondarySortField?: SortField;
	monthViewSecondarySortOrder?: SortOrder;
	monthViewSelectedStatuses: string[];
	monthViewSelectedTags: string[];
	monthViewTagOperator: TagFilterOperator;

	// ========== 快捷预设 ==========
	viewPresets: ViewPreset[];

	// ========== GitHub 数据同步设置 ==========
	githubSync?: {
		enabled: boolean;
		token: string;
		owner: string;
		repo: string;
		lastSyncTime?: string;
		lastSyncStatus?: 'success' | 'error';
		lastSyncError?: string;
		reminderSchedule?: {
			morning:  { enabled: boolean; time: string };
			noon:     { enabled: boolean; time: string };
			evening:  { enabled: boolean; time: string };
		};
		timezone?: number;
	};
}

/**
 * 构建器配置接口
 */
export interface BuilderConfig {
	containerEl: HTMLElement;
	plugin: GanttCalendarPlugin;
	onRefreshSettings?: () => void;
}
