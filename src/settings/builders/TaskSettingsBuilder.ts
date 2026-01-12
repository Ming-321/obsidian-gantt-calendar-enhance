import { Setting } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { TaskStatusCard } from '../components';
import { AddCustomStatusModal } from '../modals';
import type { BuilderConfig } from '../types';
import type { TaskStatus } from '../../tasks/taskStatus';

/**
 * 任务设置构建器
 * 包含任务创建设置和任务状态设置
 */
export class TaskSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// ===== 任务设置 =====
		this.containerEl.createEl('h1', { text: '任务设置' });

		// 全局任务筛选标记
		new Setting(this.containerEl)
			.setName('全局任务筛选标记(修改此设置后需重启 Obsidian 生效)')
			.setDesc('用于标记任务的前缀符号或文字（如 "🎯 ", "TODO ", "#task "）')
			.addText(text => text
				.setPlaceholder('空则不使用筛选')
				.setValue(this.plugin.settings.globalTaskFilter)
				.onChange(async (value) => {
					this.plugin.settings.globalTaskFilter = value.trim();  // 【修复】添加 trim
					await this.saveAndRefresh();
				}));

		// 启用的任务格式
		new Setting(this.containerEl)
			.setName('启用的任务格式')
			.setDesc('选择要支持的任务格式（Tasks 插件或 Dataview 插件）')
			.addDropdown(drop => {
				drop.addOptions({
					'tasks': 'Tasks 插件格式（使用 emoji 表示日期）',
					'dataview': 'Dataview 插件格式（使用字段表示日期）',
					'both': '两者都支持',
				});

				const formats = this.plugin.settings.enabledTaskFormats;
				if (formats.includes('tasks') && formats.includes('dataview')) drop.setValue('both');
				else if (formats.includes('tasks')) drop.setValue('tasks');
				else if (formats.includes('dataview')) drop.setValue('dataview');

				drop.onChange(async (value) => {
					this.plugin.settings.enabledTaskFormats = (value === 'both') ? ['tasks', 'dataview'] : [value];
					await this.saveAndRefresh();
				});
			});

		// 任务文本是否显示 Global Filter
		new Setting(this.containerEl)
			.setName('任务文本显示 Global Filter')
			.setDesc('在任务列表中文本前显示全局筛选前缀（如 🎯）。关闭则仅显示任务描述. 修改全局筛选器后可能会有显示错误,需要关闭再打开此选项一次')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.showGlobalFilterInTaskText)
				.onChange(async (value) => {
					this.plugin.settings.showGlobalFilterInTaskText = value;
					await this.saveAndRefresh();
				}));

		// 任务笔记文件夹路径
		new Setting(this.containerEl)
			.setName('任务笔记文件夹路径')
			.setDesc('从任务创建笔记时的默认存放路径（相对于库根目录）')
			.addText(text => text
				.setPlaceholder('Tasks')
				.setValue(this.plugin.settings.taskNotePath)
				.onChange(async (value) => {
					this.plugin.settings.taskNotePath = value;
					await this.plugin.saveSettings();
				}));

        
		// ===== 任务创建设置 =====
		this.containerEl.createEl('h2', { text: '任务创建设置' });

		// 新任务标题
		new Setting(this.containerEl)
			.setName('新任务标题')
			.setDesc('在 Daily Note 中添加新任务时的目标标题（留空则添加到文件末尾）')
			.addText(text => text
				.setPlaceholder('例如：## 工作任务')
				.setValue(this.plugin.settings.newTaskHeading || '')
				.onChange(async (value) => {
					this.plugin.settings.newTaskHeading = value || undefined;
					await this.plugin.saveSettings();
				}));

		// Templater 集成
		new Setting(this.containerEl)
			.setName('启用 Templater 集成')
			.setDesc('创建 Daily Note 时使用 Templater 插件的模板（需安装 Templater）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.enableTemplaterForDailyNote || false)
				.onChange(async (value) => {
					this.plugin.settings.enableTemplaterForDailyNote = value;
					await this.plugin.saveSettings();
					// 刷新显示关联设置
					this.plugin.refreshCalendarViews();
				}));

		if (this.plugin.settings.enableTemplaterForDailyNote) {
			// Templater 模板路径
			new Setting(this.containerEl)
				.setName('Templater 模板路径')
				.setDesc('指定用于创建 Daily Note 的模板文件路径')
				.addText(text => text
					.setPlaceholder('Templates/Daily Note Template.md')
					.setValue(this.plugin.settings.templaterTemplatePath || '')
					.onChange(async (value) => {
						this.plugin.settings.templaterTemplatePath = value;
						await this.plugin.saveSettings();
					}));
		}

		// 默认优先级
		new Setting(this.containerEl)
			.setName('默认任务优先级')
			.setDesc('创建新任务时的默认优先级')
			.addDropdown(drop => drop
				.addOptions({
					'highest': '🔺 最高',
					'high': '⏫ 高',
					'medium': '🔼 中',
					'low': '🔽 低',
					'lowest': '⏬ 最低',
					'normal': '无',
				})
				.setValue(this.plugin.settings.defaultTaskPriority || 'medium')
				.onChange(async (value) => {
					this.plugin.settings.defaultTaskPriority = value as any;
					await this.plugin.saveSettings();
				}));

		// ===== 任务状态设置 =====

		// 默认状态列表
		const defaultStatusesDiv = this.containerEl.createDiv();
		defaultStatusesDiv.createEl('h2', { text: '任务默认状态设置', cls: 'setting-item-heading' });
		const defaultStatus = this.containerEl.createEl('div', {
			cls: 'setting-item-description',
			text: '配置任务7中默认状态的颜色和样式。'
		});
		defaultStatus.style.marginBottom = '16px';

		// 从设置中获取默认状态（而不是从 DEFAULT_TASK_STATUSES）
		const defaultStatuses = this.plugin.settings.taskStatuses.filter((s: TaskStatus) => s.isDefault);
		defaultStatuses.forEach((status: TaskStatus) => {
			const card = new TaskStatusCard({
				container: defaultStatusesDiv,
				plugin: this.plugin,
				status: status
			});
			card.render();
		});

		// 自定义状态部分
		const customStatusesDiv = this.containerEl.createDiv();
		customStatusesDiv.createEl('h2', { text: '任务自定义状态设置', cls: 'setting-item-heading' });
        const customStatusDesc = this.containerEl.createEl('div', {
			cls: 'setting-item-description',
			text: '配置任务自定义状态的颜色和样式。最多支持 3 个自定义状态。'
		});
		customStatusDesc.style.marginBottom = '16px';

		// 获取自定义状态数量
		const customStatuses = this.plugin.settings.taskStatuses.filter((s: TaskStatus) => !s.isDefault);
		const customCount = customStatuses.length;
		const maxCustom = 3;

		// 显示自定义状态数量提示
		const countInfo = customStatusesDiv.createEl('div', {
			cls: 'setting-item-description',
			text: `已添加 ${customCount}/${maxCustom} 个自定义状态`
		});
		countInfo.style.marginBottom = '12px';

		// 渲染现有自定义状态
		customStatuses.forEach((status: TaskStatus) => {
			const card = new TaskStatusCard({
				container: customStatusesDiv,
				plugin: this.plugin,
				status: status,
				onDelete: async () => {
					// 删除自定义状态
					this.plugin.settings.taskStatuses = this.plugin.settings.taskStatuses.filter((s: TaskStatus) => s.key !== status.key);
					await this.saveAndRefresh();
					// 刷新设置界面
					// 注意：这里需要调用 SettingTab 的 display() 方法来重新渲染
					this.plugin.refreshCalendarViews();
				}
			});
			card.render();
		});

		// 添加自定义状态按钮
		if (customCount < maxCustom) {
			const addButton = new Setting(customStatusesDiv)
				.setName('添加自定义状态')
				.setDesc('创建一个新的任务状态')
				.addButton(button => button
					.setButtonText('添加')
					.setCta()
					.onClick(() => {
						this.showAddCustomStatusModal();
					}));
			addButton.settingEl.style.marginTop = '16px';
		}
	}

	/**
	 * 显示添加自定义状态模态框
	 */
	private showAddCustomStatusModal(): void {
		const modal = new AddCustomStatusModal(this.plugin.app, this.plugin);
		modal.open();
	}
}
