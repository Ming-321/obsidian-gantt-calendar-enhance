/**
 * 任务创建弹窗
 *
 * 提供快速创建任务（待办/提醒）的界面，基于 BaseTaskModal 基类。
 * 任务通过 TaskStore 存储到 JSON 文件中。
 */

import { App, Notice } from 'obsidian';
import type GanttCalendarPlugin from '../../main';
import { Logger } from '../utils/logger';
import type { GCTask } from '../types';
import { BaseTaskModal, type PriorityOption } from './BaseTaskModal';

/**
 * 任务创建弹窗选项
 */
export interface CreateTaskModalOptions {
	app: App;
	plugin: GanttCalendarPlugin;
	targetDate?: Date;
	defaultType?: 'todo' | 'reminder';
	onSuccess: () => void;
}

/**
 * 任务创建弹窗
 */
export class CreateTaskModal extends BaseTaskModal {
	private plugin: GanttCalendarPlugin;
	private targetDate: Date;
	private onSuccess: () => void;

	// 独有状态
	private descriptionInput: HTMLTextAreaElement;
	private detailInput: HTMLTextAreaElement;

	constructor(options: CreateTaskModalOptions) {
		super(options.app);
		this.plugin = options.plugin;
		this.targetDate = options.targetDate || new Date();
		this.onSuccess = options.onSuccess;

		// 默认任务类型
		this.taskType = options.defaultType || 'todo';

		// 默认值
		const today = new Date();
		today.setHours(0, 0, 0, 0);
		this.createdDate = new Date(today);
		this.startDate = new Date(today);
		this.dueDate = new Date(this.targetDate);
		this.dueDate.setHours(0, 0, 0, 0);
		this.cancelledDate = null;
		this.completionDate = null;

		// 默认优先级
		this.priority = 'normal';
	}

	onOpen(): void {
		this.renderModalContent('创建新任务');

		// 自动聚焦到描述输入框
		setTimeout(() => this.descriptionInput.focus(), 100);
	}

	// ==================== 实现抽象方法 ====================

	/**
	 * 渲染任务描述板块
	 */
	protected renderDescriptionSection(container: HTMLElement): void {
		const { EditTaskModalClasses } = require('../utils/bem') as typeof import('../utils/bem');
		const section = container.createDiv(EditTaskModalClasses.elements.section);

		// 标题/描述
		const descContainer = section.createDiv(EditTaskModalClasses.elements.descContainer);
		descContainer.createEl('label', {
			text: '任务标题 *',
			cls: EditTaskModalClasses.elements.sectionLabel
		});

		this.descriptionInput = descContainer.createEl('textarea', {
			cls: EditTaskModalClasses.elements.descTextarea
		});
		this.descriptionInput.placeholder = '输入任务标题...';
		this.descriptionInput.style.minHeight = '40px';
		this.descriptionInput.style.maxHeight = '40px';

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

		// 详细说明（可选）
		const detailContainer = section.createDiv(EditTaskModalClasses.elements.descContainer);
		detailContainer.createEl('label', {
			text: '详细说明（可选）',
			cls: EditTaskModalClasses.elements.sectionLabel
		});
		detailContainer.style.marginTop = '12px';

		this.detailInput = detailContainer.createEl('textarea', {
			cls: EditTaskModalClasses.elements.descTextarea
		});
		this.detailInput.placeholder = '输入详细说明...';
		this.detailInput.style.minHeight = '50px';
		this.detailInput.style.maxHeight = '80px';
	}

	/**
	 * 保存任务
	 */
	protected async saveTask(): Promise<void> {
		// 验证描述
		const description = this.descriptionInput.value.trim().replace(/[\r\n]+/g, ' ');
		if (!description) {
			new Notice('请输入任务标题');
			this.descriptionInput.focus();
			return;
		}

		// 验证日期
		if (!this.dueDate) {
			new Notice('请设置截止/提醒日期');
			return;
		}

		try {
			const task: GCTask = {
				id: '',  // JsonDataSource 会自动生成
				type: this.taskType,
				description,
				detail: this.detailInput.value.trim() || undefined,
				completed: false,
				priority: this.priority,
			tags: this.selectedTags.length > 0 ? this.selectedTags : undefined,
			createdDate: new Date(),
			startDate: this.startDate || new Date(),
			dueDate: this.dueDate,
			repeat: this.repeat || undefined,
				archived: false,
			};

			await this.plugin.taskCache.createTask(task);

			new Notice(`${this.taskType === 'todo' ? '待办' : '提醒'}创建成功`);
			this.onSuccess();
			this.close();
		} catch (error) {
			Logger.error('CreateTaskModal', 'Error creating task:', error);
			new Notice('创建任务失败: ' + (error as Error).message);
		}
	}

	/**
	 * 获取初始标签列表（创建任务时为空）
	 */
	protected getInitialTags(): string[] {
		return [];
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
		return { cancel: '取消', save: '创建' };
	}
}

// 导出类型
export type { PriorityOption, RepeatConfig } from './BaseTaskModal';
