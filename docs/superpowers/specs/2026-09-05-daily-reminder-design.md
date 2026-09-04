# 每日未完成提醒 — 设计文档

**状态**: Approved · **日期**: 2026-09-05 · **作者**: brainstorming session
**前置**: 基于 v0.1.0(2026-06-14 任务看板设计)之上增量

## 1. 背景与动机

v0.1.0 的任务看板是**纯拉取式**:打开面板或点 ⟳ 才扫描,不打开就看不到。用户一天结束时可能忘了还有任务没完成,而插件已解析的 `📅 due` / `⏳ scheduled` 元数据只用于展示,从未驱动任何主动行为。

**目标**: 每日固定时刻主动检查并弹 Notice 提醒,覆盖"忘了看面板"的场景。

## 2. 范围

### 2.1 In Scope

- 每日固定时刻(默认 21:00,可配)自动扫描 + Notice 提醒
- 提醒两类内容:
  - **今日未完成 N**: 今日日志里 `checked = false` 的任务数
  - **今日到期 M**: 历史日志中 `📅 = today` 或 `⏳ = today` 且未完成的任务数(排除 `sourceDate = today`,避免与 N 重复计数)
- 启动补提醒:提醒时刻已过且当天未检查过 → 启动后延迟 10s 补弹
- "已检查"状态按天持久化,重启不重复弹
- 设置页新增 2 项:每日提醒开关、提醒时刻

### 2.2 Out of Scope

- 系统级桌面通知(Electron Notification API)——后续版本
- Modal 任务清单、状态栏徽章
- 逾期任务(due 已过未完成)提醒——本次不做,数据已具备,后续可加
- 间隔轮询检测"刚到期"的任务
- Obsidian 未运行时的提醒(无后台进程,做不到)

## 3. 方案选型

**选定: 方案 A 分钟级轮询 tick**(`registerInterval(60_000, ...)`)

每次 tick 做廉价字符串比较判断"该不该提醒",该提醒才触发扫描。启动补提醒免费获得(onload 后第一次 tick 即发现"已过时刻且未提醒")。睡眠/唤醒天然正确(tick 重新读墙钟)。

否决的备选:

- **精确 setTimeout**: 到点秒弹,但需额外处理睡眠冻结、改设置重算、错过补偿——复杂度翻倍换 ≤1 分钟精度,不值
- **轮询 + 状态栏徽章**: 超出已确认范围

提醒最迟晚 1 分钟触发,对每日提醒场景无感。

## 4. 用户可见行为

### 4.1 提醒文案(Notice,10s)

```
两类都有:  ⏰ 今日还有 3 件未完成 · 2 件今日到期
仅未完成:  ⏰ 今日还有 3 件未完成
仅到期:    ⏰ 今日有 2 件到期任务
全空:      不弹(当天仍标记已检查,不反复扫)
```

### 4.2 两个数字的定义

| 数字 | 含义 | 来源 |
|---|---|---|
| 今日未完成 N | 今日日志 `checked = false` | `snapshot.today.pending.length` |
| 今日到期 M | 历史日志未完成任务中 `meta.due = today` 或 `meta.scheduled = today` | `snapshot.allPending` 过滤,**排除** `sourceDate = today` |

### 4.3 启动补提醒

- Obsidian 在过时刻后打开且当天未检查 → `onLayoutReady` 后延迟 10s 补弹(避开启动索引高峰)
- 当天已检查过(无论弹没弹)→ 重启任意次数不再弹

### 4.4 设置页新增(现有 7 项后追加)

| 字段 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `reminderEnabled` | boolean | `true` | 每日提醒开关(用户主动装的功能,默认工作) |
| `reminderTime` | string | `"21:00"` | `HH:mm` 格式;非法输入失焦回退上次有效值 |

## 5. 架构

### 5.1 文件改动

```
src/
├── reminder/
│   ├── reminderService.ts       ★ 新增
│   └── reminderService.test.ts  ★ 新增
├── main.ts                      改 — 注册 interval + onLayoutReady 接线
├── types.ts                     改 — TaskBoardSettings +2 字段
└── config/
    ├── defaultSettings.ts       改 — 默认值
    └── settingsTab.ts           改 — 设置 UI +2 项
```

数据层(fileScanner / taskParser / taskIndex / snapshotService / taskWriter)**零改动**。

