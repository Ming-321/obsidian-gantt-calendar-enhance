/**
 * JsonDataSource - JSON 文件数据源
 *
 * 从专用 JSON 文件读写任务数据，替代原有的 MarkdownDataSource。
 * 任务数据存储在 `.obsidian/plugins/obsidian-gantt-calendar/data/tasks.json`。
 *
 * 功能：
 * - 读取/写入 JSON 任务文件
 * - CRUD 操作（创建、读取、更新、删除）
 * - 自动归档过期提醒
 * - 防抖写入，避免频繁磁盘 IO
 */

import { App } from 'obsidian';
import type { GCTask } from '../types';
import { migratePriority } from '../utils/priorityUtils';
import { IDataSource, ChangeEventHandler } from './IDataSource';
import { EventBus } from './EventBus';
import {
	DataSourceConfig,
	DataSourceChanges,
	SyncStatus,
	TaskChanges
} from './types';
import { Logger } from '../utils/logger';

/**
 * JSON 文件中的任务数据格式（日期为 ISO 字符串）
 */
interface JsonTaskData {
	id: string;
	type: 'todo' | 'reminder';
	description: string;
	detail?: string;
	completed: boolean;
	cancelled?: boolean;
	status?: string;
	priority: string; // 存储层兼容旧数据，读取时做迁移
	tags?: string[];
	createdDate?: string;
	startDate?: string;
	dueDate?: string;
	cancelledDate?: string;
	completionDate?: string;
	repeat?: string;
	archived: boolean;
	sourceId?: string;
	lastModified?: string;
	// 子任务关系
	parentId?: string;
	childIds?: string[];
	depth?: number;
}

/**
 * JSON 存储文件结构
 */
interface TasksJsonFile {
	version: number;
	tasks: JsonTaskData[];
	archive: JsonTaskData[];
	lastSync?: string;
}

/**
 * 生成 UUID
 */
function generateUUID(): string {
	return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
		const r = (Math.random() * 16) | 0;
		const v = c === 'x' ? r : (r & 0x3) | 0x8;
		return v.toString(16);
	});
}

/**
 * 将 GCTask 转换为 JSON 存储格式
 */
function taskToJson(task: GCTask): JsonTaskData {
	return {
		id: task.id,
		type: task.type,
		description: task.description,
		detail: task.detail,
		completed: task.completed,
		cancelled: task.cancelled,
		status: task.status,
		priority: task.priority,
		tags: task.tags,
		createdDate: task.createdDate?.toISOString(),
		startDate: task.startDate?.toISOString(),
		dueDate: task.dueDate?.toISOString(),
		cancelledDate: task.cancelledDate?.toISOString(),
		completionDate: task.completionDate?.toISOString(),
		repeat: task.repeat,
		archived: task.archived,
		sourceId: task.sourceId,
		lastModified: task.lastModified?.toISOString(),
		parentId: task.parentId,
		childIds: task.childIds,
		depth: task.depth,
	};
}

/**
 * 将 JSON 格式转换为 GCTask
 */
function jsonToTask(json: JsonTaskData): GCTask {
	return {
		id: json.id,
		type: json.type,
		description: json.description,
		detail: json.detail,
		completed: json.completed,
		cancelled: json.cancelled,
		status: json.status as any,
		priority: (json.priority as GCTask['priority']) || 'normal',
		tags: json.tags,
		createdDate: json.createdDate ? new Date(json.createdDate) : undefined,
		startDate: json.startDate ? new Date(json.startDate) : undefined,
		dueDate: json.dueDate ? new Date(json.dueDate) : undefined,
		cancelledDate: json.cancelledDate ? new Date(json.cancelledDate) : undefined,
		completionDate: json.completionDate ? new Date(json.completionDate) : undefined,
		repeat: json.repeat,
		archived: json.archived,
		sourceId: json.sourceId,
		lastModified: json.lastModified ? new Date(json.lastModified) : undefined,
		parentId: json.parentId,
		childIds: json.childIds,
		depth: json.depth,
	};
}

/**
 * 默认空数据文件
 */
function createEmptyTasksFile(): TasksJsonFile {
	return {
		version: 1,
		tasks: [],
		archive: [],
		lastSync: new Date().toISOString(),
	};
}

