// Minimal stub. Add fields as needed by tests.

// Minimal HTMLElement-like stub for type compatibility (jsdom provides real one in tests).
// We use `any` to avoid pulling jsdom types into node test environment.
type AnyEl = any;

export class TFile {
  constructor(public path: string, public basename: string, public extension: string) {}
}

export class TFolder {
  constructor(public path: string, public children: any[] = []) {}
}

export class Notice {
  constructor(public message: string, public duration: number = 5000) {}
}

// Minimal element stub used for containerEl/contentEl/titleEl.
// Has just enough DOM-like methods for settingsTab + view stubs to compile.
class ElementStub {
  private _children: AnyEl[] = [];
  private _text: string = '';

  empty(): void {
    this._children = [];
    this._text = '';
  }
  setText(s: string): void {
    this._text = s;
    this._children = [];
  }
  getText(): string {
    return this._text;
  }
  createEl(_tag: string, opts?: { text?: string; cls?: string }): AnyEl {
    const el = new ElementStub();
    if (opts?.text !== undefined) el.setText(opts.text);
    this._children.push(el);
    return el;
  }
  appendChild(el: AnyEl): void {
    this._children.push(el);
  }
  get children(): AnyEl[] {
    return this._children;
  }
}

export class PluginSettingTab {
  app: any;
  containerEl: AnyEl = new ElementStub();
  plugin: any;
  constructor(app: any, plugin: any) {
    this.app = app;
    this.plugin = plugin;
  }
  display() {}
}

export class Plugin {
  app: any;
  settings: any;
  async loadData(): Promise<any> { return this.settings; }
  async saveData(_data?: any): Promise<void> {}
  registerView(_type: string, _factory: (leaf: any) => any): void {}
  addRibbonIcon(_icon: string, _title: string, _cb: () => void): void {}
  addCommand(_opts: { id: string; name: string; callback?: () => void }): void {}
  addSettingTab(_tab: any): void {}
}

export abstract class ItemView {
  app: any;
  contentEl: AnyEl = new ElementStub();
  constructor(_leaf: any) {}
  abstract getViewType(): string;
  abstract getDisplayText(): string;
  abstract onOpen(): Promise<void>;
  abstract onClose(): Promise<void>;
  getIcon(): string { return ''; }
}

export class WorkspaceLeaf {
  view: any;
  constructor(public app: any) {}
  async setViewState(_state: { type: string; active?: boolean }): Promise<void> {}
}

// Setting callback component stubs
class TextComponent {
  setPlaceholder(_p: string): this { return this; }
  setValue(_v: string): this { return this; }
  onChange(_cb: (v: string) => any): this { return this; }
}

class ToggleComponent {
  setValue(_v: boolean): this { return this; }
  onChange(_cb: (v: boolean) => any): this { return this; }
}

class ButtonComponent {
  setButtonText(_t: string): this { return this; }
  setTooltip(_t: string): this { return this; }
  onClick(_cb: () => any): this { return this; }
}

class DropdownComponent {
  addOption(_value: string, _display: string): this { return this; }
  setValue(_v: string): this { return this; }
  onChange(_cb: (v: string) => any): this { return this; }
}

export class Setting {
  constructor(public containerEl: any) {}
  setName(_n: string): this { return this; }
  setDesc(_d: string): this { return this; }
  addText(cb: (text: TextComponent) => any): this { cb(new TextComponent()); return this; }
  addToggle(cb: (t: ToggleComponent) => any): this { cb(new ToggleComponent()); return this; }
  addDropdown(cb: (d: DropdownComponent) => any): this { cb(new DropdownComponent()); return this; }
  addButton(cb: (b: ButtonComponent) => any): this { cb(new ButtonComponent()); return this; }
}

export class Modal {
  app: any;
  titleEl: AnyEl = new ElementStub();
  contentEl: AnyEl = new ElementStub();
  constructor(app: any) {
    this.app = app;
  }
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

class Workspace {
  getLeavesOfType(_type: string): WorkspaceLeaf[] { return []; }
  revealLeaf(_leaf: WorkspaceLeaf): void {}
  setActiveLeaf(_leaf: WorkspaceLeaf): void {}
  getRightLeaf(_split?: boolean): WorkspaceLeaf | null { return null; }
  getLeaf(_split?: boolean): WorkspaceLeaf | null { return null; }
}

export class App {
  vault: Vault = new Vault();
  workspace: Workspace = new Workspace();
}

// Common re-exports
import dayjs from 'dayjs';
export const moment = dayjs;
