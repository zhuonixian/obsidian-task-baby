import { buildIndex } from '../data/taskIndex';
import { shouldRemind, summarize, runReminderCheck } from './reminderService';
import type { ReminderHost } from './reminderService';
import type { Task, TaskMeta, TaskBoardSettings } from '../types';
import type { Vault } from 'obsidian';

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

function makeSettings(overrides: Partial<TaskBoardSettings> = {}): TaskBoardSettings {
  return {
    dailyDir: 'DailyLife',
    filePattern: 'YYYY-MM-DD.md',
    rangeDays: 30,
    enableTasksMetadata: true,
    sidebarCompactLimit: 5,
    appendDoneDate: true,
    fontSize: 13,
    reminderEnabled: true,
    reminderTime: '21:00',
    ...overrides
  };
}

function makeHost(overrides: Partial<ReminderHost> = {}): ReminderHost {
  const host: ReminderHost = {
    settings: makeSettings(),
    app: { vault: {} as Vault },
    getReminderState: () => ({ lastReminderDate: null }),
    saveReminderDate: jest.fn()
  };
  return Object.assign(host, overrides);
}

function makeDeps(options: {
  tasks?: Task[];
  errors?: { path: string; error: Error }[];
} = {}) {
  const today = new Date(2026, 8, 5, 22, 0);
  const snapshot = buildIndex(options.tasks ?? [], today, 30, options.errors ?? []);
  return {
    now: () => today,
    notify: jest.fn(),
    getSnapshot: jest.fn().mockResolvedValue(snapshot)
  };
}

describe('runReminderCheck', () => {
  test('有未完成 + 有到期 → Notice 双段文案 + 持久化当天日期', async () => {
    const host = makeHost();
    const today = new Date(2026, 8, 5);
    const tasks = [
      makeTask('今日任务', today, false),
      makeTask('历史到期', new Date(2026, 8, 1), false, { due: today })
    ];
    const deps = makeDeps({ tasks });
    await runReminderCheck(host, deps);
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalledWith('⏰ 今日还有 1 件未完成 · 1 件今日到期');
    expect(host.saveReminderDate).toHaveBeenCalledWith('2026-09-05');
  });

  test('仅今日未完成 → 单段文案', async () => {
    const host = makeHost();
    const tasks = [makeTask('今日任务', new Date(2026, 8, 5), false)];
    const deps = makeDeps({ tasks });
    await runReminderCheck(host, deps);
    expect(deps.notify).toHaveBeenCalledWith('⏰ 今日还有 1 件未完成');
    expect(host.saveReminderDate).toHaveBeenCalledWith('2026-09-05');
  });

  test('仅今日到期 → 到期文案', async () => {
    const host = makeHost();
    const tasks = [
      makeTask('历史到期', new Date(2026, 8, 1), false, { due: new Date(2026, 8, 5) })
    ];
    const deps = makeDeps({ tasks });
    await runReminderCheck(host, deps);
    expect(deps.notify).toHaveBeenCalledWith('⏰ 今日有 1 件到期任务');
  });

  test('全空 → 不弹 Notice,但日期仍持久化', async () => {
    const host = makeHost();
    const deps = makeDeps();
    await runReminderCheck(host, deps);
    expect(deps.notify).not.toHaveBeenCalled();
    expect(host.saveReminderDate).toHaveBeenCalledWith('2026-09-05');
  });

  test('errors > 0 → 不弹 Notice 且不持久化(下个 tick 重试)', async () => {
    const host = makeHost();
    const deps = makeDeps({ errors: [{ path: 'x.md', error: new Error('boom') }] });
    await runReminderCheck(host, deps);
    expect(deps.getSnapshot).toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
    expect(host.saveReminderDate).not.toHaveBeenCalled();
  });

  test('reminderEnabled=false → 直接返回,不扫描', async () => {
    const host = makeHost({ settings: makeSettings({ reminderEnabled: false }) });
    const deps = makeDeps();
    await runReminderCheck(host, deps);
    expect(deps.getSnapshot).not.toHaveBeenCalled();
    expect(deps.notify).not.toHaveBeenCalled();
    expect(host.saveReminderDate).not.toHaveBeenCalled();
  });

  test('当天已提醒过 → 不扫描不持久化', async () => {
    const host = makeHost({ getReminderState: () => ({ lastReminderDate: '2026-09-05' }) });
    const deps = makeDeps();
    await runReminderCheck(host, deps);
    expect(deps.getSnapshot).not.toHaveBeenCalled();
    expect(host.saveReminderDate).not.toHaveBeenCalled();
  });
});
