/**
 * 第二步：筛选任务行
 *
 * 负责根据全局过滤器（globalTaskFilter）筛选插件所关注的任务行。
 * 全局过滤器是用户配置的任务前缀，用于区分需要管理的任务和普通任务。
 *
 * @fileoverview 任务行筛选逻辑
 * @module tasks/taskParser/step2
 */

import { escapeRegExp } from './utils';

// ==================== 类型定义 ====================

/**
 * 筛选结果
 * 包含是否通过筛选和移除过滤器后的内容
 */
export interface FilterResult {
    /** 是否通过全局过滤器 */
    passes: boolean;

    /** 移除全局过滤器前缀后的内容 */
    contentWithoutFilter: string;
}

// ==================== 主要函数 ====================

/**
 * 判断任务是否通过全局过滤器
 *
 * 全局过滤器是用户配置的任务前缀（如 "🎯 "），只有以该前缀开头的任务才会被插件管理。
 * 如果未配置全局过滤器，则所有任务都通过筛选。
 *
 * @param content - 任务内容（复选框后的部分）
 * @param globalTaskFilter - 全局任务过滤器前缀（可选）
 * @returns 是否通过筛选
 *
 * @example
 * ```ts
 * // 配置了全局过滤器 "🎯 "
 * passesGlobalFilter("🎯 重要任务", "🎯 ")           // true
 * passesGlobalFilter("  🎯 重要任务", "🎯 ")         // true（忽略前导空格）
 * passesGlobalFilter("普通任务", "🎯 ")             // false
 *
 * // 未配置全局过滤器
 * passesGlobalFilter("任何任务")                    // true
 * passesGlobalFilter("", undefined)                 // true
 * ```
 */
export function passesGlobalFilter(content: string, globalTaskFilter?: string): boolean {
    if (!globalTaskFilter) return true;

    const trimmedContent = content.trim();
    const trimmedFilter = globalTaskFilter.trim();  // 【修复】添加 trim，防御性处理
    return trimmedContent.startsWith(trimmedFilter);
}

/**
 * 从任务内容中移除全局过滤器前缀
 *
 * 提取纯任务内容，移除全局过滤器前缀。
 *
 * @param content - 原始任务内容
 * @param globalTaskFilter - 全局任务过滤器前缀（可选）
 * @returns 移除过滤器后的内容
 *
 * @example
 * ```ts
 * removeGlobalFilter("🎯 完成项目 ⏫", "🎯 ")
 * // 返回: "完成项目 ⏫"
 *
 * removeGlobalFilter("🎯🎯 任务", "🎯 ")
 * // 返回: "🎯 任务"（只移除一次）
 *
 * removeGlobalFilter("普通任务", "🎯 ")
 * // 返回: "普通任务"（无变化）
 * ```
 */
export function removeGlobalFilter(content: string, globalTaskFilter?: string): string {
    if (!globalTaskFilter) return content;

    const trimmedFilter = globalTaskFilter.trim();  // 【修复】添加 trim，与 passesGlobalFilter 保持一致
    const escapedFilter = escapeRegExp(trimmedFilter);
    return content.replace(new RegExp(`^\\s*${escapedFilter}\\s*`), '');
}

/**
 * 组合筛选和移除过滤器操作
 *
 * 一次性完成筛选判断和内容提取，避免重复计算。
 *
 * @param content - 原始任务内容
 * @param globalTaskFilter - 全局任务过滤器前缀（可选）
 * @returns 筛选结果对象
 *
 * @example
 * ```ts
 * applyFilter("🎯 重要任务 📅 2024-01-15", "🎯 ")
 * // 返回: { passes: true, contentWithoutFilter: "重要任务 📅 2024-01-15" }
 *
 * applyFilter("普通任务", "🎯 ")
 * // 返回: { passes: false, contentWithoutFilter: "普通任务" }
 * ```
 */
export function applyFilter(content: string, globalTaskFilter?: string): FilterResult {
    if (!globalTaskFilter) {
        return { passes: true, contentWithoutFilter: content };
    }

    const passes = passesGlobalFilter(content, globalTaskFilter);
    const contentWithoutFilter = removeGlobalFilter(content, globalTaskFilter);

    return { passes, contentWithoutFilter };
}

/**
 * 批量筛选任务
 *
 * 对多个任务内容进行批量筛选。
 *
 * @param contents - 任务内容数组
 * @param globalTaskFilter - 全局任务过滤器前缀（可选）
 * @returns 通过筛选的任务内容数组
 *
 * @example
 * ```ts
 * const tasks = [
 *   "🎯 任务1",
 *   "普通任务",
 *   "🎯 任务2"
 * ];
 * filterTasks(tasks, "🎯 ")
 * // 返回: ["任务1", "任务2"]
 * ```
 */
export function filterTasks(contents: string[], globalTaskFilter?: string): string[] {
    if (!globalTaskFilter) return contents;

    return contents
        .filter(content => passesGlobalFilter(content, globalTaskFilter!))
        .map(content => removeGlobalFilter(content, globalTaskFilter!));
}
