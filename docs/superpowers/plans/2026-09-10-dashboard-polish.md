# Dashboard 打磨轮（Minor 清理 + 小改进）Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 清理终审遗留的 Minor 项并落地两个用户批准的行为改进（0% 环隐藏圆点、逾期行加来源日期）。

**Architecture:** 纯清理轮，不改接口签名、不加依赖。改动集中在 `dashboardStats.ts`（3 处健壮性）与三个渲染组件（视觉/信息小改）。

**Tech Stack:** 同主计划。零新依赖。

**来源:** 终审报告 Minor triage（`.superpowers/sdd/progress.md`）+ 用户 2026-09-10 两项决策。

## Global Constraints

- 同主计划：组件签名 `(data, callbacks) => HTMLElement`、`h()` 构建 DOM、主题变量、无 streak 文案、无新依赖、conventional commits
- **明确跳过**：jest.config 的 domHelpers ignore「清理」（终审建议有误——node project 的 `src/**` glob 仍会匹配该文件，删除 ignore 会让 DOM 测试在 node 环境跑挂）；`totalDone30d` 改名（终审判不值当）；`heatLevel(-1)` 测试（构造上不可能为负）
- jest：`src/data/**` 走 node，`src/views/**` 走 jsdom；提交前 `npm test` + `npm run lint` 全过

---

### Task 1: 数据层健壮性（dashboardStats.ts 三处）

**Files:**
- Modify: `src/data/dashboardStats.ts`
- Test: `src/data/dashboardStats.test.ts`

**Interfaces:**
- Consumes / Produces：均不变（`computeDashboardStats` 签名与 `DashboardStats` 字段不动，仅内部实现与副本语义）

- [ ] **Step 1: 在 `src/data/dashboardStats.test.ts` 的热力图 describe 后追加用例**

```ts
describe('computeDashboardStats — 副本语义', () => {
  test('doneTodayTasks 是快照数组的副本而非同引用', () => {
    const done = [makeTask({ checked: true })];
    const snap = makeSnapshot({ today: { pending: [], done, backlog: [] } });
    const s = computeDashboardStats(snap, NOW);
    expect(s.doneTodayTasks).not.toBe(snap.today.done);
    expect(s.doneTodayTasks).toEqual(snap.today.done);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest src/data/dashboardStats.test.ts`
Expected: FAIL — `expect(received).not.toBe(expected)`（当前返回同一引用）

- [ ] **Step 3: 修改 `src/data/dashboardStats.ts` 三处**

3a. due 分组的 +7 上限从绝对毫秒改为日历运算（DST 安全）。将：

```ts
  const today0 = dayStart(now).getTime();
  const dayMs = 24 * 60 * 60 * 1000;
  const limit7 = today0 + 7 * dayMs;
```

改为：

```ts
  const today0 = dayStart(now).getTime();
  const limit7Date = new Date(today0);
  limit7Date.setDate(limit7Date.getDate() + 7);
  const limit7 = limit7Date.getTime();
```

3b. 消除 `byDueAsc` 的双非空断言。将：

```ts
  const byDueAsc = (a: Task, b: Task) =>
    dayStart(a.meta!.due!).getTime() - dayStart(b.meta!.due!).getTime();
```

改为：

```ts
  const byDueAsc = (a: Task, b: Task) =>
    (a.meta?.due?.getTime() ?? 0) - (b.meta?.due?.getTime() ?? 0);
```

（组内元素必有 due，`?? 0` 仅为类型收窄服务，不影响排序语义。）

3c. `doneTodayTasks: done` 改为 `doneTodayTasks: [...done]`。

- [ ] **Step 4: 跑测试确认通过（含既有边界用例不回归）**

Run: `npx jest src/data/dashboardStats.test.ts`
Expected: PASS 全部用例

- [ ] **Step 5: Commit**

