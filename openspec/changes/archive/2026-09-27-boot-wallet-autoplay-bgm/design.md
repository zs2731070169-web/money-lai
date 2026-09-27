# design：冷启动直入钱包 + BGM 自动起播

## 根因/现状链

```
game.ts: gamePhase='title' → 首触吃掉一次转场（handleTouch 245）+ render 画标题屏（823）
BGM: 仅在手势解锁成功后起播（tryUnlockAudio，首触/标题转场触发）
Android WebView: mediaPlaybackRequiresUserGesture 默认 true → AudioContext 无手势必挂起
```

## 方案

1. **删标题页**：`gamePhase` 字段、handleTouch/render 的 title 分支、`paintTitleScreen`
   画师全部移除（主规格无标题页契约；wallet-interaction「启动进入静置」字面成立）。
   首触不再被转场吞掉，直接进入翻盖/抽钞手势路由（该路由本就在每次 touch start 调
   tryUnlockAudio，解锁语义不缺位）。
2. **BGM 冷启动起播**：`Game.start()` 在 `setBgmEnabled(settings)` 同步后调用
   `tryUnlockAudio()`——unlock() 无手势调用安全（resume 失败静默降级返回 false），
   Android 关手势要求后 resume 即成功 → startBgm()（幂等由 isPlayingBgm 守卫）。
   iOS 路径 resume 失败 → 维持「首触解锁后起播」的现状，无行为劣化。
3. **Android WebView 开关**：`MainActivity.onCreate` 在 super 后取 `bridge.webView`
   置 `mediaPlaybackRequiresUserGesture=false`（只影响自动播放策略，不动其他 WebView 配置）。
4. **可观测性**：`getSmokeTestSnapshot()` 增 `audioUnlocked`/`bgmPlaying` 两字段
   （无头回归的诊断面，本就为此存在）。

## 测试策略（先红后绿）

- 新增 `tests/boot/launch-behavior.test.ts`，headless 适配器注入可运行的假音频上下文
  （Proxy 吸收一切节点调用，`startRendering` 存在 → resumeAudioContextIfNeeded 视为可用）：
  1. 冷启动一帧后 `audioUnlocked === true`（平台允许时立即启用）；
  2. 冷启动一帧后 `bgmPlaying === true`（BGM 自动起播）；
  3. 首次触摸直接作用于翻盖（flapPhase 进入 pressing，标题转场不复存在）。
- 降级路径：注入 resume 拒绝的上下文 → 冷启动后 `audioUnlocked === false`、`bgmPlaying === false`
  （无声直至手势），首触后转为 true。
- 既有 `frame-smoke`/`tap-routing` 的标题热身触摸变为背景轻点（无操作数），注释同步改。

## 风险与回退

- 标题页永久移除且仓库无提交历史：本变更档即其存在过的唯一记录（含 8.1 任务引用）。
- Android 自动播放策略放开仅影响本 WebView 的 AudioContext/media 元素，均为本 App 自有内容。
- 回退：恢复 gamePhase 三处 + paintTitleScreen + 删 start() 一行调用与 MainActivity 一行设置。
