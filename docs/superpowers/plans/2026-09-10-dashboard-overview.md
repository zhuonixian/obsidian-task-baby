# Dashboard「总览」Tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 在 TaskBaby 看板新增第 1 个 tab「总览」（默认打开）：今日摘要卡片（SVG 圆头完成率环 + 三磁贴）、30 天完成热力图、逾期/今日/未来7天任务组、今日已完成折叠清单。

**Architecture:** 统计与渲染分离 —— 新增 `src/data/dashboardStats.ts` 纯函数（输入现有 `IndexSnapshot`，输出 `DashboardStats`），四个渲染组件放 `src/views/components/dashboard/`，`boardView.ts` 加 `'overview'` mode 组装。勾选/跳转复用现有 `handleToggle`/`handleOpen`，任务行复用 `groupSection.ts` 的 `renderTaskRow`（本计划将其导出）。

**Tech Stack:** TypeScript + Obsidian API + esbuild + jest（node/jsdom 双项目）。零新依赖。

**Spec:** `docs/superpowers/specs/2026-09-10-dashboard-overview-design.md`

## Global Constraints

- 组件签名遵循现有模式：`(data, callbacks) => HTMLElement`，DOM 构建只用 `src/utils/domHelpers.ts` 的 `h()`（SVG 元素例外，用 `document.createElementNS`）
- 颜色一律用 Obsidian 主题变量（`--background-secondary`、`--text-muted` 等）；仅热力图 4 档色阶用固定手账色板，并为 `body.theme-dark` 写覆盖
- **禁止 streak / 连续完成 N 天 / 里程碑 / 激励文案**（spec 第 9 节明确）
- 无新依赖、无新设置项
- jest 双环境（`jest.config.js` projects）：`src/data/**` 走 node，`src/views/**` 走 jsdom —— 测试文件按目录放对位置即可
- commit 信息用 conventional commits（`feat:`/`test:`/`docs:`），与 git log 现有风格一致
- 命令：`npx jest src/data/dashboardStats.test.ts` 跑单文件；`npm test` 全量；`npm run lint`（tsc --noEmit）；`npm run build`

---

### Task 1: DashboardStats 类型 + computeDashboardStats 纯函数

**Files:**
- Modify: `src/types.ts`（文件末尾追加类型）
- Create: `src/data/dashboardStats.ts`
- Test: `src/data/dashboardStats.test.ts`

**Interfaces:**
- Consumes: `IndexSnapshot`、`Task`（`src/types.ts` 现有）、`formatYmd`（`src/utils/dateUtils.ts` 现有，签名 `(date: Date) => string`）
- Produces: 
  - `interface DailyDoneCount { dateKey: string; count: number }`
  - `interface DashboardStats { todayTotal: number; todayDone: number; todayPending: number; completionRate: number; overdueCount: number; overdue: Task[]; dueToday: Task[]; dueNext7Days: Task[]; doneTodayTasks: Task[]; dailyDone: DailyDoneCount[]; totalDone30d: number; avgPerDay: number }`
  - `computeDashboardStats(snapshot: IndexSnapshot, now: Date): DashboardStats`

- [ ] **Step 1: 在 `src/types.ts` 末尾（`TaskBodyChangedError` 类之后）追加类型**

```ts
// —— Dashboard 统计（overview tab 消费）——
export interface DailyDoneCount {
  dateKey: string;   // "YYYY-MM-DD"
  count: number;
}

export interface DashboardStats {
  // 今日摘要
  todayTotal: number;        // 今日 done+pending
  todayDone: number;
  todayPending: number;
  completionRate: number;    // 0..1，0 任务时为 0（不除零）
  overdueCount: number;
  // 按截止日期的任务组（均来自窗口内全部未完成 allPending，按 meta.due 过滤）
  overdue: Task[];           // due < today（日粒度）
  dueToday: Task[];          // due == today
  dueNext7Days: Task[];      // today < due <= today+7
  doneTodayTasks: Task[];    // 今日已完成（= snapshot.today.done）
  // 30 天热力图
  dailyDone: DailyDoneCount[];  // 固定 30 项，today-29 … today
  totalDone30d: number;
  avgPerDay: number;         // totalDone30d / 30，保留 1 位小数
}
```

- [ ] **Step 2: 写失败测试 `src/data/dashboardStats.test.ts`**

```ts
import { computeDashboardStats } from './dashboardStats';
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
});
```

- [ ] **Step 3: 跑测试确认失败**

Run: `npx jest src/data/dashboardStats.test.ts`
Expected: FAIL — `Cannot find module './dashboardStats'`

- [ ] **Step 4: 实现 `src/data/dashboardStats.ts`**

```ts
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
```

- [ ] **Step 5: 跑测试确认通过**

Run: `npx jest src/data/dashboardStats.test.ts`
Expected: PASS（3 describe 全绿）

