# 每日未完成提醒 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 每日固定时刻(默认 21:00)自动扫描日志,弹 Notice 提醒"今日未完成 N 件 · 今日到期 M 件",支持启动补提醒与按天去重。

**Architecture:** 新增 `src/reminder/reminderService.ts`(两个纯函数 `shouldRemind`/`summarize` + 一个副作用封装 `runReminderCheck`,依赖全部注入故测试无需 mock obsidian 运行时);`main.ts` 用 `registerInterval(60_000)` 分钟级轮询接线,启动补提醒走 `onLayoutReady` + 10s 延迟;`lastReminderDate` 持久化到 plugin data.json 的平行字段 `reminderState`(不混入 settings)。数据层(fileScanner/taskParser/taskIndex/snapshotService/taskWriter)零改动,复用 `getSnapshot` 的 inflight 互斥。

**Tech Stack:** TypeScript 5 strict · jest + ts-jest(node project)· esbuild · Obsidian Plugin API

**Spec:** `docs/superpowers/specs/2026-09-05-daily-reminder-design.md`

## Global Constraints

- 数据层五个文件(`src/data/fileScanner.ts`、`taskParser.ts`、`taskIndex.ts`、`snapshotService.ts`、`taskWriter.ts`)禁止改动
- `reminderState` 是运行时状态,持久化为 data.json 顶层平行字段 `{ reminderState: { lastReminderDate: string | null } }`,不得加入 `TaskBoardSettings` 类型
- Notice 时长固定 `10_000` ms
- 提醒触发延迟 ≤ 1 分钟可接受;跨日边界以 tick 执行时刻的当天日期判断
- 提醒时刻非法(`25:99`/`abc`)一律按 `21:00` 兜底
- 新设置默认值:`reminderEnabled: true`、`reminderTime: '21:00'`
- `npm run lint`(tsc --noEmit,strict)必须零错误;测试风格沿用现有 describe/test + 中文用例名
- `__mocks__/obsidian.ts` 的 `TextComponent` 没有 `onBlur` 方法,设置页校验策略为"非法输入静默不保存"(重开设置页即回显旧值),不得调用 mock 中不存在的 API

---

### Task 1: `shouldRemind` 纯函数 + settings 类型扩展

**Files:**
- Modify: `src/types.ts:51-59`(TaskBoardSettings 接口)
- Modify: `src/config/defaultSettings.ts`
- Create: `src/reminder/reminderService.ts`
- Test: `src/reminder/reminderService.test.ts`

**Interfaces:**
- Consumes: `dateToYmd(date: Date): string`(来自 `src/utils/dateUtils.ts`,已存在)
- Produces: `shouldRemind(now: Date, reminderTime: string, lastReminderDate: string | null): boolean`;`TaskBoardSettings` 新增 `reminderEnabled: boolean`、`reminderTime: string`(后续所有任务依赖)

- [ ] **Step 1: 扩展类型与默认值**

`src/types.ts` 的 `TaskBoardSettings` 接口末尾(`fontSize: number;` 之后)追加两个字段:

```typescript
  fontSize: number;          // panel base font size in px (default 13)
  reminderEnabled: boolean;
  reminderTime: string;      // "HH:mm", invalid fallback 21:00
```

`src/config/defaultSettings.ts` 的 `DEFAULT_SETTINGS` 追加:

```typescript
  fontSize: 13,
  reminderEnabled: true,
  reminderTime: '21:00'
```

- [ ] **Step 2: 写失败测试**

创建 `src/reminder/reminderService.test.ts`:

```typescript
import { shouldRemind } from './reminderService';

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
```

- [ ] **Step 3: 运行测试确认失败**

Run: `npx jest reminderService.test`
Expected: FAIL — `Cannot find module './reminderService'`(ts-jest 编译错误)

- [ ] **Step 4: 最小实现**

创建 `src/reminder/reminderService.ts`:

```typescript
// src/reminder/reminderService.ts
import { dateToYmd } from '../utils/dateUtils';

const DEFAULT_REMINDER_TIME = '21:00';

function parseTimeHHmm(s: string): { h: number; m: number } | null {
  const match = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

export function shouldRemind(
  now: Date,
  reminderTime: string,
  lastReminderDate: string | null
): boolean {
  const t = parseTimeHHmm(reminderTime) ?? parseTimeHHmm(DEFAULT_REMINDER_TIME)!;
  const reminderAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.h, t.m);
  if (now.getTime() < reminderAt.getTime()) return false;
  return dateToYmd(now) !== lastReminderDate;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx jest reminderService.test`
