// src/views/sidebarView.ts
import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type TaskBoardPlugin from '../main';
import type { IndexSnapshot, Task } from '../types';
import { getSnapshot } from '../data/snapshotService';
import { toggleTask } from '../data/taskWriter';
import { h } from '../utils/domHelpers';
import { renderGroupSection } from './components/groupSection';

export const SIDEBAR_VIEW_TYPE = 'task-board-sidebar';

export class SidebarCompactView extends ItemView {
  plugin: TaskBoardPlugin;
  private snapshot: IndexSnapshot | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: TaskBoardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return SIDEBAR_VIEW_TYPE; }
  getDisplayText() { return 'Task Board'; }
  getIcon() { return 'list-checks'; }

  async onOpen(): Promise<void> {
    await this.refresh();
  }

  async onClose(): Promise<void> {}

  async refresh(): Promise<void> {
    const today = new Date();
    this.snapshot = await getSnapshot(this.app.vault, this.plugin.settings, today);
    this.render();
  }

  private render(): void {
    const root = this.contentEl;
    root.empty();
    root.addClass('tb-sidebar-root');

    // —— header ——
    const header = h('div', { cls: 'tb-sidebar-header' });
    header.appendChild(h('span', { cls: 'tb-sidebar-title', text: '📋 任务简版' }));
    const refreshBtn = h('button', {
      cls: 'tb-sidebar-refresh',
      text: '⟳',
      title: '刷新',
      onclick: () => this.refresh()
    });
    header.appendChild(refreshBtn);
    root.appendChild(header);

    if (!this.snapshot) return;

    // —— 今日未完成 ——
    root.appendChild(renderGroupSection({
      title: '今日未完',
      count: this.snapshot.today.pending.length,
      tasks: this.snapshot.today.pending,
      onTaskToggle: t => this.handleToggle(t),
      onTaskClick: t => this.handleOpen(t)
    }));

    // —— 历史积压 ——
    root.appendChild(renderGroupSection({
      title: '历史积压',
      count: this.snapshot.today.backlog.length,
      tasks: this.snapshot.today.backlog,
      showSourceDate: true,
      limit: this.plugin.settings.sidebarCompactLimit,
      onTaskToggle: t => this.handleToggle(t),
      onTaskClick: t => this.handleOpen(t)
    }));

    // —— 今日已完成（折叠）——
    root.appendChild(renderGroupSection({
      title: '今日已完成',
      count: this.snapshot.today.done.length,
      tasks: this.snapshot.today.done,
      collapsed: true,
      onTaskToggle: t => this.handleToggle(t),
      onTaskClick: t => this.handleOpen(t)
    }));

    // —— 打开完整看板按钮 ——
    const openBtn = h('button', {
      cls: 'tb-sidebar-open-board',
      text: '📊 打开完整看板',
      onclick: () => this.plugin.activateBoard()
    });
    root.appendChild(openBtn);

    // —— 错误条 ——
    if (this.snapshot.errors.length > 0) {
      root.appendChild(h('div', {
        cls: 'tb-error-bar',
        text: `⚠ ${this.snapshot.errors.length} 个文件解析失败`
      }));
    }
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
    // 滚动到行：留给后续 view event 处理，v1 简单打开文件即可
  }
}
