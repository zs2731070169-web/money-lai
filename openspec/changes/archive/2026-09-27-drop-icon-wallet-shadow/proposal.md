# 图标去除钱包下方投影

## Why

用户实测反馈：图标里钱包下方的影子不需要，去掉（其余一切保持不变）。

## What Changes

- 矢量源 `tmp/custom-icons/app-icon/app-icon.svg` 删除钱包投影椭圆（identity/构图/色板不变）；
- 按既有管线重渲全部产物：Android mipmap 各密度 legacy/round/adaptive-foreground、
  iOS AppIcon-512@2x；构建装机。纯视觉资产变更（skip_specs: true）。


## 后记（2026-09-27 两次返工，最终定论）

- 第一次：adaptive 前景被我重造为 0.66 缩放留边合成 → 用户反馈图标变大裁切；
- 第二次：误判旧前景为留边合成（包围盒测量把背景渐变误判为内容），legacy 同步改错 → 再被用户打回；
- 最终定论：旧版所有槽位（legacy/round/adaptive 前景）本就是同一张满幅图直接缩放，
  桌面遮罩取中心即正确观感。终版 = 无影满幅图统一填充全部槽位，零再取景。
- 教训：改资产必须先用「像素差异」而非「颜色阈值」锁定旧版基线；对猜测的管线不做二次创造。
