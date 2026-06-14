// src/utils/dateUtils.test.ts
import {
  parseFilenameDate,
  formatYmd,
  computeWindowStart,
  dateToYmd,
  isSameDay
} from './dateUtils';

describe('dateUtils', () => {
  test('parseFilenameDate: standard YYYY-MM-DD', () => {
    expect(parseFilenameDate('2026-06-14')).toEqual(new Date(2026, 5, 14));
  });

  test('parseFilenameDate: returns null for non-standard format', () => {
    expect(parseFilenameDate('2026-6-14')).toBeNull();
    expect(parseFilenameDate('6/20/2026')).toBeNull();
    expect(parseFilenameDate('notes')).toBeNull();
  });

  test('formatYmd', () => {
    expect(formatYmd(new Date(2026, 5, 14))).toBe('2026-06-14');
    expect(formatYmd(new Date(2026, 0, 5))).toBe('2026-01-05');
  });

  test('dateToYmd is alias of formatYmd', () => {
    expect(dateToYmd(new Date(2026, 5, 14))).toBe('2026-06-14');
  });

  test('computeWindowStart: 30 days before', () => {
    const today = new Date(2026, 5, 14);
    const start = computeWindowStart(today, 30);
    expect(start).toEqual(new Date(2026, 4, 16)); // inclusive window: 5-16 → 6-14 = 30 days
  });

  test('computeWindowStart: 1 day', () => {
    const today = new Date(2026, 5, 14);
    expect(computeWindowStart(today, 1)).toEqual(new Date(2026, 5, 14));
  });

  test('isSameDay', () => {
    const a = new Date(2026, 5, 14, 10, 30);
    const b = new Date(2026, 5, 14, 23, 59);
    const c = new Date(2026, 5, 15);
    expect(isSameDay(a, b)).toBe(true);
    expect(isSameDay(a, c)).toBe(false);
  });
});
