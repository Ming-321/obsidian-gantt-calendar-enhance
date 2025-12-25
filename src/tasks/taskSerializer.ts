import { GanttTask } from '../types';

/**
 * 任务更新参数
 */
export interface TaskUpdates {
	completed?: boolean;
	priority?: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'normal';
	createdDate?: Date | null;
	startDate?: Date | null;
	scheduledDate?: Date | null;
	dueDate?: Date | null;
	cancelledDate?: Date | null;
	completionDate?: Date | null;
	content?: string;
	globalFilter?: string;
}

/**
 * 合并后的任务数据
 */
interface MergedTask {
	completed: boolean;
	priority?: string;
	description: string;
	createdDate?: Date;
	startDate?: Date;
	scheduledDate?: Date;
	dueDate?: Date;
	cancelledDate?: Date;
	completionDate?: Date;
}

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}

/**
 * 获取日期字段的 emoji（Tasks 格式）
 */
function getDateEmoji(field: keyof MergedTask): string {
	const map: Record<string, string> = {
		createdDate: '➕',
		startDate: '🛫',
		scheduledDate: '⏳',
		dueDate: '📅',
		cancelledDate: '❌',
		completionDate: '✅',
	};
	return map[field] || '';
}

/**
 * 获取日期字段名（Dataview 格式）
 */
function getDataviewField(field: keyof MergedTask): string {
	const map: Record<string, string> = {
		createdDate: 'created',
		startDate: 'start',
		scheduledDate: 'scheduled',
		dueDate: 'due',
		cancelledDate: 'cancelled',
		completionDate: 'completion',
	};
	return map[field] || '';
}

/**
 * 获取优先级 emoji（Tasks 格式）
 */
function getPriorityEmoji(priority: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'normal'): string {
	const map: Record<string, string> = {
		highest: '🔺',
		high: '⏫',
		medium: '🔼',
		low: '🔽',
		lowest: '⏬',
		normal: '',
	};
	return map[priority] || '';
}

/**
 * 序列化任务为文本行
 *
 * 按照固定顺序构建任务行：
 * Tasks 格式: [复选框] [全局过滤] [优先级] [描述] [创建] [开始] [计划] [截止] [取消] [完成]
 * Dataview 格式: [复选框] [全局过滤] [描述] [priority] [created] [start] [scheduled] [due] [cancelled] [completion]
 *
 * @param task 原始任务对象
 * @param updates 更新参数
 * @param format 格式 ('tasks' | 'dataview')
 * @param globalFilter 全局过滤器
 * @returns 序列化后的任务行文本
 */
export function serializeTask(
	task: GanttTask,
	updates: TaskUpdates,
	format: 'tasks' | 'dataview',
	globalFilter?: string
): string {
	// 1. 合并原始数据和更新数据
	// 注意：updates 中的日期字段可能是 null（表示清除），task 中的日期字段是 undefined（表示不存在）
	const merged: MergedTask = {
		completed: updates.completed !== undefined ? updates.completed : task.completed,
		priority: updates.priority !== undefined ? getPriorityEmoji(updates.priority) : task.priority,
		description: updates.content !== undefined ? updates.content : task.description,
		// 处理日期字段：undefined 使用原始值，null 转为 undefined（表示清除）
		createdDate: updates.createdDate !== undefined ? (updates.createdDate || undefined) : task.createdDate,
		startDate: updates.startDate !== undefined ? (updates.startDate || undefined) : task.startDate,
		scheduledDate: updates.scheduledDate !== undefined ? (updates.scheduledDate || undefined) : task.scheduledDate,
		dueDate: updates.dueDate !== undefined ? (updates.dueDate || undefined) : task.dueDate,
		cancelledDate: updates.cancelledDate !== undefined ? (updates.cancelledDate || undefined) : task.cancelledDate,
		completionDate: updates.completionDate !== undefined ? (updates.completionDate || undefined) : task.completionDate,
	};

	// 2. 构建任务行的各个部分
	const parts: string[] = [];

	// 复选框
	parts.push(merged.completed ? '[x]' : '[ ]');

	// 全局过滤器
	if (globalFilter) {
		parts.push(globalFilter);
	}

	// 任务描述
	if (merged.description) {
		parts.push(merged.description);
	}

	// 优先级（放在描述后）
	if (format === 'tasks' && merged.priority && merged.priority !== 'none' && merged.priority !== 'normal') {
		parts.push(merged.priority);
	}

	// 优先级（Dataview 格式）
	if (format === 'dataview' && updates.priority !== undefined && updates.priority !== 'normal') {
		parts.push(`[priority:: ${updates.priority}]`);
	}

	// 日期字段（固定顺序）
	const dateOrder: Array<keyof MergedTask> = [
		'createdDate',
		'startDate',
		'scheduledDate',
		'dueDate',
		'cancelledDate',
		'completionDate'
	];

	for (const field of dateOrder) {
		const date = merged[field];

		// 只有当 date 是 Date 对象时才输出（null 和 undefined 都不输出）
		if (date instanceof Date) {
			if (format === 'tasks') {
				parts.push(`${getDateEmoji(field)} ${formatDate(date)}`);
			} else {
				parts.push(`[${getDataviewField(field)}:: ${formatDate(date)}]`);
			}
		}
	}

	return parts.join(' ');
}
