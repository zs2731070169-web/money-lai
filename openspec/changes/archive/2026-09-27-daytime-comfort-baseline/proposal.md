# Proposal: daytime-comfort-baseline — 日间基线舒缓化

## Why（用户实测反馈）

发布线回退睡眠特性后用户实测：「BGM 音调变高了、钱包开合速度变快了，没有之前舒服」。
用户此前长期处于默认开启的晚安剖面，实际习惯并被认可的是那套**舒缓调校**（BGM C4
低音域/更慢更稀疏、开合 1.6 倍慢、抽钞更粘、音效软化 0.6）。经确认，将该套参数
**移植为日间基线**（无暗屏、无睡眠逻辑，纯参数层）。

## What Changes

- **BGM（procedural-audio）**：旋律顶棚 C5→C4（发声音高整体下移一个八度）、和弦
  10s→14s、旋律间隔 1-4.5s→2-7s、总线增益 0.16→0.095。
- **开合（wallet-interaction，规格无数字仅参数）**：开启折叠 1050ms→1680ms、
  关闭 950ms→1520ms（物理剖面形状不变，仅放慢）。
- **抽钞（cash-drawing，规格定性「跟手」不变）**：拖拽跟手增益 1.0→0.75（更粘）。
- **音效**：新增 SFX 总线增益节点 0.6（软化操作音效，与 BGM 的相对关系保持）。
- 规格增量：仅 proceduralural-audio「生成式钢琴 BGM」MODIFIED（顶棚/速度/密度措辞），
  wallet-interaction/cash-drawing 主规格为定性描述、无需增量。

## Impact

- 代码：`parameters.ts`（bgm 四参 + 新增 melodyCeilingMidi 与 sfxBus 段 + 快照镜像）、
  `engine.ts`（SFX 总线节点、BGM 计划器传顶棚）、`flap-state.ts`（时长常量）、
  `draw-judgment.ts`（跟手增益常量）。
- 测试：快照镜像更新；cash 比例断言 ×0.75；tap-routing 等集成帧数按 1.6 倍时长放大。
- 后续：同一组值同步到特性分支的日间剖面（其夜间剖面本就同值）。
