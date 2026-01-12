/**
 * 编辑任务弹窗
 *
 * 提供编辑任务的界面，包含四大板块：
 * - 任务描述编辑板块
 * - 任务优先级设置板块
 * - 任务时间设置板块
 * - 标签选择器
 */

import { App, Modal, Notice } from 'obsidian';
import type { GCTask } from '../../types';
import { updateTaskProperties } from '../../tasks/taskUpdater';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { Logger } from '../../utils/logger';
import { EditTaskModalClasses } from '../../utils/bem';
import { TagSelector } from '../../components/TagSelector';

export function openEditTaskModal(
	app: App,
	task: GCTask,
	enabledFormats: string[],
	onSuccess: () => void,
	allowEditContent?: boolean
): void {
	const modal = new EditTaskModal(app, task, enabledFormats, onSuccess, allowEditContent);
	modal.open();
}

/**
 * 优先级选项
 */
interface PriorityOption {
	value: 'highest' | 'high' | 'medium' | 'normal' | 'low' | 'lowest';
	label: string;
	icon: string;
}

class EditTaskModal extends Modal {
	private task: GCTask;
	private enabledFormats: string[];
	private onSuccess: () => void;
	private allowEditContent: boolean;

	// 状态缓存
	private priority: 'highest' | 'high' | 'medium' | 'low' | 'lowest' | 'normal' | undefined;
	private createdDate: Date | null | undefined;
	private startDate: Date | null | undefined;
	private scheduledDate: Date | null | undefined;
	private dueDate: Date | null | undefined;
	private cancelledDate: Date | null | undefined;
	private completionDate: Date | null | undefined;
	private content: string | undefined;
	private selectedTags: string[] | undefined;

	// UI 组件引用
	private tagSelector: TagSelector;

	// 样式元素
	private styleEl: HTMLStyleElement;
	private allTasks: GCTask[] = [];

	constructor(app: App, task: GCTask, enabledFormats: string[], onSuccess: () => void, allowEditContent?: boolean) {
		super(app);
		this.task = task;
		this.enabledFormats = enabledFormats;
		this.onSuccess = onSuccess;
		this.allowEditContent = !!allowEditContent;

		// 初始化为"未更改"状态（undefined），用户修改才记录
		this.priority = undefined;
		this.createdDate = undefined;
		this.startDate = undefined;
		this.scheduledDate = undefined;
		this.dueDate = undefined;
		this.cancelledDate = undefined;
		this.completionDate = undefined;
		this.content = undefined;
		this.selectedTags = undefined;
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass(EditTaskModalClasses.block);

		// 添加样式
		this.addStyles();

		contentEl.createEl('h2', {
			text: '编辑任务',
			cls: EditTaskModalClasses.elements.title
		});

		// 1. 任务描述板块
		if (this.allowEditContent) {
			this.renderDescriptionSection(contentEl);
		}

		// 2. 优先级设置板块
		this.renderPrioritySection(contentEl);

		// 3. 时间设置板块
		this.renderDatesSection(contentEl);

		// 4. 标签选择器
		this.renderTagsSection(contentEl);

		// 操作按钮
		this.renderButtons(contentEl);
	}

	onClose(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.removeClass(EditTaskModalClasses.block);

		// 移除样式
		if (this.styleEl && this.styleEl.parentNode) {
			this.styleEl.parentNode.removeChild(this.styleEl);
		}
	}

