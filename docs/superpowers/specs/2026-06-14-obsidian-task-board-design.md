# Obsidian 任务看板插件 — 设计文档

**状态**: Draft · **日期**: 2026-06-14 · **作者**: brainstorming session

## 1. 背景与动机

用户使用 Obsidian 按天写日志（路径 `DailyLife/YYYY/MM/YYYY-MM-DD.md`），日志里临时写计划和任务（标准 checkbox + Tasks 插件元数据）。

**痛点**: 想看"今天还有什么没做"、"历史积压任务"、"近期完成情况"时，只能逐个点开日志文件或用 CLI 统计，不直观。

**目标**: 一个插件，提供实时看板，把最近一个月日志里的任务（已完成/未完成）可视化展示，支持面板内直接勾选（写回原文件）。

## 2. 范围

### 2.1 In Scope（第一版）

- 扫描配置目录下、最近 30 天（可配置）的日志文件
- 解析标准 checkbox（`- [ ]` / `- [x]`）+ Tasks 插件元数据（📅 ⏳ 🛫 ✅ 🔁 🔼🔽 等 emoji + `#tag`）
- 两个 UI 入口：
  - **侧栏简版面板**（SidebarCompactView）：今日未完 + 积压（已完成折叠）
  - **标签页完整看板**（BoardTabView）：三视图 tab 切换（今日 / 日历 / 全局）
- 跨日积压："两者都算"——历史未完成任务同时在原日期和今日显示
- 面板内勾选/取消勾选，写回**最初创建那天的源文件**
- 点击任务正文跳转到源文件对应行
- 打开时扫一次 + 手动 ⟳ 刷新按钮

### 2.2 Out of Scope（明确不做）

- 子任务嵌套（子任务联动勾选）—— v2
- 多行任务（跨行的折叠任务）—— v2，v1 只识别单行任务
- 在面板内新建任务
- 自动刷新（事件驱动 / 定时轮询）
- 跨 vault 同步
- 移动端优化（先保证桌面）

### 2.3 非目标

- **不**替代 Tasks 插件本身（不展开重复规则、不维护自己的任务数据库）
- **不**做长期持久化缓存（重启即清空，每次打开重建）
- **不**追求"零延迟"——打开/刷新有 200-500ms 延迟可接受

## 3. 架构

### 3.1 三层架构

```
配置层 (PluginSettings)
   ↓
数据层 (FileScanner → TaskParser → TaskIndex → TaskWriter)
   ↓
UI 层 (SidebarCompactView  +  BoardTabView)
```

**核心原则**:
- **文件即真相**: 所有任务状态以 vault 文件为准，内存缓存只缓存解析结果，不持久化
- **数据层无状态**: 每次扫描都重建 IndexSnapshot，UI 渲染时一次性替换 DOM
- **两个 UI 入口共用数据层**: 侧栏简版 = 看板"今日"视图的子集

### 3.2 项目结构

```
src/
├── main.ts              # 插件入口，注册视图/命令/设置
├── types.ts             # Task / ParsedMeta / ViewMode 等类型
├── config/
│   ├── defaultSettings.ts
│   └── settingsTab.ts
├── data/
│   ├── fileScanner.ts   # 列文件 + 过滤时间窗口
│   ├── taskParser.ts    # markdown → Task，解析 emoji
│   ├── taskIndex.ts     # 内存索引 + 跨日积压计算
│   └── taskWriter.ts    # 写回勾选状态
├── views/
│   ├── sidebarView.ts   # 简版面板 ItemView
│   ├── boardView.ts     # 完整看板 ItemView
│   └── components/
│       ├── taskItem.ts
│       ├── groupSection.ts
│       └── calendarGrid.ts
└── utils/
    ├── dateUtils.ts
    └── domHelpers.ts    # h() 创建元素的 helper
```

### 3.3 数据流

