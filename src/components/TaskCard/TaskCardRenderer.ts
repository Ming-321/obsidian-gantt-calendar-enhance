import { App } from 'obsidian';
import type { GCTask } from '../../types';
import type { TaskCardConfig, TimeFieldConfig } from './TaskCardConfig';
import { TaskCardClasses, TimeBadgeClasses } from '../../utils/bem';
import { registerTaskContextMenu } from '../../contextMenu/contextMenuIndex';
import { updateTaskCompletion } from '../../tasks/taskUpdater';
import { RegularExpressions } from '../../utils/RegularExpressions';
import { formatDate } from '../../dateUtils/dateUtilsIndex';
import { TooltipManager } from '../../utils/tooltipManager';
import { Logger } from '../../utils/logger';
import { TagPill } from '../tagPill';
import { LinkRenderer } from '../../utils/linkRenderer';
import { getPriorityIcon, getPriorityClass } from '../../utils/priorityUtils';

/**
 * 任务卡片渲染器
 * 负责任务卡片各个子元素的渲染逻辑
 */
export class TaskCardRenderer {
	private app: App;
	private plugin: any;

	constructor(app: App, plugin: any) {
		this.app = app;
		this.plugin = plugin;
	}

	/**
	 * 格式化日期显示
	 */
	formatDateForDisplay(date: Date): string {
		return formatDate(date, 'yyyy-MM-dd');
	}

	/**
	 * 获取优先级图标（委托给集中工具函数）
	 */
	getPriorityIcon(priority?: string): string {
		return getPriorityIcon(priority);
	}

	/**
	 * 获取优先级CSS类名（委托给集中工具函数）
	 */
	getPriorityClass(priority?: string): string {
		return getPriorityClass(priority);
	}

	/**
	 * 获取任务状态颜色配置
	 * @deprecated 颜色不再由状态决定，而是由优先级色带决定
	 */
	getStatusColors(_task: GCTask): { bg: string; text: string } | null {
		return null;
	}

	/**
	 * 应用状态颜色到任务元素
	 * @deprecated 使用色带系统替代
	 */
	applyStatusColors(_task: GCTask, _element: HTMLElement): void {
		// No-op: 颜色由色带系统处理
	}

	/**
	 * 创建任务复选框
	 */
	createTaskCheckbox(task: GCTask, taskItem: HTMLElement): HTMLInputElement {
		const checkbox = taskItem.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
		checkbox.checked = task.completed;
		checkbox.disabled = false;
		checkbox.addClass(TaskCardClasses.elements.checkbox);

		checkbox.addEventListener('change', async (e) => {
			e.stopPropagation();
			const isNowCompleted = checkbox.checked;
			try {
				await updateTaskCompletion(
					this.app,
					task,
					isNowCompleted,
				);
				taskItem.toggleClass(TaskCardClasses.modifiers.completed, isNowCompleted);
				taskItem.toggleClass(TaskCardClasses.modifiers.pending, !isNowCompleted);
			} catch (error) {
				Logger.error('TaskCardRenderer', 'Error updating task:', error);
				checkbox.checked = task.completed;
			}
		});

		checkbox.addEventListener('click', (e) => {
			e.stopPropagation();
		});

		return checkbox;
	}

	/**
	 * 渲染任务描述
	 */
	renderDescription(card: HTMLElement, task: GCTask, config: TaskCardConfig): void {
		if (!config.showDescription) return;

		const cleaned = task.description;

		const taskTextEl = card.createDiv(TaskCardClasses.elements.text);

		// 应用最大行数限制
		if (config.maxLines) {
			taskTextEl.style.setProperty('--max-lines', String(config.maxLines));
			taskTextEl.addClass('gc-task-card__text--limited');
		}

		this.renderTaskDescriptionWithLinks(taskTextEl, cleaned);
	}

	/**
	 * 渲染任务描述为富文本（包含可点击的链接）
	 */
	private renderTaskDescriptionWithLinks(container: HTMLElement, text: string): void {
		LinkRenderer.renderTaskDescriptionWithLinks(container, text, this.app);
	}

	/**
	 * 渲染任务备注/详情
	 */
	renderDetail(card: HTMLElement, task: GCTask): void {
		if (!task.detail) return;

		const detailEl = card.createDiv(TaskCardClasses.elements.detail);
		detailEl.textContent = task.detail;
	}

	/**
	 * 渲染任务标签
	 */
	renderTaskTags(task: GCTask, container: HTMLElement): void {
		if (!task.tags || task.tags.length === 0) {
			return;
		}

		const tagsContainer = container.createDiv('gc-task-card__tags');

		// 使用 TagPill 组件创建标签
		TagPill.createMultiple(task.tags, tagsContainer, {
			showHash: true,
		});
	}

