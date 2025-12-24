import { App, Notice, normalizePath, TFolder } from 'obsidian';
import type { GanttTask } from '../../types';

/**
 * 创建任务同名文件
 * 以任务描述为文件名，创建笔记，存放在默认路径
 */
export async function createNoteFromTask(
	app: App,
	task: GanttTask,
	defaultPath: string,
	globalFilter: string
): Promise<void> {
	try {
		const raw = task.content;
		// 1) 如果任务中已存在双链，直接打开对应笔记
		const wikiLinkMatch = raw.match(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/);
		if (wikiLinkMatch) {
			const linkTarget = wikiLinkMatch[1];
			const dest = app.metadataCache.getFirstLinkpathDest(linkTarget, task.filePath);
			if (dest) {
				const leaf = app.workspace.getLeaf(false);
				await leaf.openFile(dest);
				new Notice('已存在任务笔记');
				return;
			}
		}

		// 2) 收集超链接（Markdown 链接与裸 URL）
		const markdownLinks: Array<{text: string, url: string}> = [];
		const linkRegex = /\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g;
		let m: RegExpExecArray | null;
		while ((m = linkRegex.exec(raw)) !== null) {
			markdownLinks.push({ text: m[1], url: m[2] });
		}
		const rawUrls: string[] = [];
		const urlRegex = /(https?:\/\/[^\s)]+)/g;
		let u: RegExpExecArray | null;
		while ((u = urlRegex.exec(raw)) !== null) {
			// 避免与 markdownLinks 重复收集
			if (!markdownLinks.some(l => l.url === u![1])) rawUrls.push(u[1]);
		}

		// 清理任务描述，移除字段与 emoji 与链接
		// task.description 已经移除了元数据标记，只需额外处理 wiki 链接和 markdown 链接
		const baseDesc = removeLinksFromDescription(cleanTaskDescriptionFromTask(task));
		const fileName = sanitizeFileName(baseDesc);
		
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
			const leaf = app.workspace.getLeaf(false);
			await leaf.openFile(existingFile as any);
			// 仍将任务内容改为双链，方便后续跳转
			await updateTaskLineToWikiLink(app, task, fileName, globalFilter);
			return;
		}

		// 创建文件内容（可以包含任务的相关信息）
		const fileContent = generateNoteContent(task, markdownLinks, rawUrls);

		// 创建文件
		const file = await app.vault.create(filePath, fileContent);
		
		// 打开新创建的文件
		const leaf = app.workspace.getLeaf(false);
		await leaf.openFile(file);
		
		new Notice(`已创建笔记: ${fileName}.md`);

		// 3) 更新源任务行为双链，并移除任务中的超链接
		await updateTaskLineToWikiLink(app, task, fileName, globalFilter);
	} catch (error) {
		console.error('Failed to create note from task:', error);
		new Notice('创建笔记失败');
	}
}

/**
 * 使用已解析的 task.description 清理任务描述（用于文件名生成）
 */
function cleanTaskDescriptionFromTask(task: GanttTask): string {
	let text = task.description || '';
	// 移除 wiki 链接语法，仅保留显示文本
	text = text.replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, ' $1 ');
	// 折叠多余空格
	text = text.replace(/\s{2,}/g, ' ').trim();
	return text;
}

/**
 * 从描述中移除 markdown 链接和裸 URL
 */
function removeLinksFromDescription(text: string): string {
	return text
		.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, ' $1 ') // 去掉 markdown 链接，仅保留文本
		.replace(/(https?:\/\/[^\s)]+)/g, ' ') // 去掉裸 URL
		.replace(/\s{2,}/g, ' ').trim();
}

function removeLinks(raw: string): string {
	return raw
		.replace(/\[([^\]]+)\]\((https?:\/\/[^\s)]+)\)/g, ' $1 ') // 去掉 markdown 链接，仅保留文本
		.replace(/(https?:\/\/[^\s)]+)/g, ' '); // 去掉裸 URL
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
function generateNoteContent(task: GanttTask, mdLinks: Array<{text: string, url: string}>, rawUrls: string[]): string {
	const lines: string[] = [];

	lines.push(`# ${cleanTaskDescriptionFromTask(task)}`);
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
	
	if (mdLinks.length || rawUrls.length) {
		lines.push('');
		lines.push('## Reference');
		lines.push('');
		for (const l of mdLinks) {
			lines.push(`- [${l.text}](${l.url})`);
		}
		for (const url of rawUrls) {
			lines.push(`- ${url}`);
		}
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

/**
 * 将源任务行的任务描述改为双链形式，并移除任务行中的所有超链接
 */
async function updateTaskLineToWikiLink(app: App, task: GanttTask, noteName: string, globalFilter: string): Promise<void> {
	const file = app.vault.getAbstractFileByPath(task.filePath);
	if (!(file as any)) return;
	const content = await app.vault.read(file as any);
	const lines = content.split('\n');
	const idx = task.lineNumber - 1;
	if (idx < 0 || idx >= lines.length) return;

	const line = lines[idx];
	const m = line.match(/^(\s*[-*]\s*\[[ xX]\]\s*)(.*)$/);
	if (!m) return;
	const prefix = m[1];
	const rest = m[2];

	// 保留是否存在全局筛选前缀
	let gfPrefix = '';
	const gfTrim = (globalFilter || '').trim();
	if (gfTrim && rest.trim().startsWith(gfTrim)) {
		gfPrefix = gfTrim + ' ';
	}

	// 抽取并保留所有的 Dataview 字段与日期 emoji 与优先级 emoji
	const dvFields = rest.match(/\[(priority|created|start|scheduled|due|cancelled|completion)::\s*[^\]]+\]/g) || [];
	const dateEmojis = rest.match(/(➕|🛫|⏳|📅|❌|✅)\s*\d{4}-\d{2}-\d{2}/g) || [];
	const priorityEmojis = rest.match(/(🔺|⏫|🔼|🔽|⏬)/g) || [];

	// 构造新行：前缀 + 可选GF + [[noteName]] + 保留的元数据（用空格拼接）
	const metadata = [...priorityEmojis, ...dateEmojis, ...dvFields].join(' ').trim();

	// 移除原行中的超链接
	const restNoLinks = removeLinks(rest).replace(/\[\[([^\]|]+)(?:\|[^\]]+)?\]\]/g, '').trim();

	let newLine = `${prefix}${gfPrefix}[[${noteName}]]`;
	if (metadata) newLine += ` ${metadata}`;

	lines[idx] = newLine;
	await app.vault.modify(file as any, lines.join('\n'));
}
