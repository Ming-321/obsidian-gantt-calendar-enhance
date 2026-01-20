/**
 * 飞书 OAuth 辅助类
 *
 * 处理飞书用户认证流程，使用 user_access_token
 * API 文档:
 * - 获取授权码: https://open.feishu.cn/document/authentication-management/access-token/obtain-oauth-code
 * - 获取用户令牌（传统端点）: https://open.feishu.cn/document/authentication-management/access-token/obtain-user_token
 * - 刷新用户令牌（传统端点）: https://open.feishu.cn/document/authentication-management/access-token/refresh_user_token
 * - 获取用户信息: https://open.feishu.cn/document/authentication-management/management/get-user-info
 *
 * 注意：由于 CORS 限制，需要使用 Obsidian 的 requestUrl 方法进行 HTTP 请求
 */

import { Logger } from '../../../../utils/logger';

// ==================== API 端点常量 ====================

/**
 * 飞书 API 端点
 */
const API_ENDPOINTS = {
    /** 授权端点 */
    AUTH: 'https://accounts.feishu.cn/open-apis/authen/v1/authorize',
    /** 获取令牌端点（v2端点，使用 form-urlencoded 格式） */
    TOKEN: 'https://open.feishu.cn/open-apis/authen/v2/oauth/token',
    /** 刷新令牌端点（v2端点，使用 form-urlencoded 格式） */
    REFRESH: 'https://open.feishu.cn/open-apis/authen/v2/oauth/refresh',
    /** 获取用户信息端点 */
    USER_INFO: 'https://open.feishu.cn/open-apis/authen/v1/user_info',
    /** 获取日历列表端点 */
    CALENDAR_LIST: 'https://open.feishu.cn/open-apis/calendar/v4/calendars',
} as const;

/** 默认重定向 URI */
const DEFAULT_REDIRECT_URI = 'https://open.feishu.cn/api-explorer/loading';

// ==================== 类型定义 ====================

/**
 * HTTP 响应
 */
interface HttpResponse {
    status: number;
    headers: Record<string, string>;
    text: string;
}

/**
 * 请求函数类型
 */
type FetchFunction = (
    url: string,
    options?: {
        method?: string;
        body?: string;
        headers?: Record<string, string>;
    }
) => Promise<HttpResponse>;

/**
 * 飞书 OAuth 配置
 */
export interface FeishuOAuthConfig {
    clientId: string;
    clientSecret: string;
    redirectUri?: string;
    scopes?: string;
    accessToken?: string;
    refreshToken?: string;
    tokenExpireAt?: number;
}

/**
 * 飞书 Token 数据（v1 API）
 */
export interface FeishuTokenData {
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    name?: string;
    user_id?: string;
}

/**
 * 飞书 Token 响应（v1 API）
 */
export interface FeishuTokenResponse {
    code: number;
    msg: string;
    data?: FeishuTokenData;
}

/**
 * 飞书 Token 响应（v2 API，无 data 包裹层）
 */
export interface FeishuTokenResponseV2 {
    code?: number;
    error?: string;
    error_description?: string;
    access_token?: string;
    refresh_token?: string;
    expires_in?: number;
    token_type?: string;
    scope?: string;
}

/**
 * 飞书用户信息响应（authen/v1/user_info）
 */
export interface FeishuUserInfoResponse {
    code: number;
    msg: string;
    data?: {
        name: string;
        en_name: string;
        email: string;
        avatar_url: string;
        avatar_middle?: string;
        avatar_thumb?: string;
        user_id: string;
        open_id: string;
        union_id?: string;
    };
}

/**
 * 飞书用户信息
 */
export interface FeishuUserInfo {
    userId: string;
    name: string;
    enName: string;
    email: string;
    avatar: string;
}

/**
 * 飞书日历信息
 */
