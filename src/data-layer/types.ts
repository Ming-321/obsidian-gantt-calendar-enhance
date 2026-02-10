/**
 * 数据层类型定义
 *
 * 本文件定义了数据层所需的核心类型。
 * 统一使用 GCTask 作为内部任务格式，避免无意义的格式转换。
 */

import { TaskStatusType } from '../tasks/taskStatus';
import type { GCTask, TaskPriority } from '../types';

/**
 * 任务状态类型（与现有系统兼容）
 */
export type TaskStatus = TaskStatusType;

/**
 * 优先级类型
 */
export type Priority = TaskPriority;

/**
 * 任务日期集合
 */
export interface TaskDates {
	created?: Date;
	start?: Date;
	due?: Date;
	completed?: Date;
	cancelled?: Date;
}

/**
 * 数据源配置
 */
export interface DataSourceConfig {
	enabled?: boolean;
	syncDirection: 'bidirectional' | 'import-only' | 'export-only';
	autoSync?: boolean;
	syncInterval?: number;
	conflictResolution: 'local-win' | 'remote-win' | 'newest-win' | 'manual';
	globalFilter?: string;
}

/**
 * 事件类型
 */
export type TaskEvent =
	| 'task:created'
	| 'task:updated'
	| 'task:deleted'
	| 'task:completed';

/**
 * 事件处理器类型
 */
export type EventHandler = (data?: any) => void | Promise<void>;

/**
 * 数据源变化事件
 *
 * 使用 GCTask 作为统一的任务格式，避免转换开销
 */
export interface DataSourceChanges {
	sourceId: string;
	created: GCTask[];
	updated: Array<{ id: string; changes: TaskChanges; task?: GCTask }>;
	deleted: GCTask[];
	deletedIds?: string[];  // 已删除的任务ID列表
}

/**
 * 任务变更类型
 *
 * 与 GCTask 字段保持一致，便于更新操作
 */
export interface TaskChanges {
	description?: string;
	detail?: string;
	completed?: boolean;
	cancelled?: boolean;
	status?: TaskStatus;
	priority?: TaskPriority;
	tags?: string[];
	createdDate?: Date;
	startDate?: Date;
	dueDate?: Date;
	cancelledDate?: Date;
	completionDate?: Date;
	repeat?: string;
	archived?: boolean;
	// 子任务关系
	parentId?: string;
	childIds?: string[];
	depth?: number;
}

/**
 * 查询选项
 */
export interface QueryOptions {
	status?: TaskStatus[];
	priority?: Priority[];
	tags?: string[];
	type?: ('todo' | 'reminder')[];   // 按任务类型筛选
	archived?: boolean;                 // 是否包含归档任务
	dateRange?: {
		start: Date;
		end: Date;
		field: keyof TaskDates
	};
	sources?: string[];  // 数据源筛选
	parentId?: string;       // 按父任务 ID 筛选
	rootOnly?: boolean;      // 仅返回顶层任务（parentId 为空）
}

/**
 * 同步状态
 */
export interface SyncStatus {
	lastSyncAt?: Date;
	syncDirection: 'bidirectional' | 'import-only' | 'export-only';
	conflictResolution: 'local-win' | 'remote-win' | 'newest-win' | 'manual';
}
