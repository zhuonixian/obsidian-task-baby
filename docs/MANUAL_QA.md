# Manual QA Checklist

Run this before tagging a release.

## Install & First Run

- [ ] Copy `main.js`, `manifest.json`, `styles.css` into `.obsidian/plugins/task-baby/`
- [ ] Enable plugin in Settings → Community plugins
- [ ] Two ribbon icons appear: `list-checks` and `layout-dashboard`

## Sidebar

- [ ] Click `list-checks` ribbon → right sidebar opens compact panel
- [ ] Panel shows: 今日未完 / 历史积压 / 今日已完成 (collapsed) / 打开完整看板 button
- [ ] Click ⟳ → reloads
- [ ] Click 打开完整看板 → opens full board tab

## Board — Today

- [ ] Click `layout-dashboard` ribbon → opens board tab
- [ ] Three columns: 未完成 / 已完成 / 历史积压
- [ ] Source date labels visible on backlog rows
- [ ] Priority emoji (🔼/🔽) visible on tasks that have them

## Board — Calendar

- [ ] Click 日历 tab → 30-day grid
- [ ] Each cell shows day number + ▢N ☑N badges
- [ ] Today's cell highlighted with outline
- [ ] Click a day → detail panel below grid
- [ ] Detail shows that day's pending + done

## Board — Global

- [ ] Click 全局 tab → two-column layout
- [ ] Pending column deduped (no task appears twice)
- [ ] Pending sorted by priority then date
- [ ] Done sorted by completion date desc

## Interactions

- [ ] Click checkbox → task toggles + file written + Notice "✓ 已完成 X" (5s)
- [ ] Click task body → opens source file at correct line
- [ ] Modify a task body externally → click checkbox in panel → error Notice + file unchanged
- [ ] Change dailyDir in settings → panel re-renders on next refresh

## Resilience

- [ ] Empty daily dir → panel shows "无任务记录" without crashing
- [ ] Malformed markdown (random binary) → file ignored, error counter shown
- [ ] Very large file (5000+ tasks) → renders in < 2s

## Themes

- [ ] Default theme: looks right
- [ ] Dark theme: looks right
- [ ] Moonlight theme: looks right

## Daily Reminder

- [ ] Set 提醒时刻 to 1 minute ahead → Notice appears within 1-2 min with counts
- [ ] After the notice fired, restart Obsidian → no second notice same day
- [ ] Set 提醒时刻 to a time already past (and not yet fired today) → startup catch-up notice ~10s after layout ready
- [ ] 每日提醒 off → no notice at reminder time
- [ ] Notice copy: when one count is 0, only the other is shown
- [ ] Type invalid time (e.g. `25:99`) → not saved; reopen settings shows last valid value
- [ ] Empty task day → no notice, but next day still reminds

### Snooze & Dismiss (modal style)

- [ ] Set 提醒时刻 1 min ahead + 贪睡间隔 1 min → modal appears with 「稍后 1 分钟(还可 3 次)」 and 「今日完成」
- [ ] Click 稍后 → re-appears after ~1 min, remaining count decreases
- [ ] Exhaust all snoozes → modal shows only 「今日完成」
- [ ] ESC / click backdrop → treated as 今日完成, no more popups today
- [ ] Snooze → restart Obsidian → modal still appears at snooze expiry
- [ ] Switch 提醒样式 to 通知条 → v1 behavior (single notice, finalized)
- [ ] Set 最大贪睡次数 to 0 → first modal shows only 「今日完成」
- [ ] Old data.json (only lastReminderDate) → upgrade keeps behavior (already-finalized day stays silent)
- [ ] Settings → 预览提醒弹窗 → modal shows with real counts; snooze/final buttons show 预览模式 notices and do NOT change today's schedule
- [ ] After a day is finalized (弹过/ESC), changing 提醒时刻 (or 每日提醒 / 提醒样式) resets today's schedule → next tick past the new time pops again

## Resize

- [ ] Sidebar dragged to 240px wide: no overflow
- [ ] Board tab resized to 800px wide: columns reflow

## Dashboard overview tab

打开看板（默认落在「总览」tab）：

- [ ] 摘要卡：环百分比 = 今日 done/(done+pending)；三磁贴数字与今日一致；0 任务时环显示 `—` 与「还没有任务」
- [ ] 热力图：30 格（rangeDays 更小时自动收敛为窗口天数）、悬停显示 `日期 · 完成 N 件`；头部「共完成 N 件 · 日均 X」
- [ ] 逾期组任务带红色顶边 + 📅 标签；今日到期/未来 7 天分组正确（对照一个 due=今天、一个 due=明天的任务）
- [ ] 勾选任一任务 → 写回源文件（Notice 提示）→ dashboard 数字/环/热力图刷新
- [ ] 点击任务正文 → 打开源笔记并定位到行
- [ ] 「今日已完成」默认收起，点击展开可再收起；展开的行有划线样式
- [ ] 亮/暗主题各过一遍：热力图 4 档色阶在暗色下可辨识
- [ ] 拖窄面板：任务三组自动降为两列/单列；热力图格子等比缩小
- [ ] 其余三个 tab（今日/日历/全局）行为不变
