// src/data/taskParser.ts (full rewrite)
import type { Task, TaskMeta, Priority } from '../types';
import { textHash, stripMeta, PRIORITY_EMOJI } from '../utils/textHash';

const TASK_LINE_RE = /^(\s*)[-*+] \[( |[xX])\] (.+)$/;
const CODE_FENCE_RE = /^(\s*)(```|~~~)/;

// Emoji patterns
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
  const y = +m[1];
  const mo = +m[2];
  const d = +m[3];
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return null;
  const date = new Date(y, mo - 1, d);
  // Detect JS Date rollover (e.g., 2026-02-30 → March 2)
  if (date.getMonth() !== mo - 1 || date.getDate() !== d) return null;
  return date;
}

function parseMeta(body: string): { meta: TaskMeta; strippedBody: string } {
  const meta: TaskMeta = { tags: [] };

  // 1. Date emojis (📅 ⏳ 🛫 ✅)
  // 匹配 emoji + 紧跟的日期 token（严格 YYYY-MM-DD 才写入 meta），
  // 但无论日期是否合法，都将该 emoji+token 段从 body 中剥离，
  // 以保证 body 显示干净（见 spec 测试 'non-standard date format'）。
  let stripped = body;
  for (const [emoji, field] of Object.entries(EMOJI_TO_FIELD)) {
    const re = new RegExp(`${emoji}\\s*(\\d{4}-\\d{2}-\\d{2})`, 'u');
    const strictM = stripped.match(re);
    if (strictM) {
      const d = parseDate(strictM[1]);
      if (d) (meta as any)[field] = d;
      stripped = stripped.replace(new RegExp(re.source, re.flags + 'g'), '');
    } else {
      // 非标日期：剥离 emoji + 紧跟的下一个非空白、非 emoji token
      const looseRe = new RegExp(
        `${emoji}\\s*[^#\\s\\u{1F4C5}\\u{23F3}\\u{1F6EB}\\u{2705}\\u{1F501}\\u{23EB}\\u{1F53C}\\u{1F53D}\\u{23EC}]+`,
        'u'
      );
      stripped = stripped.replace(looseRe, '');
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
  sourceDate: Date,
  parseMetaFlag: boolean = true
): Task[] {
  const lines = content.replace(/\r\n/g, '\n').split('\n');
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
    const checked = m[2] === 'x' || m[2] === 'X';
    const rawBody = m[3].trim();

    let meta: TaskMeta;
    let bodyForDisplay: string;
    if (parseMetaFlag) {
      const parsed = parseMeta(rawBody);
      meta = parsed.meta;
      bodyForDisplay = parsed.strippedBody;
    } else {
      meta = { tags: [] };
      bodyForDisplay = rawBody;
    }

    tasks.push({
      sourcePath,
      sourceDate,
      lineStart: i,
      lineEnd: i,
      rawText: line,
      body: bodyForDisplay,
      bodyHash: textHash(stripMeta(bodyForDisplay)),
      checked,
      indent,
      meta
    });
  }

  return tasks;
}
