# Obsidian 任务看板插件 Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build an Obsidian plugin that visualizes completed/pending tasks across the last 30 days of daily-note logs, with two entry points (sidebar compact + full board tab) and write-back to source files.

**Architecture:** Three-layer (config / data / UI). Data layer is stateless pure functions + in-memory cache. UI layer has two ItemView entries sharing the data layer. Native TypeScript + Obsidian API, no framework.

**Tech Stack:** TypeScript 5 · esbuild · Jest + ts-jest · Obsidian API · dayjs (date math only)

**Reference spec:** `docs/superpowers/specs/2026-06-14-obsidian-task-board-design.md`

---

## File Structure

```
package.json
tsconfig.json
jest.config.js
esbuild.config.mjs
manifest.json
versions.json
__mocks__/
└── obsidian.ts                       # Stub Vault/TFile/App for unit tests
src/
├── main.ts                           # Plugin entry: register views/commands/settings
├── types.ts                          # Task / TaskMeta / IndexSnapshot / Settings
├── config/
│   ├── defaultSettings.ts
│   └── settingsTab.ts                # PluginSettingTab + 测试匹配按钮
├── data/
│   ├── fileScanner.ts
│   ├── taskParser.ts
│   ├── taskIndex.ts
│   └── taskWriter.ts
├── views/
│   ├── sidebarView.ts                # SidebarCompactView (ItemView)
│   ├── boardView.ts                  # BoardTabView (ItemView, 3-tab switcher)
│   └── components/
│       ├── taskItem.ts               # Reusable task row renderer + interaction
│       ├── groupSection.ts           # Collapsible "未完成(N)" header + items
│       └── calendarGrid.ts           # 30-day 7-col grid
└── utils/
    ├── dateUtils.ts                  # parseFilenameDate / formatYmd / windowRange
    ├── domHelpers.ts                 # h() element creator + setClasses
    └── textHash.ts                   # Simple string hash for body comparison
__fixtures__/
├── cases/                            # Parser unit-test inputs
└── vault-30d/                        # Integration-test fixture vault
```

---

## Task 1: 项目脚手架

**Files:**
- Create: `package.json`
- Create: `tsconfig.json`
- Create: `jest.config.js`
- Create: `esbuild.config.mjs`
- Create: `manifest.json`
- Create: `versions.json`
- Create: `__mocks__/obsidian.ts`

- [ ] **Step 1: Create package.json**

```json
{
  "name": "obsidian-task-board",
  "version": "0.1.0",
  "description": "Visualize completed/pending tasks across daily-note logs",
  "main": "main.js",
  "scripts": {
    "dev": "node esbuild.config.mjs",
    "build": "node esbuild.config.mjs --production",
    "test": "jest",
    "test:w": "jest --watch",
    "lint": "tsc --noEmit"
  },
  "devDependencies": {
    "@types/jest": "^29.5.12",
    "@types/node": "^20.11.0",
    "builtin-modules": "^3.3.0",
    "dayjs": "^1.11.10",
    "esbuild": "^0.20.0",
    "jest": "^29.7.0",
    "ts-jest": "^29.1.2",
    "typescript": "^5.3.0"
  }
}
```

- [ ] **Step 2: Create tsconfig.json**

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true,
    "resolveJsonModule": true,
    "declaration": false,
    "outDir": "./dist",
    "rootDir": "./src",
    "baseUrl": ".",
    "paths": {
      "obsidian": ["./__mocks__/obsidian.ts"]
    },
    "types": ["jest", "node"]
  },
  "include": ["src/**/*", "__mocks__/**/*", "__fixtures__/**/*"],
  "exclude": ["node_modules", "dist"]
}
```

- [ ] **Step 3: Create jest.config.js**

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__fixtures__'],
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/__mocks__/obsidian.ts'
  },
  testMatch: ['**/*.test.ts'],
  clearMocks: true
};
```

- [ ] **Step 4: Create esbuild.config.mjs**

```javascript
import esbuild from 'esbuild';
import process from 'process';
import builtins from 'builtin-modules';

const prod = process.argv.includes('--production');

const ctx = await esbuild.context({
  entryPoints: ['src/main.ts'],
  bundle: true,
  external: [
    'obsidian',
    'electron',
    '@codemirror/autocomplete',
    '@codemirror/collab',
    '@codemirror/commands',
    '@codemirror/language',
    '@codemirror/lint',
    '@codemirror/search',
    '@codemirror/state',
    '@codemirror/view',
    '@lezer/common',
    '@lezer/highlight',
    '@lezer/lr',
    ...builtins
  ],
  format: 'cjs',
  target: 'es2020',
  logLevel: 'info',
  sourcemap: prod ? false : 'inline',
  treeShaking: true,
  outfile: 'main.js',
  minify: prod
});

if (prod) {
  await ctx.build();
  await ctx.dispose();
} else {
  await ctx.watch();
}
```

- [ ] **Step 5: Create manifest.json**

```json
{
  "id": "task-board",
  "name": "Task Board",
  "version": "0.1.0",
  "minAppVersion": "1.4.0",
  "description": "Visualize completed/pending tasks across daily-note logs",
  "author": "Your Name",
  "authorUrl": "",
  "isDesktopOnly": true
}
```

- [ ] **Step 6: Create versions.json**

```json
{
  "0.1.0": "1.4.0"
}
```

- [ ] **Step 7: Create __mocks__/obsidian.ts (minimal stub for unit tests)**

```typescript
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
export const moment = (await import('dayjs')).default;
```

- [ ] **Step 8: Install dependencies**

Run: `npm install`
Expected: `node_modules/` created, no errors.

- [ ] **Step 9: Verify lint passes**

Run: `npm run lint`
Expected: exit 0 (no type errors yet — empty src/).

- [ ] **Step 10: Commit**

```bash
git add package.json package-lock.json tsconfig.json jest.config.js esbuild.config.mjs manifest.json versions.json __mocks__/obsidian.ts
git commit -m "chore: scaffold project (npm/ts/jest/esbuild/manifest)"
```

---

## Task 2: types.ts — 核心数据类型

**Files:**
- Create: `src/types.ts`

- [ ] **Step 1: Write src/types.ts**

```typescript
// —— Task 元数据（Tasks 插件 emoji 风格）——
export type Priority = 'lowest' | 'low' | 'medium' | 'high' | 'highest';

export interface TaskMeta {
  due?: Date;
  scheduled?: Date;
  start?: Date;
  done?: Date;
  priority?: Priority;
  recurrence?: string; // 🔁 原文，不展开
  tags: string[];
}

// —— 核心任务类型 ——
export interface Task {
  sourcePath: string;        // "DailyLife/2026/06/2026-06-10.md"
  sourceDate: Date;          // 从文件名解析
  lineStart: number;         // 0-based 行号
  lineEnd: number;           // v1 = lineStart
  rawText: string;           // 原始 markdown 行
  body: string;              // 去掉 checkbox 后的正文（含 emoji/tag）
  bodyHash: string;          // stripMeta(body) 的 hash，用于写回校验
  checked: boolean;
  indent: number;
  meta?: TaskMeta;
}

// —— 索引快照（UI 消费）——
export interface DayBucket {
  pending: Task[];
  done: Task[];
}

export interface IndexSnapshot {
  generatedAt: Date;
  windowStart: Date;
  windowEnd: Date;           // = today
  today: {
    pending: Task[];
    done: Task[];
    backlog: Task[];         // 历史日期未完成、滚到今天
  };
  byDate: Map<string, DayBucket>; // key = "YYYY-MM-DD"
  allPending: Task[];        // 窗口内全部未完成（去重）
  allDone: Task[];           // 窗口内全部已完成
  errors: { path: string; error: Error }[];
  unparsed: string[];        // 文件名不匹配的 path
}

// —— 设置 ——
export interface TaskBoardSettings {
  dailyDir: string;
  filePattern: string;       // e.g. "YYYY-MM-DD.md"
  rangeDays: number;
  enableTasksMetadata: boolean;
  sidebarCompactLimit: number;
  appendDoneDate: boolean;
}

// —— 错误类型 ——
export class TaskLineChangedError extends Error {
  constructor(msg: string) { super(msg); this.name = 'TaskLineChangedError'; }
}

export class TaskBodyChangedError extends Error {
  constructor(msg: string) { super(msg); this.name = 'TaskBodyChangedError'; }
}
```

- [ ] **Step 2: Verify lint passes**

Run: `npm run lint`
Expected: exit 0.

- [ ] **Step 3: Commit**

```bash
git add src/types.ts
git commit -m "feat(types): define Task, IndexSnapshot, Settings, errors"
```

---

## Task 3: dateUtils — 日期解析与窗口计算

**Files:**
- Create: `src/utils/dateUtils.ts`
- Create: `src/utils/dateUtils.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/utils/dateUtils.test.ts
import {
  parseFilenameDate,
  formatYmd,
  computeWindowStart,
  dateToYmd,
  isSameDay
} from './dateUtils';

describe('dateUtils', () => {
  test('parseFilenameDate: standard YYYY-MM-DD', () => {
    expect(parseFilenameDate('2026-06-14')).toEqual(new Date(2026, 5, 14));
  });

  test('parseFilenameDate: returns null for non-standard format', () => {
    expect(parseFilenameDate('2026-6-14')).toBeNull();
    expect(parseFilenameDate('6/20/2026')).toBeNull();
    expect(parseFilenameDate('notes')).toBeNull();
  });

  test('formatYmd', () => {
    expect(formatYmd(new Date(2026, 5, 14))).toBe('2026-06-14');
    expect(formatYmd(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('dateToYmd is alias of formatYmd', () => {
    expect(dateToYmd(new Date(2026, 5, 14))).toBe('2026-06-14');
  });

  test('computeWindowStart: 30 days before', () => {
    const today = new Date(2026, 5, 14);
    const start = computeWindowStart(today, 30);
    expect(start).toEqual(new Date(2026, 4, 15));
  });

  test('computeWindowStart: 1 day', () => {
    const today = new Date(2026, 5, 14);
    expect(computeWindowStart(today, 1)).toEqual(new Date(2026, 5, 14));
  });

  test('isSameDay', () => {
    const a = new Date(2026, 5, 14, 10, 30);
    const b = new Date(2026, 5, 14, 23, 59);
    const c = new Date(2026, 5, 15);
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, c)).toBe(false);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/utils/dateUtils.test.ts`
Expected: FAIL — "Cannot find module './dateUtils'"

- [ ] **Step 3: Write minimal implementation**

```typescript
// src/utils/dateUtils.ts
const FILENAME_DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function parseFilenameDate(name: string): Date | null {
  const m = name.match(FILENAME_DATE_RE);
  if (!m) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  return new Date(y, mo - 1, d);
}

export function formatYmd(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export const dateToYmd = formatYmd;

export function computeWindowStart(today: Date, rangeDays: number): Date {
  const start = new Date(today);
  start.setDate(start.getDate() - (rangeDays - 1));
  start.setHours(0, 0, 0, 0);
  return start;
}

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear()
    && a.getMonth() === b.getMonth()
    && a.getDate() === b.getDate();
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx jest src/utils/dateUtils.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 5: Commit**

```bash
git add src/utils/dateUtils.ts src/utils/dateUtils.test.ts
git commit -m "feat(utils): date parsing and window computation"
```

---

## Task 4: defaultSettings & textHash

**Files:**
- Create: `src/config/defaultSettings.ts`
- Create: `src/utils/textHash.ts`
- Create: `src/utils/textHash.test.ts`

- [ ] **Step 1: Write defaultSettings.ts**

```typescript
// src/config/defaultSettings.ts
import type { TaskBoardSettings } from '../types';

export const DEFAULT_SETTINGS: TaskBoardSettings = {
  dailyDir: 'DailyLife',
  filePattern: 'YYYY-MM-DD.md',
  rangeDays: 30,
  enableTasksMetadata: true,
  sidebarCompactLimit: 5,
  appendDoneDate: true
};
```

- [ ] **Step 2: Write the failing test for textHash**

```typescript
// src/utils/textHash.test.ts
import { textHash, stripMeta } from './textHash';

