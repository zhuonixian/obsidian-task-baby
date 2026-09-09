# TaskBaby 周手账周视图（v2）设计

- 日期：2026-09-10
- 状态：已批准（澄清逐项确认 + 布局 mockup 批准 + 技术设计批准）
- 范围：dashboard「总览」tab 新增周历区块
- 前置：dashboard v1 + 打磨轮已上线（890971c）

## 1. 背景与目标

v1 总览 tab 提供了今日摘要、30 天热力图、按截止日的任务组，但缺少"本周逐日"的手账视角。本功能在总览 tab 插入周历区块：本周 7 天每天的任务计数 + 完成率迷你条，点击某天展开当日可勾选任务清单 —— 手账周计划一页看全。

## 2. 需求确认记录

| 决策点 | 结论 |
|---|---|
| 入口位置 | 总览 tab 内区块，插在热力图之后、任务三组之前；不新增 tab |
| 每日内容 | 计数摘要格：星期标签 + 日期数字 + ☑完成/▢待办计数 + 完成率迷你条 |
| 点击行为 | 点击格子 → 在 grid 下方展开该日任务清单（可勾选写回、点正文跳转）；再点收起；切换选中格直接换内容 |
| 周起始 | 周一 |
| 周导航 | 仅本周，不提供翻周（数据层与组件不含上/下周逻辑） |
| 布局视觉 | 以 2026-09-10 mockup 批准稿为准（轻手账风、周末米黄底、未来置灰虚线、今日橙描边） |

## 3. 视觉规格

- 7 列 CSS grid（`repeat(7, 1fr)`，gap 6px），窄面板等比压缩（格子内容为数字，可接受）
- 格子状态类：
  - `.today` — 主题橙描边、dowLabel 显示 `四·今`、迷你条用主题橙
  - `.weekend`（六/日）— 柔和米黄底色（`body.theme-dark` 有对应暗色覆盖）
  - `.future` — 置灰虚线边框、内容低饱和
  - 三类可叠加（如未来+周末）；今日恰逢周末时 today 的描边与橙条优先，底色保留米黄
- 未来格计数：`byDate` 有数据（用户预写了未来 daily note）则照常显示 `☑N ▢M` 与迷你条；无数据显示 `—`、迷你条空 —— 兼容手账"预写未来计划"用法
- 选中格：加宽橙描边 + 底部 `▼` 指示
- 迷你完成率条：4px 高、圆角、填充色 = 完成率比例；非今日用灰绿、今日用主题橙
- 卡片头：`🗓 本周手账  M/D - M/D`，右侧 `本周已完成 N 件`（7 天 done 总和，纯统计，无激励文案）
- 展开区：grid 下方全宽，卡片式；标题 `📅 <dateKey> 周<dow> · 当日任务`；清单行复用 `renderTaskRow`；底部一行浅色说明（可勾选写回/跳转/收起）

## 4. 架构

```
IndexSnapshot（已有）
   │
   ▼ computeWeekDays(snapshot, now): WeekDayStat[7]   ← src/data/dashboardStats.ts 新增导出
   │                                                     （独立纯函数，DashboardStats 接口不动）
   ▼
renderWeekView(weekDays, handlers): HTMLElement        ← 新组件 src/views/components/dashboard/weekView.ts
   │  内部 selectedKey 状态：点击格子 toggle 展开当日清单（pending 前、done 后）
   ▼
boardView.renderOverview()                            ← renderHeatmap 之后、renderDueGroups 之前插入
```

- handlers 复用 `DueGroupHandlers`（onTaskToggle/onTaskClick 委托 boardView 的 handleToggle/handleOpen）
- 清单行复用 `renderTaskRow`；样式新增 `tb-dash-week-*` 类到 styles.css

## 5. 数据契约

```ts
// types.ts 新增
export interface WeekDayStat {
  dateKey: string;    // "YYYY-MM-DD"
  day: number;        // 日期数字 1-31
  dowLabel: string;   // '一'|'二'|'三'|'四'|'五'|'六'|'日'
  isToday: boolean;
  isWeekend: boolean;
  isFuture: boolean;  // dateKey > today（日粒度）
  pending: Task[];    // 该日记的未完成（snapshot.byDate[dateKey].pending，无桶为空数组）
  done: Task[];       // 该日记的已完成
}

// dashboardStats.ts 新增导出（不并入 DashboardStats）
export function computeWeekDays(snapshot: IndexSnapshot, now: Date): WeekDayStat[];
```

## 6. 统计口径

| 项 | 口径 |
|---|---|
| 周锚点 | 本周一 = `now - ((now.getDay() + 6) % 7)` 天，日历运算（setDate），恒输出周一..周日 7 项 |
| 每日计数 | 按 `snapshot.byDate` 的 `sourceDate` 分桶（与"日历"tab 同口径）；不做 ✅ 完成日重分桶（与热力图口径的区别已知并接受：周手账看"这天记的任务"，热力图看"这天完成了多少"） |
| isFuture | `dateKey > formatYmd(now)`（字符串比较，日粒度） |
| 本周已完成 N | 7 项 `done.length` 求和 |

## 7. 边界与空态

- 整周无任务：格子照常显示计数 0（迷你条 0%），不隐藏卡片
- 未来天格子可点击，展开空清单显示"还没有任务"
- 选中格再点同格收起；点新格直接切换内容
- 展开清单行序：该日 pending 在前、done 在后（done 行有划线样式）
- 周末跨月（如 8/31 周一、9/1 周二）：dateKey 推导用日历运算，天然正确

## 8. 测试计划

**`dashboardStats.test.ts` 追加 describe（node）：**
- 周一锚点：now=周四 → 首项周一、末项周日、恒 7 项；跨月周（构造 8/31 周一）dateKey 正确
- isToday 仅今日格为 true；isWeekend 恰为六/日两项；isFuture 仅今日之后为 true
- byDate 分桶：pending/done 归属正确、无桶日期为空数组

**`weekView.test.ts` 新建（jsdom，参照 dueGroups.test.ts 模式）：**
- 渲染 7 格、dowLabel 顺序、非未来格计数文本 `☑N ▢M`、无数据未来格计数 `—`、有数据的未来格照常计数
- 状态类名：today/weekend/future 类叠加正确
- 点击格子展开该日清单（行数与顺序 pending 前 done 后）；再点收起；点另一格切换
- 勾选 checkbox 触发 onTaskToggle；点正文触发 onTaskClick
- 未来空日展开显示"还没有任务"
- 卡片头汇总 `本周已完成 N 件`

**`docs/MANUAL_QA.md` 追加周历清单**（含窄面板、暗色周末底色、跨月周边界手测）

## 9. 明确不做

- 翻周导航（上/下周）、周任务编辑（新增/删除任务）、周报导出
- streak / 里程碑 / 激励文案（永久禁令）
- 新设置项（周起始日固定周一；未来若要可配需另开 spec）
