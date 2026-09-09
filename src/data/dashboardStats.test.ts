import { computeDashboardStats, computeWeekDays } from './dashboardStats';
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

  test('未来 7 天组按 due 升序', () => {
    const later = makeTask({ body: 'later', meta: { tags: [], due: new Date(2026, 8, 15) } });
    const earlier = makeTask({ body: 'earlier', meta: { tags: [], due: new Date(2026, 8, 11) } });
    const s = computeDashboardStats(makeSnapshot({ allPending: [later, earlier] }), NOW);
    expect(s.dueNext7Days.map(t => t.body)).toEqual(['earlier', 'later']);
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

  test('窗口小于 30 天时热力图收敛到窗口天数', () => {
    const s = computeDashboardStats(
      makeSnapshot({ windowStart: new Date(2026, 8, 4) }), // 9-04..9-10 = 7 天
      NOW
    );
    expect(s.dailyDone).toHaveLength(7);
    expect(s.dailyDone[0].dateKey).toBe('2026-09-04');
    expect(s.dailyDone[6].dateKey).toBe('2026-09-10');
  });
});

describe('computeDashboardStats — 副本语义', () => {
  test('doneTodayTasks 是快照数组的副本而非同引用', () => {
    const done = [makeTask({ checked: true })];
    const snap = makeSnapshot({ today: { pending: [], done, backlog: [] } });
    const s = computeDashboardStats(snap, NOW);
    expect(s.doneTodayTasks).not.toBe(snap.today.done);
    expect(s.doneTodayTasks).toEqual(snap.today.done);
  });
});

describe('computeWeekDays — 周手账周视图', () => {
  test('NOW=周四 → 恒 7 项，首项周一 9-07，末项周日 9-13', () => {
    const days = computeWeekDays(makeSnapshot(), NOW); // NOW = 2026-09-10 周四
    expect(days).toHaveLength(7);
    expect(days[0]).toMatchObject({ dateKey: '2026-09-07', dowLabel: '一', day: 7 });
    expect(days[6]).toMatchObject({ dateKey: '2026-09-13', dowLabel: '日', day: 13 });
    expect(days.map(d => d.dowLabel)).toEqual(['一', '二', '三', '四', '五', '六', '日']);
  });

  test('now=周日 → 归属前一周的周一（getDay=0 回退 6 天）', () => {
    const days = computeWeekDays(makeSnapshot(), new Date(2026, 8, 13, 12)); // 2026-09-13 周日
    expect(days[0].dateKey).toBe('2026-09-07');
    expect(days[6].dateKey).toBe('2026-09-13');
  });

  test('跨月周：now=2026-09-01 周二 → 首项 2026-08-31 周一', () => {
    const days = computeWeekDays(makeSnapshot(), new Date(2026, 8, 1, 12));
    expect(days[0].dateKey).toBe('2026-08-31');
    expect(days[1].dateKey).toBe('2026-09-01');
    expect(days[6].dateKey).toBe('2026-09-06');
  });

  test('isToday 仅今日、isWeekend 恰六日、isFuture 仅今日之后', () => {
    const days = computeWeekDays(makeSnapshot(), NOW);
    expect(days.filter(d => d.isToday).map(d => d.dateKey)).toEqual(['2026-09-10']);
    expect(days.filter(d => d.isWeekend).map(d => d.dateKey)).toEqual(['2026-09-12', '2026-09-13']);
    expect(days.filter(d => d.isFuture).map(d => d.dateKey)).toEqual(['2026-09-11', '2026-09-12', '2026-09-13']);
  });

  test('byDate 分桶：pending/done 归属正确，无桶日期为空数组', () => {
    const snap = makeSnapshot({
      byDate: new Map([
        ['2026-09-09', {
          pending: [makeTask({ body: 'p1' })],
          done: [makeTask({ body: 'd1', checked: true }), makeTask({ body: 'd2', checked: true })]
        }]
      ])
    });
    const days = computeWeekDays(snap, NOW);
    expect(days[2]).toMatchObject({ dateKey: '2026-09-09' });
    expect(days[2].pending.map(t => t.body)).toEqual(['p1']);
    expect(days[2].done.map(t => t.body)).toEqual(['d1', 'd2']);
    expect(days[0].pending).toEqual([]);
    expect(days[0].done).toEqual([]);
  });
});