Expected: PASS — 8 tests, 0 failures

- [ ] **Step 6: lint + 提交**

Run: `npm run lint`
Expected: 无输出(零错误)

```bash
git add src/types.ts src/config/defaultSettings.ts src/reminder/reminderService.ts src/reminder/reminderService.test.ts
git commit -m "feat(reminder): add shouldRemind pure function and settings fields"
```

---

### Task 2: `summarize` 纯函数

**Files:**
- Modify: `src/reminder/reminderService.ts`(追加函数)
- Test: `src/reminder/reminderService.test.ts`(追加 describe)

**Interfaces:**
- Consumes: `buildIndex(allTasks: Task[], today: Date, rangeDays: number, errors: { path: string; error: Error }[]): IndexSnapshot`(`src/data/taskIndex.ts`,已存在);`isSameDay(a: Date, b: Date): boolean`(`src/utils/dateUtils.ts`,已存在);`Task`/`TaskMeta`/`IndexSnapshot` 类型
- Produces: `summarize(snapshot: IndexSnapshot, today: Date): { pendingToday: number; dueToday: number }`(Task 3 依赖)

- [ ] **Step 1: 写失败测试**

在 `src/reminder/reminderService.test.ts` 顶部追加 import,文件末尾追加测试:

```typescript
import { buildIndex } from '../data/taskIndex';
import { summarize } from './reminderService';
import type { Task, TaskMeta } from '../types';

function makeTask(
  body: string,
  sourceDate: Date,
  checked: boolean,
  meta: Partial<TaskMeta> = {}
): Task {
  return {
    sourcePath: `DailyLife/${sourceDate.getFullYear()}/x.md`,
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest reminderService.test`
Expected: FAIL — `summarize` 未导出(编译错误或 undefined is not a function)

- [ ] **Step 3: 实现**

在 `src/reminder/reminderService.ts` 追加(`isSameDay` 加入顶部 import):

```typescript
import { dateToYmd, isSameDay } from '../utils/dateUtils';
import type { IndexSnapshot } from '../types';

export interface ReminderSummary {
  pendingToday: number;
  dueToday: number;
}

export function summarize(snapshot: IndexSnapshot, today: Date): ReminderSummary {
  const pendingToday = snapshot.today.pending.length;
  const dueToday = snapshot.allPending.filter(t => {
    if (isSameDay(t.sourceDate, today)) return false;
    if (t.meta?.due && isSameDay(t.meta.due, today)) return true;
    if (t.meta?.scheduled && isSameDay(t.meta.scheduled, today)) return true;
    return false;
  }).length;
  return { pendingToday, dueToday };
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest reminderService.test`
Expected: PASS — 14 tests(8 shouldRemind + 6 summarize)

- [ ] **Step 5: lint + 提交**

Run: `npm run lint`
Expected: 无输出

```bash
git add src/reminder/reminderService.ts src/reminder/reminderService.test.ts
git commit -m "feat(reminder): add summarize for pendingToday/dueToday counts"
```

---

### Task 3: `runReminderCheck` 副作用封装(依赖注入)

**Files:**
- Modify: `src/reminder/reminderService.ts`(追加)
- Test: `src/reminder/reminderService.test.ts`(追加 describe)

**Interfaces:**
- Consumes: `shouldRemind`、`summarize`(Task 1/2 产出);`getSnapshot(vault: Vault, settings: TaskBoardSettings, today: Date): Promise<IndexSnapshot>`(签名注入,不直接 import 实现);`TaskBoardSettings` 类型
- Produces:
  - `interface ReminderState { lastReminderDate: string | null }`
  - `interface ReminderHost { settings: TaskBoardSettings; app: { vault: Vault }; getReminderState(): ReminderState; saveReminderDate(ymd: string): Promise<void> }`
  - `interface ReminderDeps { now(): Date; notify(message: string): void; getSnapshot(vault: Vault, settings: TaskBoardSettings, today: Date): Promise<IndexSnapshot> }`
  - `runReminderCheck(host: ReminderHost, deps: ReminderDeps): Promise<void>`(Task 4 依赖;`ReminderHost` 与 TaskBoardPlugin 结构兼容)

- [ ] **Step 1: 写失败测试**

在 `src/reminder/reminderService.test.ts` 顶部 import 区追加(与已有 import 合并;`Vault` 类型从 'obsidian' 导入,经 moduleNameMapper 指向 `__mocks__/obsidian.ts` 满足类型检查):

