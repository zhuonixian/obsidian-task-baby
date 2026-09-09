import { renderDoneToday } from './doneToday';
import type { DueGroupHandlers } from './dueGroups';
import type { DashboardStats, Task } from '../../../types';

function makeTask(over: Partial<Task> = {}): Task {
  return {
    sourcePath: 'DailyLife/2026/09/2026-09-10.md',
    sourceDate: new Date(2026, 8, 10),
    lineStart: 0, lineEnd: 0,
    rawText: '- [x] y', body: 'y', bodyHash: 'h',
    checked: true, indent: 0,
    ...over
  };
}

function makeStats(done: Task[]): DashboardStats {
  return {
    todayTotal: done.length, todayDone: done.length, todayPending: 0,
    completionRate: 1, overdueCount: 0,
    overdue: [], dueToday: [], dueNext7Days: [],
    doneTodayTasks: done, dailyDone: [], totalDone30d: 0, avgPerDay: 0
  };
}

const handlers: DueGroupHandlers = { onTaskToggle: jest.fn(), onTaskClick: jest.fn() };

describe('renderDoneToday', () => {
  test('标题计数与默认收起', () => {
    const el = renderDoneToday(makeStats([makeTask(), makeTask()]), handlers);
    expect(el.querySelector('.tb-dash-done-title')!.textContent).toBe('✅ 今日已完成 · 2 件');
    const list = el.querySelector('.tb-dash-done-list') as HTMLElement;
    expect(list.style.display).toBe('none');
  });

  test('点击 header 展开、再点收起，箭头跟随', () => {
    const el = renderDoneToday(makeStats([makeTask()]), handlers);
    const header = el.querySelector('.tb-dash-done-header') as HTMLElement;
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const list = el.querySelector('.tb-dash-done-list') as HTMLElement;
    expect(list.style.display).toBe('block');
    expect(el.querySelector('.tb-dash-done-arrow')!.textContent).toBe('▼');
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(list.style.display).toBe('none');
    expect(el.querySelector('.tb-dash-done-arrow')!.textContent).toBe('▶');
  });

  test('展开后列表包含已完成任务行（划线样式）', () => {
    const el = renderDoneToday(makeStats([makeTask({ body: '写日报' })]), handlers);
    const list = el.querySelector('.tb-dash-done-list') as HTMLElement;
    const body = list.querySelector('.tb-task-body') as HTMLElement;
    expect(body.textContent).toBe('写日报');
    expect(body.className).toContain('tb-done');
  });

  test('0 件时列表含空态文案', () => {
    const el = renderDoneToday(makeStats([]), handlers);
    const list = el.querySelector('.tb-dash-done-list') as HTMLElement;
    expect(list.textContent).toContain('还没有完成的任务');
  });
});
