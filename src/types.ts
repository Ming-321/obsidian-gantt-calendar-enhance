// 日历视图类型定义
import { TaskStatusType } from './tasks/taskStatus';

export type CalendarViewType = 'month' | 'week' | 'task';

/**
 * 任务类型
 * - todo: 待办事项 — 截止日前持续显示，需手动完成，可延期
 * - reminder: 提醒 — 仅在指定日期显示，到期自动完成并归档
 */
export type TaskType = 'todo' | 'reminder';

/**
 * 任务优先级（六级）
 * highest: 最高 | high: 高 | medium: 中 | normal: 普通 | low: 低 | lowest: 最低
 */
export type TaskPriority = 'highest' | 'high' | 'medium' | 'normal' | 'low' | 'lowest';

// 甘特图时间颗粒度类型（仅支持周视图）
export type GanttTimeGranularity = 'week';

export interface CalendarDate {
	year: number;           // 年份（如：2025）
	month: number;          // 月份（1-12）
	day: number;            // 日（1-31）
	date: Date;             // JavaScript Date 对象
}

/**
 * 日历日期详细信息
 *
 * 表示日历中的单个日期，包含公历、农历、节日等完整信息。
 * 用于月视图、周视图的日期渲染。
 *
 * 功能特性：
 * - 区分当前月和非当前月日期
 * - 标记今天以便高亮显示
 * - 集成中国农历显示
 * - 支持阳历节日、农历节日、节气三种节日类型
 */
export interface CalendarDay {
	date: Date;                          // 完整的日期对象
	day: number;                         // 月中的日期（1-31）
	isCurrentMonth: boolean;             // 是否属于当前显示的月份
	isToday: boolean;                    // 是否是今天
	weekday: number;                     // 星期几（0-6，0=周日，1=周一，...，6=周六）
	lunarText?: string;                  // 农历显示文本（如："正月十五"）
	festival?: string;                   // 节日名称（如："春节"、"中秋"）
	festivalType?: 'solar' | 'lunar' | 'solarTerm';  // 节日类型：阳历节日、农历节日、节气
}

/**
 * 日历周数据结构
 *
 * 表示日历中的一周，包含7天的完整数据和周信息。
 * 用于周视图渲染和月视图的周分组显示。
 */
export interface CalendarWeek {
	weekNumber: number;      // 周数（1-52/53），基于 ISO 周数标准
	days: CalendarDay[];     // 该周的7天数据（周日到周六或周一到周日）
	startDate: Date;         // 周起始日期
	endDate: Date;           // 周结束日期
}

/**
 * 日历月数据结构
 *
 * 表示一个完整月份的日历数据，包含所有天数和按周分组的数据。
 * 由 calendarGenerator.ts 的 generateMonthCalendar() 函数生成。
 *
 * 数据组织：
 * - 总是包含42天（6周 × 7天）
 * - 包含上个月末尾、当前月、下个月开头以补全日历网格
 * - 同时提供扁平的 days 数组和分组的 weeks 数组
 */
export interface CalendarMonth {
	year: number;            // 年份（如：2025）
	month: number;           // 月份（1-12）
	weeks: CalendarWeek[];   // 按周分组的数据（6周）
	days: CalendarDay[];     // 所有日期的扁平数组（42天）
}

/**
 * 全局任务数据结构 (GC = GanttCalendar)
 *
 * 表示插件管理的任务信息，所有视图通用的任务格式。
 * 任务分为两种类型：
 * - todo（待办）：截止日前持续显示，需手动完成，可延期
 * - reminder（提醒）：仅在指定日期显示，到期自动完成并归档
 *
 * 存储在专用 JSON 文件中，不再依赖 Markdown 解析。
 */
export interface GCTask {
	id: string;                    // UUID，唯一标识
	type: TaskType;                // 任务类型：待办 | 提醒
	description: string;           // 任务标题/描述（用于显示）
	detail?: string;               // 详细说明（可选）
	completed: boolean;            // 任务是否已完成
	cancelled?: boolean;           // 任务是否已取消
	status?: TaskStatusType;       // 任务状态类型
	priority: TaskPriority;        // 优先级：highest, high, medium, normal, low, lowest
	tags?: string[];               // 任务标签列表
	createdDate?: Date;            // 创建日期
	startDate?: Date;              // 开始日期（默认为创建时间）
	dueDate?: Date;                // 截止日期 / 提醒日期
	cancelledDate?: Date;          // 取消日期
	completionDate?: Date;         // 完成日期
	time?: string;                 // 可选精确时间 "HH:mm"
	repeat?: string;               // 周期规则，如 "every day", "every week on Monday"
	archived: boolean;             // 归档标记（提醒到期后自动归档）
	// 元数据
	sourceId?: string;             // 数据源特定 ID
	lastModified?: Date;           // 最后修改时间
}

/**
 * 任务排序字段类型
 */
export type SortField =
	| 'priority'
	| 'description'
	| 'createdDate'
	| 'startDate'
	| 'dueDate'
	| 'completionDate';

/**
 * 排序顺序类型
 */
export type SortOrder = 'asc' | 'desc';

/**
 * 任务排序状态
 */
export interface SortState {
	field: SortField;
	order: SortOrder;
}

/**
 * 默认排序状态
 */
export const DEFAULT_SORT_STATE: SortState = {
	field: 'dueDate',
	order: 'asc'
};

/**
 * 标签筛选组合器类型
 * - AND: 交集模式，任务必须包含所有选中标签
 * - OR: 并集模式，任务包含任一选中标签即可
 * - NOT: 排除模式，排除包含任一选中标签的任务
 */
export type TagFilterOperator = 'AND' | 'OR' | 'NOT';

/**
 * 标签筛选状态
 */
export interface TagFilterState {
	/** 选中的标签列表 */
	selectedTags: string[];
	/** 组合器：AND（交集）/ OR（并集）/ NOT（排除） */
	operator: TagFilterOperator;
}

/**
 * 默认标签筛选状态
 */
export const DEFAULT_TAG_FILTER_STATE: TagFilterState = {
	selectedTags: [],
	operator: 'OR'
};

/**
 * 任务状态筛选状态
 */
export interface StatusFilterState {
	/** 选中的状态 key 列表（空数组表示显示所有） */
	selectedStatuses: string[];
}

/** 默认状态筛选状态（默认只显示待办任务） */
export const DEFAULT_STATUS_FILTER_STATE: StatusFilterState = {
	selectedStatuses: ['todo']
};
