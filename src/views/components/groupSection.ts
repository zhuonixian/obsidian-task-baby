// src/views/components/groupSection.ts
import { h } from '../../utils/domHelpers';
import type { Task } from '../../types';

export interface GroupSectionOptions {
  title: string;
  count: number;
  tasks: Task[];
  collapsed?: boolean;
  showSourceDate?: boolean;
  limit?: number;
  onTaskToggle: (task: Task) => void;
  onTaskClick: (task: Task) => void;
}

export function renderGroupSection(opts: GroupSectionOptions): HTMLElement {
  const wrapper = h('div', { cls: 'tb-group' });

  const header = h('div', { cls: 'tb-group-header' });
  header.appendChild(h('span', { cls: 'tb-group-title', text: opts.title }));
  header.appendChild(h('span', { cls: 'tb-group-count', text: `(${opts.count})` }));
  if (opts.collapsed) {
    header.appendChild(h('span', { cls: 'tb-group-collapse-hint', text: '▸' }));
  }
  wrapper.appendChild(header);

  if (opts.collapsed) return wrapper;

  const list = h('div', { cls: 'tb-group-list' });
  const visible = opts.limit ? opts.tasks.slice(0, opts.limit) : opts.tasks;
  for (const task of visible) {
    list.appendChild(renderTaskRow(task, opts.showSourceDate, opts.onTaskToggle, opts.onTaskClick));
  }
  if (opts.limit && opts.tasks.length > opts.limit) {
    list.appendChild(h('div', {
      cls: 'tb-group-more',
      text: `+ 还有 ${opts.tasks.length - opts.limit} 条`
    }));
  }
  wrapper.appendChild(list);
  return wrapper;
}

function renderTaskRow(
  task: Task,
  showSourceDate: boolean | undefined,
  onToggle: (t: Task) => void,
  onClick: (t: Task) => void
): HTMLElement {
  const row = h('div', { cls: 'tb-task-row' });

  const checkbox = h('input', { cls: 'tb-task-checkbox', attr: { type: 'checkbox' } }) as HTMLInputElement;
  checkbox.checked = task.checked;
  checkbox.onclick = (ev: MouseEvent) => {
    ev.stopPropagation();
    onToggle(task);
  };
  row.appendChild(checkbox);

  const body = h('span', {
    cls: 'tb-task-body' + (task.checked ? ' tb-done' : ''),
    text: task.body
  });
  body.onclick = () => onClick(task);
  row.appendChild(body);

  if (task.meta?.priority) {
    row.appendChild(h('span', {
      cls: `tb-task-pri tb-pri-${task.meta.priority}`,
      text: priorityLabel(task.meta.priority)
    }));
  }

  if (showSourceDate) {
    const m = String(task.sourceDate.getMonth() + 1).padStart(2, '0');
    const d = String(task.sourceDate.getDate()).padStart(2, '0');
    row.appendChild(h('span', { cls: 'tb-task-src', text: `${m}-${d}` }));
  }

  return row;
}

function priorityLabel(p: string): string {
  return { highest: '⏫', high: '🔼', medium: '', low: '🔽', lowest: '⏬' }[p] ?? '';
}
