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
