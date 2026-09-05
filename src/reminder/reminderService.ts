// src/reminder/reminderService.ts
import { dateToYmd, isSameDay } from '../utils/dateUtils';
import type { IndexSnapshot, TaskBoardSettings } from '../types';
import type { Vault } from 'obsidian';
import type { PresentModalOptions } from './reminderModal';

const DEFAULT_REMINDER_TIME = '21:00';
const POPUP_GUARD_MS = 120_000;

function parseTimeHHmm(s: string): { h: number; m: number } | null {
  const match = s.match(/^(\d{1,2}):(\d{2})$/);
  if (!match) return null;
  const h = Number(match[1]);
  const m = Number(match[2]);
  if (h > 23 || m > 59) return null;
  return { h, m };
}

// ============ summarize 原样保留(与现版本一致) ============
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
// ============ 保留区结束 ============

export interface ReminderState {
  dayKey: string | null;
  finalized: boolean;
  snoozeCount: number;
  snoozedUntil: string | null;
  lastPopupAt: string | null;
}

export type ReminderDecision = 'skip' | 'remind' | 'notice';

export function evaluateReminder(
  now: Date,
  settings: TaskBoardSettings,
  state: ReminderState
): ReminderDecision {
  const t = parseTimeHHmm(settings.reminderTime) ?? parseTimeHHmm(DEFAULT_REMINDER_TIME)!;
  const reminderAt = new Date(now.getFullYear(), now.getMonth(), now.getDate(), t.h, t.m);
  if (now.getTime() < reminderAt.getTime()) return 'skip';

  const fresh = state.dayKey !== dateToYmd(now);
  if (fresh) {
    return settings.reminderStyle === 'notice' ? 'notice' : 'remind';
  }
  if (state.finalized) return 'skip';
  if (state.snoozedUntil && now.getTime() < new Date(state.snoozedUntil).getTime()) return 'skip';
  if (state.lastPopupAt && now.getTime() < new Date(state.lastPopupAt).getTime() + POPUP_GUARD_MS) return 'skip';
  return settings.reminderStyle === 'notice' ? 'notice' : 'remind';
}

export function buildReminderMessage(s: ReminderSummary): string | null {
  if (s.pendingToday > 0 && s.dueToday > 0) {
    return `⏰ 今日还有 ${s.pendingToday} 件未完成 · ${s.dueToday} 件今日到期`;
  }
  if (s.pendingToday > 0) return `⏰ 今日还有 ${s.pendingToday} 件未完成`;
  if (s.dueToday > 0) return `⏰ 今日有 ${s.dueToday} 件到期任务`;
  return null;
}

export interface ReminderHost {
  settings: TaskBoardSettings;
  app: { vault: Vault };
  getReminderState(): ReminderState;
  saveReminderState(state: ReminderState): Promise<void>;
}

export interface ReminderDeps {
  now(): Date;
  notify(message: string): void;
  presentModal(options: PresentModalOptions): void;
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
  const decision = evaluateReminder(now, host.settings, host.getReminderState());
  if (decision === 'skip') return;

  const snapshot = await deps.getSnapshot(host.app.vault, host.settings, now);
  if (snapshot.errors.length > 0) return;

  const message = buildReminderMessage(summarize(snapshot, now));

  const today = dateToYmd(now);
  const raw = host.getReminderState();
  const base: ReminderState = raw.dayKey === today
    ? raw
    : { dayKey: today, finalized: false, snoozeCount: 0, snoozedUntil: null, lastPopupAt: null };

  if (message === null) {
    await host.saveReminderState({ ...base, finalized: true });
    return;
  }

  if (decision === 'notice') {
    deps.notify(message);
    await host.saveReminderState({ ...base, finalized: true });
    return;
  }

  await host.saveReminderState({ ...base, lastPopupAt: now.toISOString() });

  const settings = host.settings;
  deps.presentModal({
    message,
    snoozeRemaining: Math.max(0, settings.reminderMaxSnoozes - base.snoozeCount),
    snoozeMinutes: settings.reminderSnoozeMinutes,
    onSnooze: () => {
      const until = new Date(deps.now().getTime() + settings.reminderSnoozeMinutes * 60_000);
      host.saveReminderState({
        ...base,
        snoozeCount: base.snoozeCount + 1,
        snoozedUntil: until.toISOString(),
        lastPopupAt: null
      }).catch(console.error);
    },
    onFinal: () => {
      host.saveReminderState({
        ...base,
        finalized: true,
        snoozedUntil: null,
        lastPopupAt: null
      }).catch(console.error);
    }
  });
}
