import { shouldRemind } from './reminderService';

describe('shouldRemind', () => {
  test('已过时刻且当天未提醒 → true', () => {
    const now = new Date(2026, 8, 5, 22, 0);
    expect(shouldRemind(now, '21:00', '2026-09-04')).toBe(true);
  });

  test('已过时刻且当天已提醒 → false', () => {
    const now = new Date(2026, 8, 5, 22, 0);
    expect(shouldRemind(now, '21:00', '2026-09-05')).toBe(false);
  });

  test('未到时刻 → false(即使多日未提醒)', () => {
    const now = new Date(2026, 8, 5, 20, 0);
    expect(shouldRemind(now, '21:00', '2026-09-01')).toBe(false);
  });

  test('昨天提醒过、今天未到点 → false', () => {
    const now = new Date(2026, 8, 5, 8, 0);
    expect(shouldRemind(now, '21:00', '2026-09-04')).toBe(false);
  });

  test('恰好到达时刻 → true(lastReminderDate 为 null)', () => {
    const now = new Date(2026, 8, 5, 21, 0);
    expect(shouldRemind(now, '21:00', null)).toBe(true);
  });

  test('时刻非法 "25:99" → 按 21:00(22:00 → true)', () => {
    expect(shouldRemind(new Date(2026, 8, 5, 22, 0), '25:99', null)).toBe(true);
  });

  test('时刻非法 "25:99" → 按 21:00(20:00 → false)', () => {
    expect(shouldRemind(new Date(2026, 8, 5, 20, 0), '25:99', null)).toBe(false);
  });

  test('时刻非法 "abc" → 按 21:00(21:30 → true)', () => {
    expect(shouldRemind(new Date(2026, 8, 5, 21, 30), 'abc', null)).toBe(true);
  });
});
