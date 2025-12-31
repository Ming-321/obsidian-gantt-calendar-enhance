/**
 * SVG 甘特图渲染器
 * 自研实现，参考 Frappe Gantt 设计
 * 完全控制渲染、交互和样式
 *
 * 布局结构：
 * ┌────────────┬──────────────────────────────┐
 * │ 空白区域   │ 时间轴（水平固定）           │
 * ├────────────┼──────────────────────────────┤
 * │ 任务列表   │ 甘特图（双向滚动）           │
 * │ (垂直固定) │                              │
 * └────────────┴──────────────────────────────┘
 */

import type { FrappeTask, FrappeGanttConfig, DateFieldType } from '../types';
import type { GanttTask } from '../../types';
import { GanttClasses } from '../../utils/bem';
import { TooltipManager, type MousePosition } from '../../utils/tooltipManager';

/**
 * SVG 元素辅助方法
 */
function addSvgClass(element: Element, className: string): void {
	const existing = element.getAttribute('class') || '';
	const classes = existing.split(' ').filter(c => c);
	if (!classes.includes(className)) {
		classes.push(className);
	}
	element.setAttribute('class', classes.join(' '));
}

/**
 * SVG 甘特图渲染器
 *
 * 使用 SVG 绘制专业的甘特图
 */
export class SvgGanttRenderer {
	// 多个 SVG 元素
	private headerSvg: SVGSVGElement | null = null;   // 时间轴
	private taskListSvg: SVGSVGElement | null = null;  // 任务列表
	private ganttSvg: SVGSVGElement | null = null;     // 甘特图主体
	private cornerSvg: SVGSVGElement | null = null;    // 左上角空白

	private config: FrappeGanttConfig;
	private tasks: FrappeTask[] = [];
	private container: HTMLElement;
	private plugin: any;
	private app: any;  // Obsidian App 实例
	private originalTasks: GanttTask[] = [];  // 原始任务列表（用于 tooltip）

	// 尺寸相关
	private headerHeight = 50;
	private rowHeight = 40;
	private columnWidth = 50;
	private taskColumnWidth = 200;  // 任务列宽度
	private resizerWidth = 4;  // 分隔条宽度
	private padding = 18;

	// 日期范围（用于滚动到今天）
	private minDate: Date | null = null;
	private totalDays = 0;

	// 布局容器
	private ganttLayout: HTMLElement | null = null;
	private headerContainer: HTMLElement | null = null;
	private taskListContainer: HTMLElement | null = null;
	private ganttContainer: HTMLElement | null = null;
	private cornerContainer: HTMLElement | null = null;
	private resizer: HTMLElement | null = null;  // 分隔条元素

	// 拖动状态
	private isResizing = false;

	// 事件回调
	private onDateChange?: (task: FrappeTask, start: Date, end: Date) => void;
	private onProgressChange?: (task: FrappeTask, progress: number) => void;
	private startField: DateFieldType = 'startDate';
	private endField: DateFieldType = 'dueDate';

	constructor(container: HTMLElement, config: FrappeGanttConfig, plugin: any, originalTasks: GanttTask[] = [], app: any = null, startField: DateFieldType = 'startDate', endField: DateFieldType = 'dueDate') {
		this.container = container;
		this.config = config;
		this.plugin = plugin;
		this.originalTasks = originalTasks;
		this.app = app || plugin?.app;
		this.startField = startField;
		this.endField = endField;

		// 从配置读取尺寸
		this.headerHeight = config.header_height ?? 50;
		this.columnWidth = config.column_width ?? 50;
		this.taskColumnWidth = 200;  // 固定任务列宽度
		this.padding = config.padding ?? 18;
	}

	/**
	 * 初始化渲染器
	 */
	init(tasks: FrappeTask[]): void {
		this.tasks = tasks;
		this.render();
	}

	/**
	 * 刷新任务数据
	 */
	refresh(tasks: FrappeTask[]): void {
		this.tasks = tasks;
		this.render();
	}

	/**
	 * 更新配置
	 */
	updateConfig(config: Partial<FrappeGanttConfig>): void {
		this.config = { ...this.config, ...config };

		// 更新尺寸
		if (config.header_height !== undefined) this.headerHeight = config.header_height;
		if (config.column_width !== undefined) this.columnWidth = config.column_width;
		if (config.padding !== undefined) this.padding = config.padding;

		this.render();
	}

	/**
	 * 设置事件处理器
	 */
	setEventHandlers(handlers: {
		onDateChange?: (task: FrappeTask, start: Date, end: Date) => void;
		onProgressChange?: (task: FrappeTask, progress: number) => void;
	}): void {
		this.onDateChange = handlers.onDateChange;
		this.onProgressChange = handlers.onProgressChange;
	}

	/**
	 * 主渲染方法 - 使用多区域布局实现冻结效果
	 */
	private render(): void {
		// 清空容器
		this.container.empty();

		// 计算日期范围
		const { minDate, maxDate, totalDays } = this.calculateDateRange();

		// 保存日期范围信息（用于滚动到今天）
		this.minDate = minDate;
		this.totalDays = totalDays;

		// 计算尺寸
		const ganttWidth = totalDays * this.columnWidth + this.padding * 2;
		const ganttHeight = this.headerHeight + this.tasks.length * this.rowHeight + this.padding * 2;
		const taskListWidth = this.taskColumnWidth;
		const taskListHeight = ganttHeight;

		// 创建 BEM 结构的布局容器
		this.ganttLayout = this.container.createDiv(GanttClasses.elements.layout);

		// 左上角空白区域
		this.cornerContainer = this.ganttLayout.createDiv(GanttClasses.elements.corner);
		this.cornerSvg = this.createSvgElement(
			this.cornerContainer,
			taskListWidth,
			this.headerHeight,
			GanttClasses.elements.cornerSvg
		);
		this.renderCorner(this.cornerSvg);

		// 顶部时间轴容器（可水平滚动）
		this.headerContainer = this.ganttLayout.createDiv(GanttClasses.elements.headerContainer);
		this.headerSvg = this.createSvgElement(
			this.headerContainer,
			ganttWidth,
			this.headerHeight,
			GanttClasses.elements.headerSvg
		);
		this.renderHeader(this.headerSvg, minDate, totalDays);

		// 左侧任务列表容器（可垂直滚动）
		this.taskListContainer = this.ganttLayout.createDiv(GanttClasses.elements.tasklistContainer);
		this.taskListSvg = this.createSvgElement(
			this.taskListContainer,
			taskListWidth,
			taskListHeight,
			GanttClasses.elements.tasklistSvg
		);
		this.renderTaskList(this.taskListSvg);

		// 右侧甘特图容器（双向滚动）
		this.ganttContainer = this.ganttLayout.createDiv(GanttClasses.elements.chartContainer);
		this.ganttSvg = this.createSvgElement(
			this.ganttContainer,
			ganttWidth,
			ganttHeight,  // 使用完整高度以保持y坐标系统一致
			GanttClasses.elements.chartSvg
		);
		this.renderGanttChart(this.ganttSvg, minDate, totalDays, ganttHeight);

		// 创建分隔条
		this.resizer = this.ganttLayout.createDiv(GanttClasses.elements.resizer);

		// 设置同步滚动
		this.setupSyncScrolling();

		// 设置分隔条拖动
		this.setupResizer();
	}

