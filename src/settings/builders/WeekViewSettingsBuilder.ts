import { Setting, SettingGroup, Notice, setIcon } from 'obsidian';
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

		// 学期起始日管理
		this.renderSemesterSettings();
	}

	/**
	 * 渲染学期起始日管理区域
	 */
	private renderSemesterSettings(): void {
		this.createSettingGroup('学期周数设置', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// 说明
			addSetting(setting =>
				setting.setName('学期起始日')
					.setDesc('添加学期起始日期后，周视图标题将显示相对于学期开始的周数（如「第3周」）。为空则使用自然年周数。')
			);

			// 新增日期输入
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
								// 验证格式
								if (!/^\d{4}-\d{2}-\d{2}$/.test(inputValue)) {
									new Notice('日期格式不正确，请使用 YYYY-MM-DD');
									return;
								}
								// 验证是否为有效日期
								const parts = inputValue.split('-');
								const date = new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
								if (isNaN(date.getTime())) {
									new Notice('无效的日期');
									return;
								}
								// 验证不能晚于今天
								const today = new Date();
								today.setHours(23, 59, 59, 999);
								if (date.getTime() > today.getTime()) {
									new Notice('起始日期不能晚于今天');
									return;
								}
								// 检查是否重复
								if (!this.plugin.settings.semesterStartDates) {
									this.plugin.settings.semesterStartDates = [];
								}
								if (this.plugin.settings.semesterStartDates.includes(inputValue)) {
									new Notice('该日期已存在');
									return;
								}
								// 添加并排序
								this.plugin.settings.semesterStartDates.push(inputValue);
								this.plugin.settings.semesterStartDates.sort();
								await this.saveAndRefresh();
								new Notice(`已添加学期起始日: ${inputValue}`);
								this.refreshSettingsPanel();
							});
					});
			});

			// 已有日期列表（倒序显示）
			const dates = this.plugin.settings.semesterStartDates || [];
			const sortedDates = [...dates].sort().reverse();

			if (sortedDates.length > 0) {
				sortedDates.forEach(dateStr => {
					addSetting(setting => {
						setting.setName(dateStr)
							.setDesc(this.getSemesterLabel(dateStr))
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

	/**
	 * 生成学期标签描述
	 */
	private getSemesterLabel(dateStr: string): string {
		const parts = dateStr.split('-');
		if (parts.length !== 3) return '';
		const month = parseInt(parts[1]);
		// 简单判断：7-12月为秋季学期，1-6月为春季学期
		const season = month >= 7 ? '秋季学期' : '春季学期';
		return `${parts[0]}年${season}`;
	}
}