export interface FeishuCalendar {
    calendar_id: string;
    summary: string;
    summary_alias?: string;
    description?: string;
    color?: number;
    timezone?: string;
    permissions?: 'private' | 'show_only_free_busy' | 'show_details' | 'public';
    role?: 'owner' | 'writer' | 'reader' | 'free_busy_reader';
    type?: 'primary' | 'shared' | 'subscription';
}

/**
 * 飞书日历列表响应
 */
export interface FeishuCalendarListResponse {
    code: number;
    msg: string;
    data?: {
        calendar_list?: FeishuCalendar[];
        page_token?: string;
        has_more?: boolean;
    };
}

// ==================== 请求构建函数 ====================

/**
 * 构建授权 URL
 * @param clientId 应用 ID
 * @param redirectUri 重定向 URI
 * @param state 状态参数（防 CSRF）
 * @param scope 权限范围
 */
export function buildAuthUrl(
    clientId: string,
    redirectUri: string = DEFAULT_REDIRECT_URI,
    state?: string,
    scope?: string
): string {
    const params = new URLSearchParams();
    params.append('app_id', clientId);
    params.append('redirect_uri', redirectUri);
    if (state) {
        params.append('state', state);
    }
    if (scope) {
        params.append('scope', scope);
    }
    return `${API_ENDPOINTS.AUTH}?${params.toString()}`;
}

/**
 * 构建令牌交换请求体（v2 API，form-urlencoded 格式）
 * @param clientId 应用 ID (client_id)
 * @param clientSecret 应用密钥 (client_secret)
 * @param code 授权码
 * @param redirectUri 重定向 URI（必须与授权时使用的一致）
 */
export function buildTokenRequestBody(
    clientId: string,
    clientSecret: string,
    code: string,
    redirectUri: string
): string {
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'authorization_code');
    params.append('code', code);
    params.append('redirect_uri', redirectUri);
    return params.toString();
}

/**
 * 构建令牌刷新请求体（v2 API，form-urlencoded 格式）
 * @param clientId 应用 ID (client_id)
 * @param clientSecret 应用密钥 (client_secret)
 * @param refreshToken 刷新令牌 (refresh_token)
 */
export function buildRefreshTokenRequestBody(
    clientId: string,
    clientSecret: string,
    refreshToken: string
): string {
    const params = new URLSearchParams();
    params.append('client_id', clientId);
    params.append('client_secret', clientSecret);
    params.append('grant_type', 'refresh_token');
    params.append('refresh_token', refreshToken);
    return params.toString();
}

/**
 * 构建 Obsidian requestUrl 兼容的请求配置
 * @param url 请求 URL
 * @param method 请求方法
 * @param body 请求体
 * @param headers 请求头
 */
export function buildRequestUrlConfig(
    url: string,
    method: string,
    body?: string,
    headers?: Record<string, string>
): {
    url: string;
    method: string;
    headers?: Record<string, string>;
    body?: string;
    throw: boolean;
} {
    const config: {
        url: string;
        method: string;
        headers?: Record<string, string>;
        body?: string;
        throw: boolean;
    } = {
        url,
        method,
        throw: false,
    };

    // 设置请求头
    if (headers) {
        config.headers = headers;
    }

    // 只有非 GET 请求才传递 body
    if (method !== 'GET' && body) {
        config.body = body;
    }

    return config;
}

/**
 * 生成随机 state（防 CSRF）
 */
export function generateState(): string {
    return Math.random().toString(36).substring(2, 15) +
           Math.random().toString(36).substring(2, 15);
}

// ==================== 飞书 OAuth 类 ====================

/**
 * 飞书 OAuth 辅助类
 */
export class FeishuOAuth {
    /**
     * 获取默认重定向 URI
     */
    static getDefaultRedirectUri(): string {
        return DEFAULT_REDIRECT_URI;
    }

    /**
     * 生成授权 URL
     * @param config OAuth 配置
     * @returns 授权 URL
     */
    static getAuthUrl(config: FeishuOAuthConfig): string {
        const state = generateState();
        const scopes = config.scopes && config.scopes.length > 0
            ? config.scopes
            : 'calendar:calendar:readonly';
        return buildAuthUrl(
            config.clientId,
            config.redirectUri || DEFAULT_REDIRECT_URI,
            state,
            scopes
        );
    }

