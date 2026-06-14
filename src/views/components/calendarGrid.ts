// src/views/components/calendarGrid.ts
import type { IndexSnapshot } from '../../types';
import { dateToYmd, isSameDay } from '../../utils/dateUtils';
import { h } from '../../utils/domHelpers';

const DOW_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export function renderCalendarGrid(
  snapshot: IndexSnapshot,
  onSelectDay: (dayKey: string) => HTMLElement,
  initialSelectedKey?: string
): HTMLElement {
  const wrapper = h('div', { cls: 'tb-cal-wrapper' });

  // —— detail 容器（提前声明，cell onclick 闭包需要引用）——
  const detailHolder = h('div', { cls: 'tb-cal-detail-holder' });

  // —— selection 状态 ——
  const todayKey = dateToYmd(snapshot.windowEnd);
  let selectedKey = initialSelectedKey ?? todayKey;
  let selectedCell: HTMLElement | null = null;

  function selectCell(cell: HTMLElement, key: string): void {
    if (selectedCell) selectedCell.classList.remove('selected');
    cell.classList.add('selected');
    selectedCell = cell;
    selectedKey = key;
    detailHolder.replaceChildren(onSelectDay(key));
  }

  // —— 范围标签 ——
  const start = snapshot.windowStart;
  const end = snapshot.windowEnd;
  const rangeLabel = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())} ~ ${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  wrapper.appendChild(h('div', { cls: 'tb-cal-range', text: rangeLabel }));

  // —— 构造 7 列网格（从 windowStart 起始的那周一开头）——
  const grid = h('div', { cls: 'tb-cal-grid' });
  for (const label of DOW_LABELS) {
    grid.appendChild(h('div', { cls: 'tb-cal-dow', text: label }));
  }

  // 找到 windowStart 那一周的周一
  const startDow = (start.getDay() + 6) % 7; // 0=Mon
  const firstDate = new Date(start);
  firstDate.setDate(start.getDate() - startDow);

  // 渲染 6 周 (42 格)
  for (let i = 0; i < 42; i++) {
    const d = new Date(firstDate);
    d.setDate(firstDate.getDate() + i);

    if (d < start || d > end) {
      grid.appendChild(h('div', { cls: 'tb-cal-day empty' }));
      continue;
    }

    const key = dateToYmd(d);
    const bucket = snapshot.byDate.get(key);
    const pendCount = bucket?.pending.length ?? 0;
    const doneCount = bucket?.done.length ?? 0;

    const classes = ['tb-cal-day'];
    if (isSameDay(d, end)) classes.push('today');
    if (key === selectedKey) classes.push('selected');
    if (pendCount > 0 || doneCount > 0) classes.push('has-tasks');

    const cell = h('div', { cls: classes.join(' ') });
    cell.appendChild(h('span', { cls: 'tb-cal-n', text: String(d.getDate()) }));
    const badge = h('div', { cls: 'tb-cal-badge' });
    if (pendCount > 0) {
      // 今日显示积压数量
      const isToday = isSameDay(d, end);
      const total = isToday ? pendCount + snapshot.today.backlog.length : pendCount;
      badge.appendChild(h('span', { cls: 'tb-cal-pend', text: `▢${total}` }));
    }
    if (doneCount > 0) {
      badge.appendChild(h('span', { cls: 'tb-cal-done', text: `☑${doneCount}` }));
    }
    cell.appendChild(badge);

    const cellRef = cell;
    cell.onclick = () => selectCell(cellRef, key);

    if (key === selectedKey) selectedCell = cell;
    grid.appendChild(cell);
  }
  wrapper.appendChild(grid);
  wrapper.appendChild(detailHolder);

  // —— 初始 detail：渲染选中日的详情 ——
  detailHolder.replaceChildren(onSelectDay(selectedKey));

  return wrapper;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
