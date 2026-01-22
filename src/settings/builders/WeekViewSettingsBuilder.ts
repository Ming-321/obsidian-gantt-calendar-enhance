import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';

/**
 * 周视图设置构建器
 */
export class WeekViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// 使用 SettingGroup 替代 h2 标题（兼容旧版本）
		this.createSettingGroup('周视图设置', (group) => {
			// 统一添加设置项的方法
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 任务卡片显示复选框
			addSetting(setting =>
				setting.setName('显示复选框')
					.setDesc('在周视图任务卡片中显示任务复选框')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.weekViewShowCheckbox)
						.onChange(async (value) => {
							this.plugin.settings.weekViewShowCheckbox = value;
							await this.saveAndRefresh();
						}))
			);

			// 任务卡片显示标签
			addSetting(setting =>
				setting.setName('显示任务标签')
					.setDesc('在周视图任务卡片中显示任务标签')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.weekViewShowTags)
						.onChange(async (value) => {
							this.plugin.settings.weekViewShowTags = value;
							await this.saveAndRefresh();
						}))
			);

			// 任务卡片显示优先级
			addSetting(setting =>
				setting.setName('显示任务优先级')
					.setDesc('在周视图任务卡片中显示任务优先级图标')
					.addToggle(toggle => toggle
						.setValue(this.plugin.settings.weekViewShowPriority)
						.onChange(async (value) => {
							this.plugin.settings.weekViewShowPriority = value;
							await this.saveAndRefresh();
						}))
			);
		});
	}
}
