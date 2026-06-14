// __fixtures__/integration.test.ts
import { buildVault30d } from './vault-30d/setup';
import { getSnapshot, clearInflight } from '../src/data/snapshotService';
import { toggleTask } from '../src/data/taskWriter';
import { DEFAULT_SETTINGS } from '../src/config/defaultSettings';

describe('Integration: scan → parse → index → toggle → re-scan', () => {
  beforeEach(() => {
    clearInflight();
  });

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
    // 6-09（daysAgo=5，奇数）：2 个 pending（A+B），1 个 done
    const dayBucket1 = snap1.byDate.get('2026-06-09')!;
    const initialPending = dayBucket1.pending.length;
    const initialDone = dayBucket1.done.length;
    const task = dayBucket1.pending[0];
    await toggleTask(vault, task, DEFAULT_SETTINGS, today);

    const snap2 = await getSnapshot(vault, DEFAULT_SETTINGS, today);
    // toggle 一个 → pending 减 1，done 加 1
    expect(snap2.byDate.get('2026-06-09')!.pending.length).toBe(initialPending - 1);
    expect(snap2.byDate.get('2026-06-09')!.done.length).toBe(initialDone + 1);
    // 6-09 在 today.backlog 中的条目同样减 1
    const backlog1 = snap1.today.backlog.filter(t => t.sourcePath.includes('2026-06-09')).length;
    const stillInBacklog = snap2.today.backlog.filter(t => t.sourcePath.includes('2026-06-09'));
    expect(stillInBacklog.length).toBe(backlog1 - 1);
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
