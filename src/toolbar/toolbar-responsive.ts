/**
 * @fileoverview 工具栏响应式管理器
 * @module toolbar/toolbar-responsive
 *
 * 简化版：右侧只有 3 个等宽按钮，不再需要优先级隐藏机制。
 * 仅保留紧凑模式（隐藏左侧按钮文字）。
 */

import { ToolbarClasses } from '../utils/bem';
import { Logger } from '../utils/logger';

const THRESHOLDS = {
	HIDE_LABEL: 100,
	SHOW_LABEL: 300,
};

export class ToolbarResponsiveManager {
	private resizeObserver: ResizeObserver | null = null;
	private toolbarEl: HTMLElement | null = null;
	private centerEl: HTMLElement | null = null;
	private rightEl: HTMLElement | null = null;
	private isCompact: boolean = false;

	observe(
		toolbarEl: HTMLElement,
		centerEl: HTMLElement,
		rightEl: HTMLElement
	): void {
		this.toolbarEl = toolbarEl;
		this.centerEl = centerEl;
		this.rightEl = rightEl;

		this.updateResponsiveState();

		try {
			this.resizeObserver = new ResizeObserver(() => {
				this.updateResponsiveState();
			});
			this.resizeObserver.observe(toolbarEl);
		} catch (e) {
			Logger.warn('ToolbarResponsive', 'ResizeObserver not supported', e);
		}
	}

	disconnect(): void {
		if (this.resizeObserver) {
			this.resizeObserver.disconnect();
			this.resizeObserver = null;
		}
		this.toolbarEl = null;
		this.centerEl = null;
		this.rightEl = null;
	}

	private updateResponsiveState(): void {
		if (!this.toolbarEl || !this.centerEl) return;

		const centerWidth = this.centerEl.offsetWidth;

		if (this.isCompact) {
			if (centerWidth > THRESHOLDS.SHOW_LABEL) {
				this.isCompact = false;
				this.toolbarEl.classList.remove(ToolbarClasses.modifiers.compact);
			}
		} else {
			if (centerWidth < THRESHOLDS.HIDE_LABEL) {
				this.isCompact = true;
				this.toolbarEl.classList.add(ToolbarClasses.modifiers.compact);
			}
		}
	}
}
