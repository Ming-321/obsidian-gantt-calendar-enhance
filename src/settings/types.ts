import type GanttCalendarPlugin from '../../main';
import type { SortField, SortOrder, TagFilterOperator } from '../types';
import type { TaskStatus } from '../tasks/taskStatus';

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
 * 控制简洁/完整模式下显示哪些字段
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
	mySetting: string;
	startOnMonday: boolean;
	/** @deprecated 使用 semesterStartDates 替代 */
	semesterStartDate?: string;
	/** 学期起始日期列表（YYYY-MM-DD 格式），自动选择最近的过去日期计算自定义周数，为空则使用自然年周数 */
	semesterStartDates: string[];
	solarFestivalColor: string;
	lunarFestivalColor: string;
	solarTermColor: string;
	enabledTaskFormats: string[];
	dateFilterField: 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate'; // 日历视图的筛选字段，任务视图的初始字段
	dailyNotePath: string; // Daily note 文件夹路径
	dailyNoteNameFormat: string; // Daily note 文件名格式 (如 yyyy-MM-dd)
	monthViewTaskLimit: number; // 月视图每天显示的最大任务数量
	taskNotePath: string; // 任务笔记默认文件夹路径
	taskStatuses: TaskStatus[]; // 任务状态配置（包含颜色）
	taskSortField: SortField; // 任务排序字段
	taskSortOrder: SortOrder; // 任务排序顺序
	defaultView: 'week' | 'month' | 'task'; // 默认视图
	newTaskHeading?: string; // 新任务插入的标题（留空则添加到文件末尾）
	enableTemplaterForDailyNote: boolean; // 是否启用 Templater 集成
	templaterTemplatePath: string; // Templater 模板路径
	defaultTaskPriority: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'normal'; // 默认任务优先级
	enableDebugMode: boolean; // 是否启用开发者模式（详细日志）
	showViewNavButtonText: boolean; // 是否显示视图导航按钮文本

	// ========== 任务视图显示模式 ==========
	taskViewDisplayMode: TaskViewDisplayMode; // 当前显示模式：简洁 | 完整
	taskViewCompactFields: TaskViewFieldConfig; // 简洁模式字段配置
	taskViewFullFields: TaskViewFieldConfig; // 完整模式字段配置

	// ========== 持久化筛选和排序状态 ==========

	// TaskView 状态
	taskViewSortField: SortField;
	taskViewSortOrder: SortOrder;
	taskViewSelectedStatuses: string[];
	taskViewSelectedTags: string[];
	taskViewTagOperator: TagFilterOperator;
	taskViewTimeFieldFilter: DateFieldType;
	taskViewDateRangeMode: 'all' | 'day' | 'week' | 'month' | 'custom';

	// WeekView 状态
	weekViewSortField: SortField;
	weekViewSortOrder: SortOrder;
	weekViewSelectedStatuses: string[];
	weekViewSelectedTags: string[];
	weekViewTagOperator: TagFilterOperator;
	// WeekView 卡片显示控制
	weekViewShowCheckbox: boolean;
	weekViewShowTags: boolean;
	weekViewShowPriority: boolean;

	// MonthView 状态
	monthViewSelectedStatuses: string[];
	monthViewSelectedTags: string[];
	monthViewTagOperator: TagFilterOperator;
	// MonthView 卡片显示控制
	monthViewShowCheckbox: boolean;
	monthViewShowTags: boolean;
	monthViewShowPriority: boolean;

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
		// 邮件提醒时间配置
		reminderSchedule?: {
			morning:  { enabled: boolean; time: string };
			noon:     { enabled: boolean; time: string };
			evening:  { enabled: boolean; time: string };
		};
		timezone?: number; // UTC 偏移小时数，默认 8（东八区）
	};

	// ========== 同步设置 ==========
	syncConfiguration?: {
		enabledSources: {
			api?: boolean;
			caldav?: boolean;
		};
		syncDirection: 'bidirectional' | 'import-only' | 'export-only';
		syncInterval: number;
		conflictResolution: 'local-win' | 'remote-win' | 'newest-win' | 'manual';
		api?: {
			provider: 'feishu' | 'microsoft-todo' | 'custom';
			apiKey?: string;
			endpoint?: string;

			// OAuth 配置
			clientId?: string;           // App ID (用于 OAuth)
			clientSecret?: string;       // App Secret (用于 OAuth)
			redirectUri?: string;        // OAuth 回调地址

			// Token
			accessToken?: string;
			refreshToken?: string;
			tokenExpireAt?: number;      // token 过期时间戳

			// 用户信息
			userId?: string;
			userName?: string;

			// 旧字段保留兼容（飞书）
			appId?: string;
			appSecret?: string;
			tenantId?: string;
		};
		caldav?: {
			provider: 'google' | 'outlook' | 'apple' | 'custom';
			url?: string;
			username?: string;
			password?: string;
			clientId?: string;
			clientSecret?: string;
			redirectUri?: string;
			accessToken?: string;
			refreshToken?: string;
		};
		fieldMergeRules?: Array<{
			field: 'description' | 'completed' | 'dueDate' | 'startDate' | 'priority' | 'status' | 'tags';
			winner: 'local' | 'remote' | 'newest';
		}>;
	};
}

/**
 * 构建器配置接口
 */
export interface BuilderConfig {
	containerEl: HTMLElement;
	plugin: GanttCalendarPlugin;
	onRefreshSettings?: () => void; // 刷新设置面板的回调函数
}

/**
 * 颜色设置配置接口
 */
export interface ColorSettingConfig {
	name: string;
	description: string;
	settingKey: keyof GanttCalendarSettings;
}

/**
 * 颜色选择器配置接口
 */
export interface ColorPickerConfig {
	container: HTMLElement;
	name: string;
	description: string;
	currentColor: string;
	presetColors: string[];
	onColorChange: (color: string) => Promise<void> | void;
}

/**
 * 热力图色卡配置接口
 */
export interface HeatmapPalette {
	key: 'blue' | 'green' | 'red' | 'purple' | 'orange' | 'cyan' | 'pink' | 'yellow';
	label: string;
	colors: string[];
}
