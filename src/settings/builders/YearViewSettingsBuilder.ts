import { Setting } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import { HeatmapPalettePicker, ColorPicker } from '../components';
import { PRESET_FESTIVAL_COLORS } from '../constants';
import type { BuilderConfig, ColorPickerConfig } from '../types';

/**
 * 年视图设置构建器
 */
export class YearViewSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// ===== 年视图设置 =====
		this.containerEl.createEl('h2', { text: '年视图设置' });

		// 年视图每日任务数量显示
		new Setting(this.containerEl)
			.setName('显示每日任务数量')
			.setDesc('在年视图每个日期下方显示当天任务总数（已完成+未完成）')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.yearShowTaskCount)
				.onChange(async (value) => {
					this.plugin.settings.yearShowTaskCount = value;
					await this.saveAndRefresh();
				}));

		// 年视图任务热力图开关
		new Setting(this.containerEl)
			.setName('启用任务热力图')
			.setDesc('根据当天任务数量深浅显示日期背景颜色')
			.addToggle(toggle => toggle
				.setValue(this.plugin.settings.yearHeatmapEnabled)
				.onChange(async (value) => {
					this.plugin.settings.yearHeatmapEnabled = value;
					await this.saveAndRefresh();
					// 切换显示色卡设置
					// 注意：这里需要调用 SettingTab 的 display() 方法来重新渲染
					this.plugin.refreshCalendarViews();
				}));

		// 热力图色卡选择（平铺单选色卡）
		if (this.plugin.settings.yearHeatmapEnabled) {
			const heatmapPicker = new HeatmapPalettePicker({
				container: this.containerEl,
				currentPalette: this.plugin.settings.yearHeatmapPalette,
				onPaletteChange: async (paletteKey) => {
					this.plugin.settings.yearHeatmapPalette = paletteKey;
					await this.saveAndRefresh();
				}
			});
			heatmapPicker.render();
		}

		// ===== 节日颜色设置 =====
		this.containerEl.createEl('h3', { text: '节日颜色设置' });

		// 创建横向容器
		const festivalColorContainer = this.containerEl.createDiv('festival-color-settings-container');

		// 阳历节日颜色
		const solarFestivalConfig: ColorPickerConfig = {
			container: festivalColorContainer,
			name: '阳历节日颜色',
			description: '自定义阳历节日显示颜色',
			currentColor: this.plugin.settings.solarFestivalColor,
			presetColors: PRESET_FESTIVAL_COLORS,
			onColorChange: async (color) => {
				this.plugin.settings.solarFestivalColor = color;
				await this.saveAndRefresh();
			}
		};
		const solarFestivalPicker = new ColorPicker(solarFestivalConfig);
		solarFestivalPicker.render();

		// 农历节日颜色
		const lunarFestivalConfig: ColorPickerConfig = {
			container: festivalColorContainer,
			name: '农历节日颜色',
			description: '自定义农历节日显示颜色',
			currentColor: this.plugin.settings.lunarFestivalColor,
			presetColors: PRESET_FESTIVAL_COLORS,
			onColorChange: async (color) => {
				this.plugin.settings.lunarFestivalColor = color;
				await this.saveAndRefresh();
			}
		};
		const lunarFestivalPicker = new ColorPicker(lunarFestivalConfig);
		lunarFestivalPicker.render();

		// 节气颜色
		const solarTermConfig: ColorPickerConfig = {
			container: festivalColorContainer,
			name: '节气颜色',
			description: '自定义节气显示颜色',
			currentColor: this.plugin.settings.solarTermColor,
			presetColors: PRESET_FESTIVAL_COLORS,
			onColorChange: async (color) => {
				this.plugin.settings.solarTermColor = color;
				await this.saveAndRefresh();
			}
		};
		const solarTermPicker = new ColorPicker(solarTermConfig);
		solarTermPicker.render();
	}
}
