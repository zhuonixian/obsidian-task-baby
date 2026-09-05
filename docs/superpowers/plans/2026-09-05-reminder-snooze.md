# 提醒贪睡与完成交互 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 把每日提醒从一次性 Notice 升级为手机闹钟式 Modal:「稍后 N 分钟」可贪睡重弹(次数上限),「今日完成」或任何关闭方式终态化;样式/间隔/次数全部可配置。

**Architecture:** `reminderService.ts` 重构为五字段 `ReminderState`(dayKey 跨日归一)+ 决策纯函数 `evaluateReminder`(取代 `shouldRemind`)+ `runReminderCheck` 的 modal/notice 双分支;新 dumb 组件 `reminderModal.ts`(按钮 + 回调,关闭兜底只生效一次);`presentModal` 注入 `ReminderDeps` 保持服务层零 Obsidian 运行时依赖;`main.ts` 泛化状态存取并迁移旧 `{ lastReminderDate }` 数据。

**Tech Stack:** TypeScript 5 strict · jest + ts-jest(node + jsdom 双项目)· esbuild · Obsidian Plugin API

**Spec:** `docs/superpowers/specs/2026-09-05-reminder-snooze-design.md`

## Global Constraints

- 数据层五个**源**文件(`src/data/fileScanner.ts`、`taskParser.ts`、`taskIndex.ts`、`snapshotService.ts`、`taskWriter.ts`)禁止改动;但 `src/data/*.test.ts` 中内联 `TaskBoardSettings` 字面量**必须**同步补新必填字段(否则 strict lint 不可达,这是授权的机械修复)
- `ReminderState` 五字段:`{ dayKey: string | null; finalized: boolean; snoozeCount: number; snoozedUntil: string | null; lastPopupAt: string | null }`,持久化为 data.json 顶层平行字段 `reminderState`,不得加入 `TaskBoardSettings`
- 弹窗守卫 `POPUP_GUARD_MS = 120_000`(内部常量,不进设置页)
- 任何关闭方式(按钮/ESC/点背景)等同「今日完成」;按钮回调与 onClose 兜底合计只生效一次(`handled` flag)
- 新设置默认值:`reminderStyle: 'modal'`、`reminderSnoozeMinutes: 10`(合法域 1-120)、`reminderMaxSnoozes: 3`(合法域 0-10,`0` = 首弹即只有「今日完成」)
- `reminderStyle: 'notice'` = v1 行为:弹一次即终态,贪睡配置对其无效
- 空任务日(两类计数均 0):不弹,写 `finalized: true`(v1"无事不扰"语义)
- 扫描 `errors > 0`:跳过且不写任何状态(含守卫标记),下分钟重试
- Notice 时长固定 `10_000` ms;提醒文案沿用现有三种摘要
- 旧数据迁移:`{ lastReminderDate }` → `{ dayKey: lastReminderDate, finalized: true, 其余默认 }`
- `npm run lint`(tsc --noEmit,strict)必须零错误;测试风格沿用 describe/test + 中文用例名
- `__mocks__/obsidian.ts` 的 `TextComponent`/`DropdownComponent` 没有 onBlur 等方法;非法输入策略 = 静默不保存

---

### Task 1: `reminderModal` dumb 组件 + jest 双项目配置

**Files:**
- Create: `src/reminder/reminderModal.ts`
- Create: `src/reminder/reminderModal.test.ts`(jsdom 项目)
- Modify: `jest.config.js`(node 项目排除、jsdom 项目纳入该测试文件)
- Modify: `styles.css`(按钮区最小样式)

**Interfaces:**
- Consumes: `Modal`(obsidian,mock 提供 `titleEl`/`contentEl` 为 ElementStub、`open()`/`close()`);`h(tag, props)`(`src/utils/domHelpers.ts`,`props.onclick` 挂到元素 onclick 属性,jsdom 可 `dispatchEvent` 触发)
- Produces:
  - `interface PresentModalOptions { message: string; snoozeRemaining: number; snoozeMinutes: number; onSnooze(): void; onFinal(): void }`
  - `class ReminderModal extends Modal { constructor(app: App, options: PresentModalOptions) }`,行为:`snoozeRemaining > 0` 显示「稍后」「今日完成」两按钮,`= 0` 仅「今日完成」;按钮与 `onClose` 兜底合计只触发一个回调一次

