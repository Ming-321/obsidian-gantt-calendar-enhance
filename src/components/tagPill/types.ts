/**
 * TagPill 组件类型定义
 */

/**
 * TagPill 组件配置选项
 */
export interface TagPillOptions {
	/** 标签文本（不含 # 符号） */
	label: string;
	/** 是否显示 # 前缀（默认 true） */
	showHash?: boolean;
	/** 颜色索引（0-5），不传则自动计算 */
	colorIndex?: number;
	/** 是否可选（可点击切换选中状态） */
	selectable?: boolean;
	/** 初始选中状态 */
	selected?: boolean;
	/** 点击回调 */
	onClick?: (event: MouseEvent, tag: string, selected: boolean) => void;
	/** 右键菜单回调 */
	onContextMenu?: (event: MouseEvent, tag: string) => void;
	/** 附加的后缀内容（如数量徽章） */
	suffix?: string;
	/** 自定义数据属性（data-*） */
	dataAttrs?: Record<string, string>;
	/** ARIA 属性（aria-*） */
	ariaAttrs?: Record<string, string>;
}

/**
 * TagPill 内部状态
 */
export interface TagPillState {
	selected: boolean;
}