- [ ] **Step 6: Commit**

```bash
git add src/types.ts src/data/dashboardStats.ts src/data/dashboardStats.test.ts
git commit -m "feat(dashboard): add computeDashboardStats pure function"
```

---

### Task 2: summaryCard 组件（SVG 圆头环 + 三磁贴）

**Files:**
- Create: `src/views/components/dashboard/summaryCard.ts`
- Test: `src/views/components/dashboard/summaryCard.test.ts`

**Interfaces:**
- Consumes: `DashboardStats`（Task 1）、`h`（`src/utils/domHelpers.ts`）
- Produces: `renderSummaryCard(stats: DashboardStats): HTMLElement`；局部 SVG helper `sv(tag, attrs)` 不导出

- [ ] **Step 1: 写失败测试 `src/views/components/dashboard/summaryCard.test.ts`**

```ts
import { renderSummaryCard } from './summaryCard';
import type { DashboardStats } from '../../../types';

function makeStats(over: Partial<DashboardStats> = {}): DashboardStats {
  return {
    todayTotal: 8,
    todayDone: 6,
    todayPending: 2,
    completionRate: 0.75,
    overdueCount: 3,
    overdue: [],
    dueToday: [],
    dueNext7Days: [],
    doneTodayTasks: [],
    dailyDone: [],
    totalDone30d: 47,
    avgPerDay: 1.6,
    ...over
  };
}

describe('renderSummaryCard', () => {
  test('环 arc 的 stroke-dasharray 与完成率一致，圆头端点', () => {
    const el = renderSummaryCard(makeStats());
    const arc = el.querySelector('.tb-dash-ring-arc') as SVGCircleElement;
    expect(arc).toBeTruthy();
    expect(arc.getAttribute('stroke-dasharray')).toBe('212.1 282.7'); // 0.75 × 2π×45
    expect(arc.getAttribute('stroke-linecap')).toBe('round');
  });

  test('中心文本：百分比 + n/m 完成', () => {
    const el = renderSummaryCard(makeStats());
    expect(el.querySelector('.tb-dash-ring-pct')!.textContent).toBe('75%');
    expect(el.querySelector('.tb-dash-ring-sub')!.textContent).toBe('6/8 完成');
  });

  test('三个磁贴数字：待办 2 / 已完成 6 / 逾期 3', () => {
    const el = renderSummaryCard(makeStats());
    const texts = Array.from(el.querySelectorAll('.tb-dash-tile')).map(t => t.textContent);
    expect(texts[0]).toContain('2');
    expect(texts[0]).toContain('今日待办');
    expect(texts[1]).toContain('6');
    expect(texts[1]).toContain('已完成');
    expect(texts[2]).toContain('3');
    expect(texts[2]).toContain('逾期');
  });

  test('0 任务空态：环显示 — 与「还没有任务」', () => {
    const el = renderSummaryCard(makeStats({
      todayTotal: 0, todayDone: 0, todayPending: 0, completionRate: 0
    }));
    expect(el.querySelector('.tb-dash-ring-pct')!.textContent).toBe('—');
    expect(el.querySelector('.tb-dash-ring-sub')!.textContent).toBe('还没有任务');
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest src/views/components/dashboard/summaryCard.test.ts`
Expected: FAIL — `Cannot find module './summaryCard'`

- [ ] **Step 3: 实现 `src/views/components/dashboard/summaryCard.ts`**