```
打开面板 / 点击 ⟳
    │
    ▼
FileScanner.listFiles(rangeDays) → TFile[]
    │
    ▼
TaskParser.parse(file) → Task[]                # 每文件解析一次
    │
    ▼
TaskIndex.build(tasks) → IndexSnapshot          # 含跨日积压计算
    │
    ▼
View.render(snapshot) → DOM

─── 用户勾选 ───
View.onToggle(task)
    │
    ▼
TaskWriter.toggle(sourceFile, lineNum)          # vault.process 改写行
    │
    ▼
触发 refresh ⟲
```

## 4. 数据模型

### 4.1 Task

```typescript
interface Task {
  // —— 来源定位 ——
  sourcePath: string            // "DailyLife/2026/06/2026-06-10.md"
  sourceDate: Date              // 从文件名解析，= 任务"创建日"
  lineStart: number             // 在原文件中的行号（0-based）
  lineEnd: number               // 多行任务的最后一行（v1 = lineStart）

  // —— 核心字段 ——
  rawText: string               // 原始 markdown 文本（含 checkbox）
  body: string                  // 去掉 checkbox 后的正文
  checked: boolean
  indent: number                // 缩进层级（嵌套子任务用）

  // —— Tasks 元数据（可空）——
  meta?: TaskMeta
}

interface TaskMeta {
  due?: Date                    // 📅
  scheduled?: Date              // ⏳
  start?: Date                  // 🛫
  done?: Date                   // ✅
  priority?: 'lowest'|'low'|'medium'|'high'|'highest'
  recurrence?: string           // 🔁 原始规则文本（不展开）
  tags: string[]                // #tag 全部收集
}
```

**v1 不包含**: `blockId`（^xxx 引用）、`order`（同组排序键）—— YAGNI。

### 4.2 IndexSnapshot

```typescript
interface IndexSnapshot {
  generatedAt: Date
  windowStart: Date             // rangeDays 之前
  windowEnd: Date               // = today

  // 给"今日视图"用
  today: {
    pending: Task[]             // 今日日志里未完成
    done: Task[]                // 今日日志里已完成
    backlog: Task[]             // 历史日期未完成、滚到今天
  }

  // 给"日历视图"用
  byDate: Map<string, { pending: Task[]; done: Task[] }>
                                // key = "2026-06-10"

  // 给"全局视图"用
  allPending: Task[]            // 窗口内所有未完成（已去重）
  allDone: Task[]               // 窗口内所有已完成

  // —— 错误收集 ——
  errors: { path: string; error: Error }[]
  unparsed: TFile[]             // 文件名不匹配的文件
}
```

## 5. 解析规则（TaskParser）

每个 markdown 文件按行扫描：