```typescript
import { runReminderCheck } from './reminderService';
import type { ReminderHost } from './reminderService';
import type { TaskBoardSettings } from '../types';
import type { Vault } from 'obsidian';
```

测试:
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
```

- [ ] **Step 2: 运行测试确认失败**

Run: `npx jest reminderService.test`
Expected: FAIL — `runReminderCheck` 未导出

- [ ] **Step 3: 实现**

在 `src/reminder/reminderService.ts` 追加(顶部补 import):

```typescript
import type { Vault } from 'obsidian';
import type { TaskBoardSettings } from '../types';

export interface ReminderState {
  lastReminderDate: string | null;
}

export interface ReminderHost {
  settings: TaskBoardSettings;
  app: { vault: Vault };
  getReminderState(): ReminderState;
  saveReminderDate(ymd: string): Promise<void>;
}

export interface ReminderDeps {
  now(): Date;
  notify(message: string): void;
  getSnapshot(
    vault: Vault,
    settings: TaskBoardSettings,
    today: Date
  ): Promise<IndexSnapshot>;
}

export async function runReminderCheck(
  host: ReminderHost,
  deps: ReminderDeps
): Promise<void> {
  if (!host.settings.reminderEnabled) return;

  const now = deps.now();
  if (!shouldRemind(now, host.settings.reminderTime, host.getReminderState().lastReminderDate)) {
    return;
  }

  const snapshot = await deps.getSnapshot(host.app.vault, host.settings, now);
  if (snapshot.errors.length > 0) return;

  const { pendingToday, dueToday } = summarize(snapshot, now);
  if (pendingToday > 0 && dueToday > 0) {
    deps.notify(`⏰ 今日还有 ${pendingToday} 件未完成 · ${dueToday} 件今日到期`);
  } else if (pendingToday > 0) {
    deps.notify(`⏰ 今日还有 ${pendingToday} 件未完成`);
  } else if (dueToday > 0) {
    deps.notify(`⏰ 今日有 ${dueToday} 件到期任务`);
  }
  await host.saveReminderDate(dateToYmd(now));
}
```

- [ ] **Step 4: 运行测试确认通过**

Run: `npx jest reminderService.test`
Expected: PASS — 21 tests(8 + 6 + 7)

- [ ] **Step 5: lint + 全量回归 + 提交**

Run: `npm run lint && npm test`
Expected: lint 零错误;全部测试 PASS(含既有测试无回归)

```bash
git add src/reminder/reminderService.ts src/reminder/reminderService.test.ts
git commit -m "feat(reminder): add runReminderCheck with injected deps"
```

---

### Task 4: main.ts 接线 + reminderState 持久化

**Files:**
- Modify: `src/main.ts`

**Interfaces:**
- Consumes: `runReminderCheck(host: ReminderHost, deps: ReminderDeps): Promise<void>`、`ReminderState`(Task 3 产出);`getSnapshot`(实际实现,`src/data/snapshotService.ts`);`Notice`(obsidian);`Plugin.registerInterval(ms, cb)`、`workspace.onLayoutReady(cb)`(Obsidian 运行时 API,mock 中不存在——main.ts 无单测,与现状一致)
- Produces: `TaskBoardPlugin.reminderState: ReminderState`、`TaskBoardPlugin.getReminderState(): ReminderState`、`TaskBoardPlugin.saveReminderDate(ymd): Promise<void>`(Task 5 无依赖,供后续维护参考)

**关键约束:** `loadData()/saveData()` 共用 data.json。`loadSettings` 必须剥离 `reminderState` 防止其混入 settings;`saveSettings` 必须带上 `reminderState` 否则改任意设置会静默丢掉提醒去重状态。

- [ ] **Step 1: 改造 loadSettings / saveSettings / 新增状态存取**

`src/main.ts` 顶部追加 import:

```typescript
import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { runReminderCheck } from './reminder/reminderService';
import type { ReminderState } from './reminder/reminderService';
import { getSnapshot } from './data/snapshotService';
```

(`Plugin, WorkspaceLeaf` 原本已有,合并进同一行 import。)

类字段追加(`settings!: TaskBoardSettings;` 之后):

```typescript
  settings!: TaskBoardSettings;
  private reminderState: ReminderState = { lastReminderDate: null };
```

替换 `loadSettings`/`saveSettings` 两个方法:

```typescript
  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Record<string, unknown> | null;
    const { reminderState, ...settingsData } = data ?? {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, settingsData);
    this.reminderState = reminderState as ReminderState || { lastReminderDate: null };
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ ...this.settings, reminderState: this.reminderState });
  }

  getReminderState(): ReminderState {
    return this.reminderState;
  }

  async saveReminderDate(ymd: string): Promise<void> {
    this.reminderState.lastReminderDate = ymd;
    await this.saveData({ ...this.settings, reminderState: this.reminderState });
  }
