/**
 * TaskRepository - 任务仓库
 *
 * 任务仓库是数据层的核心组件，负责：
 * - 管理数据源
 * - 维护任务缓存
 * - 提供高性能查询接口
 * - 处理数据源变化事件
 *
 * 设计模式：仓库模式（Repository Pattern）
 * 直接使用 GCTask 作为内部格式，避免无意义的转换。
 * 任务通过 UUID (task.id) 进行唯一标识。
 */

import { EventBus } from './EventBus';
import type { GCTask } from '../types';
import {
	DataSourceChanges,
	QueryOptions
} from './types';
import { IDataSource } from './IDataSource';
import { Logger } from '../utils/logger';

export class TaskRepository {
	private dataSources: Map<string, IDataSource> = new Map();
	private taskCache: Map<string, GCTask> = new Map();
	private eventBus: EventBus;

	constructor(eventBus: EventBus) {
		this.eventBus = eventBus;
	}

	/**
	 * 注册数据源
	 * @param source - 数据源实例
	 */
	registerDataSource(source: IDataSource): void {
		this.dataSources.set(source.sourceId, source);
		source.onChange(async (changes) => {
			await this.handleSourceChanges(source.sourceId, changes);
		});
	}

	/**
	 * 获取所有任务
	 * @param options - 查询选项
	 * @returns 任务列表
	 */
	getAllTasks(options?: QueryOptions): GCTask[] {
		const tasks = Array.from(this.taskCache.values());
		return this.filterTasks(tasks, options);
	}

	/**
	 * 根据ID获取任务
	 * @param taskId - 任务ID
	 * @returns 任务对象或undefined
	 */
	getTaskById(taskId: string): GCTask | undefined {
		return this.taskCache.get(taskId);
	}

	/**
	 * 根据日期范围获取任务
	 * @param start - 开始日期
	 * @param end - 结束日期
	 * @param dateField - 日期字段名
	 * @returns 任务列表
	 */
	getTasksByDateRange(
		start: Date,
		end: Date,
		dateField: keyof GCTask = 'dueDate'
	): GCTask[] {
		return Array.from(this.taskCache.values()).filter(task => {
			const date = task[dateField] as Date | undefined;
			return date && date >= start && date <= end;
		});
	}

	/**
	 * 根据任务类型获取任务
	 * @param type - 任务类型
	 * @returns 任务列表
	 */
	getTasksByType(type: 'todo' | 'reminder'): GCTask[] {
		return Array.from(this.taskCache.values()).filter(task => task.type === type);
	}

	/**
	 * 获取直接子任务
	 * @param parentId - 父任务ID
	 * @returns 按 childIds 顺序排列的子任务列表
	 */
	getChildTasks(parentId: string): GCTask[] {
		const parent = this.taskCache.get(parentId);
		if (!parent?.childIds?.length) return [];
		return parent.childIds
			.map(id => this.taskCache.get(id))
			.filter((t): t is GCTask => t !== undefined);
	}

	/**
	 * 获取所有顶层任务（无 parentId）
	 * @param options - 查询选项
	 * @returns 顶层任务列表
	 */
	getRootTasks(options?: QueryOptions): GCTask[] {
		const tasks = Array.from(this.taskCache.values()).filter(t => !t.parentId);
		return this.filterTasks(tasks, options);
	}

	/**
	 * 获取任务及其所有后代（扁平列表）
	 * @param taskId - 任务ID
	 * @returns 包含自身和所有后代的扁平列表
	 */
	getTaskTree(taskId: string): GCTask[] {
		const result: GCTask[] = [];
		const task = this.taskCache.get(taskId);
		if (!task) return result;
		result.push(task);
		if (task.childIds?.length) {
			for (const childId of task.childIds) {
				result.push(...this.getTaskTree(childId));
			}
		}
		return result;
	}