- [ ] **Step 1: 调整 jest.config.js**

node 项目追加排除、jsdom 项目追加匹配:

```javascript
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.test.ts', '<rootDir>/__fixtures__/**/*.test.ts'],
      testPathIgnorePatterns: ['<rootDir>/src/utils/domHelpers.test.ts', '<rootDir>/src/reminder/reminderModal.test.ts'],
      moduleNameMapper: { '^obsidian$': '<rootDir>/__mocks__/obsidian.ts' },
      transform: { '^.+\\.ts$': 'ts-jest' },
      clearMocks: true
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/utils/domHelpers.test.ts', '<rootDir>/src/views/**/*.test.ts', '<rootDir>/src/reminder/reminderModal.test.ts'],
      moduleNameMapper: { '^obsidian$': '<rootDir>/__mocks__/obsidian.ts' },
      setupFiles: ['<rootDir>/jest.setup-jsdom.ts'],
      transform: { '^.+\\.ts$': 'ts-jest' },
      clearMocks: true
    }
```

- [ ] **Step 2: 写失败测试**

创建 `src/reminder/reminderModal.test.ts`:

```typescript
import { ReminderModal } from './reminderModal';
import type { PresentModalOptions } from './reminderModal';

function makeOptions(
  overrides: Partial<PresentModalOptions> = {}
): PresentModalOptions & { onSnooze: jest.Mock; onFinal: jest.Mock } {
  return {
    message: '⏰ 今日还有 3 件未完成',
    snoozeRemaining: 3,
    snoozeMinutes: 10,
    onSnooze: jest.fn(),
    onFinal: jest.fn(),
    ...overrides
  } as any;
}

function openModal(options: PresentModalOptions): ReminderModal {
  const modal = new ReminderModal({} as any, options);
  modal.onOpen();
  return modal;
}

function buttonsOf(modal: ReminderModal): HTMLButtonElement[] {
  const contentChildren = (modal.contentEl as any).children as HTMLElement[];
  const buttonRow = contentChildren.find(c => c.querySelectorAll?.('button').length);
  return buttonRow ? Array.from(buttonRow.querySelectorAll('button')) : [];
}

describe('ReminderModal', () => {
  test('snoozeRemaining > 0 → 两按钮,文案含间隔与剩余次数', () => {
    const modal = openModal(makeOptions());
    const buttons = buttonsOf(modal);
    expect(buttons.length).toBe(2);
    expect(buttons[0].textContent).toContain('稍后 10 分钟');
    expect(buttons[0].textContent).toContain('还可 3 次');
    expect(buttons[1].textContent).toBe('今日完成');
  });

  test('snoozeRemaining = 0 → 仅「今日完成」', () => {
    const modal = openModal(makeOptions({ snoozeRemaining: 0 }));
    const buttons = buttonsOf(modal);
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toBe('今日完成');
  });

  test('message 渲染进内容区', () => {
    const options = makeOptions();
    const modal = openModal(options);
    const texts = ((modal.contentEl as any).children as HTMLElement[])
      .map(c => c.textContent ?? '').join('\n');
    expect(texts).toContain('⏰ 今日还有 3 件未完成');
  });

  test('点「稍后」→ onSnooze 一次,onFinal 不调用;随后 onClose 不重复', () => {
    const options = makeOptions();
    const modal = openModal(options);
    buttonsOf(modal)[0].dispatchEvent(new MouseEvent('click'));
    expect(options.onSnooze).toHaveBeenCalledTimes(1);
    expect(options.onFinal).not.toHaveBeenCalled();
    modal.onClose();
    expect(options.onSnooze).toHaveBeenCalledTimes(1);
  });

  test('点「今日完成」→ onFinal 一次,onSnooze 不调用;随后 onClose 不重复', () => {
    const options = makeOptions();
    const modal = openModal(options);
    buttonsOf(modal)[1].dispatchEvent(new MouseEvent('click'));
    expect(options.onFinal).toHaveBeenCalledTimes(1);
    expect(options.onSnooze).not.toHaveBeenCalled();
    modal.onClose();
    expect(options.onFinal).toHaveBeenCalledTimes(1);
  });

  test('直接 onClose(模拟 ESC/背景关闭)→ onFinal 恰好一次', () => {
    const options = makeOptions();
    const modal = openModal(options);
    modal.onClose();
    modal.onClose();
    expect(options.onFinal).toHaveBeenCalledTimes(1);
    expect(options.onSnooze).not.toHaveBeenCalled();
  });
});
```