export class JsonDataSource implements IDataSource {
	readonly sourceId = 'json-local';
	readonly sourceName = 'Local JSON Storage';
	readonly isReadOnly = false;

	private app: App;
	private eventBus: EventBus;
	private config: DataSourceConfig;
	private changeHandlers: ChangeEventHandler[] = [];

	// 内存中的任务数据
	private tasks: Map<string, GCTask> = new Map();
	private archivedTasks: Map<string, GCTask> = new Map();

	// 防抖写入
	private saveDebounceTimer: number | null = null;
	private readonly SAVE_DEBOUNCE_MS = 500;

	// 文件路径
	private readonly DATA_DIR = 'data';
	private readonly DATA_FILE = 'tasks.json';

	constructor(app: App, eventBus: EventBus, config: DataSourceConfig) {
		this.app = app;
		this.eventBus = eventBus;
		this.config = config;
	}

	/**
	 * 获取数据文件的完整路径
	 */
	private getDataFilePath(): string {
		const pluginDir = this.app.vault.configDir + '/plugins/obsidian-gantt-calendar';
		return `${pluginDir}/${this.DATA_DIR}/${this.DATA_FILE}`;
	}

	/**
	 * 初始化数据源 - 加载 JSON 文件
	 */
	async initialize(config: DataSourceConfig): Promise<void> {
		this.config = config;
		Logger.debug('JsonDataSource', 'Initializing...');

		const startTime = performance.now();

		// 确保数据目录存在
		await this.ensureDataDir();

		// 读取或创建数据文件
		const data = await this.readDataFile();

		// 迁移旧的六级优先级到三级（直接修改存储数据）
		const needsPriorityMigration = this.migratePriorityData(data);

		// 迁移旧的 7 状态到 4 状态 + 填充缺失的 dueDate
		const needsStatusMigration = this.migrateStatusData(data);

		const needsMigration = needsPriorityMigration || needsStatusMigration;

		// 加载活跃任务
		this.tasks.clear();
		for (const jsonTask of data.tasks) {
			const task = jsonToTask(jsonTask);
			this.tasks.set(task.id, task);
		}

		// 加载归档任务
		this.archivedTasks.clear();
		for (const jsonTask of data.archive) {
			const task = jsonToTask(jsonTask);
			this.archivedTasks.set(task.id, task);
		}

		// 如果有旧优先级数据，立即回写迁移后的数据
		if (needsMigration) {
			Logger.info('JsonDataSource', 'Migrated legacy 6-level priorities to 3-level, saving...');
			await this.saveToFile();
		}

		// 自动归档过期提醒
		await this.autoArchiveReminders();

		const elapsed = performance.now() - startTime;
		Logger.stats('JsonDataSource', `Initialized in ${elapsed.toFixed(2)}ms`, {
			activeTasks: this.tasks.size,
			archivedTasks: this.archivedTasks.size,
		});

		// 通知初始加载的任务
		const allActiveTasks = Array.from(this.tasks.values());
		if (allActiveTasks.length > 0) {
			this.notifyChanges({
				sourceId: this.sourceId,
				created: allActiveTasks,
				updated: [],
				deleted: [],
			});
		}
	}

	/**
	 * 确保数据目录存在
	 */
	private async ensureDataDir(): Promise<void> {
		const pluginDir = this.app.vault.configDir + '/plugins/obsidian-gantt-calendar';
		const dataDir = `${pluginDir}/${this.DATA_DIR}`;

		try {
			const adapter = this.app.vault.adapter;
			if (!(await adapter.exists(dataDir))) {
				await adapter.mkdir(dataDir);
				Logger.debug('JsonDataSource', `Created data directory: ${dataDir}`);
			}
		} catch (error) {
			Logger.error('JsonDataSource', 'Failed to create data directory:', error);
		}
	}

