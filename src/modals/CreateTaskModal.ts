/**
 * 任务创建弹窗
 *
 * 提供快速创建任务的界面，包含三大板块：
 * - 任务描述编辑板块
 * - 任务优先级设置板块
 * - 任务时间设置板块
 * - 标签选择器
 *
 * 默认值：创建时间和截止时间为当天，其他时间为空
 */

import { App, Modal, Notice } from 'obsidian';
import type GanttCalendarPlugin from '../../main';
import type { GCTask } from '../types';
import { createTaskInDailyNote, type CreateTaskData } from '../utils/dailyNoteHelper';
import { EditTaskModalClasses } from '../utils/bem';
import { TagSelector } from '../components/TagSelector';
import { Logger } from '../utils/logger';

/**
 * 任务创建弹窗选项
 */
export interface CreateTaskModalOptions {
	app: App;
	plugin: GanttCalendarPlugin;
	targetDate?: Date;
	onSuccess: () => void;
}

/**
 * 优先级选项
 */
interface PriorityOption {
	value: 'highest' | 'high' | 'medium' | 'normal' | 'low' | 'lowest';
	label: string;
	icon: string;
}

/**
 * 任务创建弹窗
 */
export class CreateTaskModal extends Modal {
	private plugin: GanttCalendarPlugin;
	private targetDate: Date;
	private onSuccess: () => void;

	// 表单状态
	private priority: 'highest' | 'high' | 'medium' | 'normal' | 'low' | 'lowest';
	private createdDate: Date;
	private startDate: Date | null;
	private scheduledDate: Date | null;
	private dueDate: Date;
	private cancelledDate: Date | null;
	private completionDate: Date | null;
	private selectedTags: string[] = [];

	// UI 组件引用
	private descriptionInput: HTMLTextAreaElement;
	private tagSelector: TagSelector;

	// 样式元素
	private styleEl: HTMLStyleElement;

	constructor(options: CreateTaskModalOptions) {
		super(options.app);
		this.plugin = options.plugin;
		this.targetDate = options.targetDate || new Date();
		this.onSuccess = options.onSuccess;

		// 默认值：创建时间和截止时间为当天，其他时间为空
		this.createdDate = new Date(this.targetDate);
		this.createdDate.setHours(0, 0, 0, 0);
		this.dueDate = new Date(this.targetDate);
		this.dueDate.setHours(0, 0, 0, 0);
		this.startDate = null;
		this.scheduledDate = null;
		this.cancelledDate = null;
		this.completionDate = null;

		// 默认优先级
		this.priority = this.plugin.settings.defaultTaskPriority || 'normal';
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass(EditTaskModalClasses.block);

		// 添加样式
		this.addStyles();

		// 标题
		contentEl.createEl('h2', {
			text: '创建新任务',
			cls: EditTaskModalClasses.elements.title
		});

		// 1. 任务描述板块
		this.renderDescriptionSection(contentEl);

		// 2. 优先级设置板块
		this.renderPrioritySection(contentEl);

		// 3. 时间设置板块
		this.renderDatesSection(contentEl);

		// 4. 标签选择器
		this.renderTagsSection(contentEl);

		// 操作按钮
		this.renderButtons(contentEl);

		// 自动聚焦到描述输入框
		setTimeout(() => this.descriptionInput.focus(), 100);
	}

