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

  test('handles CRLF line endings', () => {
    const crlfContent = '- [ ] 任务A\r\n- [x] 任务B\r\n  - [ ] 子任务\r\n';
    const tasks = parseFile(crlfContent, 'p', new Date(2026, 5, 14));
    expect(tasks.length).toBe(3);
    expect(tasks[0].body).toBe('任务A');
    expect(tasks[1].body).toBe('任务B');
    expect(tasks[1].checked).toBe(true);
    expect(tasks[2].body).toBe('子任务');
    expect(tasks[2].indent).toBe(2);
  });

  test('handles uppercase [X] as checked', () => {
    const tasks = parseFile('- [X] 大写X\n', 'p', new Date(2026, 5, 14));
    expect(tasks.length).toBe(1);
    expect(tasks[0].checked).toBe(true);
    expect(tasks[0].body).toBe('大写X');
  });
});

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

  test('rejects invalid calendar date 2026-02-30 (Feb rollover)', () => {
    const t = parseFile('- [ ] foo 📅 2026-02-30', 'p', new Date())[0];
    expect(t.meta?.due).toBeUndefined();
    expect(t.body).toBe('foo');
  });

  test('rejects invalid calendar date 2026-13-45', () => {
    const t = parseFile('- [ ] foo 📅 2026-13-45', 'p', new Date())[0];
    expect(t.meta?.due).toBeUndefined();
    expect(t.body).toBe('foo');
  });

  test('duplicate due date: first wins, second stripped from body', () => {
    const t = parseFile('- [ ] foo 📅 2026-06-01 📅 2026-06-30', 'p', new Date())[0];
    expect(t.meta?.due).toEqual(new Date(2026, 5, 1));
    // Body should not contain either date emoji (both stripped by looseRe fallback for unmatched 2nd)
    expect(t.body).not.toContain('📅');
    expect(t.body).toBe('foo');
  });
});

describe('TaskParser enableTasksMetadata flag', () => {
  test('parseMetaFlag=false: emoji stays in body, meta is empty', () => {
    const content = '- [ ] 学 Rust 📅 2026-06-20 🔼 #p1\n';
    const tasks = parseFile(content, 'p', new Date(2026, 5, 14), false);
    expect(tasks.length).toBe(1);
    expect(tasks[0].body).toBe('学 Rust 📅 2026-06-20 🔼 #p1');
    expect(tasks[0].meta?.due).toBeUndefined();
    expect(tasks[0].meta?.priority).toBeUndefined();
    expect(tasks[0].meta?.tags).toEqual([]);
  });

  test('parseMetaFlag=true (default): emoji stripped, meta populated', () => {
    const content = '- [ ] 学 Rust 📅 2026-06-20 🔼 #p1\n';
    const tasks = parseFile(content, 'p', new Date(2026, 5, 14));
    expect(tasks[0].body).toBe('学 Rust');
    expect(tasks[0].meta?.due).toEqual(new Date(2026, 5, 20));
    expect(tasks[0].meta?.priority).toBe('high');
    expect(tasks[0].meta?.tags).toEqual(['p1']);
  });
});