	/**
	 * 计算日期范围
	 */
	private calculateDateRange(): { minDate: Date; maxDate: Date; totalDays: number } {
		if (this.tasks.length === 0) {
			const today = new Date();
			return {
				minDate: today,
				maxDate: new Date(today.getTime() + 30 * 24 * 60 * 60 * 1000),
				totalDays: 30
			};
		}

		const dates = this.tasks.flatMap(t => [
			new Date(t.start),
			new Date(t.end)
		]);

		let minDate = new Date(Math.min(...dates.map(d => d.getTime())));
		let maxDate = new Date(Math.max(...dates.map(d => d.getTime())));

		// 添加一些边距
		minDate = new Date(minDate.getTime() - 7 * 24 * 60 * 60 * 1000);
		maxDate = new Date(maxDate.getTime() + 7 * 24 * 60 * 60 * 1000);

		const totalDays = Math.ceil((maxDate.getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000));

		return { minDate, maxDate, totalDays };
	}

	/**
	 * 创建 SVG 元素的辅助方法
	 */
	private createSvgElement(
		container: HTMLElement,
		width: number,
		height: number,
		className: string
	): SVGSVGElement {
		const svg = container.createSvg('svg');
		svg.setAttribute('width', String(width));
		svg.setAttribute('height', String(height));
		svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
		addSvgClass(svg, className);
		return svg;
	}

	/**
	 * 设置同步滚动
	 */
	private setupSyncScrolling(): void {
		if (!this.headerContainer || !this.taskListContainer || !this.ganttContainer) return;

		const headerContainer = this.headerContainer;
		const taskListContainer = this.taskListContainer;
		const ganttContainer = this.ganttContainer;

		// 使用标志位防止循环触发
		let isSyncing = false;

		// chart 容器滚动 → 同步到 header 和 tasklist
		ganttContainer.addEventListener('scroll', () => {
			if (isSyncing) return;
			isSyncing = true;

			headerContainer.scrollLeft = ganttContainer.scrollLeft;
			taskListContainer.scrollTop = ganttContainer.scrollTop;

			requestAnimationFrame(() => {
				isSyncing = false;
			});
		});

		// header 容器滚动 → 同步到 chart
		headerContainer.addEventListener('scroll', () => {
			if (isSyncing) return;
			isSyncing = true;

			ganttContainer.scrollLeft = headerContainer.scrollLeft;

			requestAnimationFrame(() => {
				isSyncing = false;
			});
		});

		// tasklist 容器滚动 → 同步到 chart
		taskListContainer.addEventListener('scroll', () => {
			if (isSyncing) return;
			isSyncing = true;

			ganttContainer.scrollTop = taskListContainer.scrollTop;

			requestAnimationFrame(() => {
				isSyncing = false;
			});
		});
	}

	/**
	 * 设置分隔条拖动
	 */
	private setupResizer(): void {
		if (!this.resizer || !this.ganttLayout) return;

		const resizer = this.resizer;
		const layout = this.ganttLayout;

		// 鼠标按下开始拖动
		resizer.addEventListener('mousedown', (e) => {
			this.isResizing = true;
			document.body.style.cursor = 'col-resize';
			document.body.style.userSelect = 'none'; // 防止拖动时选中文字

			e.preventDefault();
		});

		// 鼠标移动调整宽度
		document.addEventListener('mousemove', (e) => {
			if (!this.isResizing || !layout) return;

			const layoutRect = layout.getBoundingClientRect();
			const newWidth = e.clientX - layoutRect.left;

			// 限制最小和最大宽度
			const minWidth = 100;
			const maxWidth = layoutRect.width - this.resizerWidth - 200;

			if (newWidth >= minWidth && newWidth <= maxWidth) {
				this.taskColumnWidth = newWidth;

				// 更新 Grid 列宽
				layout.style.gridTemplateColumns = `${newWidth}px ${this.resizerWidth}px 1fr`;

				// 更新 corner SVG 元素
				if (this.cornerSvg) {
					this.cornerSvg.setAttribute('width', String(newWidth));
					const viewBox = this.cornerSvg.getAttribute('viewBox')?.split(' ');
					if (viewBox && viewBox.length === 4) {
						viewBox[2] = String(newWidth);
						this.cornerSvg.setAttribute('viewBox', viewBox.join(' '));
					}
					// 更新内部 rect 宽度
					const bgRect = this.cornerSvg.querySelector('rect');
					if (bgRect) {
						bgRect.setAttribute('width', String(newWidth));
					}
				}

				// 更新 tasklist SVG 元素
				if (this.taskListSvg) {
					this.taskListSvg.setAttribute('width', String(newWidth));
					const viewBox = this.taskListSvg.getAttribute('viewBox')?.split(' ');
					if (viewBox && viewBox.length === 4) {
						viewBox[2] = String(newWidth);
						this.taskListSvg.setAttribute('viewBox', viewBox.join(' '));
					}
					// 更新所有 rect 和 line 的宽度
					const rects = this.taskListSvg.querySelectorAll('rect');
					rects.forEach(rect => {
						rect.setAttribute('width', String(newWidth));
					});
					const lines = this.taskListSvg.querySelectorAll('line');
					lines.forEach(line => {
						const x2 = line.getAttribute('x2');
						if (x2 === '200' || x2 === this.taskColumnWidth.toString()) {
							line.setAttribute('x2', String(newWidth));
						}
					});
				}
			}
		});

		// 鼠标释放结束拖动
		document.addEventListener('mouseup', () => {
			if (this.isResizing) {
				this.isResizing = false;
				document.body.style.cursor = '';
				document.body.style.userSelect = '';
			}
		});
	}

