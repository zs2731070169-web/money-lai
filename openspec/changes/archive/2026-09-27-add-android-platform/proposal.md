# 新增 Capacitor Android 平台（真机测试通路）

## Why

用户以 Android 手机为真机测试设备（iOS 模拟器之外的第二验证通路），
需要可安装的 APK。内核/适配层本就平台无关，`web.ts` 适配器同时服务
Web/Capacitor——Android 走同一 WebView 通路，无内核改动。

## What Changes

- 安装 `@capacitor/android`，`npx cap add android` 生成 android 工程（纯脚手架）。
- vite 构建 + `cap sync android` + `gradlew assembleDebug` 产出调试 APK。
- 不改 `src/`（行为契约不变，`skip_specs: true`）。
- Android 特有注意点：安全区经 CSS 变量读不到时为 0（画布全屏，可接受降级）；
  音频解锁/触觉/存储走既有 Capacitor 插件，Android 均支持。

## Impact

- 新增 `android/` 工程目录与 `package.json` 依赖；无规格/内核变更。
- 验证入口：`npm test` 不受影响；APK 交付路径
  `android/app/build/outputs/apk/debug/app-debug.apk`（debug 签名，任意安卓机可装）。
