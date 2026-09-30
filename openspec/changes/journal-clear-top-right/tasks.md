## 1. 回归测试先行（红）

- [x] 1.1 在 `tests/journal/` 新增 `journalClearRect` 几何测试：402×874、safeTop 62 下断言矩形位于页眉带内（`top < 134`）、右缘贴安全区（`left + width ≈ 402`）；先跑 `npx vitest run tests/journal` 确认失败
- [x] 1.2 新增绘制位置测试：记录坐标的 `fillText` 桩断言「清空整本手帐」绘制在页眉带纵带（y < 134）内，且页脚带（y > 874 - 34 - 70）不再出现该文案、「这些东西只在这台设备上。」仍在页脚；先跑确认失败

## 2. 最小实现（绿）

- [x] 2.1 重读当前 `src/core/render/app-overlay-painter.ts` 与 `game.ts`（工作区在途版本为基线）：`journalClearRect` 改签名 `(width, safe)` 并返回右上角矩形（128×48，`top = safe.top + 10`，右缘贴安全区）；跑 1.1 转绿
- [x] 2.2 `paintJournal` 删除页脚入口绘制、在页眉带右上以右对齐 16px 补画（alpha 沿用有无记录语义），`game.ts` 命中调用点同步新签名；跑 `npx vitest run tests/journal` 全绿（含 1.2 与 page-isolation 既有断言）

## 3. 回归与验收

- [x] 3.1 跑 `npm run verify`（import 审计 + 全量测试 + 构建 + 发行审计）全绿
- [x] 3.2 `npm run launch` 后模拟器验收：手帐页右上角可见「清空整本手帐」且与标题/返回同层；滚动全程不被遮挡；点按弹出系统确认框、取消后记录不变；截图核对
- [x] 3.3 实现后审查：改动面内无死代码、未接线函数、命名与注释缺口，当场清理后复跑 `npx vitest run tests/journal`

## 4. 缺陷修复（实测反馈：入口闪烁与清空收尾回闪）

- [x] 4.1 修复清空渐隐收尾回闪：满幅奶油层保持到落库结果落定（期间输入仍被门控），随后 ~260ms 淡出收尾；期间不得出现旧网格整帧回闪（`game.ts` 渐隐状态机）——复跑 `npm test` 确认既有清空三分支（确认/取消/落库失败）回归全绿
- [x] 4.2 `npm run launch` 后模拟器实测完整清空流程：渐隐满幅 → 无回闪 → 平滑淡出至空手帐页，右上入口稳定不闪；截图/连拍核对按钮区域哈希稳定
- [x] 4.3 实现后审查改动面并复跑 `npx vitest run tests/journal`

## 5. 缺陷细化（渐隐范围）

- [x] 5.1 清空渐隐只覆盖网格区：奶油层矩形自页眉带底缘（safe.top + 页眉带高）开始，顶部 banner（标题/返回/右上入口/顶部装饰）全程不变浅；`paintPageFade` 增加 topOffset 参数、页眉带高从 `journal-layout` 单源导出——先写红测试（渐隐矩形断言）再实现，`npx vitest run tests/journal tests/render` 转绿
- [x] 5.2  （由 §7 网格隐退方案覆盖验收） `npm run verify` 全绿后模拟器实测：注入测试记录 → 清空 → 渐隐中段连拍核对 banner 区域哈希与清空前一致、网格区渐浅；终态空页
- [x] 5.3  （由 §7 审查覆盖） 实现后审查并复跑手帐测试

## 6. 缺陷修复（实测反馈：渐隐中途画面冻结、清空未落库）