	/**
	 * 读取数据文件
	 */
	private async readDataFile(): Promise<TasksJsonFile> {
		const filePath = this.getDataFilePath();
		const adapter = this.app.vault.adapter;

		try {
			if (await adapter.exists(filePath)) {
				const content = await adapter.read(filePath);
				const data = JSON.parse(content) as TasksJsonFile;

				// 版本检查（未来可在此处添加迁移逻辑）
				if (!data.version) {
					data.version = 1;
				}

				return data;
			}
		} catch (error) {
			Logger.error('JsonDataSource', 'Failed to read data file:', error);

			// 文件存在但读取/解析失败（如 JSON 损坏）：不覆盖原文件
			// 尝试创建备份，然后返回空数据（内存中），避免覆盖损坏的原始文件
			try {
				const backupPath = filePath + '.backup';
				if (await adapter.exists(filePath)) {
					const rawContent = await adapter.read(filePath);
					await adapter.write(backupPath, rawContent);
					Logger.warn('JsonDataSource', `Corrupted data file backed up to: ${backupPath}`);
				}
			} catch (backupError) {
				Logger.error('JsonDataSource', 'Failed to backup corrupted file:', backupError);
			}

			return createEmptyTasksFile();
		}

		// 文件不存在，创建空文件
		const emptyData = createEmptyTasksFile();
		await this.writeDataFile(emptyData);
		return emptyData;
	}

	/**
	 * 迁移旧的六级优先级到三级（直接修改 JSON 数据）
	 * highest/high → high, medium/normal → normal, low/lowest → low
	 * @returns 是否有数据被修改
	 */
	private migratePriorityData(data: TasksJsonFile): boolean {
		const OLD_PRIORITIES = new Set(['highest', 'medium', 'lowest']);
		let migrated = false;

		const migrateList = (tasks: JsonTaskData[]) => {
			for (const task of tasks) {
				if (OLD_PRIORITIES.has(task.priority)) {
					task.priority = migratePriority(task.priority);
					migrated = true;
				}
			}
		};

		migrateList(data.tasks);
		migrateList(data.archive);
		return migrated;
	}

	/**
	 * 迁移旧的 7 状态到 4 状态 + 填充缺失的 dueDate
	 * - important → todo + priority: high
	 * - start → in_progress
	 * - question → todo
	 * - dueDate 为空 → 设为一个月后
	 * @returns 是否有数据被修改
	 */
	private migrateStatusData(data: TasksJsonFile): boolean {
		let migrated = false;

		const migrateList = (tasks: JsonTaskData[]) => {
			for (const task of tasks) {
				// 状态迁移
				if (task.status === 'important') {
					task.status = 'todo';
					task.priority = 'high';
					migrated = true;
				} else if (task.status === 'start') {
					task.status = 'in_progress';
					migrated = true;
				} else if (task.status === 'question') {
					task.status = 'todo';
					migrated = true;
				}

				// 填充缺失的 dueDate（设为一个月后）
				if (!task.dueDate) {
					const oneMonthLater = new Date();
					oneMonthLater.setMonth(oneMonthLater.getMonth() + 1);
					task.dueDate = oneMonthLater.toISOString();
					migrated = true;
				}
			}
		};

		migrateList(data.tasks);
		migrateList(data.archive);

		if (migrated) {
			Logger.info('JsonDataSource', 'Migrated legacy 7-status data to 4-status system');
		}

		return migrated;
	}

	/**
	 * 写入数据文件
	 */
	private async writeDataFile(data: TasksJsonFile): Promise<void> {
		const filePath = this.getDataFilePath();
		const adapter = this.app.vault.adapter;

		const content = JSON.stringify(data, null, 2);
		await adapter.write(filePath, content);
		Logger.debug('JsonDataSource', 'Data file saved');
	}

	/**
	 * 防抖保存到文件
	 */
	private scheduleSave(): void {
		if (this.saveDebounceTimer !== null) {
			clearTimeout(this.saveDebounceTimer);
		}

		this.saveDebounceTimer = window.setTimeout(async () => {
			await this.saveToFile();
			this.saveDebounceTimer = null;
		}, this.SAVE_DEBOUNCE_MS);
	}

	/**
	 * 将内存数据保存到 JSON 文件
	 */
	private async saveToFile(): Promise<void> {
		const data: TasksJsonFile = {
			version: 1,
			tasks: Array.from(this.tasks.values()).map(taskToJson),
			archive: Array.from(this.archivedTasks.values()).map(taskToJson),
			lastSync: new Date().toISOString(),
		};

		await this.writeDataFile(data);
	}