	/**
	 * 渲染优先级
	 */
	renderPriority(card: HTMLElement, task: GCTask): void {
		if (!task.priority) return;

		const priorityIcon = this.getPriorityIcon(task.priority);
		const priorityEl = card.createDiv(TaskCardClasses.elements.priority);
		const priorityClass = this.getPriorityClass(task.priority);
		priorityEl.createEl('span', {
			text: priorityIcon,
			cls: `${TaskCardClasses.elements.priorityBadge} ${priorityClass}`
		});
	}

	/**
	 * 渲染时间字段
	 */
	renderTimeFields(card: HTMLElement, task: GCTask, config?: TimeFieldConfig): void {
		if (!config) return;

		const container = card.createDiv(TaskCardClasses.elements.times);

		if (config.showCreated && task.createdDate) {
			this.renderTimeBadge(container, '创建', task.createdDate, TimeBadgeClasses.created);
		}
		if (config.showStart && task.startDate) {
			this.renderTimeBadge(container, '开始', task.startDate, TimeBadgeClasses.start);
		}
		if (config.showDue && task.dueDate) {
			const isOverdue = config.showOverdueIndicator && task.dueDate < new Date() && !task.completed;
			this.renderTimeBadge(container, '截止', task.dueDate, TimeBadgeClasses.due, isOverdue);
		}
		if (config.showCancelled && task.cancelledDate) {
			this.renderTimeBadge(container, '取消', task.cancelledDate, TimeBadgeClasses.cancelled);
		}
		if (config.showCompletion && task.completionDate) {
			this.renderTimeBadge(container, '完成', task.completionDate, TimeBadgeClasses.completion);
		}
	}

	private renderTimeBadge(
		container: HTMLElement,
		label: string,
		date: Date,
		className: string,
		isOverdue = false
	): void {
		const badge = container.createEl('span', {
			text: `${label}:${this.formatDateForDisplay(date)}`,
			cls: `${TaskCardClasses.elements.timeBadge} ${className}`
		});
		if (isOverdue) {
			badge.addClass(TimeBadgeClasses.overdue);
		}
		container.appendChild(badge);
	}

	/**
	 * 渲染文件位置
	 */
	renderFileLocation(card: HTMLElement, task: GCTask): void {
		const typeText = task.type === 'todo' ? '待办' : '提醒';
		card.createEl('span', {
			text: typeText,
			cls: TaskCardClasses.elements.file
		});
	}

	/**
	 * 打开任务所在文件
	 */
	async openTaskFile(task: GCTask): Promise<void> {
		// TODO: Open edit modal for task with task.id
		// Previously used: openFileInExistingLeaf(this.app, task.filePath, task.lineNumber);
	}

	/**
	 * 附加悬浮提示（使用 TooltipManager 单例复用）
	 */
	attachTooltip(card: HTMLElement, task: GCTask): void {
		// 获取 TooltipManager 单例
		const tooltipManager = TooltipManager.getInstance(this.plugin);

		card.addEventListener('mouseenter', () => {
			tooltipManager.show(task, card);
		});

		card.addEventListener('mouseleave', () => {
			tooltipManager.hide();
		});
	}

	/**
	 * 附加拖拽行为
	 */
	attachDragBehavior(card: HTMLElement, task: GCTask, targetDate?: Date): void {
		card.draggable = true;
		card.setAttribute('data-task-id', task.id);

		if (targetDate) {
			card.setAttribute('data-target-date', targetDate.toISOString().split('T')[0]);
		}

		// 获取 TooltipManager 单例
		const tooltipManager = TooltipManager.getInstance(this.plugin);

		card.addEventListener('dragstart', (e: DragEvent) => {
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('taskId', task.id);
				card.style.opacity = '0.6';

				// 拖动时取消悬浮窗
				tooltipManager.cancel();
			}
		});

		card.addEventListener('dragend', () => {
			card.style.opacity = '1';
		});
	}

	/**
	 * 附加右键菜单
	 */
	attachContextMenu(
		card: HTMLElement,
		task: GCTask,
		onRefresh?: () => void
	): void {
		const taskNotePath = 'Tasks';

		// 获取 TooltipManager 单例
		const tooltipManager = TooltipManager.getInstance(this.plugin);

		// 右键菜单打开时隐藏悬浮窗
		card.addEventListener('contextmenu', () => {
			tooltipManager.cancel();
		});

		registerTaskContextMenu(
			card,
			task,
			this.app,
			this.plugin,
			taskNotePath,
			onRefresh || (() => {})
		);
	}
}
