// src/main.ts
import { Plugin, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS } from './config/defaultSettings';
import { TaskBoardSettingTab } from './config/settingsTab';
import type { TaskBoardSettings } from './types';
import { SidebarCompactView, SIDEBAR_VIEW_TYPE } from './views/sidebarView';
import { BoardTabView, BOARD_VIEW_TYPE } from './views/boardView';

export default class TaskBoardPlugin extends Plugin {
  settings!: TaskBoardSettings;

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(SIDEBAR_VIEW_TYPE, leaf => new SidebarCompactView(leaf, this));
    this.registerView(BOARD_VIEW_TYPE, leaf => new BoardTabView(leaf, this));

    this.addRibbonIcon('list-checks', 'Task Board (Sidebar)', () => {
      this.activateSidebar();
    });

    this.addRibbonIcon('layout-dashboard', 'Task Board (Full)', () => {
      this.activateBoard();
    });

    this.addCommand({
      id: 'open-task-board-sidebar',
      name: 'Open compact panel in sidebar',
      callback: () => this.activateSidebar()
    });

    this.addCommand({
      id: 'open-task-board-tab',
      name: 'Open full board in tab',
      callback: () => this.activateBoard()
    });

    this.addCommand({
      id: 'refresh-task-board',
      name: 'Refresh task board',
      callback: () => this.refreshAllViews()
    });

    this.addSettingTab(new TaskBoardSettingTab(this.app, this));
  }

  async loadSettings(): Promise<void> {
    this.settings = Object.assign({}, DEFAULT_SETTINGS, await this.loadData());
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }

  async activateSidebar(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.revealLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getRightLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: SIDEBAR_VIEW_TYPE, active: true });
      this.app.workspace.revealLeaf(leaf);
    }
  }

  async activateBoard(): Promise<void> {
    const existing = this.app.workspace.getLeavesOfType(BOARD_VIEW_TYPE);
    if (existing.length > 0) {
      this.app.workspace.setActiveLeaf(existing[0]);
      return;
    }
    const leaf = this.app.workspace.getLeaf(false);
    if (leaf) {
      await leaf.setViewState({ type: BOARD_VIEW_TYPE, active: true });
    }
  }

  refreshAllViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(SIDEBAR_VIEW_TYPE)) {
      (leaf.view as SidebarCompactView).refresh();
    }
    for (const leaf of this.app.workspace.getLeavesOfType(BOARD_VIEW_TYPE)) {
      (leaf.view as BoardTabView).refresh();
    }
  }
}
