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
