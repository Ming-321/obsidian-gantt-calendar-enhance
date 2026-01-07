import type { CalendarViewType } from '../types';

/**
 * 工具栏中间区域 - 信息展示区
 * 负责显示日期范围、标题等信息
 */
export class ToolbarCenter {
	/**
	 * 渲染中间区域
	 * @param container 中间容器元素
	 * @param currentViewType 当前视图类型
	 * @param currentDate 当前日期
	 * @param dateRangeText 日期范围文本
	 */
	render(
		container: HTMLElement,
		currentViewType: CalendarViewType,
		currentDate: Date,
		dateRangeText: string
	): void {
		container.empty();
		container.addClass('calendar-toolbar-center');

		const dateDisplay = container.createEl('span');
		dateDisplay.addClass('calendar-date-display');
		dateDisplay.setText(dateRangeText);
	}
}
