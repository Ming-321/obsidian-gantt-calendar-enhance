/**
 * MarkdownDataSource - Markdown 数据源
 *
 * 适配现有的 Markdown 文件解析功能，将其封装为数据源接口。
 *
 * 职责：
 * - 扫描 Markdown 文件并解析任务
 * - 监听文件变化（modify、delete、rename）
 * - 检测任务变化并发布事件
 * - 复用现有的 parseTasksFromListItems 函数
 */

import { App, TFile, TAbstractFile } from 'obsidian';
import { parseTasksFromListItems } from '../tasks/taskParser/main';
import { areTasksEqual } from '../tasks/taskUtils';
import { EventBus } from './EventBus';
import type { GCTask } from '../types';
import {
	DataSourceChanges,
	DataSourceConfig,
	ExternalTask,
	TaskChanges,
	TaskStatus,
	Priority
} from './types';
import { IDataSource, ChangeEventHandler } from './IDataSource';

/**
 * Markdown 文件缓存
 */
interface MarkdownFileCache {
	tasks: GCTask[];
	lastModified: number;
}

/**
 * Markdown 数据源
 */
export class MarkdownDataSource implements IDataSource {
	readonly sourceId = 'markdown';
	readonly sourceName = 'Markdown Files';
	readonly isReadOnly = false;

	private app: App;
	private config: DataSourceConfig;
	private cache: Map<string, MarkdownFileCache> = new Map();
	private eventBus: EventBus;
	private changeHandler?: ChangeEventHandler;

	constructor(app: App, eventBus: EventBus, config: DataSourceConfig) {
		this.app = app;
		this.eventBus = eventBus;
		this.config = config;
	}

	/**
	 * 初始化数据源
	 */
	async initialize(config: DataSourceConfig): Promise<void> {
		this.config = config;
		await this.scanAllFiles();
		this.setupFileWatchers();

		// 通知数据源已初始化，发送所有任务
		await this.notifyInitialTasks();
	}

	/**
	 * 通知初始任务（用于初始化时）
	 */
	private async notifyInitialTasks(): Promise<void> {
		if (!this.changeHandler) {
			return;
		}

		const allTasks: ExternalTask[] = [];
		for (const [filePath, fileCache] of this.cache.entries()) {
			for (const task of fileCache.tasks) {
				allTasks.push(this.toExternalTask(task));
			}
		}

		this.changeHandler({
			sourceId: this.sourceId,
			created: allTasks,
			updated: [],
			deleted: []
		});
	}

	/**
	 * 获取所有任务
	 */
	async getTasks(): Promise<ExternalTask[]> {
		const tasks: ExternalTask[] = [];
		for (const [filePath, fileCache] of this.cache.entries()) {
			for (const task of fileCache.tasks) {
				tasks.push(this.toExternalTask(task));
			}
		}
		return tasks;
	}

	/**
	 * 监听数据变化
	 */
	onChange(handler: ChangeEventHandler): void {
		this.changeHandler = handler;
	}

	/**
	 * 创建任务（暂不实现）
	 */
	async createTask(task: ExternalTask): Promise<string> {
		throw new Error('Creating tasks directly in Markdown files is not yet supported');
	}

	/**
	 * 更新任务（暂不实现）
	 */
	async updateTask(taskId: string, changes: TaskChanges): Promise<void> {
		throw new Error('Updating tasks directly in Markdown files is not yet supported');
	}

	/**
	 * 删除任务（暂不实现）
	 */
	async deleteTask(taskId: string): Promise<void> {
		throw new Error('Deleting tasks directly in Markdown files is not yet supported');
	}

	/**
	 * 获取同步状态
	 */
	async getSyncStatus(): Promise<{
		lastSyncAt?: Date;
		syncDirection: 'bidirectional' | 'import-only' | 'export-only';
		conflictResolution: 'local-win' | 'remote-win' | 'manual';
	}> {
		return {
			syncDirection: 'import-only',
			conflictResolution: 'local-win'
		};
	}

	/**
	 * 销毁数据源
	 */
	destroy(): void {
		this.cache.clear();
	}

	/**
	 * 扫描所有 Markdown 文件
	 */
	private async scanAllFiles(): Promise<void> {
		const markdownFiles = this.app.vault.getMarkdownFiles();
		console.log('[MarkdownDataSource] Scanning', markdownFiles.length, 'markdown files');

		for (const file of markdownFiles) {
			await this.updateFileCache(file.path);
		}
	}

	/**
	 * 设置文件监听
	 */
	private setupFileWatchers(): void {
		// 监听文件修改
		this.app.vault.on('modify', async (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				const previousCache = this.cache.get(file.path);
				await this.updateFileCache(file.path);

				if (this.changeHandler && previousCache) {
					const changes = this.detectChanges(previousCache, this.cache.get(file.path)!);
					if (changes) {
						this.changeHandler(changes);
					}
				}
			}
		});

		// 监听文件删除
		this.app.vault.on('delete', (file) => {
			if (file instanceof TFile && file.extension === 'md') {
				const oldCache = this.cache.get(file.path);
				this.cache.delete(file.path);

				if (this.changeHandler && oldCache) {
					this.changeHandler({
						sourceId: this.sourceId,
						created: [],
						updated: [],
						deleted: oldCache.tasks.map(t => this.toExternalTask(t))
					});
				}
			}
		});

