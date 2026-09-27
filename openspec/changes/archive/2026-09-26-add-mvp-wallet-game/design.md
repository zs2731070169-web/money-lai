# design：money-lai MVP 技术设计

## Context

零存量的全新仓库。约束来自 proposal 与调研结论：① iOS 先行上架、未来迁移微信小游戏与安卓 → Web 技术内核；② 音效零素材（纯程序化合成，含 BGM）；③ 未来小游戏 iOS 端无 JIT、主包约 4MB → 逻辑预算与零依赖纪律。已定默认决策（用户可在评审中否决）：v1 完全免费无内购无广告；触觉用三档 impact（不自研 AHAP 插件）；BGM 为生成式程序化钢琴；小游戏/安卓仅预留适配层不实际出包；目标机型 A11 及以上稳 60fps；首发中国大陆区、简体中文为主。

## Goals / Non-Goals

**Goals：**
- 平台无关内核 + 适配层的分层架构，内核零平台依赖（可静态审计）
- 全部玩法逻辑可脱离渲染/平台做纯函数级 TDD（状态机、判定、物理积分、面额分配）
- 音频参数常量化，离线渲染可回归
- 治愈系视觉令牌化（色板/字体/光源/线宽一处定义全资产引用）

**Non-Goals：**
- 不引入游戏引擎或渲染库（PixiJS/WebGL 留作实测瓶颈后的升级项）
- 不做小游戏/安卓实际构建（本期只保证内核纪律与 adapter 接口稳定）
- 不做 BGM、Game Center、内购、账号、云同步
- 不做 A12 以下机型的降级渲染路径（先以性能预算控制复杂度，实测后再议）

## Decisions

### D1 技术栈：Vite + TypeScript + 原生 Canvas 2D + WebAudio + Vitest + Capacitor

零第三方运行时依赖；`@capacitor/haptics` 仅在 adapter 层出现。理由：小游戏 4MB 主包预算内最稳的路线；单屏 2D 场景 Canvas 2D 完全够用且两端行为一致；调研证实 WKWebView 下纯 2D 60fps 是常规预期。备选 PixiJS（引入 WebGL 抽象、两端一致性风险）与 Cocos（重、引入编辑器工作流）均劣于原生 Canvas 的可控性。

### D2 分层与目录

```
src/
├─ main.ts            # web 入口：注入 WebPlatformAdapter → 启动 Game
├─ core/              # 平台无关内核（import 审计目标：禁平台 API）
│  ├─ game.ts         # 场景编排与主循环（固定时间步）
│  ├─ platform.ts     # PlatformAdapter 接口（唯一平台出口）
│  ├─ wallet/         # 翻盖状态机 + 弹簧物理 + 命中判定
│  ├─ cash/           # 纸币实体/抽取判定/里程表/确定性面额分配
│  ├─ meta/           # 图鉴/皮肤/成就/设置/持久化 schema
│  ├─ audio/          # AudioEngine：合成参数常量 + voice 池
│  └─ render/         # 渲染编排、离屏缓存、设计令牌
├─ adapters/
│  └─ web.ts          # Web/Capacitor adapter（未来加 wechat.ts）
tests/                # 与源码同构 *.test.ts
scripts/              # import-audit / perf-smoke / audio-regression
ios/                  # Capacitor 壳（AppDelegate 音频会话配置）
```

PlatformAdapter 接口（按能力而非平台划分）：`createCanvas / requestFrame / onTouch(归一化坐标与 touchend 语义) / createAudioContext / onAudioInterruption / impact('light'|'medium'|'heavy') / storageGet/Set / getSafeAreaInsets / onShow/onHide`。

### D3 主循环与物理