	/**
	 * 自动归档过期提醒
	 */
	private async autoArchiveReminders(): Promise<void> {
		const today = new Date();
		today.setHours(0, 0, 0, 0);

		const toArchive: GCTask[] = [];

		for (const task of this.tasks.values()) {
			if (task.type === 'reminder' && !task.archived && task.dueDate) {
				const dueDate = new Date(task.dueDate);
				dueDate.setHours(0, 0, 0, 0);

				if (dueDate < today) {
					task.completed = true;
					task.completionDate = task.dueDate;
					task.archived = true;
					task.lastModified = new Date();
					toArchive.push(task);
				}
			}
		}

		if (toArchive.length > 0) {
			Logger.debug('JsonDataSource', `Auto-archiving ${toArchive.length} expired reminders`);

			for (const task of toArchive) {
				this.tasks.delete(task.id);
				this.archivedTasks.set(task.id, task);
			}

			await this.saveToFile();
		}
	}

	/**
	 * 获取所有活跃任务
	 */
	async getTasks(): Promise<GCTask[]> {
		return Array.from(this.tasks.values());
	}

	/**
	 * 获取归档任务
	 */
	getArchivedTasks(): GCTask[] {
		return Array.from(this.archivedTasks.values());
	}

	/**
	 * 获取所有任务（含归档）
	 */
	getAllTasksIncludingArchived(): GCTask[] {
		return [
			...Array.from(this.tasks.values()),
			...Array.from(this.archivedTasks.values()),
		];
	}

	/**
	 * 监听数据变化
	 */
	onChange(handler: ChangeEventHandler): void {
		this.changeHandlers.push(handler);
	}

	/**
	 * 创建任务
	 */
	async createTask(task: GCTask): Promise<string> {
		// 确保有 ID
		if (!task.id) {
			task.id = generateUUID();
		}

		// 设置默认值
		if (!task.createdDate) {
			task.createdDate = new Date();
		}
		if (!task.startDate) {
			task.startDate = new Date();
		}
		if (!task.lastModified) {
			task.lastModified = new Date();
		}
		if (task.archived === undefined) {
			task.archived = false;
		}

		// 子任务关联
		if (task.parentId) {
			const parent = this.tasks.get(task.parentId) || this.archivedTasks.get(task.parentId);
			if (!parent) {
				Logger.warn('JsonDataSource', `Parent task not found: ${task.parentId}`);
				return '';
			}
			if ((parent.depth ?? 0) >= 2) {
				Logger.warn('JsonDataSource', `Max nesting depth reached for parent: ${task.parentId}`);
				return '';
			}
			// 设置子任务深度
			task.depth = (parent.depth ?? 0) + 1;
			// 将子任务 ID 追加到父任务的 childIds
			const updatedParent = { ...parent, childIds: [...(parent.childIds || []), task.id], lastModified: new Date() };
			if (this.tasks.has(task.parentId)) {
				this.tasks.set(task.parentId, updatedParent);
			} else {
				this.archivedTasks.set(task.parentId, updatedParent);
			}
		} else {
			if (task.depth === undefined) {
				task.depth = 0;
			}
		}

		this.tasks.set(task.id, task);
		this.scheduleSave();

		// 通知变更
		this.notifyChanges({
			sourceId: this.sourceId,
			created: [task],
			updated: [],
			deleted: [],
		});

		Logger.debug('JsonDataSource', `Task created: ${task.id} (${task.type})`);
		return task.id;
	}

	/**
	 * 更新任务
	 *
	 * @param options.skipCascade 跳过联动传播（防止递归）
	 * @param options.propagationDirection 联动方向：'down'=仅向下传播，'up'=仅向上聚合，'none'=不传播
	 */
	async updateTask(taskId: string, changes: TaskChanges, options?: {
		skipCascade?: boolean;
		propagationDirection?: 'down' | 'up' | 'none';
	}): Promise<void> {
		const task = this.tasks.get(taskId) || this.archivedTasks.get(taskId);
		if (!task) {
			Logger.warn('JsonDataSource', `Task not found for update: ${taskId}`);
			return;
		}

		// 取消保护：如果父任务已取消，拒绝子任务的状态变更
		if (changes.status && task.parentId) {
			const parent = this.tasks.get(task.parentId) || this.archivedTasks.get(task.parentId);
			if (parent?.status === 'canceled' && !options?.skipCascade) {
				Logger.warn('JsonDataSource', `Cannot change status of child task ${taskId}: parent is canceled`);
				return;
			}
		}

		// 应用变更
		const updatedTask: GCTask = { ...task, ...changes, lastModified: new Date() };

		// 判断是否需要在活跃和归档之间移动
		if (updatedTask.archived && this.tasks.has(taskId)) {
			this.tasks.delete(taskId);
			this.archivedTasks.set(taskId, updatedTask);
		} else if (!updatedTask.archived && this.archivedTasks.has(taskId)) {
			this.archivedTasks.delete(taskId);
			this.tasks.set(taskId, updatedTask);
		} else if (this.tasks.has(taskId)) {
			this.tasks.set(taskId, updatedTask);
		} else {
			this.archivedTasks.set(taskId, updatedTask);
		}

		// 4 状态联动传播
		const propagation = options?.propagationDirection;
		if (!options?.skipCascade && changes.status !== undefined && propagation !== 'none') {
			const newStatus = changes.status;
			await this.cascadeStatusChange(taskId, updatedTask, newStatus as string, propagation);
		}

		this.scheduleSave();

		// 通知变更
		this.notifyChanges({
			sourceId: this.sourceId,
			created: [],
			updated: [{ id: taskId, changes, task: updatedTask }],
			deleted: [],
		});

		Logger.debug('JsonDataSource', `Task updated: ${taskId}`);
	}

