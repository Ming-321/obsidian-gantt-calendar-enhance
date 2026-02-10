/**
 * 编辑任务弹窗
 *
 * 提供编辑任务（待办/提醒）的界面，基于 BaseTaskModal 基类。
 * 通过 TaskStore 更新 JSON 数据。
 */

import { App, Notice } from 'obsidian';
import type GanttCalendarPlugin from '../../main';
import type { GCTask } from '../types';
import type { TaskChanges } from '../data-layer/types';
import { Logger } from '../utils/logger';
import { EditTaskModalClasses } from '../utils/bem';
import { BaseTaskModal, type PriorityOption, type RepeatConfig } from './BaseTaskModal';
import { updateTaskCompletion } from '../tasks/taskUpdater';

/**
 * 快捷打开编辑弹窗
 */
export function openEditTaskModal(
	app: App,
	plugin: GanttCalendarPlugin,
	task: GCTask,
	onSuccess: () => void,
): void {
	const modal = new EditTaskModal(app, plugin, task, onSuccess);
	modal.open();
}

/**
 * 编辑任务弹窗
 */
class EditTaskModal extends BaseTaskModal {
	private plugin: GanttCalendarPlugin;
	private task: GCTask;
	private onSuccess: () => void;

	// 变更跟踪
	private typeChanged = false;
	private priorityChanged = false;
	private repeatChanged = false;
	private datesChanged = false;
	private descriptionChanged = false;
	private detailChanged = false;
	private tagsChanged = false;

	// 编辑状态
	private descriptionValue: string;
	private detailValue: string;

	constructor(
		app: App,
		plugin: GanttCalendarPlugin,
		task: GCTask,
		onSuccess: () => void,
	) {
		super(app);
		this.plugin = plugin;
		this.task = task;
		this.onSuccess = onSuccess;

		// 从现有任务初始化基类属性
		this.taskType = task.type || 'todo';
		this.priority = (task.priority as PriorityOption['value']) || 'normal';
		this.repeat = task.repeat || null;
		this.createdDate = task.createdDate || null;
		this.startDate = task.startDate || null;
		this.dueDate = task.dueDate || null;
		this.cancelledDate = task.cancelledDate || null;
		this.completionDate = task.completionDate || null;
		this.selectedTags = task.tags ? [...task.tags] : [];
		this.descriptionValue = task.description || '';
		this.detailValue = task.detail || '';
	}

	onOpen(): void {
		this.renderModalContent('编辑任务');
	}

	// ==================== 重写渲染以插入子任务区域 ====================

	protected renderModalContent(title: string): void {
		super.renderModalContent(title);

		// 在标签区域之后、按钮之前插入子任务区域
		if ((this.task.depth ?? 0) < 2) {
			const scrollContainer = this.contentEl.querySelector(`.${EditTaskModalClasses.elements.scrollContainer}`) as HTMLElement;
			if (scrollContainer) {
				this.renderSubTasksSection(scrollContainer);
			}
		}
	}

	// ==================== 子任务管理区域 ====================

