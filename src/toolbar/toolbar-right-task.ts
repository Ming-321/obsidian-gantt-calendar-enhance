import { setIcon } from 'obsidian';
import { formatDate } from '../utils';
import type { TaskViewRenderer } from '../views/TaskView';

/**
 * 工具栏右侧区域 - 任务视图功能区
 * 负责渲染全局筛选状态、状态筛选、时间筛选和刷新按钮
 */
export class ToolbarRightTask {
	// 记录前一个按钮状态，用于清除日期输入后恢复
	private previousMode: 'all' | 'day' | 'week' | 'month' = 'week';

	/**
	 * 渲染任务视图功能区
	 * @param container 右侧容器元素
	 * @param globalFilterText 全局筛选文本
	 * @param taskRenderer 任务视图渲染器
	 * @param onFilterChange 筛选变更回调
	 * @param onRefresh 刷新回调
	 */
	render(
		container: HTMLElement,
		globalFilterText: string,
		taskRenderer: TaskViewRenderer,
		onFilterChange: () => void,
		onRefresh: () => Promise<void>
	): void {
		container.empty();
		container.addClass('toolbar-right-task');

		// Global Filter 状态
		const gfText = container.createEl('span', { cls: 'toolbar-right-task-global-filter' });
		gfText.setText(`Global Filter: ${globalFilterText || '（未设置）'}`);

		// 状态筛选 - 由 TaskViewRenderer 创建
		taskRenderer.createStatusFilterGroup(container, onFilterChange);

		// 字段筛选组
		const fieldFilterGroup = container.createDiv('toolbar-right-task-field-filter-group');
		const fieldLabel = fieldFilterGroup.createEl('span', { 
			text: '字段筛选', 
			cls: 'toolbar-right-task-field-filter-label' 
		});
		
		// 字段选择
		const fieldSelect = fieldFilterGroup.createEl('select', { 
			cls: 'toolbar-right-task-field-select' 
		});
		fieldSelect.innerHTML = `
			<option value="createdDate">创建时间</option>
			<option value="startDate">开始时间</option>
			<option value="scheduledDate">规划时间</option>
			<option value="dueDate">截止时间</option>
			<option value="completionDate">完成时间</option>
			<option value="cancelledDate">取消时间</option>
		`;
		fieldSelect.value = taskRenderer.getTimeFilterField();
		fieldSelect.addEventListener('change', (e) => {
			const value = (e.target as HTMLSelectElement).value as 
				'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate';
			taskRenderer.setTimeFilterField(value);
			onFilterChange();
		});

		// 日期筛选组（标签+输入+模式按钮：全/日/周/月）
		const dateFilterGroup = container.createDiv('toolbar-right-task-date-filter-group');
		const dateLabel = dateFilterGroup.createEl('span', {
			text: '日期',
			cls: 'toolbar-right-task-date-filter-label'
		});
		const dateInput = dateFilterGroup.createEl('input', {
			cls: 'toolbar-right-task-date-input',
			attr: { type: 'date' }
		}) as HTMLInputElement;
		// 默认当天
		try {
			dateInput.value = formatDate(new Date(), 'YYYY-MM-DD');
		} catch {
			dateInput.value = new Date().toISOString().slice(0, 10);
		}
		// 输入变化：设置特定日期，清除按钮选中状态
		dateInput.addEventListener('change', () => {
			const val = dateInput.value;
			if (val) {
				const d = new Date(val);
				taskRenderer.setSpecificDate(d);
				taskRenderer.setDateRangeMode('custom');
				// 清除所有按钮的高亮
				Array.from(dateFilterGroup.getElementsByClassName('toolbar-right-task-date-mode-btn')).forEach(el => el.classList.remove('active'));
			} else {
				// 无输入时，恢复为前一个模式并清空特定日期
				taskRenderer.setSpecificDate(null);
				taskRenderer.setDateRangeMode(this.previousMode);
				// 恢复前一个按钮的高亮
				const buttons = Array.from(dateFilterGroup.getElementsByClassName('toolbar-right-task-date-mode-btn')) as HTMLElement[];
				buttons.forEach(btn => {
					if ((btn.getAttribute('data-mode') as any) === this.previousMode) {
						btn.classList.add('active');
					}
				});
			}
			onFilterChange();
		});

		const modes: Array<{ key: 'all' | 'day' | 'week' | 'month'; label: string }> = [
			{ key: 'all', label: '全' },
			{ key: 'day', label: '日' },
			{ key: 'week', label: '周' },
			{ key: 'month', label: '月' },
		];
		// 获取当前的日期范围模式
		const currentMode = taskRenderer.getDateRangeMode();
		for (const m of modes) {
			const btn = dateFilterGroup.createEl('button', {
				cls: 'toolbar-right-task-date-mode-btn',
				text: m.label,
				attr: { 'data-mode': m.key }
			});
			// 根据当前的 dateRangeMode 设置高亮，仅当模式为 all/day/week/month 时高亮
			// 如果是 'custom'（使用日期输入），则不高亮任何按钮
			if (currentMode !== 'custom' && m.key === currentMode) {
				btn.classList.add('active');
			}
			btn.addEventListener('click', () => {
				// 清空输入框
				dateInput.value = '';
				// 保存当前模式为前一个状态
				this.previousMode = m.key;
				// 更新模式
				taskRenderer.setDateRangeMode(m.key);
				if (m.key !== 'all') {
					// 以当天为参考
					taskRenderer.setSpecificDate(new Date());
				} else {
					taskRenderer.setSpecificDate(null);
				}
				// 高亮切换
				Array.from(dateFilterGroup.getElementsByClassName('toolbar-right-task-date-mode-btn')).forEach(el => el.classList.remove('active'));
				btn.classList.add('active');
				onFilterChange();
			});
		}

		// 刷新按钮
		const refreshBtn = container.createEl('button', { 
			cls: 'toolbar-right-task-refresh-btn', 
			attr: { title: '刷新任务' } 
		});
		setIcon(refreshBtn, 'rotate-ccw');
		refreshBtn.addEventListener('click', onRefresh);
	}
}
