# 打磨轮 2：刷新状态保留 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** 勾选任务触发全量重绘后，周历展开面板与"今日已完成"折叠保持原状态；顺带跨年周标题显示年份。

**Architecture:** UI 状态提升到 `boardView`（`weekSelectedKey`/`doneTodayOpen` 字段），`weekView`/`doneToday` 组件加可选 `opts` 参数（初始值 + 变更回调），签名向后兼容，既有调用与测试不受影响。不改全量重绘架构。

**Tech Stack:** 同前。零新依赖。

**Spec（对话批准的设计，2026-09-10）:** 周历 `initialSelectedKey` 在周内则恢复选中+展开，跨周残留自动忽略；`doneToday` `initialOpen` 恢复展开态与箭头；跨年周（首尾年份不同）标题两端带年份。

## Global Constraints

- 组件签名向后兼容：第三参 `opts` 可选，既有两参调用行为不变
- `h()` 构建 DOM、主题变量、无 streak 文案、无新依赖、conventional commits
- jest：`src/views/**` 走 jsdom
- 命令：`npx jest <file>` 聚焦、`npm test` 全量、`npm run lint`

---

### Task 1: 组件层状态恢复 opts + 跨年显示

**Files:**
- Modify: `src/views/components/dashboard/weekView.ts`
- Modify: `src/views/components/dashboard/doneToday.ts`
- Test: `src/views/components/dashboard/weekView.test.ts`（末尾追加 describe）
- Test: `src/views/components/dashboard/doneToday.test.ts`（末尾追加 describe）

**Interfaces:**
- Consumes: 既有 `WeekDayStat`/`DueGroupHandlers`/`renderTaskRow`/`h`
- Produces:
  - `interface WeekViewOptions { initialSelectedKey?: string | null; onSelectedChange?: (key: string | null) => void }`（weekView.ts 导出）
  - `renderWeekView(weekDays, handlers, opts?: WeekViewOptions): HTMLElement`
  - `interface DoneTodayOptions { initialOpen?: boolean; onOpenChange?: (open: boolean) => void }`（doneToday.ts 导出）
  - `renderDoneToday(stats, handlers, opts?: DoneTodayOptions): HTMLElement`

- [ ] **Step 1: 在 `weekView.test.ts` 末尾追加**

```ts
describe('renderWeekView — 状态恢复与跨年', () => {
  test('initialSelectedKey 在周内 → 初始即选中并展开该日', () => {
    const week = makeWeek({ 2: { pending: [makeTask({ body: 'p' })] } });
    const el = renderWeekView(week, handlers, { initialSelectedKey: '2026-09-09' });
    const cells = el.querySelectorAll('.tb-dash-week-cell');
    expect(cells[2].className).toContain('selected');
    expect(el.querySelector('.tb-dash-week-detail .tb-task-body')!.textContent).toBe('p');
  });

  test('initialSelectedKey 不在周内（跨周残留）→ 忽略，无选中无展开', () => {
    const el = renderWeekView(makeWeek(), handlers, { initialSelectedKey: '2026-08-30' });
    expect(el.querySelector('.tb-dash-week-cell.selected')).toBeNull();
    expect(el.querySelector('.tb-dash-week-detail')!.textContent).toBe('');
  });

  test('onSelectedChange 在选中与收起时上报', () => {
    const onSelectedChange = jest.fn();
    const el = renderWeekView(makeWeek(), handlers, { onSelectedChange });
    const cell = el.querySelectorAll('.tb-dash-week-cell')[1] as HTMLElement;
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelectedChange).toHaveBeenCalledWith('2026-09-08');
    cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onSelectedChange).toHaveBeenLastCalledWith(null);
  });

  test('跨年周标题两端带年份', () => {
    const week = makeWeek({
      0: { dateKey: '2026-12-28', day: 28 },
      6: { dateKey: '2027-01-03', day: 3 }
    });
    const el = renderWeekView(week, handlers);
    expect(el.querySelector('.tb-dash-week-title')!.textContent).toContain('2026/12/28 - 2027/1/3');
  });

  test('同年周标题保持 M/D 格式', () => {
    const el = renderWeekView(makeWeek(), handlers);
    expect(el.querySelector('.tb-dash-week-title')!.textContent).toContain('9/7 - 9/13');
  });
});
```

