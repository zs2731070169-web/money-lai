# 应用显示名改为「money来」

## Why

用户定稿：安装后桌面图标下的名称由 `money-lai` 改为 `money来`。

## What Changes

- `capacitor.config.ts` appName → `money来`；
- Android `strings.xml` 的 `app_name` 同步（iOS 侧仅改配置源，Info.plist 待下次 iOS 构建时同步）。
- 纯构建配置，无行为变化（skip_specs: true）。