	/**
	 * 4 状态联动传播
	 *
	 * 向下传播（down）：
	 * - done → 所有后代设为 done
	 * - canceled → 所有后代设为 canceled
	 * - 从 done/canceled 退回 todo → 所有后代退回 todo
	 *
	 * 向上聚合（up）：
	 * - 子变非 todo → 父变 in_progress（如果还是 todo）
	 * - 所有子 done → 父自动 done
	 * - 某子从 done 退回 → 父退回 in_progress
	 */
	private async cascadeStatusChange(
		taskId: string,
		updatedTask: GCTask,
		newStatus: string,
		direction?: 'down' | 'up',
	): Promise<void> {
		// 向下传播（默认执行，除非明确限制为 up）
		if (direction !== 'up' && updatedTask.childIds?.length) {
			if (newStatus === 'done') {
				// 父完成 → 子全完成
				for (const childId of updatedTask.childIds) {
					const child = this.tasks.get(childId) || this.archivedTasks.get(childId);
					if (child && child.status !== 'done') {
						await this.updateTask(childId, {
							status: 'done' as any,
							completed: true,
							completionDate: new Date(),
							cancelled: false,
							cancelledDate: undefined,
						}, { skipCascade: false, propagationDirection: 'down' });
					}
				}
			} else if (newStatus === 'canceled') {
				// 父取消 → 子全取消
				for (const childId of updatedTask.childIds) {
					const child = this.tasks.get(childId) || this.archivedTasks.get(childId);
					if (child && child.status !== 'canceled') {
						await this.updateTask(childId, {
							status: 'canceled' as any,
							cancelled: true,
							cancelledDate: new Date(),
							completed: false,
							completionDate: undefined,
						}, { skipCascade: false, propagationDirection: 'down' });
					}
				}
			} else if (newStatus === 'todo') {
				// 从终态退回 → 子全退回 todo
				for (const childId of updatedTask.childIds) {
					const child = this.tasks.get(childId) || this.archivedTasks.get(childId);
					if (child && (child.status === 'done' || child.status === 'canceled')) {
						await this.updateTask(childId, {
							status: 'todo' as any,
							completed: false,
							completionDate: undefined,
							cancelled: false,
							cancelledDate: undefined,
						}, { skipCascade: false, propagationDirection: 'down' });
					}
				}
			}
		}

		// 向上聚合（默认执行，除非明确限制为 down）
		if (direction !== 'down' && updatedTask.parentId) {
			const parent = this.tasks.get(updatedTask.parentId) || this.archivedTasks.get(updatedTask.parentId);
			if (!parent) return;

			if (newStatus === 'done' && parent.childIds?.length) {
				// 检查是否所有兄弟都完成
				const allSiblingsDone = parent.childIds.every(id => {
					if (id === taskId) return true;
					const sibling = this.tasks.get(id) || this.archivedTasks.get(id);
					return sibling?.status === 'done';
				});
				if (allSiblingsDone) {
					await this.updateTask(parent.id, {
						status: 'done' as any,
						completed: true,
						completionDate: new Date(),
					}, { skipCascade: false, propagationDirection: 'up' });
				}
			} else if (newStatus === 'in_progress' || newStatus === 'done') {
				// 子变非 todo → 父从 todo 升为 in_progress
				if (parent.status === 'todo') {
					await this.updateTask(parent.id, {
						status: 'in_progress' as any,
					}, { skipCascade: false, propagationDirection: 'up' });
				}
			} else if (newStatus === 'todo' && (parent.status === 'done')) {
				// 某子退回 → 父退回 in_progress
				await this.updateTask(parent.id, {
					status: 'in_progress' as any,
					completed: false,
					completionDate: undefined,
				}, { skipCascade: false, propagationDirection: 'up' });
			}
		}
	}

