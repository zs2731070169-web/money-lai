# Design：心事升腾（bill-ascension）

## Context

动机与行为契约见 proposal 与 worry-release 规格。现有约束决定实现形态：内核平台无关（文本输入需新适配器出口）；游戏逻辑全部纯函数 reducer + game.ts 编排；会话金额/张数不落盘；音频参数集中快照 + 回归镜像；飘落纸币已有 `flyingBills` 运动系统（上飘淡出）可扩展升腾。

## Goals / Non-Goals

**Goals:**
- 放飞状态机（凝沓/携带/松手/取消）为纯函数，无头全测；
- 心事文本生命周期**仅限会话内存**——从输入返回到放飞销毁，不经过任何持久化结构（复用现有 state 边界，零新落盘字段）；
- 渲染复用：升腾纸钞扩展 `flyingBills` 运动模型，心事钞/指尖纸沓为轻量新画师；
- 日间行为零变化（既有测试不改全绿）。

**Non-Goals:**
- 焚烧变体、心事钞历史/统计、多心事管理界面（一次一张，放飞即清）；
- 不改 BGM/里程碑/图鉴/皮肤任何行为。

## Decisions

### 1. 文本输入经 `PlatformAdapter.presentTextInput` 注入

接口：`presentTextInput(placeholder: string, maxLength: number): Promise<string | null>`（null=取消）。Web 实现用覆盖层 `<input>`（自动 focus/blur、确认与取消两路径）；内核拿到纯字符串。测试注入假适配器（同步 resolve）。DOM 细节零泄漏进 core（import-audit 持续把关）。

### 2. 放飞状态机独立纯函数 `worry/scatter-state.ts`

状态 `idle → grasped（凝沓跟手）→ released(放飞) / dropped(取消回落)`，事件 press / move / release，携带「上拖累计距离」判定：松手时上拖距离 ≥ 阈值（约 40 逻辑像素）→ released，否则 dropped。无计时门槛。阈值以常量入快照测试。里程表数字↔纸沓的视觉过渡由编排层按状态驱动（纯渲染，不进状态机）。

### 3. 心事钞 = 会话内存的「下一张指定抽出」

`game.ts` 会话字段 `pendingWorryBill: { text: string } | null`：确认输入后置位——**下一次抓取抽出的就是心事钞**（面额 ¥0、计张不计额、图鉴跳过、面额分配序号不消耗）。抽出完成后 `pendingWorryBill` 转入 `carriedWorryBills`（等待放飞的在场清单）；再次写下可再指定。堆顶渲染在 `pendingWorryBill` 在场时以心事钞票面替换堆顶（淡字票面）。
*备选：心事钞进 `CashDrawState` → 侵入抽钞判定状态机且耦合票面语义，弃。*

### 4. 放飞视觉化映射与升腾运动

松手点生成 N 张升腾纸钞：`N = clamp(ceil(sessionAmount / 平均面额), 6, 36)`（下限保证手感、上限保帧预算，绘制预算规格内）；初速向上 + 水平散开 + 漂移 + 淡出，心事钞（`carriedWorryBills`）各生成一张、淡出延时 +0.4s 且最浅色阶。运动模型挂在现有 `flyingBills` 列表（新增运动类型字段），复用过滤/推进管线。

### 5. 归零复用里程表滚动

放飞对里程表使用既有 `enqueueAmountOdometerTarget(0)`——滚动下降复用逐位滚动实现，零新逻辑；「都过去了」经轻提示队列（自动淡出文案，非交互），归零一拍静默 = 轻提示延迟至滚动完成再入队。

### 6. 放飞声部进参数快照

`AUDIO_SYNTHESIS_PARAMETERS.ascensionVoice`：气流层（宽带噪声、渐入包络）+ 五声琶音（C 大调五声下行 3-5 音、钢琴音色复用 BGM 发声器、间隔约 90ms）；engine 挂 `playAscensionVoice()`，夜间经 SFX 子总线自动软化。回归镜像同步 + 离线渲染断言（峰值/无 NaN/时长/无循环）。

### 7. 触觉与静默门控

放飞触觉=一次轻档涟漪（经 `resolveSessionHapticTier` 夜间映射已是轻档）；放飞不在 `PresentableFeedback` 联合类型中（非庆祝类），呈现门控不拦截——规格「夜间软化不静默」由此保证。

## Risks / Trade-offs

- [键盘弹起遮挡/改变视口] → Web 输入层用固定定位覆盖层；输入期间主循环只暂停交互路由不暂停渲染；iOS 键盘收起后视口复位由 adapter 处理
- [心事钞「下一张指定」与连抽竞争] → 连抽中（completing 未结算）暂不接受新的长按唤出；指定只影响下一次 `grab`
- [升腾粒子峰值帧预算] → N 上限 36 + 复用 flyingBills 管线，冒烟帧预算不放松
- [心事文本内存残留] → 放飞/冷启动即丢弃引用（会话内存态，无序列化路径），无 GC 特殊处理需求
- [「都过去了」文案的调性风险] → 仅归零后出现一次、自动淡出、无按钮无庆祝动效（克制呈现）

## Migration Plan

未发布特性分支，无存量用户与数据迁移；回滚 = revert 提交。

## Open Questions

- 上拖放飞阈值（40px）与心事钞淡出延拍（0.4s）的最终手感 → 实现期模拟器实测定值（快照锁定），不影响结构