| 步骤 | 规则 | 例子 |
|---|---|---|
| 1. 识别任务行 | 正则匹配 `^(\s*)[-*+] \[( \|x)\] (.+)$` | `- [ ] 学 Rust 📅 2026-06-20 🔼` |
| 2. 收集缩进 | 记下 `indent = leadingSpaces.length` | `  - [ ] 子任务` → indent=2 |
| 3. 抽 emoji 元数据 | Tasks 同款 emoji 正则提取；提取后从 body 移除（仅渲染层用） | `📅 2026-06-20` → `meta.due` |
| 4. 抽 tag | 正则 `/#([\w一-龥-]+)/g` | `#p1 #work` → tags 数组 |
| 5. 多行任务 | **v1 不支持**：下一行无论缩进都视为独立行；`lineEnd = lineStart` | — |
| 6. 跳过代码块 | 遇 ```` ``` ```` 进入 skip 状态，不解析内部 | 避免误判 |
| 7. emoji 日期格式 | 只认 `YYYY-MM-DD`，其他格式 meta 字段留空、正文原样保留 | `📅 6/20` 不解析 |

**Emoji 速查表**（与 Tasks 插件一致）:
- 📅 due · ⏳ scheduled · 🛫 start · ✅ done · 🔁 recurrence
- ⏫ highest · 🔼 high · 🔽 low · ⏬ lowest

## 6. 跨日积压算法

**定义**: 积压任务 = 在历史日期 `d < today` 创建、当前 `checked = false` 的任务。

```typescript
function computeBacklog(
  allTasksByDate: Map<string, Task[]>,
  today: Date
): Task[] {
  const backlog: Task[] = []
  for (const [dateStr, tasks] of allTasksByDate) {
    if (parseDate(dateStr) >= today) continue   // 只看历史
    for (const t of tasks) {
      if (!t.checked) backlog.push(t)
    }
  }
  return backlog.sort(byPriorityThenDate)       // 高优先级 + 早日期在前
}
```

**"两者都算"具体表现**:
- 日历视图点开 `2026-06-10` → 看到"学 Rust"在 **未完成** 区
- 日历视图点开 `今天` → 看到"学 Rust"在 **积压** 区（带 `6-10` 来源标签）
- 全局视图 **未完成** 栏 → 只出现一次（按 `sourcePath + lineStart` 去重）

**注意**: 同一任务对象在 `byDate[date]` 和 `today.backlog` 中都会被引用（同一对象引用），UI 渲染时分别展示，互不影响；任一处的勾选写回都修改同一源文件，刷新后两处都自动更新。

## 7. 写回规则（TaskWriter）

```typescript
async function toggleTask(task: Task): Promise<void> {
  const file = vault.getAbstractFileByPath(task.sourcePath)
  const content = await vault.read(file)
  const lines = content.split('\n')

  // —— 防数据损坏校验 ——
  const line = lines[task.lineStart]
  const lineMatch = line.match(/^(\s*[-*+] \[)( |x)(\].*)$/)
  if (!lineMatch) {
    throw new TaskLineChangedError(`行 ${task.lineStart} 已不是任务格式`)
  }
  // body hash 校验（stripMeta 函数去掉 emoji/tag/checkbox marker 后的纯正文，
  // 用于检测"用户编辑过任务正文"的情况；hash 用简单的字符串 hash 即可）
  const currentBody = stripMeta(lineMatch[3])
  const expectedBody = stripMeta(task.body)
  if (hash(currentBody) !== hash(expectedBody)) {
    throw new TaskBodyChangedError('任务正文已变化，请刷新面板')
  }

  // —— 改写 checkbox marker ——
  const newMarker = task.checked ? ' ' : 'x'
  lines[task.lineStart] = line.replace(lineMatch[0], `${lineMatch[1]}${newMarker}${lineMatch[3]}`)

  // —— Tasks 完成 emoji 管理 ——
  // 受 settings.appendDoneDate 控制（默认 true）
  if (!task.checked && settings.appendDoneDate) {
    // 勾选完成 → 追加 ✅ YYYY-MM-DD
    lines[task.lineStart] += ` ✅ ${formatDate(new Date())}`
  } else if (task.checked) {
    // 取消勾选 → 移除 ✅ 及其日期
    lines[task.lineStart] = lines[task.lineStart].replace(/\s+✅\s*\d{4}-\d{2}-\d{2}/, '')
  }

  await vault.modify(file, lines.join('\n'))
}
```

**校验严格度**: 严格校验（A 方案）—— `lineStart` 行仍是任务格式 + body hash 匹配，任一不满足就 abort，绝不"猜测式"写回。

## 8. UI 设计

### 8.1 侧栏简版（SidebarCompactView）

宽度 ~300px。结构：
```
📋 任务简版                    [⟳ 刷新]
─────────────────────────────────────
今日未完 (3)
  ☐ 学 Rust  📅6-20  [高]
  ☐ 写周报
  ☐ 健身 30min

历史积压 (5)              ▾ 折叠
  ☐ 学 Rust              [6-10]
  ☐ 读完《XX》           [6-11]
  ☐ 给老妈打电话         [6-12]
  + 还有 2 条 · 点击展开

今日已完成 (2)            ▸ 折叠
─────────────────────────────────────
       [📊 打开完整看板]