```bash
git add src/data/dashboardStats.ts src/data/dashboardStats.test.ts
git commit -m "refactor(dashboard): calendar-safe week limit, drop non-null assertions, copy doneTodayTasks"
```

---

### Task 2: 组件层打磨（summaryCard / dueGroups / doneToday + MANUAL_QA 措辞）

**Files:**
- Modify: `src/views/components/dashboard/summaryCard.ts`
- Modify: `src/views/components/dashboard/dueGroups.ts`
- Modify: `src/views/components/dashboard/doneToday.ts`
- Test: `src/views/components/dashboard/summaryCard.test.ts`
- Test: `src/views/components/dashboard/dueGroups.test.ts`
- Test: `src/views/components/dashboard/doneToday.test.ts`
- Modify: `docs/MANUAL_QA.md`

**Interfaces:**
- Consumes: Task 1 产物（无签名变化）、`renderTaskRow(task, showSourceDate, onToggle, onClick)`、`h()`
- Produces: 三个组件导出签名均不变

- [ ] **Step 1: 写失败测试**

1a. `summaryCard.test.ts` 的「0 任务空态」用例末尾追加断言：

```ts
    expect(el.querySelector('.tb-dash-ring-arc')).toBeNull();
```

并在该 describe 中加一个部分完成用例（防 0% 隐藏逻辑误伤）：

```ts
  test('0% 但有任务时环 arc 同样隐藏（零长度 dash 会渲染圆点）', () => {
    const el = renderSummaryCard(makeStats({
      todayTotal: 3, todayDone: 0, todayPending: 3, completionRate: 0
    }));
    expect(el.querySelector('.tb-dash-ring-pct')!.textContent).toBe('0%');
    expect(el.querySelector('.tb-dash-ring-arc')).toBeNull();
  });
```

1b. `dueGroups.test.ts` 追加两个用例（放在既有「任务行带 📅MM-DD 到期标签」用例之后）：

```ts
  test('dueToday 组行不带日期标签（今日冗余）', () => {
    const t = makeTask({ meta: { tags: [], due: new Date(2026, 8, 10) } });
    const el = renderDueGroups(makeStats({ dueToday: [t] }), makeHandlers());
    const todayCard = el.querySelectorAll('.tb-dash-due-card')[1];
    expect(todayCard.querySelector('.tb-task-src')).toBeNull();
  });

  test('逾期组：来源日期标签 + 跨年 due 显示年份', () => {
    const t = makeTask({
      sourceDate: new Date(2026, 8, 2),
      meta: { tags: [], due: new Date(2025, 11, 30) }
    });
    const el = renderDueGroups(makeStats({ overdue: [t] }), makeHandlers());
    const overdueCard = el.querySelectorAll('.tb-dash-due-card')[0];
    const labels = Array.from(overdueCard.querySelectorAll('.tb-task-src'))
      .map(s => s.textContent);
    expect(labels).toContain('📅2025-12-30');
    expect(labels).toContain('09-02');
    expect(labels.length).toBe(2);
  });
```

1c. `doneToday.test.ts` 追加用例：

```ts
  test('0 件时列表含空态文案', () => {
    const el = renderDoneToday(makeStats([]), handlers);
    const list = el.querySelector('.tb-dash-done-list') as HTMLElement;
    expect(list.textContent).toContain('还没有完成的任务');
  });
```

- [ ] **Step 2: 跑三个测试文件确认新用例失败**

Run: `npx jest src/views/components/dashboard/summaryCard.test.ts src/views/components/dashboard/dueGroups.test.ts src/views/components/dashboard/doneToday.test.ts`
Expected: 新增 4 个用例 FAIL（arc 仍存在 / 今日组仍有标签 / 无来源日期与年份 / 无空态文案），既有用例 PASS

- [ ] **Step 3: 实现组件改动**

3a. `summaryCard.ts`：arc 的 `ring.appendChild(sv('circle', {...}))` 包进 `if (stats.completionRate > 0) { ... }`；同文件 `main.appendChild(ring as unknown as Node)` 改为 `main.appendChild(ring)`。

