# TaskBaby Dashboard「总览」Tab 设计

- 日期：2026-09-10
- 状态：已批准（设计对话中逐项确认）
- 范围：v1（本文档）；周视图、渐变描边环等留 v2

## 1. 背景与目标

TaskBaby 现有看板（今日/日历/全局三个 tab）只做任务列表输出，缺乏汇总视角。本次在看板中新增第 1 个 tab「总览」（默认打开），提供轻手账风格的 dashboard：一眼看清今日状态、近 30 天完成趋势、以及按截止日期视角组织的可操作任务组。

调研结论（Tasks 查询模板、Habit Tracker Dashboard、Banshan Habits、中文论坛手账 techo 插件）：辨识度来自热力图 + 手账式排版语言（圆角大卡片、柔和色块、留白、emoji 点缀），不依赖图形精度。

## 2. 需求确认记录

| 决策点 | 结论 |
|---|---|
| 入口位置 | 看板第 1 个 tab「总览」，打开看板默认落在此 tab；现有三 tab 不变 |
| v1 模块 | 今日摘要卡片、30 天热力图、逾期/今日/未来7天任务列表、今日已完成折叠 |
| 视觉风格 | 轻手账风：遵循 Obsidian 明暗主题变量 + 圆角卡片、柔和色块、emoji 点缀 |
| streak | **不要**。用户明确不要"连续完成 N 天"类里程碑/激励输出 |
| 热力图口径 | 颜色深浅 = 当天完成任务数（非完成率） |
| 完成率环 | SVG `stroke-dasharray` 圆头端点（方案 B） |
| 已完成展示 | dashboard 底部"今日已完成 N 件"折叠清单，默认收起 |
| 执行方式 | 实现任务由 subagent（glm-5.3-flash[1m]）执行，设计与计划在主会话 |

## 3. 布局（自上而下）

```
┌─ tab 栏：🏠 总览(active) | 📅 今日 | 🗓 日历 | 🌐 全局 | … ⟳ 刷新
├─ ① 今日摘要卡片
│    [SVG 圆头完成率环]  [▢ 今日待办] [☑ 已完成] [⚠ 逾期]
├─ ② 近 30 天完成热力图   （右上角：共完成 N 件 · 日均 X）
├─ ③ 任务三组（三列 grid，窄面板 auto-fill 降列）
│    ⚠ 逾期未完成(红顶边)  📍 今日到期(橙顶边)  🗓 未来 7 天(绿顶边)
└─ ④ ✅ 今日已完成 · N 件（折叠条，点击展开）
```

- 摘要环：112px 视图框、r=45、stroke-width 12、`stroke-linecap: round`，中心两行文字（百分比 + n/m 完成）
- 磁贴：三枚，柔和色底（派生自主题变量），数字 + emoji 标签
- 热力图：30 格（today-29 … today），CSS grid 固定 15 列 × 2 行，圆角 4px 格子，4 档色阶 + 图例（少→多），格子悬停 tooltip 显示日期与数量
- 任务行：与现有看板一致 —— 复选框可勾选写回源文件、正文点击跳转源笔记对应行；逾期/未来组在行内显示 `📅MM-DD` 小字
- 已完成折叠：`<details>` 式交互，展开显示今日已完成任务列表（勾选可取消）

## 4. 架构

```
IndexSnapshot（已有 getSnapshot）
   │
   ▼ computeDashboardStats(snapshot, now)      ← 新增 src/data/dashboardStats.ts（纯函数）
   │  输出 DashboardStats
   ▼
boardView.renderOverview()                     ← ViewMode 增加 'overview'，默认值
   ├── src/views/components/dashboard/summaryCard.ts
   ├── src/views/components/dashboard/heatmap.ts
   ├── src/views/components/dashboard/dueGroups.ts
   └── src/views/components/dashboard/doneToday.ts
```

