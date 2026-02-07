/**
 * GitHub 同步 & 邮件提醒设置区域
 */

import { Setting, Notice } from 'obsidian';
import type { BuilderConfig } from '../types';
import { GitHubSetupWizard } from '../../modals/GitHubSetupWizard';

export class GitHubSyncSettingsBuilder {
	private config: BuilderConfig;

	constructor(config: BuilderConfig) {
		this.config = config;
	}

	render(): void {
		const { containerEl, plugin } = this.config;

		containerEl.createEl('h2', { text: '🔗 GitHub 同步 & 邮件提醒' });

		const cfg = plugin.settings.githubSync;
		const isConfigured = !!(cfg?.enabled && cfg?.token && cfg?.owner && cfg?.repo);

		// 状态显示
		if (isConfigured) {
			const statusDiv = containerEl.createDiv();
			statusDiv.style.padding = '12px';
			statusDiv.style.backgroundColor = 'var(--background-secondary)';
			statusDiv.style.borderRadius = '8px';
			statusDiv.style.marginBottom = '16px';

			const statusIcon = cfg!.lastSyncStatus === 'error' ? '⚠️' : '✅';
			const statusText = cfg!.lastSyncStatus === 'error'
				? `同步错误: ${cfg!.lastSyncError || '未知'}`
				: '同步正常';

			statusDiv.createEl('p', {
				text: `${statusIcon} 仓库: ${cfg!.owner}/${cfg!.repo} — ${statusText}`
			});

			if (cfg!.lastSyncTime) {
				const time = new Date(cfg!.lastSyncTime);
				statusDiv.createEl('p', {
					text: `🕐 上次同步: ${time.toLocaleString()}`,
					cls: 'setting-item-description'
				});
			}
		}

		// 一键设置向导
		new Setting(containerEl)
			.setName('设置向导')
			.setDesc(isConfigured
				? '重新配置 GitHub 同步（将覆盖现有配置）'
				: '一键配置 GitHub 同步和邮件提醒')
			.addButton(btn => {
				btn.setButtonText(isConfigured ? '🔧 重新配置' : '🚀 开始设置')
					.setCta()
					.onClick(() => {
						new GitHubSetupWizard(plugin.app, plugin).open();
					});
			});

		// 启用/禁用开关（仅在已配置时显示）
		if (isConfigured) {
			new Setting(containerEl)
				.setName('启用自动同步')
				.setDesc('任务变更后自动推送到 GitHub（30秒防抖）')
				.addToggle(toggle => {
					toggle.setValue(cfg!.enabled)
						.onChange(async (value) => {
							plugin.settings.githubSync!.enabled = value;
							await plugin.saveSettings();

							if (value) {
								// 重新启用同步
								plugin.taskCache.configureGitHubSync(
									{ token: cfg!.token, owner: cfg!.owner, repo: cfg!.repo },
									(time) => {
										plugin.settings.githubSync!.lastSyncTime = time;
										plugin.settings.githubSync!.lastSyncStatus = 'success';
										plugin.saveSettings();
									},
									(error) => {
										plugin.settings.githubSync!.lastSyncStatus = 'error';
										plugin.settings.githubSync!.lastSyncError = error;
										plugin.saveSettings();
									}
								);
								new Notice('GitHub 同步已启用');
							} else {
								plugin.taskCache.disableGitHubSync();
								new Notice('GitHub 同步已禁用');
							}
						});
				});

			// 手动同步按钮
			new Setting(containerEl)
				.setName('手动同步')
				.setDesc('立即推送当前任务数据到 GitHub')
				.addButton(btn => {
					btn.setButtonText('📤 立即推送')
						.onClick(async () => {
							try {
								btn.setDisabled(true);
								btn.setButtonText('推送中...');
								await plugin.taskCache.pushToGitHubNow();
								new Notice('推送成功！');
								btn.setButtonText('✅ 推送成功');
								setTimeout(() => {
									btn.setButtonText('📤 立即推送');
									btn.setDisabled(false);
								}, 2000);
							} catch (error) {
								new Notice('推送失败: ' + (error as Error).message);
								btn.setButtonText('❌ 推送失败');
								setTimeout(() => {
									btn.setButtonText('📤 立即推送');
									btn.setDisabled(false);
								}, 2000);
							}
						});
				});

			// GitHub Secrets 链接
			new Setting(containerEl)
				.setName('邮件 Secrets 配置')
				.setDesc(`在 GitHub 仓库中配置 SMTP 信息才能收到邮件提醒`)
				.addButton(btn => {
					btn.setButtonText('🔗 打开 Secrets 页面')
						.onClick(() => {
							window.open(`https://github.com/${cfg!.owner}/${cfg!.repo}/settings/secrets/actions`);
						});
				});

			// 清除配置
			new Setting(containerEl)
				.setName('清除配置')
				.setDesc('移除 GitHub 同步配置（不会删除远端仓库）')
				.addButton(btn => {
					btn.setButtonText('🗑️ 清除')
						.setWarning()
						.onClick(async () => {
							plugin.taskCache.disableGitHubSync();
							plugin.settings.githubSync = undefined;
							await plugin.saveSettings();
							new Notice('GitHub 同步配置已清除');
							// 刷新设置页面
							this.config.onRefreshSettings?.();
						});
				});
		}
	}
}
