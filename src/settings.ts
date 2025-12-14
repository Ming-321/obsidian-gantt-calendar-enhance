import { App, PluginSettingTab, Setting } from 'obsidian';
import type GanttCalendarPlugin from '../main';

// RGB to Hex converter
function rgbToHex(rgb: string): string {
	if (rgb.startsWith('#')) return rgb;
	const match = rgb.match(/^rgb\((\d+),\s*(\d+),\s*(\d+)\)$/);
	if (!match) return rgb;
	const hex = (x: string) => parseInt(x).toString(16).padStart(2, '0');
	return `#${hex(match[1])}${hex(match[2])}${hex(match[3])}`;
}

// Gantt Calendar Plugin Settings Interface
export interface GanttCalendarSettings {
	mySetting: string;
	startOnMonday: boolean;
	yearLunarFontSize: number;
	solarFestivalColor: string;
	lunarFestivalColor: string;
	solarTermColor: string;
}

export const DEFAULT_SETTINGS: GanttCalendarSettings = {
	mySetting: 'default',
	startOnMonday: true,
	yearLunarFontSize: 10,
	solarFestivalColor: '#e74c3c',  // 阳历节日 - 红色
	lunarFestivalColor: '#e8a041',  // 农历节日 - 橙色
	solarTermColor: '#52c41a',      // 节气 - 绿色
};

export class GanttCalendarSettingTab extends PluginSettingTab {
	plugin: GanttCalendarPlugin;

	constructor(app: App, plugin: GanttCalendarPlugin) {
		super(app, plugin);
		this.plugin = plugin;
	}

	display(): void {
		const { containerEl } = this;

		containerEl.empty();

		containerEl.createEl('h2', { text: '年视图设置' });

		new Setting(containerEl)
			.setName('年视图农历字号')
			.setDesc('调整年视图月卡片内农历文字大小（8-18px）')
			.addSlider(slider => slider
				.setLimits(8, 18, 1)
				.setValue(this.plugin.settings.yearLunarFontSize)
				.setDynamicTooltip()
				.onChange(async (value) => {
					this.plugin.settings.yearLunarFontSize = value;
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarViews();
				}));

		containerEl.createEl('h2', { text: '通用设置' });

		new Setting(containerEl)
			.setName('一周开始于:')
			.setDesc('选择一周的起始日')
			.addDropdown(drop => {
				drop.addOptions({ 'monday': '周一', 'sunday': '周日' });
				drop.setValue(this.plugin.settings.startOnMonday ? 'monday' : 'sunday');
				drop.onChange(async (value) => {
					this.plugin.settings.startOnMonday = (value === 'monday');
					await this.plugin.saveSettings();
					this.plugin.refreshCalendarViews();
				});
			});

		// Festival colors setting
		containerEl.createEl('h2', { text: '节日颜色设置' });
		
		this.createColorSetting(
			containerEl,
			'阳历节日颜色',
			'自定义阳历节日显示颜色',
			'solarFestivalColor'
		);
		
		this.createColorSetting(
			containerEl,
			'农历节日颜色',
			'自定义农历节日显示颜色',
			'lunarFestivalColor'
		);
		
		this.createColorSetting(
			containerEl,
			'节气颜色',
			'自定义节气显示颜色',
			'solarTermColor'
		);
	}

	private createColorSetting(
		containerEl: HTMLElement,
		name: string,
		desc: string,
		settingKey: 'solarFestivalColor' | 'lunarFestivalColor' | 'solarTermColor'
	): void {
		const settingDiv = containerEl.createDiv('festival-color-setting');
		
		const labelDiv = settingDiv.createDiv('festival-color-label');
		labelDiv.createEl('div', { text: name, cls: 'festival-color-name' });
		labelDiv.createEl('div', { text: desc, cls: 'festival-color-desc' });
		
		const colorPickerDiv = settingDiv.createDiv('festival-color-picker');
		
		// Custom color input
		const customInput = colorPickerDiv.createEl('input', {
			type: 'color',
			cls: 'festival-color-input'
		}) as HTMLInputElement;
		customInput.value = this.plugin.settings[settingKey];
		customInput.title = '点击选择自定义颜色';
		customInput.addEventListener('change', async () => {
			this.plugin.settings[settingKey] = customInput.value;
			await this.plugin.saveSettings();
			this.plugin.refreshCalendarViews();
			this.updateColorDisplay(colorPickerDiv, customInput.value);
		});
		
		// Preset colors
		const presetColors = ['#e74c3c', '#e8a041', '#52c41a', '#2196F3', '#9C27B0', '#FF5722', '#00BCD4'];
		presetColors.forEach(color => {
			const colorButton = colorPickerDiv.createEl('div', { cls: 'festival-color-swatch' });
			colorButton.style.backgroundColor = color;
			colorButton.style.borderColor = color === this.plugin.settings[settingKey] ? '#000' : 'transparent';
			colorButton.addEventListener('click', async () => {
				this.plugin.settings[settingKey] = color;
				customInput.value = color;
				await this.plugin.saveSettings();
				this.plugin.refreshCalendarViews();
				this.updateColorDisplay(colorPickerDiv, color);
			});
		});
		
		this.updateColorDisplay(colorPickerDiv, this.plugin.settings[settingKey]);
	}

	private updateColorDisplay(colorPickerDiv: HTMLElement, selectedColor: string): void {
		const swatches = colorPickerDiv.querySelectorAll('.festival-color-swatch');
		swatches.forEach(swatch => {
			const bgColor = (swatch as HTMLElement).style.backgroundColor;
			if (bgColor === selectedColor || rgbToHex(bgColor) === selectedColor) {
				(swatch as HTMLElement).style.borderColor = '#000';
				(swatch as HTMLElement).style.borderWidth = '3px';
			} else {
				(swatch as HTMLElement).style.borderColor = 'transparent';
				(swatch as HTMLElement).style.borderWidth = '1px';
			}
		});
	}
}
