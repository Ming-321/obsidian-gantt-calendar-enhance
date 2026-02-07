/**
 * GitHub 数据同步服务
 *
 * 通过 GitHub Contents API 将 tasks.json 推送到专用私有仓库。
 * 支持防抖推送、离线处理、SHA 冲突检测。
 */

import { Notice, requestUrl } from 'obsidian';
import { Logger } from '../utils/logger';

/** GitHub 同步配置 */
export interface GitHubSyncConfig {
	token: string;
	owner: string;
	repo: string;
}

/** GitHub 文件信息 */
interface GitHubFileInfo {
	sha: string;
	content: string;
}

/** 推送到仓库的文件 */
interface FileToPush {
	path: string;
	content: string;
	message: string;
}

/**
 * GitHub 同步服务
 */
export class GitHubSyncService {
	private config: GitHubSyncConfig | null = null;
	private debounceTimer: ReturnType<typeof setTimeout> | null = null;
	private readonly DEBOUNCE_MS = 30000; // 30秒防抖
	private pendingContent: string | null = null;
	private isSyncing = false;
	private fileSha: string | null = null;

	// 回调
	private onSyncSuccess?: (time: string) => void;
	private onSyncError?: (error: string) => void;

	/**
	 * 配置同步服务
	 */
	configure(config: GitHubSyncConfig): void {
		this.config = config;
		this.fileSha = null; // 重置 SHA 缓存
	}

	/**
	 * 设置回调
	 */
	setCallbacks(onSuccess?: (time: string) => void, onError?: (error: string) => void): void {
		this.onSyncSuccess = onSuccess;
		this.onSyncError = onError;
	}

	/**
	 * 是否已配置
	 */
	isConfigured(): boolean {
		return !!(this.config?.token && this.config?.owner && this.config?.repo);
	}

	/**
	 * 防抖推送 tasks.json
	 */
	schedulePush(tasksJsonContent: string): void {
		if (!this.isConfigured()) return;

		this.pendingContent = tasksJsonContent;

		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
		}

		this.debounceTimer = setTimeout(() => {
			this.executePush();
		}, this.DEBOUNCE_MS);

