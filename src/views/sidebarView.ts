// src/views/sidebarView.ts (stub)
import { ItemView, WorkspaceLeaf } from 'obsidian';
import type TaskBoardPlugin from '../main';

export const SIDEBAR_VIEW_TYPE = 'task-board-sidebar';

export class SidebarCompactView extends ItemView {
  plugin: TaskBoardPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: TaskBoardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() { return SIDEBAR_VIEW_TYPE; }
  getDisplayText() { return 'Task Board'; }
  getIcon() { return 'list-checks'; }
  async onOpen() { this.contentEl.setText('sidebar'); }
  async onClose() {}
  refresh() {}
}
