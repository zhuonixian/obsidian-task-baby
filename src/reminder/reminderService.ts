// src/reminder/reminderService.ts
import { dateToYmd, isSameDay } from '../utils/dateUtils';
import type { IndexSnapshot, TaskBoardSettings } from '../types';
import type { Vault } from 'obsidian';

const DEFAULT_REMINDER_TIME = '21:00';

function parseTimeHHmm(s: string): { h: number; m: number } | null {
  const match = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

export function shouldRemind(
  now: Date,
  reminderTime: string,
  lastReminderDate: string | null
): boolean {
  const t = parseTimeHHmm(reminderTime) ?? parseTimeHHmm(DEFAULT_REMINDER_TIME)!;
  const reminderAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.h, t.m);
  if (now.getTime() < reminderAt.getTime()) return false;
  return dateToYmd(now) !== lastReminderDate;
}

export interface ReminderSummary {
  pendingToday: number;
  dueToday: number;
}

export function summarize(snapshot: IndexSnapshot, today: Date): ReminderSummary {
  const pendingToday = snapshot.today.pending.length;
  const dueToday = snapshot.allPending.filter(t => {
    if (isSameDay(t.sourceDate, today)) return false;
    if (t.meta?.due && isSameDay(t.meta.due, today)) return true;
    if (t.meta?.scheduled && isSameDay(t.meta.scheduled, today)) return true;
    return false;
  }).length;
  return { pendingToday, dueToday };
}

export interface ReminderState {
  lastReminderDate: string | null;
}

export interface ReminderHost {
  settings: TaskBoardSettings;
  app: { vault: Vault };
  getReminderState(): ReminderState;
  saveReminderDate(ymd: string): Promise<void>;
}

export interface ReminderDeps {
  now(): Date;
  notify(message: string): void;
  getSnapshot(
    vault: Vault,
    settings: TaskBoardSettings,
    today: Date
  ): Promise<IndexSnapshot>;
}

export async function runReminderCheck(
  host: ReminderHost,
  deps: ReminderDeps
): Promise<void> {
  if (!host.settings.reminderEnabled) return;

  const now = deps.now();
  if (!shouldRemind(now, host.settings.reminderTime, host.getReminderState().lastReminderDate)) {
    return;
  }

  const snapshot = await deps.getSnapshot(host.app.vault, host.settings, now);
  if (snapshot.errors.length > 0) return;

  const { pendingToday, dueToday } = summarize(snapshot, now);
  if (pendingToday > 0 && dueToday > 0) {
    deps.notify(`⏰ 今日还有 ${pendingToday} 件未完成 · ${dueToday} 件今日到期`);
  } else if (pendingToday > 0) {
    deps.notify(`⏰ 今日还有 ${pendingToday} 件未完成`);
  } else if (dueToday > 0) {
    deps.notify(`⏰ 今日有 ${dueToday} 件到期任务`);
  }
  await host.saveReminderDate(dateToYmd(now));
}