	/**
	 * 渲染左上角空白区域
	 */
	private renderCorner(svg: SVGSVGElement | null): void {
		if (!svg) return;

		const ns = 'http://www.w3.org/2000/svg';
		const width = this.taskColumnWidth;
		const height = this.headerHeight;

		// 背景
		const bg = document.createElementNS(ns, 'rect');
		bg.setAttribute('x', '0');
		bg.setAttribute('y', '0');
		bg.setAttribute('width', String(width));
		bg.setAttribute('height', String(height));
		bg.setAttribute('fill', 'var(--background-secondary)');
		svg.appendChild(bg);

		// 可选：添加标题
		const text = document.createElementNS(ns, 'text');
		text.setAttribute('x', String(width / 2));
		text.setAttribute('y', String(height / 2 + 5));
		text.setAttribute('text-anchor', 'middle');
		text.setAttribute('font-size', '12');
		text.setAttribute('font-weight', '600');
		text.setAttribute('fill', 'var(--text-muted)');
		text.textContent = '任务列表';
		svg.appendChild(text);
	}

	/**
	 * 渲染任务列表（左侧）
	 */
	private renderTaskList(svg: SVGSVGElement | null): void {
		if (!svg) return;

		const ns = 'http://www.w3.org/2000/svg';
		const width = this.taskColumnWidth;

		// 背景 - 只需要任务区域的高度
		const bg = document.createElementNS(ns, 'rect');
		bg.setAttribute('x', '0');
		bg.setAttribute('y', '0');
		bg.setAttribute('width', String(width));
		bg.setAttribute('height', String(this.tasks.length * this.rowHeight));
		bg.setAttribute('fill', 'var(--background-primary)');
		svg.appendChild(bg);

		// 绘制任务名称
		this.tasks.forEach((task, index) => {
			const y = index * this.rowHeight;

			// 行背景（偶数行添加背景色）
			if (index % 2 === 0) {
				const rowBg = document.createElementNS(ns, 'rect');
				rowBg.setAttribute('x', '0');
				rowBg.setAttribute('y', String(y));
				rowBg.setAttribute('width', String(width));
				rowBg.setAttribute('height', String(this.rowHeight));
				rowBg.setAttribute('fill', 'var(--background-secondary)');
				rowBg.setAttribute('opacity', '0.3');
				svg.appendChild(rowBg);
			}

			// 使用 foreignObject 渲染富文本任务描述
			const foreignObj = document.createElementNS(ns, 'foreignObject');
			foreignObj.setAttribute('x', String(this.padding));
			foreignObj.setAttribute('y', String(y));
			foreignObj.setAttribute('width', String(width - this.padding * 2));
			foreignObj.setAttribute('height', String(this.rowHeight));

			// 创建 HTML 内容容器
			const contentDiv = document.createElement('div');
			contentDiv.className = 'gantt-task-list-item';
			contentDiv.style.cssText = `
				display: flex;
				align-items: center;
				height: 100%;
				font-size: 12px;
				color: var(--text-normal);
				gap: 8px;
				padding: 0;
			`;

			// 查找原始任务以获取完整信息
			const originalTask = this.findOriginalTask(task);
			const description = originalTask?.description || task.name;
			const isCompleted = originalTask?.completed || task.progress === 100;

			// === 创建复选框 ===
			const checkbox = this.createTaskCheckbox(task, originalTask, isCompleted);
			contentDiv.appendChild(checkbox);

			// === 创建可点击的文本容器 ===
			const textContainer = document.createElement('div');
			textContainer.className = 'gantt-task-list-item__text';
			textContainer.style.cssText = `
				flex: 1;
				overflow: hidden;
				text-overflow: ellipsis;
				cursor: pointer;
			`;

			// 设置点击事件用于跳转（阻止链接点击触发）
			textContainer.addEventListener('click', (e) => {
				if ((e.target as HTMLElement).tagName !== 'A') {
					this.handleTaskListItemClick(originalTask);
				}
			});

			// 使用富文本渲染（支持链接）
			this.renderTaskDescriptionWithLinks(textContainer, description);
			contentDiv.appendChild(textContainer);

			foreignObj.appendChild(contentDiv);
			svg.appendChild(foreignObj);

			// 分隔线
			const line = document.createElementNS(ns, 'line');
			line.setAttribute('x1', '0');
			line.setAttribute('y1', String((index + 1) * this.rowHeight));
			line.setAttribute('x2', String(width));
			line.setAttribute('y2', String((index + 1) * this.rowHeight));
			line.setAttribute('stroke', 'var(--background-modifier-border)');
			line.setAttribute('stroke-width', '0.5');
			svg.appendChild(line);
		});
	}

