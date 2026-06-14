# Manual QA Checklist

Run this before tagging a release.

## Install & First Run

- [ ] Copy `main.js`, `manifest.json`, `styles.css` into `.obsidian/plugins/task-board/`
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

## Resize

- [ ] Sidebar dragged to 240px wide: no overflow
- [ ] Board tab resized to 800px wide: columns reflow