(测试文件到此为止,共 6 个用例。)

- [ ] **Step 3: 运行测试确认失败**

Run: `npx jest reminderModal.test`
Expected: FAIL — `Cannot find module './reminderModal'`

- [ ] **Step 4: 实现组件**

创建 `src/reminder/reminderModal.ts`:

```typescript
// src/reminder/reminderModal.ts
import { Modal } from 'obsidian';
import type { App } from 'obsidian';
import { h } from '../utils/domHelpers';

export interface PresentModalOptions {
  message: string;
  snoozeRemaining: number;   // 0 → 只显示「今日完成」
  snoozeMinutes: number;
  onSnooze(): void;
  onFinal(): void;
}

export class ReminderModal extends Modal {
  private handled = false;

  constructor(app: App, private options: PresentModalOptions) {
    super(app);
  }

  onOpen(): void {
    this.titleEl.setText('⏰ 任务提醒');
    this.contentEl.appendChild(h('p', {
      cls: 'tb-reminder-message',
      text: this.options.message
    }));
    const buttons = h('div', { cls: 'tb-reminder-buttons' });
    if (this.options.snoozeRemaining > 0) {
      buttons.appendChild(h('button', {
        cls: 'tb-reminder-snooze',
        text: `稍后 ${this.options.snoozeMinutes} 分钟(还可 ${this.options.snoozeRemaining} 次)`,
        onclick: () => this.handle(true)
      }));
    }
    buttons.appendChild(h('button', {
      cls: 'tb-reminder-final',
      text: '今日完成',
      onclick: () => this.handle(false)
    }));
    this.contentEl.appendChild(buttons);
  }

  onClose(): void {
    if (this.handled) return;
    this.handled = true;
    this.options.onFinal();
  }

  private handle(snooze: boolean): void {
    if (this.handled) return;
    this.handled = true;
    this.close();
    if (snooze) this.options.onSnooze();
    else this.options.onFinal();
  }
}
```

`styles.css` 末尾追加:

```css
/* —— Reminder modal —— */
.tb-reminder-message {
  font-size: 1.05em;
  margin: 0.4em 0 0.8em;
}

.tb-reminder-buttons {
  display: flex;
  gap: 0.6em;
  justify-content: flex-end;
}

.tb-reminder-buttons button {
  cursor: pointer;
}
```

- [ ] **Step 5: 运行测试确认通过**

Run: `npx jest reminderModal.test`
Expected: PASS — 6 tests(jsdom 项目;node 项目因 ignore 不跑它)

- [ ] **Step 6: lint + 提交**

Run: `npm run lint`
Expected: 无输出

```bash
git add src/reminder/reminderModal.ts src/reminder/reminderModal.test.ts jest.config.js styles.css
git commit -m "feat(reminder): add snooze/dismiss modal component"
```

---

### Task 2: 服务层重构(evaluateReminder + 新状态模型 + runReminderCheck 双分支)+ main.ts 适配

**Files:**
- Modify: `src/types.ts:59-60`(TaskBoardSettings 追加 3 字段)
- Modify: `src/config/defaultSettings.ts`
- Rewrite: `src/reminder/reminderService.ts`(保留 `summarize`/`buildIndex` 协作不变;删除 `shouldRemind`)
- Rewrite: `src/reminder/reminderService.test.ts`(删除 shouldRemind describe;保留 summarize;新增 evaluateReminder 与 runReminderCheck 用例)
- Modify: `src/main.ts`
- Modify: `src/data/fileScanner.test.ts`、`src/data/snapshotService.test.ts`、`src/data/taskWriter.test.ts`(内联 settings 字面量补 3 必填字段)

