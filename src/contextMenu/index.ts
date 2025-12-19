import { App, Menu } from 'obsidian';
import type { GanttTask } from '../types';
import { createNoteFromTask } from './commands/createNoteFromTask';
import { openEditTaskModal } from './commands/editTask';

/**
 * 注册任务右键菜单
 * @param taskElement 任务元素
 * @param task 任务对象
 * @param app Obsidian App 实例
 * @param enabledFormats 启用的任务格式
 * @param defaultNotePath 默认笔记路径
 * @param onRefresh 刷新回调
 */
export function registerTaskContextMenu(
	taskElement: HTMLElement,
	task: GanttTask,
	app: App,
	enabledFormats: string[],
	defaultNotePath: string,
	onRefresh: () => void
): void {
	taskElement.addEventListener('contextmenu', (e: MouseEvent) => {
		e.preventDefault();
		e.stopPropagation();

		const menu = new Menu();

		// 编辑任务（统一模态框）
		menu.addItem((item) => {
			item
				.setTitle('编辑任务')
				.setIcon('pencil')
				.onClick(() => {
					openEditTaskModal(app, task, enabledFormats, () => {
						onRefresh();
					});
				});
		});

		// 创建任务同名文件
		menu.addItem((item) => {
			item
				.setTitle('创建任务同名笔记')
				.setIcon('file-plus')
				.onClick(() => {
					createNoteFromTask(app, task, defaultNotePath);
				});
		});

		menu.showAtMouseEvent(e);
	});
}
