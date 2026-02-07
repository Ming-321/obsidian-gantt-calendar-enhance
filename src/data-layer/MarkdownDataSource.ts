/**
 * @deprecated MarkdownDataSource is no longer used.
 * The plugin now uses JsonDataSource for task storage.
 * This file is kept as a stub to avoid import errors from any
 * remaining references.
 */

import { App } from 'obsidian';
import type { GCTask } from '../types';
import {
	DataSourceConfig,
	TaskChanges
} from './types';
import { IDataSource, ChangeEventHandler } from './IDataSource';

/**
 * @deprecated Markdown data source - stub implementation
 */
export class MarkdownDataSource implements IDataSource {
	readonly sourceId = 'markdown';
	readonly sourceName = 'Markdown Files';
	readonly isReadOnly = false;

	constructor(_app: App, _eventBus: any, _config: DataSourceConfig) {}

	async initialize(_config: DataSourceConfig): Promise<void> {}

	async getTasks(): Promise<GCTask[]> {
		return [];
	}

	onChange(_handler: ChangeEventHandler): void {}

	async createTask(_task: GCTask): Promise<string> {
		throw new Error('MarkdownDataSource is deprecated');
	}

	async updateTask(_taskId: string, _changes: TaskChanges): Promise<void> {
		throw new Error('MarkdownDataSource is deprecated');
	}

	async deleteTask(_taskId: string): Promise<void> {
		throw new Error('MarkdownDataSource is deprecated');
	}

	async getSyncStatus(): Promise<{
		lastSyncAt?: Date;
		syncDirection: 'bidirectional' | 'import-only' | 'export-only';
		conflictResolution: 'local-win' | 'remote-win' | 'manual';
	}> {
		return {
			syncDirection: 'import-only',
			conflictResolution: 'local-win'
		};
	}

	destroy(): void {}
}