- [x] 6.1 帧循环防断：`frame()` 主体异常不再永久断链 rAF（catch 后补请求下一帧并打印）；红测试：注入 render 异常后帧链仍存活
- [x] 6.2 落库兜底：渐隐满幅后等待落库结果设 1200ms 上限，超时按失败收场（不换血 + 提示 + 淡出解困），晚到的成功仍补换血；红测试：write 悬挂平台超时后状态解困、记录保留、帧链存活
- [x] 6.4 清空落库失败/悬挂自动重试一次（原生 confirm 刚关闭时桥接回调概率性丢失）：首试失败即重发、悬挂越 1200ms 重发、两次皆败才按失败收场；红测试：首写失败平台重试后换血成功、双悬挂平台最终解困
- [x] 6.5  （6.x 韧性由单测覆盖；端到端复核并入 §7 验收） `npm run verify` 全绿 + 模拟器重测完整清空（渐隐仅网格区、banner 不变、落库生效或带提示复原、无冻结）；审查改动面

## 7. 缺陷细化（用户裁定：清空 = 网格小图各自隐退，背景零变化）

§5 的「奶油层自页眉带底缘覆盖」方案废弃：覆盖层本身仍改变背景观感。改为网格语义——缩略图与日期整体 alpha 渐隐至无，纸面/banner/页脚全程不动；落库成功后网格自然为空，失败/悬挂兜底时网格淡回。

- [x] 7.1 红测试改写 `clear-fade.test.ts`：`journalGridFade=1` 时不绘制任何缩略图与日期，标题/返回/右上入口/本机说明照常；`paintAppOverlay` 增加 `journalGridFade` 选项
- [x] 7.2 实现：`paintJournal` 网格循环按 `1-fade` 乘算 alpha（含日期与阴影层），fade=1 跳过绘制；`game.ts` 渐隐状态机改为输出网格隐退比例（保持期全隐、失败 260ms 淡回、成功无收尾），移除 `paintPageFade` 调用与函数及 `JOURNAL_HEADER_BAND_HEIGHT` 对外导出（banner 隔离裁剪仍走 `headerRect`）；全量测试转绿
- [x] 7.3 `npm run verify` 全绿 + 模拟器实测：清空全程背景像素级不动（连拍哈希核对非网格区）、小图渐隐至无、终态空页；审查改动面

## 8. 缺陷修复（BGM 停播与菜单→手帐闪屏）

- [x] 8.1 清空弹窗不再停 BGM：同步系统弹窗冻结 rAF 使 6s BGM 排程窗口耗尽断音——`requestClearJournal` 确认前预排 30s（engine 新增 `prefetchBgm`，`updateBgm` 即 `prefetchBgm(6)`；interruption 语义不动，红测试：预排后离线渲染长窗口仍有音）
- [x] 8.2 菜单点「手帐」不再闪屏：去掉「回 main + 0.6s 渐暗 wash」绕行，与其他页面一致直接切 journal；删除 transition 专属状态机与 wash 绘制（改写两个转场测试为「直接切换」）
- [x] 8.3 `npm run verify` 全绿 + 模拟器复核：点清空入口 BGM 连续、菜单→手帐无中间帧；审查改动面

## 9. 缺陷再修（实测复报：点清空按钮 BGM 仍停）

- [x] 9.1 根因为 iOS 原生 confirm 弹出时 WKWebView visibility 翻 hidden → interruption `begin` 停播并清 `unlocked`，而 `end` 无恢复分支（8.1 的预排只救了调度饿死，救不了 stopBgm）：`handleAudioInterruption` 补 `end` 恢复——重置待重锁标记、必要时 resume 上下文后续播；同步演进既有「end 后需手势」测试为「end 自动恢复」
- [ ] 9.2 `npm run verify` 全绿；模拟器/真机听感复核（点清空入口弹窗期间 BGM 连续）

## 10. 根治（用户裁定：弹窗期间 BGM 也不许停）

- [x] 10.1 弃用系统确认弹窗（iOS 会系统级挂起页面音频，不可绕）：`requestConfirmation` 的 web 实现改为页面内 DOM 确认层（复用 createOverlayShell/button 工厂与 COPY.cancel/confirm，遮罩点按=取消），平台契约与核心层零改动；BGM 全程无扰
- [x] 10.2 `npm run verify` 全绿 + 模拟器视觉验收（页面内确认卡）+ 用户听感复核（弹窗期间音乐连续）
