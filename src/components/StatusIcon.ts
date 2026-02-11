/**
 * StatusIcon 组件
 *
 * 替代原生 <input type="checkbox">，提供 4 种任务状态的视觉图标：
 * - todo: 空心圆 ○（优先级色边框）
 * - in_progress: 半填充圆 ◐（优先级色边框 + 左半填充）
 * - done: 绿色实心圆 + 白色勾号 SVG
 * - canceled: 灰色实心圆 + 白色叉号 SVG
 *
 * 提醒类型始终显示铃铛 SVG 图标。
 *
 * @module components/StatusIcon
 */

import type { TaskPriority } from '../types';
import type { TaskStatusType } from '../tasks/taskStatus';

/**
 * StatusIcon 配置选项
 */
export interface StatusIconOptions {
	/** 任务状态 */
	status: TaskStatusType;
	/** 任务优先级（决定圆环颜色） */
	priority: TaskPriority;
	/** 是否为提醒类型（显示铃铛图标） */
	isReminder?: boolean;
	/** 是否禁用交互（如父任务已取消） */
	disabled?: boolean;
	/** 图标尺寸：compact=14px（月视图/周视图），normal=16px（任务视图） */
	size?: 'compact' | 'normal';
}

/**
 * CSS 变量名 → 优先级映射
 */
function getPriorityVar(priority: TaskPriority): string {
	switch (priority) {
		case 'high': return 'var(--gc-priority-high)';
		case 'low': return 'var(--gc-priority-low)';
		default: return 'var(--gc-priority-normal)';
	}
}

/**
 * SVG 路径常量
 */
const SVG_CHECK_PATH = 'M3.5 8.5L6.5 11.5L12.5 4.5';
const SVG_CROSS_PATH_1 = 'M5 5L11 11';
const SVG_CROSS_PATH_2 = 'M11 5L5 11';
const SVG_BELL_PATH = 'M8 2C8 2 8 2 8 2C5.17 2 3 4.17 3 7V10L2 12H6.5C6.5 13.1 7.4 14 8.5 14C9.6 14 10.5 13.1 10.5 12H14L13 10V7C13 4.17 10.83 2 8 2Z';

/**
 * StatusIcon 组件
 *
 * 渲染一个圆形状态图标，支持点击循环切换状态。
 */
export class StatusIcon {
	private el: HTMLElement | null = null;
	private options: StatusIconOptions;
	private clickCallback: ((newStatus: TaskStatusType) => void) | null = null;

	constructor(options: StatusIconOptions) {
		this.options = {
			size: 'normal',
			isReminder: false,
			disabled: false,
			...options,
		};
	}

	/**
	 * 渲染图标到目标容器
	 */
	render(container: HTMLElement): HTMLElement {
		const { status, priority, isReminder, disabled, size } = this.options;
		const sizeValue = size === 'compact' ? 'var(--gc-icon-size-compact)' : 'var(--gc-icon-size-normal)';

		// 创建外层容器
		this.el = container.createDiv({
			cls: this.buildClassList(),
		});

		this.el.style.width = sizeValue;
		this.el.style.height = sizeValue;
		this.el.style.minWidth = sizeValue;
		this.el.style.minHeight = sizeValue;
		this.el.style.display = 'inline-flex';
		this.el.style.alignItems = 'center';
		this.el.style.justifyContent = 'center';
		this.el.style.cursor = disabled ? 'default' : 'pointer';
		this.el.style.flexShrink = '0';
		this.el.setAttribute('role', 'button');
		this.el.setAttribute('aria-label', this.getAriaLabel());

		if (isReminder) {
			this.renderBellIcon();
		} else {
			this.renderStatusCircle(status, priority);
		}

		// 添加点击事件
		if (!disabled) {
			this.el.addEventListener('click', (e: MouseEvent) => {
				e.stopPropagation();
				e.preventDefault();
				if (this.clickCallback) {
					const nextStatus = this.getNextStatus(status);
					this.clickCallback(nextStatus);
				}
			});
		}

		return this.el;
	}

	/**
	 * 注册点击回调
	 */
	onClick(callback: (newStatus: TaskStatusType) => void): void {
		this.clickCallback = callback;
	}

	/**
	 * 构建 CSS 类名列表
	 */
	private buildClassList(): string {
		const { status, isReminder, disabled, size } = this.options;
		const classes = ['gc-status-icon'];

		if (isReminder) {
			classes.push('gc-status-icon--reminder');
		} else {
			classes.push(`gc-status-icon--${status.replace('_', '-')}`);
		}

		if (disabled) {
			classes.push('gc-status-icon--disabled');
		}

		if (size === 'compact') {
			classes.push('gc-status-icon--compact');
		}

		return classes.join(' ');
	}

	/**
	 * 渲染铃铛图标（提醒类型）
	 */
	private renderBellIcon(): void {
		if (!this.el) return;
		const size = this.options.size === 'compact' ? 14 : 16;
		const svg = this.createSvg(size);
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', SVG_BELL_PATH);
		path.setAttribute('fill', getPriorityVar(this.options.priority));
		path.setAttribute('stroke', 'none');
		svg.appendChild(path);
		this.el.appendChild(svg);
	}

	/**
	 * 渲染状态圆形图标
	 */
	private renderStatusCircle(status: TaskStatusType, priority: TaskPriority): void {
		if (!this.el) return;
		const size = this.options.size === 'compact' ? 14 : 16;
		const svg = this.createSvg(size);
		const cx = size / 2;
		const cy = size / 2;
		const r = size / 2 - 1.5;  // 留 1.5px 给边框

		switch (status) {
			case 'todo':
				this.renderEmptyCircle(svg, cx, cy, r, priority);
				break;
			case 'in_progress':
				this.renderHalfCircle(svg, cx, cy, r, priority);
				break;
			case 'done':
				this.renderDoneCircle(svg, cx, cy, r);
				break;
			case 'canceled':
				this.renderCanceledCircle(svg, cx, cy, r);
				break;
			default:
				this.renderEmptyCircle(svg, cx, cy, r, priority);
				break;
		}

		this.el.appendChild(svg);
	}

