/**
 * 数据层类型定义
 *
 * 本文件定义了缓存系统重构所需的所有核心类型，包括：
 * - ExternalTask: 数据源通用任务格式
 * - NormalizedTask: 内部统一格式
 * - 各种配置和事件类型
 */

import { TaskStatusType } from '../tasks/taskStatus';

/**
 * 任务状态类型（与现有系统兼容）
 */
export type TaskStatus = TaskStatusType;

/**
 * 优先级类型（与现有系统兼容）
 */
export type Priority = 'highest' | 'high' | 'medium' | 'normal' | 'low' | 'lowest';

/**
 * 任务日期集合
 */
export interface TaskDates {
	created?: Date;
	start?: Date;
	scheduled?: Date;
	due?: Date;
	completed?: Date;
	cancelled?: Date;
}

/**
 * 同步信息
 */
export interface SyncInfo {
	lastSyncAt?: Date;
	conflictStatus?: 'synced' | 'conflict' | 'pending';
	externalId?: string;  // 外部系统ID
}

/**
 * 数据源通用任务格式
 *
 * 所有数据源（Markdown、飞书等）都需要将任务转换为这种格式
 */
export interface ExternalTask {
	id: string;                    // 唯一标识符（必须）
	sourceId: string;              // 数据源ID
	title: string;                 // 任务标题
	description?: string;          // 描述
	status: TaskStatus;            // 状态
	priority: Priority;            // 优先级
	tags: string[];                // 标签
	dates: TaskDates;              // 日期集合
	metadata: Record<string, any>; // 扩展元数据
	version: number;               // 版本号（用于冲突检测）
	updatedAt: Date;               // 最后更新时间
	createdAt: Date;               // 创建时间
	syncInfo?: SyncInfo;           // 同步信息
}

/**
 * 内部统一格式
 *
 * 插件内部使用的标准任务格式，从 ExternalTask 转换而来
 */
export interface NormalizedTask {
	id: string;                  // 全局唯一ID
	sourceId: string;            // 数据源ID
	externalId: string;          // 外部系统ID
	filePath?: string;           // 文件路径（仅 Markdown）
	lineNumber?: number;         // 行号（仅 Markdown）

	// 业务字段
	title: string;
	description?: string;
	status: TaskStatus;
	priority: Priority;
	tags: string[];
	dates: TaskDates;

	// 元数据
	version: number;
	createdAt: Date;
	updatedAt: Date;
	syncInfo?: SyncInfo;
	metadata?: Record<string, any>;  // 扩展元数据（保留原始任务信息）
}

/**
 * 查询选项
 */
export interface QueryOptions {
	status?: TaskStatus[];
	priority?: Priority[];
	tags?: string[];
	dateRange?: {
		start: Date;
		end: Date;
		field: keyof TaskDates
	};
	sources?: string[];  // 数据源筛选
}

/**
 * 数据源配置
 */
export interface DataSourceConfig {
	enabled: boolean;
	syncDirection: 'bidirectional' | 'import-only' | 'export-only';
	autoSync: boolean;
	syncInterval?: number;
	conflictResolution: 'local-win' | 'remote-win' | 'manual';
	globalFilter?: string;
	enabledFormats?: string[];
}

/**
 * 事件类型
 */
export type TaskEvent =
	| 'task:created'
	| 'task:updated'
	| 'task:deleted'
	| 'task:completed'
	| 'sync:started'
	| 'sync:completed'
	| 'sync:conflict';

/**
 * 事件处理器类型
 */
export type EventHandler = (data?: any) => void | Promise<void>;

/**
 * 数据源变化事件
 */
export interface DataSourceChanges {
	sourceId: string;
	created: ExternalTask[];
	updated: Array<{ id: string; changes: TaskChanges }>;
	deleted: ExternalTask[];
}

/**
 * 任务变更类型
 */
export interface TaskChanges {
	title?: string;
	description?: string;
	status?: TaskStatus;
	priority?: Priority;
	tags?: string[];
	dates?: Partial<TaskDates>;
}

/**
 * 同步状态
 */
export interface SyncStatus {
	lastSyncAt?: Date;
	syncDirection: 'bidirectional' | 'import-only' | 'export-only';
	conflictResolution: 'local-win' | 'remote-win' | 'manual';
}
