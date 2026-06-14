// src/data/snapshotService.ts
import type { Vault } from 'obsidian';
import type { IndexSnapshot, TaskBoardSettings } from '../types';
import { listDailyFiles } from './fileScanner';
import { parseFile } from './taskParser';
import { buildIndex } from './taskIndex';

let inflight: Promise<IndexSnapshot> | null = null;

export function getSnapshot(
  vault: Vault,
  settings: TaskBoardSettings,
  today: Date
): Promise<IndexSnapshot> {
  // —— mutex ——
  if (inflight) return inflight;

  // Defer the actual work to a microtask so that synchronous re-entrancy
  // (multiple getSnapshot calls in the same tick) sees the same inflight Promise.
  // Note: getSnapshot is intentionally NOT async — an async function would wrap
  // every return value in a fresh Promise, breaking the mutex reference-equality.
  inflight = Promise.resolve().then(async () => {
    try {
      const { matched, unparsed } = listDailyFiles(vault, settings, today);
      const allTasks = [];
      const errors: { path: string; error: Error }[] = [];

      for (const { file, sourceDate } of matched) {
        try {
          const content = await vault.read(file);
          const tasks = parseFile(content, file.path, sourceDate, settings.enableTasksMetadata);
          allTasks.push(...tasks);
        } catch (e) {
          errors.push({ path: file.path, error: e as Error });
        }
      }

      return buildIndex(allTasks, today, settings.rangeDays, errors, unparsed.map(f => f.path));
    } finally {
      inflight = null;
    }
  });

  return inflight;
}

export function clearInflight(): void {
  inflight = null;
}
