import { Notice } from 'obsidian';
import { GC_VIEW_ID } from '../GCMainView';
import { CreateTaskModal } from '../modals/CreateTaskModal';
import { GitHubSetupWizard } from '../modals/GitHubSetupWizard';
import type GanttCalendarPlugin from '../../main';

/**
 * 注册简单命令（通用功能）
 * @param plugin 插件实例
 */
export function registerCommonCommands(plugin: GanttCalendarPlugin): void {
	// 打开日历视图
	plugin.addCommand({
		id: 'open-calendar-view',
		name: '打开日历视图',
		callback: async () => {
			await plugin.activateView();
			const leaf = plugin.app.workspace.getLeavesOfType(GC_VIEW_ID)[0];
			const view = leaf?.view as any;
			if (view?.switchView) {
				view.switchView('month');
			}
		}
	});

	// 打开任务视图
	plugin.addCommand({
		id: 'open-task-view',
		name: '打开任务视图',
		callback: async () => {
			await plugin.activateView();
			const leaf = plugin.app.workspace.getLeavesOfType(GC_VIEW_ID)[0];
			const view = leaf?.view as any;
			if (view?.switchView) {
				view.switchView('task');
			}
		}
	});

	// 创建新待办
	plugin.addCommand({
		id: 'create-todo',
		name: '创建新待办',
		callback: () => {
			new CreateTaskModal({
				app: plugin.app,
				plugin,
				defaultType: 'todo',
				onSuccess: () => plugin.refreshCalendarViews(),
			}).open();
		}
	});

	// 创建新提醒
	plugin.addCommand({
		id: 'create-reminder',
		name: '创建新提醒',
		callback: () => {
			new CreateTaskModal({
				app: plugin.app,
				plugin,
				defaultType: 'reminder',
				onSuccess: () => plugin.refreshCalendarViews(),
			}).open();
		}
	});

	// 创建新任务（通用）
	plugin.addCommand({
		id: 'create-task',
		name: '创建新任务',
		callback: () => {
			new CreateTaskModal({
				app: plugin.app,
				plugin,
				onSuccess: () => plugin.refreshCalendarViews(),
			}).open();
		}
	});

	// GitHub 同步设置
	plugin.addCommand({
		id: 'github-sync-setup',
		name: 'GitHub 同步设置向导',
		callback: () => {
			new GitHubSetupWizard(plugin.app, plugin).open();
		}
	});

	// 手动推送到 GitHub
	plugin.addCommand({
		id: 'github-sync-push',
		name: '立即推送任务到 GitHub',
		callback: async () => {
			try {
				await plugin.taskCache.pushToGitHubNow();
				new Notice('推送成功！');
			} catch (error) {
				new Notice('推送失败: ' + (error as Error).message);
			}
		}
	});

}
