// src/reminder/reminderService.ts
import { dateToYmd } from '../utils/dateUtils';

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
