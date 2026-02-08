import { setIcon } from 'obsidian';
import { ToolbarClasses } from '../utils/bem';

/**
 * 中间区域导航配置
 */
export interface ToolbarCenterConfig {
	titleText: string;
	/** 是否显示导航箭头（任务视图和 rolling7 模式时为 false） */
	showNav: boolean;
	onPrevious?: () => void;
	onToday?: () => void;
	onNext?: () => void;
	/** 标题长按回调（用于切换 rolling7 模式） */
	onLongPress?: () => void;
}

/** 长按触发阈值（毫秒） */
const LONG_PRESS_THRESHOLD = 500;

/**
 * 工具栏中间区域 - 导航 + 标题
 *
 * 布局：◀  第5周 (2.3-2.9)  ▶
 * 单击标题文字：回到今天 / 退出 rolling7 模式
 * 长按标题文字：进入 rolling7 模式（从今天起 7 天）
 * 任务视图 / rolling7 模式时不显示箭头
 */
export class ToolbarCenter {
	render(container: HTMLElement, config: ToolbarCenterConfig): void {
		container.empty();

		const classes = ToolbarClasses.components.centerNav;
		const wrapper = container.createDiv(classes.wrapper);

		if (config.showNav) {
			// 左箭头
			const prevBtn = wrapper.createEl('button', { cls: classes.prevBtn });
			setIcon(prevBtn, 'chevron-left');
			prevBtn.setAttribute('aria-label', '上一期');
			prevBtn.addEventListener('click', () => config.onPrevious?.());
		}

		// 标题（单击 + 长按）
		const titleEl = wrapper.createEl('span', {
			text: config.titleText,
			cls: classes.title,
		});
		titleEl.style.cursor = 'pointer';
		titleEl.setAttribute('aria-label', config.showNav ? '单击回到今天 / 长按切换7日模式' : '单击切回标准周');

		// 长按检测
		let longPressTimer: ReturnType<typeof setTimeout> | null = null;
		let isLongPress = false;

		const startPress = () => {
			isLongPress = false;
			longPressTimer = setTimeout(() => {
				isLongPress = true;
				config.onLongPress?.();
			}, LONG_PRESS_THRESHOLD);
		};

		const endPress = () => {
			if (longPressTimer) {
				clearTimeout(longPressTimer);
				longPressTimer = null;
			}
		};

		titleEl.addEventListener('mousedown', startPress);
		titleEl.addEventListener('mouseup', endPress);
		titleEl.addEventListener('mouseleave', endPress);
		titleEl.addEventListener('touchstart', startPress, { passive: true });
		titleEl.addEventListener('touchend', endPress);

		// 单击：仅在非长按时触发
		titleEl.addEventListener('click', (e) => {
			if (isLongPress) {
				isLongPress = false;
				return;
			}
			config.onToday?.();
		});

		if (config.showNav) {
			// 右箭头
			const nextBtn = wrapper.createEl('button', { cls: classes.nextBtn });
			setIcon(nextBtn, 'chevron-right');
			nextBtn.setAttribute('aria-label', '下一期');
			nextBtn.addEventListener('click', () => config.onNext?.());
		}
	}
}
