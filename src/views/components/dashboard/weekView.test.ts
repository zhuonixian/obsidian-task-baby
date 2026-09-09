import { renderWeekView } from './weekView';
import type { DueGroupHandlers } from './dueGroups';
import type { WeekDayStat, Task } from '../../../types';

function makeTask(over: Partial<Task> = {}): Task {
  return {
    sourcePath: 'DailyLife/2026/09/2026-09-09.md',
    sourceDate: new Date(2026, 8, 9),
    lineStart: 0, lineEnd: 0,
    rawText: '- [ ] x', body: 'x', bodyHash: 'h',
    checked: false, indent: 0,
    ...over
  };
}

// 2026-09-10 周四所在的周：9-07(一) … 9-13(日)
function makeWeek(overrides: Record<number, Partial<WeekDayStat>> = {}): WeekDayStat[] {
  const base = [
    { day: 7, dowLabel: '一' }, { day: 8, dowLabel: '二' }, { day: 9, dowLabel: '三' },
    { day: 10, dowLabel: '四' }, { day: 11, dowLabel: '五' }, { day: 12, dowLabel: '六' },
    { day: 13, dowLabel: '日' }
  ];
  return base.map((b, i) => ({
    dateKey: `2026-09-${String(b.day).padStart(2, '0')}`,
    day: b.day,
    dowLabel: b.dowLabel,
    isToday: b.day === 10,
    isWeekend: i >= 5,
    isFuture: b.day > 10,
    pending: [],
    done: [],
    ...(overrides[i] ?? {})
  }));
}

const handlers: DueGroupHandlers & { onTaskToggle: jest.Mock; onTaskClick: jest.Mock } = {
  onTaskToggle: jest.fn(), onTaskClick: jest.fn()
};

describe('renderWeekView — 网格', () => {
  test('渲染 7 格，dowLabel 顺序正确', () => {
    const el = renderWeekView(makeWeek(), handlers);
    const cells = el.querySelectorAll('.tb-dash-week-cell');
    expect(cells.length).toBe(7);
    const dows = Array.from(el.querySelectorAll('.tb-dash-week-dow')).map(d => d.textContent);
    expect(dows).toEqual(['一', '二', '三', '四·今', '五', '六', '日']);
  });

  test('有数据格显示 ☑N ▢M；无数据未来格显示 —；预写未来格照常计数', () => {
    const week = makeWeek({
      1: { done: [makeTask({ checked: true })], pending: [makeTask(), makeTask()] },
      4: { done: [makeTask({ checked: true })], pending: [] }, // 周五未来但有数据
      5: {}  // 周六未来无数据
    });
    const el = renderWeekView(week, handlers);
    const counts = Array.from(el.querySelectorAll('.tb-dash-week-counts')).map(c => c.textContent);
    expect(counts[1]).toBe('☑1 ▢2');
    expect(counts[4]).toBe('☑1 ▢0');
    expect(counts[5]).toBe('—');
  });

  test('状态类叠加：今日格 today、六日 weekend、未来格 future（未来+周末可叠加）', () => {
    const el = renderWeekView(makeWeek(), handlers);
    const cells = Array.from(el.querySelectorAll('.tb-dash-week-cell'));
    expect(cells[3].className).toContain('today');
    expect(cells[5].className).toContain('weekend');
    expect(cells[6].className).toContain('future');
    expect(cells[6].className).toContain('weekend');
    expect(cells[0].className).not.toContain('weekend');
  });

  test('今日格 dowLabel 带 ·今 标记', () => {
    const el = renderWeekView(makeWeek(), handlers);
    const dows = Array.from(el.querySelectorAll('.tb-dash-week-dow'));
    expect(dows[3].textContent).toBe('四·今');
  });

  test('卡片头：日期范围与本周已完成汇总', () => {
    const week = makeWeek({
      0: { done: [makeTask({ checked: true })] },
      1: { done: [makeTask({ checked: true }), makeTask({ checked: true })] }
    });
    const el = renderWeekView(week, handlers);
    expect(el.querySelector('.tb-dash-week-title')!.textContent).toContain('9/7 - 9/13');
    expect(el.querySelector('.tb-dash-week-sum')!.textContent).toBe('本周已完成 3 件');
  });
});

describe('renderWeekView — 展开交互', () => {
  test('点击格子展开当日清单（pending 前 done 后），再点同格收起', () => {
    const week = makeWeek({
      2: {
        pending: [makeTask({ body: 'p1' }), makeTask({ body: 'p2' })],
        done: [makeTask({ body: 'd1', checked: true })]
      }
    });
    const el = renderWeekView(week, handlers);
    const detail = el.querySelector('.tb-dash-week-detail') as HTMLElement;
    expect(detail.textContent).toBe('');

    const cellWed = el.querySelectorAll('.tb-dash-week-cell')[2] as HTMLElement;
    cellWed.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const title = detail.querySelector('.tb-dash-week-detail-title')!;
    expect(title.textContent).toContain('2026-09-09');
    expect(title.textContent).toContain('周三');
    const bodies = Array.from(detail.querySelectorAll('.tb-task-body')).map(b => b.textContent);
    expect(bodies).toEqual(['p1', 'p2', 'd1']);

    cellWed.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(detail.textContent).toBe('');
  });

  test('点另一格切换内容，原格子取消选中类', () => {
    const week = makeWeek({
      0: { pending: [makeTask({ body: 'mon' })] },
      1: { pending: [makeTask({ body: 'tue' })] }
    });
    const el = renderWeekView(week, handlers);
    const cells = el.querySelectorAll('.tb-dash-week-cell');
    const detail = el.querySelector('.tb-dash-week-detail') as HTMLElement;
    (cells[0] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    (cells[1] as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(detail.querySelector('.tb-task-body')!.textContent).toBe('tue');
    expect(cells[0].className).not.toContain('selected');
    expect(cells[1].className).toContain('selected');
  });

  test('空日展开显示「还没有任务」', () => {
    const el = renderWeekView(makeWeek(), handlers);
    (el.querySelectorAll('.tb-dash-week-cell')[5] as HTMLElement)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const detail = el.querySelector('.tb-dash-week-detail') as HTMLElement;
    expect(detail.querySelector('.tb-dash-due-empty')!.textContent).toBe('还没有任务');
  });

  test('勾选 checkbox 触发 onTaskToggle', () => {
    const t = makeTask({ body: 'x' });
    const week = makeWeek({ 0: { pending: [t] } });
    const el = renderWeekView(week, handlers);
    (el.querySelectorAll('.tb-dash-week-cell')[0] as HTMLElement)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const box = el.querySelector('.tb-dash-week-detail .tb-task-checkbox') as HTMLInputElement;
    box.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handlers.onTaskToggle).toHaveBeenCalledWith(t);
  });

  test('点正文触发 onTaskClick', () => {
    const t = makeTask({ body: 'jump' });
    const week = makeWeek({ 0: { pending: [t] } });
    const el = renderWeekView(week, handlers);
    (el.querySelectorAll('.tb-dash-week-cell')[0] as HTMLElement)
      .dispatchEvent(new MouseEvent('click', { bubbles: true }));
    const body = el.querySelector('.tb-dash-week-detail .tb-task-body') as HTMLElement;
    body.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(handlers.onTaskClick).toHaveBeenCalledWith(t);
  });
});

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
