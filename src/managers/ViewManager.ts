/**
 * 视图管理器
 *
 * 负责视图激活和刷新
 */

import type { App } from 'obsidian';
import { GC_VIEW_ID } from '../GCMainView';

/**
 * 视图管理器
 */
export class ViewManager {
	private app: App;

	constructor(app: App) {
		this.app = app;
	}

	/**
	 * 激活日历视图
	 */
	async activateView(): Promise<void> {
		let leaf = this.app.workspace.getLeavesOfType(GC_VIEW_ID)[0];
		if (!leaf) {
			// Create new leaf in main area
			leaf = this.app.workspace.getLeaf('tab');
			await leaf.setViewState({
				type: GC_VIEW_ID,
				active: true,
			});
		}

		this.app.workspace.revealLeaf(leaf);
	}

	/**
	 * 刷新所有视图
	 */
	refreshAllViews(): void {
		const leaves = this.app.workspace.getLeavesOfType(GC_VIEW_ID);
		leaves.forEach(leaf => {
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const view = leaf.view as any;
			if (view && view.refreshSettings) {
				view.refreshSettings();
			}
		});
	}
}
