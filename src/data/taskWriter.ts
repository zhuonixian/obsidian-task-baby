// src/data/taskWriter.ts
import type { Vault } from 'obsidian';
import type { Task, TaskBoardSettings } from '../types';
import { TaskBodyChangedError, TaskLineChangedError } from '../types';
import { stripMeta, textHash } from '../utils/textHash';
import { formatYmd } from '../utils/dateUtils';

// 匹配整行任务，与 taskParser 的 TASK_LINE_RE 保持一致（子弹 -/*/+ 与有序 1./1)）
// group[1]: 缩进 + 标记 + " ["
// group[2]: 复选框标记 " " | "x" | "X"
// group[3]: "] " + 正文（不含 "] " 前缀的纯正文）
const TASK_LINE_RE = /^(\s*(?:[-*+]|\d+[.)]) \[)( |x|X)\] (.*)$/;
// Obsidian callout 引用行前缀：与 taskParser 的 CALLOUT_PREFIX_RE 保持一致
const CALLOUT_PREFIX_RE = /^(?:> ?)+/;

// ✅ 完成日期 emoji：用于取消勾选时清理
const DONE_EMOJI_RE = /\s+✅\s*\d{4}-\d{2}-\d{2}/;

export async function toggleTask(
  vault: Vault,
  task: Task,
  settings: TaskBoardSettings,
  now: Date
): Promise<void> {
  // 1. 定位文件
  const file = vault.getAbstractFileByPath(task.sourcePath);
  if (!file) throw new Error(`File not found: ${task.sourcePath}`);

  const content = await vault.read(file);
  const lines = content.split('\n');
  const line = lines[task.lineStart];

  if (line === undefined) {
    throw new TaskLineChangedError(`Line ${task.lineStart} out of range`);
  }

  // 2. 校验：剥离 callout 引用前缀后，当前行仍是任务行
  const calloutPrefix = line.match(CALLOUT_PREFIX_RE)?.[0] ?? '';
  const strippedLine = line.replace(CALLOUT_PREFIX_RE, '');
  const lineMatch = strippedLine.match(TASK_LINE_RE);
  if (!lineMatch) {
    throw new TaskLineChangedError(`Line ${task.lineStart} no longer a task`);
  }

  const prefix = lineMatch[1];       // e.g. "  - ["
  const marker = lineMatch[2];       // " " | "x" | "X"
  const body = lineMatch[3];         // 任务正文（已剥除 "] " 前缀）

  // 3. 校验：正文 hash（stripMeta 后比较，忽略 emoji/tag 变化）
  //    与 parser 保持一致：bodyHash = textHash(stripMeta(strippedBody))。
  const currentHash = textHash(stripMeta(body));
  if (currentHash !== task.bodyHash) {
    throw new TaskBodyChangedError('Task body changed, please refresh');
  }

  // 4. 改写 checkbox 标记
  const newMarker = task.checked ? ' ' : 'x';
  let newBody = body;

  // 5. ✅ 完成 emoji 管理
  if (!task.checked && settings.appendDoneDate) {
    // 勾选完成 → 追加 ✅ YYYY-MM-DD（仅当行尾不存在同名 emoji 时）
    if (!DONE_EMOJI_RE.test(` ${newBody}`)) {
      newBody = `${newBody} ✅ ${formatYmd(now)}`;
    }
  } else if (task.checked) {
    // 取消勾选 → 移除 ✅ 及其日期
    newBody = newBody.replace(DONE_EMOJI_RE, '');
  }

  // 回写时保留 callout 引用前缀
  lines[task.lineStart] = `${calloutPrefix}${prefix}${newMarker}] ${newBody}`;
  await vault.modify(file, lines.join('\n'));
}
