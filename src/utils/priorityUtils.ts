/**
 * @fileoverview 优先级工具函数（集中管理）
 * @module utils/priorityUtils
 *
 * 统一管理优先级相关的图标、标签、CSS 类名和排序权重。
 * 所有需要优先级相关逻辑的模块应从此处导入，避免重复实现。
 */

import type { TaskPriority } from '../types';

/**
 * 优先级排序权重（数值越大优先级越高）
 * 配合降序（desc）使用时高优先级排在前面
 */
export const PRIORITY_WEIGHTS: Record<TaskPriority, number> = {
	high: 3,
	normal: 2,
	low: 1,
};

/**
 * 获取优先级排序权重
 */
export function getPriorityWeight(priority?: string): number {
	return PRIORITY_WEIGHTS[priority as TaskPriority] ?? 2; // 默认 normal
}

/**
 * 获取优先级图标
 * @deprecated 图标由 StatusIcon 组件渲染，此函数保留用于右键菜单等场景
 */
export function getPriorityIcon(priority?: string): string {
	switch (priority) {
		case 'high': return '🔴';
		case 'normal': return '⚪';
		case 'low': return '🔵';
		default: return '';
	}
}

/**
 * 获取优先级颜色 CSS 变量名
 * @param priority 优先级
 * @returns CSS 变量名字符串（可直接用于 style 属性）
 */
export function getPriorityColor(priority?: string): string {
	switch (priority) {
		case 'high': return 'var(--gc-priority-high)';
		case 'low': return 'var(--gc-priority-low)';
		default: return 'var(--gc-priority-normal)';
	}
}

/**
 * 获取优先级对应的色带修饰符 CSS 类名后缀
 * @param priority 优先级
 * @returns 'band-high' | 'band-normal' | 'band-low'
 */
export function getPriorityBandClass(priority?: string): string {
	switch (priority) {
		case 'high': return 'band-high';
		case 'low': return 'band-low';
		default: return 'band-normal';
	}
}

/**
 * 获取优先级标签
 */
export function getPriorityLabel(priority?: string): string {
	switch (priority) {
		case 'high': return '重要';
		case 'normal': return '正常';
		case 'low': return '不重要';
		default: return '正常';
	}
}

/**
 * 获取优先级 CSS 类名（用于 tooltip 等场景）
 */
export function getPriorityClass(priority?: string): string {
	switch (priority) {
		case 'high': return 'priority-high';
		case 'normal': return 'priority-normal';
		case 'low': return 'priority-low';
		default: return '';
	}
}

/**
 * 将旧的六级优先级迁移到三级
 * highest/high → high, medium/normal → normal, low/lowest → low
 */
export function migratePriority(priority?: string): TaskPriority {
	switch (priority) {
		case 'highest':
		case 'high':
			return 'high';
		case 'low':
		case 'lowest':
			return 'low';
		default: // medium, normal, undefined
			return 'normal';
	}
}
