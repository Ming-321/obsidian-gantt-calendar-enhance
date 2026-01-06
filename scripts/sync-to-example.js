const fs = require('fs');
const path = require('path');

const sourceDir = path.resolve(__dirname, '..');
const targetDir = path.join(sourceDir, 'example/.obsidian/plugins/obsidian-gantt-calendar');

const files = ['main.js', 'manifest.json', 'styles.css'];

// 确保目标目录存在
if (!fs.existsSync(targetDir)) {
	fs.mkdirSync(targetDir, { recursive: true });
}

// 复制文件
files.forEach(file => {
	const src = path.join(sourceDir, file);
	const dest = path.join(targetDir, file);
	if (fs.existsSync(src)) {
		fs.copyFileSync(src, dest);
		console.log(`✓ 已同步: ${file}`);
	} else {
		console.warn(`⚠ 文件不存在: ${file}`);
	}
});

console.log('→ 同步到示例库完成');
