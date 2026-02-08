/**
 * @fileoverview 视图菜单弹窗组件
 * @module toolbar/components/view-menu
 *
 * 绑定到已有按钮上，单击弹出面板，包含：
 * - 状态筛选（checkbox 列表）
 * - 标签筛选（checkbox 列表）
 * - 排序（字段 + 方向）
 * - 日期范围（仅任务视图）
 * 任何修改立即生效。点击面板外部或按 Esc 关闭。
 */

import { setIcon } from 'obsidian';
import type { SortState, SortField, SortOrder, StatusFilterState, TagFilterState, GCTask, CalendarViewType } from '../../types';
import { SORT_OPTIONS } from '../../tasks/taskSorter';
import { ToolbarClasses } from '../../utils/bem';
import type { TaskStatus } from '../../tasks/taskStatus';

/**
 * 视图菜单配置
 */
export interface ViewMenuOptions {
	viewType: CalendarViewType;
	plugin: any;

	// 状态筛选
	getStatusFilterState: () => StatusFilterState;
	onStatusFilterChange: (state: StatusFilterState) => void;
	getAvailableStatuses: () => TaskStatus[];

	// 排序
	getSortState: () => SortState;
	onSortChange: (state: SortState) => void;

	// 标签筛选
	getTagFilterState: () => TagFilterState;
	onTagFilterChange: (state: TagFilterState) => void;
	getAllTasks: () => GCTask[];

	// 日期范围（仅任务视图）
	getDateRangeMode?: () => string;
	onDateRangeChange?: (mode: string) => void;
	getTimeFieldFilter?: () => string;
	onTimeFieldChange?: (field: string) => void;
}

/**
 * 绑定视图菜单交互到已有按钮
 * @param btn 已存在的按钮元素
 * @param options 菜单配置
 */
export function renderViewMenuButton(
	btn: HTMLElement,
	options: ViewMenuOptions
): { cleanup: () => void } {
	const classes = ToolbarClasses.components.viewMenu;

	let panel: HTMLElement | null = null;
	let outsideClickHandler: ((e: MouseEvent) => void) | null = null;
	let escHandler: ((e: KeyboardEvent) => void) | null = null;

	function closePanel() {
		if (panel) {
			panel.remove();
			panel = null;
		}
		if (outsideClickHandler) {
			document.removeEventListener('click', outsideClickHandler, true);
			outsideClickHandler = null;
		}
		if (escHandler) {
			document.removeEventListener('keydown', escHandler);
			escHandler = null;
		}
	}

	function openPanel() {
		if (panel) {
			closePanel();
			return;
		}

		panel = document.body.createDiv(classes.panel);

		// 定位在按钮下方
		const rect = btn.getBoundingClientRect();
		panel.style.position = 'fixed';
		panel.style.top = `${rect.bottom + 4}px`;
		panel.style.right = `${window.innerWidth - rect.right}px`;
		panel.style.zIndex = '1000';

		renderPanelContent(panel, options, () => {
			if (panel) {
				panel.empty();
				renderPanelContent(panel, options, arguments.callee as () => void);
			}
		});

		outsideClickHandler = (e: MouseEvent) => {
			if (panel && !panel.contains(e.target as Node) && !btn.contains(e.target as Node)) {
				closePanel();
			}
		};
		setTimeout(() => {
			if (outsideClickHandler) {
				document.addEventListener('click', outsideClickHandler, true);
			}
		}, 10);

		escHandler = (e: KeyboardEvent) => {
			if (e.key === 'Escape') closePanel();
		};
		document.addEventListener('keydown', escHandler);
	}

	btn.addEventListener('click', (e) => {
		e.stopPropagation();
		openPanel();
	});

	return {
		cleanup: () => closePanel(),
	};
}

/**
 * 渲染面板内容
 */
