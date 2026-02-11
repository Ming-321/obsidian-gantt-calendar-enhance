/**
 * 任务状态定义
 *
 * 统一管理 4 种核心任务状态。
 * 颜色不再由状态决定，而是由优先级决定（通过 priorityUtils.ts）。
 *
 * @fileoverview 任务状态定义和管理
 * @module tasks/taskStatus
 */

// ==================== 类型定义 ====================

/**
 * 任务状态类型（4 种核心状态）
 */
export type DefaultTaskStatusType =
    | 'todo'
    | 'in_progress'
    | 'done'
    | 'canceled';

/**
 * 任务状态类型
 */
export type TaskStatusType = DefaultTaskStatusType;

/**
 * 主题模式类型
 */
export type ThemeMode = 'light' | 'dark';

/**
 * 任务状态配置接口（简化版：不含颜色）
 */
export interface TaskStatus {
    /** 状态唯一标识 */
    key: TaskStatusType;

    /** 复选框符号 (单个字符) */
    symbol: string;

    /** 显示名称 */
    name: string;

    /** 描述 */
    description: string;

    /** 是否为默认状态 */
    isDefault: boolean;
}

// ==================== 默认状态配置 ====================

/**
 * 默认任务状态配置（4 种）
 *
 * 颜色由优先级决定，不再由状态决定。
 */
export const DEFAULT_TASK_STATUSES: TaskStatus[] = [
    {
        key: 'todo',
        symbol: ' ',
        name: '待办',
        description: '待办任务',
        isDefault: true,
    },
    {
        key: 'in_progress',
        symbol: '/',
        name: '进行中',
        description: '进行中任务',
        isDefault: true,
    },
    {
        key: 'done',
        symbol: 'x',
        name: '已完成',
        description: '已完成任务',
        isDefault: true,
    },
    {
        key: 'canceled',
        symbol: '-',
        name: '已取消',
        description: '已取消任务',
        isDefault: true,
    },
];

// ==================== 工具函数 ====================

/**
 * 根据符号获取状态配置
 */
export function getStatusBySymbol(
    symbol: string,
    statuses: TaskStatus[] = DEFAULT_TASK_STATUSES
): TaskStatus | undefined {
    return statuses.find(s => s.symbol === symbol);
}

/**
 * 根据状态 key 获取状态配置
 */
export function getStatusByKey(
    key: string,
    statuses: TaskStatus[] = DEFAULT_TASK_STATUSES
): TaskStatus | undefined {
    return statuses.find(s => s.key === key);
}

/**
 * 获取当前主题模式
 */
export function getCurrentThemeMode(): ThemeMode {
    return document.body.hasClass('theme-dark') ? 'dark' : 'light';
}

/**
 * 根据复选框状态字符解析状态类型
 */
export function parseStatusFromCheckbox(
    checkboxStatus: string,
    statuses: TaskStatus[] = DEFAULT_TASK_STATUSES
): string {
    const status = statuses.find(s => s.symbol === checkboxStatus);
    return status?.key || 'todo';
}

/**
 * 检查是否为默认状态
 */
export function isDefaultStatus(key: string): key is DefaultTaskStatusType {
    return DEFAULT_TASK_STATUSES.some(s => s.key === key);
}

/**
 * 获取所有默认状态的 key 列表
 */
export function getDefaultStatusKeys(): DefaultTaskStatusType[] {
    return DEFAULT_TASK_STATUSES.map(s => s.key as DefaultTaskStatusType);
}

/**
 * 获取下一个状态（循环切换）
 * todo → in_progress → done → todo
 *
 * canceled 退回 todo（不参与正常循环）
 */
export function getNextStatus(current: TaskStatusType): TaskStatusType {
    switch (current) {
        case 'todo': return 'in_progress';
        case 'in_progress': return 'done';
        case 'done': return 'todo';
        case 'canceled': return 'todo';
        default: return 'todo';
    }
}

/**
 * 判断是否为终态（不可通过正常循环离开，需要特殊操作）
 * done 和 canceled 为终态
 */
export function isTerminalStatus(status: TaskStatusType): boolean {
    return status === 'done' || status === 'canceled';
}
