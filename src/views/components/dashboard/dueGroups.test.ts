import { renderDueGroups } from './dueGroups';
import type { DueGroupHandlers } from './dueGroups';
import type { DashboardStats, Task } from '../../../types';

function makeTask(over: Partial<Task> = {}): Task {
  return {
    sourcePath: 'DailyLife/2026/09/2026-09-10.md',
    sourceDate: new Date(2026, 8, 10),
    lineStart: 0, lineEnd: 0,
    rawText: '- [ ] x', body: 'x', bodyHash: 'h',
    checked: false, indent: 0,
    ...over
  };
}

function makeStats(over: Partial<DashboardStats> = {}): DashboardStats {
  return {
    todayTotal: 0, todayDone: 0, todayPending: 0, completionRate: 0,
    overdueCount: 0, overdue: [], dueToday: [], dueNext7Days: [],
    doneTodayTasks: [], dailyDone: [], totalDone30d: 0, avgPerDay: 0,
    ...over
  };
}

function makeHandlers(): DueGroupHandlers & { onTaskToggle: jest.Mock; onTaskClick: jest.Mock } {
  return { onTaskToggle: jest.fn(), onTaskClick: jest.fn() };
}

describe('renderDueGroups', () => {
  test('三组标题带计数', () => {
    const el = renderDueGroups(makeStats({
      overdue: [makeTask()], dueToday: [makeTask(), makeTask()], dueNext7Days: []
    }), makeHandlers());
    const titles = Array.from(el.querySelectorAll('.tb-dash-due-title')).map(t => t.textContent);
    expect(titles[0]).toBe('⚠ 逾期未完成 · 1');
    expect(titles[1]).toBe('📍 今日到期 · 2');
    expect(titles[2]).toBe('🗓 未来 7 天 · 0');
  });

  test('任务行带 📅MM-DD 到期标签', () => {
    const t = makeTask({ meta: { tags: [], due: new Date(2026, 8, 12) } });
    const el = renderDueGroups(makeStats({ dueNext7Days: [t] }), makeHandlers());
    const futureCard = el.querySelectorAll('.tb-dash-due-card')[2];
    expect(futureCard.querySelector('.tb-task-src')!.textContent).toBe('📅09-12');
  });

  test('dueToday 组行不带日期标签（今日冗余）', () => {
    const t = makeTask({ meta: { tags: [], due: new Date(2026, 8, 10) } });
    const el = renderDueGroups(makeStats({ dueToday: [t] }), makeHandlers());
    const todayCard = el.querySelectorAll('.tb-dash-due-card')[1];
    expect(todayCard.querySelector('.tb-task-src')).toBeNull();
  });

  test('逾期组：来源日期标签 + 跨年 due 显示年份', () => {
    const t = makeTask({
      sourceDate: new Date(2026, 8, 2),
      meta: { tags: [], due: new Date(2025, 11, 30) }
    });
    const el = renderDueGroups(makeStats({ overdue: [t] }), makeHandlers());
    const overdueCard = el.querySelectorAll('.tb-dash-due-card')[0];
    const labels = Array.from(overdueCard.querySelectorAll('.tb-task-src'))
      .map(s => s.textContent);
    expect(labels).toContain('📅2025-12-30');
    expect(labels).toContain('09-02');
    expect(labels.length).toBe(2);
  });

  test('空组显示「无 🎉」', () => {
    const el = renderDueGroups(makeStats(), makeHandlers());
    expect(el.querySelector('.tb-dash-due-empty')!.textContent).toBe('无 🎉');
  });

  test('勾选 checkbox 触发 onTaskToggle', () => {
    const t = makeTask({ meta: { tags: [], due: new Date(2026, 8, 10) } });
    const handlers = makeHandlers();
    const el = renderDueGroups(makeStats({ dueToday: [t] }), handlers);
    const box = el.querySelector('.tb-task-checkbox') as HTMLInputElement;
    box.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handlers.onTaskToggle).toHaveBeenCalledWith(t);
    expect(handlers.onTaskClick).not.toHaveBeenCalled();
  });
});
