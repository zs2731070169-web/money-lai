# design：开启态翻盖命中区跟随

- `isPointInsideOpenFlapHitArea(point, walletRect, standingFlapHeightPixels)`：纵向范围 [walletTop − standingHeight − 余量, 原命中区底]，横向同原命中区。
- standingHeight 由 game 按当前开进度实时计算：|projectFlapPointAtParameter(1, 角度, L, W).offsetFromHingePixels|（角度=进度×180°）。
- 路由优先级不变：纸币嘴部抓取 > 翻盖（体内 ∪ 直立扩展）。
- 条带 14→100（用户手调，消除接缝感的定稿值）；绘制调用预算 ≤160；真机帧率列入 QA 清单。
