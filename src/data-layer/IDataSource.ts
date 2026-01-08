/**
 * IDataSource - 数据源抽象接口
 *
 * 所有数据源（Markdown、飞书等）都必须实现此接口。
 * 提供统一的数据访问方式，支持多数据源扩展。
 */

import {
	DataSourceConfig,
	DataSourceChanges,
	ExternalTask,
	SyncStatus,
	TaskChanges
} from './types';

/**
 * 数据源变更事件处理器
 */
export interface ChangeEventHandler {
	(changes: DataSourceChanges): void | Promise<void>;
}

/**
 * 数据源接口
 *
 * 所有数据源都必须实现此接口，提供统一的数据访问方式。
 */
export interface IDataSource {
	/**
	 * 数据源唯一标识符
	 */
	readonly sourceId: string;

	/**
	 * 数据源显示名称
	 */
	readonly sourceName: string;

	/**
	 * 是否只读（如仅导入的远程数据源）
	 */
	readonly isReadOnly: boolean;

	/**
	 * 初始化数据源
	 * @param config - 数据源配置
	 */
	initialize(config: DataSourceConfig): Promise<void>;

	/**
	 * 获取所有任务
	 * @returns 任务列表
	 */
	getTasks(): Promise<ExternalTask[]>;

	/**
	 * 监听数据变化
	 * @param handler - 变化事件处理器
	 */
	onChange(handler: ChangeEventHandler): void;

	/**
	 * 创建任务
	 * @param task - 任务对象
	 * @returns 任务ID
	 */
	createTask(task: ExternalTask): Promise<string>;

	/**
	 * 更新任务
	 * @param taskId - 任务ID
	 * @param changes - 变更内容
	 */
	updateTask(taskId: string, changes: TaskChanges): Promise<void>;

	/**
	 * 删除任务
	 * @param taskId - 任务ID
	 */
	deleteTask(taskId: string): Promise<void>;

	/**
	 * 获取同步状态
	 * @returns 同步状态信息
	 */
	getSyncStatus(): Promise<SyncStatus>;

	/**
	 * 销毁数据源，释放资源
	 */
	destroy(): void;
}

/**
 * 数据源工厂接口
 *
 * 用于动态创建数据源实例
 */
export interface IDataSourceFactory {
	/**
	 * 创建数据源实例
	 * @param config - 数据源配置
	 * @returns 数据源实例
	 */
	create(config: DataSourceConfig): IDataSource;

	/**
	 * 获取数据源类型
	 */
	getType(): string;
}
