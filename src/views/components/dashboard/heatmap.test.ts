import { renderHeatmap, heatLevel } from './heatmap';
import type { DashboardStats, DailyDoneCount } from '../../../types';

function days30(counts: number[]): DailyDoneCount[] {
  // counts[i] 对应 today-29+i
  return counts.map((c, i) => {
    const d = new Date(2026, 8, 10 - (29 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { dateKey: key, count: c };
  });
}

function makeStats(over: Partial<DashboardStats> = {}): DashboardStats {
  return {
    todayTotal: 8, todayDone: 6, todayPending: 2, completionRate: 0.75,
    overdueCount: 0, overdue: [], dueToday: [], dueNext7Days: [],
    doneTodayTasks: [], dailyDone: days30(new Array(30).fill(0)),
    totalDone30d: 0, avgPerDay: 0,
    ...over
  };
}

describe('heatLevel', () => {
  test('0→l0, 1-2→l1, 3-4→l2, 5+→l3', () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(1)).toBe(1);
    expect(heatLevel(2)).toBe(1);
    expect(heatLevel(3)).toBe(2);
    expect(heatLevel(4)).toBe(2);
    expect(heatLevel(5)).toBe(3);
    expect(heatLevel(99)).toBe(3);
  });
});

describe('renderHeatmap', () => {
  test('渲染 30 个格子，色阶类与计数对应', () => {
    const counts = new Array(30).fill(0);
    counts[28] = 2;  // 9-09
    counts[29] = 5;  // 9-10
    const el = renderHeatmap(makeStats({ dailyDone: days30(counts) }));
    const cells = el.querySelectorAll('.tb-dash-hm-cell:not(.legend)');
    expect(cells.length).toBe(30);
    expect(cells[28].className).toContain('l1');
    expect(cells[29].className).toContain('l3');
    expect(cells[0].className).toContain('l0');
  });

  test('格子 title 含日期与数量（悬停 tooltip）', () => {
    const counts = new Array(30).fill(0);
    counts[29] = 3;
    const el = renderHeatmap(makeStats({ dailyDone: days30(counts) }));
    const cells = el.querySelectorAll('.tb-dash-hm-cell:not(.legend)');
    expect((cells[29] as HTMLElement).title).toBe('2026-09-10 · 完成 3 件');
  });

  test('头部汇总文案：共完成 N 件 · 日均 X', () => {
    const el = renderHeatmap(makeStats({ totalDone30d: 47, avgPerDay: 1.6 }));
    expect(el.querySelector('.tb-dash-heatmap-sum')!.textContent)
      .toBe('共完成 47 件 · 日均 1.6');
  });

  test('图例：少/多 + 4 档色块', () => {
    const el = renderHeatmap(makeStats());
    expect(el.querySelector('.tb-dash-hm-legend')!.textContent).toContain('少');
    expect(el.querySelector('.tb-dash-hm-legend')!.textContent).toContain('多');
    expect(el.querySelectorAll('.tb-dash-hm-cell.legend').length).toBe(4);
  });
});
