// src/data/taskParser.ts
import type { Task } from '../types';
import { textHash, stripMeta } from '../utils/textHash';

const TASK_LINE_RE = /^(\s*)[-*+] \[( |[xX])\] (.+)$/;
const CODE_FENCE_RE = /^(\s*)(```|~~~)/;

export function parseFile(
  content: string,
  sourcePath: string,
  sourceDate: Date
): Task[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
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
    const checked = m[2] === 'x' || m[2] === 'X';
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
