import { App } from 'obsidian';
import { GCTask } from './types';
import { Logger } from './utils/logger';

// 导入新的数据层架构
import { EventBus } from './data-layer/EventBus';
import { TaskRepository } from './data-layer/TaskRepository';
import { JsonDataSource } from './data-layer/JsonDataSource';
import { DataSourceConfig, TaskChanges } from './data-layer/types';
import { GitHubSyncService } from './services/GitHubSyncService';

export type TaskStoreUpdateListener = (taskId?: string) => void;

/**
 * TaskStore - 任务数据存储
 *
 * 任务数据的统一访问点，采用门面模式协调数据层组件。
 *
 * 职责：
 * - 初始化 JSON 数据源，加载任务
 * - 提供统一的任务 CRUD 接口
 * - 管理缓存和失效
 * - 防抖变更通知，避免频繁重渲染
 * - 自动归档过期提醒
 */
export class TaskStore {
	private app: App;
	private eventBus: EventBus;
	private repository: TaskRepository;
	private jsonSource: JsonDataSource;
	private isInitialized: boolean = false;
	private isInitializing: boolean = false;
	private updateListeners: Set<TaskStoreUpdateListener> = new Set();

	// 结果缓存
	private cachedTasks: GCTask[] | null = null;
	private cacheValid: boolean = false;

	// 防抖
	private updateDebounceTimer: number | null = null;
	private readonly DEBOUNCE_MS = 75;

	// GitHub 同步服务
	private githubSync: GitHubSyncService | null = null;

	constructor(app: App) {
		this.app = app;
		this.eventBus = new EventBus();
		this.repository = new TaskRepository(this.eventBus);

		// 创建 JSON 数据源配置
		const config: DataSourceConfig = {
			enabled: true,
			syncDirection: 'bidirectional',
			autoSync: true,
			conflictResolution: 'local-win',
		};

		this.jsonSource = new JsonDataSource(app, this.eventBus, config);

		// 注册数据源
		this.repository.registerDataSource(this.jsonSource);

		// 监听数据层事件
		this.setupEventForwarding();
	}

	/**
	 * 设置事件转发
	 */
	private setupEventForwarding(): void {
		this.eventBus.on('task:created', (data) => {
			const taskId = (data as any)?.task?.id;
			Logger.debug('TaskStore', `Event: task:created ${taskId || 'unknown'}`);
			this.invalidateCache();
			this.notifyListenersDebounced(taskId);
			this.scheduleGitHubSync();
		});
		this.eventBus.on('task:updated', (data) => {
			const taskId = (data as any)?.task?.id;
			Logger.debug('TaskStore', `Event: task:updated ${taskId || 'unknown'}`);
			this.invalidateCache();
			this.notifyListenersDebounced(taskId);
			this.scheduleGitHubSync();
		});
		this.eventBus.on('task:deleted', (data) => {
			const taskId = (data as any)?.taskId;
			Logger.debug('TaskStore', `Event: task:deleted ${taskId || 'unknown'}`);
			this.invalidateCache();
			this.notifyListenersDebounced(taskId);
			this.scheduleGitHubSync();
		});
	}

	/**
	 * 初始化存储 - 加载 JSON 数据
	 */
	async initialize(): Promise<void> {
		if (this.isInitializing) {
			Logger.debug('TaskStore', 'Already initializing, skipping...');
			return;
		}

		Logger.debug('TaskStore', '===== Starting initialization =====');

		this.isInitializing = true;

		// 重新初始化前，先清除旧的仓库缓存
		this.repository.clear();
		this.invalidateCache();

		const config: DataSourceConfig = {
			enabled: true,
			syncDirection: 'bidirectional',
			autoSync: true,
			conflictResolution: 'local-win',
		};

		const scanStartTime = performance.now();

		await this.jsonSource.initialize(config);

		Logger.debug('TaskStore', 'JsonDataSource initialized');

		this.isInitialized = true;
		this.isInitializing = false;

		this.notifyListeners();

		const stats = this.repository.getStats();
		const scanElapsed = performance.now() - scanStartTime;
		Logger.stats('TaskStore', `Initial load completed in ${scanElapsed.toFixed(2)}ms`, {
			totalTasks: stats.totalTasks,
			todoCount: stats.todoCount,
			reminderCount: stats.reminderCount,
		});
		Logger.debug('TaskStore', '===== Initialization complete =====');
	}

	/**
	 * 获取所有活跃任务（带缓存）
	 */
	getAllTasks(): GCTask[] {
		if (this.cacheValid && this.cachedTasks) {
			return this.cachedTasks;
		}

		const startTime = performance.now();
		Logger.debug('TaskStore', 'Cache miss, rebuilding...');

		const allTasks = this.repository.getAllTasks();

		this.cachedTasks = allTasks;
		this.cacheValid = true;

		const elapsed = performance.now() - startTime;
		Logger.debug('TaskStore', `Cache rebuilt in ${elapsed.toFixed(2)}ms (${allTasks.length} tasks)`);

		return allTasks;
	}

