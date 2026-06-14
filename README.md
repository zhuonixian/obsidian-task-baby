# Obsidian Task Board

Visualize completed and pending tasks across your daily-note logs.

## Features

- 📋 **Sidebar compact view**: today's pending + historical backlog at a glance
- 📊 **Full board tab** with three views:
  - 📅 **Today**: 3-column layout (pending / done / backlog)
  - 🗓 **Calendar**: 30-day grid with task counts
  - 🌐 **Global**: all pending (deduped) vs all done
- ✍️ **Click to toggle**: writes back to the original source file
- 🔗 **Click to open**: jumps to the source line in the daily note
- 📅 **Tasks plugin metadata**: parses 📅 ⏳ 🛫 ✅ 🔼 emojis and #tags
- 🚫 **No data loss**: strict change-detection on write-back

## Setup

1. Install from Obsidian community plugins (or clone & build)
2. Open Settings → Task Board
3. Set **Daily dir** to your daily-notes folder (e.g. `DailyLife`)
4. Set **File pattern** (default `YYYY-MM-DD.md`)
5. Click **Preview matched files** to verify

## File structure expected

```
<Daily dir>/<YYYY>/<MM>/<YYYY-MM-DD.md>
```

Example:
```
DailyLife/2026/06/2026-06-14.md
```

## Task format

Standard checkbox + Tasks plugin metadata:

```markdown
- [ ] Learn Rust 📅 2026-06-20 🔼 #study
- [x] Morning coffee ✅ 2026-06-14
```

## Development

```bash
npm install
npm test          # run all tests
npm run dev       # watch build
npm run build     # production build → main.js
npm run lint      # typecheck
```

See `docs/MANUAL_QA.md` for the UI acceptance checklist.
