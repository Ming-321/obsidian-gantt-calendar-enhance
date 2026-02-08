/**
 * GitHub 同步一键初始化向导
 *
 * 引导用户完成：
 * 1. 输入 GitHub Personal Access Token
 * 2. 指定仓库名
 * 3. 自动创建仓库（若不存在）
 * 4. 推送 tasks.json + Action 脚本 + 工作流
 * 5. 引导配置 GitHub Secrets
 */

import { App, Modal, Notice, Setting } from 'obsidian';
import type GanttCalendarPlugin from '../../main';
import { GitHubSyncService } from '../services/GitHubSyncService';
import {
	WORKFLOW_TEMPLATE,
	EMAIL_SCRIPT_TEMPLATE,
	DEFAULT_REMINDER_SCHEDULE,
	DEFAULT_TIMEZONE,
} from '../services/githubTemplates';
import { Logger } from '../utils/logger';

export class GitHubSetupWizard extends Modal {
	private plugin: GanttCalendarPlugin;

	// 表单状态
	private token = '';
	private repoName = 'obsidian-task-data';
	private owner = '';

	// UI 元素
	private statusEl: HTMLElement;
	private stepContainer: HTMLElement;
	private currentStep = 1;

	constructor(app: App, plugin: GanttCalendarPlugin) {
		super(app);
		this.plugin = plugin;

		// 从现有设置恢复
		const cfg = plugin.settings.githubSync;
		if (cfg) {
			this.token = cfg.token || '';
			this.repoName = cfg.repo || 'obsidian-task-data';
			this.owner = cfg.owner || '';
		}
	}

	onOpen(): void {
		const { contentEl } = this;
		contentEl.empty();
		contentEl.addClass('gc-github-wizard');

		// 标题
		contentEl.createEl('h2', { text: '🔗 GitHub 同步设置向导' });
		contentEl.createEl('p', {
			text: '将任务数据同步到 GitHub 私有仓库，并通过 GitHub Action 发送邮件提醒。',
			cls: 'setting-item-description'
		});

		this.stepContainer = contentEl.createDiv('gc-wizard-steps');
		this.statusEl = contentEl.createDiv('gc-wizard-status');

		this.renderStep1();
	}

	onClose(): void {
		this.contentEl.empty();
	}

	// ==================== 步骤 1: Token 和仓库名 ====================

	private renderStep1(): void {
		this.stepContainer.empty();
		this.currentStep = 1;

		const stepDiv = this.stepContainer.createDiv();
		stepDiv.createEl('h3', { text: '步骤 1/3 — 配置 GitHub 访问' });

		// Token 输入
		new Setting(stepDiv)
			.setName('GitHub Personal Access Token')
			.setDesc('需要 repo 权限。创建: Settings → Developer settings → Personal access tokens → Fine-grained tokens')
			.addText(text => {
				text
					.setPlaceholder('ghp_xxxxxxxxxxxx')
					.setValue(this.token)
					.onChange(v => this.token = v.trim());
				text.inputEl.type = 'password';
				text.inputEl.style.width = '300px';
			});

		// 仓库名
		new Setting(stepDiv)
			.setName('仓库名称')
			.setDesc('将自动创建为私有仓库（若不存在）')
			.addText(text => {
				text
					.setPlaceholder('obsidian-task-data')
					.setValue(this.repoName)
					.onChange(v => this.repoName = v.trim());
				text.inputEl.style.width = '300px';
			});

		// 按钮
		const btnRow = stepDiv.createDiv('gc-wizard-buttons');
		btnRow.style.display = 'flex';
		btnRow.style.justifyContent = 'flex-end';
		btnRow.style.gap = '8px';
		btnRow.style.marginTop = '16px';

		const cancelBtn = btnRow.createEl('button', { text: '取消' });
		cancelBtn.addEventListener('click', () => this.close());

		const nextBtn = btnRow.createEl('button', { text: '验证并继续 →', cls: 'mod-cta' });
		nextBtn.addEventListener('click', () => this.validateAndProceed());
	}

