import { App, Plugin, Notice } from 'obsidian';
import { GCMainView, GC_VIEW_ID } from './src/GCMainView';
import { GanttCalendarSettingTab } from './src/settings';
import type { GanttCalendarSettings } from './src/settings/types';
import { TaskStore } from './src/TaskStore';
import { registerAllCommands } from './src/commands/commandsIndex';
import { TooltipManager } from './src/utils/tooltipManager';
import { Logger } from './src/utils/logger';

// 管理器
import { SettingsManager } from './src/managers/SettingsManager';
import { ThemeManager } from './src/managers/ThemeManager';
import { ViewManager } from './src/managers/ViewManager';
import { SyncManagerBridge } from './src/managers/SyncManagerBridge';

export default class GanttCalendarPlugin extends Plugin {
	// 公共属性（保持向后兼容）
	settings: GanttCalendarSettings;
	taskCache: TaskStore;

	// 管理器实例
	private settingsManager: SettingsManager;
	private themeManager: ThemeManager;
	private viewManager: ViewManager;
	private syncManagerBridge: SyncManagerBridge;

	async onload() {
		// 1. 初始化设置管理器
		this.settingsManager = new SettingsManager(this);
		this.settings = await this.settingsManager.loadSettings();

		// 2. 初始化日志
		Logger.init(this);

		// 3. 初始化任务缓存（使用 JSON 数据源）
		this.taskCache = new TaskStore(this.app);
		this.scheduleTaskCacheInit();

		// 3.5 初始化 GitHub 同步（如果已配置）
		this.initGitHubSync();

		// 4. 初始化视图管理器
		this.viewManager = new ViewManager(this.app);

		// 5. 初始化主题管理器（需要在视图管理器之后，因为回调会调用视图刷新）
		this.themeManager = new ThemeManager();
		this.themeManager.initialize(() => this.viewManager?.refreshAllViews());

		// 6. 注册视图
		this.registerView(GC_VIEW_ID, (leaf) => new GCMainView(leaf, this));

		// 7. 添加功能区（ribbon 图标和状态栏）
		this.registerUIElements();

		// 8. 注册命令
		registerAllCommands(this);

		// 9. 添加设置标签
		this.addSettingTab(new GanttCalendarSettingTab(this.app, this));

		// 10. 初始化同步管理器
		this.syncManagerBridge = new SyncManagerBridge(this);
		this.syncManagerBridge.initialize(this.settings.syncConfiguration);
	}

	async onunload() {
		// 按相反顺序清理
		this.syncManagerBridge?.destroy();
		this.themeManager?.destroy();
		// 保存任务数据后清理
		await this.taskCache?.flushSave();
		this.taskCache?.clear();
		TooltipManager.reset();
		this.app.workspace.getLeavesOfType(GC_VIEW_ID).forEach(leaf => leaf.detach());
	}

	// ===== 公共方法（保持向后兼容） =====

	/**
	 * 保存设置
	 * 供设置面板调用，保存后通知相关模块更新
	 */
	async saveSettings(): Promise<void> {
		await this.settingsManager.saveSettings(this.settings);

		// 更新同步管理器配置
		if (this.syncManagerBridge) {
			await this.syncManagerBridge.updateConfiguration(this.settings.syncConfiguration);
		}
	}

	/**
	 * 激活日历视图
	 */
	async activateView(): Promise<void> {
		return this.viewManager.activateView();
	}

	/**
	 * 刷新所有日历视图
	 */
	refreshCalendarViews(): void {
		this.viewManager.refreshAllViews();
	}

	// ===== 私有辅助方法 =====

	/**
	 * 安排任务缓存初始化
	 * 布局就绪后延迟触发，加载 JSON 任务数据
	 */
	private scheduleTaskCacheInit(): void {
		this.app.workspace.onLayoutReady(() => {
			setTimeout(() => {
				this.taskCache.initialize().then(() => {
					Logger.stats('Main', 'Task cache initialized');
					this.refreshCalendarViews();
				}).catch(error => {
					Logger.error('Main', 'Failed to initialize task cache:', error);
					new Notice('任务缓存初始化失败');
				});
			}, 800);
		});
	}

	/**
	 * 初始化 GitHub 同步
	 */
	private initGitHubSync(): void {
		const cfg = this.settings.githubSync;
		if (!cfg?.enabled || !cfg.token || !cfg.owner || !cfg.repo) return;

		this.taskCache.configureGitHubSync(
			{ token: cfg.token, owner: cfg.owner, repo: cfg.repo },
			(time) => {
				// 同步成功回调
				if (this.settings.githubSync) {
					this.settings.githubSync.lastSyncTime = time;
					this.settings.githubSync.lastSyncStatus = 'success';
					this.settings.githubSync.lastSyncError = undefined;
					this.saveSettings();
				}
			},
			(error) => {
				// 同步失败回调
				if (this.settings.githubSync) {
					this.settings.githubSync.lastSyncStatus = 'error';
					this.settings.githubSync.lastSyncError = error;
					this.saveSettings();
				}
			}
		);

		Logger.info('Main', 'GitHub sync initialized', { owner: cfg.owner, repo: cfg.repo });
	}

	/**
	 * 注册 UI 元素（ribbon 图标和状态栏）
	 */
	private registerUIElements(): void {
		// 丝带图标
		const ribbonIconEl = this.addRibbonIcon('calendar-days', '甘特日历', () => {
			this.activateView();
		});
		ribbonIconEl.addClass('gantt-calendar-ribbon');

		// 状态栏项
		const statusBarItemEl = this.addStatusBarItem();
		statusBarItemEl.setText(`${this.manifest.name} v${this.manifest.version}`);
	}
}