	onClose() {
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
			text: '任务描述 *',
			cls: EditTaskModalClasses.elements.sectionLabel
		});
		descContainer.createEl('div', {
			text: '不支持换行，Enter 键将转为空格',
			cls: EditTaskModalClasses.elements.sectionHint
		});

		this.descriptionInput = descContainer.createEl('textarea', {
			cls: EditTaskModalClasses.elements.descTextarea
		});
		this.descriptionInput.placeholder = '输入任务描述...';

		// 阻止换行：Enter 键转为空格
		this.descriptionInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				const start = this.descriptionInput.selectionStart;
				const end = this.descriptionInput.selectionEnd;
				const value = this.descriptionInput.value;
				this.descriptionInput.value = value.slice(0, start) + ' ' + value.slice(end);
				this.descriptionInput.selectionStart = this.descriptionInput.selectionEnd = start + 1;
			}
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

			// 默认选中普通优先级
			if (option.value === this.priority) {
				btn.addClass(EditTaskModalClasses.elements.priorityBtnSelected);
			}

			btn.addEventListener('click', () => {
				// 移除所有按钮的选中状态
				priorityGrid.querySelectorAll(`.${EditTaskModalClasses.elements.priorityBtn}`)
					.forEach(b => b.removeClass(EditTaskModalClasses.elements.priorityBtnSelected));
				// 添加当前按钮的选中状态
				btn.addClass(EditTaskModalClasses.elements.priorityBtnSelected);
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

		// 创建日期（默认值为当天）
		this.renderDateField(datesGrid, '➕ 创建', this.createdDate, (d) => this.createdDate = d as Date);
		// 开始日期（默认为空）
		this.renderDateField(datesGrid, '🛫 开始', null, (d) => this.startDate = d);
		// 计划日期（默认为空）
		this.renderDateField(datesGrid, '⏳ 计划', null, (d) => this.scheduledDate = d);
		// 截止日期（默认值为当天）
		this.renderDateField(datesGrid, '📅 截止', this.dueDate, (d) => this.dueDate = d as Date);
		// 完成日期（默认为空）
		this.renderDateField(datesGrid, '✅ 完成', null, (d) => this.completionDate = d);
		// 取消日期（默认为空）
		this.renderDateField(datesGrid, '❌ 取消', null, (d) => this.cancelledDate = d);
	}

	/**
	 * 渲染单个日期字段
	 */
	private renderDateField(
		container: HTMLElement,
		label: string,
		current: Date | null,
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

		const initStr = current ? this.formatDateForInput(current) : '';
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

		this.tagSelector = new TagSelector({
			container: tagsContainer,
			allTasks: this.plugin.taskCache.getAllTasks(),
			initialTags: [],
			compact: false,
			onChange: (tags) => {
				this.selectedTags = tags;
			}
		});
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
			text: '创建'
		});
		saveBtn.addEventListener('click', async () => {
			await this.saveTask();
		});
	}

	/**
	 * 保存任务
	 */
	private async saveTask(): Promise<void> {
		// 验证描述
		const description = this.descriptionInput.value.trim().replace(/[\r\n]+/g, ' ');
		if (!description) {
			new Notice('请输入任务描述');
			this.descriptionInput.focus();
			return;
		}

		// 验证日期
		if (this.createdDate && this.dueDate && this.createdDate > this.dueDate) {
			new Notice('创建日期不能晚于截止日期');
			return;
		}

		try {
			const taskData: CreateTaskData = {
				description,
				priority: this.priority === 'normal' ? undefined : this.priority,
				createdDate: this.createdDate,
				startDate: this.startDate,
				scheduledDate: this.scheduledDate,
				dueDate: this.dueDate,
				completionDate: this.completionDate,
				cancelledDate: this.cancelledDate,
				tags: this.selectedTags.length > 0 ? this.selectedTags : undefined
			};

			await createTaskInDailyNote(this.app, taskData, this.plugin.settings);

			new Notice('任务创建成功');
			this.onSuccess();
			this.close();
		} catch (error) {
			Logger.error('CreateTaskModal', 'Error creating task:', error);
			new Notice('创建任务失败: ' + (error as Error).message);
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

	/**
	 * 格式化日期为 input[type="date"] 所需格式 (YYYY-MM-DD)
	 */
	private formatDateForInput(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	/**
	 * 解析日期字符串
	 */
	private parseDate(dateStr: string): Date | null {
		const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (!match) return null;
		const date = new Date(dateStr);
		return isNaN(date.getTime()) ? null : date;
	}
}
