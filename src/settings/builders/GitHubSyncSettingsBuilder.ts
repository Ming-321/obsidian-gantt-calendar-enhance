/**
 * GitHub 同步 & 邮件提醒设置区域
 */

import { Setting, Notice } from 'obsidian';
import type { BuilderConfig } from '../types';
import { GitHubSetupWizard } from '../../modals/GitHubSetupWizard';
import { GitHubSyncService } from '../../services/GitHubSyncService';
import {
	generateWorkflowTemplate,
	EMAIL_SCRIPT_TEMPLATE,
	DEFAULT_REMINDER_SCHEDULE,
	DEFAULT_TIMEZONE,
	type ReminderScheduleConfig,
} from '../../services/githubTemplates';

export class GitHubSyncSettingsBuilder {
	private config: BuilderConfig;

	constructor(config: BuilderConfig) {
		this.config = config;
	}

	/**
	 * 验证时间格式 HH:mm
	 */
	private isValidTime(time: string): boolean {
		const match = time.match(/^(\d{1,2}):(\d{2})$/);
		if (!match) return false;
		const h = parseInt(match[1]), m = parseInt(match[2]);
		return h >= 0 && h <= 23 && m >= 0 && m <= 59;
	}

	/**
	 * 渲染提醒时间配置区域
	 */
	private renderReminderScheduleSettings(
		containerEl: HTMLElement,
		cfg: NonNullable<typeof this.config.plugin.settings.githubSync>,
	): void {
		const { plugin } = this.config;

		containerEl.createEl('h3', { text: '📬 邮件提醒时间' });

		// 确保有默认值
		if (!cfg.reminderSchedule) {
			cfg.reminderSchedule = { ...DEFAULT_REMINDER_SCHEDULE };
		}
		if (cfg.timezone === undefined) {
			cfg.timezone = DEFAULT_TIMEZONE;
		}

		const schedule = cfg.reminderSchedule;
		const slots: { key: keyof ReminderScheduleConfig; label: string }[] = [
			{ key: 'morning', label: '早上提醒' },
			{ key: 'noon',    label: '中午提醒' },
			{ key: 'evening', label: '晚上提醒' },
		];

		// 时区设置
		new Setting(containerEl)
			.setName('时区')
			.setDesc('用于计算 cron 触发时间（UTC 偏移）')
			.addDropdown(dd => {
				for (let i = -12; i <= 14; i++) {
					const sign = i >= 0 ? '+' : '';
					dd.addOption(String(i), `UTC${sign}${i}`);
				}
				dd.setValue(String(cfg.timezone ?? DEFAULT_TIMEZONE));
				dd.onChange(async (value) => {
					cfg.timezone = parseInt(value);
					await plugin.saveSettings();
				});
			});

		// 三个时间段
		for (const { key, label } of slots) {
			const slot = schedule[key];

			new Setting(containerEl)
				.setName(label)
				.setDesc(`当前: ${slot.time}`)
				.addToggle(toggle => {
					toggle.setValue(slot.enabled)
						.onChange(async (value) => {
							schedule[key].enabled = value;
							await plugin.saveSettings();
						});
				})
				.addText(text => {
					text.setPlaceholder('HH:mm')
						.setValue(slot.time)
						.onChange(async (value) => {
							const trimmed = value.trim();
							if (this.isValidTime(trimmed)) {
								schedule[key].time = trimmed;
								await plugin.saveSettings();
							}
						});
					text.inputEl.style.width = '80px';
					text.inputEl.style.textAlign = 'center';
				});
		}

		// 更新提醒时间按钮
		new Setting(containerEl)
			.setName('更新提醒时间')
			.setDesc('将新的提醒时间推送到 GitHub 工作流')
			.addButton(btn => {
				btn.setButtonText('📤 更新提醒时间')
					.setCta()
					.onClick(async () => {
						// 校验所有已启用时段的时间格式
						for (const { key, label } of slots) {
							if (schedule[key].enabled && !this.isValidTime(schedule[key].time)) {
								new Notice(`${label}的时间格式无效，请使用 HH:mm 格式`);
								return;
							}
						}

						try {
							btn.setDisabled(true);
							btn.setButtonText('推送中...');

							const workflowContent = generateWorkflowTemplate(
								schedule as ReminderScheduleConfig,
								cfg.timezone ?? DEFAULT_TIMEZONE,
							);

							const syncService = new GitHubSyncService();
							syncService.configure({
								token: cfg.token,
								owner: cfg.owner,
								repo: cfg.repo,
							});

							await syncService.pushMultipleFiles([{
								path: '.github/workflows/task-reminder.yml',
								content: workflowContent,
								message: `config: update reminder schedule`,
							}]);

							new Notice('提醒时间已更新！');
							btn.setButtonText('✅ 更新成功');
							setTimeout(() => {
								btn.setButtonText('📤 更新提醒时间');
								btn.setDisabled(false);
							}, 2000);
						} catch (error) {
						new Notice('更新失败: ' + (error as Error).message);
						btn.setButtonText('❌ 更新失败');
						setTimeout(() => {
							btn.setButtonText('📤 更新提醒时间');
							btn.setDisabled(false);
						}, 2000);
					}
				});
		});

		// 更新邮件脚本按钮
		new Setting(containerEl)
			.setName('更新邮件脚本')
			.setDesc('将最新的邮件生成脚本推送到 GitHub（修复 bug 后需执行）')
			.addButton(btn => {
				btn.setButtonText('📤 更新邮件脚本')
					.onClick(async () => {
						try {
							btn.setDisabled(true);
							btn.setButtonText('推送中...');

							const syncService = new GitHubSyncService();
							syncService.configure({
								token: cfg.token,
								owner: cfg.owner,
								repo: cfg.repo,
							});

							await syncService.pushMultipleFiles([{
								path: 'scripts/generate-email.js',
								content: EMAIL_SCRIPT_TEMPLATE,
								message: 'fix: update email script timezone handling',
							}]);

							new Notice('邮件脚本已更新！');
							btn.setButtonText('✅ 更新成功');
							setTimeout(() => {
								btn.setButtonText('📤 更新邮件脚本');
								btn.setDisabled(false);
							}, 2000);
						} catch (error) {
							new Notice('更新失败: ' + (error as Error).message);
							btn.setButtonText('❌ 更新失败');
							setTimeout(() => {
								btn.setButtonText('📤 更新邮件脚本');
								btn.setDisabled(false);
							}, 2000);
						}
					});
			});
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

			// ========== 邮件提醒时间配置 ==========
			this.renderReminderScheduleSettings(containerEl, cfg!);

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