		Logger.debug('GitHubSync', 'Push scheduled (debounce 30s)');
	}

	/**
	 * 立即推送（不防抖）
	 */
	async pushNow(tasksJsonContent: string): Promise<void> {
		if (!this.isConfigured()) {
			throw new Error('GitHub 同步未配置');
		}

		// 取消防抖
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}

		this.pendingContent = tasksJsonContent;
		await this.executePush();
	}

	/**
	 * 执行推送
	 */
	private async executePush(): Promise<void> {
		if (!this.config || !this.pendingContent) return;
		if (this.isSyncing) {
			// 已在同步中，稍后重试
			Logger.debug('GitHubSync', 'Already syncing, will retry');
			this.schedulePush(this.pendingContent);
			return;
		}

		this.isSyncing = true;
		const content = this.pendingContent;
		this.pendingContent = null;

		try {
			// 获取当前文件 SHA（如果文件存在）
			if (!this.fileSha) {
				try {
					const fileInfo = await this.getFile('tasks.json');
					this.fileSha = fileInfo.sha;
				} catch {
					// 文件不存在，首次创建
					this.fileSha = null;
				}
			}

			// 推送文件
			const result = await this.createOrUpdateFile({
				path: 'tasks.json',
				content,
				message: `sync: update tasks ${new Date().toISOString()}`,
			});

			// 更新缓存的 SHA
			this.fileSha = result.sha;

			const syncTime = new Date().toISOString();
			Logger.info('GitHubSync', 'Push successful', { sha: result.sha });
			this.onSyncSuccess?.(syncTime);

		} catch (error) {
			const errorMsg = (error as Error).message || '未知错误';
			Logger.error('GitHubSync', 'Push failed', error);
			this.onSyncError?.(errorMsg);

			// SHA 冲突：重置 SHA 并重试
			if (errorMsg.includes('409') || errorMsg.includes('conflict')) {
				Logger.warn('GitHubSync', 'SHA conflict detected, retrying...');
				this.fileSha = null;
				this.schedulePush(content);
			}
		} finally {
			this.isSyncing = false;
		}
	}

	/**
	 * 刷新：立即执行待处理的推送
	 */
	async flush(): Promise<void> {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
		if (this.pendingContent) {
			await this.executePush();
		}
	}

	/**
	 * 销毁服务
	 */
	destroy(): void {
		if (this.debounceTimer) {
			clearTimeout(this.debounceTimer);
			this.debounceTimer = null;
		}
	}

	// ==================== GitHub API 方法 ====================

	/**
	 * 获取文件信息
	 */
	private async getFile(path: string): Promise<GitHubFileInfo> {
		const { token, owner, repo } = this.config!;

		const response = await requestUrl({
			url: `https://api.github.com/repos/${owner}/${repo}/contents/${path}`,
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Accept': 'application/vnd.github.v3+json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
		});

		if (response.status !== 200) {
			throw new Error(`GitHub API error: ${response.status}`);
		}

		return {
			sha: response.json.sha,
			content: response.json.content,
		};
	}

	/**
	 * 创建或更新文件
	 */
	private async createOrUpdateFile(file: FileToPush): Promise<{ sha: string }> {
		const { token, owner, repo } = this.config!;

		// Base64 编码内容
		const contentBase64 = btoa(unescape(encodeURIComponent(file.content)));

		const body: any = {
			message: file.message,
			content: contentBase64,
		};

		if (this.fileSha) {
			body.sha = this.fileSha;
		}

		const response = await requestUrl({
			url: `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`,
			method: 'PUT',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Accept': 'application/vnd.github.v3+json',
				'Content-Type': 'application/json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
			body: JSON.stringify(body),
		});

		if (response.status !== 200 && response.status !== 201) {
			throw new Error(`GitHub API error: ${response.status} - ${JSON.stringify(response.json)}`);
		}

		return { sha: response.json.content.sha };
	}

	/**
	 * 检查仓库是否存在
	 */
	async checkRepoExists(): Promise<boolean> {
		if (!this.config) return false;
		const { token, owner, repo } = this.config;

		try {
			const response = await requestUrl({
				url: `https://api.github.com/repos/${owner}/${repo}`,
				method: 'GET',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Accept': 'application/vnd.github.v3+json',
					'X-GitHub-Api-Version': '2022-11-28',
				},
			});
			return response.status === 200;
		} catch {
			return false;
		}
	}

	/**
	 * 创建仓库
	 */
	async createRepo(description?: string): Promise<void> {
		if (!this.config) throw new Error('未配置');
		const { token, repo } = this.config;

		const response = await requestUrl({
			url: 'https://api.github.com/user/repos',
			method: 'POST',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Accept': 'application/vnd.github.v3+json',
				'Content-Type': 'application/json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
			body: JSON.stringify({
				name: repo,
				description: description || 'Task data for Obsidian Gantt Calendar plugin',
				private: true,
				auto_init: true,
			}),
		});

		if (response.status !== 201) {
			throw new Error(`创建仓库失败: ${response.status} - ${JSON.stringify(response.json)}`);
		}
	}

	/**
	 * 推送多个文件（用于初始化仓库内容）
	 */
	async pushMultipleFiles(files: FileToPush[]): Promise<void> {
		for (const file of files) {
			// 获取现有文件的 SHA（如果存在）
			let sha: string | undefined;
			try {
				const info = await this.getFile(file.path);
				sha = info.sha;
			} catch {
				// 文件不存在
			}

			const { token, owner, repo } = this.config!;
			const contentBase64 = btoa(unescape(encodeURIComponent(file.content)));

			const body: any = {
				message: file.message,
				content: contentBase64,
			};
			if (sha) body.sha = sha;

			await requestUrl({
				url: `https://api.github.com/repos/${owner}/${repo}/contents/${file.path}`,
				method: 'PUT',
				headers: {
					'Authorization': `Bearer ${token}`,
					'Accept': 'application/vnd.github.v3+json',
					'Content-Type': 'application/json',
					'X-GitHub-Api-Version': '2022-11-28',
				},
				body: JSON.stringify(body),
			});
		}
	}

	/**
	 * 获取当前用户名（用于验证 Token）
	 */
	async getCurrentUser(): Promise<string> {
		if (!this.config) throw new Error('未配置');
		const { token } = this.config;

		const response = await requestUrl({
			url: 'https://api.github.com/user',
			method: 'GET',
			headers: {
				'Authorization': `Bearer ${token}`,
				'Accept': 'application/vnd.github.v3+json',
				'X-GitHub-Api-Version': '2022-11-28',
			},
		});

		if (response.status !== 200) {
			throw new Error('Token 无效或已过期');
		}

		return response.json.login;
	}
}
