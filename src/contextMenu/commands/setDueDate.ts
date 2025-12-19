import { App, Modal, Setting } from 'obsidian';
import type { GanttTask } from '../../types';
import { updateTaskDateField } from '../../taskManager';

/**
 * 设置任务截止日期
 */
export async function setTaskDueDate(
	app: App,
	task: GanttTask,
	enabledFormats: string[],
	onSuccess: () => void
): Promise<void> {
	const modal = new DatePickerModal(
		app,
		'设置截止日期',
		task.dueDate,
		async (date: Date) => {
			try {
				await updateTaskDateField(app, task, 'dueDate', date, enabledFormats);
				onSuccess();
			} catch (error) {
				console.error('Failed to update due date:', error);
			}
		}
	);
	modal.open();
}

/**
 * 日期选择器模态框
 */
class DatePickerModal extends Modal {
	private title: string;
	private initialDate?: Date;
	private onSubmit: (date: Date) => void;

	constructor(
		app: App,
		title: string,
		initialDate: Date | undefined,
		onSubmit: (date: Date) => void
	) {
		super(app);
		this.title = title;
		this.initialDate = initialDate;
		this.onSubmit = onSubmit;
	}

	onOpen() {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('gantt-date-picker-modal');

		contentEl.createEl('h2', { text: this.title });

		let selectedDate = this.initialDate || new Date();

		new Setting(contentEl)
			.setName('选择日期')
			.addText(text => {
				const dateStr = this.formatDate(selectedDate);
				text
					.setValue(dateStr)
					.setPlaceholder('YYYY-MM-DD')
					.onChange(value => {
						const parsed = this.parseDate(value);
						if (parsed) {
							selectedDate = parsed;
						}
					});
				text.inputEl.type = 'date';
				text.inputEl.value = dateStr;
			});

		new Setting(contentEl)
			.addButton(btn => btn
				.setButtonText('确定')
				.setCta()
				.onClick(() => {
					this.onSubmit(selectedDate);
					this.close();
				}))
			.addButton(btn => btn
				.setButtonText('取消')
				.onClick(() => {
					this.close();
				}));
	}

	onClose() {
		const { contentEl } = this;
		contentEl.empty();
	}

	private formatDate(date: Date): string {
		const year = date.getFullYear();
		const month = String(date.getMonth() + 1).padStart(2, '0');
		const day = String(date.getDate()).padStart(2, '0');
		return `${year}-${month}-${day}`;
	}

	private parseDate(dateStr: string): Date | null {
		const match = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
		if (!match) return null;
		const date = new Date(dateStr);
		return isNaN(date.getTime()) ? null : date;
	}
}
