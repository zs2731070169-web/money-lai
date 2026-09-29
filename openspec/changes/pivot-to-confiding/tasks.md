## 1. 前置与基线

- [x] 1.1 完成并归档 `rebuild-letter-burning-experience`（`openspec archive` 后主 specs 含全部燃烧需求），验证 `openspec list` 不再显示该 change
- [x] 1.2 基线绿灯：`npm run verify` 与 `openspec validate pivot-to-confiding --strict --no-interactive` 全部通过后开始动代码

## 2. 状态机收好路径（测试先行）

- [x] 2.1 改写 `tests/letter/burning-state.test.ts` 到新语义出红：删除 drag/throw/rebound/burn/fade/silence 断言，新增「确认后进入 settle→idle」「取消停在 back」「settle 期间触摸无效」「stat 时序 0.6/1.8/0.6」断言
- [x] 2.2 改 `src/core/letter/burning-state.ts`：删甩出相位与 `beginThrow/endThrow` 等 API，新增 `settle` 相位（复用 edit-return 插值逆向）与收好结算步；`reducedMotion` 缩短规则接入；2.1 全绿
- [x] 2.3 改 `tests/letter/letter-flow.test.ts` 端到端链路为「抽取→书写→确认收好→保存→匿名计数→统计→复位」，并保留「取消停留展示位」「空白收好也保存」两条用例；配合 `src/core/game.ts` 触点路由删除甩出分支后全绿

## 3. 结算触发点迁移

- [x] 3.1 `src/core/game.ts`：手帐写入、里程/成就结算（`settleCompletedPostcard`）、匿名计数、菜单微光、BGM 收好长音统一挂到 settle 结算步；`resolveCount` 时序不变；3.2 用例全绿
- [x] 3.2 扩 `tests/letter/letter-flow.test.ts`：断言确认收好后 `journalEntries`/`postcardMileage`/`countCalls`/成就一次到位，取消时全部为零；离线（countResult=null）照常收好且无统计

## 4. 渲染清理

- [x] 4.1 删 `src/core/render/burn-geometry.ts` 与 `letter-painter.ts` 燃烧/余光分支，`settle` 折回入袋由既有层序反向插值实现；`tests/render/letter-painter.test.ts` 删燃烧断言、新增「收好过程不出现火焰绘制调用」
- [x] 4.2 手帐清空动画：`paintPageBurn` 改为整页纸面渐隐（或等价新画师），`game.ts` 清理 `clearBurnGeometry` 链；`tests/journal/page-isolation.test.ts` 清空用例更新为「确认后记录清空且无火焰几何调用」
- [x] 4.3 统计句位置改信封上方（`envelopeRect` 上缘、安全区内、避开菜单图标），文案由 `COPY` 提供；`tests/render/letter-painter.test.ts` 或布局测试断言新坐标与两行拆分

## 5. 音频清理

- [x] 5.1 删 `src/core/audio/fire-sound.ts`、引擎点燃/火床/余响方法与 `parameters.ts` 对应参数；`tests/audio/audio-regression.test.ts` 与 `unlock.test.ts` 删燃烧断言，保留抽出素材与钢琴叠加断言并全绿
- [x] 5.2 BGM 收好长音挂到 settle 结算步并处理连发叠音（触发前停旧长音）；音频回归含「收好不中断钢琴」断言

## 6. 元进程与文案

- [x] 6.1 `src/core/content/copy.ts`：统计句改「张信纸已被收好」、菜单项改「心里话里程」、清空入口改「清空整本手帐」、成就名改倾诉语义（成就 ID 不变）；`tests/menu/*` 与 `page-isolation` 文案断言同步
- [x] 6.2 `scripts/release-audit.mjs` 若钉有燃烧文案则同步更新；`npm run audit:release` 通过且文案红线审查通过（无人称、浮出型 ≤12 汉字）

## 7. 平台与性能收口

- [x] 7.1 `src/core/platform.ts`/`src/adapters/web.ts`：文本输入上限随 `MAX_LETTER_TEXT_LENGTH`（400）一致；无平台层燃烧引用残留（全局 grep `燃烧|burn|fire` 白名单核对）
- [x] 7.2 `tests/perf/frame-smoke.test.ts` 冒烟链路改为抽取→编辑→确认收好→统计→复位；帧预算断言保持

## 8. 端到端验收与归档

- [ ] 8.1 `npm run verify` 与 `openspec validate pivot-to-confiding --strict` 全绿；`npm run launch` 后模拟器实测：确认收好/取消停留/空白收好/清空手帐/离线收好/静音拨片/SE 尺寸统计句位置，逐项记录到 `docs/device-qa-checklist.md`
- [ ] 8.2 实现后自审：grep 死代码（未引用的燃烧函数/资产/常量）、过时注释与命名残留，当场清理；按组提交推送 GitHub
- [ ] 8.3 `openspec archive pivot-to-confiding` 归档并同步主 specs；处理 `letter-burning`/`anonymous-burn-count` 目录更名开放问题（或明确保留）
