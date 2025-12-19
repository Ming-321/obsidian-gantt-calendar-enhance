import { App, Notice, normalizePath, TFolder } from 'obsidian';
import type { GanttTask } from '../../types';

/**
 * 创建任务同名文件
 * 以任务描述为文件名，创建笔记，存放在默认路径
 */
export async function createNoteFromTask(
	app: App,
	task: GanttTask,
	defaultPath: string
): Promise<void> {
	try {
		// 清理任务描述作为文件名
		const cleanContent = cleanTaskDescription(task.content);
		const fileName = sanitizeFileName(cleanContent);
		
		if (!fileName) {
			new Notice('任务描述为空，无法创建文件');
			return;
		}

		// 确保目标文件夹存在
		await ensureFolderExists(app, defaultPath);

		// 构建文件路径
		const filePath = normalizePath(`${defaultPath}/${fileName}.md`);

		// 检查文件是否已存在
		const existingFile = app.vault.getAbstractFileByPath(filePath);
		if (existingFile) {
			new Notice(`文件已存在: ${fileName}.md`);
			// 打开已存在的文件
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(existingFile as any);
			return;
		}

		// 创建文件内容（可以包含任务的相关信息）
		const fileContent = generateNoteContent(task);

		// 创建文件
		const file = await app.vault.create(filePath, fileContent);
		
		// 打开新创建的文件
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(file);
		
		new Notice(`已创建笔记: ${fileName}.md`);
	} catch (error) {
		console.error('Failed to create note from task:', error);
		new Notice('创建笔记失败');
	}
}

/**
 * 清理任务描述
 */
function cleanTaskDescription(raw: string): string {
	let text = raw;
	// 移除 Tasks emoji 优先级标记
	text = text.replace(/\s*(🔺|⏫|🔼|🔽|⏬)\s*/g, ' ');
	// 移除 Tasks emoji 日期属性
	text = text.replace(/\s*(➕|🛫|⏳|📅|❌|✅)\s*\d{4}-\d{2}-\d{2}\s*/g, ' ');
	// 移除 Dataview [field:: value] 块
	text = text.replace(/\s*\[(priority|created|start|scheduled|due|cancelled|completion)::[^\]]+\]\s*/g, ' ');
	// 折叠多余空格
	text = text.replace(/\s{2,}/g, ' ').trim();
	return text;
}

/**
 * 清理文件名中的非法字符
 */
function sanitizeFileName(name: string): string {
	// 移除或替换文件名中的非法字符
	return name
		.replace(/[\\/:*?"<>|]/g, '-') // 替换非法字符为连字符
		.replace(/\s+/g, ' ') // 折叠多个空格
		.trim()
		.substring(0, 200); // 限制文件名长度
}

/**
 * 确保文件夹存在
 */
async function ensureFolderExists(app: App, folderPath: string): Promise<void> {
	const normalizedPath = normalizePath(folderPath);
	const folder = app.vault.getAbstractFileByPath(normalizedPath);
	
	if (!folder) {
		await app.vault.createFolder(normalizedPath);
	}
}

/**
 * 生成笔记内容
 */
function generateNoteContent(task: GanttTask): string {
	const lines: string[] = [];
	
	lines.push(`# ${cleanTaskDescription(task.content)}`);
	lines.push('');
	lines.push('## 任务信息');
	lines.push('');
	
	if (task.priority) {
		lines.push(`- **优先级**: ${task.priority}`);
	}
	
	if (task.createdDate) {
		lines.push(`- **创建日期**: ${formatDate(task.createdDate)}`);
	}
	
	if (task.startDate) {
		lines.push(`- **开始日期**: ${formatDate(task.startDate)}`);
	}
	
	if (task.scheduledDate) {
		lines.push(`- **计划日期**: ${formatDate(task.scheduledDate)}`);
	}
	
	if (task.dueDate) {
		lines.push(`- **截止日期**: ${formatDate(task.dueDate)}`);
	}
	
	if (task.completionDate) {
		lines.push(`- **完成日期**: ${formatDate(task.completionDate)}`);
	}
	
	if (task.cancelledDate) {
		lines.push(`- **取消日期**: ${formatDate(task.cancelledDate)}`);
	}
	
	lines.push('');
	lines.push(`- **来源**: [[${task.fileName}#^line-${task.lineNumber}|${task.fileName}:${task.lineNumber}]]`);
	lines.push('');
	lines.push('## 笔记内容');
	lines.push('');
	
	return lines.join('\n');
}

/**
 * 格式化日期
 */
function formatDate(date: Date): string {
	const year = date.getFullYear();
	const month = String(date.getMonth() + 1).padStart(2, '0');
	const day = String(date.getDate()).padStart(2, '0');
	return `${year}-${month}-${day}`;
}
