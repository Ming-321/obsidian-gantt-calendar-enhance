import { App, TFile } from 'obsidian';
import { GCTask } from './types';

// 任务更新相关函数已迁移至 tasks/taskUpdater.ts，此处重新导出以保持向后兼容
export {
	updateTaskCompletion,
	updateTaskDateField,
	updateTaskProperties,
} from './tasks/taskUpdater';

// 导入新的数据层架构
import { EventBus } from './data-layer/EventBus';
import { TaskRepository } from './data-layer/TaskRepository';
import { MarkdownDataSource } from './data-layer/MarkdownDataSource';
import type { NormalizedTask } from './data-layer/types';
import { DataSourceConfig } from './data-layer/types';

// 任务解析与搜索相关功能已迁移至 src/tasks/ 目录


export type TaskCacheUpdateListener = () => void;

/**
 * 任务缓存管理器 - 全局单例，用于提升性能
 *
 * 【重构说明】
 * 本类现在作为新数据层架构的门面（Facade Pattern），内部使用：
 * - EventBus: 事件总线
 * - TaskRepository: 任务仓库
 * - MarkdownDataSource: Markdown 数据源
 *
 * 核心功能：
 * 1. 初始化时扫描整个笔记库，缓存所有任务
 * 2. 监听文件变化，增量更新受影响文件的任务
 * 3. 提供快速的任务查询接口，避免重复扫描
 * 4. 当任务缓存更新时，通知所有订阅的监听器
 *
 * 架构说明：
 * - 文件监听：由 MarkdownDataSource 内部处理
 * - 任务存储：由 TaskRepository 管理
 * - 事件通知：通过 EventBus 分发
 * - 格式转换：NormalizedTask → GCTask（向后兼容）
 */
export class TaskCacheManager {
	private app: App;
	private eventBus: EventBus;
	private repository: TaskRepository;
	private markdownSource: MarkdownDataSource;
	private globalTaskFilter: string = '';
	private enabledFormats: string[] = ['tasks', 'dataview'];
	private isInitialized: boolean = false;
	private isInitializing: boolean = false;
	private updateListeners: Set<TaskCacheUpdateListener> = new Set();

	constructor(app: App) {
		this.app = app;
		this.eventBus = new EventBus();
		this.repository = new TaskRepository(this.eventBus);

		// 创建 Markdown 数据源配置
		const config: DataSourceConfig = {
			enabled: true,
			syncDirection: 'import-only',
			autoSync: true,
			conflictResolution: 'local-win',
			globalFilter: '',
			enabledFormats: ['tasks', 'dataview']
		};

		this.markdownSource = new MarkdownDataSource(app, this.eventBus, config);

		// 注册数据源
		this.repository.registerDataSource(this.markdownSource);

		// 监听数据层事件，转发到旧接口
		this.setupEventForwarding();
	}

	/**
	 * 设置事件转发（从新架构到旧接口）
	 */
	private setupEventForwarding(): void {
		// 监听任务创建、更新、删除事件，通知旧接口的监听器
		this.eventBus.on('task:created', () => this.notifyListeners());
		this.eventBus.on('task:updated', () => this.notifyListeners());
		this.eventBus.on('task:deleted', () => this.notifyListeners());
	}

	/**
	 * 初始化缓存 - 扫描整个笔记库
	 */
	async initialize(globalTaskFilter: string, enabledFormats?: string[], retryCount: number = 0): Promise<void> {
		if (this.isInitializing) {
			console.log('[TaskCache] Already initializing, skipping...');
			return;
		}

		console.log('[TaskCache] ===== Starting initialization =====');
		console.log('[TaskCache] Config:', {
			globalTaskFilter,
			enabledFormats,
			retryCount
		});

		this.isInitializing = true;
		this.globalTaskFilter = (globalTaskFilter || '').trim();
		this.enabledFormats = enabledFormats || ['tasks', 'dataview'];

		// 更新数据源配置
		const config: DataSourceConfig = {
			enabled: true,
			syncDirection: 'import-only',
			autoSync: true,
			conflictResolution: 'local-win',
			globalFilter: this.globalTaskFilter,
			enabledFormats: this.enabledFormats
		};

		// 如果首次扫描找不到文件，可能 vault 尚未初始化，等待后重试
		const markdownFiles = this.app.vault.getMarkdownFiles();
		console.log('[TaskCache] Vault has', markdownFiles.length, 'markdown files');

		if (markdownFiles.length === 0 && retryCount < 3) {
			console.log(`[TaskCache] Vault not ready (${markdownFiles.length} files found), retrying in 500ms...`);
			this.isInitializing = false;
			await new Promise(resolve => setTimeout(resolve, 500));
			return this.initialize(globalTaskFilter, enabledFormats, retryCount + 1);
		}

		// 仅在实际扫描时开始计时，避免重试时重复 console.time
		const timerLabel = retryCount === 0 ? '[TaskCache] Initial scan' : `[TaskCache] Initial scan (retry ${retryCount})`;
		console.time(timerLabel);
		console.log('[TaskCache] Starting initial scan...');

		// 初始化 Markdown 数据源（会扫描所有文件并通知仓库）
		await this.markdownSource.initialize(config);

		console.log('[TaskCache] MarkdownDataSource initialized');

		this.isInitialized = true;
		this.isInitializing = false;

		// 完成批量扫描后统一通知，避免在初始化阶段触发大量视图重渲染
		this.notifyListeners();

		const stats = this.repository.getStats();
		console.timeEnd(timerLabel);
		console.log('[TaskCache] Init summary', {
			totalFiles: markdownFiles.length,
			tasksFound: stats.totalTasks,
			dataSources: stats.dataSources
		});
		console.log('[TaskCache] ===== Initialization complete =====');
	}

