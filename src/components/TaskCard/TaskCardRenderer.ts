import { App } from 'obsidian';
import type { GanttTask } from '../../types';
import type { TaskCardConfig, TimeFieldConfig } from './TaskCardConfig';
import { TaskCardClasses, TimeBadgeClasses, TagClasses } from '../../utils/bem';
import { registerTaskContextMenu } from '../../contextMenu/contextMenuIndex';
import { openFileInExistingLeaf } from '../../utils/fileOpener';
import { updateTaskCompletion } from '../../tasks/taskUpdater';
import { getStatusColor, DEFAULT_TASK_STATUSES } from '../../tasks/taskStatus';
import { RegularExpressions } from '../../utils/RegularExpressions';
import { formatDate } from '../../dateUtils/dateUtilsIndex';

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
	 * 获取优先级图标
	 */
	getPriorityIcon(priority?: string): string {
		switch (priority) {
			case 'highest': return '🔺';
			case 'high': return '⏫';
			case 'medium': return '🔼';
			case 'low': return '🔽';
			case 'lowest': return '⏬';
			default: return '';
		}
	}

	/**
	 * 获取优先级CSS类名
	 */
	getPriorityClass(priority?: string): string {
		switch (priority) {
			case 'highest': return 'priority-highest';
			case 'high': return 'priority-high';
			case 'medium': return 'priority-medium';
			case 'low': return 'priority-low';
			case 'lowest': return 'priority-lowest';
			default: return '';
		}
	}

	/**
	 * 获取任务状态颜色配置
	 */
	getStatusColors(task: GanttTask): { bg: string; text: string } | null {
		if (!task.status) return null;
		const taskStatuses = this.plugin?.settings?.taskStatuses || DEFAULT_TASK_STATUSES;
		// 简化的颜色获取逻辑
		return getStatusColor(task.status, taskStatuses) || null;
	}

	/**
	 * 应用状态颜色到任务元素
	 */
	applyStatusColors(task: GanttTask, element: HTMLElement): void {
		const colors = this.getStatusColors(task);
		if (colors) {
			element.style.setProperty('--task-bg-color', colors.bg);
			element.style.setProperty('--task-text-color', colors.text);
			element.addClass('task-with-status');
		}
	}

	/**
	 * 创建任务复选框
	 */
	createTaskCheckbox(task: GanttTask, taskItem: HTMLElement): HTMLInputElement {
		const checkbox = taskItem.createEl('input', { type: 'checkbox' }) as HTMLInputElement;
		checkbox.checked = task.completed;
		checkbox.disabled = false;
		checkbox.addClass('gc-task-card__checkbox');

		checkbox.addEventListener('change', async (e) => {
			e.stopPropagation();
			const isNowCompleted = checkbox.checked;
			try {
				await updateTaskCompletion(
					this.app,
					task,
					isNowCompleted,
					this.plugin.settings.enabledTaskFormats
				);
				taskItem.toggleClass('gc-task-card--completed', isNowCompleted);
				taskItem.toggleClass('gc-task-card--pending', !isNowCompleted);
			} catch (error) {
				console.error('Error updating task:', error);
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
	renderDescription(card: HTMLElement, task: GanttTask, config: TaskCardConfig): void {
		if (!config.showDescription) return;

		const cleaned = task.description;
		const gf = (this.plugin?.settings?.globalTaskFilter || '').trim();

		const taskTextEl = card.createDiv(TaskCardClasses.elements.text);

		// 应用最大行数限制
		if (config.maxLines) {
			taskTextEl.style.setProperty('--max-lines', String(config.maxLines));
			taskTextEl.addClass('gc-task-card__text--limited');
		}

		if (config.showGlobalFilter && gf) {
			taskTextEl.appendText(gf + ' ');
		}

		this.renderTaskDescriptionWithLinks(taskTextEl, cleaned);
	}

	/**
	 * 渲染任务描述为富文本（包含可点击的链接）
	 */
	private renderTaskDescriptionWithLinks(container: HTMLElement, text: string): void {
		const obsidianLinkRegex = RegularExpressions.Links.obsidianLinkRegex;
		const markdownLinkRegex = RegularExpressions.Links.markdownLinkRegex;
		const urlLinkRegex = RegularExpressions.Links.urlLinkRegex;

		let lastIndex = 0;
		const matches: Array<{ type: 'obsidian' | 'markdown' | 'url'; start: number; end: number; groups: RegExpExecArray }> = [];

		// 收集所有匹配
		let match;
		const textLower = text;

		while ((match = obsidianLinkRegex.exec(textLower)) !== null) {
			matches.push({ type: 'obsidian', start: match.index, end: match.index + match[0].length, groups: match });
		}
		while ((match = markdownLinkRegex.exec(textLower)) !== null) {
			matches.push({ type: 'markdown', start: match.index, end: match.index + match[0].length, groups: match });
		}
		while ((match = urlLinkRegex.exec(textLower)) !== null) {
			matches.push({ type: 'url', start: match.index, end: match.index + match[0].length, groups: match });
		}

		// 按位置排序并去重重叠
		matches.sort((a, b) => a.start - b.start);
		const uniqueMatches = [];
		let lastEnd = 0;
		for (const m of matches) {
			if (m.start >= lastEnd) {
				uniqueMatches.push(m);
				lastEnd = m.end;
			}
		}

		// 渲染文本和链接
		lastIndex = 0;
		for (const m of uniqueMatches) {
			if (m.start > lastIndex) {
				container.appendText(text.substring(lastIndex, m.start));
			}

			if (m.type === 'obsidian') {
				const notePath = m.groups[1];
				const displayText = m.groups[2] || notePath;
				const link = container.createEl('a', { text: displayText, cls: 'gc-link gc-link--obsidian' });
				link.setAttr('data-href', notePath);
				link.href = 'javascript:void(0)';
				link.addEventListener('click', async (e) => {
					e.preventDefault();
					e.stopPropagation();
					const file = this.app.metadataCache.getFirstLinkpathDest(notePath, '');
					if (file) {
						await openFileInExistingLeaf(this.app, file.path, 0);
					}
				});
			} else if (m.type === 'markdown') {
				const displayText = m.groups[1];
				const url = m.groups[2];
				const link = container.createEl('a', { text: displayText, cls: 'gc-link gc-link--markdown' });
				link.href = url;
				link.setAttr('target', '_blank');
				link.addEventListener('click', (e) => e.stopPropagation());
			} else if (m.type === 'url') {
				const url = m.groups[1];
				const link = container.createEl('a', { text: url, cls: 'gc-link gc-link--url' });
				link.href = url;
				link.setAttr('target', '_blank');
				link.addEventListener('click', (e) => e.stopPropagation());
			}

			lastIndex = m.end;
		}

		if (lastIndex < text.length) {
			container.appendText(text.substring(lastIndex));
		}
	}

	/**
	 * 渲染任务标签
	 */
	renderTaskTags(task: GanttTask, container: HTMLElement): void {
		if (!task.tags || task.tags.length === 0) {
			return;
		}

		const tagsContainer = container.createDiv('gc-task-card__tags');

		task.tags.forEach(tag => {
			const tagEl = tagsContainer.createEl('span', {
				text: `#${tag}`,
				cls: 'gc-tag'
			});

			const colorIndex = this.getStringHashCode(tag) % 6;
			tagEl.addClass(`gc-tag--color-${colorIndex}`);
		});
	}

	private getStringHashCode(str: string): number {
		let hash = 0;
		for (let i = 0; i < str.length; i++) {
			hash = ((hash << 5) - hash) + str.charCodeAt(i);
			hash = hash & hash;
		}
		return Math.abs(hash);
	}

	/**
	 * 渲染优先级
	 */
	renderPriority(card: HTMLElement, task: GanttTask): void {
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
	renderTimeFields(card: HTMLElement, task: GanttTask, config?: TimeFieldConfig): void {
		if (!config) return;

		const container = card.createDiv(TaskCardClasses.elements.times);

		if (config.showCreated && task.createdDate) {
			this.renderTimeBadge(container, '创建', task.createdDate, TimeBadgeClasses.created);
		}
		if (config.showStart && task.startDate) {
			this.renderTimeBadge(container, '开始', task.startDate, TimeBadgeClasses.start);
		}
		if (config.showScheduled && task.scheduledDate) {
			this.renderTimeBadge(container, '计划', task.scheduledDate, TimeBadgeClasses.scheduled);
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
	renderFileLocation(card: HTMLElement, task: GanttTask): void {
		card.createEl('span', {
			text: `${task.fileName}:${task.lineNumber}`,
			cls: TaskCardClasses.elements.file
		});
	}

	/**
	 * 渲染警告图标
	 */
	renderWarning(card: HTMLElement, task: GanttTask): void {
		if (!task.warning) return;

		card.createEl('span', {
			text: '⚠️',
			cls: TaskCardClasses.elements.warning,
			attr: { title: task.warning }
		});
	}

	/**
	 * 打开任务所在文件
	 */
	async openTaskFile(task: GanttTask): Promise<void> {
		await openFileInExistingLeaf(this.app, task.filePath, task.lineNumber);
	}

	/**
	 * 附加悬浮提示
	 */
	attachTooltip(card: HTMLElement, task: GanttTask): void {
		let tooltip: HTMLElement | null = null;
		let hideTimeout: number | null = null;
		const cleaned = task.description;

		const showTooltip = (e: MouseEvent) => {
			if (hideTimeout) {
				window.clearTimeout(hideTimeout);
				hideTimeout = null;
			}

			if (tooltip) {
				tooltip.remove();
			}

			tooltip = document.body.createDiv('gc-task-tooltip');
			tooltip.style.opacity = '0';

			// 任务描述
			const descDiv = tooltip.createDiv('gc-task-tooltip__description');
			descDiv.createEl('strong', { text: cleaned });

			// 优先级
			if (task.priority) {
				const priorityDiv = tooltip.createDiv('gc-task-tooltip__priority');
				const priorityIcon = this.getPriorityIcon(task.priority);
				priorityDiv.createEl('span', { text: `${priorityIcon} 优先级: ${task.priority}`, cls: `priority-${task.priority}` });
			}

			// 时间属性
			const hasTimeProperties = task.createdDate || task.startDate || task.scheduledDate ||
				task.dueDate || task.cancelledDate || task.completionDate;

			if (hasTimeProperties) {
				const timeDiv = tooltip.createDiv('gc-task-tooltip__times');

				if (task.createdDate) {
					timeDiv.createEl('div', { text: `➕ 创建: ${this.formatDateForDisplay(task.createdDate)}`, cls: 'gc-task-tooltip__time-item' });
				}
				if (task.startDate) {
					timeDiv.createEl('div', { text: `🛫 开始: ${this.formatDateForDisplay(task.startDate)}`, cls: 'gc-task-tooltip__time-item' });
				}
				if (task.scheduledDate) {
					timeDiv.createEl('div', { text: `⏳ 计划: ${this.formatDateForDisplay(task.scheduledDate)}`, cls: 'gc-task-tooltip__time-item' });
				}
				if (task.dueDate) {
					const dueEl = timeDiv.createEl('div', { text: `📅 截止: ${this.formatDateForDisplay(task.dueDate)}`, cls: 'gc-task-tooltip__time-item' });
					if (task.dueDate < new Date() && !task.completed) {
						dueEl.addClass('gc-task-tooltip__time-item--overdue');
					}
				}
				if (task.cancelledDate) {
					timeDiv.createEl('div', { text: `❌ 取消: ${this.formatDateForDisplay(task.cancelledDate)}`, cls: 'gc-task-tooltip__time-item' });
				}
				if (task.completionDate) {
					timeDiv.createEl('div', { text: `✅ 完成: ${this.formatDateForDisplay(task.completionDate)}`, cls: 'gc-task-tooltip__time-item' });
				}
			}

			// 标签
			if (task.tags && task.tags.length > 0) {
				const tagsDiv = tooltip.createDiv('gc-task-tooltip__tags');
				const tagsLabel = tagsDiv.createEl('span', { text: '标签：', cls: 'gc-task-tooltip__label' });
				task.tags.forEach(tag => {
					tagsDiv.createEl('span', { text: `#${tag}`, cls: 'gc-tag gc-tag--tooltip' });
				});
			}

			// 文件位置
			const fileDiv = tooltip.createDiv('gc-task-tooltip__file');
			fileDiv.createEl('span', { text: `📄 ${task.fileName}:${task.lineNumber}`, cls: 'gc-task-tooltip__file-location' });

			// 定位悬浮提示
			const rect = card.getBoundingClientRect();
			const tooltipWidth = 300;

			let left = rect.right + 10;
			let top = rect.top;

			if (left + tooltipWidth > window.innerWidth) {
				left = rect.left - tooltipWidth - 10;
			}
			if (left < 0) {
				left = (window.innerWidth - tooltipWidth) / 2;
			}

			tooltip.style.left = `${left}px`;
			tooltip.style.top = `${top}px`;

			setTimeout(() => {
				if (tooltip) {
					tooltip.style.opacity = '1';
					tooltip.addClass('gc-task-tooltip--visible');
				}
			}, 10);
		};

		const hideTooltip = () => {
			hideTimeout = window.setTimeout(() => {
				if (tooltip) {
					tooltip.removeClass('gc-task-tooltip--visible');
					tooltip.style.opacity = '0';
					setTimeout(() => {
						if (tooltip) {
							tooltip.remove();
							tooltip = null;
						}
					}, 200);
				}
			}, 100);
		};

		card.addEventListener('mouseenter', showTooltip);
		card.addEventListener('mouseleave', hideTooltip);
	}

	/**
	 * 附加拖拽行为
	 */
	attachDragBehavior(card: HTMLElement, task: GanttTask, targetDate?: Date): void {
		card.draggable = true;
		card.setAttribute('data-task-id', `${task.filePath}:${task.lineNumber}`);

		if (targetDate) {
			card.setAttribute('data-target-date', targetDate.toISOString().split('T')[0]);
		}

		card.addEventListener('dragstart', (e: DragEvent) => {
			if (e.dataTransfer) {
				e.dataTransfer.effectAllowed = 'move';
				e.dataTransfer.setData('taskId', `${task.filePath}:${task.lineNumber}`);
				card.style.opacity = '0.6';
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
		task: GanttTask,
		onRefresh?: () => void
	): void {
		const enabledFormats = this.plugin.settings.enabledTaskFormats || ['tasks'];
		const taskNotePath = this.plugin.settings.taskNotePath || 'Tasks';

		registerTaskContextMenu(
			card,
			task,
			this.app,
			enabledFormats,
			taskNotePath,
			onRefresh || (() => {})
		);
	}
}