	/**
	 * 删除任务
	 */
	async deleteTask(taskId: string): Promise<void> {
		const task = this.tasks.get(taskId) || this.archivedTasks.get(taskId);
		if (!task) {
			Logger.warn('JsonDataSource', `Task not found for delete: ${taskId}`);
			return;
		}

		// 递归删除子任务
		if (task.childIds?.length) {
			for (const childId of [...task.childIds]) {
				await this.deleteTask(childId);
			}
		}

		// 从父任务的 childIds 中移除自己
		if (task.parentId) {
			const parent = this.tasks.get(task.parentId) || this.archivedTasks.get(task.parentId);
			if (parent && parent.childIds) {
				const updatedParent = { ...parent, childIds: parent.childIds.filter(id => id !== taskId), lastModified: new Date() };
				if (this.tasks.has(task.parentId)) {
					this.tasks.set(task.parentId, updatedParent);
				} else {
					this.archivedTasks.set(task.parentId, updatedParent);
				}
			}
		}

		this.tasks.delete(taskId);
		this.archivedTasks.delete(taskId);
		this.scheduleSave();

		// 通知变更
		this.notifyChanges({
			sourceId: this.sourceId,
			created: [],
			updated: [],
			deleted: [task],
		});

		Logger.debug('JsonDataSource', `Task deleted: ${taskId}`);
	}

	/**
	 * 归档任务
	 */
	async archiveTask(taskId: string): Promise<void> {
		await this.updateTask(taskId, { archived: true });
	}

	/**
	 * 取消归档任务
	 */
	async unarchiveTask(taskId: string): Promise<void> {
		await this.updateTask(taskId, { archived: false });
	}

	/**
	 * 获取同步状态
	 */
	async getSyncStatus(): Promise<SyncStatus> {
		return {
			lastSyncAt: new Date(),
			syncDirection: 'bidirectional',
			conflictResolution: 'local-win',
		};
	}

	/**
	 * 销毁数据源
	 * 注意：调用 destroy() 前应先调用 flushSave() 确保数据已保存
	 */
	destroy(): void {
		if (this.saveDebounceTimer !== null) {
			clearTimeout(this.saveDebounceTimer);
			this.saveDebounceTimer = null;
			Logger.warn('JsonDataSource', 'Destroy called with pending save — ensure flushSave() was called first');
		}
		this.changeHandlers = [];
		this.tasks.clear();
		this.archivedTasks.clear();
		Logger.debug('JsonDataSource', 'Destroyed');
	}

	/**
	 * 通知所有变更处理器
	 */
	private notifyChanges(changes: DataSourceChanges): void {
		for (const handler of this.changeHandlers) {
			try {
				handler(changes);
			} catch (error) {
				Logger.error('JsonDataSource', 'Error in change handler:', error);
			}
		}
	}

	/**
	 * 立即保存（用于插件卸载时）
	 */
	async flushSave(): Promise<void> {
		if (this.saveDebounceTimer !== null) {
			clearTimeout(this.saveDebounceTimer);
			this.saveDebounceTimer = null;
		}
		await this.saveToFile();
	}

	/**
	 * 获取原始数据（用于 GitHub 同步等外部消费）
	 */
	async getDataForSync(): Promise<TasksJsonFile> {
		return {
			version: 1,
			tasks: Array.from(this.tasks.values()).map(taskToJson),
			archive: Array.from(this.archivedTasks.values()).map(taskToJson),
			lastSync: new Date().toISOString(),
		};
	}

	/**
	 * 获取 JSON 字符串内容（用于 GitHub 推送）
	 */
	async getJsonContent(): Promise<string> {
		const data = await this.getDataForSync();
		return JSON.stringify(data, null, 2);
	}
}