```ts
// src/views/components/dashboard/summaryCard.ts
import { h } from '../../../utils/domHelpers';
import type { DashboardStats } from '../../../types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const R = 45;
const C = 2 * Math.PI * R; // ≈ 282.7

// h() 只覆盖 HTMLElement；SVG 元素必须 createElementNS
function sv<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function renderSummaryCard(stats: DashboardStats): HTMLElement {
  const card = h('div', { cls: 'tb-dash-card tb-dash-summary' });
  const main = h('div', { cls: 'tb-dash-summary-main' });

  const ring = sv('svg', { viewBox: '0 0 112 112', class: 'tb-dash-ring' });
  ring.appendChild(sv('circle', {
    cx: 56, cy: 56, r: R, fill: 'none',
    stroke: 'currentColor', 'stroke-width': 12, class: 'tb-dash-ring-bg'
  }));
  ring.appendChild(sv('circle', {
    cx: 56, cy: 56, r: R, fill: 'none',
    stroke: 'currentColor', 'stroke-width': 12,
    'stroke-linecap': 'round',
    'stroke-dasharray': `${(stats.completionRate * C).toFixed(1)} ${C.toFixed(1)}`,
    transform: 'rotate(-90 56 56)',
    class: 'tb-dash-ring-arc'
  }));
  const pct = sv('text', { x: 56, y: 54, 'text-anchor': 'middle', class: 'tb-dash-ring-pct' });
  pct.textContent = stats.todayTotal === 0 ? '—' : `${Math.round(stats.completionRate * 100)}%`;
  ring.appendChild(pct);
  const sub = sv('text', { x: 56, y: 70, 'text-anchor': 'middle', class: 'tb-dash-ring-sub' });
  sub.textContent = stats.todayTotal === 0 ? '还没有任务' : `${stats.todayDone}/${stats.todayTotal} 完成`;
  ring.appendChild(sub);
  main.appendChild(ring as unknown as Node);

  const tiles = h('div', { cls: 'tb-dash-tiles' });
  tiles.appendChild(renderTile('▢ 今日待办', stats.todayPending, 'tb-dash-tile-pend'));
  tiles.appendChild(renderTile('☑ 已完成', stats.todayDone, 'tb-dash-tile-done'));
  tiles.appendChild(renderTile('⚠ 逾期', stats.overdueCount, 'tb-dash-tile-overdue'));
  main.appendChild(tiles);

  card.appendChild(main);
  return card;
}

function renderTile(label: string, n: number, cls: string): HTMLElement {
  const tile = h('div', { cls: `tb-dash-tile ${cls}` });
  tile.appendChild(h('div', { cls: 'tb-dash-tile-n', text: String(n) }));
  tile.appendChild(h('div', { cls: 'tb-dash-tile-label', text: label }));
  return tile;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest src/views/components/dashboard/summaryCard.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add src/views/components/dashboard/summaryCard.ts src/views/components/dashboard/summaryCard.test.ts
git commit -m "feat(dashboard): add summary card with SVG ring and tiles"
```

---

### Task 3: heatmap 组件（30 天 CSS grid 色阶）

**Files:**
- Create: `src/views/components/dashboard/heatmap.ts`
- Test: `src/views/components/dashboard/heatmap.test.ts`

**Interfaces:**
- Consumes: `DashboardStats`（Task 1）、`h`
- Produces: 
  - `heatLevel(count: number): 0 | 1 | 2 | 3`（导出，测试用）
  - `renderHeatmap(stats: DashboardStats): HTMLElement`

- [ ] **Step 1: 写失败测试 `src/views/components/dashboard/heatmap.test.ts`**

```ts
import { renderHeatmap, heatLevel } from './heatmap';
import type { DashboardStats, DailyDoneCount } from '../../../types';

function days30(counts: number[]): DailyDoneCount[] {
  // counts[i] 对应 today-29+i
  return counts.map((c, i) => {
    const d = new Date(2026, 8, 10 - (29 - i));
    const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    return { dateKey: key, count: c };
  });
}

function makeStats(over: Partial<DashboardStats> = {}): DashboardStats {
  return {
    todayTotal: 8, todayDone: 6, todayPending: 2, completionRate: 0.75,
    overdueCount: 0, overdue: [], dueToday: [], dueNext7Days: [],
    doneTodayTasks: [], dailyDone: days30(new Array(30).fill(0)),
    totalDone30d: 0, avgPerDay: 0,
    ...over
  };
}

describe('heatLevel', () => {
  test('0→l0, 1-2→l1, 3-4→l2, 5+→l3', () => {
    expect(heatLevel(0)).toBe(0);
    expect(heatLevel(1)).toBe(1);
    expect(heatLevel(2)).toBe(1);
    expect(heatLevel(3)).toBe(2);
    expect(heatLevel(4)).toBe(2);
    expect(heatLevel(5)).toBe(3);
    expect(heatLevel(99)).toBe(3);
  });
});

describe('renderHeatmap', () => {
  test('渲染 30 个格子，色阶类与计数对应', () => {
    const counts = new Array(30).fill(0);
    counts[28] = 2;  // 9-09
    counts[29] = 5;  // 9-10
    const el = renderHeatmap(makeStats({ dailyDone: days30(counts) }));
    const cells = el.querySelectorAll('.tb-dash-hm-cell:not(.legend)');
    expect(cells.length).toBe(30);
    expect(cells[28].className).toContain('l1');
    expect(cells[29].className).toContain('l3');
    expect(cells[0].className).toContain('l0');
  });

  test('格子 title 含日期与数量（悬停 tooltip）', () => {
    const counts = new Array(30).fill(0);
    counts[29] = 3;
    const el = renderHeatmap(makeStats({ dailyDone: days30(counts) }));
    const cells = el.querySelectorAll('.tb-dash-hm-cell:not(.legend)');
    expect((cells[29] as HTMLElement).title).toBe('2026-09-10 · 完成 3 件');
  });

  test('头部汇总文案：共完成 N 件 · 日均 X', () => {
    const el = renderHeatmap(makeStats({ totalDone30d: 47, avgPerDay: 1.6 }));
    expect(el.querySelector('.tb-dash-heatmap-sum')!.textContent)
      .toBe('共完成 47 件 · 日均 1.6');
  });

  test('图例：少/多 + 4 档色块', () => {
    const el = renderHeatmap(makeStats());
    expect(el.querySelector('.tb-dash-hm-legend')!.textContent).toContain('少');
    expect(el.querySelector('.tb-dash-hm-legend')!.textContent).toContain('多');
    expect(el.querySelectorAll('.tb-dash-hm-cell.legend').length).toBe(4);
  });
});
```