```

- 默认展开"今日未完 + 历史积压"
- "今日已完成"默认折叠（点开才显示）
- 历史积压超过 `sidebarCompactLimit`（默认 5）时折叠剩余
- 底部"打开完整看板"按钮触发 `BoardTabView`

### 8.2 标签页 — 今日视图

三栏并排（全宽）：
```
📊 任务看板 — 2026-06-14（今日）   [⟳ 刷新]
─────────────────────────────────────
[📅 今日] [🗓 日历] [🌐 全局]      [⚙ 设置]

▢ 未完成 (3)      ☑ 已完成 (2)    ⏳ 历史积压 (5)
☐ 学 Rust [高]    ☑ 早咖啡        ☐ 学 Rust         [6-10]
☐ 写周报          ☑ 写日报        ☐ 读完《XX》       [6-11]
☐ 健身 30min                      ☐ 给老妈打电话     [6-12]
                                  ☐ 买狗粮          [6-12]
                                  ☐ 回邮件          [6-13]
```

### 8.3 标签页 — 日历视图

30 天 7 列网格，每个单元格显示日期 + 数量徽章（`▢N` 未完成红 / `☑N` 已完成绿）：

```
2026-05-15 ~ 2026-06-14
一   二   三   四   五   六   日
                  15   16   17
                ▢2☑1 ▢0☑3 ☑2

18   19   20   ...
▢1☑4 ▢3  ☑5

[今日 14]
▢3+5 ☑2          ← 今日含 5 条积压

—— 点击单元格展开 ——
2026-06-12 · 周五
☐ 读书
☐ 开周会
☑ 写文档
☑ 提交 PR
```

### 8.4 标签页 — 全局视图

双栏，所有未完成（去重）/ 所有已完成：

```
▢ 未完成 (12)            ☑ 已完成 (47)
· 排序：优先级↑ 日期↑    · 排序：完成日↓

☐ 学 Rust [高]    [6-10]   ☑ 早咖啡     ✅6-14  [6-14]
☐ 学 Rust [高]    [6-14]   ☑ 写日报     ✅6-14  [6-14]
☐ 读完《XX》      [6-11]   ☑ 提交 PR    ✅6-13  [6-13]
☐ 给老妈打电话    [6-12]   ☑ 修复 bug   ✅6-13  [6-13]
☐ 买狗粮          [6-12]   ☑ 晨会       ✅6-12  [6-12]
☐ 回邮件          [6-13]   ...
```

### 8.5 任务条交互（所有视图一致）

- **点 checkbox**: 切换状态 → 调 `TaskWriter.toggle` → 成功后 Notice "✓ 已完成 X"（5s）→ 强制 refresh
- **点正文**: 跳转到源文件 → `workspace.openLinkText` + 滚动到 `lineStart` 行
- **悬停**: 显示 tooltip（完整正文 + 元数据 + 来源路径）

## 9. 错误处理

### 9.1 失败点 × 处理策略

| 类别 | 失败点 | 处理策略 | 严重度 |
|---|---|---|---|
| 文件读取 | 路径下找不到日志文件 | 面板显示空状态"窗口内无日志文件"，附设置入口 | 低 · 静默 |
| 文件读取 | 单个文件读取抛错 | try-catch 跳过，计入 `snapshot.errors[]`，不阻塞其他文件 | 中 · 警告角标 |
| 文件名 | 不匹配 filePattern | 严格过滤，忽略非匹配文件 | 低 · 静默 |
| 文件名 | 日期格式不一致（`2026-6-12` vs `2026-06-12`） | 严格 `YYYY-MM-DD` 解析；失败的归入 `unparsed` | 中 · 设置提示 |
| 文件名 | 改了 dailyDir 忘同步 pattern | 设置页给"测试匹配"按钮，预览最近 5 个匹配 | 低 · UX |
| 解析 | emoji 日期非标 | 只认 `YYYY-MM-DD`，其他留空、正文原样 | 低 · 静默 |
| 解析 | 代码块内伪任务 | ``` 进入 skip 模式 | 低 · 静默 |
| 解析 | 任务 > 5000 条 | v1 不分页；实测卡顿则 v1.1 加虚拟列表 | 低 · 监控 |
| 写回 | 行号已变化 | 写回前 `vault.read` 取最新；lineStart 行 + body hash 校验；不匹配 abort + Notice "任务已变化，请刷新面板" | 高 · 防损坏 |
| 写回 | 正则不匹配（行变非任务） | abort + Notice + 强制 refresh | 高 · 防损坏 |
| 写回 | `vault.modify` 失败 | catch + Notice，UI checkbox 回滚 | 中 · UI 回滚 |
| 并发 | 快速点多次 ⟳ | `refreshing: boolean` 守卫，进行中再点忽略 | 低 · 防抖 |
| 并发 | 侧栏 + 标签页同时勾选 | 写回成功后两处都 refresh，后写者读到最新内容自动收敛 | 低 · 自动收敛 |
| 设置 | dailyDir / pattern / rangeDays 改了 | onChange → 清缓存 + 强制 refresh + 关闭已打开的视图 | 低 · 一致性 |
| 设置 | enableTasksMetadata 关闭 | Parser 跳过 emoji 提取；已有快照失效，重新解析 | 低 · 重新解析 |

