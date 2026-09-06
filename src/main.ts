// src/main.ts
import { Notice, Plugin, WorkspaceLeaf } from 'obsidian';
import { DEFAULT_SETTINGS } from './config/defaultSettings';
import { TaskBoardSettingTab } from './config/settingsTab';
import type { TaskBoardSettings } from './types';
import { SidebarCompactView, SIDEBAR_VIEW_TYPE } from './views/sidebarView';
import { BoardTabView, BOARD_VIEW_TYPE } from './views/boardView';
import { runReminderCheck } from './reminder/reminderService';
import type { ReminderState } from './reminder/reminderService';
import { ReminderModal } from './reminder/reminderModal';
import type { PresentModalOptions } from './reminder/reminderModal';
import { getSnapshot } from './data/snapshotService';

export default class TaskBoardPlugin extends Plugin {
  settings!: TaskBoardSettings;
  private reminderState: ReminderState = {
    dayKey: null,
    finalized: false,
    snoozeCount: 0,
    snoozedUntil: null,
    lastPopupAt: null
  };

  async onload(): Promise<void> {
    await this.loadSettings();

    this.registerView(SIDEBAR_VIEW_TYPE, leaf => new SidebarCompactView(leaf, this));
    this.registerView(BOARD_VIEW_TYPE, leaf => new BoardTabView(leaf, this));

    this.addRibbonIcon('list-checks', 'TaskBaby (Sidebar)', () => {
      this.activateSidebar();
    });

    this.addRibbonIcon('layout-dashboard', 'TaskBaby (Full)', () => {
      this.activateBoard();
    });

    this.addCommand({
      id: 'open-taskbaby-sidebar',
      name: 'Open compact panel in sidebar',
      callback: () => this.activateSidebar()
    });

    this.addCommand({
      id: 'open-taskbaby-tab',
      name: 'Open full board in tab',
      callback: () => this.activateBoard()
    });

    this.addCommand({
      id: 'refresh-taskbaby',
      name: 'Refresh TaskBaby',
      callback: () => this.refreshAllViews()
    });

    this.addSettingTab(new TaskBoardSettingTab(this.app, this));

    const reminderDeps = {
      now: () => new Date(),
      notify: (msg: string) => new Notice(msg, 10_000),
      presentModal: (options: PresentModalOptions) =>
        new ReminderModal(this.app, options).open(),
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
    this.reminderState = this.migrateReminderState(reminderState);
  }

  private migrateReminderState(raw: unknown): ReminderState {
    const fresh: ReminderState = {
      dayKey: null,
      finalized: false,
      snoozeCount: 0,
      snoozedUntil: null,
      lastPopupAt: null
    };
    if (!raw || typeof raw !== 'object') return fresh;
    const r = raw as Record<string, unknown>;
    if (typeof r.dayKey === 'string' || r.dayKey === null) {
      return {
        dayKey: (r.dayKey as string | null) ?? null,
        finalized: typeof r.finalized === 'boolean' ? r.finalized : false,
        snoozeCount: typeof r.snoozeCount === 'number' ? r.snoozeCount : 0,
        snoozedUntil: typeof r.snoozedUntil === 'string' ? r.snoozedUntil : null,
        lastPopupAt: typeof r.lastPopupAt === 'string' ? r.lastPopupAt : null
      };
    }
    if (typeof r.lastReminderDate === 'string' && r.lastReminderDate) {
      return { ...fresh, dayKey: r.lastReminderDate, finalized: true };
    }
    return fresh;
  }

  async saveSettings(): Promise<void> {
    await this.saveData({ ...this.settings, reminderState: this.reminderState });
  }

  getReminderState(): ReminderState {
    return this.reminderState;
  }

  async saveReminderState(state: ReminderState): Promise<void> {
    this.reminderState = state;
    await this.saveData({ ...this.settings, reminderState: state });
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
