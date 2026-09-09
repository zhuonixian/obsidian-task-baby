import { computeDashboardStats } from './dashboardStats';
import type { IndexSnapshot, Task } from '../types';

const NOW = new Date(2026, 8, 10, 15); // 2026-09-10

function makeTask(over: Partial<Task> = {}): Task {
  return {
    sourcePath: 'DailyLife/2026/09/2026-09-10.md',
    sourceDate: new Date(2026, 8, 10),
    lineStart: 0,
    lineEnd: 0,
    rawText: '- [ ] x',
    body: 'x',
    bodyHash: 'h',
    checked: false,
    indent: 0,
    ...over
  };
}

function makeSnapshot(over: Partial<IndexSnapshot> = {}): IndexSnapshot {
  return {
    generatedAt: NOW,
    windowStart: new Date(2026, 7, 12),
    windowEnd: NOW,
    today: { pending: [], done: [], backlog: [] },
    byDate: new Map(),
    allPending: [],
    allDone: [],
    errors: [],
    unparsed: [],
    ...over
  };
}

describe('computeDashboardStats — 摘要', () => {
  test('完成率 = done/(done+pending)', () => {
    const done = [makeTask({ checked: true }), makeTask({ checked: true }), makeTask({ checked: true })];
    const pending = [makeTask()];
    const s = computeDashboardStats(makeSnapshot({ today: { pending, done, backlog: [] } }), NOW);
    expect(s.todayTotal).toBe(4);
    expect(s.todayDone).toBe(3);
    expect(s.todayPending).toBe(1);
    expect(s.completionRate).toBeCloseTo(0.75);
    expect(s.doneTodayTasks).toEqual(done);
  });

  test('0 任务 → completionRate 0，不除零', () => {
    const s = computeDashboardStats(makeSnapshot(), NOW);
    expect(s.todayTotal).toBe(0);
    expect(s.completionRate).toBe(0);
  });
});

describe('computeDashboardStats — due 分组', () => {
  test('边界：昨日=逾期，今日=dueToday，明日与 today+7=未来，today+8 与无 due 不入组', () => {
    const tasks = [
      makeTask({ meta: { tags: [], due: new Date(2026, 8, 9) } }),   // 9-09 逾期
      makeTask({ meta: { tags: [], due: new Date(2026, 8, 10, 23) } }), // 9-10 深夜 → 今日（日粒度）
      makeTask({ meta: { tags: [], due: new Date(2026, 8, 11) } }),  // 9-11 未来
      makeTask({ meta: { tags: [], due: new Date(2026, 8, 17) } }),  // 9-17 = today+7 未来（含）
      makeTask({ meta: { tags: [], due: new Date(2026, 8, 18) } }),  // 9-18 超出 → 不入组
      makeTask()                                                     // 无 meta → 不入组
    ];
    const s = computeDashboardStats(makeSnapshot({ allPending: tasks }), NOW);
    expect(s.overdue).toHaveLength(1);
    expect(s.dueToday).toHaveLength(1);
    expect(s.dueNext7Days).toHaveLength(2);
    expect(s.overdueCount).toBe(1);
  });

  test('逾期组按 due 升序（最早逾期的在前）', () => {
    const later = makeTask({ body: 'later', meta: { tags: [], due: new Date(2026, 8, 8) } });
    const earlier = makeTask({ body: 'earlier', meta: { tags: [], due: new Date(2026, 8, 5) } });
    const s = computeDashboardStats(makeSnapshot({ allPending: [later, earlier] }), NOW);
    expect(s.overdue.map(t => t.body)).toEqual(['earlier', 'later']);
  });
});

describe('computeDashboardStats — 热力图', () => {
  test('按 meta.done 分桶，无 meta.done 回退 sourceDate；固定 30 项', () => {
    const allDone = [
      makeTask({ checked: true, meta: { tags: [], done: new Date(2026, 8, 9) } }),
      makeTask({ checked: true, meta: { tags: [], done: new Date(2026, 8, 9, 20) } }),
      makeTask({ checked: true, sourceDate: new Date(2026, 8, 8) }) // 无 meta.done → 按 sourceDate
    ];
    const s = computeDashboardStats(makeSnapshot({ allDone }), NOW);
    expect(s.dailyDone).toHaveLength(30);
    expect(s.dailyDone[29].dateKey).toBe('2026-09-10');
    expect(s.dailyDone[29].count).toBe(0);
    expect(s.dailyDone[28]).toEqual({ dateKey: '2026-09-09', count: 2 });
    expect(s.dailyDone[27]).toEqual({ dateKey: '2026-09-08', count: 1 });
    expect(s.dailyDone[0].dateKey).toBe('2026-08-12');
    expect(s.totalDone30d).toBe(3);
    expect(s.avgPerDay).toBe(0.1);
  });
});
