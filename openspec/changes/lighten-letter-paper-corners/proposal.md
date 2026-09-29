## Why

`letter_paper.png` 左上和右下的铃兰角饰对比过强，书写时抢占正文的视觉注意力。需要降低这两处装饰的存在感，让文字更容易阅读。

## What Changes

- 将信纸左上和右下两组花朵及相邻叶片调整为更浅的低对比色。
- 保留信纸纸纹、褶皱、毛边、画布尺寸和透明通道；正文区域不加入蒙层。

## Capabilities

### New Capabilities

- `game-visuals`: 规定信纸角饰在书写态的可读性与位图完整性。

### Modified Capabilities

无。

## Impact

仅更新 `assets/envelop/topic1/letter_paper.png` 和相应的视觉验收记录。主循环、图鉴和手帐继续共用该随包位图，无运行时逻辑或接口变化。
