# Design：睡前数钱场景（bedtime-money-counting）

## Context

动机见 proposal.md。当前架构约束（决定本设计形态）：

- 内核平台无关纪律由 `scripts/import-audit.mjs` 静态强制：夜间能力不得引入新平台 API；
- 全部状态机是纯函数 reducer（`flap-state.ts`、`draw-judgment.ts`），副作用经 effects 由 `game.ts` 编排消费——夜间剖面与静默必须沿用此分层；
- 状态边界：会话进度（金额/张数）不落盘，元进程经 `serialize/parsePersistedGameState` 落 `money-lai/state/v1`（`PersistedGameStateV1`，schemaVersion 1，损坏静默重置）；
- 音频合成参数集中在 `AUDIO_SYNTHESIS_PARAMETERS` 快照，回归测试内联镜像（调音必改快照）；设计令牌集中在 `design-tokens.ts`（快照锁定）；
- 翻盖剖面现为模块常量：`WALLET_FLAP_FOLD_OPEN_DURATION_MS = 1050` / `CLOSE = 950`；effect 联合类型已穷举可查（`fold-started`/`fold-contact`/`bill-draw-completed`/`bill-follow-through-began`/`bill-recycle-began` + 里程表/里程碑/元进程轻提示）。

## Goals / Non-Goals

**Goals:**

- 日间/夜间剖面以**纯数据对象注入**现有纯函数层，日间行为零变化（既有测试不改全绿为验收线）；
- 睡眠弧线（熄灭计时/渐暗/恢复/封存触发）为独立纯函数 reducer，可无头全测；
- 夜间静默是编排层的一层 effect 门控，不侵入各 reducer 的效果语义；
- 持久化向后兼容（v1 可选字段），账本字段级容错（损坏不连坐其余元进程）。

**Non-Goals:**

- 不做白噪音残留、床前时间窗自动进入、跨设备同步（见 proposal）；
- 不做熄灭阈值/时长的设置项（常量，见 Open Questions）；
- 不改翻盖几何投影、纹理缓存、渲染层次结构——夜间只是亮度系数与剖面参数。

## Decisions

### 1. 剖面 = 数据对象，不是 reducer 内模式分支

提取 `FlapMotionProfile`（openDurationMs / closeDurationMs / 阻尼系数 / 过冲幅度）：日间 = 现值（1050/950ms、约 5° 过冲），夜间 = 约 1.4-1.8 倍时长、重阻尼、过冲 ≈0。`createInitialFlapState`/折叠推进接受 profile 入参，由 `game.ts` 按会话注入。抽钞「更粘」同理：跟手柔性延迟系数进 draw 剖面。
*备选：reducer 内读全局模式标志 → 破坏纯函数与可测性，弃。*

### 2. 夜间静默 = effect 门控纯函数（编排层）

穷举分类现有全部 effect：**呈现类**（开合音/触觉、抽钞音、follow-through/回收动效、里程碑庆祝、连抽音高上行、元进程轻提示）在夜间会话被门控丢弃；**判定类**（计数、`lifetimeDrawCount`、图鉴录入、皮肤/成就解锁写入）照常发生。门控函数以 TypeScript exhaustiveness（`never` 断言）+ 穷举单测锁死，新增 effect 类型漏分类即编译失败。
*备选：让 reducer 夜间不产出效果 → 改动面大、日间回归风险高，弃。*

### 3. 睡眠弧线独立 reducer（`sleep-arc.ts`）

状态 `idle → dimming → dimmed`（附 `sealed` 幂等标记），`(state, event, nowMs)` 纯函数；事件含 interaction / touch / 时间推进。入睡点按「最后交互 + 熄灭阈值(≈90s) + 渐变时长(≈60s)」单调时钟**推算**，不依赖实时计时器触发——锁屏/后台计时器冻结时，回前台可补判补封存（封存幂等）。
*备选：散写在 game.ts 的定时器逻辑 → 不可无头测试，弃。*

