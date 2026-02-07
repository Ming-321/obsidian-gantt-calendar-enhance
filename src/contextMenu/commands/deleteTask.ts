import { App, Notice } from 'obsidian';
import type { GCTask } from '../../types';
import { Logger } from '../../utils/logger';

/**
 * 删除任务
 * 从任务缓存中删除任务
 * @param app Obsidian App 实例
 * @param task 要删除的任务
 * @param onRefresh 刷新回调
 */
export async function deleteTask(
	app: App,
	task: GCTask,
	onRefresh: () => void
): Promise<void> {
	try {
		// 获取 TaskStore 实例
		const plugin = (app as any).plugins?.plugins?.['gantt-calendar'];
		if (!plugin?.taskCache) {
			Logger.error('deleteTask', 'TaskStore not available');
			new Notice('无法访问任务存储');
			return;
		}

		await plugin.taskCache.deleteTask(task.id);
		new Notice('任务已删除');
		onRefresh();
	} catch (error) {
		Logger.error('deleteTask', 'Failed to delete task:', error);
		new Notice('删除任务失败');
	}
}
