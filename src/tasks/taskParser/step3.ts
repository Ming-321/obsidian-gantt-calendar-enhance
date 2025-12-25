/**
 * 第三步：判断任务格式
 *
 * 负责判断任务使用的是 Tasks 格式（emoji）还是 Dataview 格式（字段）。
 * 通过检测内容中的特征标记来识别格式类型。
 *
 * @fileoverview 任务格式检测
 * @module tasks/taskParser/step3
 */

import {
    TaskFormatType,
    detectTaskFormat as baseDetectTaskFormat,
} from '../taskSerializerSymbols';

// ==================== 类型定义 ====================

/**
 * 格式检测结果
 * 包含检测到的格式类型和是否有混用情况的标记
 */
export interface FormatDetectionResult {
    /** 检测到的主格式类型 */
    format: TaskFormatType | undefined;

    /** 是否混用了两种格式 */
    isMixed: boolean;

    /** 是否包含 Tasks 格式标记 */
    hasTasksFormat: boolean;

    /** 是否包含 Dataview 格式标记 */
    hasDataviewFormat: boolean;
}

// ==================== 主要函数 ====================

/**
 * 检测任务使用的格式
 *
 * 根据内容中的特征判断使用的是 Tasks 格式、Dataview 格式，还是两者混用。
 * 如果启用了多种格式，任务可能会被识别为混合格式。
 *
 * @param content - 任务内容（复选框后的部分，通常已移除 globalFilter）
 * @param enabledFormats - 启用的格式列表
 * @returns 检测到的格式类型，'mixed' 表示混用，undefined 表示无法检测
 *
 * @example
 * ```ts
 * // Tasks 格式
 * detectFormat("任务 ⏫ 📅 2024-01-15", ["tasks", "dataview"])
 * // 返回: 'tasks'
 *
 * // Dataview 格式
 * detectFormat("任务 [priority:: high] [due:: 2024-01-15]", ["tasks", "dataview"])
 * // 返回: 'dataview'
 *
 * // 混合格式（警告）
 * detectFormat("任务 ⏫ [due:: 2024-01-15]", ["tasks", "dataview"])
 * // 返回: 'mixed'
 *
 * // 无格式标记
 * detectFormat("普通任务", ["tasks", "dataview"])
 * // 返回: undefined
 *
 * // 仅启用 Tasks 格式时，Dataview 格式不会被识别
 * detectFormat("任务 [priority:: high]", ["tasks"])
 * // 返回: undefined
 * ```
 */
export function detectFormat(
    content: string,
    enabledFormats: TaskFormatType[]
): TaskFormatType | 'mixed' | undefined {
    return baseDetectTaskFormat(content, enabledFormats);
}

/**
 * 详细检测任务格式
 *
 * 返回更详细的格式检测结果，包括各种格式的存在情况。
 *
 * @param content - 任务内容
 * @param enabledFormats - 启用的格式列表
 * @returns 详细的格式检测结果
 *
 * @example
 * ```ts
 * detectFormatDetailed("任务 ⏫ 📅 2024-01-15", ["tasks", "dataview"])
 * // 返回: {
 * //   format: 'tasks',
 * //   isMixed: false,
 * //   hasTasksFormat: true,
 * //   hasDataviewFormat: false
 * // }
 *
 * detectFormatDetailed("任务 ⏫ [due:: 2024-01-15]", ["tasks", "dataview"])
 * // 返回: {
 * //   format: 'tasks',  // 混合时默认使用 tasks
 * //   isMixed: true,
 * //   hasTasksFormat: true,
 * //   hasDataviewFormat: true
 * // }
 * ```
 */
export function detectFormatDetailed(
    content: string,
    enabledFormats: TaskFormatType[]
): FormatDetectionResult {
    const result: FormatDetectionResult = {
        format: undefined,
        isMixed: false,
        hasTasksFormat: false,
        hasDataviewFormat: false,
    };

    // 检测 Tasks 格式
    if (enabledFormats.includes('tasks')) {
        const { TASKS_FORMAT_CONFIG } = require('../taskSerializerSymbols');
        result.hasTasksFormat = TASKS_FORMAT_CONFIG.regex.formatDetection.test(content);
    }

    // 检测 Dataview 格式
    if (enabledFormats.includes('dataview')) {
        const { DATAVIEW_FORMAT_CONFIG } = require('../taskSerializerSymbols');
        result.hasDataviewFormat = DATAVIEW_FORMAT_CONFIG.regex.formatDetection.test(content);
    }

    // 判断是否混用
    result.isMixed = result.hasTasksFormat && result.hasDataviewFormat;

    // 确定主格式
    if (result.isMixed) {
        result.format = 'tasks'; // 混合时默认使用 tasks 格式
    } else if (result.hasTasksFormat) {
        result.format = 'tasks';
    } else if (result.hasDataviewFormat) {
        result.format = 'dataview';
    }

    return result;
}

/**
 * 判断内容是否包含 Tasks 格式标记
 *
 * 快速检测是否包含 Tasks 格式的特征标记（优先级 emoji 或日期 emoji）。
 *
 * @param content - 任务内容
 * @returns 是否包含 Tasks 格式标记
 *
 * @example
 * ```ts
 * hasTasksFormat("任务 ⏫")              // true
 * hasTasksFormat("任务 📅 2024-01-15")    // true
 * hasTasksFormat("任务 [priority::]")    // false
 * ```
 */
export function hasTasksFormat(content: string): boolean {
    const { TASKS_FORMAT_CONFIG } = require('../taskSerializerSymbols');
    return TASKS_FORMAT_CONFIG.regex.formatDetection.test(content);
}

/**
 * 判断内容是否包含 Dataview 格式标记
 *
 * 快速检测是否包含 Dataview 格式的特征标记（字段格式）。
 *
 * @param content - 任务内容
 * @returns 是否包含 Dataview 格式标记
 *
 * @example
 * ```ts
 * hasDataviewFormat("任务 [priority:: high]")  // true
 * hasDataviewFormat("任务 📅 2024-01-15")       // false
 * ```
 */
export function hasDataviewFormat(content: string): boolean {
    const { DATAVIEW_FORMAT_CONFIG } = require('../taskSerializerSymbols');
    return DATAVIEW_FORMAT_CONFIG.regex.formatDetection.test(content);
}

/**
 * 判断是否为混合格式
 *
 * 检测内容是否同时包含 Tasks 和 Dataview 两种格式的标记。
 * 混合格式通常需要向用户发出警告。
 *
 * @param content - 任务内容
 * @returns 是否为混合格式
 *
 * @example
 * ```ts
 * isMixedFormat("任务 ⏫ [due:: 2024-01-15]")  // true
 * isMixedFormat("任务 ⏫ 📅 2024-01-15")       // false
 * isMixedFormat("任务 [priority:: high]")     // false
 * ```
 */
export function isMixedFormat(content: string): boolean {
    return hasTasksFormat(content) && hasDataviewFormat(content);
}
