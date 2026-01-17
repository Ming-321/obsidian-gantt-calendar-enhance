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

/**
 * 周期任务配置
 */
interface RepeatConfig {
	frequency: 'daily' | 'weekly' | 'monthly' | 'yearly';
	interval: number;
	days?: number[];  // 0-6, 周日到周六
	monthDay?: number | 'last';  // 1-31 或 'last'
	whenDone: boolean;
}

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
	private repeat: string | null | undefined = undefined;
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
		this.repeat = undefined;
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

		// 3.5. 周期设置板块
		this.renderRepeatSection(contentEl);

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
	 * 渲染周期设置板块
	 */
	private renderRepeatSection(container: HTMLElement): void {
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		const repeatContainer = section.createDiv(EditTaskModalClasses.elements.repeatSection);
		repeatContainer.createEl('label', {
			text: '周期设置',
			cls: EditTaskModalClasses.elements.sectionLabel
		});

		const repeatGrid = repeatContainer.createDiv(EditTaskModalClasses.elements.repeatGrid);

		// 第一行：频率选择 + 间隔输入 + 清除按钮
		const row1 = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatRow);

		// 频率选择
		const freqSelect = row1.createEl('select', {
			cls: EditTaskModalClasses.elements.repeatFreqSelect
		});
		[
			{ value: '', label: '不重复' },
			{ value: 'daily', label: '每天' },
			{ value: 'weekly', label: '每周' },
			{ value: 'monthly', label: '每月' },
			{ value: 'yearly', label: '每年' },
		].forEach(opt => {
			freqSelect.createEl('option', { value: opt.value, text: opt.label });
		});

		// 间隔输入
		const intervalContainer = row1.createEl('div');
		intervalContainer.style.display = 'flex';
		intervalContainer.style.alignItems = 'center';
		intervalContainer.style.gap = '4px';
		const intervalInput = intervalContainer.createEl('input', {
			type: 'number',
			value: '1',
			cls: EditTaskModalClasses.elements.repeatIntervalInput
		});
		intervalInput.min = '1';
		intervalInput.style.width = '60px';
		intervalContainer.createEl('span', { text: '次' });

		// 清除按钮
		const clearBtn = row1.createEl('button', {
			cls: EditTaskModalClasses.elements.repeatClearBtn,
			text: '× 清除'
		});
		clearBtn.style.marginLeft = 'auto';

		// 星期选择（仅每周模式显示）
		const daysContainer = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatDaysContainer);
		daysContainer.style.display = 'none';
		daysContainer.style.flexWrap = 'wrap';
		daysContainer.style.gap = '8px';

		const dayNames = ['日', '一', '二', '三', '四', '五', '六'];
		const dayCheckboxes: HTMLInputElement[] = [];

		dayNames.forEach((name, idx) => {
			const label = daysContainer.createEl('label', {
				cls: EditTaskModalClasses.elements.repeatDayLabel
			});
			label.style.display = 'flex';
			label.style.alignItems = 'center';
			label.style.gap = '4px';
			label.style.fontSize = 'var(--font-ui-small)';

			const checkbox = label.createEl('input', {
				type: 'checkbox',
				cls: EditTaskModalClasses.elements.repeatDayCheckbox
			});
			checkbox.dataset.dayIdx = String(idx);
			label.appendChild(document.createTextNode('周' + name));
			dayCheckboxes.push(checkbox);
		});

		// 月日期选择（仅每月模式显示）
		const monthContainer = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatMonthContainer);
		monthContainer.style.display = 'none';

		const monthSelect = monthContainer.createEl('select', {
			cls: EditTaskModalClasses.elements.repeatMonthSelect
		});
		for (let i = 1; i <= 31; i++) {
			monthSelect.createEl('option', { value: String(i), text: `${i}号` });
		}
		monthSelect.createEl('option', { value: 'last', text: '最后一天' });

		// when done 开关
		const whenDoneContainer = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatWhenDoneContainer);
		whenDoneContainer.style.display = 'none';
		whenDoneContainer.style.display = 'flex';
		whenDoneContainer.style.alignItems = 'center';
		whenDoneContainer.style.gap = '8px';

		const whenDoneToggle = whenDoneContainer.createEl('input', {
			type: 'checkbox',
			cls: EditTaskModalClasses.elements.repeatWhenDoneToggle
		});
		whenDoneContainer.createEl('label', { text: '完成后重新计算（when done）' });

		// 错误提示
		const errorMsg = repeatGrid.createDiv(EditTaskModalClasses.elements.repeatErrorMsg);
		errorMsg.style.display = 'none';
		errorMsg.style.color = 'var(--text-error)';
		errorMsg.style.fontSize = 'var(--font-ui-smaller)';
		errorMsg.style.marginTop = '4px';

		// 初始化当前值
		this.initRepeatValue(freqSelect, intervalInput, dayCheckboxes, monthSelect, whenDoneToggle, daysContainer, monthContainer, whenDoneContainer);

		// 事件处理
		this.setupRepeatEvents(freqSelect, intervalInput, dayCheckboxes, monthSelect, whenDoneToggle, daysContainer, monthContainer, whenDoneContainer, errorMsg, clearBtn);
	}

	/**
	 * 初始化 repeat 值
	 */
	private initRepeatValue(
		freqSelect: HTMLSelectElement,
		intervalInput: HTMLInputElement,
		dayCheckboxes: HTMLInputElement[],
		monthSelect: HTMLSelectElement,
		whenDoneToggle: HTMLInputElement,
		daysContainer: HTMLElement,
		monthContainer: HTMLElement,
		whenDoneContainer: HTMLElement
	): void {
		const currentRepeat = this.task.repeat;
		if (!currentRepeat) {
			freqSelect.value = '';
			return;
		}

		const config = this.parseRepeatToConfig(currentRepeat);
		if (config) {
			freqSelect.value = config.frequency;
			intervalInput.value = String(config.interval);

			if (config.days) {
				config.days.forEach(d => {
					if (dayCheckboxes[d]) dayCheckboxes[d].checked = true;
				});
			}

			if (config.monthDay !== undefined) {
				monthSelect.value = String(config.monthDay);
			}

			whenDoneToggle.checked = config.whenDone;

			// 显示对应的容器
			this.toggleRepeatContainers(config.frequency, daysContainer, monthContainer, whenDoneContainer);
		}
	}

	/**
	 * 设置 repeat 事件
	 */
	private setupRepeatEvents(
		freqSelect: HTMLSelectElement,
		intervalInput: HTMLInputElement,
		dayCheckboxes: HTMLInputElement[],
		monthSelect: HTMLSelectElement,
		whenDoneToggle: HTMLInputElement,
		daysContainer: HTMLElement,
		monthContainer: HTMLElement,
		whenDoneContainer: HTMLElement,
		errorMsg: HTMLElement,
		clearBtn: HTMLElement
	): void {
		const updateRepeat = () => {
			const freq = freqSelect.value as 'daily' | 'weekly' | 'monthly' | 'yearly' | '';
			const interval = parseInt(intervalInput.value) || 1;
			const whenDone = whenDoneToggle.checked;

			if (!freq) {
				this.repeat = null;
				this.toggleRepeatContainers('', daysContainer, monthContainer, whenDoneContainer);
				errorMsg.style.display = 'none';
				return;
			}

			let days: number[] | undefined;
			if (freq === 'weekly') {
				days = dayCheckboxes
					.map((cb, idx) => cb.checked ? idx : undefined)
					.filter((d): d is number => d !== undefined);
				if (days.length === 0) days = undefined;
			}

			let monthDay: number | 'last' | undefined;
			if (freq === 'monthly') {
				const val = monthSelect.value;
				monthDay = val === 'last' ? 'last' : parseInt(val);
			}

			const rule = this.buildRepeatRule({
				frequency: freq,
				interval,
				days,
				monthDay,
				whenDone
			});

			if (this.validateRepeatRule(rule)) {
				this.repeat = rule;
				errorMsg.style.display = 'none';
			} else {
				errorMsg.textContent = '周期规则格式不正确';
				errorMsg.style.display = 'block';
			}
		};

		freqSelect.addEventListener('change', () => {
			this.toggleRepeatContainers(freqSelect.value, daysContainer, monthContainer, whenDoneContainer);
			updateRepeat();
		});

		intervalInput.addEventListener('input', updateRepeat);
		monthSelect.addEventListener('change', updateRepeat);
		whenDoneToggle.addEventListener('change', updateRepeat);
		dayCheckboxes.forEach(cb => cb.addEventListener('change', updateRepeat));

		clearBtn.addEventListener('click', () => {
			freqSelect.value = '';
			intervalInput.value = '1';
			dayCheckboxes.forEach(cb => cb.checked = false);
			monthSelect.value = '1';
			whenDoneToggle.checked = false;
			this.repeat = null;
			this.toggleRepeatContainers('', daysContainer, monthContainer, whenDoneContainer);
		});
	}

	/**
	 * 切换 repeat 容器显示
	 */
	private toggleRepeatContainers(
		frequency: string,
		daysContainer: HTMLElement,
		monthContainer: HTMLElement,
		whenDoneContainer: HTMLElement
	): void {
		daysContainer.style.display = frequency === 'weekly' ? 'flex' : 'none';
		monthContainer.style.display = frequency === 'monthly' ? 'block' : 'none';
		whenDoneContainer.style.display = frequency ? 'flex' : 'none';
	}

	/**
	 * 解析 repeat 字符串为配置对象
	 */
	private parseRepeatToConfig(rule: string): RepeatConfig | null {
		const lower = rule.toLowerCase().trim();

		// 解析 when done
		const whenDone = lower.includes('when done');
		const baseRule = lower.replace(/\s*when\s+done\s*$/, '').trim();

		// 解析 daily
		const dailyMatch = baseRule.match(/^every\s+(\d+)\s*(days|day)$/);
		if (dailyMatch) {
			return { frequency: 'daily', interval: parseInt(dailyMatch[1]), whenDone };
		}
		if (baseRule === 'every day') {
			return { frequency: 'daily', interval: 1, whenDone };
		}

		// 解析 weekly
		const weeklyMatch = baseRule.match(/^every\s+(\d+)\s*(weeks|week)(?:\s+on\s+(.+))?$/);
		if (weeklyMatch || baseRule.startsWith('every week')) {
			const interval = weeklyMatch ? parseInt(weeklyMatch[1]) : 1;
			const daysPart = weeklyMatch?.[3] || baseRule.replace(/^every\s+(\d+\s+)?weeks?\s+on\s+/, '');

			const dayMap: Record<string, number> = {
				'sunday': 0, 'monday': 1, 'tuesday': 2, 'wednesday': 3,
				'thursday': 4, 'friday': 5, 'saturday': 6
			};

			let days: number[] | undefined;
			if (daysPart) {
				const dayNames = daysPart.split(',').map(d => d.trim().toLowerCase());
				days = dayNames.map(d => dayMap[d]).filter((d): d is number => d !== undefined);
			}

			return { frequency: 'weekly', interval, days, whenDone };
		}

		// 解析 monthly
		const monthlyMatch = baseRule.match(/^every\s+(\d+)\s*(months|month)(?:\s+on\s+(the\s+)?(.+))?$/);
		if (monthlyMatch || baseRule.startsWith('every month')) {
			const interval = monthlyMatch ? parseInt(monthlyMatch[1]) : 1;
			const datePart = monthlyMatch?.[4] || baseRule.replace(/^every\s+(\d+\s+)?months?\s+on\s+(the\s+)?/, '');

			let monthDay: number | 'last' | undefined;
			if (datePart) {
				if (datePart.includes('last')) {
					monthDay = 'last';
				} else {
					const numMatch = datePart.match(/\d+/);
					if (numMatch) monthDay = parseInt(numMatch[0]);
				}
			}

			return { frequency: 'monthly', interval, monthDay, whenDone };
		}

		// 解析 yearly
		const yearlyMatch = baseRule.match(/^every\s+(\d+)\s*(years|year)/);
		if (yearlyMatch || baseRule === 'every year') {
			const interval = yearlyMatch ? parseInt(yearlyMatch[1]) : 1;
			return { frequency: 'yearly', interval, whenDone };
		}

		return null;
	}

	/**
	 * 构建规则字符串
	 */
	private buildRepeatRule(config: RepeatConfig): string {
		const { frequency, interval, days, monthDay, whenDone } = config;

		let rule = '';

		switch (frequency) {
			case 'daily':
				rule = interval === 1 ? 'every day' : `every ${interval} days`;
				break;
			case 'weekly':
				if (interval === 1 && !days) {
					rule = 'every week';
				} else if (days && days.length > 0) {
					const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
					const daysStr = days.map(d => dayNames[d]).join(', ');
					rule = interval === 1 ? `every week on ${daysStr}` : `every ${interval} weeks on ${daysStr}`;
				} else {
					rule = interval === 1 ? 'every week' : `every ${interval} weeks`;
				}
				break;
			case 'monthly':
				if (monthDay === 'last') {
					rule = interval === 1 ? 'every month on the last' : `every ${interval} months on the last`;
				} else if (monthDay) {
					rule = interval === 1 ? `every month on the ${monthDay}${this.getOrdinalSuffix(monthDay)}` : `every ${interval} months on the ${monthDay}${this.getOrdinalSuffix(monthDay)}`;
				} else {
					rule = interval === 1 ? 'every month' : `every ${interval} months`;
				}
				break;
			case 'yearly':
				rule = interval === 1 ? 'every year' : `every ${interval} years`;
				break;
		}

		if (whenDone && rule) {
			rule += ' when done';
		}

		return rule;
	}

	private getOrdinalSuffix(n: number): string {
		if (n >= 11 && n <= 13) return 'th';
		switch (n % 10) {
			case 1: return 'st';
			case 2: return 'nd';
			case 3: return 'rd';
			default: return 'th';
		}
	}

	/**
	 * 验证周期规则
	 */
	private validateRepeatRule(rule: string): boolean {
		if (!rule) return true;
		const trimmed = rule.trim().toLowerCase();
		if (!trimmed.startsWith('every ')) return false;

		// 检查基本结构
		const validEndings = [
			/^every\s+day\s*(when\s+done)?$/,
			/^every\s+\d+\s+days?\s*(when\s+done)?$/,
			/^every\s+week\s*(when\s+done)?$/,
			/^every\s+\d+\s+weeks?\s*(when\s+done)?$/,
			/^every\s+week\s+on\s+.+\s*(when\s+done)?$/,
			/^every\s+\d+\s+weeks?\s+on\s+.+\s*(when\s+done)?$/,
			/^every\s+month\s*(when\s+done)?$/,
			/^every\s+\d+\s+months?\s*(when\s+done)?$/,
			/^every\s+month\s+on\s+.+\s*(when\s+done)?$/,
			/^every\s+\d+\s+months?\s+on\s+.+\s*(when\s+done)?$/,
			/^every\s+year\s*(when\s+done)?$/,
			/^every\s+\d+\s+years?\s*(when\s+done)?$/,
		];

		for (const pattern of validEndings) {
			if (pattern.test(trimmed)) return true;
		}

		return false;
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
			if (this.repeat !== undefined) updates.repeat = this.repeat;

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