### 9.2 Notice 节制原则

- **不弹 Notice**: 找不到日志文件、单文件解析失败、非标日期、代码块伪任务、用户改了设置（直接重新渲染）
- **弹 Notice（瞬时 5s）**: 写回成功（"✓ 已完成 X"）——即时反馈
- **弹 Notice（需确认）**: 写回失败、行号/正文不匹配、`vault.modify` 抛错
- **面板内联错误条**: 多文件解析时部分失败，顶部"⚠ 3 个文件解析失败 · 点击查看"，不阻塞

### 9.3 关键不变量

1. **写回绝不破坏原文件结构**: 只用 `lines.join('\n')` 重组；正则替换前校验整行仍是任务格式；任何不确定性 → abort 而非猜测
2. **跨视图数据一致**: 所有视图读同一个 IndexSnapshot；任一视图触发 toggle → 写回成功后通知所有视图 refresh
3. **面板永不卡死**: 所有 IO 包 try-catch；解析失败计入 errors[] 不抛；refresh 内部有 mutex；UI 永远能渲染（哪怕空状态）
4. **缓存可丢弃**: TaskIndex 不持久化；插件重启 / 设置变更 / vault 重载 → 缓存清空，下次打开重建

## 10. 测试策略

### 10.1 测试分层

| 层 | 范围 | 工具 | 覆盖目标 |
|---|---|---|---|
| 单元 | TaskParser / FileScanner / TaskIndex / TaskWriter | jest + ts-jest | 核心逻辑 100% |
| 集成 | 临时 vault 端到端流程 | jest + tmp dir | 跨模块协作 |
| 手动 | UI 渲染 + 交互 | 验收清单 | 关键路径必过 |

### 10.2 单元测试 case（必须）

**TaskParser**:
- 标准 `- [ ] xxx` / `- [x] xxx`
- 缩进（顶层 / 子任务）
- emoji 元数据（📅 ⏳ 🛫 ✅ 🔁）
- priority（🔼 🔽 等）
- tags（#tag）
- 跳过代码块内伪任务
- 容错：空文件 / 非 markdown / 中文 emoji 混排 / 畸形行

**FileScanner**:
- 列出窗口内文件（mock vault）
- 严格按 filePattern 过滤
- 文件名日期解析失败 → 归入 unparsed

**TaskIndex.computeBacklog**:
- 历史未完成 → 进 backlog
- 今日任务 → 不进 backlog
- 已完成 → 不进 backlog
- 同任务在 byDate + today.backlog 都出现（同对象引用）
- 全局视图去重（sourcePath + lineStart）

**TaskWriter.toggle**:
- 勾选：`[ ]` → `[x]` + 追加 ✅ 日期
- 取消：`[x]` → `[ ]` + 移除 ✅ 日期
- 行号/body hash 不匹配 → abort，文件不变
- 行已变成非任务格式 → abort，文件不变