3b. `dueGroups.ts` 整体替换为：

```ts
// src/views/components/dashboard/dueGroups.ts
import { h } from '../../../utils/domHelpers';
import type { DashboardStats, Task } from '../../../types';
import { renderTaskRow } from '../groupSection';

export interface DueGroupHandlers {
  onTaskToggle: (t: Task) => void;
  onTaskClick: (t: Task) => void;
}

function dueLabel(t: Task, now: Date): string | null {
  const d = t.meta?.due;
  if (!d) return null;
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return y !== now.getFullYear() ? `📅${y}-${m}-${day}` : `📅${m}-${day}`;
}

function groupCard(
  title: string,
  tasks: Task[],
  handlers: DueGroupHandlers,
  accent: string,
  opts: { showDueLabel?: boolean; showSourceDate?: boolean } = {}
): HTMLElement {
  const card = h('div', { cls: `tb-dash-card tb-dash-due-card ${accent}` });
  card.appendChild(h('div', { cls: 'tb-dash-due-title', text: `${title} · ${tasks.length}` }));

  const list = h('div', { cls: 'tb-dash-due-list' });
  if (tasks.length === 0) {
    list.appendChild(h('div', { cls: 'tb-dash-due-empty', text: '无 🎉' }));
  }
  const now = new Date();
  for (const t of tasks) {
    const row = renderTaskRow(t, opts.showSourceDate ?? false, handlers.onTaskToggle, handlers.onTaskClick);
    if (opts.showDueLabel) {
      const label = dueLabel(t, now);
      if (label) row.appendChild(h('span', { cls: 'tb-task-src', text: label }));
    }
    list.appendChild(row);
  }
  card.appendChild(list);
  return card;
}

export function renderDueGroups(stats: DashboardStats, handlers: DueGroupHandlers): HTMLElement {
  const wrap = h('div', { cls: 'tb-dash-due-groups' });
  wrap.appendChild(groupCard('⚠ 逾期未完成', stats.overdue, handlers, 'tb-dash-accent-overdue', {
    showDueLabel: true, showSourceDate: true
  }));
  wrap.appendChild(groupCard('📍 今日到期', stats.dueToday, handlers, 'tb-dash-accent-today'));
  wrap.appendChild(groupCard('🗓 未来 7 天', stats.dueNext7Days, handlers, 'tb-dash-accent-future', {
    showDueLabel: true
  }));
  return wrap;
}
```

3c. `doneToday.ts`：在任务行循环之后追加：

```ts
  if (stats.doneTodayTasks.length === 0) {
    list.appendChild(h('div', { cls: 'tb-dash-due-empty', text: '还没有完成的任务' }));
  }
```

3d. `docs/MANUAL_QA.md`：将热力图条目中「30 格、悬停显示」改为「30 格（rangeDays 更小时自动收敛为窗口天数）、悬停显示」。

- [ ] **Step 4: 跑三个测试文件确认全部通过**

Run: `npx jest src/views/components/dashboard/summaryCard.test.ts src/views/components/dashboard/dueGroups.test.ts src/views/components/dashboard/doneToday.test.ts`
Expected: PASS（含新增 4 用例）

- [ ] **Step 5: 全量验证 + Commit**

Run: `npm run lint && npm test && npm run build`
Expected: 全部通过

```bash
git add src/views/components/dashboard/summaryCard.ts src/views/components/dashboard/summaryCard.test.ts src/views/components/dashboard/dueGroups.ts src/views/components/dashboard/dueGroups.test.ts src/views/components/dashboard/doneToday.ts src/views/components/dashboard/doneToday.test.ts docs/MANUAL_QA.md
git commit -m "polish(dashboard): hide 0% ring dot, overdue source-date label, cross-year due, done-today empty state"
```
