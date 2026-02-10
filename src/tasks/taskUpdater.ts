/**
 * 任务更新模块
 *
 * 通过 TaskStore 的 JSON 数据源更新任务属性。
 * 不再操作 Markdown 文件。
 */
import { App } from 'obsidian';
import { GCTask } from '../types';
import { TaskChanges } from '../data-layer/types';
import { Logger } from '../utils/logger';

/**
 * TaskUpdates 接口 - 定义可更新的任务属性
 * null 值表示清除该字段
 */
export interface TaskUpdates {
	description?: string;
	detail?: string;
	completed?: boolean;
	cancelled?: boolean;
	status?: string;
	priority?: string;
	tags?: string[];
	createdDate?: Date | null;
	startDate?: Date | null;
	dueDate?: Date | null;
	cancelledDate?: Date | null;
	completionDate?: Date | null;
	repeat?: string | null;
	archived?: boolean;
	// 子任务关系
	parentId?: string | null;
	childIds?: string[];
	depth?: number;
}

/**
 * 将 TaskUpdates 转换为 TaskChanges（用于数据层）
 */
function updatesToChanges(updates: TaskUpdates): TaskChanges {
	const changes: TaskChanges = {};

	if (updates.description !== undefined) changes.description = updates.description;
	if (updates.detail !== undefined) changes.detail = updates.detail;
	if (updates.completed !== undefined) changes.completed = updates.completed;
	if (updates.cancelled !== undefined) changes.cancelled = updates.cancelled;
	if (updates.status !== undefined) changes.status = updates.status as any;
	if (updates.priority !== undefined) changes.priority = updates.priority as any;
	if (updates.tags !== undefined) changes.tags = updates.tags;
	if (updates.repeat !== undefined) changes.repeat = updates.repeat ?? undefined;
	if (updates.archived !== undefined) changes.archived = updates.archived;

	// 日期字段：null 表示清除
	if (updates.createdDate !== undefined) {
		changes.createdDate = updates.createdDate ?? undefined;
	}
	if (updates.startDate !== undefined) {
		changes.startDate = updates.startDate ?? undefined;
	}
	if (updates.dueDate !== undefined) {
		changes.dueDate = updates.dueDate ?? undefined;
	}
	if (updates.cancelledDate !== undefined) {
		changes.cancelledDate = updates.cancelledDate ?? undefined;
	}
	if (updates.completionDate !== undefined) {
		changes.completionDate = updates.completionDate ?? undefined;
	}

	// 子任务关系字段
	if (updates.parentId !== undefined) {
		changes.parentId = updates.parentId ?? undefined;
	}
	if (updates.childIds !== undefined) changes.childIds = updates.childIds;
	if (updates.depth !== undefined) changes.depth = updates.depth;

	return changes;
}

/**
 * 更新任务的完成状态
 */
export async function updateTaskCompletion(
	app: App,
	task: GCTask,
	completed: boolean,
): Promise<void> {
	// 获取 TaskStore 实例
	const plugin = (app as any).plugins?.plugins?.['gantt-calendar'];
	if (!plugin?.taskCache) {
		Logger.error('taskUpdater', 'TaskStore not available');
		return;
	}

	const updates: TaskUpdates = { completed };

	if (completed) {
		updates.completionDate = new Date();
		updates.status = 'done';
	} else {
		updates.completionDate = null;
		if (task.status === 'done') {
			updates.status = 'todo';
		}
	}

	await updateTaskProperties(app, task, updates);
}

/**
 * 更新任务的日期字段
 */
export async function updateTaskDateField(
	app: App,
	task: GCTask,
	dateFieldName: string,
	newDate: Date,
): Promise<void> {
	const updates: TaskUpdates = {
		[dateFieldName]: newDate
	};

	await updateTaskProperties(app, task, updates);
}

/**
 * 批量更新任务属性
 */
export async function updateTaskProperties(
	app: App,
	task: GCTask,
	updates: TaskUpdates,
): Promise<void> {
	const startTime = performance.now();
	Logger.debug('taskUpdater', 'updateTaskProperties called:', {
		taskId: task.id,
		description: task.description,
		updates,
	});

	// 获取 TaskStore 实例
	const plugin = (app as any).plugins?.plugins?.['gantt-calendar'];
	if (!plugin?.taskCache) {
		Logger.error('taskUpdater', 'TaskStore not available');
		return;
	}

	const changes = updatesToChanges(updates);
	await plugin.taskCache.updateTask(task.id, changes);

	const elapsed = performance.now() - startTime;
	Logger.debug('taskUpdater', `Task updated in ${elapsed.toFixed(2)}ms`);
}
