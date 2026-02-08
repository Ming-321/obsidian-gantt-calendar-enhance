/**
 * GitHub Action 模板文件
 *
 * 这些模板在一键初始化时推送到用户的专用数据仓库。
 */

/** 提醒时间段配置 */
export interface ReminderTimeSlot {
	enabled: boolean;
	time: string; // "HH:mm"
}

/** 提醒时间配置 */
export interface ReminderScheduleConfig {
	morning: ReminderTimeSlot;
	noon: ReminderTimeSlot;
	evening: ReminderTimeSlot;
}

/** 默认提醒时间配置 */
export const DEFAULT_REMINDER_SCHEDULE: ReminderScheduleConfig = {
	morning: { enabled: true, time: '06:30' },
	noon:    { enabled: true, time: '14:00' },
	evening: { enabled: true, time: '18:00' },
};

/** 默认时区（UTC+8） */
export const DEFAULT_TIMEZONE = 8;

/**
 * 将本地时间转换为 UTC cron 表达式
 * @param localTime "HH:mm" 格式的本地时间
 * @param utcOffset UTC 偏移小时数（如 8 代表 UTC+8）
 * @returns cron 表达式，如 "30 22 * * *"
 */
export function localTimeToUtcCron(localTime: string, utcOffset: number): string {
	const [hour, minute] = localTime.split(':').map(Number);
	let utcHour = hour - utcOffset;
	if (utcHour < 0) utcHour += 24;
	if (utcHour >= 24) utcHour -= 24;
	return `${minute} ${utcHour} * * *`;
}

/**
 * 生成 GitHub Action 工作流模板
 * @param schedule 提醒时间配置
 * @param timezone UTC 偏移小时数
 */
export function generateWorkflowTemplate(
	schedule: ReminderScheduleConfig = DEFAULT_REMINDER_SCHEDULE,
	timezone: number = DEFAULT_TIMEZONE,
): string {
	const slots: { key: string; label: string; slot: ReminderTimeSlot }[] = [
		{ key: 'morning', label: '早上', slot: schedule.morning },
		{ key: 'noon',    label: '中午', slot: schedule.noon },
		{ key: 'evening', label: '晚上', slot: schedule.evening },
	];

	// 生成 cron 行和对应的判断逻辑
	const enabledSlots = slots.filter(s => s.slot.enabled);

	if (enabledSlots.length === 0) {
		// 全部禁用时只保留 workflow_dispatch
		return generateWorkflowYaml([], []);
	}

	const cronEntries = enabledSlots.map(s => {
		const cron = localTimeToUtcCron(s.slot.time, timezone);
		const utcSign = timezone >= 0 ? '+' : '';
		return {
			key: s.key,
			label: s.label,
			time: s.slot.time,
			cron,
			comment: `${s.label} ${s.slot.time} (UTC${utcSign}${timezone} = UTC ${cron.split(' ')[1]}:${cron.split(' ')[0].padStart(2, '0')})`,
		};
	});

	return generateWorkflowYaml(cronEntries, enabledSlots.map(s => s.key));
}

function generateWorkflowYaml(
	cronEntries: { key: string; cron: string; comment: string }[],
	enabledKeys: string[],
): string {
	// 构建 schedule 部分
	let schedulePart = '';
	if (cronEntries.length > 0) {
		const cronLines = cronEntries.map(e =>
			`    # ${e.comment}\n    - cron: '${e.cron}'`
		).join('\n');
		schedulePart = `  schedule:\n${cronLines}\n`;
	}

	// 构建 cron → type 判断逻辑
	let cronDetection = '';
	if (cronEntries.length > 0) {
		const conditions = cronEntries.map((e, i) => {
			const prefix = i === 0 ? 'if' : 'elif';
			return `            ${prefix} [ "\$CRON" = "${e.cron}" ]; then\n              echo "type=${e.key}" >> \$GITHUB_OUTPUT`;
		}).join('\n');

		cronDetection = `${conditions}\n            else\n              echo "type=${cronEntries[cronEntries.length - 1].key}" >> \$GITHUB_OUTPUT\n            fi`;
	}

	return `name: Task Email Reminder

on:
${schedulePart}  workflow_dispatch:
    inputs:
      schedule_override:
        description: 'Override schedule type (morning/noon/evening)'
        required: false
        default: '${enabledKeys[0] || 'morning'}'

jobs:
  send-reminder:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4

      - uses: actions/setup-node@v4
        with:
          node-version: '20'

      - name: Install dependencies
        run: npm install nodemailer

      - name: Determine schedule type
        id: schedule
        run: |
          if [ -n "\${{ github.event.inputs.schedule_override }}" ]; then
            echo "type=\${{ github.event.inputs.schedule_override }}" >> \$GITHUB_OUTPUT
          else
            CRON="\${{ github.event.schedule }}"
${cronDetection}
          fi

      - name: Generate and send email
        run: node scripts/generate-email.js
        env:
          EMAIL_TO: \${{ secrets.EMAIL_TO }}
          SMTP_HOST: \${{ secrets.SMTP_HOST }}
          SMTP_PORT: \${{ secrets.SMTP_PORT || '465' }}
          SMTP_USER: \${{ secrets.SMTP_USER }}
          SMTP_PASS: \${{ secrets.SMTP_PASS }}
          SCHEDULE_TYPE: \${{ steps.schedule.outputs.type }}
`;
}