    /**
     * 交换授权码获取令牌（v2 API）
     * @param config OAuth 配置
     * @param code 授权码
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns Token 响应
     */
    static async exchangeCodeForToken(
        config: FeishuOAuthConfig,
        code: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuTokenResponseV2> {
        Logger.info('FeishuOAuth', 'Exchanging authorization code for token');

        // 使用辅助函数构建请求体
        const redirectUri = config.redirectUri || DEFAULT_REDIRECT_URI;
        const requestBodyStr = buildTokenRequestBody(config.clientId, config.clientSecret, code, redirectUri);

        // 打印完整请求信息用于调试
        console.log('=== 飞书 OAuth Token 交换请求 ===');
        console.log('URL:', API_ENDPOINTS.TOKEN);
        console.log('Method: POST');
        console.log('Content-Type: application/x-www-form-urlencoded');
        console.log('Request Body (完整):', requestBodyStr);
        console.log('App ID:', config.clientId);
        console.log('Authorization Code:', code);

        const response = await this.fetch(API_ENDPOINTS.TOKEN, {
            method: 'POST',
            body: requestBodyStr,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        }, fetchFn);

        // 打印完整响应信息
        console.log('=== 飞书 OAuth Token 交换响应 ===');
        console.log('Status:', response.status);
        console.log('Response Body (原始):', response.text);
        console.log('==========================');

        // v2 API 响应格式直接包含 access_token，无 data 包裹层
        const data = await this.parseResponse<FeishuTokenResponseV2>(response);

        // 检查错误响应（v2 可能返回 error 字段）
        if (data.error || (data.code !== undefined && data.code !== 0)) {
            const errorMsg = data.error_description || data.error || '未知错误';
            const errorCode = data.code || -1;
            console.error('=== Token 交换失败 ===');
            console.error('错误码:', errorCode);
            console.error('错误信息:', errorMsg);
            Logger.error('FeishuOAuth', 'Token exchange failed', { code: errorCode, msg: errorMsg });
            throw new Error(`飞书 OAuth 错误: ${errorMsg} (错误码: ${errorCode})`);
        }

        if (!data.access_token) {
            console.error('=== Token 交换失败 ===');
            console.error('响应中缺少 access_token');
            Logger.error('FeishuOAuth', 'Token response missing access_token');
            throw new Error('飞书 OAuth 错误: 响应中缺少 access_token');
        }

        Logger.info('FeishuOAuth', 'Token exchange successful', {
            hasAccessToken: !!data.access_token,
            hasRefreshToken: !!data.refresh_token,
            expiresIn: data.expires_in,
        });

        return data;
    }

    /**
     * 刷新访问令牌（v2 API）
     * @param config OAuth 配置
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns Token 响应
     */
    static async refreshAccessToken(
        config: FeishuOAuthConfig,
        fetchFn?: FetchFunction
    ): Promise<FeishuTokenResponseV2> {
        Logger.info('FeishuOAuth', 'Refreshing access token');

        if (!config.refreshToken) {
            throw new Error('没有可用的刷新令牌，请重新授权');
        }

        // 使用辅助函数构建请求体
        const requestBodyStr = buildRefreshTokenRequestBody(
            config.clientId,
            config.clientSecret,
            config.refreshToken
        );

        // 打印完整请求信息用于调试
        console.log('=== 飞书 OAuth Token 刷新请求 ===');
        console.log('URL:', API_ENDPOINTS.REFRESH);
        console.log('Method: POST');
        console.log('Content-Type: application/x-www-form-urlencoded');
        console.log('Request Body (完整):', requestBodyStr);

        const response = await this.fetch(API_ENDPOINTS.REFRESH, {
            method: 'POST',
            body: requestBodyStr,
            headers: {
                'Content-Type': 'application/x-www-form-urlencoded',
            },
        }, fetchFn);

        // 打印完整响应信息
        console.log('=== 飞书 OAuth Token 刷新响应 ===');
        console.log('Status:', response.status);
        console.log('Response Body (原始):', response.text);
        console.log('==========================');

        // v2 API 响应格式直接包含 access_token，无 data 包裹层
        const data = await this.parseResponse<FeishuTokenResponseV2>(response);

        // 检查错误响应（v2 可能返回 error 字段）
        if (data.error || (data.code !== undefined && data.code !== 0)) {
            const errorMsg = data.error_description || data.error || '未知错误';
            const errorCode = data.code || -1;
            console.error('=== Token 刷新失败 ===');
            console.error('错误码:', errorCode);
            console.error('错误信息:', errorMsg);
            Logger.error('FeishuOAuth', 'Token refresh failed', { code: errorCode, msg: errorMsg });
            throw new Error(`飞书刷新令牌错误: ${errorMsg} (错误码: ${errorCode})`);
        }

        if (!data.access_token) {
            console.error('=== Token 刷新失败 ===');
            console.error('响应中缺少 access_token');
            Logger.error('FeishuOAuth', 'Token refresh response missing access_token');
            throw new Error('飞书刷新令牌错误: 响应中缺少 access_token');
        }

        Logger.info('FeishuOAuth', 'Token refresh successful');
        return data;
    }

    /**
     * 获取用户信息
     * @param accessToken 访问令牌
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns 用户信息
     */
    static async getUserInfo(
        accessToken: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuUserInfo> {
        Logger.info('FeishuOAuth', 'Fetching user info');

        console.log('=== 飞书获取用户信息请求 ===');
        console.log('URL:', API_ENDPOINTS.USER_INFO);
        console.log('Method: GET');

        const response = await this.fetch(API_ENDPOINTS.USER_INFO, {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }, fetchFn);

        console.log('=== 飞书获取用户信息响应 ===');
        console.log('Status:', response.status);
        console.log('Response Body (原始):', response.text);
        console.log('==========================');

        const data = await this.parseResponse<FeishuUserInfoResponse>(response);

        if (data.code !== 0 || !data.data) {
            console.error('=== 获取用户信息失败 ===');
            console.error('错误码:', data.code);
            console.error('错误信息:', data.msg);
            Logger.error('FeishuOAuth', 'Get user info failed', { code: data.code, msg: data.msg });
            throw new Error(`获取用户信息失败: ${data.msg}`);
        }

        const userInfo = data.data;
        return {
            userId: userInfo.user_id,
            name: userInfo.name,
            enName: userInfo.en_name,
            email: userInfo.email,
            avatar: userInfo.avatar_url || userInfo.avatar_middle || userInfo.avatar_thumb || '',
        };
    }

    /**
     * 获取用户日历列表
     * @param accessToken 访问令牌
     * @param fetchFn 可选的请求函数（用于绕过 CORS）
     * @returns 日历列表
     */
    static async getCalendarList(
        accessToken: string,
        fetchFn?: FetchFunction
    ): Promise<FeishuCalendar[]> {
        Logger.info('FeishuOAuth', 'Fetching calendar list');

        // 构建 URL 参数
        const url = new URL(API_ENDPOINTS.CALENDAR_LIST);
        url.searchParams.append('page_size', '500');

        console.log('=== 飞书获取日历列表请求 ===');
        console.log('URL:', url.toString());

        const response = await this.fetch(url.toString(), {
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${accessToken}`,
            },
        }, fetchFn);

        console.log('=== 飞书获取日历列表响应 ===');
        console.log('Status:', response.status);
        console.log('Response Body (原始):', response.text);
        console.log('==========================');

        const data = await this.parseResponse<FeishuCalendarListResponse>(response);

        if (data.code !== 0) {
            console.error('=== 获取日历列表失败 ===');
            console.error('错误码:', data.code);
            console.error('错误信息:', data.msg);
            Logger.error('FeishuOAuth', 'Get calendar list failed', { code: data.code, msg: data.msg });
            throw new Error(`获取日历列表失败: ${data.msg}`);
        }

        const calendarList = data.data?.calendar_list || [];
        console.log(`=== 成功获取 ${calendarList.length} 个日历 ===`);
        calendarList.forEach((cal, index) => {
            const isPrimary = cal.type === 'primary';
            console.log(`${index + 1}. ${cal.summary} (${cal.calendar_id})${isPrimary ? ' [主日历]' : ''}`);
        });

        return calendarList;
    }

    /**
     * 创建 Obsidian requestUrl 兼容的 fetch 函数
     *
     * 用于在 Obsidian 插件环境中绕过 CORS 限制。
     *
     * @param requestUrl Obsidian 的 requestUrl 函数
     * @returns FetchFunction 兼容的请求函数
     */
    static createRequestFetch(requestUrl: typeof import('obsidian').requestUrl): FetchFunction {
        return async (url: string, options?: {
            method?: string;
            body?: string;
            headers?: Record<string, string>;
        }) => {
            const method = options?.method || 'GET';

            // 使用辅助函数构建请求配置
            const config = buildRequestUrlConfig(
                url,
                method,
                options?.body,
                options?.headers
            );

            const result = await requestUrl(config);

            // 检查状态码，如果是 4xx/5xx，记录错误信息
            if (result.status >= 400) {
                console.error('=== requestUrl HTTP 错误 ===');
                console.error('Status:', result.status);
                console.error('Headers:', result.headers);
                console.error('Body:', result.text);
                console.error('========================');
            }

            return {
                status: result.status,
                headers: result.headers || {},
                text: result.text || '',
            };
        };
    }

    /**
     * 格式化过期时间为可读字符串
     */
    static formatExpireTime(expireAt: number): string {
        const now = Date.now();
        const remaining = expireAt - now;

        if (remaining <= 0) {
            return '已过期';
        }

        const hours = Math.floor(remaining / (1000 * 60 * 60));
        const minutes = Math.floor((remaining % (1000 * 60 * 60)) / (1000 * 60));

        if (hours > 24) {
            const days = Math.floor(hours / 24);
            return `${days} 天 ${hours % 24} 小时后过期`;
        } else if (hours > 0) {
            return `${hours} 小时 ${minutes} 分钟后过期`;
        } else {
            return `${minutes} 分钟后过期`;
        }
    }

    // ==================== 私有方法 ====================

    /**
     * 发起 HTTP 请求
     */
    private static async fetch(
        url: string,
        options: {
            method?: string;
            body?: string;
            headers?: Record<string, string>;
        } = {},
        fetchFn?: FetchFunction
    ): Promise<HttpResponse> {
        const actualFetch = fetchFn || this.defaultFetch;
        return actualFetch(url, options);
    }

    /**
     * 默认的 fetch 实现（原生 fetch）
     */
    private static async defaultFetch(
        url: string,
        options: {
            method?: string;
            body?: string;
            headers?: Record<string, string>;
        } = {}
    ): Promise<HttpResponse> {
        const response = await fetch(url, {
            method: options.method || 'GET',
            headers: {
                'Content-Type': 'application/json',
                ...options.headers,
            },
            body: options.body,
        });

        // 转换 Headers 为普通对象
        const headersObj: Record<string, string> = {};
        response.headers.forEach((value, key) => {
            headersObj[key] = value;
        });

        return {
            status: response.status,
            headers: headersObj,
            text: await response.text(),
        };
    }

    /**
     * 解析 HTTP 响应
     */
    private static async parseResponse<T>(response: HttpResponse): Promise<T> {
        if (response.status >= 400) {
            throw new Error(`HTTP ${response.status}: ${response.text || 'Error'}`);
        }
        return JSON.parse(response.text) as T;
    }
}
