/**
 * 任务工具函数模块
 *
 * 提供任务对象的比较与日期处理工具：
 * - dateValue: 获取日期的时间戳（用于比较）
 * - areTasksEqual: 判断两个任务数组内容是否完全一致（用于缓存、变更检测）
 */
import { GCTask } from '../types';

export function dateValue(d?: Date): number | undefined {
	return d ? d.getTime() : undefined;
}

export function areTasksEqual(a: GCTask[], b: GCTask[]): boolean {
	if (a.length !== b.length) return false;
	for (let i = 0; i < a.length; i++) {
		const ta = a[i];
		const tb = b[i];
		if (ta.id !== tb.id) return false;
		if (ta.type !== tb.type) return false;
		if (ta.description !== tb.description) return false;
		if (ta.completed !== tb.completed) return false;
		if ((ta.priority || '') !== (tb.priority || '')) return false;
		if (ta.archived !== tb.archived) return false;
		if (dateValue(ta.createdDate) !== dateValue(tb.createdDate)) return false;
		if (dateValue(ta.startDate) !== dateValue(tb.startDate)) return false;
		if (dateValue(ta.dueDate) !== dateValue(tb.dueDate)) return false;
		if (dateValue(ta.cancelledDate) !== dateValue(tb.cancelledDate)) return false;
		if (dateValue(ta.completionDate) !== dateValue(tb.completionDate)) return false;
	}
	return true;
}
