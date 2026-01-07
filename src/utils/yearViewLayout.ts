/**
 * 年视图布局管理器
 * 基于实际CSS渲染值动态计算最优布局，避免硬编码断点
 */

/**
 * CSS尺寸测量结果
 */
interface CSSMetrics {
	dayNumberFontSize: number;
	lunarFontSize: number;
	dayPadding: number;
	monthsGap: number;
}

/**
 * 年视图布局类型
 */
export type YearViewLayout = '4x3' | '3x4' | '2x6' | '1x12';

/**
 * 年视图布局管理器
 *
 * 通过 getComputedStyle 读取实际渲染的CSS值（字体大小、间距等），
 * 动态计算不同布局所需的最小容器宽度，实现自适应响应式布局。
 */
export class YearViewLayoutManager {
	private static cachedMetrics: CSSMetrics | null = null;
	private static cacheExpiry = 0;
	private static readonly CACHE_DURATION = 1000; // 1秒缓存，避免频繁读取

	/**
	 * 默认回退值（当无法读取CSS时使用）
	 */
	private static readonly DEFAULT_METRICS: CSSMetrics = {
		dayNumberFontSize: 13,
		lunarFontSize: 10,
		dayPadding: 2,
		monthsGap: 6
	};

	/**
	 * 额外垂直空间（防止内容溢出）+ 安全系数
	 */
	private static readonly EXTRA_VERTICAL_SPACE = 8;
	private static readonly SAFETY_FACTOR = 1.3;  // 安全系数，让布局更早切换

	/**
	 * 从实际DOM读取CSS渲染值
	 */
	private static readCSSMetrics(container: HTMLElement): CSSMetrics {
		const monthCard = container.querySelector('.gc-year-view__month-card') as HTMLElement;
		const dayCell = monthCard?.querySelector('.gc-year-view__day') as HTMLElement;
		const dayNumber = dayCell?.querySelector('.gc-year-view__day-number') as HTMLElement;
		const lunarText = dayCell?.querySelector('.gc-year-view__lunar-text') as HTMLElement;
		const monthsGrid = container.querySelector('.gc-year-view__months') as HTMLElement;

		// 如果DOM未完全渲染，使用默认值
		if (!dayNumber || !lunarText || !monthsGrid) {
			return { ...this.DEFAULT_METRICS };
		}

		const dayNumberStyle = getComputedStyle(dayNumber);
		const lunarStyle = getComputedStyle(lunarText);
		const dayStyle = getComputedStyle(dayCell);
		const gridStyle = getComputedStyle(monthsGrid);

		return {
			dayNumberFontSize: parseFloat(dayNumberStyle.fontSize) || this.DEFAULT_METRICS.dayNumberFontSize,
			lunarFontSize: parseFloat(lunarStyle.fontSize) || this.DEFAULT_METRICS.lunarFontSize,
			dayPadding: (parseFloat(dayStyle.paddingTop) || 0) + (parseFloat(dayStyle.paddingBottom) || 0),
			monthsGap: parseFloat(gridStyle.columnGap) || this.DEFAULT_METRICS.monthsGap
		};
	}

	/**
	 * 获取CSS尺寸（带缓存）
	 */
	private static getMetrics(container: HTMLElement): CSSMetrics {
		const now = Date.now();
		if (this.cachedMetrics && now < this.cacheExpiry) {
			return this.cachedMetrics;
		}

		this.cachedMetrics = this.readCSSMetrics(container);
		this.cacheExpiry = now + this.CACHE_DURATION;
		return this.cachedMetrics;
	}

	/**
	 * 计算给定布局所需的最小容器宽度
	 * @param columns 列数 (1, 2, 3, 4)
	 * @param container 容器元素（用于读取实际CSS值）
	 * @returns 最小容器宽度（px）
	 */
	static calculateMinContainerWidth(columns: number, container: HTMLElement): number {
		const metrics = this.getMetrics(container);

		// 单元格内容需要的高度（aspect-ratio=1时也等于宽度）
		const contentHeight = metrics.dayNumberFontSize + metrics.lunarFontSize +
						   metrics.dayPadding + this.EXTRA_VERTICAL_SPACE;

		// 单个月卡片的最小宽度（7列日期），应用安全系数
		const minMonthCardWidth = Math.ceil(contentHeight * 7 * this.SAFETY_FACTOR);

		// 容器最小宽度 = 月卡片宽度 × 列数 + gap × (列数-1)
		return minMonthCardWidth * columns + metrics.monthsGap * (columns - 1);
	}

	/**
	 * 根据容器宽度计算最优布局
	 * @param containerWidth 容器实际宽度
	 * @param container 容器元素
	 * @returns 最优布局模式
	 */
	static calculateOptimalLayout(containerWidth: number, container: HTMLElement): YearViewLayout {
		// 从最密集布局(4列)开始检查
		for (const columns of [4, 3, 2, 1]) {
			const minWidth = this.calculateMinContainerWidth(columns, container);
			if (containerWidth >= minWidth) {
				return this.getLayoutForColumns(columns);
			}
		}
		return '1x12';
	}

	/**
	 * 获取列数对应的布局模式
	 */
	private static getLayoutForColumns(columns: number): YearViewLayout {
		const layoutMap: Record<number, YearViewLayout> = {
			4: '4x3',
			3: '3x4',
			2: '2x6',
			1: '1x12'
		};
		return layoutMap[columns];
	}

	/**
	 * 获取布局的列数和行数
	 */
	static getLayoutDimensions(layout: YearViewLayout): { columns: number; rows: number } {
		const dimensions: Record<YearViewLayout, { columns: number; rows: number }> = {
			'4x3': { columns: 4, rows: 3 },
			'3x4': { columns: 3, rows: 4 },
			'2x6': { columns: 2, rows: 6 },
			'1x12': { columns: 1, rows: 12 }
		};
		return dimensions[layout];
	}

	/**
	 * 清除缓存（当主题或字体设置变化时调用）
	 */
	static clearCache(): void {
		this.cachedMetrics = null;
		this.cacheExpiry = 0;
	}
}
