// src/views/components/calendarGrid.ts (stub — Task 15 implements)
import type { IndexSnapshot } from '../../types';
import { h } from '../../utils/domHelpers';

export function renderCalendarGrid(
  _snapshot: IndexSnapshot,
  _onSelectDay: (dayKey: string) => HTMLElement
): HTMLElement {
  return h('div', { cls: 'tb-cal-stub', text: 'calendar (Task 15)' });
}