	/**
	 * 获取所有任务（从缓存）
	 */
	getAllTasks(): GCTask[] {
		// 从新架构获取任务
		const normalizedTasks = this.repository.getAllTasks();

		// 转换为 GCTask 格式
		const allTasks = normalizedTasks.map(task => this.normalizedToGCTask(task));

		// 检查是否有重复的任务（相同的文件和行号）
		const taskKeyMap = new Map<string, number>();
		const duplicates: Array<{ key: string; count: number }> = [];
		allTasks.forEach(task => {
			const key = `${task.filePath}:${task.lineNumber}`;
			const count = taskKeyMap.get(key) || 0;
			taskKeyMap.set(key, count + 1);
		});

		taskKeyMap.forEach((count, key) => {
			if (count > 1) {
				duplicates.push({ key, count });
			}
		});

		if (duplicates.length > 0) {
			console.error('[TaskCache] ⚠️ DUPLICATE TASKS FOUND:', duplicates);
		}

		return allTasks.sort((a, b) => {
			if (a.fileName !== b.fileName) {
				return a.fileName.localeCompare(b.fileName);
			}
			return a.lineNumber - b.lineNumber;
		});
	}

	/**
	 * 将 NormalizedTask 转换为 GCTask
	 */
	private normalizedToGCTask(normalized: NormalizedTask): GCTask {
		return {
			filePath: normalized.filePath || '',
			fileName: normalized.filePath?.split('/').pop() || '',
			lineNumber: normalized.lineNumber,
			content: normalized.description || '',
			description: normalized.title,
			completed: normalized.status === 'completed',
			cancelled: normalized.status === 'cancelled',
			status: normalized.status,
			priority: normalized.priority,
			tags: normalized.tags,
			createdDate: normalized.dates.created,
			startDate: normalized.dates.start,
			scheduledDate: normalized.dates.scheduled,
			dueDate: normalized.dates.due,
			completionDate: normalized.dates.completed,
			cancelledDate: normalized.dates.cancelled,
			format: normalized.syncInfo?.externalId ? undefined : (normalized.metadata?.format as any)
		} as GCTask;
	}

	/**
	 * 更新配置并重新初始化
	 */
	async updateSettings(globalTaskFilter: string, enabledFormats?: string[]): Promise<void> {
		const trimmedFilter = (globalTaskFilter || '').trim();
		const needsReinit =
			this.globalTaskFilter !== trimmedFilter ||
			JSON.stringify(this.enabledFormats) !== JSON.stringify(enabledFormats);

		if (needsReinit) {
			console.log('[TaskCache] Settings changed, reinitializing cache...');
			await this.initialize(trimmedFilter, enabledFormats);
		}
	}

	/**
	 * 获取缓存状态
	 */
	getStatus(): { initialized: boolean; fileCount: number; taskCount: number } {
		const stats = this.repository.getStats();
		return {
			initialized: this.isInitialized,
			fileCount: stats.totalFiles,
			taskCount: stats.totalTasks
		};
	}

	/**
	 * 清空缓存
	 */
	clear(): void {
		this.repository.clear();
		this.isInitialized = false;
		console.log('[TaskCache] Cache cleared');
	}

	/**
	 * 订阅缓存更新事件
	 */
	onUpdate(listener: TaskCacheUpdateListener): void {
		this.updateListeners.add(listener);
	}

	/**
	 * 取消订阅缓存更新事件
	 */
	offUpdate(listener: TaskCacheUpdateListener): void {
		this.updateListeners.delete(listener);
	}

	/**
	 * 通知所有监听器，缓存已更新
	 */
	private notifyListeners(): void {
		this.updateListeners.forEach(listener => {
			try {
				listener();
			} catch (error) {
				console.error('[TaskCache] Error in update listener:', error);
			}
		});
	}
}
