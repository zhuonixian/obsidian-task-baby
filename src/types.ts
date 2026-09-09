// —— Task 元数据（Tasks 插件 emoji 风格）——
export type Priority = 'lowest' | 'low' | 'medium' | 'high' | 'highest';

export interface TaskMeta {
  due?: Date;
  scheduled?: Date;
  start?: Date;
  done?: Date;
  priority?: Priority;
  recurrence?: string; // 🔁 原文，不展开
  tags: string[];
}

// —— 核心任务类型 ——
export interface Task {
  sourcePath: string;        // "DailyLife/2026/06/2026-06-10.md"
  sourceDate: Date;          // 从文件名解析
  lineStart: number;         // 0-based 行号
  lineEnd: number;           // v1 = lineStart
  rawText: string;           // 原始 markdown 行
  body: string;              // 去掉 checkbox 后的正文（含 emoji/tag）
  bodyHash: string;          // stripMeta(body) 的 hash，用于写回校验
  checked: boolean;
  indent: number;
  meta?: TaskMeta;
}

// —— 索引快照（UI 消费）——
export interface DayBucket {
  pending: Task[];
  done: Task[];
}

export interface IndexSnapshot {
  generatedAt: Date;
  windowStart: Date;
  windowEnd: Date;           // = today
  today: {
    pending: Task[];
    done: Task[];
    backlog: Task[];         // 历史日期未完成、滚到今天
  };
  byDate: Map<string, DayBucket>; // key = "YYYY-MM-DD"
  allPending: Task[];        // 窗口内全部未完成（去重）
  allDone: Task[];           // 窗口内全部已完成
  errors: { path: string; error: Error }[];
  unparsed: string[];        // 文件名不匹配的 path
}

// —— 设置 ——
export interface TaskBoardSettings {
  dailyDir: string;
  filePattern: string;       // e.g. "YYYY-MM-DD.md"
  rangeDays: number;
  enableTasksMetadata: boolean;
  sidebarCompactLimit: number;
  appendDoneDate: boolean;
  fontSize: number;          // panel base font size in px (default 13)
  reminderEnabled: boolean;
  reminderTime: string;      // "HH:mm", invalid fallback 21:00
  reminderStyle: 'modal' | 'notice';
  reminderSnoozeMinutes: number;  // 1-120, default 10
  reminderMaxSnoozes: number;     // 0-10, 0 = no snooze button, default 3
}

// —— 错误类型 ——
export class TaskLineChangedError extends Error {
  constructor(msg: string) { super(msg); this.name = 'TaskLineChangedError'; }
}

export class TaskBodyChangedError extends Error {
  constructor(msg: string) { super(msg); this.name = 'TaskBodyChangedError'; }
}

// —— Dashboard 统计（overview tab 消费）——
export interface DailyDoneCount {
  dateKey: string;   // "YYYY-MM-DD"
  count: number;
}

export interface DashboardStats {
  // 今日摘要
  todayTotal: number;        // 今日 done+pending
  todayDone: number;
  todayPending: number;
  completionRate: number;    // 0..1，0 任务时为 0（不除零）
  overdueCount: number;
  // 按截止日期的任务组（均来自窗口内全部未完成 allPending，按 meta.due 过滤）
  overdue: Task[];           // due < today（日粒度）
  dueToday: Task[];          // due == today
  dueNext7Days: Task[];      // today < due <= today+7
  doneTodayTasks: Task[];    // 今日已完成（= snapshot.today.done）
  // 30 天热力图
  dailyDone: DailyDoneCount[];  // 近 N 项（N = min(rangeDays, 30)），末项为 today
  totalDone30d: number;
  avgPerDay: number;         // totalDone30d / dailyDone.length，保留 1 位小数
}