	/**
	 * 空心圆（todo）
	 */
	private renderEmptyCircle(svg: SVGSVGElement, cx: number, cy: number, r: number, priority: TaskPriority): void {
		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', String(cx));
		circle.setAttribute('cy', String(cy));
		circle.setAttribute('r', String(r));
		circle.setAttribute('fill', 'none');
		circle.setAttribute('stroke', getPriorityVar(priority));
		circle.setAttribute('stroke-width', '1.5');
		svg.appendChild(circle);
	}

	/**
	 * 半填充圆（in_progress）
	 */
	private renderHalfCircle(svg: SVGSVGElement, cx: number, cy: number, r: number, priority: TaskPriority): void {
		const color = getPriorityVar(priority);

		// 底层空心圆
		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', String(cx));
		circle.setAttribute('cy', String(cy));
		circle.setAttribute('r', String(r));
		circle.setAttribute('fill', 'none');
		circle.setAttribute('stroke', color);
		circle.setAttribute('stroke-width', '1.5');
		svg.appendChild(circle);

		// 左半填充 - 使用 clipPath
		const clipId = `half-clip-${Math.random().toString(36).substr(2, 9)}`;
		const defs = document.createElementNS('http://www.w3.org/2000/svg', 'defs');
		const clipPath = document.createElementNS('http://www.w3.org/2000/svg', 'clipPath');
		clipPath.setAttribute('id', clipId);
		const rect = document.createElementNS('http://www.w3.org/2000/svg', 'rect');
		rect.setAttribute('x', '0');
		rect.setAttribute('y', '0');
		rect.setAttribute('width', String(cx));
		rect.setAttribute('height', String(cy * 2));
		clipPath.appendChild(rect);
		defs.appendChild(clipPath);
		svg.appendChild(defs);

		const halfCircle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		halfCircle.setAttribute('cx', String(cx));
		halfCircle.setAttribute('cy', String(cy));
		halfCircle.setAttribute('r', String(r - 0.75));
		halfCircle.setAttribute('fill', color);
		halfCircle.setAttribute('clip-path', `url(#${clipId})`);
		svg.appendChild(halfCircle);
	}

	/**
	 * 绿色实心圆 + 白勾（done）
	 */
	private renderDoneCircle(svg: SVGSVGElement, cx: number, cy: number, r: number): void {
		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', String(cx));
		circle.setAttribute('cy', String(cy));
		circle.setAttribute('r', String(r + 0.5));
		circle.setAttribute('fill', 'var(--gc-status-completed)');
		circle.setAttribute('stroke', 'none');
		svg.appendChild(circle);

		// 白勾
		const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path.setAttribute('d', SVG_CHECK_PATH);
		path.setAttribute('fill', 'none');
		path.setAttribute('stroke', 'white');
		path.setAttribute('stroke-width', '1.8');
		path.setAttribute('stroke-linecap', 'round');
		path.setAttribute('stroke-linejoin', 'round');
		svg.appendChild(path);
	}

	/**
	 * 灰色实心圆 + 白叉（canceled）
	 */
	private renderCanceledCircle(svg: SVGSVGElement, cx: number, cy: number, r: number): void {
		const circle = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
		circle.setAttribute('cx', String(cx));
		circle.setAttribute('cy', String(cy));
		circle.setAttribute('r', String(r + 0.5));
		circle.setAttribute('fill', 'var(--gc-status-canceled)');
		circle.setAttribute('stroke', 'none');
		svg.appendChild(circle);

		// 白叉
		const path1 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path1.setAttribute('d', SVG_CROSS_PATH_1);
		path1.setAttribute('stroke', 'white');
		path1.setAttribute('stroke-width', '1.8');
		path1.setAttribute('stroke-linecap', 'round');
		path1.setAttribute('fill', 'none');
		svg.appendChild(path1);

		const path2 = document.createElementNS('http://www.w3.org/2000/svg', 'path');
		path2.setAttribute('d', SVG_CROSS_PATH_2);
		path2.setAttribute('stroke', 'white');
		path2.setAttribute('stroke-width', '1.8');
		path2.setAttribute('stroke-linecap', 'round');
		path2.setAttribute('fill', 'none');
		svg.appendChild(path2);
	}

	/**
	 * 创建 SVG 元素
	 */
	private createSvg(size: number): SVGSVGElement {
		const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
		svg.setAttribute('viewBox', `0 0 ${size} ${size}`);
		svg.setAttribute('width', String(size));
		svg.setAttribute('height', String(size));
		svg.style.display = 'block';
		return svg;
	}

	/**
	 * 获取下一个状态（todo → in_progress → done → todo）
	 */
	private getNextStatus(current: TaskStatusType): TaskStatusType {
		switch (current) {
			case 'todo': return 'in_progress';
			case 'in_progress': return 'done';
			case 'done': return 'todo';
			case 'canceled': return 'todo';
			default: return 'todo';
		}
	}

	/**
	 * 获取 aria-label
	 */
	private getAriaLabel(): string {
		const { status, isReminder, disabled } = this.options;
		if (isReminder) return '提醒';
		const labels: Record<string, string> = {
			todo: '待办',
			in_progress: '进行中',
			done: '已完成',
			canceled: '已取消',
		};
		const label = labels[status] || '待办';
		return disabled ? `${label}（已锁定）` : `${label}（点击切换）`;
	}
}