	private async validateAndProceed(): Promise<void> {
		if (!this.token) {
			new Notice('请输入 GitHub Token');
			return;
		}
		if (!this.repoName) {
			new Notice('请输入仓库名称');
			return;
		}

		this.showStatus('⏳ 验证 Token...');

		try {
			const syncService = new GitHubSyncService();
			syncService.configure({ token: this.token, owner: '', repo: this.repoName });

			// 获取用户名验证 Token
			const tempService = new GitHubSyncService();
			tempService.configure({ token: this.token, owner: 'temp', repo: 'temp' });
			this.owner = await tempService.getCurrentUser();

			this.showStatus(`✅ Token 有效，用户: ${this.owner}`);

			// 短暂延迟后进入下一步
			setTimeout(() => this.renderStep2(), 800);
		} catch (error) {
			this.showStatus(`❌ Token 验证失败: ${(error as Error).message}`, true);
		}
	}

	// ==================== 步骤 2: 创建仓库和推送文件 ====================

	private renderStep2(): void {
		this.stepContainer.empty();
		this.currentStep = 2;

		const stepDiv = this.stepContainer.createDiv();
		stepDiv.createEl('h3', { text: '步骤 2/3 — 初始化仓库' });

		const infoDiv = stepDiv.createDiv();
		infoDiv.style.padding = '12px';
		infoDiv.style.backgroundColor = 'var(--background-secondary)';
		infoDiv.style.borderRadius = '8px';
		infoDiv.style.marginBottom = '16px';

		infoDiv.createEl('p', { text: `用户: ${this.owner}` });
		infoDiv.createEl('p', { text: `仓库: ${this.owner}/${this.repoName} (私有)` });
		infoDiv.createEl('p', { text: '将执行以下操作：' });

		const list = infoDiv.createEl('ul');
		list.createEl('li', { text: '创建私有仓库（若不存在）' });
		list.createEl('li', { text: '推送 tasks.json（当前任务数据）' });
		list.createEl('li', { text: '推送 scripts/generate-email.js（邮件脚本）' });
		list.createEl('li', { text: '推送 .github/workflows/task-reminder.yml（定时工作流）' });

		const btnRow = stepDiv.createDiv('gc-wizard-buttons');
		btnRow.style.display = 'flex';
		btnRow.style.justifyContent = 'flex-end';
		btnRow.style.gap = '8px';
		btnRow.style.marginTop = '16px';

		const backBtn = btnRow.createEl('button', { text: '← 上一步' });
		backBtn.addEventListener('click', () => this.renderStep1());

		const initBtn = btnRow.createEl('button', { text: '🚀 开始初始化', cls: 'mod-cta' });
		initBtn.addEventListener('click', () => this.initializeRepo());
	}

	private async initializeRepo(): Promise<void> {
		const syncService = new GitHubSyncService();
		syncService.configure({
			token: this.token,
			owner: this.owner,
			repo: this.repoName,
		});

		try {
			// 1. 检查/创建仓库
			this.showStatus('⏳ 检查仓库...');
			const exists = await syncService.checkRepoExists();

			if (!exists) {
				this.showStatus('⏳ 创建私有仓库...');
				await syncService.createRepo('Obsidian Gantt Calendar 任务数据同步仓库');
				// 等待仓库初始化完成
				await new Promise(r => setTimeout(r, 2000));
			} else {
				this.showStatus('✅ 仓库已存在');
			}

			// 2. 准备任务数据
			this.showStatus('⏳ 推送文件...');
			const tasksJson = await this.getTasksJsonContent();

			// 3. 推送所有文件
			await syncService.pushMultipleFiles([
				{
					path: 'tasks.json',
					content: tasksJson,
					message: 'init: add tasks.json',
				},
				{
					path: 'scripts/generate-email.js',
					content: EMAIL_SCRIPT_TEMPLATE,
					message: 'init: add email generation script',
				},
				{
					path: '.github/workflows/task-reminder.yml',
					content: WORKFLOW_TEMPLATE,
					message: 'init: add task reminder workflow',
				},
			]);

			// 4. 保存配置
			this.plugin.settings.githubSync = {
				enabled: true,
				token: this.token,
				owner: this.owner,
				repo: this.repoName,
				lastSyncTime: new Date().toISOString(),
				lastSyncStatus: 'success',
				reminderSchedule: { ...DEFAULT_REMINDER_SCHEDULE },
				timezone: DEFAULT_TIMEZONE,
			};
			await this.plugin.saveSettings();

			this.showStatus('✅ 仓库初始化完成！');
			new Notice('GitHub 仓库初始化成功！');

			// 进入步骤 3
			setTimeout(() => this.renderStep3(), 1000);

		} catch (error) {
			const msg = (error as Error).message || '未知错误';
			Logger.error('GitHubSetupWizard', 'Init failed', error);
			this.showStatus(`❌ 初始化失败: ${msg}`, true);
		}
	}

