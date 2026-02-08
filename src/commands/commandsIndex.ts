/**
 * @fileoverview 命令注册统一入口
 * @module commands/commandsIndex
 */

import type GanttCalendarPlugin from '../../main';
import { registerCommonCommands } from './common';

/**
 * 注册所有命令
 * @param plugin 插件实例
 */
export function registerAllCommands(plugin: GanttCalendarPlugin): void {
	registerCommonCommands(plugin);
}
