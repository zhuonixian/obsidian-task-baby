// src/views/components/dashboard/summaryCard.ts
import { h } from '../../../utils/domHelpers';
import type { DashboardStats } from '../../../types';

const SVG_NS = 'http://www.w3.org/2000/svg';
const R = 45;
const C = 2 * Math.PI * R; // ≈ 282.7

// h() 只覆盖 HTMLElement；SVG 元素必须 createElementNS
function sv<K extends keyof SVGElementTagNameMap>(
  tag: K,
  attrs: Record<string, string | number>
): SVGElementTagNameMap[K] {
  const el = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, String(v));
  return el;
}

export function renderSummaryCard(stats: DashboardStats): HTMLElement {
  const card = h('div', { cls: 'tb-dash-card tb-dash-summary' });
  const main = h('div', { cls: 'tb-dash-summary-main' });

  const ring = sv('svg', { viewBox: '0 0 112 112', class: 'tb-dash-ring' });
  ring.appendChild(sv('circle', {
    cx: 56, cy: 56, r: R, fill: 'none',
    stroke: 'currentColor', 'stroke-width': 12, class: 'tb-dash-ring-bg'
  }));
  ring.appendChild(sv('circle', {
    cx: 56, cy: 56, r: R, fill: 'none',
    stroke: 'currentColor', 'stroke-width': 12,
    'stroke-linecap': 'round',
    'stroke-dasharray': `${(stats.completionRate * C).toFixed(1)} ${C.toFixed(1)}`,
    transform: 'rotate(-90 56 56)',
    class: 'tb-dash-ring-arc'
  }));
  const pct = sv('text', { x: 56, y: 54, 'text-anchor': 'middle', class: 'tb-dash-ring-pct' });
  pct.textContent = stats.todayTotal === 0 ? '—' : `${Math.round(stats.completionRate * 100)}%`;
  ring.appendChild(pct);
  const sub = sv('text', { x: 56, y: 70, 'text-anchor': 'middle', class: 'tb-dash-ring-sub' });
  sub.textContent = stats.todayTotal === 0 ? '还没有任务' : `${stats.todayDone}/${stats.todayTotal} 完成`;
  ring.appendChild(sub);
  main.appendChild(ring as unknown as Node);

  const tiles = h('div', { cls: 'tb-dash-tiles' });
  tiles.appendChild(renderTile('▢ 今日待办', stats.todayPending, 'tb-dash-tile-pend'));
  tiles.appendChild(renderTile('☑ 已完成', stats.todayDone, 'tb-dash-tile-done'));
  tiles.appendChild(renderTile('⚠ 逾期', stats.overdueCount, 'tb-dash-tile-overdue'));
  main.appendChild(tiles);

  card.appendChild(main);
  return card;
}

function renderTile(label: string, n: number, cls: string): HTMLElement {
  const tile = h('div', { cls: `tb-dash-tile ${cls}` });
  tile.appendChild(h('div', { cls: 'tb-dash-tile-n', text: String(n) }));
  tile.appendChild(h('div', { cls: 'tb-dash-tile-label', text: label }));
  return tile;
}