	/**
	 * 根据ID获取任务
	 */
	getTaskById(taskId: string): GCTask | undefined {
		return this.repository.getTaskById(taskId);
	}

	/**
	 * 创建新任务
	 */
	async createTask(task: GCTask): Promise<string> {
		return await this.jsonSource.createTask(task);
	}

	/**
	 * 更新任务
	 */
	async updateTask(taskId: string, changes: TaskChanges): Promise<void> {
		await this.jsonSource.updateTask(taskId, changes);
	}

	/**
	 * 删除任务
	 */
	async deleteTask(taskId: string): Promise<void> {
		await this.jsonSource.deleteTask(taskId);
	}

	/**
	 * 归档任务
	 */
	async archiveTask(taskId: string): Promise<void> {
		await this.jsonSource.archiveTask(taskId);
	}

	/**
	 * 获取归档任务
	 */
	getArchivedTasks(): GCTask[] {
		return this.jsonSource.getArchivedTasks();
	}

	/**
	 * 获取存储状态
	 */
	getStatus(): { initialized: boolean; taskCount: number; todoCount: number; reminderCount: number } {
		const stats = this.repository.getStats();
		return {
			initialized: this.isInitialized,
			taskCount: stats.totalTasks,
			todoCount: stats.todoCount,
			reminderCount: stats.reminderCount,
		};
	}

	/**
	 * 清空存储
	 */
	clear(): void {
		this.jsonSource.destroy();
		this.repository.clear();
		this.isInitialized = false;
		Logger.debug('TaskStore', 'Cache cleared');
	}

	/**
	 * 订阅更新事件
	 */
	onUpdate(listener: TaskStoreUpdateListener): void {
		this.updateListeners.add(listener);
	}

	/**
	 * 取消订阅
	 */
	offUpdate(listener: TaskStoreUpdateListener): void {
		this.updateListeners.delete(listener);
	}

	/**
	 * 使缓存失效
	 */
	private invalidateCache(): void {
		this.cachedTasks = null;
		this.cacheValid = false;
	}

	/**
	 * 防抖通知监听器
	 */
	private notifyListenersDebounced(taskId?: string): void {
		if (this.updateDebounceTimer !== null) {
			clearTimeout(this.updateDebounceTimer);
		}

		this.updateDebounceTimer = window.setTimeout(() => {
			this.notifyListeners(taskId);
			this.updateDebounceTimer = null;
		}, this.DEBOUNCE_MS);
	}

	/**
	 * 通知所有监听器
	 */
	private notifyListeners(taskId?: string): void {
		this.updateListeners.forEach(listener => {
			try {
				listener(taskId);
			} catch (error) {
				Logger.error('TaskStore', 'Error in update listener:', error);
			}
		});
	}

	/**
	 * 获取 JSON 数据源（用于高级操作如 GitHub 同步）
	 */
	getJsonDataSource(): JsonDataSource {
		return this.jsonSource;
	}

	/**
	 * 立即保存所有数据（用于插件卸载时）
	 */
	async flushSave(): Promise<void> {
		await this.jsonSource.flushSave();
		// 刷新 GitHub 同步队列
		await this.githubSync?.flush();
	}

	// ==================== GitHub 同步 ====================

	/**
	 * 配置 GitHub 同步
	 */
	configureGitHubSync(config: { token: string; owner: string; repo: string },
		onSuccess?: (time: string) => void,
		onError?: (error: string) => void
	): void {
		if (!this.githubSync) {
			this.githubSync = new GitHubSyncService();
		}
		this.githubSync.configure(config);
		this.githubSync.setCallbacks(onSuccess, onError);
		Logger.info('TaskStore', 'GitHub sync configured', { owner: config.owner, repo: config.repo });
	}

	/**
	 * 禁用 GitHub 同步
	 */
	disableGitHubSync(): void {
		this.githubSync?.destroy();
		this.githubSync = null;
		Logger.info('TaskStore', 'GitHub sync disabled');
	}

	/**
	 * 计划 GitHub 同步（防抖）
	 */
	private async scheduleGitHubSync(): Promise<void> {
		if (!this.githubSync?.isConfigured()) return;

		try {
			const content = await this.jsonSource.getJsonContent();
			this.githubSync.schedulePush(content);
		} catch (error) {
			Logger.error('TaskStore', 'Failed to schedule GitHub sync', error);
		}
	}

	/**
	 * 立即推送到 GitHub（手动触发）
	 */
	async pushToGitHubNow(): Promise<void> {
		if (!this.githubSync?.isConfigured()) {
			throw new Error('GitHub 同步未配置');
		}

		const content = await this.jsonSource.getJsonContent();
		await this.githubSync.pushNow(content);
	}

	/**
	 * GitHub 同步是否已配置
	 */
	isGitHubSyncConfigured(): boolean {
		return this.githubSync?.isConfigured() ?? false;
	}
}
