/**
 * 任务搜索模块（适配器）
 *
 * 从插件的 TaskStore 获取任务，不再扫描 Markdown 文件。
 */
import { App } from 'obsidian';
import { GCTask } from '../types';

/**
 * 从 TaskStore 获取所有任务
 */
export async function searchTasks(app: App): Promise<GCTask[]> {
	const plugin = (app as any).plugins?.plugins?.['gantt-calendar'];
	if (!plugin?.taskCache) return [];
	return plugin.taskCache.getAllTasks();
}
