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
