/**
 * 飞书（Lark）数据源
 *
 * 实现飞书任务 API 的对接。
 * API 文档: https://open.feishu.cn/document/server-docs/docs/task-v1/task-list
 */

import { APIDataSource, APIResponse, APITaskDTO } from '../APIDataSource';
import type { DataSourceConfig } from '../../../types';
import { Logger } from '../../../../utils/logger';

/**
 * 飞书 API 配置
 */
interface FeishuConfig {
    appId: string;
    appSecret: string;
    tenantId?: string;
}

/**
 * 飞书任务 DTO
 */
interface FeishuTaskDTO {
    task_key: string;
    summary: string;
    note?: string;
    status: 'done' | 'in_progress' | 'archived';
    due: {
        timestamp?: number;
    };
    priority: 'high' | 'normal' | 'low';
    completed_time?: number;
    create_time: number;
    modify_time: number;
}

/**
 * 飞书 API 响应
 */
interface FeishuAPIResponse<T> {
    code: number;
    msg: string;
    data?: T;
}

/**
 * 飞书访问令牌响应
 */
interface FeishuTokenResponse {
    tenant_access_token: string;
    expire: number;
}

/**
 * 飞书数据源
 */
export class FeishuProvider extends APIDataSource {
    readonly sourceId = 'feishu';
    readonly sourceName = 'Feishu (Lark)';

    private feishuConfig: FeishuConfig;
    private accessToken?: string;
    private tokenExpireAt?: number;

    constructor(config: DataSourceConfig) {
        super(config);

        if (!config.api?.appId || !config.api?.appSecret) {
            throw new Error('Feishu requires appId and appSecret');
        }

        this.feishuConfig = {
            appId: config.api.appId,
            appSecret: config.api.appSecret,
            tenantId: config.api.tenantId,
        };
    }

    /**
     * 验证连接
     */
    protected async validateConnection(): Promise<boolean> {
        try {
            await this.ensureAccessToken();
            const response = await this.getTaskList(1);
            return response.code === 0;
        } catch (error) {
            Logger.error('FeishuProvider', 'Connection validation failed', error);
            return false;
        }
    }

