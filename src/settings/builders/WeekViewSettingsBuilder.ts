import { Setting, SettingGroup, Notice } from 'obsidian';
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
 * 周视图设置构建器
 */
export class WeekViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		this.createSettingGroup('周视图', (group) => {
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
					.setDesc('周视图中任务的主要排序方式')
					.addDropdown(drop => drop
						.addOptions(SORT_FIELD_OPTIONS)
						.setValue(this.plugin.settings.weekViewSortField)
						.onChange(async (value) => {
							this.plugin.settings.weekViewSortField = value as SortField;
							await this.saveAndRefresh();
						}))
					.addDropdown(drop => drop
						.addOptions(SORT_ORDER_OPTIONS)
						.setValue(this.plugin.settings.weekViewSortOrder)
						.onChange(async (value) => {
							this.plugin.settings.weekViewSortOrder = value as SortOrder;
							await this.saveAndRefresh();
						}))
			);

			// 次排序
			addSetting(setting =>
				setting.setName('次排序')
					.setDesc('主排序值相同时的二级排序规则')
					.addDropdown(drop => drop
						.addOptions(SORT_FIELD_OPTIONS)
						.setValue(this.plugin.settings.weekViewSecondarySortField || 'dueDate')
						.onChange(async (value) => {
							this.plugin.settings.weekViewSecondarySortField = value as SortField;
							await this.saveAndRefresh();
						}))
					.addDropdown(drop => drop
						.addOptions(SORT_ORDER_OPTIONS)
						.setValue(this.plugin.settings.weekViewSecondarySortOrder || 'asc')
						.onChange(async (value) => {
							this.plugin.settings.weekViewSecondarySortOrder = value as SortOrder;
							await this.saveAndRefresh();
						}))
			);
		});

		// 学期起始日管理
		this.renderSemesterSettings();
	}

	/**
	 * 渲染学期起始日管理区域
	 */
	private renderSemesterSettings(): void {
		this.createSettingGroup('学期周数', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			addSetting(setting =>
				setting.setName('学期起始日')
					.setDesc('添加后周视图标题将显示学期周数（如「第3周」），为空则使用自然年周数')
			);

			addSetting(setting => {
				let inputValue = '';
				setting.setName('添加起始日期')
					.setDesc('格式：YYYY-MM-DD，不能晚于今天')
					.addText(text => {
						text.setPlaceholder('例如 2025-09-01')
							.onChange(value => { inputValue = value.trim(); });
					})
					.addButton(btn => {
						btn.setButtonText('添加')
							.setCta()
							.onClick(async () => {
								if (!inputValue) {
									new Notice('请输入日期');
									return;
								}
								if (!/^\d{4}-\d{2}-\d{2}$/.test(inputValue)) {
									new Notice('日期格式不正确，请使用 YYYY-MM-DD');
									return;
								}
								const parts = inputValue.split('-');
								const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
								if (isNaN(date.getTime())) {
									new Notice('无效的日期');
									return;
								}
								const today = new Date();
								today.setHours(23, 59, 59, 999);
								if (date.getTime() > today.getTime()) {
									new Notice('起始日期不能晚于今天');
									return;
								}
								if (!this.plugin.settings.semesterStartDates) {
									this.plugin.settings.semesterStartDates = [];
								}
								if (this.plugin.settings.semesterStartDates.includes(inputValue)) {
									new Notice('该日期已存在');
									return;
								}
								this.plugin.settings.semesterStartDates.push(inputValue);
								this.plugin.settings.semesterStartDates.sort();
								await this.saveAndRefresh();
								new Notice(`已添加学期起始日: ${inputValue}`);
								this.refreshSettingsPanel();
							});
					});
			});

			const dates = this.plugin.settings.semesterStartDates || [];
			const sortedDates = [...dates].sort().reverse();

			if (sortedDates.length > 0) {
				sortedDates.forEach(dateStr => {
					addSetting(setting => {
						const month = parseInt(dateStr.split('-')[1]);
						const year = dateStr.split('-')[0];
						const season = month >= 7 ? '秋季学期' : '春季学期';
						setting.setName(dateStr)
							.setDesc(`${year}年${season}`)
							.addButton(btn => {
								btn.setButtonText('删除')
									.setWarning()
									.onClick(async () => {
										this.plugin.settings.semesterStartDates =
											this.plugin.settings.semesterStartDates.filter((d: string) => d !== dateStr);
										await this.saveAndRefresh();
										new Notice(`已删除: ${dateStr}`);
										this.refreshSettingsPanel();
									});
							});
					});
				});
			}
		});
	}
}
