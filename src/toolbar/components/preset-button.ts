/**
 * @fileoverview 快捷预设按钮组件
 * @module toolbar/components/preset-button
 *
 * 绑定到已有按钮：
 * - 单击：立即应用默认预设（isDefault = true）
 * - 长按（500ms）：打开下拉菜单选择预设
 */

import { setIcon } from 'obsidian';
import type { ViewPreset } from '../../settings/types';
import { ToolbarClasses } from '../../utils/bem';

export interface PresetButtonOptions {
	getPresets: () => ViewPreset[];
	onApplyPreset: (preset: ViewPreset) => void;
}

/**
 * 绑定预设交互到已有按钮
 * @param btn 已存在的按钮元素
 * @param options 预设配置
 */
export function renderPresetButton(
	btn: HTMLElement,
	options: PresetButtonOptions
): { cleanup: () => void } {
	const classes = ToolbarClasses.components.presetBtn;

	let longPressTimer: ReturnType<typeof setTimeout> | null = null;
	let isLongPress = false;
	let dropdown: HTMLElement | null = null;
	let outsideClickHandler: ((e: MouseEvent) => void) | null = null;

	function closeDropdown() {
		if (dropdown) {
			dropdown.remove();
			dropdown = null;
		}
		if (outsideClickHandler) {
			document.removeEventListener('click', outsideClickHandler, true);
			outsideClickHandler = null;
		}
	}

	function openDropdown() {
		if (dropdown) {
			closeDropdown();
			return;
		}

		dropdown = document.body.createDiv(classes.dropdown);

		const rect = btn.getBoundingClientRect();
		dropdown.style.position = 'fixed';
		dropdown.style.top = `${rect.bottom + 4}px`;
		dropdown.style.right = `${window.innerWidth - rect.right}px`;
		dropdown.style.zIndex = '1000';

		const presets = options.getPresets();
		presets.forEach(preset => {
			const item = dropdown!.createDiv(classes.item);
			if (preset.isDefault) {
				item.addClass(classes.itemDefault);
			}

			if (preset.icon) {
				const iconEl = item.createSpan({ cls: classes.icon });
				setIcon(iconEl, preset.icon);
			}
			item.createSpan({ text: preset.name, cls: classes.name });

			item.addEventListener('click', (e) => {
				e.stopPropagation();
				options.onApplyPreset(preset);
				closeDropdown();
			});
		});

		outsideClickHandler = (e: MouseEvent) => {
			if (dropdown && !dropdown.contains(e.target as Node) && !btn.contains(e.target as Node)) {
				closeDropdown();
			}
		};
		setTimeout(() => {
			if (outsideClickHandler) {
				document.addEventListener('click', outsideClickHandler, true);
			}
		}, 10);
	}

	// 长按检测
	btn.addEventListener('mousedown', () => {
		isLongPress = false;
		longPressTimer = setTimeout(() => {
			isLongPress = true;
			openDropdown();
		}, 500);
	});

	btn.addEventListener('mouseup', () => {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	});

	btn.addEventListener('mouseleave', () => {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	});

	// 单击 = 应用默认预设
	btn.addEventListener('click', (e) => {
		if (isLongPress) {
			isLongPress = false;
			return;
		}
		e.stopPropagation();

		const presets = options.getPresets();
		const defaultPreset = presets.find(p => p.isDefault) || presets[0];
		if (defaultPreset) {
			options.onApplyPreset(defaultPreset);
		}
	});

	// Touch 长按支持
	btn.addEventListener('touchstart', () => {
		isLongPress = false;
		longPressTimer = setTimeout(() => {
			isLongPress = true;
			openDropdown();
		}, 500);
	}, { passive: true });

	btn.addEventListener('touchend', () => {
		if (longPressTimer) {
			clearTimeout(longPressTimer);
			longPressTimer = null;
		}
	});

	return {
		cleanup: () => {
			if (longPressTimer) clearTimeout(longPressTimer);
			closeDropdown();
		},
	};
}
