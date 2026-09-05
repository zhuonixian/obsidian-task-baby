# 提醒贪睡与完成交互 — 设计文档

**状态**: Approved · **日期**: 2026-09-05 · **作者**: brainstorming session
**前置**: 基于《每日未完成提醒》功能(v0.2 已合并,commit 931c321)增量调整

## 1. 背景与动机

当前提醒是**不可交互的 Notice**:到点弹一次,立即标记当天已提醒,结束。用户看到提醒时若正忙,只能错过——没有"稍后提醒"(snooze)或"今天处理完了,别再烦我"(dismiss)的选择。

**目标**: 手机闹钟式交互——到点弹 Modal,可选「稍后 N 分钟」重弹或「今日完成」关闭;行为(样式/间隔/次数)全部可配置。

## 2. 范围

### 2.1 In Scope

- Modal 交互载体(替代 Notice 作为默认):摘要文字 +「稍后 N 分钟」+「今日完成」
- 贪睡机制:间隔与次数上限可配置;次数耗尽只显示「今日完成」
- 任何关闭方式(ESC/点背景)等同「今日完成」(弹窗必有着落)
- 贪睡状态持久化:重启/睡眠后由 tick 恢复
- 弹窗 120s 守卫:防止 Modal 叠加
- 3 个新设置项;`notice` 样式保留 v1 行为
- 旧 `reminderState` 数据迁移

### 2.2 Out of Scope

- Modal 内任务清单列表/勾选写回(明确选择不做,仅数量摘要)
- 命令面板 snooze/dismiss 命令
- 独立 setTimeout 精确触发(贪睡由每分钟 tick 驱动,≤1 分钟误差可接受)
- 系统级通知、多提醒时刻

## 3. 用户可见行为

### 3.1 生命周期(默认:间隔 10 分钟,上限 3 次,样式 modal)

```
21:00  Modal:"⏰ 今日还有 3 件未完成 · 2 件今日到期"
       [稍后 10 分钟(还可 3 次)]   [今日完成]
   ├─ 稍后 → 21:10 重弹(还可 2 次)→ 稍后 → 21:20(还可 1)→ 稍后 → 21:30(还可 0)
   │         21:30 的 Modal 只剩 [今日完成]
   ├─ 今日完成 → 当天不再弹
   └─ ESC / 点背景关闭 → 等同「今日完成」
```

### 3.2 关键规则

- **弹窗必有着落**:按钮/ESC/背景关闭都终态化;「稍后」记下一次闹钟
- **次数耗尽**:重弹只显示「今日完成」
- **重启/睡眠恢复**:贪睡状态持久化(21:05 重启,21:10 照弹)
- **新的一天重置**:贪睡次数、终态标记跨日清零
- **后台错过弹窗**:120s 守卫窗口过后 tick 再弹,直到用户处理
- **文案**:沿用现有三种摘要(双段/仅未完成/仅到期)

### 3.3 设置项(追加在"提醒时刻"之后)

| 配置 | 类型 | 默认 | 说明 |
|---|---|---|---|
| `reminderStyle` | `'modal' \| 'notice'` | `'modal'` | 弹窗闹钟式 / 通知条(v1 行为:弹一次即终态,贪睡配置无效) |
| `reminderSnoozeMinutes` | number | `10` | 「稍后」后隔多少分钟重弹(1-120,非法回退 10) |
| `reminderMaxSnoozes` | number | `3` | 最大贪睡次数(0-10;`0` = 首弹即只有「今日完成」) |

## 4. 架构

### 4.1 文件改动

```
src/reminder/
├── reminderService.ts        改 — evaluateReminder、ReminderState 扩展、runReminderCheck 分支
├── reminderModal.ts          ★ 新增 — dumb Modal 组件(按钮 + 回调)
└── reminderService.test.ts   改 — 决策函数与交互流新用例
src/main.ts                   改 — saveReminderState 通用化、deps 装配、旧状态迁移
src/types.ts / config/defaultSettings.ts / config/settingsTab.ts  改 — 3 新配置
src/reminder/reminderModal.test.ts ★ 新增(jsdom)
```

数据层依旧零改动。

### 4.2 状态模型(data.json 平行字段 `reminderState`)

```typescript
interface ReminderState {
  dayKey: string | null;        // "2026-09-05";≠ 今天 → 视为全新一天(count=0 等)
  finalized: boolean;           // 当天终态
  snoozeCount: number;          // 当天已贪睡次数
  snoozedUntil: string | null;  // ISO 时刻;非空且未到 → 贪睡中
  lastPopupAt: string | null;   // 最近弹窗时刻(ISO);120s 守卫
}
```

**旧数据迁移**:`{ lastReminderDate }` → `{ dayKey: lastReminderDate, finalized: true, snoozeCount: 0, snoozedUntil: null, lastPopupAt: null }`(昨天终态 = 今天全新,语义兼容)。

### 4.3 决策纯函数

```typescript
type ReminderDecision = 'skip' | 'remind' | 'notice';

function evaluateReminder(
  now: Date,
  settings: TaskBoardSettings,
  state: ReminderState
): ReminderDecision
// skip:   未到 reminderTime | finalized | 贪睡中(now < snoozedUntil)
//         | 120s 弹窗守卫内(now < lastPopupAt + 120_000)
// remind: reminderStyle='modal' 且该弹了(首轮:过时刻未终态无 until;
//         贪睡轮:now >= snoozedUntil)
// notice: reminderStyle='notice' 且过时刻未终态(= v1 条件)
```

