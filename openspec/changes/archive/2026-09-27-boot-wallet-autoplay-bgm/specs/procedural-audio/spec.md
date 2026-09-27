# procedural-audio 规格（增量：冷启动直入 + BGM 自动起播）

## REMOVED Requirements

### Requirement: 首次手势解锁
（被「音频启动策略」替代：冷启动即尝试启用音频，手势仅为平台要求时的降级路径。）

## ADDED Requirements

### Requirement: 音频启动策略
音频 SHALL 在 App 冷启动即尝试启用：平台 WebView 允许无手势自动播放时（如 Android 关闭 `mediaPlaybackRequiresUserGesture`）立即激活音频链路；平台要求用户手势时，SHALL 以首次触摸解锁，且解锁前任何界面活动 MUST NOT 产生声音；启用/解锁动作 SHALL 在单次调用或单次手势内完成（恢复播放并激活音频链路）；中断后的重解锁语义不变（见「中断与恢复」）。

#### Scenario: 冷启动即时启用
- **WHEN** App 冷启动且平台允许无手势自动播放
- **THEN** 音频链路立即激活，无需任何触摸

#### Scenario: 手势解锁降级
- **WHEN** App 冷启动且平台要求用户手势，尚未触摸屏幕
- **THEN** 无任何音频输出；首次触摸后音频链路激活

## MODIFIED Requirements

### Requirement: 生成式钢琴 BGM
系统 SHALL 在 App 启动且音频链路可用后播放生成式钢琴风格背景音乐（冷启动即尝试起播；平台要求手势时在首次触摸解锁后起播，两种路径均淡入）：慢速温暖的和弦进行与稀疏的五声音阶旋律（程序化生成，MUST NOT 为固定音频文件或机械等长循环），音量 SHALL 显著低于操作音效；旋律与伴奏音域 SHALL 以中低音区为主（旋律约 C3~A4），MUST NOT 长时间驻留 C5 以上音区（实测反馈：高音过多不适合舒缓场景）；音色 SHALL 偏暗收敛（高次分音的高频能量克制），音符起音 MUST NOT 含噪声成分（实测反馈：琴槌瞬态白噪在设备上听感为持续「莎莎」声，已移除）；BGM SHALL 随 App 进入后台淡出暂停、回前台恢复；BGM SHALL 可在设置中独立开关（关闭即时淡出、冷启动保持关闭则不起播）；BGM 播放 MUST NOT 与操作音效叠加产生破音。

#### Scenario: 启动即播淡入
- **WHEN** App 冷启动且设置开启 BGM、平台音频链路可用
- **THEN** 钢琴 BGM 淡入播放，音量明显低于操作音效

#### Scenario: 解锁后淡入
- **WHEN** 平台要求用户手势且用户完成首次触摸使音频解锁并进入主画面
- **THEN** 钢琴 BGM 淡入播放，音量明显低于操作音效

#### Scenario: 高音克制审查
- **WHEN** 长时间聆听 BGM
- **THEN** 旋律与伴奏以中低音区为主，无长时间驻留 C5 以上音区的段落，整体听感偏暗柔和

#### Scenario: 无噪声起音审查
- **WHEN** 长时间聆听 BGM 并专注分辨音符起音
- **THEN** 起音为纯谐音的快速起坡（分音衰减/失谐质感保留），全程无「莎莎」噪声层或噪声敲击

#### Scenario: 后台暂停与恢复
- **WHEN** App 进入后台后再回到前台
- **THEN** BGM 淡出暂停、随后恢复继续，恢复过程无破音

#### Scenario: BGM 独立开关
- **WHEN** 用户在设置中关闭 BGM
- **THEN** BGM 立即淡出停止而操作音效不受影响，冷启动后保持关闭状态