### 4. 夜间视觉 = 夜令牌 + 全局亮度系数

`design-tokens.ts` 增加夜间基调变体（既有色板体系内压暗值，快照测试更新镜像）；熄灭实现为 `[0,1]` 亮度系数（夜间基准 1.0 → 近黑 ≈0.02），渲染入口统一乘算（globalAlpha/合成层），各 painter 内部不动。夜令牌锁快照时断言大数字对比度仍 ≥3:1（排版规格不放松）。

### 5. 音频睡眠编排进参数快照

`AUDIO_SYNTHESIS_PARAMETERS` 新增 sleep 块：BGM 速度↓、旋律密度↓、旋律顶棚 C4、音量较日间再压、SFX 夜间增益系数、连抽音高上行禁用、熄灭淡出曲线时长。engine 按会话切换编排。**同步更新 `tests/audio/audio-regression.test.ts` 内联镜像**（工程硬约束）。离线断言：夜间旋律发声音高 ≤C4、淡出无骤停、峰值 ≤0.9。

### 6. 持久化：v1 可选字段 + 字段级容错

`PersistedGameStateV1` 新增：settings 内 `bedtimeModeEnabled?: boolean`；`sleepLedger?: NightlySleepRecord[]`（日期、张数、金额、入睡点或会话时长）；`pendingMorningCard?: 记录标识`（早安卡跨冷启动一次性呈现的落盘标记）。`parsePersistedGameState` 对 `sleepLedger` 字段独立容错：该字段损坏仅清空账本，其余元进程保留（sleep-mode 规格硬要求）。schemaVersion 保持 1（可选字段，旧档缺省即初始值）。
*备选：升 v2 迁移 → 未发布、无存量用户，徒增复杂度，弃。*

### 7. 封存增量 = 进入时快照会话计数

进入晚安模式时快照当前 `SessionProgressState`；封存记录 = 退出/熄灭时会话值 − 快照值；里程表**显示**全程延续不清零。夜间计数仍为会话内存态，不落盘（会话化边界不变）。

### 8. 时间窗建议：Date 本地时间 + 注入时钟

JS `Date` 非 DOM API，不违内核纪律；判定函数接受 `now` 参数注入，测试可控。

### 9. 早安卡 = 瞬态覆盖层卡片，不是轻提示

含关闭操作（轻提示不可交互），复用 overlay 布局/命中共用纯函数模式（「看到的=可点的」）。呈现条件：`pendingMorningCard` 存在 && 本次冷启动/回前台首次；关闭即清除标记。时间窗建议**才**走轻提示队列（可点按变体）。

## Risks / Trade-offs

- [iOS WebView 锁屏/后台冻结计时器，熄灭与封存延迟] → 单调时钟推算 + 回前台补判补封存，`sealed` 幂等防重复记账
- [夜间压暗与「反廉价」/可读性冲突] → 夜令牌快照断言对比度阈值；**必须过 iOS 模拟器实测手感验收**（帧预算与视觉同等前置）
- [音频淡出与总线防爆音交互] → 复用总线淡出链路，离线渲染断言无削波无骤停
- [门控遗漏未来新增的 effect 类型] → exhaustiveness 编译期 + 穷举单测双保险
- [亮度系数乘算的每帧成本] → 单点合成层乘算，`npm run smoke` 帧预算把关（渲染性能预算规格不放松）
- [时间窗建议打扰感] → 每次冷启动最多一次、自动淡出、仅点按生效

## Migration Plan

未发布、无存量用户：v1 可选字段直接落地，无数据迁移；回滚 = revert 对应提交，旧解析逻辑对新字段天然忽略。

## Open Questions

- 熄灭阈值（≈90s）与渐变时长（≈60s）的最终手感数值 → 实现期模拟器实测后定为常量并锁快照，不影响结构
- BGM 睡眠编排的具体音乐参数（速度/密度取值）→ 调音期定，快照测试锁定
