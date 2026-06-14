// src/data/taskWriter.test.ts
import { TFile, Vault } from 'obsidian';
import type { Task, TaskBoardSettings } from '../types';
import { TaskBodyChangedError, TaskLineChangedError } from '../types';
import { stripMeta, textHash } from '../utils/textHash';
import { toggleTask } from './taskWriter';

const SETTINGS: TaskBoardSettings = {
  dailyDir: 'DailyLife',
  filePattern: 'YYYY-MM-DD.md',
  rangeDays: 30,
  enableTasksMetadata: true,
  sidebarCompactLimit: 5,
  appendDoneDate: true,
  fontSize: 13
};

function setupVault(content: string): { vault: Vault; file: TFile } {
  const vault = new Vault();
  const file = new TFile('DailyLife/2026/06/2026-06-14.md', '2026-06-14', 'md');
  vault.files = [file];
  vault.contents[file.path] = content;
  return { vault, file };
}

function makeTask(lineStart: number, body: string, _ignoredHashArg: string, checked: boolean, sourcePath: string): Task {
  // 与 parser 保持一致：bodyHash = textHash(stripMeta(strippedBody))
  // 这里 body 已是 stripped 形态，所以直接 hash。
  return {
    sourcePath,
    sourceDate: new Date(2026, 5, 14),
    lineStart,
    lineEnd: lineStart,
    rawText: `- [${checked ? 'x' : ' '}] ${body}`,
    body,
    bodyHash: textHash(stripMeta(body)),
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
