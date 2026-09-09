import { renderSummaryCard } from './summaryCard';
import type { DashboardStats } from '../../../types';

function makeStats(over: Partial<DashboardStats> = {}): DashboardStats {
  return {
    todayTotal: 8,
    todayDone: 6,
    todayPending: 2,
    completionRate: 0.75,
    overdueCount: 3,
    overdue: [],
    dueToday: [],
    dueNext7Days: [],
    doneTodayTasks: [],
    dailyDone: [],
    totalDone30d: 47,
    avgPerDay: 1.6,
    ...over
  };
}

describe('renderSummaryCard', () => {
  test('环 arc 的 stroke-dasharray 与完成率一致，圆头端点', () => {
    const el = renderSummaryCard(makeStats());
    const arc = el.querySelector('.tb-dash-ring-arc') as SVGCircleElement;
    expect(arc).toBeTruthy();
    expect(arc.getAttribute('stroke-dasharray')).toBe('212.1 282.7'); // 0.75 × 2π×45
    expect(arc.getAttribute('stroke-linecap')).toBe('round');
  });

  test('中心文本：百分比 + n/m 完成', () => {
    const el = renderSummaryCard(makeStats());
    expect(el.querySelector('.tb-dash-ring-pct')!.textContent).toBe('75%');
    expect(el.querySelector('.tb-dash-ring-sub')!.textContent).toBe('6/8 完成');
  });

  test('三个磁贴数字：待办 2 / 已完成 6 / 逾期 3', () => {
    const el = renderSummaryCard(makeStats());
    const texts = Array.from(el.querySelectorAll('.tb-dash-tile')).map(t => t.textContent);
    expect(texts[0]).toContain('2');
    expect(texts[0]).toContain('今日待办');
    expect(texts[1]).toContain('6');
    expect(texts[1]).toContain('已完成');
    expect(texts[2]).toContain('3');
    expect(texts[2]).toContain('逾期');
  });

  test('0 任务空态：环显示 — 与「还没有任务」', () => {
    const el = renderSummaryCard(makeStats({
      todayTotal: 0, todayDone: 0, todayPending: 0, completionRate: 0
    }));
    expect(el.querySelector('.tb-dash-ring-pct')!.textContent).toBe('—');
    expect(el.querySelector('.tb-dash-ring-sub')!.textContent).toBe('还没有任务');
  });
});