    /**
     * 拉取任务列表
     */
    protected async apiFetchTasks(cursor?: string): Promise<APIResponse<APITaskDTO[]>> {
        await this.ensureAccessToken();

        const pageSize = 100;
        const pageToken = cursor;

        try {
            const response = await this.getTaskList(pageSize, pageToken);

            if (response.code === 0 && response.data) {
                const tasks = response.data.items || [];
                const dtoList: APITaskDTO[] = tasks.map(this.fromFeishuDTO);

                return {
                    success: true,
                    data: dtoList,
                    hasMore: response.data.has_more,
                    cursor: response.data.page_token,
                };
            }

            return {
                success: false,
                error: response.msg || 'Failed to fetch tasks',
            };
        } catch (error) {
            Logger.error('FeishuProvider', 'Fetch tasks failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 创建任务
     */
    protected async apiCreateTask(dto: APITaskDTO): Promise<APIResponse<string>> {
        await this.ensureAccessToken();

        const feishuTask = this.toFeishuDTO(dto);

        try {
            const response = await this.callAPI<FeishuAPIResponse<{ task_key: string }>>(
                '/open-apis/task/v1/tasks',
                'POST',
                {
                    summary: feishuTask.summary,
                    note: feishuTask.note,
                    due: feishuTask.due,
                    priority: feishuTask.priority,
                }
            );

            if (response.code === 0 && response.data) {
                return {
                    success: true,
                    data: response.data.task_key,
                };
            }

            return {
                success: false,
                error: response.msg || 'Failed to create task',
            };
        } catch (error) {
            Logger.error('FeishuProvider', 'Create task failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 更新任务
     */
    protected async apiUpdateTask(id: string, dto: APITaskDTO): Promise<APIResponse<void>> {
        await this.ensureAccessToken();

        const feishuTask = this.toFeishuDTO(dto);

        try {
            const response = await this.callAPI<FeishuAPIResponse<void>>(
                `/open-apis/task/v1/tasks/${id}`,
                'PATCH',
                {
                    summary: feishuTask.summary,
                    note: feishuTask.note,
                    due: feishuTask.due,
                    priority: feishuTask.priority,
                }
            );

            if (response.code === 0) {
                return { success: true };
            }

            return {
                success: false,
                error: response.msg || 'Failed to update task',
            };
        } catch (error) {
            Logger.error('FeishuProvider', 'Update task failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    /**
     * 删除任务
     */
    protected async apiDeleteTask(id: string): Promise<APIResponse<void>> {
        await this.ensureAccessToken();

        try {
            const response = await this.callAPI<FeishuAPIResponse<void>>(
                `/open-apis/task/v1/tasks/${id}`,
                'DELETE'
            );

            if (response.code === 0) {
                return { success: true };
            }

            return {
                success: false,
                error: response.msg || 'Failed to delete task',
            };
        } catch (error) {
            Logger.error('FeishuProvider', 'Delete task failed', error);
            return {
                success: false,
                error: error instanceof Error ? error.message : String(error),
            };
        }
    }

    // ==================== 飞书 API 方法 ====================

    /**
     * 获取访问令牌
     */
    private async ensureAccessToken(): Promise<void> {
        const now = Date.now();

        if (this.accessToken && this.tokenExpireAt && now < this.tokenExpireAt) {
            return;
        }

        try {
            const response = await fetch('https://open.feishu.cn/open-apis/auth/v3/tenant_access_token/internal', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    app_id: this.feishuConfig.appId,
                    app_secret: this.feishuConfig.appSecret,
                }),
            });

            const data: FeishuTokenResponse = await response.json();

            if (data.tenant_access_token) {
                this.accessToken = data.tenant_access_token;
                this.tokenExpireAt = now + (data.expire - 60) * 1000; // 提前1分钟过期
            } else {
                throw new Error('Failed to get access token');
            }
        } catch (error) {
            Logger.error('FeishuProvider', 'Get access token failed', error);
            throw error;
        }
    }

    /**
     * 调用飞书 API
     */
    private async callAPI<T>(
        path: string,
        method: 'GET' | 'POST' | 'PATCH' | 'DELETE' = 'GET',
        body?: any
    ): Promise<T> {
        if (!this.accessToken) {
            await this.ensureAccessToken();
        }

        const url = `https://open.feishu.cn${path}`;

        const options: RequestInit = {
            method,
            headers: {
                'Authorization': `Bearer ${this.accessToken}`,
                'Content-Type': 'application/json',
            },
        };

        if (body) {
            options.body = JSON.stringify(body);
        }

        const response = await fetch(url, options);
        return response.json();
    }

    /**
     * 获取任务列表
     */
    private async getTaskList(
        pageSize: number = 100,
        pageToken?: string
    ): Promise<FeishuAPIResponse<{
        items: FeishuTaskDTO[];
        has_more: boolean;
        page_token: string;
    }>> {
        const params = new URLSearchParams({
            page_size: String(pageSize),
        });

        if (pageToken) {
            params.append('page_token', pageToken);
        }

        return this.callAPI(`/open-apis/task/v1/tasks?${params.toString()}`);
    }

    /**
     * 将飞书 DTO 转换为通用 DTO
     */
    private fromFeishuDTO = (feishu: FeishuTaskDTO): APITaskDTO => {
        const now = Date.now();

        return {
            id: feishu.task_key,
            title: feishu.summary,
            description: feishu.note,
            completed: feishu.status === 'done',
            dueDate: feishu.due?.timestamp
                ? new Date(feishu.due.timestamp * 1000).toISOString()
                : undefined,
            priority: this.mapFeishuPriority(feishu.priority),
            status: feishu.status,
            lastModified: new Date(feishu.modify_time * 1000),
        };
    };

    /**
     * 将通用 DTO 转换为飞书 DTO
     */
    private toFeishuDTO(dto: APITaskDTO): Partial<FeishuTaskDTO> {
        return {
            summary: dto.title,
            note: dto.description,
            status: dto.completed ? 'done' : 'in_progress',
            due: dto.dueDate
                ? { timestamp: Math.floor(new Date(dto.dueDate).getTime() / 1000) }
                : undefined,
            priority: this.mapToFeishuPriority(dto.priority),
        };
    }

    /**
     * 映射飞书优先级到通用优先级
     */
    private mapFeishuPriority(priority: string): string {
        switch (priority) {
            case 'high':
                return 'high';
            case 'low':
                return 'low';
            case 'normal':
            default:
                return 'normal';
        }
    }

    /**
     * 映射通用优先级到飞书优先级
     */
    private mapToFeishuPriority(priority?: string): 'high' | 'normal' | 'low' {
        if (!priority) return 'normal';

        switch (priority) {
            case 'highest':
            case 'high':
                return 'high';
            case 'low':
            case 'lowest':
                return 'low';
            default:
                return 'normal';
        }
    }
}
