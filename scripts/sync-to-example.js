const fs = require('fs');
const path = require('path');

const sourceDir = path.resolve(__dirname, '..');
const files = ['main.js', 'manifest.json', 'styles.css'];

// 同步目标列表：项目内示例库 + 用户真实 Vault（WSL 路径）
const targets = [
	{
		name: '示例库',
		dir: path.join(sourceDir, 'example/.obsidian/plugins/obsidian-gantt-calendar'),
	},
	{
		name: 'Obsidian Vault',
		dir: '/mnt/c/Users/31284/Documents/Obsidian/main/.obsidian/plugins/obsidian-gantt-calendar',
	},
];

targets.forEach(({ name, dir }) => {
	// 确保目标目录存在
	if (!fs.existsSync(dir)) {
		fs.mkdirSync(dir, { recursive: true });
	}

	// 复制文件
	files.forEach(file => {
		const src = path.join(sourceDir, file);
		const dest = path.join(dir, file);
		if (fs.existsSync(src)) {
			fs.copyFileSync(src, dest);
			console.log(`✓ [${name}] 已同步: ${file}`);
		} else {
			console.warn(`⚠ [${name}] 文件不存在: ${file}`);
		}
	});
});

console.log('→ 同步完成');
