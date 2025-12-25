/**
 * 第一步：识别任务行
 *
 * 负责识别和解析 Markdown 文件中的任务行，提取任务的基本组成部分。
 * 使用 RegularExpressions.taskRegex 进行匹配。
 *
 * @fileoverview 任务行识别和解析
 * @module tasks/taskParser/step1
 */

import { RegularExpressions } from '../../utils/RegularExpressions';

// ==================== 类型定义 ====================

/**
 * 任务行匹配结果
 * 表示从原始任务行中解析出的各个组成部分
 */
export interface TaskLineMatch {
    /** 缩进内容（包括空格、制表符、> 符号等） */
    indent: string;

    /** 列表标记（如 -, *, +, 1., 1) 等） */
    listMarker: string;

    /** 复选框状态字符（空格、x、X、/ 等） */
    checkboxStatus: string;

    /** 复选框后的内容（包含所有任务属性和描述） */
    content: string;
}

// ==================== 主要函数 ====================

/**
 * 判断一行是否为任务行
 *
 * 使用 taskRegex 快速检测一行文本是否符合任务格式。
 *
 * @param line - 待检测的文本行
 * @returns 如果是任务行返回 true，否则返回 false
 *
 * @example
 * ```ts
 * isTaskLine("- [ ] 待办任务")        // true
 * isTaskLine("  - [x] 已完成任务")     // true
 * isTaskLine("> - [ ] 引用任务")       // true
 * isTaskLine("1. [ ] 数字任务")        // true
 * isTaskLine("- 普通列表")             // false
 * isTaskLine("    普通段落")           // false
 * ```
 */
export function isTaskLine(line: string): boolean {
    return RegularExpressions.taskRegex.test(line);
}

/**
 * 解析任务行，提取任务各组成部分
 *
 * 使用 taskRegex 匹配并解析任务行，返回结构化的解析结果。
 *
 * @param line - 待解析的文本行
 * @returns 解析结果对象，如果不是有效任务行则返回 null
 *
 * @example
 * ```ts
 * parseTaskLine("- [ ] 🎯 完成项目 ⏫ 📅 2024-01-15")
 * // 返回:
 * // {
 * //   indent: "",
 * //   listMarker: "-",
 * //   checkboxStatus: " ",
 * //   content: "🎯 完成项目 ⏫ 📅 2024-01-15"
 * // }
 *
 * parseTaskLine("  - [x] 已完成的任务")
 * // 返回:
 * // {
 * //   indent: "  ",
 * //   listMarker: "-",
 * //   checkboxStatus: "x",
 * //   content: "已完成的任务"
 * // }
 * ```
 */
export function parseTaskLine(line: string): TaskLineMatch | null {
    const match = line.match(RegularExpressions.taskRegex);
    if (!match) return null;

    const [, indent, listMarker, checkboxStatus, content] = match;
    return { indent, listMarker, checkboxStatus, content };
}

/**
 * 从多行文本中提取所有任务行
 *
 * 遍历文本行，过滤出所有符合任务格式的行。
 *
 * @param lines - 文本行数组
 * @returns 包含行号和匹配结果的数组
 *
 * @example
 * ```ts
 * const lines = [
 *   "# 标题",
 *   "- [ ] 任务1",
 *   "普通文本",
 *   "- [x] 任务2"
 * ];
 * extractTaskLines(lines)
 * // 返回: [
 * //   { lineNumber: 1, match: { indent: "", listMarker: "-", ... } },
 * //   { lineNumber: 3, match: { indent: "", listMarker: "-", ... } }
 * // ]
 * ```
 */
export function extractTaskLines(lines: string[]): Array<{ lineNumber: number; match: TaskLineMatch }> {
    const results: Array<{ lineNumber: number; match: TaskLineMatch }> = [];

    for (let i = 0; i < lines.length; i++) {
        const match = parseTaskLine(lines[i]);
        if (match) {
            results.push({ lineNumber: i, match });
        }
    }

    return results;
}
