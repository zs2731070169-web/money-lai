# design：抽钞摩擦音一抓一声（实测反馈 v2.6）

| 项 | 旧 | 新 |
|---|---|---|
| 形态 | PaperSlideVoice 持续声床（loop 噪声 + 逐帧速度调制） | 一次性 ~80ms 带通噪声瞬态（快起 + 指数衰减） |
| 触发 | 抓取即启动、移动中持续调制 | 抓取后的**首次移动**瞬间播放一次，此后拖拽全程静音 |
| 速度关联 | 连续调制增益/滤波 | 单次发声的亮度/峰值随触发时刻速度微调（中心 2.2~4.2kHz、峰值 0.14~0.26 映射） |
| 松手 | release 100ms | 保留现有 paperReleasePuff（不变） |
| 引擎 API | startPaperSlide / updatePaperSlideVelocity / stopPaperSlide | playPaperGrabRustle(normalizedSpeed)（速度累计与首移判定在 Game 侧） |

参数快照：paperSlide 段整体替换为 paperGrabRustle {centerHertzMin 2200 / centerHertzMax 4200 / qFactor 0.8 / peakGainMin 0.14 / peakGainMax 0.26 / totalDurationMilliseconds 80 / attackRampMilliseconds 4}。

## v2.6.1 音色修正（实测反馈：抓取声是「啪」不是「莎莎」）

| 项 | v2.6（啪的来源） | v2.6.1（莎莎） |
|---|---|---|
| 滤波 | 带通 Q0.8 @2.2~4.2kHz（有共振峰） | 高通 1.2kHz + 低通 6.5kHz 串联（宽带无共振） |
| 起坡 | 4ms（敲击瞬态） | 12ms（纸被带动的软渐入） |
| 包络 | 80ms 单峰指数衰减 | ~140ms = 3 个错峰小 puff（0/35/70ms，增益 1.0/0.6/0.35，各 60ms）→ 碎响颗粒 |
| 峰值 | 0.14~0.26 随速度 | 不变（速度只映射增益，不映射亮度） |
| 松手 puff | 同款敲击配方（6ms@2.2kHz） | 同族宽带软包络（HP1.4k+LP6k、12ms 起坡、140ms；连抽亮度经高通中心上移保留） |

## v2.6.2 音色修正（实测反馈：噼啪 → 沙沙）

| 项 | v2.6.1（噼啪来源） | v2.6.2（沙沙） |
|---|---|---|
| 结构 | 3 个分离小 puff | 单一连续噪声流（~220ms 窗口） |
| 包络 | 每 puff 独立快起快落 | 圆滑起伏：50ms 渐入 + 指数缓落，无瞬态边沿 |
| 双字感 | 离散事件（=噼啪，错） | 10Hz/25% 音频速率增益颤音（确定性振荡器调制，连续波浪） |
| 频带 | HP1.2k+LP6.5k | HP900+LP5k（纸贴皮革偏闷） |
| 峰值 | 0.14~0.26 | 0.12~0.2 |
| 松手 puff | 宽带软包络（离散） | 同族连续起伏（180ms、9Hz/20%、HP 随连抽上移） |