	/**
	 * 渲染子任务管理区域
	 */
	private renderSubTasksSection(container: HTMLElement): void {
		const section = container.createDiv(EditTaskModalClasses.elements.subtaskSection);

		// 标题行：标签 + 进度
		const header = section.createDiv(EditTaskModalClasses.elements.subtaskHeader);
		header.createEl('label', {
			text: '子任务',
			cls: EditTaskModalClasses.elements.sectionLabel
		});

		const progressEl = header.createEl('span', {
			cls: EditTaskModalClasses.elements.subtaskProgress
		});

		// 子任务列表容器
		const listContainer = section.createDiv(EditTaskModalClasses.elements.subtaskList);

		// 快速添加行
		const addRow = section.createDiv(EditTaskModalClasses.elements.subtaskAddRow);
		const addInput = addRow.createEl('input', {
			type: 'text',
			placeholder: '快速添加子任务...',
			cls: EditTaskModalClasses.elements.subtaskAddInput
		});

		const addBtn = addRow.createEl('button', { text: '+ 添加' });
		addBtn.style.padding = '4px 12px';
		addBtn.style.fontSize = 'var(--font-ui-small)';
		addBtn.style.border = '1px solid var(--background-modifier-border)';
		addBtn.style.borderRadius = '4px';
		addBtn.style.background = 'var(--background-secondary)';
		addBtn.style.cursor = 'pointer';
		addBtn.style.whiteSpace = 'nowrap';

		// 渲染子任务列表
		const refreshList = () => {
			this.renderSubTaskList(listContainer, progressEl);
		};
		refreshList();

		// 快速添加逻辑
		const handleAdd = async () => {
			const desc = addInput.value.trim();
			if (!desc) return;
			try {
				await this.plugin.taskCache.createSubTask(this.task.id, { description: desc });
				addInput.value = '';
				// 刷新任务数据
				this.task = this.plugin.taskCache.getTaskById(this.task.id) || this.task;
				refreshList();
			} catch (err) {
				new Notice('添加子任务失败: ' + (err as Error).message);
			}
		};

		addInput.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				handleAdd();
			}
		});
		addBtn.addEventListener('click', handleAdd);
	}

	/**
	 * 渲染子任务列表内容
	 */
	private renderSubTaskList(container: HTMLElement, progressEl: HTMLElement): void {
		container.empty();

		const children = this.plugin.taskCache.getChildTasks(this.task.id);
		const completedCount = children.filter(c => c.completed).length;

		// 更新进度
		if (children.length > 0) {
			progressEl.textContent = `[${completedCount}/${children.length}]`;
		} else {
			progressEl.textContent = '';
		}

		if (children.length === 0) {
			container.createEl('div', {
				text: '暂无子任务',
				cls: EditTaskModalClasses.elements.sectionHint
			});
			return;
		}

		children.forEach(child => {
			const item = container.createDiv(EditTaskModalClasses.elements.subtaskItem);

			// 复选框
			const checkbox = item.createEl('input', {
				type: 'checkbox',
				cls: EditTaskModalClasses.elements.subtaskItemCheckbox
			}) as HTMLInputElement;
			checkbox.checked = child.completed;
			checkbox.addEventListener('change', async () => {
				await updateTaskCompletion(this.app, child, checkbox.checked);
				this.task = this.plugin.taskCache.getTaskById(this.task.id) || this.task;
				this.renderSubTaskList(container, progressEl);
			});

			// 描述文本
			const text = item.createSpan({
				text: child.description || '无标题',
				cls: EditTaskModalClasses.elements.subtaskItemText
			});
			if (child.completed) {
				text.style.textDecoration = 'line-through';
				text.style.opacity = '0.6';
			}

			// 截止日期
			if (child.dueDate) {
				const d = new Date(child.dueDate);
				const dateStr = `${d.getMonth() + 1}/${d.getDate()}`;
				item.createSpan({
					text: `📅 ${dateStr}`,
					cls: EditTaskModalClasses.elements.subtaskItemDue
				});
			}

			// 操作按钮
			const actions = item.createDiv(EditTaskModalClasses.elements.subtaskItemActions);

			// 编辑按钮
			const editBtn = actions.createEl('button', { text: '✏️' });
			editBtn.title = '编辑子任务';
			editBtn.addEventListener('click', () => {
				openEditTaskModal(this.app, this.plugin, child, () => {
					this.task = this.plugin.taskCache.getTaskById(this.task.id) || this.task;
					this.renderSubTaskList(container, progressEl);
				});
			});

			// 删除按钮
			const deleteBtn = actions.createEl('button', { text: '🗑️' });
			deleteBtn.title = '删除子任务';
			deleteBtn.addEventListener('click', async () => {
				await this.plugin.taskCache.deleteTask(child.id);
				this.task = this.plugin.taskCache.getTaskById(this.task.id) || this.task;
				this.renderSubTaskList(container, progressEl);
			});
		});
	}

	// ==================== 实现抽象方法 ====================

	/**
	 * 渲染任务描述板块
	 */
	protected renderDescriptionSection(container: HTMLElement): void {
		const { EditTaskModalClasses } = require('../utils/bem') as typeof import('../utils/bem');
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		// 标题
		const descContainer = section.createDiv(EditTaskModalClasses.elements.descContainer);
		descContainer.createEl('label', {
			text: '任务标题',
			cls: EditTaskModalClasses.elements.sectionLabel
		});

		const textArea = descContainer.createEl('textarea', {
			cls: EditTaskModalClasses.elements.descTextarea
		});
		textArea.value = this.descriptionValue;
		textArea.style.minHeight = '40px';
		textArea.style.maxHeight = '40px';

		// Enter 转空格
		textArea.addEventListener('keydown', (e) => {
			if (e.key === 'Enter') {
				e.preventDefault();
				const start = textArea.selectionStart;
				const end = textArea.selectionEnd;
				const value = textArea.value;
				textArea.value = value.slice(0, start) + ' ' + value.slice(end);
				textArea.selectionStart = textArea.selectionEnd = start + 1;
				this.descriptionValue = textArea.value;
				this.descriptionChanged = true;
			}
		});
		textArea.addEventListener('input', () => {
			this.descriptionValue = textArea.value.replace(/[\r\n]+/g, ' ');
			this.descriptionChanged = true;
		});

		// 详细说明
		const detailContainer = section.createDiv(EditTaskModalClasses.elements.descContainer);
		detailContainer.createEl('label', {
			text: '详细说明（可选）',
			cls: EditTaskModalClasses.elements.sectionLabel
		});
		detailContainer.style.marginTop = '12px';

		const detailTextArea = detailContainer.createEl('textarea', {
			cls: EditTaskModalClasses.elements.descTextarea
		});
		detailTextArea.value = this.detailValue;
		detailTextArea.style.minHeight = '50px';
		detailTextArea.style.maxHeight = '80px';

		detailTextArea.addEventListener('input', () => {
			this.detailValue = detailTextArea.value;
			this.detailChanged = true;
		});
	}

	/**
	 * 保存任务
	 */
	protected async saveTask(): Promise<void> {
		try {
			const changes: TaskChanges = {};
			let hasChanges = false;

			// 描述变更
			if (this.descriptionChanged) {
				const desc = this.descriptionValue.trim().replace(/[\r\n]+/g, ' ');
				if (!desc) {
					new Notice('任务标题不能为空');
					return;
				}
				changes.description = desc;
				hasChanges = true;
			}

			// 详细说明变更
			if (this.detailChanged) {
				changes.detail = this.detailValue.trim() || undefined;
				hasChanges = true;
			}

			// 优先级变更
			if (this.priorityChanged) {
				changes.priority = this.priority;
				hasChanges = true;
			}

			// 重复规则变更
			if (this.repeatChanged) {
				changes.repeat = this.repeat || undefined;
				hasChanges = true;
			}

			// 日期变更（createdDate 不允许编辑，不纳入变更）
			if (this.datesChanged) {
				changes.startDate = this.startDate || undefined;
				changes.dueDate = this.dueDate || undefined;
				changes.completionDate = this.completionDate || undefined;
				changes.cancelledDate = this.cancelledDate || undefined;
				hasChanges = true;
			}

		// 标签变更
			if (this.tagsChanged) {
				changes.tags = this.selectedTags;
				hasChanges = true;
			}

			if (!hasChanges) {
				this.close();
				return;
			}

			await this.plugin.taskCache.updateTask(this.task.id, changes);
			new Notice('任务已更新');
			this.onSuccess();
			this.close();
		} catch (err) {
			Logger.error('EditTaskModal', 'Failed to update task', err);
			new Notice('更新任务失败: ' + (err as Error).message);
		}
	}

	/**
	 * 获取初始标签列表
	 */
	protected getInitialTags(): string[] {
		return this.task.tags || [];
	}

	/**
	 * 获取所有任务（用于标签推荐）
	 */
	protected getAllTasksForTags(): GCTask[] {
		return this.plugin.taskCache.getAllTasks();
	}

	/**
	 * 获取按钮文本
	 */
	protected getButtonTexts(): { cancel: string; save: string } {
		return { cancel: '取消', save: '保存' };
	}

	// ==================== 重写基类方法以跟踪变更 ====================

	/**
	 * 重写类型选择以跟踪变更
	 */
	protected renderTypeSection(container: HTMLElement): void {
		// 调用基类渲染，然后加入变更监听
		super.renderTypeSection(container);

		// 添加变更监听到类型按钮
		const originalType = this.task.type || 'todo';
		const observer = new MutationObserver(() => {
			if (this.taskType !== originalType) {
				this.typeChanged = true;
			}
		});
		// 类型变更通过按钮 click 事件已在基类处理，不需要额外观察
		// 但由于 EditTask 不改变 type（编辑时类型固定），
		// 这里不做额外跟踪，类型创建后不可更改
	}

	/**
	 * 重写优先级选择以跟踪变更
	 */
	protected renderPrioritySection(container: HTMLElement): void {
		const { EditTaskModalClasses } = require('../utils/bem') as typeof import('../utils/bem');
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const priorityContainer = section.createDiv(EditTaskModalClasses.elements.priorityContainer);
		priorityContainer.createEl('label', {
			text: '优先级',
			cls: EditTaskModalClasses.elements.sectionLabel
		});

		const priorityGrid = priorityContainer.createDiv(EditTaskModalClasses.elements.priorityGrid);

		this.priorityOptions.forEach(option => {
			const btn = priorityGrid.createEl('button', {
				cls: EditTaskModalClasses.elements.priorityBtn,
				text: `${option.icon} ${option.label}`
			});
			btn.dataset.value = option.value;

			if (option.value === this.priority) {
				btn.addClass(EditTaskModalClasses.elements.priorityBtnSelected);
			}

			btn.addEventListener('click', () => {
				priorityGrid.querySelectorAll(`.${EditTaskModalClasses.elements.priorityBtn}`)
					.forEach(b => b.removeClass(EditTaskModalClasses.elements.priorityBtnSelected));
				btn.addClass(EditTaskModalClasses.elements.priorityBtnSelected);
				this.priority = option.value;
				this.priorityChanged = true;
			});
		});
	}

	/**
	 * 重写日期字段以跟踪变更
	 */
	protected renderDateField(
		container: HTMLElement,
		label: string,
		current: Date | null,
		onChange: (d: Date | null) => void
	): void {
		const { EditTaskModalClasses } = require('../utils/bem') as typeof import('../utils/bem');
		const dateItem = container.createDiv(EditTaskModalClasses.elements.dateItem);
		dateItem.createEl('label', {
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
				this.datesChanged = true;
				return;
			}
			const parsed = this.parseDate(input.value);
			if (parsed) {
				onChange(parsed);
				this.datesChanged = true;
			}
		});

		const clearBtn = inputContainer.createEl('button', {
			cls: EditTaskModalClasses.elements.dateClear,
			text: '×'
		});
		clearBtn.addEventListener('click', () => {
			input.value = '';
			onChange(null);
			this.datesChanged = true;
		});
	}

	/**
	 * 重写日期区域以跟踪变更
	 */
	protected renderDatesSection(container: HTMLElement): void {
		const { EditTaskModalClasses } = require('../utils/bem') as typeof import('../utils/bem');
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const datesContainer = section.createDiv(EditTaskModalClasses.elements.datesContainer);
		datesContainer.createEl('label', {
			text: '时间设置',
			cls: EditTaskModalClasses.elements.sectionLabel
		});

		const datesGrid = datesContainer.createDiv(EditTaskModalClasses.elements.datesGrid);

		this.renderDateField(datesGrid, '📅 截止/提醒', this.dueDate, (d) => this.dueDate = d);
		this.renderDateField(datesGrid, '🛫 开始', this.startDate, (d) => this.startDate = d);
	}

	/**
	 * 重写标签区域以跟踪变更
	 */
	protected renderTagsSection(container: HTMLElement): void {
		const { EditTaskModalClasses } = require('../utils/bem') as typeof import('../utils/bem');
		const { TagSelector } = require('../components/TagSelector') as typeof import('../components/TagSelector');
		const section = container.createDiv(EditTaskModalClasses.elements.section);
		const tagsContainer = section.createDiv(EditTaskModalClasses.elements.tagsSection);

		this.tagSelector = new TagSelector({
			container: tagsContainer,
			allTasks: this.getAllTasksForTags(),
			initialTags: this.getInitialTags(),
			compact: false,
			onChange: (tags) => {
				this.selectedTags = tags;
				this.tagsChanged = true;
			}
		});
	}

	/**
	 * 重写重复设置以跟踪变更
	 */
	protected renderRepeatSection(container: HTMLElement): void {
		const { EditTaskModalClasses } = require('../utils/bem') as typeof import('../utils/bem');
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const repeatContainer = section.createDiv(EditTaskModalClasses.elements.repeatSection);

		// 标题行：左侧标签 + 右侧清除按钮
		const headerRow = repeatContainer.createDiv();
		headerRow.style.display = 'flex';
		headerRow.style.justifyContent = 'space-between';
		headerRow.style.alignItems = 'center';
		headerRow.style.marginBottom = '12px';

		headerRow.createEl('label', {
			text: '重复设置',
			cls: EditTaskModalClasses.elements.sectionLabel
		});

		const clearBtn = headerRow.createEl('button', {
			cls: EditTaskModalClasses.elements.repeatClearBtn,
			text: '× 清除'
		});
		clearBtn.style.padding = '2px 8px';
		clearBtn.style.fontSize = 'var(--font-ui-smaller)';
		clearBtn.style.color = 'var(--text-muted)';

		const repeatGrid = repeatContainer.createDiv(EditTaskModalClasses.elements.repeatGrid);

		// 频率选择行
		const freqSelectRow = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatRow);
		freqSelectRow.style.display = 'flex';
		freqSelectRow.style.alignItems = 'center';
		freqSelectRow.style.gap = '8px';
		freqSelectRow.style.marginBottom = '12px';
		freqSelectRow.style.flexWrap = 'wrap';

		freqSelectRow.createEl('span', { text: '每' });

		const intervalInput = freqSelectRow.createEl('input', {
			type: 'number',
			value: '1',
			cls: EditTaskModalClasses.elements.repeatIntervalInput
		});
		intervalInput.min = '1';
		intervalInput.style.width = '60px';
		intervalInput.style.padding = '4px 8px';

		const freqSelect = freqSelectRow.createEl('select', {
			cls: EditTaskModalClasses.elements.repeatFreqSelect
		});
		freqSelect.style.padding = '4px 8px';

		const freqOptions = [
			{ value: '', label: '不重复' },
			{ value: 'daily', label: '天' },
			{ value: 'weekly', label: '周' },
			{ value: 'monthly', label: '月' },
			{ value: 'yearly', label: '年' },
			{ value: 'custom', label: '自定义' },
		];
		freqOptions.forEach(opt => {
			freqSelect.createEl('option', { value: opt.value, text: opt.label });
		});

		// 自定义输入
		const manualInput = freqSelectRow.createEl('input', {
			type: 'text',
			placeholder: '如: every week on Monday when done',
			cls: EditTaskModalClasses.elements.repeatManualInput
		});
		manualInput.style.display = 'none';
		manualInput.style.flex = '1';
		manualInput.style.minWidth = '200px';
		manualInput.style.padding = '4px 8px';

		// 每周星期选择
		const weeklyDaysContainer = freqSelectRow.createSpan(EditTaskModalClasses.elements.repeatDaysContainer);
		weeklyDaysContainer.style.display = 'none';
		weeklyDaysContainer.style.alignItems = 'center';
		weeklyDaysContainer.style.gap = '4px';

		weeklyDaysContainer.createSpan({ text: '  ' });
		const dayButtons: HTMLButtonElement[] = [];
		const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
		dayNames.forEach((dayName) => {
			const dayBtn = weeklyDaysContainer.createEl('button', {
				cls: EditTaskModalClasses.elements.repeatDayCheckbox,
				text: dayName
			});
			dayBtn.type = 'button';
			dayBtn.style.padding = '4px 6px';
			dayBtn.style.minWidth = '28px';
			dayBtn.style.border = '1px solid var(--background-modifier-border)';
			dayBtn.style.borderRadius = '4px';
			dayBtn.style.backgroundColor = 'var(--background-secondary)';
			dayBtn.style.cursor = 'pointer';
			dayBtn.style.fontSize = 'var(--font-ui-smaller)';

			dayBtn.addEventListener('click', () => {
				dayBtn.classList.toggle('active');
				if (dayBtn.classList.contains('active')) {
					dayBtn.style.backgroundColor = 'var(--interactive-accent)';
					dayBtn.style.color = 'var(--text-on-accent)';
					dayBtn.style.borderColor = 'var(--interactive-accent)';
				} else {
					dayBtn.style.backgroundColor = 'var(--background-secondary)';
					dayBtn.style.color = 'var(--text-normal)';
					dayBtn.style.borderColor = 'var(--background-modifier-border)';
				}
				updateRepeat();
			});

			dayButtons.push(dayBtn);
		});

		// 每月日期选择
		const monthlyDayContainer = freqSelectRow.createSpan(EditTaskModalClasses.elements.repeatMonthContainer);
		monthlyDayContainer.style.display = 'none';
		monthlyDayContainer.style.alignItems = 'center';
		monthlyDayContainer.style.gap = '4px';

		monthlyDayContainer.createSpan({ text: '  ' });
		const monthDayInput = monthlyDayContainer.createEl('input', {
			type: 'number',
			cls: EditTaskModalClasses.elements.repeatMonthSelect,
			placeholder: '日期'
		});
		monthDayInput.min = '1';
		monthDayInput.max = '31';
		monthDayInput.style.width = '60px';
		monthDayInput.style.padding = '4px 6px';
		monthDayInput.style.fontSize = 'var(--font-ui-small)';

		// 重复方式
		const whenDoneRow = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatWhenDoneContainer);
		whenDoneRow.style.display = 'flex';
		whenDoneRow.style.alignItems = 'center';
		whenDoneRow.style.gap = '8px';
		whenDoneRow.style.marginBottom = '12px';

		whenDoneRow.createEl('span', { text: '重复方式：' });
		whenDoneRow.style.fontSize = 'var(--font-ui-small)';
		whenDoneRow.style.color = 'var(--text-muted)';

		const whenDoneToggle = whenDoneRow.createEl('input', {
			type: 'radio',
			cls: EditTaskModalClasses.elements.repeatWhenDoneToggle
		});
		whenDoneToggle.setAttribute('name', 'repeat-type');
		whenDoneToggle.id = 'repeat-fixed';
		whenDoneToggle.checked = true;

		const fixedLabel = whenDoneRow.createEl('label', { text: '按固定日期重复' });
		fixedLabel.setAttribute('for', 'repeat-fixed');
		fixedLabel.style.fontSize = 'var(--font-ui-small)';

		const whenDoneToggle2 = whenDoneRow.createEl('input', {
			type: 'radio',
			cls: EditTaskModalClasses.elements.repeatWhenDoneToggle
		});
		whenDoneToggle2.setAttribute('name', 'repeat-type');
		whenDoneToggle2.id = 'repeat-when-done';

		const whenDoneLabel = whenDoneRow.createEl('label', { text: '完成后重新计算' });
		whenDoneLabel.setAttribute('for', 'repeat-when-done');
		whenDoneLabel.style.fontSize = 'var(--font-ui-small)';
		whenDoneLabel.setAttribute('title', '下次任务的日期从完成当天算起');

		// 预览
		const previewBox = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatPreview);
		previewBox.style.padding = '8px 12px';
		previewBox.style.backgroundColor = 'var(--background-modifier-hover)';
		previewBox.style.borderRadius = '4px';
		previewBox.style.fontSize = 'var(--font-ui-small)';
		previewBox.style.color = 'var(--text-muted)';
		previewBox.style.marginBottom = '12px';
		previewBox.style.minHeight = '36px';
		previewBox.style.display = 'flex';
		previewBox.style.alignItems = 'center';

		const previewText = previewBox.createEl('span', {
			text: 'no repeat',
			cls: EditTaskModalClasses.elements.repeatPreviewText
		});

		// 规则说明
		const rulesHint = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatRulesHint);
		rulesHint.style.marginTop = '8px';
		rulesHint.style.padding = '8px';
		rulesHint.style.backgroundColor = 'var(--background-modifier-hover)';
		rulesHint.style.borderRadius = '4px';
		rulesHint.style.fontSize = 'var(--font-ui-smaller)';

		const rulesHintTitle = rulesHint.createEl('div', {
			text: '支持的规则：',
			cls: EditTaskModalClasses.elements.repeatRulesHintTitle
		});
		rulesHintTitle.style.fontWeight = 'var(--font-medium)';
		rulesHintTitle.style.marginBottom = '4px';

		const rulesHintList = rulesHint.createEl('div', {
			text: '• every day / every 3 days / every weekday / every weekend\n• every week / every 2 weeks / every week on Monday, Friday\n• every month / every month on the 15th / on the last\n• every year / every January on the 15th\n• 添加 "when done" 表示基于完成日期计算',
			cls: EditTaskModalClasses.elements.repeatRulesHintList
		});
		rulesHintList.style.whiteSpace = 'pre-line';
		rulesHintList.style.color = 'var(--text-muted)';

		// 错误提示
		const errorMsg = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatErrorMsg);
		errorMsg.style.display = 'none';
		errorMsg.style.color = 'var(--text-error)';
		errorMsg.style.fontSize = 'var(--font-ui-smaller)';
		errorMsg.style.marginTop = '4px';

		// 辅助函数
		const getSelectedDays = (): number[] | undefined => {
			const selected: number[] = [];
			dayButtons.forEach((btn, idx) => {
				if (btn.classList.contains('active')) selected.push(idx);
			});
			return selected.length > 0 ? selected : undefined;
		};

		// 更新逻辑
		const updateRepeat = () => {
			this.repeatChanged = true;
			const freqValue = freqSelect.value;
			const interval = parseInt(intervalInput.value) || 1;

			if (!freqValue) {
				this.repeat = null;
				previewText.textContent = 'no repeat';
				manualInput.style.display = 'none';
				weeklyDaysContainer.style.display = 'none';
				monthlyDayContainer.style.display = 'none';
				return;
			}

			if (freqValue === 'custom') {
				const manualRule = manualInput.value.trim();
				if (manualRule) {
					if (this.validateRepeatRule(manualRule)) {
						this.repeat = manualRule;
						previewText.textContent = manualRule;
						errorMsg.style.display = 'none';
					} else {
						errorMsg.textContent = '规则格式不正确';
						errorMsg.style.display = 'block';
					}
				} else {
					this.repeat = null;
					previewText.textContent = 'no repeat';
				}
				weeklyDaysContainer.style.display = 'none';
				monthlyDayContainer.style.display = 'none';
				return;
			}

			const whenDone = whenDoneToggle2.checked;
			const selectedDays = getSelectedDays();
			let monthDayValue: number | string | undefined;
			if (freqValue === 'monthly') {
				const val = monthDayInput.value.trim();
				if (val) {
					const dayNum = parseInt(val);
					if (!isNaN(dayNum) && dayNum >= 1 && dayNum <= 31) monthDayValue = dayNum;
				}
			}

			const config: RepeatConfig = {
				frequency: freqValue as 'daily' | 'weekly' | 'monthly' | 'yearly',
				interval,
				days: selectedDays,
				monthDay: monthDayValue,
				whenDone
			};

			const rule = this.buildRepeatRule(config);
			this.repeat = rule;
			previewText.textContent = rule;
			errorMsg.style.display = 'none';
		};

		// 事件监听
		freqSelect.addEventListener('change', () => {
			const value = freqSelect.value;
			manualInput.style.display = 'none';
			weeklyDaysContainer.style.display = 'none';
			monthlyDayContainer.style.display = 'none';
			dayButtons.forEach(btn => {
				btn.classList.remove('active');
				btn.style.backgroundColor = 'var(--background-secondary)';
				btn.style.color = 'var(--text-normal)';
				btn.style.borderColor = 'var(--background-modifier-border)';
			});
			monthDayInput.value = '';

			if (value === 'custom') {
				manualInput.style.display = 'block';
				const interval = parseInt(intervalInput.value) || 1;
				const whenDone = whenDoneToggle2.checked;
				let defaultRule = interval === 1 ? 'every week' : `every ${interval} weeks`;
				if (whenDone) defaultRule += ' when done';
				manualInput.value = defaultRule;
			} else if (value === 'weekly') {
				weeklyDaysContainer.style.display = 'flex';
			} else if (value === 'monthly') {
				monthlyDayContainer.style.display = 'flex';
			}

			updateRepeat();
		});

		intervalInput.addEventListener('input', updateRepeat);
		manualInput.addEventListener('input', updateRepeat);
		monthDayInput.addEventListener('input', updateRepeat);
		whenDoneToggle.addEventListener('change', updateRepeat);
		whenDoneToggle2.addEventListener('change', updateRepeat);

		clearBtn.addEventListener('click', () => {
			freqSelect.value = '';
			intervalInput.value = '1';
			whenDoneToggle.checked = true;
			whenDoneToggle2.checked = false;
			manualInput.value = '';
			manualInput.style.display = 'none';
			weeklyDaysContainer.style.display = 'none';
			monthlyDayContainer.style.display = 'none';
			monthDayInput.value = '';
			dayButtons.forEach(btn => {
				btn.classList.remove('active');
				btn.style.backgroundColor = 'var(--background-secondary)';
				btn.style.color = 'var(--text-normal)';
				btn.style.borderColor = 'var(--background-modifier-border)';
			});
			this.repeat = null;
			this.repeatChanged = true;
			previewText.textContent = 'no repeat';
			errorMsg.style.display = 'none';
		});

		// 初始化当前值
		this.initRepeatFromTask(freqSelect, intervalInput, manualInput, whenDoneToggle2, dayButtons, monthDayInput, weeklyDaysContainer, monthlyDayContainer, updateRepeat);
	}

	/**
	 * 从当前任务初始化 repeat UI 状态
	 */
	private initRepeatFromTask(
		freqSelect: HTMLSelectElement,
		intervalInput: HTMLInputElement,
		manualInput: HTMLInputElement,
		whenDoneToggle2: HTMLInputElement,
		dayButtons: HTMLButtonElement[],
		monthDayInput: HTMLInputElement,
		weeklyDaysContainer: HTMLElement,
		monthlyDayContainer: HTMLElement,
		updateRepeat: () => void
	): void {
		const currentRepeat = this.task.repeat;
		if (!currentRepeat) {
			freqSelect.value = '';
			intervalInput.value = '1';
			manualInput.style.display = 'none';
			weeklyDaysContainer.style.display = 'none';
			monthlyDayContainer.style.display = 'none';
			return;
		}

		const config = this.parseRepeatToConfig(currentRepeat);
		if (config) {
			intervalInput.value = String(config.interval);
			whenDoneToggle2.checked = config.whenDone;

			const isStandardRule = config.interval === 1 &&
				(!config.days || config.days.length <= 1) &&
				(!config.monthDay || config.monthDay === 1);

			if (isStandardRule) {
				freqSelect.value = config.frequency;
				manualInput.style.display = 'none';

				if (config.days && config.days.length > 0) {
					config.days.forEach(dayIdx => {
						if (dayButtons[dayIdx]) {
							dayButtons[dayIdx].classList.add('active');
							dayButtons[dayIdx].style.backgroundColor = 'var(--interactive-accent)';
							dayButtons[dayIdx].style.color = 'var(--text-on-accent)';
						}
					});
					weeklyDaysContainer.style.display = 'flex';
				}

				if (config.monthDay && config.monthDay !== 'last' && typeof config.monthDay === 'number') {
					monthDayInput.value = String(config.monthDay);
					monthlyDayContainer.style.display = 'flex';
				} else if (config.monthDay === 'last') {
					monthDayInput.value = 'last';
					monthlyDayContainer.style.display = 'flex';
				}
			} else {
				freqSelect.value = 'custom';
				manualInput.value = currentRepeat;
				manualInput.style.display = 'block';
				weeklyDaysContainer.style.display = 'none';
				monthlyDayContainer.style.display = 'none';
			}

			// 重置变更标记
			this.repeatChanged = false;
		} else {
			freqSelect.value = 'custom';
			manualInput.value = currentRepeat;
			manualInput.style.display = 'block';
			weeklyDaysContainer.style.display = 'none';
			monthlyDayContainer.style.display = 'none';
			whenDoneToggle2.checked = currentRepeat.toLowerCase().includes('when done');
			this.repeatChanged = false;
		}
	}
}

// 导出类型
export type { PriorityOption, RepeatConfig } from './BaseTaskModal';
