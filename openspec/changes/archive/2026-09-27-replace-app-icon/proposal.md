# 提案：替换默认应用图标为 money-lai 定制图标

## Why

App 图标仍是 Capacitor 脚手架默认图（安卓青色网格、iOS 默认），上架与真机辨识都需要定制图标。已用 custom-icons skill 产出与游戏同源的定制设计（治愈系钱包 + 抽出 lai 纸币，色板取自项目设计令牌）。

## What Changes

- **iOS**：`AppIcon.appiconset/AppIcon-512@2x.png` 替换为 1024×1024 定制图标（RGB 无 alpha，满足 App Store 规范）。
- **安卓 legacy**：`mipmap-{mdpi..xxxhdpi}` 的 `ic_launcher.png` / `ic_launcher_round.png` 按密度（48/72/96/144/192）替换为满幅定制图标。
- **安卓自适应（API 26+，主流启动器实际显示）**：`ic_launcher_foreground.png`（108dp 网格：108/162/216/324/432）替换为满幅定制图（圆形遮罩裁掉渐变圆角，无接缝）；`ic_launcher_background` 色值改为 `#F1DEC9`（与图标底渐变下沿同色，视差露出时融合）。
- 矢量源与中间产物留 `tmp/custom-icons/app-icon/`。

## Capabilities

### New Capabilities
（无——应用外壳资产替换，无产品行为变化，`skip_specs: true`）

### Modified Capabilities
（无）

## Impact

- 资产：ios AppIcon 1 张、android mipmap 15 张、values 颜色 1 处。
- 验证：iOS 构建 + 模拟器部署、安卓部署 + 桌面截图目检。
