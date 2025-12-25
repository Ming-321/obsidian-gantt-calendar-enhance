import { App, TFile } from 'obsidian';
import { GanttTask } from '../types';
import { serializeTask, TaskUpdates } from './taskSerializer';

/**
 * 格式化日期为 YYYY-MM-DD
 */
function formatDate(date: Date, format: string): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');

	return format.replace('YYYY', String(year))
		.replace('MM', month)
		.replace('DD', day);
}

/**
 * 在任务行中修改单个日期字段（辅助函数）
 * @param taskLine 原始任务行
 * @param dateFieldName 日期字段名 (dueDate, startDate 等)
 * @param newDate 新日期值 (null 表示移除该字段)
 * @param format 格式 ('dataview' | 'tasks')
 * @returns 修改后的任务行
 */
function modifyDateInLine(
	taskLine: string,
	dateFieldName: string,
	newDate: Date | null,
	format: 'dataview' | 'tasks'
): string {
	const fieldMap: Record<string, string> = {
		dueDate: 'due',
		startDate: 'start',
		scheduledDate: 'scheduled',
		createdDate: 'created',
		cancelledDate: 'cancelled',
		completionDate: 'completion',
	};
	const emojiMap: Record<string, string> = {
		dueDate: '📅',
		startDate: '🛫',
		scheduledDate: '⏳',
		createdDate: '➕',
		cancelledDate: '❌',
		completionDate: '✅',
	};

	if (format === 'dataview') {
		const fieldKey = fieldMap[dateFieldName];
		if (!fieldKey) return taskLine;

		if (newDate !== null) {
			// 原地替换日期值，保持字段位置
			const dateStr = formatDate(newDate, 'YYYY-MM-DD');
			const re = new RegExp(`(\\[${fieldKey}::\\s*)\\d{4}-\\d{2}-\\d{2}(\\s*\\])`, 'g');
			taskLine = taskLine.replace(re, `$1${dateStr}$2`);
		} else {
			// 移除字段时清理前面的空格
			const re = new RegExp(`\\s*\\[${fieldKey}::\\s*[^\\]]+\\]`, 'g');
			taskLine = taskLine.replace(re, '');
			// 清理多余空格
			taskLine = taskLine.replace(/\s{2,}/g, ' ').trim();
		}
	} else {
		// Tasks 格式
		const emoji = emojiMap[dateFieldName];
		if (!emoji) return taskLine;

		if (newDate !== null) {
			// 原地替换日期值，保持字段位置
			const dateStr = formatDate(newDate, 'YYYY-MM-DD');
			const re = new RegExp(`(${emoji}\\s*)\\d{4}-\\d{2}-\\d{2}`, 'g');
			taskLine = taskLine.replace(re, `$1${dateStr}`);
		} else {
			// 移除字段时清理前面的空格
			const re = new RegExp(`\\s*${emoji}\\s*\\d{4}-\\d{2}-\\d{2}`, 'g');
			taskLine = taskLine.replace(re, '');
			// 清理多余空格
			taskLine = taskLine.replace(/\s{2,}/g, ' ').trim();
		}
	}

	return taskLine;
}

/**
 * 确定任务使用的格式
 */
function determineTaskFormat(
	task: GanttTask,
	taskLine: string,
	enabledFormats: string[]
): 'dataview' | 'tasks' {
	// 优先使用任务本身的格式
	let formatToUse: 'dataview' | 'tasks' | undefined = task.format;
	if (!formatToUse) {
		if (/\[(priority|created|start|scheduled|due|cancelled|completion)::\s*[^\]]+\]/.test(taskLine)) {
			formatToUse = 'dataview';
		} else if (/([➕🛫⏳📅❌✅])\s*\d{4}-\d{2}-\d{2}/.test(taskLine)) {
			formatToUse = 'tasks';
		} else if (enabledFormats.includes('dataview') && enabledFormats.includes('tasks')) {
			// 两者都支持时：如果行中已有方括号则 dataview，否则 tasks
			formatToUse = taskLine.includes('[') ? 'dataview' : 'tasks';
		} else if (enabledFormats.includes('dataview')) {
			formatToUse = 'dataview';
		} else {
			formatToUse = 'tasks';
		}
	}
	return formatToUse;
}