固定时间步累加器（逻辑 120Hz / 渲染每帧），物理与判定全部纯函数化可单测：
- **翻盖（触发语义，实测反馈 v2.1）**：滑动=触发信号、不跟手——定向累计 28px（上开/下关）即时触发（不等松手）；触发后缓入缓出自主折叠（开 1.0s / 关 0.9s），无过冲无回弹；折叠途中反向触发从当前进度平滑转向，纸币抓取不受影响，翻盖手势被吸收；轻点=同款折叠（反向 toggle）。弹簧积分器（flap-spring.ts）退役，由状态机内折叠时间线推进取代。
- **翻盖的三维渲染与物理时序（实测反馈 v2.3：顶边铰链 + 俯角视点 + 真实物理剖面）**：铰链 = 钱包顶边；正/背面面部纹理离屏预渲染，14 条水平条带按投影绘制。虚拟相机俯角 φ≈28°（自然桌面视角，φ_eff = φ·sinθ：闭合态 φ_eff=0 保证全覆盖）；条带投影：z(t) = -t·L·sinθ（向后）、s(t) = f/(f - z(t))（f≈3L，180° 时 s=1 无透视）、屏幕偏移 Y(t) = t·L·(cosθ·cosφ_eff − sinθ·sinφ_eff)（自由边弧线：+L 下方 → 越过顶边 → −L 直立上方）；侧对角（θ+φ_eff≈90°）投影高度钳制到 ≥0.08L 的皮革切边细条（永不成线）；正面/背面在跨越角切换；稳态 180° 直立（小屏按「翻盖顶不遮计数器」自适应，≥150°）。**物理时序**：开启=快起 → 竖直附近最慢 → 重力加速荡过 → ~5° 过冲回落（两段式缓动+着陆回弹，状态机内闭式实现）；关闭=重力加速下落 → 减速垫着陆（触面 ≤2% 软压扁、无弹跳）。音效时机：掀起播皮革抬起音；合上触面播闷轻拍音。深度线索：投影随掀起收缩、明度随受光角微变、内衬与纸币堆随翻开露出。PlatformAdapter createOffscreenCanvas；无头回退平面渲染。
- **纸币跟随**：纸币顶端 y 以临界阻尼弹簧追踪手指（刚度调至 1-2 帧柔性延迟）；纸面弯曲 = 速度映射的二次曲线弯度参数（纯渲染层消费）。
- **判定**：抽出距离 ≥ 纸币可视高度的 35% 判完成，否则回弹收回（不计数的路径）。follow-through：脱手后减速上飘→淡出/落定入堆，错峰随机旋转。
- **里程表（金额）**：累计金额按位滚动（每位 300-450ms 错峰），微弹 scale 1.0→1.06→1.0；张数为会话内状态（仅驱动捆扎里程碑），不进主画面 HUD；解锁判定见 D6 的 lifetimeDrawCount。
- **连抽音高**：连续抽取计数每 +1 上浮小音分（封顶），里程碑回落（音频层消费同一状态）。

### D4 视觉令牌（设计快照，实现时落库为常量）

- **色板三组**（背景漂移，组间 3-5 分钟缓变）：黄昏 `#F7EFE4→#F1DEC9`、清晨 `#F3F1E8→#E7EBDF`、暮霭 `#F4E9E3→#E9D9D2`。
- **钱包（皮革）**：主体 `#B08968`、暗面 `#97755A`、深缝线底 `#8C6647`、缝线 `#F2E5D0`、内衬墨绿 `#6B7F74`。
- **lai 币面额色相**（纸基 `#F4EFE2` + 各档印墨）：1 浅豆绿 `#A9C4AE`、5 青瓷 `#9FBFB4`、10 暮蓝 `#A8BCC8`、50 杏黄 `#E5C79C`、100 蜜金 `#E8C37E`；统一版画线宽（≈2px @1x）与纸纹颗粒。
- **文字**：计数常态墨青 `#3F4A45`（对比度 ≥4.5:1），蜜金 `#C89B4B` 仅作里程碑瞬时闪色（不承担信息）；正文/中文用系统字体栈；数字用打包的圆体数字子集（数字+¥+千分位符，<15KB）。
- **光源**：左上单一柔光源，全资产高光/阴影方向一致；纸币在钱包口投影向下右。
- 主画面仅：背景 / 钱包 / 计数器 / 角落元进程入口图标。

### D5 AudioEngine（调研参数落库）

- **总线**：`masterBus → DynamicsCompressor(threshold -14dB, knee 8dB, ratio 6, attack 0.005s, release 0.2s) → masterGain 0.6 → destination`；全局 lowpass 7kHz。
- **开合音（皮革弯折，实测反馈 v2.1：删全部振荡器）**：纯噪声三层——带通 1.3kHz/Q0.7「皮面弯折」（峰值 0.22，衰减 60ms）+ 低通 420Hz「软垫感」（峰值 0.12，衰减 70ms）+ 高通 4.2kHz「纸堆轻蹭」（峰值 0.05，衰减 35ms）；各层 5ms 线性起坡防 click，总长 ~90ms；关闭音=同配方中心频率 ×0.8、峰值 ×0.85。原 sine 200→55Hz 冲击体配方废弃（鼓类签名，实测「咚咚咚」来源）。
- **抽钞摩擦音**（持久 voice，start/update/stop 复用不新建）：共享白噪 buffer（一次生成 2s）→ loop source → bandpass（Q0.7，中心 2-4.5kHz 随速度）→ gain `setTargetAtTime`（τ 0.03-0.08，目标 0.15-0.6 随速度）；速度信号 JS 侧 EMA（α≈0.2）平滑后再喂参；release `setTargetAtTime(0, τ0.02)` 后 100ms 停止。
- **并发**：同类一次性 voice 上限 3，超限 `cancelScheduledValues + setTargetAtTime(0, 0.02)` 抢占最旧。
- **纪律**：exponentialRamp 终值 ≥0.01；参数一律走调度方法不直写 `.value`；禁 ScriptProcessorNode；音色只用 sine/triangle。
- **iOS 三件套**：AppDelegate 配 AVAudioSession `.playback + mixWithOthers`；冷启动标题页「轻触开始」即解锁手势（touchend 内 resume + 播 1 样本静音 buffer）；`onAudioInterruption/onShow` 后在下一次手势重试 resume。
- **生成式钢琴 BGM**（独立子引擎）：慢速温暖和弦进行（如 Cmaj7→Am7→Fmaj7→G6，每和弦 8-12s）之上做五声音阶约束的稀疏旋律行走（1-3s/音、级进为主、音域受限）；钢琴式音色 = 基频 sine + 2-3 个渐弱泛音（triangle，微失谐）+ 指数衰减（2-4s）+ voice lowpass；混响用 ConvolverNode + 程序化生成 IR（指数衰减白噪，零素材）；BGM 音量显著低于操作音效（约 -12dB）；解锁后淡入 2s、onHide 淡出暂停、onShow 恢复、设置开关即时生效；生成参数带种子（不机械循环且可回归）。预留采样播放扩展位：未来可平滑接入真实钢琴录音。