- [ ] **Step 2: 在 `doneToday.test.ts` 末尾追加**

```ts
describe('renderDoneToday — 状态恢复', () => {
  test('initialOpen: true → 初始展开、箭头 ▼', () => {
    const el = renderDoneToday(makeStats([makeTask()]), handlers, { initialOpen: true });
    const list = el.querySelector('.tb-dash-done-list') as HTMLElement;
    expect(list.style.display).toBe('block');
    expect(el.querySelector('.tb-dash-done-arrow')!.textContent).toBe('▼');
  });

  test('onOpenChange 在切换时上报新状态', () => {
    const onOpenChange = jest.fn();
    const el = renderDoneToday(makeStats([makeTask()]), handlers, { onOpenChange });
    const header = el.querySelector('.tb-dash-done-header') as HTMLElement;
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpenChange).toHaveBeenCalledWith(true);
    header.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onOpenChange).toHaveBeenLastCalledWith(false);
  });
});
```

- [ ] **Step 3: 跑两个测试文件确认新用例失败**

Run: `npx jest src/views/components/dashboard/weekView.test.ts src/views/components/dashboard/doneToday.test.ts`
Expected: 新增 7 用例 FAIL（weekView 第三参被忽略 → 选中态/回调/跨年全不成立；doneToday initialOpen 不生效），既有用例 PASS

- [ ] **Step 4: 修改 `weekView.ts`**

4a. `shortDate` 与导出签名部分改为：

```ts
export interface WeekViewOptions {
  initialSelectedKey?: string | null;
  onSelectedChange?: (key: string | null) => void;
}

function shortDate(dateKey: string, withYear = false): string {
  const [y, m, d] = dateKey.split('-');
  return withYear ? `${y}/${Number(m)}/${Number(d)}` : `${Number(m)}/${Number(d)}`;
}
```

4b. `renderWeekView` 签名改为（函数体内部改动按 4c-4e）：

```ts
export function renderWeekView(
  weekDays: WeekDayStat[],
  handlers: DueGroupHandlers,
  opts: WeekViewOptions = {}
): HTMLElement {
```

4c. 卡片头 range 改为跨年感知：

```ts
  const y1 = weekDays[0].dateKey.slice(0, 4);
  const y2 = weekDays[6].dateKey.slice(0, 4);
  const crossYear = y1 !== y2;
  const range = crossYear
    ? `${shortDate(weekDays[0].dateKey, true)} - ${shortDate(weekDays[6].dateKey, true)}`
    : `${shortDate(weekDays[0].dateKey)} - ${shortDate(weekDays[6].dateKey)}`;
```

（`h('span', { cls: 'tb-dash-week-title' }, '🗓 本周手账 ', h('span', { cls: 'tb-dash-week-range', text: range }))` 行不变。）

4d. 选中状态初始化改为：

```ts
  let selectedKey: string | null =
    opts.initialSelectedKey != null && weekDays.some(d => d.dateKey === opts.initialSelectedKey)
      ? opts.initialSelectedKey
      : null;
  let selectedCell: HTMLElement | null = null;
```

4e. `onCellClick` 两处状态变更后上报（toggle 收起分支的 `selectedKey = null; selectedCell = null;` 之后、选中分支的 `detailHolder.replaceChildren(...)` 之后）各加一行：

```ts
    opts.onSelectedChange?.(selectedKey);
```

4f. 格子渲染循环内，`const cellRef = cell;` 之前（`cell.appendChild(bar);` 之后）追加：

```ts
    if (day.dateKey === selectedKey) {
      cell.classList.add('selected');
      selectedCell = cell;
    }
```

4g. 循环结束后（`grid.appendChild` 之前或之后均可，放在 `card.appendChild(grid);` 之前）追加初始展开：

```ts
  if (selectedKey) {
    const day = weekDays.find(d => d.dateKey === selectedKey)!;
    detailHolder.replaceChildren(renderDetail(day, handlers));
  }
```

- [ ] **Step 5: 修改 `doneToday.ts`**

在 import 之后追加接口，签名与实现改为（箭头改为持有引用，行为与原 querySelector 版等价）：

