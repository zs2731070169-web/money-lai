# BGM 混响：卷积换反馈延迟网络（实时欠载治理）

## Why

琴槌噪声移除后用户实听：BGM 中仍有「与音符无关、从起播就存在、强度恒定」的细碎咔哒/噼啪。合成层经数值复算已排除（全部残余伪声 ≤ -76 dBFS，不可能形成可听爆点），特征指向实时音频线程欠载（buffer underrun）——恒定负载源是挂在 BGM 总线上的 `ConvolverNode`（2.2s 立体声白噪 IR ≈ 19.4 万抽头卷积，自起播起每音频块常驻计算）。用户裁决：直接治理，不等真机/静音定位实验。

## What Changes

- `createBgmReverbChain` 内部实现整体替换：`ConvolverNode` + 白噪 IR → **立体声反馈延迟网络（FDN）**——每声道 4 条并联反馈延迟线（互质时长），循环内低通使高频更快衰减（暗尾，兼修旧 IR 高低频同速衰减的缺陷），左右声道交叉馈给出立体声宽度。
- 对外接口 `{ dryInputNode, wetSendInputNode }` 与湿声电平（0.4）、尾长（约 2.5s 衰减到 -60dB）对齐旧版，`engine.ts` 零改动。
- 零素材硬约束不变：FDN 为纯节点组合（Delay/Biquad/Gain/Merger），无任何音频文件。
- 回归契约：`createBgmReverbChain` MUST NOT 创建 ConvolverNode（欠载根因不得回归）；湿声尾音存在性、防爆、无 NaN 不变式由离线渲染测试锁定。

## Capabilities

### New Capabilities
（无）

### Modified Capabilities
（无——混响实现不在 procedural-audio 主规格的行为契约内，属性能/实现级变更，`skip_specs: true`）

## Impact

- `src/core/audio/bgm-player.ts`：`createBgmReverbChain` 重写 + 头注释更新（唯一源码改动文件）。
- `tests/audio/bgm.test.ts`：新增「混响不建 ConvolverNode」契约测试 + 湿尾渲染不变式测试。
- 混响参数沿现状以内联常量留在 bgm-player.ts（不进 `AUDIO_SYNTHESIS_PARAMETERS`，避免与工作区在途变更的参数快照失同步纠缠；现状亦为内联）。
- 若实听咔哒仍存：说明欠载源不在卷积（转真机验证模拟器音频栈），但音频图成本下降本身仍成立。
