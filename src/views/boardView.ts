// src/views/boardView.ts (stub)
import { ItemView, WorkspaceLeaf } from 'obsidian';
import type TaskBoardPlugin from '../main';

export const BOARD_VIEW_TYPE = 'task-board-board';

export class BoardTabView extends ItemView {
  plugin: TaskBoardPlugin;
  constructor(leaf: WorkspaceLeaf, plugin: TaskBoardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  getViewType() { return BOARD_VIEW_TYPE; }
  getDisplayText() { return 'Task Board'; }
  getIcon() { return 'layout-dashboard'; }
  async onOpen() { this.contentEl.setText('board'); }
  async onClose() {}
  refresh() {}
}
