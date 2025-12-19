import { BaseCalendarRenderer } from './BaseCalendarRenderer';
import type { GanttTask } from '../types';
import { formatDate } from '../utils';

/**
 * 甘特图视图渲染器
 */
export class GanttViewRenderer extends BaseCalendarRenderer {
  private startField: 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate' = 'startDate';
  private endField: 'createdDate' | 'startDate' | 'scheduledDate' | 'dueDate' | 'completionDate' | 'cancelledDate' = 'dueDate';
  private statusFilter: 'all' | 'completed' | 'uncompleted' = 'all';

  public getStartField() { return this.startField; }
  public setStartField(v: any) { this.startField = v; }
  public getEndField() { return this.endField; }
  public setEndField(v: any) { this.endField = v; }
  public getStatusFilter() { return this.statusFilter; }
  public setStatusFilter(v: 'all' | 'completed' | 'uncompleted') { this.statusFilter = v; }

  render(container: HTMLElement, currentDate: Date): void {
    // 根容器
    const root = container.createDiv('calendar-gantt-view');
    // 加载并渲染
    this.loadAndRenderGantt(root);
  }

  private async loadAndRenderGantt(root: HTMLElement): Promise<void> {
    root.empty();
    const tasksAll: GanttTask[] = this.plugin.taskCache.getAllTasks();

    // 状态筛选
    let tasks = tasksAll;
    if (this.statusFilter === 'completed') tasks = tasks.filter(t => t.completed);
    if (this.statusFilter === 'uncompleted') tasks = tasks.filter(t => !t.completed);

    // 过滤出具备时间范围的任务
    const withRange = tasks
      .map(t => ({ t, start: (t as any)[this.startField], end: (t as any)[this.endField] }))
      .filter(x => x.start && x.end)
      .map(x => ({ task: x.t, start: new Date(x.start), end: new Date(x.end) }))
      .filter(x => !isNaN(x.start.getTime()) && !isNaN(x.end.getTime()) && x.end >= x.start);

    if (withRange.length === 0) {
      root.createEl('div', { text: '暂无可绘制的任务范围', cls: 'gantt-task-empty' });
      return;
    }

    // 时间范围
    const minStart = new Date(Math.min(...withRange.map(x => x.start.getTime())));
    const maxEnd = new Date(Math.max(...withRange.map(x => x.end.getTime())));
    const days = Math.max(1, Math.ceil((maxEnd.getTime() - minStart.getTime()) / 86400000) + 1);

    // 头部日期刻度
    const header = root.createDiv('calendar-gantt-header');
    header.createDiv('gantt-task-header'); // 左侧占位
    const scale = header.createDiv('gantt-timeline-header');
    for (let i = 0; i < days; i++) {
      const d = new Date(minStart);
      d.setDate(d.getDate() + i);
      const cell = scale.createDiv('gantt-date-cell');
      cell.setText(formatDate(d, 'YYYY-MM-DD'));
    }

    // 行：每个任务一条泳道
    const body = root.createDiv('calendar-gantt-body');

    for (const item of withRange) {
      const row = body.createDiv('calendar-gantt-row');
      // 左侧任务列
      const taskCell = row.createDiv('gantt-task-cell');
      const cleaned = this.cleanTaskDescription(item.task.content);
      const gf = (this.plugin?.settings?.globalTaskFilter || '').trim();
      if (this.plugin?.settings?.showGlobalFilterInTaskText && gf) {
        taskCell.appendText(gf + ' ');
      }
      this.renderTaskDescriptionWithLinks(taskCell, cleaned);

      // 点击打开文件
      taskCell.addEventListener('click', async () => {
        await this.openTaskFile(item.task);
      });

      // 右侧时间轴
      const lane = row.createDiv('gantt-timeline-cell');
      lane.style.setProperty('--gantt-days', String(days));

      // 计算位置
      const startOffsetDays = Math.max(0, Math.floor((item.start.getTime() - minStart.getTime()) / 86400000));
      const durationDays = Math.max(1, Math.floor((item.end.getTime() - item.start.getTime()) / 86400000) + 1);
      const leftPct = (startOffsetDays / days) * 100;
      const widthPct = (durationDays / days) * 100;

      const bar = lane.createDiv('gantt-bar');
      bar.style.left = leftPct + '%';
      bar.style.width = widthPct + '%';
      bar.setAttr('title', `${formatDate(item.start, 'YYYY-MM-DD')} → ${formatDate(item.end, 'YYYY-MM-DD')}`);
      if (item.task.completed) bar.addClass('completed');
    }
  }
}