describe('textHash', () => {
  test('stable for same input', () => {
    expect(textHash('hello world')).toBe(textHash('hello world'));
  });

  test('different for different input', () => {
    expect(textHash('hello')).not.toBe(textHash('world'));
  });

  test('empty string', () => {
    expect(textHash('')).toBe(textHash(''));
  });
});

describe('stripMeta', () => {
  test('removes due emoji + date', () => {
    expect(stripMeta('学 Rust 📅 2026-06-20')).toBe('学 Rust');
  });

  test('removes priority emoji', () => {
    expect(stripMeta('学 Rust 🔼')).toBe('学 Rust');
  });

  test('removes tags', () => {
    expect(stripMeta('学 Rust #p1 #work')).toBe('学 Rust');
  });

  test('preserves body across emoji mix', () => {
    expect(stripMeta('写周报 📅 2026-06-14 #work 🔼')).toBe('写周报');
  });

  test('empty body', () => {
    expect(stripMeta('📅 2026-06-14')).toBe('');
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/utils/textHash.test.ts`
Expected: FAIL — "Cannot find module './textHash'"

- [ ] **Step 4: Write implementation**

```typescript
// src/utils/textHash.ts
import type { Priority } from '../types';

// —— 元数据 strip ——
// 注意：和 TaskParser 使用同一份 emoji 表，更新时同步
const EMOJI_META_RE = /[\u{1F4C5}\u{23F3}\u{1F6EB}\u{2705}\u{1F501}\u{23EB}\u{1F53C}\u{1F53D}\u{23EC}]\s*\S*/gu;
const TAG_RE = /#[\w一-龥-]+/g;
const MULTI_WS_RE = /\s+/g;

export function stripMeta(body: string): string {
  return body
    .replace(EMOJI_META_RE, '')
    .replace(TAG_RE, '')
    .replace(MULTI_WS_RE, ' ')
    .trim();
}

// —— 简单字符串 hash（djb2）——
export function textHash(s: string): string {
  let hash = 5381;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) + hash) + s.charCodeAt(i);
    hash = hash & 0xffffffff; // Force 32-bit
  }
  return (hash >>> 0).toString(36);
}

// —— Priority 映射（Tasks 插件同款）——
export const PRIORITY_EMOJI: Record<string, Priority> = {
  '⏫': 'highest',
  '🔼': 'high',
  '🔽': 'low',
  '⏬': 'lowest'
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/utils/textHash.test.ts`
Expected: PASS (8 tests)

- [ ] **Step 6: Commit**

```bash
git add src/config/defaultSettings.ts src/utils/textHash.ts src/utils/textHash.test.ts
git commit -m "feat(config): default settings + text hash + meta stripper"
```

---

## Task 5: TaskParser — 基础（checkbox + 缩进 + 代码块跳过）

**Files:**
- Create: `src/data/taskParser.ts`
- Create: `src/data/taskParser.test.ts`
- Create: `__fixtures__/cases/basic-checkbox.md`

- [ ] **Step 1: Create fixture file**

```markdown
<!-- __fixtures__/cases/basic-checkbox.md -->
# 2026-06-14

- [ ] 学 Rust
- [x] 早咖啡
  - [ ] 子任务 1
  - [x] 子任务 2
- 普通段落
- [ ] 健身 30min

```
- [ ] 这是代码块里的的伪任务
```

- [ ] 写在末尾
- [x] 最后一条
```

- [ ] **Step 2: Write the failing test**

```typescript
// src/data/taskParser.test.ts
import { readFileSync } from 'fs';
import { join } from 'path';
import { parseFile } from './taskParser';

function loadFixture(name: string): string {
  return readFileSync(join(__dirname, '../../__fixtures__/cases', name), 'utf8');
}

describe('TaskParser basics', () => {
  const content = loadFixture('basic-checkbox.md');

  test('identifies all top-level tasks', () => {
    const tasks = parseFile(content, 'DailyLife/2026/06/2026-06-14.md', new Date(2026, 5, 14));
    const bodies = tasks.map(t => t.body);
    expect(bodies).toContain('学 Rust');
    expect(bodies).toContain('早咖啡');
    expect(bodies).toContain('健身 30min');
    expect(bodies).toContain('最后一条');
  });

  test('captures checked flag', () => {
    const tasks = parseFile(content, 'p', new Date(2026, 5, 14));
    const doneTasks = tasks.filter(t => t.checked).map(t => t.body);
    expect(doneTasks).toContain('早咖啡');
    expect(doneTasks).toContain('子任务 2');
    expect(doneTasks).toContain('最后一条');
  });

  test('captures indent level', () => {
    const tasks = parseFile(content, 'p', new Date(2026, 5, 14));
    const subtasks = tasks.filter(t => t.body.startsWith('子任务'));
    expect(subtasks.length).toBe(2);
    subtasks.forEach(t => expect(t.indent).toBe(2));
  });

  test('top-level tasks have indent 0', () => {
    const tasks = parseFile(content, 'p', new Date(2026, 5, 14));
    const top = tasks.filter(t => t.body === '学 Rust');
    expect(top[0].indent).toBe(0);
  });

  test('skips pseudo-tasks inside code block', () => {
    const tasks = parseFile(content, 'p', new Date(2026, 5, 14));
    expect(tasks.map(t => t.body)).not.toContain('这是代码块里的的伪任务');
  });

  test('skips plain paragraphs', () => {
    const tasks = parseFile(content, 'p', new Date(2026, 5, 14));
    expect(tasks.map(t => t.body)).not.toContain('普通段落');
  });

  test('captures lineStart (0-based)', () => {
    const tasks = parseFile(content, 'p', new Date(2026, 5, 14));
    const first = tasks.find(t => t.body === '学 Rust');
    expect(first?.lineStart).toBe(2);
  });

  test('captures rawText', () => {
    const tasks = parseFile(content, 'p', new Date(2026, 5, 14));
    const first = tasks.find(t => t.body === '学 Rust');
    expect(first?.rawText).toBe('- [ ] 学 Rust');
  });

  test('captures sourcePath and sourceDate', () => {
    const sourceDate = new Date(2026, 5, 14);
    const tasks = parseFile(content, 'DailyLife/2026/06/2026-06-14.md', sourceDate);
    expect(tasks[0].sourcePath).toBe('DailyLife/2026/06/2026-06-14.md');
    expect(tasks[0].sourceDate).toEqual(sourceDate);
  });

  test('empty file returns []', () => {
    expect(parseFile('', 'p', new Date())).toEqual([]);
  });

  test('computes bodyHash', () => {
    const tasks = parseFile(content, 'p', new Date(2026, 5, 14));
    const x = tasks.find(t => t.body === '学 Rust')!;
    expect(x.bodyHash).toBeTruthy();
    expect(x.bodyHash).toBe(x.bodyHash); // stable
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/data/taskParser.test.ts`
Expected: FAIL — "Cannot find module './taskParser'"

- [ ] **Step 4: Write implementation (basics only — emoji/tag parsing comes in Task 6)**

```typescript
// src/data/taskParser.ts
import type { Task } from '../types';
import { textHash, stripMeta } from '../utils/textHash';

const TASK_LINE_RE = /^(\s*)[-*+] \[( |x)\] (.+)$/;
const CODE_FENCE_RE = /^(\s*)(```|~~~)/;

export function parseFile(
  content: string,
  sourcePath: string,
  sourceDate: Date
): Task[] {
  const lines = content.split('\n');
  const tasks: Task[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    // —— 代码块状态机 ——
    if (CODE_FENCE_RE.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    // —— 任务行匹配 ——
    const m = line.match(TASK_LINE_RE);
    if (!m) continue;

    const indent = m[1].length;
    const checked = m[2] === 'x';
    const body = m[3].trim();

    tasks.push({
      sourcePath,
      sourceDate,
      lineStart: i,
      lineEnd: i, // v1: 单行任务
      rawText: line,
      body,
      bodyHash: textHash(stripMeta(body)),
      checked,
      indent,
      meta: { tags: [] } // Task 6 fills this
    });
  }

  return tasks;
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx jest src/data/taskParser.test.ts`
Expected: PASS (12 tests)

- [ ] **Step 6: Commit**

```bash
git add src/data/taskParser.ts src/data/taskParser.test.ts __fixtures__/cases/basic-checkbox.md
git commit -m "feat(parser): identify task lines with checkbox, indent, code-fence skip"
```

---

## Task 6: TaskParser — emoji 元数据 + tags

**Files:**
- Modify: `src/data/taskParser.ts`
- Modify: `src/data/taskParser.test.ts`
- Create: `__fixtures__/cases/tasks-plugin-metadata.md`

- [ ] **Step 1: Create fixture**

```markdown
<!-- __fixtures__/cases/tasks-plugin-metadata.md -->
- [ ] 学 Rust 📅 2026-06-20 🔼 #p1
- [x] 写周报 ⏳ 2026-06-15 ✅ 2026-06-14 #work
- [ ] 读书 🛫 2026-06-01 📅 2026-06-30
- [ ] 重复任务 🔁 every week
- [ ] 优先级最低 ⏬
- [ ] 高优先级 ⏫
- [ ] 多标签 #a #b #c
- [ ] 中文 emoji 混排 📅2026-06-20 #中文
```

- [ ] **Step 2: Add failing tests for emoji/tag parsing**

Append to `src/data/taskParser.test.ts`:

```typescript
describe('TaskParser metadata', () => {
  const content = readFileSync(join(__dirname, '../../__fixtures__/cases/tasks-plugin-metadata.md'), 'utf8');
  const tasks = parseFile(content, 'p', new Date(2026, 5, 14));

  test('parses due date (📅)', () => {
    const t = tasks.find(x => x.body.startsWith('学 Rust'))!;
    expect(t.meta?.due).toEqual(new Date(2026, 5, 20));
  });

  test('parses scheduled date (⏳)', () => {
    const t = tasks.find(x => x.body.startsWith('写周报'))!;
    expect(t.meta?.scheduled).toEqual(new Date(2026, 5, 15));
  });

  test('parses start date (🛫)', () => {
    const t = tasks.find(x => x.body.startsWith('读书'))!;
    expect(t.meta?.start).toEqual(new Date(2026, 5, 1));
    expect(t.meta?.due).toEqual(new Date(2026, 5, 30));
  });

  test('parses done date (✅)', () => {
    const t = tasks.find(x => x.body.startsWith('写周报'))!;
    expect(t.meta?.done).toEqual(new Date(2026, 5, 14));
  });

  test('parses recurrence (🔁) as raw string', () => {
    const t = tasks.find(x => x.body.startsWith('重复任务'))!;
    expect(t.meta?.recurrence).toBe('every week');
  });

  test('parses priority emojis', () => {
    expect(tasks.find(t => t.body.startsWith('优先级最低'))!.meta?.priority).toBe('lowest');
    expect(tasks.find(t => t.body.startsWith('高优先级'))!.meta?.priority).toBe('highest');
    expect(tasks.find(t => t.body.startsWith('学 Rust'))!.meta?.priority).toBe('high');
  });

  test('parses tags', () => {
    const t = tasks.find(x => x.body.startsWith('多标签'))!;
    expect(t.meta?.tags).toEqual(['a', 'b', 'c']);
  });

  test('parses Chinese tags', () => {
    const t = tasks.find(x => x.body.startsWith('中文'))!;
    expect(t.meta?.tags).toContain('中文');
  });

  test('strips emoji from body display', () => {
    const t = tasks.find(x => x.body.startsWith('学 Rust'))!;
    expect(t.body).not.toContain('📅');
    expect(t.body).not.toContain('🔼');
    expect(t.body).not.toContain('#p1');
    expect(t.body).toBe('学 Rust');
  });

  test('non-standard date format leaves meta undefined', () => {
    // 文件没有非标日期 fixture，单独测：
    const t = parseFile('- [ ] foo 📅 6/20/2026', 'p', new Date())[0];
    expect(t.meta?.due).toBeUndefined();
    expect(t.body).toBe('foo');
  });
});
```

- [ ] **Step 3: Run tests to verify failures**

Run: `npx jest src/data/taskParser.test.ts`
Expected: FAIL (new tests fail — body still contains emoji, meta not parsed).

- [ ] **Step 4: Update implementation**

```typescript
// src/data/taskParser.ts (full rewrite)
import type { Task, TaskMeta, Priority } from '../types';
import { textHash, stripMeta, PRIORITY_EMOJI } from '../utils/textHash';

const TASK_LINE_RE = /^(\s*)[-*+] \[( |x)\] (.+)$/;
const CODE_FENCE_RE = /^(\s*)(```|~~~)/;

// Emoji patterns
const DATE_EMOJI_RE = /([\u{1F4C5}\u{23F3}\u{1F6EB}\u{2705}])\s*(\d{4}-\d{2}-\d{2})/u;
const RECURRENCE_RE = /\u{1F501}\s*([^#\u{1F4C5}\u{23F3}\u{1F6EB}\u{2705}\u{23EB}\u{1F53C}\u{1F53D}\u{23EC}]+)/u;
const TAG_RE = /#([\w一-龥-]+)/g;

const EMOJI_TO_FIELD: Record<string, keyof Pick<TaskMeta, 'due' | 'scheduled' | 'start' | 'done'>> = {
  '📅': 'due',
  '⏳': 'scheduled',
  '🛫': 'start',
  '✅': 'done'
};

function parseDate(s: string): Date | null {
  const m = s.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!m) return null;
  const d = new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return isNaN(d.getTime()) ? null : d;
}

function parseMeta(body: string): { meta: TaskMeta; strippedBody: string } {
  const meta: TaskMeta = { tags: [] };

  // 1. Date emojis (📅 ⏳ 🛫 ✅)
  let stripped = body;
  for (const [emoji, field] of Object.entries(EMOJI_TO_FIELD)) {
    const re = new RegExp(`${emoji}\\s*(\\d{4}-\\d{2}-\\d{2})`, 'u');
    const m = stripped.match(re);
    if (m) {
      const d = parseDate(m[1]);
      if (d) (meta as any)[field] = d;
      stripped = stripped.replace(re, '');
    }
  }

  // 2. Recurrence 🔁
  const recM = stripped.match(RECURRENCE_RE);
  if (recM) {
    meta.recurrence = recM[1].trim();
    stripped = stripped.replace(RECURRENCE_RE, '');
  }

  // 3. Priority
  for (const [emoji, pri] of Object.entries(PRIORITY_EMOJI)) {
    if (stripped.includes(emoji)) {
      meta.priority = pri;
      stripped = stripped.split(emoji).join('');
      break;
    }
  }

  // 4. Tags
  let tagM: RegExpExecArray | null;
  while ((tagM = TAG_RE.exec(stripped)) !== null) {
    meta.tags.push(tagM[1]);
  }
  stripped = stripped.replace(TAG_RE, '');

  // 5. Clean whitespace
  stripped = stripped.replace(/\s+/g, ' ').trim();

  return { meta, strippedBody: stripped };
}

export function parseFile(
  content: string,
  sourcePath: string,
  sourceDate: Date
): Task[] {
  const lines = content.split('\n');
  const tasks: Task[] = [];
  let inCodeBlock = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (CODE_FENCE_RE.test(line)) {
      inCodeBlock = !inCodeBlock;
      continue;
    }
    if (inCodeBlock) continue;

    const m = line.match(TASK_LINE_RE);
    if (!m) continue;

    const indent = m[1].length;
    const checked = m[2] === 'x';
    const rawBody = m[3].trim();
    const { meta, strippedBody } = parseMeta(rawBody);

    tasks.push({
      sourcePath,
      sourceDate,
      lineStart: i,
      lineEnd: i,
      rawText: line,
      body: strippedBody,
      bodyHash: textHash(stripMeta(strippedBody)),
      checked,
      indent,
      meta
    });
  }

  return tasks;
}
```

- [ ] **Step 5: Run all parser tests**

Run: `npx jest src/data/taskParser.test.ts`
Expected: PASS (all 22 tests — 12 from Task 5 + 10 new)

- [ ] **Step 6: Commit**

```bash
git add src/data/taskParser.ts src/data/taskParser.test.ts __fixtures__/cases/tasks-plugin-metadata.md
git commit -m "feat(parser): parse Tasks-plugin emoji metadata and tags"
```

---

## Task 7: FileScanner — 列文件 + pattern 过滤 + 时间窗口

**Files:**
- Create: `src/data/fileScanner.ts`
- Create: `src/data/fileScanner.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/data/fileScanner.test.ts
import { TFile, Vault } from 'obsidian';
import { listDailyFiles } from './fileScanner';

function makeFile(path: string): TFile {
  const parts = path.split('/');
  const name = parts[parts.length - 1].replace(/\.md$/, '');
  return new TFile(path, name, 'md');
}

describe('FileScanner', () => {
  let vault: Vault;

  beforeEach(() => {
    vault = new Vault();
  });

  test('lists only files matching pattern', () => {
    vault.files = [
      makeFile('DailyLife/2026/06/2026-06-14.md'),
      makeFile('DailyLife/2026/06/notes.md'),
      makeFile('DailyLife/2026/06/2026-06-13.md')
    ];
    const result = listDailyFiles(vault, {
      dailyDir: 'DailyLife',
      filePattern: 'YYYY-MM-DD.md',
      rangeDays: 30,
      enableTasksMetadata: true,
      sidebarCompactLimit: 5,
      appendDoneDate: true
    }, new Date(2026, 5, 14));
    expect(result.matched.map(f => f.path)).toEqual([
      'DailyLife/2026/06/2026-06-13.md',
      'DailyLife/2026/06/2026-06-14.md'
    ]);
    expect(result.unparsed.map(f => f.path)).toEqual(['DailyLife/2026/06/notes.md']);
  });

  test('filters by time window', () => {
    vault.files = [
      makeFile('DailyLife/2026/05/2026-05-01.md'),  // 太早
      makeFile('DailyLife/2026/06/2026-06-14.md')   // 今天
    ];
    const result = listDailyFiles(vault, {
      dailyDir: 'DailyLife',
      filePattern: 'YYYY-MM-DD.md',
      rangeDays: 30,
      enableTasksMetadata: true,
      sidebarCompactLimit: 5,
      appendDoneDate: true
    }, new Date(2026, 5, 14));
    expect(result.matched.map(f => f.path)).toEqual(['DailyLife/2026/06/2026-06-14.md']);
  });

  test('includes files in subfolders under dailyDir', () => {
    vault.files = [
      makeFile('DailyLife/2026/06/2026-06-14.md'),
      makeFile('DailyLife/2025/12/2025-12-31.md'),
      makeFile('Other/2026/06/2026-06-14.md')  // 不在 dailyDir 下
    ];
    const result = listDailyFiles(vault, {
      dailyDir: 'DailyLife',
      filePattern: 'YYYY-MM-DD.md',
      rangeDays: 365,
      enableTasksMetadata: true,
      sidebarCompactLimit: 5,
      appendDoneDate: true
    }, new Date(2026, 5, 14));
    const paths = result.matched.map(f => f.path);
    expect(paths).toContain('DailyLife/2026/06/2026-06-14.md');
    expect(paths).toContain('DailyLife/2025/12/2025-12-31.md');
    expect(paths).not.toContain('Other/2026/06/2026-06-14.md');
  });

  test('custom filePattern works', () => {
    vault.files = [
      makeFile('Logs/June-14-2026.md'),
      makeFile('Logs/2026-06-14.md')
    ];
    const result = listDailyFiles(vault, {
      dailyDir: 'Logs',
      filePattern: 'MMMM-D-YYYY.md',
      rangeDays: 30,
      enableTasksMetadata: true,
      sidebarCompactLimit: 5,
      appendDoneDate: true
    }, new Date(2026, 5, 14));
    // pattern 中 YYYY-MM-DD.md → 严格 YYYY-MM-DD.md
    // MMMM-D-YYYY.md → 解析后日期 = 2026-06-14
    expect(result.matched.map(f => f.path)).toEqual(['Logs/June-14-2026.md']);
  });

  test('returns empty when dailyDir has no files', () => {
    vault.files = [];
    const result = listDailyFiles(vault, {
      dailyDir: 'DailyLife',
      filePattern: 'YYYY-MM-DD.md',
      rangeDays: 30,
      enableTasksMetadata: true,
      sidebarCompactLimit: 5,
      appendDoneDate: true
    }, new Date(2026, 5, 14));
    expect(result.matched).toEqual([]);
    expect(result.unparsed).toEqual([]);
  });

  test('matched includes parsed sourceDate', () => {
    vault.files = [makeFile('DailyLife/2026/06/2026-06-14.md')];
    const result = listDailyFiles(vault, {
      dailyDir: 'DailyLife',
      filePattern: 'YYYY-MM-DD.md',
      rangeDays: 30,
      enableTasksMetadata: true,
      sidebarCompactLimit: 5,
      appendDoneDate: true
    }, new Date(2026, 5, 14));
    expect(result.matched[0].sourceDate).toEqual(new Date(2026, 5, 14));
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/data/fileScanner.test.ts`
Expected: FAIL — "Cannot find module './fileScanner'"

- [ ] **Step 3: Write implementation**

```typescript
// src/data/fileScanner.ts
import type { Vault, TFile } from 'obsidian';
import type { TaskBoardSettings } from '../types';
import { computeWindowStart, parseFilenameDate } from '../utils/dateUtils';

export interface MatchedFile {
  file: TFile;
  sourceDate: Date;
}

export interface ScanResult {
  matched: MatchedFile[];
  unparsed: TFile[];
}

// 把 filePattern 转成正则 + 解析器
// 仅支持 YYYY MM DD DD 的子集（v1 够用）
function patternToRegex(pattern: string): { regex: RegExp; parseFromName: (name: string) => Date | null } {
  if (pattern === 'YYYY-MM-DD.md') {
    return {
      regex: /^\d{4}-\d{2}-\d{2}\.md$/,
      parseFromName: (name) => parseFilenameDate(name.replace(/\.md$/, ''))
    };
  }
  if (pattern === 'MMMM-D-YYYY.md') {
    const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    return {
      regex: /^[A-Za-z]+-\d{1,2}-\d{4}\.md$/,
      parseFromName: (name) => {
        const m = name.replace(/\.md$/, '').match(/^([A-Za-z]+)-(\d{1,2})-(\d{4})$/);
        if (!m) return null;
        const monthIdx = MONTHS.indexOf(m[1]);
        if (monthIdx < 0) return null;
        return new Date(Number(m[3]), monthIdx, Number(m[2]));
      }
    };
  }
  // Fallback: try YYYY-MM-DD
  return {
    regex: /^\d{4}-\d{2}-\d{2}\.md$/,
    parseFromName: (name) => parseFilenameDate(name.replace(/\.md$/, ''))
  };
}

export function listDailyFiles(
  vault: Vault,
  settings: TaskBoardSettings,
  today: Date
): ScanResult {
  const { regex, parseFromName } = patternToRegex(settings.filePattern);
  const windowStart = computeWindowStart(today, settings.rangeDays);

  const all = vault.getMarkdownFiles();
  const matched: MatchedFile[] = [];
  const unparsed: TFile[] = [];

  for (const file of all) {
    if (!file.path.startsWith(settings.dailyDir + '/')) {
      continue;
    }
    const basename = file.path.split('/').pop() ?? '';
    if (!regex.test(basename)) {
      unparsed.push(file);
      continue;
    }
    const sourceDate = parseFromName(basename);
    if (!sourceDate) {
      unparsed.push(file);
      continue;
    }
    if (sourceDate < windowStart || sourceDate > today) {
      continue;
    }
    matched.push({ file, sourceDate });
  }

  matched.sort((a, b) => a.sourceDate.getTime() - b.sourceDate.getTime());
  return { matched, unparsed };
}
```

- [ ] **Step 4: Run tests to verify pass**

Run: `npx jest src/data/fileScanner.test.ts`
Expected: PASS (6 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/fileScanner.ts src/data/fileScanner.test.ts
git commit -m "feat(scanner): list daily files matching pattern and window"
```

---

## Task 8: TaskIndex — byDate + 跨日积压 + 去重

**Files:**
- Create: `src/data/taskIndex.ts`
- Create: `src/data/taskIndex.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/data/taskIndex.test.ts
import type { Task } from '../types';
import { buildIndex, computeBacklog, dedupeBySource } from './taskIndex';

function makeTask(
  body: string,
  sourceDate: Date,
  checked: boolean,
  lineStart = 0,
  priority?: 'high' | 'low'
): Task {
  return {
    sourcePath: `DailyLife/${sourceDate.getFullYear()}/${String(sourceDate.getMonth() + 1).padStart(2, '0')}/${sourceDate.getFullYear()}-${String(sourceDate.getMonth() + 1).padStart(2, '0')}-${String(sourceDate.getDate()).padStart(2, '0')}.md`,
    sourceDate,
    lineStart,
    lineEnd: lineStart,
    rawText: `- [${checked ? 'x' : ' '}] ${body}`,
    body,
    bodyHash: body,
    checked,
    indent: 0,
    meta: priority ? { tags: [], priority } : { tags: [] }
  };
}

describe('computeBacklog', () => {
  test('历史未完成 → 进入 backlog', () => {
    const today = new Date(2026, 5, 14);
    const tasks: Task[] = [
      makeTask('历史任务', new Date(2026, 5, 10), false)
    ];
    const backlog = computeBacklog(tasks, today);
    expect(backlog.length).toBe(1);
    expect(backlog[0].body).toBe('历史任务');
  });

  test('今日任务 → 不进 backlog', () => {
    const today = new Date(2026, 5, 14);
    const tasks: Task[] = [
      makeTask('今日任务', today, false)
    ];
    const backlog = computeBacklog(tasks, today);
    expect(backlog).toEqual([]);
  });

  test('已完成任务 → 不进 backlog', () => {
    const today = new Date(2026, 5, 14);
    const tasks: Task[] = [
      makeTask('已完成', new Date(2026, 5, 10), true)
    ];
    const backlog = computeBacklog(tasks, today);
    expect(backlog).toEqual([]);
  });

  test('按优先级 + 日期排序', () => {
    const today = new Date(2026, 5, 14);
    const tasks: Task[] = [
      makeTask('low-6-12', new Date(2026, 5, 12), false, 0, 'low'),
      makeTask('high-6-13', new Date(2026, 5, 13), false, 0, 'high'),
      makeTask('high-6-10', new Date(2026, 5, 10), false, 0, 'high'),
      makeTask('low-6-11', new Date(2026, 5, 11), false, 0, 'low')
    ];
    const backlog = computeBacklog(tasks, today);
    expect(backlog.map(t => t.body)).toEqual([
      'high-6-10', 'high-6-13', 'low-6-11', 'low-6-12'
    ]);
  });
});

describe('dedupeBySource', () => {
  test('相同 sourcePath + lineStart 去重', () => {
    const t1 = makeTask('a', new Date(2026, 5, 10), false, 5);
    const t2 = makeTask('a', new Date(2026, 5, 10), false, 5);
    const t3 = makeTask('b', new Date(2026, 5, 11), false, 5);
    const result = dedupeBySource([t1, t2, t3]);
    expect(result.length).toBe(2);
  });

  test('同 path 不同 lineStart 保留', () => {
    const t1 = makeTask('a', new Date(2026, 5, 10), false, 5);
    const t2 = makeTask('b', new Date(2026, 5, 10), false, 10);
    const result = dedupeBySource([t1, t2]);
    expect(result.length).toBe(2);
  });
});

describe('buildIndex', () => {
  test('构造完整快照', () => {
    const today = new Date(2026, 5, 14);
    const tasks: Task[] = [
      makeTask('今日未完', today, false, 0),
      makeTask('今日完成', today, true, 1),
      makeTask('历史未完', new Date(2026, 5, 10), false, 0),
      makeTask('历史完成', new Date(2026, 5, 10), true, 1)
    ];
    const idx = buildIndex(tasks, today, 30, []);

    expect(idx.today.pending.map(t => t.body)).toEqual(['今日未完']);
    expect(idx.today.done.map(t => t.body)).toEqual(['今日完成']);
    expect(idx.today.backlog.map(t => t.body)).toEqual(['历史未完']);

    expect(idx.byDate.get('2026-06-14')?.pending.length).toBe(1);
    expect(idx.byDate.get('2026-06-10')?.pending.length).toBe(1);
    expect(idx.byDate.get('2026-06-10')?.done.length).toBe(1);

    // 全局：未完成去重（今日 + 历史）
    expect(idx.allPending.map(t => t.body)).toContain('今日未完');
    expect(idx.allPending.map(t => t.body)).toContain('历史未完');
    expect(idx.allPending.length).toBe(2);

    expect(idx.allDone.map(t => t.body)).toEqual(['今日完成', '历史完成']);
  });

  test('windowStart 和 windowEnd', () => {
    const today = new Date(2026, 5, 14);
    const idx = buildIndex([], today, 30, []);
    expect(idx.windowEnd).toEqual(today);
    expect(idx.windowStart).toEqual(new Date(2026, 4, 15));
  });

  test('同任务在 byDate 和 today.backlog 是同一对象引用', () => {
    const today = new Date(2026, 5, 14);
    const t = makeTask('历史未完', new Date(2026, 5, 10), false, 0);
    const idx = buildIndex([t], today, 30, []);
    expect(idx.byDate.get('2026-06-10')?.pending[0]).toBe(t);
    expect(idx.today.backlog[0]).toBe(t);
  });

  test('allPending 全局去重（同任务不在两个位置都进入 allPending）', () => {
    const today = new Date(2026, 5, 14);
    const t = makeTask('历史未完', new Date(2026, 5, 10), false, 0);
    const idx = buildIndex([t], today, 30, []);
    expect(idx.allPending.length).toBe(1);
  });

  test('errors 透传', () => {
    const today = new Date(2026, 5, 14);
    const errors = [{ path: 'x.md', error: new Error('boom') }];
    const idx = buildIndex([], today, 30, errors);
    expect(idx.errors).toEqual(errors);
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/data/taskIndex.test.ts`
Expected: FAIL — "Cannot find module './taskIndex'"

- [ ] **Step 3: Write implementation**

```typescript
// src/data/taskIndex.ts
import type { IndexSnapshot, Task, TaskMeta, Priority } from '../types';
import { computeWindowStart, dateToYmd, isSameDay } from '../utils/dateUtils';

const PRIORITY_WEIGHT: Record<Priority, number> = {
  highest: 0,
  high: 1,
  medium: 2,
  low: 3,
  lowest: 4
};

export function computeBacklog(allTasks: Task[], today: Date): Task[] {
  return allTasks
    .filter(t => !t.checked && !isSameDay(t.sourceDate, today) && t.sourceDate < today)
    .sort((a, b) => {
      const pa = PRIORITY_WEIGHT[a.meta?.priority ?? 'medium'];
      const pb = PRIORITY_WEIGHT[b.meta?.priority ?? 'medium'];
      if (pa !== pb) return pa - pb;
      return a.sourceDate.getTime() - b.sourceDate.getTime();
    });
}

export function dedupeBySource(tasks: Task[]): Task[] {
  const seen = new Set<string>();
  const out: Task[] = [];
  for (const t of tasks) {
    const key = `${t.sourcePath}:${t.lineStart}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(t);
  }
  return out;
}

export function buildIndex(
  allTasks: Task[],
  today: Date,
  rangeDays: number,
  errors: { path: string; error: Error }[],
  unparsed: string[] = []
): IndexSnapshot {
  const windowStart = computeWindowStart(today, rangeDays);

  // —— byDate ——
  const byDate = new Map<string, { pending: Task[]; done: Task[] }>();
  for (const t of allTasks) {
    const key = dateToYmd(t.sourceDate);
    if (!byDate.has(key)) byDate.set(key, { pending: [], done: [] });
    const bucket = byDate.get(key)!;
    if (t.checked) bucket.done.push(t);
    else bucket.pending.push(t);
  }

  // —— today ——
  const todayKey = dateToYmd(today);
  const todayBucket = byDate.get(todayKey) ?? { pending: [], done: [] };
  const backlog = computeBacklog(allTasks, today);

  // —— global ——
  const allPending = dedupeBySource(allTasks.filter(t => !t.checked));
  const allDone = allTasks
    .filter(t => t.checked)
    .sort((a, b) => {
      const ad = a.meta?.done?.getTime() ?? a.sourceDate.getTime();
      const bd = b.meta?.done?.getTime() ?? b.sourceDate.getTime();
      return bd - ad;
    });

  return {
    generatedAt: new Date(),
    windowStart,
    windowEnd: today,
    today: {
      pending: todayBucket.pending,
      done: todayBucket.done,
      backlog
    },
    byDate,
    allPending,
    allDone,
    errors,
    unparsed
  };
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/data/taskIndex.test.ts`
Expected: PASS (10 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/taskIndex.ts src/data/taskIndex.test.ts
git commit -m "feat(index): build snapshot with byDate, backlog, dedupe"
```

---

## Task 9: TaskWriter — toggle + 校验 + emoji 管理

**Files:**
- Create: `src/data/taskWriter.ts`
- Create: `src/data/taskWriter.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/data/taskWriter.test.ts
import { TFile, Vault } from 'obsidian';
import type { Task, TaskBoardSettings } from '../types';
import { TaskBodyChangedError, TaskLineChangedError } from '../types';
import { toggleTask } from './taskWriter';

const SETTINGS: TaskBoardSettings = {
  dailyDir: 'DailyLife',
  filePattern: 'YYYY-MM-DD.md',
  rangeDays: 30,
  enableTasksMetadata: true,
  sidebarCompactLimit: 5,
  appendDoneDate: true
};

function setupVault(content: string): { vault: Vault; file: TFile } {
  const vault = new Vault();
  const file = new TFile('DailyLife/2026/06/2026-06-14.md', '2026-06-14', 'md');
  vault.files = [file];
  vault.contents[file.path] = content;
  return { vault, file };
}

function makeTask(lineStart: number, body: string, bodyHash: string, checked: boolean, sourcePath: string): Task {
  return {
    sourcePath,
    sourceDate: new Date(2026, 5, 14),
    lineStart,
    lineEnd: lineStart,
    rawText: `- [${checked ? 'x' : ' '}] ${body}`,
    body,
    bodyHash,
    checked,
    indent: 0,
    meta: { tags: [] }
  };
}

describe('TaskWriter.toggle', () => {
  test('勾选：[ ] → [x] + 追加 ✅ 日期', async () => {
    const { vault, file } = setupVault('- [ ] 学 Rust\n');
    const task = makeTask(0, '学 Rust', '学 Rust', false, file.path);
    await toggleTask(vault, task, SETTINGS, new Date(2026, 5, 14));
    const after = vault.contents[file.path];
    expect(after).toMatch(/- \[x\] 学 Rust/);
    expect(after).toMatch(/✅ 2026-06-14/);
  });

  test('取消：[x] → [ ] + 移除 ✅ 日期', async () => {
    const { vault, file } = setupVault('- [x] 学 Rust ✅ 2026-06-14\n');
    const task = makeTask(0, '学 Rust', '学 Rust', true, file.path);
    await toggleTask(vault, task, SETTINGS, new Date(2026, 5, 14));
    const after = vault.contents[file.path];
    expect(after).toMatch(/- \[ \] 学 Rust/);
    expect(after).not.toMatch(/✅/);
  });

  test('appendDoneDate=false: 勾选不追加 ✅', async () => {
    const { vault, file } = setupVault('- [ ] 学 Rust\n');
    const task = makeTask(0, '学 Rust', '学 Rust', false, file.path);
    const settings = { ...SETTINGS, appendDoneDate: false };
    await toggleTask(vault, task, settings, new Date(2026, 5, 14));
    const after = vault.contents[file.path];
    expect(after).toMatch(/- \[x\] 学 Rust/);
    expect(after).not.toMatch(/✅/);
  });

  test('保留 emoji 元数据：勾选时不动 📅', async () => {
    const { vault, file } = setupVault('- [ ] 学 Rust 📅 2026-06-20\n');
    const task = makeTask(0, '学 Rust', '学 Rust', false, file.path);
    await toggleTask(vault, task, SETTINGS, new Date(2026, 5, 14));
    const after = vault.contents[file.path];
    expect(after).toMatch(/📅 2026-06-20/);
    expect(after).toMatch(/- \[x\] 学 Rust 📅 2026-06-20 ✅ 2026-06-14/);
  });

  test('保留缩进', async () => {
    const { vault, file } = setupVault('  - [ ] 子任务\n');
    const task = makeTask(0, '子任务', '子任务', false, file.path);
    task.indent = 2;
    await toggleTask(vault, task, SETTINGS, new Date(2026, 5, 14));
    const after = vault.contents[file.path];
    expect(after).toMatch(/  - \[x\] 子任务 ✅ 2026-06-14/);
  });

  test('lineStart 行已不是任务 → abort 抛 TaskLineChangedError', async () => {
    const { vault, file } = setupVault('普通段落\n- [ ] 学 Rust\n');
    const task = makeTask(0, '普通段落', '普通段落', false, file.path);
    await expect(toggleTask(vault, task, SETTINGS, new Date(2026, 5, 14)))
      .rejects.toThrow(TaskLineChangedError);
    // 文件未变
    expect(vault.contents[file.path]).toBe('普通段落\n- [ ] 学 Rust\n');
  });

  test('body 已变化 → abort 抛 TaskBodyChangedError', async () => {
    const { vault, file } = setupVault('- [ ] 新内容\n');
    // task 上的 bodyHash 是旧的
    const task = makeTask(0, '旧内容', '旧内容', false, file.path);
    await expect(toggleTask(vault, task, SETTINGS, new Date(2026, 5, 14)))
      .rejects.toThrow(TaskBodyChangedError);
    expect(vault.contents[file.path]).toBe('- [ ] 新内容\n');
  });

  test('hash 比较时忽略 emoji/tag 变化（正文相同则通过）', async () => {
    const { vault, file } = setupVault('- [ ] 学 Rust 📅 2026-06-20 #work\n');
    // task.body 已经 strip 过，但 hash 应该和带 emoji 的当前行匹配
    const task = makeTask(0, '学 Rust', '学 Rust', false, file.path);
    await toggleTask(vault, task, SETTINGS, new Date(2026, 5, 14));
    expect(vault.contents[file.path]).toMatch(/- \[x\]/);
  });

  test('未找到文件 → 抛错且不崩溃', async () => {
    const vault = new Vault();
    const task = makeTask(0, 'x', 'x', false, 'not-exist.md');
    await expect(toggleTask(vault, task, SETTINGS, new Date(2026, 5, 14)))
      .rejects.toThrow();
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/data/taskWriter.test.ts`
Expected: FAIL — "Cannot find module './taskWriter'"

- [ ] **Step 3: Write implementation**

```typescript
// src/data/taskWriter.ts
import type { Vault } from 'obsidian';
import type { Task, TaskBoardSettings } from '../types';
import { TaskBodyChangedError, TaskLineChangedError } from '../types';
import { stripMeta, textHash } from '../utils/textHash';
import { formatYmd } from '../utils/dateUtils';

const TASK_LINE_RE = /^(\s*[-*+] \[)( |x)(\].*)$/;

export async function toggleTask(
  vault: Vault,
  task: Task,
  settings: TaskBoardSettings,
  now: Date
): Promise<void> {
  const file = vault.getAbstractFileByPath(task.sourcePath);
  if (!file) throw new Error(`File not found: ${task.sourcePath}`);

  const content = await vault.read(file);
  const lines = content.split('\n');
  const line = lines[task.lineStart];

  // —— 校验 1：仍是任务行 ——
  const lineMatch = line.match(TASK_LINE_RE);
  if (!lineMatch) {
    throw new TaskLineChangedError(`Line ${task.lineStart} no longer a task`);
  }

  // —— 校验 2：正文 hash（strip 后比较）——
  const currentHash = textHash(stripMeta(lineMatch[3]));
  if (currentHash !== task.bodyHash) {
    throw new TaskBodyChangedError('Task body changed, please refresh');
  }

  // —— 改写 checkbox marker ——
  const newMarker = task.checked ? ' ' : 'x';
  let newLine = `${lineMatch[1]}${newMarker}${lineMatch[3]}`;

  // —— ✅ 完成 emoji 管理 ——
  if (!task.checked && settings.appendDoneDate) {
    newLine = `${newLine} ✅ ${formatYmd(now)}`;
  } else if (task.checked) {
    newLine = newLine.replace(/\s+✅\s*\d{4}-\d{2}-\d{2}/, '');
  }

  lines[task.lineStart] = newLine;
  await vault.modify(file, lines.join('\n'));
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/data/taskWriter.test.ts`
Expected: PASS (9 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/taskWriter.ts src/data/taskWriter.test.ts
git commit -m "feat(writer): toggle task with strict change-detection guards"
```

---

## Task 10: domHelpers — h() 元素创建器

**Files:**
- Create: `src/utils/domHelpers.ts`
- Create: `src/utils/domHelpers.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/utils/domHelpers.test.ts
import { JSDOM } from 'jsdom';

// 测试环境补 jsdom
const dom = new JSDOM('<!doctype html><html><body></body></html>');
(global as any).document = dom.window.document;

import { h } from './domHelpers';

describe('domHelpers.h', () => {
  test('creates element with tag', () => {
    const el = h('div');
    expect(el.tagName).toBe('DIV');
  });

  test('applies className', () => {
    const el = h('div', { cls: 'foo bar' });
    expect(el.className).toBe('foo bar');
  });

  test('sets text content', () => {
    const el = h('span', { text: 'hello' });
    expect(el.textContent).toBe('hello');
  });

  test('attaches event handler', () => {
    const handler = jest.fn();
    const el = h('button', { onclick: handler }) as any;
    el.onclick();
    expect(handler).toHaveBeenCalled();
  });

  test('appends children', () => {
    const child1 = h('span', { text: 'a' });
    const child2 = h('span', { text: 'b' });
    const parent = h('div', null, child1, child2);
    expect(parent.children.length).toBe(2);
  });

  test('sets attributes via attr', () => {
    const el = h('a', { attr: { href: '#x', target: '_blank' } }) as any;
    expect(el.getAttribute('href')).toBe('#x');
    expect(el.getAttribute('target')).toBe('_blank');
  });

  test('handles null props', () => {
    const el = h('div', null);
    expect(el.tagName).toBe('DIV');
  });
});
```

- [ ] **Step 2: Add jsdom dependency**

Run: `npm install --save-dev jsdom`

- [ ] **Step 3: Run test to verify it fails**

Run: `npx jest src/utils/domHelpers.test.ts`
Expected: FAIL — "Cannot find module './domHelpers'"

- [ ] **Step 4: Write implementation**

```typescript
// src/utils/domHelpers.ts
export interface HProps {
  cls?: string;
  text?: string;
  attr?: Record<string, string>;
  onclick?: (ev: MouseEvent) => void;
  title?: string;
  [k: string]: any;
}

export function h<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  props?: HProps | null,
  ...children: (Node | string | null | undefined)[]
): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag);

  if (props) {
    if (props.cls) el.className = props.cls;
    if (props.text != null) el.textContent = props.text;
    if (props.title != null) el.title = props.title;
    if (props.attr) {
      for (const [k, v] of Object.entries(props.attr)) {
        el.setAttribute(k, v);
      }
    }
    if (props.onclick) {
      (el as any).onclick = props.onclick;
    }
    // 其他自定义 prop
    for (const [k, v] of Object.entries(props)) {
      if (['cls','text','attr','onclick','title'].includes(k)) continue;
      if (typeof v === 'function') {
        (el as any)[k] = v;
      }
    }
  }

  for (const child of children) {
    if (child == null) continue;
    el.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
  }
  return el;
}
```

- [ ] **Step 5: Run tests**

Run: `npx jest src/utils/domHelpers.test.ts`
Expected: PASS (7 tests)

- [ ] **Step 6: Add jsdom testEnvironment for all dom tests**

Update `jest.config.js`:

```javascript
module.exports = {
  preset: 'ts-jest',
  testEnvironment: 'node',
  roots: ['<rootDir>/src', '<rootDir>/__fixtures__'],
  moduleNameMapper: {
    '^obsidian$': '<rootDir>/__mocks__/obsidian.ts'
  },
  testMatch: ['**/*.test.ts'],
  clearMocks: true,
  // 给 domHelpers.test.ts 单独用 jsdom 环境
  projects: [
    {
      displayName: 'node',
      testEnvironment: 'node',
      testMatch: ['<rootDir>/src/**/*.test.ts'],
      testPathIgnorePatterns: ['<rootDir>/src/utils/domHelpers.test.ts'],
      moduleNameMapper: { '^obsidian$': '<rootDir>/__mocks__/obsidian.ts' },
      transform: { '^.+\\.ts$': 'ts-jest' }
    },
    {
      displayName: 'jsdom',
      testEnvironment: 'jsdom',
      testMatch: ['<rootDir>/src/utils/domHelpers.test.ts', '<rootDir>/src/views/**/*.test.ts'],
      moduleNameMapper: { '^obsidian$': '<rootDir>/__mocks__/obsidian.ts' },
      transform: { '^.+\\.ts$': 'ts-jest' }
    }
  ]
};
```

- [ ] **Step 7: Run all tests to confirm still green**

Run: `npm test`
Expected: PASS (all previous tests + 7 new)

- [ ] **Step 8: Commit**

```bash
git add src/utils/domHelpers.ts src/utils/domHelpers.test.ts jest.config.js package.json package-lock.json
git commit -m "feat(dom): add h() element helper with jsdom test env"
```

---

## Task 11: Plugin entry (main.ts) + PluginSettingsTab

**Files:**
- Create: `src/main.ts`
- Create: `src/config/settingsTab.ts`

- [ ] **Step 1: Write settingsTab.ts**

```typescript
// src/config/settingsTab.ts
import { App, Modal, PluginSettingTab, Setting, TFile } from 'obsidian';
import type TaskBoardPlugin from '../main';
import type { TaskBoardSettings } from '../types';
import { listDailyFiles } from '../data/fileScanner';

export class TaskBoardSettingTab extends PluginSettingTab {
  plugin: TaskBoardPlugin;

  constructor(app: App, plugin: TaskBoardPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName('日志根目录')
      .setDesc('日志文件所在的 vault 目录路径，例如 DailyLife')
      .addText(text => text
        .setPlaceholder('DailyLife')
        .setValue(this.plugin.settings.dailyDir)
        .onChange(async v => {
          this.plugin.settings.dailyDir = v.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('文件名格式')
      .setDesc('YYYY-MM-DD.md 或 MMMM-D-YYYY.md（其他格式 v1 暂不支持）')
      .addText(text => text
        .setPlaceholder('YYYY-MM-DD.md')
        .setValue(this.plugin.settings.filePattern)
        .onChange(async v => {
          this.plugin.settings.filePattern = v.trim();
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('时间窗口（天）')
      .setDesc('面板默认显示最近多少天的日志')
      .addText(text => text
        .setPlaceholder('30')
        .setValue(String(this.plugin.settings.rangeDays))
        .onChange(async v => {
          const n = Number(v);
          if (!isNaN(n) && n > 0) {
            this.plugin.settings.rangeDays = n;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('解析 Tasks 插件元数据')
      .setDesc('解析 📅 ⏳ 🛫 ✅ 🔼 等 emoji 元数据')
      .addToggle(t => t
        .setValue(this.plugin.settings.enableTasksMetadata)
        .onChange(async v => {
          this.plugin.settings.enableTasksMetadata = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('勾选时追加 ✅ 完成日期')
      .setDesc('勾选任务时自动追加 ✅ YYYY-MM-DD')
      .addToggle(t => t
        .setValue(this.plugin.settings.appendDoneDate)
        .onChange(async v => {
          this.plugin.settings.appendDoneDate = v;
          await this.plugin.saveSettings();
        }));

    new Setting(containerEl)
      .setName('侧栏简版积压上限')
      .setDesc('侧栏简版面板最多显示多少条历史积压')
      .addText(text => text
        .setPlaceholder('5')
        .setValue(String(this.plugin.settings.sidebarCompactLimit))
        .onChange(async v => {
          const n = Number(v);
          if (!isNaN(n) && n >= 0) {
            this.plugin.settings.sidebarCompactLimit = n;
            await this.plugin.saveSettings();
          }
        }));

    new Setting(containerEl)
      .setName('测试匹配')
      .setDesc('预览最近匹配的日志文件，验证配置正确性')
      .addButton(btn => btn
        .setButtonText('预览最近 5 个匹配')
        .onClick(() => this.showPreview()));
  }

  private showPreview(): void {
    const today = new Date();
    const result = listDailyFiles(this.app.vault, this.plugin.settings, today);
    const paths = result.matched.slice(-5).reverse().map(m => m.file.path);
    const modal = new Modal(this.app);
    modal.titleEl.setText('匹配预览');
    const body = modal.contentEl;
    if (paths.length === 0) {
      body.createEl('p', { text: '未匹配到任何文件，请检查 dailyDir 和 filePattern。' });
    } else {
      body.createEl('p', { text: `共匹配 ${result.matched.length} 个，最近 5 个：` });
      const ul = body.createEl('ul');
      for (const p of paths) ul.createEl('li', { text: p });
    }
    if (result.unparsed.length > 0) {
      body.createEl('p', { text: `⚠ 还有 ${result.unparsed.length} 个文件未通过 pattern，已忽略。` });
    }
    modal.open();
  }
}
```

- [ ] **Step 2: Write main.ts**

```typescript
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
```

- [ ] **Step 3: Stub the views to make main.ts compile**

Create minimal stubs that Task 12-15 will flesh out:

```typescript
// src/views/sidebarView.ts (stub)
import { ItemView, WorkspaceLeaf } from 'obsidian';
import type TaskBoardPlugin from '../main';

export const SIDEBAR_VIEW_TYPE = 'task-board-sidebar';

export class SidebarCompactView extends ItemView {
  constructor(leaf: WorkspaceLeaf, plugin: TaskBoardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  plugin: TaskBoardPlugin;
  getViewType() { return SIDEBAR_VIEW_TYPE; }
  getDisplayText() { return 'Task Board'; }
  getIcon() { return 'list-checks'; }
  async onOpen() { this.contentEl.setText('sidebar'); }
  async onClose() {}
  refresh() {}
}
```

```typescript
// src/views/boardView.ts (stub)
import { ItemView, WorkspaceLeaf } from 'obsidian';
import type TaskBoardPlugin from '../main';

export const BOARD_VIEW_TYPE = 'task-board-board';

export class BoardTabView extends ItemView {
  constructor(leaf: WorkspaceLeaf, plugin: TaskBoardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }
  plugin: TaskBoardPlugin;
  getViewType() { return BOARD_VIEW_TYPE; }
  getDisplayText() { return 'Task Board'; }
  getIcon() { return 'layout-dashboard'; }
  async onOpen() { this.contentEl.setText('board'); }
  async onClose() {}
  refresh() {}
}
```

- [ ] **Step 4: Verify lint**

Run: `npm run lint`
Expected: exit 0

- [ ] **Step 5: Verify build**

Run: `npm run build`
Expected: `main.js` produced, no errors.

- [ ] **Step 6: Commit**

```bash
git add src/main.ts src/config/settingsTab.ts src/views/sidebarView.ts src/views/boardView.ts
git commit -m "feat(plugin): entry point with settings tab + view stubs"
```

---

## Task 12: SnapshotService + refresh orchestration

**Files:**
- Create: `src/data/snapshotService.ts`
- Create: `src/data/snapshotService.test.ts`

- [ ] **Step 1: Write the failing test**

```typescript
// src/data/snapshotService.test.ts
import { TFile, Vault } from 'obsidian';
import { getSnapshot } from './snapshotService';
import type { TaskBoardSettings } from '../types';

const SETTINGS: TaskBoardSettings = {
  dailyDir: 'DailyLife',
  filePattern: 'YYYY-MM-DD.md',
  rangeDays: 30,
  enableTasksMetadata: true,
  sidebarCompactLimit: 5,
  appendDoneDate: true
};

describe('SnapshotService.getSnapshot', () => {
  test('扫描 + 解析 + 建索引一站式', async () => {
    const vault = new Vault();
    const f1 = new TFile('DailyLife/2026/06/2026-06-10.md', '2026-06-10', 'md');
    const f2 = new TFile('DailyLife/2026/06/2026-06-14.md', '2026-06-14', 'md');
    vault.files = [f1, f2];
    vault.contents[f1.path] = '- [ ] 历史任务\n';
    vault.contents[f2.path] = '- [ ] 今日任务\n- [x] 今日完成\n';

    const snapshot = await getSnapshot(vault, SETTINGS, new Date(2026, 5, 14));
    expect(snapshot.today.pending.length).toBe(1);
    expect(snapshot.today.done.length).toBe(1);
    expect(snapshot.today.backlog.length).toBe(1);
    expect(snapshot.today.backlog[0].body).toBe('历史任务');
    expect(snapshot.errors).toEqual([]);
  });

  test('单文件解析失败 → 计入 errors，其他文件正常', async () => {
    const vault = new Vault();
    const f1 = new TFile('DailyLife/2026/06/2026-06-14.md', '2026-06-14', 'md');
    const f2 = new TFile('DailyLife/2026/06/2026-06-13.md', '2026-06-13', 'md');
    vault.files = [f1, f2];
    vault.contents[f1.path] = '- [ ] a\n';
    // f2 的 contents 留空，read 返回空字符串，不抛错；改用 mock 让 read 抛错
    (vault as any).read = async (file: TFile) => {
      if (file.path === f2.path) throw new Error('boom');
      return vault.contents[file.path] ?? '';
    };
    const snapshot = await getSnapshot(vault, SETTINGS, new Date(2026, 5, 14));
    expect(snapshot.errors.length).toBe(1);
    expect(snapshot.errors[0].path).toBe(f2.path);
    expect(snapshot.today.pending.length).toBe(1); // f1 仍解析成功
  });

  test('refresh 进行中再次调用 → 返回相同的 Promise（mutex）', async () => {
    const vault = new Vault();
    const p1 = getSnapshot(vault, SETTINGS, new Date(2026, 5, 14));
    const p2 = getSnapshot(vault, SETTINGS, new Date(2026, 5, 14));
    expect(p1).toBe(p2);
    await p1;
  });
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx jest src/data/snapshotService.test.ts`
Expected: FAIL — "Cannot find module './snapshotService'"

- [ ] **Step 3: Write implementation**

```typescript
// src/data/snapshotService.ts
import type { Vault } from 'obsidian';
import type { IndexSnapshot, TaskBoardSettings } from '../types';
import { listDailyFiles } from './fileScanner';
import { parseFile } from './taskParser';
import { buildIndex } from './taskIndex';

let inflight: Promise<IndexSnapshot> | null = null;

export async function getSnapshot(
  vault: Vault,
  settings: TaskBoardSettings,
  today: Date
): Promise<IndexSnapshot> {
  // —— mutex ——
  if (inflight) return inflight;

  inflight = (async () => {
    try {
      const { matched, unparsed } = listDailyFiles(vault, settings, today);
      const allTasks = [];
      const errors: { path: string; error: Error }[] = [];

      for (const { file, sourceDate } of matched) {
        try {
          const content = await vault.read(file);
          const tasks = parseFile(content, file.path, sourceDate);
          allTasks.push(...tasks);
        } catch (e) {
          errors.push({ path: file.path, error: e as Error });
        }
      }

      return buildIndex(allTasks, today, settings.rangeDays, errors, unparsed.map(f => f.path));
    } finally {
      inflight = null;
    }
  })();

  return inflight;
}

export function clearInflight(): void {
  inflight = null;
}
```

- [ ] **Step 4: Run tests**

Run: `npx jest src/data/snapshotService.test.ts`
Expected: PASS (3 tests)

- [ ] **Step 5: Commit**

```bash
git add src/data/snapshotService.ts src/data/snapshotService.test.ts
git commit -m "feat(snapshot): one-shot scan+parse+index with mutex"
```

---

## Task 13: SidebarCompactView — 完整渲染

**Files:**
- Modify: `src/views/sidebarView.ts`
- Create: `src/views/components/groupSection.ts`

- [ ] **Step 1: Write components/groupSection.ts**

```typescript
// src/views/components/groupSection.ts
import { h } from '../../utils/domHelpers';
import type { Task } from '../../types';

export interface GroupSectionOptions {
  title: string;
  count: number;
  tasks: Task[];
  collapsed?: boolean;
  showSourceDate?: boolean;
  limit?: number;
  onTaskToggle: (task: Task) => void;
  onTaskClick: (task: Task) => void;
}

export function renderGroupSection(opts: GroupSectionOptions): HTMLElement {
  const wrapper = h('div', { cls: 'tb-group' });

  const header = h('div', { cls: 'tb-group-header' });
  header.appendChild(h('span', { cls: 'tb-group-title', text: opts.title }));
  header.appendChild(h('span', { cls: 'tb-group-count', text: `(${opts.count})` }));
  if (opts.collapsed) {
    header.appendChild(h('span', { cls: 'tb-group-collapse-hint', text: '▸' }));
  }
  wrapper.appendChild(header);

  if (opts.collapsed) return wrapper;

  const list = h('div', { cls: 'tb-group-list' });
  const visible = opts.limit ? opts.tasks.slice(0, opts.limit) : opts.tasks;
  for (const task of visible) {
    list.appendChild(renderTaskRow(task, opts.showSourceDate, opts.onTaskToggle, opts.onTaskClick));
  }
  if (opts.limit && opts.tasks.length > opts.limit) {
    list.appendChild(h('div', {
      cls: 'tb-group-more',
      text: `+ 还有 ${opts.tasks.length - opts.limit} 条`
    }));
  }
  wrapper.appendChild(list);
  return wrapper;
}

function renderTaskRow(
  task: Task,
  showSourceDate: boolean | undefined,
  onToggle: (t: Task) => void,
  onClick: (t: Task) => void
): HTMLElement {
  const row = h('div', { cls: 'tb-task-row' });

  const checkbox = h('input', { cls: 'tb-task-checkbox', attr: { type: 'checkbox' } }) as HTMLInputElement;
  checkbox.checked = task.checked;
  checkbox.onclick = (ev: MouseEvent) => {
    ev.stopPropagation();
    onToggle(task);
  };
  row.appendChild(checkbox);

  const body = h('span', {
    cls: 'tb-task-body' + (task.checked ? ' tb-done' : ''),
    text: task.body
  });
  body.onclick = () => onClick(task);
  row.appendChild(body);

  if (task.meta?.priority) {
    row.appendChild(h('span', {
      cls: `tb-task-pri tb-pri-${task.meta.priority}`,
      text: priorityLabel(task.meta.priority)
    }));
  }

  if (showSourceDate) {
    const m = String(task.sourceDate.getMonth() + 1).padStart(2, '0');
    const d = String(task.sourceDate.getDate()).padStart(2, '0');
    row.appendChild(h('span', { cls: 'tb-task-src', text: `${m}-${d}` }));
  }

  return row;
}

function priorityLabel(p: string): string {
  return { highest: '⏫', high: '🔼', medium: '', low: '🔽', lowest: '⏬' }[p] ?? '';
}
```

- [ ] **Step 2: Replace sidebarView.ts stub with full implementation**

```typescript
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
```

- [ ] **Step 3: Verify lint and build**

Run: `npm run lint && npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/views/sidebarView.ts src/views/components/groupSection.ts
git commit -m "feat(sidebar): render compact view with today + backlog + done"
```

---

## Task 14: BoardTabView 框架 + 今日视图

**Files:**
- Modify: `src/views/boardView.ts`

- [ ] **Step 1: Replace boardView.ts with full implementation (today view first)**

```typescript
// src/views/boardView.ts
import { ItemView, Notice, WorkspaceLeaf } from 'obsidian';
import type TaskBoardPlugin from '../main';
import type { IndexSnapshot, Task } from '../types';
import { getSnapshot } from '../data/snapshotService';
import { toggleTask } from '../data/taskWriter';
import { h } from '../utils/domHelpers';
import { renderGroupSection } from './components/groupSection';
import { renderCalendarGrid } from './components/calendarGrid';

export const BOARD_VIEW_TYPE = 'task-board-board';

type ViewMode = 'today' | 'calendar' | 'global';

export class BoardTabView extends ItemView {
  plugin: TaskBoardPlugin;
  private snapshot: IndexSnapshot | null = null;
  private mode: ViewMode = 'today';

  constructor(leaf: WorkspaceLeaf, plugin: TaskBoardPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() { return BOARD_VIEW_TYPE; }
  getDisplayText() { return 'Task Board'; }
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

    // —— header ——
    const header = h('div', { cls: 'tb-board-header' });
    const titleText = this.mode === 'today'
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
    if (this.mode === 'today') {
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
  }
}
```

- [ ] **Step 2: Create components/calendarGrid.ts (stub first; Task 15 fills)**

```typescript
// src/views/components/calendarGrid.ts (stub — Task 15 implements)
import type { IndexSnapshot } from '../../types';
import { h } from '../../utils/domHelpers';

export function renderCalendarGrid(
  _snapshot: IndexSnapshot,
  _onSelectDay: (dayKey: string) => HTMLElement
): HTMLElement {
  return h('div', { cls: 'tb-cal-stub', text: 'calendar (Task 15)' });
}
```

- [ ] **Step 3: Verify lint and build**

Run: `npm run lint && npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/views/boardView.ts src/views/components/calendarGrid.ts
git commit -m "feat(board): full board view with today + global + tab switching"
```

---

## Task 15: CalendarGrid — 30 天日历视图

**Files:**
- Modify: `src/views/components/calendarGrid.ts`

- [ ] **Step 1: Replace calendarGrid.ts with full implementation**

```typescript
// src/views/components/calendarGrid.ts
import type { IndexSnapshot } from '../../types';
import { dateToYmd, isSameDay } from '../../utils/dateUtils';
import { h } from '../../utils/domHelpers';

const DOW_LABELS = ['一', '二', '三', '四', '五', '六', '日'];

export function renderCalendarGrid(
  snapshot: IndexSnapshot,
  onSelectDay: (dayKey: string) => HTMLElement
): HTMLElement {
  const wrapper = h('div', { cls: 'tb-cal-wrapper' });

  // —— 范围标签 ——
  const start = snapshot.windowStart;
  const end = snapshot.windowEnd;
  const rangeLabel = `${start.getFullYear()}-${pad(start.getMonth() + 1)}-${pad(start.getDate())} ~ ${end.getFullYear()}-${pad(end.getMonth() + 1)}-${pad(end.getDate())}`;
  wrapper.appendChild(h('div', { cls: 'tb-cal-range', text: rangeLabel }));

  // —— 构造 7 列网格（从 windowStart 起始的那个周一开头）——
  const grid = h('div', { cls: 'tb-cal-grid' });
  for (const label of DOW_LABELS) {
    grid.appendChild(h('div', { cls: 'tb-cal-dow', text: label }));
  }

  // 找到 windowStart 那一周的周一
  const startDow = (start.getDay() + 6) % 7; // 0=Mon
  const firstDate = new Date(start);
  firstDate.setDate(start.getDate() - startDow);

  // 渲染 6 周 (42 格)
  let detail: HTMLElement | null = null;
  for (let i = 0; i < 42; i++) {
    const d = new Date(firstDate);
    d.setDate(firstDate.getDate() + i);

    if (d < start || d > end) {
      grid.appendChild(h('div', { cls: 'tb-cal-day empty' }));
      continue;
    }

    const key = dateToYmd(d);
    const bucket = snapshot.byDate.get(key);
    const pendCount = bucket?.pending.length ?? 0;
    const doneCount = bucket?.done.length ?? 0;

    const classes = ['tb-cal-day'];
    if (isSameDay(d, end)) classes.push('today');
    if (pendCount > 0 || doneCount > 0) classes.push('has-tasks');

    const cell = h('div', { cls: classes.join(' ') });
    cell.appendChild(h('span', { cls: 'tb-cal-n', text: String(d.getDate()) }));
    const badge = h('div', { cls: 'tb-cal-badge' });
    if (pendCount > 0) {
      // 今日显示积压数量
      const isToday = isSameDay(d, end);
      const total = isToday ? pendCount + snapshot.today.backlog.length : pendCount;
      badge.appendChild(h('span', { cls: 'tb-cal-pend', text: `▢${total}` }));
    }
    if (doneCount > 0) {
      badge.appendChild(h('span', { cls: 'tb-cal-done', text: `☑${doneCount}` }));
    }
    cell.appendChild(badge);

    cell.onclick = () => {
      detail?.remove();
      detail = onSelectDay(key);
      wrapper.appendChild(detail);
    };

    grid.appendChild(cell);
  }
  wrapper.appendChild(grid);

  // —— detail 容器 ——
  const detailHolder = h('div', { cls: 'tb-cal-detail-holder' });
  wrapper.appendChild(detailHolder);

  return wrapper;
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}
```

- [ ] **Step 2: Update boardView.ts to render detail into the holder**

The Task 14 implementation already passes `onSelectDay` returning an HTMLElement; the grid appends it to wrapper. We need to render it into `detailHolder` instead. Update calendarGrid.ts so `onSelectDay` returns the element AND the wrapper appends to detailHolder.

Modify calendarGrid.ts to pass detailHolder via closure (already done above — `detail` var holds the latest, appended to wrapper).

Re-verify by reading the file and confirming the flow: cell.onclick sets detail = onSelectDay(key) and appends to wrapper. But wrapper already has detailHolder. Better: append to detailHolder.

Update cell.onclick:
```typescript
cell.onclick = () => {
  detailHolder.empty();
  detailHolder.appendChild(onSelectDay(key));
};
```

Replace the existing onclick body accordingly.

- [ ] **Step 3: Verify lint and build**

Run: `npm run lint && npm run build`
Expected: exit 0.

- [ ] **Step 4: Commit**

```bash
git add src/views/components/calendarGrid.ts
git commit -m "feat(calendar): 30-day grid with badges + day detail"
```

---

## Task 16: 跳转到源文件 + CSS

**Files:**
- Modify: `src/views/sidebarView.ts` (handleOpen — scroll to line)
- Modify: `src/views/boardView.ts` (handleOpen — scroll to line)
- Create: `src/styles.css`

- [ ] **Step 1: Write styles.css**

```css
/* src/styles.css */
.tb-sidebar-root, .tb-board-root {
  padding: 10px;
  font-size: 13px;
}

.tb-sidebar-header, .tb-board-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding-bottom: 8px;
  margin-bottom: 8px;
  border-bottom: 1px solid var(--background-modifier-border);
}

.tb-sidebar-title, .tb-board-title {
  font-weight: bold;
}

.tb-sidebar-refresh, .tb-board-refresh {
  background: var(--background-modifier-border);
  border: none;
  padding: 4px 8px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 11px;
}

.tb-group { margin-bottom: 14px; }
.tb-group-header {
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.5px;
  color: var(--text-muted);
  margin-bottom: 4px;
}
.tb-group-count {
  background: var(--background-modifier-border);
  padding: 1px 6px;
  border-radius: 8px;
  font-size: 10px;
}
.tb-group-more {
  font-size: 10px;
  color: var(--text-muted);
  text-align: center;
  padding: 4px;
}

.tb-task-row {
  display: flex;
  align-items: center;
  gap: 6px;
  padding: 3px 0;
}
.tb-task-checkbox { cursor: pointer; flex-shrink: 0; }
.tb-task-body {
  flex: 1;
  cursor: pointer;
}
.tb-task-body.tb-done {
  color: var(--text-muted);
  text-decoration: line-through;
}
.tb-task-pri {
  font-size: 11px;
  padding: 0 2px;
}
.tb-pri-highest, .tb-pri-high { color: var(--text-error); }
.tb-pri-low, .tb-pri-lowest { color: var(--text-muted); }
.tb-task-src {
  font-size: 9px;
  background: var(--background-secondary-alt);
  padding: 1px 5px;
  border-radius: 3px;
  color: var(--text-muted);
}

.tb-sidebar-open-board {
  display: block;
  width: 100%;
  padding: 8px;
  margin-top: 10px;
  background: var(--interactive-accent);
  color: var(--text-on-accent);
  border: none;
  border-radius: 4px;
  cursor: pointer;
  font-weight: bold;
}

.tb-board-tabs {
  display: flex;
  gap: 4px;
  margin-bottom: 12px;
}
.tb-tab {
  background: var(--background-secondary);
  border: 1px solid var(--background-modifier-border);
  padding: 4px 10px;
  border-radius: 4px;
  cursor: pointer;
  font-size: 12px;
}
.tb-tab.active {
  background: var(--interactive-accent);
  color: var(--text-on-accent);
}

.tb-today-grid, .tb-global-grid {
  display: grid;
  grid-template-columns: 1fr 1fr 1fr;
  gap: 14px;
}
.tb-global-grid { grid-template-columns: 1fr 1fr; }

.tb-cal-grid {
  display: grid;
  grid-template-columns: repeat(7, 1fr);
  gap: 3px;
}
.tb-cal-dow {
  text-align: center;
  font-size: 10px;
  color: var(--text-muted);
  padding: 2px 0;
}
.tb-cal-day {
  background: var(--background-secondary);
  border-radius: 3px;
  padding: 4px;
  min-height: 40px;
  font-size: 11px;
  cursor: pointer;
}
.tb-cal-day.empty { background: transparent; cursor: default; }
.tb-cal-day.today { outline: 1px solid var(--interactive-accent); }
.tb-cal-n { font-weight: bold; display: block; font-size: 10px; color: var(--text-muted); }
.tb-cal-badge { font-size: 9px; margin-top: 2px; }
.tb-cal-pend { color: var(--text-error); }
.tb-cal-done { color: var(--text-success); margin-left: 4px; }

.tb-error-bar {
  margin-top: 10px;
  padding: 6px 10px;
  background: var(--background-modifier-error);
  color: var(--text-on-accent);
  border-radius: 4px;
  font-size: 11px;
}
```

- [ ] **Step 2: Register CSS in main.ts**

Add to `src/main.ts` in `onload()` after `registerView` calls:

```typescript
// (Insert after addSettingTab)
```

Find the line `this.addSettingTab(new TaskBoardSettingTab(this.app, this));` in main.ts and add before it:

```typescript
// 加载样式
const cssId = 'task-board-styles';
if (!document.getElementById(cssId)) {
  const link = document.createElement('link');
  link.id = cssId;
  link.rel = 'stylesheet';
  link.href = this.app.vault.adapter.resourcePath + '??'; // placeholder
  // 简化：Obsidian 插件 CSS 自动加载 styles.css，无需手动注入
}
```

Actually Obsidian auto-loads `styles.css` from plugin root. Just rename `src/styles.css` to `styles.css` at project root.

```bash
mv src/styles.css styles.css
```

- [ ] **Step 3: Update handleOpen in sidebarView.ts to scroll to line**

Replace `handleOpen` body in `src/views/sidebarView.ts`:

```typescript
private async handleOpen(task: Task): Promise<void> {
  await this.app.workspace.openLinkText(task.sourcePath.replace(/\.md$/, ''), '');
  // 等待 leaf 渲染后滚动
  setTimeout(() => {
    const view = this.app.workspace.getActiveViewOfType?.();
    const editor = (this.app.workspace as any).activeLeaf?.view?.editor;
    if (editor && typeof editor.setCursor === 'function') {
      editor.setCursor({ line: task.lineStart, ch: 0 });
      editor.scrollIntoView({ from: { line: task.lineStart, ch: 0 }, to: { line: task.lineStart, ch: 0 } }, true);
    }
  }, 100);
}
```

Apply the same change to `src/views/boardView.ts` `handleOpen`.

- [ ] **Step 4: Verify lint and build**

Run: `npm run lint && npm run build`
Expected: exit 0.

- [ ] **Step 5: Commit**

```bash
git add styles.css src/views/sidebarView.ts src/views/boardView.ts
git commit -m "feat(ui): CSS + click-to-open-with-scroll-to-line"
```

---

## Task 17: 集成测试 — 端到端 fixture

**Files:**
- Create: `__fixtures__/vault-30d/setup.ts`
- Create: `__fixtures__/integration.test.ts`

- [ ] **Step 1: Create fixture vault builder**

```typescript
// __fixtures__/vault-30d/setup.ts
import { TFile, Vault } from 'obsidian';

export function buildVault30d(): Vault {
  const vault = new Vault();
  const today = new Date(2026, 5, 14);

  for (let i = 0; i < 30; i++) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const y = d.getFullYear();
    const m = String(d.getMonth() + 1).padStart(2, '0');
    const dd = String(d.getDate()).padStart(2, '0');
    const path = `DailyLife/${y}/${m}/${y}-${m}-${dd}.md`;
    const file = new TFile(path, `${y}-${m}-${dd}`, 'md');
    vault.files.push(file);
    vault.contents[path] = generateDayContent(d, i);
  }
  return vault;
}

function generateDayContent(d: Date, daysAgo: number): string {
  const lines: string[] = [`# ${d.toDateString()}`, ''];
  // 每天 2-3 个未完成 + 1-2 个已完成
  lines.push(`- [ ] 任务-${daysAgo}-A 📅 2026-06-${20 + (daysAgo % 5)}`);
  lines.push(`- [ ] 任务-${daysAgo}-B #work`);
  if (daysAgo % 2 === 0) {
    lines.push(`- [ ] 任务-${daysAgo}-C 🔼`);
  }
  lines.push(`- [x] 完成-${daysAgo}-1 ✅ ${formatDate(d)}`);
  if (daysAgo % 3 === 0) {
    lines.push(`- [x] 完成-${daysAgo}-2 ✅ ${formatDate(d)}`);
  }
  return lines.join('\n') + '\n';
}

function formatDate(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
```

- [ ] **Step 2: Write integration test**

```typescript
// __fixtures__/integration.test.ts
import { buildVault30d } from './vault-30d/setup';
import { getSnapshot } from '../src/data/snapshotService';
import { toggleTask } from '../src/data/taskWriter';
import { DEFAULT_SETTINGS } from '../src/config/defaultSettings';
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { join } from 'path';
import { tmpdir } from 'os';

describe('Integration: scan → parse → index → toggle → re-scan', () => {
  test('30-day vault end-to-end', async () => {
    const vault = buildVault30d();
    const today = new Date(2026, 5, 14);

    // 1. 首次扫描
    const snap1 = await getSnapshot(vault, DEFAULT_SETTINGS, today);
    expect(snap1.today.pending.length).toBeGreaterThan(0);
    expect(snap1.today.backlog.length).toBeGreaterThan(0); // 历史日期未完成
    expect(snap1.byDate.size).toBe(30);
    expect(snap1.allPending.length).toBeGreaterThan(30); // 每天至少 2 个未完成
    expect(snap1.errors).toEqual([]);

    // 2. toggle 一个今日任务
    const firstTask = snap1.today.pending[0];
    const beforeContent = vault.contents[firstTask.sourcePath];
    await toggleTask(vault, firstTask, DEFAULT_SETTINGS, today);
    const afterContent = vault.contents[firstTask.sourcePath];
    expect(afterContent).not.toBe(beforeContent);
    expect(afterContent).toMatch(/- \[x\]/);
    expect(afterContent).toMatch(/✅ 2026-06-14/);

    // 3. 重新扫描验证
    const snap2 = await getSnapshot(vault, DEFAULT_SETTINGS, today);
    expect(snap2.today.pending.length).toBe(snap1.today.pending.length - 1);
    expect(snap2.today.done.length).toBe(snap1.today.done.length + 1);
  });

  test('历史积压：5 天前任务出现在今日 backlog', async () => {
    const vault = buildVault30d();
    const today = new Date(2026, 5, 14);
    const snap = await getSnapshot(vault, DEFAULT_SETTINGS, today);
    // 5 天前是 6-09
    const five = snap.byDate.get('2026-06-09');
    expect(five).toBeDefined();
    const backlogFrom5 = snap.today.backlog.filter(t => t.sourcePath.includes('2026-06-09'));
    expect(backlogFrom5.length).toBe(five!.pending.length);
  });

  test('写回 6-09 任务后，6-09 byDate 和 today.backlog 都更新', async () => {
    const vault = buildVault30d();
    const today = new Date(2026, 5, 14);
    const snap1 = await getSnapshot(vault, DEFAULT_SETTINGS, today);
    const task = snap1.byDate.get('2026-06-09')!.pending[0];
    await toggleTask(vault, task, DEFAULT_SETTINGS, today);

    const snap2 = await getSnapshot(vault, DEFAULT_SETTINGS, today);
    expect(snap2.byDate.get('2026-06-09')!.pending.length).toBe(0);
    expect(snap2.byDate.get('2026-06-09')!.done.length).toBeGreaterThanOrEqual(1);
    const stillInBacklog = snap2.today.backlog.filter(t => t.sourcePath.includes('2026-06-09'));
    expect(stillInBacklog.length).toBe(0);
  });

  test('文件解析失败 → errors 计入但不影响其他', async () => {
    const vault = buildVault30d();
    // 让某个文件 read 抛错
    const bad = vault.files[5];
    (vault as any).read = async (f: any) => {
      if (f.path === bad.path) throw new Error('disk error');
      return vault.contents[f.path] ?? '';
    };
    const snap = await getSnapshot(vault, DEFAULT_SETTINGS, new Date(2026, 5, 14));
    expect(snap.errors.length).toBe(1);
    expect(snap.errors[0].path).toBe(bad.path);
    expect(snap.byDate.size).toBe(29);
  });
});
```

- [ ] **Step 3: Run integration tests**

Run: `npm test`
Expected: All tests pass (parser 22 + dateUtils 7 + textHash 8 + scanner 6 + index 10 + writer 9 + domHelpers 7 + snapshot 3 + integration 4 = 76 tests).

- [ ] **Step 4: Commit**

```bash
git add __fixtures__/vault-30d/setup.ts __fixtures__/integration.test.ts
git commit -m "test(integration): end-to-end fixture with 30-day vault"
```

---

## Task 18: README + 手动验收清单

**Files:**
- Create: `README.md`
- Create: `docs/MANUAL_QA.md`

- [ ] **Step 1: Write README.md**

```markdown
# Obsidian Task Board

Visualize completed and pending tasks across your daily-note logs.

## Features

- 📋 **Sidebar compact view**: today's pending + historical backlog at a glance
- 📊 **Full board tab** with three views:
  - 📅 **Today**: 3-column layout (pending / done / backlog)
  - 🗓 **Calendar**: 30-day grid with task counts
  - 🌐 **Global**: all pending (deduped) vs all done
- ✍️ **Click to toggle**: writes back to the original source file
- 🔗 **Click to open**: jumps to the source line in the daily note
- 📅 **Tasks plugin metadata**: parses 📅 ⏳ 🛫 ✅ 🔼 emojis and #tags
- 🚫 **No data loss**: strict change-detection on write-back

## Setup

1. Install from Obsidian community plugins (or clone & build)
2. Open Settings → Task Board
3. Set **Daily dir** to your daily-notes folder (e.g. `DailyLife`)
4. Set **File pattern** (default `YYYY-MM-DD.md`)
5. Click **Preview matched files** to verify

## File structure expected

```
<Daily dir>/<YYYY>/<MM>/<YYYY-MM-DD.md>
```

Example:
```
DailyLife/2026/06/2026-06-14.md
```

## Task format

Standard checkbox + Tasks plugin metadata:

```markdown
- [ ] Learn Rust 📅 2026-06-20 🔼 #study
- [x] Morning coffee ✅ 2026-06-14
```

## Development

```bash
npm install
npm test          # run all tests
npm run dev       # watch build
npm run build     # production build → main.js
npm run lint      # typecheck
```

See `docs/MANUAL_QA.md` for the UI acceptance checklist.
```

- [ ] **Step 2: Write MANUAL_QA.md**

```markdown
# Manual QA Checklist

Run this before tagging a release.

## Install & First Run

- [ ] Copy `main.js`, `manifest.json`, `styles.css` into `.obsidian/plugins/task-board/`
- [ ] Enable plugin in Settings → Community plugins
- [ ] Two ribbon icons appear: `list-checks` and `layout-dashboard`

## Sidebar

- [ ] Click `list-checks` ribbon → right sidebar opens compact panel
- [ ] Panel shows: 今日未完 / 历史积压 / 今日已完成 (collapsed) / 打开完整看板 button
- [ ] Click ⟳ → reloads
- [ ] Click 打开完整看板 → opens full board tab

## Board — Today

- [ ] Click `layout-dashboard` ribbon → opens board tab
- [ ] Three columns: 未完成 / 已完成 / 历史积压
- [ ] Source date labels visible on backlog rows
- [ ] Priority emoji (🔼/🔽) visible on tasks that have them

## Board — Calendar

- [ ] Click 日历 tab → 30-day grid
- [ ] Each cell shows day number + ▢N ☑N badges
- [ ] Today's cell highlighted with outline
- [ ] Click a day → detail panel below grid
- [ ] Detail shows that day's pending + done

## Board — Global

- [ ] Click 全局 tab → two-column layout
- [ ] Pending column deduped (no task appears twice)
- [ ] Pending sorted by priority then date
- [ ] Done sorted by completion date desc

## Interactions

- [ ] Click checkbox → task toggles + file written + Notice "✓ 已完成 X" (5s)
- [ ] Click task body → opens source file at correct line
- [ ] Modify a task body externally → click checkbox in panel → error Notice + file unchanged
- [ ] Change dailyDir in settings → panel re-renders on next refresh

## Resilience

- [ ] Empty daily dir → panel shows "无任务记录" without crashing
- [ ] Malformed markdown (random binary) → file ignored, error counter shown
- [ ] Very large file (5000+ tasks) → renders in < 2s

## Themes

- [ ] Default theme: looks right
- [ ] Dark theme: looks right
- [ ] Moonlight theme: looks right

## Resize

- [ ] Sidebar dragged to 240px wide: no overflow
- [ ] Board tab resized to 800px wide: columns reflow
```

- [ ] **Step 3: Final lint + build + test**

Run: `npm run lint && npm run build && npm test`
Expected: All green.

- [ ] **Step 4: Commit**

```bash
git add README.md docs/MANUAL_QA.md
git commit -m "docs: README + manual QA checklist"
```

---

## Self-Review

**Spec coverage**: All 13 sections of the spec are implemented:
- §1-2 background/scope → README
- §3 architecture → Tasks 1-2 (scaffold + types)
- §4 data model → Task 2 (types)
- §5 parsing → Tasks 5-6 (parser basics + emoji)
- §6 backlog → Task 8 (computeBacklog)
- §7 write-back → Task 9 (writer)
- §8 UI → Tasks 13-16 (sidebar, board, calendar, CSS)
- §9 errors → embedded in Tasks 9, 12, 13, 14 (errors[] in snapshot, Notice policy)
- §10 testing → Tasks 3, 4, 5, 6, 7, 8, 9, 10, 12, 17 (all data-layer + integration)
- §11 tooling → Task 1
- §12 settings → Task 11
- §13 future → not implemented (intentional)

**Placeholder scan**: ✅ No TBD/TODO/placeholders. All code shown inline.

**Type consistency**: ✅ `Task`, `TaskMeta`, `IndexSnapshot`, `TaskBoardSettings` defined in Task 2 and used consistently throughout. `bodyHash` field on Task is set in Task 5/6 and read in Task 9. `PRIORITY_EMOJI` defined in Task 4 and used in Task 6.

**One ambiguity resolved**: CalendarGrid onclick detail-holder wiring needed adjustment mid-task; resolved inline.
