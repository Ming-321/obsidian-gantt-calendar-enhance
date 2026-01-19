import { Setting, SettingGroup, Notice } from 'obsidian';
import { BaseBuilder } from './BaseBuilder';
import type { BuilderConfig } from '../types';

/**
 * 同步设置构建器
 * 提供 API 同步和 CalDAV 同步的配置界面
 */
export class SyncSettingsBuilder extends BaseBuilder {
	constructor(config: BuilderConfig) {
		super(config);
	}

	render(): void {
		// 获取同步配置（如果不存在则初始化）
		const syncConfig = this.getSyncConfiguration();

		this.createSettingGroup('第三方同步', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// ===== 同步方向 =====
			addSetting(setting =>
				setting.setName('同步方向')
					.setDesc('选择任务同步的方向')
					.addDropdown(drop => drop
						.addOptions({
							'bidirectional': '双向同步',
							'import-only': '仅导入（从远程）',
							'export-only': '仅导出（到远程）'
						})
						.setValue(syncConfig.syncDirection)
						.onChange(async (value) => {
							this.updateSyncConfig({ syncDirection: value as 'bidirectional' | 'import-only' | 'export-only' });
							await this.saveAndRefresh();
						}))
			);

			// ===== 冲突解决策略 =====
			addSetting(setting =>
				setting.setName('冲突解决策略')
					.setDesc('当本地和远程任务同时修改时的处理方式')
					.addDropdown(drop => drop
						.addOptions({
							'local-win': '本地优先',
							'remote-win': '远程优先',
							'newest-win': '最新修改优先',
							'manual': '手动处理'
						})
						.setValue(syncConfig.conflictResolution)
						.onChange(async (value) => {
							this.updateSyncConfig({ conflictResolution: value as 'local-win' | 'remote-win' | 'newest-win' | 'manual' });
							await this.saveAndRefresh();
						}))
			);

			// ===== 自动同步间隔 =====
			addSetting(setting =>
				setting.setName('自动同步间隔')
					.setDesc('自动同步的时间间隔（分钟），设为 0 关闭自动同步')
					.addSlider(slider => slider
						.setLimits(0, 120, 5)
						.setValue(syncConfig.syncInterval)
						.setDynamicTooltip()
						.onChange(async (value: number) => {
							this.updateSyncConfig({ syncInterval: value });
							await this.saveAndRefresh();
						}))
			);

			// ===== 手动同步按钮 =====
			addSetting(setting =>
				setting.setName('手动同步')
					.setDesc('立即执行一次同步操作')
					.addButton(button => button
						.setButtonText('立即同步')
						.setClass('mod-cta')
						.onClick(async () => {
							await this.runManualSync();
						}))
			);
		});

