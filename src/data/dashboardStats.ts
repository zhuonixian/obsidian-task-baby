// src/data/dashboardStats.ts
import type { DashboardStats, DailyDoneCount, IndexSnapshot, Task } from '../types';
import { formatYmd } from '../utils/dateUtils';

const HEATMAP_DAYS = 30;

function dayStart(d: Date): Date {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

export function computeDashboardStats(snapshot: IndexSnapshot, now: Date): DashboardStats {
  const { pending, done } = snapshot.today;

  const todayTotal = pending.length + done.length;
  const completionRate = todayTotal === 0 ? 0 : done.length / todayTotal;

  // —— due 分组（日粒度零点比较）——
  const today0 = dayStart(now).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const limit7 = today0 + 7 * dayMs;

  const overdue: Task[] = [];
  const dueToday: Task[] = [];
  const dueNext7Days: Task[] = [];
  for (const t of snapshot.allPending) {
    const due = t.meta?.due;
    if (!due) continue;
    const d0 = dayStart(due).getTime();
    if (d0 < today0) overdue.push(t);
    else if (d0 === today0) dueToday.push(t);
    else if (d0 <= limit7) dueNext7Days.push(t);
  }
  const byDueAsc = (a: Task, b: Task) =>
    dayStart(a.meta!.due!).getTime() - dayStart(b.meta!.due!).getTime();
  overdue.sort(byDueAsc);
  dueNext7Days.sort(byDueAsc);

  // —— 30 天热力图：优先 meta.done，无则回退 sourceDate ——
  const countByKey = new Map<string, number>();
  for (const t of snapshot.allDone) {
    const key = formatYmd(t.meta?.done ?? t.sourceDate);
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
  }
  const dailyDone: DailyDoneCount[] = [];
  let totalDone30d = 0;
  for (let i = HEATMAP_DAYS - 1; i >= 0; i--) {
    const d = new Date(dayStart(now));
    d.setDate(d.getDate() - i);
    const key = formatYmd(d);
    const count = countByKey.get(key) ?? 0;
    totalDone30d += count;
    dailyDone.push({ dateKey: key, count });
  }

  return {
    todayTotal,
    todayDone: done.length,
    todayPending: pending.length,
    completionRate,
    overdueCount: overdue.length,
    overdue,
    dueToday,
    dueNext7Days,
    doneTodayTasks: done,
    dailyDone,
    totalDone30d,
    avgPerDay: Math.round((totalDone30d / HEATMAP_DAYS) * 10) / 10
  };
}
