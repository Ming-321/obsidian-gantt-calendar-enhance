import { Setting, SettingGroup } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';
import type { SortField, SortOrder } from '../../types';

/**
 * 排序字段选项
 */
const SORT_FIELD_OPTIONS: Record<string, string> = {
	'priority': '优先级',
	'dueDate': '截止日期',
	'createdDate': '创建日期',
	'startDate': '开始日期',
	'description': '任务名称',
};

const SORT_ORDER_OPTIONS: Record<string, string> = {
	'asc': '升序',
	'desc': '降序',
};

/**
 * 月视图设置构建器
 */
export class MonthViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup('月视图', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 主排序
			addSetting(setting =>
				setting.setName('主排序')
					.setDesc('月视图中任务的主要排序方式')
					.addDropdown(drop => drop
						.addOptions(SORT_FIELD_OPTIONS)
						.setValue(this.plugin.settings.monthViewSortField)
						.onChange(async (value) => {
							this.plugin.settings.monthViewSortField = value as SortField;
							await this.saveAndRefresh();
						}))
					.addDropdown(drop => drop
						.addOptions(SORT_ORDER_OPTIONS)
						.setValue(this.plugin.settings.monthViewSortOrder)
						.onChange(async (value) => {
							this.plugin.settings.monthViewSortOrder = value as SortOrder;
							await this.saveAndRefresh();
						}))
			);

			// 次排序
			addSetting(setting =>
				setting.setName('次排序')
					.setDesc('主排序值相同时的二级排序规则')
					.addDropdown(drop => drop
						.addOptions(SORT_FIELD_OPTIONS)
						.setValue(this.plugin.settings.monthViewSecondarySortField || 'priority')
						.onChange(async (value) => {
							this.plugin.settings.monthViewSecondarySortField = value as SortField;
							await this.saveAndRefresh();
						}))
					.addDropdown(drop => drop
						.addOptions(SORT_ORDER_OPTIONS)
						.setValue(this.plugin.settings.monthViewSecondarySortOrder || 'desc')
						.onChange(async (value) => {
							this.plugin.settings.monthViewSecondarySortOrder = value as SortOrder;
							await this.saveAndRefresh();
						}))
			);
		});
	}
}