		// ===== API 同步设置 =====
		this.createSettingGroup('API 任务同步', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// API 同步开关
			addSetting(setting =>
				setting.setName('启用 API 同步')
					.setDesc('开启后将与第三方任务管理服务同步')
					.addToggle(toggle => toggle
						.setValue(syncConfig.enabledSources?.api || false)
						.onChange(async (value: boolean) => {
							this.updateSyncConfig({
								enabledSources: { ...syncConfig.enabledSources, api: value }
							});
							await this.saveAndRefresh();
						}))
			);

			// API 服务商选择
			const provider = syncConfig.api?.provider || 'feishu';
			addSetting(setting =>
				setting.setName('任务服务提供商')
					.setDesc('选择要同步的任务管理服务')
					.addDropdown(drop => drop
						.addOptions({
							'feishu': '飞书 (Lark)',
							'microsoft-todo': 'Microsoft To Do',
							'custom': '自定义'
						})
						.setValue(provider)
						.onChange(async (value: string) => {
							this.updateSyncConfig({
								api: { ...syncConfig.api, provider: value as 'feishu' | 'microsoft-todo' | 'custom' }
							});
							await this.saveAndRefresh();
							// 刷新整个设置面板以更新服务商配置
							this.refreshSettingsPanel();
						}))
			);

			// 服务商特定配置 - 直接渲染到 group 中
			if (provider === 'feishu') {
				this.renderFeishuSettings(group, syncConfig);
			} else if (provider === 'microsoft-todo') {
				this.renderMicrosoftTodoSettings(group, syncConfig);
			}

			// 测试连接按钮
			addSetting(setting =>
				setting.setName('测试连接')
					.setDesc('验证配置是否正确')
					.addButton(button => button
						.setButtonText('测试连接')
						.onClick(async () => {
							await this.testConnection();
						}))
			);
		});

		// ===== CalDAV 日历同步设置 =====
		this.createSettingGroup('日历同步', (group) => {
			const addSetting = (cb: (setting: Setting) => void) => {
				if (this.isSettingGroupAvailable()) {
					(group as SettingGroup).addSetting(cb);
				} else {
					cb(new Setting(this.containerEl));
				}
			};

			// CalDAV 同步开关
			addSetting(setting =>
				setting.setName('启用日历同步')
					.setDesc('与 Google Calendar、Outlook、Apple Calendar 同步任务和事件')
					.addToggle(toggle => toggle
						.setValue(syncConfig.enabledSources?.caldav || false)
						.onChange(async (value: boolean) => {
							this.updateSyncConfig({
								enabledSources: { ...syncConfig.enabledSources, caldav: value }
							});
							await this.saveAndRefresh();
						}))
			);

			// 日历服务提供商选择
			const caldavProvider = syncConfig.caldav?.provider || 'google';
			addSetting(setting =>
				setting.setName('日历服务提供商')
					.setDesc('选择要同步的日历服务')
					.addDropdown(drop => drop
						.addOptions({
							'google': 'Google Calendar',
							'outlook': 'Outlook Calendar',
							'apple': 'Apple Calendar (iCloud)',
							'custom': '自定义 CalDAV'
						})
						.setValue(caldavProvider)
						.onChange(async (value: string) => {
							this.updateSyncConfig({
								caldav: { ...syncConfig.caldav, provider: value as 'google' | 'outlook' | 'apple' | 'custom' }
							});
							await this.saveAndRefresh();
							// 刷新整个设置面板以更新服务商配置
							this.refreshSettingsPanel();
						}))
			);

			// 服务商特定配置 - 直接渲染到 group 中
			if (caldavProvider === 'google') {
				this.renderGoogleSettings(group, syncConfig);
			} else if (caldavProvider === 'outlook') {
				this.renderOutlookSettings(group, syncConfig);
			} else if (caldavProvider === 'apple') {
				this.renderAppleSettings(group, syncConfig);
			} else if (caldavProvider === 'custom') {
				this.renderCustomCalDAVSettings(group, syncConfig);
			}

			// 测试 CalDAV 连接
			addSetting(setting =>
				setting.setName('测试日历连接')
					.setDesc('验证 CalDAV 配置是否正确')
					.addButton(button => button
						.setButtonText('测试连接')
						.onClick(async () => {
							await this.testCalDAVConnection();
						}))
			);
		});
	}

	/**
	 * 渲染 Google Calendar 配置
	 */
	private renderGoogleSettings(group: SettingGroup | HTMLElement, syncConfig: any): void {
		// 确定使用的容器
		const container = group instanceof HTMLElement ? group : this.containerEl;

		const addSetting = (cb: (setting: Setting) => void) => {
			if (this.isSettingGroupAvailable() && group instanceof SettingGroup) {
				group.addSetting(cb);
			} else {
				cb(new Setting(container));
			}
		};

		// Client ID
		addSetting(setting =>
			setting.setName('客户端 ID')
				.setDesc('Google OAuth 2.0 客户端 ID（在 Google Cloud Console 创建）')
				.addText(text => text
					.setPlaceholder('xxxxxxxxxx.apps.googleusercontent.com')
					.setValue(syncConfig.caldav?.clientId || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, clientId: value }
						});
					}))
		);

		// Client Secret
		addSetting(setting =>
			setting.setName('客户端密钥')
				.setDesc('Google OAuth 2.0 客户端密钥')
				.addText(text => text
					.setPlaceholder('GOCSPX-xxxxxxxxxx')
					.setValue(syncConfig.caldav?.clientSecret || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, clientSecret: value }
						});
					}))
		);

		// Access Token
		addSetting(setting =>
			setting.setName('访问令牌')
				.setDesc('OAuth 2.0 访问令牌')
				.addText(text => text
					.setPlaceholder('ya29.a0AfH6SMBx...')
					.setValue(syncConfig.caldav?.accessToken || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, accessToken: value }
						});
					}))
		);

		// Refresh Token
		addSetting(setting =>
			setting.setName('刷新令牌')
				.setDesc('用于自动刷新访问令牌')
				.addText(text => text
					.setPlaceholder('1//0gxxxxxxxxxx')
					.setValue(syncConfig.caldav?.refreshToken || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, refreshToken: value }
						});
					}))
		);

		// OAuth 授权按钮
		addSetting(setting =>
			setting.setName('获取授权')
				.setDesc('首次使用需要通过 Google OAuth 授权')
				.addButton(button => button
					.setButtonText('打开 Google 授权页面')
					.setClass('mod-cta')
					.onClick(() => {
						this.openGoogleOAuthPage();
					}))
		);
	}

	/**
	 * 渲染 Outlook Calendar 配置
	 */
	private renderOutlookSettings(group: SettingGroup | HTMLElement, syncConfig: any): void {
		// 确定使用的容器
		const container = group instanceof HTMLElement ? group : this.containerEl;

		const addSetting = (cb: (setting: Setting) => void) => {
			if (this.isSettingGroupAvailable() && group instanceof SettingGroup) {
				group.addSetting(cb);
			} else {
				cb(new Setting(container));
			}
		};

		// Client ID
		addSetting(setting =>
			setting.setName('客户端 ID')
				.setDesc('Microsoft Azure 应用程序 ID')
				.addText(text => text
					.setPlaceholder('xxxxxxxx-xxxx-xxxx-xxxx-xxxxxxxxxxxx')
					.setValue(syncConfig.caldav?.clientId || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, clientId: value }
						});
					}))
		);

		// Client Secret
		addSetting(setting =>
			setting.setName('客户端密钥')
				.setDesc('Microsoft Azure 应用程序密钥')
				.addText(text => text
					.setPlaceholder('xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx')
					.setValue(syncConfig.caldav?.clientSecret || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, clientSecret: value }
						});
					}))
		);

		// Access Token
		addSetting(setting =>
			setting.setName('访问令牌')
				.setDesc('Microsoft Graph API 访问令牌')
				.addText(text => text
					.setPlaceholder('EwBgA8l6BAAU...')
					.setValue(syncConfig.caldav?.accessToken || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, accessToken: value }
						});
					}))
		);

		// Refresh Token
		addSetting(setting =>
			setting.setName('刷新令牌')
				.setDesc('用于自动刷新访问令牌')
				.addText(text => text
					.setPlaceholder('M.R3_BAY...')
					.setValue(syncConfig.caldav?.refreshToken || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, refreshToken: value }
						});
					}))
		);

		// OAuth 授权按钮
		addSetting(setting =>
			setting.setName('获取授权')
				.setDesc('首次使用需要通过 Microsoft OAuth 授权')
				.addButton(button => button
					.setButtonText('打开 Microsoft 授权页面')
					.setClass('mod-cta')
					.onClick(() => {
						this.openMicrosoftOAuthPage();
					}))
		);
	}

	/**
	 * 渲染 Apple Calendar 配置
	 */
	private renderAppleSettings(group: SettingGroup | HTMLElement, syncConfig: any): void {
		// 确定使用的容器
		const container = group instanceof HTMLElement ? group : this.containerEl;

		const addSetting = (cb: (setting: Setting) => void) => {
			if (this.isSettingGroupAvailable() && group instanceof SettingGroup) {
				group.addSetting(cb);
			} else {
				cb(new Setting(container));
			}
		};

		// Apple ID / 用户名
		addSetting(setting =>
			setting.setName('Apple ID')
				.setDesc('您的 Apple ID 邮箱')
				.addText(text => text
					.setPlaceholder('your-email@example.com')
					.setValue(syncConfig.caldav?.username || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, username: value }
						});
					}))
		);

		// 应用专用密码
		addSetting(setting =>
			setting.setName('应用专用密码')
				.setDesc('在 appleid.apple.com 生成的应用专用密码（非主密码）')
				.addText(text => text
					.setPlaceholder('xxxx-xxxx-xxxx-xxxx')
					.setValue(syncConfig.caldav?.password || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, password: value }
						});
					}))
		);

		// 帮助提示
		addSetting(setting =>
			setting.setName('如何获取应用专用密码')
				.setDesc('需要生成应用专用密码才能使用 Apple Calendar 同步')
				.addButton(button => button
					.setButtonText('查看帮助')
					.onClick(() => {
						this.showApplePasswordHelp();
					}))
		);
	}

	/**
	 * 渲染自定义 CalDAV 配置
	 */
	private renderCustomCalDAVSettings(group: SettingGroup | HTMLElement, syncConfig: any): void {
		// 确定使用的容器
		const container = group instanceof HTMLElement ? group : this.containerEl;

		const addSetting = (cb: (setting: Setting) => void) => {
			if (this.isSettingGroupAvailable() && group instanceof SettingGroup) {
				group.addSetting(cb);
			} else {
				cb(new Setting(container));
			}
		};

		// CalDAV URL
		addSetting(setting =>
			setting.setName('CalDAV 服务器 URL')
				.setDesc('CalDAV 服务器地址')
				.addText(text => text
					.setPlaceholder('https://caldav.example.com/')
					.setValue(syncConfig.caldav?.url || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, url: value }
						});
					}))
		);

		// 用户名
		addSetting(setting =>
			setting.setName('用户名')
				.setDesc('CalDAV 服务器用户名')
				.addText(text => text
					.setPlaceholder('username')
					.setValue(syncConfig.caldav?.username || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, username: value }
						});
					}))
		);

		// 密码
		addSetting(setting =>
			setting.setName('密码')
				.setDesc('CalDAV 服务器密码')
				.addText(text => text
					.setPlaceholder('password')
					.setValue(syncConfig.caldav?.password || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							caldav: { ...syncConfig.caldav, password: value }
						});
					}))
		);
	}

	/**
	 * 显示 Apple 密码帮助
	 */
	private showApplePasswordHelp(): void {
		const helpText = `
如何获取 Apple 应用专用密码：

1. 访问 appleid.apple.com 并登录
2. 进入"安全"部分
3. 点击"生成密码"（在应用专用密码下）
4. 输入标签（例如：Obsidian Gantt Calendar）
5. 复制生成的密码并粘贴到上方

注意：您需要在 Apple ID 上启用双重认证才能生成应用专用密码。
		`;
		new Notice(helpText.replace(/\n/g, ' '), 15000);
	}

	/**
	 * 打开 Google OAuth 授权页面
	 */
	private openGoogleOAuthPage(): void {
		const clientId = this.plugin.settings.syncConfiguration?.caldav?.clientId || '';
		const redirectUri = encodeURIComponent('obsidian://callback');
		const scopes = [
			'https://www.googleapis.com/auth/calendar',
			'https://www.googleapis.com/auth/calendar.events'
		].join(' ');

		const authUrl = `https://accounts.google.com/o/oauth2/v2/auth?` +
			`client_id=${encodeURIComponent(clientId)}` +
			`&redirect_uri=${redirectUri}` +
			`&response_type=code` +
			`&scope=${encodeURIComponent(scopes)}` +
			`&access_type=offline` +
			`&prompt=consent`;

		window.open(authUrl, '_blank');
		new Notice('请在浏览器中完成授权');
	}

	/**
	 * 打开 Microsoft OAuth 授权页面
	 */
	private openMicrosoftOAuthPage(): void {
		const clientId = this.plugin.settings.syncConfiguration?.caldav?.clientId || '';
		const redirectUri = encodeURIComponent('obsidian://callback');
		const scopes = ['Calendars.ReadWrite', 'User.Read'].join(' ');

		const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?` +
			`client_id=${encodeURIComponent(clientId)}` +
			`&redirect_uri=${redirectUri}` +
			`&response_type=code` +
			`&scope=${encodeURIComponent(scopes)}` +
			`&response_mode=query` +
			`&prompt=consent`;

		window.open(authUrl, '_blank');
		new Notice('请在浏览器中完成授权');
	}

	/**
	 * 测试 CalDAV 连接
	 */
	private async testCalDAVConnection(): Promise<void> {
		new Notice('正在测试 CalDAV 连接...');

		try {
			const config = this.getSyncConfiguration();

			if (!config.enabledSources?.caldav) {
				new Notice('请先启用日历同步');
				return;
			}

			const provider = config.caldav?.provider;

			// 基本配置验证
			if (provider === 'apple' || provider === 'custom') {
				if (!config.caldav?.username || !config.caldav?.password) {
					new Notice('请先配置用户名和密码');
					return;
				}
			} else if (provider === 'google' || provider === 'outlook') {
				if (!config.caldav?.accessToken) {
					new Notice('请先配置访问令牌或完成 OAuth 授权');
					return;
				}
			}

			// 实际连接测试需要初始化相应的数据源
			new Notice(`${provider} 连接测试功能开发中...`);
		} catch (error) {
			new Notice(`连接测试失败: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * 渲染飞书特定配置
	 */
	private renderFeishuSettings(group: SettingGroup | HTMLElement, syncConfig: any): void {
		// 确定使用的容器
		const container = group instanceof HTMLElement ? group : this.containerEl;

		const addSetting = (cb: (setting: Setting) => void) => {
			if (this.isSettingGroupAvailable() && group instanceof SettingGroup) {
				group.addSetting(cb);
			} else {
				cb(new Setting(container));
			}
		};

		// App ID
		addSetting(setting =>
			setting.setName('App ID')
				.setDesc('飞书应用的 App ID')
				.addText(text => text
					.setPlaceholder('cli_xxxxxxxxxxxxx')
					.setValue(syncConfig.api?.appId || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							api: { ...syncConfig.api, appId: value }
						});
					}))
		);

		// App Secret
		addSetting(setting =>
			setting.setName('App Secret')
				.setDesc('飞书应用的 App Secret')
				.addText(text => text
					.setPlaceholder('xxxxxxxxxxxxxxxx')
					.setValue(syncConfig.api?.appSecret || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							api: { ...syncConfig.api, appSecret: value }
						});
					}))
		);

		// Tenant ID (可选)
		addSetting(setting =>
			setting.setName('Tenant ID (可选)')
				.setDesc('企业租户 ID，多租户应用需要填写')
				.addText(text => text
					.setPlaceholder('xxxxxxxxxxxxxxxx')
					.setValue(syncConfig.api?.tenantId || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							api: { ...syncConfig.api, tenantId: value }
						});
					}))
		);
	}

	/**
	 * 渲染 Microsoft To Do 特定配置
	 */
	private renderMicrosoftTodoSettings(group: SettingGroup | HTMLElement, syncConfig: any): void {
		// 确定使用的容器
		const container = group instanceof HTMLElement ? group : this.containerEl;

		const addSetting = (cb: (setting: Setting) => void) => {
			if (this.isSettingGroupAvailable() && group instanceof SettingGroup) {
				group.addSetting(cb);
			} else {
				cb(new Setting(container));
			}
		};

		// Access Token
		addSetting(setting =>
			setting.setName('访问令牌')
				.setDesc('Microsoft Graph API 访问令牌（通过 OAuth 获取）')
				.addText(text => text
					.setPlaceholder('EwBgA8l6BAAU...')
					.setValue(syncConfig.api?.accessToken || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							api: { ...syncConfig.api, accessToken: value }
						});
					}))
		);

		// Refresh Token (可选)
		addSetting(setting =>
			setting.setName('刷新令牌 (可选)')
				.setDesc('用于自动刷新访问令牌')
				.addText(text => text
					.setPlaceholder('M.R3_BAY...')
					.setValue(syncConfig.api?.refreshToken || '')
					.onChange(async (value: string) => {
						this.updateSyncConfig({
							api: { ...syncConfig.api, refreshToken: value }
						});
					}))
		);

		// OAuth 授权提示
		addSetting(setting =>
			setting.setName('获取授权')
				.setDesc('首次使用需要通过 OAuth 授权，点击下方按钮开始')
				.addButton(button => button
					.setButtonText('打开授权页面')
					.setWarning()
					.onClick(() => {
						this.openOAuthPage();
					}))
		);
	}

	/**
	 * 获取同步配置
	 */
	private getSyncConfiguration(): any {
		if (!this.plugin.settings.syncConfiguration) {
			this.plugin.settings.syncConfiguration = {
				enabledSources: {},
				syncDirection: 'bidirectional',
				syncInterval: 30,
				conflictResolution: 'local-win',
			};
		}
		return this.plugin.settings.syncConfiguration;
	}

	/**
	 * 更新同步配置
	 */
	private updateSyncConfig(updates: any): void {
		const currentConfig = this.getSyncConfiguration();

		this.plugin.settings.syncConfiguration = {
			...currentConfig,
			...updates,
			enabledSources: {
				...currentConfig.enabledSources,
				...(updates.enabledSources || {}),
			},
			api: updates.api !== undefined ? {
				...currentConfig.api,
				...updates.api,
			} : currentConfig.api,
			caldav: updates.caldav !== undefined ? {
				...currentConfig.caldav,
				...updates.caldav,
			} : currentConfig.caldav,
		};
	}

	/**
	 * 手动同步
	 */
	private async runManualSync(): Promise<void> {
		new Notice('开始同步...');

		try {
			// 调用插件的同步方法
			if ((this.plugin as any).syncManager) {
				const result = await (this.plugin as any).syncManager.sync();

				if (result.success) {
					new Notice(`同步完成！新建: ${result.stats.created}, 更新: ${result.stats.updated}`);

					if (result.conflicts && result.conflicts.length > 0) {
						new Notice(`检测到 ${result.conflicts.length} 个冲突需要手动处理`);
					}
				} else {
					new Notice('同步失败，请查看控制台日志');
				}
			} else {
				new Notice('同步功能未初始化');
			}
		} catch (error) {
			new Notice(`同步出错: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * 测试连接
	 */
	private async testConnection(): Promise<void> {
		new Notice('正在测试连接...');

		try {
			// 这里需要调用实际的数据源测试方法
			// 暂时只做基本验证
			const config = this.getSyncConfiguration();

			if (config.enabledSources?.api) {
				const provider = config.api?.provider;

				if (provider === 'feishu') {
					if (!config.api?.appId || !config.api?.appSecret) {
						new Notice('请先配置 App ID 和 App Secret');
						return;
					}
					new Notice('飞书连接测试功能开发中...');
				} else if (provider === 'microsoft-todo') {
					if (!config.api?.accessToken) {
						new Notice('请先配置访问令牌');
						return;
					}
					new Notice('Microsoft To Do 连接测试功能开发中...');
				}
			} else {
				new Notice('请先启用同步功能');
			}
		} catch (error) {
			new Notice(`连接测试失败: ${error instanceof Error ? error.message : String(error)}`);
		}
	}

	/**
	 * 打开 OAuth 授权页面
	 */
	private openOAuthPage(): void {
		// Microsoft To Do OAuth URL
		const clientId = 'YOUR_CLIENT_ID'; // 需要替换为实际的 Client ID
		const redirectUri = encodeURIComponent('obsidian://callback');
		const scopes = ['Tasks.ReadWrite', 'User.Read'].join(' ');
		const authUrl = `https://login.microsoftonline.com/common/oauth2/v2.0/authorize?client_id=${clientId}&response_type=code&redirect_uri=${redirectUri}&scope=${encodeURIComponent(scopes)}`;

		window.open(authUrl, '_blank');
		new Notice('请在浏览器中完成授权，然后将访问令牌粘贴回设置页面');
	}
}
