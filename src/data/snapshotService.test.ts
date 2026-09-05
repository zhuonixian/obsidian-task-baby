// src/data/snapshotService.test.ts
import { TFile, Vault } from 'obsidian';
import { getSnapshot, clearInflight } from './snapshotService';
import type { TaskBoardSettings } from '../types';

const SETTINGS: TaskBoardSettings = {
  dailyDir: 'DailyLife',
  filePattern: 'YYYY-MM-DD.md',
  rangeDays: 30,
  enableTasksMetadata: true,
  sidebarCompactLimit: 5,
  appendDoneDate: true,
  fontSize: 13,
  reminderEnabled: true,
  reminderTime: '21:00',
  reminderStyle: 'notice',
  reminderSnoozeMinutes: 10,
  reminderMaxSnoozes: 3,
};

describe('SnapshotService.getSnapshot', () => {
  beforeEach(() => {
    clearInflight();
  });

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