- [ ] **Step 2: 跑测试确认失败**

Run: `npx jest src/views/components/dashboard/heatmap.test.ts`
Expected: FAIL — `Cannot find module './heatmap'`

- [ ] **Step 3: 实现 `src/views/components/dashboard/heatmap.ts`**

```ts
// src/views/components/dashboard/heatmap.ts
import { h } from '../../../utils/domHelpers';
import type { DashboardStats } from '../../../types';

export function heatLevel(count: number): 0 | 1 | 2 | 3 {
  if (count <= 0) return 0;
  if (count <= 2) return 1;
  if (count <= 4) return 2;
  return 3;
}

export function renderHeatmap(stats: DashboardStats): HTMLElement {
  const card = h('div', { cls: 'tb-dash-card tb-dash-heatmap' });

  const head = h('div', { cls: 'tb-dash-heatmap-head' });
  head.appendChild(h('span', { cls: 'tb-dash-heatmap-title', text: '📈 近 30 天完成热力图' }));
  head.appendChild(h('span', {
    cls: 'tb-dash-heatmap-sum',
    text: `共完成 ${stats.totalDone30d} 件 · 日均 ${stats.avgPerDay}`
  }));
  card.appendChild(head);

  const grid = h('div', { cls: 'tb-dash-hm-grid' });
  for (const d of stats.dailyDone) {
    grid.appendChild(h('div', {
      cls: `tb-dash-hm-cell l${heatLevel(d.count)}`,
      title: `${d.dateKey} · 完成 ${d.count} 件`
    }));
  }
  card.appendChild(grid);

  const legend = h('div', { cls: 'tb-dash-hm-legend' });
  legend.appendChild(h('span', { cls: 'tb-dash-hm-legend-text', text: '少' }));
  for (const lv of [0, 1, 2, 3]) {
    legend.appendChild(h('span', { cls: `tb-dash-hm-cell l${lv} legend` }));
  }
  legend.appendChild(h('span', { cls: 'tb-dash-hm-legend-text', text: '多' }));
  card.appendChild(legend);

  return card;
}
```

- [ ] **Step 4: 跑测试确认通过**

Run: `npx jest src/views/components/dashboard/heatmap.test.ts`
Expected: PASS（4 tests）

- [ ] **Step 5: Commit**

```bash
git add src/views/components/dashboard/heatmap.ts src/views/components/dashboard/heatmap.test.ts
git commit -m "feat(dashboard): add 30-day completion heatmap"
```

---

### Task 4: dueGroups + doneToday 组件（含 renderTaskRow 导出）

**Files:**
- Modify: `src/views/components/groupSection.ts:44`（`function renderTaskRow` → `export function renderTaskRow`，其余不动）
- Create: `src/views/components/dashboard/dueGroups.ts`
- Create: `src/views/components/dashboard/doneToday.ts`
- Test: `src/views/components/dashboard/dueGroups.test.ts`
- Test: `src/views/components/dashboard/doneToday.test.ts`

**Interfaces:**
- Consumes: `DashboardStats`、`Task`（Task 1）、`h`、`renderTaskRow(task, showSourceDate, onToggle, onClick)`（本任务从 groupSection 导出）
- Produces:
  - `interface DueGroupHandlers { onTaskToggle: (t: Task) => void; onTaskClick: (t: Task) => void }`（dueGroups.ts 导出，doneToday.ts 复用）
  - `renderDueGroups(stats: DashboardStats, handlers: DueGroupHandlers): HTMLElement`
  - `renderDoneToday(stats: DashboardStats, handlers: DueGroupHandlers): HTMLElement`

- [ ] **Step 1: 修改 `src/views/components/groupSection.ts` 第 44 行**

```ts
// 原：function renderTaskRow(
export function renderTaskRow(
```

仅去掉前加 `export`，函数体不变。

- [ ] **Step 2: 写失败测试 `src/views/components/dashboard/dueGroups.test.ts`**