	/**
	 * 渲染任务描述板块
	 */
	private renderDescriptionSection(container: HTMLElement): void {
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const descContainer = section.createDiv(EditTaskModalClasses.elements.descContainer);
		descContainer.createEl('label', {
			text: '任务描述',
			cls: EditTaskModalClasses.elements.sectionLabel
		});
		descContainer.createEl('div', {
			text: '不支持换行，Enter 键将转为空格',
			cls: EditTaskModalClasses.elements.sectionHint
		});

		const textArea = descContainer.createEl('textarea', {
			cls: EditTaskModalClasses.elements.descTextarea
		});
		textArea.value = this.task.description || '';

		// 阻止换行：Enter 键转为空格
		textArea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				const start = textArea.selectionStart;
				const end = textArea.selectionEnd;
				const value = textArea.value;
				textArea.value = value.slice(0, start) + ' ' + value.slice(end);
				textArea.selectionStart = textArea.selectionEnd = start + 1;
				this.content = textArea.value;
			}
		});

		textArea.addEventListener('input', () => {
			// 兜底：将任何换行符替换为空格
			this.content = textArea.value.replace(/[\r\n]+/g, ' ');
		});
	}

	/**
	 * 渲染优先级设置板块
	 */
	private renderPrioritySection(container: HTMLElement): void {
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const priorityContainer = section.createDiv(EditTaskModalClasses.elements.priorityContainer);
		priorityContainer.createEl('label', {
			text: '优先级',
			cls: EditTaskModalClasses.elements.sectionLabel
		});

		const priorityGrid = priorityContainer.createDiv(EditTaskModalClasses.elements.priorityGrid);

		const priorityOptions: PriorityOption[] = [
			{ value: 'highest', label: '最高', icon: '🔺' },
			{ value: 'high', label: '高', icon: '⏫' },
			{ value: 'medium', label: '中', icon: '🔼' },
			{ value: 'normal', label: '普通', icon: '◽' },
			{ value: 'low', label: '低', icon: '🔽' },
			{ value: 'lowest', label: '最低', icon: '⏬' },
		];

		priorityOptions.forEach(option => {
			const btn = priorityGrid.createEl('button', {
				cls: EditTaskModalClasses.elements.priorityBtn,
				text: `${option.icon} ${option.label}`
			});
			btn.dataset.value = option.value;

			// 如果是当前任务的优先级，设置为选中状态
			if (option.value === (this.task.priority || 'normal')) {
				btn.addClass(EditTaskModalClasses.elements.priorityBtnSelected);
			}

			btn.addEventListener('click', () => {
				// 移除所有按钮的选中状态
				priorityGrid.querySelectorAll(`.${EditTaskModalClasses.elements.priorityBtn}`)
					.forEach(b => b.removeClass(EditTaskModalClasses.elements.priorityBtnSelected));
				// 添加当前按钮的选中状态
				btn.addClass(EditTaskModalClasses.elements.priorityBtnSelected);
				// 记录用户选择的优先级，'normal' 表示普通（无优先级）
				this.priority = option.value;
			});
		});
	}

	/**
	 * 渲染时间设置板块
	 */
	private renderDatesSection(container: HTMLElement): void {
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const dateContainer = section.createDiv(EditTaskModalClasses.elements.datesContainer);
		dateContainer.createEl('label', {
			text: '日期设置',
			cls: EditTaskModalClasses.elements.sectionLabel
		});

		const datesGrid = dateContainer.createDiv(EditTaskModalClasses.elements.datesGrid);

		this.renderDateField(datesGrid, '➕ 创建', this.task.createdDate, (d) => this.createdDate = d);
		this.renderDateField(datesGrid, '🛫 开始', this.task.startDate, (d) => this.startDate = d);
		this.renderDateField(datesGrid, '⏳ 计划', this.task.scheduledDate, (d) => this.scheduledDate = d);
		this.renderDateField(datesGrid, '📅 截止', this.task.dueDate, (d) => this.dueDate = d);
		this.renderDateField(datesGrid, '✅ 完成', this.task.completionDate, (d) => this.completionDate = d);
		this.renderDateField(datesGrid, '❌ 取消', this.task.cancelledDate, (d) => this.cancelledDate = d);
	}

	/**
	 * 渲染单个日期字段
	 */
	private renderDateField(
		container: HTMLElement,
		label: string,
		current: Date | undefined,
		onChange: (d: Date | null) => void
	): void {
		const dateItem = container.createDiv(EditTaskModalClasses.elements.dateItem);
		const labelEl = dateItem.createEl('label', {
			text: label,
			cls: EditTaskModalClasses.elements.dateLabel
		});

		const inputContainer = dateItem.createDiv(EditTaskModalClasses.elements.dateInputContainer);
		const input = inputContainer.createEl('input', {
			type: 'date',
			cls: EditTaskModalClasses.elements.dateInput
		});

		const initStr = current ? formatDate(current, 'yyyy-MM-dd') : '';
		if (initStr) input.value = initStr;

		input.addEventListener('change', () => {
			if (!input.value) {
				onChange(null);
				return;
			}
			const parsed = this.parseDate(input.value);
			if (parsed) onChange(parsed);
		});

		const clearBtn = inputContainer.createEl('button', {
			cls: EditTaskModalClasses.elements.dateClear,
			text: '×'
		});
		clearBtn.addEventListener('click', () => {
			input.value = '';
			onChange(null);
		});
	}

	/**
	 * 渲染标签选择器板块
	 */
	private renderTagsSection(container: HTMLElement): void {
		const section = container.createDiv(EditTaskModalClasses.elements.section);
		const tagsContainer = section.createDiv(EditTaskModalClasses.elements.tagsSection);

		// 获取所有任务用于推荐标签
		// 通过 app.metadataCache 获取所有任务
		this.allTasks = this.getAllTasks();

		this.tagSelector = new TagSelector({
			container: tagsContainer,
			allTasks: this.allTasks,
			initialTags: this.task.tags || [],
			compact: false,
			onChange: (tags) => {
				// 检查标签是否发生变化
				const currentTags = this.task.tags || [];
				const sortedCurrent = [...currentTags].sort();
				const sortedNew = [...tags].sort();
				const isChanged = JSON.stringify(sortedCurrent) !== JSON.stringify(sortedNew);
				if (isChanged) {
					this.selectedTags = tags;
				}
			}
		});
	}

	/**
	 * 获取所有任务（用于推荐标签）
	 */
	private getAllTasks(): GCTask[] {
		const plugin = (this.app as any).plugins.plugins['obsidian-gantt-calendar'];
		if (plugin?.taskCache) {
			return plugin.taskCache.getAllTasks();
		}
		return [];
	}

	/**
	 * 渲染操作按钮
	 */
	private renderButtons(container: HTMLElement): void {
		const buttonContainer = container.createDiv(EditTaskModalClasses.elements.buttons);

		const cancelBtn = buttonContainer.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => this.close());

		const saveBtn = buttonContainer.createEl('button', {
			cls: 'mod-cta',
			text: '保存'
		});
		saveBtn.addEventListener('click', async () => {
			await this.saveTask();
		});
	}

	/**
	 * 保存任务
	 */
	private async saveTask(): Promise<void> {
		try {
			const updates: any = {};

			// 直接传递优先级值，'normal' 会被 serializeTask 正确处理为清除优先级
			if (this.priority !== undefined) {
				updates.priority = this.priority;
			}
			if (this.createdDate !== undefined) updates.createdDate = this.createdDate;
			if (this.startDate !== undefined) updates.startDate = this.startDate;
			if (this.scheduledDate !== undefined) updates.scheduledDate = this.scheduledDate;
			if (this.dueDate !== undefined) updates.dueDate = this.dueDate;
			if (this.completionDate !== undefined) updates.completionDate = this.completionDate;
			if (this.cancelledDate !== undefined) updates.cancelledDate = this.cancelledDate;
			if (this.content !== undefined) updates.content = this.content;
			if (this.selectedTags !== undefined) updates.tags = this.selectedTags;

			// 如果没有任何更改，直接关闭
			if (Object.keys(updates).length === 0) {
				this.close();
				return;
			}

			await updateTaskProperties(this.app, this.task, updates, this.enabledFormats);
			this.onSuccess();
			this.close();
			new Notice('任务已更新');
		} catch (err) {
			Logger.error('editTask', 'Failed to update task', err);
			new Notice('更新任务失败');
		}
	}

	/**
	 * 添加弹窗样式
	 */
	private addStyles(): void {
		this.styleEl = document.createElement('style');
		this.styleEl.textContent = `
			.${EditTaskModalClasses.block} {
				max-width: 500px;
			}
			.${EditTaskModalClasses.elements.title} {
				font-size: var(--font-ui-large);
				font-weight: 600;
				margin-bottom: 20px;
				color: var(--text-normal);
			}
			.${EditTaskModalClasses.elements.section} {
				margin-bottom: 20px;
			}
			.${EditTaskModalClasses.elements.sectionLabel} {
				display: block;
				font-weight: 600;
				margin-bottom: 8px;
				font-size: var(--font-ui-small);
				color: var(--text-normal);
			}
			.${EditTaskModalClasses.elements.sectionHint} {
				font-size: var(--font-ui-smaller);
				color: var(--text-muted);
				margin-bottom: 8px;
			}

			/* 任务描述板块 */
			.${EditTaskModalClasses.elements.descTextarea} {
				width: 100%;
				min-height: 60px;
				max-height: 60px;
				padding: 8px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-secondary);
				color: var(--text-normal);
				resize: none;
				overflow: auto;
				font-family: var(--font-interface);
				font-size: var(--font-ui-small);
			}
			.${EditTaskModalClasses.elements.descTextarea}:focus {
				outline: 2px solid var(--interactive-accent);
				border-color: var(--interactive-accent);
			}

			/* 优先级板块 */
			.${EditTaskModalClasses.elements.priorityGrid} {
				display: grid;
				grid-template-columns: repeat(3, 1fr);
				gap: 8px;
				margin-top: 8px;
			}
			.${EditTaskModalClasses.elements.priorityBtn} {
				padding: 8px 12px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-secondary);
				color: var(--text-normal);
				cursor: pointer;
				font-size: var(--font-ui-small);
				transition: all 0.2s;
			}
			.${EditTaskModalClasses.elements.priorityBtn}:hover {
				background: var(--background-modifier-hover);
			}
			.${EditTaskModalClasses.elements.priorityBtnSelected} {
				background: var(--interactive-accent) !important;
				color: var(--text-on-accent) !important;
				border-color: var(--interactive-accent) !important;
			}

			/* 日期板块 */
			.${EditTaskModalClasses.elements.datesGrid} {
				display: grid;
				grid-template-columns: repeat(2, 1fr);
				gap: 12px;
			}
			.${EditTaskModalClasses.elements.dateItem} {
				display: flex;
				flex-direction: column;
				gap: 4px;
			}
			.${EditTaskModalClasses.elements.dateLabel} {
				font-size: var(--font-ui-smaller);
				color: var(--text-muted);
				font-weight: 500;
			}
			.${EditTaskModalClasses.elements.dateInputContainer} {
				display: flex;
				gap: 4px;
				align-items: center;
			}
			.${EditTaskModalClasses.elements.dateInput} {
				flex: 1;
				padding: 6px 8px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-secondary);
				color: var(--text-normal);
				font-size: var(--font-ui-small);
			}
			.${EditTaskModalClasses.elements.dateInput}:focus {
				outline: 2px solid var(--interactive-accent);
				border-color: var(--interactive-accent);
			}
			.${EditTaskModalClasses.elements.dateClear} {
				width: 32px;
				height: 32px;
				padding: 0;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-secondary);
				color: var(--text-muted);
				cursor: pointer;
				font-size: 20px;
				line-height: 1;
				display: flex;
				align-items: center;
				justify-content: center;
				flex-shrink: 0;
			}
			.${EditTaskModalClasses.elements.dateClear}:hover {
				background: var(--background-modifier-hover);
				color: var(--text-normal);
			}

			/* 标签选择器板块 */
			.${EditTaskModalClasses.elements.tagsSection} {
				margin-top: 8px;
			}

			/* 标签选择器样式 */
			.gc-tag-selector-label {
				display: block;
				font-weight: 600;
				margin-bottom: 8px;
				font-size: var(--font-ui-small);
				color: var(--text-normal);
			}
			.gc-tag-selector-recommended-section,
			.gc-tag-selector-selected-section {
				margin-bottom: 12px;
			}
			.gc-tag-selector-grid {
				display: flex;
				flex-wrap: wrap;
				gap: 6px;
				margin-top: 6px;
			}
			.gc-tag-selector-new-section {
				display: flex;
				gap: 6px;
				margin-top: 8px;
			}
			.gc-tag-selector-new-input {
				flex: 1;
				padding: 6px 10px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-secondary);
				color: var(--text-normal);
				font-size: var(--font-ui-small);
			}
			.gc-tag-selector-new-input:focus {
				outline: 2px solid var(--interactive-accent);
				border-color: var(--interactive-accent);
			}
			.gc-tag-selector-new-button {
				padding: 6px 12px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-secondary);
				color: var(--text-normal);
				cursor: pointer;
				font-size: var(--font-ui-small);
			}
			.gc-tag-selector-new-button:hover {
				background: var(--background-modifier-hover);
			}

			/* 操作按钮 */
			.${EditTaskModalClasses.elements.buttons} {
				display: flex;
				gap: 12px;
				justify-content: flex-end;
				margin-top: 24px;
			}
			.${EditTaskModalClasses.elements.buttons} button {
				padding: 8px 16px;
				border: 1px solid var(--background-modifier-border);
				border-radius: 4px;
				background: var(--background-secondary);
				color: var(--text-normal);
				cursor: pointer;
				font-size: var(--font-ui-small);
			}
			.${EditTaskModalClasses.elements.buttons} button:hover {
				background: var(--background-modifier-hover);
			}
			.${EditTaskModalClasses.elements.buttons} button.mod-cta {
				background: var(--interactive-accent);
				color: var(--text-on-accent);
				border-color: var(--interactive-accent);
			}
			.${EditTaskModalClasses.elements.buttons} button.mod-cta:hover {
				background: var(--interactive-accent-hover);
			}
		`;
		document.head.appendChild(this.styleEl);
	}

	private parseDate(dateStr: string): Date | null {
		const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (!match) return null;
		const date = new Date(dateStr);
		return isNaN(date.getTime()) ? null : date;
	}
}
