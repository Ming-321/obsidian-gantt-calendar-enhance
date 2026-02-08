import { App, PluginSettingTab, type IconName } from 'obsidian';
import type GanttCalendarPlugin from '../../main';
import { GeneralSettingsBuilder } from './builders/GeneralSettingsBuilder';
import { WeekViewSettingsBuilder } from './builders/WeekViewSettingsBuilder';
import { MonthViewSettingsBuilder } from './builders/MonthViewSettingsBuilder';
import { GitHubSyncSettingsBuilder } from './builders/GitHubSyncSettingsBuilder';

/**
 * Gantt Calendar Plugin Settings Tab
 *
 * 单页面布局，按功能分组
 */
export class GanttCalendarSettingTab extends PluginSettingTab {
	plugin: GanttCalendarPlugin;

	constructor(app: App, plugin: GanttCalendarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	override icon: IconName = 'calendar-days';

	display(): void {
		const { containerEl } = this;
		containerEl.empty();

		const refreshCallback = () => {
			this.display();
		};

		// ===== 基本设置 =====
		new GeneralSettingsBuilder({
			containerEl,
			plugin: this.plugin,
			onRefreshSettings: refreshCallback,
		}).render();

		// ===== 周视图设置 =====
		new WeekViewSettingsBuilder({
			containerEl,
			plugin: this.plugin,
			onRefreshSettings: refreshCallback,
		}).render();

		// ===== 月视图设置 =====
		new MonthViewSettingsBuilder({
			containerEl,
			plugin: this.plugin,
			onRefreshSettings: refreshCallback,
		}).render();

		// ===== GitHub 同步 =====
		new GitHubSyncSettingsBuilder({
			containerEl,
			plugin: this.plugin,
			onRefreshSettings: refreshCallback,
		}).render();
	}
}
