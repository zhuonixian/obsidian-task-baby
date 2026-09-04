// src/config/defaultSettings.ts
import type { TaskBoardSettings } from '../types';

export const DEFAULT_SETTINGS: TaskBoardSettings = {
  dailyDir: 'DailyLife',
  filePattern: 'YYYY-MM-DD.md',
  rangeDays: 30,
  enableTasksMetadata: true,
  sidebarCompactLimit: 5,
  appendDoneDate: true,
  fontSize: 13,
  reminderEnabled: true,
  reminderTime: '21:00'
};