	/**
	 * 获取任务统计信息
	 * @returns 统计信息
	 */
	getStats(): {
		totalTasks: number;
		dataSources: number;
		todoCount: number;
		reminderCount: number;
	} {
		let todoCount = 0;
		let reminderCount = 0;
		for (const task of this.taskCache.values()) {
			if (task.type === 'todo') todoCount++;
			else if (task.type === 'reminder') reminderCount++;
		}
		return {
			totalTasks: this.taskCache.size,
			dataSources: this.dataSources.size,
			todoCount,
			reminderCount,
		};
	}

	/**
	 * 过滤任务
	 * @param tasks - 任务列表
	 * @param options - 查询选项
	 * @returns 过滤后的任务列表
	 */
	private filterTasks(tasks: GCTask[], options?: QueryOptions): GCTask[] {
		if (!options) return tasks;

		let filtered = tasks;

		if (options.status?.length) {
			filtered = filtered.filter(t => options.status!.includes(t.status as any));
		}

		if (options.priority?.length) {
			filtered = filtered.filter(t => options.priority!.includes(t.priority as any));
		}

		if (options.tags?.length) {
			filtered = filtered.filter(t =>
				options.tags!.some(tag => t.tags?.includes(tag))
			);
		}

		if (options.type?.length) {
			filtered = filtered.filter(t => options.type!.includes(t.type));
		}

		if (options.archived !== undefined) {
			filtered = filtered.filter(t => t.archived === options.archived);
		}

		if (options.dateRange) {
			const fieldMap: Record<keyof import('./types').TaskDates, keyof GCTask> = {
				created: 'createdDate',
				start: 'startDate',
				due: 'dueDate',
				completed: 'completionDate',
				cancelled: 'cancelledDate'
			};
			const gcField = fieldMap[options.dateRange.field];

			filtered = filtered.filter(t => {
				const date = t[gcField] as Date | undefined;
				return date && date >= options.dateRange!.start && date <= options.dateRange!.end;
			});
		}

		// 子任务相关筛选
		if (options.rootOnly) {
			filtered = filtered.filter(t => !t.parentId);
		}
		if (options.parentId) {
			filtered = filtered.filter(t => t.parentId === options.parentId);
		}

		return filtered;
	}

	/**
	 * 处理数据源变化
	 * @param sourceId - 数据源ID
	 * @param changes - 变化详情
	 */
	private async handleSourceChanges(
		sourceId: string,
		changes: DataSourceChanges
	): Promise<void> {
		const startTime = performance.now();
		Logger.debug('TaskRepository', `Processing changes from ${sourceId}:`, {
			created: changes.created.length,
			updated: changes.updated.length,
			deleted: changes.deleted.length,
			deletedIds: changes.deletedIds?.length || 0
		});

		// 处理新增任务
		for (const task of changes.created) {
			this.taskCache.set(task.id, task);
			this.eventBus.emit('task:created', { task });
		}

		// 处理更新任务
		for (const { id, changes: taskChanges, task: newTask } of changes.updated) {
			let updatedTask: GCTask | undefined;

			if (newTask) {
				updatedTask = newTask;
				this.taskCache.set(id, newTask);
			} else {
				const task = this.taskCache.get(id);
				if (task) {
					updatedTask = { ...task, ...taskChanges };
					this.taskCache.set(id, updatedTask);
				}
			}

			if (updatedTask) {
				this.eventBus.emit('task:updated', { task: updatedTask });
			}
		}

		// 处理删除任务
		for (const task of changes.deleted) {
			this.taskCache.delete(task.id);
			this.eventBus.emit('task:deleted', { taskId: task.id });
		}

		// 处理按ID批量删除
		if (changes.deletedIds) {
			for (const taskId of changes.deletedIds) {
				this.taskCache.delete(taskId);
				this.eventBus.emit('task:deleted', { taskId });
			}
		}

		const elapsed = performance.now() - startTime;
		Logger.debug('TaskRepository', `Changes processed in ${elapsed.toFixed(2)}ms`);
	}

	/**
	 * 清空缓存
	 * 【注意】不清空 eventBus，因为 eventBus 的所有权属于 TaskStore
	 */
	clear(): void {
		this.taskCache.clear();
	}
}