**Interfaces:**
- Consumes: `summarize(snapshot, today): ReminderSummary`(现有,不变);`buildIndex`(现有);`PresentModalOptions`(Task 1 产出)
- Produces(Task 3/4 及运行时依赖):
  - `interface ReminderState { dayKey: string | null; finalized: boolean; snoozeCount: number; snoozedUntil: string | null; lastPopupAt: string | null }`
  - `type ReminderDecision = 'skip' | 'remind' | 'notice'`
  - `evaluateReminder(now: Date, settings: TaskBoardSettings, state: ReminderState): ReminderDecision`
  - `buildReminderMessage(s: ReminderSummary): string | null`(null = 空任务)
  - `interface ReminderHost { settings: TaskBoardSettings; app: { vault: Vault }; getReminderState(): ReminderState; saveReminderState(state: ReminderState): Promise<void> }`
  - `interface ReminderDeps { now(): Date; notify(message: string): void; presentModal(options: PresentModalOptions): void; getSnapshot(vault, settings, today): Promise<IndexSnapshot> }`
  - `runReminderCheck(host, deps): Promise<void>`(签名不变,行为升级)

**关键不变量**:弹出 Modal 前必须先持久化 `lastPopupAt`(守卫生效先于弹窗);`onSnooze`/`onFinal` 回调内部 `void host.saveReminderState(...).catch(console.error)`;跨日归一在写入时以 `dayKey !== today` 判定,以归一化基准 state 展开。

- [ ] **Step 1: 类型与默认值**

`src/types.ts` 的 `TaskBoardSettings` 在 `reminderTime` 之后追加:

```typescript
  reminderEnabled: boolean;
  reminderTime: string;      // "HH:mm", invalid fallback 21:00
  reminderStyle: 'modal' | 'notice';
  reminderSnoozeMinutes: number;  // 1-120, default 10
  reminderMaxSnoozes: number;     // 0-10, 0 = no snooze button, default 3
```

`src/config/defaultSettings.ts` 的 `DEFAULT_SETTINGS` 追加:

```typescript
  reminderEnabled: true,
  reminderTime: '21:00',
  reminderStyle: 'modal',
  reminderSnoozeMinutes: 10,
  reminderMaxSnoozes: 3
```

- [ ] **Step 2: 写失败测试(reminderService.test.ts 重写)**

用以下内容**完整替换** `src/reminder/reminderService.test.ts`(保留原文件中 `summarize` 的 describe 块原样移入,见文末保留区):

```typescript
import { buildIndex } from '../data/taskIndex';
import { evaluateReminder, summarize, runReminderCheck, buildReminderMessage } from './reminderService';
import type { ReminderHost, ReminderState } from './reminderService';
import type { Task, TaskMeta, TaskBoardSettings } from '../types';
import type { Vault } from 'obsidian';

// ============ 保留:原 summarize describe 块与 makeTask 原样移入(见 Step 2 末尾保留区) ============

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
      saveReminderState: jest.fn()
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
```

**保留区**:原文件里 `makeTask` 函数与整个 `describe('summarize', ...)` 块**原样保留**在替换后的文件中(放在上面代码的"保留区"注释位置,即 imports 之后、makeSettings 之前)。

- [ ] **Step 3: 运行测试确认失败**

Run: `npx jest reminderService.test`
Expected: FAIL — `evaluateReminder`/`buildReminderMessage`/`ReminderState` 新字段未导出,`shouldRemind` 不存在导致旧 import 报错(整体编译失败即预期 RED)

- [ ] **Step 4: 重写 reminderService.ts**

用以下内容**完整替换** `src/reminder/reminderService.ts`(summarize 原样保留):