```

- [ ] **Step 2: onload 接线**

`onload()` 末尾(`this.addSettingTab(...)` 之前)追加:

```typescript
    const reminderDeps = {
      now: () => new Date(),
      notify: (msg: string) => new Notice(msg, 10_000),
      getSnapshot
    };
    this.registerInterval(60_000, () => {
      void runReminderCheck(this, reminderDeps);
    });
    this.app.workspace.onLayoutReady(() => {
      setTimeout(() => {
        void runReminderCheck(this, reminderDeps);
      }, 10_000);
    });
```

- [ ] **Step 3: 验证编译与全量测试**

Run: `npm run lint && npm test && npm run build`
Expected: lint 零错误;全部测试 PASS;build 输出 `dist/task-board/main.js`

- [ ] **Step 4: 提交**

```bash
git add src/main.ts
git commit -m "feat(reminder): wire minute-tick reminder into plugin lifecycle"
```

---

### Task 5: 设置页 UI(开关 + 时刻)

**Files:**
- Modify: `src/config/settingsTab.ts`

**Interfaces:**
- Consumes: `this.plugin.settings.reminderEnabled: boolean`、`reminderTime: string`(Task 1 产出);`this.plugin.saveSettings()`
- Produces: 无(纯 UI)

**校验策略:** 非法 `HH:mm` 输入静默不保存(mock 的 TextComponent 无 onBlur,不得调用);重开设置页回显上次有效值。

- [ ] **Step 1: 追加两个设置项**

在 `src/config/settingsTab.ts` 的 `display()` 中、"面板字体大小" 设置块之后、"测试匹配" 之前插入:

```typescript
    new Setting(containerEl)
      .setName('每日提醒')
      .setDesc('每天到提醒时刻自动检查未完成任务并弹出通知')
      .addToggle(t => t
        .setValue(this.plugin.settings.reminderEnabled)
        .onChange(async v => {
          this.plugin.settings.reminderEnabled = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('提醒时刻')
      .setDesc('每天检查的时刻(HH:mm,默认 21:00;非法输入不保存)')
      .addText(text => text
        .setPlaceholder('21:00')
        .setValue(this.plugin.settings.reminderTime)
        .onChange(async v => {
          const trimmed = v.trim();
          const m = trimmed.match(/^(\d{1,2}):(\d{2})$/);
          if (!m) return;
          if (Number(m[1]) > 23 || Number(m[2]) > 59) return;
          this.plugin.settings.reminderTime = trimmed;
          await this.plugin.saveSettings();
        }));
```

- [ ] **Step 2: 验证编译与全量测试**

Run: `npm run lint && npm test && npm run build`
Expected: 三项全部通过

- [ ] **Step 3: 提交**

```bash
git add src/config/settingsTab.ts
git commit -m "feat(reminder): add daily-reminder settings UI"
```

---

### Task 6: 文档更新 + 全量验证

**Files:**
- Modify: `docs/MANUAL_QA.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: 无
- Produces: 验收清单(spec §7.2)与 README 功能列表

- [ ] **Step 1: MANUAL_QA.md 追加章节**

在 `## Resize` 章节之前插入:

```markdown
## Daily Reminder

- [ ] Set 提醒时刻 to 1 minute ahead → Notice appears within 1-2 min with counts
- [ ] After the notice fired, restart Obsidian → no second notice same day
- [ ] Set 提醒时刻 to a time already past (and not yet fired today) → startup catch-up notice ~10s after layout ready
- [ ] 每日提醒 off → no notice at reminder time
- [ ] Notice copy: when one count is 0, only the other is shown
- [ ] Type invalid time (e.g. `25:99`) → not saved; reopen settings shows last valid value
- [ ] Empty task day → no notice, but next day still reminds
```

- [ ] **Step 2: README.md 功能列表追加**

`## Features` 列表末尾(`- 🚫 **No data loss**` 之后)追加:

```markdown
- ⏰ **Daily reminder**: notice at a configurable time each day for unfinished & due-today tasks
```

- [ ] **Step 3: 全量验证**

Run: `npm run lint && npm test && npm run build`
Expected: 三项全部通过

- [ ] **Step 4: 提交**

```bash
git add docs/MANUAL_QA.md README.md
git commit -m "docs: add daily-reminder QA checklist and README feature entry"
```
