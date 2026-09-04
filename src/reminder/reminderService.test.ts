import { buildIndex } from '../data/taskIndex';
import { shouldRemind, summarize } from './reminderService';
import type { Task, TaskMeta } from '../types';

describe('shouldRemind', () => {
  test('已过时刻且当天未提醒 → true', () => {
    const now = new Date(2026, 8, 5, 22, 0);
    expect(shouldRemind(now, '21:00', '2026-09-04')).toBe(true);
  });

  test('已过时刻且当天已提醒 → false', () => {
    const now = new Date(2026, 8, 5, 22, 0);
    expect(shouldRemind(now, '21:00', '2026-09-05')).toBe(false);
  });

  test('未到时刻 → false(即使多日未提醒)', () => {
    const now = new Date(2026, 8, 5, 20, 0);
    expect(shouldRemind(now, '21:00', '2026-09-01')).toBe(false);
  });

  test('昨天提醒过、今天未到点 → false', () => {
    const now = new Date(2026, 8, 5, 8, 0);
    expect(shouldRemind(now, '21:00', '2026-09-04')).toBe(false);
  });

  test('恰好到达时刻 → true(lastReminderDate 为 null)', () => {
    const now = new Date(2026, 8, 5, 21, 0);
    expect(shouldRemind(now, '21:00', null)).toBe(true);
  });

  test('时刻非法 "25:99" → 按 21:00(22:00 → true)', () => {
    expect(shouldRemind(new Date(2026, 8, 5, 22, 0), '25:99', null)).toBe(true);
  });

  test('时刻非法 "25:99" → 按 21:00(20:00 → false)', () => {
    expect(shouldRemind(new Date(2026, 8, 5, 20, 0), '25:99', null)).toBe(false);
  });

  test('时刻非法 "abc" → 按 21:00(21:30 → true)', () => {
    expect(shouldRemind(new Date(2026, 8, 5, 21, 30), 'abc', null)).toBe(true);
  });
});

function makeTask(
  body: string,
  sourceDate: Date,
  checked: boolean,
  meta: Partial<TaskMeta> = {}
): Task {
  return {
    sourcePath: `DailyLife/${sourceDate.getFullYear()}/${sourceDate.getMonth() + 1}/${sourceDate.getDate()}.md`,
    sourceDate,
    lineStart: 0,
    lineEnd: 0,
    rawText: `- [${checked ? 'x' : ' '}] ${body}`,
    body,
    bodyHash: body,
    checked,
    indent: 0,
    meta: { tags: [], ...meta }
  };
}

describe('summarize', () => {
  const today = new Date(2026, 8, 5);

  test('今日 pending 计入 pendingToday,历史 due=今日 计入 dueToday', () => {
    const tasks = [
      makeTask('今日任务A', today, false),
      makeTask('今日任务B', today, false),
      makeTask('历史到期', new Date(2026, 8, 1), false, { due: today })
    ];
    expect(summarize(buildIndex(tasks, today, 30, []), today))
      .toEqual({ pendingToday: 2, dueToday: 1 });
  });

  test('今日日志里 due=今日 → 只计入 pendingToday,不重复计入 dueToday', () => {
    const tasks = [
      makeTask('今日且今日到期', today, false, { due: today })
    ];
    expect(summarize(buildIndex(tasks, today, 30, []), today))
      .toEqual({ pendingToday: 1, dueToday: 0 });
  });

  test('历史日志 scheduled=今日 → 计入 dueToday', () => {
    const tasks = [
      makeTask('历史计划', new Date(2026, 8, 2), false, { scheduled: today })
    ];
    expect(summarize(buildIndex(tasks, today, 30, []), today))
      .toEqual({ pendingToday: 0, dueToday: 1 });
  });

  test('历史日志 due=昨日 → 不计入', () => {
    const yesterday = new Date(2026, 8, 4);
    const tasks = [
      makeTask('昨天到期', new Date(2026, 8, 1), false, { due: yesterday })
    ];
    expect(summarize(buildIndex(tasks, today, 30, []), today))
      .toEqual({ pendingToday: 0, dueToday: 0 });
  });

  test('已完成且 due=今日 → 不计入', () => {
    const tasks = [
      makeTask('已完成的历史到期任务', new Date(2026, 8, 1), true, { due: today })
    ];
    expect(summarize(buildIndex(tasks, today, 30, []), today))
      .toEqual({ pendingToday: 0, dueToday: 0 });
  });

  test('空快照 → {0, 0}', () => {
    expect(summarize(buildIndex([], today, 30, []), today))
      .toEqual({ pendingToday: 0, dueToday: 0 });
  });
});