```typescript
// src/reminder/reminderService.ts
import { dateToYmd, isSameDay } from '../utils/dateUtils';
import type { IndexSnapshot, TaskBoardSettings } from '../types';
import type { Vault } from 'obsidian';
import type { PresentModalOptions } from './reminderModal';

const DEFAULT_REMINDER_TIME = '21:00';
const POPUP_GUARD_MS = 120_000;

function parseTimeHHmm(s: string): { h: number; m: number } | null {
  const match = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

// ============ summarize 原样保留(与现版本一致) ============
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
// ============ 保留区结束 ============

export interface ReminderState {
  dayKey: string | null;
  finalized: boolean;
  snoozeCount: number;
  snoozedUntil: string | null;
  lastPopupAt: string | null;
}

export type ReminderDecision = 'skip' | 'remind' | 'notice';

export function evaluateReminder(
  now: Date,
  settings: TaskBoardSettings,
  state: ReminderState
): ReminderDecision {
  const t = parseTimeHHmm(settings.reminderTime) ?? parseTimeHHmm(DEFAULT_REMINDER_TIME)!;
  const reminderAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.h, t.m);
  if (now.getTime() < reminderAt.getTime()) return 'skip';

  const fresh = state.dayKey !== dateToYmd(now);
  if (fresh) {
    return settings.reminderStyle === 'notice' ? 'notice' : 'remind';
  }
  if (state.finalized) return 'skip';
  if (state.snoozedUntil && now.getTime() < new Date(state.snoozedUntil).getTime()) return 'skip';
  if (state.lastPopupAt && now.getTime() < new Date(state.lastPopupAt).getTime() + POPUP_GUARD_MS) return 'skip';
  return settings.reminderStyle === 'notice' ? 'notice' : 'remind';
}

export function buildReminderMessage(s: ReminderSummary): string | null {
  if (s.pendingToday > 0 && s.dueToday > 0) {
    return `⏰ 今日还有 ${s.pendingToday} 件未完成 · ${s.dueToday} 件今日到期`;
  }
  if (s.pendingToday > 0) return `⏰ 今日还有 ${s.pendingToday} 件未完成`;
  if (s.dueToday > 0) return `⏰ 今日有 ${s.dueToday} 件到期任务`;
  return null;
}

export interface ReminderHost {
  settings: TaskBoardSettings;
  app: { vault: Vault };
  getReminderState(): ReminderState;
  saveReminderState(state: ReminderState): Promise<void>;
}

export interface ReminderDeps {
  now(): Date;
  notify(message: string): void;
  presentModal(options: PresentModalOptions): void;
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
  const decision = evaluateReminder(now, host.settings, host.getReminderState());
  if (decision === 'skip') return;

  const snapshot = await deps.getSnapshot(host.app.vault, host.settings, now);
  if (snapshot.errors.length > 0) return;

  const message = buildReminderMessage(summarize(snapshot, now));

  const today = dateToYmd(now);
  const raw = host.getReminderState();
  const base: ReminderState = raw.dayKey === today
    ? raw
    : { dayKey: today, finalized: false, snoozeCount: 0, snoozedUntil: null, lastPopupAt: null };

  if (message === null) {
    await host.saveReminderState({ ...base, finalized: true });
    return;
  }

  if (decision === 'notice') {
    deps.notify(message);
    await host.saveReminderState({ ...base, finalized: true });
    return;
  }

  await host.saveReminderState({ ...base, lastPopupAt: now.toISOString() });

  const settings = host.settings;
  deps.presentModal({
    message,
    snoozeRemaining: Math.max(0, settings.reminderMaxSnoozes - base.snoozeCount),
    snoozeMinutes: settings.reminderSnoozeMinutes,
    onSnooze: () => {
      const until = new Date(now.getTime() + settings.reminderSnoozeMinutes * 60_000);
      host.saveReminderState({
        ...base,
        snoozeCount: base.snoozeCount + 1,
        snoozedUntil: until.toISOString(),
        lastPopupAt: null
      }).catch(console.error);
    },
    onFinal: () => {
      host.saveReminderState({
        ...base,
        finalized: true,
        snoozedUntil: null,
        lastPopupAt: null
      }).catch(console.error);
    }
  });
}
```

- [ ] **Step 5: main.ts 适配**

`src/main.ts` 修改(import 区调整、状态字段、loadSettings 迁移、saveReminderState 替代 saveReminderDate、deps 装配 presentModal):

```typescript
import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS } from './config/defaultSettings';
import { TaskBoardSettingTab } from './config/settingsTab';
import type { TaskBoardSettings } from './types';
import { SidebarCompactView, SIDEBAR_VIEW_TYPE } from './views/sidebarView';
import { BoardTabView, BOARD_VIEW_TYPE } from './views/boardView';
import { runReminderCheck } from './reminder/reminderService';
import type { ReminderState } from './reminder/reminderService';
import { ReminderModal } from './reminder/reminderModal';
import { getSnapshot } from './data/snapshotService';

export default class TaskBoardPlugin extends Plugin {
  settings!: TaskBoardSettings;
  private reminderState: ReminderState = {
    dayKey: null,
    finalized: false,
    snoozeCount: 0,
    snoozedUntil: null,
    lastPopupAt: null
  };
```

