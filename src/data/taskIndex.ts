import type { IndexSnapshot, Task, Priority } from '../types';
import { computeWindowStart, dateToYmd, isSameDay } from '../utils/dateUtils';

const PRIORITY_WEIGHT: Record<Priority, number> = {
  highest: 0,
  high: 1,
  medium: 2,
  low: 3,
  lowest: 4
};

export function computeBacklog(allTasks: Task[], today: Date): Task[] {
  return allTasks
    .filter(t => !t.checked && !isSameDay(t.sourceDate, today) && t.sourceDate < today)
    .sort((a, b) => {
      const pa = PRIORITY_WEIGHT[a.meta?.priority ?? 'medium'];
      const pb = PRIORITY_WEIGHT[b.meta?.priority ?? 'medium'];
      if (pa !== pb) return pa - pb;
      return a.sourceDate.getTime() - b.sourceDate.getTime();
    });
}

export function dedupeBySource(tasks: Task[]): Task[] {
  const seen = new Set<string>();
  const out: Task[] = [];
  for (const t of tasks) {
    const key = `${t.sourcePath}:${t.lineStart}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function buildIndex(
  allTasks: Task[],
  today: Date,
  rangeDays: number,
  errors: { path: string; error: Error }[],
  unparsed: string[] = []
): IndexSnapshot {
  const windowStart = computeWindowStart(today, rangeDays);

  // —— byDate ——
  const byDate = new Map<string, { pending: Task[]; done: Task[] }>();
  for (const t of allTasks) {
    const key = dateToYmd(t.sourceDate);
    if (!byDate.has(key)) byDate.set(key, { pending: [], done: [] });
    const bucket = byDate.get(key)!;
    if (t.checked) bucket.done.push(t);
    else bucket.pending.push(t);
  }

  // —— today ——
  const todayKey = dateToYmd(today);
  const todayBucket = byDate.get(todayKey) ?? { pending: [], done: [] };
  const backlog = computeBacklog(allTasks, today);

  // —— global ——
  const allPending = dedupeBySource(allTasks.filter(t => !t.checked));
  const allDone = allTasks
    .filter(t => t.checked)
    .sort((a, b) => {
      const ad = a.meta?.done?.getTime() ?? a.sourceDate.getTime();
      const bd = b.meta?.done?.getTime() ?? b.sourceDate.getTime();
      return bd - ad;
    });

  return {
    generatedAt: new Date(),
    windowStart,
    windowEnd: today,
    today: {
      pending: todayBucket.pending,
      done: todayBucket.done,
      backlog
    },
    byDate,
    allPending,
    allDone,
    errors,
    unparsed
  };
}