```ts
import { renderDueGroups } from './dueGroups';
import type { DueGroupHandlers } from './dueGroups';
import type { DashboardStats, Task } from '../../../types';

function makeTask(over: Partial<Task> = {}): Task {
  return {
    sourcePath: 'DailyLife/2026/09/2026-09-10.md',
    sourceDate: new Date(2026, 8, 10),
    lineStart: 0, lineEnd: 0,
    rawText: '- [ ] x', body: 'x', bodyHash: 'h',
    checked: false, indent: 0,
    ...over
  };
}

function makeStats(over: Partial<DashboardStats> = {}): DashboardStats {
  return {
    todayTotal: 0, todayDone: 0, todayPending: 0, completionRate: 0,
    overdueCount: 0, overdue: [], dueToday: [], dueNext7Days: [],
    doneTodayTasks: [], dailyDone: [], totalDone30d: 0, avgPerDay: 0,
    ...over
  };
}

function makeHandlers(): DueGroupHandlers & { onTaskToggle: jest.Mock; onTaskClick: jest.Mock } {
  return { onTaskToggle: jest.fn(), onTaskClick: jest.fn() };
}

describe('renderDueGroups', () => {
  test('三组标题带计数', () => {
    const el = renderDueGroups(makeStats({
      overdue: [makeTask()], dueToday: [makeTask(), makeTask()], dueNext7Days: []
    }), makeHandlers());
    const titles = Array.from(el.querySelectorAll('.tb-dash-due-title')).map(t => t.textContent);
    expect(titles[0]).toBe('⚠ 逾期未完成 · 1');
    expect(titles[1]).toBe('📍 今日到期 · 2');
    expect(titles[2]).toBe('🗓 未来 7 天 · 0');
  });

  test('任务行带 📅MM-DD 到期标签', () => {
    const t = makeTask({ meta: { tags: [], due: new Date(2026, 8, 12) } });
    const el = renderDueGroups(makeStats({ dueNext7Days: [t] }), makeHandlers());
    const futureCard = el.querySelectorAll('.tb-dash-due-card')[2];
    expect(futureCard.querySelector('.tb-task-src')!.textContent).toBe('📅09-12');
  });

  test('空组显示「无 🎉」', () => {
    const el = renderDueGroups(makeStats(), makeHandlers());
    expect(el.querySelector('.tb-dash-due-empty')!.textContent).toBe('无 🎉');
  });

  test('勾选 checkbox 触发 onTaskToggle', () => {
    const t = makeTask({ meta: { tags: [], due: new Date(2026, 8, 10) } });
    const handlers = makeHandlers();
    const el = renderDueGroups(makeStats({ dueToday: [t] }), handlers);
    const box = el.querySelector('.tb-task-checkbox') as HTMLInputElement;
    box.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handlers.onTaskToggle).toHaveBeenCalledWith(t);
    expect(handlers.onTaskClick).not.toHaveBeenCalled();
  });
});
```

- [ ] **Step 3: 写失败测试 `src/views/components/dashboard/doneToday.test.ts`**

```ts
import { renderDoneToday } from './doneToday';
import type { DueGroupHandlers } from './dueGroups';
import type { DashboardStats, Task } from '../../../types';

function makeTask(over: Partial<Task> = {}): Task {
  return {
    sourcePath: 'DailyLife/2026/09/2026-09-10.md',
    sourceDate: new Date(2026, 8, 10),
    lineStart: 0, lineEnd: 0,
    rawText: '- [x] y', body: 'y', bodyHash: 'h',
    checked: true, indent: 0,
    ...over
  };
}

function makeStats(done: Task[]): DashboardStats {
  return {
    todayTotal: done.length, todayDone: done.length, todayPending: 0,
    completionRate: 1, overdueCount: 0,
    overdue: [], dueToday: [], dueNext7Days: [],
    doneTodayTasks: done, dailyDone: [], totalDone30d: 0, avgPerDay: 0
  };
}

const handlers: DueGroupHandlers = { onTaskToggle: jest.fn(), onTaskClick: jest.fn() };

describe('renderDoneToday', () => {
  test('标题计数与默认收起', () => {
    const el = renderDoneToday(makeStats([makeTask(), makeTask()]), handlers);
    expect(el.querySelector('.tb-dash-done-title')!.textContent).toBe('✅ 今日已完成 · 2 件');
    const list = el.querySelector('.tb-dash-done-list') as HTMLElement;
    expect(list.style.display).toBe('none');
  });

  test('点击 header 展开、再点收起，箭头跟随', () => {
    const el = renderDoneToday(makeStats([makeTask()]), handlers);
    const header = el.querySelector('.tb-dash-done-header') as HTMLElement;
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const list = el.querySelector('.tb-dash-done-list') as HTMLElement;
    expect(list.style.display).toBe('block');
    expect(el.querySelector('.tb-dash-done-arrow')!.textContent).toBe('▼');
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(list.style.display).toBe('none');
    expect(el.querySelector('.tb-dash-done-arrow')!.textContent).toBe('▶');
  });

  test('展开后列表包含已完成任务行（划线样式）', () => {
    const el = renderDoneToday(makeStats([makeTask({ body: '写日报' })]), handlers);
    const list = el.querySelector('.tb-dash-done-list') as HTMLElement;
    const body = list.querySelector('.tb-task-body') as HTMLElement;
    expect(body.textContent).toBe('写日报');
    expect(body.className).toContain('tb-done');
  });
});
```

