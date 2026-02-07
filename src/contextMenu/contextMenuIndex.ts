/**
 * @fileoverview 右键菜单注册
 * @module contextMenu/contextMenuIndex
 */

import { App, Menu } from 'obsidian';
import type GanttCalendarPlugin from '../../main';
import type { GCTask } from '../types';
import { createNoteFromTask } from './commands/createNoteFromTask';
import { createNoteFromTaskAlias } from './commands/createNoteFromTaskAlias';
import { openEditTaskModal } from '../modals/EditTaskModal';
import { deleteTask } from './commands/deleteTask';
import { cancelTask } from './commands/cancelTask';
import { restoreTask } from './commands/restoreTask';
import { setTaskPriority } from './commands/setPriority';
import { postponeTask } from './commands/postponeTask';

/**
 * 注册任务右键菜单
 * @param taskElement 任务元素
 * @param task 任务对象
 * @param app Obsidian App 实例
 * @param plugin 插件实例
 * @param defaultNotePath 默认笔记路径
 * @param onRefresh 刷新回调
 */
export function registerTaskContextMenu(
	taskElement: HTMLElement,
	task: GCTask,
	app: App,
	plugin: GanttCalendarPlugin,
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
					openEditTaskModal(app, plugin, task, () => {
						onRefresh();
					});
				});
		});

		// 分隔线
		menu.addSeparator();

		// 创建任务笔记:同名
		menu.addItem((item) => {
			item
				.setTitle('创建任务笔记:同名')
				.setIcon('file-plus')
				.onClick(() => {
					createNoteFromTask(app, task, defaultNotePath);
				});
		});

		// 创建任务笔记:别名
		menu.addItem((item) => {
			item
				.setTitle('创建任务笔记:别名')
				.setIcon('file-plus')
				.onClick(() => {
					createNoteFromTaskAlias(app, task, defaultNotePath);
				});
		});

		// 分隔线
		menu.addSeparator();

		// 优先级设置（三级）
		const priorities: Array<{ value: 'high' | 'normal' | 'low', label: string, icon: string }> = [
			{ value: 'high', label: '高', icon: '🔴' },
			{ value: 'normal', label: '普通', icon: '⚪' },
			{ value: 'low', label: '低', icon: '🔵' },
		];

		priorities.forEach(p => {
			menu.addItem((item) => {
				item.setTitle(`${p.icon} ${p.label}`).onClick(() => {
					setTaskPriority(app, task, p.value, onRefresh);
				});
			});
		});

		// 分隔线
		menu.addSeparator();

		// 任务延期
		const postponeOptions = [
			{ days: 1, label: '延期 1 天' },
			{ days: 3, label: '延期 3 天' },
			{ days: 7, label: '延期 7 天' },
		];

		const setDueDateOptions = [
			{ days: 1, label: '延期到明天' },
			{ days: 3, label: '延期到3天后' },
			{ days: 7, label: '延期到7天后' },
		];

		postponeOptions.forEach(option => {
			menu.addItem((item) => {
				item.setTitle(option.label).setIcon('calendar-clock').onClick(() => {
					postponeTask(app, task, option.days, onRefresh, false);
				});
			});
		});

		setDueDateOptions.forEach(option => {
			menu.addItem((item) => {
				item.setTitle(option.label).setIcon('calendar-check').onClick(() => {
					postponeTask(app, task, option.days, onRefresh, true);
				});
			});
		});

		// 分隔线
		menu.addSeparator();

		// 取消/恢复任务
		const isCancelled = task.cancelled === true;
		menu.addItem((item) => {
			item
				.setTitle(isCancelled ? '恢复任务' : '取消任务')
				.setIcon(isCancelled ? 'rotate-ccw' : 'x')
				.onClick(() => {
					if (isCancelled) {
						restoreTask(app, task, onRefresh);
					} else {
						cancelTask(app, task, onRefresh);
					}
				});
		});

		// 删除任务
		menu.addItem((item) => {
			item
				.setTitle('删除任务')
				.setIcon('trash')
				.onClick(() => {
					deleteTask(app, task, onRefresh);
				});
		});

		menu.showAtMouseEvent(e);
	});
}
