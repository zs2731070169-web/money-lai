## Context

在飞 change `rebuild-letter-burning-experience` 已交付信封取纸、对折展开、全屏编辑（含字数指示、选区、滚动书写）、信的主题与手帐网格；其燃烧链路（drag/beginThrow/endThrow/rebound/burn/fade/silence 相位、火线几何、火焰画师、点燃/火床/余响音频、按燃烧结算的保存与元进程）仍在。本 change 在其归档后应用，删除燃烧链并把完成语义迁移到「确认收好」。状态机、结算函数与素材分层均已有良好纯函数边界（`burning-state.ts`、`journal-state.ts`、`postcard-progress.ts`），改动可以走测试先行。

## Goals / Non-Goals

**Goals:**
- 「确认即完成」的最小闭环：确认 → 落纸 → 折回入袋 → 信封静置 → 保存/结算/微光/统计 → 下一张就位。
- 删除燃烧链路的代码、资产引用与回归断言，不留死代码。
- 里程、成就、匿名计数、统计节奏在收好语义下无缝延续，既有本机数值不重置。
- 手帐清空去火焰化。

**Non-Goals:**
- 不设计新的收尾仪式动作（开放问题，后续立项）。
- 不改匿名计数端点协议与 worker 实现。
- 不处理应用更名（开放问题）。
- 不动信封取纸/展开/编辑/主题/字体套餐的既有行为。

## Decisions

### D1 完成语义挂在「确认」，不挂在「入袋动画结束」
确认（`requestMultilineText` 返回非 null）即视为倾诉完成：`setPostcardText` 后立刻进入收好相位；手帐写入、里程 +1、成就结算、匿名计数与菜单微光的触发点放在**收好动画结束的结算步**（与原 `resolveCount`/`settleCompletedPostcard` 的时序位置一致），保证「记录确实落库后才给微光与统计」的既有纪律不变。
- 备选：确认瞬间立即结算——被否，微光/统计出现在动画中途会打断折回的舒缓节奏，也弱化「收好=落袋为安」的因果。

### D2 状态机做减法：删相位不加新框架
删除 `drag/rebound/burn/fade/silence` 相位与 `beginThrow/endThrow/movePointer` 的甩出分支；`back`（展示位）保留、仅剩「点按再编辑」出口；新增单一 `settle` 相位承载折回入袋（复用 edit-return 的插值与遮挡顺序，方向取逆）。`stat` 相位保留但语义改为「收好统计」，时序为 0.6s 淡入 / 1.8s 停留 / 0.6s 淡出，无静默段；`reducedMotion` 沿用既有缩短规则。
- 备选：用通用 timeline 引擎重写相位机——被否，最小闭环原则，现有 `advanceBurningState(delta)` 单步推进已够用。

### D3 取消不保存、停留展示位
取消返回 null 时不写 `setPostcardText`、不结算，`edit-return` 后停在 `back`；这与现状一致，只是 `back` 不再有甩出出口。空白确认与有字确认同样收好保存（`settleCompletedPostcard` 已支持空文字）。

### D4 渲染做减法，收好复用既有画师
删除 `burn-geometry`、`letter-painter` 的燃烧/余光分支、`paintPageBurn` 与 `game.ts` 的 clearBurnGeometry 链；手帐清空动画改为整页纸面渐隐（一次性 fillRect alpha 渐变，无火焰几何）。收好过渡由 `paintLetterScene` 既有层序（后层→信纸→前袋）按 `settle` 进度反向插值即可，不新增画师。
- 备选：为收好另写专职画师——被否，会重复对折/入袋的绘制路径。

### D5 音频只删不加
删除 `fire-sound.ts`、引擎的点燃/火床/余响方法与参数、对应回归断言；抽信素材与钢琴 BGM 原样保留。BGM 的「收好后 2s 衰减长音」复用原火灭长音触发点，改挂在 `settle` 结算步。

### D6 元进程只改语义与文案，不改持久化结构
`postcardMileage`/`achievementIds`/`statCadenceCount` 字段名与格式不动（避免迁移风险）；成就 ID 保持不变（如 `first-blank`），仅改显示文案；菜单项「明信片里程」→「心里话里程」。统计句 `COPY.statSuffix` 改为「张信纸已被收好」，首行仍「此刻」；浮出位置从火灭点改为信封上方（布局取 `envelopeRect` 上缘）。文案过 `release-audit` 与文案红线（无人称、≤12 汉字浮出型）。

### D7 与在飞 change 的顺序依赖
本 change 依赖 `rebuild-letter-burning-experience` 先归档（燃烧需求先落主 specs，再被本 delta 移除/改写）。实现顺序上先做完 A 的收尾验收再动 B，避免同一文件双线并行。

## Risks / Trade-offs

- [状态机删相位牵连面广（game.ts 触点路由、letter-flow 测试、性能冒烟都在引用甩出/燃烧）] → 测试先行：先改 `burning-state.test.ts`/`letter-flow.test.ts` 到新语义出红，再动实现；性能冒烟同步换收好链路。
- [「确认即完成」使用户失去反悔窗口（原流程可取消回到展示位再编辑）] → 取消路径保留、展示位点按再编辑保留；确认前草稿在手帐层不落库，行为可预期。
- [统计句位置从火灭点改信封上方，小屏可能与信封/菜单微光重叠] → 布局取安全区内信封上缘以上、与菜单图标错开；模拟器 SE 尺寸过一遍。
- [匿名计数语义改了但端点 24h 总数里混着旧燃烧计数] → 语义上同属「完成一次倾诉仪式」的计数，允许平滑延续；文案只说「张信纸已被收好」，不承诺历史口径纯净。
- [BGM 收好长音若用户连续快速取下一张信纸可能叠音] → 长音沿用现有单实例调度，触发前先停旧长音。

## Migration Plan

1. 前置：完成并归档 `rebuild-letter-burning-experience`。
2. 按 tasks 分组实现，每组 `npm run verify` + `openspec validate pivot-to-confiding --strict` 全绿后提交。
3. 模拟器/真机走查：抽取→书写→确认收好→统计→下一张；取消停留；清空手帐；离线收好；静音拨片。
4. 回滚策略：单 change 内按组提交，任一组出问题 revert 该组；持久化结构未动，旧版本可直接读回（统计节奏计数语义兼容）。

## Open Questions

- 收尾仪式（如信封轻合特写）后续是否立项。
- 应用更名与图标（建议独立 change）。
- 能力目录更名（`letter-burning`→`letter-confiding` 等）在归档时顺带处理。
