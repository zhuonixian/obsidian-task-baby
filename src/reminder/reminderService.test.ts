import { buildIndex } from '../data/taskIndex';
import { evaluateReminder, summarize, runReminderCheck, buildReminderMessage } from './reminderService';
import type { ReminderHost, ReminderState } from './reminderService';
import type { Task, TaskMeta, TaskBoardSettings } from '../types';
import type { Vault } from 'obsidian';

// ============ 保留:原 summarize describe 块与 makeTask 原样移入(见 Step 2 末尾保留区) ============

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
    reminderStyle: 'modal',
    reminderSnoozeMinutes: 10,
    reminderMaxSnoozes: 3,
    ...overrides
  };
}

function makeState(overrides: Partial<ReminderState> = {}): ReminderState {
  return {
    dayKey: '2026-09-05',
    finalized: false,
    snoozeCount: 0,
    snoozedUntil: null,
    lastPopupAt: null,
    ...overrides
  };
}

describe('evaluateReminder', () => {
  test('未到时刻 → skip', () => {
    const now = new Date(2026, 8, 5, 20, 0);
    expect(evaluateReminder(now, makeSettings(), makeState())).toBe('skip');
  });

  test('到点 + 全新状态(dayKey null)→ remind', () => {
    const now = new Date(2026, 8, 5, 21, 0);
    expect(evaluateReminder(now, makeSettings(), makeState({ dayKey: null }))).toBe('remind');
  });

  test('到点 + 当天 finalized → skip', () => {
    const now = new Date(2026, 8, 5, 22, 0);
    expect(evaluateReminder(now, makeSettings(), makeState({ finalized: true }))).toBe('skip');
  });

  test('贪睡中(now < snoozedUntil)→ skip', () => {
    const now = new Date(2026, 8, 5, 21, 5);
    const until = new Date(2026, 8, 5, 21, 10).toISOString();
    expect(evaluateReminder(now, makeSettings(), makeState({ snoozedUntil: until }))).toBe('skip');
  });

  test('贪睡到期(now >= snoozedUntil)→ remind', () => {
    const now = new Date(2026, 8, 5, 21, 10);
    const until = new Date(2026, 8, 5, 21, 10).toISOString();
    expect(evaluateReminder(now, makeSettings(), makeState({ snoozedUntil: until, snoozeCount: 1 }))).toBe('remind');
  });

  test('120s 守卫内(now < lastPopupAt+120s)→ skip', () => {
    const now = new Date(2026, 8, 5, 21, 1);
    const popupAt = new Date(2026, 8, 5, 21, 0).toISOString();
    expect(evaluateReminder(now, makeSettings(), makeState({ lastPopupAt: popupAt }))).toBe('skip');
  });

  test('守卫过期(now >= lastPopupAt+120s)→ remind', () => {
    const now = new Date(2026, 8, 5, 21, 2);
    const popupAt = new Date(2026, 8, 5, 21, 0).toISOString();
    expect(evaluateReminder(now, makeSettings(), makeState({ lastPopupAt: popupAt }))).toBe('remind');
  });

  test('旧 dayKey(昨天 finalized)→ 跨日归一为 remind', () => {
    const now = new Date(2026, 8, 5, 22, 0);
    expect(evaluateReminder(now, makeSettings(), makeState({ dayKey: '2026-09-04', finalized: true }))).toBe('remind');
  });

  test('旧 dayKey 且贪睡未到 → 跨日归一,昨日 until 不拦截', () => {
    const now = new Date(2026, 8, 5, 8, 0);   // 未到 21:00 → skip(时序优先)
    const until = new Date(2026, 8, 5, 23, 0).toISOString();
    expect(evaluateReminder(now, makeSettings(), makeState({ dayKey: '2026-09-04', snoozedUntil: until }))).toBe('skip');
    const later = new Date(2026, 8, 5, 22, 0); // 到点后昨日 until 不再拦截
    expect(evaluateReminder(later, makeSettings(), makeState({ dayKey: '2026-09-04', snoozedUntil: until }))).toBe('remind');
  });

  test('notice 样式 + 到点全新 → notice', () => {
    const now = new Date(2026, 8, 5, 22, 0);
    expect(evaluateReminder(now, makeSettings({ reminderStyle: 'notice' }), makeState({ dayKey: null }))).toBe('notice');
  });

  test('notice 样式 + finalized → skip', () => {
    const now = new Date(2026, 8, 5, 22, 0);
    expect(evaluateReminder(now, makeSettings({ reminderStyle: 'notice' }), makeState({ finalized: true }))).toBe('skip');
  });

  test('时刻非法 → 按 21:00 兜底', () => {
    expect(evaluateReminder(new Date(2026, 8, 5, 20, 0), makeSettings({ reminderTime: '25:99' }), makeState({ dayKey: null }))).toBe('skip');
    expect(evaluateReminder(new Date(2026, 8, 5, 22, 0), makeSettings({ reminderTime: '25:99' }), makeState({ dayKey: null }))).toBe('remind');
  });
});

