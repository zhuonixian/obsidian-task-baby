// src/main.ts
import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS } from './config/defaultSettings';
import { TaskBoardSettingTab } from './config/settingsTab';
import type { TaskBoardSettings } from './types';
import { SidebarCompactView, SIDEBAR_VIEW_TYPE } from './views/sidebarView';
import { BoardTabView, BOARD_VIEW_TYPE } from './views/boardView';
import { runReminderCheck } from './reminder/reminderService';
import type { ReminderState } from './reminder/reminderService';
import { getSnapshot } from './data/snapshotService';

export default class TaskBoardPlugin extends Plugin {
  settings!: TaskBoardSettings;
  private reminderState: ReminderState = { lastReminderDate: null };

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

    const reminderDeps = {
      now: () => new Date(),
      notify: (msg: string) => new Notice(msg, 10_000),
      getSnapshot
    };
    const reminderTimerId = window.setInterval(() => {
      runReminderCheck(this, reminderDeps).catch(console.error);
    }, 60_000);
    this.registerInterval(reminderTimerId);
    this.app.workspace.onLayoutReady(() => {
      setTimeout(() => {
        runReminderCheck(this, reminderDeps).catch(console.error);
      }, 10_000);
    });
  }

  async loadSettings(): Promise<void> {
    const data = (await this.loadData()) as Record<string, unknown> | null;
    const { reminderState, ...settingsData } = data ?? {};
    this.settings = Object.assign({}, DEFAULT_SETTINGS, settingsData);
    this.reminderState = reminderState as ReminderState || { lastReminderDate: null };
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ ...this.settings, reminderState: this.reminderState });
  }

  getReminderState(): ReminderState {
    return this.reminderState;
  }

  async saveReminderDate(ymd: string): Promise<void> {
    this.reminderState.lastReminderDate = ymd;
    await this.saveData({ ...this.settings, reminderState: this.reminderState });
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
