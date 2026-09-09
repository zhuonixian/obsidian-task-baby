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
  if (stats.doneTodayTasks.length === 0) {
    list.appendChild(h('div', { cls: 'tb-dash-due-empty', text: '还没有完成的任务' }));
  }
  card.appendChild(list);

  return card;
}