### D6 状态与持久化边界

会话内存态（MUST NOT 落盘）：`sessionAmount`、`sessionCount`——驱动主画面金额里程表与会话内捆扎里程碑，冷启动清零。
持久化 `money-lai/state/v1`（版本化，经 adapter.storage）：`{ schemaVersion, lifetimeDrawCount, gallery: {面额id: 首次抽出序号}, unlockedSkins: [], activeSkin, achievements: [], settings: { sound, haptics } }`——`lifetimeDrawCount` 为跨会话内部累计计数器，仅用于皮肤解锁与成就判定，不在任何界面展示数值；损坏 JSON→重置为初始态并保留内存运行（对应规格的降级场景）。

### D7 元进程数据

- 面额表：5 档（见 D4），确定性权重分配（如 1:30%、5:30%、10:20%、50:15%、100:5%），权重常量公开于代码。
- 皮肤表：8-12 条 `{id, 类型(钱包/纸币), unlockAtCount}`，阈值梯度如 10/50/100/300/600/1000/2000/5000。
- 成就表：`{id, 条件(累计开合数/累计张数里程碑/图鉴集齐), 标题}`，全部为累计型。

### D8 TDD 与回归验证入口（对应全局「断点与回归意识」）

1. **纯逻辑单测（vitest）**：翻盖状态机（阈值/可逆/中断）、纸币完成与回收判定、面额确定性分配（种子重放一致）、里程表按位滚动、皮肤/成就解锁阈值、schema 迁移与损坏兜底、弹簧积分器收敛性、速度 EMA。
2. **音频回归（vitest + OfflineAudioContext）**：渲染开合音与摩擦音断言峰值 ≤0.9、无 NaN、时长符合参数常量；参数常量快照测试（调音必改快照，防漂移）。
3. **静态审计脚本**：`core/` 目录 import 扫描，禁 `wx`、`@capacitor`、`window`/`document` 直用。
4. **性能冒烟脚本**：无头跑 N 帧抽取场景，断言平均帧时预算与热路径零分配。
5. 以上全部收敛为一个命令 `npm test`（CI/本地同入口），加 `npm run smoke`。

### D9 iOS 壳与发布准备

- Capacitor：`scrollEnabled:false`、`overscrollBehavior:none`、`viewport-fit=cover`、`touch-action:none`；DPR = min(devicePixelRatio, 2)。
- 发布物料随任务清单落地：静态隐私政策页（App 内入口 + ASC URL）、App Privacy 标签 Data Not Collected、审核备注列明功能清单（图鉴/皮肤/成就/设置/离线）、分级问卷如实全 no（4+）、中国区上架前完成工信部 App 备案。

## Risks / Trade-offs

- [老机型帧率不达标] → 性能预算 + 冒烟脚本前置拦截；纸物理复杂度按预算裁剪；实测后议降级路径
- [WKWebView 低电量降采样损高频] → 音色能量主体 <2kHz，高频仅点缀（D5 纪律）
- [4.2 拒审] → 元进程层提供过审深度 + 审核备注功能清单 + 资源全内嵌离线 + 原生触觉/存档能力
- [小游戏迁移时 API 行为与文档不符] → 迁移前真机冒烟壳验证为准（已列入 Non-Goal 边界）
- [Canvas 文本性能] → 计数器等文本层离屏缓存，仅变化位重绘
- [纯合成音色「廉价电子感」] → 参数快照回归 + 以真实纸币录音为调参参照靶试听校准

## Migration Plan

绿地项目无迁移。发布节奏：脚手架 → 内核 TDD → 渲染与交互 → 音频 → 元进程 → iOS 壳 → 真机 QA → ASC 提交物料。回滚 = git 版本管理，无线上数据风险。

## Open Questions

- Game Center 成就接入时点（需重新评估审核面）
- 首发区域是否扩展美区（影响文案表语言与合规清单，i18n 已用文案表结构预留）
