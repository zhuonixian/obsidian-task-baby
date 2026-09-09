// src/data/dashboardStats.ts
import type { DashboardStats, DailyDoneCount, IndexSnapshot, Task, WeekDayStat } from '../types';
import { formatYmd } from '../utils/dateUtils';

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
  const limit7Date = new Date(today0);
  limit7Date.setDate(limit7Date.getDate() + 7);
  const limit7 = limit7Date.getTime();

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
    (a.meta?.due?.getTime() ?? 0) - (b.meta?.due?.getTime() ?? 0);
  overdue.sort(byDueAsc);
  dueNext7Days.sort(byDueAsc);

  // —— 热力图：窗口收敛到扫描范围（≤30 天），优先 meta.done，无则回退 sourceDate ——
  const countByKey = new Map<string, number>();
  for (const t of snapshot.allDone) {
    const key = formatYmd(t.meta?.done ?? t.sourceDate);
    countByKey.set(key, (countByKey.get(key) ?? 0) + 1);
  }
  // 窗口日历天数（含两端），Math.round 防 DST 半小时级偏差
  const windowDays = Math.round(
    (dayStart(snapshot.windowEnd).getTime() - dayStart(snapshot.windowStart).getTime()) / (24 * 60 * 60 * 1000)
  ) + 1;
  const heatmapDays = Math.max(1, Math.min(30, windowDays));
  const dailyDone: DailyDoneCount[] = [];
  let totalDone30d = 0;
  for (let i = heatmapDays - 1; i >= 0; i--) {
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
    doneTodayTasks: [...done],
    dailyDone,
    totalDone30d,
    avgPerDay: Math.round((totalDone30d / heatmapDays) * 10) / 10
  };
}

// —— 周手账周视图：本周一..周日 7 项 ——
const DOW_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export function computeWeekDays(snapshot: IndexSnapshot, now: Date): WeekDayStat[] {
  const monday = dayStart(now);
  monday.setDate(monday.getDate() - (now.getDay() + 6) % 7);
  const todayKey = formatYmd(now);
  const days: WeekDayStat[] = [];
  for (let i = 0; i < 7; i++) {
    const d = new Date(monday);
    d.setDate(monday.getDate() + i);
    const key = formatYmd(d);
    const bucket = snapshot.byDate.get(key);
    days.push({
      dateKey: key,
      day: d.getDate(),
      dowLabel: DOW_LABELS[i],
      isToday: key === todayKey,
      isWeekend: i >= 5,
      isFuture: key > todayKey,
      pending: bucket?.pending ?? [],
      done: bucket?.done ?? []
    });
  }
  return days;
}
