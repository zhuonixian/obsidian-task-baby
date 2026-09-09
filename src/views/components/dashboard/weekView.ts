// src/views/components/dashboard/weekView.ts
import { h } from '../../../utils/domHelpers';
import type { WeekDayStat } from '../../../types';
import { renderTaskRow } from '../groupSection';
import type { DueGroupHandlers } from './dueGroups';

function shortDate(dateKey: string): string {
  const [, m, d] = dateKey.split('-');
  return `${Number(m)}/${Number(d)}`;
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

export function renderWeekView(weekDays: WeekDayStat[], handlers: DueGroupHandlers): HTMLElement {
  const card = h('div', { cls: 'tb-dash-card tb-dash-week' });

  const totalDone = weekDays.reduce((s, d) => s + d.done.length, 0);
  const range = `${shortDate(weekDays[0].dateKey)} - ${shortDate(weekDays[6].dateKey)}`;
  const head = h('div', { cls: 'tb-dash-week-head' });
  head.appendChild(h('span', { cls: 'tb-dash-week-title' }, `🗓 本周手账 `,
    h('span', { cls: 'tb-dash-week-range', text: range })));
  head.appendChild(h('span', { cls: 'tb-dash-week-sum', text: `本周已完成 ${totalDone} 件` }));
  card.appendChild(head);

  const grid = h('div', { cls: 'tb-dash-week-grid' });
  const detailHolder = h('div', { cls: 'tb-dash-week-detail' });
  let selectedKey: string | null = null;
  let selectedCell: HTMLElement | null = null;

  function onCellClick(cell: HTMLElement, day: WeekDayStat): void {
    if (selectedKey === day.dateKey) {
      cell.classList.remove('selected');
      detailHolder.replaceChildren();
      selectedKey = null;
      selectedCell = null;
      return;
    }
    if (selectedCell) selectedCell.classList.remove('selected');
    cell.classList.add('selected');
    selectedCell = cell;
    selectedKey = day.dateKey;
    detailHolder.replaceChildren(renderDetail(day, handlers));
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
      (fill.style as any).width = `${Math.round((day.done.length / total) * 100)}%`;
    }
    bar.appendChild(fill);
    cell.appendChild(bar);

    const cellRef = cell;
    cell.onclick = () => onCellClick(cellRef, day);
    grid.appendChild(cell);
  }
  card.appendChild(grid);
  card.appendChild(detailHolder);
  return card;
}