/**
 * 读取任务行并返回文件内容和行索引
 */
async function readTaskLine(app: App, task: GanttTask): Promise<{ file: TFile; content: string; lines: string[]; taskLineIndex: number }> {
	const file = app.vault.getAbstractFileByPath(task.filePath);
	if (!(file instanceof TFile)) {
		throw new Error(`File not found: ${task.filePath}`);
	}

	const content = await app.vault.read(file);
	const lines = content.split('\n');

	// 获取任务行的索引（lineNumber 是 1-based）
	const taskLineIndex = task.lineNumber - 1;
	if (taskLineIndex < 0 || taskLineIndex >= lines.length) {
		throw new Error(`Invalid line number: ${task.lineNumber}`);
	}

	return { file, content, lines, taskLineIndex };
}

/**
 * 更新任务的完成状态
 * @param app Obsidian App 实例
 * @param task 要更新的任务
 * @param completed 是否完成
 * @param enabledFormats 启用的任务格式
 */
export async function updateTaskCompletion(
	app: App,
	task: GanttTask,
	completed: boolean,
	enabledFormats: string[]
): Promise<void> {
	const updates: TaskUpdates = { completed };

	// 标记为完成时添加完成日期，取消完成时移除完成日期
	if (completed) {
		updates.completionDate = new Date();
	} else {
		updates.completionDate = null;
	}

	await updateTaskProperties(app, task, updates, enabledFormats);
}

/**
 * 更新任务的日期字段（由日期筛选字段指定）
 * @param app Obsidian App
 * @param task 任务对象
 * @param dateFieldName 日期字段名（dueDate, startDate, scheduledDate, createdDate, cancelledDate, completionDate）
 * @param newDate 新的日期值
 * @param enabledFormats 启用的任务格式
 */
export async function updateTaskDateField(
	app: App,
	task: GanttTask,
	dateFieldName: string,
	newDate: Date,
	enabledFormats: string[]
): Promise<void> {
	const updates: TaskUpdates = {
		[dateFieldName]: newDate
	};

	await updateTaskProperties(app, task, updates, enabledFormats);
}

/**
 * 批量更新任务属性（优先级、完成状态、各日期字段）
 * 未提供的字段不做更改；传入 null 的日期字段表示清除该字段。
 */
export async function updateTaskProperties(
	app: App,
	task: GanttTask,
	updates: TaskUpdates,
	enabledFormats: string[]
): Promise<void> {
	const { file, lines, taskLineIndex } = await readTaskLine(app, task);
	const taskLine = lines[taskLineIndex];

	// 确定任务格式
	const formatToUse = determineTaskFormat(task, taskLine, enabledFormats);

	// 提取列表标记和缩进（保留 "- " 或 "* " 等列表前缀）
	const listMatch = taskLine.match(/^(\s*)([-*])\s+\[[ xX]\]\s*/);
	if (!listMatch) {
		throw new Error('Invalid task format: cannot find list marker');
	}

	const indent = listMatch[1];  // 缩进
	const listMarker = listMatch[2];  // 列表标记 (- 或 *)

	// 使用新的序列化函数重建任务行（只返回任务内容部分，不包含列表标记）
	// 序列化函数会直接从插件设置中获取全局过滤器
	const taskContent = serializeTask(
		app,
		task,
		updates,
		formatToUse
	);

	// 拼接完整的任务行：缩进 + 列表标记 + 空格 + 任务内容
	const finalTaskLine = `${indent}${listMarker} ${taskContent}`;

	// 写回文件
	lines[taskLineIndex] = finalTaskLine;
	const newContent = lines.join('\n');
	await app.vault.modify(file, newContent);
}
