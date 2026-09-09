// src/views/boardView.ts
import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type TaskBoardPlugin from '../main';
import type { IndexSnapshot, Task } from '../types';
import { getSnapshot } from '../data/snapshotService';
import { toggleTask } from '../data/taskWriter';
import { h } from '../utils/domHelpers';
import { renderGroupSection } from './components/groupSection';
import { renderCalendarGrid } from './components/calendarGrid';
import { computeDashboardStats, computeWeekDays } from '../data/dashboardStats';
import { renderSummaryCard } from './components/dashboard/summaryCard';
import { renderHeatmap } from './components/dashboard/heatmap';
import { renderDueGroups } from './components/dashboard/dueGroups';
import { renderDoneToday } from './components/dashboard/doneToday';
import { renderWeekView } from './components/dashboard/weekView';
import type { DueGroupHandlers } from './components/dashboard/dueGroups';

export const BOARD_VIEW_TYPE = 'taskbaby-board';

type ViewMode = 'overview' | 'today' | 'calendar' | 'global';

export class BoardTabView extends ItemView {
  plugin: TaskBoardPlugin;
  private snapshot: IndexSnapshot | null = null;
  private mode: ViewMode = 'overview';
  private weekSelectedKey: string | null = null;
  private doneTodayOpen = false;

  constructor(leaf: WorkspaceLeaf, plugin: TaskBoardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return BOARD_VIEW_TYPE; }
  getDisplayText() { return 'TaskBaby'; }
  getIcon() { return 'layout-dashboard'; }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async onClose(): Promise<void> {}

  async refresh(): Promise<void> {
    this.snapshot = await getSnapshot(this.app.vault, this.plugin.settings, new Date());
    this.render();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass('tb-board-root');
    (root.style as any).fontSize = `${this.plugin.settings.fontSize}px`;

    // —— header ——
    const header = h('div', { cls: 'tb-board-header' });
    const titleText = this.mode === 'overview'
      ? `📊 任务看板 — 总览`
      : this.mode === 'today'
        ? `📊 任务看板 — 今日`
        : this.mode === 'calendar'
          ? `📊 任务看板 — 日历`
          : `📊 任务看板 — 全局`;
    header.appendChild(h('span', { cls: 'tb-board-title', text: titleText }));
    header.appendChild(h('button', {
      cls: 'tb-board-refresh',
      text: '⟳ 刷新',
      onclick: () => this.refresh()
    }));
    root.appendChild(header);

    // —— tab bar ——
    const tabs = h('div', { cls: 'tb-board-tabs' });
    const tabOverview = h('button', {
      cls: 'tb-tab' + (this.mode === 'overview' ? ' active' : ''),
      text: '🏠 总览',
      onclick: () => this.switchMode('overview')
    });
    tabs.appendChild(tabOverview);
    const tabToday = h('button', {
      cls: 'tb-tab' + (this.mode === 'today' ? ' active' : ''),
      text: '📅 今日',
      onclick: () => this.switchMode('today')
    });
    const tabCal = h('button', {
      cls: 'tb-tab' + (this.mode === 'calendar' ? ' active' : ''),
      text: '🗓 日历',
      onclick: () => this.switchMode('calendar')
    });
    const tabGlobal = h('button', {
      cls: 'tb-tab' + (this.mode === 'global' ? ' active' : ''),
      text: '🌐 全局',
      onclick: () => this.switchMode('global')
    });
    tabs.appendChild(tabToday);
    tabs.appendChild(tabCal);
    tabs.appendChild(tabGlobal);
    root.appendChild(tabs);

    if (!this.snapshot) return;

    // —— body ——
    const body = h('div', { cls: 'tb-board-body' });
    if (this.mode === 'overview') {
      body.appendChild(this.renderOverview());
    } else if (this.mode === 'today') {
      body.appendChild(this.renderTodayView());
    } else if (this.mode === 'calendar') {
      body.appendChild(renderCalendarGrid(this.snapshot, (key) => this.renderDayDetail(key)));
    } else {
      body.appendChild(this.renderGlobalView());
    }
    root.appendChild(body);

    // —— 错误条 ——
    if (this.snapshot.errors.length > 0) {
      root.appendChild(h('div', {
        cls: 'tb-error-bar',
        text: `⚠ ${this.snapshot.errors.length} 个文件解析失败 · 点击查看`
      }));
    }
  }

