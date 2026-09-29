# rebuild-letter-burning-experience 模拟器验收记录

- 日期：2026-09-28
- 构建：`feature/letter-burning` @ `78c5df0` 加当前工作区变更
- 运行环境：Xcode iOS Simulator 26.5
- 设备：iPhone SE、iPhone 17、iPhone 17 Pro Max

## 已完成检查

- 2026-09-29 接入全屏多行编辑态后，在 iPhone 17 模拟器完成抽取→自动进入编辑→原始信纸等比放大检查：编辑纸面占据安全区主要高度，信封层不再遮挡，确认/取消控件无画布输入框底色；DOM 输入层使用当前字体套餐并允许换行，限制 200 个 Unicode 字符。键盘/输入法收起后的回缩动画与真机触摸回放仍需继续验收。

- 2026-09-29 接入本地铃兰棉纸位图后，重新检查三种尺寸：`iphone-se-material-idle.png`、`iphone-17-material-back.png`、`iphone-17-pro-max-material-idle.png`。背景保持不透明全屏纸纹；SE 与 Pro Max 的打开信封、露出纸边和菜单均未裁切；iPhone 17 完成一次上滑抽取，信纸保持在后片与前袋之间后再完整离开。
- 位图元数据自动检查确认 `closed_envelope.png`、`open_envelope.png`、`letter_paper.png` 为 1024×1024 RGBA，`background.png` 为 1536×1024 RGB；记录型 Canvas 测试确认运行时顺序为背景、信封后层、信纸、信封前袋。
- 三种屏幕尺寸均检查了竖屏静置构图、安全区、菜单入口、信封和露出的明信片边缘；对应 `iphone-se-idle.png`、`iphone-17-idle.png` 和 `iphone-17-pro-max-front.png`。
- Pro Max 完成抽取、正反翻面、单行输入、确认收键盘、快速上甩、2.7 秒燃烧、余光、静默和下一轮复位录屏；见 `iphone-17-pro-max-flow.mp4` 与 `iphone-17-pro-max-gesture-input-rebound.mp4`。
- `iphone-17-pro-max-burn.png` 从流程录屏的燃烧中段无损抽帧。未烧纸面保持单一连续多边形，火线没有原先的 X 形自交，也没有全屏火焰或具象灰烬。
- 输入确认后键盘和输入法候选均收起，正文 `abc` 留在明信片背面；反向甩动回到定格位，快速上甩可触发燃烧。
- 菜单（现七项构成）、手帐入口和主界面到手帐的渐暗前后状态已检查；见 `iphone-17-pro-max-menu.png`、`iphone-17-pro-max-journal.png`。

## 仍未完成

- 关闭态与打开态的主体宽度、中心轴和透视已接近，但位图本身的底部 alpha 基线仍相差约 30px；当前运行时以统一锚点绘制打开态，尚不能把两张扁平图直接当作逐像素连续开合帧。若后续加入真实开合动画，仍需导出独立的翻盖外侧、翻盖内衬、前袋和蜡封层，或补充中间帧序列。
- iPhone SE 与 iPhone 17 已完成静态布局检查，但 Simulator 的非活动设备窗口在自动化点击时出现坐标映射错误，未完成这两种尺寸的完整触摸回放；OpenSpec 任务 8.4 保持未勾选。
- 模拟器不能替代静音拨片、来电/音频中断、真实 Home 指示条触摸竞争、系统分享面板、照片权限项和长时听感；这些项目随真机任务 4.5、8.1、8.5 保持未勾选。
- 慢速向上甩的动态录屏尚未补齐；阈值与 300ms 回弹已有纯状态机测试，OpenSpec 任务 3.3 仍保持未勾选。

## 证据文件

- `iphone-17-pro-max-flow.mp4`：翻面、上甩、完整燃烧、余光和复位。
- `iphone-17-pro-max-gesture-input-rebound.mp4`：抽取、翻面、输入、确认、快速点燃和反向手势回弹。
- `iphone-17-pro-max-burn.png`：燃烧中段连续纸面与固定火线。
- `iphone-17-pro-max-menu.png`、`iphone-17-pro-max-journal.png`：菜单与手帐转场前后。
- `iphone-se-idle.png`、`iphone-17-idle.png`、`iphone-17-pro-max-front.png`：三种尺寸静置构图。
- `iphone-se-material-idle.png`、`iphone-17-material-back.png`、`iphone-17-pro-max-material-idle.png`：本地位图材质接入后的三尺寸复核。
