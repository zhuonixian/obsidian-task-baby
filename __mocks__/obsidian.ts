// Minimal stub. Add fields as needed by tests.
export class TFile {
  constructor(public path: string, public basename: string, public extension: string) {}
}

export class TFolder {
  constructor(public path: string, public children: any[] = []) {}
}

export class Notice {
  constructor(public message: string, public duration: number = 5000) {}
}

export class PluginSettingTab {
  constructor(public app: any, public plugin: any) {}
  display() {}
}

export class Plugin {
  settings: any;
  async loadData() { return this.settings; }
  async saveData() {}
}

export abstract class ItemView {
  constructor(public app: any) {}
  abstract getViewType(): string;
  abstract getDisplayText(): string;
  abstract onOpen(): Promise<void>;
  abstract onClose(): Promise<void>;
  getIcon(): string { return ''; }
}

export class WorkspaceLeaf {
  view: any;
  constructor(public app: any) {}
}

export class Setting {
  constructor(public containerEl: any) {}
  setName() { return this; }
  setDesc() { return this; }
  addText() { return this; }
  addToggle() { return this; }
  addDropdown() { return this; }
  addButton() { return this; }
}

export class Modal {
  constructor(public app: any) {}
  open() {}
  close() {}
}

export class Vault {
  files: TFile[] = [];
  contents: Record<string, string> = {};

  async read(file: TFile): Promise<string> {
    return this.contents[file.path] ?? '';
  }

  async modify(file: TFile, content: string): Promise<void> {
    this.contents[file.path] = content;
  }

  getAbstractFileByPath(path: string): TFile | null {
    return this.files.find(f => f.path === path) ?? null;
  }

  getMarkdownFiles(): TFile[] {
    return this.files.filter(f => f.extension === 'md');
  }
}

export class App {
  vault: Vault = new Vault();
  workspace: any = {};
}

// Common re-exports
import dayjs from 'dayjs';
export const moment = dayjs;
