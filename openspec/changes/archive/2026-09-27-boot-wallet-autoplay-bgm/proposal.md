# 冷启动直入钱包界面 + BGM 自动起播

## Why

用户实测反馈（2026-09-27）：进入 App 时希望直接进入钱包主界面（跳过标题页），
并自动播放 BGM，省去每次冷启动的「轻触开始」步骤。

## What Changes

- 移除标题页与其专用触摸转场：`gamePhase` 状态、标题屏画师 `paintTitleScreen`
  一并清理（主规格从未为标题页立约；wallet-interaction「启动进入静置」的表述
  「启动 App 进入主画面」反而自此字面成立）。
- BGM 冷启动自动起播：`Game.start()` 在同步 BGM 设置后立即尝试启用音频链路
  （复用 `tryUnlockAudio`：resume 成功即起播 BGM，幂等）。
- 平台语义：Android WebView 在 `MainActivity` 关闭
  `mediaPlaybackRequiresUserGesture`，使 WebAudio 无手势即可运行——BGM 真·冷启动即播；
  平台仍要求手势时（iOS WKWebView 现状）退化为既有「首次触摸解锁后起播」，行为不劣化。
- 规格增量：procedural-audio「首次手势解锁」由「音频启动策略」替代
  （冷启动即尝试启用 + 手势降级路径）；「生成式钢琴 BGM」的起播时机改为
  「App 启动且音频链路可用即淡入」。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
- procedural-audio：见 `specs/procedural-audio/spec.md` 增量（1 个 REMOVED+ADDED 需求对、1 个 MODIFIED 需求，全场景携带）。

## Impact

- `src/core/game.ts`：删 `gamePhase`/标题分支/`paintTitleScreen` 引用；`start()` 增冷启动音频启用；快照增 `audioUnlocked`/`bgmPlaying` 诊断字段。
- `src/core/render/overlay-painter.ts`：删 `paintTitleScreen`（死代码清理；该文件含在途 meta-side-drawer 改动，仅动该函数）。
- `android/app/src/main/java/…/MainActivity.java`：WebView 关闭自动播放手势要求。
- iOS 侧不注册任何 WebView 配置改动：WKWebView 仍要求手势，走降级路径（后续如需 iOS 也冷启动即播，另立变更配置 `WKWebViewConfiguration.mediaTypesRequiringUserActionForPlayback`）。
- 测试：新增 `tests/boot/launch-behavior.test.ts`（先红）；`frame-smoke`/`tap-routing` 的标题页注释与热身触摸同步更新（语义变为背景轻点）。