`onload` 内 `reminderDeps` 替换为:

```typescript
    const reminderDeps = {
      now: () => new Date(),
      notify: (msg: string) => new Notice(msg, 10_000),
      presentModal: (options: PresentModalOptions) =>
        new ReminderModal(this.app, options).open(),
      getSnapshot
    };
```

(import 区相应补一行:`import type { PresentModalOptions } from './reminder/reminderModal';`)

`loadSettings`/`saveSettings`/状态方法区替换为:

```typescript
  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Record<string, unknown> | null;
    const { reminderState, ...settingsData } = data ?? {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, settingsData);
    this.reminderState = this.migrateReminderState(reminderState);
  }

  private migrateReminderState(raw: unknown): ReminderState {
    const fresh: ReminderState = {
      dayKey: null,
      finalized: false,
      snoozeCount: 0,
      snoozedUntil: null,
      lastPopupAt: null
    };
    if (!raw || typeof raw !== 'object') return fresh;
    const r = raw as Record<string, unknown>;
    if (typeof r.dayKey === 'string' || r.dayKey === null) {
      return {
        dayKey: (r.dayKey as string | null) ?? null,
        finalized: typeof r.finalized === 'boolean' ? r.finalized : false,
        snoozeCount: typeof r.snoozeCount === 'number' ? r.snoozeCount : 0,
        snoozedUntil: typeof r.snoozedUntil === 'string' ? r.snoozedUntil : null,
        lastPopupAt: typeof r.lastPopupAt === 'string' ? r.lastPopupAt : null
      };
    }
    if (typeof r.lastReminderDate === 'string' && r.lastReminderDate) {
      return { ...fresh, dayKey: r.lastReminderDate, finalized: true };
    }
    return fresh;
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ ...this.settings, reminderState: this.reminderState });
  }

  getReminderState(): ReminderState {
    return this.reminderState;
  }

  async saveReminderState(state: ReminderState): Promise<void> {
    this.reminderState = state;
    await this.saveData({ ...this.settings, reminderState: state });
  }
```

删除旧的 `saveReminderDate` 方法。

- [ ] **Step 6: 数据层测试 fixture 机械修复**

`src/data/fileScanner.test.ts`、`src/data/snapshotService.test.ts`、`src/data/taskWriter.test.ts` 中所有内联 `TaskBoardSettings` 字面量(共约 9 处,特征:`reminderTime: '21:00'` 行)在其后追加:

```typescript
    reminderTime: '21:00',
    reminderStyle: 'notice',
    reminderSnoozeMinutes: 10,
    reminderMaxSnoozes: 3,
```

(`reminderStyle` 用 `'notice'` —— 数据层测试与弹窗无关,选不会触发 modal 语义的值。)

- [ ] **Step 7: 运行测试确认通过**

Run: `npx jest reminderService.test`
Expected: PASS — summarize 6 + evaluateReminder 12 + buildReminderMessage 1 + runReminderCheck 11 = 30 tests

Run: `npm run lint && npm test`
Expected: lint 零错误;全套通过(node 项目含 reminderService、data 层 fixture 修复后全绿;jsdom 项目 reminderModal 6 个)

- [ ] **Step 8: build + 提交**

Run: `npm run build`
Expected: 输出 `dist/task-board/main.js`

```bash
git add src/types.ts src/config/defaultSettings.ts src/reminder/reminderService.ts src/reminder/reminderService.test.ts src/main.ts src/data/fileScanner.test.ts src/data/snapshotService.test.ts src/data/taskWriter.test.ts
git commit -m "feat(reminder): snooze/dismiss state machine with evaluateReminder and modal wiring"
```

---

### Task 3: 设置页 UI(样式/间隔/次数)

**Files:**
- Modify: `src/config/settingsTab.ts`

**Interfaces:**
- Consumes: `this.plugin.settings.reminderStyle: 'modal' | 'notice'`、`reminderSnoozeMinutes`、`reminderMaxSnoozes`(Task 2 产出);`DropdownComponent`(mock 提供 addOption/setValue/onChange)
- Produces: 无(纯 UI)