### 10.3 集成测试 case

- 完整流程：扫描 → 解析 → 建索引 → toggle → 重新扫描验证状态变化
- 跨日积压：vault 含 6-10/6-12/6-14 三天，验证 today.backlog 含 6-10 任务
- 写回正确性：toggle 后 `fs.readFile` 读原文件，逐字符比对预期

### 10.4 UI 手动验收清单

- [ ] 安装插件 → 侧栏出现图标
- [ ] 点击图标 → 简版面板渲染今日 + 积压
- [ ] 命令面板 "打开任务看板" → 标签页打开
- [ ] 今日视图：三栏并排正确
- [ ] 日历视图：30 天网格 + 徽章正确
- [ ] 全局视图：未完成去重 + 排序正确
- [ ] 点 checkbox → 文件被改 + 面板自动刷新
- [ ] 点正文 → 跳转到源文件正确行
- [ ] 改设置 dailyDir → 面板重新渲染
- [ ] 测试主题切换（默认 / 暗 / 月光）：CSS 变量都正确
- [ ] 测试窄侧栏（拖到 240px）：布局不溢出

### 10.5 测试 fixture

```
__fixtures__/
├── vault-30d/                  # 模拟 30 天日志，混合各种任务
│   └── DailyLife/
│       ├── 2026/05/{15-31}.md
│       └── 2026/06/{1-14}.md
├── cases/                      # 单元测试 case 文件
│   ├── basic-checkbox.md
│   ├── nested-tasks.md
│   ├── tasks-plugin-metadata.md
│   ├── codeblock-with-tasks.md
│   ├── malformed.md
│   └── cn-emoji-mix.md         # 中文 + emoji 混排
└── expected/                   # 对应 cases 的预期输出 JSON
```

## 11. 工具链

```
esbuild           # 打包 main.js，~30KB
typescript 5.x    # 严格模式
jest + ts-jest    # 单元 + 集成
```

**package.json scripts**:
```json
{
  "scripts": {
    "dev":     "esbuild src/main.ts --bundle --watch --outfile=main.js",
    "build":   "esbuild src/main.ts --bundle --minify --outfile=main.js",
    "test":    "jest",
    "test:w":  "jest --watch",
    "lint":    "tsc --noEmit"
  }
}
```

**Obsidian 模块 mock**: `__mocks__/obsidian.ts` 提供 Vault / TFile / App 等 stub，便于单元测试脱离 Obsidian 运行时。

**不引入**: Cypress / Playwright（Obsidian 是 Electron 应用，端到端测试需要起 Electron 实例 + 装插件，ROI 太低）。

## 12. 设置项（PluginSettingTab）

| 字段 | 类型 | 默认值 | 说明 |
|---|---|---|---|
| `dailyDir` | string | `DailyLife` | 日志根目录 |
| `filePattern` | string | `YYYY-MM-DD.md` | 文件名格式 |
| `rangeDays` | number | `30` | 默认时间窗口（天） |
| `enableTasksMetadata` | boolean | `true` | 是否解析 Tasks 插件 emoji |
| `sidebarCompactLimit` | number | `5` | 侧栏简版最多显示积压条数 |
| `appendDoneDate` | boolean | `true` | 勾选时是否追加 ✅ 日期 |

**测试匹配按钮**: 设置页底部一个按钮，点击后弹出 modal，列出最近 5 个匹配 `dailyDir + filePattern` 的文件路径，让用户验证配置正确性。

## 13. 后续版本路线（仅记录，不在本 spec 范围）

- **v1.1**: 性能监控 + 必要时引入虚拟列表
- **v2**: 子任务嵌套（父子勾选联动）
- **v2**: 多行任务（折叠行）
- **v2**: 面板内新建任务
- **v3**: 事件驱动增量刷新（监听 vault modify）
- **v3**: 任务搜索 / 过滤（按 tag / 优先级 / 文本）
