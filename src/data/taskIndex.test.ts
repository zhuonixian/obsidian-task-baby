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
      makeTask('历史完成', new Date(2026,5, 10), true, 1)
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
    expect(idx.windowStart).toEqual(new Date(2026, 4, 16)); // inclusive window: 5-16 → 6-14 = 30 days
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
