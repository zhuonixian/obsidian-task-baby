// src/views/components/dashboard/weekView.ts
import { h } from '../../../utils/domHelpers';
import type { WeekDayStat } from '../../../types';
import { renderTaskRow } from '../groupSection';
import type { DueGroupHandlers } from './dueGroups';

export interface WeekViewOptions {
  initialSelectedKey?: string | null;
  onSelectedChange?: (key: string | null) => void;
}

function shortDate(dateKey: string, withYear = false): string {
  const [y, m, d] = dateKey.split('-');
  return withYear ? `${y}/${Number(m)}/${Number(d)}` : `${Number(m)}/${Number(d)}`;
}

function renderDetail(day: WeekDayStat, handlers: DueGroupHandlers): HTMLElement {
  const box = h('div', { cls: 'tb-dash-week-detail-box' });
  box.appendChild(h('div', {
    cls: 'tb-dash-week-detail-title',
    text: `📅 ${day.dateKey} 周${day.dowLabel} · 当日任务`
  }));
  const tasks = [...day.pending, ...day.done];
  if (tasks.length === 0) {
    box.appendChild(h('div', { cls: 'tb-dash-due-empty', text: '还没有任务' }));
  }
  for (const t of tasks) {
    box.appendChild(renderTaskRow(t, false, handlers.onTaskToggle, handlers.onTaskClick));
  }
  box.appendChild(h('div', {
    cls: 'tb-dash-week-detail-hint',
    text: '可勾选写回源文件 · 点击正文跳转源笔记 · 再点上方格子收起'
  }));
  return box;
}

export function renderWeekView(
  weekDays: WeekDayStat[],
  handlers: DueGroupHandlers,
  opts: WeekViewOptions = {}
): HTMLElement {
  const card = h('div', { cls: 'tb-dash-card tb-dash-week' });

  const totalDone = weekDays.reduce((s, d) => s + d.done.length, 0);
  const y1 = weekDays[0].dateKey.slice(0, 4);
  const y2 = weekDays[6].dateKey.slice(0, 4);
  const crossYear = y1 !== y2;
  const range = crossYear
    ? `${shortDate(weekDays[0].dateKey, true)} - ${shortDate(weekDays[6].dateKey, true)}`
    : `${shortDate(weekDays[0].dateKey)} - ${shortDate(weekDays[6].dateKey)}`;
  const head = h('div', { cls: 'tb-dash-week-head' });
  head.appendChild(h('span', { cls: 'tb-dash-week-title' }, `🗓 本周手账 `,
    h('span', { cls: 'tb-dash-week-range', text: range })));
  head.appendChild(h('span', { cls: 'tb-dash-week-sum', text: `本周已完成 ${totalDone} 件` }));
  card.appendChild(head);

  const grid = h('div', { cls: 'tb-dash-week-grid' });
  const detailHolder = h('div', { cls: 'tb-dash-week-detail' });
  let selectedKey: string | null =
    opts.initialSelectedKey != null && weekDays.some(d => d.dateKey === opts.initialSelectedKey)
      ? opts.initialSelectedKey
      : null;
  let selectedCell: HTMLElement | null = null;

  function onCellClick(cell: HTMLElement, day: WeekDayStat): void {
    if (selectedKey === day.dateKey) {
      cell.classList.remove('selected');
      detailHolder.replaceChildren();
      selectedKey = null;
      selectedCell = null;
      opts.onSelectedChange?.(selectedKey);
      return;
    }
    if (selectedCell) selectedCell.classList.remove('selected');
    cell.classList.add('selected');
    selectedCell = cell;
    selectedKey = day.dateKey;
    detailHolder.replaceChildren(renderDetail(day, handlers));
    opts.onSelectedChange?.(selectedKey);
  }

  for (const day of weekDays) {
    const cls = ['tb-dash-week-cell'];
    if (day.isToday) cls.push('today');
    if (day.isWeekend) cls.push('weekend');
    if (day.isFuture) cls.push('future');
    const cell = h('div', { cls: cls.join(' ') });

    const dowText = day.isToday ? `${day.dowLabel}·今` : day.dowLabel;
    cell.appendChild(h('div', { cls: 'tb-dash-week-dow', text: dowText }));
    cell.appendChild(h('div', { cls: 'tb-dash-week-day', text: String(day.day) }));

    const hasData = day.pending.length + day.done.length > 0;
    cell.appendChild(h('div', {
      cls: 'tb-dash-week-counts',
      text: hasData ? `☑${day.done.length} ▢${day.pending.length}` : '—'
    }));

    const bar = h('div', { cls: 'tb-dash-week-bar' });
    const fill = h('div', { cls: 'tb-dash-week-bar-fill' });
    const total = day.done.length + day.pending.length;
    if (total > 0) {
      fill.style.width = `${Math.round((day.done.length / total) * 100)}%`;
    }
    bar.appendChild(fill);
    cell.appendChild(bar);

    if (day.dateKey === selectedKey) {
      cell.classList.add('selected');
      selectedCell = cell;
    }

    const cellRef = cell;
    cell.onclick = () => onCellClick(cellRef, day);
    grid.appendChild(cell);
  }
  if (selectedKey) {
    const day = weekDays.find(d => d.dateKey === selectedKey)!;
    detailHolder.replaceChildren(renderDetail(day, handlers));
  }
  card.appendChild(grid);
  card.appendChild(detailHolder);
  return card;
}
