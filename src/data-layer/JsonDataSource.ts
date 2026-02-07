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
	priority: 'high' | 'normal' | 'low';
	tags?: string[];
	createdDate?: string;
	startDate?: string;
	dueDate?: string;
	cancelledDate?: string;
	completionDate?: string;
	time?: string;
	repeat?: string;
	archived: boolean;
	sourceId?: string;
	lastModified?: string;
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
		time: task.time,
		repeat: task.repeat,
		archived: task.archived,
		sourceId: task.sourceId,
		lastModified: task.lastModified?.toISOString(),
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
		priority: json.priority,
		tags: json.tags,
		createdDate: json.createdDate ? new Date(json.createdDate) : undefined,
		startDate: json.startDate ? new Date(json.startDate) : undefined,
		dueDate: json.dueDate ? new Date(json.dueDate) : undefined,
		cancelledDate: json.cancelledDate ? new Date(json.cancelledDate) : undefined,
		completionDate: json.completionDate ? new Date(json.completionDate) : undefined,
		time: json.time,
		repeat: json.repeat,
		archived: json.archived,
		sourceId: json.sourceId,
		lastModified: json.lastModified ? new Date(json.lastModified) : undefined,
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
		}

		// 文件不存在或读取失败，创建空文件
		const emptyData = createEmptyTasksFile();
		await this.writeDataFile(emptyData);
		return emptyData;
	}

	/**
	 * 写入数据文件
	 */
	private async writeDataFile(data: TasksJsonFile): Promise<void> {
		const filePath = this.getDataFilePath();
		const adapter = this.app.vault.adapter;

		try {
			const content = JSON.stringify(data, null, 2);
			await adapter.write(filePath, content);
			Logger.debug('JsonDataSource', 'Data file saved');
		} catch (error) {
			Logger.error('JsonDataSource', 'Failed to write data file:', error);
		}
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
	 */
	async updateTask(taskId: string, changes: TaskChanges): Promise<void> {
		const task = this.tasks.get(taskId) || this.archivedTasks.get(taskId);
		if (!task) {
			Logger.warn('JsonDataSource', `Task not found for update: ${taskId}`);
			return;
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
	 * 删除任务
	 */
	async deleteTask(taskId: string): Promise<void> {
		const task = this.tasks.get(taskId) || this.archivedTasks.get(taskId);
		if (!task) {
			Logger.warn('JsonDataSource', `Task not found for delete: ${taskId}`);
			return;
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
	 */
	destroy(): void {
		if (this.saveDebounceTimer !== null) {
			clearTimeout(this.saveDebounceTimer);
			// 最后一次同步保存
			this.saveToFile();
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
