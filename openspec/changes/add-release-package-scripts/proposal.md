# 提案：双端打包脚本（release 产物）

## Why

仓库已有双端**开发部署**脚本（`launch-simulator.sh` / `launch-android.sh`），缺**打包**出口：安卓出可安装 release APK、iOS 出 development IPA。真机分发（侧载给朋友/TestFlight 前验证）需要独立产物。

## What Changes

- `scripts/package-android.sh`（`npm run package:android`）：构建 → cap sync → `assembleRelease` → zipalign → **debug 密钥签名**（真机侧载用；gradle 已配 release 签名时自动跳过脚本签名）→ `apksigner verify` → 归档 `packages/money-lai-v<版本>-<时间戳>.apk`。
- `scripts/package-ios.sh`（`npm run package:ios`）：**前置签名证书检查**（本机无有效开发证书时立即失败并给三条解决路径，不浪费时间构建）→ 构建 → archive → 导出 development IPA → 归档 `packages/`。
- `packages/` 加入 .gitignore（产物不进库）。

## Capabilities

### New Capabilities
（无——开发工具链脚本，`skip_specs: true`）

### Modified Capabilities
（无）

## Impact

- 新增：两脚本 + package.json 两入口。
- 签名现状说明：安卓项目无 release signingConfig（脚本以 debug keystore 签名，仅侧载；上架需正式密钥）；iOS 项目无 DEVELOPMENT_TEAM 且本机暂无证书（脚本在 1/6 即拦截给出指引）。
- 验证：安卓端到端实打（签名校验 + adb 安装成功）；iOS 前置拦截路径实测 + 签名路径待证书就绪后验证。