- [ ] **Step 4: 跑两个测试确认失败**

Run: `npx jest src/views/components/dashboard/dueGroups.test.ts src/views/components/dashboard/doneToday.test.ts`
Expected: FAIL — `Cannot find module './dueGroups'`

- [ ] **Step 5: 实现 `src/views/components/dashboard/dueGroups.ts`**

```ts
// src/views/components/dashboard/dueGroups.ts
import { h } from '../../../utils/domHelpers';
import type { DashboardStats, Task } from '../../../types';
import { renderTaskRow } from '../groupSection';

export interface DueGroupHandlers {
  onTaskToggle: (t: Task) => void;
  onTaskClick: (t: Task) => void;
}

function dueLabel(t: Task): string {
  const d = t.meta!.due!;
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `📅${m}-${day}`;
}

function groupCard(
  title: string,
  tasks: Task[],
  handlers: DueGroupHandlers,
  accent: string
): HTMLElement {
  const card = h('div', { cls: `tb-dash-card tb-dash-due-card ${accent}` });
  card.appendChild(h('div', { cls: 'tb-dash-due-title', text: `${title} · ${tasks.length}` }));

  const list = h('div', { cls: 'tb-dash-due-list' });
  if (tasks.length === 0) {
    list.appendChild(h('div', { cls: 'tb-dash-due-empty', text: '无 🎉' }));
  }
  for (const t of tasks) {
    const row = renderTaskRow(t, false, handlers.onTaskToggle, handlers.onTaskClick);
    row.appendChild(h('span', { cls: 'tb-task-src', text: dueLabel(t) }));
    list.appendChild(row);
  }
  card.appendChild(list);
  return card;
}

export function renderDueGroups(stats: DashboardStats, handlers: DueGroupHandlers): HTMLElement {
  const wrap = h('div', { cls: 'tb-dash-due-groups' });
  wrap.appendChild(groupCard('⚠ 逾期未完成', stats.overdue, handlers, 'tb-dash-accent-overdue'));
  wrap.appendChild(groupCard('📍 今日到期', stats.dueToday, handlers, 'tb-dash-accent-today'));
  wrap.appendChild(groupCard('🗓 未来 7 天', stats.dueNext7Days, handlers, 'tb-dash-accent-future'));
  return wrap;
}
```

- [ ] **Step 6: 实现 `src/views/components/dashboard/doneToday.ts`**

```ts
// src/views/components/dashboard/doneToday.ts
import { h } from '../../../utils/domHelpers';
import type { DashboardStats } from '../../../types';
import { renderTaskRow } from '../groupSection';
import type { DueGroupHandlers } from './dueGroups';

export function renderDoneToday(stats: DashboardStats, handlers: DueGroupHandlers): HTMLElement {
  const card = h('div', { cls: 'tb-dash-card tb-dash-done-today' });

  const header = h('div', { cls: 'tb-dash-done-header' });
  header.appendChild(h('span', { cls: 'tb-dash-done-arrow', text: '▶' }));
  header.appendChild(h('span', {
    cls: 'tb-dash-done-title',
    text: `✅ 今日已完成 · ${stats.doneTodayTasks.length} 件`
  }));
  card.appendChild(header);

  const list = h('div', { cls: 'tb-dash-done-list' });
  list.style.display = 'none';
  header.onclick = () => {
    const open = list.style.display !== 'none';
    list.style.display = open ? 'none' : 'block';
    (header.querySelector('.tb-dash-done-arrow') as HTMLElement).textContent = open ? '▶' : '▼';
  };
  for (const t of stats.doneTodayTasks) {
    list.appendChild(renderTaskRow(t, false, handlers.onTaskToggle, handlers.onTaskClick));
  }
  card.appendChild(list);

  return card;
}
```

- [ ] **Step 7: 跑测试确认通过**

Run: `npx jest src/views/components/dashboard/dueGroups.test.ts src/views/components/dashboard/doneToday.test.ts`
Expected: PASS（7 tests）

- [ ] **Step 8: 跑 groupSection 相关既有测试确认导出改动无回归**

Run: `npm test`
Expected: 全绿（含 node + jsdom 两个 project）

- [ ] **Step 9: Commit**

```bash
git add src/views/components/groupSection.ts src/views/components/dashboard/dueGroups.ts src/views/components/dashboard/dueGroups.test.ts src/views/components/dashboard/doneToday.ts src/views/components/dashboard/doneToday.test.ts
git commit -m "feat(dashboard): add due-date groups and done-today collapsible list"
```

---

### Task 5: boardView 集成 + 样式

**Files:**
- Modify: `src/views/boardView.ts`
- Modify: `styles.css`（文件末尾追加）

