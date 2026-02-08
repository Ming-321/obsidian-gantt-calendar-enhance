/**
 * @fileoverview 任务排序逻辑模块
 * @module tasks/taskSorter
 *
 * 支持主排序 + 次排序的二级排序机制
 */

import type { GCTask, SortField, SortOrder, SortState } from '../types';
import { getPriorityWeight } from '../utils/priorityUtils';

/**
 * 排序选项配置
 */
export const SORT_OPTIONS: Array<{ field: SortField; icon: string; label: string }> = [
	{ field: 'priority', icon: '🔺', label: '优先级' },
	{ field: 'description', icon: '🔤', label: '字母排序' },
	{ field: 'createdDate', icon: '➕', label: '创建时间' },
	{ field: 'startDate', icon: '🛫', label: '开始时间' },
	{ field: 'dueDate', icon: '📅', label: '截止时间' },
	{ field: 'completionDate', icon: '✅', label: '完成时间' },
];

// 优先级权重已集中到 src/utils/priorityUtils.ts

/**
 * 比较可选日期（不含二级兜底）
 * @returns 0 表示相等，正数 a 大于 b，负数 a 小于 b
 */
function compareDatesRaw(a: Date | undefined, b: Date | undefined): number {
	if (!a && !b) return 0;
	if (!a) return 1;  // 无日期排在后面
	if (!b) return -1;
	return a.getTime() - b.getTime();
}

/**
 * 各字段的比较函数（纯比较，不含二级排序）
 * 返回 0 表示在此字段上相等
 */
const comparators: Record<SortField, (a: GCTask, b: GCTask) => number> = {
	priority: (a, b) => {
		return getPriorityWeight(a.priority) - getPriorityWeight(b.priority);
	},
	description: (a, b) => {
		return a.description.localeCompare(b.description, 'zh-CN', { numeric: true });
	},
	createdDate: (a, b) => compareDatesRaw(a.createdDate, b.createdDate),
	startDate: (a, b) => compareDatesRaw(a.startDate, b.startDate),
	dueDate: (a, b) => compareDatesRaw(a.dueDate, b.dueDate),
	completionDate: (a, b) => compareDatesRaw(a.completionDate, b.completionDate),
};

/**
 * 对任务数组进行排序（支持主排序 + 次排序）
 * @param tasks 任务数组
 * @param state 排序状态（含可选的 secondary）
 * @returns 排序后的新数组（不修改原数组）
 */
export function sortTasks(tasks: GCTask[], state: SortState): GCTask[] {
	const primaryComparator = comparators[state.field];
	if (!primaryComparator) return tasks;

	const secondaryComparator = state.secondary ? comparators[state.secondary.field] : null;
	const secondaryOrder = state.secondary?.order ?? 'asc';

	const sorted = [...tasks];
	sorted.sort((a, b) => {
		// 主排序
		let result = primaryComparator(a, b);
		if (state.order === 'desc') result = -result;

		// 主排序相等时，使用次排序
		if (result === 0 && secondaryComparator) {
			let secondaryResult = secondaryComparator(a, b);
			if (secondaryOrder === 'desc') secondaryResult = -secondaryResult;
			result = secondaryResult;
		}

		// 两级都相等时，按类型排序（待办在前，提醒在后）
		if (result === 0) {
			const typeA = a.type === 'reminder' ? 1 : 0;
			const typeB = b.type === 'reminder' ? 1 : 0;
			result = typeA - typeB;
		}

		// 类型也相等时，按描述文本兜底
		if (result === 0) {
			result = a.description.localeCompare(b.description, 'zh-CN', { numeric: true });
		}

		return result;
	});
	return sorted;
}

/**
 * 获取排序状态的显示文本
 */
export function getSortDisplayText(state: SortState): string {
	const option = SORT_OPTIONS.find(o => o.field === state.field);
	if (!option) return '📊';
	const arrow = state.order === 'asc' ? '⬆️' : '⬇️';
	return `${option.icon}${arrow}`;
}

/**
 * 更新排序状态
 */
export function updateSortState(current: SortState, newField: SortField): SortState {
	if (current.field === newField) {
		return { ...current, field: newField, order: current.order === 'asc' ? 'desc' : 'asc' };
	}
	return { ...current, field: newField, order: 'asc' };
}
