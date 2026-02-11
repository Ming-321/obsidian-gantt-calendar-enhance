/**
 * 倒计时格式化工具
 *
 * 根据截止日期生成本地化的倒计时文本。
 *
 * @module dateUtils/countdown
 */

export interface CountdownResult {
	/** 倒计时文本（如"今天"、"明天"、"3天后"、"已过期2天"） */
	text: string;
	/** 是否已过期 */
	isOverdue: boolean;
}

/**
 * 格式化截止日期为倒计时文本
 *
 * 逻辑：
 * - 已过期：「已过期X天」
 * - 今天：「今天」
 * - 明天：「明天」
 * - 后天：「后天」
 * - 3-30 天：「X天后」
 * - 31-365 天：「约X个月后」
 * - >365 天：「约X年后」
 *
 * @param dueDate 截止日期
 * @returns CountdownResult
 */
export function formatCountdown(dueDate: Date): CountdownResult {
	const now = new Date();
	now.setHours(0, 0, 0, 0);
	const due = new Date(dueDate);
	due.setHours(0, 0, 0, 0);

	const diffMs = due.getTime() - now.getTime();
	const diffDays = Math.round(diffMs / (1000 * 60 * 60 * 24));

	if (diffDays < 0) {
		const overdueDays = Math.abs(diffDays);
		return { text: `已过期${overdueDays}天`, isOverdue: true };
	}

	if (diffDays === 0) {
		return { text: '今天', isOverdue: false };
	}

	if (diffDays === 1) {
		return { text: '明天', isOverdue: false };
	}

	if (diffDays === 2) {
		return { text: '后天', isOverdue: false };
	}

	if (diffDays <= 30) {
		return { text: `${diffDays}天后`, isOverdue: false };
	}

	if (diffDays <= 365) {
		const months = Math.round(diffDays / 30);
		return { text: `约${months}个月后`, isOverdue: false };
	}

	const years = Math.round(diffDays / 365);
	return { text: `约${years}年后`, isOverdue: false };
}

/**
 * 格式化截止日期为简短显示格式
 * @param dueDate 截止日期
 * @returns 格式化后的日期字符串（如 "2.15"、"12.31"）
 */
export function formatDueDateShort(dueDate: Date): string {
	const d = new Date(dueDate);
	return `${d.getMonth() + 1}.${d.getDate()}`;
}
