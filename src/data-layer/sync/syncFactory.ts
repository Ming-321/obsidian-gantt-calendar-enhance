/**
 * 同步工厂
 *
 * 负责根据用户配置创建和初始化相应的数据源。
 */

import type { SyncConfiguration } from './syncTypes';
import type { DataSourceConfig } from '../types';
import { SyncManager } from './syncManager';
import { EventBus } from '../EventBus';
import { Logger } from '../../utils/logger';

// API 数据源
import { FeishuProvider } from '../sources/api/providers/FeishuProvider';
import { MicrosoftTodoProvider } from '../sources/api/providers/MicrosoftTodoProvider';

// CalDAV 数据源
import { GoogleCalendarProvider } from '../sources/caldav/providers/GoogleCalendarProvider';
import { OutlookProvider } from '../sources/caldav/providers/OutlookProvider';
import { AppleCalendarProvider } from '../sources/caldav/providers/AppleCalendarProvider';
import { CalDAVDataSource, CalDAVDataSourceConfig } from '../sources/caldav/CalDAVDataSource';

/**
 * 创建同步管理器
 */
export function createSyncManager(config: SyncConfiguration): SyncManager | null {
	if (!config.enabledSources?.api && !config.enabledSources?.caldav) {
		return null;
	}

	const eventBus = new EventBus();
	const syncManager = new SyncManager(eventBus, config);

	// 注册 API 数据源
	if (config.enabledSources?.api && config.api) {
		registerAPIDataSource(syncManager, config);
	}

	// 注册 CalDAV 数据源
	if (config.enabledSources?.caldav && config.caldav) {
		registerCalDAVDataSource(syncManager, config);
	}

	return syncManager;
}

/**
 * 注册 API 数据源
 */
function registerAPIDataSource(
	syncManager: SyncManager,
	syncConfig: SyncConfiguration
): void {
	const apiConfig = syncConfig.api;
	if (!apiConfig) return;

	try {
		const baseConfig: DataSourceConfig = {
			enabled: true,
			syncDirection: syncConfig.syncDirection,
			autoSync: syncConfig.syncInterval > 0,
			syncInterval: syncConfig.syncInterval,
			conflictResolution: syncConfig.conflictResolution,
			api: {
				provider: apiConfig.provider,
				apiKey: apiConfig.apiKey,
				endpoint: apiConfig.endpoint,
				appId: apiConfig.appId,
				appSecret: apiConfig.appSecret,
				tenantId: apiConfig.tenantId,
				accessToken: apiConfig.accessToken,
				refreshToken: apiConfig.refreshToken,
				clientId: apiConfig.clientId,
				clientSecret: apiConfig.clientSecret,
				redirectUri: apiConfig.redirectUri,
			},
		};

		switch (apiConfig.provider) {
			case 'feishu':
				if (apiConfig.appId && apiConfig.appSecret) {
					const feishuProvider = new FeishuProvider(baseConfig);
					syncManager.registerDataSource(feishuProvider);
					Logger.info('SyncFactory', 'Feishu data source registered');
				}
				break;

			case 'microsoft-todo':
				if (apiConfig.accessToken) {
					const msTodoProvider = new MicrosoftTodoProvider(baseConfig);
					syncManager.registerDataSource(msTodoProvider);
					Logger.info('SyncFactory', 'Microsoft To Do data source registered');
				}
				break;

			case 'custom':
				// 自定义 API 暂不支持
				Logger.warn('SyncFactory', 'Custom API provider not yet implemented');
				break;
		}
	} catch (error) {
		Logger.error('SyncFactory', `Failed to register ${apiConfig.provider} data source`, error);
	}
}

/**
 * 注册 CalDAV 数据源
 */
function registerCalDAVDataSource(
	syncManager: SyncManager,
	syncConfig: SyncConfiguration
): void {
	const caldavConfig = syncConfig.caldav;
	if (!caldavConfig) return;

	try {
		let dataSource: CalDAVDataSource | null = null;

		switch (caldavConfig.provider) {
			case 'google':
				if (caldavConfig.clientId && caldavConfig.accessToken) {
					dataSource = new GoogleCalendarProvider({
						clientId: caldavConfig.clientId,
						clientSecret: caldavConfig.clientSecret || '',
						redirectUri: caldavConfig.redirectUri || 'obsidian://callback',
						accessToken: caldavConfig.accessToken,
						refreshToken: caldavConfig.refreshToken,
					});
				}
				break;

			case 'outlook':
				if (caldavConfig.clientId && caldavConfig.accessToken) {
					dataSource = new OutlookProvider({
						clientId: caldavConfig.clientId,
						clientSecret: caldavConfig.clientSecret || '',
						redirectUri: caldavConfig.redirectUri || 'obsidian://callback',
						accessToken: caldavConfig.accessToken,
						refreshToken: caldavConfig.refreshToken,
					});
				}
				break;

			case 'apple':
				if (caldavConfig.username && caldavConfig.password) {
					dataSource = new AppleCalendarProvider({
						username: caldavConfig.username,
						password: caldavConfig.password,
					});
				}
				break;

			case 'custom':
				if (caldavConfig.url) {
					const config: CalDAVDataSourceConfig = {
						autoSync: false,
						syncDirection: 'bidirectional',
						conflictResolution: 'newest-win',
						caldav: {
							provider: 'custom',
							url: caldavConfig.url,
							username: caldavConfig.username,
							password: caldavConfig.password,
							calendarPath: caldavConfig.url,
						},
					};
					dataSource = new CalDAVDataSource('custom-caldav', 'Custom CalDAV', config);
				}
				break;
		}

		if (dataSource) {
			syncManager.registerDataSource(dataSource);
			Logger.info('SyncFactory', `${caldavConfig.provider} CalDAV data source registered`);
		} else {
			Logger.warn('SyncFactory', `Incomplete ${caldavConfig.provider} CalDAV configuration`);
		}
	} catch (error) {
		Logger.error('SyncFactory', `Failed to register ${caldavConfig.provider} CalDAV data source`, error);
	}
}
