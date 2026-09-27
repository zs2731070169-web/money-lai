# 提案：启动屏改纯白（实测反馈：加载期不显示任何图标内容）

## Why

用户实测：冷启动加载期间的启动屏（iOS Splash 图 / 安卓 drawable/splash）显示了图标内容，要求**纯白屏**，不出现任何图形。

## What Changes

- **iOS**：`LaunchScreen.storyboard` 由全屏 `Splash` imageView 改为纯 `view`（白色背景，无任何子视图）。
- **安卓**：`AppTheme.NoActionBarLaunch` 的 `android:background` 由 `@drawable/splash` 改为白色色值（`#FFFFFF`），`drawable/splash.png` 不再被启动主题引用。
- **加载期顶部无内容（实测反馈追加）**：iOS `Info.plist` 加 `UIStatusBarHidden`（启动期隐藏状态栏，VC 接管后恢复）；安卓启动主题加 `windowNoTitle`/`windowActionBar`——根因是启动主题（`Theme.SplashScreen` 子类）缺 NoActionBar 属性，窗口首帧渲染出 activity label「money来」标题条，晚于 `BridgeActivity.setTheme` 才被撤掉；补属性掐源头（初版试过 `windowFullscreen`，非该条来源且带全屏副作用，已弃）；
另按 API 31（实测机荣耀 Android 31）补 `windowSplashScreenBackground=#FFFFFF` + `windowSplashScreenAnimatedIcon=透明`，
压过系统启动屏默认的 launcher 图标与 label 展示。连拍 15 帧跨启动全程复验：标题条不再出现。

## Capabilities

### New Capabilities
（无——应用外壳视觉，无产品行为变化，`skip_specs: true`）

### Modified Capabilities
（无）

## Impact

- 资产：iOS storyboard 1 处、安卓 styles.xml 1 处（splash.png 保留但不再引用，可后续清理）。
- 验证：双端冷启动目检。