	// ==================== 步骤 3: Secrets 配置引导 ====================

	private renderStep3(): void {
		this.stepContainer.empty();
		this.currentStep = 3;

		const stepDiv = this.stepContainer.createDiv();
		stepDiv.createEl('h3', { text: '步骤 3/3 — 配置邮件 Secrets' });

		const descDiv = stepDiv.createDiv();
		descDiv.style.marginBottom = '16px';
		descDiv.createEl('p', {
			text: '请在 GitHub 仓库中添加以下 Secrets，邮件提醒功能才能正常工作：'
		});

		const secretsUrl = `https://github.com/${this.owner}/${this.repoName}/settings/secrets/actions`;

		// Secrets 列表
		const tableDiv = stepDiv.createDiv();
		tableDiv.style.padding = '12px';
		tableDiv.style.backgroundColor = 'var(--background-secondary)';
		tableDiv.style.borderRadius = '8px';
		tableDiv.style.fontFamily = 'var(--font-monospace)';
		tableDiv.style.fontSize = 'var(--font-ui-small)';
		tableDiv.style.lineHeight = '1.8';

		const secrets = [
			{ name: 'EMAIL_TO', desc: '接收邮箱地址（如 your@email.com）' },
			{ name: 'SMTP_HOST', desc: 'SMTP 服务器（如 smtp.qq.com / smtp.gmail.com）' },
			{ name: 'SMTP_PORT', desc: 'SMTP 端口（默认 465）' },
			{ name: 'SMTP_USER', desc: 'SMTP 用户名（通常是邮箱地址）' },
			{ name: 'SMTP_PASS', desc: 'SMTP 密码 / 授权码' },
		];

		secrets.forEach(s => {
			const row = tableDiv.createDiv();
			row.style.borderBottom = '1px solid var(--background-modifier-border)';
			row.style.padding = '6px 0';
			row.innerHTML = `<strong>${s.name}</strong> — <span style="color: var(--text-muted)">${s.desc}</span>`;
		});

		// 链接按钮
		const linkDiv = stepDiv.createDiv();
		linkDiv.style.marginTop = '16px';

		new Setting(linkDiv)
			.setName('打开 Secrets 设置页面')
			.setDesc(secretsUrl)
			.addButton(btn => {
				btn.setButtonText('🔗 打开 GitHub Secrets')
					.setCta()
					.onClick(() => {
						window.open(secretsUrl);
					});
			});

		// 完成按钮
		const btnRow = stepDiv.createDiv('gc-wizard-buttons');
		btnRow.style.display = 'flex';
		btnRow.style.justifyContent = 'flex-end';
		btnRow.style.gap = '8px';
		btnRow.style.marginTop = '16px';

		const doneBtn = btnRow.createEl('button', { text: '✅ 完成设置', cls: 'mod-cta' });
		doneBtn.addEventListener('click', () => {
			new Notice('GitHub 同步已启用！任务变更后会自动推送。');
			this.close();
		});
	}

	// ==================== 工具方法 ====================

	private showStatus(message: string, isError = false): void {
		this.statusEl.empty();
		const el = this.statusEl.createEl('p', { text: message });
		el.style.padding = '8px 12px';
		el.style.borderRadius = '6px';
		el.style.marginTop = '12px';

		if (isError) {
			el.style.backgroundColor = 'rgba(var(--color-red-rgb, 233, 30, 99), 0.1)';
			el.style.color = 'var(--text-error)';
		} else {
			el.style.backgroundColor = 'var(--background-secondary)';
			el.style.color = 'var(--text-normal)';
		}
	}

	private async getTasksJsonContent(): Promise<string> {
		try {
			const jsonSource = this.plugin.taskCache.getJsonDataSource();
			if (jsonSource) {
				return await jsonSource.getJsonContent();
			}
		} catch {
			// fallback
		}

		// 默认空数据
		return JSON.stringify({
			version: 1,
			tasks: [],
			archive: [],
			lastSync: new Date().toISOString(),
		}, null, 2);
	}
}
