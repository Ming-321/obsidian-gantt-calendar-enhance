/**
 * 同步专用类型定义
 *
 * 定义同步功能所需的核心类型，包括：
 * - 同步配置
 * - 同步元数据
 * - 同步结果
 * - 冲突解决
 */

import type { GCTask } from '../../types';

/**
 * 同步方向
 */
export type SyncDirection = 'bidirectional' | 'import-only' | 'export-only';

/**
 * 冲突解决策略
 */
export type ConflictResolution = 'local-win' | 'remote-win' | 'newest-win' | 'manual';

/**
 * 任务同步状态
 */
export type TaskSyncStatus = 'synced' | 'pending' | 'conflict' | 'local-only' | 'remote-only';

/**
 * 数据源类型
 */
export type DataSourceType = 'markdown' | 'api' | 'caldav';

/**
 * API 提供商
 */
export type APIProvider = 'feishu' | 'microsoft-todo' | 'custom';

/**
 * CalDAV 提供商
 */
export type CalDAVProvider = 'google' | 'outlook' | 'apple' | 'custom';

/**
 * 字段合并规则
 */
export interface FieldMergeRule {
    field: keyof GCTask;
    winner: 'local' | 'remote' | 'newest';
}

/**
 * 同步配置
 */
export interface SyncConfiguration {
    // 启用的数据源
    enabledSources: {
        api?: boolean;
        caldav?: boolean;
    };

    // API 配置
    api?: {
        provider: APIProvider;
        apiKey?: string;
        endpoint?: string;
        // 飞书特有配置
        tenantId?: string;
        appId?: string;
        appSecret?: string;
        // Microsoft To Do 特有配置
        accessToken?: string;
        refreshToken?: string;
        // OAuth 配置
        clientId?: string;
        clientSecret?: string;
        redirectUri?: string;
    };

    // CalDAV 配置
    caldav?: {
        provider: CalDAVProvider;
        url?: string;
        username?: string;
        password?: string;
        // OAuth 配置（某些服务需要）
        clientId?: string;
        clientSecret?: string;
        redirectUri?: string;
        accessToken?: string;
        refreshToken?: string;
    };

    // 同步策略
    syncDirection: SyncDirection;
    syncInterval: number;           // 自动同步间隔（分钟）
    conflictResolution: ConflictResolution;

    // 字段合并规则（可选，高级功能）
    fieldMergeRules?: FieldMergeRule[];
}

/**
 * 任务同步元数据
 * 用于追踪任务的同步状态和版本信息
 */
export interface GCTaskSyncMetadata {
    // 任务唯一标识（跨数据源）
    syncId?: string;

    // 来源追踪
    source: DataSourceType;
    sourceId?: string;

    // 版本控制
    version: number;
    remoteVersion?: string;
    lastModified: Date;
    lastSyncAt?: Date;

    // 同步状态
    syncStatus: TaskSyncStatus;

    // 冲突信息
    conflictWith?: string;
    conflictResolved?: 'local' | 'remote' | 'manual';
}

/**
 * 扩展的任务类型（包含同步元数据）
 */
export type GCTaskWithSync = GCTask & Partial<GCTaskSyncMetadata>;

/**
 * 同步统计
 */
export interface SyncStats {
    fetched: number;
    created: number;
    updated: number;
    deleted: number;
    skipped: number;
    conflicts: number;
}

/**
 * 同步错误
 */
export interface SyncError {
    taskId?: string;
    taskDescription?: string;
    error: string;
    source?: DataSourceType;
}

/**
 * 同步结果
 */
export interface SyncResult {
    success: boolean;
    startTime: Date;
    endTime: Date;

    // 统计信息
    stats: SyncStats;

    // 错误列表
    errors: SyncError[];

    // 冲突列表（需要手动解决的）
    conflicts?: ConflictInfo[];
}

/**
 * 冲突信息
 */
export interface ConflictInfo {
    syncId: string;
    localTask: GCTaskWithSync;
    remoteTask: GCTaskWithSync;
    conflictFields: string[];
    suggestedResolution?: 'local' | 'remote' | 'merge';
}

/**
 * 任务匹配组
 * 用于将来自不同数据源的任务进行分组匹配
 */
export interface TaskMatchGroup {
    syncId?: string;
    tasks: GCTaskWithSync[];
    hasLocal: boolean;
    hasRemote: boolean;
    sources: DataSourceType[];
}

/**
 * 同步变更
 */
export interface SyncChanges {
    toCreate: GCTaskWithSync[];      // 需要创建的任务
    toUpdate: Array<{                // 需要更新的任务
        task: GCTaskWithSync;
        changes: Partial<GCTask>;
    }>;
    toDelete: GCTaskWithSync[];      // 需要删除的任务
    toSync: GCTaskWithSync[];        // 需要双向同步的任务
    skipped: GCTaskWithSync[];       // 跳过的任务
}

/**
 * 数据源同步状态
 */
export interface DataSourceSyncStatus {
    sourceId: string;
    sourceName: string;
    enabled: boolean;
    lastSyncAt?: Date;
    lastSyncSuccess?: boolean;
    lastSyncError?: string;
    syncDirection: SyncDirection;
}

/**
 * 同步事件类型
 */
export type SyncEventType =
    | 'sync:started'
    | 'sync:completed'
    | 'sync:failed'
    | 'sync:progress'
    | 'sync:conflict';

/**
 * 同步事件数据
 */
export interface SyncEventData {
    type: SyncEventType;
    sourceId?: string;
    timestamp: Date;
    data?: {
        progress?: number;
        total?: number;
        message?: string;
        conflict?: ConflictInfo;
    };
}

/**
 * 同步状态持久化数据
 */
export interface SyncStateData {
    version: string;                 // 数据格式版本
    lastSyncAt?: Date;
    configuration: SyncConfiguration;
    sourceStates: Map<string, {
        lastSyncAt?: Date;
        lastSyncSuccess?: boolean;
        cursor?: string;             // 用于增量同步的游标
    }>;
    taskMetadata: Map<string, GCTaskSyncMetadata>;  // syncId -> metadata
}

/**
 * 任务映射关系
 * 用于记录不同数据源之间的任务对应关系
 */
export interface TaskMapping {
    syncId: string;
    mappings: Map<DataSourceType, string>;  // source -> sourceId
    createdAt: Date;
    updatedAt: Date;
}