  private renderOverview(): HTMLElement {
    const stats = computeDashboardStats(this.snapshot!, new Date());
    const handlers: DueGroupHandlers = {
      onTaskToggle: t => this.handleToggle(t),
      onTaskClick: t => this.handleOpen(t)
    };
    const wrap = h('div', { cls: 'tb-dash-root' });
    wrap.appendChild(renderSummaryCard(stats));
    wrap.appendChild(renderHeatmap(stats));
    const weekDays = computeWeekDays(this.snapshot!, new Date());
    wrap.appendChild(renderWeekView(weekDays, handlers, {
      initialSelectedKey: this.weekSelectedKey,
      onSelectedChange: key => { this.weekSelectedKey = key; }
    }));
    wrap.appendChild(renderDueGroups(stats, handlers));
    wrap.appendChild(renderDoneToday(stats, handlers, {
      initialOpen: this.doneTodayOpen,
      onOpenChange: open => { this.doneTodayOpen = open; }
    }));
    return wrap;
  }

  private renderTodayView(): HTMLElement {
    const grid = h('div', { cls: 'tb-today-grid' });
    grid.appendChild(renderGroupSection({
      title: '▢ 未完成',
      count: this.snapshot!.today.pending.length,
      tasks: this.snapshot!.today.pending,
      onTaskToggle: t => this.handleToggle(t),
      onTaskClick: t => this.handleOpen(t)
    }));
    grid.appendChild(renderGroupSection({
      title: '☑ 已完成',
      count: this.snapshot!.today.done.length,
      tasks: this.snapshot!.today.done,
      onTaskToggle: t => this.handleToggle(t),
      onTaskClick: t => this.handleOpen(t)
    }));
    grid.appendChild(renderGroupSection({
      title: '⏳ 历史积压',
      count: this.snapshot!.today.backlog.length,
      tasks: this.snapshot!.today.backlog,
      showSourceDate: true,
      onTaskToggle: t => this.handleToggle(t),
      onTaskClick: t => this.handleOpen(t)
    }));
    return grid;
  }

  private renderGlobalView(): HTMLElement {
    const grid = h('div', { cls: 'tb-global-grid' });
    grid.appendChild(renderGroupSection({
      title: '▢ 未完成',
      count: this.snapshot!.allPending.length,
      tasks: this.snapshot!.allPending,
      showSourceDate: true,
      onTaskToggle: t => this.handleToggle(t),
      onTaskClick: t => this.handleOpen(t)
    }));
    grid.appendChild(renderGroupSection({
      title: '☑ 已完成',
      count: this.snapshot!.allDone.length,
      tasks: this.snapshot!.allDone,
      showSourceDate: true,
      onTaskToggle: t => this.handleToggle(t),
      onTaskClick: t => this.handleOpen(t)
    }));
    return grid;
  }

  private renderDayDetail(dayKey: string): HTMLElement {
    const bucket = this.snapshot!.byDate.get(dayKey);
    const wrapper = h('div', { cls: 'tb-day-detail' });
    wrapper.appendChild(h('div', { cls: 'tb-day-detail-title', text: dayKey }));
    if (!bucket) {
      wrapper.appendChild(h('p', { text: '无任务记录' }));
      return wrapper;
    }
    wrapper.appendChild(renderGroupSection({
      title: '▢ 未完成',
      count: bucket.pending.length,
      tasks: bucket.pending,
      onTaskToggle: t => this.handleToggle(t),
      onTaskClick: t => this.handleOpen(t)
    }));
    wrapper.appendChild(renderGroupSection({
      title: '☑ 已完成',
      count: bucket.done.length,
      tasks: bucket.done,
      onTaskToggle: t => this.handleToggle(t),
      onTaskClick: t => this.handleOpen(t)
    }));
    return wrapper;
  }

  private switchMode(mode: ViewMode): void {
    this.mode = mode;
    this.render();
  }

  private async handleToggle(task: Task): Promise<void> {
    try {
      await toggleTask(this.app.vault, task, this.plugin.settings, new Date());
      new Notice(task.checked ? '✓ 已取消完成' : '✓ 已完成', 5000);
      await this.refresh();
      this.plugin.refreshAllViews();
    } catch (e) {
      new Notice(`写回失败: ${(e as Error).message}`, 10000);
      await this.refresh();
    }
  }

  private async handleOpen(task: Task): Promise<void> {
    await this.app.workspace.openLinkText(task.sourcePath.replace(/\.md$/, ''), '');
    // 等待 leaf 渲染后滚动到行
    setTimeout(() => {
      const editor = (this.app.workspace as any).activeLeaf?.view?.editor;
      if (editor && typeof editor.setCursor === 'function') {
        editor.setCursor({ line: task.lineStart, ch: 0 });
        editor.scrollIntoView({
          from: { line: task.lineStart, ch: 0 },
          to: { line: task.lineStart, ch: 0 }
        }, true);
      }
    }, 100);
  }
}