- 勾选/跳转复用 boardView 现有 `handleToggle`（toggleTask 写回 + refreshAllViews）与 `handleOpen`
- 渲染组件签名与现有 `renderGroupSection`/`renderCalendarGrid` 风格一致：`(data, callbacks) => HTMLElement`，DOM 构建用现有 `h()` helper
- 样式新增 `tb-dash-*` 类到 `styles.css`；颜色基于 Obsidian 主题变量（如 `--background-modifier-hover`、`--text-muted` 等）派生，暗色模式自动适配
- 视图刷新时机与现有 mode 一致：onOpen、手动刷新、写回后

## 5. 数据契约

```ts
// types.ts 新增
export interface DailyDoneCount {
  dateKey: string;   // "YYYY-MM-DD"
  count: number;
}

export interface DashboardStats {
  // 摘要
  todayTotal: number;        // 今日 done+pending
  todayDone: number;
  todayPending: number;
  completionRate: number;    // 0..1，0 任务时为 0
  overdueCount: number;
  // 任务组（均取自窗口内全部未完成 allPending，按 meta.due 过滤）
  overdue: Task[];           // due < today
  dueToday: Task[];          // due == today
  dueNext7Days: Task[];      // today < due <= today+7
  doneTodayTasks: Task[];    // 今日已完成（= snapshot.today.done），供折叠清单
  // 热力图
  dailyDone: DailyDoneCount[];  // 固定 30 项，today-29 … today，无完成记 0
  totalDone30d: number;
  avgPerDay: number;         // totalDone30d / 30，保留 1 位小数
}
```

## 6. 统计口径

| 指标 | 口径 |
|---|---|
| 完成率（环） | 今日 `done / (done + pending)`；总数为 0 → 环空态（0%，文案"今天还没有任务"），不除零 |
| 每日完成数（热力图） | 优先按 `meta.done`（✅ 日期）分桶；无 `meta.done` 的完成任务回退按 `sourceDate` 分桶。昨天记的今天完成的任务计入今天 |
| 逾期 | `allPending` 中 `meta.due` 存在且 `< today`（零点比较，按日粒度） |
| 今日到期 | `meta.due == today`；未来 7 天：`today < meta.due <= today+7`（含 today+7 边界、不含 today） |
| 无 due 任务 | 不出现在三组中（与「今日」tab 职责区分，避免重复） |
| 日均 | `totalDone30d / 30`，展示 1 位小数 |

## 7. 边界与空态

- 窄面板：任务三组 `grid-template-columns: repeat(auto-fill, minmax(220px, 1fr))` 自动降列；热力图格子用相对尺寸等比缩小
- 空态文案：逾期/今日/未来组无任务 → 组内显示"无 🎉"类轻文案（不隐藏卡片）；今日 0 任务 → 环空态 + 摘要磁贴全 0
- 热力图某天无数据 → 最浅档色（非空白）
- 错误条沿用现有 `snapshot.errors` 的 `tb-error-bar`，dashboard 不重复处理

## 8. 测试计划

**`src/data/dashboardStats.test.ts`**（jest 纯函数）：
- 完成率：正常值、0 任务（rate=0 且 todayTotal=0）、全部完成
- 热力图分桶：`meta.done` 优先、fallback `sourceDate`、固定 30 项窗口、totalDone30d/avgPerDay
- due 分组边界：due=昨日（逾期）、=今日、=明日、=today+7（含）、=today+8（不含）、无 due（三组均不入）、pending 无 meta
- 日期比较为日粒度零点（同日不同时刻不误判）

**渲染组件测试**（jsdom，参照 `reminderModal.test.ts` 模式）：
- summaryCard：环 `stroke-dasharray` 数值与 rate 一致、磁贴数字、0 任务空态文案
- heatmap：格子数 = 30、色阶档位、汇总文案
- dueGroups：分组标题计数、任务行勾选回调触发
- doneToday：折叠/展开、计数

**`docs/MANUAL_QA.md`**：追加 dashboard 清单（明/暗主题、勾选写回、跳转、悬停 tooltip、窄面板）。

## 9. v1 明确不做

- streak / 里程碑 / 激励文案（用户明确移除）
- 渐变描边环、周手账视图（v2 候选）
- 图表动画、图表库依赖
- 新设置项（dashboard 无需配置，复用现有 fontSize 等）