**Interfaces:**
- Consumes: Task 1-4 全部产物（`computeDashboardStats`、`renderSummaryCard`、`renderHeatmap`、`renderDueGroups`、`renderDoneToday`、`DueGroupHandlers`）
- Produces: BoardTabView 新 mode `'overview'`（默认值），无新导出

**说明：** boardView 无既有单测（依赖 Obsidian ItemView），本任务以 `npm run lint` + `npm run build` + Task 6 手测清单验证。

- [ ] **Step 1: 修改 `src/views/boardView.ts`**

1. 顶部 import 区追加：

```ts
import { computeDashboardStats } from '../data/dashboardStats';
import { renderSummaryCard } from './components/dashboard/summaryCard';
import { renderHeatmap } from './components/dashboard/heatmap';
import { renderDueGroups } from './components/dashboard/dueGroups';
import { renderDoneToday } from './components/dashboard/doneToday';
import type { DueGroupHandlers } from './components/dashboard/dueGroups';
```

2. 第 13 行 ViewMode 与默认 mode 改为：

```ts
type ViewMode = 'overview' | 'today' | 'calendar' | 'global';
```

```ts
  private mode: ViewMode = 'overview';
```

3. `render()` 中 titleText 三元链前面加 overview 分支（改为 if/else 或嵌套三元，最终效果）：

```ts
    const titleText = this.mode === 'overview'
      ? `📊 任务看板 — 总览`
      : this.mode === 'today'
        ? `📊 任务看板 — 今日`
        : this.mode === 'calendar'
          ? `📊 任务看板 — 日历`
          : `📊 任务看板 — 全局`;
```

4. tab 栏 `tabToday` 之前插入总览 tab：

```ts
    const tabOverview = h('button', {
      cls: 'tb-tab' + (this.mode === 'overview' ? ' active' : ''),
      text: '🏠 总览',
      onclick: () => this.switchMode('overview')
    });
    tabs.appendChild(tabOverview);
```

5. body 分支（`if (this.mode === 'today')` 之前）加：

```ts
    if (this.mode === 'overview') {
      body.appendChild(this.renderOverview());
    } else if (this.mode === 'today') {
```

（原 `if (this.mode === 'today') {` 改为 `} else if`，保持后续分支不变。）

6. `renderTodayView()` 方法之前新增：

```ts
  private renderOverview(): HTMLElement {
    const stats = computeDashboardStats(this.snapshot!, new Date());
    const handlers: DueGroupHandlers = {
      onTaskToggle: t => this.handleToggle(t),
      onTaskClick: t => this.handleOpen(t)
    };
    const wrap = h('div', { cls: 'tb-dash-root' });
    wrap.appendChild(renderSummaryCard(stats));
    wrap.appendChild(renderHeatmap(stats));
    wrap.appendChild(renderDueGroups(stats, handlers));
    wrap.appendChild(renderDoneToday(stats, handlers));
    return wrap;
  }
```

- [ ] **Step 2: `styles.css` 末尾追加**