describe('buildReminderMessage', () => {
  test('三类文案与 null', () => {
    expect(buildReminderMessage({ pendingToday: 3, dueToday: 2 })).toBe('⏰ 今日还有 3 件未完成 · 2 件今日到期');
    expect(buildReminderMessage({ pendingToday: 3, dueToday: 0 })).toBe('⏰ 今日还有 3 件未完成');
    expect(buildReminderMessage({ pendingToday: 0, dueToday: 2 })).toBe('⏰ 今日有 2 件到期任务');
    expect(buildReminderMessage({ pendingToday: 0, dueToday: 0 })).toBeNull();
  });
});

describe('runReminderCheck', () => {
  function makeHost(overrides: Partial<ReminderHost> = {}): ReminderHost {
    const host: ReminderHost = {
      settings: makeSettings(),
      app: { vault: {} as Vault },
      getReminderState: () => makeState(),
      saveReminderState: jest.fn().mockResolvedValue(undefined)
    };
    return Object.assign(host, overrides);
  }

  function makeDeps(options: {
    tasks?: Task[];
    errors?: { path: string; error: Error }[];
  } = {}) {
    const now = new Date(2026, 8, 5, 22, 0);
    const snapshot = buildIndex(options.tasks ?? [], now, 30, options.errors ?? []);
    return {
      now: () => now,
      notify: jest.fn(),
      presentModal: jest.fn(),
      getSnapshot: jest.fn().mockResolvedValue(snapshot)
    };
  }

  const todayTask = () => {
    const today = new Date(2026, 8, 5);
    return {
      sourcePath: 'DailyLife/2026/9/5.md',
      sourceDate: today,
      lineStart: 0,
      lineEnd: 0,
      rawText: '- [ ] 今日任务',
      body: '今日任务',
      bodyHash: '今日任务',
      checked: false,
      indent: 0,
      meta: { tags: [] }
    } as Task;
  };

  test('modal:先写 lastPopupAt 守卫,再 presentModal 且携带正确参数', async () => {
    const host = makeHost();
    const deps = makeDeps({ tasks: [todayTask()] });
    await runReminderCheck(host, deps);
    expect(deps.presentModal).toHaveBeenCalledTimes(1);
    const savedStates = (host.saveReminderState as jest.Mock).mock.calls.map(c => c[0] as ReminderState);
    expect(savedStates[0].lastPopupAt).not.toBeNull();
    expect(savedStates[0].finalized).toBe(false);
    const opts = deps.presentModal.mock.calls[0][0];
    expect(opts.message).toBe('⏰ 今日还有 1 件未完成');
    expect(opts.snoozeRemaining).toBe(3);
    expect(opts.snoozeMinutes).toBe(10);
    expect(typeof opts.onSnooze).toBe('function');
    expect(typeof opts.onFinal).toBe('function');
  });

  test('modal:onSnooze 回调 → count+1、until=now+10min、lastPopupAt 清空', async () => {
    const host = makeHost();
    const deps = makeDeps({ tasks: [todayTask()] });
    await runReminderCheck(host, deps);
    const opts = deps.presentModal.mock.calls[0][0];
    opts.onSnooze();
    const last = (host.saveReminderState as jest.Mock).mock.calls.at(-1)[0] as ReminderState;
    expect(last.snoozeCount).toBe(1);
    expect(last.snoozedUntil).toBe(new Date(2026, 8, 5, 22, 10).toISOString());
    expect(last.lastPopupAt).toBeNull();
    expect(last.finalized).toBe(false);
  });

  test('modal:onFinal 回调 → finalized 且贪睡/守卫清空', async () => {
    const host = makeHost();
    const deps = makeDeps({ tasks: [todayTask()] });
    await runReminderCheck(host, deps);
    const opts = deps.presentModal.mock.calls[0][0];
    opts.onFinal();
    const last = (host.saveReminderState as jest.Mock).mock.calls.at(-1)[0] as ReminderState;
    expect(last.finalized).toBe(true);
    expect(last.snoozedUntil).toBeNull();
    expect(last.lastPopupAt).toBeNull();
  });

  test('modal:snoozeCount=2、max=3 → snoozeRemaining=1;count=3 → 0', async () => {
    const host1 = makeHost({ getReminderState: () => makeState({ snoozeCount: 2 }) });
    const deps1 = makeDeps({ tasks: [todayTask()] });
    await runReminderCheck(host1, deps1);
    expect(deps1.presentModal.mock.calls[0][0].snoozeRemaining).toBe(1);

    const host2 = makeHost({ getReminderState: () => makeState({ snoozeCount: 3, lastPopupAt: null }) });
    const deps2 = makeDeps({ tasks: [todayTask()] });
    await runReminderCheck(host2, deps2);
    expect(deps2.presentModal.mock.calls[0][0].snoozeRemaining).toBe(0);
  });

  test('modal:空任务 → 不弹,写 finalized', async () => {
    const host = makeHost();
    const deps = makeDeps();
    await runReminderCheck(host, deps);
    expect(deps.presentModal).not.toHaveBeenCalled();
    const last = (host.saveReminderState as jest.Mock).mock.calls.at(-1)[0] as ReminderState;
    expect(last.finalized).toBe(true);
  });

  test('notice 样式:notify + 终态,不 presentModal', async () => {
    const host = makeHost({ settings: makeSettings({ reminderStyle: 'notice' }) });
    const deps = makeDeps({ tasks: [todayTask()] });
    await runReminderCheck(host, deps);
    expect(deps.notify).toHaveBeenCalledTimes(1);
    expect(deps.notify).toHaveBeenCalledWith('⏰ 今日还有 1 件未完成');
    expect(deps.presentModal).not.toHaveBeenCalled();
    const last = (host.saveReminderState as jest.Mock).mock.calls.at(-1)[0] as ReminderState;
    expect(last.finalized).toBe(true);
  });

  test('notice 样式:空任务 → 不 notify 但写终态', async () => {
    const host = makeHost({ settings: makeSettings({ reminderStyle: 'notice' }) });
    const deps = makeDeps();
    await runReminderCheck(host, deps);
    expect(deps.notify).not.toHaveBeenCalled();
    const last = (host.saveReminderState as jest.Mock).mock.calls.at(-1)[0] as ReminderState;
    expect(last.finalized).toBe(true);
  });

  test('errors > 0 → 不弹不写任何状态', async () => {
    const host = makeHost();
    const deps = makeDeps({ errors: [{ path: 'x.md', error: new Error('boom') }] });
    await runReminderCheck(host, deps);
    expect(deps.getSnapshot).toHaveBeenCalled();
    expect(deps.presentModal).not.toHaveBeenCalled();
    expect(host.saveReminderState).not.toHaveBeenCalled();
  });

  test('reminderEnabled=false → 不扫描', async () => {
    const host = makeHost({ settings: makeSettings({ reminderEnabled: false }) });
    const deps = makeDeps();
    await runReminderCheck(host, deps);
    expect(deps.getSnapshot).not.toHaveBeenCalled();
  });

  test('skip(已终态)→ 不扫描不写', async () => {
    const host = makeHost({ getReminderState: () => makeState({ finalized: true }) });
    const deps = makeDeps();
    await runReminderCheck(host, deps);
    expect(deps.getSnapshot).not.toHaveBeenCalled();
    expect(host.saveReminderState).not.toHaveBeenCalled();
  });

  test('跨日:昨日状态 + 今日有任务 → 以归一化基准写入(count=0)', async () => {
    const host = makeHost({
      getReminderState: () => makeState({ dayKey: '2026-09-04', finalized: true, snoozeCount: 3 })
    });
    const deps = makeDeps({ tasks: [todayTask()] });
    await runReminderCheck(host, deps);
    const first = (host.saveReminderState as jest.Mock).mock.calls[0][0] as ReminderState;
    expect(first.dayKey).toBe('2026-09-05');
    expect(first.snoozeCount).toBe(0);
    expect(first.finalized).toBe(false);
    expect(deps.presentModal.mock.calls[0][0].snoozeRemaining).toBe(3);
  });
});
