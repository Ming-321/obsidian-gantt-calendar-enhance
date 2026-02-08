/**
 * 设置管理器
 *
 * 负责设置的加载、保存和迁移
 */

import type GanttCalendarPlugin from '../../main';
import { DEFAULT_SETTINGS } from '../settings/constants';
import type { GanttCalendarSettings } from '../settings/types';
import { Logger } from '../utils/logger';

/**
 * 设置管理器
 */
export class SettingsManager {
	private plugin: GanttCalendarPlugin;

	constructor(plugin: GanttCalendarPlugin) {
		this.plugin = plugin;
	}

	/**
	 * 加载设置（包含迁移逻辑）
	 */
	async loadSettings(): Promise<GanttCalendarSettings> {
		const rawData = await this.plugin.loadData() || {};
		const settings = Object.assign(
			{},
			DEFAULT_SETTINGS,
			rawData
		) as GanttCalendarSettings;

		// 清理旧字段
		await this.cleanLegacyFields(rawData, settings);

		return settings;
	}

	/**
	 * 保存设置
	 */
	async saveSettings(settings: GanttCalendarSettings): Promise<void> {
		await this.plugin.saveData(settings);
	}

	/**
	 * 清理旧字段（一次性迁移）
	 */
	private async cleanLegacyFields(rawData: Record<string, unknown>, settings: GanttCalendarSettings): Promise<void> {
		let needsSave = false;

		// 迁移旧的 semesterStartDate 到 semesterStartDates
		if (rawData.semesterStartDate && typeof rawData.semesterStartDate === 'string') {
			const oldDate = (rawData.semesterStartDate as string).trim();
			if (oldDate) {
				if (!settings.semesterStartDates) {
					settings.semesterStartDates = [];
				}
				if (!settings.semesterStartDates.includes(oldDate)) {
					settings.semesterStartDates.push(oldDate);
					settings.semesterStartDates.sort();
				}
				Logger.info('SettingsManager', 'Migrated semesterStartDate to semesterStartDates', {
					dates: settings.semesterStartDates,
				});
			}
			needsSave = true;
		}

		// 清理已移除的字段（从原始数据中检测）
		const legacyFields = [
			'mySetting', 'semesterStartDate', 'enabledTaskFormats',
			'dailyNotePath', 'dailyNoteNameFormat', 'taskNotePath',
			'newTaskHeading', 'enableTemplaterForDailyNote', 'templaterTemplatePath',
			'taskStatuses', 'syncConfiguration',
			// 设置界面重构移除的字段
			'solarFestivalColor', 'lunarFestivalColor', 'solarTermColor',
			'monthViewTaskLimit', 'taskSortField', 'taskSortOrder', 'defaultTaskPriority',
			'weekViewShowCheckbox', 'weekViewShowTags', 'weekViewShowPriority',
			'monthViewShowCheckbox', 'monthViewShowTags', 'monthViewShowPriority',
			'dateFilterField', 'showViewNavButtonText',
		];

		for (const field of legacyFields) {
			if (field in rawData) {
				// @ts-ignore - 清理旧字段
				delete (settings as any)[field];
				needsSave = true;
			}
		}

		// v2.0.0 迁移：重置排序设置为新的默认值（支持二级排序）
		// _sortMigratedV2 标志确保此迁移只执行一次
		if (!rawData._sortMigratedV2) {
			const sortDefaults: Partial<GanttCalendarSettings> = {
				weekViewSortField: DEFAULT_SETTINGS.weekViewSortField,
				weekViewSortOrder: DEFAULT_SETTINGS.weekViewSortOrder,
				weekViewSecondarySortField: DEFAULT_SETTINGS.weekViewSecondarySortField,
				weekViewSecondarySortOrder: DEFAULT_SETTINGS.weekViewSecondarySortOrder,
				monthViewSortField: DEFAULT_SETTINGS.monthViewSortField,
				monthViewSortOrder: DEFAULT_SETTINGS.monthViewSortOrder,
				monthViewSecondarySortField: DEFAULT_SETTINGS.monthViewSecondarySortField,
				monthViewSecondarySortOrder: DEFAULT_SETTINGS.monthViewSecondarySortOrder,
				taskViewSecondarySortField: DEFAULT_SETTINGS.taskViewSecondarySortField,
				taskViewSecondarySortOrder: DEFAULT_SETTINGS.taskViewSecondarySortOrder,
			};
			Object.assign(settings, sortDefaults);
			(settings as any)._sortMigratedV2 = true;
			needsSave = true;
		}

		if (needsSave) {
			await this.plugin.saveData(settings);
		}
	}
}
