# procedural-audio 规格（增量：BGM 调域下移）

## MODIFIED Requirements

### Requirement: 生成式钢琴 BGM
系统 SHALL 在音频解锁后播放生成式钢琴风格背景音乐：慢速温暖的和弦进行与稀疏的五声音阶旋律（程序化生成，MUST NOT 为固定音频文件或机械等长循环），音量 SHALL 显著低于操作音效；旋律与伴奏音域 SHALL 以中低音区为主（旋律约 C3~A4），MUST NOT 长时间驻留 C5 以上音区（实测反馈：高音过多不适合舒缓场景）；音色 SHALL 偏暗收敛（高次分音与琴槌瞬态的高频能量克制）；BGM SHALL 随 App 进入后台淡出暂停、回前台恢复；BGM SHALL 可在设置中独立开关（关闭即时淡出、冷启动保持）；BGM 播放 MUST NOT 与操作音效叠加产生破音。

#### Scenario: 解锁后淡入
- **WHEN** 用户完成首次触摸使音频解锁并进入主画面
- **THEN** 钢琴 BGM 淡入播放，音量明显低于操作音效

#### Scenario: 高音克制审查
- **WHEN** 长时间聆听 BGM
- **THEN** 旋律与伴奏以中低音区为主，无长时间驻留 C5 以上音区的段落，整体听感偏暗柔和

#### Scenario: 后台暂停与恢复
- **WHEN** App 进入后台后再回到前台
- **THEN** BGM 淡出暂停、随后恢复继续，恢复过程无破音

#### Scenario: BGM 独立开关
- **WHEN** 用户在设置中关闭 BGM
- **THEN** BGM 立即淡出停止而操作音效不受影响，冷启动后保持关闭状态