`shouldRemind` 被此函数取代(删除,调用点迁移)。

### 4.4 交互流(runReminderCheck)

```
runReminderCheck(host, deps):
  decision = evaluateReminder(now, settings, state)
  'skip' → return
  snapshot = await getSnapshot(...)
  errors>0 → return(不写任何状态)
  summary = summarize(...)
  'notice':notify(文案);写终态;return            ← v1 行为
  'remind' 且 summary 全 0:不弹;写终态;return     ← 空任务日
  'remind':写 lastPopupAt(守卫生效)→ deps.presentModal({
              message: 文案,
              snoozeRemaining: maxSnoozes - snoozeCount,
              snoozeMinutes: reminderSnoozeMinutes,
              onSnooze: 写 {snoozeCount+1, snoozedUntil=now+N分钟, lastPopupAt=null},
              onFinal:  写 {finalized: true, snoozedUntil: null, lastPopupAt: null}
            })
```

**ReminderDeps 扩展**:`presentModal(options): void` 与 notify/getSnapshot 同级注入;服务层测试继续零 Obsidian 依赖。

### 4.5 Modal 组件(reminderModal.ts)

- dumb 组件:接收 message/按钮文案/回调,无自身状态逻辑
- `snoozeRemaining > 0` → 两按钮「稍后 N 分钟(还可 M 次)」「今日完成」;`= 0` → 仅「今日完成」
- 按钮回调先设 flag 再关闭;`onClose`(ESC/背景)统一走 `onFinal`,flag 防重复/覆盖

### 4.6 main.ts

- `saveReminderDate` 泛化为 `saveReminderState(state: ReminderState)`(写入 data.json,与 settings 同键 `reminderState`)
- `loadSettings` 内完成旧状态迁移(§4.2)
- 接线不变:60s tick + onLayoutReady 10s 启动补提醒走同一条 `runReminderCheck`

## 5. 边界情况

| 场景 | 行为 |
|---|---|
| 贪睡跨午夜(23:55 +30min) | `snoozedUntil` 在次日但 dayKey 是昨天 → 新一天按未到点处理,当晚重新首轮;极端场景损失一次可接受 |
| 贪睡中改小 maxSnoozes(3→1,count=2) | 下次弹窗只显示「今日完成」(max 只控按钮显示)→ 自然收敛 |
| 贪睡中改间隔分钟数 | 无影响(until 是按下那刻的绝对时刻) |
| 样式 modal→notice | 到点弹一次即终态,贪睡状态被终态覆盖 |
| 贪睡期间用户勾完全部任务 | 到期弹窗基于新快照重新计数(可能为 0 → 空任务处理) |
| 空任务日 | 不弹,写 finalized(v1"无事不扰"语义保留) |
| errors>0 | 跳过且不写任何状态(含守卫),下分钟重试 |
| 贪睡到期时 Obsidian 关着 | 启动补提醒走同一 evaluate → 弹 |
| 弹窗打开期间 tick 触发 | 120s 守卫拦截,Modal 不叠加 |
| 点「稍后」瞬间又到 tick | 状态先写库再关 Modal,tick 读到新 until → skip |

## 6. 测试策略

### 6.1 单元(reminderService.test.ts)

**evaluateReminder**:
- 未到点 → skip;finalized → skip;贪睡中 → skip;120s 守卫内 → skip
- 首轮(过时刻、未终态、无 until)→ remind
- 贪睡到期(now >= until)→ remind
- 旧 dayKey(昨天状态)→ 跨日归一为首轮条件
- notice 样式 → notice;notice + 已终态 → skip

**runReminderCheck**(注入 mock):
- modal:presentModal 调用,携带正确 snoozeRemaining/snoozeMinutes/message
- onSnooze 回调执行 → 状态 {count+1, until≈now+N, lastPopupAt=null} 持久化
- onFinal 回调执行 → finalized 持久化
- 空任务:不 presentModal,写终态
- errors>0:不 presentModal 不写状态
- notice:notify + 终态

### 6.2 组件(reminderModal.test.ts,jsdom)

- snoozeRemaining>0 → 两按钮;=0 → 仅「今日完成」
- 按钮点击触发对应回调;关闭兜底只生效一次

### 6.3 手动验收(追加 MANUAL_QA)

- [ ] 「稍后 1 分钟」→ 1-2 分钟后重弹,次数递减
- [ ] 次数耗尽 → 只显示「今日完成」
- [ ] ESC 关闭 = 今日完成,不再弹
- [ ] 贪睡中重启 Obsidian → 到期仍弹
- [ ] 样式切 notice → v1 行为(弹一次即终态)
- [ ] 贪睡上限设 0 → 首弹即只有「今日完成」
- [ ] 旧 data.json(仅 lastReminderDate)升级后行为正常

## 7. 后续版本路线(仅记录,不在本 spec 范围)

- 命令面板 snooze/dismiss 命令
- Modal 任务清单(可勾选写回)
- 截止时刻制贪睡(超过某时刻不再弹)
