import { Setting, TFolder } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig, TaskViewFieldConfig } from '../types';

/**
 * 任务视图设置构建器
 */
export class TaskViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// ===== 任务视图设置 =====
		this.containerEl.createEl('h1', { text: '任务视图设置' });

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

		// ===== 任务视图显示模式 =====
		this.containerEl.createEl('h2', { text: '显示模式' });

		new Setting(this.containerEl)
			.setName('默认显示模式')
			.setDesc('任务视图的默认显示模式（可在视图中点击标题快速切换）')
			.addDropdown(drop => {
				drop.addOptions({
					'compact': '简洁 — 仅显示必要信息',
					'full': '完整 — 显示详细信息',
				});
				drop.setValue(this.plugin.settings.taskViewDisplayMode || 'compact');
				drop.onChange(async (value) => {
					this.plugin.settings.taskViewDisplayMode = value as 'compact' | 'full';
					await this.saveAndRefresh();
				});
			});

		// 简洁模式字段配置
		this.renderFieldConfigSection(
			'简洁模式显示字段',
			'简洁模式下卡片显示哪些字段',
			'taskViewCompactFields',
		);

		// 完整模式字段配置
		this.renderFieldConfigSection(
			'完整模式显示字段',
			'完整模式下卡片显示哪些字段',
			'taskViewFullFields',
		);
	}

	/**
	 * 渲染字段配置区域（简洁/完整模式共用）
	 */
	private renderFieldConfigSection(
		title: string,
		desc: string,
		settingKey: 'taskViewCompactFields' | 'taskViewFullFields',
	): void {
		this.containerEl.createEl('h3', { text: title });
		this.containerEl.createEl('p', {
			text: desc,
			cls: 'setting-item-description',
		});

		const fields = this.plugin.settings[settingKey] as TaskViewFieldConfig;

		const fieldDefs: Array<{ key: keyof TaskViewFieldConfig; label: string; desc: string }> = [
			{ key: 'showDueDate', label: '截止日期', desc: '显示任务截止时间' },
			{ key: 'showCreatedDate', label: '创建日期', desc: '显示任务创建时间' },
			{ key: 'showStartDate', label: '开始日期', desc: '显示任务开始时间' },
			{ key: 'showCompletionDate', label: '完成日期', desc: '显示任务完成时间' },
			{ key: 'showTags', label: '标签', desc: '显示任务标签' },
			{ key: 'showDetail', label: '备注', desc: '显示任务详细说明' },
			{ key: 'showFileLocation', label: '任务类型', desc: '显示待办/提醒类型标记' },
		];

		for (const def of fieldDefs) {
			new Setting(this.containerEl)
				.setName(def.label)
				.setDesc(def.desc)
				.addToggle(toggle => {
					toggle.setValue(fields[def.key]);
					toggle.onChange(async (value) => {
						(this.plugin.settings[settingKey] as TaskViewFieldConfig)[def.key] = value;
						await this.plugin.saveSettings();
					});
				});
		}
	}
}