```ts
export interface DoneTodayOptions {
  initialOpen?: boolean;
  onOpenChange?: (open: boolean) => void;
}

export function renderDoneToday(
  stats: DashboardStats,
  handlers: DueGroupHandlers,
  opts: DoneTodayOptions = {}
): HTMLElement {
  const card = h('div', { cls: 'tb-dash-card tb-dash-done-today' });

  const header = h('div', { cls: 'tb-dash-done-header' });
  const arrow = h('span', {
    cls: 'tb-dash-done-arrow',
    text: opts.initialOpen ? '▼' : '▶'
  });
  header.appendChild(arrow);
  header.appendChild(h('span', {
    cls: 'tb-dash-done-title',
    text: `✅ 今日已完成 · ${stats.doneTodayTasks.length} 件`
  }));
  card.appendChild(header);

  const list = h('div', { cls: 'tb-dash-done-list' });
  list.style.display = opts.initialOpen ? 'block' : 'none';
  header.onclick = () => {
    const isOpen = list.style.display !== 'none';
    list.style.display = isOpen ? 'none' : 'block';
    arrow.textContent = isOpen ? '▶' : '▼';
    opts.onOpenChange?.(!isOpen);
  };
  for (const t of stats.doneTodayTasks) {
    list.appendChild(renderTaskRow(t, false, handlers.onTaskToggle, handlers.onTaskClick));
  }
  if (stats.doneTodayTasks.length === 0) {
    list.appendChild(h('div', { cls: 'tb-dash-due-empty', text: '还没有完成的任务' }));
  }
  card.appendChild(list);

  return card;
}
```

- [ ] **Step 6: 跑两个测试文件确认全部通过**

Run: `npx jest src/views/components/dashboard/weekView.test.ts src/views/components/dashboard/doneToday.test.ts`
Expected: PASS（weekView 15 用例、doneToday 5 用例，含既有用例不回归）

- [ ] **Step 7: Commit**

```bash
git add src/views/components/dashboard/weekView.ts src/views/components/dashboard/weekView.test.ts src/views/components/dashboard/doneToday.ts src/views/components/dashboard/doneToday.test.ts
git commit -m "feat(dashboard): preserve week selection and done-today expand state across refresh"
```

---

### Task 2: boardView 接线 + MANUAL_QA

**Files:**
- Modify: `src/views/boardView.ts`
- Modify: `docs/MANUAL_QA.md`

**Interfaces:**
- Consumes: Task 1 的 `WeekViewOptions`/`DoneTodayOptions`
- Produces: 无新导出

**说明：** boardView 无单测（惯例），以三连验证。

- [ ] **Step 1: 修改 `boardView.ts`**

1a. 类字段区（`private mode: ViewMode = 'overview';` 之后）追加：

```ts
  private weekSelectedKey: string | null = null;
  private doneTodayOpen = false;
```

1b. `renderOverview()` 中把

```ts
    wrap.appendChild(renderWeekView(weekDays, handlers));
```

改为：

```ts
    wrap.appendChild(renderWeekView(weekDays, handlers, {
      initialSelectedKey: this.weekSelectedKey,
      onSelectedChange: key => { this.weekSelectedKey = key; }
    }));
```

并把

```ts
    wrap.appendChild(renderDoneToday(stats, handlers));
```

改为：

```ts
    wrap.appendChild(renderDoneToday(stats, handlers, {
      initialOpen: this.doneTodayOpen,
      onOpenChange: open => { this.doneTodayOpen = open; }
    }));
```

- [ ] **Step 2: `docs/MANUAL_QA.md` 周历区块清单末尾追加 3 行**

```markdown
- [ ] 勾选周历展开面板中的任务 → 重绘后面板保持展开、该日数字与勾选状态更新
- [ ] 展开「今日已完成」后勾选任意任务 → 折叠保持展开态
- [ ] 跨年周（12 月末—1 月初）标题两端显示年份（如 `2026/12/28 - 2027/1/3`）
```

- [ ] **Step 3: 三连验证**

Run: `npm run lint && npm test && npm run build`
Expected: 全部通过

- [ ] **Step 4: Commit**

```bash
git add src/views/boardView.ts docs/MANUAL_QA.md
git commit -m "feat(dashboard): hoist week/done-today UI state to board view; sync QA checklist"
```