**校验策略**:非法输入静默不保存(mock 组件无 onBlur,不得调用);贪睡间隔合法域 1-120,次数合法域 0-10。

- [ ] **Step 1: 追加三个设置项**

在 `display()` 中"提醒时刻"设置块之后、"面板字体大小"之前插入:

```typescript
    new Setting(containerEl)
      .setName('提醒样式')
      .setDesc('弹窗(闹钟式,可稍后/完成)或通知条(弹一次即结束,贪睡配置无效)')
      .addDropdown(d => d
        .addOption('modal', '弹窗(闹钟式)')
        .addOption('notice', '通知条')
        .setValue(this.plugin.settings.reminderStyle)
        .onChange(async v => {
          this.plugin.settings.reminderStyle = v as TaskBoardSettings['reminderStyle'];
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('贪睡间隔(分钟)')
      .setDesc('点「稍后」后隔多少分钟重新提醒(1-120,默认 10;非法输入不保存)')
      .addText(text => text
        .setPlaceholder('10')
        .setValue(String(this.plugin.settings.reminderSnoozeMinutes))
        .onChange(async v => {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 1 || n > 120) return;
          this.plugin.settings.reminderSnoozeMinutes = n;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('最大贪睡次数')
      .setDesc('超过后弹窗只显示「今日完成」(0-10,0 = 不可贪睡,默认 3;非法输入不保存)')
      .addText(text => text
        .setPlaceholder('3')
        .setValue(String(this.plugin.settings.reminderMaxSnoozes))
        .onChange(async v => {
          const n = Number(v);
          if (!Number.isInteger(n) || n < 0 || n > 10) return;
          this.plugin.settings.reminderMaxSnoozes = n;
          await this.plugin.saveSettings();
        }));
```

(settingsTab.ts 已 import `TaskBoardSettings` 类型;若未 import,在文件头部补 `import type { TaskBoardSettings } from '../types';`。)

- [ ] **Step 2: 验证**

Run: `npm run lint && npm test && npm run build`
Expected: 三项全部通过(测试数不变)

- [ ] **Step 3: 提交**

```bash
git add src/config/settingsTab.ts
git commit -m "feat(reminder): add style/snooze-interval/max-snoozes settings UI"
```

---

### Task 4: 文档更新 + 全量验证

**Files:**
- Modify: `docs/MANUAL_QA.md`
- Modify: `README.md`

**Interfaces:**
- Consumes: 无
- Produces: spec §6.3 验收清单与 README 更新

- [ ] **Step 1: MANUAL_QA.md 追加**

在 `## Daily Reminder` 章节既有清单之后、`## Resize` 之前追加小节(若 `## Daily Reminder` 内已有 7 项 v1 条目,在其后追加下列条目到同一章节):

```markdown
### Snooze & Dismiss (modal style)

- [ ] Set 提醒时刻 1 min ahead + 贪睡间隔 1 min → modal appears with 「稍后 1 分钟(还可 3 次)」 and 「今日完成」
- [ ] Click 稍后 → re-appears after ~1 min, remaining count decreases
- [ ] Exhaust all snoozes → modal shows only 「今日完成」
- [ ] ESC / click backdrop → treated as 今日完成, no more popups today
- [ ] Snooze → restart Obsidian → modal still appears at snooze expiry
- [ ] Switch 提醒样式 to 通知条 → v1 behavior (single notice, finalized)
- [ ] Set 最大贪睡次数 to 0 → first modal shows only 「今日完成」
- [ ] Old data.json (only lastReminderDate) → upgrade keeps behavior (already-finalized day stays silent)
```

- [ ] **Step 2: README.md 更新**

把 `## Features` 中的行:

```markdown
- ⏰ **Daily reminder**: notice at a configurable time each day for unfinished & due-today tasks
```

替换为:

```markdown
- ⏰ **Daily reminder**: alarm-style modal (snooze / dismiss, both configurable) or plain notice, at a set time each day
```

- [ ] **Step 3: 全量验证**

Run: `npm run lint && npm test && npm run build`
Expected: lint 零错误;全部测试通过;build 成功

- [ ] **Step 4: 提交**

```bash
git add docs/MANUAL_QA.md README.md
git commit -m "docs: add snooze/dismiss QA checklist and update README feature line"
```