### 5.2 reminderService 结构(纯逻辑与副作用分离)

```typescript
// 纯函数:该不该提醒。不碰 vault、不弹 Notice
export function shouldRemind(
  now: Date,
  reminderTime: string,
  lastReminderDate: string | null
): boolean

// 纯函数:从快照算两个数字
export function summarize(
  snapshot: IndexSnapshot,
  today: Date
): { pendingToday: number; dueToday: number }

// 副作用封装:扫描 + Notice + 持久化
export async function runReminderCheck(plugin: TaskBoardPlugin): Promise<void>
```

### 5.3 main.ts 接线

```
onload:
  registerInterval(60_000, () => runReminderCheck(this))
  workspace.onLayoutReady(() =>
    setTimeout(() => runReminderCheck(this), 10_000))

runReminderCheck:
  !reminderEnabled → return
  !shouldRemind(now, reminderTime, lastReminderDate) → return   // 每分钟仅 2 次字符串比较
  snapshot = await getSnapshot(...)          // 复用现有 inflight 互斥
  snapshot.errors.length > 0 → return        // 数据不可信:跳过且不标记,下分钟重试
  { pendingToday, dueToday } = summarize(snapshot, today)
  任一 > 0 → new Notice(文案, 10_000)
  saveReminderDate(today)                    // 无论弹没弹都标记当天已检查
```

### 5.4 持久化

`lastReminderDate`(YYYY-MM-DD 字符串)存入 Plugin `loadData()/saveData()` 的同一 data.json,作为**平行字段** `reminderState: { lastReminderDate: string | null }`,不进 `TaskBoardSettings`——它是运行时状态而非用户配置,避免混入 `Object.assign` 设置合并逻辑。

### 5.5 并发与重入

- tick 触发扫描与面板刷新并发 → `getSnapshot` 的 `inflight` 互斥共享同一 Promise
- 扫描超 60s 时下一 tick 重入:时刻已过、日期未写 → 再次触发 → 被 `inflight` 合并,Notice 不叠加

## 6. 边界情况

| 场景 | 行为 |
|---|---|
| `reminderTime` 非法(`25:99`/`abc`) | `shouldRemind` 解析失败按 `21:00`;设置页失焦校验回退 |
| 23:50 设置、00:01 才 tick(跨日) | 以 tick 时刻的当天判断:00:01 时未到当日 23:50 → 不弹;当晚正常弹。极端瞬间损失一次可接受 |
| 扫描时文件读失败(errors>0) | 跳过本次提醒且**不**标记日期,下分钟重试(不基于残缺数据乱报) |
| 提醒后立刻勾掉所有任务 | 不撤回 Notice,10s 自然消失 |
| `reminderEnabled = false` | tick 直接 return;已存 `lastReminderDate` 保留,重开后从下一时刻起正常 |

## 7. 测试策略

### 7.1 单元测试(reminderService.test.ts)

**shouldRemind**:
- 过时刻未提醒 → true
- 过时刻已提醒(当天) → false
- 未到时刻 → false
- 昨天提醒过、今天未到点 → false
- 时刻非法 → 按 21:00 行为

**summarize**:
- 今日 pending 计入 pendingToday
- 历史日志 `📅 = today` 计入 dueToday
- 今日日志 `📅 = today` 不重复计入 dueToday
- `⏳ = today` 计入 dueToday
- 已完成任务不计
- 全空 → `{0, 0}`

**runReminderCheck**(mock plugin / vault / Notice):
- 有任务 → Notice 调用 + 日期持久化
- 全空 → 无 Notice、日期仍持久化
- errors>0 → 无 Notice、日期不持久化

### 7.2 手动验收(追加到 docs/MANUAL_QA.md)

- [ ] 时刻改成 1 分钟后 → 1~2 分钟内弹 Notice
- [ ] 弹过后重启 Obsidian → 不再弹
- [ ] 时刻已过且当天未弹 → 启动 10s 后补弹
- [ ] 关闭开关 → 到点不弹
- [ ] 单项为 0 时文案只显示另一项
- [ ] 非法时刻输入 → 失焦回退

## 8. 后续版本路线(仅记录,不在本 spec 范围)

- 系统级桌面通知(Electron Notification)
- 逾期任务(due 已过)提醒——`summarize` 加一类即可
- 提醒时刻多档(早/晚双提醒)