	/**
	 * 渲染任务描述为富文本（包含可点击的链接）
	 * 支持与 BaseCalendarRenderer 相同的链接格式
	 */
	private renderTaskDescriptionWithLinks(container: HTMLElement, text: string): void {
		// Obsidian 双向链接：[[note]] 或 [[note|alias]]
		const obsidianLinkRegex = /\[\[([^\]|]+)(?:\|([^\]]+))?\]\]/g;
		// Markdown 链接：[text](url)
		const markdownLinkRegex = /\[([^\]]+)\]\(([^)]+)\)/g;
		// 网址链接：http://example.com 或 https://example.com
		const urlRegex = /(https?:\/\/[^\s]+)/g;

		// 分割文本并处理链接
		let lastIndex = 0;
		const matches: Array<{ type: 'obsidian' | 'markdown' | 'url'; start: number; end: number; groups: RegExpExecArray }> = [];

		// 收集所有匹配
		let match;
		const textLower = text;

		// 收集 Obsidian 链接
		while ((match = obsidianLinkRegex.exec(textLower)) !== null) {
			matches.push({ type: 'obsidian', start: match.index, end: match.index + match[0].length, groups: match });
		}

		// 收集 Markdown 链接
		while ((match = markdownLinkRegex.exec(textLower)) !== null) {
			matches.push({ type: 'markdown', start: match.index, end: match.index + match[0].length, groups: match });
		}

		// 收集网址链接
		while ((match = urlRegex.exec(textLower)) !== null) {
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
			// 添加前面的普通文本
			if (m.start > lastIndex) {
				container.appendText(text.substring(lastIndex, m.start));
			}

			// 添加链接
			if (m.type === 'obsidian') {
				const notePath = m.groups[1];
				const displayText = m.groups[2] || notePath;
				const link = container.createEl('a', { text: displayText, cls: 'gc-link gc-link--obsidian' });
				link.setAttr('data-href', notePath);
				link.href = 'javascript:void(0)';
				link.addEventListener('click', async (e) => {
					e.preventDefault();
					e.stopPropagation();
					// 尝试打开文件
					const file = this.app.metadataCache.getFirstLinkpathDest(notePath, '');
					if (file) {
						this.app.workspace.openLinkText(notePath, '');
					}
				});
			} else if (m.type === 'markdown') {
				const displayText = m.groups[1];
				const url = m.groups[2];
				const link = container.createEl('a', { text: displayText, cls: 'gc-link gc-link--markdown' });
				link.href = url;
				link.setAttr('target', '_blank');
				link.setAttr('rel', 'noopener noreferrer');
			} else if (m.type === 'url') {
				const url = m.groups[1];
				const link = container.createEl('a', { text: url, cls: 'gc-link gc-link--url' });
				link.href = url;
				link.setAttr('target', '_blank');
				link.setAttr('rel', 'noopener noreferrer');
			}

			lastIndex = m.end;
		}

		// 添加剩余的普通文本
		if (lastIndex < text.length) {
			container.appendText(text.substring(lastIndex));
		}
	}

	/**
	 * 创建任务复选框
	 */
	private createTaskCheckbox(
		frappeTask: FrappeTask,
		originalTask: GanttTask | null,
		isCompleted: boolean
	): HTMLInputElement {
		const checkbox = document.createElement('input');
		checkbox.type = 'checkbox';
		checkbox.checked = isCompleted;
		checkbox.className = 'gc-gantt-view__task-checkbox';
		checkbox.style.cssText = `
			flex-shrink: 0;
			width: 16px;
			height: 16px;
			cursor: pointer;
			margin: 0;
			accent-color: var(--interactive-accent);
		`;

		// 阻止点击事件冒泡到任务列表项
		checkbox.addEventListener('click', (e) => {
			e.stopPropagation();
		});

		// 监听复选框变化
		checkbox.addEventListener('change', async (e) => {
			e.stopPropagation();
			const newCompletedState = (e.target as HTMLInputElement).checked;

			// 通过 onProgressChange 回调更新任务
			if (this.onProgressChange) {
				try {
					await this.onProgressChange(frappeTask, newCompletedState ? 100 : 0);
				} catch (error) {
					console.error('[SvgGanttRenderer] Error updating task completion:', error);
					// 恢复复选框状态
					checkbox.checked = isCompleted;
				}
			}
		});

		return checkbox;
	}

	/**
	 * 处理任务列表项点击事件 - 跳转到文件
	 */
	private handleTaskListItemClick(task: GanttTask | null): void {
		if (!task || !this.app) return;

		// 使用 openFileInExistingLeaf 跳转到文件
		const { openFileInExistingLeaf } = require('../../utils/fileOpener');
		openFileInExistingLeaf(this.app, task.filePath, task.lineNumber);
	}

	/**
	 * 渲染头部（时间轴）
	 */
	private renderHeader(svg: SVGSVGElement | null, minDate: Date, totalDays: number): void {
		if (!svg) return;

		const ns = 'http://www.w3.org/2000/svg';
		const width = totalDays * this.columnWidth + this.padding * 2;

		// 背景
		const headerBg = document.createElementNS(ns, 'rect');
		headerBg.setAttribute('x', '0');
		headerBg.setAttribute('y', '0');
		headerBg.setAttribute('width', String(width));
		headerBg.setAttribute('height', String(this.headerHeight));
		headerBg.setAttribute('fill', 'var(--background-secondary)');
		svg.appendChild(headerBg);

		// 绘制日期文本
		for (let i = 0; i < totalDays; i++) {
			const date = new Date(minDate);
			date.setDate(date.getDate() + i);

			const x = this.padding + i * this.columnWidth;
			const y = this.headerHeight / 2;

			// 判断是否是今天
			const today = new Date();
			const isToday = (
				date.getDate() === today.getDate() &&
				date.getMonth() === today.getMonth() &&
				date.getFullYear() === today.getFullYear()
			);

			// 绘制日期
			const text = document.createElementNS(ns, 'text');
			text.setAttribute('x', String(x + this.columnWidth / 2));
			text.setAttribute('y', String(y + 6));
			text.setAttribute('text-anchor', 'middle');
			text.setAttribute('font-size', '11');
			text.setAttribute('fill', isToday ? 'var(--interactive-accent)' : 'var(--text-muted)');
			text.setAttribute('font-weight', isToday ? '600' : '400');

			// 根据视图模式格式化日期
			const label = this.formatDateLabel(date, i);
			text.textContent = label;

			svg.appendChild(text);
		}
	}

	/**
	 * 渲染甘特图主体（网格线 + 任务条）
	 */
	private renderGanttChart(
		svg: SVGSVGElement | null,
		minDate: Date,
		totalDays: number,
		fullHeight: number
	): void {
		if (!svg) return;

		const ns = 'http://www.w3.org/2000/svg';
		const width = totalDays * this.columnWidth + this.padding * 2;
		const height = fullHeight - this.headerHeight;

		// 背景 - 从 y=0 开始
		const bg = document.createElementNS(ns, 'rect');
		bg.setAttribute('x', '0');
		bg.setAttribute('y', '0');
		bg.setAttribute('width', String(width));
		bg.setAttribute('height', String(height));
		bg.setAttribute('fill', 'var(--background-primary)');
		svg.appendChild(bg);

		// 绘制网格线
		this.renderGrid(ns, svg, minDate, totalDays, width, height);

		// 绘制今天线
		this.renderTodayLine(ns, svg, minDate, totalDays, height);

		// 绘制任务条
		this.renderTaskBars(ns, svg, minDate, totalDays);
	}

	/**
	 * 格式化日期标签
	 */
	private formatDateLabel(date: Date, index: number): string {
		const viewMode = this.config.view_mode;

		switch (viewMode) {
			case 'day':
				return `${date.getMonth() + 1}/${date.getDate()}`;
			case 'week':
				if (date.getDay() === 1 || index === 0) {
					return `W${this.getWeekNumber(date)}`;
				}
				return '';
			case 'month':
				if (date.getDate() === 1 || index === 0) {
					return `${date.getMonth() + 1}月`;
				}
				return '';
			default:
				return `${date.getMonth() + 1}/${date.getDate()}`;
		}
	}

	/**
	 * 获取周数
	 */
	private getWeekNumber(date: Date): number {
		const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
		const dayNum = d.getUTCDay() || 7;
		d.setUTCDate(d.getUTCDate() + 4 - dayNum);
		const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
		return Math.ceil((((d.getTime() - yearStart.getTime()) / 86400000) + 1) / 7);
	}

	/**
	 * 渲染网格线
	 */
	private renderGrid(
		ns: string,
		svg: SVGSVGElement | null,
		minDate: Date,
		totalDays: number,
		width: number,
		height: number
	): void {
		if (!svg) return;

		const gridGroup = document.createElementNS(ns, 'g');
		addSvgClass(gridGroup, GanttClasses.elements.grid);

		// 垂直线（日期分隔）
		for (let i = 0; i <= totalDays; i++) {
			const x = this.padding + i * this.columnWidth;

			const line = document.createElementNS(ns, 'line');
			line.setAttribute('x1', String(x));
			line.setAttribute('y1', '0');
			line.setAttribute('x2', String(x));
			line.setAttribute('y2', String(height));
			line.setAttribute('stroke', 'var(--background-modifier-border)');
			line.setAttribute('stroke-width', '0.5');
			line.setAttribute('stroke-dasharray', i % 7 === 0 ? 'none' : '2 2');

			gridGroup.appendChild(line);
		}

		// 水平线（任务行分隔）
		for (let i = 0; i <= this.tasks.length; i++) {
			const y = i * this.rowHeight;

			const line = document.createElementNS(ns, 'line');
			line.setAttribute('x1', String(this.padding));
			line.setAttribute('y1', String(y));
			line.setAttribute('x2', String(width - this.padding));
			line.setAttribute('y2', String(y));
			line.setAttribute('stroke', 'var(--background-modifier-border)');
			line.setAttribute('stroke-width', '0.5');

			gridGroup.appendChild(line);
		}

		svg.appendChild(gridGroup);
	}

	/**
	 * 渲染今天线
	 */
	private renderTodayLine(
		ns: string,
		svg: SVGSVGElement | null,
		minDate: Date,
		totalDays: number,
		height: number
	): void {
		if (!svg) return;

		const today = new Date();
		const daysDiff = Math.floor((today.getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000));

		if (daysDiff >= 0 && daysDiff <= totalDays) {
			const x = this.padding + daysDiff * this.columnWidth + this.columnWidth / 2;

			const line = document.createElementNS(ns, 'line');
			line.setAttribute('x1', String(x));
			line.setAttribute('y1', '0');
			line.setAttribute('x2', String(x));
			line.setAttribute('y2', String(height));
			line.setAttribute('stroke', 'var(--interactive-accent)');
			line.setAttribute('stroke-width', '2');
			line.setAttribute('stroke-dasharray', '4 2');

			svg.appendChild(line);
		}
	}

	/**
	 * 渲染任务条
	 */
	private renderTaskBars(
		ns: string,
		svg: SVGSVGElement | null,
		minDate: Date,
		totalDays: number
	): void {
		if (!svg) return;

		const tasksGroup = document.createElementNS(ns, 'g');
		addSvgClass(tasksGroup, GanttClasses.elements.tasks);

		this.tasks.forEach((task, index) => {
			const taskStart = new Date(task.start);
			const taskEnd = new Date(task.end);

			const startOffset = Math.floor((taskStart.getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000));
			const duration = Math.ceil((taskEnd.getTime() - taskStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;

			const x = this.padding + startOffset * this.columnWidth;
			const y = index * this.rowHeight + (this.rowHeight - 24) / 2;
			const barWidth = duration * this.columnWidth - 8;

			// 任务条组
			const barGroup = document.createElementNS(ns, 'g');
			addSvgClass(barGroup, GanttClasses.elements.barGroup);
			barGroup.setAttribute('data-task-id', task.id);

			// 任务条背景
			const bar = document.createElementNS(ns, 'rect');
			bar.setAttribute('x', String(x));
			bar.setAttribute('y', String(y));
			bar.setAttribute('width', String(Math.max(barWidth, 20)));
			bar.setAttribute('height', '24');
			bar.setAttribute('rx', '4');

			// 根据状态设置颜色
			let fillColor = 'var(--interactive-accent)';
			if (task.progress === 100) {
				fillColor = 'var(--task-completed-color, #52c41a)';
			} else if (task.custom_class) {
				// 解析自定义类名获取颜色
				if (task.custom_class.includes('priority-highest')) {
					fillColor = 'var(--priority-highest-color, #ef4444)';
				} else if (task.custom_class.includes('priority-high')) {
					fillColor = 'var(--priority-high-color, #f97316)';
				} else if (task.custom_class.includes('priority-medium')) {
					fillColor = 'var(--priority-medium-color, #eab308)';
				} else if (task.custom_class.includes('priority-low')) {
					fillColor = 'var(--priority-low-color, #22c55e)';
				}
			}

			bar.setAttribute('fill', fillColor);
			bar.setAttribute('opacity', '0.85');
			bar.setAttribute('cursor', 'pointer');

			// 进度条
			let progressElement: SVGRectElement | null = null;
			if (task.progress > 0 && task.progress < 100) {
				const progressWidth = barWidth * task.progress / 100;
				const elem = document.createElementNS(ns, 'rect') as SVGRectElement;
				elem.setAttribute('x', String(x));
				elem.setAttribute('y', String(y));
				elem.setAttribute('width', String(Math.max(progressWidth - 8, 0)));
				elem.setAttribute('height', '24');
				elem.setAttribute('rx', '4');
				elem.setAttribute('fill', fillColor);
				elem.setAttribute('opacity', '0.4');
				progressElement = elem;
			}

			// === 添加拖动手柄 ===
			const HANDLE_HIT_AREA = 12;
			const HANDLE_VISUAL_SIZE = 4;

			// 左侧手柄 - 修改开始时间
			const leftHandle = document.createElementNS(ns, 'rect');
			leftHandle.setAttribute('x', String(x));
			leftHandle.setAttribute('y', String(y));
			leftHandle.setAttribute('width', String(HANDLE_HIT_AREA));
			leftHandle.setAttribute('height', '24');
			leftHandle.setAttribute('fill', 'transparent');
			(leftHandle as any).style.cursor = 'w-resize';
			leftHandle.classList.add('gc-gantt-view__handle-left');

			// 左侧视觉提示
			const leftVisual = document.createElementNS(ns, 'rect');
			leftVisual.setAttribute('x', String(x + 2));
			leftVisual.setAttribute('y', String(y + 8));
			leftVisual.setAttribute('width', String(HANDLE_VISUAL_SIZE));
			leftVisual.setAttribute('height', '8');
			leftVisual.setAttribute('rx', '1');
			leftVisual.setAttribute('fill', 'white');
			leftVisual.setAttribute('opacity', '0.5');
			(leftVisual as any).style.pointerEvents = 'none';

			// 右侧手柄 - 修改结束时间
			const rightHandleX = x + Math.max(barWidth, 20) - HANDLE_HIT_AREA;
			const rightHandle = document.createElementNS(ns, 'rect');
			rightHandle.setAttribute('x', String(rightHandleX));
			rightHandle.setAttribute('y', String(y));
			rightHandle.setAttribute('width', String(HANDLE_HIT_AREA));
			rightHandle.setAttribute('height', '24');
			rightHandle.setAttribute('fill', 'transparent');
			(rightHandle as any).style.cursor = 'e-resize';
			rightHandle.classList.add('gc-gantt-view__handle-right');

			// 右侧视觉提示
			const rightVisual = document.createElementNS(ns, 'rect');
			rightVisual.setAttribute('x', String(rightHandleX + HANDLE_HIT_AREA - 2 - HANDLE_VISUAL_SIZE));
			rightVisual.setAttribute('y', String(y + 8));
			rightVisual.setAttribute('width', String(HANDLE_VISUAL_SIZE));
			rightVisual.setAttribute('height', '8');
			rightVisual.setAttribute('rx', '1');
			rightVisual.setAttribute('fill', 'white');
			rightVisual.setAttribute('opacity', '0.5');
			(rightVisual as any).style.pointerEvents = 'none';

			// 设置拖动事件
			this.setupTaskBarDragging(barGroup as SVGGElement, bar as SVGRectElement, leftHandle as SVGRectElement, rightHandle as SVGRectElement, task, minDate);

			// 添加点击和悬停事件
			bar.addEventListener('click', () => this.handleTaskClick(task));
			bar.addEventListener('mouseenter', (event: MouseEvent) => {
				bar.setAttribute('opacity', '1');
				this.showPopup(task, bar, { x: event.clientX, y: event.clientY });
			});
			bar.addEventListener('mouseleave', () => {
				bar.setAttribute('opacity', '0.85');
				this.hidePopup();
			});

			// 添加元素到组
			if (progressElement) {
				barGroup.appendChild(progressElement);  // 进度条
			}
			barGroup.appendChild(bar);       // 主任务条
			barGroup.appendChild(leftHandle);   // 左侧手柄
			barGroup.appendChild(leftVisual);   // 左侧视觉
			barGroup.appendChild(rightHandle);  // 右侧手柄
			barGroup.appendChild(rightVisual);  // 右侧视觉
			tasksGroup.appendChild(barGroup);
		});

		svg.appendChild(tasksGroup);
	}

	/**
	 * 渲染弹窗容器
	 */
	private renderPopupContainer(): void {
		// 弹窗由 TooltipManager 统一管理
	}

	/**
	 * 处理任务点击
	 */
	private handleTaskClick(task: FrappeTask): void {
		if (this.config.on_click) {
			this.config.on_click(task);
		}
	}

	/**
	 * 根据 FrappeTask ID 查找对应的原始任务
	 */
	private findOriginalTask(frappeTask: FrappeTask): GanttTask | null {
		// 解析任务 ID: {sanitizedName}-{lineNumber}-{index}
		// 注意：sanitizedName 是经过处理的文件名（特殊字符被替换为 _）
		const parts = frappeTask.id.split('-');
		if (parts.length < 2) return null;

		const lineNumber = parseInt(parts[parts.length - 2]);

		// 使用 lineNumber 来匹配，因为文件名中的特殊字符会被 sanitize
		return this.originalTasks.find(t => t.lineNumber === lineNumber) || null;
	}

	/**
	 * 显示弹窗（使用全局 TooltipManager）
	 * @param task - Frappe 任务
	 * @param targetElement - 目标元素
	 * @param mousePosition - 鼠标位置（可选）
	 */
	private showPopup(task: FrappeTask, targetElement: Element, mousePosition?: MousePosition): void {
		if (!this.plugin || !this.originalTasks?.length) return;

		const originalTask = this.findOriginalTask(task);
		if (!originalTask) return;

		const tooltipManager = TooltipManager.getInstance(this.plugin);
		tooltipManager.show(originalTask, targetElement as HTMLElement, mousePosition);
	}

	/**
	 * 隐藏弹窗（使用全局 TooltipManager）
	 */
	private hidePopup(): void {
		if (!this.plugin) return;

		const tooltipManager = TooltipManager.getInstance(this.plugin);
		tooltipManager.hide();
	}

	/**
	 * 拖动状态
	 */
	private taskDragState = {
		isDragging: false,
		dragType: 'none' as 'none' | 'move' | 'resize-left' | 'resize-right',
		task: null as FrappeTask | null,
		originalTask: null as GanttTask | null,
		startX: 0,
		originalStart: null as Date | null,
		originalEnd: null as Date | null,
		taskMinDate: null as Date | null,
		hasMoved: false,
		barElement: null as SVGRectElement | null,
		leftHandleElement: null as SVGRectElement | null,
		rightHandleElement: null as SVGRectElement | null,
		leftVisualElement: null as SVGRectElement | null,
		rightVisualElement: null as SVGRectElement | null,
	};

	/**
	 * 设置任务条拖动事件
	 */
	private setupTaskBarDragging(
		barGroup: SVGGElement,
		bar: SVGRectElement,
		leftHandle: SVGRectElement,
		rightHandle: SVGRectElement,
		task: FrappeTask,
		minDate: Date
	): void {
		const originalTask = this.findOriginalTask(task);

		// 左手柄拖动 - 只修改开始时间
		leftHandle.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.startDragging(task, originalTask, 'resize-left', e.clientX, minDate, bar, leftHandle, null);
		});

		// 右手柄拖动 - 只修改结束时间
		rightHandle.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			e.stopPropagation();
			this.startDragging(task, originalTask, 'resize-right', e.clientX, minDate, bar, null, rightHandle);
		});

		// 任务条整体拖动 - 同时修改开始和结束时间
		bar.addEventListener('mousedown', (e: MouseEvent) => {
			e.preventDefault();
			this.startDragging(task, originalTask, 'move', e.clientX, minDate, bar, null, null);
		});
	}

	/**
	 * 开始拖动
	 */
	private startDragging(
		task: FrappeTask,
		originalTask: GanttTask | null,
		dragType: 'move' | 'resize-left' | 'resize-right',
		startX: number,
		minDate: Date,
		bar: SVGRectElement,
		leftHandle: SVGRectElement | null,
		rightHandle: SVGRectElement | null
	): void {
		this.taskDragState = {
			isDragging: true,
			dragType,
			task,
			originalTask,
			startX,
			originalStart: new Date(task.start),
			originalEnd: new Date(task.end),
			taskMinDate: minDate,
			hasMoved: false,
			barElement: bar,
			leftHandleElement: leftHandle,
			rightHandleElement: rightHandle,
			leftVisualElement: null,
			rightVisualElement: null,
		};

		// 保存视觉元素引用
		const barGroup = bar.parentElement;
		if (barGroup) {
			this.taskDragState.leftVisualElement = barGroup.querySelector('.gc-gantt-view__handle-left + rect + *') as SVGRectElement;
			this.taskDragState.rightVisualElement = barGroup.querySelector('.gc-gantt-view__handle-right + rect + *') as SVGRectElement;
		}

		// 设置全局光标
		const cursorMap = {
			'move': 'grabbing',
			'resize-left': 'w-resize',
			'resize-right': 'e-resize',
		};
		document.body.style.cursor = cursorMap[dragType];
		document.body.style.userSelect = 'none';

		// 设置全局事件监听
		document.addEventListener('mousemove', this.handleDragMove);
		document.addEventListener('mouseup', this.handleDragEnd);
	}

	/**
	 * 处理拖动移动（绑定方法）
	 */
	private handleDragMove = (e: MouseEvent): void => {
		if (!this.taskDragState.isDragging) return;

		const deltaX = e.clientX - this.taskDragState.startX;
		const daysDelta = Math.round(deltaX / this.columnWidth);

		if (daysDelta === 0) return;

		this.taskDragState.hasMoved = true;

		const { dragType, originalStart, originalEnd, taskMinDate } = this.taskDragState;
		let newStart: Date;
		let newEnd: Date;

		switch (dragType) {
			case 'move':
				// 整体拖动：同时修改开始和结束时间
				newStart = this.addDays(originalStart!, daysDelta);
				newEnd = this.addDays(originalEnd!, daysDelta);
				break;
			case 'resize-left':
				// 左侧拖动：只修改开始时间
				newStart = this.addDays(originalStart!, daysDelta);
				newEnd = originalEnd!;
				// 确保开始时间不晚于结束时间
				if (newStart >= newEnd) {
					newStart = new Date(newEnd);
					newStart.setDate(newStart.getDate() - 1);
				}
				break;
			case 'resize-right':
				// 右侧拖动：只修改结束时间
				newStart = originalStart!;
				newEnd = this.addDays(originalEnd!, daysDelta);
				// 确保结束时间不早于开始时间
				if (newEnd <= newStart) {
					newEnd = new Date(newStart);
					newEnd.setDate(newEnd.getDate() + 1);
				}
				break;
			default:
				return;
		}

		// 实时更新任务条视觉
		this.updateTaskBarVisual(newStart, newEnd, taskMinDate!);
	}

	/**
	 * 处理拖动结束（绑定方法）
	 */
	private handleDragEnd = async (e: MouseEvent): Promise<void> => {
		if (!this.taskDragState.isDragging) return;

		const { task, dragType, originalStart, originalEnd, startX, hasMoved } = this.taskDragState;

		// 重置状态
		this.taskDragState.isDragging = false;
		document.body.style.cursor = '';
		document.body.style.userSelect = '';

		// 移除全局事件监听
		document.removeEventListener('mousemove', this.handleDragMove);
		document.removeEventListener('mouseup', this.handleDragEnd);

		if (!hasMoved) {
			// 没有移动，视为点击
			if (task!) this.handleTaskClick(task!);
			return;
		}

		const daysDelta = Math.round((e.clientX - startX) / this.columnWidth);
		if (daysDelta === 0) {
			this.refresh(this.tasks);
			return;
		}

		// 计算新日期
		let newStart: Date;
		let newEnd: Date;

		switch (dragType) {
			case 'move':
				newStart = this.addDays(originalStart!, daysDelta);
				newEnd = this.addDays(originalEnd!, daysDelta);
				break;
			case 'resize-left':
				newStart = this.addDays(originalStart!, daysDelta);
				newEnd = originalEnd!;
				if (newStart >= newEnd) {
					newStart = new Date(newEnd);
					newStart.setDate(newStart.getDate() - 1);
				}
				break;
			case 'resize-right':
				newStart = originalStart!;
				newEnd = this.addDays(originalEnd!, daysDelta);
				if (newEnd <= newStart) {
					newEnd = newStart;
					newEnd.setDate(newEnd.getDate() + 1);
				}
				break;
			default:
				return;
		}

		// 调用相应的更新方法
		try {
			if (dragType === 'move') {
				// 整体拖动：使用现有的 onDateChange 回调
				if (this.onDateChange && task!) {
					await this.onDateChange(task!, newStart, newEnd);
				}
			} else if (dragType === 'resize-left') {
				// 左侧拖动：只更新开始时间
				if (task!) await this.handleStartDateChange(task!, newStart);
			} else if (dragType === 'resize-right') {
				// 右侧拖动：只更新结束时间
				if (task!) await this.handleEndDateChange(task!, newEnd);
			}
		} catch (error) {
			console.error('[SvgGanttRenderer] Error updating task dates:', error);
		}
	}

	/**
	 * 日期加减天数
	 */
	private addDays(date: Date, days: number): Date {
		const result = new Date(date);
		result.setDate(result.getDate() + days);
		return result;
	}

	/**
	 * 实时更新任务条视觉
	 */
	private updateTaskBarVisual(newStart: Date, newEnd: Date, minDate: Date): void {
		if (!this.taskDragState.task) return;

		const { barElement, leftHandleElement, rightHandleElement, leftVisualElement, rightVisualElement } = this.taskDragState;

		// 计算新的位置和宽度
		const startOffset = Math.floor((newStart.getTime() - minDate.getTime()) / (24 * 60 * 60 * 1000));
		const duration = Math.ceil((newEnd.getTime() - newStart.getTime()) / (24 * 60 * 60 * 1000)) + 1;
		const x = this.padding + startOffset * this.columnWidth;
		const barWidth = duration * this.columnWidth - 8;

		// 更新任务条
		barElement!.setAttribute('x', String(x));
		barElement!.setAttribute('width', String(Math.max(barWidth, 20)));

		// 更新手柄位置
		if (leftHandleElement) {
			leftHandleElement.setAttribute('x', String(x));
		}
		if (leftVisualElement) {
			leftVisualElement.setAttribute('x', String(x + 2));
		}

		const rightHandleX = x + Math.max(barWidth, 20) - 12; // HANDLE_HIT_AREA
		if (rightHandleElement) {
			rightHandleElement.setAttribute('x', String(rightHandleX));
		}
		if (rightVisualElement) {
			rightVisualElement.setAttribute('x', String(rightHandleX + 12 - 2 - 4)); // HANDLE_HIT_AREA - 2 - HANDLE_VISUAL_SIZE
		}
	}

	/**
	 * 单独更新开始时间（左侧拖动）
	 */
	private async handleStartDateChange(task: FrappeTask, newStart: Date): Promise<void> {
		if (!this.plugin || !this.originalTasks?.length) return;

		const originalTask = this.findOriginalTask(task);
		if (!originalTask) return;

		const { updateTaskProperties } = require('../../tasks/taskUpdater');
		const updates: Record<string, Date> = {};
		updates[this.startField] = newStart;

		try {
			await updateTaskProperties(this.app, originalTask, updates, this.plugin.settings.enabledTaskFormats);
			await this.plugin.taskCache.updateFileCache(originalTask.filePath);
		} catch (error) {
			console.error('[SvgGanttRenderer] Error updating start date:', error);
		}
	}

	/**
	 * 单独更新结束时间（右侧拖动）
	 */
	private async handleEndDateChange(task: FrappeTask, newEnd: Date): Promise<void> {
		if (!this.plugin || !this.originalTasks?.length) return;

		const originalTask = this.findOriginalTask(task);
		if (!originalTask) return;

		const { updateTaskProperties } = require('../../tasks/taskUpdater');
		const updates: Record<string, Date> = {};
		updates[this.endField] = newEnd;

		try {
			await updateTaskProperties(this.app, originalTask, updates, this.plugin.settings.enabledTaskFormats);
			await this.plugin.taskCache.updateFileCache(originalTask.filePath);
		} catch (error) {
			console.error('[SvgGanttRenderer] Error updating end date:', error);
		}
	}

	/**
	 * 滚动到今天
	 */
	scrollToToday(): void {
		if (!this.ganttContainer || !this.minDate) return;

		const today = new Date();
		const daysDiff = Math.floor((today.getTime() - this.minDate.getTime()) / (24 * 60 * 60 * 1000));

		if (daysDiff >= 0 && daysDiff <= this.totalDays) {
			// 计算今天的 x 坐标
			const todayX = this.padding + daysDiff * this.columnWidth + this.columnWidth / 2;

			// 获取容器宽度
			const containerWidth = this.ganttContainer.clientWidth;

			// 滚动到使今天线居中的位置
			const scrollLeft = todayX - containerWidth / 2;

			// 设置滚动位置
			this.ganttContainer.scrollLeft = Math.max(0, scrollLeft);
		}
	}

	/**
	 * 销毁渲染器
	 */
	destroy(): void {
		this.hidePopup();
		this.headerSvg = null;
		this.taskListSvg = null;
		this.ganttSvg = null;
		this.cornerSvg = null;
		this.headerContainer = null;
		this.taskListContainer = null;
		this.ganttContainer = null;
		this.cornerContainer = null;
		this.ganttLayout = null;
		this.tasks = [];
	}

	/**
	 * 获取 SVG 元素（保留兼容性）
	 */
	getSvgElement(): SVGSVGElement | null {
		return this.ganttSvg;
	}
}
