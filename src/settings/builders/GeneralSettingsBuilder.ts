import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';

/**
 * 基本设置构建器
 */
export class GeneralSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup('基本设置', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 默认视图（组合下拉：视图类型 + 周模式）
			addSetting(setting => {
				// 将 defaultView + defaultWeekMode 合并为一个组合值
				const getCurrentCombo = (): string => {
					const view = this.plugin.settings.defaultView;
					if (view === 'week') {
						return this.plugin.settings.defaultWeekMode === 'rolling7' ? 'rolling7' : 'week';
					}
					return view;
				};

				setting.setName('默认视图')
					.setDesc('打开插件时默认显示的视图')
					.addDropdown(drop => drop
						.addOptions({
							'rolling7': '今天起7天',
							'week': '周视图',
							'month': '月视图',
							'task': '任务视图',
						})
						.setValue(getCurrentCombo())
						.onChange(async (value) => {
							if (value === 'rolling7') {
								this.plugin.settings.defaultView = 'week';
								this.plugin.settings.defaultWeekMode = 'rolling7';
							} else {
								this.plugin.settings.defaultView = value as 'week' | 'month' | 'task';
								this.plugin.settings.defaultWeekMode = 'standard';
							}
							await this.saveAndRefresh();
						}));
			});

			// 一周开始于
			addSetting(setting =>
				setting.setName('一周开始于')
					.setDesc('选择一周的起始日')
					.addDropdown(drop => {
						drop.addOptions({ 'monday': '周一', 'sunday': '周日' });
						drop.setValue(this.plugin.settings.startOnMonday ? 'monday' : 'sunday');
						drop.onChange(async (value) => {
							this.plugin.settings.startOnMonday = (value === 'monday');
							await this.saveAndRefresh();
						});
					})
			);

			// 开发者模式
			addSetting(setting =>
				setting.setName('开发者模式')
					.setDesc('启用后将输出详细的调试日志到控制台')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.enableDebugMode)
						.onChange(async (value) => {
							this.plugin.settings.enableDebugMode = value;
							await this.saveAndRefresh();
						}))
			);
		});
	}
}