```css
/* —— Dashboard overview —— */
.tb-dash-root {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.tb-dash-card {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  border-radius: 12px;
  padding: 12px 14px;
}

/* 摘要卡 */
.tb-dash-summary-main {
  display: flex;
  align-items: center;
  gap: 20px;
  flex-wrap: wrap;
}
.tb-dash-ring { width: 112px; height: 112px; flex-shrink: 0; }
.tb-dash-ring-bg { color: var(--background-modifier-border); }
.tb-dash-ring-arc { color: var(--interactive-accent); }
.tb-dash-ring-pct { fill: var(--text-normal); font-size: 20px; font-weight: 700; }
.tb-dash-ring-sub { fill: var(--text-muted); font-size: 9px; }
.tb-dash-tiles {
  flex: 1;
  display: grid;
  grid-template-columns: repeat(3, 1fr);
  gap: 8px;
  min-width: 200px;
}
.tb-dash-tile {
  border-radius: 10px;
  padding: 8px 6px;
  text-align: center;
  background: var(--background-modifier-hover);
}
.tb-dash-tile-n { font-size: 1.4em; font-weight: 700; }
.tb-dash-tile-label { font-size: 0.77em; color: var(--text-muted); }
.tb-dash-tile-overdue { background: var(--background-modifier-error); }
.tb-dash-tile-overdue .tb-dash-tile-n { color: var(--text-error); }

/* 热力图 */
.tb-dash-heatmap-head {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 8px;
  flex-wrap: wrap;
  gap: 4px;
}
.tb-dash-heatmap-title { font-weight: bold; }
.tb-dash-heatmap-sum { font-size: 0.77em; color: var(--text-muted); }
.tb-dash-hm-grid {
  display: grid;
  grid-template-columns: repeat(15, 1fr);
  gap: 3px;
}
.tb-dash-hm-cell { aspect-ratio: 1; border-radius: 4px; }
.tb-dash-hm-cell.l0 { background: var(--background-modifier-border); }
.tb-dash-hm-cell.l1 { background: #f3d9c8; }
.tb-dash-hm-cell.l2 { background: #eec3a6; }
.tb-dash-hm-cell.l3 { background: #e8987a; }
body.theme-dark .tb-dash-hm-cell.l1 { background: #5a4636; }
body.theme-dark .tb-dash-hm-cell.l2 { background: #7d5a40; }
body.theme-dark .tb-dash-hm-cell.l3 { background: #c97b5d; }
.tb-dash-hm-legend {
  display: flex;
  align-items: center;
  gap: 3px;
  justify-content: flex-end;
  margin-top: 6px;
}
.tb-dash-hm-cell.legend { width: 10px; height: 10px; aspect-ratio: auto; }
.tb-dash-hm-legend-text { font-size: 0.69em; color: var(--text-muted); margin: 0 3px; }

/* 任务三组 */
.tb-dash-due-groups {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(220px, 1fr));
  gap: 12px;
}
.tb-dash-due-card { border-top: 3px solid var(--background-modifier-border); }
.tb-dash-due-card.tb-dash-accent-overdue { border-top-color: var(--text-error); }
.tb-dash-due-card.tb-dash-accent-today { border-top-color: var(--interactive-accent); }
.tb-dash-due-card.tb-dash-accent-future { border-top-color: var(--text-success); }
.tb-dash-due-title { font-size: 0.85em; font-weight: bold; margin-bottom: 6px; }
.tb-dash-due-empty { font-size: 0.85em; color: var(--text-muted); }

/* 今日已完成折叠 */
.tb-dash-done-header {
  display: flex;
  gap: 6px;
  align-items: center;
  cursor: pointer;
}
.tb-dash-done-title { font-weight: bold; color: var(--text-success); }
.tb-dash-done-list { margin-top: 6px; }
```

- [ ] **Step 3: 类型检查 + 全量测试 + 构建**

Run: `npm run lint && npm test && npm run build`
Expected: 三者全部通过（lint 无错误、jest 全绿、esbuild 产出 `dist/task-baby/main.js`）

- [ ] **Step 4: Commit**

```bash
git add src/views/boardView.ts styles.css
git commit -m "feat(dashboard): wire overview tab into board view with styles"
```

---

### Task 6: 文档更新（README + MANUAL_QA）

**Files:**
- Modify: `README.md`
- Modify: `docs/MANUAL_QA.md`

**Interfaces:**
- Consumes: Task 1-5 的最终 UI（总览 tab 四区块）
- Produces: 无代码产物

- [ ] **Step 1: `README.md` Features 区块修改**

将 `- 📊 **Full board tab** with three views:` 改为 four views，并在其列表最前面插入：

```markdown
  - 🏠 **Overview**: dashboard — completion ring, 30-day heatmap, due-date groups
```

即：

```markdown
- 📊 **Full board tab** with four views:
  - 🏠 **Overview**: dashboard — completion ring, 30-day heatmap, due-date groups
  - 📅 **Today**: 3-column layout (pending / done / backlog)
  - 🗓 **Calendar**: 30-day grid with task counts
  - 🌐 **Global**: all pending (deduped) vs all done
```

- [ ] **Step 2: `docs/MANUAL_QA.md` 末尾追加 dashboard 清单**

```markdown
## Dashboard overview tab

打开看板（默认落在「总览」tab）：

- [ ] 摘要卡：环百分比 = 今日 done/(done+pending)；三磁贴数字与今日一致；0 任务时环显示 `—` 与「还没有任务」
- [ ] 热力图：30 格、悬停显示 `日期 · 完成 N 件`；头部「共完成 N 件 · 日均 X」
- [ ] 逾期组任务带红色顶边 + 📅 标签；今日到期/未来 7 天分组正确（对照一个 due=今天、一个 due=明天的任务）
- [ ] 勾选任一任务 → 写回源文件（Notice 提示）→ dashboard 数字/环/热力图刷新
- [ ] 点击任务正文 → 打开源笔记并定位到行
- [ ] 「今日已完成」默认收起，点击展开可再收起；展开的行有划线样式
- [ ] 亮/暗主题各过一遍：热力图 4 档色阶在暗色下可辨识
- [ ] 拖窄面板：任务三组自动降为两列/单列；热力图格子等比缩小
- [ ] 其余三个 tab（今日/日历/全局）行为不变
```

- [ ] **Step 3: 最终全量验证**

Run: `npm run lint && npm test && npm run build`
Expected: 全部通过

- [ ] **Step 4: Commit**

```bash
git add README.md docs/MANUAL_QA.md
git commit -m "docs: add dashboard overview feature to README and QA checklist"
```