/**
 * 保持向后兼容：默认参数的工作流模板
 */
export const WORKFLOW_TEMPLATE = generateWorkflowTemplate();

/**
 * 邮件生成脚本模板
 */
export const EMAIL_SCRIPT_TEMPLATE = `/**
 * Task Email Reminder - 邮件生成脚本
 *
 * 读取 tasks.json，根据时间段生成不同内容的提醒邮件。
 * - 早晨 (morning): 全面日报 — 所有未完成待办 + 今天及未来3天的提醒
 * - 中午 (noon): 当天聚焦 — 今天未完成待办 + 今天提醒
 * - 晚上 (evening): 当天聚焦 — 今天未完成待办 + 今天提醒
 */

const fs = require('fs');
const nodemailer = require('nodemailer');

// ==================== 配置 ====================

const SCHEDULE_TYPE = process.env.SCHEDULE_TYPE || 'morning';
const EMAIL_TO = process.env.EMAIL_TO;
const SMTP_HOST = process.env.SMTP_HOST;
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '465');
const SMTP_USER = process.env.SMTP_USER;
const SMTP_PASS = process.env.SMTP_PASS;

// ==================== 工具函数 ====================

function toDateStr(d) {
  return d.toISOString().split('T')[0];
}

function parseDate(str) {
  if (!str) return null;
  const d = new Date(str);
  return isNaN(d.getTime()) ? null : d;
}

function isSameDay(d1, d2) {
  return toDateStr(d1) === toDateStr(d2);
}

function isInRange(date, start, end) {
  const d = toDateStr(date);
  return d >= toDateStr(start) && d <= toDateStr(end);
}

function formatDateCN(d) {
  const month = d.getMonth() + 1;
  const day = d.getDate();
  const weekdays = ['日', '一', '二', '三', '四', '五', '六'];
  return \`\${month}月\${day}日（周\${weekdays[d.getDay()]}）\`;
}

function priorityIcon(p) {
  switch(p) {
    case 'highest':
    case 'high': return '🔴';
    case 'low':
    case 'lowest': return '🔵';
    default: return '⚪';
  }
}

function priorityLabel(p) {
  switch(p) {
    case 'highest':
    case 'high': return '重要';
    case 'low':
    case 'lowest': return '不重要';
    default: return '正常';
  }
}

// ==================== 读取任务数据 ====================

function loadTasks() {
  try {
    const raw = fs.readFileSync('tasks.json', 'utf-8');
    const data = JSON.parse(raw);
    return data.tasks || [];
  } catch (e) {
    console.error('Failed to read tasks.json:', e.message);
    return [];
  }
}

// ==================== 邮件内容生成 ====================

function generateMorningEmail(tasks, today) {
  const threeDaysLater = new Date(today);
  threeDaysLater.setDate(today.getDate() + 3);

  // 未完成待办
  const pendingTodos = tasks.filter(t =>
    t.type === 'todo' && !t.completed && !t.archived && !t.cancelled
  ).sort((a, b) => {
    const pw = (p) => (p === 'highest' || p === 'high') ? 0 : (p === 'low' || p === 'lowest') ? 2 : 1;
    const pa = pw(a.priority);
    const pb = pw(b.priority);
    if (pa !== pb) return pa - pb;
    const da = parseDate(a.dueDate);
    const db = parseDate(b.dueDate);
    if (da && db) return da - db;
    return 0;
  });

  // 近期提醒（今天 + 未来3天）
  const upcomingReminders = tasks.filter(t => {
    if (t.type !== 'reminder' || t.archived || t.completed) return false;
    const due = parseDate(t.dueDate);
    return due && isInRange(due, today, threeDaysLater);
  }).sort((a, b) => {
    const da = parseDate(a.dueDate);
    const db = parseDate(b.dueDate);
    return (da || 0) - (db || 0);
  });

  // 统计
  const todayDue = pendingTodos.filter(t => {
    const d = parseDate(t.dueDate);
    return d && isSameDay(d, today);
  }).length;
  const overdue = pendingTodos.filter(t => {
    const d = parseDate(t.dueDate);
    return d && toDateStr(d) < toDateStr(today);
  }).length;

  // 构建 HTML
  let html = \`
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #fafafa;">
  <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <h2 style="margin: 0 0 20px; color: #333;">📋 今日待办事项</h2>
    <hr style="border: none; border-top: 2px solid #e5e5e5; margin: 16px 0;">
\`;

  if (pendingTodos.length === 0) {
    html += '<p style="color: #999;">暂无待办事项 🎉</p>';
  } else {
    pendingTodos.forEach(t => {
      const dueDate = parseDate(t.dueDate);
      const isOverdue = dueDate && toDateStr(dueDate) < toDateStr(today);
      const isDueToday = dueDate && isSameDay(dueDate, today);
      const dueDateStr = dueDate ? formatDateCN(dueDate) : '无截止日期';

      let dueStyle = 'color: #666;';
      let dueLabel = dueDateStr;
      if (isOverdue) {
        dueStyle = 'color: #e53e3e; font-weight: bold;';
        dueLabel = '⚠️ 已逾期 · ' + dueDateStr;
      } else if (isDueToday) {
        dueStyle = 'color: #dd6b20; font-weight: bold;';
        dueLabel = '📌 今天截止';
      }

      html += \`
      <div style="display: flex; align-items: center; padding: 8px 0; border-bottom: 1px solid #f0f0f0;">
        <span style="margin-right: 8px;">\${priorityIcon(t.priority)}</span>
        <span style="flex: 1; color: #333;">\${t.description || t.title || '无标题'}</span>
        <span style="font-size: 0.85em; \${dueStyle}">\${dueLabel}</span>
      </div>\`;
    });
  }

  html += \`
    <h2 style="margin: 24px 0 12px; color: #333;">🔔 近期提醒（今天 + 未来3天）</h2>
    <hr style="border: none; border-top: 2px solid #e5e5e5; margin: 16px 0;">
  \`;

  if (upcomingReminders.length === 0) {
    html += '<p style="color: #999;">暂无近期提醒</p>';
  } else {
    // 按日期分组
    const grouped = {};
    upcomingReminders.forEach(t => {
      const due = parseDate(t.dueDate);
      const key = due ? toDateStr(due) : 'unknown';
      if (!grouped[key]) grouped[key] = [];
      grouped[key].push(t);
    });

    Object.keys(grouped).sort().forEach(dateKey => {
      const date = new Date(dateKey + 'T00:00:00');
      const label = isSameDay(date, today) ? \`📍 今天 \${formatDateCN(date)}\` : \`📍 \${formatDateCN(date)}\`;
      html += \`<div style="margin: 12px 0 4px; font-weight: bold; color: #555;">\${label}</div>\`;

      grouped[dateKey].forEach(t => {
        const timeStr = t.time ? \`<span style="color: #4299e1; margin-right: 6px;">\${t.time}</span>\` : '';
        html += \`<div style="padding: 4px 0 4px 16px; color: #333;">\${timeStr}\${t.description || t.title || '无标题'}</div>\`;
      });
    });
  }

  html += \`
    <h2 style="margin: 24px 0 12px; color: #333;">📊 概览</h2>
    <hr style="border: none; border-top: 2px solid #e5e5e5; margin: 16px 0;">
    <p style="color: #555;">待办总数: <strong>\${pendingTodos.length}</strong> | 今日到期: <strong>\${todayDue}</strong> | 已逾期: <strong style="color: \${overdue > 0 ? '#e53e3e' : '#333'};">\${overdue}</strong></p>
  </div>
  <p style="text-align: center; color: #aaa; font-size: 0.8em; margin-top: 16px;">由 Obsidian Gantt Calendar 自动生成</p>
</div>\`;

  return {
    subject: \`📋 [\${formatDateCN(today)}] 任务日报 — \${pendingTodos.length}项待办, \${upcomingReminders.length}项提醒\`,
    html,
  };
}

function generateFocusEmail(tasks, today, period) {
  const icon = period === 'noon' ? '☀️' : '🌙';
  const periodLabel = period === 'noon' ? '午间' : '晚间';

  // 今日未完成待办
  const todayTodos = tasks.filter(t => {
    if (t.type !== 'todo' || t.completed || t.archived || t.cancelled) return false;
    const due = parseDate(t.dueDate);
    return due && (toDateStr(due) <= toDateStr(today));
  }).sort((a, b) => {
    const pw = (p) => (p === 'highest' || p === 'high') ? 0 : (p === 'low' || p === 'lowest') ? 2 : 1;
    const pa = pw(a.priority);
    const pb = pw(b.priority);
    return pa - pb;
  });

  // 今日提醒
  const todayReminders = tasks.filter(t => {
    if (t.type !== 'reminder' || t.archived || t.completed) return false;
    const due = parseDate(t.dueDate);
    return due && isSameDay(due, today);
  });

  let html = \`
<div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; background: #fafafa;">
  <div style="background: white; border-radius: 12px; padding: 24px; box-shadow: 0 2px 8px rgba(0,0,0,0.08);">
    <h2 style="margin: 0 0 20px; color: #333;">\${icon} \${periodLabel}待办提醒</h2>
    <hr style="border: none; border-top: 2px solid #e5e5e5; margin: 16px 0;">
  \`;

  if (todayTodos.length === 0) {
    html += '<p style="color: #999;">今日待办已全部完成 🎉</p>';
  } else {
    todayTodos.forEach(t => {
      const due = parseDate(t.dueDate);
      const isOverdue = due && toDateStr(due) < toDateStr(today);
      const overdueTag = isOverdue ? ' <span style="color: #e53e3e; font-size: 0.85em;">逾期</span>' : '';
      html += \`
      <div style="display: flex; align-items: center; padding: 6px 0; border-bottom: 1px solid #f0f0f0;">
        <span style="margin-right: 8px;">\${priorityIcon(t.priority)}</span>
        <span style="flex: 1; color: #333;">\${t.description || t.title || '无标题'}\${overdueTag}</span>
      </div>\`;
    });
  }

  html += \`
    <h2 style="margin: 24px 0 12px; color: #333;">🔔 今日提醒</h2>
    <hr style="border: none; border-top: 2px solid #e5e5e5; margin: 16px 0;">
  \`;

  if (todayReminders.length === 0) {
    html += '<p style="color: #999;">暂无今日提醒</p>';
  } else {
    todayReminders.forEach(t => {
      const timeStr = t.time ? \`<span style="color: #4299e1; margin-right: 6px;">\${t.time}</span>\` : '';
      html += \`<div style="padding: 4px 0; color: #333;">\${timeStr}\${t.description || t.title || '无标题'}</div>\`;
    });
  }

  html += \`
    <p style="margin-top: 16px; color: #888; font-size: 0.9em;">未完成待办: \${todayTodos.length}</p>
  </div>
  <p style="text-align: center; color: #aaa; font-size: 0.8em; margin-top: 16px;">由 Obsidian Gantt Calendar 自动生成</p>
</div>\`;

  return {
    subject: \`\${icon} [\${periodLabel}提醒] \${todayTodos.length}项待办未完成\`,
    html,
  };
}

// ==================== 主流程 ====================

async function main() {
  // 验证环境变量
  if (!EMAIL_TO || !SMTP_HOST || !SMTP_USER || !SMTP_PASS) {
    console.error('Missing required environment variables. Need: EMAIL_TO, SMTP_HOST, SMTP_USER, SMTP_PASS');
    process.exit(1);
  }

  // 读取任务
  const tasks = loadTasks();
  console.log(\`Loaded \${tasks.length} tasks\`);

  // 今天日期（UTC+8）
  const now = new Date();
  const utc8Offset = 8 * 60 * 60 * 1000;
  const today = new Date(now.getTime() + utc8Offset);
  today.setUTCHours(0, 0, 0, 0);

  // 生成邮件内容
  let email;
  if (SCHEDULE_TYPE === 'morning') {
    email = generateMorningEmail(tasks, today);
  } else {
    email = generateFocusEmail(tasks, today, SCHEDULE_TYPE);
  }

  // 如果没有待办也没有提醒，跳过发送
  const hasTasks = tasks.some(t => !t.completed && !t.archived && !t.cancelled);
  if (!hasTasks && SCHEDULE_TYPE !== 'morning') {
    console.log('No pending tasks, skipping email');
    return;
  }

  // 发送邮件
  const transporter = nodemailer.createTransport({
    host: SMTP_HOST,
    port: SMTP_PORT,
    secure: SMTP_PORT === 465,
    auth: {
      user: SMTP_USER,
      pass: SMTP_PASS,
    },
  });

  await transporter.sendMail({
    from: SMTP_USER,
    to: EMAIL_TO,
    subject: email.subject,
    html: email.html,
  });

  console.log(\`Email sent successfully to \${EMAIL_TO} (type: \${SCHEDULE_TYPE})\`);
}

main().catch(err => {
  console.error('Fatal error:', err);
  process.exit(1);
});
`;
