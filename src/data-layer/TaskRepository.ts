/**
 * TaskRepository - 任务仓库
 *
 * 任务仓库是数据层的核心组件，负责：
 * - 管理多个数据源（Markdown、飞书等）
 * - 维护统一任务缓存
 * - 提供高性能查询接口
 * - 处理数据源变化事件
 *
 * 设计模式：仓库模式（Repository Pattern）
 */

import { EventBus } from './EventBus';
import {
	DataSourceChanges,
	ExternalTask,
	NormalizedTask,
	QueryOptions
} from './types';
import { IDataSource } from './IDataSource';

export class TaskRepository {
	private dataSources: Map<string, IDataSource> = new Map();
	private taskCache: Map<string, NormalizedTask> = new Map();
	private fileIndex: Map<string, Set<string>> = new Map();
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
	getAllTasks(options?: QueryOptions): NormalizedTask[] {
		const tasks = Array.from(this.taskCache.values());
		return this.filterTasks(tasks, options);
	}

	/**
	 * 根据日期范围获取任务
	 * @param start - 开始日期
	 * @param end - 结束日期
	 * @param dateField - 日期字段
	 * @returns 任务列表
	 */
	getTasksByDateRange(
		start: Date,
		end: Date,
		dateField: keyof import('./types').TaskDates = 'due'
	): NormalizedTask[] {
		return Array.from(this.taskCache.values()).filter(task => {
			const date = task.dates[dateField];
			return date && date >= start && date <= end;
		});
	}

	/**
	 * 根据文件路径获取任务
	 * @param filePath - 文件路径
	 * @returns 任务列表
	 */
	getTasksByFilePath(filePath: string): NormalizedTask[] {
		const taskIds = this.fileIndex.get(filePath) || new Set();
		return Array.from(taskIds)
			.map(id => this.taskCache.get(id)!)
			.filter(Boolean);
	}

	/**
	 * 获取任务统计信息
	 * @returns 统计信息
	 */
	getStats(): {
		totalTasks: number;
		dataSources: number;
		totalFiles: number;
	} {
		return {
			totalTasks: this.taskCache.size,
			dataSources: this.dataSources.size,
			totalFiles: this.fileIndex.size
		};
	}

	/**
	 * 过滤任务
	 * @param tasks - 任务列表
	 * @param options - 查询选项
	 * @returns 过滤后的任务列表
	 */
	private filterTasks(tasks: NormalizedTask[], options?: QueryOptions): NormalizedTask[] {
		if (!options) return tasks;

		let filtered = tasks;

		if (options.status?.length) {
			filtered = filtered.filter(t => options.status!.includes(t.status));
		}

		if (options.priority?.length) {
			filtered = filtered.filter(t => options.priority!.includes(t.priority));
		}

		if (options.tags?.length) {
			filtered = filtered.filter(t =>
				options.tags!.some(tag => t.tags.includes(tag))
			);
		}

		if (options.dateRange) {
			filtered = filtered.filter(t => {
				const date = t.dates[options.dateRange!.field];
				return date && date >= options.dateRange!.start && date <= options.dateRange!.end;
			});
		}

		if (options.sources?.length) {
			filtered = filtered.filter(t => options.sources!.includes(t.sourceId));
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
		// 处理新增任务
		for (const task of changes.created) {
			const normalized = this.externalToNormalized(task);
			this.taskCache.set(normalized.id, normalized);

			// 更新文件索引
			if (normalized.filePath) {
				if (!this.fileIndex.has(normalized.filePath)) {
					this.fileIndex.set(normalized.filePath, new Set());
				}
				this.fileIndex.get(normalized.filePath)!.add(normalized.id);
			}

			// 发布事件
			this.eventBus.emit('task:created', { task: normalized });
		}

		// 处理更新任务
		for (const { id, changes: taskChanges } of changes.updated) {
			const task = this.taskCache.get(id);
			if (task) {
				const updated = { ...task, ...taskChanges };
				this.taskCache.set(id, updated);

				// 发布事件
				this.eventBus.emit('task:updated', { task: updated });
			}
		}

		// 处理删除任务
		for (const task of changes.deleted) {
			this.taskCache.delete(task.id);

			// 更新文件索引
			if (task.metadata?.filePath) {
				const filePath = task.metadata.filePath as string;
				const taskIds = this.fileIndex.get(filePath);
				if (taskIds) {
					taskIds.delete(task.id);
					if (taskIds.size === 0) {
						this.fileIndex.delete(filePath);
					}
				}
			}

			// 发布事件
			this.eventBus.emit('task:deleted', { taskId: task.id });
		}
	}

	/**
	 * 将外部任务格式转换为内部格式
	 * @param external - 外部任务
	 * @returns 规范化任务
	 */
	private externalToNormalized(external: ExternalTask): NormalizedTask {
		return {
			id: external.id,
			sourceId: external.sourceId,
			externalId: external.id,
			title: external.title,
			description: external.description,
			status: external.status,
			priority: external.priority,
			tags: external.tags,
			dates: external.dates,
			version: external.version,
			createdAt: external.createdAt,
			updatedAt: external.updatedAt,
			syncInfo: external.syncInfo,
			filePath: external.metadata?.filePath,
			lineNumber: external.metadata?.lineNumber,
			metadata: external.metadata
		};
	}

	/**
	 * 清空缓存
	 */
	clear(): void {
		this.taskCache.clear();
		this.fileIndex.clear();
		this.eventBus.clear();
	}
}
