/**
 * @deprecated This module is no longer used.
 * Task parsing from Markdown files is handled by MarkdownDataSource (also deprecated).
 * The plugin now uses JsonDataSource for task storage.
 */

import { TFile, ListItemCache } from 'obsidian';
import { GCTask } from '../types';

/**
 * @deprecated Stub - no longer parses Markdown.
 */
export function parseTasksFromListItems(
	_file: TFile,
	_lines: string[],
	_listItems: ListItemCache[],
	_enabledFormats?: string[],
	_globalTaskFilter?: string
): GCTask[] {
	return [];
}
