/**
 * @deprecated This module is no longer used.
 * Task parsing from Markdown files has been replaced by JsonDataSource.
 */

import { TFile, ListItemCache } from 'obsidian';
import type { GCTask } from '../../types';

/**
 * @deprecated Stub - no longer parses Markdown tasks.
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

/**
 * @deprecated Stub
 */
export function parseTasksFromFile(
	_file: TFile,
	_content: string,
	_enabledFormats?: string[],
	_globalTaskFilter?: string
): GCTask[] {
	return [];
}

/**
 * @deprecated Stub
 */
export function parseTasksFromLines(
	_lines: string[],
	_filePath?: string,
	_enabledFormats?: string[],
	_globalTaskFilter?: string
): GCTask[] {
	return [];
}

/**
 * @deprecated Stub
 */
export function parseSingleTaskLine(
	_line: string,
	_lineNumber?: number,
	_filePath?: string,
	_enabledFormats?: string[],
	_globalTaskFilter?: string
): GCTask | null {
	return null;
}
