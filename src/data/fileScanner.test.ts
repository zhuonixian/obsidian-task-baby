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
    expect(result.matched.map(f => f.file.path)).toEqual([
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
    expect(result.matched.map(f => f.file.path)).toEqual(['DailyLife/2026/06/2026-06-14.md']);
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
    const paths = result.matched.map(f => f.file.path);
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
    expect(result.matched.map(f => f.file.path)).toEqual(['Logs/June-14-2026.md']);
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

  test('MMMM pattern rejects invalid days (June-31 rollover)', () => {
    vault.files = [
      makeFile('Logs/June-31-2026.md'),
      makeFile('Logs/June-14-2026.md')
    ];
    const result = listDailyFiles(vault, {
      dailyDir: 'Logs',
      filePattern: 'MMMM-D-YYYY.md',
      rangeDays: 30,
      enableTasksMetadata: true,
      sidebarCompactLimit: 5,
      appendDoneDate: true
    }, new Date(2026, 5, 14));
    expect(result.matched.map(f => f.file.path)).toEqual(['Logs/June-14-2026.md']);
    expect(result.unparsed.map(f => f.path)).toContain('Logs/June-31-2026.md');
  });
});