		// 监听文件重命名
		this.app.vault.on('rename', (file, oldPath) => {
			if (file instanceof TFile && file.extension === 'md') {
				const oldCache = this.cache.get(oldPath);
				this.cache.delete(oldPath);

				if (oldCache) {
					// 更新缓存中的文件路径
					const updatedCache: MarkdownFileCache = {
						tasks: oldCache.tasks.map(task => ({
							...task,
							filePath: file.path,
							fileName: file.name
						})),
						lastModified: file.stat.mtime
					};
					this.cache.set(file.path, updatedCache);

					// 发布变化事件
					if (this.changeHandler) {
						this.changeHandler({
							sourceId: this.sourceId,
							created: [],
							updated: [],
							deleted: []
						});
					}
				}
			}
		});
	}

	/**
	 * 更新单个文件的缓存
	 */
	private async updateFileCache(filePath: string): Promise<{ taskCount: number } | null> {
		const file = this.app.vault.getAbstractFileByPath(filePath);
		if (!(file instanceof TFile)) {
			return null;
		}

		const fileCache = this.app.metadataCache.getFileCache(file);
		const listItems = fileCache?.listItems;

		if (!listItems || listItems.length === 0) {
			if (this.cache.has(filePath)) {
				this.cache.delete(filePath);
			}
			return { taskCount: 0 };
		}

		const content = await this.app.vault.read(file);
		const lines = content.split('\n');

		const tasks = parseTasksFromListItems(
			file,
			lines,
			listItems,
			this.config.enabledFormats as any || ['tasks', 'dataview'],
			this.config.globalFilter
		);

		this.cache.set(filePath, {
			tasks,
			lastModified: file.stat.mtime
		});

		return { taskCount: tasks.length };
	}

	/**
	 * 检测文件变化
	 */
	private detectChanges(
		oldCache: MarkdownFileCache,
		newCache: MarkdownFileCache
	): DataSourceChanges | null {
		const oldMap = new Map(oldCache.tasks.map(t => [this.getTaskId(t), t]));
		const newMap = new Map(newCache.tasks.map(t => [this.getTaskId(t), t]));

		const changes: DataSourceChanges = {
			sourceId: this.sourceId,
			created: [],
			updated: [],
			deleted: []
		};

		// 检测新增和修改
		for (const [id, task] of newMap) {
			if (!oldMap.has(id)) {
				changes.created.push(this.toExternalTask(task));
			} else if (!areTasksEqual([oldMap.get(id)!], [task])) {
				changes.updated.push({
					id,
					changes: this.diffTasks(oldMap.get(id)!, task)
				});
			}
		}

		// 检测删除
		for (const [id, task] of oldMap) {
			if (!newMap.has(id)) {
				changes.deleted.push(this.toExternalTask(task));
			}
		}

		if (changes.created.length === 0 &&
			changes.updated.length === 0 &&
			changes.deleted.length === 0) {
			return null;
		}

		return changes;
	}

	/**
	 * 生成任务ID
	 */
	private getTaskId(task: GCTask): string {
		return `${task.filePath}:${task.lineNumber}`;
	}

	/**
	 * 将 GCTask 转换为 ExternalTask
	 */
	private toExternalTask(task: GCTask): ExternalTask {
		return {
			id: this.getTaskId(task),
			sourceId: this.sourceId,
			title: task.description,
			description: task.content,
			status: this.mapStatus(task),
			priority: this.mapPriority(task.priority),
			tags: task.tags || [],
			dates: {
				created: task.createdDate,
				start: task.startDate,
				scheduled: task.scheduledDate,
				due: task.dueDate,
				completed: task.completionDate,
				cancelled: task.cancelledDate
			},
			metadata: {
				filePath: task.filePath,
				lineNumber: task.lineNumber,
				format: task.format
			},
			version: 1,
			updatedAt: new Date(),
			createdAt: task.createdDate || new Date()
		};
	}

	/**
	 * 映射任务状态
	 */
	private mapStatus(task: GCTask): TaskStatus {
		if (task.completed) return 'completed';
		if (task.cancelled) return 'cancelled';
		return 'todo';
	}

	/**
	 * 映射优先级
	 */
	private mapPriority(priority: string): Priority {
		const map: Record<string, Priority> = {
			'highest': 'highest',
			'high': 'high',
			'medium': 'medium',
			'normal': 'normal',
			'low': 'low',
			'lowest': 'lowest'
		};
		return map[priority] || 'normal';
	}

	/**
	 * 计算任务差异
	 */
	private diffTasks(oldTask: GCTask, newTask: GCTask): TaskChanges {
		const changes: TaskChanges = {};

		if (oldTask.description !== newTask.description) {
			changes.title = newTask.description;
		}

		if (oldTask.completed !== newTask.completed) {
			changes.status = this.mapStatus(newTask);
		}

		if (oldTask.priority !== newTask.priority) {
			changes.priority = this.mapPriority(newTask.priority);
		}

		if (oldTask.dueDate !== newTask.dueDate) {
			changes.dates = { due: newTask.dueDate };
		}

		return changes;
	}
}