function renderPanelContent(
	panel: HTMLElement,
	options: ViewMenuOptions,
	refresh: () => void
): void {
	const classes = ToolbarClasses.components.viewMenu;

	// === 状态筛选 ===
	const statusSection = panel.createDiv(classes.section);
	statusSection.createDiv({ text: '状态筛选', cls: classes.sectionTitle });

	const statuses = options.getAvailableStatuses();
	const currentStatusState = options.getStatusFilterState();

	statuses.forEach(status => {
		const item = statusSection.createDiv(classes.checkboxItem);
		const checkbox = item.createEl('input', { type: 'checkbox', cls: classes.checkbox });
		checkbox.checked = currentStatusState.selectedStatuses.includes(status.key);
		item.createEl('span', { text: status.name });

		checkbox.addEventListener('change', () => {
			const newSelected = checkbox.checked
				? [...currentStatusState.selectedStatuses, status.key]
				: currentStatusState.selectedStatuses.filter(s => s !== status.key);
			options.onStatusFilterChange({ selectedStatuses: newSelected });
			refresh();
		});
		item.addEventListener('click', (e) => {
			if (e.target !== checkbox) {
				checkbox.checked = !checkbox.checked;
				checkbox.dispatchEvent(new Event('change'));
			}
		});
	});

	// === 排序 ===
	const sortSection = panel.createDiv(classes.section);
	sortSection.createDiv({ text: '排序', cls: classes.sectionTitle });

	const currentSort = options.getSortState();
	const sortRow = sortSection.createDiv(classes.sortRow);

	const fieldSelect = sortRow.createEl('select', { cls: classes.sortFieldSelect });
	SORT_OPTIONS.forEach(opt => {
		const option = fieldSelect.createEl('option', {
			value: opt.field,
			text: `${opt.icon} ${opt.label}`,
		});
		if (opt.field === currentSort.field) option.selected = true;
	});

	const orderBtn = sortRow.createEl('button', { cls: classes.sortOrderBtn });
	setIcon(orderBtn, currentSort.order === 'asc' ? 'arrow-up' : 'arrow-down');
	orderBtn.setAttribute('aria-label', currentSort.order === 'asc' ? '升序' : '降序');

	fieldSelect.addEventListener('change', () => {
		options.onSortChange({ field: fieldSelect.value as SortField, order: currentSort.order });
		refresh();
	});
	orderBtn.addEventListener('click', () => {
		const newOrder: SortOrder = currentSort.order === 'asc' ? 'desc' : 'asc';
		options.onSortChange({ field: currentSort.field, order: newOrder });
		refresh();
	});

	// === 标签筛选 ===
	const tagSection = panel.createDiv(classes.section);
	tagSection.createDiv({ text: '标签筛选', cls: classes.sectionTitle });

	const allTasks = options.getAllTasks();
	const tagCounts = new Map<string, number>();
	allTasks.forEach(task => {
		task.tags?.forEach(tag => tagCounts.set(tag, (tagCounts.get(tag) || 0) + 1));
	});

	const currentTagState = options.getTagFilterState();

	if (tagCounts.size === 0) {
		tagSection.createDiv({ text: '暂无标签', cls: classes.label });
	} else {
		// 操作符选择
		const opRow = tagSection.createDiv(classes.row);
		(['OR', 'AND'] as const).forEach(op => {
			const opBtn = opRow.createEl('button', {
				text: op === 'OR' ? '任一' : '全部',
				cls: classes.sortOrderBtn,
			});
			if (currentTagState.operator === op) {
				opBtn.style.fontWeight = 'bold';
			}
			opBtn.addEventListener('click', () => {
				options.onTagFilterChange({ ...currentTagState, operator: op });
				refresh();
			});
		});

		// 标签列表
		Array.from(tagCounts.entries())
			.sort((a, b) => b[1] - a[1])
			.forEach(([tag, count]) => {
				const item = tagSection.createDiv(classes.checkboxItem);
				const checkbox = item.createEl('input', { type: 'checkbox', cls: classes.checkbox });
				checkbox.checked = currentTagState.selectedTags.includes(tag);
				item.createEl('span', { text: `${tag} (${count})` });

				checkbox.addEventListener('change', () => {
					const newTags = checkbox.checked
						? [...currentTagState.selectedTags, tag]
						: currentTagState.selectedTags.filter(t => t !== tag);
					options.onTagFilterChange({ ...currentTagState, selectedTags: newTags });
					refresh();
				});
				item.addEventListener('click', (e) => {
					if (e.target !== checkbox) {
						checkbox.checked = !checkbox.checked;
						checkbox.dispatchEvent(new Event('change'));
					}
				});
			});
	}

	// === 日期范围（仅任务视图） ===
	if (options.viewType === 'task' && options.getDateRangeMode && options.onDateRangeChange) {
		const dateSection = panel.createDiv(classes.section);
		dateSection.createDiv({ text: '日期范围', cls: classes.sectionTitle });

		const currentMode = options.getDateRangeMode();
		const modes = [
			{ value: 'all', label: '全部' },
			{ value: 'day', label: '今天' },
			{ value: 'week', label: '本周' },
			{ value: 'month', label: '本月' },
		];

		const dateRow = dateSection.createDiv(classes.row);
		modes.forEach(m => {
			const modeBtn = dateRow.createEl('button', {
				text: m.label,
				cls: classes.sortOrderBtn,
			});
			if (currentMode === m.value) {
				modeBtn.style.fontWeight = 'bold';
			}
			modeBtn.addEventListener('click', () => {
				options.onDateRangeChange!(m.value);
				refresh();
			});
		});

		// 字段筛选
		if (options.getTimeFieldFilter && options.onTimeFieldChange) {
			const fieldRow = dateSection.createDiv(classes.row);
			fieldRow.createEl('span', { text: '基于字段:', cls: classes.label });

			const fSelect = fieldRow.createEl('select', { cls: classes.select });
			const fieldOptions = [
				{ value: 'dueDate', label: '截止日期' },
				{ value: 'createdDate', label: '创建日期' },
				{ value: 'startDate', label: '开始日期' },
				{ value: 'completionDate', label: '完成日期' },
			];
			const currentField = options.getTimeFieldFilter();
			fieldOptions.forEach(fo => {
				const opt = fSelect.createEl('option', { value: fo.value, text: fo.label });
				if (fo.value === currentField) opt.selected = true;
			});
			fSelect.addEventListener('change', () => {
				options.onTimeFieldChange!(fSelect.value);
				refresh();
			});
		}
	}
}
