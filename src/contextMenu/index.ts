import { App, Menu } from 'obsidian';
import type { GanttTask } from '../types';
import { setTaskStartDate } from './commands/setStartDate';
import { setTaskDueDate } from './commands/setDueDate';
import { setTaskScheduledDate } from './commands/setScheduledDate';
import { setTaskCompletionDate } from './commands/setCompletionDate';
import { cancelTask } from './commands/cancelTask';
import { createNoteFromTask } from './commands/createNoteFromTask';

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

		// 设置开始日期
		menu.addItem((item) => {
			item
				.setTitle('设置开始日期')
				.setIcon('calendar-plus')
				.onClick(() => {
					setTaskStartDate(app, task, enabledFormats, onRefresh);
				});
		});

		// 设置截止日期
		menu.addItem((item) => {
			item
				.setTitle('设置截止日期')
				.setIcon('calendar-check')
				.onClick(() => {
					setTaskDueDate(app, task, enabledFormats, onRefresh);
				});
		});

		// 设置计划日期
		menu.addItem((item) => {
			item
				.setTitle('设置计划日期')
				.setIcon('calendar-clock')
				.onClick(() => {
					setTaskScheduledDate(app, task, enabledFormats, onRefresh);
				});
		});

		// 设置完成日期
		menu.addItem((item) => {
			item
				.setTitle('设置完成日期')
				.setIcon('check-circle')
				.onClick(() => {
					setTaskCompletionDate(app, task, enabledFormats, onRefresh);
				});
		});

		menu.addSeparator();

		// 取消任务
		menu.addItem((item) => {
			item
				.setTitle('取消任务')
				.setIcon('x-circle')
				.onClick(() => {
					cancelTask(app, task, enabledFormats, onRefresh);
				});
		});

		menu.addSeparator();

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
